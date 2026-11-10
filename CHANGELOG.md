# AMP (Announcement Media Player) Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.20.4] - 2026-11-06

### Fixed & Changed
- **Help Window Runtime Cache Reset & Chromium Cache Purge (`1.a.` / `1.b.`)**: Updated `clear-app-cache` IPC in `electron-main.cjs`, `POST /api/settings/reset` (`src/server/routes/settingsRoutes.ts`), and `LocalHelpModal.tsx` so both **Keep Folders & Reset Settings** and **Full Factory Reset** purge Electron/Chromium HTTP, code, GPU, and storage caches across `AMP-Admin`, `AMP-Live`, and `AMP-Studio` in addition to settings files.
- **Anti-Cache API Headers, `500` Error Status, & Auto-Heal Cache Trap (`#61`)**:
  - Added `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` middleware for `/api/*` routes in `server.ts`, passed `{ cache: "no-store" }` on local schedule fetches in `src/App.tsx`, and changed `GET /api/announcements` error responses from cacheable HTTP `300` to `500` (`src/server/routes/scheduleRoutes.ts`).
  - Added an automatic one-time Chromium cache purge + retry in `fetchDataForMode` (`src/App.tsx`) when local folders are verified on disk (`isStartupReady && !localPathsUnavailable`) but initial endpoint fetches fail, and replaced the contradictory `"Storage Folders Required: AMP Station Location and 5-folder structure verified successfully."` state with **Schedule Sync Recovery Required** and a 1-click **Reset Cache & Reload (Keep Folders)** button.
- **Cloud Drive On-Demand Hydration Catch-Up Cascade & Syncing-File Banner (`#62`)**:
  - Added `readJsonFileWithCloudCatchUp` (`[250, 600, 1200]`ms stepped retry cascade + latest backup JSON fallback) and `statFileWithCloudCatchUp` (`[200, 500]`ms stepped retry + `cloudSyncPending: true` fallback) in `src/server/state.ts`, `src/server/routes/scheduleRoutes.ts`, and `src/server/routes/mediaRoutes.ts` so online-only cloud-synced files (Google Drive for Desktop / OneDrive without *"Available Offline"*) have time to hydrate without throwing `500`.
  - Preserved previously cached file metadata (`size`, `duration`, `mtimeMs`, `modifiedTime`) from `mediaCatalogStore` in `src/App.tsx` while files finish syncing and added a non-blocking **Cloud Drive Syncing Files** banner with a **Recheck Sync** button.
- **`Save & Close` Validation State, Focus-Refresh De-Duplication, & Atomic Local Backups (`#63`)**:
  - Updated `handleSaveLocations` and `handleSelectMode` (`src/hooks/useLocationsController.ts`) to set `setIsDriveValidated(exists)` immediately upon local folder verification, force `fetchDataForMode(nextSettings, { force: true })` to wait if a background focus refresh is mid-flight, and skip the duplicate `modal-closed` focus refresh immediately after saving.
  - Replaced raw `fs.writeFileSync` calls in `POST /api/logs` and `POST /api/trigger-backup` (`src/server/routes/scheduleRoutes.ts`) with `atomicWriteFileSync` (`temp -> rename` with retry) and made local session backup failures non-fatal in `src/App.tsx`.
- **Buried Admin Diagnostic Console Button & Terminal Error Forwarding (`#64`)**: Added a discrete **Open Diagnostic Console** button at the bottom of Section 6 (**System Maintenance & Reset**) in `LocalHelpModal.tsx` (Admin mode only) via `open-dev-tools` IPC and forwarded renderer console warnings/errors (`level >= 2`) to Terminal stdout in `electron-main.cjs`.

## [0.20.3] - 2026-11-05

### Fixed
- **Live Schedule Window Persistence Across Mode & Folder Switches (`#54`)**: Prioritized `station-settings.json` sidecar `scheduleWindow` over stale `announcements.json` `_meta.scheduleWindow` across `GET/POST /api/announcements`, `POST /api/shows`, `/api/compatibility/inspect`, `/api/compatibility/upgrade`, and `/api/trigger-backup` so edited schedule window values are never overwritten when announcements save or folders switch.
- **Admin-Only Lock on Live Schedule Window Editing (`#55`)**: Locked `Live Schedule Window` editing inside the `Local & Network Folders` help modal (`LocalHelpModal.tsx`) behind an explicit `isAdmin` check so `AMP Studio` displays the current schedule window as read-only (`Admin Only`).
- **Media Picker `File Date` Column in Local Mode (`#56`)**: Preserved `mtimeMs` and `modifiedTime` when mapping `/api/local-mp3s` in `src/App.tsx` so `Select Audio / Media` (`MediaPickerModal.tsx`) populates and sorts the `File Date` column in Local/Network mode.
- **Prerecord Export `"Up Next"` Promo & Sequence Display Correlation (`#57`)**:
  - Updated `/api/export-prerecord` (`src/server/routes/showsRoutes.ts`) to export virtual `"Up Next"` promo segments (`isUpNextPromo` / `__up_next_promo__:`) by writing `upNextScriptText` to the target `.txt` file with status `Found & Copied` instead of `Missing Source File`.
  - Filtered cancelled playlist tracks out of `itemsToExport` and passed the unified `itemsToExport` array directly into `PrerecordExportPopup.tsx` so `Plan`, `.m3u LIST`, and `Live Reads` tabs and copy buttons match the exact `01..NN` exported file sequence and load exported `.txt`/`.md` script contents.
- **Playlist Deck Active Playback Visibility, Execution-Order Sorting & Per-Slot Announcement Scoping (`#58`)**:
  - Kept actively playing playlist tracks visible in the `Next` column with a purple `Playing` state until playback finishes instead of disappearing during playback.
  - Recorded wall-clock execution timestamps (`executedAt` / `logTimeStamp`) on Live Read playlist entries and sorted `Played/Read` items by actual execution time so played tracks and played/read announcements interleave in exact chronological order played/read.
  - Scoped announcement completion keys in `playedPlaylistTracks` to `${slotISO}-${announcementId}` (`slotIsoKey`) instead of bare `announcementId` or shared `fileName` so duplicate occurrences of the same announcement later in the same show remain unplayed in `Next`.
- **`Select Announcement` File Row Horizontal Scroll Prevention (`#59`)**: Rebalanced the 5-column table widths, raised the responsive action-button icon-collapse threshold, tightened action button padding, and added `overflow-x-hidden` to `MediaPickerModal.tsx` so file rows fit cleanly without horizontal left/right scrolling.
- **Auto-Close `Export Show` Popup When Selecting a New Prerecord Show (`#60`)**: Reset `isPrerecordExportOpen` in `src/App.tsx` and called `onCloseExportPopup` on show/mode/date transitions in `src/components/PlayerTab.tsx` so the `Export Show` popup automatically closes whenever choosing or loading a new show.

## [0.20.2] - 2026-11-04

### Fixed & Changed
- **Shared One-Time Admin Mode Verification Gate in `Folders` & `Calendar` (`#47`)**: Added the one-time *"For Administrators ONLY / Enter Admin Mode"* verification gate and inline **First-Run Setup: Admin Contact Info** prompt directly inside `LocationsModal.tsx` (`Folders`) for `AMP Admin` builds, sharing session verification with `CalendarTab.tsx` so administrators verify once per session across both `Folders` (`Folders > Help`) and `Calendar`.
- **Show Lookaround `hh:mm` Setting (`#48`)**: Converted Show Lookaround in `LocalHelpModal.tsx`, `src/lib/compatibility.ts`, and `PlayerTab.tsx` from integer hours to an `hh:mm` duration setting (`showLookaroundMinutes`, default `01:00`, range `00:00` to `06:00`) while maintaining fractional `showLookaroundHours` backward compatibility.
- **Persistent Station Settings Protection Against `v0.15.4` Envelope Wipes (`#49`)**: Mirrored `_stationMeta` (`stationTimezone`, `adminContactInfo`, `upNextPromo`, `scheduleWindow`) onto `data[0]._stationMeta` inside `shows.json` and `announcements.json` and added a `settings/station_settings.json` sidecar backup so station settings automatically heal after `v0.15.4` rewrites top-level envelopes during `/api/trigger-backup`.
- **Structural Admin Contact Placeholder (`#50`)**: Replaced the placeholder example in `LocalHelpModal.tsx` with literal structural text (`"e.g., Admin 1 — admin@station.org / (555) 000-0000"`).
- **Incomplete Gate Data On-Save Warning Modal With `"Save Anyway"` & `"Return to Editor to Fix"` (`#51`)**: Updated `validateTimeGatedMp3s` (`src/lib/scheduleEngine.ts`) and `CalendarTab.tsx` to trigger the **Incomplete Gate Data** modal on save for active/upcoming missing start dates, missing file attachments, overlaps, and gaps (ignoring historical passed issues), offering both **Save Anyway** and **Return to Editor to Fix**.
- **Local Mode Live Read Script Copy Editor & `"Auto"` Read-Time Default (`#52`)**: Fixed `isDriveActive` and storage-mode header routing in `App.tsx`, `useLocationsController.ts`, `CopyEditorModal.tsx`, `MediaPickerModal.tsx`, and `driveService.ts` so local `.txt` scripts load, edit, split, and save cleanly in Local mode, and kept the **Auto** read-time calculation checkbox enabled by default when opening auto-estimated scripts.

---

## [0.20.1] - 2026-11-04

### Changed
- **Single macOS Universal Binary Installer (`#44`)**: Replaced split `--x64 --arm64` macOS packaging in `scripts/build-apps.cjs`, `package.json`, and `scripts/afterAllArtifactBuild.cjs` with a single `--mac --universal` `.dmg` target per edition (`AMP Admin-0.20.1-Mac.dmg`, `AMP Live-0.20.1-Mac.dmg`, `AMP Studio-0.20.1-Mac.dmg`) that runs natively on both Apple Silicon (`arm64`) and Intel (`x64`) Macs (macOS 12 Monterey and newer).
- **OS & Module Currency Alignment (`#44`)**: Updated in-range dependencies (`electron@42.11.18`, `electron-builder@26.18.0`, `express@4.22.3`, `react@19.3.1`, `vite@6.4.5`, `tailwindcss@4.3.4`, `date-fns@4.4.0`), refreshed the *Open Source Licenses* dialog in `electron-main.cjs`, and updated `README.md` with Universal macOS (`macOS 12+`) and Windows (`Windows 10 v1809+ / Windows 11 64-bit`) installation guidance.
- **Build Pipeline Hardening (`#45` & `#46`)**: Added 3-attempt retry with 500ms backoff in `downloadFile()` (`scripts/build-apps.cjs`) for remote GitHub icon fetches and set `build.mac.hardenedRuntime: false` (`package.json`, `scripts/build-apps.cjs`) for ad-hoc macOS signing.


---

## [0.20.0] - 2026-11-03

### Changed
- **Release Candidate Version Increment & Archive Snapshot (`v0.20.0`)**: Archived `v0.19.5` under `dev/archives/archive_v0.19.5/` and incremented application version to `v0.20.0` (`0.y.0` minor release milestone) across package manifests, Electron main process, and schema compatibility governance for pre-production candidate testing.

---

## [0.19.5] - 2026-11-03

### Added
- **Gold-Standard Code Architecture (`#33`–`#36`)**:
  - **Modular Server-Side Storage Layer (`#33`)**: Consolidated all schedule, show, log, backup, compatibility, evergreen folder verification, playlist, and byte-range streaming routes into `src/server/` (`state.ts`, `storage/driveProvider.ts`, `routes/*`) mounted by `server.ts`.
  - **Monolith Component Decomposition (`#34`)**: Extracted modular subcomponents under `src/components/calendar/`, `src/components/player/`, and `src/components/app/` along with controller hooks (`useAudioCacheController.ts`, `useLocationsController.ts`).
  - **Unified Schedule, Time-Gate & Rotation Domain Engine (`#35`)**: Centralized station-local date boundary checks, rule matching, time-gate resolution, `O(1)` rotation indexing, show-at-slot evaluation, and virtual `Up Next` promo synthesis in `src/lib/scheduleEngine.ts`.
  - **Strict TypeScript Domain Hygiene & `v0.15.4/5` Time-Gate Sibling Bridge (`#36`)**: Added canonical domain/IPC types, `mediaCatalogStore` cache encapsulation, and dual-write `TimeGatedMp3` top-level media siblings for `v0.15.4/0.15.5` coexistence.
- **Non-Destructive Announcement Gate Archiving, Reactivation & Reuse**:
  - Added `inactivated?: boolean` and `inactivatedAt?: string` on `TimeGatedMp3` so inactivating a gate preserves its original `End` date while gating out future playback and gap checks after `inactivatedAt`.
  - Separated **`Reactivate`** (for inactivated gates with future/open-ended `End` dates, with missed-slot detection and a `Reactivate With Gaps` vs. `Split to New Gate` prompt) from **`Reuse`** (clones rotating `mediaItems` into a new gate with blank `Start` and `End` dates).
  - Removed destructive `"Purge All Expired Announcements"` from `AnnouncementsListView` and added collapsible `Past / Inactivated Gates` in `AnnouncementEditorView`.
  - Added multi-file checkbox selection (`Use Selected (N)`) and `Proceed Without File` in `MediaPickerModal`, plus an **Incomplete Gate Data** on-save warning modal in `CalendarTab`.
- **Gate-Scoped Slot Assessment Engine (`SlotAssessmentScore`)**:
  - Added `calculateGateSlotAssessment` and `formatSlotAssessmentTooltip` in `src/lib/temporalReconciliation.ts` to scope `Played`, `Missed`, `Future` (`∞` when open-ended), `Cancelled`, and `Total` strictly to each gate and rotating file slot.

---

## [0.19.4] - 2026-10-31

### Added
- **Rotating Multi-Item Time-Gated Announcements (`#25` & `#31`)**: Added `mediaItems: TimeGatedMediaItem[]` value-array rotation inside each `TimeGatedMp3` time gate with deterministic start-time cycling (`1, 2, 3, 1, 2, 3...`), `(1/3)` sequence indicators, `+ Add File` and per-gate up/down reordering, `(gateId, itemIndex)` coordinate addressing across `MediaPickerModal`, `CopyEditorModal` (`SPLIT`), and script previews, and automatic migration of legacy flat media fields.
- **Unified Server-Side Storage Provider (`#32`)**: Consolidated `/api/live-read/*` (`content`, `save`, `copy-file`) and `/api/announcements/*` (`upload-file`, `rename-or-copy-file`) behind a server-side storage provider in `server.ts` that routes cleanly between the AI Studio Google Drive Test Harness (`mode === 'Drive'`) and Production Local Filesystem (`mode === 'Local'`).
- **Legacy Live Read WPM Estimate Backfill (`#28` / `#5b`)**: During schema upgrade and payload normalization (`migrateAnnouncementsPayload` and `/api/compatibility/upgrade`), legacy Live Read script cards (and historical revisions) without an approximate read time automatically compute and persist a ~150 WPM read-time estimate (`0mXXs`) whenever readable script text (`.txt` / `.md` or inline copy) is available.
- **`Live_Dev` Multi-Theme Workbench Documentation (`#30`)**: Documented the AI Studio `Live_Dev` multi-theme testing architecture (`light`, `dark`, `dark-test`, and future user-customizable theme token scaffolding) in `AGENTS.md`, `ARCHITECTURE_AND_GLOSSARY.md`, and `LiveDevTab.tsx`.

---

## [0.19.3] - 2026-10-29

### Added
- **Live & Prerecord/Export Production Promotion (`#13`, `#17`, `#21`)**: Promoted the Three-Zone `Past / Now / Future` Live Timeline, sticky Option 2 show spacers, `UP NEXT:` inline header cues, attention urgency flashes (`Pulse` vs. 2Hz `Blink`), and combined `Prerecord + Export` mode into production `PlayerTab.tsx`.
- **Prerecord Playlist Persistence & Independent Card Ordering**: Persisted custom `playlist.json` track ordering and sequence across show switches, restored saved playlist state on reopen, enabled independent up/down reordering for announcements sharing the same scheduled minute, and hid the `Played / Read` header until an item is played or marked for export.
- **User-Selectable Urgency 2Hz Step Blink Override**: Added an opt-in `"Urgency 2Hz Step Blink (When CSS Animations Off)"` checkbox (default unchecked) in the Performance Overrides modal.
- **`Live_Dev` Baseline Synchronization**: Realigned `LiveDevTab.tsx` (`Current` and `To-Be` views) with the production `v0.19.3` `PlayerTab.tsx` layout, controls, and card formatting as a clean baseline for future design work.

---

## [0.19.2] - 2026-10-27

### Added
- **Live Read `.txt` & Markdown Copy Editor**: Added in-app WYSIWYG Live Read `.txt`/`.md` editor (`+ CREATE LIVE READ`, `Edit`, and `Copy`), collapsible `View Markdown` code preview with one-click copy, `Insert Pronunciation Block` (`*(**RAY-dee-oh**)*`), `0m30s` read-time auto-estimation (`150 wpm`) with `>30s` warning banner, `Test Pop-up` preview, and same-basename backup audio pairing.
- **Select Announcement Asset Picker**: Updated the asset picker header to `Select Announcement` with a pinned top action bar (`+ CREATE LIVE READ` and `+ UPLOAD FILE` placeholder) and `Edit` / `Copy` / `Preview` actions on script files.
- **Footer Admin Contact Quick-Info (`?`)**: Added a `?` button next to the theme icons with `ADMIN CONTACT: ` tooltip and an `Admin Contact` popover card, and aligned the `Up Next` configuration row in System Maintenance & Reset.

---

## [0.19.1] - 2026-10-24

### Added
- **Auto-Seeded "Up Next" Show Promo Live Reads**: Dynamically calculates and injects `"Up Next: [Show Name]"` Live Read promo cards (`20` minutes prior to show start by default) across Live, Prerecord, Export, Playlist, Calendar, and Log reconciliation, with historical revision tracking, per-show opt-in/out checkbox, and global settings under Guide > System Maintenance & Reset.

---

## [0.19.0] - 2026-10-19

### Added
- **v0.15.4 / v0.15.5 <-> v0.19.0 Dual-Value Sibling Data Bridge**: Logs now record both legacy (`timestamp`, `announcementTime`, `logTimeStamp`) and current (`scheduledFor`, `executedAt`) sibling fields, while automatic in-place sibling and `_meta` seeding allows `v0.15.4/0.15.5` and `v0.19.0` to coexist on a shared set of `.json` files.
- **Compressed 250px Player Mode Selector Enhancements**: Added `"Mode:"` label beside the collapsed mode selector and full mode names inside the vertical popup menu, with unfocused diagonal-drag pointer-events protection.
- **Native Edit Menu & Right-Click Context Menu**: Added native `Edit` menu (`Cmd/Ctrl+C/V/X/A/Z`) and right-click `Cut / Copy / Paste / Select All` context menus across main and Live Read Electron windows.

### Fixed
- **Local vs. UTC Broadcast Slot Log Matching**: Updated Calendar and Log reconciliation to match slots in local station time across both UTC ISO (`announcementTime`/`scheduledFor`) and local timestamps, resolving false Missed counts on properly logged shows.
- **Historical `validFrom` Epoch Default & `_meta` Backup Preservation**: Seeded `validFrom` to `'1970-01-01T00:00:00.000Z'` for un-revisioned items and preserved `_meta` envelopes during `/api/trigger-backup` and `triggerDriveBackup`.
- **Show Short Name Auto-Sync & Conflict Filtering**: Allowed renaming a Show to auto-update `nameShort` and sync folder names unless manually overridden, and excluded inactive/deleted/expired items from conflict alerts.

---

## [0.18.1] - 2026-10-18

### Added
- **Schedule Window Metadata (`_meta.scheduleWindow`)**: Added optional `windowBeforeMinutes`, `windowAfterMinutes`, and `showLookaroundHours` configuration attributes to `DataMetaHeader` with default fallbacks (`5m / 5m / 1h`).
- **Live_Dev Sandbox To-Be Prototyping**: Added `LiveDevTab.tsx` sandbox for AI Studio preview testing of To-Be layouts, Option 2 sticky show spacers, and chronological timeline redraws.
- **macOS Window First-Click & Background Execution**: Enabled `acceptsFirstMouse: true` and `backgroundThrottling: false` on main and Live Read popout Electron windows.

### Changed
- **Player Prerecord Banner Label**: Updated Prerecord view header banner from `"Prerecord Next"` to `"Prerecord"`.

---

## [0.18.0] - 2026-10-07

### Changed
- **Release Version Bump**: Advanced core application version to `v0.18.0` across Electron main process, compatibility engine, and package manifests.

---

## [0.17.0] - 2026-10-01

### Milestone Release: Schema Hardening, Cross-Platform Automation & Archive Governance

This release marks a major consolidation milestone, incorporating all architectural enhancements, schema compatibility safeguards, cross-platform build hardening, and naming standardizations developed across the `v0.16.x` cycle.

### Added
- **Formal Data Schema Versioning (`_meta` Envelope)**: Structured envelope containing `schemaVersion`, `minAppVersion`, `lastModifiedBy`, and `lastModifiedAt` for `announcements.json` and `shows.json`.
- **Transactional Two-Phase Commit Schema Upgrades**: Server-side upgrade mechanism (`POST /api/compatibility/upgrade`) with atomic rollback via temporary files (`.upgrade.tmp`).
- **Automated Pre-Upgrade Backups**: Automatic timestamped backup snapshots in `settings/backups/` and on Google Drive before committing migrations.
- **Cross-Platform Release Automation**: Pure Node.js shell-agnostic tag resolution and force-tagging in GitHub Actions (`release.yml` and `sync-public.yml`).
- **Read-Only Mode Protection**: Visual and functional read-only state when connecting to data created by newer or legacy unmigrated app versions.
- **Strict Archive Immutability Governance**: Mandatory architecture rule preventing unrequested archive modification.

### Changed
- **Name Standardization**: Unified branding strictly to **AMP** / **Announcement Media Player** across all code, URLs, build logs, and documentation.
- **Live View Real-Time Pulse**: Continuous clock synchronization for show schedule resolution and immediate Next-badge clearing upon announcement playback.
- **Light Theme & Dark Theme Contrast**: Optimized Tailwind CSS v4 design tokens and banner styling.

---

## Summary of Changes Across v0.16.x (from v0.15.5)

### v0.16.10
- **Workflow Portability**: Rewrote release tag resolution in `.github/workflows/release.yml` using Node.js to guarantee cross-runner compatibility (Windows PowerShell, Linux Bash, macOS).
- **Public Repo Sync**: Enabled `--force` tag updates in `.github/workflows/sync-public.yml` to prevent tag drift.
- **String Sanitization**: Replaced all legacy naming occurrences (`Announcement-er` / `Interstitial-er`) with standard `AMP (Announcement Media Player)` and `announcement-media-player` slugs.

### v0.16.9
- **Automated CI Tagging**: Enhanced `sync-public.yml` to detect `package.json` version bumps and push release tags (`v*`) to the public repo.
- **Changelog Propagation**: Enabled `generate_release_notes: true` in `release.yml` and preserved commit messages across repository syncs.
- **Manual Workflow Triggers**: Added `workflow_dispatch` and `release: [published, created]` triggers to GitHub Actions.

### v0.16.8
- **Immediate Timeline State Clearing**: Cleared the "NEXT" break badge and active card border highlight immediately upon playback completion during the active minute.
- **Automated Sanitized Sync Pipeline**: Added `.github/workflows/sync-public.yml` to sync sanitized production code to the public distribution repository.

### v0.16.7
- **Sleep Mode Simplification**: Removed disruptive Stage 3 modal lockouts while preserving background inactivity throttling.
- **Live Clock Precision**: Replaced static snapshot timestamps with continuous real-time clock pulse for schedule and log rendering.
- **Canonical SUT Schema Upgrade Tests**: Added `scripts/test-schema-upgrade.cjs` testing production migration routines against legacy fixtures.

### v0.16.6
- **Hard Read-Only Enforcement**: Suppressed save mutations, log recording, and play log updates when running in compatibility lock.
- **Server Migration Endpoint**: Implemented `POST /api/compatibility/upgrade` with atomic pre-upgrade backups and field backfills.

### v0.16.5
- **Backup Verification**: Added local disk backup checks before schema upgrade commits.

### v0.16.4
- **Schema Compatibility Modals**: Added interactive user dialogues for older data upgrades and future version warning banners.

### v0.16.3
- **Theme Performance**: Fixed theme switching transition bottlenecks and ensured zero-latency dark/light mode toggles.

### v0.16.2
- **Atomic Disk Pipeline**: Implemented atomic temporary write file swaps for settings, announcements, and show schedules.

### v0.16.1
- **Universal Folder Selector**: Native Electron folder picker with browser directory fallback and path validation.

### v0.16.0
- **Schema Architecture Governance**: Introduced `src/lib/compatibility.ts` with `CURRENT_SCHEMA_VERSION = 1` and `CURRENT_MIN_APP_VERSION = "0.16.0"`.
