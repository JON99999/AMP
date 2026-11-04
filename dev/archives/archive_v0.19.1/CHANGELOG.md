# AMP (Announcement Media Player) Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
