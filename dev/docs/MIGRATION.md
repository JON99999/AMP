# AMP Data Schema & Version Compatibility Guide

This document maintains the canonical specification for AMP (Announcement Media Player) data structures, schema versioning, and cross-workstation compatibility governance.

---

## 1. Schema Version Specification

Every station data store (`announcements.json`, `shows.json`, `amp_settings.json`) embeds a standard metadata header `_meta`:

```json
{
  "_meta": {
    "schemaVersion": 1,
    "minAppVersion": "0.16.0",
    "lastModifiedBy": "0.16.3",
    "lastModifiedAt": "2026-09-24T18:00:00.000Z"
  },
  "AnnouncementsBackupCounter": 12,
  "data": [ ... ]
}
```

### Schema Attributes

* **`schemaVersion` (integer)**: Incremented monotonically whenever breaking structural changes occur in JSON data schemas or directory layouts.
* **`minAppVersion` (string)**: Lowest AMP version certified to safely parse and serialize this dataset without field loss or corruption.
* **`lastModifiedBy` (string)**: SemVer release of the AMP application that executed the most recent write.
* **`lastModifiedAt` (ISO 8601 string)**: UTC timestamp of the last write.

---

## 2. Compatibility Matrix & Runtime Behaviors

### A. Backward Incompatibility (File is Older than Native App Schema)
* **Admin Mode**:
  * Displays the **Data Upgrade Required** modal.
  * Prompts the administrator to confirm:
    > *"The data in your chosen folder is for an older version of AMP. By continuing, the data will updated to the current version. Any OTHER users of AMP for the same data will need to update to a more modern version. Please see your AMP Admin for additional help."*
  * Generates an automatic timestamped pre-upgrade backup snapshot:
    * `announcements.backup-v{oldSchema}-{timestamp}.json`
    * `shows.backup-v{oldSchema}-{timestamp}.json`
  * Upgrades schema in memory, writes `_meta`, and unlocks editing.
* **Studio, Live, and Preview Modes**:
  * Un-migrated legacy files automatically lock the workstation into **Read-Only Compatibility Mode**.
  * Audio and show schedules remain playable in memory.
  * No disk writes or play log modifications are committed.
  * Displays the persistent top banner:
    > `[READ-ONLY MODE]` *"Station data is locked. No changes or play logs will be saved in this session.  Please see the Admin to upgrade AMP."*

### B. Forward Incompatibility (File is Newer than Current App)
* **All Modes (Admin, Studio, Live, Preview)**:
  * Triggers when `file._meta.minAppVersion > currentApp.version`.
  * Displays the **Newer Data Version Detected** modal:
    > *"The data in your chosen folder is for a newer version of AMP. Please upgrade to at least v{minVersion}. We will attempt to read the old data and run in Read-Only Mode. No logs or updates will be saved in this session."*
  * Locks session into **Read-Only Compatibility Mode** to prevent legacy clients from stripping newer fields or corrupting modernized structures.

---

## 3. Schema Changelog

| Schema Version | Introduced In | Min App Version | Structural Changes & Notes |
| :--- | :--- | :--- | :--- |
| **v1** | v0.16.3 | v0.16.0 | Unified `_meta` envelope header with `schemaVersion`, `minAppVersion`, and write tracking. Pure multi-format audio tag support (`music-metadata`). |
| **v0** (Legacy) | v0.1.0 – v0.16.2 | v0.1.0 | Unversioned JSON arrays or raw `{ data: [] }` structures without `_meta` metadata envelope. |

---

## 4. Schema Upgrade Testing & Verification Protocol

Whenever modifying schemas, migration routes (`POST /api/compatibility/upgrade`), or storage normalization handlers, the following build-and-test steps MUST be executed:

### Automated Test Runner
Run the automated schema test suite from project root:
```bash
node scripts/test-schema-upgrade.cjs
```

### Test Requirements & Assertions
1. **Legacy Dataset Synthesizer**: Tests against real-world v0 payloads (unversioned arrays, missing `assetType`, root `mp3Url`).
2. **Distinct Model Integrity**:
   * **Shows**: Verifies that `day`, `startHour`, `startMinute`, `durationHours`, `durationMinutes`, `host`, `description`, and `active` are fully preserved without mutation.
   * **Announcements**: Verifies that `type`, `minute`, `days`, `hours`, `gridRules`, `timeGatedMp3s`, and `metadata` are normalized correctly.
3. **No Field Conflation**: Asserts that Announcement multi-day scheduling fields (`days: number[]`, `endHour`, `endMinute`) are never injected into Show entities.
4. **Pre-Upgrade Backup Check**: Confirms that timestamped pre-upgrade backup snapshots (`.backup-v{oldSchema}-{timestamp}.json`) are generated prior to file modification.

