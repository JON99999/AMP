import { MediaAssetFile } from '../types';
import { Mp3ID3Metadata } from './utils';

export interface CachingProgressReport {
  total: number;
  completed: number;
  failed: number;
  errors: Array<{ url: string; fileName?: string; error: string }>;
  isComplete: boolean;
}

export interface AvailableFileEntry {
  path: string;
  size: string | number;
  duration: string;
  mtimeMs?: number;
  modifiedTime?: string;
}

// Memory Cache for MP3 binary blobs to provide immediate playback and zero latency
export const mp3BlobCache = new Map<string, string>(); // Maps raw URL (e.g. googleapis drive url) to local Blob URL
export const rawBlobCache = new Map<string, Blob>(); // Maps raw URL to binary Blob
export const mp3MetadataCache = new Map<string, Mp3ID3Metadata>(); // Maps raw URL to parsed ID3 metadata
export const mp3DurationCache = new Map<string, string>(); // Maps raw URL to calculated duration "m:ss"
export const mp3WaveformCache = new Map<string, number[]>(); // Maps raw URL or path to normalized waveform peaks
export const availableFilesCache = new Map<string, AvailableFileEntry>();

export const pendingAudioFetches = new Map<string, Promise<string>>();

const _driveFileNameInternalMap = new Map<string, string>();

export const driveFileNameCache = {
  get: (url: string): string | undefined => {
    if (!url) return undefined;
    if (_driveFileNameInternalMap.has(url)) return _driveFileNameInternalMap.get(url);
    const idMatch = url.match(/\/files\/([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1] && _driveFileNameInternalMap.has(idMatch[1])) {
      return _driveFileNameInternalMap.get(idMatch[1]);
    }
    return undefined;
  },
  set: (urlOrId: string, fileName: string) => {
    if (!urlOrId || !fileName) return;
    _driveFileNameInternalMap.set(urlOrId, fileName);
    const idMatch = urlOrId.match(/\/files\/([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      _driveFileNameInternalMap.set(idMatch[1], fileName);
      _driveFileNameInternalMap.set(
        `https://www.googleapis.com/drive/v3/files/${idMatch[1]}?alt=media`,
        fileName
      );
    } else if (/^[a-zA-Z0-9_-]{20,}$/.test(urlOrId)) {
      _driveFileNameInternalMap.set(
        `https://www.googleapis.com/drive/v3/files/${urlOrId}?alt=media`,
        fileName
      );
    }
  },
  has: (url: string): boolean => {
    return !!driveFileNameCache.get(url);
  },
  clear: () => {
    _driveFileNameInternalMap.clear();
  }
};

/**
 * Atomically registers or updates a single media file entry across
 * `availableFilesCache` and `driveFileNameCache`.
 */
export function upsertMediaCatalogFile(
  file?: Partial<MediaAssetFile> & { name?: string; fileName?: string; streamUrl?: string; durationFormatted?: string } | null
): void {
  if (!file) return;
  const resolvedName = (file.name || file.fileName || '').trim();
  if (!resolvedName) return;
  const resolvedPath = file.path || file.streamUrl || file.webContentLink || resolvedName;
  const existing = availableFilesCache.get(resolvedName);
  const resolvedDuration =
    file.duration !== undefined && file.duration !== ''
      ? String(file.duration)
      : file.durationFormatted !== undefined && file.durationFormatted !== ''
        ? String(file.durationFormatted)
        : existing?.duration || '';

  availableFilesCache.set(resolvedName, {
    path: resolvedPath,
    size: file.size ?? existing?.size ?? '0.1 MB',
    duration: resolvedDuration,
    mtimeMs: file.mtimeMs ?? existing?.mtimeMs,
    modifiedTime: file.modifiedTime ?? existing?.modifiedTime,
  });

  if (file.path) {
    driveFileNameCache.set(file.path, resolvedName);
  }
  if (file.streamUrl) {
    driveFileNameCache.set(file.streamUrl, resolvedName);
  }
  if (file.id) {
    driveFileNameCache.set(file.id, resolvedName);
  }
  if (file.webContentLink) {
    driveFileNameCache.set(file.webContentLink, resolvedName);
  }
}

/**
 * Batch-synchronizes a collection of media asset files into the catalog caches.
 */
export function syncMediaCatalogFiles(
  files?: Array<Partial<MediaAssetFile> & { name?: string; fileName?: string; streamUrl?: string; durationFormatted?: string }> | null,
  options?: { clearExisting?: boolean }
): void {
  if (options?.clearExisting) {
    availableFilesCache.clear();
  }
  if (!Array.isArray(files) || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    upsertMediaCatalogFile(files[i]);
  }
}

export const mediaCatalogStore = {
  upsertFile: upsertMediaCatalogFile,
  syncFiles: syncMediaCatalogFiles,
  getFile: (name: string) => availableFilesCache.get(name),
  hasFile: (name: string) => availableFilesCache.has(name),
  resolveDriveFileName: (urlOrId: string) => driveFileNameCache.get(urlOrId),
  clear: () => {
    availableFilesCache.clear();
    driveFileNameCache.clear();
  }
};

export const clearAudioCache = () => {
  for (const blobUrl of mp3BlobCache.values()) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.warn('Failed to revoke object URL:', e);
    }
  }
  mp3BlobCache.clear();
  rawBlobCache.clear();
  mp3MetadataCache.clear();
  mp3DurationCache.clear();
  mp3WaveformCache.clear();
  pendingAudioFetches.clear();
};

