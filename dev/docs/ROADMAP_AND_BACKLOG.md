# AMP Persistent Roadmap & Backlog (`ROADMAP_AND_BACKLOG.md`)

> **Agent Recall & Maintenance Protocol**:
> - **Trigger Phrases**: Whenever the user asks *"what's left"*, *"what's next"*, *"next steps"*, *"open items"*, *"roadmap"*, *"easy wins"*, or similar phrasing, **always read `dev/docs/ROADMAP_newstuff.md`, this file, and `dev/docs/ROADMAP_HISTORY.md` first**.
> - **Inbox Intake (`dev/docs/ROADMAP_newstuff.md`)**: On every roadmap check (or when `ROADMAP_newstuff.md` has pending entries), parse any raw notes in `dev/docs/ROADMAP_newstuff.md`, add them as numbered `#ID` items in this file recording **only** the verbatim `User Note` (hold off on analysis or implementation plans until asked), clear the consumed raw notes from `## Pending Inbox`, and log a 1-line receipt in `## Ingested Batch Log`.
> - **Roadmap Items Are Reminders, Not Commands**: Selecting a `#ID` opens analysis/discussion on that reminder; always present a numbered checklist separating **Core Scoped Changes** from **Related / Edge-of-Scope Suggestions** using continuous `1–N` numbering across subgroupings (e.g., `- **1.**` through `- **6.**` with nested `a., b., c.` sub-bullets so Markdown parsers never reset numbering to `1–3` under a second header) and wait for confirmation before editing files.
> - **Immutable Monotonic `#ID` Numbering (Never Renumber)**: Every new item MUST receive the next sequential integer `#ID` (`max(existing #ID across ROADMAP_AND_BACKLOG.md and ROADMAP_HISTORY.md) + 1`, so the next item added is **`#45`**). Never renumber, reuse, or shift existing `#ID`s.
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
* **Implemented & Automated Verification Complete (`v0.19.4`)**:
  * **Dual-Value Sibling Bridge (`#5`)**: Bidirectional seeding and dual-write of `logs.json` (`scheduledFor`/`executedAt` <-> `announcementTime`/`timestamp`/`logTimeStamp`), `announcements.json` (`validFrom`, `validTo`, `isDeleted`, `revisions`, `timeGatedMp3s`), and `shows.json` (`active` + temporal fields), plus automatic `_meta` healing on shared folders (`dev/docs/COEXISTENCE_AND_SIBLING_BRIDGE.md`).
  * **Legacy Script WPM Approximate Read-Time Backfill (`#28`)**: `migrateAnnouncementsPayload` (`src/lib/compatibility.ts`), `normalizeAnnouncement` (`src/lib/utils.ts`), and `resolveLocalAnnouncementScriptText` (`server.ts`) automatically compute and backfill the ~150 WPM duration (`0mXXs`, rounded up to the nearest 5s) across active `timeGatedMp3s` and historical `revisions` whenever a legacy script card (`assetType === 'script'` or `.txt`/`.md`) has `null` or missing `approximateReadTime` and readable text is available on disk or inline, while preserving any existing explicit duration (`scripts/test-schema-upgrade.ts` Stage 5).
* **What `#5b` Is Still Tracking (Pending / Dependent)**:
  * **Live Two-Version Desktop Workstation Check**:
    * On the next desktop executable build, run `v0.15.4/5` and `v0.19.4+` side-by-side against the same shared folder to confirm live coexistence, zero false Missed counts, and automatic WPM `approximateReadTime` backfill on legacy `.txt`/`.md` script cards in production.
  * **Future Sunset (`schemaVersion: 2`)**:
    * Once all station machines have permanently retired `v0.15.4/5`, remove the duplicate legacy sibling fields per `dev/docs/COEXISTENCE_AND_SIBLING_BRIDGE.md`.

### 31. [ ] Verify & Close Out: Value-Array `TimeGatedMediaItem` & `(gateId, itemIndex)` Addressing (`Option C` Refactor)
* **User Note**:
  * *"Add the section b items 9 and 10 to the current watchlist roadmap."*
  * *"While Option B is recommended, is Option C how you should be designing this feature  in the first place?  If the only tradeoff is refactoring, but the gain is \"doing it right\", then I prefer to refactor to a proper architecture."*
  * *"Yes, proceed with Option C Refactor, and then give me a list of suggested ways to test that it is working as expected."*
  * *"For now, store that testing as a way to close out 31.  I will defer for now."*
* **Implemented & Automated Verification Complete**:
  * Removed sub-item `id` from `TimeGatedMediaItem` (`src/types.ts`, `src/lib/utils.ts`, `src/lib/compatibility.ts`), preserved parent `gate.id` on `ResolvedTimeGatedMp3` (`buildResolvedGateMp3`), removed unused `trackId` from `calculateGatedTrackAudit`, and refactored all editor, `MediaPickerModal`, `CopyEditorModal` (`SPLIT`), script preview, and `scheduleDiagnostics.ts` addressing to use `(gateId, itemIndex)` coordinates (`scripts/test-schema-upgrade.ts` Stage 6).
* **Manual Verification Checklist to Close Out `#31`**:
  * **1. Reorder + File Picker Test (`MediaPickerModal`)**:
    * `a.` Open an announcement in `Calendar -> Schedule Announcements` with a time gate containing 3 rotating items (`Item 0`, `Item 1`, `Item 2`).
    * `b.` Use the up/down arrows to swap `Item 1` and `Item 2`.
    * `c.` Immediately click **Browse / Change File** on the moved row and pick a new file — verify the exact row you clicked updates its filename and duration without touching the other rows.
  * **2. Reorder + `SPLIT` Adoption Test (`CopyEditorModal`)**:
    * `a.` In an announcement editor with multiple rotating `.txt`/`.md` script items, reorder the rows or add a new row via `+ Add File`.
    * `b.` Click **Edit / New** on the 2nd or 3rd rotating item, type text, click `SPLIT`, and save the split file.
    * `c.` In the post-split adoption prompt, choose **Use New Split File** and verify the exact rotating slot (`itemIndex`) in the editor adopts the new split filename.
  * **3. Card Preview `SPLIT` Test (`Active` / `Inactive Announcements` Card)**:
    * `a.` On an `Active` or `Inactive Announcements` card that has multiple rotating scripts inside a gate, select a rotating script in the card's `Preview:` dropdown and click `VIEW` (or double-click to open the preview modal).
    * `b.` Click **Edit**, perform a `SPLIT`, and choose **Use New Split File**.
    * `c.` Verify that the specific rotating item slot inside `announcements.json` updates to the split file while sibling items in the same gate remain untouched, and the card's `Preview:` dropdown automatically selects the new split file.
  * **4. Clean Schema Persistence Check (`announcements.json`)**:
    * `a.` Save an announcement with rotating items and inspect `announcements.json` (or run `node scripts/test-schema-upgrade.cjs`).
    * `b.` Confirm that each `timeGatedMp3s[g]` gate has a single persisted `id`, while objects inside `mediaItems: [...]` contain only value properties (`fileName`, `assetType`, `duration`, `approximateReadTime`, `voiceName`, `customText`) with no redundant `id` property.

---

## 2. Current / Next
*(Default subgrouping for all newly added `#ID` items unless specified otherwise)*

> **Gold-Standard Long-Term Architecture & UI De-Cluttering Series (`#33`–`#40`)**:
> Full technical and UX breakdown is documented in `dev/docs/GOLD_STANDARD_ARCHITECTURE_ROADMAP.md` (`#33`–`#36` completed and archived in `dev/docs/ROADMAP_HISTORY.md`). Each item below is scoped as an independent sub-topic so it can be analyzed, checklist-reviewed, and implemented one at a time.

### 37. [ ] Gold-Standard Sub-Topic 5 (UI De-Cluttering): `CalendarTab` Header, Sub-Toolbar & Announcement Card De-Cluttering
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
* **Scope Summary**: Tighten verbose `CalendarTab` toolbar labels (`+ New Announcement`, `Check Folders`, `Audit`), declutter `Active`/`Inactive` Announcement cards so primary faces show only core broadcast info (Time, Name, Pattern, Active File, Status), and move verbose author/revision audit trails into a compact popover or expandable detail drawer.

### 38. [ ] Gold-Standard Sub-Topic 6 (UI De-Cluttering): Announcement & Show Editor Form Simplification (`CalendarTab` Forms)
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
* **Scope Summary**: Replace paragraph-length inline instructions in the Announcement, Time-Gate, and Show editors with concise labels and `?` tooltips, redesign Time Gate and Rotating Media items into compact single-line tabular rows, and standardize action button labels (`Browse`, `Edit Copy`, `+ Add File`).

### 39. [ ] Gold-Standard Sub-Topic 7 (UI De-Cluttering): Settings, Help & Asset Modals De-Cluttering (`LocalHelpModal`, `LocationsModal`, `CopyEditorModal`, `MediaPickerModal`)
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
* **Scope Summary**: Separate live Admin **Station Settings** (Timezone, Admin Contact, Up Next Promo, Schedule Window, Reset) from the long **Setup & Sync Guide** documentation in `LocalHelpModal.tsx`, collapse advanced 5-subfolder overrides behind an accordion in `LocationsModal.tsx`, and tighten banner/toolbar copy in `CopyEditorModal.tsx` and `MediaPickerModal.tsx`.

### 40. [ ] Gold-Standard Sub-Topic 8 (UI De-Cluttering): Player Mode Chrome, Banners & Pop-Up Copy Tightening (`PlayerTab` & Mode Modals)
* **User Note**:
  * *(Same Gold-Standard Architecture & UI De-Cluttering directive — see `#33`)*
* **Scope Summary**: Audit and tighten all `PlayerTab` mode banners, status badges, empty-state cards, and show-selector/export modals (`PrerecordModal`, `PlaylistSelectModal`, `PrerecordExportPopup`) for concise, single-line broadcast-console readability at `250px`.

### 42. [ ] Removing Scheduled Days in Weekly Announcement Grid Hides Prior Scheduled Events on Calendar
* **User Note**:
  * *"New Bug for roadmap...  When saving changes to the \"Weekly Announcement\" grid under the announcement editor... If you remove scheduled days... PRIOR events on the calendar which were scheduled are no longer shown.  This is likely a logic path that we did not consider for changes going forward vs. history."*

---

## 3. Future / Deferred / Low Priority

### 26. [ ] Explore Literal Archive Folder Retirement for Unused or Past Media Items
* **User Note**:
  * *"go ahead and create a new roadmap item for exploring the idea of being able to literally archive unused or past items by sending to an archive folder.  The functionality would need to be robust against the concept of pulling them back from retirement, and for gracefully handling any routines for displays of calendar past dates and such."*

### 27. [ ] Multi-Zone Show Play Board & Playlist Arranger Window (Consolidating `#22`, `#23`, & `#27`)
* **User Note**:
  * *"Make a roadmap item that is called \"Add bring your own playlist files option.\""*
  * *(Merged from `#22`)*: *"Explore combining Live and Playlist into one interface."*
  * *(Merged from `#23`)*: *"Explore 'show cards' outside of the scheduled interface for playing a soundboard style app and arranging mp3's if needed."*
  * *"On the roadmap, combine 22, 23, and 27 into one single item (27 is fine).  The basic functionality I'm envisioning uses the concept of the playlist mode and hos the prerecord mode incorporates playlists, but that it does the scheduling and ordering of the playlist in a \"board\" method in a separate window.  The window would have 3 basic zones.  Maybe 4.  A main zone which is the full play board for that show.  And then 2-3 \"picker\" zone where you could pick and choose audio.  One is tracks for _that show_, one is the announcements from the main AMP schedule, and the last would be standard audio clips the DJ uses on every show potentially."*

### 41. [ ] Post-Rearchitecture Development Demo Mode & Component Fork Detouring
* **User Note**:
  * *"(For #15, that needs to be shelved until this whole process is done.  So, it is a post-process for the whole thing.  After the rearchitecturing, we can rearchitect how to do demo modes in development that don't ruin active modes.  Possibly with branching forks of the main source code components that are branched by duplicating in the live code and only revealing by detouring in live mode when switch to a dev attempt.  You can make that a new roadmap item.)"*

### 43. [ ] Evaluate Whether Historical Rotating Media Track Placement Tracking Is Necessary or Feasible
* **User Note**:
  * *"On 5, this is logical, but overkill.  Move that to a new roadmap item to consider if actual rotating media track is necessary/feasible/implementable.  Right now, rely on the fact that calendars are regenerated on the fly, and rely on the fact that logs and audits don't check for which media track was played to make this only a hypothetical need.  It seems like tracking of past gate history to recreate rotating media placement is just difficult with huge overhead."*


