# Cross-Version Coexistence & Dual-Value Sibling Data Bridge (`v0.15.4 / v0.15.5 <-> v0.19.0+`)

## 1. Architectural Philosophy & Purpose

During the transition between `v0.15.4 / v0.15.5` (which introduced object-enveloped `.json` files with `*BackupCounter` and `data`, but lacked `_meta`, temporal revision windows, and `scheduledFor`/`executedAt` log fields) and `v0.19.0+` (which uses `_meta` envelopes, temporal schedule windows, and `reconcileDaySchedule` slot-to-log matching), stations may run both versions against a single shared folder or Google Drive folder.

Rather than forcing a destructive one-way schema cutover that breaks `v0.15.4 / v0.15.5` or locks `v0.19.0` into Read-Only mode whenever `v0.15.4 / v0.15.5` re-saves a file, `v0.19.0` implements a **Bidirectional Dual-Value Sibling Data Bridge**:
1. **Dual-Write on Every Action**: `v0.19.0` writes both the legacy field names expected by `v0.15.4 / v0.15.5` and the current sibling field names required by `v0.19.0+`.
2. **Bidirectional Seeding on Load, Save, Backup & Upgrade**: Whenever `v0.19.0` reads, saves, backs up, or upgrades `announcements.json`, `shows.json`, or `logs.json`, any missing sibling field in either direction is deterministically seeded from its counterpart.
3. **Zero-Lockout `_meta` Healing**: Because `v0.15.4 / v0.15.5` strips `_meta` when saving `{ AnnouncementsBackupCounter, data }`, `v0.19.0` recognizes object-enveloped files (`Array.isArray(raw.data)`) during `/api/compatibility/inspect` and Drive load, automatically restoring `_meta` and seeding missing sibling fields in-place without triggering a blocking `OLDER_VERSION_DETECTED` modal.

---

## 2. Complete Sibling Field Map (Legacy vs. Current)

### A. `logs.json` (`LogEntry`)
| Concept | Legacy Field (`v0.15.4 / v0.15.5`) | Current Sibling (`v0.19.0+`) | Seeding & Coexistence Rule (`seedLogEntrySiblings`) |
| :--- | :--- | :--- | :--- |
| **Scheduled Slot Time** | `announcementTime` & `timestamp` | `scheduledFor` | `scheduledFor = scheduledFor \|\| announcementTime \|\| timestamp`. Conversely, `announcementTime = announcementTime \|\| scheduledFor \|\| timestamp` and `timestamp = timestamp \|\| announcementTime \|\| scheduledFor`. |
| **Actual Execution Time** | `logTimeStamp` | `executedAt` | `executedAt = executedAt \|\| logTimeStamp \|\| timestamp \|\| scheduledFor`. Conversely, `logTimeStamp = logTimeStamp \|\| executedAt \|\| timestamp`. |
| **Envelope Metadata** | `LogsBackupCounter`, `data` | `_meta`, `LogsBackupCounter`, `data` | `migrateLogsPayload` preserves `LogsBackupCounter` and restores `_meta` whenever stripped by `v0.15.4 / v0.15.5`. |

### B. `announcements.json` (`Announcement`)
| Concept | Legacy Field (`v0.15.4 / v0.15.5`) | Current Sibling (`v0.19.0+`) | Seeding & Coexistence Rule (`migrateAnnouncementsPayload` & `normalizeAnnouncement`) |
| :--- | :--- | :--- | :--- |
| **Temporal Validity Start** | *(none / `metadata.createdAt`)* | `validFrom` | Seeded to `metadata.createdAt \|\| '1970-01-01T00:00:00.000Z'` (never `nowIso`, which would make historical dates appear invalid before the moment of upgrade). |
| **Temporal Validity End / Delete** | `enabled` | `validTo`, `isDeleted`, `revisions` | `enabled` is preserved for `v0.15.4 / v0.15.5`; `validTo: null`, `isDeleted: false`, and `revisions: []` are seeded alongside it. |
| **Media Asset List** | `mp3Url` (v0) or `timeGatedMp3s` | `timeGatedMp3s` with `assetType` | If `timeGatedMp3s` is empty and `mp3Url` exists, `timeGatedMp3s[0]` is synthesized; every item receives `assetType: 'audio' \| 'script'`. |
| **Time-Gate Flat Sibling Bridge (`#36`)** | Flat `gate.mp3Url`, `gate.assetType`, `gate.backupMp3Url`, `gate.approximateReadTime`, `gate.duration`, `gate.fileSize` | `gate.mediaItems[]` (`TimeGatedMediaItem[]`) | `migrateAnnouncementsPayload` and `normalizeAnnouncement` mirror `mediaItems[0]`'s properties onto the parent `TimeGatedMp3` gate object on write so `v0.15.4 / v0.15.5` workstations see valid flat gate properties during the overlap window. Conversely, if a `v0.15.4 / v0.15.5` workstation edits flat `gate.mp3Url` (etc.) without updating `mediaItems[0]`, `v0.19.5+` reconciles the flat gate properties back into `mediaItems[0]` on load. |
| **Script Approx Read Time (`#28`)** | `approximateReadTime` (`null` / omitted) | `approximateReadTime` (`0mXXs` at ~150 WPM) | When `assetType === 'script'` (or `.txt` / `.md`) has `null` or missing `approximateReadTime` and readable text exists on disk or inline, `migrateAnnouncementsPayload` and `normalizeAnnouncement` compute and backfill the ~150 WPM duration (`0mXXs`) across active slots and historical `revisions` (never overwriting explicit durations). |

### C. `shows.json` (`Show`)
| Concept | Legacy Field (`v0.15.4 / v0.15.5`) | Current Sibling (`v0.19.0+`) | Seeding & Coexistence Rule (`migrateShowsPayload`) |
| :--- | :--- | :--- | :--- |
| **Show Status & Temporal Range** | `active` | `validFrom`, `validTo`, `isDeleted`, `revisions` | `active` is preserved; `validFrom` is seeded to `'1970-01-01T00:00:00.000Z'`, with `validTo: null`, `isDeleted: false`, `revisions: []`. |

---

## 3. Part 2: Live Two-Version Workstation Verification Protocol
*(Execute this checklist when cutting a desktop build of `v0.19.0+` alongside an existing `v0.15.4` or `v0.15.5` build)*

1. **Prepare Shared Folder**:
   * Point `v0.15.4` (or `v0.15.5`) at a test `settings/` folder containing real `announcements.json`, `shows.json`, and `logs.json`.
   * Play or log 1 announcement in `v0.15.4/5` and edit/save 1 announcement so `v0.15.4/5` writes its native format to disk.
2. **Launch `v0.19.0+` on the Same Folder**:
   * Confirm `v0.19.0+` opens directly in normal writable mode (no false `"Legacy Data Format"` / `"Read-Only Mode"` lockout banner) and automatically seeds `_meta` + sibling fields on disk.
   * Confirm any legacy script/Live Read cards with `null` or missing `approximateReadTime` that have readable `.txt`/`.md` copy on disk automatically backfill their ~150 WPM `approximateReadTime` (`0mXXs`) across active and historical revision slots (`#28`).
   * Open the **Calendar** tab for today and yesterday: confirm slots that were logged in `v0.15.4/5` display as **Played** (green) and **0** false Missed counts appear for those played slots.
3. **Play & Edit in `v0.19.0+`**:
   * Play 1 announcement in `v0.19.0+` (or mark a Live Read as Read).
   * Inspect `logs.json` on disk: confirm the newest entry contains all 5 sibling timestamp fields (`timestamp`, `announcementTime`, `logTimeStamp`, `scheduledFor`, `executedAt`).
4. **Switch Back to `v0.15.4 / v0.15.5`**:
   * Reload/re-open `v0.15.4/5` against the same folder.
   * Confirm the slot played in `v0.19.0+` appears as played in `v0.15.4/5` (`Player` and `Log` tabs).
   * Play another announcement in `v0.15.4/5` (which strips `_meta` on save).
5. **Switch Back to `v0.19.0+` (Sync / Reload)**:
   * Click **Sync** (or relaunch `v0.19.0+`).
   * Confirm `v0.19.0+` remains writable, silently restores `_meta`, seeds `scheduledFor`/`executedAt` on the new `v0.15.4/5` log entry, preserves/backfills WPM `approximateReadTime` on legacy script slots (`#28`), and shows both plays as **Played** on the Calendar and Log tabs.

---

## 4. Future Roadmap: Legacy Sibling Deprecation & Pure Schema Sunset (`schemaVersion: 2`)

When all station workstations have permanently retired `v0.15.4 / v0.15.5` (and all `v0.15.x` builds) in favor of `v0.19.0+`, the legacy sibling fields can be cleanly retired by executing the following checklist:

1. **Bump `CURRENT_SCHEMA_VERSION` to `2` (`src/lib/compatibility.ts`)**:
   * Update `CURRENT_MIN_APP_VERSION` to the new baseline version (e.g. `"0.20.0"` or `"1.0.0"`).
2. **Retire `LogEntry` Legacy Timestamp Triplets (`src/types.ts`, `src/lib/compatibility.ts`, `src/hooks/useScheduleManager.ts`, `src/components/LiveReadPopout.tsx`)**:
   * Keep `scheduledFor` (canonical scheduled slot ISO) and `executedAt` (canonical execution ISO) as the sole required timestamp fields on `LogEntry`.
   * In `migrateLogsPayload` (for `schemaVersion: 1 -> 2`), convert any remaining `announcementTime` / `timestamp` into `scheduledFor` and `logTimeStamp` into `executedAt`, then omit `announcementTime` and `logTimeStamp` on new writes.
3. **Retire Auto-Heal Bypass for Un-Enveloped Object Files (`server.ts` & `src/lib/driveService.ts`)**:
   * Once `v0.15.x` is no longer stripping `_meta` on shared folders, `/api/compatibility/inspect` can require `_meta` strictly and route any missing-`_meta` file through the explicit two-phase `/api/compatibility/upgrade` flow.
4. **Retire `Announcement.mp3Url` Legacy Synthesis (`src/lib/utils.ts` & `src/lib/compatibility.ts`)**:
   * Keep `timeGatedMp3s` as the sole media array on `Announcement`.
