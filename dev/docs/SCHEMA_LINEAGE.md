# AMP Schema & Historical Lineage Specification (`SCHEMA_LINEAGE.md`)

> **Scope**: Documents how AMP preserves broadcast history across `announcements.json`, `logs.json`, `shows.json`, and the `Files` manager (`media/announcements/`) as schedules, gates, rotation tracks, and files move through **Active -> Inactivated -> Archived -> Deleted** states.
>
> **Coexistence Constraint**: All lineage fields and rules maintain full backward/forward coexistence with legacy `v0.15.4/5` clients (`_meta.schemaVersion: 1`; see `dev/docs/COEXISTENCE_AND_SIBLING_BRIDGE.md`).

---

## 1. Core Architectural Principles

1. **Logs Are Immutable Receipts (`logs.json`)**
   - A logged play (`played`, `backup play`), export (`playMode: "Export"`), or Show Message acknowledgement (`acknowledged`) is a permanent historical fact.
   - Inactivating, archiving, replacing, or deleting an announcement, gate, media row, show, or file on disk **never** rewrites or deletes prior entries in `logs.json`.
2. **Schedule Revisions Prove What Was Planned (`revisions[]`)**
   - `announcements.json` and `shows.json` append point-in-time snapshots (`validFrom` -> `validTo`) whenever schedule rules change.
   - Historical calendar views and compliance audits evaluate `revisions[]` to prove **which slots were scheduled at that point in time**, independent of later schedule edits.
3. **Played vs. Unplayed Mutation Rule (`> 0 Plays` vs. `0 Plays`)**
   - Entities with **0 logged plays** may be cleanly deleted because no historical log references them.
   - Entities with **> 0 logged plays** are **inactivated / soft-deleted** rather than hard-deleted so audit trails stay intact.
4. **Historical Rotation Replay Boundary (`#43` — By Design)**
   - **Played slots** prove which exact file aired via `logs.json` (`mp3Name`, plus structured gate/rotation metadata).
   - **Unplayed / missed slots** in rotating multi-file gates are calculated on the fly from gate rules and per-item `inactivatedAt` cutoffs. AMP intentionally does **not** maintain full reorder-history snapshots for past missed rotation slots.

---

## 2. Entity Lifecycle Matrix (`Active -> Inactivated -> Archived -> Deleted`)

### A. Announcements (`announcements.json`)

| State | Stored Representation | Effect on Playback & Audits |
| :--- | :--- | :--- |
| **Active** | `enabled: true`, `isDeleted: false`, `validTo: null` | Scheduled normally in Player, Calendar, and Audits. |
| **Edited (Schedule Changed)** | Prior state pushed into `revisions[]` (`validFrom` -> `now`); head gets `validFrom: now`. | Past dates resolve via matching revision; forward dates resolve via head. |
| **Inactivated (Has Plays)** | `enabled: false`, `endDate` recorded (cutoff), prior state saved in `revisions[]`. | Past dates `<= endDate` still reconstruct as "did exist" for historical audits; forward dates excluded. |
| **Soft-Deleted** | `isDeleted: true`, `validTo: now`, prior state in `revisions[]`. | Hidden from active lists and future schedules; historical logs and past-date audits still resolve prior revisions. |
| **Hard-Deleted (0 Plays)** | Removed from `announcements.json` (only when total logged plays = `0`). | No historical logs exist to orphan. |

### B. Announcement Gates (`Announcement.timeGatedMp3s[]`)

| State | Stored Representation | Effect in Editor, Playback, & Audits |
| :--- | :--- | :--- |
| **Active / Upcoming Gate** | `inactivated` unset; `endDate` blank or `>= now`. | Editable in **Active Gates**; eligible for playback within `[startDate, endDate]`. |
| **Past (Expired) Gate** | `endDate < now` (not manually inactivated). | Moves to collapsible **Past Gates** (read-only); supports **Reuse** (clones media into a new gate) and **Delete** only if `0 plays`. |
| **Inactivated Gate (> 0 Plays)** | `inactivated: true`, `inactivatedAt: <iso>`, original `endDate` preserved. | Moves to collapsible **Inactivated Gates** (read-only); excluded from forward playback/audits; past slots `<= inactivatedAt` remain auditable; supports **Reactivate** (in-place or **Split to New Gate** if slots were missed) and **Reuse**. |
| **Deleted Gate (0 Plays)** | Removed from `timeGatedMp3s[]`. | Allowed only when gate has `0` logged plays. |

### C. Rotation Media Rows (`TimeGatedMp3.mediaItems[]`)

| State | Stored Representation | Effect in Editor, Playback, & Audits |
| :--- | :--- | :--- |
| **Active Track** | `inactivated` unset; participates in `slotIndex % activeCount` rotation. | Active for playback; shows `History (n)` tooltip. |
| **Replaced (> 0 Plays)** | Old item marked `inactivated: true`, `inactivatedAt: <iso>` and moved to gate's **Past / Inactivated Media**; new file takes the active slot. | Preserves prior file's audit attribution up to `inactivatedAt`. |
| **Inactivated (> 0 Plays)** | `inactivated: true`, `inactivatedAt: <iso>` inside the same gate. | Excluded from forward rotation; past slots `<= inactivatedAt` still account for it; can be reactivated inside the gate. |
| **Deleted (0 Plays)** | Removed from `mediaItems[]` (or cleared to blank slot if last row in gate). | Allowed only when the row has `0` logged plays. |

### D. Broadcast Logs (`logs.json`)

| Field / Role | Current State (`v0.20.8`) | Lineage Role |
| :--- | :--- | :--- |
| `announcementId` | Required string | Stable foreign key to parent `Announcement` (or `AdminMessage` when `assetType === 'message'`). |
| `mp3Name` | Filename string | Exact audio file, live read script, backup MP3, or message title that actually aired/logged. |
| `announcementName` | Display string (includes `(x/y)` when rotating) | Human-readable label preserved for CSV exports and legacy clients. |
| `status` & `playMode` | `'played' \| 'backup play' \| 'acknowledged' \| ...`; `'Live' \| 'Prerecord' \| 'Export' \| 'Playlist'` | Proves how and whether the slot was fulfilled. |
| `scheduledFor` / `announcementTime` & `executedAt` / `logTimeStamp` | Dual-timestamp sibling bridge | Proves which scheduled slot was satisfied and when execution occurred (`v0.15.4/5` compatible). |
| `gateId`, `rotationIndex`, `rotationTotal` *(Implemented `#113`)* | Optional structured fields written on all new audio, backup, live read, and export logs | Directly binds each log receipt to its exact `TimeGatedMp3.id` and rotation position without filename/date guessing. |

### E. Shows & Admin Messages (`shows.json`)

- **Shows**: Follow the same temporal revision model as announcements (`validFrom`, `validTo`, `isDeleted`, `revisions[]`). Historical logs snapshot `showId`, `showName`, and `hostName` at play time so renaming or inactivating a show never alters past logs.
- **Admin Messages (`adminMessages[]`)**: Move through `Active` (`enabled: true`, `!archived`) -> `Archived` (`archived: true`, `archivedAt`, read-only history with **Reuse** / **Restore**) -> `Deleted` (only when `0` reads, or permanent delete from Archive). Read receipts live both inside `acknowledgedByShows[]` and as `status: 'acknowledged'` / `assetType: 'message'` entries in `logs.json`.

### F. Physical Media Files (`Files` / `File Manager` — `media/announcements/`)

| State | Disk / Drive Location | Effect on Schedules & Logs |
| :--- | :--- | :--- |
| **Active** | `media/announcements/<file>` | Available for playback, picker selection, and active gates. |
| **Archived** | `media/announcements/archived/<file>` | Removed from active rotation/picker; restorable to root; prior `logs.json` receipts keep the original filename untouched. |
| **Deleted in AMP** | `media/announcements/deleted_in_AMP_OK_to_purge/<file>` | Quarantine folder awaiting manual OS/Drive purge; prior `logs.json` receipts remain readable and unmodified. |

---

## 3. Audit Attribution & Multi-Gate Reconciliation Model

1. **Slot-Level Proof (Primary Compliance Requirement)**
   - For any historical date/hour, `resolveAnnouncementsForDate()` reconstructs which announcements were active via `revisions[]` and `enabled`/`endDate` bounds.
   - `doesLogMatchLocalSlot()` matches each planned slot to a `played` / `backup play` log entry using `announcementId` and station-local scheduled time (`scheduledFor` / `announcementTime`).
   - This proves **the scheduled slot was played**, regardless of subsequent file swaps, archives, or rotation edits.
2. **Gate-Level & Track-Level Attribution**
   - `calculateGateSlotAssessment()` binds logs with `log.gateId` strictly to `gate.id === log.gateId` first.
   - For legacy logs without `gateId`, it falls back to `announcementId` + gate `[effectiveStart, effectiveEnd]` window + filename (`mp3Name` matching primary or backup file in `mediaItems[]`).

---

## 4. RAW IMMUTABLE REFERENCE LEDGER (`#43 & #113` — DO NOT DILUTE OR REWRITE)

> **PRESERVATION DIRECTIVE**: Keep this section raw, verbatim, and explicit across future passes, compactions, partial saves, or refactors. Do not paraphrase away exact field names, invariants, or file anchors.

### Invariant `LIN-1`: Structured Gate & Rotation Fields on `LogEntry`
- **Rule**: Every new `LogEntry` written for an announcement play (Audio `played`, Audio `failed`, Backup Audio `backup play`, Live Read `played`, Live Read Backup `backup play`, Prerecord Export `played`) MUST record optional:
  - `gateId?: string` (`activeMp3.gateId || activeMp3.id`)
  - `rotationIndex?: number` (1-based index when `> 0`)
  - `rotationTotal?: number` (active rotation count when `> 0`)
- **Coexistence**: Optional JSON fields only; `_meta.schemaVersion` remains `1`; `seedLogEntrySiblings()` spreads `...entry` untouched; legacy `v0.15.4/5` clients ignore unknown fields.
- **Code Anchors**:
  - `src/types.ts` -> `LogEntry`, `LiveReadPayload`
  - `src/components/PlayerTab.tsx` -> `handlePlay`, `playBackupAudioTrack`, `handleLogExportAsPlayed`, `renderLiveReadOverlay`
  - `src/components/LiveReadPopout.tsx` -> `handlePlayBackupMp3Action`, `handleCommitLog`, Electron IPC `getLiveReadData`, URL query params

### Invariant `LIN-2`: `gateId`-First Attribution With Legacy Fallback
- **Rule**: Inside `calculateGateSlotAssessment()` (`src/lib/temporalReconciliation.ts`):
  - IF `log.gateId` is non-empty -> `log` belongs ONLY to the gate where `gate.id === log.gateId`. No other gate may steal it via filename reuse or date edits, and it counts toward `gatePlayed` even if its media row was later modified.
  - ELSE (legacy log without `gateId`) -> fall back to `announcementId` + `[effectiveStart, effectiveEnd]` window + `mp3Name` match against gate primary/backup files.
- **Code Anchor**: `src/lib/temporalReconciliation.ts` -> `calculateGateSlotAssessment()`

### Invariant `LIN-3`: Played-Gate & Parent-Envelope Date-Bound Locks (`> 0` Plays Cannot Be Orphaned or Deleted)
- **Rule**: `computePlayedGateBoundsMap()` computes `{ playCount, firstPlayedLocalIso, lastPlayedLocalIso }` by taking the union of logs matching BOTH the **saved** gate snapshot (`savedGates`) AND the **draft** gate (`formData.timeGatedMp3s`).
  - Once `playCount > 0`:
    1. Gate `Start` date & time inputs are **locked** (`isStartLocked = isItemExpired || gatePlayCount > 0`) and `updateGateStartDate()` refuses changes.
    2. Gate `Start` CANNOT be moved after `firstPlayedLocalIso` (hard validation error).
    3. Gate `End` CANNOT be moved before `lastPlayedLocalIso` (hard validation error — evaluated BEFORE `isGateExpiredOrInactivated` skip using `preExistingExpiredIds` so typing a past `End` date on an active gate can NEVER bypass validation).
    4. Parent Announcement `startDate` CANNOT be moved after overall earliest `firstPlayedLocalIso`, and `endDate` CANNOT be moved before overall latest `lastPlayedLocalIso` (hard validation error in `parentBlockingErrors`).
    5. `gatePlayCount` uses `Math.max(draftPlayed, savedPlayed)` so editing draft dates can NEVER drop `gatePlayCount` to `0` or unlock `Delete`.
    6. Interstitial quick-fix buttons (`Set Gate #N to Start`, `Set Gate #N to Prior`, `End Gate #N`), reciprocal `updateGateStartDate()` previous-gate auto-backfill, and `handleConfirmPlacementModal()` MUST refuse/hide any edit that alters a played gate's `Start` or sets a played gate's `End < lastPlayedLocalIso`.
- **Code Anchors**:
  - `src/lib/temporalReconciliation.ts` -> `computePlayedGateBoundsMap()`
  - `src/lib/scheduleEngine.ts` -> `validateTimeGatedMp3s(..., playedGateBounds, preExistingExpiredIds)`
  - `src/components/calendar/AnnouncementEditorView.tsx` -> `isStartLocked`, `updateGateStartDate`, interstitial guards, inline `parentBlockingErrors`
  - `src/components/CalendarTab.tsx` -> `saveEdit()`, `handleConfirmPlacementModal()`, `savedGates` prop

### Invariant `LIN-4`: Hard Blocking Errors vs. Soft Warnings on Save (Single Source of Truth; No Bypass of Hard Conflicts)
- **Rule**: `validateTimeGatedMp3s()` directly returns structured, deduplicated `blockingErrors: string[]` and `softWarnings: string[]` (no fragile string-matching in `CalendarTab.tsx`, no double `Gate #` prefixes, and pairwise overlaps listed once). `saveEdit()` strictly blocks whenever `blockingErrors.length > 0` (`forceSaveAnyway` ignored; no `"Save Anyway"` button):
  - **HARD BLOCKS (NO `"Save Anyway"`)**:
    1. Zero gates (`currentMp3s.length === 0`)
    2. Missing `Start` date & time on any non-preexisting gate
    3. Inverted dates (`Start > End`, evaluated BEFORE expired-gate skip so past-dated drafts cannot bypass)
    4. Active gate overlaps or out-of-order starts
    5. Played-gate & parent-Announcement date-bound violations (`LIN-3`)
  - **SOFT WARNINGS (`"Save Anyway"` allowed)**:
    1. Missing file attachment on a stubbed gate / empty media row
    2. Intentional schedule gaps (`Gap before Gate #`, `Gap between Gate #`, `Gap after Gate #`)
    3. Parent Announcement boundary overreach (when it does not violate played bounds)
- **Code Anchors**:
  - `src/lib/scheduleEngine.ts` -> `validateTimeGatedMp3s()` (`blockingErrors`, `softWarnings`, `parentBlockingErrors`, `hasBlockingErrors`, `hasSoftWarnings`)
  - `src/components/CalendarTab.tsx` -> `saveEdit()`, `saveValidationState` modal

### Invariant `LIN-5`: `Reuse` & `Split to New Gate` Never Resurrect Inactivated Media Rows
- **Rule**: When cloning a gate via **Reuse** (`CalendarTab.tsx` -> `handleReuseGate` AND `AnnouncementEditorView.tsx` fallback `handleReuseGate`) or **Split to New Gate** (`AnnouncementEditorView.tsx` -> `applyReactivateSplitToNewGate`):
  - Filter `getGateMediaItems(gate)` to `!mi.inactivated` (`activeOnly`).
  - Fall back to all rows ONLY when `activeOnly.length === 0` (every row in the source gate was inactivated).
  - Never silently revive previously retired tracks into a new active gate's rotation.
- **Code Anchors**:
  - `src/components/CalendarTab.tsx` -> `handleReuseGate()`
  - `src/components/calendar/AnnouncementEditorView.tsx` -> `handleReuseGate()`, `applyReactivateSplitToNewGate()`

### Invariant `LIN-6`: Historical Revision Gate Snapshot Preservation, Clean Revision Diffing & `#43` Boundary
- **Rule**:
  - In `resolveAnnouncementsForDate()` (`src/lib/temporalReconciliation.ts`), when a past `matchedRev` has `revGates.length > 0`, use `revGates` directly instead of overwriting them with current head `timeGatedMp3s`. Fall back to `currentGates` ONLY if `revGates.length === 0` (legacy revisions without gate snapshots).
  - In `CalendarTab.tsx` `saveEdit()`, `hasScheduleChanged` compares canonicalized gates (stripped of `v0.15.4` sibling-bridge fields) so no-op saves do not push duplicate revisions into `revisions[]`.
  - **By-Design Boundary (`#43`)**: Played slots are proven by `logs.json` (`mp3Name` + `gateId` + `rotationIndex`/`rotationTotal`). Scheduled slot existence is proven by `revisions[]`. Past unplayed/missed rotation track order is NOT snapshotted on every reorder; on-the-fly calculation with per-item `inactivatedAt` is the accepted minimum.
- **Code Anchors**:
  - `src/lib/temporalReconciliation.ts` -> `resolveAnnouncementsForDate()`
  - `src/components/CalendarTab.tsx` -> `saveEdit()` (`canonicalizeGates`)
- **Automated Regression Suite**:
  - `scripts/test-schema-upgrade.ts` -> **Stage 9** (`node scripts/test-schema-upgrade.cjs`) verifies `LIN-1` through `LIN-6` on every test run.


