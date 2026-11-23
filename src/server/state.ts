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

export function serializeSettingsForDisk(settings: ServerSettings): string {
  const { googleAuth: _omitGoogleAuth, ...persistable } = settings;
  return JSON.stringify(persistable, null, 2);
}

// Load settings from file on launch if available (never hydrate OAuth tokens from disk)
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { googleAuth: _omitGoogleAuth, ...loaded } = parsed;
      currentSettings = { ...currentSettings, ...loaded };
      console.log('Loaded application folder settings from shared settings path:', currentSettings);
    }
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
  adminMessages?: any[];
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
      ...(partial.adminMessages !== undefined ? { adminMessages: partial.adminMessages } : {}),
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

export type AnnouncementFolderBucket = 'active' | 'archived' | 'deleted';

function isWindowsAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

function hasPathTraversalSegment(p: string): boolean {
  const normalized = p.replace(/\\/g, '/');
  return normalized.split('/').some((seg) => seg === '..');
}

export function findAnnouncementSourceFile(
  folderPath: string,
  fileName: string,
  options?: { bucket?: AnnouncementFolderBucket }
): string | null {
  if (!folderPath || !fileName) return null;

  let cleanName = String(fileName).trim();
  if (!cleanName) return null;

  if (cleanName.includes('/api/media/stream')) {
    const parts = cleanName.split(/(?:file|path)=/);
    if (parts.length > 1) {
      cleanName = decodeURIComponent(parts[1].split('&')[0]);
    }
  }
  cleanName = cleanName.split('?')[0].trim();
  if (!cleanName) return null;

  const announcementsRoot = fs.existsSync(path.join(folderPath, 'media_announcements'))
    ? path.join(folderPath, 'media_announcements')
    : fs.existsSync(path.join(folderPath, 'MediaAnnouncements'))
      ? path.join(folderPath, 'MediaAnnouncements')
      : folderPath;

  const bucket: AnnouncementFolderBucket =
    options?.bucket === 'archived' || options?.bucket === 'deleted' ? options.bucket : 'active';

  const targetDir =
    bucket === 'archived'
      ? path.join(announcementsRoot, 'archived')
      : bucket === 'deleted'
        ? path.join(announcementsRoot, 'deleted_in_AMP_OK_to_purge')
        : announcementsRoot;

  if (!fs.existsSync(targetDir)) return null;

  // Reject any absolute path pointing outside the target announcement bucket folder
  if (path.isAbsolute(cleanName) || isWindowsAbsolutePath(cleanName)) {
    if (!path.isAbsolute(cleanName)) return null;
    if (!isPathWithinAnyDir(cleanName, [targetDir])) return null;
    const rel = path.relative(path.resolve(targetDir), path.resolve(cleanName));
    if (!rel || rel.includes(path.sep) || rel.includes('/') || rel === '..' || rel.startsWith('..')) {
      return null;
    }
    if (fs.existsSync(cleanName) && fs.statSync(cleanName).isFile()) {
      return cleanName;
    }
    return null;
  }

  if (hasPathTraversalSegment(cleanName)) return null;

  // Require a plain filename inside the target bucket (no cross-subfolder paths)
  const normalizedRel = cleanName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalizedRel.includes('/')) return null;

  const baseName = path.basename(normalizedRel);
  if (!baseName || baseName === '.' || baseName === '..') return null;

  const candidateDirect = path.join(targetDir, baseName);
  if (
    isPathWithinAnyDir(candidateDirect, [targetDir]) &&
    fs.existsSync(candidateDirect) &&
    fs.statSync(candidateDirect).isFile()
  ) {
    return candidateDirect;
  }

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const baseLower = baseName.toLowerCase();
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === baseLower) {
        const matchedPath = path.join(targetDir, entry.name);
        if (isPathWithinAnyDir(matchedPath, [targetDir])) {
          return matchedPath;
        }
      }
    }
  } catch (_) {}

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

    const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
    if (announcementsDir && fs.existsSync(announcementsDir)) {
      const resolved = findAnnouncementSourceFile(announcementsDir, cleanName, { bucket: 'active' });
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
 * Retries transient online-only / syncing locks on the primary file, then fails
 * loudly without silently hydrating stale backup data.
 */
export async function readJsonFileWithCloudCatchUp(
  primaryPath: string | null,
  _backupPath?: string | null,
  delaysMs: number[] = [250, 600, 1200]
): Promise<{ parsed: any; recoveredFromBackup: boolean; fileExists: boolean }> {
  if (!primaryPath) {
    return { parsed: null, recoveredFromBackup: false, fileExists: false };
  }

  const primaryExists = fs.existsSync(primaryPath);
  if (!primaryExists) {
    return { parsed: null, recoveredFromBackup: false, fileExists: false };
  }

  let lastError: any = null;

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

// ============================================================================
// Filesystem Boundary Guards for Local API Routes (#6)
// ============================================================================

export const ALLOWED_STREAM_MEDIA_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.aif',
  '.txt', '.md', '.pdf', '.png', '.jpg', '.jpeg', '.webp'
]);

const activeExternalMediaDirs = new Set<string>();

export function registerActiveExternalMediaDir(dirPath?: string | null): void {
  if (!dirPath || typeof dirPath !== 'string') return;
  const trimmed = dirPath.trim();
  if (!trimmed) return;
  try {
    activeExternalMediaDirs.add(path.resolve(trimmed));
  } catch (_) {}
}

export function getActiveExternalMediaDirs(): string[] {
  const dirs = new Set<string>(activeExternalMediaDirs);
  const ctxPath = getActiveShowContextState()?.externalAbsolutePath;
  if (ctxPath && typeof ctxPath === 'string' && ctxPath.trim()) {
    try {
      dirs.add(path.resolve(ctxPath.trim()));
    } catch (_) {}
  }
  return Array.from(dirs);
}

export function isPathWithinAnyDir(
  targetPath: string,
  allowedDirs: Array<string | null | undefined>
): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  let resolvedTarget: string;
  try {
    resolvedTarget = path.resolve(targetPath);
  } catch (_) {
    return false;
  }
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const normalizedTarget = caseInsensitive ? resolvedTarget.toLowerCase() : resolvedTarget;

  for (const dir of allowedDirs) {
    if (!dir || typeof dir !== 'string' || !dir.trim()) continue;
    try {
      const resolvedBase = path.resolve(dir.trim());
      const normalizedBase = caseInsensitive ? resolvedBase.toLowerCase() : resolvedBase;
      const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;
      if (normalizedTarget === normalizedBase || normalizedTarget.startsWith(baseWithSep)) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export function getConfiguredStationRoots(settings: any = currentSettings): string[] {
  const candidates = [
    settings?.localPathAmp,
    settings?.localPathCalendar,
    settings?.localPathLogs,
    settings?.localPathMP3s,
    settings?.localPathMediaAnnouncements,
    settings?.localPathMediaEvergreens,
    settings?.localPathMediaShows,
    settings?.localPathPlaylists,
    settings?.localPathExport,
    getAmpSettingsDir(settings),
    getAmpLogsDir(settings),
    getAmpMediaAnnouncementsDir(settings),
    getAmpMediaEvergreensDir(settings),
    getAmpMediaShowsDir(settings)
  ];
  const unique = new Set<string>();
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      try {
        unique.add(path.resolve(c.trim()));
      } catch (_) {}
    }
  }
  return Array.from(unique);
}

export function getConfiguredMediaRoots(settings: any = currentSettings): string[] {
  const candidates = [
    settings?.localPathMP3s,
    settings?.localPathMediaAnnouncements,
    settings?.localPathMediaEvergreens,
    settings?.localPathMediaShows,
    settings?.localPathPlaylists,
    getAmpMediaAnnouncementsDir(settings),
    getAmpMediaEvergreensDir(settings),
    getAmpMediaShowsDir(settings)
  ];
  const unique = new Set<string>();
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      try {
        unique.add(path.resolve(c.trim()));
      } catch (_) {}
    }
  }
  return Array.from(unique);
}

export function isPathWithinConfiguredStationDirs(
  targetPath: string,
  includeActiveExternal: boolean = false
): boolean {
  const allowed = getConfiguredStationRoots(currentSettings);
  if (includeActiveExternal) {
    allowed.push(...getActiveExternalMediaDirs());
  }
  return isPathWithinAnyDir(targetPath, allowed);
}

export function isPathWithinConfiguredMediaDirs(
  targetPath: string,
  includeActiveExternal: boolean = false
): boolean {
  const allowed = getConfiguredMediaRoots(currentSettings);
  if (includeActiveExternal) {
    allowed.push(...getActiveExternalMediaDirs());
  }
  return isPathWithinAnyDir(targetPath, allowed);
}
