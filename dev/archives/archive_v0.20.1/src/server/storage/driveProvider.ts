import express from 'express';
import path from 'path';
import {
  currentSettings,
  SETTINGS_FILE,
  atomicWriteFileSync,
  generateBackupFilename
} from '../state';
import { Announcement, LogEntry, Show, DiscoveredFolderItem } from '../../types';
import {
  migrateAnnouncementsPayload,
  migrateShowsPayload,
  migrateLogsPayload,
  seedLogEntrySiblings,
  CURRENT_APP_VERSION,
  CURRENT_MIN_APP_VERSION,
  CURRENT_SCHEMA_VERSION
} from '../../lib/compatibility';

const serverDriveFolderCache = new Map<string, string>();
const serverDrivePlaylistLogFileIdCache = new Map<string, string>();
const serverDrivePlaylistLogSaveQueue = new Map<string, Promise<string>>();

const DEMO_DRIVE_FOLDERS = {
  logs: '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx',
  announcements: '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
  preferences: '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED'
};

export function isServerDriveStorageRequest(req: express.Request): boolean {
  const headerMode = String(req.headers['x-amp-storage-mode'] || '').trim();
  if (headerMode === 'Drive' || headerMode === 'Demo') return true;
  if (headerMode === 'Local') return false;
  return currentSettings.mode === 'Drive';
}

export function getEffectiveServerStorageMode(req: express.Request): 'Local' | 'Drive' | 'Demo' {
  const headerMode = String(req.headers['x-amp-storage-mode'] || '').trim();
  if (headerMode === 'Local' || headerMode === 'Drive' || headerMode === 'Demo') {
    return headerMode;
  }
  return currentSettings.mode || 'Local';
}

export function getServerDriveToken(req: express.Request): string | null {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const extracted = authHeader.slice(7).trim();
    if (extracted) return extracted;
  }
  return currentSettings.googleAuth?.accessToken || null;
}

export async function refreshServerDriveAccessToken(): Promise<string | null> {
  const refreshToken = (currentSettings.googleAuth?.refreshToken || '').trim();
  if (!refreshToken) return null;
  try {
    const playgroundRes = await fetch(
      'https://developers.google.com/oauthplayground/refreshAccessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          refresh_token: refreshToken
        })
      }
    );
    const playgroundData: any = await playgroundRes.json().catch(() => null);
    if (!playgroundData) return null;
    let accessToken: string | null = playgroundData.access_token || null;
    let expiresIn: number =
      typeof playgroundData.expires_in === 'number' ? playgroundData.expires_in : 3599;
    const encodedBody = playgroundData?.Response?.['message-body'];
    if (encodedBody && typeof encodedBody === 'string') {
      try {
        const decodedJson = JSON.parse(Buffer.from(encodedBody, 'base64').toString('utf-8'));
        if (decodedJson.access_token) accessToken = decodedJson.access_token;
        if (typeof decodedJson.expires_in === 'number') expiresIn = decodedJson.expires_in;
      } catch (_) {}
    }
    if (!accessToken) return null;
    const expiresAt = Date.now() + expiresIn * 1000;
    currentSettings.googleAuth = {
      ...(currentSettings.googleAuth || {}),
      accessToken,
      refreshToken,
      expiresAt
    };
    try {
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
    } catch (_) {}
    return accessToken;
  } catch (_) {
    return null;
  }
}

export async function serverDriveFetch(
  req: express.Request,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = getServerDriveToken(req);
  if (!token) {
    token = await refreshServerDriveAccessToken();
  }
  if (!token) {
    throw new Error('Not authenticated with Google Drive.');
  }

  let finalEndpoint = endpoint.replace(/^\//, '');
  if (finalEndpoint.startsWith('drive/v3/')) {
    const sep = finalEndpoint.includes('?') ? '&' : '?';
    if (!finalEndpoint.includes('supportsAllDrives')) {
      finalEndpoint = `${finalEndpoint}${sep}supportsAllDrives=true`;
    }
    if (
      finalEndpoint.includes('drive/v3/files?') &&
      !finalEndpoint.includes('includeItemsFromAllDrives')
    ) {
      finalEndpoint = `${finalEndpoint}&includeItemsFromAllDrives=true`;
    }
  }

  const buildHeaders = (bearer: string) => {
    const h: Record<string, string> = {};
    if (options.headers && typeof options.headers === 'object') {
      for (const [k, v] of Object.entries(options.headers as Record<string, string>)) {
        if (v !== undefined) h[k] = String(v);
      }
    }
    h['Authorization'] = `Bearer ${bearer}`;
    if (!h['Content-Type'] && !h['content-type'] && options.body && typeof options.body === 'string') {
      h['Content-Type'] = 'application/json';
    }
    return h;
  };

  let res = await fetch(`https://www.googleapis.com/${finalEndpoint}`, {
    ...options,
    headers: buildHeaders(token)
  });

  if (res.status === 401) {
    const refreshed = await refreshServerDriveAccessToken();
    if (refreshed) {
      res = await fetch(`https://www.googleapis.com/${finalEndpoint}`, {
        ...options,
        headers: buildHeaders(refreshed)
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive API error (${res.status}): ${errText || res.statusText}`);
  }

  return res;
}

export async function serverDriveListFolderFiles(
  req: express.Request,
  folderId: string
): Promise<Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }>> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await serverDriveFetch(
    req,
    `drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=1000`
  );
  const data: any = await res.json().catch(() => ({}));
  return Array.isArray(data.files) ? data.files : [];
}

export async function serverDriveFindFileCaseInsensitive(
  req: express.Request,
  name: string,
  folderId: string
): Promise<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string } | null> {
  const files = await serverDriveListFolderFiles(req, folderId);
  const targetLower = name.toLowerCase();
  return files.find(f => String(f.name || '').toLowerCase() === targetLower) || null;
}

export async function serverDriveCreateFileInFolder(
  req: express.Request,
  name: string,
  folderId: string,
  mimeType: string = 'application/json'
): Promise<string> {
  const res = await serverDriveFetch(req, 'drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      parents: [folderId],
      mimeType
    })
  });
  const data: any = await res.json();
  return data.id;
}

export async function serverDriveUploadFileContent(
  req: express.Request,
  fileId: string,
  content: string | Buffer,
  mimeType: string = 'application/json'
): Promise<void> {
  await serverDriveFetch(
    req,
    `upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': mimeType },
      body: content as any
    }
  );
}

function getHeaderOrSettingFolder(
  req: express.Request,
  headerKey: string,
  settingVal?: string,
  demoVal?: string
): string {
  const mode = getEffectiveServerStorageMode(req);
  if (mode === 'Demo' && demoVal) return demoVal;
  const hVal = String(req.headers[headerKey] || '').trim();
  if (hVal) return hVal;
  return (settingVal || '').trim();
}

function getRootDriveFolderId(req: express.Request): string {
  return getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-amp',
    currentSettings.driveFolderAmp
  );
}

async function resolveOrCreateSubfolderInRoot(
  req: express.Request,
  rootFolder: string,
  cachePrefix: string,
  candidates: string[],
  defaultCreateName: string
): Promise<string> {
  const cacheKey = `${cachePrefix}:${rootFolder}`;
  const cached = serverDriveFolderCache.get(cacheKey);
  if (cached) return cached;

  const children = await serverDriveListFolderFiles(req, rootFolder);
  for (const candidate of candidates) {
    const matched = children.find(
      f =>
        f.mimeType === 'application/vnd.google-apps.folder' &&
        String(f.name || '').toLowerCase() === candidate.toLowerCase()
    );
    if (matched) {
      serverDriveFolderCache.set(cacheKey, matched.id);
      return matched.id;
    }
  }

  const createdId = await serverDriveCreateFileInFolder(
    req,
    defaultCreateName,
    rootFolder,
    'application/vnd.google-apps.folder'
  );
  serverDriveFolderCache.set(cacheKey, createdId);
  return createdId;
}

export async function resolveServerDriveSettingsFolderId(req: express.Request): Promise<string> {
  const override = getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-preferences',
    currentSettings.driveFolderPreferences,
    DEMO_DRIVE_FOLDERS.preferences
  );
  if (override) return override;

  const rootFolder = getRootDriveFolderId(req);
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  return resolveOrCreateSubfolderInRoot(
    req,
    rootFolder,
    'settings',
    ['settings', 'preferences'],
    'settings'
  );
}

export async function resolveServerDriveLogsFolderId(req: express.Request): Promise<string> {
  const override = getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-logs',
    currentSettings.driveFolderLogs,
    DEMO_DRIVE_FOLDERS.logs
  );
  if (override) return override;

  const rootFolder = getRootDriveFolderId(req);
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  return resolveOrCreateSubfolderInRoot(req, rootFolder, 'logs', ['logs'], 'logs');
}

export async function resolveServerDriveAnnouncementsFolderId(req: express.Request): Promise<string> {
  const override = getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-announcements',
    currentSettings.driveFolderAnnouncements || currentSettings.driveFolderMP3s,
    DEMO_DRIVE_FOLDERS.announcements
  );
  if (override) return override;

  const rootFolder = getRootDriveFolderId(req);
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  return resolveOrCreateSubfolderInRoot(
    req,
    rootFolder,
    'announcements',
    ['media_announcements', 'mediaannouncements', 'announcements'],
    'media_announcements'
  );
}

export async function resolveServerDriveEvergreensFolderId(req: express.Request): Promise<string> {
  const override = getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-evergreens',
    currentSettings.driveFolderEvergreens
  );
  if (override) return override;

  const rootFolder = getRootDriveFolderId(req);
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  return resolveOrCreateSubfolderInRoot(
    req,
    rootFolder,
    'evergreens',
    ['media_evergreens', 'mediaevergreens', 'evergreens'],
    'media_evergreens'
  );
}

export async function resolveServerDriveShowsFolderId(req: express.Request): Promise<string> {
  const override = getHeaderOrSettingFolder(
    req,
    'x-amp-drive-folder-shows',
    currentSettings.driveFolderShows
  );
  if (override) return override;

  const rootFolder = getRootDriveFolderId(req);
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  return resolveOrCreateSubfolderInRoot(
    req,
    rootFolder,
    'shows',
    ['media_shows', 'mediashows', 'shows', 'playlists'],
    'media_shows'
  );
}

export async function resolveServerDriveBackupsFolderId(
  req: express.Request,
  parentFolderId: string
): Promise<string> {
  return resolveOrCreateSubfolderInRoot(
    req,
    parentFolderId,
    'backups',
    ['backups'],
    'backups'
  );
}

export async function resolveServerDriveLogHistoryFolderId(
  req: express.Request,
  logsFolderId?: string
): Promise<string> {
  const targetParent = logsFolderId || (await resolveServerDriveLogsFolderId(req));
  return resolveOrCreateSubfolderInRoot(
    req,
    targetParent,
    'loghistory',
    ['loghistory', 'backups'],
    'loghistory'
  );
}

// ============================================================================
// Core JSON Stores on Drive (announcements.json, shows.json, logs.json)
// ============================================================================

export async function readDriveAnnouncements(
  req: express.Request,
  withEnvelope: boolean = false
): Promise<any> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  let found = await serverDriveFindFileCaseInsensitive(req, 'announcements.json', settingsFolder);
  if (!found) {
    const fileId = await serverDriveCreateFileInFolder(req, 'announcements.json', settingsFolder);
    const initial = migrateAnnouncementsPayload(
      { AnnouncementsBackupCounter: 0, data: [] },
      CURRENT_APP_VERSION,
      -1
    );
    await serverDriveUploadFileContent(req, fileId, JSON.stringify(initial.envelope, null, 2));
    if (withEnvelope) {
      return {
        _meta: initial.envelope._meta,
        AnnouncementsBackupCounter: 0,
        data: []
      };
    }
    return [];
  }

  const res = await serverDriveFetch(req, `drive/v3/files/${found.id}?alt=media`);
  const text = await res.text();
  const parsed = JSON.parse(text || '[]');
  const lastMod =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._meta?.lastModifiedBy
      ? parsed._meta.lastModifiedBy
      : CURRENT_APP_VERSION;
  const migrated = migrateAnnouncementsPayload(parsed, lastMod, 0);
  if (withEnvelope) {
    return {
      _meta: migrated.envelope._meta || parsed?._meta || null,
      AnnouncementsBackupCounter: parsed?.AnnouncementsBackupCounter || 0,
      data: migrated.data
    };
  }
  return migrated.data;
}

export async function writeDriveAnnouncements(
  req: express.Request,
  rawPayload: any
): Promise<{ success: boolean; _meta: any }> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  let found = await serverDriveFindFileCaseInsensitive(req, 'announcements.json', settingsFolder);
  let fileId = found?.id || '';
  let counter = 0;
  let existingMeta: any = null;

  if (fileId) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${fileId}?alt=media`);
      const parsed = JSON.parse((await res.text()) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counter = parsed.AnnouncementsBackupCounter || 0;
        existingMeta = parsed._meta || null;
      }
    } catch (_) {}
  } else {
    fileId = await serverDriveCreateFileInFolder(req, 'announcements.json', settingsFolder);
  }

  const schedules: Announcement[] = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(rawPayload?.data)
      ? rawPayload.data
      : [];

  const migrated = migrateAnnouncementsPayload(
    {
      _meta: rawPayload?._meta || existingMeta,
      AnnouncementsBackupCounter: counter,
      data: schedules
    },
    CURRENT_APP_VERSION,
    counter
  );

  await serverDriveUploadFileContent(req, fileId, JSON.stringify(migrated.envelope, null, 2));
  return { success: true, _meta: migrated.envelope._meta };
}

export async function readDriveShows(
  req: express.Request,
  withEnvelope: boolean = false
): Promise<any> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  const found = await serverDriveFindFileCaseInsensitive(req, 'shows.json', settingsFolder);
  if (!found) {
    const fileId = await serverDriveCreateFileInFolder(req, 'shows.json', settingsFolder);
    const initialShows = migrateShowsPayload({ ShowsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
    await serverDriveUploadFileContent(req, fileId, JSON.stringify(initialShows.envelope, null, 2));
    if (withEnvelope) {
      return {
        _meta: initialShows.envelope._meta,
        stationTimezone: undefined,
        hasSavedTimezone: false,
        adminContactInfo: '',
        hasSavedAdminContact: false,
        upNextPromo: { enabled: true, minutesBefore: 20 },
        scheduleWindow: { windowBeforeMinutes: 5, windowAfterMinutes: 5, showLookaroundHours: 1 },
        ShowsBackupCounter: 0,
        data: []
      };
    }
    return [];
  }

  const res = await serverDriveFetch(req, `drive/v3/files/${found.id}?alt=media`);
  const parsed = JSON.parse((await res.text()) || '[]');
  const hasSavedTimezone = Boolean(
    parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed.stationTimezone || parsed._meta?.stationTimezone)
  );
  const hasSavedAdminContact = Boolean(
    parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      (parsed.adminContactInfo !== undefined || parsed._meta?.adminContactInfo !== undefined)
  );
  const lastMod =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._meta?.lastModifiedBy
      ? parsed._meta.lastModifiedBy
      : CURRENT_APP_VERSION;
  const seededResult = migrateShowsPayload(parsed, lastMod);
  if (withEnvelope) {
    return {
      _meta: seededResult.envelope._meta || parsed?._meta || null,
      stationTimezone: seededResult.envelope.stationTimezone,
      hasSavedTimezone,
      adminContactInfo: seededResult.envelope.adminContactInfo || '',
      hasSavedAdminContact,
      upNextPromo: seededResult.envelope.upNextPromo || { enabled: true, minutesBefore: 20 },
      scheduleWindow:
        seededResult.envelope.scheduleWindow ||
        seededResult.envelope._meta?.scheduleWindow ||
        { windowBeforeMinutes: 5, windowAfterMinutes: 5, showLookaroundHours: 1 },
      ShowsBackupCounter: parsed?.ShowsBackupCounter || 0,
      data: seededResult.data
    };
  }
  return seededResult.data;
}

export async function writeDriveShows(
  req: express.Request,
  rawPayload: any
): Promise<{ success: boolean; _meta: any }> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  const found = await serverDriveFindFileCaseInsensitive(req, 'shows.json', settingsFolder);
  let fileId = found?.id || '';
  let counter = 0;
  let existingMeta: any = null;
  let existingAdminContact: string | undefined = undefined;
  let existingUpNextPromo: any = undefined;
  let existingScheduleWindow: any = undefined;

  if (fileId) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${fileId}?alt=media`);
      const parsed = JSON.parse((await res.text()) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counter = parsed.ShowsBackupCounter || 0;
        existingMeta = parsed._meta || null;
        existingAdminContact =
          parsed.adminContactInfo !== undefined ? parsed.adminContactInfo : parsed._meta?.adminContactInfo;
        existingUpNextPromo = parsed.upNextPromo || parsed._meta?.upNextPromo;
        existingScheduleWindow = parsed.scheduleWindow || parsed._meta?.scheduleWindow;
      }
    } catch (_) {}
  } else {
    fileId = await serverDriveCreateFileInFolder(req, 'shows.json', settingsFolder);
  }

  const shows: Show[] = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(rawPayload?.data)
      ? rawPayload.data
      : [];
  const explicitTz: string | undefined =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? rawPayload.stationTimezone
      : undefined;
  const explicitAdminContact: string | undefined =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? rawPayload.adminContactInfo
      : undefined;
  const explicitUpNextPromo =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? rawPayload.upNextPromo
      : undefined;
  const explicitScheduleWindow =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? rawPayload.scheduleWindow
      : undefined;

  const migrated = migrateShowsPayload(
    {
      _meta: rawPayload?._meta || existingMeta,
      ShowsBackupCounter: counter,
      data: shows,
      ...(existingAdminContact !== undefined ? { adminContactInfo: existingAdminContact } : {}),
      ...(existingUpNextPromo !== undefined ? { upNextPromo: existingUpNextPromo } : {}),
      ...(existingScheduleWindow !== undefined ? { scheduleWindow: existingScheduleWindow } : {})
    },
    CURRENT_APP_VERSION,
    counter,
    explicitTz,
    explicitAdminContact,
    explicitUpNextPromo,
    explicitScheduleWindow
  );

  await serverDriveUploadFileContent(req, fileId, JSON.stringify(migrated.envelope, null, 2));
  return { success: true, _meta: migrated.envelope._meta };
}

export async function readDriveLogs(req: express.Request): Promise<LogEntry[]> {
  const logsFolder = await resolveServerDriveLogsFolderId(req);
  const found = await serverDriveFindFileCaseInsensitive(req, 'logs.json', logsFolder);
  if (!found) {
    const fileId = await serverDriveCreateFileInFolder(req, 'logs.json', logsFolder);
    const initialLogs = migrateLogsPayload({ LogsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
    await serverDriveUploadFileContent(req, fileId, JSON.stringify(initialLogs.envelope, null, 2));
    return [];
  }
  const res = await serverDriveFetch(req, `drive/v3/files/${found.id}?alt=media`);
  const parsed = JSON.parse((await res.text()) || '[]');
  const rawLogs =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Array.isArray(parsed.data)
        ? parsed.data
        : []
      : Array.isArray(parsed)
        ? parsed
        : [];
  return rawLogs.map((entry: any) => seedLogEntrySiblings(entry));
}

export async function appendDriveLog(req: express.Request, rawEntry: any): Promise<LogEntry[]> {
  const entry = seedLogEntrySiblings(rawEntry);
  const logsFolder = await resolveServerDriveLogsFolderId(req);
  const found = await serverDriveFindFileCaseInsensitive(req, 'logs.json', logsFolder);
  let fileId = found?.id || '';
  let logs: LogEntry[] = [];
  let counter = 0;

  if (fileId) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${fileId}?alt=media`);
      const parsed = JSON.parse((await res.text()) || '[]');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        logs = Array.isArray(parsed.data) ? parsed.data : [];
        counter = parsed.LogsBackupCounter || 0;
      } else {
        logs = Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {}
  } else {
    fileId = await serverDriveCreateFileInFolder(req, 'logs.json', logsFolder);
  }

  logs = logs.map((item: any) => seedLogEntrySiblings(item));
  logs.push(entry);

  const migrated = migrateLogsPayload(
    { LogsBackupCounter: counter, data: logs },
    CURRENT_APP_VERSION,
    counter
  );
  await serverDriveUploadFileContent(req, fileId, JSON.stringify(migrated.envelope, null, 2));
  return migrated.data;
}

// ============================================================================
// Compatibility Inspection, Pre-Upgrade Backup & Schema Upgrade on Drive
// ============================================================================

export async function inspectServerDriveCompatibility(req: express.Request): Promise<{
  success: boolean;
  meta: any;
  announcementsMeta: any;
  showsMeta: any;
}> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  const logsFolder = await resolveServerDriveLogsFolderId(req);

  let announcementsMeta: any = null;
  let showsMeta: any = null;
  let parsedLogsForBackfill: any = undefined;

  const logsFile = await serverDriveFindFileCaseInsensitive(req, 'logs.json', logsFolder);
  if (logsFile) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${logsFile.id}?alt=media`);
      parsedLogsForBackfill = JSON.parse((await res.text()) || '{}');
    } catch (_) {}
  }

  const showsFile = await serverDriveFindFileCaseInsensitive(req, 'shows.json', settingsFolder);
  if (showsFile) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${showsFile.id}?alt=media`);
      const parsed = JSON.parse((await res.text()) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
        if (!parsed._meta) {
          const counter =
            typeof parsed.ShowsBackupCounter === 'number'
              ? Math.max(0, parsed.ShowsBackupCounter - 1)
              : 0;
          const seeded = migrateShowsPayload(parsed, CURRENT_APP_VERSION, counter);
          await serverDriveUploadFileContent(
            req,
            showsFile.id,
            JSON.stringify(seeded.envelope, null, 2)
          );
          showsMeta = seeded.envelope._meta;
        } else {
          showsMeta = parsed._meta;
        }
      } else {
        showsMeta = { schemaVersion: 0, minAppVersion: '0.15.0', lastModifiedBy: '0.15.0' };
      }
    } catch (_) {}
  }

  const calFile = await serverDriveFindFileCaseInsensitive(req, 'announcements.json', settingsFolder);
  if (calFile) {
    try {
      const res = await serverDriveFetch(req, `drive/v3/files/${calFile.id}?alt=media`);
      const parsed = JSON.parse((await res.text()) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
        if (!parsed._meta) {
          const counter =
            typeof parsed.AnnouncementsBackupCounter === 'number'
              ? Math.max(0, parsed.AnnouncementsBackupCounter - 1)
              : 0;
          const seeded = migrateAnnouncementsPayload(
            parsed,
            CURRENT_APP_VERSION,
            counter,
            parsedLogsForBackfill
          );
          await serverDriveUploadFileContent(
            req,
            calFile.id,
            JSON.stringify(seeded.envelope, null, 2)
          );
          announcementsMeta = seeded.envelope._meta;
        } else {
          announcementsMeta = parsed._meta;
        }
      } else {
        announcementsMeta = { schemaVersion: 0, minAppVersion: '0.15.0', lastModifiedBy: '0.15.0' };
      }
    } catch (_) {}
  }

  const activeMeta = announcementsMeta ||
    showsMeta || {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: CURRENT_APP_VERSION
    };
  return { success: true, meta: activeMeta, announcementsMeta, showsMeta };
}

export async function upgradeServerDriveSchema(req: express.Request): Promise<{
  success: boolean;
  meta: any;
  announcements: Announcement[];
  shows: Show[];
  logs: LogEntry[];
  backupsCreated: string[];
}> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  const backupsFolder = await resolveServerDriveBackupsFolderId(req, settingsFolder);
  const logsFolder = await resolveServerDriveLogsFolderId(req);

  const annFile = await serverDriveFindFileCaseInsensitive(req, 'announcements.json', settingsFolder);
  let rawAnnContent = '[]';
  if (annFile) {
    const res = await serverDriveFetch(req, `drive/v3/files/${annFile.id}?alt=media`);
    rawAnnContent = await res.text();
  }
  const rawAnnParsed = JSON.parse(rawAnnContent || '[]');

  const showsFile = await serverDriveFindFileCaseInsensitive(req, 'shows.json', settingsFolder);
  let rawShowsContent = '[]';
  if (showsFile) {
    const res = await serverDriveFetch(req, `drive/v3/files/${showsFile.id}?alt=media`);
    rawShowsContent = await res.text();
  }
  const rawShowsParsed = JSON.parse(rawShowsContent || '[]');

  const logsFile = await serverDriveFindFileCaseInsensitive(req, 'logs.json', logsFolder);
  let rawLogsContent = '[]';
  if (logsFile) {
    const res = await serverDriveFetch(req, `drive/v3/files/${logsFile.id}?alt=media`);
    rawLogsContent = await res.text();
  }
  const rawLogsParsed = JSON.parse(rawLogsContent || '[]');

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupsCreated: string[] = [];

  const writeBackupSnapshot = async (name: string, content: string) => {
    const existing = await serverDriveFindFileCaseInsensitive(req, name, backupsFolder);
    const id = existing
      ? existing.id
      : await serverDriveCreateFileInFolder(req, name, backupsFolder);
    await serverDriveUploadFileContent(req, id, content);
    backupsCreated.push(name);
  };

  await writeBackupSnapshot(`announcements.backup-pre-upgrade-${timestampStr}.json`, rawAnnContent);
  await writeBackupSnapshot(`shows.backup-pre-upgrade-${timestampStr}.json`, rawShowsContent);
  if (logsFile) {
    await writeBackupSnapshot(`logs.backup-pre-upgrade-${timestampStr}.json`, rawLogsContent);
  }

  const showsMigration = migrateShowsPayload(rawShowsParsed, CURRENT_APP_VERSION);
  const logsMigration = migrateLogsPayload(rawLogsParsed, CURRENT_APP_VERSION);
  const annMigration = migrateAnnouncementsPayload(
    rawAnnParsed,
    CURRENT_APP_VERSION,
    0,
    rawLogsParsed
  );

  const targetAnnId = annFile
    ? annFile.id
    : await serverDriveCreateFileInFolder(req, 'announcements.json', settingsFolder);
  await serverDriveUploadFileContent(req, targetAnnId, JSON.stringify(annMigration.envelope, null, 2));

  const targetShowsId = showsFile
    ? showsFile.id
    : await serverDriveCreateFileInFolder(req, 'shows.json', settingsFolder);
  await serverDriveUploadFileContent(
    req,
    targetShowsId,
    JSON.stringify(showsMigration.envelope, null, 2)
  );

  if (logsFile) {
    await serverDriveUploadFileContent(
      req,
      logsFile.id,
      JSON.stringify(logsMigration.envelope, null, 2)
    );
  }

  return {
    success: true,
    meta: annMigration.envelope._meta,
    announcements: annMigration.data,
    shows: showsMigration.data,
    logs: logsMigration.data,
    backupsCreated
  };
}

export async function triggerServerDriveBackup(
  req: express.Request,
  workstationMode?: string
): Promise<{ success: boolean }> {
  const settingsFolder = await resolveServerDriveSettingsFolderId(req);
  const settingsBackupsFolder = await resolveServerDriveBackupsFolderId(req, settingsFolder);
  const logsFolder = await resolveServerDriveLogsFolderId(req);
  const logsBackupsFolder = await resolveServerDriveLogHistoryFolderId(req, logsFolder);

  // 1. Announcements backup
  let annFile = await serverDriveFindFileCaseInsensitive(req, 'announcements.json', settingsFolder);
  if (!annFile) {
    const newId = await serverDriveCreateFileInFolder(req, 'announcements.json', settingsFolder);
    const initial = migrateAnnouncementsPayload(
      { AnnouncementsBackupCounter: 0, data: [] },
      CURRENT_APP_VERSION,
      -1
    );
    await serverDriveUploadFileContent(req, newId, JSON.stringify(initial.envelope, null, 2));
    annFile = { id: newId, name: 'announcements.json', mimeType: 'application/json' };
  }
  {
    const res = await serverDriveFetch(req, `drive/v3/files/${annFile.id}?alt=media`);
    const parsed = JSON.parse((await res.text()) || '[]');
    const existingCounter = Array.isArray(parsed) ? 0 : parsed.AnnouncementsBackupCounter || 0;
    const migrated = migrateAnnouncementsPayload(
      parsed,
      parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
      existingCounter
    );
    const updatedStr = JSON.stringify(migrated.envelope, null, 2);
    await serverDriveUploadFileContent(req, annFile.id, updatedStr);

    const backupFileName = generateBackupFilename('announcements', workstationMode);
    const backupId = await serverDriveCreateFileInFolder(req, backupFileName, settingsBackupsFolder);
    await serverDriveUploadFileContent(req, backupId, updatedStr);
  }

  // 2. Shows backup
  let showsFile = await serverDriveFindFileCaseInsensitive(req, 'shows.json', settingsFolder);
  if (!showsFile) {
    const newId = await serverDriveCreateFileInFolder(req, 'shows.json', settingsFolder);
    const initial = migrateShowsPayload({ ShowsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
    await serverDriveUploadFileContent(req, newId, JSON.stringify(initial.envelope, null, 2));
    showsFile = { id: newId, name: 'shows.json', mimeType: 'application/json' };
  }
  {
    const res = await serverDriveFetch(req, `drive/v3/files/${showsFile.id}?alt=media`);
    const parsed = JSON.parse((await res.text()) || '[]');
    const existingCounter = Array.isArray(parsed) ? 0 : parsed.ShowsBackupCounter || 0;
    const migrated = migrateShowsPayload(
      parsed,
      parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
      existingCounter
    );
    const updatedStr = JSON.stringify(migrated.envelope, null, 2);
    await serverDriveUploadFileContent(req, showsFile.id, updatedStr);

    const backupFileName = generateBackupFilename('shows', workstationMode);
    const backupId = await serverDriveCreateFileInFolder(req, backupFileName, settingsBackupsFolder);
    await serverDriveUploadFileContent(req, backupId, updatedStr);
  }

  // 3. Logs backup
  let logsFile = await serverDriveFindFileCaseInsensitive(req, 'logs.json', logsFolder);
  if (!logsFile) {
    const newId = await serverDriveCreateFileInFolder(req, 'logs.json', logsFolder);
    const initial = migrateLogsPayload({ LogsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
    await serverDriveUploadFileContent(req, newId, JSON.stringify(initial.envelope, null, 2));
    logsFile = { id: newId, name: 'logs.json', mimeType: 'application/json' };
  }
  {
    const res = await serverDriveFetch(req, `drive/v3/files/${logsFile.id}?alt=media`);
    const parsed = JSON.parse((await res.text()) || '[]');
    const existingCounter = Array.isArray(parsed) ? 0 : parsed.LogsBackupCounter || 0;
    const migrated = migrateLogsPayload(
      parsed,
      parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
      existingCounter
    );
    const updatedStr = JSON.stringify(migrated.envelope, null, 2);
    await serverDriveUploadFileContent(req, logsFile.id, updatedStr);

    const backupFileName = generateBackupFilename('logs', workstationMode);
    const backupId = await serverDriveCreateFileInFolder(req, backupFileName, logsBackupsFolder);
    await serverDriveUploadFileContent(req, backupId, updatedStr);
  }

  return { success: true };
}

// ============================================================================
// Evergreens, Playlists, Show Discovery & Missing Items on Drive
// ============================================================================

export async function verifyServerDriveEvergreens(req: express.Request): Promise<any> {
  const evergreensId = await resolveServerDriveEvergreensFolderId(req);
  const playlistsId = await resolveServerDriveShowsFolderId(req);
  await resolveServerDriveAnnouncementsFolderId(req);

  const hasBodyShows = Array.isArray(req.body?.shows);
  let shows: Show[];
  if (hasBodyShows) {
    shows = req.body.shows;
  } else {
    await readDriveAnnouncements(req, false);
    shows = await readDriveShows(req, false);
    await readDriveLogs(req);
  }

  const [evergreenChildren, playlistChildren] = await Promise.all([
    serverDriveListFolderFiles(req, evergreensId),
    serverDriveListFolderFiles(req, playlistsId)
  ]);

  const existingEvergreenLower = new Set(
    evergreenChildren.map(f => String(f.name || '').toLowerCase())
  );
  const existingPlaylistLower = new Set(
    playlistChildren.map(f => String(f.name || '').toLowerCase())
  );

  const createdFolders: string[] = [];
  const createdEvergreenFolders: string[] = [];
  const createdPlaylistFolders: string[] = [];
  let checkedShowCount = 0;

  for (const show of shows) {
    const shortName = String(show?.nameShort || '').trim();
    if (shortName) {
      checkedShowCount++;
      const lowerName = shortName.toLowerCase();

      if (!existingEvergreenLower.has(lowerName)) {
        await serverDriveCreateFileInFolder(
          req,
          shortName,
          evergreensId,
          'application/vnd.google-apps.folder'
        );
        existingEvergreenLower.add(lowerName);
        if (!createdEvergreenFolders.includes(shortName)) {
          createdEvergreenFolders.push(shortName);
        }
        if (!createdFolders.includes(shortName)) {
          createdFolders.push(shortName);
        }
      }

      if (!existingPlaylistLower.has(lowerName)) {
        await serverDriveCreateFileInFolder(
          req,
          shortName,
          playlistsId,
          'application/vnd.google-apps.folder'
        );
        existingPlaylistLower.add(lowerName);
        if (!createdPlaylistFolders.includes(shortName)) {
          createdPlaylistFolders.push(shortName);
        }
        if (!createdFolders.includes(shortName)) {
          createdFolders.push(shortName);
        }
      }
    }
  }

  const isAmp = !!getRootDriveFolderId(req);
  return {
    success: true,
    evergreensFolderCreated: false,
    playlistsFolderCreated: false,
    announcementsFolderCreated: false,
    announcementsReadonlyError: false,
    announcementsReadonlyMessage: '',
    evergreensPath: isAmp
      ? 'Google Drive: [Station]/media_evergreens'
      : 'Google Drive: /medialibrary/Evergreens',
    playlistsPath: isAmp
      ? 'Google Drive: [Station]/media_shows'
      : 'Google Drive: /medialibrary/Playlists',
    announcementsPath: isAmp
      ? 'Google Drive: [Station]/media_announcements'
      : 'Google Drive: /medialibrary/Announcements',
    checkedShowCount,
    createdEvergreenFolders,
    createdPlaylistFolders,
    createdFolders
  };
}

export async function checkServerDriveEvergreenFolder(
  req: express.Request,
  oldNameShort?: string,
  newNameShort?: string
): Promise<any> {
  const evergreensId = await resolveServerDriveEvergreensFolderId(req);
  const playlistsId = await resolveServerDriveShowsFolderId(req);

  const oldEvergreenExists = oldNameShort
    ? (await serverDriveFindFileCaseInsensitive(req, oldNameShort, evergreensId)) !== null
    : false;
  const oldPlaylistExists = oldNameShort
    ? (await serverDriveFindFileCaseInsensitive(req, oldNameShort, playlistsId)) !== null
    : false;
  const oldExists = oldEvergreenExists || oldPlaylistExists;

  const newEvergreenExists = newNameShort
    ? (await serverDriveFindFileCaseInsensitive(req, newNameShort, evergreensId)) !== null
    : false;
  const newPlaylistExists = newNameShort
    ? (await serverDriveFindFileCaseInsensitive(req, newNameShort, playlistsId)) !== null
    : false;
  const newExists = newEvergreenExists || newPlaylistExists;

  return {
    success: true,
    oldExists,
    newExists,
    oldEvergreenExists,
    oldPlaylistExists,
    newEvergreenExists,
    newPlaylistExists
  };
}

export async function applyServerDriveEvergreenChange(
  req: express.Request,
  action: 'create' | 'update',
  nameShort: string,
  oldNameShort?: string,
  renameFolder?: boolean
): Promise<{ success: boolean; folderCreated: boolean; folderRenamed: boolean }> {
  const evergreensId = await resolveServerDriveEvergreensFolderId(req);
  const playlistsId = await resolveServerDriveShowsFolderId(req);

  let folderCreated = false;
  let folderRenamed = false;

  const syncFolder = async (parentId: string) => {
    const newFolder = await serverDriveFindFileCaseInsensitive(req, nameShort, parentId);
    if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
      const oldFolder = await serverDriveFindFileCaseInsensitive(req, oldNameShort, parentId);
      if (oldFolder && renameFolder) {
        if (!newFolder || newFolder.id === oldFolder.id) {
          await serverDriveFetch(req, `drive/v3/files/${oldFolder.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: nameShort })
          });
          folderRenamed = true;
        }
      } else if (!newFolder) {
        await serverDriveCreateFileInFolder(
          req,
          nameShort,
          parentId,
          'application/vnd.google-apps.folder'
        );
        folderCreated = true;
      }
    } else if (!newFolder) {
      await serverDriveCreateFileInFolder(
        req,
        nameShort,
        parentId,
        'application/vnd.google-apps.folder'
      );
      folderCreated = true;
    }
  };

  await syncFolder(evergreensId);
  await syncFolder(playlistsId);

  return { success: true, folderCreated, folderRenamed };
}

const APPROVED_AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];
function isDriveAudioFileName(fileName: string): boolean {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  return APPROVED_AUDIO_EXTS.includes(ext);
}

export async function discoverServerDriveShowFolders(
  req: express.Request,
  params: {
    showNameShort?: string;
    showName?: string;
    showId?: string;
    folderType?: string;
  }
): Promise<any> {
  const mode = getEffectiveServerStorageMode(req);
  const isEvergreen = Boolean(
    params.folderType && params.folderType.toLowerCase().startsWith('evergreen')
  );
  const baseFlavorFolder = isEvergreen ? 'media_evergreens' : 'media_shows';
  const fallbackFolderName = params.showNameShort || params.showName || 'Show';

  if (mode === 'Demo') {
    const defaultFolderName = `${baseFlavorFolder}/${fallbackFolderName}`;
    return {
      success: true,
      hasMultipleFolders: false,
      defaultFolderName,
      totalFiles: 3,
      folderCount: 1,
      folders: [
        {
          id: 'root',
          name: `${fallbackFolderName} (Default)`,
          relPath: '.',
          fileCount: 3,
          isRoot: true,
          hasM3u: false,
          itemType: 'folder',
          depth: 0
        }
      ]
    };
  }

  const parentId = isEvergreen
    ? await resolveServerDriveEvergreensFolderId(req)
    : await resolveServerDriveShowsFolderId(req);
  const rootChildren = await serverDriveListFolderFiles(req, parentId);
  const folderMime = 'application/vnd.google-apps.folder';

  let matchedShowFolder = params.showNameShort
    ? rootChildren.find(
        f =>
          f.mimeType === folderMime &&
          f.name.toLowerCase() === params.showNameShort!.toLowerCase()
      )
    : undefined;
  if (!matchedShowFolder && params.showName) {
    matchedShowFolder = rootChildren.find(
      f =>
        f.mimeType === folderMime && f.name.toLowerCase() === params.showName!.toLowerCase()
    );
  }

  const resolvedShowFolderName = matchedShowFolder ? matchedShowFolder.name : fallbackFolderName;
  const defaultFolderName = `${baseFlavorFolder}/${resolvedShowFolderName}`;

  if (!matchedShowFolder) {
    return {
      success: true,
      hasMultipleFolders: false,
      defaultFolderName,
      folders: [],
      folderCount: 0,
      totalFiles: 0
    };
  }

  const folders: DiscoveredFolderItem[] = [];
  let totalFiles = 0;

  const scanDriveDirectory = async (
    folderId: string,
    folderName: string,
    relPath: string,
    depth: number,
    isRoot: boolean
  ) => {
    if (depth > 3) return;
    const items = await serverDriveListFolderFiles(req, folderId);
    const audioFiles = items.filter(f => f.mimeType !== folderMime && isDriveAudioFileName(f.name));
    const m3uFiles = items.filter(
      f =>
        f.mimeType !== folderMime &&
        (f.name.toLowerCase().endsWith('.m3u') || f.name.toLowerCase().endsWith('.m3u8'))
    );
    const subFolders = items
      .filter(f => f.mimeType === folderMime)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const countInThisFolder = audioFiles.length + m3uFiles.length;
    totalFiles += audioFiles.length;

    const displayName = isRoot ? `${folderName} (Default)` : folderName;
    const firstM3u = m3uFiles[0];

    if (isRoot || countInThisFolder > 0 || subFolders.length > 0) {
      folders.push({
        id: isRoot ? 'root' : `folder-${relPath}`,
        name: displayName,
        relPath: isRoot ? '.' : relPath,
        fileCount: audioFiles.length,
        isRoot,
        hasM3u: m3uFiles.length > 0,
        itemType: m3uFiles.length === 1 && audioFiles.length > 0 ? 'playlist' : 'folder',
        playlistFileName: firstM3u?.name,
        totalTracks: audioFiles.length,
        depth
      });
    }

    for (const sub of subFolders) {
      const nextRelPath = isRoot ? sub.name : `${relPath}/${sub.name}`;
      await scanDriveDirectory(sub.id, sub.name, nextRelPath, depth + 1, false);
    }
  };

  await scanDriveDirectory(matchedShowFolder.id, matchedShowFolder.name, '.', 0, true);

  return {
    success: true,
    hasMultipleFolders: folders.length > 1,
    defaultFolderName,
    folders,
    folderCount: folders.length,
    totalFiles
  };
}

export async function loadServerDrivePlaylistTracks(
  req: express.Request,
  params: {
    showNameShort?: string;
    showName?: string;
    folderType?: string;
    targetSubfolder?: string;
  }
): Promise<{
  success: boolean;
  showNameShort: string;
  playlistFile: string | null;
  tracks: Array<{
    id: string;
    fileName: string;
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }>;
}> {
  const primaryKey = params.showNameShort || params.showName || 'Show';
  if (params.targetSubfolder === '__no_playlist__') {
    return { success: true, showNameShort: primaryKey, tracks: [], playlistFile: null };
  }

  const mode = getEffectiveServerStorageMode(req);
  if (mode === 'Demo') {
    const demoTracks = [
      {
        id: 'demo-track-1',
        fileName: `${primaryKey}_Track_01.mp3`,
        title: `${primaryKey} - Track 01`,
        durationSeconds: 180,
        durationFormatted: '3:00',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      },
      {
        id: 'demo-track-2',
        fileName: `${primaryKey}_Track_02.mp3`,
        title: `${primaryKey} - Track 02`,
        durationSeconds: 210,
        durationFormatted: '3:30',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
      },
      {
        id: 'demo-track-3',
        fileName: `${primaryKey}_Track_03.mp3`,
        title: `${primaryKey} - Track 03`,
        durationSeconds: 240,
        durationFormatted: '4:00',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
      }
    ];
    return { success: true, showNameShort: primaryKey, tracks: demoTracks, playlistFile: null };
  }

  const isEvergreen = Boolean(
    params.folderType && params.folderType.toLowerCase().startsWith('evergreen')
  );
  const playlistsId = isEvergreen
    ? await resolveServerDriveEvergreensFolderId(req)
    : await resolveServerDriveShowsFolderId(req);

  let showFolder = params.showNameShort
    ? await serverDriveFindFileCaseInsensitive(req, params.showNameShort, playlistsId)
    : null;
  if (!showFolder && params.showName) {
    showFolder = await serverDriveFindFileCaseInsensitive(req, params.showName, playlistsId);
  }
  if (!showFolder) {
    return { success: true, showNameShort: primaryKey, tracks: [], playlistFile: null };
  }

  let targetFolderId = showFolder.id;
  if (params.targetSubfolder && params.targetSubfolder !== '.') {
    const segments = params.targetSubfolder.split(/[/\\]/).filter(Boolean);
    for (const seg of segments) {
      const sub = await serverDriveFindFileCaseInsensitive(req, seg, targetFolderId);
      if (sub) {
        targetFolderId = sub.id;
      } else {
        return { success: true, showNameShort: primaryKey, tracks: [], playlistFile: null };
      }
    }
  }

  const files = await serverDriveListFolderFiles(req, targetFolderId);
  const m3uFile = files.find(
    f => f.name.toLowerCase().endsWith('.m3u') || f.name.toLowerCase().endsWith('.m3u8')
  );

  const tracks: Array<{
    id: string;
    fileName: string;
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }> = [];
  let playlistFileName: string | null = null;

  if (m3uFile) {
    playlistFileName = m3uFile.name;
    try {
      const m3uRes = await serverDriveFetch(req, `drive/v3/files/${m3uFile.id}?alt=media`);
      const m3uText = await m3uRes.text();
      const lines = m3uText.split(/\r?\n/);

      let pendingTitle: string | null = null;
      let pendingDuration: number | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('#EXTINF:')) {
          const rest = trimmed.substring(8);
          const commaIdx = rest.indexOf(',');
          if (commaIdx !== -1) {
            const durSec = parseInt(rest.substring(0, commaIdx).trim(), 10);
            if (!isNaN(durSec) && durSec > 0) pendingDuration = durSec;
            pendingTitle = rest.substring(commaIdx + 1).trim();
          }
        } else if (!trimmed.startsWith('#')) {
          const cleanPath = trimmed.replace(/\\/g, '/');
          let targetName = cleanPath.split('/').pop() || cleanPath;
          try {
            targetName = decodeURIComponent(targetName);
          } catch (_) {}

          const normTarget = targetName.toLowerCase().trim();
          const matchedAudio = files.find(f => {
            const normF = f.name.toLowerCase().trim();
            return normF === normTarget || normF === normTarget.replace(/%20/g, ' ');
          });
          if (matchedAudio) {
            const streamUrl = `https://www.googleapis.com/drive/v3/files/${matchedAudio.id}?alt=media`;
            const durationSec = pendingDuration || 180;
            const m = Math.floor(durationSec / 60);
            const s = Math.floor(durationSec % 60);
            const durationFormatted = `${m}:${s.toString().padStart(2, '0')}`;
            const title = pendingTitle || matchedAudio.name.replace(/\.[^/.]+$/, '');

            tracks.push({
              id: `drive-track-${tracks.length + 1}`,
              fileName: matchedAudio.name,
              title,
              durationSeconds: durationSec,
              durationFormatted,
              streamUrl
            });
          }
          pendingTitle = null;
          pendingDuration = null;
        }
      }

      const m3uFileNames = new Set(tracks.map(t => t.fileName.toLowerCase()));
      const looseFiles = files.filter(
        f => isDriveAudioFileName(f.name) && !m3uFileNames.has(f.name.toLowerCase())
      );
      looseFiles.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      looseFiles.forEach(f => {
        const streamUrl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
        tracks.push({
          id: `drive-track-${tracks.length + 1}`,
          fileName: f.name,
          title: f.name.replace(/\.[^/.]+$/, ''),
          durationSeconds: 180,
          durationFormatted: '3:00',
          streamUrl
        });
      });
    } catch (_) {}
  }

  if (tracks.length === 0) {
    const audioFiles = files.filter(f => isDriveAudioFileName(f.name));
    audioFiles.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    audioFiles.forEach((f, idx) => {
      const streamUrl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
      tracks.push({
        id: `drive-track-${idx + 1}`,
        fileName: f.name,
        title: f.name.replace(/\.[^/.]+$/, ''),
        durationSeconds: 180,
        durationFormatted: '3:00',
        streamUrl
      });
    });
  }

  return {
    success: true,
    showNameShort: primaryKey,
    playlistFile: playlistFileName,
    tracks
  };
}

export async function checkServerDrivePlaylistShowFiles(
  req: express.Request,
  params: {
    currentShowNameShort?: string;
    currentShowName?: string;
    nextShowNameShort?: string;
    nextShowName?: string;
  }
): Promise<{
  success: boolean;
  currentShowFileCount: number;
  currentShowFolderCount: number;
  nextShowFileCount: number;
  nextShowFolderCount: number;
}> {
  const mode = getEffectiveServerStorageMode(req);
  if (mode === 'Demo') {
    return {
      success: true,
      currentShowFileCount: params.currentShowNameShort || params.currentShowName ? 3 : 0,
      currentShowFolderCount: params.currentShowNameShort || params.currentShowName ? 1 : 0,
      nextShowFileCount: params.nextShowNameShort || params.nextShowName ? 3 : 0,
      nextShowFolderCount: params.nextShowNameShort || params.nextShowName ? 1 : 0
    };
  }

  const playlistsId = await resolveServerDriveShowsFolderId(req);

  const getShowCount = async (
    shortName?: string,
    name?: string
  ): Promise<{ fileCount: number; folderCount: number }> => {
    if (!shortName && !name) return { fileCount: 0, folderCount: 0 };
    let showFolder = shortName
      ? await serverDriveFindFileCaseInsensitive(req, shortName, playlistsId)
      : null;
    if (!showFolder && name) {
      showFolder = await serverDriveFindFileCaseInsensitive(req, name, playlistsId);
    }
    if (!showFolder) return { fileCount: 0, folderCount: 0 };

    const files = await serverDriveListFolderFiles(req, showFolder.id);
    const m3uFile = files.find(
      f => f.name.toLowerCase().endsWith('.m3u') || f.name.toLowerCase().endsWith('.m3u8')
    );

    if (m3uFile) {
      try {
        const m3uRes = await serverDriveFetch(req, `drive/v3/files/${m3uFile.id}?alt=media`);
        const m3uText = await m3uRes.text();
        const lines = m3uText.split(/\r?\n/);
        let count = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) count++;
        }
        if (count > 0) return { fileCount: count, folderCount: 1 };
      } catch (_) {}
    }

    const audioFiles = files.filter(f => isDriveAudioFileName(f.name));
    return { fileCount: audioFiles.length, folderCount: audioFiles.length > 0 ? 1 : 0 };
  };

  const currentStats = await getShowCount(params.currentShowNameShort, params.currentShowName);
  const nextStats = await getShowCount(params.nextShowNameShort, params.nextShowName);

  return {
    success: true,
    currentShowFileCount: currentStats.fileCount,
    currentShowFolderCount: currentStats.folderCount,
    nextShowFileCount: nextStats.fileCount,
    nextShowFolderCount: nextStats.folderCount
  };
}

export function formatServerPlaylistLogFileName(
  showNameShort: string,
  showStartTime?: string | Date
): string {
  const safeShowName = String(showNameShort || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
  const dateObj = showStartTime ? new Date(showStartTime) : new Date();
  const YYYY = dateObj.getFullYear();
  const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const DD = String(dateObj.getDate()).padStart(2, '0');
  const HH = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  return `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
}

export async function saveServerDriveShowPlaylistLog(
  req: express.Request,
  params: {
    showNameShort?: string;
    showName?: string;
    showStartTime?: string;
    logFileName?: string;
    logData: any;
    folderType?: string;
  }
): Promise<{ success: boolean; logFileName: string }> {
  const keyName = params.showNameShort || params.showName || 'Show';
  const fileName =
    params.logFileName ||
    params.logData?.logFileName ||
    formatServerPlaylistLogFileName(keyName, params.showStartTime);
  const isEvergreen = Boolean(
    params.folderType && params.folderType.toLowerCase().startsWith('evergreen')
  );
  const scopedKey = `${isEvergreen ? 'Evergreens' : 'Playlists'}:${keyName}:${fileName}`;

  const previousSave = serverDrivePlaylistLogSaveQueue.get(scopedKey) || Promise.resolve('');
  const currentSave = (async () => {
    try {
      await previousSave;
    } catch (_) {}

    const playlistsId = isEvergreen
      ? await resolveServerDriveEvergreensFolderId(req)
      : await resolveServerDriveShowsFolderId(req);
    let showFolder = params.showNameShort
      ? await serverDriveFindFileCaseInsensitive(req, params.showNameShort, playlistsId)
      : null;
    if (!showFolder && params.showName) {
      showFolder = await serverDriveFindFileCaseInsensitive(req, params.showName, playlistsId);
    }
    let showFolderId = showFolder?.id || '';
    if (!showFolderId) {
      showFolderId = await serverDriveCreateFileInFolder(
        req,
        keyName,
        playlistsId,
        'application/vnd.google-apps.folder'
      );
    }

    let fileId = serverDrivePlaylistLogFileIdCache.get(scopedKey) || '';
    if (!fileId) {
      const existing = await serverDriveFindFileCaseInsensitive(req, fileName, showFolderId);
      fileId = existing?.id || '';
    }
    if (!fileId) {
      fileId = await serverDriveCreateFileInFolder(req, fileName, showFolderId, 'application/json');
    }

    serverDrivePlaylistLogFileIdCache.set(scopedKey, fileId);
    await serverDriveUploadFileContent(req, fileId, JSON.stringify(params.logData, null, 2));
    return fileName;
  })();

  serverDrivePlaylistLogSaveQueue.set(scopedKey, currentSave);
  const resolvedName = await currentSave;
  return { success: true, logFileName: resolvedName };
}

export async function loadServerDriveShowPlaylistLog(
  req: express.Request,
  params: {
    showNameShort?: string;
    showName?: string;
    showStartTime?: string;
    logFileName?: string;
    folderType?: string;
  }
): Promise<{ success: boolean; logFileName: string; logData: any }> {
  const keyName = params.showNameShort || params.showName || 'Show';
  const fileName =
    params.logFileName || formatServerPlaylistLogFileName(keyName, params.showStartTime);
  const isEvergreen = Boolean(
    params.folderType && params.folderType.toLowerCase().startsWith('evergreen')
  );
  const playlistsId = isEvergreen
    ? await resolveServerDriveEvergreensFolderId(req)
    : await resolveServerDriveShowsFolderId(req);

  let showFolder = params.showNameShort
    ? await serverDriveFindFileCaseInsensitive(req, params.showNameShort, playlistsId)
    : null;
  if (!showFolder && params.showName) {
    showFolder = await serverDriveFindFileCaseInsensitive(req, params.showName, playlistsId);
  }
  if (!showFolder) {
    return { success: true, logFileName: fileName, logData: null };
  }

  const scopedKey = `${isEvergreen ? 'Evergreens' : 'Playlists'}:${keyName}:${fileName}`;
  let fileId = serverDrivePlaylistLogFileIdCache.get(scopedKey) || '';
  if (!fileId) {
    const found = await serverDriveFindFileCaseInsensitive(req, fileName, showFolder.id);
    fileId = found?.id || '';
  }
  if (!fileId) {
    return { success: true, logFileName: fileName, logData: null };
  }

  serverDrivePlaylistLogFileIdCache.set(scopedKey, fileId);
  const res = await serverDriveFetch(req, `drive/v3/files/${fileId}?alt=media`);
  const logData = await res.json().catch(() => null);
  return { success: true, logFileName: fileName, logData };
}

export async function checkServerDriveMissingItems(
  req: express.Request,
  body: any
): Promise<{ hasMissing: boolean; missingItems: string[]; targetFolderDesc: string }> {
  const rootFolderId = String(
    body?.driveFolderAmp || req.headers['x-amp-drive-folder-amp'] || currentSettings.driveFolderAmp || ''
  ).trim();
  if (!rootFolderId) {
    return { hasMissing: false, missingItems: [], targetFolderDesc: '' };
  }

  const missingItems: string[] = [];
  try {
    const rootRes = await serverDriveFetch(req, `drive/v3/files/${rootFolderId}?fields=id,name`);
    const rootData: any = await rootRes.json();
    const targetFolderDesc = rootData.name || rootFolderId;

    const rootChildren = await serverDriveListFolderFiles(req, rootFolderId);
    const findChildId = (name: string) =>
      rootChildren.find(f => String(f.name || '').toLowerCase() === name.toLowerCase())?.id || null;

    const settingsFolder =
      body?.driveFolderPreferences || findChildId('settings') || findChildId('preferences');
    if (!settingsFolder) {
      missingItems.push('settings folder');
    } else {
      const settingsFiles = await serverDriveListFolderFiles(req, settingsFolder);
      const hasFile = (n: string) =>
        settingsFiles.some(f => String(f.name || '').toLowerCase() === n.toLowerCase());
      if (!hasFile('announcements.json')) missingItems.push('announcements.json');
      if (!hasFile('shows.json')) missingItems.push('shows.json');
    }

    const logsFolder = body?.driveFolderLogs || findChildId('logs');
    if (!logsFolder) {
      missingItems.push('logs folder');
    } else {
      const logsFiles = await serverDriveListFolderFiles(req, logsFolder);
      if (!logsFiles.some(f => String(f.name || '').toLowerCase() === 'logs.json')) {
        missingItems.push('logs.json');
      }
    }

    const announcementsFolder =
      body?.driveFolderAnnouncements ||
      body?.driveFolderMP3s ||
      findChildId('media_announcements');
    if (!announcementsFolder) missingItems.push('media_announcements folder');

    const evergreensFolder = body?.driveFolderEvergreens || findChildId('media_evergreens');
    if (!evergreensFolder) missingItems.push('media_evergreens folder');

    const showsFolder = body?.driveFolderShows || findChildId('media_shows');
    if (!showsFolder) missingItems.push('media_shows folder');

    return {
      hasMissing: missingItems.length > 0,
      missingItems,
      targetFolderDesc
    };
  } catch (_) {
    return { hasMissing: true, missingItems: ['AMP folder'], targetFolderDesc: rootFolderId };
  }
}

export async function listServerDriveAnnouncementMedia(req: express.Request): Promise<any[]> {
  const folderId = await resolveServerDriveAnnouncementsFolderId(req);
  const files = await serverDriveListFolderFiles(req, folderId);
  const allowedExtensions = [
    '.mp3',
    '.wav',
    '.flac',
    '.ogg',
    '.m4a',
    '.aac',
    '.txt',
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.md'
  ];

  return files
    .filter(f => {
      if (f.mimeType === 'application/vnd.google-apps.folder') return false;
      const ext = path.extname(String(f.name || '')).toLowerCase();
      return allowedExtensions.includes(ext);
    })
    .map(f => {
      const bytes = parseInt(f.size || '0', 10);
      const sizeStr =
        bytes > 0 ? `${Math.max(0.1, bytes / (1024 * 1024)).toFixed(1)} MB` : '0.1 MB';
      const mtimeMs = f.modifiedTime ? new Date(f.modifiedTime).getTime() : undefined;
      return {
        id: f.id,
        name: f.name,
        size: sizeStr,
        duration: '',
        path: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
        mtimeMs,
        modifiedTime: f.modifiedTime
      };
    });
}

export async function streamServerDriveFile(
  req: express.Request,
  res: express.Response,
  rawFileParam: string
): Promise<boolean> {
  try {
    let fileId = '';
    const trimmed = String(rawFileParam || '').trim();
    const match = trimmed.match(/\/files\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      fileId = match[1];
    } else if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) {
      fileId = trimmed;
    } else if (isServerDriveStorageRequest(req)) {
      const folderId = await resolveServerDriveAnnouncementsFolderId(req);
      const cleanName = path.basename(trimmed);
      const found = await serverDriveFindFileCaseInsensitive(req, cleanName, folderId);
      if (found) fileId = found.id;
    }

    if (!fileId) return false;

    const headers: Record<string, string> = {};
    if (req.headers.range) {
      headers['Range'] = String(req.headers.range);
    }

    const driveRes = await serverDriveFetch(req, `drive/v3/files/${fileId}?alt=media`, {
      headers
    });

    const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = driveRes.headers.get('content-length');
    const contentRange = driveRes.headers.get('content-range');

    const resHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    if (contentLength) resHeaders['Content-Length'] = contentLength;
    if (contentRange) resHeaders['Content-Range'] = contentRange;

    res.writeHead(driveRes.status === 206 ? 206 : 200, resHeaders);
    const arrayBuf = await driveRes.arrayBuffer();
    res.end(Buffer.from(arrayBuf));
    return true;
  } catch (_) {
    return false;
  }
}
