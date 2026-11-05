# AMP `v0.20.2` -> `v0.20.3` Full Testing Plan & New-Session Agent Handoff Guide

> **Updated for `v0.20.3` (`11/05/2026`)**:
> The full `v0.20.2` Windows pass was completed and uncovered 5 bugs (`#54`–`#58`, all fixed in `v0.20.3`) plus 1 deferred UX item (`#53`).
> See **`dev/docs/TESTING_PLAN_v0.20.3.md`** (mirrored below) for:
> - **Part A (Section 2)**: The **Windows `v0.20.3` Delta Re-Test Plan (`Steps W1–W5`)** covering `#54`–`#58`.
> - **Part B (Section 3)**: The **Full Updated macOS Universal (`-Mac.dmg`) Testing Plan (`Phases 1–4, Steps 1–7`)** incorporating all `v0.20.2` (`#47`–`#52`) and `v0.20.3` (`#54`–`#58`) checks.

---

## 1. Critical Context & Non-Obvious Guidance for Any Agent Session

### A. Two-Stage Testing Sequence (`v0.20.3`)
1. **Stage A — Windows `v0.20.3` Delta Re-Test (`Section 2`, Steps W1–W5)**:
   - On Windows (`v0.20.2`), the user already completed the full `Phases 1–4 (Steps 1–7)` test pass. Everything passed except for 5 specific issues (`#54`–`#58`) plus 1 non-breaking UX enhancement deferred to Roadmap `#53` (Gate/Media-Row `Delete` vs. `Inactivate` rules and `"Are you sure"` prompts).
   - Run the concise **Windows `v0.20.3` Delta Re-Test (`Steps W1–W5`)** first to verify `#54`–`#58` on Windows `v0.20.3`.
2. **Stage B — Full macOS Universal (`-Mac.dmg`) Re-Run (`Section 3`, Phases 1–4, Steps 1–7)**:
   - Once the Windows `v0.20.3` delta check passes (or whenever the user switches to their Mac), **re-prompt the user through the entire macOS Universal test sequence (`Phases 1–4, Steps 1–7`) from the beginning** using `AMP Admin-0.20.3-Mac.dmg`, `AMP Live-0.20.3-Mac.dmg`, and `AMP Studio-0.20.3-Mac.dmg`.
   - This validates the single Universal macOS binary (`#44` — native `arm64` Apple Silicon + `x64` Intel) and all `v0.20.2` (`#47`–`#52`) + `v0.20.3` (`#54`–`#58`) fixes end-to-end on macOS.
3. **Interactive Step-by-Step Pacing**:
   - Walk the user through the test phases using ~50-character narrow-viewport formatting and continuous `1–N` numbering (`a, b, c` sub-bullets).
   - Once macOS testing completes, close out roadmap items `#5b` and `#31` in `dev/docs/ROADMAP_AND_BACKLOG.md` and move them to `dev/docs/ROADMAP_HISTORY.md`.

### B. Summary of What `v0.20.3` Fixed (`#54`–`#58`)
1. **`#54` — Live Schedule Window Persistence Across Mode & Folder Switches (`src/lib/compatibility.ts`, `src/server/routes/scheduleRoutes.ts`)**:
   - *Symptom in `v0.20.2` (Phase 2, Step 3d)*: Saving Schedule Window values (`-Xm grace / +Ym early · hh:mm show lookaround`) in `Folders -> Help -> Station Settings` and then saving announcements or switching between `v0.15.4` and `v0.20.2` overwrote the Schedule Window back to old values because `announcements.json` held a stale `_meta.scheduleWindow` that overwrote `station-settings.json`.
   - *Fix in `v0.20.3`*: `migrateAnnouncementsPayload` now accepts `overrideScheduleWindow` from `station-settings.json`, `GET/POST /api/announcements`, `/api/compatibility/inspect`, `/api/compatibility/upgrade`, and `/api/trigger-backup` prioritize `station-settings.json`, and `POST /api/shows` updates `announcements.json`'s `_meta.scheduleWindow` and `data[0]._stationMeta` whenever station settings are saved.
2. **`#55` — Admin-Only Lock on Live Schedule Window Editing (`src/components/LocalHelpModal.tsx`)**:
   - *Symptom in `v0.20.2`*: In `AMP Studio` on Windows, the `Live Schedule Window ("Now" Window & Show Lookaround)` section in `Folders -> Help` had an active `Edit Schedule Window...` button instead of being restricted to Admin builds.
   - *Fix in `v0.20.3`*: Added an `!isAdmin` read-only guard in `LocalHelpModal.tsx` so `AMP Studio` and `AMP Live` display the current Live Schedule Window settings as read-only (`Admin Only`), matching Station Timezone, Admin Contact Info, and Up Next Promo.
3. **`#56` — Media Picker `File Date` Column in Local Mode (`src/App.tsx`)**:
   - *Symptom in `v0.20.2` (Phase 3, Step 4c)*: Opening `Select Audio / Media` (`MediaPickerModal.tsx`) in Local mode showed `-` for every row in the `File Date` column because `fetchDataForMode` in `src/App.tsx` stripped `mtimeMs` and `modifiedTime` when mapping `/api/local-mp3s`.
   - *Fix in `v0.20.3`*: Preserved `mtimeMs` and `modifiedTime` when mapping `/api/local-mp3s` in `src/App.tsx` so `File Date` displays and sorts file modification dates in Local mode.
4. **`#57` — Prerecord Export `"Up Next"` Promo Export & Sequence Display Correlation (`src/server/routes/showsRoutes.ts`, `src/components/PlayerTab.tsx`, `src/components/PrerecordExportPopup.tsx`, `src/App.tsx`)**:
   - *Symptom in `v0.20.2` (Phase 4, Step 7d.b)*:
     1. Exporting a show with an `"Up Next"` promo segment reported `Missing Source File` because `/api/export-prerecord` looked for a physical file on disk instead of writing the generated promo script text.
     2. The `Export Show` popup's `Plan`, `.m3u LIST`, and `Live Reads` views rebuilt their own item lists instead of using `itemsToExport`, causing numbering and sequence mismatches against the actual `01..NN` exported files.
   - *Fix in `v0.20.3`*:
     1. `/api/export-prerecord` now detects `isUpNextPromo` / `__up_next_promo__:` items and writes `upNextScriptText` directly to the exported `NN - ... - LiveRead.txt` file with status `Found & Copied`.
     2. `itemsToExport` excludes cancelled playlist tracks and is passed directly into `PrerecordExportPopup.tsx` (`exportItems={itemsToExport}`) so `Plan`, `.m3u LIST`, and `Live Reads` (and their Copy buttons) display the exact `01..NN` sequence and filenames written to disk, and `Live Reads` automatically loads `.txt`/`.md` script text from disk.
5. **`#58` — Playlist Deck Active Playback Visibility, Execution-Order Sorting & Per-Slot Announcement Scoping (`src/components/PlayerTab.tsx`, `src/components/player/PlayerPlaylistDeckView.tsx`)**:
   - *Symptom in `v0.20.2` (Phase 4, Step 7d.c)*:
     1. Clicking play on a playlist track caused the track card to disappear from `Next` while playing and only reappear under `Played/Read` after playback finished.
     2. Under `Played/Read`, all played playlist tracks sorted above played/read announcements instead of sorting in chronological execution order.
     3. When the same announcement appeared twice in the same show (e.g., `:19` in Hour 1 and `:19` in Hour 2), playing the first occurrence also moved the second unplayed occurrence into `Played/Read`.
   - *Fix in `v0.20.3`*:
     1. Kept actively playing playlist tracks (`playingStates[t.id] || isAudioPlaying(t.id)`) in `activeUnplayedTracks` and `Next` with a purple `Playing` card state until playback finishes.
     2. Recorded wall-clock execution timestamps (`executedAt` / `logTimeStamp`) on Live Read playlist entries and sorted `Played/Read` items by `executedAt || logTimeStamp || timestamp` so played tracks and played/read announcements interleave in exact order played/read.
     3. Scoped announcement completion keys in `playedPlaylistTracks` to `${slotISO}-${announcementId}` (`slotIsoKey`) instead of bare `announcementId` or shared `fileName` so later occurrences of the same announcement in the same show stay unplayed in `Next`.

---

## 2. Part A — Windows `v0.20.3` Delta Re-Test Plan (`Steps W1–W5` for `#54`–`#58`)

- **1. Step W1 — Live Schedule Window Persistence Across Saves & `v0.15.4` Coexistence (`#54` — Phase 2, Step 3d)**
  - `a.` Launch `AMP Admin 0.20.3` on Windows, open **Folders -> Help -> Station Settings**, click **Edit Schedule Window...**, and set a custom **Live Schedule Window** (e.g., `-10m grace / +10m early · 01:30 show lookaround`), then click **Apply & Save Schedule Window**.
  - `b.` Go to **Calendar -> Announcements**, make a small edit to any announcement, and click **Save** (confirming saving announcements no longer overwrites your custom schedule window).
  - `c.` In `v0.15.4`, click **Sync** (or relaunch `v0.15.4` so it runs `POST /api/trigger-backup`).
  - `d.` Back in `AMP Admin 0.20.3`, click **Sync** (or relaunch) and open **Folders -> Help -> Station Settings**: confirm your custom **Live Schedule Window** (`-10m / +10m · 01:30`) was preserved intact (`#54`).

- **2. Step W2 — Admin-Only Lock on Live Schedule Window in `AMP Studio` (`#55`)**
  - `a.` Launch `AMP Studio 0.20.3` on Windows and open **Folders -> Help**.
  - `b.` Scroll to **Live Schedule Window (“Now” Window & Show Lookaround)**:
    - Confirm it displays the **Admin Only** badge and read-only lock banner (`"Locked — Open Calendar and click Enter Admin Mode (or use an Admin build) to edit the Live Schedule Window"`).
    - Confirm there is **no** `Edit Schedule Window...` button in `AMP Studio` (`#55`).

- **3. Step W3 — Media Picker `File Date` Column in Local Mode (`#56` — Phase 3, Step 4c)**
  - `a.` In `AMP Admin 0.20.3` (`Calendar -> Announcements`), edit any announcement and click **Browse / Choose** (or **+ Add File**) on a gate to open `Select Audio / Media` (`MediaPickerModal`).
  - `b.` Confirm the **File Date** column now populates with each local file's modification date (`MM/DD/YYYY`) instead of `-`.
  - `c.` Click the **File Date** column header to confirm ascending/descending date sorting works cleanly (`#56`).

- **4. Step W4 — Prerecord Export `"Up Next"` Promo & Sequence Display Correlation (`#57` — Phase 4, Step 7d.b)**
  - `a.` In `AMP Studio 0.20.3` (or `AMP Admin 0.20.3`), switch **Player** to **Prerecord** and load a show that includes playlist tracks, scheduled announcements (`.mp3` and `.txt` Live Reads), and an **Up Next** promo card (optionally cancel 1 playlist track to test cancelled-track exclusion).
  - `b.` Click the blue **Export** button in the Prerecord header to open the `Export Show` popup:
    - Check the **Plan**, **.m3u LIST**, and **Live Reads** tabs: confirm all three tabs use the exact same `01..NN` item numbering and filenames (excluding any cancelled track), and confirm the **Live Reads** tab displays both regular `.txt` script text and the **Up Next** promo script text (`#57`).
  - `c.` Click **Export Files...** and choose an export destination folder:
    - Confirm the export completes with **0 missing files** and that the **Up Next** promo segment is written as `NN - Up_Next_... - LiveRead.txt` with status `Found & Copied` in `_export_manifest.txt` (`#57`).
    - Confirm the exported files on disk (`01 - ...`, `02 - ...`) match the `Plan`, `.m3u LIST`, and `Live Reads` numbering in the popup 1-for-1 (`#57`).

- **5. Step W5 — Playlist Mode Active Playback Visibility, Execution-Order Sorting & Per-Slot Announcement Scoping (`#58` — Phase 4, Step 7d.c)**
  - `a.` Switch **Player** to **Playlist** mode and load a multi-hour show (or a show where the same announcement, such as `:19` or `:39`, occurs more than once during the show) that also has playlist `.mp3` tracks.
  - `b.` **Active Playback Visibility**: Click Play on a playlist `.mp3` track in the `Next` section:
    - Confirm the playlist track card **stays visible** in `Next` with a purple **Playing** highlight and waveform/progress while audio is playing, and moves to `Played/Read` only after the track finishes (`#58`).
  - `c.` **Per-Slot Duplicate Announcement Scoping**: Play (or mark Read) the first occurrence of an announcement that appears twice in the show (e.g., Hour 1 `:19`):
    - Confirm only that first occurrence moves to `Played/Read`, while the second occurrence (Hour 2 `:19`) remains unplayed in `Next` (`#58`).
  - `d.` **Chronological Execution-Order Sorting in `Played/Read`**: Play 1 playlist track, then play/read 1 announcement, then play a 2nd playlist track:
    - Expand/check the `Played/Read` section and confirm the items are sorted in the exact chronological order they were played/read (`Track 1 -> Announcement 1 -> Track 2`) rather than grouping all playlist tracks above announcements (`#58`).

---

## 3. Part B — Full Updated macOS Universal (`-Mac.dmg`) Testing Plan (`v0.20.3` Phases 1–4, Steps 1–7)

*(Run this complete sequence on macOS using `AMP Admin-0.20.3-Mac.dmg`, `AMP Live-0.20.3-Mac.dmg`, and `AMP Studio-0.20.3-Mac.dmg` once Windows `Steps W1–W5` are verified.)*

### Phase 1: Fresh `v0.15.4` Seed & `v0.20.3` Initial Admin Conversion (`#5b`, `#28`, `#44`, `#47`, `#48`, `#50`, `#55`)

- **1. Step 1 — Reset & Seed `Test_Station_Root/` in `v0.15.4` (`Live` or `Studio`)**
  - `a.` Reset `Test_Station_Root/settings/` and `Test_Station_Root/logs/` with fresh copies of your raw `v0.15.4` `announcements.json`, `shows.json`, and `logs.json` (and delete `settings/station_settings.json` if present from a prior test run so you start clean). Keep your active `.mp3` and `.txt` files in `media_announcements/` (including `FanettiFest_Til2026_10_26.txt` and `RWR_Underwriting_Read.txt`).
  - `b.` Launch `v0.15.4`, open **Folders**, point to `Test_Station_Root/`, and confirm the schedule loads.
  - `c.` In `v0.15.4` **Player**, play 1 scheduled `.mp3` announcement and mark 1 `.txt` Live Read as Read so `v0.15.4` writes fresh native entries into `logs.json` (without `_meta`, using `timestamp`, `announcementTime`, `logTimeStamp`).

- **2. Step 2 — Initial Conversion & Admin Settings Verification in `v0.20.3` (`AMP Admin-0.20.3-Mac.dmg`)**
  - `a.` Mount and launch `AMP Admin 0.20.3` on macOS (verifying Universal binary launch `#44` and `About AMP -> Version 0.20.3`) and click **Folders**:
    - Verify the **"For Administrators ONLY / Enter Admin Mode"** modal warning gate appears right inside **Folders** (`#47`).
    - Click **Enter Admin Mode**: confirm **Folders** unlocks, displays the inline **First-Run Setup: Admin Contact Info** banner if no Admin Contact has been saved yet, and keeps Admin Mode unlocked for the rest of the session (`#47`).
    - Point **Folders** to `Test_Station_Root/` and click **Save and Close**.
  - `b.` Confirm `v0.20.3` opens in normal writable mode (no `"Read-Only Mode"` lockout banner).
  - `c.` Open **Folders -> Help -> Station Settings**:
    - Confirm all station settings are immediately editable without having to visit **Calendar** first (`#47`).
    - Verify the **Admin Contact Info** input placeholder reads `"e.g., Admin 1 — admin@station.org / (555) 000-0000"` (no `"Kate"` `#50`), save your Admin Contact Info, and click the footer `?` icon to verify the Admin Contact popover (`#15`).
    - Click **Edit Schedule Window...**, verify **Show Lookaround (`hh:mm`)** is an `hh:mm` setting (e.g., set `-10m grace / +10m early · 01:30 show lookaround` `#48`, `#54`), click **Apply & Save Schedule Window**, and set **Up Next Promo** (`Enabled`, `20` mins before `#12`).
  - `d.` Click **Calendar**:
    - Confirm **Calendar** opens directly without re-prompting for Admin Mode (`#47`).
    - Check today and yesterday on the Calendar grid: verify the slots played in `v0.15.4` (Step 1c) and prior historical logs appear as **Played** (green) with **0** false Missed flags (`#5b`).
  - `e.` Switch to **Calendar -> Announcements**: confirm `RWR_Underwriting_Read` (which had `approximateReadTime: null` in `v0.15.4`) automatically populated its `~0mXXs` (~150 WPM) read-time estimate (`#28` / `#5b`).
  - `f.` Switch to **Calendar -> Shows**, click **Check Folders**, and confirm `media_announcements`, `media_evergreens`, and `media_shows` validate cleanly (`C.8c`).

---

### Phase 2: Verify `v0.15.4` Coexistence & Station Settings / Schedule Window Survival (`#36`, `#49`, `#54`)

- **3. Step 3 — Reload `v0.15.4` & Confirm All `v0.20.3` Station Settings (Including Schedule Window) Survive `v0.15.4` Backup Rewrites**
  - `a.` In `v0.20.3 Admin`, make a small edit to an existing announcement (e.g., tweak a note) and click **Save** so `v0.20.3` writes `_meta`, `data[0]._stationMeta`, and `settings/station_settings.json`.
  - `b.` In `v0.15.4` (`Live` or `Studio`), click **Sync** (or relaunch `v0.15.4`, which runs `POST /api/trigger-backup` and strips top-level `_meta` from `shows.json` and `announcements.json`).
  - `c.` Verify `v0.15.4` **Player** and **Log** tabs load all announcements, shows, and prior logs cleanly with no errors or missing audio files (`#36` flat `TimeGatedMp3` sibling bridge).
  - `d.` **Verify `#49` & `#54` Fixes**: Back in `v0.20.3 Admin`, click **Sync** (or relaunch `v0.20.3 Admin`) and open **Folders -> Help -> Station Settings**: confirm your saved **Admin Contact Info**, **Up Next Promo**, **Live Schedule Window (`-Xm / +Ym · hh:mm`)**, and **Station Timezone** were **all** preserved intact after `v0.15.4` ran (`#49`, `#54`).

---

### Phase 3: `v0.20.3` Gate Validation, Multi-Item Rotation, Local `File Date`, Local `CopyEditorModal`, & Gate Lifecycle (`#25`, `#31`, `#51`, `#52`, `#56`)

- **4. Step 4 — Incomplete Gate Warning, Local `File Date` Column, Multi-Select Rotation, Reordering, & Local `CopyEditorModal` (`SPLIT`)**
  - `a.` In `v0.20.3 Admin` (`Calendar -> Announcements`), edit an active announcement (e.g., `FanettiFest_Til2026_10_26` or `RWR_Underwriting_Read`) and click **+ Add Announcement** (new time gate) -> **Proceed Without File** (`B.6b`).
  - `b.` **Verify `#51` Fix**: With that new gate having no file / blank Start date, click **Save** on the announcement:
    - Confirm the **Incomplete Gate Data** warning modal pops up listing the active/upcoming issues (ignoring any already-passed historical gates) and offering both **Save Anyway** and **Return to Editor to Fix** (`#51`).
    - Click **Return to Editor to Fix**.
  - `c.` **Verify `#56` & `#9` / `#24` (`MediaPickerModal`)**: On that gate, open `MediaPickerModal`:
    - Confirm the **File Date** column populates with actual file modification dates (`MM/DD/YYYY`) in Local mode (`#56`).
    - Verify column sorters (`Name`, `Type`, `File Date`, `Last Used`), `All / Audio / LiveRead` radio filters, `Unused First` checkbox, and `+ UPLOAD FILE` (`#9`, `#24`, `#56`).
    - Check **3 files** (e.g., 1 `.mp3` and 2 `.txt` scripts), verify the `1, 2, 3` selection order badges, and click **Use Selected (3)** to seed all 3 into `mediaItems` (`B.6a`).
  - `d.` **Verify `#31 / A.2a` (Reorder + Picker)**: Use the up/down arrows to swap rows `2` and `3`, then immediately click **Choose / Browse** on the moved row and pick a file — confirm only that exact row updates its filename and duration.
  - `e.` **Verify `#52` & `#31 / A.2b` (Local `CopyEditorModal` + `Auto` Read Time + `SPLIT`)**:
    - On one of the `.txt` script rows in the gate (e.g., `FanettiFest_Til2026_10_26.txt`), click **Edit**:
    - Confirm the existing `.txt` script text loads and seeds into `CopyEditorModal` with **no** `"Could not load script..."` error (`#52`).
    - Confirm the **Auto** read-time calculation checkbox is checked (`#52`).
    - Add **Bold** (`**text**`), *Italic* (`*text*`), and __Underline__ (`__text__`), click **SPLIT**, save the new split `.txt` file (confirming **no** `"Google Drive Station folder is not configured..."` error `#52`), and choose **Use New Split File** — verify that exact rotating slot (`itemIndex`) updates (`#31 / A.2b`).
  - `f.` **Verify `#31 / A.2c` (Card List Preview -> Edit -> `SPLIT`)**:
    - Save the announcement (setting a valid Start date on the gate or clicking **Save Anyway** if testing).
    - On the **Active Announcements** card list, use the card's `Preview:` dropdown to select one of the rotating `.txt` scripts, click **Preview -> Edit -> SPLIT -> Use New Split File**, and confirm both the card dropdown and `announcements.json` update that exact slot (`#31 / A.2c`, `#52`).
  - `g.` **Verify `#31.4` & `#36` (Schema Check)**: Inspect `announcements.json`: confirm `mediaItems` objects have no redundant sub-item `id`, and confirm top-level `gate.mp3Url`, `gate.assetType`, and `gate.duration`/`approximateReadTime` mirror `mediaItems[0]`.

- **5. Step 5 — Non-Destructive Gate Inactivation, `Reactivate`, `Reuse`, & Gate-Scoped Scoring (`B.3`, `B.4`, `B.5a`, `B.7`)**
  - `a.` Open an announcement in `v0.20.3 Admin` and click **Inactivate** on an active gate whose `End` date is in the future (or blank). Expand **Past / Inactivated Gates** and verify the `Inactivated` badge appears while the original `End` date value is preserved (`B.3a–b`).
  - `b.` Immediately click **Reactivate** (0 missed slots) and confirm it restores in-place to the active gates list (`B.4a`).
  - `c.` Inactivate a gate whose `Start` is in the past and where at least one scheduled hour has elapsed without a log (or temporarily edit `inactivatedAt` to 2 hours ago), then click **Reactivate** and verify the popup offers **Reactivate With Gaps** vs. **Split to New Gate** (`B.4b`). Choose **Split to New Gate** and confirm the old gate is capped at `inactivatedAt` inside **Past / Inactivated Gates** while a new active gate starts from now (`B.4b.2`).
  - `d.` Click **Reuse** on a gate in **Past / Inactivated Gates** and confirm it appends a new active gate with cloned `mediaItems`, blank `Start`/`End` dates, and `0 plays`, while hovering the `xx plays` / `Protected (xx plays)` badge on the historical gate shows the 4-value tooltip (`Played`, `Missed`, `Future`/`∞`, `Cancelled`, `Total`) (`B.5a`, `B.7a–b`).

---

### Phase 4: Bi-Directional Logging & `v0.20.3` Player Modes (`Live`, `Prerecord + Export`, `Playlist`) (`#55`, `#57`, `#58`)

- **6. Step 6 — Run `v0.15.4` (`Player` & `Log`) Against the `v0.20.3`-Enhanced Schedule**
  - `a.` In `v0.15.4` (`Live` or `Studio`), click **Sync** (or reload).
  - `b.` **Rotating Gate in `v0.15.4`**: Locate the announcement with the 3 rotating items from Step 4. Verify `v0.15.4` displays and plays/reads `Item 1` (`mediaItems[0]`, mirrored via `gate.mp3Url`) cleanly without crashing or showing `"File not found"`.
  - `c.` **Formatted `.txt` Live Read in `v0.15.4`**: Open the formatted `.txt` Live Read created in Step 4e inside `v0.15.4`'s `LiveReadPopout`. Confirm `v0.15.4` opens the `.txt` file cleanly and shows the top `<!-- This is formatted as a .md markdown file... -->` note explaining `**bold**`, `*italic*`, and `__underline__` for the legacy DJ.
  - `d.` **Log Write from `v0.15.4` (Stripping `_meta` on `logs.json`)**: Play 1 `.mp3` and mark 1 Live Read as Read in `v0.15.4`. Inspect `logs.json` to observe that `v0.15.4` saved the new log entry and stripped `_meta` from `logs.json`.

- **7. Step 7 — Verify `v0.20.3` (`AMP Studio-0.20.3-Mac.dmg` / `AMP Live-0.20.3-Mac.dmg`) Absorbs `v0.15.4` Logs, Locks Admin Settings, & Runs All Player Modes**
  - `a.` Launch `AMP Studio 0.20.3` (and `AMP Live 0.20.3`) on macOS, point to `Test_Station_Root/` or click **Sync**, and open **Folders -> Help**:
    - **Verify `#55` Fix**: Confirm **Live Schedule Window (“Now” Window & Show Lookaround)** is locked (`Admin Only`) with **no** `Edit Schedule Window...` button in `AMP Studio` or `AMP Live`.
  - `b.` Confirm `v0.20.3` silently restores `_meta` on `logs.json`, seeds `scheduledFor` and `executedAt` on the entries written by `v0.15.4` in Step 6d, and shows those slots as **Played** in both **Player** (`Past` section) and **Calendar** (`#5b`).
  - `c.` **Live Mode (`Past / Now / Future` + `hh:mm` Show Lookaround + `Up Next` + 2Hz Step Blink)**:
    - Verify the Three-Zone `Past / Now / Future` timeline, show transition spacers (respecting your `hh:mm` Show Lookaround `#48`), `(1/3)` rotating item labels, and auto-seeded `"Up Next: [Show Name]"` promo card (`20m` before show start) (`#12`, `#13`, `C.8a–b`).
    - Open **Performance Overrides** (footer lightning icon), toggle **Disable Animations** + **Urgency 2Hz Step Blink**, and verify the due card blinks cleanly (`#17`).
    - Play 1 announcement in `v0.20.3`, then click **Sync** in `v0.15.4` and confirm `v0.15.4` **Player** and **Log** immediately see the `v0.20.3` play as logged (`#5b`).
  - `d.` **Prerecord + Merged Export Mode (`#7`, `#21`, `#29`, `#57`)**:
    - Switch `v0.20.3` **Player** to **Prerecord**, verify the ~10-card show selector collapse and `OPEN PRERECORD` button (`#7`), load a show, and confirm `Up Next` promos appear once per show (`#29`, `C.8b`).
    - Click the blue **Export** button in the Prerecord header to open the `Export Show` popup:
      - **Verify `#57` Fix**: Confirm `Plan`, `.m3u LIST`, and `Live Reads` all display the exact same `01..NN` numbering and filenames (excluding any cancelled tracks), confirm `Live Reads` loads both `.txt` scripts and the `Up Next` promo script, and click **Export Files...** to confirm the `Up Next` promo exports as `Found & Copied` with **0 missing files** (`#21`, `#57`).
  - `e.` **Playlist Mode (`C.8a`, `#58`)**:
    - Switch to **Playlist** mode and load a multi-hour show folder with playlist tracks and repeated hourly announcements:
      - **Verify `#58` Fix 1**: Click Play on a playlist track and confirm the card remains visible in `Next` with a purple **Playing** highlight until playback finishes.
      - **Verify `#58` Fix 2**: Play/read the first occurrence of an announcement that repeats later in the show and confirm the second occurrence stays unplayed in `Next`.
      - **Verify `#58` Fix 3**: Play a mix of playlist tracks and announcements and confirm `Played/Read` sorts them in exact chronological order played/read.
