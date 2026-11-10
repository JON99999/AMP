import path from 'path';
import fs from 'fs';

// Cross-runtime directory resolution for Node ESM (dev) and bundled CommonJS (desktop / production)
const _appFilename = typeof __filename !== 'undefined' ? __filename : '';

export const _appDirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : _appFilename
      ? path.dirname(_appFilename)
      : process.cwd();

export const isMac = process.platform === 'darwin';

// Detect safe persistent directory for packaged desktop apps
const isExplicitPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const isExtractedPortable =
  !isMac &&
  !(process as any).defaultApp &&
  path.basename(process.execPath).toLowerCase().includes('portable');
export const IS_PORTABLE = isExplicitPortable || isExtractedPortable;

if (IS_PORTABLE && !process.env.PORTABLE_EXECUTABLE_DIR) {
  process.env.PORTABLE_EXECUTABLE_DIR = path.dirname(process.execPath);
}

export const BASE_DIR = IS_PORTABLE
  ? process.env.PORTABLE_EXECUTABLE_DIR!
  : process.env.APP_USER_DATA_PATH || process.cwd();

// Global shared settings directory across all modes and version upgrades
export const SETTINGS_DIR = IS_PORTABLE
  ? BASE_DIR
  : process.env.APP_SETTINGS_DIR_PATH || BASE_DIR;

// Persist settings in the launch directory (portable) or application shared settings directory (installed/dev)
export const SETTINGS_FILE = path.join(SETTINGS_DIR, 'amp_settings.json');

// Guaranteed synchronous directory verification for fresh installations
try {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o755 });
    console.log(`[Init] Successfully initialized base storage directory: ${BASE_DIR}`);
  }
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true, mode: 0o755 });
    console.log(`[Init] Successfully initialized shared settings directory: ${SETTINGS_DIR}`);
  }
} catch (dirInitErr) {
  console.error(`[Init Error] Failed to create storage directories:`, dirInitErr);
}

import type { LocationPathsOverride, LocationSettings } from '../types';

export type { LocationPathsOverride, LocationSettings };

export type ServerSettings = LocationSettings;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  mode: 'Demo',
  localPathAmp: '',
  driveFolderAmp: '',
  paths: {
    logs: null,
    loghistory: null,
    settings: null,
    media_announcements: null,
    media_evergreens: null,
    media_shows: null,
    logsFile: null,
    announcementsFile: null,
    showsFile: null
  },
  localPathMP3s: '',
  localPathLogs: '',
  localPathCalendar: '',
  driveFolderLogs: '',
  driveFolderMP3s: '',
  driveFolderPreferences: '',
  driveFolderAnnouncements: '',
  driveFolderEvergreens: '',
  driveFolderShows: ''
};

export let currentSettings: ServerSettings = { ...DEFAULT_SERVER_SETTINGS };

export function setCurrentSettings(next: ServerSettings): ServerSettings {
  currentSettings = next;
  return currentSettings;
}

// Load settings from file on launch if available
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    currentSettings = { ...currentSettings, ...JSON.parse(raw) };
    console.log('Loaded application folder settings from shared settings path:', currentSettings);
  }
} catch (e) {
  console.log('Started with default settings configuration');
}

// Detect if running inside actual Electron main/renderer process
export let electronDialog: any = null;
if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    if (electron && electron.dialog) {
      electronDialog = electron.dialog;
    }
  } catch (e) {
    // Graceful fallback outside Electron desktop application environment
  }
}

let registeredOAuthToken: string | null = null;
export function getRegisteredOAuthToken(): string | null {
  return registeredOAuthToken;
}
export function setRegisteredOAuthToken(token: string | null): void {
  registeredOAuthToken = token;
}

// Types for Targeted Contextual Show Caching
export interface PreparedShowTrack {
  id: string;
  fileName: string;
  title: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds: number;
  durationFormatted: string;
  streamUrl: string;
  fullPath: string;
  fileSizeBytes?: number;
}

export interface PreparedShowContext {
  showId: string;
  showName: string;
  showNameShort: string;
  context: 'Prerecord' | 'Export' | 'Playlist';
  folderType: 'Playlists' | 'Evergreens';
  selectedFolderPath?: string;
  isExternalFolder?: boolean;
  externalAbsolutePath?: string | null;
  preparedAt: string;
  playlistFile: string | null;
  totalTracks: number;
  totalDurationSeconds: number;
  tracks: PreparedShowTrack[];
}

let activeShowContext: PreparedShowContext | null = null;
export function getActiveShowContextState(): PreparedShowContext | null {
  return activeShowContext;
}
export function setActiveShowContextState(ctx: PreparedShowContext | null): void {
  activeShowContext = ctx;
}

// Unified path resolution helpers for strict 5-folder AMP structure:
// Logs, Settings, MediaAnnouncements, MediaEvergreens, MediaShows
export function getAmpLogsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.logs && fs.existsSync(settings.paths.logs)) {
    return settings.paths.logs;
  }
  if (settings.localPathLogs && fs.existsSync(settings.localPathLogs)) {
    return settings.localPathLogs;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'logs');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'Logs');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

export function getAmpLogHistoryDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.loghistory && fs.existsSync(settings.paths.loghistory)) {
    return settings.paths.loghistory;
  }
  const logsDir = getAmpLogsDir(settings);
  if (logsDir && fs.existsSync(logsDir)) {
    const p1 = path.join(logsDir, 'loghistory');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(logsDir, 'LogHistory');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'LogHistory');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'loghistory');
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

export function getAmpSettingsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.settings && fs.existsSync(settings.paths.settings)) {
    return settings.paths.settings;
  }
  if (settings.localPathCalendar && fs.existsSync(settings.localPathCalendar)) {
    return settings.localPathCalendar;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'settings');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'Settings');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

export function getAmpMediaAnnouncementsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_announcements && fs.existsSync(settings.paths.media_announcements)) {
    return settings.paths.media_announcements;
  }
  const announceOverride = settings.localPathMediaAnnouncements || settings.localPathMP3s;
  if (announceOverride && fs.existsSync(announceOverride)) {
    return announceOverride;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_announcements');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaAnnouncements');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

export function getAmpMediaEvergreensDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_evergreens && fs.existsSync(settings.paths.media_evergreens)) {
    return settings.paths.media_evergreens;
  }
  if (settings.localPathMediaEvergreens && fs.existsSync(settings.localPathMediaEvergreens)) {
    return settings.localPathMediaEvergreens;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_evergreens');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaEvergreens');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

export function getAmpMediaShowsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_shows && fs.existsSync(settings.paths.media_shows)) {
    return settings.paths.media_shows;
  }
  if (settings.localPathMediaShows && fs.existsSync(settings.localPathMediaShows)) {
    return settings.localPathMediaShows;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_shows');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaShows');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

export function getCalendarFilePath(): string | null {
  if (currentSettings.paths?.announcementsFile && fs.existsSync(currentSettings.paths.announcementsFile)) {
    return currentSettings.paths.announcementsFile;
  }
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    const targetFile = path.join(settingsDir, 'announcements.json');
    if (!fs.existsSync(targetFile)) {
      const capFile = path.join(settingsDir, 'Announcements.json');
      if (fs.existsSync(capFile)) {
        return capFile;
      }
      const subFolderFile = path.join(settingsDir, 'Announcements', 'announcements.json');
      const mediaDir = getAmpMediaAnnouncementsDir();
      const mediaSubFolderFile =
        mediaDir && fs.existsSync(mediaDir) ? path.join(mediaDir, 'announcements.json') : null;
      if (fs.existsSync(subFolderFile)) {
        try {
          fs.copyFileSync(subFolderFile, targetFile);
        } catch (e) {}
      } else if (mediaSubFolderFile && fs.existsSync(mediaSubFolderFile)) {
        try {
          fs.copyFileSync(mediaSubFolderFile, targetFile);
        } catch (e) {}
      }
    }
    return targetFile;
  }
  return null;
}

export function getLogFilePath(): string | null {
  if (currentSettings.paths?.logsFile && fs.existsSync(currentSettings.paths.logsFile)) {
    return currentSettings.paths.logsFile;
  }
  const logsDir = getAmpLogsDir();
  if (logsDir && fs.existsSync(logsDir)) {
    const defaultPath = path.join(logsDir, 'logs.json');
    if (fs.existsSync(defaultPath)) return defaultPath;
    const capPath = path.join(logsDir, 'Logs.json');
    if (fs.existsSync(capPath)) return capPath;
    return defaultPath;
  }
  return null;
}

export function getLogBackupPath(): string | null {
  const logsDir = getAmpLogsDir();
  if (logsDir && fs.existsSync(logsDir)) {
    const historyPath = path.join(logsDir, 'loghistory', 'logs_backup.json');
    if (fs.existsSync(historyPath)) return historyPath;
    const backupPath = path.join(logsDir, 'backups', 'logs_backup.json');
    if (fs.existsSync(backupPath)) return backupPath;
    return historyPath;
  }
  return null;
}

export function getCalendarBackupPath(): string | null {
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    return path.join(settingsDir, 'backups', 'announcements_backup.json');
  }
  return null;
}

export function getShowsFilePath(): string | null {
  if (currentSettings.paths?.showsFile && fs.existsSync(currentSettings.paths.showsFile)) {
    return currentSettings.paths.showsFile;
  }
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    const defaultPath = path.join(settingsDir, 'shows.json');
    if (fs.existsSync(defaultPath)) return defaultPath;
    const capPath = path.join(settingsDir, 'Shows.json');
    if (fs.existsSync(capPath)) return capPath;
    return defaultPath;
  }
  return null;
}

export function getShowsBackupPath(): string | null {
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    return path.join(settingsDir, 'backups', 'shows_backup.json');
  }
  return null;
}

export interface StationSettingsSidecar {
  stationTimezone?: string;
  adminContactInfo?: string;
  upNextPromo?: any;
  scheduleWindow?: any;
  updatedAt?: string;
}

export function getStationSettingsSidecarPath(): string | null {
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    return path.join(settingsDir, 'station_settings.json');
  }
  return null;
}

export function readStationSettingsSidecar(): StationSettingsSidecar | null {
  try {
    const sidecarPath = getStationSettingsSidecarPath();
    if (sidecarPath && fs.existsSync(sidecarPath)) {
      const parsed = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8') || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (_) {}
  return null;
}

export function writeStationSettingsSidecar(partial: StationSettingsSidecar): void {
  try {
    const sidecarPath = getStationSettingsSidecarPath();
    if (!sidecarPath) return;
    const existing = readStationSettingsSidecar() || {};
    const merged: StationSettingsSidecar = {
      ...existing,
      ...(partial.stationTimezone !== undefined ? { stationTimezone: partial.stationTimezone } : {}),
      ...(partial.adminContactInfo !== undefined ? { adminContactInfo: partial.adminContactInfo } : {}),
      ...(partial.upNextPromo !== undefined ? { upNextPromo: partial.upNextPromo } : {}),
      ...(partial.scheduleWindow !== undefined ? { scheduleWindow: partial.scheduleWindow } : {}),
      updatedAt: new Date().toISOString()
    };
    atomicWriteFileSync(sidecarPath, JSON.stringify(merged, null, 2));
  } catch (_) {}
}

export function generateBackupFilename(
  type: 'logs' | 'announcements' | 'shows',
  workstationMode?: string
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  let resolvedMode = (workstationMode || '').toUpperCase().trim();
  if (resolvedMode !== 'LIVE' && resolvedMode !== 'STUDIO' && resolvedMode !== 'ADMIN') {
    try {
      const configPath = path.join(process.cwd(), 'dist', 'app-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const cfgMode = String(cfg.mode || '').toUpperCase().trim();
        if (cfgMode === 'LIVE' || cfgMode === 'STUDIO' || cfgMode === 'ADMIN') {
          resolvedMode = cfgMode;
        }
      }
    } catch {
      // ignore
    }
  }

  if (resolvedMode !== 'LIVE' && resolvedMode !== 'STUDIO' && resolvedMode !== 'ADMIN') {
    const envMode = (process.env.VITE_APP_MODE || process.env.APP_MODE || '').toUpperCase().trim();
    if (envMode === 'LIVE' || envMode === 'STUDIO' || envMode === 'ADMIN') {
      resolvedMode = envMode;
    } else {
      resolvedMode = 'ADMIN';
    }
  }

  const salt = Math.random().toString(16).substring(2, 6).padStart(4, '0');
  return `${type}_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}_${resolvedMode}_${salt}.json`;
}

export function atomicWriteFileSync(filePath: string, data: string | Buffer): void {
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const tempFile = path.join(
    parentDir,
    `.${path.basename(filePath)}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  try {
    fs.writeFileSync(tempFile, data, 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err: any) {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (_) {}
    throw err;
  }
}

export function findAnnouncementSourceFile(folderPath: string, fileName: string): string | null {
  if (!fileName) return null;
  if (fs.existsSync(fileName)) return fileName;

  let cleanName = fileName;
  if (cleanName.includes('/api/media/stream')) {
    const parts = cleanName.split(/(?:file|path)=/);
    if (parts.length > 1) {
      cleanName = decodeURIComponent(parts[1].split('&')[0]);
    }
  }

  const baseName = path.basename(cleanName);
  const announcementsRoot = fs.existsSync(path.join(folderPath, 'media_announcements'))
    ? path.join(folderPath, 'media_announcements')
    : fs.existsSync(path.join(folderPath, 'MediaAnnouncements'))
      ? path.join(folderPath, 'MediaAnnouncements')
      : folderPath;

  const candidateDirect = path.join(announcementsRoot, baseName);
  if (fs.existsSync(candidateDirect)) return candidateDirect;

  try {
    if (fs.existsSync(announcementsRoot)) {
      const entries = fs.readdirSync(announcementsRoot);
      for (const entry of entries) {
        const fullPath = path.join(announcementsRoot, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          const candidate = path.join(fullPath, baseName);
          if (fs.existsSync(candidate)) return candidate;
        } else if (entry.toLowerCase() === baseName.toLowerCase()) {
          return fullPath;
        }
      }
    }
  } catch (e) {}

  const candidateOrig = path.join(folderPath, baseName);
  if (fs.existsSync(candidateOrig)) return candidateOrig;

  return null;
}

export function resolveLocalAnnouncementScriptText(mp3Url: string): string | null {
  try {
    if (!mp3Url || typeof mp3Url !== 'string') return null;
    const trimmed = mp3Url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('__up_next_promo__:')) {
      const rawEncoded = trimmed.slice('__up_next_promo__:'.length).replace(/\.txt$/i, '');
      try {
        return decodeURIComponent(rawEncoded);
      } catch (_) {
        return rawEncoded;
      }
    }
    let cleanName = trimmed;
    if (cleanName.includes('/api/media/stream')) {
      const parts = cleanName.split(/(?:file|path)=/);
      if (parts.length > 1) {
        cleanName = decodeURIComponent(parts[1].split('&')[0]);
      }
    }
    const ext = path.extname(cleanName.split('?')[0]).toLowerCase();
    if (ext !== '.txt' && ext !== '.md') return null;

    if (path.isAbsolute(cleanName) && fs.existsSync(cleanName) && fs.statSync(cleanName).isFile()) {
      return fs.readFileSync(cleanName, 'utf-8');
    }

    const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
    if (announcementsDir && fs.existsSync(announcementsDir)) {
      const directCandidate = path.join(announcementsDir, path.basename(cleanName));
      if (fs.existsSync(directCandidate) && fs.statSync(directCandidate).isFile()) {
        return fs.readFileSync(directCandidate, 'utf-8');
      }
      const resolved = findAnnouncementSourceFile(announcementsDir, cleanName);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return fs.readFileSync(resolved, 'utf-8');
      }
    }
  } catch (_) {}
  return null;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stepped cloud-drive hydration catch-up reader for JSON schedule/log files (#62).
 * Gives online-only or actively syncing files on Google Drive / OneDrive a chance
 * to hydrate before falling back to the local backup file.
 */
export async function readJsonFileWithCloudCatchUp(
  primaryPath: string | null,
  backupPath?: string | null,
  delaysMs: number[] = [250, 600, 1200]
): Promise<{ parsed: any; recoveredFromBackup: boolean; fileExists: boolean }> {
  if (!primaryPath) {
    return { parsed: null, recoveredFromBackup: false, fileExists: false };
  }

  const primaryExists = fs.existsSync(primaryPath);
  const backupExists = Boolean(backupPath && fs.existsSync(backupPath));

  if (!primaryExists && !backupExists) {
    return { parsed: null, recoveredFromBackup: false, fileExists: false };
  }

  let lastError: any = null;

  if (primaryExists) {
    for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
      try {
        const raw = fs.readFileSync(primaryPath, 'utf-8');
        if (!raw || !raw.trim()) {
          throw new Error('File is momentarily empty during cloud hydration or write');
        }
        const parsed = JSON.parse(raw);
        return { parsed, recoveredFromBackup: false, fileExists: true };
      } catch (err: any) {
        lastError = err;
        if (attempt < delaysMs.length) {
          await sleepMs(delaysMs[attempt]);
        }
      }
    }
  }

  if (backupPath && fs.existsSync(backupPath)) {
    try {
      const backupRaw = fs.readFileSync(backupPath, 'utf-8');
      if (backupRaw && backupRaw.trim()) {
        const parsedBackup = JSON.parse(backupRaw);
        console.warn(`[Cloud Catch-Up] Primary file ${path.basename(primaryPath)} busy/hydrating; recovered from ${path.basename(backupPath)}.`);
        return { parsed: parsedBackup, recoveredFromBackup: true, fileExists: true };
      }
    } catch (backupErr) {
      if (!lastError) lastError = backupErr;
    }
  }

  throw lastError || new Error(`Unable to read ${primaryPath}`);
}

/**
 * Stepped cloud-drive stat helper for media files (#62).
 * Retries transient FileProvider hydration locks before marking a file as cloudSyncPending.
 */
export async function statFileWithCloudCatchUp(
  filePath: string,
  delaysMs: number[] = [200, 500]
): Promise<{ stats: fs.Stats | null; cloudSyncPending: boolean }> {
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      const stats = fs.statSync(filePath);
      return { stats, cloudSyncPending: false };
    } catch (_) {
      if (attempt < delaysMs.length) {
        await sleepMs(delaysMs[attempt]);
      }
    }
  }
  return { stats: null, cloudSyncPending: true };
}

