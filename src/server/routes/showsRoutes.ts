import express from 'express';
import fs from 'fs';
import path from 'path';
import NodeID3 from 'node-id3';
import { DiscoveredFolderItem } from '../../types';
import { stripFormattingMarkers, markdownTxtToRtf } from '../../lib/liveReadTextUtils';
import {
  currentSettings,
  PreparedShowTrack,
  PreparedShowContext,
  getActiveShowContextState,
  setActiveShowContextState,
  getAmpLogHistoryDir,
  getAmpMediaAnnouncementsDir,
  getAmpMediaEvergreensDir,
  getAmpMediaShowsDir,
  getShowsFilePath,
  findAnnouncementSourceFile
} from '../state';
import {
  isServerDriveStorageRequest,
  verifyServerDriveEvergreens,
  checkServerDriveEvergreenFolder,
  applyServerDriveEvergreenChange,
  discoverServerDriveShowFolders,
  loadServerDrivePlaylistTracks,
  checkServerDrivePlaylistShowFiles,
  saveServerDriveShowPlaylistLog,
  loadServerDriveShowPlaylistLog
} from '../storage/driveProvider';
import {
  withTimeout,
  getMp3DurationSecondsAsync,
  getMp3ServerMetadata,
  findShowPlaylistFolder,
  getAllAudioAndPlaylistFilesAsync,
  parseM3uFileAsync,
  findEvergreenSourceFile,
  resolveMediaFilePath
} from './mediaRoutes';

// Helper to build/prepare show track context with scoped folder and M3U ordering semantics
async function buildShowContext(params: {
  showId: string;
  showName?: string;
  showNameShort?: string;
  context?: 'Prerecord' | 'Export' | 'Playlist';
  folderType?: 'Playlists' | 'Evergreens';
  targetSubfolder?: string;
  externalAbsolutePath?: string;
  isExternal?: boolean;
}): Promise<PreparedShowContext> {
  const showId = params.showId || 'unknown';
  const showName = params.showName || showId;
  const showNameShort = params.showNameShort || showName;
  const context = params.context || 'Playlist';
  const folderType = params.folderType || 'Playlists';
  const targetSubfolder = params.targetSubfolder || '.';
  const externalAbsolutePath = params.externalAbsolutePath || null;
  const isExternal = params.isExternal === true || !!externalAbsolutePath;

  let showFolderPath: string | null = null;

  if (isExternal && externalAbsolutePath && fs.existsSync(externalAbsolutePath)) {
    showFolderPath = externalAbsolutePath;
  } else {
    const isEvergreen = folderType && folderType.toLowerCase().startsWith('evergreen');
    const baseDir = isEvergreen
      ? getAmpMediaEvergreensDir(currentSettings)
      : getAmpMediaShowsDir(currentSettings);

    showFolderPath = baseDir ? findShowPlaylistFolder(baseDir, showNameShort, showName) : null;
    if (showFolderPath && targetSubfolder && targetSubfolder !== '.') {
      const subDir = path.join(showFolderPath, targetSubfolder);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        showFolderPath = subDir;
      }
    }
  }

  if (!showFolderPath || !fs.existsSync(showFolderPath)) {
    return {
      showId,
      showName,
      showNameShort,
      context,
      folderType,
      selectedFolderPath: targetSubfolder,
      isExternalFolder: isExternal,
      externalAbsolutePath,
      preparedAt: new Date().toISOString(),
      playlistFile: null,
      totalTracks: 0,
      totalDurationSeconds: 0,
      tracks: []
    };
  }

  let { m3uFiles, audioFiles } = await getAllAudioAndPlaylistFilesAsync(showFolderPath, { recursive: false });
  let rawTracks: Array<{ fileName: string; title: string; durationSeconds: number; fullPath?: string }> = [];
  let playlistFileName: string | null = null;

  let retryCount = 0;
  while (m3uFiles.length === 0 && audioFiles.length === 0 && retryCount < 3) {
    retryCount++;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const rescan = await getAllAudioAndPlaylistFilesAsync(showFolderPath, { recursive: false });
    m3uFiles = rescan.m3uFiles;
    audioFiles = rescan.audioFiles;
  }

  if (m3uFiles.length > 0) {
    playlistFileName = path.basename(m3uFiles[0]);
    const m3uTracks = await parseM3uFileAsync(m3uFiles[0], showFolderPath);
    const m3uFileNames = new Set(m3uTracks.map(t => t.fileName.toLowerCase()));

    const looseAudioFiles = audioFiles.filter(a => !m3uFileNames.has(a.name.toLowerCase()));
    looseAudioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const looseTracks = await Promise.all(looseAudioFiles.map(async f => {
      const durationSeconds = await getMp3DurationSecondsAsync(f.fullPath);
      return {
        fileName: f.name,
        title: f.name.replace(/\.[^/.]+$/, ''),
        durationSeconds,
        fullPath: f.fullPath
      };
    }));

    rawTracks = [...m3uTracks, ...looseTracks];
  } else {
    audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    rawTracks = await Promise.all(audioFiles.map(async f => {
      const durationSeconds = await getMp3DurationSecondsAsync(f.fullPath);
      return {
        fileName: f.name,
        title: f.name.replace(/\.[^/.]+$/, ''),
        durationSeconds,
        fullPath: f.fullPath
      };
    }));
  }

  let totalDurationSeconds = 0;

  const tracks: PreparedShowTrack[] = await Promise.all(rawTracks.map(async (t, idx) => {
    const m = Math.floor(t.durationSeconds / 60);
    const s = Math.floor(t.durationSeconds % 60);
    totalDurationSeconds += (t.durationSeconds || 0);

    const filePath = t.fullPath || path.join(showFolderPath!, t.fileName);
    let meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
    let fileSizeBytes = 0;

    if (fs.existsSync(filePath)) {
      try {
        const st = fs.statSync(filePath);
        fileSizeBytes = st.size;
        meta = await getMp3ServerMetadata(filePath);
      } catch (_) {}
    }

    const streamQuery = new URLSearchParams({
      file: t.fileName,
      showNameShort: showNameShort,
      showName: showName,
      folderType: folderType,
      path: filePath,
      targetSubfolder: targetSubfolder,
      isExternal: isExternal ? 'true' : 'false'
    });
    if (externalAbsolutePath) {
      streamQuery.set('externalAbsolutePath', externalAbsolutePath);
    }

    return {
      id: `playlist-track-${idx + 1}`,
      fileName: t.fileName,
      title: meta?.title || t.title,
      artist: meta?.artist,
      albumArtist: meta?.albumArtist || meta?.artist,
      album: meta?.album,
      durationSeconds: t.durationSeconds,
      durationFormatted: `${m}:${s.toString().padStart(2, '0')}`,
      streamUrl: `/api/media/stream?${streamQuery.toString()}`,
      fullPath: filePath,
      fileSizeBytes
    };
  }));

  return {
    showId,
    showName,
    showNameShort,
    context,
    folderType,
    selectedFolderPath: targetSubfolder,
    isExternalFolder: isExternal,
    externalAbsolutePath,
    preparedAt: new Date().toISOString(),
    playlistFile: playlistFileName,
    totalTracks: tracks.length,
    totalDurationSeconds,
    tracks
  };
}

// Security helper to protect against modifying root or system directories
const SAFE_EXPORT_EXTENSIONS = new Set([
  '.mp3', '.txt', '.m3u', '.m3u8', '.pdf', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.log'
]);

function isSystemOrRootDirectory(dirPath: string): boolean {
  if (!dirPath) return true;
  const resolved = path.resolve(dirPath);
  const root = path.parse(resolved).root;
  if (resolved === root) return true;

  const lower = resolved.toLowerCase();
  const protectedPaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    '/system',
    '/library',
    '/usr',
    '/bin',
    '/sbin',
    '/etc',
    '/var',
    '/private',
    '/dev',
    '/boot'
  ];

  for (const p of protectedPaths) {
    if (lower === p || lower.startsWith(p + path.sep)) {
      return true;
    }
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && path.resolve(homeDir) === resolved) {
    return true;
  }

  return false;
}

function formatExportTimeAmPm(hoursInput: number | string, minutesInput: number | string = 0): string {
  let h = typeof hoursInput === 'string' ? parseInt(hoursInput, 10) : Math.floor(hoursInput);
  let m = typeof minutesInput === 'string' ? parseInt(minutesInput, 10) : Math.floor(minutesInput);
  if (isNaN(h)) h = 0;
  if (isNaN(m)) m = 0;
  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(59, m));

  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;

  const hStr = h12.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  return `${hStr}-${mStr} ${ampm}`;
}

function computeExportFolderInfo(
  destParentFolder: string,
  prerecordDate: string | Date,
  lengthMinutes: number,
  folderPrefix?: string
): { exportFolderName: string; exportFolderPath: string; dateStr: string; timeStr: string; durationStr: string; hours: string; minutes: string } {
  const parsedDate = new Date(prerecordDate);
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const hours = String(parsedDate.getHours()).padStart(2, '0');
  const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

  const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthShort = monthShorts[parsedDate.getMonth()] || 'JUN';

  const dateStr = `${year}-${month}(${monthShort})-${day}`;
  const timeStr = formatExportTimeAmPm(parsedDate.getHours(), parsedDate.getMinutes());

  const fPrefix = (folderPrefix && folderPrefix.trim()) || 'Show';
  const lengthMinutesNum = Number(lengthMinutes) || 0;
  const h = Math.floor(lengthMinutesNum / 60);
  const m = lengthMinutesNum % 60;
  const durationStr = m === 0 ? `${h} Hrs` : `${h} Hrs ${m} Min`;

  const exportFolderName = `${fPrefix} - Export - ${dateStr} at ${timeStr} - ${durationStr}`;
  const exportFolderPath = path.join(destParentFolder, exportFolderName);

  return { exportFolderName, exportFolderPath, dateStr, timeStr, durationStr, hours, minutes };
}

function cleanExportFolder(folderPath: string): { deletedFiles: string[]; skippedFiles: string[]; error?: string } {
  if (!fs.existsSync(folderPath)) {
    return { deletedFiles: [], skippedFiles: [] };
  }

  if (isSystemOrRootDirectory(folderPath)) {
    return { deletedFiles: [], skippedFiles: [], error: 'Folder is a protected system directory' };
  }

  const deletedFiles: string[] = [];
  const skippedFiles: string[] = [];

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        skippedFiles.push(`${entry.name}/ (directory)`);
        continue;
      }

      const fileName = entry.name;
      const ext = path.extname(fileName).toLowerCase();

      if (!SAFE_EXPORT_EXTENSIONS.has(ext)) {
        skippedFiles.push(fileName);
        continue;
      }

      if (fileName.startsWith('.') || fileName.toLowerCase() === 'desktop.ini' || fileName.toLowerCase() === 'thumbs.db') {
        skippedFiles.push(fileName);
        continue;
      }

      const fullFilePath = path.join(folderPath, fileName);
      try {
        fs.unlinkSync(fullFilePath);
        deletedFiles.push(fileName);
      } catch (err: any) {
        console.warn(`Could not delete file ${fullFilePath}:`, err);
        skippedFiles.push(fileName);
      }
    }
  } catch (err: any) {
    return { deletedFiles, skippedFiles, error: err.message };
  }

  return { deletedFiles, skippedFiles };
}

export function registerShowsRoutes(app: express.Express): void {
  // API - Verify Evergreen, Show Playlist, and Announcement folders (Unified Local + Google Drive)
  app.post('/api/shows/verify-evergreens', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await verifyServerDriveEvergreens(req);
        return res.json(result);
      }

      let evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      let playlistsPath = getAmpMediaShowsDir(currentSettings);
      let announcementsPath = getAmpMediaAnnouncementsDir(currentSettings);

      if (!evergreensPath && currentSettings.localPathAmp) {
        evergreensPath = path.join(currentSettings.localPathAmp, 'media_evergreens');
      }
      if (!playlistsPath && currentSettings.localPathAmp) {
        playlistsPath = path.join(currentSettings.localPathAmp, 'media_shows');
      }
      if (!announcementsPath && currentSettings.localPathAmp) {
        announcementsPath = path.join(currentSettings.localPathAmp, 'media_announcements');
      }

      if (!evergreensPath || !playlistsPath || !announcementsPath) {
        return res.status(400).json({ error: 'Media directories are not defined or offline. Please configure AMP Station Location or Media paths in Settings.' });
      }

      let evergreensFolderCreated = false;
      let playlistsFolderCreated = false;
      let announcementsFolderCreated = false;
      const announcementsReadonlyError = false;
      const announcementsReadonlyMessage = '';

      const ensureBaseDir = (dirPath: string): { exists: boolean; created: boolean } => {
        if (fs.existsSync(dirPath)) {
          return { exists: true, created: false };
        }
        const parentDir = path.dirname(dirPath);
        if (parentDir && fs.existsSync(parentDir)) {
          try {
            fs.mkdirSync(dirPath, { recursive: true });
            return { exists: true, created: true };
          } catch (_) {
            return { exists: false, created: false };
          }
        }
        return { exists: false, created: false };
      };

      const evBase = ensureBaseDir(evergreensPath);
      const plBase = ensureBaseDir(playlistsPath);
      const anBase = ensureBaseDir(announcementsPath);

      evergreensFolderCreated = evBase.created;
      playlistsFolderCreated = plBase.created;
      announcementsFolderCreated = anBase.created;

      if (!evBase.exists || !plBase.exists || !anBase.exists) {
        return res.status(400).json({
          error: 'Configured media directories do not exist on the local filesystem. Please select valid folders in Storage Folders.',
          missingDirs: {
            evergreens: !evBase.exists,
            playlists: !plBase.exists,
            announcements: !anBase.exists
          }
        });
      }

      const showsFilePath = getShowsFilePath();
      let shows: any[] = [];
      if (Array.isArray(req.body?.shows) && req.body.shows.length > 0) {
        shows = req.body.shows;
      } else if (showsFilePath && fs.existsSync(showsFilePath)) {
        const data = fs.readFileSync(showsFilePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '[]');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            shows = Array.isArray(parsed.data) ? parsed.data : [];
          } else {
            shows = Array.isArray(parsed) ? parsed : [];
          }
        } catch (pe) {
          shows = [];
        }
      }

      const activeShows = shows.filter(s => !s?.isDeleted);
      const knownShortNamesLower = new Set<string>();
      const createdFolders: string[] = [];
      const createdEvergreenFolders: string[] = [];
      const createdPlaylistFolders: string[] = [];
      let checkedShowCount = 0;

      for (const show of activeShows) {
        const shortName = String(show?.nameShort || '').trim();
        if (shortName) {
          checkedShowCount++;
          knownShortNamesLower.add(shortName.toLowerCase());
          const showFolderPath = path.join(evergreensPath, shortName);
          if (!fs.existsSync(showFolderPath)) {
            fs.mkdirSync(showFolderPath, { recursive: true });
            if (!createdEvergreenFolders.includes(shortName)) {
              createdEvergreenFolders.push(shortName);
            }
            if (!createdFolders.includes(shortName)) {
              createdFolders.push(shortName);
            }
          }

          const showPlaylistFolderPath = path.join(playlistsPath, shortName);
          if (!fs.existsSync(showPlaylistFolderPath)) {
            fs.mkdirSync(showPlaylistFolderPath, { recursive: true });
            if (!createdPlaylistFolders.includes(shortName)) {
              createdPlaylistFolders.push(shortName);
            }
            if (!createdFolders.includes(shortName)) {
              createdFolders.push(shortName);
            }
          }
        }
      }

      const findExtraSubfolders = (baseDirPath: string): string[] => {
        try {
          const entries = fs.readdirSync(baseDirPath, { withFileTypes: true });
          return entries
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => e.name)
            .filter(name => !knownShortNamesLower.has(name.toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        } catch (_) {
          return [];
        }
      };

      const extraEvergreenFolders = findExtraSubfolders(evergreensPath);
      const extraPlaylistFolders = findExtraSubfolders(playlistsPath);

      res.json({
        success: true,
        evergreensFolderCreated,
        playlistsFolderCreated,
        announcementsFolderCreated,
        announcementsReadonlyError,
        announcementsReadonlyMessage,
        evergreensPath,
        playlistsPath,
        announcementsPath,
        checkedShowCount,
        createdEvergreenFolders,
        createdPlaylistFolders,
        createdFolders,
        extraEvergreenFolders,
        extraPlaylistFolders
      });
    } catch (err: any) {
      console.error('Error in /api/shows/verify-evergreens:', err);
      res.status(500).json({ error: 'Verification failed: ' + err.message });
    }
  });

  // API - Check if Evergreen or Playlist folder exists (Unified Local + Google Drive)
  app.post('/api/shows/evergreen/check-folder', async (req, res) => {
    try {
      const { oldNameShort, newNameShort } = req.body;
      if (isServerDriveStorageRequest(req)) {
        const result = await checkServerDriveEvergreenFolder(req, oldNameShort, newNameShort);
        return res.json(result);
      }

      const evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      const playlistsPath = getAmpMediaShowsDir(currentSettings);

      if (!evergreensPath && !playlistsPath) {
        return res.status(400).json({ error: 'Media Directories are not defined or are offline.' });
      }

      const oldEvergreenExists = (oldNameShort && evergreensPath && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, oldNameShort)) : false;
      const oldPlaylistExists = (oldNameShort && playlistsPath && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, oldNameShort)) : false;
      const oldExists = oldEvergreenExists || oldPlaylistExists;

      const newEvergreenExists = (newNameShort && evergreensPath && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, newNameShort)) : false;
      const newPlaylistExists = (newNameShort && playlistsPath && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, newNameShort)) : false;
      const newExists = newEvergreenExists || newPlaylistExists;

      res.json({ success: true, oldExists, newExists, oldEvergreenExists, oldPlaylistExists, newEvergreenExists, newPlaylistExists });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API - Apply Evergreen & Playlist folder creation or renaming (Unified Local + Google Drive)
  app.post('/api/shows/evergreen/apply-change', async (req, res) => {
    try {
      const { action, nameShort, oldNameShort, renameFolder } = req.body;
      if (isServerDriveStorageRequest(req)) {
        const result = await applyServerDriveEvergreenChange(req, action, nameShort, oldNameShort, renameFolder);
        return res.json(result);
      }

      let evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      let playlistsPath = getAmpMediaShowsDir(currentSettings);

      if (!evergreensPath && currentSettings.localPathAmp) {
        evergreensPath = path.join(currentSettings.localPathAmp, 'media_evergreens');
      }
      if (!playlistsPath && currentSettings.localPathAmp) {
        playlistsPath = path.join(currentSettings.localPathAmp, 'media_shows');
      }

      if (!evergreensPath || !playlistsPath) {
        return res.status(400).json({ error: 'Media directories are not defined or are offline.' });
      }

      if (!fs.existsSync(evergreensPath)) {
        fs.mkdirSync(evergreensPath, { recursive: true });
      }
      if (!fs.existsSync(playlistsPath)) {
        fs.mkdirSync(playlistsPath, { recursive: true });
      }

      let folderCreated = false;
      let folderRenamed = false;

      // 1. Evergreens folder sync
      const newEvergreenFolderPath = path.join(evergreensPath, nameShort);
      if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
        const oldFolderPath = path.join(evergreensPath, oldNameShort);
        if (fs.existsSync(oldFolderPath) && renameFolder) {
          if (!fs.existsSync(newEvergreenFolderPath)) {
            fs.renameSync(oldFolderPath, newEvergreenFolderPath);
            folderRenamed = true;
          }
        } else if (!fs.existsSync(newEvergreenFolderPath)) {
          fs.mkdirSync(newEvergreenFolderPath, { recursive: true });
          folderCreated = true;
        }
      } else if (!fs.existsSync(newEvergreenFolderPath)) {
        fs.mkdirSync(newEvergreenFolderPath, { recursive: true });
        folderCreated = true;
      }

      // 2. Playlists folder sync
      const newPlaylistFolderPath = path.join(playlistsPath, nameShort);
      if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
        const oldPlaylistFolderPath = path.join(playlistsPath, oldNameShort);
        if (fs.existsSync(oldPlaylistFolderPath) && renameFolder) {
          if (!fs.existsSync(newPlaylistFolderPath)) {
            fs.renameSync(oldPlaylistFolderPath, newPlaylistFolderPath);
            folderRenamed = true;
          }
        } else if (!fs.existsSync(newPlaylistFolderPath)) {
          fs.mkdirSync(newPlaylistFolderPath, { recursive: true });
          folderCreated = true;
        }
      } else if (!fs.existsSync(newPlaylistFolderPath)) {
        fs.mkdirSync(newPlaylistFolderPath, { recursive: true });
        folderCreated = true;
      }

      res.json({ success: true, folderCreated, folderRenamed });
    } catch (err: any) {
      console.error('Error in /api/shows/evergreen/apply-change:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET & POST /api/shows/discover-folders - Inspect folder, subfolders, and playlists (Unified Local + Google Drive)
  const handleDiscoverShowFolders = async (req: express.Request, res: express.Response) => {
    try {
      const folderType = String(req.query.folderType || req.body?.folderType || 'Playlists');
      const showName = String(req.query.showName || req.body?.showName || '');
      const showNameShort = String(req.query.showNameShort || req.body?.showNameShort || '');
      const showId = String(req.query.showId || req.body?.showId || '');
      const customPath = String(req.query.customPath || req.body?.customPath || '');

      if (isServerDriveStorageRequest(req) && !customPath) {
        const result = await discoverServerDriveShowFolders(req, {
          folderType,
          showNameShort,
          showName,
          showId
        });
        return res.json(result);
      }

      const isEvergreen = folderType && folderType.toLowerCase().startsWith('evergreen');
      const defaultDir = isEvergreen
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);
      const baseFlavorFolder = isEvergreen ? 'media_evergreens' : 'media_shows';
      const fallbackShowFolderName = showNameShort || showName || showId || 'Show';

      let targetRootPath: string | null = null;
      let defaultFolderPath: string | undefined = undefined;

      if (customPath && fs.existsSync(customPath)) {
        targetRootPath = customPath;
      } else {
        const searchKey = showNameShort || showName || showId;
        if (!searchKey) {
          return res.status(400).json({ error: 'showName, showNameShort, showId, or customPath is required' });
        }
        targetRootPath = defaultDir ? findShowPlaylistFolder(defaultDir, showNameShort, showName) : null;
        defaultFolderPath = targetRootPath || (defaultDir ? path.join(defaultDir, fallbackShowFolderName) : undefined);
      }

      const resolvedRootFolderName = targetRootPath ? path.basename(targetRootPath) : fallbackShowFolderName;
      const defaultFolderName = `${baseFlavorFolder}/${resolvedRootFolderName}`;

      if (!targetRootPath || !fs.existsSync(targetRootPath)) {
        return res.json({
          success: true,
          hasMultipleFolders: false,
          totalFiles: 0,
          folderCount: 0,
          folders: [],
          defaultFolderName,
          defaultFolderPath
        });
      }

      const folders: DiscoveredFolderItem[] = [];

      const inspectDirectory = async (dirPath: string, relPrefix: string = '', depth: number = 0, isRoot: boolean = false) => {
        if (depth > 6) return;
        if (!fs.existsSync(dirPath)) return;

        const scan = await getAllAudioAndPlaylistFilesAsync(dirPath, { recursive: false });
        const { m3uFiles, audioFiles } = scan;
        const totalFolderFiles = audioFiles.length + m3uFiles.length;

        const playlistInfoList: Array<{
          m3uPath: string;
          fileName: string;
          totalTracks: number;
          missingCount: number;
          referencedFileNames: Set<string>;
        }> = [];

        for (const m3u of m3uFiles) {
          const m3uFileName = path.basename(m3u);
          const tracks = await parseM3uFileAsync(m3u, dirPath);
          let missingCount = 0;
          const referencedNames = new Set<string>();

          for (const t of tracks) {
            referencedNames.add(t.fileName.toLowerCase());
            if (t.exists === false) {
              missingCount++;
            }
          }

          playlistInfoList.push({
            m3uPath: m3u,
            fileName: m3uFileName,
            totalTracks: tracks.length,
            missingCount,
            referencedFileNames: referencedNames
          });
        }

        const folderDisplayName = isRoot ? `${path.basename(dirPath)} (Default)` : path.basename(dirPath);
        const relPath = relPrefix || '.';

        if (playlistInfoList.length === 1 && audioFiles.length > 0) {
          const singleM3u = playlistInfoList[0];
          const allAudioRepresented = audioFiles.every(a => singleM3u.referencedFileNames.has(a.name.toLowerCase()));
          if (allAudioRepresented) {
            folders.push({
              id: isRoot ? 'root' : `folder-${relPath}`,
              name: folderDisplayName,
              relPath: relPath,
              fileCount: singleM3u.totalTracks,
              isRoot: isRoot,
              hasM3u: true,
              itemType: 'playlist',
              playlistFileName: singleM3u.fileName,
              missingCount: singleM3u.missingCount,
              totalTracks: singleM3u.totalTracks,
              depth
            });
          } else {
            folders.push({
              id: isRoot ? 'root' : `folder-${relPath}`,
              name: folderDisplayName,
              relPath: relPath,
              fileCount: totalFolderFiles,
              isRoot: isRoot,
              hasM3u: true,
              itemType: 'folder',
              depth
            });

            folders.push({
              id: `pl-${relPath}-${singleM3u.fileName}`,
              name: singleM3u.fileName,
              relPath: relPath,
              fileCount: singleM3u.totalTracks,
              isRoot: false,
              hasM3u: true,
              itemType: 'playlist',
              playlistFileName: singleM3u.fileName,
              missingCount: singleM3u.missingCount,
              totalTracks: singleM3u.totalTracks,
              depth: depth + 1
            });
          }
        } else if (playlistInfoList.length > 1) {
          if (totalFolderFiles > 0) {
            folders.push({
              id: isRoot ? 'root' : `folder-${relPath}`,
              name: folderDisplayName,
              relPath: relPath,
              fileCount: totalFolderFiles,
              isRoot: isRoot,
              hasM3u: true,
              itemType: 'folder',
              depth
            });
          }

          for (const pl of playlistInfoList) {
            folders.push({
              id: `pl-${relPath}-${pl.fileName}`,
              name: pl.fileName,
              relPath: relPath,
              fileCount: pl.totalTracks,
              isRoot: false,
              hasM3u: true,
              itemType: 'playlist',
              playlistFileName: pl.fileName,
              missingCount: pl.missingCount,
              totalTracks: pl.totalTracks,
              depth: depth + 1
            });
          }
        } else if (totalFolderFiles > 0) {
          folders.push({
            id: isRoot ? 'root' : `folder-${relPath}`,
            name: folderDisplayName,
            relPath: relPath,
            fileCount: totalFolderFiles,
            isRoot: isRoot,
            hasM3u: false,
            itemType: 'folder',
            depth
          });
        }

        try {
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
          const subdirs = entries
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

          for (const sub of subdirs) {
            const subDirPath = path.join(dirPath, sub.name);
            const subRelPath = relPrefix ? `${relPrefix}/${sub.name}` : sub.name;
            await inspectDirectory(subDirPath, subRelPath, depth + 1, false);
          }
        } catch (_) {}
      };

      await inspectDirectory(targetRootPath, '', 0, true);

      const totalFiles = folders.reduce((sum, f) => sum + (f.totalTracks || f.fileCount || 0), 0);

      res.json({
        success: true,
        hasMultipleFolders: folders.length > 1,
        totalFiles,
        folderCount: folders.length,
        folders,
        defaultFolderName,
        defaultFolderPath
      });
    } catch (err: any) {
      console.error('Error in /api/shows/discover-folders:', err);
      res.status(500).json({ error: err.message, hasMultipleFolders: false, totalFiles: 0, folderCount: 0, folders: [] });
    }
  };

  app.get('/api/shows/discover-folders', handleDiscoverShowFolders);
  app.post('/api/shows/discover-folders', handleDiscoverShowFolders);

  // POST /api/shows/:showId/prepare-context - On-demand targeted show preparation
  app.post('/api/shows/:showId/prepare-context', async (req, res) => {
    try {
      const showId = req.params.showId || req.body.showId;
      const { showName, showNameShort, context, folderType, targetSubfolder, isExternal, externalAbsolutePath } = req.body;

      setActiveShowContextState(null);

      if (isServerDriveStorageRequest(req) && !isExternal && !externalAbsolutePath) {
        const driveRes = await loadServerDrivePlaylistTracks(req, {
          showNameShort,
          showName,
          folderType,
          targetSubfolder
        });
        const totalDurationSeconds = (driveRes.tracks || []).reduce((sum: number, t: any) => sum + (t.durationSeconds || 0), 0);
        const prepared: PreparedShowContext = {
          showId: showId || showNameShort || showName || 'unknown',
          showName: showName || showNameShort || showId || 'unknown',
          showNameShort: driveRes.showNameShort || showNameShort || showName || 'unknown',
          context: context || 'Playlist',
          folderType: folderType || 'Playlists',
          selectedFolderPath: targetSubfolder || '.',
          isExternalFolder: false,
          externalAbsolutePath: null,
          preparedAt: new Date().toISOString(),
          playlistFile: driveRes.playlistFile,
          totalTracks: (driveRes.tracks || []).length,
          totalDurationSeconds,
          tracks: (driveRes.tracks || []).map(t => ({
            ...t,
            fullPath: t.streamUrl || t.fileName
          }))
        };
        setActiveShowContextState(prepared);
        return res.json({
          success: true,
          context: prepared,
          totalTracks: prepared.totalTracks,
          totalDurationSeconds: prepared.totalDurationSeconds
        });
      }

      const prepared = await buildShowContext({
        showId,
        showName,
        showNameShort,
        context,
        folderType,
        targetSubfolder,
        isExternal,
        externalAbsolutePath
      });

      setActiveShowContextState(prepared);

      res.json({
        success: true,
        context: prepared,
        totalTracks: prepared.totalTracks,
        totalDurationSeconds: prepared.totalDurationSeconds
      });
    } catch (err: any) {
      console.error('Error preparing show context:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/shows/prepare-context (Body-based alias)
  app.post('/api/shows/prepare-context', async (req, res) => {
    try {
      const { showId, showName, showNameShort, context, folderType, targetSubfolder, isExternal, externalAbsolutePath } = req.body;
      if (!showId && !showName && !showNameShort) {
        return res.status(400).json({ error: 'showId or showName is required' });
      }

      setActiveShowContextState(null);

      if (isServerDriveStorageRequest(req) && !isExternal && !externalAbsolutePath) {
        const driveRes = await loadServerDrivePlaylistTracks(req, {
          showNameShort,
          showName,
          folderType,
          targetSubfolder
        });
        const totalDurationSeconds = (driveRes.tracks || []).reduce((sum: number, t: any) => sum + (t.durationSeconds || 0), 0);
        const prepared: PreparedShowContext = {
          showId: showId || showNameShort || showName || 'unknown',
          showName: showName || showNameShort || showId || 'unknown',
          showNameShort: driveRes.showNameShort || showNameShort || showName || 'unknown',
          context: context || 'Playlist',
          folderType: folderType || 'Playlists',
          selectedFolderPath: targetSubfolder || '.',
          isExternalFolder: false,
          externalAbsolutePath: null,
          preparedAt: new Date().toISOString(),
          playlistFile: driveRes.playlistFile,
          totalTracks: (driveRes.tracks || []).length,
          totalDurationSeconds,
          tracks: (driveRes.tracks || []).map(t => ({
            ...t,
            fullPath: t.streamUrl || t.fileName
          }))
        };
        setActiveShowContextState(prepared);
        return res.json({
          success: true,
          context: prepared,
          totalTracks: prepared.totalTracks,
          totalDurationSeconds: prepared.totalDurationSeconds
        });
      }

      const prepared = await buildShowContext({
        showId: showId || showNameShort || showName,
        showName,
        showNameShort,
        context,
        folderType,
        targetSubfolder,
        isExternal,
        externalAbsolutePath
      });

      setActiveShowContextState(prepared);

      res.json({
        success: true,
        context: prepared,
        totalTracks: prepared.totalTracks,
        totalDurationSeconds: prepared.totalDurationSeconds
      });
    } catch (err: any) {
      console.error('Error preparing show context:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/shows/active-context - Fetch currently prepared active show context
  app.get('/api/shows/active-context', (req, res) => {
    const activeShowContext = getActiveShowContextState();
    res.json({
      success: true,
      hasContext: !!activeShowContext,
      context: activeShowContext
    });
  });

  // POST /api/shows/clear-context - Teardown and free memory when exiting show modal/session
  app.post('/api/shows/clear-context', (req, res) => {
    setActiveShowContextState(null);
    res.json({ success: true, message: 'Active show context cleared' });
  });

  // POST /api/shows/:showId/clear-context
  app.post('/api/shows/:showId/clear-context', (req, res) => {
    setActiveShowContextState(null);
    res.json({ success: true, message: 'Show context cleared' });
  });

  // API - Load playlist tracks for a show (Unified Local + Google Drive)
  app.post('/api/shows/playlist/load-tracks', async (req, res) => {
    try {
      const { showNameShort, showName, folderType, targetSubfolder, isExternal, externalAbsolutePath } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      if (isServerDriveStorageRequest(req) && !isExternal && !externalAbsolutePath) {
        const result = await loadServerDrivePlaylistTracks(req, {
          showNameShort,
          showName,
          folderType,
          targetSubfolder
        });
        return res.json(result);
      }

      const searchKey = showNameShort || showName;
      const requestedFolderType = folderType || 'Playlists';
      const requestedSubfolder = targetSubfolder || '.';
      const requestedExternalPath = externalAbsolutePath || null;

      const activeShowContext = getActiveShowContextState();
      if (
        activeShowContext &&
        (activeShowContext.showNameShort === searchKey || activeShowContext.showName === searchKey || activeShowContext.showId === searchKey) &&
        activeShowContext.folderType === requestedFolderType &&
        (activeShowContext.selectedFolderPath || '.') === requestedSubfolder &&
        (activeShowContext.externalAbsolutePath || null) === requestedExternalPath
      ) {
        return res.json({
          success: true,
          showNameShort: activeShowContext.showNameShort,
          playlistFile: activeShowContext.playlistFile,
          tracks: activeShowContext.tracks,
          cached: true
        });
      }

      const prepared = await buildShowContext({
        showId: searchKey,
        showName,
        showNameShort,
        context: 'Playlist',
        folderType: requestedFolderType,
        targetSubfolder: requestedSubfolder,
        isExternal,
        externalAbsolutePath: requestedExternalPath
      });

      setActiveShowContextState(prepared);

      res.json({
        success: true,
        showNameShort: prepared.showNameShort,
        playlistFile: prepared.playlistFile,
        tracks: prepared.tracks
      });
    } catch (err: any) {
      console.error('Error in /api/shows/playlist/load-tracks:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API - Get metadata for a specific playlist MP3 file
  app.get('/api/shows/playlist/file-metadata', async (req, res) => {
    try {
      const showNameShort = req.query.showNameShort as string;
      const showName = req.query.showName as string;
      const file = (req.query.file || req.query.path) as string;

      if (!showNameShort && !showName && !file) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const targetFilePath = resolveMediaFilePath(req.query);

      if (targetFilePath && fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
        const meta = await getMp3ServerMetadata(targetFilePath);
        return res.json({ success: true, metadata: meta });
      }

      return res.status(404).json({ error: 'File not found' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API - Check MP3 / track count for current and next show in Playlist mode (Unified Local + Google Drive)
  app.post('/api/shows/playlist/check-show-files', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await checkServerDrivePlaylistShowFiles(req, req.body);
        return res.json(result);
      }

      const { currentShowNameShort, currentShowName, nextShowNameShort, nextShowName } = req.body;

      const showsPath = getAmpMediaShowsDir(currentSettings);
      const evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      if (!showsPath && !evergreensPath) {
        return res.json({ success: true, currentShowFileCount: 0, currentShowFolderCount: 0, nextShowFileCount: 0, nextShowFolderCount: 0 });
      }

      const getShowStats = async (shortName?: string, name?: string) => {
        if (!shortName && !name) return { fileCount: 0, folderCount: 0 };
        let showFolderPath = showsPath ? findShowPlaylistFolder(showsPath, shortName, name) : null;
        if (!showFolderPath && evergreensPath) {
          showFolderPath = findShowPlaylistFolder(evergreensPath, shortName, name);
        }
        if (!showFolderPath) return { fileCount: 0, folderCount: 0 };

        const folders: Array<{ fileCount: number }> = [];

        const countAudioTracksInScan = async (scan: { m3uFiles: string[]; audioFiles: Array<{ relPath: string; fullPath: string; name: string }> }, folderDir: string): Promise<number> => {
          if (scan.m3uFiles.length > 0) {
            try {
              const tracks = await parseM3uFileAsync(scan.m3uFiles[0], folderDir);
              if (tracks.length > 0) return tracks.length;
            } catch (_) {}
          }
          return scan.audioFiles.length;
        };

        const rootScan = await getAllAudioAndPlaylistFilesAsync(showFolderPath, { recursive: false });
        const rootCount = await countAudioTracksInScan(rootScan, showFolderPath);
        if (rootCount > 0) {
          folders.push({ fileCount: rootCount });
        }

        const entries = await fs.promises.readdir(showFolderPath, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = path.join(showFolderPath, entry.name);
            const subScan = await getAllAudioAndPlaylistFilesAsync(subPath, { recursive: false });
            const subCount = await countAudioTracksInScan(subScan, subPath);
            if (subCount > 0) {
              folders.push({ fileCount: subCount });
            }
          }
        }

        const totalFiles = folders.reduce((sum, f) => sum + f.fileCount, 0);
        return {
          fileCount: totalFiles,
          folderCount: folders.length
        };
      };

      const currentStats = await getShowStats(currentShowNameShort, currentShowName);
      const nextStats = await getShowStats(nextShowNameShort, nextShowName);

      res.json({
        success: true,
        currentShowFileCount: currentStats.fileCount,
        currentShowFolderCount: currentStats.folderCount,
        nextShowFileCount: nextStats.fileCount,
        nextShowFolderCount: nextStats.folderCount
      });
    } catch (err: any) {
      console.error('Error in /api/shows/playlist/check-show-files:', err);
      res.status(500).json({ error: err.message, currentShowFileCount: 0, currentShowFolderCount: 0, nextShowFileCount: 0, nextShowFolderCount: 0 });
    }
  });

  // API - Dedicated Playlist Show JSON Log Save (Unified Local + Google Drive)
  app.post('/api/shows/playlist/save-log-json', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await saveServerDriveShowPlaylistLog(req, req.body);
        return res.json(result);
      }

      const { showNameShort, showName, showStartTime, logData, folderType, logFileName: clientLogFileName } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      let showFolderPath: string | null = null;
      const mediaDir = folderType === 'Evergreens'
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);

      if (mediaDir && fs.existsSync(mediaDir)) {
        const searchKey = showNameShort || showName;
        showFolderPath = findShowPlaylistFolder(mediaDir, showNameShort, showName);
        if (!showFolderPath) {
          showFolderPath = path.join(mediaDir, String(searchKey).replace(/[\/\\?%*:|"<>]/g, '_'));
          if (!fs.existsSync(showFolderPath)) {
            fs.mkdirSync(showFolderPath, { recursive: true });
          }
        }
      }

      const dateObj = showStartTime ? new Date(showStartTime) : new Date();
      const YYYY = dateObj.getFullYear();
      const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
      const DD = String(dateObj.getDate()).padStart(2, '0');
      const HH = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const safeShowName = String(showNameShort || showName || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
      const fallbackFileName = `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
      const logFileName = clientLogFileName || logData?.logFileName || fallbackFileName;

      if (showFolderPath) {
        const filePath = path.join(showFolderPath, logFileName);
        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf-8');
      }

      const logHistoryDir = getAmpLogHistoryDir(currentSettings);
      if (logHistoryDir && fs.existsSync(logHistoryDir)) {
        fs.writeFileSync(path.join(logHistoryDir, logFileName), JSON.stringify(logData, null, 2), 'utf-8');
      }

      res.json({ success: true, logFileName });
    } catch (e: any) {
      console.error('Failed to save playlist JSON log:', e);
      res.status(500).json({ error: 'Failed to save playlist JSON log: ' + e.message });
    }
  });

  // API - Dedicated Playlist Show JSON Log Load (Unified Local + Google Drive)
  app.post('/api/shows/playlist/load-log-json', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await loadServerDriveShowPlaylistLog(req, req.body);
        return res.json(result);
      }

      const { showNameShort, showName, showStartTime, folderType, logFileName: clientLogFileName } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      const dateObj = showStartTime ? new Date(showStartTime) : new Date();
      const YYYY = dateObj.getFullYear();
      const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
      const DD = String(dateObj.getDate()).padStart(2, '0');
      const HH = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const safeShowName = String(showNameShort || showName || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
      const fallbackFileName = `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
      const logFileName = clientLogFileName || fallbackFileName;
      const datePrefix = `${YYYY}_${MM}_${DD}`;

      const findFileInDir = (dirPath: string, fileName: string): string | null => {
        if (!dirPath || !fs.existsSync(dirPath)) return null;
        const exact = path.join(dirPath, fileName);
        if (fs.existsSync(exact)) return exact;

        try {
          const files = fs.readdirSync(dirPath);
          const lowerName = fileName.toLowerCase();
          for (const f of files) {
            if (f.toLowerCase() === lowerName) {
              return path.join(dirPath, f);
            }
          }
          for (const f of files) {
            if (f.startsWith('Log_') && f.includes(datePrefix) && f.endsWith('.json')) {
              return path.join(dirPath, f);
            }
          }
        } catch (e) {}
        return null;
      };

      let foundData: any = null;
      const mediaDir = folderType === 'Evergreens'
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);

      if (mediaDir && fs.existsSync(mediaDir)) {
        const showFolderPath = findShowPlaylistFolder(mediaDir, showNameShort, showName);
        if (showFolderPath) {
          const matchedFilePath = findFileInDir(showFolderPath, logFileName);
          if (matchedFilePath) {
            const raw = fs.readFileSync(matchedFilePath, 'utf-8');
            foundData = JSON.parse(raw);
          }
        }
      }

      res.json({ success: true, logFileName, logData: foundData });
    } catch (e: any) {
      console.error('Failed to load playlist JSON log:', e);
      res.status(500).json({ error: 'Failed to load playlist JSON log: ' + e.message });
    }
  });

  // API - Check if export folder already exists and has files
  app.post('/api/check-export-folder', (req, res) => {
    try {
      const { exportDestination, folderPrefix, prerecordDate, lengthMinutes } = req.body;
      if (!prerecordDate) {
        return res.status(400).json({ error: 'Prerecord date is required' });
      }

      const defaultDest = getAmpMediaShowsDir(currentSettings) || (currentSettings.localPathAmp ? path.join(currentSettings.localPathAmp, 'media_shows') : null);
      const destParentFolder = (exportDestination && exportDestination.trim()) || defaultDest;
      if (!destParentFolder) {
        return res.status(400).json({ error: 'Export destination folder or Media folder is not defined' });
      }

      const { exportFolderName, exportFolderPath } = computeExportFolderInfo(
        destParentFolder,
        prerecordDate,
        Number(lengthMinutes) || 0,
        folderPrefix
      );

      if (!fs.existsSync(exportFolderPath)) {
        return res.json({
          exists: false,
          hasFiles: false,
          fileCount: 0,
          files: [],
          exportFolderName,
          exportFolderPath
        });
      }

      try {
        const entries = fs.readdirSync(exportFolderPath, { withFileTypes: true });
        const files = entries.filter(e => e.isFile()).map(e => e.name);
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        const totalItems = entries.length;
        const fileCount = files.length;

        return res.json({
          exists: true,
          hasFiles: totalItems > 0,
          fileCount,
          totalItems,
          files: files.slice(0, 10),
          directories: dirs,
          exportFolderName,
          exportFolderPath
        });
      } catch (e: any) {
        return res.json({
          exists: true,
          hasFiles: false,
          fileCount: 0,
          files: [],
          exportFolderName,
          exportFolderPath
        });
      }
    } catch (e: any) {
      console.error('Failed to check export folder:', e);
      res.status(500).json({ error: 'Failed to check export folder: ' + e.message });
    }
  });

  // API - Export prerecord playlist and files
  app.post('/api/export-prerecord', async (req, res) => {
    try {
      const { prerecordDate, lengthMinutes, items, exportDestination, folderPrefix, textPrefix, playlistPrefix, overwriteMode } = req.body;
      if (!prerecordDate) {
        return res.status(400).json({ error: 'Prerecord date is required' });
      }
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Scheduled items array is required' });
      }

      const defaultDest = getAmpMediaShowsDir(currentSettings) || (currentSettings.localPathAmp ? path.join(currentSettings.localPathAmp, 'media_shows') : null);
      const destParentFolder = (exportDestination && exportDestination.trim()) || defaultDest;
      if (!destParentFolder) {
        return res.status(400).json({ error: 'Export destination folder or Media folder is not defined' });
      }
      if (!fs.existsSync(destParentFolder)) {
        fs.mkdirSync(destParentFolder, { recursive: true });
      }

      const evergreensFolder = getAmpMediaEvergreensDir(currentSettings);
      const announcementsFolder = getAmpMediaAnnouncementsDir(currentSettings);
      const showsFolder = getAmpMediaShowsDir(currentSettings);

      const { exportFolderName, exportFolderPath, dateStr, timeStr, durationStr, hours, minutes } = computeExportFolderInfo(
        destParentFolder,
        prerecordDate,
        Number(lengthMinutes) || 0,
        folderPrefix
      );

      const tPrefix = (textPrefix && textPrefix.trim()) || 'Show';
      const pPrefix = (playlistPrefix && playlistPrefix.trim()) || 'Show';

      if (overwriteMode === 'clean' && fs.existsSync(exportFolderPath)) {
        cleanExportFolder(exportFolderPath);
      }

      if (!fs.existsSync(exportFolderPath)) {
        fs.mkdirSync(exportFolderPath, { recursive: true });
      }

      let copiedCount = 0;
      let missingCount = 0;
      const fileReport: any[] = [];

      const m3uLines: string[] = ['#EXTM3U'];
      const txtLines: string[] = [
        '========================================================================',
        '              PRERECORD BROADCAST SCHEDULE SUMMARY',
        '========================================================================',
        `Air Date: ${dateStr}`,
        `Start Time: ${hours}:${minutes}`,
        `Duration: ${lengthMinutes} minutes`,
        '========================================================================',
        '',
        'SEQUENCE OF SCHEDULED SPECIALS & BREAKS:',
        '------------------------------------------------------------------------'
      ];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime;
        let safeSlotTime = '00-00 AM';
        if (typeof itemSlotTime === 'string') {
          const parts = itemSlotTime.split(':');
          if (parts.length >= 2) {
            safeSlotTime = formatExportTimeAmPm(parts[0], parts[1]);
          } else {
            safeSlotTime = itemSlotTime.replace(/:/g, '-');
          }
        }

        const isScript = item.assetType === 'script';
        const rawName = item.announcementName || (item.isEvergreen ? 'Unnamed Evergreen Track' : (isScript ? 'Unnamed Live Read' : 'Unnamed Break'));
        const safeName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();

        const sourceFileName = item.fileName || '';
        const rawExt = path.extname(sourceFileName) || (isScript ? '.txt' : '.mp3');
        const isUpNextPromoItem =
          Boolean(item.isUpNextPromo) ||
          sourceFileName.startsWith('__up_next_promo__:') ||
          (typeof item.rawMp3Url === 'string' && item.rawMp3Url.startsWith('__up_next_promo__:'));
        const isTextScript =
          isUpNextPromoItem ||
          (isScript && (rawExt.toLowerCase() === '.txt' || rawExt.toLowerCase() === '.md'));
        const ext = isTextScript ? '.txt' : rawExt;

        const paddedIdx = String(itemIdx).padStart(2, '0');
        const typePrefix = item.isEvergreen ? 'Track' : 'Break';
        const fallbackShowPrefix = (item.showNameShort || item.showName || folderPrefix || textPrefix || playlistPrefix || 'Show').trim();
        const rawTargetFileName = item.targetFileName || `${fallbackShowPrefix} ${paddedIdx} ${typePrefix} at ${safeSlotTime} - ${safeName}${ext}`;
        const targetBaseWithoutExt = rawTargetFileName.replace(/\.(txt|md|rtf)$/i, '');
        const targetFileName = isTextScript ? `${targetBaseWithoutExt}.txt` : rawTargetFileName;
        const targetRtfFileName = isTextScript ? `${targetBaseWithoutExt}.rtf` : '';

        let sourceFilePath: string | null = null;
        if (item.isEvergreen) {
          if (evergreensFolder) {
            sourceFilePath = findEvergreenSourceFile(evergreensFolder, sourceFileName, item.showNameShort, item.showName);
          }
          if (!sourceFilePath && showsFolder) {
            sourceFilePath = findEvergreenSourceFile(showsFolder, sourceFileName, item.showNameShort, item.showName);
          }
        } else {
          if (announcementsFolder) {
            sourceFilePath = findAnnouncementSourceFile(announcementsFolder, sourceFileName);
          }
          if (!sourceFilePath && showsFolder) {
            sourceFilePath = findAnnouncementSourceFile(showsFolder, sourceFileName);
          }
        }

        const destFilePath = path.join(exportFolderPath, targetFileName);
        const destRtfFilePath = targetRtfFileName ? path.join(exportFolderPath, targetRtfFileName) : '';

        let itemArtist = (item.artist && typeof item.artist === 'string' && item.artist.trim()) || '';
        let itemAlbumArtist = (item.albumArtist && typeof item.albumArtist === 'string' && item.albumArtist.trim()) || '';
        let itemAlbum = (item.album && typeof item.album === 'string' && item.album.trim()) || '';

        let status = 'Missing';
        if (isUpNextPromoItem) {
          try {
            let decodedText = '';
            if (typeof item.upNextScriptText === 'string' && item.upNextScriptText.trim()) {
              decodedText = item.upNextScriptText;
            } else {
              const promoSource =
                typeof item.rawMp3Url === 'string' && item.rawMp3Url.startsWith('__up_next_promo__:')
                  ? item.rawMp3Url
                  : sourceFileName;
              const rawEncoded = promoSource.replace(/^__up_next_promo__:/, '').replace(/\.txt$/i, '');
              decodedText = rawEncoded;
              try {
                decodedText = decodeURIComponent(rawEncoded);
              } catch (_) {}
            }
            const cleanPlainTxt = stripFormattingMarkers(decodedText);
            const rtfContent = markdownTxtToRtf(decodedText);
            fs.writeFileSync(destFilePath, cleanPlainTxt, 'utf-8');
            if (destRtfFilePath) {
              fs.writeFileSync(destRtfFilePath, rtfContent, 'utf-8');
            }
            copiedCount++;
            status = 'Found & Copied';
          } catch (writeErr: any) {
            status = `Copy Error: ${writeErr?.message || 'Failed to write promo script'}`;
            missingCount++;
          }
        } else if (isTextScript && sourceFilePath && fs.existsSync(sourceFilePath)) {
          try {
            const rawScriptText = await withTimeout(
              fs.promises.readFile(sourceFilePath, 'utf-8'),
              10000,
              null as string | null
            );
            if (rawScriptText !== null) {
              const cleanPlainTxt = stripFormattingMarkers(rawScriptText);
              const rtfContent = markdownTxtToRtf(rawScriptText);
              fs.writeFileSync(destFilePath, cleanPlainTxt, 'utf-8');
              if (destRtfFilePath) {
                fs.writeFileSync(destRtfFilePath, rtfContent, 'utf-8');
              }
              copiedCount++;
              status = 'Found & Copied';
            } else {
              status = 'Copy Error: Timeout (File locked or syncing in cloud)';
              missingCount++;
            }
          } catch (readWriteErr: any) {
            console.error(`Error exporting text script ${sourceFileName}:`, readWriteErr);
            status = `Copy Error: ${readWriteErr?.message || 'Failed to export script'}`;
            missingCount++;
          }
        } else if (sourceFilePath && fs.existsSync(sourceFilePath)) {
          try {
            const copyRes = await withTimeout(
              fs.promises.copyFile(sourceFilePath, destFilePath).then(() => true),
              10000,
              false
            );

            if (copyRes) {
              copiedCount++;
              status = 'Found & Copied';

              if (ext.toLowerCase() === '.mp3') {
                try {
                  const existingTags = NodeID3.read(destFilePath);
                  const baseTitle = (existingTags && typeof existingTags.title === 'string' && existingTags.title.trim())
                    ? existingTags.title.trim()
                    : rawName;
                  const newTitle = `${paddedIdx} ${typePrefix} - ${baseTitle}`;
                  NodeID3.update({ title: newTitle }, destFilePath);

                  if (!itemArtist && existingTags && typeof existingTags.artist === 'string' && existingTags.artist.trim()) {
                    itemArtist = existingTags.artist.trim();
                  }
                  if (!itemAlbumArtist && existingTags && typeof (existingTags as any).albumArtist === 'string' && (existingTags as any).albumArtist.trim()) {
                    itemAlbumArtist = (existingTags as any).albumArtist.trim();
                  }
                  if (!itemAlbum && existingTags && typeof existingTags.album === 'string' && existingTags.album.trim()) {
                    itemAlbum = existingTags.album.trim();
                  }
                } catch (id3Err) {
                  console.warn(`Failed to update ID3 tags for ${targetFileName}:`, id3Err);
                }
              }
            } else {
              status = 'Copy Error: Timeout (File locked or syncing in cloud)';
              missingCount++;
            }
          } catch (copyErr: any) {
            console.error(`Error copying ${sourceFileName}:`, copyErr);
            status = `Copy Error: ${copyErr.message}`;
            missingCount++;
          }
        } else {
          missingCount++;
        }

        let backupStatus = '';
        let backupTargetFileName = '';
        if (isScript && item.backupMp3Url) {
          const backupExt = path.extname(item.backupMp3Url) || '.mp3';
          const dotIdx = targetFileName.lastIndexOf('.');
          const baseTargetWithoutExt = dotIdx !== -1 ? targetFileName.substring(0, dotIdx) : targetFileName;
          backupTargetFileName = `${baseTargetWithoutExt} (Backup)${backupExt}`;

          const backupSourcePath = announcementsFolder ? findAnnouncementSourceFile(announcementsFolder, item.backupMp3Url) : null;
          const backupDestPath = path.join(exportFolderPath, backupTargetFileName);

          if (backupSourcePath && fs.existsSync(backupSourcePath)) {
            try {
              const backupCopyRes = await withTimeout(
                fs.promises.copyFile(backupSourcePath, backupDestPath).then(() => true),
                10000,
                false
              );

              if (backupCopyRes) {
                copiedCount++;
                backupStatus = 'Found & Copied';

                if (backupExt.toLowerCase() === '.mp3') {
                  try {
                    const existingTags = NodeID3.read(backupDestPath);
                    const baseTitle = (existingTags && typeof existingTags.title === 'string' && existingTags.title.trim())
                      ? existingTags.title.trim()
                      : `${rawName} (Backup MP3)`;
                    const newTitle = `${paddedIdx} ${typePrefix} - ${baseTitle}`;
                    NodeID3.update({ title: newTitle }, backupDestPath);
                  } catch (id3Err) {
                    console.warn(`Failed to update ID3 tags for backup MP3 ${backupTargetFileName}:`, id3Err);
                  }
                }
              } else {
                backupStatus = 'Copy Error: Timeout (File locked or syncing in cloud)';
              }
            } catch (copyErr: any) {
              console.error(`Error copying backup MP3 ${item.backupMp3Url}:`, copyErr);
              backupStatus = `Copy Error: ${copyErr.message}`;
            }
          } else {
            backupStatus = 'Missing';
          }
        }

        fileReport.push({
          index: itemIdx,
          slotTime: itemSlotTime,
          announcementName: rawName,
          originalFile: sourceFileName,
          exportedFile: targetFileName,
          isEvergreen: !!item.isEvergreen,
          assetType: item.assetType,
          backupMp3Url: item.backupMp3Url,
          backupExportedFile: backupTargetFileName || undefined,
          backupStatus: backupStatus || undefined,
          status
        });

        if (ext.toLowerCase() === '.mp3') {
          m3uLines.push(`#EXTINF:-1,${paddedIdx} ${typePrefix} - ${itemSlotTime} - ${rawName}`);
          m3uLines.push(targetFileName);
        } else if (isScript && backupTargetFileName && backupStatus === 'Found & Copied') {
          m3uLines.push(`#EXTINF:-1,${paddedIdx} ${typePrefix} - ${itemSlotTime} - ${rawName} (Backup MP3)`);
          m3uLines.push(backupTargetFileName);
        }

        const itemTypeHeader = item.isEvergreen ? 'EVERGREEN TRACK' : (isScript ? 'LIVE READ BREAK' : 'BREAK');
        const exportedDisplayLabel = isTextScript && targetRtfFileName
          ? `${targetFileName} (+ ${targetRtfFileName})`
          : targetFileName;
        if (status === 'Found & Copied') {
          txtLines.push(`${itemIdx}. [${itemTypeHeader}] Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Scripts' : 'File'}: ${exportedDisplayLabel}`);
          txtLines.push(`   Title: ${rawName}`);
          if (itemArtist) {
            txtLines.push(`   Artist: ${itemArtist}`);
          }
          if (itemAlbumArtist && (!itemArtist || itemAlbumArtist.toLowerCase() !== itemArtist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${itemAlbumArtist}`);
          }
          if (itemAlbum) {
            txtLines.push(`   Album: ${itemAlbum}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName || ''}`);
        } else {
          txtLines.push(`${itemIdx}. [${itemTypeHeader}] MISSING FILE - THIS FILE COULD NOT BE FOUND.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Scripts' : 'File'}: ${exportedDisplayLabel}`);
          txtLines.push(`   Title: ${rawName}`);
          if (itemArtist) {
            txtLines.push(`   Artist: ${itemArtist}`);
          }
          if (itemAlbumArtist && (!itemArtist || itemAlbumArtist.toLowerCase() !== itemArtist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${itemAlbumArtist}`);
          }
          if (itemAlbum) {
            txtLines.push(`   Album: ${itemAlbum}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName || ''}`);
        }

        if (isScript && item.backupMp3Url) {
          txtLines.push(`   Alternate Backup MP3: ${backupTargetFileName} (${backupStatus || 'Not Found'})`);
          txtLines.push(`   Source Backup MP3: ${item.backupMp3Url}`);
        }

        txtLines.push('------------------------------------------------------------------------');
      }

      const txtBaseFilename = `${tPrefix} - Plan - ${dateStr} at ${timeStr} - ${durationStr}`;
      const m3uBaseFilename = `${pPrefix} - Playlist - ${dateStr} at ${timeStr} - ${durationStr}`;
      const txtFilePath = path.join(exportFolderPath, `${txtBaseFilename}.txt`);
      const m3uFilePath = path.join(exportFolderPath, `${m3uBaseFilename}.m3u`);

      fs.writeFileSync(txtFilePath, txtLines.join('\n'), 'utf-8');
      fs.writeFileSync(m3uFilePath, m3uLines.join('\n'), 'utf-8');

      res.json({
        success: true,
        exportFolderPath,
        exportFolderName,
        copiedCount,
        missingCount,
        totalCount: items.length,
        txtFilename: `${txtBaseFilename}.txt`,
        m3uFilename: `${m3uBaseFilename}.m3u`,
        report: fileReport
      });
    } catch (e: any) {
      console.error('Failed to export prerecord:', e);
      res.status(500).json({ error: 'Failed to export prerecord: ' + e.message });
    }
  });
}
