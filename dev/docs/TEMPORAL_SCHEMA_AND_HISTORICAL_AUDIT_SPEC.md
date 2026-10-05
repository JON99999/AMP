# AMP Historical Calendar & Audit Architecture Specification

---

## 1. Guiding Philosophy & Architectural Overview

This document serves as the authoritative implementation specification for historical calendar reconstruction and broadcast audit reconciliation in **AMP (Announcement Media Player)**.

### The Core Problem
Broadcast stations require:
1. **Historical Calendar Visibility**: The ability to inspect what the station schedule and announcements looked like on any prior date/week.
2. **Forensic Reconciliation (Planned vs. Actual)**: Proving whether scheduled announcements were aired as planned, missed completely, or broadcast as ad-hoc/unscheduled plays.
3. **Advance Execution Handling**: Accurately auditing shows and breaks that were prerecorded or exported in advance (e.g., recorded on Tuesday for a Saturday broadcast slot).

---

## 2. Core Architecture: Reconstructed Calendar & Planned vs. Actual Reconciliation

Instead of heavyweight bitemporal database layers, AMP uses a lean, robust two-part architecture:
1. **Effective-Date Revision Model (`validFrom` / `validTo`)**: Preserves past show and announcement iterations so the schedule can be recreated for any historical timestamp.
2. **Planned vs. Actual Slot Reconciliation**: Compares the historical schedule against self-contained broadcast logs using dual timestamps (`executedAt` vs. `scheduledFor`).

```
+-------------------------------------------------------------------+
|                        HISTORICAL CALENDAR                        |
|                     Target Date: Oct 4, 2026                      |
+---------------------------------+---------------------------------+
|        PLANNED SCHEDULE         |         ACTUAL LOGS             |
|  (Resolved via validFrom/To)    |   (Standard logs.json)          |
|                                 |                                 |
|  - 8:15 PM: "Fall Festival"     |  - scheduledFor: Oct 4 8:15 PM  |
|             (ann-101)           |    announcementId: "ann-101"    |
|                                 |    executedAt: Oct 2 2:00 PM    |
|                                 |    type: "prerecord_export"     |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|                         AUDIT RECONCILIATION                      |
|  (Generated 100% On The Fly in Memory - No Disk Pollution)        |
|  Slot 8:15 PM: [ MATCHED ] - Prerecorded on Tue Oct 2 at 2:00 PM  |
+-------------------------------------------------------------------+
```

---

## 3. Data Schema Specifications

### A. Announcement Revisions (`announcements.json`)

When an announcement is edited or deleted, past versions are preserved in a `revisions` array with start and end timestamps.

```typescript
export interface AnnouncementRevision {
  name: string;
  type: 'one-time' | 'basic-hourly' | 'advanced';
  enabled: boolean;
  minute: number;           // 0-59
  date?: string;            // YYYY-MM-DD (one-time)
  time?: string;            // HH:mm (one-time)
  days?: number[];          // 0-6 (advanced)
  hours?: number[];         // 0-23 (advanced)
  gridRules?: string[];     // e.g. ["1-10", "1-11"]
  timeGatedMp3s: TimeGatedMp3[];
  validFrom: string;        // ISO timestamp when this revision started
  validTo: string;          // ISO timestamp when this revision was replaced/deleted
}

export interface AnnouncementRecord {
  id: string;               // Stable entity UUID
  isDeleted: boolean;       // Soft-delete tombstone
  
  // Current Head State
  name: string;
  type: 'one-time' | 'basic-hourly' | 'advanced';
  enabled: boolean;
  minute: number;
  date?: string;
  time?: string;
  days?: number[];
  hours?: number[];
  gridRules?: string[];
  notes?: string;
  timeGatedMp3s: TimeGatedMp3[];
  validFrom: string;        // ISO timestamp when current head became active
  validTo: string | null;   // null while active; set to timestamp when deleted

  // Historical Revision Stack
  revisions?: AnnouncementRevision[];
}
```

---

### B. Show Revisions (`shows.json`)

```typescript
export interface ShowRevision {
  name: string;
  nameShort: string;
  host: string;
  description: string;
  day: number;              // 0=Sun, ..., 6=Sat
  startHour: number;        // 0-23
  durationHours: number;
  durationMinutes: number;
  active: boolean;
  validFrom: string;
  validTo: string;
}

export interface ShowRecord {
  id: string;
  isDeleted: boolean;

  // Current Head State
  name: string;
  nameShort: string;
  host: string;
  description: string;
  day: number;
  startHour: number;
  durationHours: number;
  durationMinutes: number;
  active: boolean;
  validFrom: string;
  validTo: string | null;

  // Historical Revision Stack
  revisions?: ShowRevision[];
}
```

---

### C. Self-Contained Log Entries (`logs.json`)

Stored in the authentic single log store (`logs.json`). Log records capture both **when the action happened physically** (`executedAt`) and **what broadcast slot it belonged to** (`scheduledFor`).

```typescript
export interface BroadcastLogEntry {
  id: string;
  
  // What happened
  type: 'live_play' | 'live_read' | 'prerecord_export' | 'playlist_export' | 'manual_play';
  
  // Entity references
  announcementId: string;
  announcementTitle: string;
  trackFilename?: string;
  trackDurationSeconds?: number;
  showId: string;
  showName: string;

  // Dual Timestamps
  executedAt: string;       // Real physical time (e.g. Tuesday 2:00 PM)
  scheduledFor: string;     // Target air slot (e.g. Saturday 8:15 PM)
                            // Note: For live plays, executedAt === scheduledFor

  // Workstation Environment
  operator?: string;
  workstation?: string;
  completed: boolean;
}
```

---

## 4. Core Algorithms

### A. Saving Edits & Soft Deletions

```typescript
export function updateAnnouncement(
  existing: AnnouncementRecord, 
  incoming: Partial<AnnouncementRecord>,
  now: string = new Date().toISOString()
): AnnouncementRecord {
  const currentSnapshot: AnnouncementRevision = {
    title: existing.title,
    type: existing.type,
    days: existing.days,
    hours: existing.hours,
    minute: existing.minute,
    gridRules: existing.gridRules,
    timeGatedMp3s: existing.timeGatedMp3s,
    validFrom: existing.validFrom,
    validTo: now
  };

  const revisions = existing.revisions ? [...existing.revisions, currentSnapshot] : [currentSnapshot];

  return {
    ...existing,
    ...incoming,
    validFrom: now,
    validTo: null,
    revisions
  };
}

export function deleteAnnouncement(
  existing: AnnouncementRecord,
  now: string = new Date().toISOString()
): AnnouncementRecord {
  return {
    ...existing,
    isDeleted: true,
    validTo: now
  };
}
```

---

### B. Historical Schedule Resolver

Resolves the exact state of all shows and announcements active on any past timestamp:

```typescript
export function resolveScheduleForDate(
  targetDate: Date,
  announcements: AnnouncementRecord[],
  shows: ShowRecord[]
) {
  const targetIso = targetDate.toISOString();

  // 1. Resolve active announcement revisions for target date
  const activeAnnouncements = announcements.map(ann => {
    // Check current head
    if (ann.validFrom <= targetIso && (!ann.validTo || ann.validTo > targetIso)) {
      return ann.isDeleted ? null : ann;
    }
    // Check past revisions
    const matchedRev = ann.revisions?.find(rev => 
      rev.validFrom <= targetIso && rev.validTo > targetIso
    );
    if (matchedRev) {
      return {
        id: ann.id,
        isDeleted: false,
        ...matchedRev
      };
    }
    return null;
  }).filter(Boolean);

  // 2. Resolve active show revisions for target date
  const activeShows = shows.map(show => {
    if (show.validFrom <= targetIso && (!show.validTo || show.validTo > targetIso)) {
      return show.isDeleted ? null : show;
    }
    const matchedRev = show.revisions?.find(rev => 
      rev.validFrom <= targetIso && rev.validTo > targetIso
    );
    if (matchedRev) {
      return {
        id: show.id,
        isDeleted: false,
        ...matchedRev
      };
    }
    return null;
  }).filter(Boolean);

  return { activeAnnouncements, activeShows };
}
```

---

### C. Planned vs. Actual Reconciliation Engine

Reconciles the resolved schedule against the monthly log file:

```typescript
export interface AuditSlotResult {
  slotTime: string;          // ISO string of break time (e.g. 2026-10-04T20:15:00)
  status: 'PLAYED' | 'MISSED' | 'AD_HOC';
  scheduledItem: any | null;
  logEntry: BroadcastLogEntry | null;
  executionDetail?: string;  // e.g. "Live broadcast" or "Prerecorded on Tue Oct 2 @ 2:00 PM"
}

export function reconcileDayAudit(
  targetDate: Date,
  scheduledSlots: Array<{ time: string; announcementId: string; title: string; showName: string }>,
  dayLogs: BroadcastLogEntry[]
): AuditSlotResult[] {
  const results: AuditSlotResult[] = [];
  const matchedLogIds = new Set<string>();

  // 1. Audit all scheduled slots
  for (const slot of scheduledSlots) {
    const matchingLog = dayLogs.find(log => 
      !matchedLogIds.has(log.id) &&
      log.announcementId === slot.announcementId &&
      isSameSlotWindow(log.scheduledFor, slot.time)
    );

    if (matchingLog) {
      matchedLogIds.add(matchingLog.id);
      const isAdvance = matchingLog.executedAt !== matchingLog.scheduledFor;
      results.push({
        slotTime: slot.time,
        status: 'PLAYED',
        scheduledItem: slot,
        logEntry: matchingLog,
        executionDetail: isAdvance 
          ? `Prerecorded/Exported on ${matchingLog.executedAt}` 
          : 'Live On-Air'
      });
    } else {
      results.push({
        slotTime: slot.time,
        status: 'MISSED',
        scheduledItem: slot,
        logEntry: null,
        executionDetail: 'No broadcast or export recorded'
      });
    }
  }

  // 2. Audit ad-hoc / unscheduled plays
  const adHocLogs = dayLogs.filter(log => !matchedLogIds.has(log.id));
  for (const log of adHocLogs) {
    results.push({
      slotTime: log.executedAt,
      status: 'AD_HOC',
      scheduledItem: null,
      logEntry: log,
      executionDetail: `Unscheduled play during ${log.showName}`
    });
  }

  return results;
}
```

---

## 5. The 3 Forensic Audit & Display Specifications

The architecture directly powers three specific operational audit interfaces:

### Type 1: Historical & Future Calendar Display
- **Historical Calendar (Dates $\le$ Today)**:
  - Renders the weekly or daily schedule reconstructed for that historical date.
  - Each announcement break slot displays compact status badges and counters:
    - **[✓ PLAYED]** (Green): Broadcast live or read on-air.
    - **[⟳ PRERECORD]** (Purple): Broadcast via export or prerecord.
    - **[⚠ MISSED]** (Red): Scheduled slot with no matching log event.
    - **[+ EXTRA]** (Yellow): Ad-hoc or unprompted plays logged during that hour.
  - Column header summarizes: `Total Planned: 24 | Played: 22 | Missed: 2 | Extra: 1`.
- **Future Calendar (Dates $>$ Today)**:
  - Shows planned future announcements and audits for missing audio / date-gating issues.
  - **Prerecord / Export Indicator**: If a future show or break has ALREADY been prerecorded or exported in advance (found in `logs/` with `scheduledFor` in the future), the future slot displays a **[⟳ READY / PRERECORDED]** indicator badge with the date it was exported.

---

### Type 2: Gated Item Play History in Announcement Definition
- When opening an Announcement's edit modal or settings card:
  - Each `TimeGatedMp3` row displays its historical audit metrics:
    - **First Used**: Date of first log entry (e.g., `Aug 14, 2026`).
    - **Last Used**: Date of most recent log entry (e.g., `Sep 28, 2026`).
    - **Total Plays**: Lifetime play count across all broadcasts and exports.
  - **Expandable Event Drawer**: Clicking "View Play History" filters `logs.json` to show a chronological table of every station broadcast, live read, or prerecord export that used this specific MP3 track.

---

### Type 3: Missed Broadcast Interleaving in Log View (Computed On-The-Fly)
- In the main Log View (`logs.json`):
  - Adds a toggle: **"Include Missed Scheduled Breaks"** (Enabled by default in Audit Mode).
  - When active, the reconciliation engine dynamically generates and interleaves scheduled slots that failed to air directly into the chronological in-memory stream (**strictly without writing negative records to disk**):
    - **Standard Log Row**: `2026-10-04 20:15:02 | PLAYED | Fall Festival Promo | DJ Mike`
    - **Interleaved Missed Row**: `2026-10-04 20:45:00 | [MISSED] | Coffee Shop Underwriting | Rock Hour` (Rendered in red italic with a warning icon).
  - Exporting logs to CSV/PDF gives stations a 100% compliant FCC and sponsor verification report showing both delivered and missed commitments.

---

## 6. Development Concepts Abandoned or Changed (Reference & Pitfalls)

### 1. The Bitemporal Micro-Revision Engine (Abandoned)
- **Concept**: Adding formal `currentRevisionId`, multi-level vector clocks, and nested `temporal` range objects to every announcement, show, and individual gated audio track.
- **Why Abandoned**:
  - Unnecessary overhead: Storing every single drafting edit in `announcements.json` caused massive file bloat on local desktop file systems.
  - Fragile dependencies: Editing a title on Thursday would trigger complex tree restructuring for a schedule with 200 items.
- **Pitfall Reminder**: Never build complex relational database versioning inside flat desktop JSON files.

### 2. Intermediate Revision Pruning via Event Counters (Abandoned)
- **Concept**: Checking `revisionEventCount === 0` to decide whether to overwrite in-place or create a new revision.
- **Why Abandoned**:
  - Overcomplicated write paths: Created race conditions where simultaneous edits on two machines could miscalculate event counters.
  - Simplified Alternative: Simple `revisions` array with `validFrom`/`validTo` dates provides full temporal fidelity with a fraction of the code complexity.

### 3. Active Real-Time "Missed Play" Log Generation (Abandoned)
- **Concept**: Running a background daemon that writes a `missed_play` log entry into physical log files whenever a minute turns over unplayed.
- **Why Abandoned**:
  - Fails if the computer is turned off, asleep, or running in studio/offline mode.
  - Pollutes the physical log files with synthetic negative records.
  - Replaced by: Dynamic in-memory Planned vs. Actual reconciliation during audit rendering.

### 4. Monthly Log Partitioning / Split Files (`YYYY-MM.json`) (Abandoned)
- **Concept**: Splitting logs into separate monthly files (`logs/2026-10.json`).
- **Why Abandoned**:
  - Unsolicited divergence from AMP's standard unified `logs.json` storage model (`getAmpLogsDir()` / `logs.json`).
  - Added unnecessary multi-file folder scanning, path resolution, and file switching during timeline and reporting queries.
  - Replaced by: Maintaining the standard single `logs.json` log store while filtering and querying by date in memory.

---

## 7. Pre-Implementation Verification & Edge-Case Governance

### 1. Legacy Data Normalization & Backfill
- When loading `announcements.json` or `shows.json` missing `validFrom`:
  - Automatically backfill `validFrom: "2026-08-01T00:00:00.000Z"` (the earliest possible inception date of the AMP platform).
  - Backfill `validTo: null`, `isDeleted: false`, `revisions: []`.
  - Ensures existing installations upgrade seamlessly with 100% backward compatibility and zero data loss.

### 2. Deterministic Slot Matching via `scheduledFor`
- All reconciliation between "Planned" and "Actual" is evaluated strictly against the **`scheduledFor`** slot coordinate:
  - When an announcement is played live, read live, or exported in advance, the playback engine stamps the target scheduled slot into `log.scheduledFor` (e.g., `2026-10-04T20:15:00.000Z`).
  - **Matching Rule**: A log entry matches a scheduled slot deterministically if:
    - `log.announcementId === slot.announcementId`
    - `log.scheduledFor === slot.slotTime` (exact match on intended target break).
  - This eliminates fuzzy time-window heuristics and accurately accounts for live plays that happen slightly early or late in the break.

### 3. Handling Unscheduled, Manual, Glitched, or Orphaned Log Entries Gracefully
- In real studio environments, anomalies occur:
  - An operator manually plays an audio file not currently tied to a scheduled break.
  - An announcement was deleted or edited directly in `.json` by a technician, leaving an older log entry pointing to an orphaned ID.
  - A timing mismatch or network sync glitch created an unexpected log entry.
- **Graceful Fault-Tolerant Resolution**:
  - The reconciliation engine never crashes on orphaned or unmatched log items.
  - If a log entry in `logs.json` cannot resolve to a scheduled slot on the target date, it is classified gracefully under **`[+ EXTRA / UNSCHEDULED]`**.
  - The UI displays whatever metadata was preserved in the log record itself (e.g. `announcementTitle`, `trackFilename`, `executedAt`, `showName`) with an `[Unscheduled / Manual]` indicator.
  - It does **not** trigger false "Missed" flags or corrupt the planned schedule matrix.

### 4. Multi-Workstation Clock Skew
- All `validFrom` and `executedAt` timestamps are generated server-side using standard ISO UTC format (`new Date().toISOString()`).
- Reconciliations compare timestamps deterministically to prevent timezone conversion drift.
