# AMP `v0.20.5` -> `v0.20.6` Remaining Delta Verification Plan & Session Handoff

> **Status**:
> - **Round 1: macOS on Intel (`AMP Admin / Studio / Live-0.20.5-Mac.dmg` — Tests 1–15)** has been **completed**. All tests passed except the exceptions and roadmap items logged as **`#76`–`#89`** in `dev/docs/ROADMAP_AND_BACKLOG.md`.
> - **Current Decision (11/11/2026)**: Pause before **Round 2: Windows (`Tests 16–17`)** to work through the macOS Round 1 issues first and iterate the app version to **`v0.20.6`**.

---

## Session Handoff: macOS Round 1 Triage & `v0.20.6` Starting Execution Plan

### Part 1: Summary of Open Items (Test-Failing Bugs & `Live` / `Studio` Impact)

#### Category 1: Actual Test-Failing Bugs from macOS Round 1
- **1. `#88` (`Test 15.c` — Exported `.txt` Overlapping Markdown Stripping)**
  - `a.` **Failure**: `stripFormattingMarkers()` in `src/lib/liveReadTextUtils.ts` uses single-pass non-overlapping regexes (`[^*\n]+`), leaving stray `*` and `**` characters behind when scripts contain overlapping or adjacent Bold/Italic/Underline spans (`*...*__*...*____***...***`).
  - `b.` **Impact**: Affects `.txt` files exported in **Prerecord -> Export -> Export Files...**, plain-text clipboard copies on the **Live Reads** tab, and plain word-count calculations.
- **2. `#84` (`Test 8.b` / `C.8.b` — Shows Manager `Short Name` Validation)**
  - `a.` **Failure**: When `Show Name` and `Show Host` are filled in, deleting `Short Name (For Filenames)` and clicking **Save Changes** silently auto-generates a short name from `Show Name` instead of triggering the inline required-field validation error.
- **3. `#86` (`Test 7.c` — Media-Row `Inactivate` Button on Played Media Rows)**
  - `a.` **Failure**: Clicking **Inactivate** on a single played media item (`> 0 plays`) inside a gate calls the gate-level inactivation handler, inactivating the entire gate and all of its media items instead of moving only that media item to a per-gate `Past / Inactivated Media` section.
- **4. `#87` (`Test 12.b` — `Select Announcement` Copied `.txt` Highlight & Repeat Copy Naming Collision)**
  - `a.` **Failure 1**: Returning to `Select Announcement` after copying a `.txt` file in `CopyEditorModal` does not pass the new filename back to `MediaPickerModal`'s `recentlyUploadedName` state, so the new row is not highlighted (`New`).
  - `b.` **Failure 2**: Clicking **Copy** a second time on the same source file suggests `"Copy of  <stem>"` without checking `existingFileNames`, colliding with the first copy on **Save** instead of suggesting `"Copy of <stem> (2)"`.

#### Category 2: Open Items Affecting `AMP Live` or `AMP Studio`
- **5. `#76` (Startup Opening Logo / Branded Splash Screen)**
  - `a.` **Affects**: `AMP Live`, `AMP Studio`, and `AMP Admin`.
  - `b.` Replaces the multiple temporary startup/verification flashes with a single branded splash view (large edition icon, version `v0.20.6`, and `AMP = Announcement Media Player`) until startup checks complete.
- **6. `#88` (`Test 15.c` — Prerecord Export `.txt` & Plain-Text Copy Stripping)**
  - `a.` **Affects**: `AMP Studio` (and `AMP Admin`) in `Prerecord -> Export`.
- **7. `#77` (`Test 3.b–3.d` & `11.b` — Station WPM Setting, `Est:` Layout, & Auto Read-Time Recalculation)**
  - `a.` **Affects**: `AMP Live` and `AMP Studio` card durations (`3.d`), plus `AMP Admin` settings (`3.b`) and `CopyEditorModal` (`3.c` / `11.b`).
  - `b.` Persisting whether a Live Read's duration is `Auto` vs. manual so changing the station WPM updates all auto-calculated read times directly updates the durations shown on Live Read cards in `Live` and `Studio`.

---

### Part 2: Batch 1 Execution Status (`v0.20.6` Version Bump + `#88` & Same-Context Live Read Items `#77`, `#87`, `#89`) — ✅ COMPLETED

Because **`#88`** (test-failing bug + `AMP Studio` impact), **`#77`** (`3.b–3.d` / `11.b`), **`#87`** (`12.b`), and **`#89`** (`15.d`) all live in the **Live Read / `CopyEditorModal` / WPM calculation pipeline** (`src/lib/liveReadTextUtils.ts`, `src/lib/compatibility.ts`, `src/components/CopyEditorModal.tsx`, `src/components/LocalHelpModal.tsx`, `src/components/MediaPickerModal.tsx`, and `src/components/CalendarTab.tsx`), they were completed together in **Batch 1**:

#### Core Scoped Changes (Batch 1 — ✅ Completed)
- **1. [x] Bump Application Version to `v0.20.6`**
  - `a.` Updated version strings from `0.20.5` to `0.20.6` across `package.json`, `package-lock.json`, `electron-main.cjs`, `src/lib/compatibility.ts` (`CURRENT_APP_VERSION`), `CHANGELOG.md`, and `dev/docs/ARCHIVED_VERSIONS_SCHEMA_AUDIT.md`, and verified with `node scripts/verify-version.cjs`.
- **2. [x] `#88` (`Test 15.c`) — Complete Stripping of Overlapping & Interleaved Markdown in `.txt` Exports & Plain Text**
  - `a.` Updated `stripFormattingMarkers()` in `src/lib/liveReadTextUtils.ts` and `estimateWpmReadTimeFromText()` in `src/lib/compatibility.ts` to iteratively strip nested/overlapping `***`, `**`, `__`, and formatting `*` markers and remove leftover `*+` or `_{2,}` formatting runs.
  - `b.` Verified the vehicle-donation test string produces clean plain text with zero leftover `*` or `_` characters in both exported `.txt` files and plain-text clipboard copies.
- **3. [x] `#77` (`3.b`, `3.c` / `11.b`, & `3.d`) — WPM Input Typing, `Est:` Box Layout, & Auto-Calculated Read-Time Persistence/Recalculation**
  - `a.` **WPM Input (`3.b`)**: In `LocalHelpModal.tsx`, updated the `Words Per Minute (50–300 WPM)` input to hold raw text while typing (`draftLiveReadWpmText`) and apply the `50–300` clamp only on `onBlur` and **Save Live Read WPM**.
  - `b.` **`Est:` Box Layout (`3.c` / `11.b`)**: In `CopyEditorModal.tsx`, kept **Approx. Read Time** and `xx words` on the top label row, narrowed the `0m10s` time input box to fit its content (`w-24`), and moved the `Est: ~0m10s` badge to the right of the **Auto** checkbox so it is **always visible** whether **Auto** is checked or unchecked.
  - `c.` **Persist `Auto` Read-Time Flag & Recalculate on WPM Change (`3.d`)**:
    - Added `isAutoReadTime?: boolean` on `TimeGatedMediaItem` and `TimeGatedMp3` (defaulting to `true` when `Auto` is checked in `CopyEditorModal`, or `false` when manually overridden).
    - Updated `migrateAnnouncementsPayload`, `POST /api/shows`, `writeDriveShows`, and `useScheduleManager.ts` so saving a new **Live Read Calculation Speed (WPM)** in `LocalHelpModal.tsx` automatically recalculates `approximateReadTime` across all script media items where `isAutoReadTime !== false` (or where the stored time matches the previous WPM auto-estimate) and persists the updated schedule.
- **4. [x] `#87` (`12.b`) — `Select Announcement` Copied `.txt` Highlight & Sequential `"Copy of ... (2)"` Naming**
  - `a.` In `CopyEditorModal.tsx`, fixed the double space in `"Copy of ..."` and checked `existingFileNames` when seeding a copy name so if `"Copy of <stem>.txt"` already exists, it automatically suggests `"Copy of <stem> (2)"`, `"Copy of <stem> (3)"`, etc.
  - `b.` In `CalendarTab.tsx` and `MediaPickerModal.tsx`, passed the newly saved copy filename back to `MediaPickerModal` (`highlightedFileName`) so the new row is highlighted with the `New` badge and scrolled into view whether `Unused First` is checked or unchecked.

#### Related / Edge-of-Scope Suggestion (Batch 1 — ✅ Completed)
- **5. [x] `#89` (`15.d` — Future Roadmap Item in `CopyEditorModal.tsx`) — New Live Read Default Filename Focus & Unedited Name Confirmation**
  - `a.` When creating a new Live Read from scratch (`!isEditingExisting && !sourceFileToCopy`) where the filename is pre-filled from the announcement name, `CopyEditorModal` now auto-focuses/selects the filename input on open, shows a `"Default name"` badge next to the label until edited, and prompts for inline confirmation on **Save** if the default name was not changed.

#### Subsequent Batches for Remaining macOS Round 1 Items (`v0.20.6`)
- **Batch 2 (✅ Completed)**: `#76` — Startup Opening Logo / Branded Splash Screen (`AMP Live`, `AMP Studio`, `AMP Admin`) with large edition icon, `v0.20.6` badge, `AMP = Announcement Media Player` description, unified startup/fetch/silent-audio-cache gate, pre-server Electron dark splash window, and `500ms` minimum hold.
- **Batch 3 (✅ Completed)**: `#84` & `#85` — Shows Manager `Short Name` required validation + `Check Folders` grouped `"Notice Extra folder(s) found"` formatting, `Folders` and `Open in Finder / Explorer` buttons, and stranded folder merge option.
- **Batch 4 (✅ Completed)**: `#86` + `#79`, `#80`, `#81`, `#82` — Per-media-row inactivation (`Past / Inactivated Media` section in gates) + unified `Use Selected (N)` flow in `Select Announcement`, open-ended gate End-date presets (`+1 Week`, `+1 Month`, `Announcement End`, `Custom`) + `Announcement Window` banner, consolidated gate header warnings & sequential gate validation, and `"No file selected — add file to rotate (optional)"` row.

---

## Round 1: macOS on Intel (`AMP Admin / Studio / Live-0.20.5-Mac.dmg`) — Completed Pass Reference

### A. Startup, Storage Folders, Cache & Admin Settings (`#61`–`#64`, `#75`)

- **1. `#61`–`#63` — Clean Launch, `Folders -> Save and Close` Validation, Cache-Poisoning Prevention, & Cloud Drive Hydration Catch-Up**
  - `a.` Launch `AMP Admin-Mac.dmg` (and `Studio` / `Live`), confirm the embedded Express server binds cleanly without a white screen, open **Folders**, point to `Test_Station_Root/` (whether set to *"Available Offline"* or streamed on demand from Google Drive for Desktop), and click **Save and Close**.
  - `b.` Confirm `Save and Close` immediately loads the schedule into the player with **no** false `"Connection Warning"` or contradictory `"Storage Folders Required: AMP Station Location and 5-Folder structure verified successfully."` error (`#61`, `#63`).
  - `c.` If any Google Drive files are hydrating on demand, confirm the non-blocking **Cloud Drive Syncing Files** banner (`Recheck Sync`) appears while preserving existing metadata instead of falling back to blank/default metadata (`#62`).
  - `d.` Open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**, click **Reset (Keep Folders)**, and confirm the app purges its Chromium runtime cache and reloads cleanly with `Test_Station_Root/` still connected (`#61`).

- **2. `#64` — Buried Diagnostic Console Button (`AMP Admin` Only vs. Hidden in `Live` & `Studio`)**
  - `a.` In `AMP Admin-Mac.dmg`, open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**: confirm the discrete **Open Diagnostic Console** button is present at the bottom of Section 6 and opens the Chromium Developer Tools window when clicked.
  - `b.` In `AMP Studio-Mac.dmg` and `AMP Live-Mac.dmg`, open **Folders -> Help -> Section 6**: confirm the **Open Diagnostic Console** button is hidden (`Admin Only`).

- **3. `#75` — Editable `Live Read Calculation Speed (WPM)` Station Setting in `_meta` & `Folders -> Help -> Section 6`**
  - `a.` In `AMP Live-Mac.dmg` or `AMP Studio-Mac.dmg`, open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**: confirm the **Live Read Calculation Speed (WPM)** card displays `150 WPM` and is locked (`Read-Only in Live / Non-Admin mode`).
  - `b.` In `AMP Admin-Mac.dmg`, open **Folders -> Help -> Section 6**, click **Edit Live Read WPM...**, change the value from `150` to `120` WPM (2 words/sec), and click **Save Live Read WPM**.
  - `c.` Open `CopyEditorModal` (`Create / Edit Live Read`) on a `.txt` script (for example, a 60-word script):
    - Confirm the automatic **Approx. Read Time** now calculates at `120 WPM` (`0m30s` at 120 WPM vs. `0m25s` at 150 WPM).
    - Hover over the **Auto** checkbox and the `Est: ~0mXXs` badge (when `Auto` is unchecked) and confirm the tooltip reads `120 wpm` / `Calculated approximate read time at 120 words per minute`.
  - `d.` Return to **Folders -> Help -> Section 6**, restore **Live Read Calculation Speed (WPM)** back to `150` WPM, and click **Save Live Read WPM** (`#75`).

---

### B. `Calendar -> Announcements` & Gate Editor Fixes (`#42`, `#53`, `#68`, `#71`)

- **4. `#42` — Preserving Prior Scheduled Calendar History When Removing Days in Weekly Announcement Grid**
  - `a.` In `Calendar -> Weekly Calendar`, locate an active announcement that has scheduled slots on a past day (earlier today or earlier this week/last week).
  - `b.` Click that announcement to open the **Announcement Editor**, uncheck/remove that day column in the **Weekly Announcement** grid, and click **Save**.
  - `c.` Return to `Calendar -> Weekly Calendar` and inspect the past date vs. future dates: confirm the **prior** scheduled occurrences on the removed day are still shown on the Calendar (and past played logs remain matched rather than orphaned as `EXTRA`), while **future** occurrences on that removed day are no longer scheduled (`#42`).

- **5. `#68` (`Note E`) — Open-Ended Gate End-Date Prompt & No False `"Before #1 File"` Leading Gap**
  - `a.` Open an announcement in the **Announcement Editor** whose current active gate (`Gate #1`) has a blank/open-ended **End** date, and click **+ Add Announcement** -> select any file.
  - `b.` In the **Schedule Placement Options** popup, confirm there is **no** false `"Before #1 File"` gap option when `Gate #1` started today or in the past.
  - `c.` Confirm the `After #1 <File> (Open-Ended)` option prompts **"When should Gate #1 (<File>) end?"** (with a **Suggest +1 Week** helper button and editable Date/Time inputs) and keeps **Place** disabled until an End date for `Gate #1` is chosen.
  - `d.` Enter an End date/time for `Gate #1` (or click **Suggest +1 Week**) and confirm the new gate's **Start** date/time automatically populates to 1 minute later; click **Place** and confirm `Gate #1`'s End date and `Gate #2`'s Start date are contiguous with no gap (`#68`).

- **6. `#71` (`Note H`) — Gate Editor Past-Date Deferral Until Save, Read-Only `Past / Inactivated Gates`, & `Reuse` Placement Modal**
  - `a.` In the **Announcement Editor**, change an active gate's **End** date to a date in the past: confirm the gate stays in the **Active Gates** section while editing and displays the amber badge/banner *"End date (...) is in the past — this gate will move to Past / Inactivated Gates when saved"* instead of immediately dropping to the bottom mid-edit.
  - `b.` Click **Save**, reopen the announcement, and expand **Past / Inactivated Gates**: confirm the gate is now in `Past / Inactivated Gates` with a `Past (Locked)` badge, and confirm its `Start`/`End` date inputs and media rows are read-only (only **Preview**, **Reuse**, and **Reactivate** / **Delete** when eligible are clickable).
  - `c.` Click **Reuse** on a gate in `Past / Inactivated Gates`: confirm the **Schedule Placement Options** popup opens and prefills the `Start` and `End` dates using the same gap/trailing logic as **+ Add Announcement** (`#71`).

- **7. `#53` — Gate & Media-Row `Delete` vs. `Inactivate` Rules and Confirmation Prompts**
  - `a.` On an active gate with `0 plays`, confirm both **Inactivate** and **Delete** buttons appear in the gate header (whereas gates with `> 0 plays` show only **Inactivate**).
  - `b.` On a gate with only 1 media item (`0 plays`), click the media row's **Delete** button: confirm an *"Are you sure?"* confirmation dialog appears, and confirming clears the media file slot (`No file selected (Required)`) while keeping the gate itself intact.
  - `c.` On a media row that has `> 0 plays`, confirm the media row shows **Inactivate** instead of **Delete**.
  - `d.` Click the gate-level **Delete** button on a `0 plays` gate: confirm an *"Are you sure you want to delete Gate #N?"* confirmation dialog appears before the gate is removed (`#53`).

---

### C. `Calendar -> Shows` Validation & Folder Verification (`#66`, `#67`)

- **8. `#66` (`Notes B & D`) — Shows Manager (`Calendar -> Shows`) Required-Field Validation on `Save Changes` & In-App `Delete Show?` Modal**
  - `a.` In `Calendar -> Shows`, click **+ Add Show** (or **Edit** an existing show), clear **Show Name**, **Short Name**, or **Show Host** (or set **Duration of Show** to `0 Hours 0 Mins`), and click **Save Changes**: confirm the red inline **Missing or Invalid Show Information** banner appears at the top of the form and highlights the invalid fields instead of saving or showing a browser alert.
  - `b.` Edit any affected field (or click **Reset**): confirm the inline validation banner clears automatically, and supplying valid values allows **Save Changes** to succeed.
  - `c.` On an existing show in the editor, click **Delete Show**: confirm the in-app **Delete Show?** confirmation modal appears (instead of a browser `confirm()` dialog) and **Cancel** keeps the show intact (`#66`).

- **9. `#67` (`Note C`) — `Check Folders` (`Calendar -> Shows`) Created-Folder & Extra-Folder Reporting**
  - `a.` In Finder on macOS, rename one show's subfolder inside `media_evergreens` or `media_shows` (for example, rename `Show_1` to `Show_1_ExtraTest`), then switch back to AMP `Calendar -> Shows` and click **Check Evergreen & Playlist Folders** (`Check Folders`).
  - `b.` Confirm the **Folder Verification** modal explicitly reports **both**:
    - `[Fixed] Created missing Evergreen folder: <ShortName>` (or `Show Playlist folder`), confirming background focus refresh did not silently recreate it before you clicked **Check Folders**.
    - `[Notice] Extra folder found in media_evergreens (not matched to any show Short Name): <Show_1_ExtraTest>`, alerting you to the unmatched extra folder (`#67`).

---

### D. `Select Announcement` (`MediaPickerModal`) & `CopyEditorModal` Fixes (`#69`, `#70`, `#72`, `#73`)

- **10. `#69` (`Note F`) — Wait-For-Script-Load Gate & Synchronous Editor Seeding on `Edit` / `Copy` in `CopyEditorModal`**
  - `a.` Repeatedly click **Edit** and **Copy** on `.txt` Live Reads in both Announcement Gates (`Calendar -> Announcements -> Edit`) and `Select Announcement` (`10+` times in a row).
  - `b.` Confirm `CopyEditorModal` waits until the script text is retrieved before displaying the editor fields and populates the formatted script text `100%` of the time with zero blank loads (`#69`).

- **11. `#70` (`Note G`) — Persistent Calculated WPM Estimated Read-Time Reference Indicator**
  - `a.` In `CopyEditorModal`, uncheck **Auto** (or type a custom value in **Approx. Read Time** that differs from the calculated WPM time).
  - `b.` Confirm the blue `Est: ~0mXXs` reference indicator appears next to the word count above the **Approx. Read Time** field so the calculated estimate remains visible (`#70`).

- **12. `#73` (`Note J`) — `Select Announcement` (`MediaPickerModal`) `Copy` Live Read Returns to Picker List**
  - `a.` In `Select Announcement`, click **Copy** on a `.txt` Live Read, edit or confirm the new filename in `CopyEditorModal`, and click **Save**.
  - `b.` Confirm `CopyEditorModal` closes and returns to the open **Select Announcement** window showing the newly created `.txt` file (highlighted as `New`) instead of auto-selecting it into the gate and closing the picker (`#73`).

- **13. `#72` (`Note I` / `#59` Follow-Up) — `Select Announcement` (`MediaPickerModal`) Compact Icon Secondary Actions, `48%/7%/13%/14%/18%` Column Fit, & Header Format Tooltip on macOS**
  - `a.` Open **Select Announcement** (`MediaPickerModal`) on macOS and confirm all 5 columns (`Name` at `48%`, `Type` at `7%`, `File Date` at `13%`, `Last Used` at `14%`, and `Actions` at `18%`) fit cleanly with zero horizontal scrolling.
  - `b.` Confirm the `Actions` column renders the labeled **Select** button alongside compact `24x24` icon buttons for **Preview/Stop**, **Copy**, and **Edit** (with hover tooltips), and confirm shrinking the window below `640px` also collapses **Select** to a checkmark icon.
  - `c.` Confirm the header displays `(.mp3, .txt, .pdf, .png, .jpg, and more)` and hovering over it shows the 3-line tooltip (`Audio (6)` / `Scripts / Docs (3)` / `Images (4)`) (`#72`).

---

### E. `Prerecord` & `Export Show` Fixes (`#60`, `#74`)

- **14. `#60` (`Note L`) — Auto-Close `Export Show` Popup When Selecting a New Show in `Prerecord` Mode**
  - `a.` In `AMP Studio-Mac.dmg` (or `AMP Admin-Mac.dmg`), switch **Mode:** to **Prerecord**, load a show, and click **Export** to open the `Export Show` popup.
  - `b.` Leave the `Export Show` popup open, then click **Choose Show** in the Prerecord header (or select a new show) — confirm the `Export Show` popup automatically closes as soon as you open the show selector or switch shows (`#60`).

- **15. `#74` (`Note K`) — `Export Show -> Live Reads` Stylized Preview, Dual Rich/Plain Clipboard Copy, `.txt` + `.rtf` Export, & Clean Stylized Paste in Editor**
  - `a.` In **Prerecord -> Export -> Live Reads**, confirm scripts with markdown formatting render with visual **Bold**, *Italic*, and <u>Underline</u> styling and no `<!-- ... -->` comment header or raw `**`/`*`/`__` symbols.
  - `b.` Click **Copy** on the `Live Reads` tab:
    - Paste into a rich-text editor (TextEdit Rich Text, Word, Google Docs, or AMP's `CopyEditorModal`) and confirm it pastes with **Bold**, *Italic*, and <u>Underline</u> styling preserved.
    - Paste into a plain-text editor (TextEdit Plain Text, Notepad, or a plain text field) and confirm it pastes as clean plain text with no `**`, `*`, or `__` markup.
  - `c.` Click **Export Files...** and inspect the exported folder on disk: confirm every Live Read script is exported as **both** a clean plain-text `.txt` file (with no markdown symbols or HTML comment headers) and a formatted `.rtf` file (which opens in TextEdit / WordPad with Bold, Italic, and Underline), and confirm `.md` is never exported.
  - `d.` Copy stylized rich text (containing Bold, Italic, and/or Underline plus arbitrary fonts/colors) from an external rich editor or web page and paste it into `CopyEditorModal` (`Create / Edit Live Read`): confirm foreign fonts/colors/sizes are stripped while Bold, Italic, and Underline are preserved cleanly (`#74`).

---

## Round 2: Windows (`AMP Admin / Studio / Live-Win.exe`) — Secondary Cross-Platform Pass

Once Round 1 passes on macOS Intel, run this focused Windows pass to confirm OS-specific parity:

- **16. Windows Startup, Firewall Approval & Storage Connection (`#61`–`#64`)**
  - `a.` Launch `AMP Admin-Win.exe` (and `Studio` / `Live`), click **Allow access** on the Windows Defender Firewall prompt if shown, and confirm the UI loads immediately into the window (no white screen) and connects to `Test_Station_Root\`.
  - `b.` Open **Folders -> Help -> Section 6** and confirm **Open Diagnostic Console** appears in `AMP Admin-Win.exe` and is hidden in `AMP Studio-Win.exe` and `AMP Live-Win.exe`.

- **17. Windows File Explorer & Native Clipboard / RTF Parity (`#67`, `#69`, `#72`, `#74`, `#75`)**
  - `a.` **Folder Check (`#67`)**: In Windows File Explorer, rename a show subfolder in `media_evergreens` or `media_shows`, click **Check Folders** in `Calendar -> Shows`, and confirm both `[Fixed] Created missing ...` and `[Notice] Extra folder found ...` are reported.
  - `b.` **`Select Announcement` Fit & `CopyEditorModal` Load (`#69`, `#72`, `#73`)**: Open `Select Announcement`, confirm all 5 columns (`48%/7%/13%/14%/18%`) and compact icon buttons fit with no horizontal scrollbar, and verify `Edit` / `Copy` on `.txt` Live Reads loads `100%` of the time and `Copy -> Save` returns to the picker list.
  - `c.` **Windows Clipboard & `.txt` + `.rtf` Export (`#74`)**: In **Prerecord -> Export -> Live Reads**, test **Copy** into WordPad/Word (rich text) vs. Notepad (plain text), click **Export Files...** to verify both `.txt` and `.rtf` files open cleanly on Windows, and test pasting stylized rich text into `CopyEditorModal`.
  - `d.` **Shared Station WPM Persistence (`#75`)**: Confirm the `Live Read Calculation Speed (WPM)` value saved in `_meta.scheduleWindow` on macOS is automatically read on Windows in **Folders -> Help -> Section 6** and `CopyEditorModal`.
