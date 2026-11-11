# AMP `v0.20.6` Full Testing Plan: Round 1 Windows & Round 2 macOS

> **Version Under Test**: **`v0.20.6`**
> - **Round 1 (Primary)**: **Windows 10/11 (`AMP Admin / Studio / Live-0.20.6-Win.exe`)** — Tests all items not yet verified on Windows (`#61`–`#64` startup/cache/hydration/console, `#66`–`#75` from `v0.20.5`, and all 12 new `v0.20.6` items `#76`, `#77`, `#79`–`#82`, `#84`–`#89`).
> - **Round 2 (Secondary / Backup)**: **macOS (`AMP Admin / Studio / Live-0.20.6-Mac.dmg`)** — Focused delta re-test of the 12 new `v0.20.6` items (`#76`, `#77`, `#79`–`#82`, `#84`–`#89`) after Windows testing completes (since Tests `1`–`15` for `#42`, `#53`, `#60`–`#75` already passed on macOS in `v0.20.5`).

---

## Round 1: Full Windows Test Plan (`AMP Admin / Studio / Live-0.20.6-Win.exe`)

### Group W-A: Branded Opening Splash Screen, Startup, Folders, Cache & Station WPM (`#61`–`#64`, `#75`, `#76`, `#77`)

- **1. `#76` & `#61`–`#63` — Branded Opening Splash Screen, Windows Launch, Firewall Approval, & `Folders -> Save and Close`**
  - `a.` Launch `AMP Admin-0.20.6-Win.exe` (and `Studio` / `Live`), click **Allow access** if Windows Defender Firewall prompts, and observe startup:
    - Confirm the dark-slate (`#0F172A`) **Opening Splash Screen** appears immediately (showing the `80x80` edition icon, `AMP Admin` / `AMP Studio` / `AMP Live` title, **`v0.20.6`** badge, and **`AMP = Announcement Media Player`** description).
    - Confirm intermediate loading modals (`"Caching Live Audio Assets"`, premature `"Choose Show"` popups, or `"Resource Warning"` flashes) are hidden behind the splash screen until startup verification and initial audio pre-caching finish (with at least a `0.5s` clean hold).
  - `b.` Open **Folders**, point to `Test_Station_Root\` (local or synced via Google Drive for Desktop / OneDrive), and click **Save and Close**:
    - Confirm `Save and Close` loads the schedule immediately with **no** false `"Connection Warning"` or contradictory `"Storage Folders Required"` error (`#61`, `#63`).
    - If cloud files are hydrating on demand, confirm the non-blocking **Cloud Drive Syncing Files** banner (`Recheck Sync`) appears without wiping cached metadata (`#62`).
  - `c.` Open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**, click **Reset (Keep Folders)**, and confirm the app purges its Chromium runtime cache, shows the `v0.20.6` splash screen during reload, and reconnects cleanly (`#61`, `#76`).

- **2. `#64` — Buried Diagnostic Console Button (`AMP Admin` Only vs. Hidden in `Live` & `Studio`)**
  - `a.` In `AMP Admin-0.20.6-Win.exe`, open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**: confirm **Open Diagnostic Console** appears at the bottom of Section 6 and opens Chromium Developer Tools when clicked.
  - `b.` In `AMP Studio-0.20.6-Win.exe` and `AMP Live-0.20.6-Win.exe`, open **Folders -> Help -> Section 6**: confirm **Open Diagnostic Console** is hidden.

- **3. `#75` & `#77` — Station `Live Read Calculation Speed (WPM)` Input, `Est:` Box Layout, & Automatic Read-Time Recalculation**
  - `a.` In `AMP Live-0.20.6-Win.exe` or `AMP Studio-0.20.6-Win.exe`, open **Folders -> Help -> Section 6**: confirm **Live Read Calculation Speed (WPM)** is displayed and locked (`Read-Only in Live / Non-Admin mode`).
  - `b.` In `AMP Admin-0.20.6-Win.exe`, open **Folders -> Help -> Section 6**, click **Edit Live Read WPM...**, select the entire number in the `Words Per Minute (50–300 WPM)` box, and type `120` directly on the keyboard:
    - Confirm you can freely type multi-digit numbers (the first keystroke `1` is not rejected by the `50–300` clamp while typing) (`#77` `3.b`).
    - Click **Save Live Read WPM**.
  - `c.` Open any `.txt` Live Read in `CopyEditorModal` (`Create / Edit Live Read`):
    - Confirm **Approx. Read Time** and `{N} words` stay on the top label row, the `0mXXs` time input box is compactly sized (`w-24`) to its text, and the blue **`Est: ~0mXXs`** badge sits to the right of the **Auto** checkbox (`#77` `3.c`).
    - Toggle **Auto** both checked and unchecked: confirm **`Est: ~0mXXs`** remains visible in **both** states (`#77` `3.c` / `11.b`).
  - `d.` Verify automatic WPM recalculation across scheduled Live Reads (`#77` `3.d`):
    - Confirm Live Read media items that have **Auto** checked automatically updated their `approximateReadTime` across the schedule and Player cards when you saved `120 WPM`, while any Live Read whose duration was manually overridden (`Auto` unchecked) kept its manual duration.
    - Return to **Folders -> Help -> Section 6**, change **Live Read Calculation Speed (WPM)** back to `150`, and click **Save Live Read WPM** — confirm auto-timed scripts recalculate back to `150 WPM`.

---

### Group W-B: `Calendar -> Announcements` & Time-Gate Editor (`#42`, `#53`, `#68`, `#71`, `#80`, `#81`, `#82`, `#86`)

- **4. `#42` — Preserving Prior Scheduled Calendar History When Removing Days in Weekly Announcement Grid**
  - `a.` In `Calendar -> Weekly Calendar`, pick an active announcement that has scheduled slots on a past day earlier this week.
  - `b.` Open the **Announcement Editor**, uncheck that day column in the **Weekly Announcement** grid, and click **Save**.
  - `c.` Return to `Calendar -> Weekly Calendar`: confirm **past** occurrences on the removed day still appear on the Calendar (and past played logs remain matched), while **future** occurrences on that day are removed (`#42`).

- **5. `#68` & `#80` — Open-Ended Gate End-Date Presets (`+1 Week`, `+1 Month`, `Announcement End`, `Custom`), Overall Announcement Window Banner, & `Ann. End` Quick-Fill**
  - `a.` Open an announcement in the **Announcement Editor** whose current active gate (`Gate #1`) has a blank/open-ended **End** date, and confirm the parent Announcement has a `Start` date (and optionally set a parent `End` date to test `Announcement End`).
  - `b.` Next to `Gate #1`'s blank `End` time input in the gate header, confirm the **`Ann. End`** quick-fill button appears whenever the parent Announcement has an `End` date; click it to verify it fills the gate's `End` date, then clear the gate's `End` date back to blank (`#80` Item 6).
  - `c.` Click **+ Add Announcement** inside `Announcement Gates` and select a file (`Use Selected (1)`) to open **Schedule Placement Options** (`PlacementPresetModal`):
    - Confirm the **`Announcement Window`** banner at the top of the modal clearly displays the overall Announcement's `Start` and `End` dates (`#80`).
    - Confirm there is **no** false `"Before #1 File"` leading-gap option when `Gate #1` started today or in the past (`#68`).
    - Under `After #1 <File> (Open-Ended)`, confirm the prompt **"When should Gate #1 (<File>) end?"** displays the 4 preset buttons: **`+1 Week`**, **`+1 Month`**, **`Announcement End`** (enabled when the parent Announcement has an End date), and **`Custom`** (`#80`).
    - Click **`+1 Week`** (or **`+1 Month`**) and confirm `Gate #1`'s End date populates and `Gate #2`'s Start date auto-populates to `1 minute` later; click **Place** and confirm both gates are contiguous with no gap (`#68`, `#80`).

- **6. `#71` & `#81` — Gate Header Warning Consolidation, Sequential Gate Validation, Past-Date Deferral, & `Past / Inactivated Gates` `Reuse`**
  - `a.` In the **Announcement Editor** with two or more sequential gates (`Gate #1` and `Gate #2`):
    - Create a gap between `Gate #1` End and `Gate #2` Start (or set `Gate #2`'s Start/End out of order or outside the parent Announcement window).
    - Confirm **`"Gap detected"`** and all other gate validation errors/warnings appear **directly below each gate's `Start` / `End` header bar** (above the media rows) on **both** `Gate #1` and sequential `Gate #2` (`#81`).
  - `b.` Change an active gate's **End** date to a date in the past: confirm the gate stays in **Active Gates** while editing and shows the amber warning banner directly below the gate header (`#71`, `#81`).
  - `c.` Click **Save**, reopen the announcement, and expand **Past / Inactivated Gates**: confirm the gate is now in `Past / Inactivated Gates` (`Past (Locked)`), read-only except for **Preview**, **Reuse**, and **Reactivate** / **Delete** (when `0 plays`), and confirm clicking **Reuse** opens **Schedule Placement Options** (`#71`).

- **7. `#82`, `#53`, & `#86` — `"No file selected — add file to rotate (optional)"` Row, Gate/Media `Delete` vs. `Inactivate`, & Per-Media-Row `Past / Inactivated Media` Section**
  - `a.` **`"No file selected"` Rotation Row (`#82`)**:
    - Look at the bottom of any active gate that already has at least 1 media file: confirm the old standalone `+ Add File` button is replaced by a full media-style row reading **`"No file selected — add file to rotate (optional)"`** with right-aligned **`+ Create Live Read`** and **`Choose`** buttons.
    - Click **`Choose`** (or **`+ Create Live Read`**) on that optional row and confirm it appends a rotating media file to the gate.
  - `b.` **Unplayed (`0 plays`) Delete Confirmations (`#53`)**:
    - On a `0 plays` media row in a 1-item gate, click **Delete**: confirm the confirmation modal appears and confirming clears the slot to `No file selected (Required)` without deleting the gate.
    - On a `0 plays` gate header, click the gate-level **Delete** button: confirm the *"Delete Gate #N?"* confirmation modal appears.
  - `c.` **Per-Media-Row Inactivation & `Past / Inactivated Media` Section (`#86`)**:
    - Locate (or log a test play on) a gate that has `> 0 plays` on a media row and has 2 rotating media files.
    - Click **Inactivate** on the played media row (`> 0 plays`):
      - Confirm **only that single media row** is inactivated and moves into the collapsible **`Past / Inactivated Media (1)`** subsection at the bottom of that same gate card — the gate itself and the other media row remain active (`#86`).
      - Expand **`Past / Inactivated Media (1)`** inside the gate: confirm the inactivated media row displays **`Protected (N plays)`**, **`Preview`**, and **`Reactivate`**.
      - Click **`Reactivate`** on that media row and confirm it returns to the gate's active media rotation list.
    - Now test inactivating the **last remaining active media file** in an active gate: confirm the **"Inactivate Last Active Media File?"** modal appears offering **`Inactivate Media File Only (Keep Gate Open)`** vs. **`Inactivate Entire Gate`** (`#86`).

---

### Group W-C: `Calendar -> Shows` Validation & Folder Verification / Merge (`#66`, `#67`, `#84`, `#85`)

- **8. `#66` & `#84` — Shows Manager (`Calendar -> Shows`) Required-Field Validation (Including Explicit `Short Name` Check) & In-App `Delete Show?` Modal**
  - `a.` In `Calendar -> Shows`, click **+ Add Show** (or **Edit** an existing show), fill in **Show Name** and **Show Host**, then **delete the text in `Short Name (For Filenames)`** and click **Save Changes**:
    - Confirm the red **Missing or Invalid Show Information** banner appears (`Short Name (For Filenames) is required.`) and highlights the `Short Name` input instead of silently auto-generating a short name (`#84`).
  - `b.` Also test clearing **Show Name**, clearing **Show Host**, or setting **Duration** to `0 Hours 0 Mins` and clicking **Save Changes**: confirm the inline validation banner lists each missing field (`#66`).
  - `c.` Click **Delete Show** on an existing show: confirm the in-app **Delete Show?** confirmation modal appears (`#66`).

- **9. `#67` & `#85` — `Check Folders` Grouped `"Notice Extra folder(s) found"` Formatting, Quick `Folders` / Explorer Buttons, & Stranded Folder Merge**
  - `a.` In Windows File Explorer, inside `Test_Station_Root\media_evergreens` (or `media_shows`), rename a show subfolder (e.g., `Show_1` -> `Show_1_Stranded`) and place a test `.mp3` file inside `Show_1_Stranded`.
  - `b.` In AMP `Calendar -> Shows`, click **Check Evergreen & Playlist Folders** (`Check Folders`) to open the **Folder Verification** modal:
    - Confirm the missing show folder is recreated and reported (`[Fixed] Created missing Evergreen folder: Show_1`) (`#67`).
    - Confirm unmatched extra subfolders are grouped under a single **`[Notice] Notice Extra folder(s) found`** header with compact rows formatted as **`media_evergreens/Show_1_Stranded`** or **`media_shows/<foldername>`** (`#85`).
    - Confirm the footer next to **Close** includes both the **`Folders`** button (opens AMP's Folders modal) and the **`Open in Explorer`** button (opens the station root folder in Windows File Explorer) (`#85`).
    - Confirm the **`Merge Stranded Folder into Show`** section appears inside the modal: select `media_evergreens/Show_1_Stranded`, choose the target show (`Show_1`), and click **Merge Folder** — confirm the files are moved into `Show_1`, the empty stranded folder is removed, and the extra-folder notice clears (`#85`).

---

### Group W-D: `Select Announcement` (`MediaPickerModal`) & `CopyEditorModal` (`#69`, `#72`, `#73`, `#79`, `#87`, `#89`)

- **10. `#69` — Synchronous Script Load Gate in `CopyEditorModal` (`Edit` & `Copy`)**
  - `a.` Repeatedly click **Edit** and **Copy** on `.txt` Live Reads (`5–10` times) from both Announcement Gates and `Select Announcement`: confirm `CopyEditorModal` waits for the script text before rendering the editor and populates `100%` of the time with zero blank loads.

- **11. `#89` — New Live Read (`+ Create Live Read`) Default Filename Focus, `"Default name"` Badge, & Unedited Name Confirmation**
  - `a.` Inside an Announcement in the **Announcement Editor**, click **`+ Create Live Read`** on a gate row to open `CopyEditorModal`:
    - Confirm the keyboard focus is automatically placed inside the **File Name** input with the default announcement name selected, and confirm the amber **`Default name`** badge appears next to the `File Name` label (`#89`).
  - `b.` Type some script text without changing the default filename and click **Save**:
    - Confirm an inline confirmation prompt appears asking you to confirm saving with the unedited default filename (`Confirm & Save` vs. `Edit File Name`) (`#89`).

- **12. `#73` & `#87` — `Select Announcement` Live Read `Copy` Returns to Picker, Highlights `New` With `Unused First`, & Auto-Increments `"Copy of ... (2)"`**
  - `a.` Open **Select Announcement** (`MediaPickerModal`), ensure **`Unused First`** is checked (and also test unchecked), and click the **Copy** icon on a `.txt` Live Read:
    - Confirm the suggested filename is **`Copy of <stem>`** (single space, no double space) (`#87`).
    - Click **Save** and confirm `CopyEditorModal` returns to the open **Select Announcement** window, highlights the newly created `.txt` row with the **`New`** badge, and scrolls it into view (`#73`, `#87`).
  - `b.` Click the **Copy** icon a **second time** on that same original `.txt` file:
    - Confirm `CopyEditorModal` immediately detects that `Copy of <stem>.txt` already exists and pre-fills **`Copy of <stem> (2)`** so clicking **Save** succeeds immediately without a naming collision (`#87`).

- **13. `#72` & `#79` — `Select Announcement` Unified Checkbox + `Use Selected (N)` Flow, Persistent Checked Rows When Filtering, & Column Fit**
  - `a.` Open **Select Announcement** (`MediaPickerModal`) in both single-select mode (e.g., clicking `Choose` on a single media row) and multi-select mode (e.g., clicking `+ Add Announcement`):
    - Confirm all 5 columns (`Name`, `Type`, `File Date`, `Last Used`, and `Actions`) fit cleanly with no horizontal scrollbar, and confirm the header's `(.mp3, .txt, .pdf, .png, .jpg, and more)` text shows the 3-line categorized format tooltip on hover (`#72`).
    - Confirm the per-row `Select` button is **gone** from the `Actions` column (leaving only the compact `Preview/Stop`, `Copy`, and `Edit` icon buttons) (`#79`).
    - Confirm **every** mode uses the left-hand row checkboxes and the bottom-right **`Use Selected (N)`** button, and confirm the footer helper text matches the unified flow (`#79`).
  - `b.` **Persistent Checked Rows When Filtering (`#79`)**:
    - Check one or more files in the list (e.g., an `.mp3` file), then type an unrelated search query into the search box or switch the `Type:` filter to `LiveRead`:
    - Confirm all **checked** files remain visible in the table even when they do not match the current search text or `Type` filter (`#79`).

---

### Group W-E: `Prerecord` & `Export Show` (`#60`, `#74`, `#88`)

- **14. `#60` — Auto-Close `Export Show` Popup When Selecting a New Show in `Prerecord` Mode**
  - `a.` In `AMP Studio-0.20.6-Win.exe` (or `Admin`), switch **Mode:** to **Prerecord**, load a show, and click **Export** to open the `Export Show` popup.
  - `b.` Leave `Export Show` open and click **Choose Show** in the Prerecord header — confirm the `Export Show` popup automatically closes (`#60`).

- **15. `#74` & `#88` — `Export Show -> Live Reads` Stylized Preview, Dual Rich/Plain Copy, Overlapping Markdown Stripping in `.txt` + `.rtf` Export, & Clean Stylized Paste**
  - `a.` Create or edit a Live Read containing the overlapping markdown vehicle-donation test script (`-We wil*l take your car! ... Wate*__*rcr*____***aft! Bu***__***lldozer!***`).
  - `b.` In **Prerecord -> Export -> Live Reads**:
    - Confirm the preview renders visual **Bold**, *Italic*, and <u>Underline</u> with no raw `**`, `*`, or `__` markers (`#74`).
    - Click **Copy** and paste into WordPad / Word (or `CopyEditorModal`) to confirm rich formatting pastes cleanly, then paste into Notepad to confirm plain text pastes with **zero** leftover `*` or `_` characters (`#74`, `#88`).
  - `c.` Click **Export Files...** and inspect the exported folder on Windows:
    - Confirm each Live Read exports as **both** `.txt` and `.rtf` (never `.md`) (`#74`).
    - Open the exported `.txt` file in Notepad and confirm the overlapping markdown line reads cleanly (`-We will take your car! Truck! Motorcycle! ATV! Tractor! RV! Aircraft! Watercraft! Bulldozer!`) with **zero** residual `*` or `_` symbols (`#88`).
  - `d.` Copy stylized rich text from a browser or WordPad and paste into `CopyEditorModal`: confirm foreign fonts/colors are stripped while Bold, Italic, and Underline are preserved (`#74`).

---

## Round 2: Backup macOS Delta Test Plan (`AMP Admin / Studio / Live-0.20.6-Mac.dmg`)

After completing Round 1 on Windows, install `AMP Admin / Studio / Live-0.20.6-Mac.dmg` on macOS and run this focused delta pass covering the 12 new `v0.20.6` items (`#76`, `#77`, `#79`–`#82`, `#84`–`#89`):

- **M1. `#76` — Branded Opening Splash Screen on macOS (`AMP Admin`, `Studio`, `Live`)**
  - `a.` Launch `AMP Admin-0.20.6-Mac.dmg`, `AMP Studio-0.20.6-Mac.dmg`, and `AMP Live-0.20.6-Mac.dmg`: confirm the dark `#0F172A` splash screen (`80x80` icon, `v0.20.6`, `AMP = Announcement Media Player`) holds cleanly until folder verification, initial schedule load, and silent audio pre-caching complete without flashing temporary startup modals.
- **M2. `#77` — macOS WPM Direct Typing (`3.b`), `Est:` Box Right of `Auto` (`3.c`), & Auto Read-Time Recalculation (`3.d`)**
  - `a.` In **Folders -> Help -> Section 6**, verify selecting all and typing `120` in the WPM input works smoothly on macOS, verify `Est: ~0mXXs` sits to the right of `Auto` (always visible) in `CopyEditorModal`, and verify saving WPM recalculates all `Auto` script durations across the schedule.
- **M3. `#80`, `#81`, `#82`, & `#86` — macOS Gate Editor Refinements**
  - `a.` Verify the `Ann. End` quick-fill button on blank gate End dates and the `Announcement Window` banner + 4 End-date presets (`+1 Week`, `+1 Month`, `Announcement End`, `Custom`) in `Schedule Placement Options` (`#80`).
  - `b.` Verify `"Gap detected"` and sequential gate warnings appear directly below the gate `Start`/`End` header on `Gate #1` and `Gate #2+` (`#81`).
  - `c.` Verify the `"No file selected — add file to rotate (optional)"` row replaces `+ Add File` at the bottom of active gates (`#82`).
  - `d.` Verify clicking **Inactivate** on a single played media row moves only that media item into the gate's collapsible `Past / Inactivated Media (N)` section (and prompts when inactivating the last active media item in a gate) (`#86`).
- **M4. `#84` & `#85` — macOS Shows `Short Name` Validation & `Check Folders` Merge / Finder Actions**
  - `a.` In `Calendar -> Shows`, fill `Show Name` and `Show Host`, clear `Short Name (For Filenames)`, and click **Save Changes** — confirm validation fails with the inline error banner (`#84`).
  - `b.` Click **Check Folders** with a stranded subfolder present: confirm grouped `[Notice] Notice Extra folder(s) found` (`media_evergreens/<folder>`), test `Open in Finder` and `Folders`, and test **Merge Stranded Folder into Show** (`#85`).
- **M5. `#79`, `#87`, `#88`, & `#89` — macOS `Select Announcement`, `CopyEditorModal`, & `.txt` Export**
  - `a.` In `Select Announcement`, confirm the per-row `Select` button is removed, row checkboxes + `Use Selected (N)` work in both single- and multi-select modes, and checked rows stay visible when filtering (`#79`).
  - `b.` Copy a `.txt` file twice from `Select Announcement`: confirm the first copy highlights as `New` (even with `Unused First` checked) and the second copy automatically suggests `"Copy of <stem> (2)"` (`#87`).
  - `c.` Click `+ Create Live Read` on a gate: confirm auto-focus on the default filename, the `Default name` badge, and the save confirmation prompt when unedited (`#89`).
  - `d.` In **Prerecord -> Export -> Export Files...**, confirm the overlapping markdown vehicle-donation `.txt` file exports with zero leftover `*` or `_` characters on macOS (`#88`).
