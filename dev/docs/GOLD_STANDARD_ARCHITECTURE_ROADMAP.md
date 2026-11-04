# AMP Gold-Standard Long-Term Architecture & UI De-Cluttering Blueprint

> **Purpose & Scope**:
> This document records the findings of the deep-dive architectural and UI de-cluttering audit conducted at `v0.19.5`.
> - **Functional Baseline**: Core application behavior, scheduling rules, coexistence bridges, and broadcast workflows are preserved as-is.
> - **Objective**: Eliminate accumulated development slop, monolithic file sprawl, duplicated domain math, and `Local` vs. `Drive` branching spaghetti, while tightening cluttered or overly wordy UI surfaces.
> - **Execution Model**: Divided into **8 self-contained, independently executable sub-topics (`#33`–`#40`)** tracked in `dev/docs/ROADMAP_AND_BACKLOG.md`. Each sub-topic can be selected, analyzed via a scoped checklist, and implemented independently without breaking adjacent systems.

---

## Part I: Code Architecture & Spaghetti Elimination (`#33`–`#36`)

### Sub-Topic 1 (`#33`): Full Server-Side Storage Provider Unification & Modular Backend (`server.ts` + `driveService.ts`)
* **Current Pain Points**:
  * In `#32`, `/api/live-read/*` and `/api/announcements/*` file mutations were unified behind a server-side storage provider in `server.ts`, removing `if (isDriveActive)` branching from `CopyEditorModal.tsx` and `LiveReadPopout.tsx`.
  * However, `useScheduleManager.ts`, `App.tsx`, `PlayerTab.tsx`, `CalendarTab.tsx`, and `LocationsModal.tsx` still contain dozens of client-side `if (settings.mode === 'Drive') { ... } else { fetch('/api/...') }` branches for `announcements.json`, `shows.json`, `logs.json`, `ShowPlaylistLog`, and folder checks.
  * `server.ts` has grown to **5,805 lines** in a single file, and `src/lib/driveService.ts` has grown to **3,457 lines** mixing Firebase Auth, Google Drive REST calls, audio blob caching, and `localStorage` settings.
* **Target Gold-Standard Architecture**:
  * **1. Complete `/api/*` Storage Routing**: Route all remaining schedule, show, log, playlist, and folder discovery operations through `/api/*` endpoints backed by the server-side storage adapter (`LocalStorageProvider` for production desktop and `DriveTestHarnessProvider` for AI Studio preview).
  * **2. Modular Backend Source Tree (`src/server/`)**: Split `server.ts` into focused TypeScript modules (`src/server/settingsStore.ts`, `src/server/storageProvider.ts`, `src/server/routes/scheduleRoutes.ts`, `src/server/routes/mediaRoutes.ts`, `src/server/routes/playlistRoutes.ts`, `src/server/routes/upgradeRoutes.ts`) imported by a lean root `server.ts` entry point (preserving the `esbuild server.ts -> dist/server.cjs` single-bundle desktop pipeline).
  * **3. Slim Client Service Layer**: Reduce `driveService.ts` to client-only AI Studio OAuth token acquisition and browser `Blob` audio caching.

---

### Sub-Topic 2 (`#34`): Monolith Component Decomposition (`CalendarTab.tsx`, `PlayerTab.tsx`, & `App.tsx`)
* **Current Pain Points**:
  * `src/components/CalendarTab.tsx` is **7,514 lines (411 KB)** in a single file containing four distinct views: the Weekly Calendar Grid, the Active/Inactive Announcements List, the Announcement Schedule & Time-Gate Editor Form, and the Shows Manager.
  * `src/components/PlayerTab.tsx` is **6,869 lines (317 KB)** in a single file combining the `Live` 3-Zone Timeline, the `Prerecord + Export` Timeline, and the `Playlist` track deck with 40+ local state hooks.
  * `src/App.tsx` is **4,598 lines (193 KB)** managing 70+ state variables, startup gates, folder verification, audio caching progress modals, and 50-prop drill chains.
* **Target Gold-Standard Architecture**:
  * **1. `CalendarTab` Decomposition (`src/components/calendar/`)**:
    * `CalendarHeaderBar.tsx`: Mode switcher (`Calendar | Announcements | Shows`), timezone badge, filter input, and audit button.
    * `WeeklyCalendarGrid.tsx`: Hour/day matrix grid, show background shading, and slot popovers.
    * `AnnouncementsListView.tsx`: Active and Inactive announcement cards, inline preview controls, and status badges.
    * `AnnouncementEditorModalOrPane.tsx`: Schedule rule editor and `TimeGatedMediaSection.tsx`.
    * `ShowsManagerView.tsx`: Show cards, show editor form, and Evergreen folder check actions.
  * **2. `PlayerTab` Decomposition (`src/components/player/`)**:
    * `PlayerLiveView.tsx`: 3-Zone `Past / Now / Future` timeline and sticky Option 2 show spacers.
    * `PlayerPrerecordView.tsx`: Prerecord timeline, custom ordering, and `Export Show` integration.
    * `PlayerPlaylistView.tsx`: Show `.m3u`/folder track deck, break insertion, and ID3 display.
    * `PlayerAnnouncementCard.tsx`: Shared, strongly-typed card renderer for Audio and Live Read items.
  * **3. `App.tsx` Shell Extraction**:
    * Move folder/location state into `useLocationsController.ts` and audio pre-caching orchestration into `useAudioCacheController.ts`, reducing `App.tsx` to a clean top-level layout and routing shell.

---

### Sub-Topic 3 (`#35`): Unified Schedule, Time-Gate & Rotation Domain Engine (`src/lib/scheduleEngine.ts`)
* **Current Pain Points**:
  * Slot generation, active time-gate matching, `1, 2, 3` media rotation math (`k % mediaItems.length`), and virtual `Up Next` promo generation are spread across multiple files with subtle variations:
    * `src/lib/utils.ts` (`getActiveMp3ForSlot`, `buildUpNextPromoAnnouncements`, `validateTimeGatedMp3s`)
    * `src/lib/temporalReconciliation.ts` (`reconcileScheduleAndLogs`, `calculateGatedTrackAudit`, `resolveAnnouncementsForDate`)
    * `src/lib/scheduleDiagnostics.ts` (`evaluateScheduleDiagnostics`)
    * `src/components/MediaPickerModal.tsx` (`computeFileScheduleUsageMap`)
    * Inline slot loops inside `PlayerTab.tsx` and `CalendarTab.tsx`.
* **Target Gold-Standard Architecture**:
  * Create a single pure domain module (`src/lib/scheduleEngine.ts`) that serves as the sole source of truth for:
    * `resolveSlotOccurrences(announcements, shows, rangeStart, rangeEnd, options)`
    * `resolveEffectiveGateAndMediaItem(announcement, slotDate)`
    * `reconcileSlotsWithLogs(slots, logs, stationTimezone)`
    * `computeAssetUsageIndex(announcements)`
  * Have `PlayerTab`, `CalendarTab`, `LogTab`, `MediaPickerModal`, and `scheduleDiagnostics` call these exact shared functions rather than maintaining separate date/slot loops.

---

### Sub-Topic 4 (`#36`): Strict TypeScript Domain Hygiene, Cache Encapsulation & Legacy Alias Cleanup
* **Current Pain Points**:
  * Loose `any` types (`driveMP3s?: any[]`, `(window as any).electronAPI`, `(ann as any).mp3Url`) bypass compile-time safety across component props and event handlers.
  * Module-level mutable `Map` singletons (`availableFilesCache`, `driveFileNameCache`, `mp3BlobCache`) are mutated directly inside React render functions (e.g., `CalendarTab.tsx` lines 108–123).
  * `LocationSettings` and `LocationPathsOverride` are re-declared in 4 separate files (`src/types.ts`, `src/lib/driveService.ts`, `server.ts`, `LocationsModal.tsx`) alongside legacy triple-folder field aliases (`localPathMP3s`, `localPathCalendar`).
* **Target Gold-Standard Architecture**:
  * **1. Canonical Types in `src/types.ts`**: Define `MediaAssetFile`, `LocationSettings`, and `Window['electronAPI']` (`src/electron.d.ts`) once and eliminate `any` casts in component props.
  * **2. Encapsulated Media Catalog Store**: Replace render-phase global `Map` mutations with an explicit `mediaCatalogStore` module updated only inside data-fetch effects/actions.
  * **3. Legacy Field Boundary**: Confine legacy field aliases (`mp3Url` flat gate fields, `localPathMP3s`, `interstitial*`) strictly to `src/lib/compatibility.ts` migration normalizers so UI components only read canonical properties.

---

## Part II: UI De-Cluttering & Copy Tightening (`#37`–`#40`)

### Sub-Topic 5 (`#37`): `CalendarTab` Header, Sub-Toolbar & Announcement Card De-Cluttering
* **Current UI Clutter / Wordiness**:
  * The `CalendarTab` header and sub-bars crowd multiple controls, verbose uppercase buttons (`+ SCHEDULE NEW ANNOUNCEMENT`, `CHECK EVERGREEN & PLAYLIST FOLDERS`), timezone badges, and filter bars into tight horizontal strips.
  * `Active` and `Inactive` Announcement cards display dense multi-line audit metadata (`Created by...`, `Last modified...`, revision counters, full gate date strings, inline `Preview:` selector, `VIEW`, `Play`, `Edit`, `Delete`) on every card at all times.
* **Target UI Cleanup**:
  * **1. Concise Studio Labels**: Shorten verbose toolbar buttons to scannable labels (`+ New Announcement`, `Check Folders`, `Audit`) with full descriptions on hover tooltips.
  * **2. Card Visual Hierarchy**: Keep primary card faces focused on **Time (`:MM`), Name, Schedule Pattern, Current Active File/Script, and Status Badge**. Move secondary audit trails (`Created / Modified / Revisions`) into a compact info popover or expandable detail row.
  * **3. Streamlined Card Actions**: Group secondary actions cleanly so each card row has high visual breathing room.

---

### Sub-Topic 6 (`#38`): Announcement & Show Editor Form Simplification (`CalendarTab` Editors)
* **Current UI Clutter / Wordiness**:
  * The Announcement Editor and Time-Gated Media section include multi-sentence instructional banners, repetitive field captions, and deeply nested bordered containers for each time gate and rotating file row.
  * Action buttons inside time gates use inconsistent, wordy labels (`Browse / Change File`, `Edit / New`, `Clear End Date`, `Apply Preset`).
  * The Show Editor repeats paragraph explanations for short names, folder mapping, and `Up Next` promo behavior.
* **Target UI Cleanup**:
  * **1. Compact Row-Based Time Gate Editor**: Present each Time Gate as a clean header bar (`Start Date -> End Date`) with a compact, numbered list of rotating media rows (`1. file.mp3 [0:30] [Play] [Browse] [↑][↓] [×]`).
  * **2. Tooltip Help Over Inline Paragraphs**: Replace inline instructional paragraphs with concise field labels and compact `?` hover/click tooltips.
  * **3. Standardized Button Vocabulary**: Unify editor button labels across all forms (`Browse`, `Edit Copy`, `+ Add File`, `+ Add Time Gate`, `Save`, `Cancel`).

---

### Sub-Topic 7 (`#39`): Settings, Help & Asset Modals De-Cluttering (`LocalHelpModal`, `LocationsModal`, `CopyEditorModal`, `MediaPickerModal`)
* **Current UI Clutter / Wordiness**:
  * `LocalHelpModal.tsx` (**1,173 lines**) mixes a multi-page documentation guide (*"How Collaborative Sync Works"*, *"Cloud Services"*, *"macOS .noindex"*) with live Admin station configuration (`Station Timezone`, `Admin Contact`, `Up Next Promo`, `Schedule Window`, and `Factory Reset`) buried at the bottom of the scroll view.
  * `LocationsModal.tsx` (**1,506 lines**) displays verbose folder explanations, macOS `.noindex` callouts, 6 individual override path inputs, and multi-step OAuth instructions simultaneously.
  * `CopyEditorModal.tsx` and `MediaPickerModal.tsx` contain wordy helper banners and crowded top control bars.
* **Target UI Cleanup**:
  * **1. Separate `Station Settings` from `User Guide`**: Split `LocalHelpModal` into two clean views or tabs: **Station Settings** (immediate access to Timezone, Admin Contact, Up Next Promo, Schedule Window, and Reset) and **Setup & Sync Guide** (documentation).
  * **2. Progressive Disclosure in `Folders` (`LocationsModal`)**: Show only the primary **Main AMP Station Folder** picker by default, keeping the 5 subfolder path overrides collapsed under an `Advanced Folder Overrides` toggle unless customized.
  * **3. Tighter `CopyEditorModal` & `MediaPickerModal` Chrome**: Condense filter/sort toolbars onto a single clean row and shorten warning/info banners to single-line studio alerts.

---

### Sub-Topic 8 (`#40`): Player Mode Chrome, Banners & Pop-Up Copy Tightening (`PlayerTab` & Mode Modals)
* **Current UI Clutter / Wordiness**:
  * Across `Live`, `Prerecord`, and `Playlist` modes (particularly at the compact `250px` width), status banners, empty-state messages, and show-selector modals (`PrerecordModal`, `PlaylistSelectModal`, `PrerecordExportPopup`) contain wordy descriptions and redundant badge labels.
* **Target UI Cleanup**:
  * **1. Broadcast-Console Brevity**: Audit all `PlayerTab` headers, show banners, card badges, and empty-state notices to use short, high-contrast, single-line labels tailored for a `250px` broadcast strip.
  * **2. Modal Prompt Tightening**: Trim verbose instructional copy in `PrerecordModal`, `PlaylistSelectModal`, and `PrerecordExportPopup` so show selection, air-date picking, and export actions require minimal reading and zero scrolling.
