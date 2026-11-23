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

## 3. Unified `v0.15.4/5` (`Live`/`Studio`) + `v0.20.2` (`Admin`) Rollout & Full Feature Test Plan

> **Dedicated Handoff & Test Plan Document (`dev/docs/TESTING_PLAN_v0.20.2.md`)**:
> See **`dev/docs/TESTING_PLAN_v0.20.2.md`** for the full `v0.20.2` test plan plus conversation-specific agent handoff guidance (exact profile of the user's real `v0.15.4` test dataset, `RWR_Underwriting_Read.txt` null-read-time backfill specifics, `#47`–`#52` root-cause context, and the Windows-first -> macOS Universal re-prompt requirement).

### Rollout Topology & Assumptions
* **Single `v0.20.2` Admin Writer**: `v0.20.2` (`AMP Admin`) is the sole workstation editing schedules (`announcements.json`, `shows.json`).
* **Concurrent `v0.15.4 / v0.15.5` Readers + Log Writers**: Existing DJs continue running `v0.15.4/5` (`AMP Live` and `AMP Studio`) using only the **Player** and **Log** tabs (reading `announcements.json` and `shows.json`, and writing play entries to `logs.json`) until all workstations are upgraded.
* **Single-Pass Silent Integration**: Cross-platform checks (Windows `x64` and macOS Universal `.dmg`), folder-switching checks, `#5b`, `#31`, `#47`–`#52`, gate lifecycle (`Inactivate`/`Reactivate`/`Reuse`), multi-select picker, gate-scoped scoring, `Up Next` promos, and `Prerecord + Export` are woven into the chronological steps below so nothing has to be tested twice.

---

### Phase 1: Baseline `v0.15.4/5` Seed & Initial `v0.20.2` Admin Conversion (Windows + Mac)

1. **Seed Test Folder in `v0.15.4/5` (`Live` or `Studio` on Machine A — e.g., Windows)**:
   * `a.` Reset or create a clean local test folder (`Test_Station_Root/`) with `settings/`, `media_announcements/`, `media_evergreens/`, `media_shows/`, and `logs/` containing a copy of your real `v0.15.4/5` `announcements.json`, `shows.json`, `logs.json`, `.mp3` files, and at least two `.txt` Live Read scripts (one where `approximateReadTime` is `null` or missing in `announcements.json`).
   * `b.` Launch `v0.15.4/5`, open **Folders**, point to `Test_Station_Root/`, and confirm the schedule loads.
   * `c.` In `v0.15.4/5` **Player**, play 1 scheduled `.mp3` announcement and mark 1 `.txt` Live Read as Read so `v0.15.4/5` writes fresh native entries into `logs.json` (without `_meta`, using `timestamp`, `announcementTime`, `logTimeStamp`).
2. **Initial Conversion Run in `v0.20.2` (`AMP Admin` on Windows Portable/Installer and later macOS Universal `.dmg`)**:
   * `a.` Launch `AMP Admin` (`v0.20.2`) and click **Folders**:
     * Verify the **"For Administrators ONLY / Enter Admin Mode"** modal warning gate appears right inside **Folders** (`#47`).
     * Click **Enter Admin Mode**: confirm **Folders** immediately unlocks, displays the inline **First-Run Setup: Admin Contact Info** banner if no Admin Contact has been saved yet, and keeps Admin Mode verified for the rest of the session (so opening **Folders -> Help** or switching to **Calendar** does not re-prompt `#47`).
     * Point **Folders** to `Test_Station_Root/` and click **Save and Close**.
   * `b.` Verify `v0.20.2` opens directly in normal writable mode (no false `"Read-Only Mode"` lockout) and automatically heals/writes `_meta` + sibling fields + `settings/station_settings.json` on save.
   * `c.` Open **Folders -> Help -> Station Settings**:
     * Confirm all station settings are immediately editable (already unlocked by Step 2a `#47`).
     * Verify the **Admin Contact Info** placeholder uses the structural example `"e.g., Admin 1 — admin@station.org / (555) 000-0000"` (no `"Kate"` `#50`), save your Admin Contact Info, and click the footer `?` icon to verify the Admin Contact popover (`#15`).
     * Verify **Show Lookaround (`hh:mm`)** is now an `hh:mm` setting (e.g., `01:00` or `01:30` `#48`) and set **Up Next Promo** (`Enabled`, `20` mins before `#12`).
   * `d.` Open **Calendar** for today and yesterday: verify the slots played in `v0.15.4/5` (Step 1c) and prior historical logs appear as **Played** (green) with **0** false Missed flags (`#5b`).
   * `e.` Open **Calendar -> Announcements** (or inspect `announcements.json` in Notepad++): confirm the legacy `.txt` script card that had `null`/missing `approximateReadTime` automatically populated its `~0mXXs` (~150 WPM) estimate (`#28` / `#5b`).
   * `f.` Switch to **Calendar -> Shows**, click **Check Folders**, and confirm `media_announcements`, `media_evergreens`, and `media_shows` validate cleanly (`C.8c`).

---

### Phase 2: Verify `v0.15.4/5` Coexistence & Station Settings Survival (`#49`)

3. **Reload `v0.15.4/5` (`Live` / `Studio`) Against the Converted Files & Confirm Station Settings Survive**:
   * `a.` In `v0.20.2 Admin`, make a small edit to an existing announcement (e.g., tweak a note or time gate) and click **Save** so `v0.20.2` writes the full `v1` `_meta` envelope + `data[0]._stationMeta` + `settings/station_settings.json`.
   * `b.` In `v0.15.4/5` (`Live` or `Studio`), click **Sync** (or relaunch, which triggers `v0.15.4`'s `/api/trigger-backup` rewrite of `shows.json` and `announcements.json`).
   * `c.` Verify `v0.15.4/5` **Player** and **Log** tabs load all announcements, shows, and prior logs cleanly with no errors or missing audio files (`#36` flat `TimeGatedMp3` sibling bridge).
   * `d.` Back in `v0.20.2 Admin`, click **Sync** (or relaunch `v0.20.2 Admin`) and open **Folders -> Help -> Station Settings**: confirm your saved **Admin Contact Info**, **Up Next Promo**, **Show Lookaround (`hh:mm`)**, and **Station Timezone** were **not** erased by `v0.15.4` (`#49`).

---

### Phase 3: Add `v0.20.2`-Specific Features in `v0.20.2 Admin` (`#25`, `#31`, `#51`, `#52`)

4. **Multi-Select Rotation, Reordering, Local `CopyEditorModal`, `SPLIT`, & Incomplete Gate Warning (`#25`, `#31`, `#51`, `#52`, `B.5b`, `B.6`)**:
   * `a.` In `v0.20.2 Admin` (`Calendar -> Announcements`), edit an announcement that runs hourly today and click **+ Add Announcement** (new time gate) -> **Proceed Without File** (`B.6b`).
   * `b.` Click **Save** while the active/upcoming gate has no file / blank Start date (or an active overlap/gap) and verify the **Incomplete Gate Data** warning modal appears (`#51`, `B.5b`, `B.6b`), listing active/upcoming issues (ignoring historical expired gates) and offering both **Save Anyway** and **Return to Editor to Fix**. Click **Return to Editor to Fix**.
   * `c.` On that new gate (or via **+ Add Announcement**), open `MediaPickerModal`:
     * Verify column sorters (`Name`, `Type`, `File Date`, `Last Used`), `All / Audio / LiveRead` radio filters, `Unused First` checkbox, and `+ UPLOAD FILE` (`#9`, `#24`).
     * Check **3 files** (e.g., 1 `.mp3` and 2 `.txt` scripts), verify the `1, 2, 3` selection order badges, and click **Use Selected (3)** to seed all 3 into `mediaItems` (`B.6a`).
   * `d.` Use the up/down arrows to swap rows `2` and `3`, then immediately click **Choose / Browse** on the moved row and pick a file — verify only that exact row updates (`#31 / A.2a`).
   * `e.` On the 2nd or 3rd rotating `.txt` script row, click **Edit** (opening `CopyEditorModal`):
     * Verify the existing `.txt` script text loads and seeds cleanly from the local folder (no `"Could not load script..."` error `#52`) and the **Auto** read-time calculation checkbox is checked (`#52`).
     * Add **Bold** (`**text**`), *Italic* (`*text*`), and __Underline__ (`__text__`), click **SPLIT**, save the split `.txt` file (confirming no `"Google Drive Station folder is not configured..."` error `#52`), and choose **Use New Split File** — verify that exact rotating slot (`itemIndex`) updates (`#8`, `#31 / A.2b`, `#52`).
   * `f.` Save the announcement. On the **Active Announcements** card list, use the card's `Preview:` dropdown to select one of the rotating scripts, click **Preview -> Edit -> SPLIT -> Use New Split File**, and confirm both the card dropdown and `announcements.json` update that exact slot (`#31 / A.2c`, `#52`).
   * `g.` Inspect `announcements.json` in Notepad++: confirm `mediaItems` entries have no redundant sub-item `id`, and confirm top-level `gate.mp3Url`, `gate.assetType`, and `gate.duration`/`approximateReadTime` mirror `mediaItems[0]` (`#31.4`, `#36`).
5. **Non-Destructive Gate Inactivation, `Reactivate`, `Reuse`, & Gate-Scoped Scoring (`B.3`, `B.4`, `B.5a`, `B.7`)**:
   * `a.` Open an announcement in `v0.20.2 Admin` and click **Inactivate** on an active gate whose `End` date is in the future (or blank). Expand **Past / Inactivated Gates** and verify the `Inactivated` badge appears while the original `End` date value is preserved (`B.3a–b`).
   * `b.` Immediately click **Reactivate** (0 missed slots) and confirm it restores in-place to the active gates list (`B.4a`).
   * `c.` Inactivate a gate whose `Start` is in the past and where at least one scheduled hour has elapsed without a log (or temporarily edit `inactivatedAt` in Notepad++ to 2 hours ago), then click **Reactivate** and verify the popup offers **Reactivate With Gaps** vs. **Split to New Gate** (`B.4b`). Choose **Split to New Gate** and confirm the old gate is capped at `inactivatedAt` inside **Past / Inactivated Gates** while a new active gate starts from now (`B.4b.2`).
   * *(Coexistence Note for Step 5)*: Note that `v0.15.4/5` does not know about `inactivated: true` on a gate whose `endDate` is still in the future. Choosing **Split to New Gate** (or setting an explicit `endDate` when retiring a gate) sets a concrete `endDate` on the old gate so `v0.15.4/5` also stops playing it!
   * `d.` Click **Reuse** on a gate in **Past / Inactivated Gates** and confirm it appends a new active gate with cloned `mediaItems`, blank `Start`/`End` dates, and `0 plays` (allowing **Delete**), while hovering the `xx plays` / `Protected (xx plays)` badge on the historical gate shows the 4-value tooltip (`Played`, `Missed`, `Future`/`∞`, `Cancelled`, `Total`) (`B.5a`, `B.7a–b`). Delete the temporary blank reused gate and save.

---

### Phase 4: Verify `v0.15.4/5` (`Live` / `Studio`) Concurrent Usage & Bi-Directional Logging

6. **Run `v0.15.4/5` (`Player` & `Log`) Against the `v0.20.2`-Enhanced Schedule**:
   * `a.` In `v0.15.4/5` (`Live` or `Studio`), click **Sync** (or reload).
   * `b.` **Rotating Gate Behavior in `v0.15.4/5`**: Locate the announcement with the 3 rotating items from Step 4. Verify `v0.15.4/5` displays and plays/reads `Item 1` (`mediaItems[0]`, mirrored via `gate.mp3Url`) cleanly without crashing or showing `"File not found"`.
   * `c.` **Formatted `.txt` Live Read Behavior in `v0.15.4/5`**: Open the `.txt` Live Read created in Step 4e inside `v0.15.4/5`'s `LiveReadPopout`. Confirm `v0.15.4/5` opens the `.txt` file cleanly and shows the top `<!-- This is formatted as a .md markdown file... -->` note explaining `**bold**`, `*italic*`, and `__underline__` for the legacy DJ.
   * `d.` **Log Write from `v0.15.4/5` (Stripping `_meta` on `logs.json`)**: Play 1 `.mp3` and mark 1 Live Read as Read in `v0.15.4/5`. Inspect `logs.json` in Notepad++ to observe that `v0.15.4/5` saved the new log entry and stripped `_meta` from `logs.json`.
7. **Verify `v0.20.2` (`Admin` / `Live` / `Studio`) Absorbs `v0.15.4/5` Logs & Runs All `v0.20.2` Player Modes**:
   * `a.` In `v0.20.2` (test on Windows `AMP Studio-0.20.2` or `AMP Live-0.20.2` to cover Windows `x64` player execution, and later repeat on macOS Universal `.dmg`), point to `Test_Station_Root/` or click **Sync**.
   * `b.` Confirm `v0.20.2` silently restores `_meta` on `logs.json`, seeds `scheduledFor` and `executedAt` on the entries written by `v0.15.4/5` in Step 6d, and shows those slots as **Played** in both **Player** (`Past` section) and **Calendar** (`#5b`).
   * `c.` **Live Mode (`Past / Now / Future` + `Up Next` + 2Hz Step Blink)**:
     * Verify the Three-Zone `Past / Now / Future` timeline, show transition spacers (respecting your `hh:mm` Show Lookaround `#48`), `(1/3)` rotating item labels, and auto-seeded `"Up Next: [Show Name]"` promo card (`20m` before show start) (`#12`, `#13`, `C.8a–b`).
     * Open **Performance Overrides** (footer icon), toggle **Disable Animations** + **Urgency 2Hz Step Blink**, and verify the due card blinks cleanly (`#17`).
     * Play 1 announcement in `v0.20.2`, then click **Sync** in `v0.15.4/5` and confirm `v0.15.4/5` **Player** and **Log** immediately see the `v0.20.2` play as logged (`#5b`).
   * `d.` **Prerecord + Merged Export Mode & Playlist Mode (`#7`, `#21`, `#29`, `C.8a`)**:
     * Switch `v0.20.2` **Player** to **Prerecord**, verify the ~10-card show selector collapse and `OPEN PRERECORD` button (`#7`), load a show, and confirm `Up Next` promos appear once per show (`#29`, `C.8b`).
     * Click the blue **Export** button in the Prerecord header to open the `Export Show` popup, verify `Plan | .m3u LIST | Live Reads` with **Copy** (plus `Cmd/Ctrl+C` and right-click copy `#2`), **Export Files...**, and **Log Exports** (`#21`).
     * Switch to **Playlist** mode, load an Evergreen/Show folder, and confirm audio streams cleanly via `/api/media/stream` (`C.8a`).


---

## 4. Future Roadmap: Backing Out `v0.15.4`-Exclusive Schema Code (`v0.20.8+` Onward -> `schemaVersion: 2`)

Because the original `v0.15.4` test pool is small and will convert quickly once `v0.20.8` releases, subsequent builds (`schemaVersion: 2` / `v0.20.9+` or `v1.0.0+`) can drop all `v0.15.4`-exclusive upgrade and coexistence scaffolding and support **`v0.20.8+` onward** exclusively.

Use this file-by-file checklist when backing out `v0.15.4`-exclusive schema code.

### A. Version & Schema Cutover (`src/lib/compatibility.ts`)
1. **Bump Schema Floor**:
   * Set `CURRENT_SCHEMA_VERSION = 2` and `CURRENT_MIN_APP_VERSION = '0.20.8'` (or `'1.0.0'`).
   * Keep `DataEnvelope._meta` (`schemaVersion`, `minAppVersion`, `lastModifiedBy`, `highestAppVersion`, `lastModifiedAt`) as the standard envelope for `v0.20.8+`.
2. **Remove `v0.15.4` Flat Gate Reconciliation & Dual-Writes (`migrateAnnouncementsPayload`)**:
   * Remove `isLegacy015Envelope` / `isLegacy015Item` detection and the `v0.15.x` flat `mp3Url` -> `mediaItems[reconcileIdx]` reconciliation block.
   * Stop mirroring `primaryActiveItem` properties (`mp3Url`, `assetType`, `backupMp3Url`, `approximateReadTime`, `duration`, `fileSize`) onto the parent `TimeGatedMp3` gate object — keep `gate.mediaItems[]` as the sole source of truth.
   * Remove legacy v0 flat `Announcement.mp3Url` -> `timeGatedMp3s[0]` synthesis.
3. **Remove `data[0]._stationMeta` Item-Level Carrier (`migrateAnnouncementsPayload` & `migrateShowsPayload`)**:
   * `data[0]._stationMeta` existed exclusively because `v0.15.4` stripped `_meta` and top-level station settings when rewriting `shows.json` and `announcements.json`.
   * Stop writing and reading `data[0]._stationMeta`; read/write station settings solely on `shows.json` (`_meta` / top-level) and `announcements.json._meta.scheduleWindow`.
4. **Remove `v0.15.4` Historical Revision & Date Backfills**:
   * Remove `backfillLegacyAnnouncementRevisions()` (synthesized revision slices for `v0.15.4` in-place minute edits and disabled ended campaigns) and remove its invocation inside `migrateAnnouncementsPayload`.
   * Remove the legacy `'2026-08-01'` `validFrom` patch inside `resolveSeededValidFrom` (keep `validFrom` preservation for `v0.20.8+` records).
   * Keep `estimateWpmReadTimeFromText()` (still actively used by `CopyEditorModal` and `#77` WPM `isAutoReadTime` recalculation), but drop the one-time legacy null-read-time `0.15.4` upgrade scan inside `GET /api/compatibility/inspect`.
5. **Simplify `LogEntry` Legacy Timestamp Triplets (`seedLogEntrySiblings` & `migrateLogsPayload`)**:
   * Keep `scheduledFor` (canonical scheduled slot ISO) and `executedAt` (canonical execution ISO) as the sole timestamp fields on `LogEntry`.
   * Keep a clean one-way `schemaVersion: 1 -> 2` converter inside `migrateLogsPayload` (mapping any remaining `v0.20.8` `announcementTime`/`timestamp`/`logTimeStamp` onto `scheduledFor`/`executedAt`), then stop dual-writing `announcementTime`, `timestamp`, and `logTimeStamp` on new log writes.

### B. Client Normalization & Types (`src/lib/scheduleEngine.ts`, `src/types.ts`, `src/lib/temporalReconciliation.ts`)
6. **`src/lib/scheduleEngine.ts` (`normalizeAnnouncement`)**:
   * Remove `isLegacy015Item`, legacy top-level `anyItem.mp3Url` synthesis, the `v0.15.x` flat gate reconciliation block, and the flat sibling mirror writes on `TimeGatedMp3`.
7. **`src/types.ts`**:
   * Remove deprecated flat sibling fields (`mp3Url`, `assetType`, `backupMp3Url`, `approximateReadTime`, `duration`, `fileSize`) from `TimeGatedMp3` and remove `LegacyRawAnnouncement` / `LegacyRawGate` flat properties where no longer needed.
   * Keep `gateId`, `rotationIndex`, `rotationTotal`, `inactivated`, `inactivatedAt`, `isAutoReadTime`, `AdminMessage`, and `AnnouncementRevision.timeGatedMp3s` (all `v0.20.8+` canonical fields).
8. **`src/lib/temporalReconciliation.ts`**:
   * Remove the `backfillLegacyAnnouncementRevisions()` call on load.
   * Once `schemaVersion: 2` logs are live, simplify timestamp accessors to read `scheduledFor` and `executedAt` directly (retaining `gateId`-first attribution and legacy fallback only if needed for pre-`0.20.8` log entries already converted in `logs.json`).

### C. Backend Routes, Sidecar & Drive Provider (`src/server/routes/scheduleRoutes.ts`, `src/server/storage/driveProvider.ts`, `src/server/state.ts`)
9. **Remove Silent `!parsed._meta` Auto-Enveloping & First-Touch Pre-Upgrade Snapshots**:
   * In `GET /api/compatibility/inspect` (`scheduleRoutes.ts`) and `inspectServerDriveCompatibility` (`driveProvider.ts`), remove the `!parsed._meta` silent auto-envelope bypass and `ensureFirstTouchPreUpgradeBackup` / `ensureDriveFirstTouchPreUpgradeBackup` helpers.
   * Require `_meta` strictly and route any older `schemaVersion < CURRENT_SCHEMA_VERSION` payload through the explicit transactional `/api/compatibility/upgrade` flow.
10. **Retire `settings/station_settings.json` Sidecar & `_stationMeta` Mirrors**:
    * `settings/station_settings.json` was added strictly so `v0.15.4` rewrites of `shows.json` could not erase `stationTimezone`, `adminContactInfo`, `upNextPromo`, `scheduleWindow`, and `adminMessages`.
    * Once `v0.15.4` is gone, remove `readStationSettingsSidecar`, `writeStationSettingsSidecar`, `resolveShowsMetadataWithSidecarFallback`, `resolveAnnScheduleWindowWithSidecarFallback`, and `data[0]._stationMeta` sync blocks across `scheduleRoutes.ts`, `state.ts`, and `driveProvider.ts` — reading/writing station settings exclusively on `shows.json` (and keeping `announcements.json._meta.scheduleWindow` synced on WPM/font updates).
    * **Keep** all corrupt-JSON overwrite guards (`POST /api/logs`, `POST /api/trigger-backup`, `appendDriveLog`, `writeDriveShows`, `triggerServerDriveBackup`) and Admin Backup Recovery (`/api/backups/*`) — those are permanent data-safety features, not `v0.15.4` code.

### D. Optional Copy Formatting Note & Automated Test Suite
11. **Optional: Legacy Plain-Text Markdown Header (`src/components/CopyEditorModal.tsx` & `src/lib/liveReadTextUtils.ts`)**:
    * The top `<!-- This is formatted as a .md markdown file... -->` comment was added so `v0.15.4` DJs opening formatted `.txt` scripts understood `**bold**` / `*italic*` / `__underline__`. Decide whether to keep it (still useful if opened in Notepad/TextEdit) or drop it for `v0.20.8+`.
12. **Rebase `scripts/test-schema-upgrade.ts` on `v0.20.8` (`schemaVersion: 1`) -> `schemaVersion: 2`**:
    * Retire `v0.15.4 / v0.15.5` envelope-strip and flat-gate ping-pong coexistence stages (Stages 1, 3, 4, 8a, `10g`, and the `0.15.4` sub-checks of `10h`).
    * Retain and expand all `v0.20.8+` canonical tests: multi-item rotation, `ScheduleEngine`, `LIN-1`–`LIN-6` gate lineage, Admin Messages, font defaults, monotonic `highestAppVersion`, and `v0.20.8 -> schemaVersion: 2` upgrade verification.

