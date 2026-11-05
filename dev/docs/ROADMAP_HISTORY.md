# AMP Roadmap History (`ROADMAP_HISTORY.md`)

> **Historical Roadmap Archive**:
> - Preserves completed, modified, rejected, or abandoned roadmap items by their permanent `#ID`.
> - **Verbatim Note Permanence**: The user's original verbatim `User Note` must **always** accompany an item across any future changes, revisions, or archiving.
> - Keeps the original `#ID`, title, verbatim `User Note`, and a brief, high-level outcome summary (no extensive or technical notes).
> - Never renumber or reuse any `#ID` recorded in this file.

---

## Completed & Resolved Items

- **#1 — 250px Player Mode Selector: `"Mode:"` Label & Popup Mode Names**
  - **User Note**: *(Origin: Direct interactive chat session prior to batch inbox)* — Add `"Mode:"` label next to the mode selector in the 250px Live view, show mode names inside the popup menu at 250px, and fix diagonal hover hitboxes when unfocused.
  - **Outcome**: Completed — Added the `"Mode:"` label beside the collapsed mode selector, displayed mode names inside the popup menu at 250px, and fixed diagonal hover hitboxes when unfocused.

- **#2 — Copy & Paste in Shows (`Cmd+C` / `Cmd+V` & Right-Click Context Menu)**
  - **User Note**: *"She wasn't able to paste in on the Shows.  Fix Copy/Paste."*
  - **Outcome**: Completed — Enabled standard keyboard copy/paste shortcuts and right-click edit context menus across desktop windows.

- **#3 — Updating Show Name Auto-Updates `nameShort` & Syncs Folder Name**
  - **User Note**: *"Changing name of show doesn't fix short name of folder."*
  - **Outcome**: Completed — Renaming a show now automatically updates its short name (unless manually edited) and syncs the corresponding Evergreen folder.

- **#4 — Exclude Inactive/Deleted/Expired Items & Non-Overlapping Date Ranges from Conflict Detection**
  - **User Note**: *"Announcement Conflict Detected is not needed for conflicts with inactive/deleted shows."*
  - **Outcome**: Completed — Filtered out inactive, deleted, and expired schedules and required overlapping active date ranges before flagging conflicts.

- **#5 — v0.15.4 / v0.15.5 <-> v0.19.0 Coexistence & Dual-Value Sibling Data Bridge**
  - **User Note**: *"18.1 doesn't seem to upgrade the old data as expected.  Properly logged shows show as missed."*
  - **Outcome**: Completed (Part 1; live two-version desktop check tracked under `#5b`) — Added dual-value sibling fields across schedule and log files and local-time slot reconciliation so `v0.15.4/5` and `v0.19.0` can share data without false missed-show counts.

- **#6 — Inflated Missed/Issue Counts on Calendar (Inactive & Past-Run Schedules)**
  - **User Note**: *"On the Calendar page, the counts of missed/issue shows seem to be way over inflated and likely include inactive schedules which just never got end dated.  How do I handle that?  Do we mock an end date when inactivating?  Or force some other way of knowing not to include them, because we'll have inactive ones after the run is done.  Maybe just have a middle category of \"not-current\" vs. willfully inactivated?"*
  - **Outcome**: Completed (Modified per user specification) — Prompted for an editable 12-hour AM/PM end date/time (defaulting to station `now()`) when inactivating an announcement without an end date, and treated inactivation as a forward point-in-time event so prior slots still count as scheduled while future dates are excluded.

- **#7 — Prerecord & Export Show Selector: Differentiate Between Buttons and Headers**
  - **User Note**:
    - *"Fix Interface for choosing show on Prerecord - differentiate between buttons and headers."*
    - *"Limit the height of the interface to showing no more than about 10 cards at once.  Hide the \"Choose Air Date\" Until after the selection of a show..  Once a show is selected.  Hide/collapsethe other shows.   Swap the interface to the \"Choose Air Date\". Change the \"Prerecord\" button text to be \"OPEN PRERECORD\".  Make it look more like a generic button than part of the prerecord interface."*
    - *"Followup to On the \"show selected, now pick the day\", remove the \"Set Manually\" option.  That should go away when the show is picked.  Also, whatever the height of the window is before selecting the show, maintain that after the show selection collapse. Additionally, on the prerecord window, the spacer that says \"Prerecord\".  Change that to say \"ANNOUNCEMENTS\".  Do that the the \"mp3's space on the Export window too."*
  - **Outcome**: Completed — Capped the show selector list to ~10 visible cards, hid `"Choose Air Date"` until a show is selected, collapsed unselected shows on selection while preserving the modal window height and hiding `"Set manually"`, restyled the submit buttons as generic dialog buttons labeled `"OPEN PRERECORD"` and `"OPEN EXPORT"`, and renamed the `Prerecord` and `Export` timeline spacer bars to `"ANNOUNCEMENTS"`.

- **#8 — Create & Edit Live Read Copy Through Admin Interface**
  - **User Note**:
    - *"Allow to create/edit copy through the admin interface."*
    - *"Analyze and propose a solution to #8.  Scope is only.txt files.  But, suggest possibly allowing a different extension type to enable bold, underline, and italic only."*
    - *"i.e. allow all files to be .txt files, but when a .md is stored as .txt, then have a comment at the start which says something like \"This is formatted as a .md markdown file, but is saved as a .txt text file.  Bold is shown by [method]. Italic is shown by [method], and Underline is shown by [method.]\"  Is it also possible to make the text renderer treat .txt files as .md's in general in case someone adds markdown formatting in one of those three ways?"*
  - **Outcome**: Completed — Added an Admin `.txt` Copy Editor modal (accessible from Announcement time-gated slots and `Select File Asset`) with Bold (`**text**`), Italic (`*text*`), and Underline (`__text__`) formatting, automatic explanatory `<!-- ... -->` header comments for external `.txt` viewers (stripped in AMP), universal 3-rule inline `.txt` rendering in `LiveReadPopout`, ~150 WPM read-time calculation, and Local/Google Drive persistence.

- **#9 — Announcement & File Asset Sorting, Usage History ("Last Used"), & Unused Filter**
  - **User Note**:
    - *"Sort files for announcements. Maybe build an upload too. And possibly an 'archive' way to hide 'inactive' ones. Maybe show ones in use."*
    - *"Split the sorting need out of 7 and complete just it.  (Make the other requirements a separate new roadmap item.)  For the sorting, right now, the various views don't seem to be really sorted.  For the Announcements Page, sort Announcements by time on the cloce, and then alphabetically when they share the same time.  For the \"Select File Asset\" underneath the Announcement Editor, Allow them to be sorted alphabetically by default, by type, and by file date.  Allow an AZ/ZA asc/desc sorter using the same look and feel as the Log.  Make a filter for type that is a radio button.  Finally, add a highlight if the file is currently used in a different schedule (whether inactive or note).  Do this as \"last Used\" and value could be \"Never\" or \"Current\" or the last m/d/year the file was actively scheduled for.  Allow the user to pop-up a detail of the history by date ranges and announcement name when it was in use.  Allow the user to check a box that says \"only show unused files\"."*
  - **Outcome**: Completed — Sorted Active and Inactive Announcements by clock minute then alphabetically by name, added `LogTab`-style ascending/descending column sorters (`Name`, `Type`, `File Date`, `Last Used`) and `All / Audio / LiveRead` radio filters in `Select Announcement`, implemented schedule-based `Last Used` badges (`Current`, `M/D/YYYY`, `Never`) with card highlights and a clickable Schedule Usage History modal (including Backup MP3 attribution), and added an `"Unused First"` toggle to surface unused files to the top of the list.

- **#10 — Show Transition Bars Inside the `Now` Section (`Live_Dev > To-Be`)**
  - **User Note**: *"Yes, #1 matches the right behavior. There is a next step there to ensure the bars exist in the 'Now' section when there is a show transition."*
  - **Outcome**: Completed — Partitioned show spacers across `Past`, `Now`, and `Future` using the active `Now` window boundaries, chronologically interleaved and expanded show spacers inside the `Now` section to match `Now` card widths, and dynamically resolved card show-shade bars and Settings boundary labels.

- **#11 — Fix "Playing Still" Cards & Refine "Next" on `Live_Dev > To-Be`**
  - **User Note**: *"Fix the cards for playing still. Refine the 'Next' on to-be."*
  - **Outcome**: Completed — Refined `Playing` card styling and replaced the static `"Next"` badge on upcoming `To-Be` cards with dynamic countdown badges (`in h:mm`) while removing redundant `"Next"` tags inside the `Now` section.

- **#12 — Auto-Seeded "Up Next: [Show Name]" Live Read Promo Cards (Default 20m Before Next Show)**
  - **User Note**:
    - *"Add feature so the live read for each show pops up at the 0:20."*
    - *"19 and 12 are the same item. Here is what I really need for them. There should be a function for a standard card to read the description of each upcoming show that is in the list of shows. It should be an auto-seeded live read. It is a new class and way of inserting the cards. The default time is 20 minutes before the next show. (i.e. typically at 0:40 for shows that start/end on the hour at :00.) It should look and act like a normal card for a live read. It should use whatever is stored for the next show as the copy. It should be logged, and it should show up on the calendar. It should be titled something like "Up Next: [show name]" or "Up Next Promo" in the card and possibly on the calendar as just "Up Next Promo" for all the slots if assembling them all and naming them separate is a pain point. Additionally, these should always be calculated on the fly. If needed, when shows are changed or retired, there needs to be a similar history established so that prior logs make sense. Make the "minutes before" value, and the presence of "Up Next" cards be a setting on the general admin settings section. Also have a checkbox. On by default, for individual shows for if they are included in the "Up Next" cards or not."*
  - **Outcome**: Completed — Implemented on-the-fly virtual `"Up Next: [Show Name]"` Live Read promo cards across `Player > Live`, `Prerecord`, `Export`, `Playlist`, `Calendar`, `Log`, and `Live_Dev` (`Set 5`) with 3-part copy formatting, global enable/minutes-before settings under `Guide > System Maintenance & Reset`, a per-show inclusion checkbox (`true` by default), and `ShowRevision` history preservation.

- **#14 — Consolidate Universal Agent Methodology vs. Application-Specific Directives**
  - **User Note**: *(Origin: Direct architectural prompt)* — Separate universal agent methodology (`AGENTS_GLOBAL.md` synced via GitHub Gist) from project-specific directives (`AGENTS.md` and `ARCHITECTURE_AND_GLOSSARY.md`).
  - **Outcome**: Completed — Separated universal workflow directives (`AGENTS_GLOBAL.md` synced via GitHub Gist) from project-specific rules (`AGENTS.md` and `ARCHITECTURE_AND_GLOSSARY.md`).

- **#15 — Admin Contact Information, `"Get Help"` Card Pop-Up, & Preview Admin Editing**
  - **User Note**:
    - *"C. Did I save a roadmap concept of including admin contact information?  Or did I include that yet in the data structure and Admin window?  We need to add admin contact info.  This should be a first run edit the same way that timezone is.  The meta data should be stored in a way that lets future versions work but does not break older versions.  The scope should only be allowed for editing in Admin Mode.  The Admin warning screen pop-up when clicking \"Calendar\" should include the stored contact information."*
    - *"D. In the context of the interface for \"file not found\" and \"invalid script files\", what we should do is that, whenever a \"File not found\" or similar upcoming issue is noted on a card, it should have a a small \"get help\" button which as a tool tip for the whole card has the admin contact info, and for clicking the button, shows the same in a small pop-up."*
    - *"1. Allow editing of Station timezone and Admin to work in the preview version as if it was the admin mode. 2. That should complete the work needed for that feature.  Go ahead and record it in the history if it never made the roadmap."*
  - **Outcome**: Completed — Added backward/forward-compatible `_meta.adminContactInfo` storage in `shows.json`, first-run and `Folders > Help` Admin editors (unlocked in both Admin Mode and AI Studio preview), contact display on the `Calendar` Admin warning screen, and a `"Get Help"` button with card tooltip and pop-up modal on missing/invalid media cards.

- **#16 — `Live_Dev > To-Be` Color Scheme Refinements & Semantic Rose Missed vs. Amber File Warning**
  - **User Note**:
    - *"1. For the Live_Dev>To-be view, 2. look at the current Player>Live's shading around the cards of announcements during shows. 2.a. The current background color in the borders on the live view is not brought over to the to-be view.  Review and update the to-be to match the background coloring. 3. Note also that the Past and Future contain the yellow, but that wasn't my choice.  It should be a neutral color. 4. Finally, in the two darker modes, on to-be, the Missed and File Not Found and Invalid coloring is fine on the Light mode, but the text vs background on them in the dark modes is unreadable as the font and background colors are almost the same.  Make a judgement call and try new colors on the font or background to make a readable contrast.  The current general pallette is fine.  So focus on lightening or darkening for readability. 5. In general, since you're already thinking of it, review the color schemes and make any recommendations for similar type issues I might have missed or not considered."*
    - *"B. For Rec #7, the emphasis is opposite.  A missed card needs the Red/Rose emphasis as it's a bigger issue..  A card which has missing media is a warning.  So, flip those two."*
    - *"3. The new color scheme recommendations now look great with the flip of the rose and amber.  Go ahead and move those as the defaults in the to-be, and back out the recommended tab and the toggles in the settings.  Consider that change a completed roadmap item also."*
    - *"5. On the dark modes in the Live_Dev>To-Be, the gray behind the cards and the now segments is too light.  Make that darker."*
  - **Outcome**: Completed — Applied show-spacer background shading across `To-Be` cards, neutralized `Past` and `Future` headers to slate gray, promoted `Rec #4`–`Rec #8` (including semantic Rose Missed vs. Amber missing-media warning and darker background shading behind cards and `Now` segments in dark modes) to permanent defaults in `Live_Dev > To-Be`, and removed the temporary `Recommended` tab and settings toggles.

- **#17 — Flashing Indicators & Scenario Demo Narrator (`Live_Dev > To-Be`)**
  - **User Note**:
    - *"Make sure there is a roadmap item to add flashing indicators to attract the attention of dj's.  Should be a reminder without being too annoying."*
    - *"Revisit the idea of \"disabled\" animation.  Instead of the built in version...  Make me an option where the display only blinks, rather than pulsing in and out. i.e, if the timing is 1 second, then Full On for .5 seconds and Full Off for .5 seconds.  With no transition color calculations.  Make that #4 in the enable/disable section."*
  - **Outcome**: Completed in `Live_Dev > To-Be` (Production rollout tracked under Collector `#13`) — Added `#4` step-blink performance mode (`0.5s` on / `0.5s` off without color transition calculations), two-row full-rectangle `Now`/`Missed` action buttons, automatic transition of played/read items to `Past`, simulated waveform/countdown playback progress, and 4 interactive scenario demo sets with a fixed-height left-hand Demo Narrator.

- **#18 — AI Studio Google Drive Single-Entry Token Connect Fix**
  - **User Note**:
    - *"(Detour issue... the aistudio login for google drive requirement to enter the value twice.  The first time always fails.)"*
    - *"I think I know what's wrong with the needing to authenticate twice. The first time I run, I get this popup. 'Select what Google OAuth 2.0 Playground can access...' The second time, I don't get a select checkbox, and just get this... 'When you allow this access, Google OAuth 2.0 Playground will be able to...' And it works."*
  - **Outcome**: Completed — Removed the redundant `userinfo.email` scope and set `include_granted_scopes=false` in `getPlaygroundDirectConsentUrl()` so `auth/drive` is requested as the sole scope (eliminating Google's unchecked granular checkbox on first login), alongside sequencing token verification and persisting draft Drive folder IDs on connect.

- **#19 — Default "Shows" Card for the Next Upcoming Show (Merged into `#12`)**
  - **User Note**: *"I need the roadmap item for adding the default "shows" card for the next upcoming show."* / *"19 and 12 are the same item."*
  - **Outcome**: Merged into `#12` — Consolidated into active item `#12` (*Auto-Seeded "Up Next: [Show Name]" Live Read Promo Cards*).

- **#20 — Calendar View Header Spacing & Controls Layout ("Calendar/Announcements/Shows" & Filters)**
  - **User Note**:
    - *"1. Review the spacing of the header for the calendar view that contains \"Calendar/Announcements/Shows\" control and the filters, etc."*
    - *"Propose 21 [Calendar Header #20] in a way that means nothing is edged off the side of the window for any typical width over 250 pixels.  The new elements were causing issues with that."*
    - *"For related... 5 - yes, update that.  For 6, sure, reduce it to just \"Check Evergreen Folders\" and then just \"Check FOlders\" when needed.  Go ahead an dgive it all a shot."*
  - **Outcome**: Completed — Recalibrated `CalendarTab` top-bar and subheader responsive breakpoints to account for the Station Timezone pill and Issues/Audit controls, anchored the Timezone pill beside the mode switcher, added ultra-narrow (`< 360px`) compact button/input stacking and `< 390px` vertical card stacking so nothing clips down to `250px`, updated the Debug Pixel Ruler markers, and added progressive label shortening (`"CHECK EVERGREEN & PLAYLIST FOLDERS"` -> `"CHECK EVERGREEN FOLDERS"` -> `"CHECK FOLDERS"`) on the `Shows` folder check button.

- **#24 — Announcement File Upload & Archive/Hide Inactive Filter (Split from `#9`)**
  - **User Note**:
    - *"Sort files for announcements. Maybe build an upload too. And possibly an 'archive' way to hide 'inactive' ones. Maybe show ones in use."*
    - *"Split the sorting need out of 7 and complete just it.  (Make the other requirements a separate new roadmap item.)"*
  - **Outcome**: Completed — Wired `+ UPLOAD FILE` in `Select Announcement` and `UPLOAD NEW AUDIO` / `CHOOSE EXISTING AUDIO` in the Live Read editor for both Local Folder and Google Drive storage with duplicate filename collision prompts (`Save as "Copy of ..."`, `Overwrite Existing`, `Cancel`), while satisfying media ranking via `Last Used` sorting and `Unused First` surfacing (and tracking literal archive-folder retirement separately under `#26`).

- **#13 — Collector: Promote `Live_Dev > To-Be` to Production `Live` View (Align Modes, Remove Test `Darker` Theme, & Pulse vs. Blink Performance Option)**
  - **User Note**:
    - *"That interface will need to be somewhat aligned with the new live player I'm working on. Make a note to align Prerecord, Export, and Playlist view to the new Live view when I bring the Live_dev stuff over."*
    - *"4. Make a new future roadmap note that when I eventually move the to-be into the actual production live view, that I should also remove the test darker theme, and leave only the three choices for light mode, system mode, and dark mode.  (This note should start to be a collector of roadmaps for when the to-be gets moved to live.)"*
    - *"The Flashing vs. pulsing is a good option.  When the live_dev>to_be is added to production, mark it as a roadmap that the pulse is the default, but if someone is disabling animations for performance, that pulsing can be disabled, and blinking is the performance enhancing option to replace it."*
  - **Outcome**: Completed — Promoted the `Live_Dev > To-Be` temporal window architecture (`Past`, `Now`, `Future`), 4-stage card urgency escalation, pinned top/bottom show banners, and card styling into production `Player` (`Live` and `Prerecord`), removed the user-facing `Dark Test` button (retaining `dark-test` in code with developer scaffolding comments), added the user-selectable step-blink urgency override (`blinkOnlyUrgency`) in Performance Overrides, and synchronized `Live_Dev` (`Current`, `To-Be`, `To-Be Merged`) to match production (`v0.19.0`).

- **#21 — Explore Combining Prerecord and Export Into One Interface**
  - **User Note**:
    - *"Explore combining Prerecord and Export into one interface."*
    - *"Add detail to the \"Export merged into prerecord\" roadmap item...  Make the proposal include the idea that all Export specific functionality (i.e. the 4 buttons) is rolled under a single Export button that is placed on the Prerecord interface.  And that when you click that Export button, it has a pop-up which allows you to export, to view the copies, and to mark all as logged."*
    - *"Ok, now, try a proposal for the Export view.  Create it as a mock tab on the Live_Dev page called \"To-Be Merged\".  This would be separate than Live, but possibly be able to leverage some of Live_Dev's current code methods.  Basically just want to see a preview before you commit the code.  It could be as simple as a mockup of the pop-up with no functionality."*
    - *"That's a good start.  However, the goal is to keep the Prerecord formatting as is.  So, reflect that, and then add a single blue button that is separate from the current Prerecord elements.  Also, on the Export Show pop-up, don't use a green color to differentiat \"Mark All As Logged\".  Use a different blue variant. Only make the changes to the to-be merged view.  Do not incorporate yet to the main live."*
  - **Outcome**: Completed — Consolidated `Export` into `Player > Prerecord` via the header `Export` button and `250px` `Export Show` pop-up (`Export Files...`, `Log Exports`, and `Plan | .m3u LIST | Live Reads` with `Copy`), ordered exported items in exact screen display order (played items first, followed by upcoming items), pruned standalone `Player > Export` view branches, and synchronized `Live_Dev > To-Be Merged` with production (`v0.19.0`).

- **#29 — Fix Duplicate Promo / Announcement Break Entries in `Export Show` Plan View**
  - **User Note**:
    - *"See if there is a bug fix here.  I am seeing the same promo twice on the Export Show \"plan\" view.  Here is the text on screen... [4:40 AM [READ] Music & More Donations (0:20) / 4:40 AM [PROMO] Up Next: Sovereign Glory with Randall Roberts (~00:20) repeated twice]"*
  - **Outcome**: Completed — Fixed `prerecordExportPlaylistSequence` in `PlayerTab.tsx` to match each playlist break item by both announcement ID and slot minute (`item.announcements.some(a => a.id === b.announcement.id) && isSameMinute(b.slot, item.slotTime)`) instead of matching only by minute, eliminating duplicate entries when multiple announcements share the same minute.

- **#28 — WPM-Based Approximate Read Time Backfill for Legacy Script Cards During Schema Upgrade (Merged into `#5b`)**
  - **User Note**:
    - *"For any legacy read cards which do not have estimated times that do have readable text, as a part of the upgrade path for converting old schma's to the current, write in the WPM based estimate into prior meta data where the approx read time is null or not present."*
  - **Outcome**: Completed & Merged into `#5b` — Added ~150 WPM `approximateReadTime` (`0mXXs`) backfill in `migrateAnnouncementsPayload`, `normalizeAnnouncement`, and `server.ts` (`resolveLocalAnnouncementScriptText`) for legacy script cards and historical `revisions` where `approximateReadTime` is `null` or missing and readable text exists, verified via `scripts/test-schema-upgrade.ts` (Stage 5), and merged live workstation verification tracking into `#5b`.

- **#30 — Multi-Theme Development Sandbox & User-Customizable Theme Scaffolding (`Live_Dev` Philosophy)**
  - **User Note**:
    - *"12 Maintain Dark Test in code as a development method artifact to be revived later.  We want to maintain the architecture to be able to enable and test multiple themes.  Think of a future design method for the dev, and the scaffolding needed to give users their own theme adjustments.  Add this in comment guidance inside the code.  Development is deferred on this path, but is something a future dev might pick up.  If it's appropriate, this could be a low priority roadmap item too."*
    - *"For #30, incorporate that philosophy in your agents for this project and possibly as a note for the live_dev section of code.  (The scope of #30 is the LIVE_DEV work that is only in aistudio and that users would never see.)"*
  - **Outcome**: Completed (Embedded in `AGENTS.md`, `ARCHITECTURE_AND_GLOSSARY.md`, `src/App.tsx`, and `src/components/LiveDevTab.tsx`) — Documented the AI Studio-only `Live_Dev` multi-theme workbench philosophy, `Dark Test` (`dark-test`) side-by-side contrast testing matrix, and CSS custom-property token scaffolding guidance inside `AGENTS.md`, `ARCHITECTURE_AND_GLOSSARY.md`, `src/App.tsx`, and `src/components/LiveDevTab.tsx`.

- **#25 — Rotating Multi-Item Time-Gated Announcements**
  - **User Note**:
    - *"to allow time gated announcements to have more than one item attached, and for the file or audio to be rotated through the attached items.  i.e. if scheduled every hour, track A plays at 1AM, Track B plays at 2 AM., Track C at 3AM, and Track A at 4AM continuing the cycle."*
    - *"I need to be able to store multiple files for each time gate, and then have each of those be rotated in the schedule so that they run in sequence. From a database level, it is simply inserting another layer of gating. From a scheduling level, it will require a cycling algorithm that places a different attachment to a signle gated announcement. From a logging schedule, it will require saving which item was played and the name. However, when assessing if the right file was played in an audit, don't focus on that too much. Just make sure there is a log item for the gate... Each new calculation algorithm can simplly use start time, and then the iteration pattern (1,2,3,1,2,3,1,2,3) to determine if it's time to play 1 2 o 3."*
    - *"FOr older records, it is ok to translate and use the old record as a single record in the new gating layer. However, there will never be a need for a top level one at a layer higher than the gating layer to be maintained... The section just needs to be named \"Media (Multiple files will be auto rotated)\" and \"+ Add File\" is sufficient... prepending \"(1/3)\" to file names or postpending \"(1/3)\" on announcement names when the file name isn't present is a good idea."*
  - **Outcome**: Completed — Added the `mediaItems: TimeGatedMediaItem[]` gating layer inside each `TimeGatedMp3` time gate (automatically migrating legacy flat media records into a 1-item `mediaItems` array and stripping flat media fields on rewrite), implemented deterministic start-time cycling (`1, 2, 3, 1, 2, 3...` via `k % mediaItems.length`, with `ONE_TIME` announcements pinned to the 1st item), renamed the editor section to `"Media (Multiple files will be auto rotated)"` with a `"+ Add File"` button and per-gate rotation reordering, added `(1/3)` sequence indicators on rotating announcement names and filenames, updated `MediaPickerModal` usage/last-used tracking and schedule diagnostics across all rotating items, and kept log reconciliation gate-level.

- **#22 — Explore Combining Live and Playlist Into One Interface (Merged into `#27`)**
  - **User Note**: *"Explore combining Live and Playlist into one interface."*
  - **Outcome**: Merged into `#27` — Consolidated into `#27` (*Multi-Zone Show Play Board & Playlist Arranger Window*).

- **#23 — Explore Unscheduled "Show Cards" Soundboard & MP3 Arranger (Merged into `#27`)**
  - **User Note**: *"Explore 'show cards' outside of the scheduled interface for playing a soundboard style app and arranging mp3's if needed."*
  - **Outcome**: Merged into `#27` — Consolidated into `#27` (*Multi-Zone Show Play Board & Playlist Arranger Window*).

- **#32 — Watchlist: Dual Local + Drive Persistence Priority in `CopyEditorModal` (`server.ts` + `driveService.ts`)**
  - **User Note**:
    - *"Add the section b items 9 and 10 to the current watchlist roadmap."*
    - *"Reassess that last response.  Right now, Google Drive native calls only works with aistudio and that is only to enable testing.  For regular usage, all work is expected to be on local folders or on the localized version of folders as implemented by the desktop apps for Google Drive, One Drive, DropBox, etc."*
    - *"You can close it out, but is there something about how the code is written and architectured that could be a cleaner way of delineating the aistudio path vs the local app path?"*
    - *"Adopte Approach 2 now and make it the solution to #32 when you note the completion."*
  - **Outcome**: Completed (Approach 2 — Server-Side Storage Provider in `server.ts`) — Unified `/api/live-read/*` (`content`, `save`, `copy-file`) and `/api/announcements/*` (`upload-file`, `rename-or-copy-file`) behind a server-side storage provider in `server.ts` that cleanly routes between the AI Studio Google Drive Test Harness (`mode === 'Drive'`) and the Production Local Filesystem (`mode === 'Local'`), eliminating `if (isDriveActive)` branching, cross-environment fallback reads, and dual local+Drive writes from `CopyEditorModal.tsx`, `LiveReadPopout.tsx`, and `driveService.ts`.

- **#33 — Gold-Standard Sub-Topic 1 (Code Architecture): Full Server-Side Storage Provider Unification & Modular Backend (`server.ts` + `driveService.ts`)**
  - **User Note**:
    - *"Then, do a deep dive for more options for this app to be rewritten for a \"Gold-Standard Long-Term Architecture\". If necessary to be able to successfully do deep analysis, break the areas of focus into sub topics so that I can have you work each independently. The goal here would be to tidy up the code so that there isn't development slop or spaghetti logic and so that proper coding techniques are used. In general, the functionality is exactly what I want, but there are areas which the interface has which are cluttered and overly wordy. DO NOT take any actions on this architectural review except possibly to write out a roadmap document based on the findings."*
    - *"Let's start working these.  DO a deeper dive into #33 and suggest a full roadmap and an execution path for me to approve and start."*
    - *"I approve of all of that.  Proceed in the way that makes it most likely for you to succeed without errors or mistakes."*
  - **Outcome**: Completed — Unified all schedule, show, log, backup, compatibility inspection/upgrade, evergreen folder verification/renaming, show folder discovery, playlist track/M3U/session-log, missing-items inspection, media listing, and byte-range audio streaming endpoints behind a modular server-side storage layer (`src/server/state.ts`, `src/server/storage/driveProvider.ts`, `src/server/routes/settingsRoutes.ts`, `src/server/routes/scheduleRoutes.ts`, `src/server/routes/mediaRoutes.ts`, `src/server/routes/showsRoutes.ts`) mounted by a 53-line `server.ts` bootstrapper, extracted client audio caches into `src/lib/audioCache.ts`, reduced `src/lib/driveService.ts` from 3,457 lines to 1,536 lines, and unified frontend hooks/components (`useScheduleManager.ts`, `App.tsx`, `CalendarTab.tsx`, `PlayerTab.tsx`, `FolderChooserModal.tsx`, `LocationsModal.tsx`) to call `/api/*` directly with `getStorageApiHeaders()`.

- **#34 — Gold-Standard Sub-Topic 2 (Code Architecture): Monolith Component Decomposition (`CalendarTab.tsx`, `PlayerTab.tsx`, & `App.tsx`)**
  - **User Note**:
    - *"Then, do a deep dive for more options for this app to be rewritten for a \"Gold-Standard Long-Term Architecture\". If necessary to be able to successfully do deep analysis, break the areas of focus into sub topics so that I can have you work each independently. The goal here would be to tidy up the code so that there isn't development slop or spaghetti logic and so that proper coding techniques are used. In general, the functionality is exactly what I want, but there are areas which the interface has which are cluttered and overly wordy. DO NOT take any actions on this architectural review except possibly to write out a roadmap document based on the findings."*
    - *"Go for it for #34."*
    - *"Do 1-14 in the 3 phase execution as suggested. (For #15, that needs to be shelved until this whole process is done.  So, it is a post-process for the whole thing.  After the rearchitecturing, we can rearchitect how to do demo modes in development that don't ruin active modes.  Possibly with branching forks of the main source code components that are branched by duplicating in the live code and only revealing by detouring in live mode when switch to a dev attempt.  You can make that a new roadmap item.)"*
  - **Outcome**: Completed — Decomposed `src/components/CalendarTab.tsx` (`7,484` lines -> `2,940` lines) into `src/components/calendar/` (`calendarHelpers.ts`, `CalendarHeaderBar.tsx`, `ShowsManagerView.tsx`, `WeeklyCalendarGrid.tsx`, `AnnouncementsListView.tsx`, `AnnouncementEditorView.tsx`), decomposed `src/components/PlayerTab.tsx` (`6,849` lines -> `3,836` lines) into `src/components/player/` (`PlayerShowSpacer.tsx`, `PlayerAnnouncementCard.tsx`, `PlayerPlaylistDeckView.tsx`, `PlayerLiveTimelineView.tsx`, `PlayerPrerecordTimelineView.tsx`), and extracted `src/hooks/useAudioCacheController.ts`, `src/hooks/useLocationsController.ts`, and `src/components/app/AppOverlays.tsx` out of `src/App.tsx` (`4,584` lines -> `3,336` lines) while shelving `LiveDevTab.tsx` demo-mode re-architecture into new Roadmap `#41`.

- **#35 — Gold-Standard Sub-Topic 3 (Code Architecture): Unified Schedule, Time-Gate & Rotation Domain Engine (`src/lib/scheduleEngine.ts`)**
  - **User Note**:
    - *"Then, do a deep dive for more options for this app to be rewritten for a \"Gold-Standard Long-Term Architecture\". If necessary to be able to successfully do deep analysis, break the areas of focus into sub topics so that I can have you work each independently. The goal here would be to tidy up the code so that there isn't development slop or spaghetti logic and so that proper coding techniques are used. In general, the functionality is exactly what I want, but there are areas which the interface has which are cluttered and overly wordy. DO NOT take any actions on this architectural review except possibly to write out a roadmap document based on the findings."*
    - *"proceed with a deep dive and execution plan for Roadmap #35 (Unified Schedule, Time-Gate & Rotation Domain Engine)"*
    - *"This sounds proper.  DO not lose sight of what you've proposed as you consider the rest of this prompt.  I believe you have it correct, but I need a deep dive assurance since you've proposed so many changes at once. Before proceeding, analyze if potentially there are different purposes for each view that creates a different reason for parsing a certain way.  I don't believe there is.  There should be a way to determine \"less than now\" schedules and a what to determine \"Now and forward\" schedules that are 2 different rules and are gated by modify dates and revision history. But, I believe that in any case, it should be possible to materialize that calendar/schedule uniformly across the app.  And have it account for the time zone setting and have it account for \"near time\" gating calculations ever if it all becomes too much to calculate at once.  (i.e. \"Less than now\" and \"Now and Forward\" are both basically infinite data sets, so there needs to be some scoping whenever a calculation is needed.  i.e. a scope by start and end dates of audits, etc.) Review fully to ensure the questions about resolving issues you uncovered are things to consolidate and align... rather than purposeful differences to enable different times of dates."*
  - **Outcome**: Completed — Created `src/lib/scheduleEngine.ts` consolidating station-local date boundary checks (`isAnnouncementWithinDateBounds`), rule matching (`isAnnouncementRuleMatch`, `isAnnouncementScheduledAtSlot`, `getAnnouncementsForSlot`, `isAnnouncementActiveInHour` with legacy `days`/`hours` fallback), time-gate resolution (`getActiveMp3ForSlot`, `getMatchingMp3sForSlot`, `validateTimeGatedMp3s`), `O(1)` full-week `1, 2, 3` rotation indexing (`computeScheduledOccurrenceCount`), show-at-slot evaluation (`isTimeInShow`, `getShowsForSlot`), virtual `Up Next` promo synthesis (`buildUpNextPromoAnnouncements`), and file schedule usage metrics (`computeFileScheduleUsageMap`), wired `PlayerTab.tsx`, `CalendarTab.tsx`, `App.tsx`, `scheduleDiagnostics.ts`, `temporalReconciliation.ts`, and `MediaPickerModal.tsx` to the canonical domain functions, and verified with Stage 7 unit tests in `scripts/test-schema-upgrade.ts`.

- **#36 — Gold-Standard Sub-Topic 4 (Code Architecture): Strict TypeScript Domain Hygiene, Cache Encapsulation & Legacy Alias Cleanup**
  - **User Note**:
    - *"Then, do a deep dive for more options for this app to be rewritten for a \"Gold-Standard Long-Term Architecture\". If necessary to be able to successfully do deep analysis, break the areas of focus into sub topics so that I can have you work each independently. The goal here would be to tidy up the code so that there isn't development slop or spaghetti logic and so that proper coding techniques are used. In general, the functionality is exactly what I want, but there are areas which the interface has which are cluttered and overly wordy. DO NOT take any actions on this architectural review except possibly to write out a roadmap document based on the findings."*
    - *"In general, this seems fine.  A analysis before you begin.  0.15.4/0.15.5 schema data is still live by users and I'll be moving them over to this new version after all the changes are complete.  If any of these changes are ones that mean 0.15.4/5 users cannot use the schema temporarily without breaking, then we need a path that is temporary to accomodate them.  (Assume in our case that I have a discrete small user set and that conversion of 100% of users is a trivial matter, but there may be a few days of overlap.  There will be no need for longterm cross-compatibility.)"*
    - *"Proceed"*
  - **Outcome**: Completed — Unified canonical domain and IPC types (`LocationSettings`, `LocationPathsOverride`, `GoogleAuthConfig`, `MediaAssetFile`, `LiveReadPayload`, `ElectronAPI`) in `src/types.ts` and `src/vite-env.d.ts`, eliminated `(window as any).electronAPI` / `(window as any).amp*` / `driveMP3s?: any[]` casts across the codebase, encapsulated catalog cache updates behind `mediaCatalogStore` (`upsertMediaCatalogFile`, `syncMediaCatalogFiles`) in `src/lib/audioCache.ts` (replacing render-phase cache mutation in `CalendarTab.tsx` with `useEffect`), added `resolveEffectiveLocalPaths` in `src/lib/driveService.ts`, removed dead top-level `formData.mp3Url` / `mp3InputVal` state, and added a temporary `TimeGatedMp3` Dual-Write Sibling Bridge in `migrateAnnouncementsPayload` and `normalizeAnnouncement` so `v0.15.4 / v0.15.5` workstations and `v0.19.5` can read and edit shared time gates seamlessly during the user migration overlap window (verified via Stage 8 of `scripts/test-schema-upgrade.ts`).

- **#44 — Single macOS Universal Executable (`.dmg`) & OS/Module Compatibility Audit (`v0.20.1`)**
  - **User Note**:
    - *"Review the architecture that requires separate versions for older and newer MacOS's.  This was set up by an inferior agent at the start.  Is there a path to go to a single MacOS executable that runs on both Intel and Silicon macs?"*
    - *"Add the roadmap for tracking purposes, but also prepare to implement a single MacOS version now and iterate to v0.20.1 and archive as v0.20.1. As a part of this process, review all versions of any modules or api's or other code components to ensure and validate the MacOS versions and Windows OS versions that are compatible, and also that all versions of internal code are as current as they should be."*
    - *"Do those updates change the OS version compatibility?  If not, then roll them all together.  v0.20.x is a massive change testing effort, and we might as well put it all in at once."*
  - **Outcome**: Completed — Switched macOS packaging from split `--x64 --arm64` files to a single Universal (`--mac --universal`) `.dmg` per edition (`-Mac.dmg`) that runs natively on both Apple Silicon (`arm64`) and Intel (`x64`) Macs (macOS 12 Monterey+), validated Windows 10 (v1809+) / Windows 11 (64-bit) compatibility, updated in-range dependencies (`electron@42.11.18`, `electron-builder@26.18.0`, `express@4.22.3`, `react@19.3.1`, `vite@6.4.5`, `tailwindcss@4.3.4`, `date-fns@4.4.0`), refreshed `README.md` and `electron-main.cjs` license listings, and archived `v0.20.1`.

- **#45 — Add Retry Logic to `downloadFile()` for Remote Icons (`scripts/build-apps.cjs`)**
  - **User Note**:
    - *"Transient GitHub HTTP 503 Dropped studio/icon.png on the Windows Runner (Worth Fixing)"*
    - *"a. In the Windows log, downloading studio/icon.png from raw.githubusercontent.com returned status 503 (a momentary GitHub CDN hiccup)."*
    - *"b. Because studio/windows/icon.ico succeeded right after, the Windows .exe installer and taskbar icons are not affected, and macOS downloaded studio/icon.png cleanly."*
    - *"c. However, on Windows AMP Studio, dist/app-icon.png fell back to the default placeholder because downloadFile() in scripts/build-apps.cjs has no retry logic."*
    - *"d. Fix: Add a 3-attempt retry (500ms backoff) inside downloadFile() in scripts/build-apps.cjs."*
    - *"Let's fix 1 and 2. They seem minor."*
  - **Outcome**: Completed — Added a 3-attempt retry loop with 500ms backoff in `downloadFile()` inside `scripts/build-apps.cjs` to guard against transient GitHub CDN HTTP 503 responses during remote icon asset synchronization.

- **#46 — Set `hardenedRuntime: false` for macOS Ad-Hoc Signing in `package.json`**
  - **User Note**:
    - *"macOS Ad-Hoc Hardened Runtime Warning (Worth Tidying)"*
    - *"a. Log message: ad-hoc signing with hardenedRuntime enabled requires the com.apple.security.cs.disable-library-validation entitlement..."*
    - *"b. electron-builder defaults mac.hardenedRuntime to true, which is intended for Apple notarization with a paid Developer ID certificate."*
    - *"c. Since AMP uses ad-hoc signing (\"identity\": \"-\"), setting \"hardenedRuntime\": false under build.mac in package.json removes this warning and avoids unnecessary library-validation checks."*
    - *"Let's fix 1 and 2. They seem minor."*
  - **Outcome**: Completed — Set `"hardenedRuntime": false` under `build.mac` in `package.json` and `scripts/build-apps.cjs` so ad-hoc signed macOS builds do not emit unnecessary hardened-runtime entitlement warnings.

- **#47 — Add Admin Mode Modal Warning to Folders Settings Window in Admin Version (Single One-Time Verification)**
  - **User Note**:
    - *"For 2.c. While those functionalities are there, the actual editing section is disabled on Windows Portable for the Admin version.  (I will retry on MacOS later.)  Not that no 2.b. banner was shown for \"Read-Only Mode.  However, once I enter the Calendar once through the Admin Mode, then it enables them and prompts me in Calendar to enter the Admin info.  After that, I can edit properly.  Note for roadmap, add the admin mode modal warning to the Folders settings window if someone is in Admin version of the app.  A person only need verify that once."*
  - **Outcome**: Completed — Added the one-time *"For Administrators ONLY / Enter Admin Mode"* verification gate and inline **First-Run Setup: Admin Contact Info** banner directly inside `LocationsModal.tsx` (`Folders`) for `AMP Admin` builds, sharing the `isAdmin` session state with `CalendarTab.tsx` so verifying once unlocks both `Folders` (`Folders > Help`) and `Calendar`.

- **#48 — Change Show Lookaround Setting From Integer Hours to `hh:mm` Format**
  - **User Note**:
    - *"Note for roadmap, the Show Lookaround in Hours should be an hh:mm type setting, not just an integer of hours."*
  - **Outcome**: Completed — Added `showLookaroundMinutes` (`hh:mm`, default `01:00`, range `00:00` to `06:00`) alongside fractional `showLookaroundHours` in `src/lib/compatibility.ts`, `LocalHelpModal.tsx`, and `PlayerTab.tsx`.

- **#49 — Legacy `v0.15.4` Overwriting or Deleting `_meta` Settings (`adminContactInfo` & `upNextPromo`)**
  - **User Note**:
    - *"Running 0.15.4 after setting the Admin Contact info seems to have deleted the value.  I believe it also over-wrote the Up Next setting I saved.  That needs to be a roadmap item."*
  - **Outcome**: Completed — Mirrored `_stationMeta` (`stationTimezone`, `adminContactInfo`, `upNextPromo`, `scheduleWindow`) onto `data[0]._stationMeta` inside `shows.json` and `announcements.json` and persisted a `settings/station_settings.json` sidecar backup on disk so `v0.20.2` automatically restores station settings whenever `v0.15.4`'s `/api/trigger-backup` strips top-level JSON envelopes.

- **#50 — Remove Fake Name (`"Kate"`) From Admin Contact Info Example & Scan Codebase for Fake/Trope Placeholder Names**
  - **User Note**:
    - *"Note: The example contact info has Kate as a fake name.  This is unacceptable and violates a rule for using real info.  Need a roadmap item for fixing that and scanning for any other cases of that sort of thing."*
  - **Outcome**: Completed — Replaced the placeholder in `src/components/LocalHelpModal.tsx` with literal structural text (`"e.g., Admin 1 — admin@station.org / (555) 000-0000"`) and audited all placeholders across `src/`.

- **#51 — Announcement Editor Save Button Does Not Block or Warn When Saving With Incomplete Gate Data (`2.3.b`)**
  - **User Note**:
    - *"For 2.3.b - Saving in this state has lots of warnings in the interface, but the save button does not actually warn or prevent."*
    - *"Implement all.  For 8.  As long as the box allows for both a \"return to fix\" and a \"Save anyway\" type choice, then yes, it's ok to add additional warnings upon save.  Just don't trigger for historical issues that have already passed."*
  - **Outcome**: Completed — Updated `validateTimeGatedMp3s` (`src/lib/scheduleEngine.ts`) to flag `hasErrors = true` for active/upcoming missing start dates, missing file attachments, overlaps, and gaps (ignoring historical passed issues), and added both **Save Anyway** and **Return to Editor to Fix** choices to the `Incomplete Gate Data` modal in `src/components/CalendarTab.tsx`.

- **#52 — Live Read `CopyEditorModal` Failing to Seed/Save Local `.txt` Scripts (`"Could not load script..."` / `"Google Drive Station folder is not configured..."`) & Auto Read-Time Checkbox Unchecked (`2.3.e` / `2.3.f`)**
  - **User Note**:
    - *"For 2.3.e, before save, when clicking Edit from the Gate #x section of files, none of the actual file text is seeded in the editor.  If I hit Preview, then edit, none of the actual file text is seeded.  If I hit save, and then reopen the announcement, and go to edit the text file, none of the actual file text is seeded.  There is an error on the bottom that says \"Could not load script \"FanettiFest_Til2026_10_26.txt\".\"  In playing with the editor, I can write and it seems to function.  It looks like the \"auto\" button was unchecked though for time calculations.  (I assume since it was autopopulated already when the script was added and saved earlier in the test.)  When I go to save my test edits, I get \"Google Drive Station folder is not configured. Please set it in Settings.\"  Very odd because the Preview button on the main page still works.  Split looks like it can work, but the save error from above prevents me from testing 2.3.f."*
  - **Outcome**: Completed — Fixed `isDriveActive` state in `src/App.tsx` and `src/hooks/useLocationsController.ts` (`false` in `Local` mode), removed the forced `'Drive'` mode override in `CopyEditorModal.tsx`, `MediaPickerModal.tsx`, and `src/lib/driveService.ts`, and initialized `autoApplyReadTime` to `true` in `CopyEditorModal.tsx` so auto-estimated scripts keep the **Auto** read-time calculation checkbox checked by default.




