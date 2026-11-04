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

## 3. Unified `v0.15.4/5` (`Live`/`Studio`) + `v0.20.1` (`Admin`) Rollout & Full Feature Test Plan

### Rollout Topology & Assumptions
* **Single `v0.20.1` Admin Writer**: `v0.20.1` (`AMP Admin`) is the sole workstation editing schedules (`announcements.json`, `shows.json`).
* **Concurrent `v0.15.4 / v0.15.5` Readers + Log Writers**: Existing DJs continue running `v0.15.4/5` (`AMP Live` and `AMP Studio`) using only the **Player** and **Log** tabs (reading `announcements.json` and `shows.json`, and writing play entries to `logs.json`) until all workstations are upgraded.
* **Single-Pass Silent Integration**: Cross-platform checks (macOS Universal vs. Windows `x64`), folder-switching checks, `#5b`, `#31`, gate lifecycle (`Inactivate`/`Reactivate`/`Reuse`), multi-select picker, gate-scoped scoring, `Up Next` promos, and `Prerecord + Export` are woven into the chronological steps below so nothing has to be tested twice.

---

### Phase 1: Baseline `v0.15.4/5` Seed & Initial `v0.20.1` Admin Conversion (Windows -> Mac)

1. **Seed Test Folder in `v0.15.4/5` (`Live` or `Studio` on Machine A — e.g., Windows)**:
   * `a.` Create a clean local test folder (`Test_Station_Root/`) with `settings/`, `media_announcements/`, `media_evergreens/`, `media_shows/`, and `logs/` containing a copy of your real `v0.15.4/5` `announcements.json`, `shows.json`, `logs.json`, `.mp3` files, and at least two `.txt` Live Read scripts (one where `approximateReadTime` is `null` or missing in `announcements.json`).
   * `b.` Launch `v0.15.4/5`, open **Folders**, point to `Test_Station_Root/`, and confirm the schedule loads.
   * `c.` In `v0.15.4/5` **Player**, play 1 scheduled `.mp3` announcement and mark 1 `.txt` Live Read as Read so `v0.15.4/5` writes fresh native entries into `logs.json` (without `_meta`, using `timestamp`, `announcementTime`, `logTimeStamp`).
2. **Initial Conversion Run in `v0.20.1` (`AMP Admin` on Machine B — e.g., macOS Universal `.dmg`)**:
   * `a.` Install and launch `AMP Admin-0.20.1-Mac.dmg`, open **Folders**, and point it to the same `Test_Station_Root/` folder (silently verifying `Folders` path selection + macOS Universal binary execution `#44`).
   * `b.` Verify `v0.20.1` opens directly in normal writable mode (no false `"Read-Only Mode"` lockout) and automatically heals/writes `_meta` + sibling fields on save.
   * `c.` Open **Guide / Help -> Station Settings** and set/verify **Station Timezone**, **Admin Contact Info** (also click the footer `?` icon to verify the Admin Contact popover `#15`), and **Up Next Promo** (`Enabled`, `20` mins before `#12`).
   * `d.` Open **Calendar** for today and yesterday: verify the slots played in `v0.15.4/5` (Step 1c) and prior historical logs appear as **Played** (green) with **0** false Missed flags (`#5b`).
   * `e.` Open **Calendar -> Announcements** (or inspect `announcements.json` in Notepad++): confirm the legacy `.txt` script card that had `null`/missing `approximateReadTime` automatically populated its `~0mXXs` (~150 WPM) estimate (`#28` / `#5b`).
   * `f.` Switch to **Calendar -> Shows**, click **Check Folders**, and confirm `media_announcements`, `media_evergreens`, and `media_shows` validate cleanly (`C.8c`).

---

### Phase 2: Verify `v0.15.4/5` Still Works After `v0.20.1` Conversion

3. **Reload `v0.15.4/5` (`Live` / `Studio`) Against the Converted Files**:
   * `a.` In `v0.20.1 Admin`, make a small edit to an existing announcement (e.g., tweak a note or time gate) and click **Save** so `v0.20.1` writes the full `v1` `_meta` envelope + sibling bridge to `announcements.json` and `shows.json`.
   * `b.` In `v0.15.4/5` (`Live` or `Studio`), click **Sync** (or relaunch).
   * `c.` Verify `v0.15.4/5` **Player** and **Log** tabs load all announcements, shows, and prior logs cleanly with no errors or missing audio files (`#36` flat `TimeGatedMp3` sibling bridge).

---

### Phase 3: Add `v0.20.1`-Specific Features in `v0.20.1 Admin` (While Silencing Other Test Plan Items)

4. **Multi-Select Rotation, Reordering, `SPLIT`, & Incomplete Gate Warning (`#25`, `#31`, `B.5b`, `B.6`)**:
   * `a.` In `v0.20.1 Admin` (`Calendar -> Announcements`), edit an announcement that runs hourly today and click **+ Add Announcement** (new time gate) -> **Proceed Without File** (`B.6b`).
   * `b.` Click **Save** while the gate has no file / blank Start date and verify the **Incomplete Gate Data** warning modal blocks the save and lists the missing fields (`B.5b`, `B.6b`).
   * `c.` On that new gate (or via **+ Add Announcement**), open `MediaPickerModal`:
     * Verify column sorters (`Name`, `Type`, `File Date`, `Last Used`), `All / Audio / LiveRead` radio filters, `Unused First` checkbox, and `+ UPLOAD FILE` (`#9`, `#24`).
     * Check **3 files** (e.g., 1 `.mp3` and 2 `.txt` scripts), verify the `1, 2, 3` selection order badges, and click **Use Selected (3)** to seed all 3 into `mediaItems` (`B.6a`).
   * `d.` Use the up/down arrows to swap rows `2` and `3`, then immediately click **Choose / Browse** on the moved row and pick a file — verify only that exact row updates (`#31 / A.2a`).
   * `e.` On the 2nd or 3rd rotating `.txt` script row, click **Edit** (opening `CopyEditorModal`), add **Bold** (`**text**`), *Italic* (`*text*`), and __Underline__ (`__text__`), click **SPLIT**, save the split `.txt` file, and choose **Use New Split File** — verify that exact rotating slot (`itemIndex`) updates (`#8`, `#31 / A.2b`).
   * `f.` Save the announcement. On the **Active Announcements** card list, use the card's `Preview:` dropdown to select one of the rotating scripts, click **Preview -> Edit -> SPLIT -> Use New Split File**, and confirm both the card dropdown and `announcements.json` update that exact slot (`#31 / A.2c`).
   * `g.` Inspect `announcements.json` in Notepad++: confirm `mediaItems` entries have no redundant sub-item `id`, and confirm top-level `gate.mp3Url`, `gate.assetType`, and `gate.duration`/`approximateReadTime` mirror `mediaItems[0]` (`#31.4`, `#36`).
5. **Non-Destructive Gate Inactivation, `Reactivate`, `Reuse`, & Gate-Scoped Scoring (`B.3`, `B.4`, `B.5a`, `B.7`)**:
   * `a.` Open an announcement in `v0.20.1 Admin` and click **Inactivate** on an active gate whose `End` date is in the future (or blank). Expand **Past / Inactivated Gates** and verify the `Inactivated` badge appears while the original `End` date value is preserved (`B.3a–b`).
   * `b.` Immediately click **Reactivate** (0 missed slots) and confirm it restores in-place to the active gates list (`B.4a`).
   * `c.` Inactivate a gate whose `Start` is in the past and where at least one scheduled hour has elapsed without a log (or temporarily edit `inactivatedAt` in Notepad++ to 2 hours ago), then click **Reactivate** and verify the popup offers **Reactivate With Gaps** vs. **Split to New Gate** (`B.4b`). Choose **Split to New Gate** and confirm the old gate is capped at `inactivatedAt` inside **Past / Inactivated Gates** while a new active gate starts from now (`B.4b.2`).
   * *(Coexistence Note for Step 5)*: Note that `v0.15.4/5` does not know about `inactivated: true` on a gate whose `endDate` is still in the future. Choosing **Split to New Gate** (or setting an explicit `endDate` when retiring a gate) sets a concrete `endDate` on the old gate so `v0.15.4/5` also stops playing it!
   * `d.` Click **Reuse** on a gate in **Past / Inactivated Gates** and confirm it appends a new active gate with cloned `mediaItems`, blank `Start`/`End` dates, and `0 plays` (allowing **Delete**), while hovering the `xx plays` / `Protected (xx plays)` badge on the historical gate shows the 4-value tooltip (`Played`, `Missed`, `Future`/`∞`, `Cancelled`, `Total`) (`B.5a`, `B.7a–b`). Delete the temporary blank reused gate and save.

---

### Phase 4: Verify `v0.15.4/5` (`Live` / `Studio`) Concurrent Usage & Bi-Directional Logging

6. **Run `v0.15.4/5` (`Player` & `Log`) Against the `v0.20.1`-Enhanced Schedule**:
   * `a.` In `v0.15.4/5` (`Live` or `Studio`), click **Sync** (or reload).
   * `b.` **Rotating Gate Behavior in `v0.15.4/5`**: Locate the announcement with the 3 rotating items from Step 4. Verify `v0.15.4/5` displays and plays/reads `Item 1` (`mediaItems[0]`, mirrored via `gate.mp3Url`) cleanly without crashing or showing `"File not found"`.
   * `c.` **Formatted `.txt` Live Read Behavior in `v0.15.4/5`**: Open the `.txt` Live Read created in Step 4e inside `v0.15.4/5`'s `LiveReadPopout`. Confirm `v0.15.4/5` opens the `.txt` file cleanly and shows the top `<!-- This is formatted as a .md markdown file... -->` note explaining `**bold**`, `*italic*`, and `__underline__` for the legacy DJ.
   * `d.` **Log Write from `v0.15.4/5` (Stripping `_meta` on `logs.json`)**: Play 1 `.mp3` and mark 1 Live Read as Read in `v0.15.4/5`. Inspect `logs.json` in Notepad++ to observe that `v0.15.4/5` saved the new log entry and stripped `_meta` from `logs.json`.
7. **Verify `v0.20.1` (`Admin` / `Live` / `Studio`) Absorbs `v0.15.4/5` Logs & Runs All `v0.20.1` Player Modes**:
   * `a.` In `v0.20.1` (test on Windows `AMP Studio-0.20.1` or `AMP Live-0.20.1` to cover Windows `x64` player execution), point to `Test_Station_Root/` or click **Sync**.
   * `b.` Confirm `v0.20.1` silently restores `_meta` on `logs.json`, seeds `scheduledFor` and `executedAt` on the entries written by `v0.15.4/5` in Step 6d, and shows those slots as **Played** in both **Player** (`Past` section) and **Calendar** (`#5b`).
   * `c.` **Live Mode (`Past / Now / Future` + `Up Next` + 2Hz Step Blink)**:
     * Verify the Three-Zone `Past / Now / Future` timeline, show transition spacers, `(1/3)` rotating item labels, and auto-seeded `"Up Next: [Show Name]"` promo card (`20m` before show start) (`#12`, `#13`, `C.8a–b`).
     * Open **Performance Overrides** (footer icon), toggle **Disable Animations** + **Urgency 2Hz Step Blink**, and verify the due card blinks cleanly (`#17`).
     * Play 1 announcement in `v0.20.1`, then click **Sync** in `v0.15.4/5` and confirm `v0.15.4/5` **Player** and **Log** immediately see the `v0.20.1` play as logged (`#5b`).
   * `d.` **Prerecord + Merged Export Mode & Playlist Mode (`#7`, `#21`, `#29`, `C.8a`)**:
     * Switch `v0.20.1` **Player** to **Prerecord**, verify the ~10-card show selector collapse and `OPEN PRERECORD` button (`#7`), load a show, and confirm `Up Next` promos appear once per show (`#29`, `C.8b`).
     * Click the blue **Export** button in the Prerecord header to open the `Export Show` popup, verify `Plan | .m3u LIST | Live Reads` with **Copy** (plus `Cmd/Ctrl+C` and right-click copy `#2`), **Export Files...**, and **Log Exports** (`#21`).
     * Switch to **Playlist** mode, load an Evergreen/Show folder, and confirm audio streams cleanly via `/api/media/stream` (`C.8a`).


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
