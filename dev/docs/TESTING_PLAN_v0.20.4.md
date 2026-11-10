# AMP `v0.20.4` Remaining Delta Verification Plan (Purged of Passed `v0.20.1`–`v0.20.3` Items)

> **Status**:
> - All prior Windows (`v0.20.1`–`v0.20.3`) and macOS Intel (`v0.20.3`) test phases (`Phases 1–4`, including `#2`, `#5a`, `#5b` coexistence/WPM backfill, `#7`, `#9`, `#12`, `#13`, `#15`, `#17`, `#21`, `#24`, `#25`, `#28`, `#29`, `#31`, `#36`, `#44`, `#46`–`#52`, `#54`–`#58`, and `#65`) have **passed** and been purged from this plan.
> - Only the **untested `v0.20.4` delta items (`#60`, `#61`–`#64`)** and **open roadmap exceptions (`#66`–`#74`, `#42`, `#53`)** remain below.

---

## 1. Ready to Verify in `v0.20.4` (`AMP Admin / Live / Studio-0.20.4-Mac.dmg`)

- **1. `#61`–`#63` — `Folders -> Save and Close` Validation, Cache-Poisoning Prevention, & Cloud Drive Hydration Catch-Up**
  - `a.` Launch `AMP Admin-0.20.4-Mac.dmg` (or `Live` / `Studio`), open **Folders**, point to `Test_Station_Root/` (whether set to *"Available Offline"* or streamed on demand from Google Drive for Desktop), and click **Save and Close**.
  - `b.` Confirm `Save and Close` immediately loads the schedule into the player with **no** false `"Connection Warning"` or contradictory `"Storage Folders Required: AMP Station Location and 5-Folder structure verified successfully."` error (`#61`, `#63`).
  - `c.` If any Google Drive files are hydrating on demand, confirm the non-blocking **Cloud Drive Syncing Files** banner (`Recheck Sync`) appears while preserving existing metadata instead of falling back to blank/default metadata (`#62`).
  - `d.` Open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**, click **Reset App Settings... -> Keep Folders & Reset Settings**, and confirm the app purges its Chromium runtime cache and reloads cleanly with `Test_Station_Root/` still connected (`#61`).

- **2. `#64` — Buried Diagnostic Console Button (`AMP Admin` Only vs. Locked in `Live` & `Studio`)**
  - `a.` In `AMP Admin-0.20.4-Mac.dmg`, open **Folders -> Help -> Section 6 (`System Maintenance & Reset`)**: confirm the discrete **Open Diagnostic Console** button is present at the bottom of Section 6 and opens the Chromium Developer Tools window when clicked.
  - `b.` In `AMP Studio-0.20.4-Mac.dmg` and `AMP Live-0.20.4-Mac.dmg`, open **Folders -> Help -> Section 6**: confirm the **Open Diagnostic Console** button is hidden (`Admin Only`).

- **3. `#60` (`Note L`) — Auto-Close `Export Show` Popup When Selecting a New Show in `Prerecord` Mode**
  - `a.` In `AMP Studio-0.20.4-Mac.dmg` (or `AMP Admin-0.20.4-Mac.dmg`), switch **Mode:** to **Prerecord**, load a show, and click **Export** to open the `Export Show` popup.
  - `b.` Leave the `Export Show` popup open, then click **Choose Show** in the Prerecord header (or select a new show) — confirm the `Export Show` popup automatically closes as soon as you open the show selector or switch shows (`#60`).

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

- **8. `#66` (`Notes B & D`) — Shows Manager (`Calendar -> Shows`) Required-Field Validation on `Save Changes` & In-App `Delete Show?` Modal**
  - `a.` In `Calendar -> Shows`, click **+ Add Show** (or **Edit** an existing show), clear **Show Name**, **Short Name**, or **Show Host** (or set **Duration of Show** to `0 Hours 0 Mins`), and click **Save Changes**: confirm the red inline **Missing or Invalid Show Information** banner appears at the top of the form and highlights the invalid fields instead of saving or showing a browser alert.
  - `b.` Edit any affected field (or click **Reset**): confirm the inline validation banner clears automatically, and supplying valid values allows **Save Changes** to succeed.
  - `c.` On an existing show in the editor, click **Delete Show**: confirm the in-app **Delete Show?** confirmation modal appears (instead of a browser `confirm()` dialog) and **Cancel** keeps the show intact (`#66`).

- **9. `#67` (`Note C`) — `Check Folders` (`Calendar -> Shows`) Created-Folder & Extra-Folder Reporting**
  - `a.` In Finder on macOS, rename one show's subfolder inside `media_evergreens` or `media_shows` (for example, rename `Show_1` to `Show_1_ExtraTest`), then switch back to AMP `Calendar -> Shows` and click **Check Evergreen & Playlist Folders** (`Check Folders`).
  - `b.` Confirm the **Folder Verification** modal explicitly reports **both**:
    - `[Fixed] Created missing Evergreen folder: <ShortName>` (or `Show Playlist folder`), confirming background focus refresh did not silently recreate it before you clicked **Check Folders**.
    - `[Notice] Extra folder found in media_evergreens (not matched to any show Short Name): <Show_1_ExtraTest>`, alerting you to the unmatched extra folder (`#67`).

- **10. `#69` (`Note F`) — Wait-For-Script-Load Gate & Synchronous Editor Seeding on `Edit` / `Copy` in `CopyEditorModal`**
  - `a.` Repeatedly click **Edit** and **Copy** on `.txt` Live Reads in both Announcement Gates (`Calendar -> Announcements -> Edit`) and `Select Announcement` (`10+` times in a row).
  - `b.` Confirm `CopyEditorModal` waits until the script text is retrieved before displaying the editor fields and populates the formatted script text `100%` of the time with zero blank loads (`#69`).

- **11. `#70` (`Note G`) — Persistent Calculated `~150 WPM` Estimated Read-Time Reference Indicator**
  - `a.` In `CopyEditorModal`, uncheck **Auto** (or type a custom value in **Approx. Read Time** that differs from the calculated `150 WPM` time).
  - `b.` Confirm the blue `Est: ~0mXXs` reference indicator appears next to the word count above the **Approx. Read Time** field so the calculated estimate remains visible (`#70`).

- **12. `#73` (`Note J`) — `Select Announcement` (`MediaPickerModal`) `Copy` Live Read Returns to Picker List**
  - `a.` In `Select Announcement`, click **Copy** on a `.txt` Live Read, edit or confirm the new filename in `CopyEditorModal`, and click **Save**.
  - `b.` Confirm `CopyEditorModal` closes and returns to the open **Select Announcement** window showing the newly created `.txt` file (highlighted as `New`) instead of auto-selecting it into the gate and closing the picker (`#73`).

- **13. `#72` (`Note I` / `#59` Follow-Up) — `Select Announcement` (`MediaPickerModal`) Compact Icon Secondary Actions, `48%/7%/13%/14%/18%` Column Fit, & Header Format Tooltip on macOS**
  - `a.` Open **Select Announcement** (`MediaPickerModal`) on macOS and confirm all 5 columns (`Name` at `48%`, `Type` at `7%`, `File Date` at `13%`, `Last Used` at `14%`, and `Actions` at `18%`) fit cleanly with zero horizontal scrolling.
  - `b.` Confirm the `Actions` column renders the labeled **Select** button alongside compact `24x24` icon buttons for **Preview/Stop**, **Copy**, and **Edit** (with hover tooltips), and confirm shrinking the window below `640px` also collapses **Select** to a checkmark icon.
  - `c.` Confirm the header displays `(.mp3, .txt, .pdf, .png, .jpg, and more)` and hovering over it shows the 3-line tooltip (`Audio (6)` / `Scripts / Docs (3)` / `Images (4)`) (`#72`).

- **14. `#74` (`Note K`) — `Export Show -> Live Reads` Stylized Preview, Dual Rich/Plain Clipboard Copy, `.txt` + `.rtf` Export, & Clean Stylized Paste in Editor**
  - `a.` In **Prerecord -> Export -> Live Reads**, confirm scripts with markdown formatting render with visual **Bold**, *Italic*, and <u>Underline</u> styling and no `<!-- ... -->` comment header or raw `**`/`*`/`__` symbols.
  - `b.` Click **Copy** on the `Live Reads` tab:
    - Paste into a rich-text editor (TextEdit Rich Text, Word, Google Docs, or AMP's `CopyEditorModal`) and confirm it pastes with **Bold**, *Italic*, and <u>Underline</u> styling preserved.
    - Paste into a plain-text editor (TextEdit Plain Text, Notepad, or a plain text field) and confirm it pastes as clean plain text with no `**`, `*`, or `__` markup.
  - `c.` Click **Export Files...** and inspect the exported folder on disk: confirm every Live Read script is exported as **both** a clean plain-text `.txt` file (with no markdown symbols or HTML comment headers) and a formatted `.rtf` file (which opens in TextEdit / WordPad with Bold, Italic, and Underline), and confirm `.md` is never exported.
  - `d.` Copy stylized rich text (containing Bold, Italic, and/or Underline plus arbitrary fonts/colors) from an external rich editor or web page and paste it into `CopyEditorModal` (`Create / Edit Live Read`): confirm foreign fonts/colors/sizes are stripped while Bold, Italic, and Underline are preserved cleanly (`#74`).

---

## 2. Open Exceptions & Bug Fixes Queued on Roadmap

*(None — all `#60`–`#74`, `#42`, and `#53` exception items are implemented and ready to verify above.)*
