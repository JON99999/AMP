/**
 * AMP Data Schema & Version Compatibility Governance Engine
 */

export const CURRENT_SCHEMA_VERSION = 1;
export const CURRENT_MIN_APP_VERSION = "0.16.0";
export const CURRENT_APP_VERSION = "0.16.7";

export interface DataMetaHeader {
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
}

export interface DataEnvelope<T> {
  _meta?: DataMetaHeader;
  AnnouncementsBackupCounter?: number;
  ShowsBackupCounter?: number;
  data: T;
}

export type CompatibilityStatus = 'COMPATIBLE' | 'OLDER_VERSION_DETECTED' | 'NEWER_VERSION_DETECTED';

export interface CompatibilityReport {
  status: CompatibilityStatus;
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  reason?: string;
}

/**
 * Clean comparison of SemVer versions (e.g., "0.16.3" vs "0.16.0")
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

/**
 * Creates a standard metadata envelope header for saved JSON stores
 */
export function createDataMetaHeader(): DataMetaHeader {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    minAppVersion: CURRENT_MIN_APP_VERSION,
    lastModifiedBy: CURRENT_APP_VERSION,
    lastModifiedAt: new Date().toISOString()
  };
}

/**
 * Deterministically normalizes and migrates a raw Announcements JSON payload into canonical Schema v1 format
 */
export function migrateAnnouncementsPayload(
  rawInput: any,
  lastModifiedBy = CURRENT_APP_VERSION,
  existingCounter = 0
): { envelope: DataEnvelope<any[]>; data: any[] } {
  let rawList: any[] = [];
  let counter = existingCounter;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    rawList = Array.isArray(rawInput.data) ? rawInput.data : [];
    if (typeof rawInput.AnnouncementsBackupCounter === 'number') {
      counter = rawInput.AnnouncementsBackupCounter;
    }
  } else if (Array.isArray(rawInput)) {
    rawList = rawInput;
  }

  const isoNow = new Date().toISOString();
  const migrated = rawList.map((item: any, idx: number) => {
    let timeGatedMp3s = Array.isArray(item.timeGatedMp3s) ? [...item.timeGatedMp3s] : [];
    if (timeGatedMp3s.length === 0 && item.mp3Url) {
      const isScript = typeof item.mp3Url === 'string' && item.mp3Url.match(/\.(txt|pdf|docx?|rtf)$/i);
      timeGatedMp3s.push({
        id: `mp3-${Date.now()}-${idx}`,
        mp3Url: item.mp3Url,
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        assetType: isScript ? 'script' : 'audio',
        backupMp3Url: '',
        approximateReadTime: '',
        duration: '',
        fileSize: ''
      });
    }

    const normalizedTimeGated = timeGatedMp3s.map((tItem: any, mIdx: number) => {
      const isScript = typeof tItem.mp3Url === 'string' && tItem.mp3Url.match(/\.(txt|pdf|docx?|rtf)$/i);
      return {
        id: tItem.id || `mp3-${Date.now()}-${idx}-${mIdx}`,
        mp3Url: tItem.mp3Url || '',
        startDate: tItem.startDate || '',
        endDate: tItem.endDate || '',
        assetType: tItem.assetType || (isScript ? 'script' : 'audio'),
        backupMp3Url: tItem.backupMp3Url || '',
        approximateReadTime: tItem.approximateReadTime || '',
        duration: tItem.duration || '',
        fileSize: tItem.fileSize || ''
      };
    });

    const meta = item.metadata || {};
    const cleanItem: any = {
      id: item.id || `ann-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: item.name || 'Untitled Announcement',
      type: item.type || 'basic-hourly',
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      minute: typeof item.minute === 'number' ? item.minute : 0,
      days: Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4, 5, 6],
      hours: Array.isArray(item.hours) ? item.hours : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      gridRules: Array.isArray(item.gridRules) ? item.gridRules : [],
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      timeGatedMp3s: normalizedTimeGated,
      metadata: {
        createdBy: meta.createdBy || 'Admin',
        createdDate: meta.createdDate || isoNow,
        lastModifiedBy: lastModifiedBy,
        lastModifiedDate: isoNow
      }
    };
    if (item.date) cleanItem.date = item.date;
    if (item.time) cleanItem.time = item.time;
    return cleanItem;
  });

  counter += 1;
  const envelope: DataEnvelope<any[]> = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: lastModifiedBy,
      lastModifiedAt: isoNow
    },
    AnnouncementsBackupCounter: counter,
    data: migrated
  };

  return { envelope, data: migrated };
}

/**
 * Deterministically normalizes and migrates a raw Shows JSON payload into canonical Schema v1 format
 */
export function migrateShowsPayload(
  rawInput: any,
  lastModifiedBy = CURRENT_APP_VERSION,
  existingCounter = 0
): { envelope: DataEnvelope<any[]>; data: any[] } {
  let rawList: any[] = [];
  let counter = existingCounter;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    rawList = Array.isArray(rawInput.data) ? rawInput.data : [];
    if (typeof rawInput.ShowsBackupCounter === 'number') {
      counter = rawInput.ShowsBackupCounter;
    }
  } else if (Array.isArray(rawInput)) {
    rawList = rawInput;
  }

  const isoNow = new Date().toISOString();
  const migrated = rawList.map((item: any, idx: number) => {
    const rawName = item.name || `Show ${idx + 1}`;
    const cleanShort = item.nameShort || rawName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16) || `Show_${idx + 1}`;
    return {
      id: item.id || `show-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: rawName,
      nameShort: cleanShort,
      day: item.day || 'Monday',
      startHour: typeof item.startHour === 'number' ? item.startHour : 9,
      startMinute: typeof item.startMinute === 'number' ? item.startMinute : 0,
      durationHours: typeof item.durationHours === 'number' ? item.durationHours : 1,
      durationMinutes: typeof item.durationMinutes === 'number' ? item.durationMinutes : 0,
      host: item.host || '',
      description: item.description || '',
      active: typeof item.active === 'boolean' ? item.active : true
    };
  });

  counter += 1;
  const envelope: DataEnvelope<any[]> = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: lastModifiedBy,
      lastModifiedAt: isoNow
    },
    ShowsBackupCounter: counter,
    data: migrated
  };

  return { envelope, data: migrated };
}

/**
 * Evaluates compatibility of a loaded JSON payload against the current AMP executable
 */
export function assessDataCompatibility(meta?: Partial<DataMetaHeader> | null): CompatibilityReport {
  const schemaVersion = meta?.schemaVersion !== undefined ? meta.schemaVersion : 0;
  const minAppVersion = meta?.minAppVersion || "0.16.0";
  const lastModifiedBy = meta?.lastModifiedBy || "0.15.0";

  // Check 1: Forward Incompatibility (File was written by a newer version requiring newer minimum app)
  if (meta?.minAppVersion && compareSemver(meta.minAppVersion, CURRENT_APP_VERSION) > 0) {
    return {
      status: 'NEWER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data requires minimum AMP version v${minAppVersion}, but current application is v${CURRENT_APP_VERSION}.`
    };
  }

  // Check 2: Backward Incompatibility (File has legacy or older schema version)
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    return {
      status: 'OLDER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data schema (v${schemaVersion}) is older than current AMP native schema (v${CURRENT_SCHEMA_VERSION}).`
    };
  }

  return {
    status: 'COMPATIBLE',
    schemaVersion,
    minAppVersion,
    lastModifiedBy
  };
}
