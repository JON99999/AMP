# AMP Persistent Roadmap & Backlog (`ROADMAP_AND_BACKLOG.md`)

> **Agent Recall & Maintenance Protocol**:
> - **Trigger Phrases**: Whenever the user asks *"what's left"*, *"what's next"*, *"next steps"*, *"open items"*, *"roadmap"*, *"easy wins"*, or similar phrasing, **always read `dev/docs/ROADMAP_newstuff.md`, this file, and `dev/docs/ROADMAP_HISTORY.md` first**.
> - **Inbox Intake (`dev/docs/ROADMAP_newstuff.md`)**: On every roadmap check (or when `ROADMAP_newstuff.md` has pending entries), parse any raw notes in `dev/docs/ROADMAP_newstuff.md`, add them as numbered `#ID` items in this file recording **only** the verbatim `User Note` (hold off on analysis or implementation plans until asked), clear the consumed raw notes from `## Pending Inbox`, and log a 1-line receipt in `## Ingested Batch Log`.
> - **Roadmap Items Are Reminders, Not Commands**: Selecting a `#ID` opens analysis/discussion on that reminder; always present a numbered checklist separating **Core Scoped Changes** from **Related / Edge-of-Scope Suggestions** using continuous `1–N` numbering across subgroupings (e.g., `- **1.**` through `- **6.**` with nested `a., b., c.` sub-bullets so Markdown parsers never reset numbering to `1–3` under a second header) and wait for confirmation before editing files.
> - **Immutable Monotonic `#ID` Numbering (Never Renumber)**: Every new item MUST receive the next sequential integer `#ID` (`max(existing #ID across ROADMAP_AND_BACKLOG.md and ROADMAP_HISTORY.md) + 1`, so the next item added is **`#134`**). Never renumber, reuse, or shift existing `#ID`s.
> - **Historical Preservation (`dev/docs/ROADMAP_HISTORY.md`) & Verbatim Note Permanence**: The user's original verbatim `User Note` must **always** accompany an item across any future changes, revisions, or archiving. When an item is completed, rejected, abandoned, or resolved, move it out of this active backlog into `dev/docs/ROADMAP_HISTORY.md`, preserving its permanent `#ID`, its original verbatim `User Note`, and a brief, non-technical high-level outcome summary.
> - **Three-Tier Subgrouping (`Pending / Dependent`, `Current / Next`, `Future / Deferred / Low Priority`)**:
>   1. **Pending / Dependent**: Items whose code or migration logic is implemented and awaiting external validation (such as live two-version desktop workstation testing) or future station-wide version retirement before final cutover.
>   2. **Current / Next (Default Target for New Items)**: Active upcoming feature work and enhancements ready for immediate selection. All newly ingested items from `dev/docs/ROADMAP_newstuff.md` or user prompts are placed in **Current / Next** by default unless the user explicitly specifies otherwise, while keeping `#ID` numbering strictly sequential as added.
>   3. **Future / Deferred / Low Priority**: Exploratory architectural concepts, deferred enhancements, and lower-priority backlog items held for later evaluation.
> - **No "Sprint" Terminology (Solo Ad-Hoc Developer Rule)**: Never group or present items as "Sprints" (`Sprint 1`, `Sprint Queue`). Always present open items as a scannable menu by their permanent `#ID` across the three subgroupings using continuous `1–N` numbering when listed in chat.

---

## 1. Pending / Dependent

### 5b. [ ] Live Two-Version Desktop Build Verification, WPM Read-Time Upgrade Backfill (`#28`), & Future Legacy Sibling Sunset
* **User Note**:
  * *"18.1 doesn't seem to upgrade the old data as expected.  Properly logged shows show as missed."*
  * *(Merged from `#28`)*: *"For any legacy read cards which do not have estimated times that do have readable text, as a part of the upgrade path for converting old schma's to the current, write in the WPM based estimate into prior meta data where the approx read time is null or not present."*
  * *(11/04/2026 Testing Progress)*: *"Steps 1 and 2 check out _for windows_.  (Note, prepare to reprompt me later on everything so I can redo the tests on a mac later.)"*
  * *(11/05/2026 Testing Progress)*: Completed full `v0.20.2` and `v0.20.3` Windows passes across Phases 1–4 (`Steps 1–7` & `Steps W1–W5`); fixed `#54`–`#60` in `v0.20.3` and added `#53` to `Current / Next`.
  * *(11/06/2026 Testing Progress)*: Identified and resolved macOS Chromium disk cache poisoning & Google Drive on-demand hydration issues (`#61`–`#64`) in `v0.20.4`.
  * *(11/09/2026 Testing Progress)*: *"I already tested everything but 61-64 related items. ... I completed all the phases of testing, and everything passed or had an exception below as noted."* (Exceptions `A`–`M` ingested as `#65`–`#74` and test-plan corrections below).
  * *(11/11/2026 Testing Progress)*: Completed Round 1 macOS Intel (`v0.20.5`) delta verification across Groups A–E (`Tests 1–15`); logged follow-up roadmap items `#76`–`#89` and released in `v0.20.6`.
  * *(11/11/2026 Windows `v0.20.6` Round 1 Complete & Mac Round 2 Rolled Into `v0.20.7`)*: Completed full **Round 1 Windows (`Tests 1–15`, Groups W-A through W-E)**; Group W-E (`Tests 14–15`) passed with zero issues, and Groups W-A through W-D follow-up notes are logged as `#90`–`#105` (plus `#27` note). Remaining Round 2 macOS delta items (`M1` & `M4.b`) dropped as separate tests since the splash screen (`#90`) will be observed naturally and folder verification (`#100`–`#101`) is being updated for `v0.20.7`.
  * *(11/24/2026 Windows `v0.20.8` Full Beta Pass Complete — `OUTBOUND_AMP_v0.20.8_TEST_HANDOFF.md` & `OUTBOUND_AMP_v0.20.8_TEST_FINDINGS.md`)*: Completed full **Round 1 Windows `v0.20.8` Beta Test Pass (`Steps 1–45`, Phase 0 & Chapters 1–7)** on `H:\My Drive\development.noindex\AMP_0.20.8TEST` and `AMP_0.20.8TEST_Copy`. Ingested the 15 findings verbatim as **`#119`–`#133`**.
* **Implemented & Automated Verification Complete (`v0.20.4`–`v0.20.9`)**:
  * **Dual-Value Sibling Bridge (`#5`)**: Bidirectional seeding and dual-write of `logs.json` (`scheduledFor`/`executedAt` <-> `announcementTime`/`timestamp`/`logTimeStamp`), `announcements.json` (`validFrom`, `validTo`, `isDeleted`, `revisions`, `timeGatedMp3s`), and `shows.json` (`active` + temporal fields), plus automatic `_meta` healing on shared folders (`dev/docs/COEXISTENCE_AND_SIBLING_BRIDGE.md`).
  * **Legacy Script WPM Approximate Read-Time Backfill (`#28`)**: `migrateAnnouncementsPayload` (`src/lib/compatibility.ts`), `normalizeAnnouncement` (`src/lib/utils.ts`), and `resolveLocalAnnouncementScriptText` (`server.ts`) automatically compute and backfill the ~150 WPM duration (`0mXXs`, rounded up to the nearest 5s) across active `timeGatedMp3s` and historical `revisions` whenever a legacy script card (`assetType === 'script'` or `.txt`/`.md`) has `null` or missing `approximateReadTime` and readable text is available on disk or inline, while preserving any existing explicit duration (`scripts/test-schema-upgrade.ts` Stage 5).
  * **What `#5b` Is Still Tracking (Pending / Dependent)**:
    * **Delta Verification (`v0.20.8` / `v0.20.9` Pass — `dev/docs/TESTING_PLAN_v0.20.8.md`)**:
      * Round 1 Windows (`v0.20.8`, `Steps 1–45`) complete (`#119`–`#133` logged); Round 2 macOS Universal (`-Mac.dmg`) verification and delta re-verification of `#119`–`#133` fixes remain.
    * **Future Sunset (`v0.20.8+` Onward -> `schemaVersion: 2`)**:
      * Once the small `v0.15.4` user pool converts to `v0.20.8+`, follow the concrete 12-item file-by-file **`v0.15.4`-Exclusive Schema Backout Guide** in `dev/docs/COEXISTENCE_AND_SIBLING_BRIDGE.md` (Section 4) to remove all `v0.15.4` coexistence/upgrade code and support `v0.20.8+` onward exclusively.

---

## 2. Current / Next
*(Default subgrouping for all newly added `#ID` items unless specified otherwise)*

*(No active items currently queued in Current / Next.)*

---

## 3. Future / Deferred / Low Priority

### 27. [ ] Multi-Zone Show Play Board & Playlist Arranger Window (Consolidating `#22`, `#23`, & `#27`)
* **User Note**:
  * *"Make a roadmap item that is called \"Add bring your own playlist files option.\""*
  * *(Merged from `#22`)*: *"Explore combining Live and Playlist into one interface."*
  * *(Merged from `#23`)*: *"Explore 'show cards' outside of the scheduled interface for playing a soundboard style app and arranging mp3's if needed."*
  * *"On the roadmap, combine 22, 23, and 27 into one single item (27 is fine).  The basic functionality I'm envisioning uses the concept of the playlist mode and hos the prerecord mode incorporates playlists, but that it does the scheduling and ordering of the playlist in a \"board\" method in a separate window.  The window would have 3 basic zones.  Maybe 4.  A main zone which is the full play board for that show.  And then 2-3 \"picker\" zone where you could pick and choose audio.  One is tracks for _that show_, one is the announcements from the main AMP schedule, and the last would be standard audio clips the DJ uses on every show potentially."*
  * *(11/09/2026 User Note M)*: *"M. Not testing this - “e. Mode 3 — Live With Playlist (Playlist) Mode (C.8a, #58):” because I'm not pursuing playlist in the way it’s designed, and because it is hidden from the live and studio views.  See other roadmap regarding new playlist mode that is for the future."*
  * *(11/11/2026 User Note)*: *"Tack onto the roadmap item for the new card layout for playlists, that it should include a rudimentary editor that is really a start/stop time selector with a fade in and fade out.  And possibly a curse word editor that either drops all sound or somehow masks the offending word.)"*

### 39. [ ] Gold-Standard Sub-Topic 7 (UI De-Cluttering): Settings, Help & Asset Modals De-Cluttering (`LocalHelpModal`, `LocationsModal`, `CopyEditorModal`, `MediaPickerModal`)
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
  * *(11/17/2026 User Note)*: *"Defer A. #39 as low priority."*
* **Scope Summary**: Separate live Admin **Station Settings** (Timezone, Admin Contact, Up Next Promo, Schedule Window, Reset) from the long **Setup & Sync Guide** documentation in `LocalHelpModal.tsx` (`#39.15`), inline `Browse`+`Open` and 1-line `.noindex` tip plus single-line folder override rows in `LocationsModal.tsx` (`#39.13` & `#39.14`), and compact metadata/segmented filter pills in `CopyEditorModal.tsx` (`#39.16`) and `MediaPickerModal.tsx` (`#39.17`).

### 40. [ ] Gold-Standard Sub-Topic 8 (UI De-Cluttering): Player Mode Chrome, Banners & Pop-Up Copy Tightening (`PlayerTab` & Mode Modals)
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
  * *(11/17/2026 User Note)*: *"Defer 10.a. as possibly unneeded. Change 10.b to suggesting possibly \"choose\" instead of \"show\", but also defer for now. 11.a. Flag as likely unneeded, defer for now. 12.a, Flag as review later, probably not needed, defer for now."*
* **Scope Summary & Sub-Item Flags**:
  * **`10.a` (`#40.18a` — Tighten 250px Prerecord mode label + date/time block in `PlayerTab.tsx`)**: Deferred — possibly unneeded.
  * **`10.b` (`#40.18b` — Replace 2-line `"Choose / Show"` button stack in `PlayerTab.tsx`)**: Suggest possibly using `"Choose"` instead of `"Show"`; deferred for now.
  * **`11.a` (`#40.19` — Consolidate `PrerecordModal.tsx` 3-step flow into a single-screen selector)**: Flagged as likely unneeded; deferred for now.
  * **`12.a` (`#40.20` — Inline `Export Files...` + `Log Exports` in `PrerecordExportPopup.tsx`)**: Flagged as review later, probably not needed; deferred for now.

### 41. [ ] Post-Rearchitecture Development Demo Mode & Component Fork Detouring (See Also `#83` for `Live_Dev -> To-Be` UI Candidates)
* **User Note**:
  * *"(For #15, that needs to be shelved until this whole process is done.  So, it is a post-process for the whole thing.  After the rearchitecturing, we can rearchitect how to do demo modes in development that don't ruin active modes.  Possibly with branching forks of the main source code components that are branched by duplicating in the live code and only revealing by detouring in live mode when switch to a dev attempt.  You can make that a new roadmap item.)"*
  * *(11/10/2026 Cross-Reference — see `#83`)*: *"Note, many of these recent roadmaps are things which could be added to the preview Live_Dev mode for me to see if I like.  Somehow remember (maybe an additional roadmap, or some sort of note when the live_Dev mode is in scope) that many of these could be rolled into that area's to-be interface."*

### 83. [ ] Preview Recent UI & Editor Roadmap Candidates (`#77`, `#79`–`#88`, `#90`–`#105`) in `Live_Dev -> To-Be` Sandbox Before Production Rollout
* **User Note**:
  * *"Note, many of these recent roadmaps are things which could be added to the preview Live_Dev mode for me to see if I like.  Somehow remember (maybe an additional roadmap, or some sort of note when the live_Dev mode is in scope) that many of these could be rolled into that area's to-be interface."*
  * *(11/11/2026 Cross-Reference — see `#95`)*: *"The whole flow of this "Schedule Placement Options" is a little messy.  Make sure the roadmap works on that, and tie it into the work for the Live_Dev section that's relevant."*
  * *(11/17/2026 User Note)*: *"Move 83 to future/deferred/low priority."*

### 109. [ ] Interactive Calendar View for Direct Schedule Placement & Adjustment
* **User Note**:
  * *"Add a roadmap item to build a calendar view similar to the calendar picker that allows the user to adjust and place directly on the calendar."*
  * *(11/17/2026 User Note)*: *"Maybe consider this when creating the item.  But, it has issues when the user intends the end to be open ended.  Probably nothing to do here."*

### 111. [ ] Refine Responsive Collapse Sequencing & Thresholds on `"No file selected (Required)"` and Rotation Rows (`6.d`)
* **User Note**:
  * *"6.d The sequencing of the collapses is still super awkward and happens often way way earlier than is needed. (i.e. there is a huge gap between the text and the buttons.) But, I don't want to work on it now. Make that a low priority gap."*

### 114. [ ] Systematic Worst-Case Row Width & Button Collapse Calculation Across Table Views (Including File Manager)
* **User Note**:
  * *"Add a roadmap item to the current roadmap for adjusting widths of buttons and collapses.  File Manager needs it too.  in general, the code should have a method of finding the worst, in a combination of each different type of rows, and writing the logic as if all the worst elements coexist."*
  * *(11/18/2026 User Note)*: *"Move #114 to low priority."*

### 117. [ ] Show Substitutions (Guest Host / Swap) & Evergreen Pre-Record Scheduling
* **User Note**:
  * *"Add a roadmap item for allowing show subtitutions for future shows.  Basic realworld scenario is a guest host/swap.  Additionally, there are times when a person is scheduling an evergreen (i.e. a pre-record scenario where an export has to be used), so some of that might also be rolled in too."*
  * *(11/19/2026 User Note)*: *"Make #117 a low priority item."*

### 118. [ ] Simple Station Login / Check-In Log for Workstation & Version Map Analysis
* **User Note**:
  * *"Except 9.  Add that as a low priority possible future improvement.  A simple login log that captures all that might be better.  Analysis of that can always reveal that map."*

### 120. [ ] `Folder Verification` (`Check Folders`) `Verification Log` Initial Auto-Collapse Check (`Finding 2` / `Step 15.c`)
* **User Note**:
  * *(Step 15.c — Confirm `Verification Log` starts collapsed due to detected `BetaShow1_Old`)*:
  * *"15.c, the collapse button works, but wasn't auto collapsed. I don't really need that feature. The sizing did work right and as expected between the windows. The only reason to note/fix is if there is code which is not working. Possibly defer to a mac check."*
  * *(11/24/2026 User Note)*: *"120, 132 should stay low priority."*

### 132. [ ] Station Data File Backup Recovery Redesign: 3 Old-School File Tabs (`Announcements`, `Shows`, `Logs`) With Green/Amber Status Indicators, Top-10 Parsed Backup List + Sequential Good-Backup Search, `"Try This"` Confirmation, & `"replaced malformed"` Snapshot (`Finding 14` / `Step 43.g`)
* **User Note**:
  * *(Step 43.g — Click `Try Older Backup` to confirm stepping back to an older valid backup)*:
  * *"43.g. Try older backup works. It's also all it does. There should be some explanation or older/newer or possibly a dropdown selector for this option. \"Try Older Backup\" probably needs to be up by \"Valid Backup Found\" title in the interface. The interface is also weird because it isn't obvious what you're recovering becuase of the 3 types - announcements, Shows, and logs. Maybe what we should do is this. Have the 3 sections for each \"Station Data File\" look like proper old school tabs with the entire section below them on the opening. Along with a status on the top of each folder (green light, amber light and icons). If they are good, then simply have a green status. If they are bad, then show the orange. Then, each one , regardless of status, should show a list of the current backups (probably limited to \"x\", maybe 10?, under the current file. status of each one (i.e., say you show 10, only parse those 10 for if they are malformed or not.) And if there are no good ones in the list, then for the last item, keep parsing sequentially until the newest good one is found. And add that as the last row. Whatever the most recent good one is, have that preselected. On each row that is good, let the user click \"try this\". Give them a big old \"are you sure\" warning sign, and if so, make a \"replaced malformed\" named version of the current file, and put the backup in place."*
  * *(11/24/2026 User Note)*: *"120, 132 should stay low priority."*

