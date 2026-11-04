# AMP Architecture Map & User Terminology Glossary

This document serves two purposes:
1. **User-to-Code Terminology Dictionary**: Maps natural-language terms, shorthand, and casual descriptions used in prompts to their exact UI labels, state variables, and source files.
2. **System Architecture & State Map**: Provides a structural overview of how components, data stores, and state boundaries connect across the application.

> **Agent Maintenance Directive**: Keep this document updated whenever components are refactored, new views/states are added, or new recurring user shorthand terms appear in prompts.

---

## 1. User Terminology & Shorthand Dictionary

### A. `Live_Dev` Sandbox & To-Be Prototyping (`src/components/LiveDevTab.tsx`)
* **"live_def" / "Live_dev" / "to-be" / "current"**:
  * **Actual Code/UI**: `Live_Dev` tab (`src/components/LiveDevTab.tsx`), controlled by `activeViewMode` (`'current' | 'to_be'`).
* **"NOW box" / "NOW block" / "center read" / "super card"**:
  * **Actual Code/UI**: The `Now` Super Card (`nowSectionRef`) in `Live_Dev > To-Be` (or `#now-indicator` in `Current` / `PlayerTab.tsx`), which encloses active due-now announcement cards (`lr-read-now`, `mp3-due-now`, `mp3-playing`, `mp3-play-now-window`).
* **"show spacers" / "sticky shows" / "start card of the show" / "show card"**:
  * **Actual Code/UI**: Show transition boundary cards (`MockShowSpacer` in `LiveDevTab.tsx`; Show header banners in `PlayerTab.tsx`).
* **"Option 1" vs. "Option 2" (Show Spacer Concepts in `Live_Dev`)**:
  * **Option 1 (In-Flow Card)**: Standard-width (`w-[200px] mx-auto`), rounded show card sitting naturally in its chronological place in the card list (`renderInFlowSpacerCard`).
  * **Option 2 (Pinned Full-Width Banner)**: Edge-to-edge (`w-full`, `rounded-none`, 0px gap on left/right and top/bottom) sticky show banner (`renderOption2Banner`) that appears at the top (`topPinnedSpacer`) or bottom (`bottomPinnedSpacer`) whenever any part of the natural show card scrolls off-screen.
* **"mock 'now' button" / "30s Now button"**:
  * **Actual Code/UI**: The `Now` button with the `RefreshCw` icon inside the top `Live Broadcast / Time` control strip (`handleMockNowClick` in `LiveDevTab.tsx`), which triggers a full redraw (`redrawKey`) and smooth scroll recentering to the `Now` section (`scrollToNow()`).
* **"the settings page" / "settings modal" (when in `Live_Dev`)**:
  * **Actual Code/UI**: The `To-Be Layout & Window Settings` modal (`showSettingsModal` in `LiveDevTab.tsx`), opened via the purple `Settings` button in the `Live_Dev` toolbar.
* **"-x window" / "+x window" / "1 hour gating rule" / "lookaround"**:
  * **Actual Code/UI**: Temporal window settings stored in `_meta.scheduleWindow` (`windowBeforeMinutes`, `windowAfterMinutes`, `showLookaroundHours` in `src/lib/compatibility.ts` and `LiveDevTab.tsx`).
* **"Dark Test" / "dark-test" / "Multi-Theme Workbench" (`#30`)**:
  * **Actual Code/UI**: Developer theme artifact (`'dark-test'` in `src/lib/theme.ts`, `html.dark-test` in `src/index.css`, and `LiveDevTab.tsx`), retained strictly for AI Studio preview (`Live_Dev`) multi-theme prototyping and future user-customizable CSS variable theme scaffolding (never shown in production user menus).

### B. Production Player (`src/components/PlayerTab.tsx`)
* **"AMP Live" / "Live window" / "Live mode"**:
  * **Actual Code/UI**: `PlayerTab.tsx` when `playMode === 'Live'`. Uses a compact 250px outer window width in Electron (`electron-main.cjs`).
* **"regular Player>Prerecord page" / "Prerecord" / "Prerecord Next"**:
  * **Actual Code/UI**: `PlayerTab.tsx` when `playMode === 'Prerecord'`. The top section banner label is `"Prerecord"` (updated from `"Prerecord Next"` in `v0.18.1`). Also uses `src/components/PrerecordModal.tsx`.
* **"Export" / "Playlist" modes**:
  * **Actual Code/UI**: `PlayerTab.tsx` modes (`playMode === 'Export'` / `'Playlist'`) and `src/components/ExportModal.tsx` / `src/components/PlaylistSelectModal.tsx`.
* **"Live Read" / "LR" / "Script popout"**:
  * **Actual Code/UI**: Text scripts (`assetType: 'script'`) read on-air by the host. Opened in `src/components/LiveReadPopout.tsx` (or native Electron popout window via `electron-main.cjs`).
* **"PS" / "MP3" / "Audio cart"**:
  * **Actual Code/UI**: Pre-recorded audio announcement files (`assetType: 'audio'`, e.g., `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`).
* **"Drops" / "Evergreens" / "Backup play"**:
  * **Actual Code/UI**: Fallback/evergreen audio files used when a scheduled slot lacks a specific time-gated file or when manually triggered.

### C. Schedule, Folders & Global App Controls
* **"Calendar" / "Schedule grid" / "Announcements page" / "Shows page"**:
  * **Actual Code/UI**: `src/components/CalendarTab.tsx` and `src/components/CalendarModals.tsx` (manages both `Announcements` and `Shows` sub-tabs, grid rules, and time-gated MP3s).
* **"Folders" / "Storage Folders" / "Locations"**:
  * **Actual Code/UI**: `src/components/LocationsModal.tsx`, opened via the `"Folders"` button in the bottom footer bar. Configures local disk and Google Drive paths.
* **"Logs" / "Play logs"**:
  * **Actual Code/UI**: `src/components/LogTab.tsx` (displays and exports broadcast playback/read history from `logs.json`).
* **"Animation switch" / "Debug animation toggle"**:
  * **Actual Code/UI**: `animationsDisabled` state in `src/App.tsx`, which applies `.disable-animations` globally to neutralize CSS transitions, pulses, and blurs for low-CPU broadcast operation.
* **"popupmenu for the 4 modes" / "icons on the bottom right"**:
  * **Actual Code/UI**: Footer mode selector in `src/App.tsx` (`.mode-horizontal-group` and `.mode-vertical-group` / `mobileModeExpanded`), styled via `.mode-vertical-text` in `src/index.css`.
* **"what's left" / "next steps" / "roadmap"**:
  * **Actual Doc**: `dev/docs/ROADMAP_AND_BACKLOG.md` (persistent backlog and root-cause tracker maintained across sessions).

---

## 2. Core Component & File Architecture Map

### Root Entry Points
* `electron-main.cjs`:
  * Electron main process, native menus (*About AMP*), window sizing (250px width in `Live` mode vs. full width in `Admin`/`Prerecord`), `acceptsFirstMouse: true`, `backgroundThrottling: false`, and native Live Read popout windows.
* `preload.cjs`:
  * Secure IPC bridge exposing native Electron dialogs and window controls to the renderer.
* `server.ts` (~53 lines) & `src/server/`:
  * Local Express backend bundled into the desktop app (`dist/server.cjs`).
  * Modularized into `src/server/state.ts` (settings & path resolution), `src/server/storage/driveProvider.ts` (server-side AI Studio Google Drive REST storage provider & HTTP 206 byte-range audio proxy), `src/server/routes/settingsRoutes.ts`, `src/server/routes/scheduleRoutes.ts`, `src/server/routes/mediaRoutes.ts`, and `src/server/routes/showsRoutes.ts`.
  * Handles unified Local filesystem and Google Drive reads/writes (`announcements.json`, `shows.json`, `logs.json`, `amp_settings.json`), byte-range audio streaming (`/api/media/stream`), evergreen/playlist folder operations, and transactional two-phase schema upgrades (`POST /api/compatibility/upgrade`).
* `src/App.tsx` (~3,335 lines) & `src/components/app/AppOverlays.tsx`:
  * Top-level React state container, startup verification gates (`INIT -> VERIFY_PATHS -> VERIFY_FILES -> READY`), top navigation bar (`Player`, `Calendar`, `Log`, `Live_Dev`), bottom footer (`Folders`, theme switcher, `Live`/`Admin` mode indicator), and global modal overlays (`AppOverlays.tsx`, `useAudioCacheController.ts`, `useLocationsController.ts`).

### Primary Feature Views (`src/components/`)
* `PlayerTab.tsx` (~3,800 lines) & `src/components/player/`:
  * Production broadcast player supporting `Live`, `Prerecord`, `Export`, and `Playlist` modes, decomposed into `PlayerShowSpacer.tsx`, `PlayerAnnouncementCard.tsx`, `PlayerPlaylistDeckView.tsx`, `PlayerLiveTimelineView.tsx`, and `PlayerPrerecordTimelineView.tsx`.
* `CalendarTab.tsx` (~2,920 lines) & `src/components/calendar/`:
  * Schedule editor for Announcements and Shows, decomposed into `calendarHelpers.ts`, `CalendarHeaderBar.tsx`, `ShowsManagerView.tsx`, `WeeklyCalendarGrid.tsx`, `AnnouncementsListView.tsx`, and `AnnouncementEditorView.tsx`.
* `LogTab.tsx` (~1,160 lines):
  * Historical playback/read log viewer, filter, and CSV/XLSX exporter.
* `LiveDevTab.tsx` (~5,950 lines):
  * Strictly isolated AI Studio preview sandbox (`!isElectron`) for comparing `Current` vs. `To-Be` / `To-Be Merged` player layouts, sticky show spacers, temporal window settings, and multi-theme workbench experiments (`#30` `dark-test` & CSS variable scaffolding) without affecting production state.
* `LocationsModal.tsx` (~1,500 lines):
  * Unified storage folder configuration for Local Disk and Google Drive sync.
* `LiveReadPopout.tsx` (~1,000 lines):
  * Dedicated script reader modal/popout with countdown timer and "Mark as Read" logging.

### Core Domain Libraries (`src/types.ts`, `src/vite-env.d.ts`, & `src/lib/`)
* `src/types.ts` & `src/vite-env.d.ts`:
  * Single source of truth for domain and IPC interfaces (`Announcement`, `TimeGatedMp3`, `TimeGatedMediaItem`, `Show`, `LogEntry`, `LocationSettings`, `LocationPathsOverride`, `GoogleAuthConfig`, `MediaAssetFile`, `LiveReadPayload`, `ElectronAPI`) and global `Window` declarations (`window.electronAPI`, `window.ampHasUnsavedChanges`, `window.ampDiscardEdits`, `window.ampIsAudioPlaying`, `window.ampStopAllAudio`, `window.ampTriggerFocusRefresh`).
* `compatibility.ts`:
  * Canonical version (`CURRENT_APP_VERSION`), schema version (`CURRENT_SCHEMA_VERSION = 4`), `_meta` envelope creation (`createDataMetaHeader`), `_meta.scheduleWindow`, and two-phase migration normalizers (`migrateAnnouncementsPayload`, `migrateShowsPayload`) with `v0.15.4 / v0.15.5` Dual-Write Sibling Bridge support.
* `scheduleEngine.ts`:
  * Unified schedule, time-gate, and rotation domain engine consolidating station-local date bounds (`isAnnouncementWithinDateBounds`), rule matching (`isAnnouncementRuleMatch`, `isAnnouncementScheduledAtSlot`, `getAnnouncementsForSlot`, `isAnnouncementActiveInHour`), time-gated media window resolution (`getActiveMp3ForSlot`, `getMatchingMp3sForSlot`, `validateTimeGatedMp3s`), `O(1)` full-week `1, 2, 3` rotation indexing (`computeScheduledOccurrenceCount`), show-at-slot evaluation (`isTimeInShow`, `getShowsForSlot`), virtual `Up Next` promo synthesis (`buildUpNextPromoAnnouncements`), and file schedule usage metrics (`computeFileScheduleUsageMap`).
* `audioCache.ts`:
  * Dedicated client-side audio blob, duration, ID3 metadata, waveform (`mp3WaveformCache`), and encapsulated media catalog store (`mediaCatalogStore`, `upsertMediaCatalogFile`, `syncMediaCatalogFiles`, `availableFilesCache`, `driveFileNameCache`).
* `driveService.ts`:
  * Client-side OAuth token lifecycle (`getStorageApiHeaders`), local path resolver (`resolveEffectiveLocalPaths`), audio pre-caching (`updateAudioCacheWithProgress`), and thin `/api/*` delegation helpers.
* `temporalReconciliation.ts`:
  * Historical revision resolution (`resolveAnnouncementsForDate`, `resolveShowsForDate`) and planned-vs-actual log reconciliation (`reconcileScheduleAndLogs`, `doesLogMatchLocalSlot`).
* `scheduleConflicts.ts`, `scheduleDiagnostics.ts`, `scheduleGaps.ts`, `schedulePlacement.ts`:
  * Schedule validation, conflict detection, and automated slot placement helpers.

---

## 3. Data Flow & State Boundaries

1. **Persistence Layer (`Disk / Google Drive`)**:
   * `announcements.json`: Enveloped with `_meta` (`schemaVersion`, `minAppVersion`, `lastModifiedBy`, `lastModifiedAt`, `scheduleWindow`) + `data: Announcement[]`.
   * `shows.json`: Enveloped with `_meta` + `data: Show[]`.
   * `logs.json`: Broadcast execution log entries (`LogEntry[]`).
2. **Backend API Layer (`server.ts`)**:
   * Reads/writes JSON stores atomically; creates timestamped backups in `settings/backups/` prior to schema migrations.
   * Streams audio via `/api/media/stream`.
3. **Frontend State Layer (`src/App.tsx` -> Child Tabs)**:
   * `App.tsx` verifies folder paths and schema compatibility before mounting interactive tabs.
   * If data is from a newer incompatible version or unmigrated legacy version, `App.tsx` enforces **Read-Only Mode** (`ReadOnlyCompatibilityBanner.tsx`).
   * `LiveDevTab.tsx` is completely decoupled from this data flow and uses its own internal mock state.

---

## 4. Terminology Alignment & Side-Prompt Protocol

* **Seamless Translation First**: When the user uses a casual term or misnomer in a prompt, look it up in Section 1 and execute the requested task on the intended component without pedantic correction.
* **When to Side-Prompt**: If the user repeatedly refers to a UI element, button, or concept by a different name than what is displayed in the UI or named in the code (e.g., calling a section by a different label across multiple turns):
  1. Complete the user's primary request first.
  2. Add a brief, objective 1-sentence side-prompt at the end of the response:
     * *"Note: In the UI/code this is currently named `[Actual Name]` (you referred to it as `[User Term]`). Would you like me to rename it to `[User Term]` in the interface/code, or keep `[Actual Name]` and just map it in the glossary?"*
