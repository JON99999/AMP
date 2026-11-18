# AMP `v0.20.7` Delta Testing Plan: Round 1 Windows & Round 2 macOS

> **Version Under Test**: **`v0.20.7`**
> - **Scope**: Focused delta verification of all changes introduced in **`v0.20.7` (`Batches 1–4`)**:
>   - **Batch 1**: `#90`, `#93`, `#103`, `#37.1`–`#37.6` (6-second splash hold, Light/Dark slate contrast fixes, `Calendar` header/list refinements).
>   - **Batch 2**: `#92`, `#94`–`#98`, `#106`–`#108`, `#112`, `#38.8`–`#38.11` (Announcement Editor, inline gate/interstitial placement, 2-month gate calendar picker, media rotation rows, Backup MP3 collapse & preview fix, `(x/y)` Admin-only badges, and grouped `Issues Audit`).
>   - **Batch 3**: `#91`, `#102`, `#104`, `#105`, `#26` (`CopyEditorModal` read-time coercion/validation, unsaved/overwrite prompts, `<stem> (x)` copy naming, `Select Announcement` icon/date/action column layout, and `Calendar -> Files` (`File Manager`) sub-tab with `archived` / `deleted_in_AMP_OK_to_purge` subfolders).
>   - **Batch 4**: `#99`, `#100`, `#101`, `#37.7`, `#38.12` (`Calendar -> Shows` `Short Name` `Auto` checkbox, tooltips, and `Check Folders` / `Merge Stranded Folder` 2-column listbox redesign + Windows Cloud Drive fallback).
> - **Previously Verified in `v0.20.6` (`[SKIP]`)**: All items that already passed in `v0.20.6` and were untouched in `v0.20.7` (such as Group W-E `Prerecord` / `Export Show` `#60`, `#74`, `#88`, WPM station settings `#75`/`#77`, and diagnostic console `#64`) are marked `[SKIP]`.

---

## Round 1: Primary Windows Delta Test Plan (`AMP Admin / Studio / Live-0.20.7-Win.exe`)

### Group W-A: 6-Second Splash Screen Hold, Light/Dark Theme Contrast, & `Calendar` Header / List View (`#90`, `#93`, `#103`, `#37.1`–`#37.6`)

- **1. `[TEST ON WIN]` `#90` — 6-Second Branded Opening Splash Screen Hold**
  - `a.` Launch `AMP Admin-0.20.7-Win.exe` (or `Reset (Keep Folders)`):
    - `i.` Confirm the dark-slate (`#0F172A`) **Opening Splash Screen** (`v0.20.7`) remains visible for at least **`6 seconds`** (`6000ms`), hiding intermediate startup/caching flashes before revealing the main workspace.

- **2. `[TEST ONCE — 100% OS-Agnostic]` `#93`, `#103`, & `#37.1`–`#37.6` — Light Mode Contrast, `Calendar` Header / Filter Bar, & `Announcements` List View**
  - `a.` Switch AMP to **Light Mode** (sun icon in footer) and open **`Calendar -> Announcements`**:
    - `i.` Confirm the **`Show All`** filter button (renamed from `"All"`) and active filter buttons use high-contrast blue (`bg-blue-600 text-white`) with legible text in both Light and Dark modes (`#93`).
    - `ii.` Narrow the window width and confirm the **`+ Add`** button collapses cleanly to **`+`** before colliding with filter controls (`#93`).
    - `iii.` Confirm each announcement card in the list shows its concise schedule summary, gate/media summary, and single-line action buttons (`#37.1`–`#37.6`).

---

### Group W-B: Announcement Editor, Inline Gate Placement, 2-Month Calendar Picker, Media Rotation Rows, `(x/y)` Badges, & `Issues Audit` (`#92`, `#94`–`#98`, `#106`–`#108`, `#112`, `#38.8`–`#38.11`)

- **3. `[TEST ONCE — 100% OS-Agnostic]` `#94`, `#96`, `#107`, & `#38.8`–`#38.11` — Decoupled Announcement vs. Gate End Dates, Single-Line Gate `Start`/`End` Header, & Full-Gate Border**
  - `a.` Open an announcement in the **Announcement Editor**:
    - `i.` Confirm each **`Gate #x`** block (header, warnings, active media rows, and inactivated drawer) is wrapped in a solid **`border-2`** frame (`#96`).
    - `ii.` Confirm the Gate Header **`Start`** and **`End`** inputs sit on a single horizontal line matching the Full Announcement `Start` / `End` bar (`#107`).
    - `iii.` Edit or clear `Gate #1`'s **End** date and confirm the Full Announcement's **End** date is **not** automatically blanked or overwritten (and vice versa), and confirm the quick-fill button reads **`Set End`** (`#94`).

- **4. `[TEST ONCE — 100% OS-Agnostic]` `#95` & `#108` — Inline Gate Creation (`+ Add New Gate`), Inline Interstitial Gap/Overlap/Overreach Rows, & Interactive 2-Month Gate Calendar Picker**
  - `a.` **Inline Blank Gate Creation (`#108`)**:
    - `i.` Click **`+ Add New Gate`** at the bottom of `Announcement Gates`: confirm a blank `Gate #N` card is inserted immediately inline (no `Schedule Placement Options` modal pops up).
  - `b.` **Inline Interstitial Gap / Overlap / Overreach Resolution Rows (`#94`, `#108`)**:
    - `i.` Create a time gap between `Gate #1` End and `Gate #2` Start: confirm an inline **Schedule Gap** row appears directly between `Gate #1` and `Gate #2` with 1-click **`Extend Prior Gate`**, **`Pull Back Next Gate`**, and **`Create New Gate in Gap`** buttons, plus **`Set to prior`** / **`Extend to next`** mini buttons on the gate header (`#94`, `#108`).
    - `ii.` Create a date overlap between `Gate #1` and `Gate #2`: confirm an inline **Gate Overlap** row appears between them with **`Trim Prior Gate`** and **`Push Next Gate`** buttons (`#108`).
  - `c.` **Interactive 2-Month Gate Calendar Picker (`CalendarDateInput` — `#108`)**:
    - `i.` Click any `Start` or `End` date input on the Full Announcement or a `Gate #x` row to open the 2-month calendar popover:
      - Confirm existing gates render as color-coded horizontal bars across the calendar days (`Gate #1`, `Gate #2`), open-ended gates show a forward arrow (`->`), contiguous split days show a vertical split marker (`|`), and Full Announcement `Start` / `End` boundaries show `[>` and `<]` markers.
      - Select a new date on the calendar grid and click **`OK`** (or click **`Clear`** on an `End` date to make it open-ended) and confirm the date updates cleanly.

- **5. `[TEST ONCE — 100% OS-Agnostic]` `#92`, `#97`, `#98`, & `#107` — Gate Media Rotation Rows, `(m:ss)` Durations, `0 plays` Alignment, Multi-Select Required Row, Backup MP3 3-Stage Collapse & Preview Fix, & Simple Last-Media Warning**
  - `a.` **Media Row Formatting & Alignment (`#92`, `#97`, `#107`)**:
    - `i.` On populated `.mp3` and `.txt` gate media rows, confirm both display duration in parentheses **`(m:ss)`** as plain non-blob text immediately before the play-count badge, confirm **`0 plays`** is always shown on unplayed populated rows, confirm `.txt` rows show the icon-only pencil **`<Edit3 />`** button to the left of duration/plays, and confirm **`Delete`** (`0 plays`) and **`Inactivate`** (`> 0 plays`) have matching widths so `Preview` and `Choose`/`Replace` align vertically (`#92`, `#107`).
    - `ii.` Narrow the editor width below `500px` and confirm the icon-only **`Delete`** trash button narrows to a compact square icon button (`#107`).
    - `iii.` On a gate with at least 1 media item, confirm the bottom optional row reads **`"Add another file to the rotation."`** (`#97`).
    - `iv.` On an empty **`"No file selected (Required)"`** row, confirm no dummy duration or play count is shown, and click **`Choose`** to verify you can check and attach **multiple** files at once (`#97`).
  - `b.` **Backup MP3 3-Stage Collapse & `LiveReadPopout -> CopyEditorModal` Preview Fix (`#107`)**:
    - `i.` On a `.txt` Live Read row that has a **Backup MP3** attached, gradually narrow the window: confirm the Backup pill collapses in 3 stages (first hiding the word `"Backup:"`, then hiding the backup filename to leave the 4 icons `Speaker, Play, Folder, Trash`) **before** the primary `.txt` Live Read filename truncates (`#107`).
    - `ii.` From the **Announcement Editor**, click **`Preview`** on that `.txt` row to open `LiveReadPopout`, then click **`Edit`** to open `CopyEditorModal`: confirm the **Alternative Backup Audio (`.mp3`)** section inside `CopyEditorModal` finds and plays the attached backup `.mp3` cleanly (no false `"not found"` error) (`#107`).
  - `c.` **Simple Last-Active-Media Inactivation Warning (`#98`)**:
    - `i.` On a gate with 1 active played media row (`> 0 plays`), click **`Inactivate`**: confirm the item inactivates immediately and shows a simple **`OK`** dialog reading **`"Warning - Gate #x has no active media."`** (`#98`).

- **6. `[TEST ONCE — 100% OS-Agnostic]` `#112` — `(x/y)` Gate Rotation Badges Restricted to Admin Views Only**
  - `a.` Create or inspect an announcement gate that has 2 or more rotating media files (`1/2`, `2/2`):
    - `i.` **Admin Views (`Calendar -> Weekly Calendar`, `Calendar -> Announcements`, & `Issues Audit`)**: Confirm the `(1/2)` / `(2/2)` rotation indicator **is** displayed for administrators.
    - `ii.` **Casual / DJ Views (`Player -> Live`, `Player -> Prerecord`, `Export Show`, & `Player -> Playlist`)**: Confirm `(1/2)` / `(2/2)` is **not** displayed on DJ timeline cards or export previews.

- **7. `[TEST ONCE — 100% OS-Agnostic]` `#106` — `Issues Audit` (`ScheduleAuditModal`) Excludes Inactivated/Deleted Items & Groups Repeated Violations by Summary Phrase**
  - `a.` In `Calendar`, click the **`Issues`** (`Schedule Audit`) button:
    - `i.` Confirm inactivated gates, inactivated media items, and deleted announcements do **not** trigger false `"dual media collision"` or overlap warnings on current/future dates (`#106`).
    - `ii.` Confirm repeated occurrences of the same schedule violation across multiple dates are grouped into a **single summary phrase row** showing an incident count badge, a date-range summary badge, and a collapsible **`Show dates` / `Hide dates`** drawer (`#106`).

---

### Group W-C: `CopyEditorModal` (`.txt` Live Read Editor) & `Select Announcement` (`MediaPickerModal`) (`#91`, `#102`, `#104`, `#105`)

- **8. `[TEST ONCE — 100% OS-Agnostic]` `#91` & `#102` — `CopyEditorModal` Custom Read-Time Coercion/Validation (`XmYYs`), Unsaved-Changes Prompt, & Single Overwrite Prompt**
  - `a.` Open **`CopyEditorModal`** (`+ Create Live Read` or `Edit` on a `.txt` file) and uncheck **`Auto`** on **Approx. Read Time**:
    - `i.` Type `45` and blur (or press Enter): confirm it formats to **`0m45s`**.
    - `ii.` Type `4:14` and blur: confirm it formats to **`4m14s`** (single-digit minutes not zero-padded).
    - `iii.` Type `10:50` and blur: confirm it formats to **`10m50s`**.
    - `iv.` Type `3` (under 5 seconds) and blur: confirm it clamps to **`0m05s`** with an inline minimum-duration notice (`#91`).
    - `v.` Type `abc` and blur: confirm an inline validation message appears and reverts to the last valid read time (`#91`).
  - `b.` **Unsaved-Changes Confirmation & Single Overwrite Prompt (`#102`)**:
    - `i.` Make an edit to the script text or filename in `CopyEditorModal` and click **`Cancel`** or **`X`**: confirm an in-app **`Unsaved Changes`** modal appears (`Discard Changes` vs. `Keep Editing`) (`#102`).
    - `ii.` Change the **File Name** to match an existing `.txt` file and click **`Save`**: confirm only **one** single overwrite confirmation prompt appears (never two back-to-back prompts) (`#102`).

- **9. `[TEST ON WIN]` `#103`, `#104`, & `#105` — `Select Announcement` (`MediaPickerModal`) `<stem> (x)` Copy Naming, Icon-Between-Checkbox-and-Name Column Layout, Vertical Header Alignment, `m/d/yy` Narrow Dates, & Grouped `Actions`**
  - `a.` Open **`Select Announcement`** (`MediaPickerModal`) in **Light Mode** and **Dark Mode**:
    - `i.` Confirm the table header bar has legible contrast in both themes (`#103`).
    - `ii.` Confirm each row's file-type icon (speaker / document) sits **between the checkbox and the filename**, and confirm the top table header bar has a **vertical separator** between the icon-only Type sort button and **`Name`** (`#105`).
    - `iii.` Open **`Select Announcement`** from an existing populated gate row (`Replace` / `Choose` where **`Current`** and **`Context`** rows are displayed at the top): confirm the right-hand **`File Date`**, **`Last Used`**, and **`Actions`** columns in the `Current` / `Context` block stay vertically aligned with the file list columns below (`#105`).
    - `iv.` Narrow the modal / window width (`< 640px`) and confirm dates compact to **`m/d/yy`** (`#105`).
    - `v.` In the **`Actions`** column, confirm **`Preview`** sits on the left of a subtle vertical divider and **`Copy` + `Edit`** are grouped together on the right (`#105`).
  - `b.` **Drop `"Copy of"` Prefix & Increment `<stem> (x)` (`#104`)**:
    - `i.` Click the **`Copy`** icon on `File1.txt`: confirm the pre-filled name in `CopyEditorModal` is **`File1 (2)`** (no `"Copy of "` prefix), and click **`Save`**.
    - `ii.` Click the **`Copy`** icon on `File1 (2).txt`: confirm the pre-filled name increments to **`File1 (3)`** (`#104`).
  - `c.` **`Calendar -> Files` (`File Manager`) Sub-Tab, 5 Lifecycle Sections, `archived` / `deleted_in_AMP_OK_to_purge` Moves, & Announcement Jump/Return (`#26`)**:
    - `i.` In **`Calendar`**, click the **`Files`** sub-tab next to `Calendar`, `Announcements`, and `Shows` to open **`File Manager`**:
      - Confirm the 5 collapsible sections appear in lifecycle order: **`Never Used`**, **`Current`**, **`Past / Ended`** (expanded by default) and **`Archived`**, **`Deleted`** (collapsed by default), each with a right-aligned **`<FolderOpen />`** button on the opposite side of its collapsible header bar.
      - Confirm **`Current`** rows have disabled checkboxes and no `Archive`/`Delete` buttons, while files attached only to past/ended or inactivated gates of a long-running announcement appear under **`Past / Ended`**.
    - `ii.` **Announcement Attachment Jump & Return Focus (`#26`)**:
      - On any row referenced by an announcement (`Current` or `Past / Ended`), click the **Go to Announcement** (`ExternalLink`) button: confirm single-announcement files open the **Announcement Editor** directly (and multi-announcement files show a small dialog listing each announcement as its own button), and confirm clicking **`Cancel`** or **`Save`** in the Announcement Editor returns to **`Calendar -> Files`**, refreshes the list, and scrolls/highlights the file row you jumped from.
    - `iii.` **Single & Bulk Move Across `Active`, `Archived`, and `Deleted` (`#26`)**:
      - Archive a file from `Never Used` or `Past / Ended` (and/or multi-select files across non-`Current` sections and use the bottom **`Move to Active`**, **`Archive Selected`**, and **`Delete Selected`** bulk buttons): confirm **`Delete`** prompts with a heavy **`"Move to Deleted Folder?"`** confirmation modal, confirm files physically move into `media_announcements/archived/` and `media_announcements/deleted_in_AMP_OK_to_purge/`, confirm archived/deleted files do **not** appear in the regular **`Select Announcement`** (`Choose` / `Replace`) modal, and confirm clicking **`Copy`** on an `Archived` or `Deleted` file creates `<stem> (2)` directly in root `media_announcements/` (`Never Used`).

---

### Group W-D: `Calendar -> Shows` (`Short Name` `Auto` Checkbox) & `Check Folders` / `Merge Stranded Folder` Redesign (`#99`, `#100`, `#101`, `#37.7`, `#38.12`)

- **10. `[TEST ONCE — 100% OS-Agnostic]` `#99`, `#37.7`, & `#38.12` — `Calendar -> Shows` `Short Name` `Auto` Checkbox, `?` Hover Tooltips, 2-Column Toggles, & Single-Line `Show Caution` / `Show Gap` Banner**
  - `a.` In **`Calendar -> Shows`**, click **`+ Add Show`**:
    - `i.` Confirm **`Short Name (for filenames)`** has an **`Auto`** checkbox on the right of its label row (checked by default) and the input is grayed out while `Auto` is checked (`#99`).
    - `ii.` Type a **Show Name** (e.g., `Morning Show 1`) and confirm `Short Name` auto-populates (`Morning_Show_1`) in real time (`#99`).
    - `iii.` Uncheck **`Auto`**, type a custom `Short Name`, and save; then click **`Edit`** on that show and confirm `Auto` initializes **unchecked** when the saved `Short Name` differs from the auto-derived name (`#99`).
    - `iv.` Re-check **`Auto`** and confirm `Short Name` immediately snaps back to the auto-generated value from `Show Name` (`#99`).
  - `b.` **Tooltips, 2-Column Status Row, & Single-Line Gap Banner (`#38.12`, `#37.7`)**:
    - `i.` Confirm helper descriptions on `Short Name`, `Show Broadcast Status`, and `Include in "Up Next" Promo Cards` are tucked into **`?`** (`HelpCircle`) hover tooltips, and confirm `Show Broadcast Status` and `Include in "Up Next" Promo Cards` sit side-by-side on a 2-column row (`#38.12`).
    - `ii.` Glance at any `Show Gap:` or `Show Caution:` row between shows in the list and confirm it renders as a clean single-line, non-italic banner (`#37.7`).

- **11. `[MUST TEST ON WIN — Windows Explorer & Google Drive for Desktop / Local Folder Merge]` `#100` & `#101` — `Check Folders` (`Folder Verification`) Return-From-`Folders` Flow, Collapsible Log, `Shows`/`Evergreens` Radio & Icon Buttons, 5-Row Side-by-Side Merge Listboxes, `Recheck`, & Windows Cloud Drive Folder Removal**
  - `a.` Create a stranded test folder (e.g., `Show_1_Stranded` containing a test `.mp3`) inside `media_evergreens` (or `media_shows`) on your Windows station root (especially if mounted via **Google Drive for Desktop**).
  - `b.` In **`Calendar -> Shows`**, click **`Check Folders`** to open the **Folder Verification** modal:
    - `i.` **Return to `Folder Verification` After `Folders` (`#100`)**: Click the **`Folders`** button inside the modal to open `LocationsModal`, then close (or `Save and Close`) `LocationsModal` — confirm you are returned directly to the **Folder Verification** modal (and that it auto-rechecks if you saved folder changes).
    - `ii.` **Collapsible `Verification Log` (`#101`)**: Confirm the **`Verification Log`** is collapsed by default when `Merge Stranded Folder` is present (and can be expanded/collapsed by clicking its header).
    - `iii.` **`Shows` / `Evergreens` Target Radio & Quick `<FolderOpen />` Icon Buttons (`#101`)**:
      - Confirm the **`Merge Stranded Folder`** header bar displays the **`Shows`** and **`Evergreens`** radio buttons on the right, each paired with an icon-only **`<FolderOpen />`** button (`Open Shows folder` / `Open Evergreens folder` in Windows File Explorer).
      - Toggle between **`Evergreens`** and **`Shows`** and confirm the left-hand **Stranded Folder (Source)** list remains unchanged while the right-hand **Target Folder (Destination)** list switches between Evergreen folders (`media_evergreens/...`) and Show Playlist folders (`media_shows/...`).
    - `iv.` **Side-by-Side 5-Row Scrollboxes & Closest Prefix Match (`#101`)**:
      - Confirm the Source and Target lists sit side-by-side as ~5-row scrollable listboxes separated by an **`<ArrowRight />`** icon.
      - Click a stranded folder on the left (e.g., `media_evergreens/Show_1_Stranded`) and confirm the right-hand Target list automatically selects and scrolls to the closest matching folder (`media_evergreens/Show_1`).
    - `v.` **Merge Execution & Windows Cloud Drive Folder Removal (`#101`)**:
      - Click **`Merge Folder`**, verify the full-width confirmation prompt shows the **`Cancel`** and **`Confirm Merge`** buttons stacked cleanly below the prompt text, and click **`Confirm Merge`**.
      - Confirm the files move into the target folder and the stranded source folder is completely deleted on Windows (even on a Google Drive for Desktop mount) with no `EPERM`/`EBUSY` failure.
    - `vi.` **Footer When No Stranded Folders Remain (`#101`)**:
      - Once all stranded folders are merged and the `Merge Stranded Folder` panel hides, confirm the modal footer still displays the **`Folders`**, **`Open Shows`**, and **`Open Evergreens`** buttons on the left and **`Recheck`** + **`Close`** on the right.

---

### Group W-E: Previously Verified `Prerecord` & `Export Show` (`[SKIP]`)

- **12. `[SKIP — Passed in v0.20.6 Round 1 Windows with Zero Issues]` `#60`, `#74`, `#88` — `Prerecord` & `Export Show`**

---

## Round 2: Streamlined Backup macOS Delta Test Plan (`AMP Admin / Studio / Live-0.20.7-Mac.dmg`)

Because all OS-agnostic `v0.20.7` UI/editor changes (`Tests 2–10`) are verified in Round 1 on Windows, **Round 2 on macOS only needs to verify the 2 macOS-specific window/Finder/filesystem items (`M1` & `M2`)**:

- **M1. `[MUST TEST ON MAC — Electron macOS Window/Splash Lifecycle]` `#76` & `#90` — 6-Second Branded Opening Splash Screen on macOS**
  - `a.` Launch `AMP Admin-0.20.7-Mac.dmg` (and `Studio` / `Live`):
    - `i.` Confirm the dark `#0F172A` splash screen (`80x80` icon, `v0.20.7`, `AMP = Announcement Media Player`) holds for at least **`6 seconds`** until startup folder verification, schedule load, and initial audio pre-caching complete cleanly.

- **M2. `[MUST TEST ON MAC — Finder & APFS/Cloud Folder Merge]` `#100` & `#101` — macOS `Check Folders` (`Folder Verification`), `<FolderOpen />` Finder Buttons, & `Merge Stranded Folder`**
  - `a.` Create a stranded subfolder inside `media_evergreens` or `media_shows` on macOS and click **`Check Folders`** in `Calendar -> Shows`:
    - `i.` Test the **`Folders`** button round-trip back to `Folder Verification` (`#100`).
    - `ii.` Test the **`<FolderOpen />`** icon buttons next to the **`Shows`** and **`Evergreens`** radio options (and in the footer after merging) to confirm they open the respective folders in **macOS Finder** (`#101`).
    - `iii.` Select the stranded folder in the left 5-row listbox, confirm closest-match target auto-selection in the right 5-row listbox, click **`Merge Folder -> Confirm Merge`**, and confirm the stranded folder merges and deletes cleanly on macOS (`#101`).
