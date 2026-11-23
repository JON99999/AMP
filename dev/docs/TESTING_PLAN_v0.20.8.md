# AMP `v0.20.8` (1.0.0 Beta Candidate) Testing Plan — Windows & macOS

> **Version Under Test**: **`v0.20.8`** (`1.0.0` Beta Candidate)
> **Optimization Strategy**:
> 1. **Narrative-Woven Journeys**: Related checks (layout, resizing, validation, saving, contrast, and logging) are woven into single continuous workflows so each screen is visited once.
> 2. **Platform Split**: **Round 1 (Windows)** covers the `v0.15.4` seed setup, every platform-agnostic feature (`v0.20.7`–`v0.20.8`), mixed-version `v0.15.4` <-> `v0.20.8` coexistence, and Windows-specific file/cloud behavior. **Round 2 (macOS)** runs only the 5 macOS-specific areas that can break on macOS (Universal DMG/splash, native Electron popout window, Finder/APFS folder handling, macOS Chromium cache purge, and APFS atomic backup restore).

---

## Phase 0: Fresh `v0.15.4` Seed Station Setup (Windows — ~5 Minutes)

Build one clean station in **`v0.15.4` Admin** so every announcement name, filename, show, and historical log record matches the narrative steps below.

### 0.1 Create the Station Folder & Drop Sample Files
1. Launch **`AMP Admin v0.15.4`** on Windows and point its **AMP Station Folder** to a brand-new empty folder: `C:\AMP_Beta_Test_Station` (let `v0.15.4` initialize `settings/`, `logs/`, `media_announcements/`, `media_evergreens/`, and `media_shows/`).
2. Place these **5 files** inside `C:\AMP_Beta_Test_Station\media_announcements\`:
   - `Beta_Audio_A.mp3` — any short real `.mp3` (10–30s).
   - `Beta_Audio_B.mp3` — a second distinct `.mp3` (used for rotation and Backup MP3).
   - `Beta_Audio_Unused.mp3` — a third `.mp3` (**never schedule this file**).
   - `Beta_Script_1.txt` — create a plain text file containing ~45–60 words of sample copy (e.g., *"Welcome to Beta Station community radio. This is our sample live read script for version zero point twenty point eight beta testing. Read clearly at a steady pace and confirm the word count read time calculation matches your station words per minute setting."*).
   - `Beta_Script_Past.txt` — create a short plain text file (~20 words, e.g., *"This ended promotional announcement is used to verify historical backfill and File Manager Past / Ended grouping."*).

### 0.2 Create 2 Shows & 1 Stranded Folder in `v0.15.4`
*(Pick hours relative to the current clock so `Beta Show One` is ON AIR right now during testing and `Beta Show Two` starts right after it.)*
1. In **`v0.15.4` Admin -> Calendar -> Shows**, add:
   - **Show 1**: Name = `Beta Show One`, Short Name = `BetaShow1`, Host = `Host One`, Day = **Today**, Start = **current hour (`:00`)**, Duration = `2h 0m`, Active = `Yes`.
   - **Show 2**: Name = `Beta Show Two`, Short Name = `BetaShow2`, Host = `Host Two`, Day = **Today**, Start = **current hour + 2 (`:00`)**, Duration = `2h 0m`, Active = `Yes`.
2. In Windows Explorer:
   - Drop 1–2 test `.mp3` tracks into `media_evergreens\BetaShow1\` and `media_shows\BetaShow1\`.
   - Create one intentionally stranded folder: `media_evergreens\BetaShow1_Old\` and drop 1 test `.mp3` inside it.

### 0.3 Create 3 Announcements in `v0.15.4`
In **`v0.15.4` Admin -> Calendar -> Announcements**, add:
1. **`Beta Hourly Audio`**:
   - Type = `Basic Hourly`, Days = `All`, Hours = `All`, Minute = `:15`.
   - Start Date = **2 days ago**, End Date = *(leave blank)*.
   - Gate #1 = `Beta_Audio_A.mp3` (Start = 2 days ago, End = blank).
2. **`Beta Live Read`**:
   - Type = `Basic Hourly`, Days = `All`, Hours = `All`, Minute = `:30`.
   - Start Date = **2 days ago**, End Date = *(leave blank)*.
   - Gate #1 = `Beta_Script_1.txt`, Backup MP3 = `Beta_Audio_B.mp3`, **leave Approx. Read Time BLANK** *(tests `#28` WPM upgrade backfill)*.
3. **`Beta Ended Promo`**:
   - Type = `Basic Hourly`, Days = `All`, Hours = `All`, Minute = `:45`.
   - Start Date = **5 days ago**, End Date = **yesterday**, **Uncheck `Enabled`** *(disabled ended campaign — tests `0.15.4` historical revision backfill and `Past / Ended` File Manager grouping)*.
   - Gate #1 = `Beta_Script_Past.txt`.

### 0.4 Record 2 Historical Plays in `v0.15.4` & Snapshot a Copy
1. Switch to **`Player` (Live)** in `v0.15.4` (during `Beta Show One`):
   - Play **`Beta Hourly Audio`** (`Beta_Audio_A.mp3`) once so `v0.15.4` logs 1 audio play in `logs\logs.json`.
   - Open **`Beta Live Read`** (`Beta_Script_1.txt`) and mark it read/logged so `v0.15.4` logs 1 script play in `logs\logs.json`.
2. Close **`v0.15.4`** completely.
3. In Windows Explorer, copy the entire folder `C:\AMP_Beta_Test_Station` to `C:\AMP_Beta_Test_Station_Copy` (used later for folder-switch isolation, relocation, and backup recovery testing).

---

## Round 1: Windows End-to-End Beta Narrative (`AMP Admin / Studio / Live-0.20.8-Win.exe`)

### Chapter 1: Upgrade Launch, Splash Hold, Persona, Settings & Light/Dark Contrast
*(Covers `#90`, Persona, `#28` WPM Backfill, `0.15.4` Log Reconciliation, `#110` Global Live Read Font/Size, `#93`, `#103`, Folder-Switch Settings Reload)*

1. **Launch & Splash (`#90`, Persona)**:
   - Install/launch **`AMP Admin-0.20.8-Win.exe`** and point **Folders** to `C:\AMP_Beta_Test_Station`.
   - Confirm the `#0F172A` **Opening Splash Screen** (`v0.20.8`) holds for **`6 seconds`** without flashing intermediate loading screens.
   - When the optional **Computer Logging Persona** prompt opens on first launch, choose `Personal PC`, verify `PC Use Type` pre-selects `Admin Workstation`, enter `Win Beta Tester`, and save.
   - Relaunch once and verify `Win Beta Tester` appears on the opening splash card.
2. **Verify `v0.15.4` Upgrade Integrity (`#28`, Pre-Upgrade Backups & Logs)**:
   - Open `C:\AMP_Beta_Test_Station\settings\backups\` in Windows Explorer: confirm one-time **`shows.backup-pre-upgrade-*.json`**, **`announcements.backup-pre-upgrade-*.json`**, and **`logs.backup-pre-upgrade-*.json`** snapshots were saved before `v0.20.8` first enveloped the `v0.15.4` files.
   - Open **`Log`** and **`Calendar -> Weekly Calendar`**: confirm the 2 plays recorded in `v0.15.4` (`Beta Hourly Audio` and `Beta Live Read`) appear as **Played** (not Missed) in today's `Beta Show One` slot.
   - Navigate **`Weekly Calendar`** back 3 days: confirm `Beta Ended Promo` still appears historically during its active window even though it was disabled in `v0.15.4`.
3. **Station Settings & Global Live Read Font (`#110`)**:
   - Open **`Folders -> Help -> System Maintenance & Reset`**:
     - Confirm your **Computer Logging Persona** is editable here.
     - Set a distinct **Station Timezone** (or note current) and **Admin Contact Info** (`beta-admin@station.org`), and save.
     - Under **Default Live Read Font & Size**, confirm the station default note (`20px · Inter / System Sans`) and 5 built-in font choices.
     - Change font to **`Georgia / Broadcast Serif`** and size to **`24px`**: confirm the modal auto-scrolls so the **Live Read Text Sample** (including `(RAY-dee-oh)`) stays visible as you adjust. Save.
4. **Light Mode Contrast & Header Collapse (`#93`, `#103`, `#37.1`–`#37.6`)**:
   - Switch AMP to **Light Mode** and open **`Calendar -> Announcements`**.
   - Confirm **`Show All`** and active filter pills use crisp blue (`bg-blue-600 text-white`).
   - Drag the window narrower and confirm **`+ Add`** collapses cleanly to **`+`** before colliding with filter pills.
   - Check **`Beta Live Read`**'s summary card: confirm `Beta_Script_1.txt` now has an automatically backfilled `~0mXXs` WPM read time (`#28`).
   - Switch back to Dark Mode (or keep Light Mode — verify both as you go).

---

### Chapter 2: Shows Manager (`Short Name` `Auto`), `Check Folders`, & Windows Stranded Merge
*(Covers `#99`, `#37.7`, `#38.12`, `#100`, `#101`)*

1. **Shows Editor (`#99`, `#37.7`, `#38.12`)**:
   - Open **`Calendar -> Shows`** and click **`+ Add Show`**.
   - Confirm `Short Name` starts with **`Auto`** checked and live-updates as you type `Beta Show Three`.
   - Uncheck **`Auto`**, type `BetaThreeCustom`, fill in `Host Three`, `Duration: 1h 0m`, hover `?` icons to verify helper prose tooltips, confirm `Show Broadcast Status` and `Include in "Up Next" Promo Cards` share one 2-column row, and save.
   - Reopen `Beta Show Three`: confirm `Auto` is unchecked; re-check `Auto` and confirm instant snap-back to `Beta_Show_Three`. Close without saving (or delete `Beta Show Three` via the in-app `Delete Show?` modal).
   - Confirm any `Show Gap:` / `Show Caution:` banner renders single-line non-italic.
2. **`Check Folders` & Stranded Merge (`#100`, `#101`)**:
   - Click **`Check Folders`**:
     - Confirm the modal expands to **`95%`** width, **`Verification Log`** starts collapsed because `BetaShow1_Old` was detected, and each list row shows file counts (`BetaShow1_Old (1 file)`) plus a `<FolderOpen />` button.
     - Click **`Folders`** (bottom-left), close `LocationsModal`, and confirm you return directly to **`Folder Verification`** (`#100`).
     - Click a `<FolderOpen />` button to confirm Windows Explorer opens the exact folder.
     - Toggle the joined **`Shows` (Amber) / `Evergreens` (Emerald)** radio control above `Target Show Folder` and leave on `Evergreens`.
     - Click `BetaShow1_Old` on the left: confirm closest-prefix target `BetaShow1` auto-selects on the right.
     - **Resize check**: Narrow the AMP window until Source stacks above Target and confirm the center merge button switches from **`<ArrowRight />`** to **`<ArrowDown />`**. Widen back.
     - Click **`Merge into Folder...`** -> **`Confirm Merge`**: confirm the `.mp3` moves into `media_evergreens\BetaShow1\` and `BetaShow1_Old` deletes cleanly on Windows with zero `EPERM`/`EBUSY` leftover. Click **`Recheck`**, confirm clean pass, and close.

---

### Chapter 3: Announcement Editor, `CopyEditorModal`, `Select Announcement`, Calendar Guards, Smart Focus & Lineage (`#43/#113`)
*(Covers `#91`, `#92`, `#94`–`#98`, `#102`–`#108`, `#112`, `#38.8`–`#38.11`, `#43/#113`, Future-Gate Fallback Removal)*

#### Part 3A — `Beta Live Read`: Copy Editor, `Select Announcement`, Backup MP3 Collapse, & Stubbed-File Soft Warning
1. Open **`Beta Live Read`** in the **Announcement Editor**:
   - Confirm `Gate #1` has a `border-2` frame and single-line `Start`/`End` header matching the Announcement bar (`#96`, `#107`).
   - Confirm `.txt` row shows `(m:ss)` duration before `1 play`, icon-only `<Edit3 />` pencil left of duration/plays, and aligned action columns (`#92`).
   - **Resize check (`#107`)**: Narrow the editor window slowly and confirm the inline **`Backup MP3`** pill (`Beta_Audio_B.mp3`) collapses through its 3 stages *before* `Beta_Script_1.txt` truncates, and `Delete`/`Inactivate` narrows to icon-only below `500px`. Widen back.
2. **Preview -> Edit Backup MP3 & `CopyEditorModal` (`#91`, `#102`, `#107`, `#110`)**:
   - Click **`Preview`** on `Beta_Script_1.txt`: confirm **`Georgia` `24px`** station default font applies, then click **`Edit`** inside the preview.
   - In `CopyEditorModal`, confirm the editor text uses **`Georgia` `24px`**, play the attached **Backup MP3** (`Beta_Audio_B.mp3`) and confirm zero `"not found"` errors (`#107`).
   - Uncheck **`Auto`** on `Approx. Read Time`: type `45` -> `0m45s`, `4:14` -> `4m14s`, `3` -> clamps to `0m05s` with notice, and `abc` -> inline validation error blocks Save (`#91`). Re-check `Auto`.
   - Edit a word and click **`X` / `Cancel`**: confirm **`Unsaved Changes`** modal appears (`#102`), choose Discard.
3. **`Select Announcement` & `<stem> (x)` Copy Naming (`#103`, `#104`, `#105`)**:
   - On Gate #1's optional `"Add another file to the rotation."` row (`#97`), click **`Choose`**.
   - In `Select Announcement`, verify header contrast (Light & Dark), icon between checkbox and filename with vertical header divider, aligned `Current`/`Context` right-hand columns, segmented `Preview | Copy + Edit` actions, and narrow window (`< 640px`) `m/d/yy` date format (`#105`).
   - Click **`Copy`** on `Beta_Script_1.txt` -> confirm suggested name is **`Beta_Script_1 (2)`** (no `"Copy of "` prefix, `#104`).
   - Try changing filename to `Beta_Script_1` and clicking Save -> confirm a **single** centered overwrite modal appears (`Edit Filename` vs `Overwrite Existing`, `#102`). Click `Edit Filename`, restore `Beta_Script_1 (2)`, and Save.
   - Back in `Select Announcement`, confirm `Beta_Script_1 (2).txt` highlights with `New`. Click **`Copy`** on `Beta_Script_1 (2).txt` -> confirm **`Beta_Script_1 (3)`** (cancel out). Close `Select Announcement`.

#### Part 3B — `Beta Hourly Audio`: Played Locks, Calendar Picker Guards, Smart Auto-Focus, Rotation, Inactivation & Lineage
1. Open **`Beta Hourly Audio`** (Gate #1 already has **`1 play`** from `v0.15.4`!):
   - **Played Locks (`LIN-3`)**: Confirm Gate #1's `Start` date/time is **locked (`disabled`)** and `Delete` is replaced by **`Inactivate`**.
   - **Upfront Calendar Picker Guards (`#43/#113`)**:
     - Open Gate #1's **`End`** calendar (2-month popover showing gate bars & boundaries, `#108`): confirm days *before* today's logged play render muted red with strikethrough and `cursor-not-allowed`.
     - Click an impossible past day: confirm the popover displays the exact played-timestamp reason upfront and keeps **`OK`** disabled. Close popover.
   - **Priority 1a Smart Focus (Open-Ended Prior Gate)**:
     - Click **`+ ADD GATE`** while Gate #1 has no `End` date: confirm the editor inserts Gate #2, scrolls to Gate #1, and automatically opens Gate #1's **`End`** calendar!
     - Set Gate #1's `End` date to **tomorrow at 11:59 PM** -> click **`OK`** (verify Announcement `End` stays decoupled/blank, `#94`).
   - **Stubbed Missing File Soft Warning (`LIN-4`)**:
     - Leave Gate #2's `"No file selected (Required)"` empty (with valid Start = day after tomorrow, End = 7 days out) and click **`Save`**: confirm an amber **soft warning** modal appears with **`"Save Anyway"`** enabled! Click `Cancel` (stay in editor).
   - **Grace Notice for Temporary Overlap + `650ms` Typing Debounce (`#43/#113`)**:
     - On unplayed Gate #2, open its **`Start`** calendar and pick **today** (overlapping Gate #1): confirm a red warning strip appears inside the popover warning save will be blocked until resolved, while **`OK`** stays clickable. Click **`OK`**, confirm inline **Overlap** interstitial bar appears (`#108`).
     - Click **`Save`** while overlapping: confirm **hard block** (no `"Save Anyway"`).
     - Click the time input on Gate #2 and type `"1"` then pause briefly, then `"1:30 PM"`: confirm typed text is **never auto-reverted** and partial typing does not flash errors mid-keystroke (`650ms` debounce).
     - Use the inline interstitial button to push Gate #2 cleanly after Gate #1 (creating a 1-day gap on purpose) -> verify the inline **Gap** bar appears (`Extend Gate #1`, `Set Gate #2 to Prior`, `Add New Gate`).
   - **Multi-Select & Rotation (`#97`, `#112`)**:
     - On Gate #2's `"No file selected (Required)"` row, click **`Choose`**, select **both** `Beta_Audio_A.mp3` and `Beta_Audio_B.mp3`, and click **`Use Selected (2)`**.
     - Confirm Gate #2 lists both tracks with `(m:ss)` and `0 plays`.
   - **Multi-Select `Replace` on Played Track (`LIN-5`) & Last-Media Warning (`#98`)**:
     - On Gate #1's played `Beta_Audio_A.mp3` (`1 play`), click **`Replace`**, select `Beta_Audio_B.mp3`, and apply: confirm played `Beta_Audio_A.mp3` moves into **`Past / Inactivated Media (1)`** (preserving its `1 play` — never deleted!) while `Beta_Audio_B.mp3` becomes active.
     - Click **`Inactivate`** on Gate #1's remaining active track (`Beta_Audio_B.mp3`): confirm immediate inactivation plus the simple `OK` dialog `"Warning - Gate #1 has no active media."` (`#98`). Reactivate `Beta_Audio_B.mp3` in Gate #1 so Gate #1 is playable again.
   - **Active-Only `Reuse` & Smart Focus Priorities**:
     - Click **`Reuse`** on Gate #1 (which now has 1 inactivated track + 1 active track): confirm Gate #3 copies **only** the active track (`Beta_Audio_B.mp3`), NOT the inactivated track (`LIN-5`), and confirm smart focus jumps to the first unresolved date/gap (or scrolls without opening any calendar if all dates are valid & gap-free). Delete Gate #3.
   - **Save & Verify `Issues Audit`, `(x/y)`, Gap Surfacing, & `LIN-6` Revision History**:
     - Leave the 1-day intentional gap between Gate #1 and Gate #2 and click **`Save`** -> confirm **soft warning** (`"Save Anyway"` allowed) and save.
     - Open **`Issues`** (`Schedule Audit`): confirm the intentional gap surfaces clearly (no silent future-gate fallback!), repeated gap slots group into one summary phrase row with collapsible `Show dates` / `Hide dates` (`#106`), and disabled/inactivated items do not create false collisions.
     - In **`Calendar -> Weekly Calendar`**:
       - Jump forward to Gate #2's dates: confirm Admin view displays **`(1/2)`** / **`(2/2)`** rotation badges (`#112`).
       - Jump back to **yesterday**: confirm `Beta Hourly Audio` still shows its prior revision (`Beta_Audio_A.mp3`, `LIN-6`) instead of being overwritten by today's edit.

---

### Chapter 4: `Calendar -> Files` (`File Manager`) Lifecycle & Undo
*(Covers `#26` + `v0.20.8` Refinements)*

1. Open **`Calendar -> Files`**:
   - Confirm 5 collapsible sections (`Never Used`, `Current`, `Past / Ended` expanded; `Archived`, `Deleted` collapsed) each with a right-aligned `<FolderOpen />` button.
   - Confirm `Beta_Audio_Unused.mp3` is in **`Never Used`**, `Beta_Audio_B.mp3` / `Beta_Script_1.txt` are in **`Current`** (checkboxes disabled), and `Beta_Script_Past.txt` is in **`Past / Ended`**.
   - Click **`Announcement (1)`** on `Beta_Script_Past.txt`: confirm it jumps straight to `Beta Ended Promo`'s editor, then click `Cancel` and confirm automatic return to **`Files`**.
   - Select `Beta_Audio_Unused.mp3` and click **`Archive`**:
     - Confirm it moves physically to `media_announcements\archived\`, displays the persistent **`"Moved"`** badge + inline **`<RotateCcw />`** undo button, and keeps that badge even after clicking Preview/Edit on another row.
     - Expand **`Archived`** and click **`Copy`** on `Beta_Audio_Unused.mp3` (or archive `Beta_Script_Past.txt` and click `Copy`): confirm `Copy` writes `<stem> (2)` into **root** `media_announcements\`.
     - Click **`Delete`** on `Beta_Audio_Unused.mp3` -> confirm the heavy `"Move to Deleted Folder?"` dialog -> confirm physical move to `media_announcements\deleted_in_AMP_OK_to_purge\`, verify it does **not** appear in `Select Announcement`, then click the inline **`<RotateCcw />`** undo button to move it back.

---

### Chapter 5: `Calendar -> Msgs` (Off-Air Messages & System Notices), Live/Prerecord/Export Playback & `LIN-1`/`LIN-2` Logging
*(Covers `#78`, `#116`, Z-Index Fix, `#110` Font in LiveReadPopout, `LIN-1`/`LIN-2`, `#112` DJ View)*

1. **Create & Edit Messages (`#78`, `#116`, Z-Index Fix)**:
   - Open **`Calendar -> Msgs`**: confirm **Built-In System Notices** (`Required AMP Upgrade Notice`, `AMP Update Available`) are pinned at the top with Admin contact info (`beta-admin@station.org`) and enable/disable toggles.
   - Click **`+ New Message`**:
     - Confirm title reads **`Admin to Show Message Editor`** (uses `"Show"`, not `"DJ"`).
     - Create Message 1: Title = `Beta Studio Note`, Scope = **`Selected Shows`** (`Beta Show One` AND `Beta Show Two`), Severity = `Alert (!)`, Clear Mode = `Only show once`, Body = `Test off-air note for beta testing.`.
     - Confirm the `"Reminder, this is NOT a private message..."` popup appears on targeting specific shows and on Save (`#116`).
     - Create Message 2: Title = `Beta Launch Notice`, Scope = **`AMP Launch`** (`All Users`), Severity = `Info (i)`, Clear Mode = `Only show once`. Confirm the non-private reminder does **not** nag on an `All Users` / Everybody message.
     - Confirm `Msgs` list shows **`At Launch`** (`MonitorPlay`) vs **`On Show`** (`Speech`) left icons and aligned `Details` / `Read` / `Archive` columns.
   - **Reader -> Edit Z-Index Fix**: From **`Calendar -> Shows`**, open the `"Message for Beta Show One"` reader popup, then click **`Edit`**: confirm `Admin to Show Message Editor` opens cleanly **above** the reader popup. Close both.
2. **Post-Splash Startup Notice + `Player -> Live` Off-Air Notes & Playback**:
   - Relaunch `AMP Admin`: confirm after the 6-second splash closes, **`Beta Launch Notice`** pops directly into the reader modal. Acknowledge it (confirm it clears on next launch).
   - In **`Player -> Live`** (during `Beta Show One`):
     - Confirm **`Beta Studio Note`** (`DO NOT READ ON AIR!`) is pinned in **`NOW`** for `Beta Show One` AND appears beneath **`Beta Show Two`**'s future show banner.
     - Click **`Beta Studio Note`** under future **`Beta Show Two`** -> click **`Mark as Read`**: confirm `"Are you sure? This is for Beta Show Two with Host Two."` prompts (`#116`). Click `Cancel`.
     - Open **`Beta Studio Note`** in **`NOW`** (`Beta Show One`) and click **`Mark as Read`**: confirm it clears from `Beta Show One`'s `NOW` zone, persists the acknowledgement onto `shows.json` (viewed in **`Calendar -> Msgs -> Read / Details`** with **`Win Beta Tester`** persona attribution), and does **not** clutter broadcast **`Log`** (`logs.json`).
   - **Play & Verify `LIN-1`/`LIN-2` + `#110` + `#112`**:
     - Open **`Beta Live Read`** in `Player -> Live`: confirm **`LiveReadPopout`** renders in **`Georgia` `24px`**, zoom up to `30px`, click **`30px`** badge to reset to `24px`, and click **Mark as Read**.
     - Play **`Beta Hourly Audio`** (`Beta_Audio_B.mp3`).
     - Check **`logs\logs.json`**: confirm the new entries record `gateId`, `rotationIndex`, and `rotationTotal` (`LIN-1`), and check `Beta Hourly Audio` editor to confirm Gate #2 (which reuses `Beta_Audio_B.mp3`) still shows **`0 plays`** (`LIN-2`, no stolen plays!).
3. **`Prerecord` & `Export Show` Integration**:
   - Switch to **`Player -> Prerecord`** for **`Beta Show Two`** (which still has unread `Beta Studio Note`):
     - Confirm unread `Beta Studio Note` pins at the top of `Next` and `(x/y)` rotation badges stay hidden on DJ cards (`#112`).
     - Open **`Export Show -> Plan`** and run **`Export Files...`**: confirm `Beta Studio Note` prints at the top of `Plan` and the exported `.txt` summary without altering the `.m3u` playlist or audio files.

---

### Chapter 6: `v0.15.4` <-> `v0.20.8` Mixed-Version Ping-Pong & Folder Relocation
*(Covers Schema Coexistence, Root-Relative Paths, & Cross-Folder Settings Isolation)*

1. **Ping-Pong With `v0.15.4`**:
   - Close `v0.20.8` and open **`AMP Admin v0.15.4`** pointed at `C:\AMP_Beta_Test_Station`.
   - Open **`Log`** in `v0.15.4`: confirm no crash and all broadcast plays (including `v0.20.8` plays) display cleanly.
   - Play 1 announcement in `v0.15.4` `Player` (which writes `logs.json` without `_meta`) and let `v0.15.4` trigger its backup (which strips `_meta` from `announcements.json` and `shows.json`).
   - Close `v0.15.4` and reopen **`AMP Admin v0.20.8`** on `C:\AMP_Beta_Test_Station`:
     - Verify **`Georgia` `24px`**, `beta-admin@station.org`, `Beta Studio Note` (`Msgs`), Gate #1's inactivated `Beta_Audio_A.mp3` + active `Beta_Audio_B.mp3` (**no filename overwrite!**), Gate #2's 2-track rotation, and the new `v0.15.4` play log all survive 100% intact.
2. **Folder Relocation & Settings Reload (`C:\AMP_Beta_Test_Station_Copy`)**:
   - In **`AMP Admin v0.20.8` -> `Folders`**, switch the station folder to **`C:\AMP_Beta_Test_Station_Copy`** (which still has default `Inter` `20px` and empty Admin Contact).
   - Confirm AMP immediately reloads station settings from `Copy` (font reverts to `Inter 20px`, Admin Contact clears, and all audio/scripts resolve strictly inside `Copy` with zero hardcoded paths pointing back to `C:\AMP_Beta_Test_Station`).

---

### Chapter 7: Failure Diagnosis (Connection Lost vs. Malformed/Missing) & Buried Admin-Only Backup Recovery
*(Run on `C:\AMP_Beta_Test_Station_Copy` so your main test folder stays clean!)*

1. **Test A — Lost Connection / Offline Folder**:
   - Close AMP, temporarily rename `C:\AMP_Beta_Test_Station_Copy` to `C:\AMP_Beta_Test_Station_Copy_OFFLINE`, and launch `AMP Admin v0.20.8`.
   - Confirm AMP diagnoses **Connection Lost / Offline Folder** and shows **Connection Refresh Troubleshooting** (`Retry Sync`, `Reset Cache & Reload`, `Configure Storage Folders`) — and **never** suggests restoring a backup.
   - Rename the folder back to `C:\AMP_Beta_Test_Station_Copy` and click **`Retry Sync`** -> confirm clean recovery.
2. **Test B — Malformed File on Non-Admin (`AMP Live` or `AMP Studio`)**:
   - Trigger 1 save in `Copy` (so at least 2 valid backups exist in `settings\backups\`).
   - Corrupt `C:\AMP_Beta_Test_Station_Copy\settings\announcements.json` in Notepad (replace contents with `{ broken json`).
   - Also drop a **newer** intentionally corrupted backup file into `settings\backups\` (e.g., `announcements_2099-01-01_00-00-00_ADMIN.json` containing `{ bad backup`) so we test automatic malformed-backup skipping!
   - Launch **`AMP Live-0.20.8-Win.exe`** (or `AMP Studio`) pointed at `Copy`:
     - Confirm the error screen offers **Retry** ONLY (no **Try a Backup** button, and no Backup Recovery section inside `Folders -> Help`). Close `AMP Live`.
3. **Test C — Malformed File on `AMP Admin` & Buried Backup Recovery**:
   - Launch **`AMP Admin-0.20.8-Win.exe`** pointed at `Copy`:
     - Confirm the recovery prompt asks whether to **Retry**, **Fix Folder**, or **Try a Backup**.
     - Click **`Try a Backup`**:
       - Confirm `Folders -> Help` opens and automatically scrolls all the way to the bottom — **below** `Reset Preferences`, `Full Factory Reset`, and `Advanced Admin Diagnostics` — and launches the **Backup Recovery** check popup for `announcements.json`.
       - Confirm the popup automatically skips the corrupted `announcements_2099-...json` (listing it as skipped with its JSON error) and stops on the first **valid** backup, showing its 12-hour AM/PM timestamp, record count, and file size.
       - Click **`Try Older Backup`** to confirm stepping to an older valid backup, then click **`Use This Backup`** -> confirm `announcements.json` restores atomically and AMP reloads cleanly with all schedules intact!
   - *(Optional Missing-File & Sidecar Sync Check)*: Delete `shows.json` (leaving `settings\backups\shows_*`), refresh `AMP Admin`, confirm **missing file** triggers the same **Fix Folder / Try a Backup** flow, restore a backup, and verify the restored backup's station settings (`Default Live Read Font`, `Admin Contact`, `Msgs`) take effect immediately without stale `station_settings.json` override.

---

## Round 2: Streamlined macOS-Only Verification (`AMP Admin / Studio / Live-0.20.8-Mac.dmg`)

All OS-agnostic logic and UI from Chapters 1–7 are already proven on Windows. On macOS (copy `C:\AMP_Beta_Test_Station` onto your Mac or Google Drive for Desktop), run **only these 5 macOS-specific checks**:

- **M1. Universal DMG, 6-Second Splash, Dock Icon, First-Click Focus & Post-Splash Startup Notice**
  - a. Mount `AMP Admin-0.20.8-Mac.dmg` (and spot-check `AMP Live` / `AMP Studio`), launch, and confirm Universal (`arm64` / `x64`) startup, macOS Dock icon, crisp `#0F172A` **6-second** splash with Persona readout, and direct post-splash launch of an active `At Launch` notice.
  - b. Click a button in AMP while another macOS app has focus: confirm `acceptsFirstMouse` activates cleanly on the first click.

- **M2. Standalone Native macOS `LiveReadPopout` Window, Station Font (`#110`), & Menu Lock**
  - a. With station default font set to `Georgia` `24px`, open `Beta Live Read` into a standalone macOS Electron pop-out window.
  - b. Confirm the native child window renders in `Georgia` `24px`, plays Backup MP3 (`Beta_Audio_B.mp3`) cleanly via `/api/media/stream`, locks main macOS menu actions (`Cmd+W` / nav) while open, and unlocks cleanly when closed.

- **M3. macOS Finder Integration (`<FolderOpen />`), APFS/Cloud Folder Merge (`#100`, `#101`), & File Manager (`#26`)**
  - a. Create a stranded folder `media_evergreens/BetaShow1_MacOld/` with 1 `.mp3`, run **`Check Folders`**: test **`Folders`** round-trip (`#100`), click `<FolderOpen />` buttons to verify **macOS Finder** opens each exact folder, and run **`Merge into Folder... -> Confirm Merge`** (`#101`).
  - b. In **`Calendar -> Files`**, click section-header `<FolderOpen />` buttons to confirm Finder opens `media_announcements/`, `archived/`, and `deleted_in_AMP_OK_to_purge/`, and move 1 file + Undo (`<RotateCcw />`).

- **M4. macOS Chromium Cache Purge & Folder Switch**
  - a. Run **`Keep Folders & Reset Settings`** in `Folders -> Help`, relaunch, and confirm macOS Chromium caches clear cleanly with no stale JSON or white-screen hang (`#61`).
  - b. Switch station folders once in `Folders` and verify station settings (`Default Live Read Font`, `Admin Contact`) immediately update without needing a manual cache reset.

- **M5. macOS APFS Atomic Backup Recovery Smoke Check**
  - a. On a duplicate macOS test folder, corrupt `shows.json`, launch `AMP Admin`, click **`Try a Backup`**, verify auto-scroll to the bottom of `Folders -> Help`, and restore the latest valid backup cleanly.
