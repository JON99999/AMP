# Roadmap Inbox & Raw Prompt Scratchpad (`ROADMAP_newstuff.md`)

> **AGENT INTAKE PROTOCOL (MANDATORY)**
> 1. This file is the user's scratchpad/inbox for raw notes, future prompts, and todo items added while the agent is busy or between sessions.
> 2. **Every time the user asks to check the roadmap (or at the start of a roadmap turn)**, the agent MUST read this file, parse all entries under **`## Pending Inbox (To Be Ingested)`**, add them as numbered `#ID` items in `dev/docs/ROADMAP_AND_BACKLOG.md` recording **only** the verbatim `User Note` (holding off on analysis until asked), and then clear those consumed entries from the Pending section below (recording a brief 1-line receipt in **`## Ingested Batch Log`** at the bottom).

---

## Standard Entry Template (Copy/Paste or Drop Raw Notes Below)
```markdown
### [MM/DD/YYYY] Batch
1. [Raw note, bug report, or feature prompt...]
2. [Another item...]
   - 2.a. [Optional sub-detail...]
```
---

## Pending Inbox (To Be Ingested)

*(Drop any new raw text, numbered lists, or rough prompts below this line — the agent will automatically parse, move to `dev/docs/ROADMAP_AND_BACKLOG.md`, and clean up this section.)*

---

## Ingested Batch Log

- **10/19/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #14** on 10/20/2026.
- **10/23/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #17** on 10/23/2026.
- **10/24/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #20** on 10/24/2026.
- **10/29/2026 Batch (Item 1)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #28** on 10/29/2026.
- **10/29/2026 Batch (Item 1 — Duplicate Promo in Export Show Plan)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #29** and resolved/archived to `dev/docs/ROADMAP_HISTORY.md` on 10/29/2026.
- **11/03/2026 Direct Chat Prompt (Weekly Announcement Grid Removing Scheduled Days Hides Prior Calendar Events)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #42** on 11/03/2026.
- **11/03/2026 Direct Chat Prompt (Evaluate Historical Rotating Media Track Placement Tracking)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Future / Deferred / Low Priority`) as **Item #43** on 11/03/2026.
- **11/04/2026 Direct Chat Prompt (Single macOS Universal Executable & OS/Module Compatibility Audit)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #44** on 11/04/2026.
- **11/04/2026 Direct Chat Prompt (Icon Download Retry Logic & macOS Ad-Hoc Hardened Runtime)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Future / Deferred / Low Priority`) as **Items #45 & #46** on 11/04/2026.
- **11/04/2026 Direct Chat Prompt (Admin Mode Modal Warning in Folders Settings Window & Show Lookaround hh:mm Setting)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #47 & #48** on 11/04/2026.
- **11/04/2026 Direct Chat Prompt (v0.15.4 Overwriting _meta Settings, Remove Fake "Kate" Name & Scan, Save Blocking on Incomplete Gate Data, & CopyEditorModal Local Script Seed/Save Fix)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #49, #50, #51, & #52** on 11/04/2026.
- **11/05/2026 Direct Chat Prompt (`v0.20.2` Windows Test Findings: Gate Delete vs. Inactivate Rules, Schedule Window Persistence, Admin-Only Schedule Window Lock, Local File Date Column, Prerecord Export Up Next & Sequence Display, & Playlist Deck Playback/Sorting/Scoping)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #53** and resolved/archived **Items #54, #55, #56, #57, & #58** in `v0.20.3` (`dev/docs/ROADMAP_HISTORY.md`) on 11/05/2026.
- **11/05/2026 Direct Chat Prompt (`v0.20.3` Windows Delta Re-Test Findings: `Select Announcement` Horizontal Scroll Fix & Auto-Close `Export Show` Popup on Show Change)** -> Resolved and archived as **Items #59 & #60** in `dev/docs/ROADMAP_HISTORY.md` on 11/05/2026.
- **11/09/2026 Direct Chat Prompt (`v0.20.3` macOS Intel Full Test Notes `A`–`M`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #65–#74** and updated `#5b`, `#31`, `#27`, and `dev/docs/TESTING_PLAN_v0.20.4.md` on 11/09/2026.
- **11/10/2026 Direct Chat Prompt (`v0.20.5` macOS Intel Group A Notes: Startup Branded Splash Screen & Stacked Live Read WPM / `Est:` Read-Time Enhancements)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #76 & #77** on 11/10/2026.
- **11/10/2026 Direct Chat Prompt (`v0.20.5` macOS Intel Group B Notes: Global Admin Announcement, `Select Announcement` Single-Selection Flow, Gate End-Date Presets, Gate Warning Placement, `+ Add File` Row, & `Live_Dev -> To-Be` Preview Reminder)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #78** (`Future / Deferred / Low Priority`) and **Items #79–#83** (`Current / Next`) on 11/10/2026.
- **11/10/2026 Direct Chat Prompt (`v0.20.5` macOS Intel Group C Notes: Shows Editor `Short Name` Validation When `Show Name` Is Present & `Check Folders` Stranded Folder Merge / Grouped Notice Formatting / Quick Folder Buttons)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #84 & #85** on 11/10/2026.
- **11/10/2026 Direct Chat Prompt (`v0.20.5` macOS Intel Group D Notes: Per-Media-Row Inactivation Section, `Select Announcement` Copied Row Highlighting & `Copy of ... (2)` Collision Naming, plus Cross-References on `#77` & `#79`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #86 & #87** (and updated `#77` & `#79`) on 11/10/2026.
- **11/11/2026 Direct Chat Prompt (`v0.20.5` macOS Intel Group E Notes: Strip Overlapping Markdown Markers in Exported `.txt` Files & `CopyEditorModal` Default Filename Focus/Confirmation)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Item #88** (`Current / Next`) and **Item #89** (`Future / Deferred / Low Priority`) on 11/11/2026.
- **11/11/2026 Direct Chat Prompt (`#78` Concept Expansion: Path 1 App-Level Startup Warning vs. Path 2 Show/DJ Omnipresent `i`/`!` Acknowledged Message Cards in Live & Prerecord)** -> Appended verbatim `User Note` to **Item #78** in `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/11/2026.
- **11/11/2026 Direct Chat Prompt (`v0.20.6` Windows Group W-A Notes: 6-Second Splash Hold `#90`, Custom Read-Time Coercion/Validation `#91`, Gate Media Row Alignment/Duration/0-Plays/Icon-Only Edit Pencil `#92`, plus `#27` Playlist Trim/Fade/Curse-Word Masking Editor)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Items #90–#92** (`Current / Next`) and appended verbatim note to **Item #27** (`Future / Deferred / Low Priority`) on 11/11/2026.
- **11/11/2026 Direct Chat Prompt (`v0.20.6` Windows Group W-B Notes: Announcements Filter Light-Mode Color/Label/`+ Add` Collapse `#93`, Decouple Announcement & Gate End Dates + Gap-Closing Mini Buttons `#94`, Redesign `Schedule Placement Options` Flow & Tie Into `Live_Dev` `#95`, Gate Start/End Vertical Alignment & Full-Gate Border `#96`, Optional Rotation Row Text & Required-Row Duration/Multi-Select `#97`, and Simplify Last-Active-Media Inactivation Warning `#98`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #93–#98** (and cross-referenced in **Item #83**) on 11/11/2026.
- **11/11/2026 Direct Chat Prompt (`v0.20.6` Windows Group W-C Notes: Shows `Short Name` Auto Checkbox Paradigm `#99`, Return to `Check Folders` Audit After Closing `Folders` Modal `#100`, and `Check Folders` / `Merge Stranded Folder` Layout, `Shows`/`Evergreens` Radio Toggle, 5-Row Scroll Listboxes With Closest-Match Alignment, Folder Icon Buttons, `Recheck` Button, & Windows Cloud Drive Folder Deletion Handling `#101`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #99–#101** on 11/11/2026.
- **11/11/2026 Direct Chat Prompt (`v0.20.6` Windows Group W-D Notes: `CopyEditorModal` Pop-Up Warning & Single Overwrite Prompt `#102`, `Select Announcement` Table Header White Text in Light Mode `#103`, Drop `"Copy of"` Prefix & Use `<stem> (x)` Naming `#104`, and `Select Announcement` Column Layout / Icon-Only `Type` Header / `m/d/yy` Narrow Dates / Grouped `Actions` Buttons `#105`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #102–#105** on 11/11/2026.
- **11/12/2026 Direct Chat Prompt (`Issues Audit` Inactivated Gate Collision & Phrase Grouping `#106`, Gate Header & Media Row / Backup Audio Refinements `#107`, and Scrap `Schedule Placement Options` Modal for Inline Blank Gate & Interstitial Gap/Overlap/Overreach Rows `#108`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Items #106–#108** on 11/12/2026.
- **11/13/2026 Direct Chat Prompt (Interactive Calendar View for Direct Schedule Placement & Adjustment `#109`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #109** on 11/13/2026.
- **11/14/2026 Direct Chat Prompt (Global Setting for Default Live Read Font Size `#110`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #110** on 11/14/2026.
- **11/16/2026 Direct Chat Prompt (Refine Responsive Collapse Sequencing & Thresholds on `"No file selected (Required)"` and Rotation Rows `#111`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Future / Deferred / Low Priority`) as **Item #111** on 11/16/2026.
- **11/16/2026 Direct Chat Prompt (Review `(x/y)` Gate Rotation Item Flagging Across Admin vs. Casual User Interfaces `#112`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #112** and resolved/archived to `dev/docs/ROADMAP_HISTORY.md` on 11/16/2026.
- **11/16/2026 Direct Chat Prompt (Schema Roadmap for Historical Lineage of Archived, Deleted, & Current Gate/Rotation Items in `logs.json` `#113`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #113** on 11/16/2026.
- **11/17/2026 Direct Chat Prompt (Batch 5 Triage: Defer `#39` as Low Priority & Defer `#40` Sub-Items `10.a`, `10.b`, `11.a`, `12.a` With Specific Flags)** -> Moved **Items #39 & #40** to `Future / Deferred / Low Priority` in `dev/docs/ROADMAP_AND_BACKLOG.md` with verbatim notes on 11/17/2026.
- **11/17/2026 Direct Chat Prompt (Defer `#83` to `Future / Deferred / Low Priority`)** -> Moved **Item #83** to `Future / Deferred / Low Priority` in `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/17/2026.
- **11/17/2026 Direct Chat Prompt (Defer `#109` With Open-Ended Caveat Note; Move `#26`, `#78`, and Joined `#43 & #113` to `Current / Next`)** -> Updated `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/17/2026.
- **11/17/2026 Direct Chat Prompt (`#26` Concept Expansion: `Files` / `File Manager` Sub-Tab, Collapsible `Last Used` Groupings, `Archive` & `Delete` Actions, & `archived` / `deleted in app (ok to purge)` Subfolders)** -> Appended verbatim `User Note` to **Item #26** in `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/17/2026.
- **11/17/2026 Direct Chat Prompt (Systematic Worst-Case Row Width & Button Collapse Calculation Across Table Views Including File Manager `#114`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #114** on 11/18/2026.
- **11/18/2026 Scratchpad Note (AI Studio First-Run Startup & Lost-Connection Quick Reconnect Popup With Single Authenticate Button, Enter-to-Connect Input Box, & `"Go to Folders"` Button `#115`)** -> Ingested and resolved/archived to `dev/docs/ROADMAP_HISTORY.md` as **Item #115** on 11/18/2026.
- **11/18/2026 Direct Chat Prompt (Bump Version to `0.20.8`, Complete Global Default Live Read Font & Size Setting With Text Sample & Built-In Font Choices `#110`, Defer `#114` to Low Priority, & Expand `#78` Off-Air DJ Message Proposal Notes)** -> Completed and archived **Item #110** to `dev/docs/ROADMAP_HISTORY.md`, moved **Item #114** to `Future / Deferred / Low Priority`, and appended verbatim `User Note` to **Item #78** in `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/18/2026.
- **11/19/2026 Direct Chat Prompt (`#110` Font Follow-Ups, Full Implementation of `#78` Admin-to-Show Messages & App Startup Notices, & Track `11.a` Follow-Up `#116`)** -> Updated **Item #110** and archived **Item #78** in `dev/docs/ROADMAP_HISTORY.md`, and logged follow-up **Item #116** in `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) on 11/19/2026.
- **11/19/2026 Direct Chat Prompt (Show Substitutions for Guest Host / Swap & Evergreen Pre-Record Scheduling `#117`)** -> Ingested into `dev/docs/ROADMAP_AND_BACKLOG.md` (`Current / Next`) as **Item #117** on 11/19/2026.
- **11/19/2026 Direct Chat Prompt (Move `#117` to Low Priority & Add Simple Station Login Log for Workstation/Version Map Analysis `#118`)** -> Moved **Item #117** and added **Item #118** under `Future / Deferred / Low Priority` in `dev/docs/ROADMAP_AND_BACKLOG.md` on 11/19/2026.
- **11/24/2026 Antigravity Bridge Handoff (`OUTBOUND_AMP_v0.20.8_TEST_HANDOFF.md` & `OUTBOUND_AMP_v0.20.8_TEST_FINDINGS.md` — Windows `v0.20.8` Beta Test Findings 1–15)** -> Ingested verbatim into `dev/docs/ROADMAP_AND_BACKLOG.md` as **Items #119, #120, & #127** (`Future / Deferred / Low Priority`) and **Items #121–#126 & #128–#133** (`Current / Next`) and updated `#5b` on 11/24/2026.

