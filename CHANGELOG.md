# AMP (Announcement Media Player) Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
