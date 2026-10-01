# AMP Archived Versions Schema & Compatibility Audit

This document records the exact, verified schema, data format, structural storage, and metadata variable evolution across all archived versions of AMP (Announcement Media Player).

---

## 1. Complete Chronological Version Schema Audit

### Current Release: v0.16.3
* **Data Schema Version**: `v1` (Formal `_meta` Envelope)
* **Schedule Storage File**: `announcements.json`
* **JSON Structure**:
  ```json
  {
    "_meta": {
      "schemaVersion": 1,
      "minAppVersion": "0.16.0",
      "lastModifiedBy": "0.16.3",
      "lastModifiedAt": "2026-09-25T15:00:00.000Z"
    },
    "AnnouncementsBackupCounter": 1,
    "data": [ ... ]
  }
  ```
* **Shows File**: `shows.json` (enveloped with `_meta`)
* **Folder Architecture**: Unified AGATE Root (`settings/`, `media_announcements/`, `media_evergreens/`, `media_shows/`, `logs/`)
* **Audio Engine**: Multi-format audio tag extraction (`music-metadata`) supporting `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`.

---

### v0.15.2 – v0.16.2
* **Data Schema Version**: `v0` (Native Announcement Unenveloped)
* **Schedule Storage File**: `announcements.json`
* **JSON Structure**:
  ```json
  {
    "AnnouncementsBackupCounter": 12,
    "data": [ ... ]
  }
  ```
* **Shows File**: `shows.json`
* **Folder Architecture**: Unified AGATE Root
* **Compatibility with v0.16.3**:
  * **Forward**: `v0.16.3` seamlessly parses `v0.15.2–v0.16.2` data and adds `_meta` upon save.
  * **Backward**: `v0.15.2–v0.16.2` safely reads the `data` array from `v0.16.3` payloads.

---

### BREAKING POINT 1: v0.15.1 ➔ v0.15.2 (Terminology & JSON Key Breaking Change)
* **Exact Transition**: `v0.15.1` (Interstitials) ➔ `v0.15.2` (Announcements)
* **Structural Breaking Changes**:
  * Root schedule file: `interstitials.json` ➔ `announcements.json`
  * Backup counter key: `InterstitialsBackupCounter` ➔ `AnnouncementsBackupCounter`
  * Log properties: `interstitialName` ➔ `announcementName`, `interstitialId` ➔ `announcementId`, `interstitialTime` ➔ `announcementTime`
  * Core entity: `Interstitial` / `InterstitialType` ➔ `Announcement` / `AnnouncementType`
* **Compatibility Status**:
  * **Forward**: `v0.16.3` Admin Upgrade modal migrates legacy `interstitials.json` to `announcements.json`.
  * **Backward**: **BROKEN**. `v0.15.1` and older will not find or read `announcements.json`.

---

### v0.15.0 – v0.15.1
* **Data Schema Version**: Legacy Interstitials v2 (Unified Storage)
* **Schedule Storage File**: `interstitials.json`
* **Shows File**: `shows.json`
* **Folder Architecture**: Unified AGATE Root (`settings/`, `media_announcements/`, `media_evergreens/`, `media_shows/`, `logs/`)

---

### BREAKING POINT 2: v0.14.4 ➔ v0.15.0 (Directory Architecture Breaking Change)
* **Exact Transition**: `v0.14.4` (Disparate Folders) ➔ `v0.15.0` (Unified AGATE Root)
* **Structural Breaking Changes**:
  * Replaced individual disparate folder paths (`localPathCalendar`, `localPathMP3s`, `localPathLogs`) with the unified single root architecture.
* **Compatibility Status**:
  * **Forward**: Requires folder path mapping in Folders / Locations modal.
  * **Backward**: **BROKEN**. `v0.14.4` and older cannot resolve nested subfolders without manual triple-folder reconfiguration.

---

### v0.14.0 – v0.14.4
* **Data Schema Version**: Legacy Interstitials v1 (Triple Folders + Shows)
* **Schedule Storage File**: `interstitials.json`
* **Shows File**: `shows.json`
* **Folder Architecture**: Disparate triple-folder configuration (`localPathCalendar`, `localPathMP3s`, `localPathLogs`).

---

### v0.12.20 – v0.13.1
* **Data Schema Version**: Legacy Interstitials v1 (Initial Shows & Overlap Management)
* **Schedule Storage File**: `interstitials.json`
* **Shows File**: `shows.json`
* **Folder Architecture**: Disparate triple-folder configuration.

---

### BREAKING POINT 3: v0.12.19 ➔ v0.12.20 (Shows & Playlist Schema Introduction)
* **Exact Transition**: `v0.12.19` (No Shows) ➔ `v0.12.20` (`shows.json` Introduced)
* **Structural Breaking Changes**:
  * Introduced `shows.json` and `Show` schedule model.
* **Compatibility Status**:
  * `v0.12.19` operates with no show or playlist capabilities.

---

### v0.1.0 – v0.12.19
* **Data Schema Version**: Legacy Interstitials v0 (Base Single Schedule)
* **Schedule Storage File**: `interstitials.json`
* **Shows File**: None.
* **Folder Architecture**: Disparate individual folders.

---

## 2. Metadata & Field-Level Variable Evolution Matrix

### A. Document & System Level Metadata (`_meta`)
* **Introduced In**: `v0.16.3`
* **Structure**:
  * `schemaVersion` (number, e.g. `1`): Monotonic schema counter.
  * `minAppVersion` (string, e.g. `"0.16.0"`): Hard lower limit for client parsing.
  * `lastModifiedBy` (string, e.g. `"0.16.3"`): App version of last save.
  * `lastModifiedAt` (ISO string): UTC write timestamp.
* **Backward Normalization**: Files prior to `v0.16.3` lack `_meta`. When reading legacy arrays or `{ data: [] }` structures, `assessDataCompatibility()` identifies them as `schemaVersion: 0` and auto-wraps upon save.

---

### B. Announcement / Interstitial Entity Fields
* **Entity Identifiers & Properties**:
  * `id` (string): Stable UUID / unique identifier.
  * `name` (string): Human-readable name.
  * `type` (`'one-time' | 'basic-hourly' | 'advanced'`): Scheduling category.
  * `enabled` (boolean): Active playback flag.
  * `minute` (number, `0-59`): Minute of the hour for trigger.
  * `date`, `time`: Required for `ONE_TIME`.
  * `days`, `hours`: Standard day/hour integer arrays.
  * `gridRules` (string[]): Specific matrix slots (e.g. `["1-10", "1-11"]`).
  * `startDate`, `endDate`: Optional date-boundary restrictions.
  * `timeGatedMp3s` (TimeGatedMp3[]): Ordered rotation / multi-asset entries.
  * `metadata`:
    * `createdBy`, `createdDate`: Authoring audit trail.
    * `lastModifiedBy`, `lastModifiedDate`: Modification audit trail.

---

### C. TimeGatedMp3 (Child Media Items) Field Evolution
* **Field History & Types**:
  * `id` (string): Item identifier.
  * `mp3Url` (string): Relative filename or streaming URL path.
  * `startDate`, `endDate` (string): Active date timeframe.
  * `duration` (string): Cached formatted duration string (e.g. `"0:30"`).
  * `fileSize` (string): Formatted byte size string.
  * `assetType` (`'audio' | 'script'`): Introduced for Live Read text / image scripts.
  * `backupMp3Url` (string): Secondary audio fallback for live script announcements.
  * `approximateReadTime` (string): Preserved estimated announcer reading time (e.g. `"~0:30"`), immune to audio duration auto-calculation overrides.
* **Normalization Logic**: `normalizeAnnouncement()` ensures missing `assetType` defaults based on file extension (`.txt`/`.pdf`/`.png` ➔ `'script'`, audio extensions ➔ `'audio'`). Missing `backupMp3Url` or `approximateReadTime` safely initialize as empty strings.

---

### D. Show Entity Fields (`shows.json`)
* **Introduced In**: `v0.12.20`
* **Structure**:
  * `id` (string): Show identifier.
  * `name` (string): Full show title.
  * `nameShort` (string): Compact name for folder mapping & UI tags.
  * `days` (number[]): Scheduled broadcast days (`0-6`).
  * `startHour`, `startMinute`, `endHour`, `endMinute` (numbers): Time boundaries.
* **Normalization Logic**: `normalizeShows()` cleans show instances and ensures `nameShort` falls back to `name` if omitted.

---

### E. Play Log Entry Fields (`logs.json` / Google Drive Logs)
* **Field History & Types**:
  * `timestamp` (string): ISO execution timestamp.
  * `announcementName` / `interstitialName` (string): Name of scheduled item.
  * `announcementId` / `interstitialId` (string): Identifier of scheduled item.
  * `announcementTime` / `interstitialTime` (string): Scheduled slot (e.g. `"10:15 AM"`).
  * `mp3Name` (string): Actual file played or script read.
  * `status` (`'played' | 'skipped' | 'failed' | 'backup play'`): Playback outcome.
  * `playMode` (`'Live' | 'Prerecord' | 'Export' | 'Playlist'`): Operating mode.
  * `assetType` (`'audio' | 'script'`): Media classification of log entry.
  * `logTimeStamp` (string): Display timestamp.

---

## 3. Compatibility Matrix Summary

| Version Range | Schedule File | Shows File | Folder Model | Metadata Envelope | Field Integrity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **v0.16.3** | `announcements.json` | `shows.json` | Unified AGATE | `_meta` (v1) | Full (Multi-format + AssetTypes) |
| **v0.15.2 – v0.16.2** | `announcements.json` | `shows.json` | Unified AGATE | Legacy v0 | Full (Auto-wrapped on save) |
| **v0.15.0 – v0.15.1** | `interstitials.json` | `shows.json` | Unified AGATE | Legacy v0 | Legacy Interstitial keys |
| **v0.14.0 – v0.14.4** | `interstitials.json` | `shows.json` | Disparate | Legacy v0 | Disparate folder config |
| **v0.12.20 – v0.13.1** | `interstitials.json` | `shows.json` | Disparate | Legacy v0 | Disparate folder config |
| **v0.1.0 – v0.12.19** | `interstitials.json` | None | Disparate | Legacy v0 | Missing Show & Playlist fields |
