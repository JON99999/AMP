import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  currentSettings,
  getAmpMediaAnnouncementsDir,
  getAmpMediaEvergreensDir,
  getAmpMediaShowsDir,
  getCalendarFilePath,
  findAnnouncementSourceFile,
  statFileWithCloudCatchUp,
  ALLOWED_STREAM_MEDIA_EXTENSIONS,
  isPathWithinAnyDir,
  isPathWithinConfiguredStationDirs,
  isPathWithinConfiguredMediaDirs,
  AnnouncementFolderBucket
} from '../state';
import {
  isServerDriveStorageRequest,
  serverDriveFetch,
  serverDriveListFolderFiles,
  serverDriveFindFileCaseInsensitive,
  serverDriveCreateFileInFolder,
  serverDriveUploadFileContent,
  resolveServerDriveAnnouncementsFolderId,
  listServerDriveAnnouncementMedia,
  serverDriveFindAnnouncementFileInBucket,
  listServerDriveAnnouncementFileManager,
  moveServerDriveAnnouncementFiles,
  streamServerDriveFile
} from '../storage/driveProvider';

// Timeout wrapper to prevent unhydrated/syncing cloud files (e.g. Google Drive Desktop) from freezing Node's thread
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[I/O Timeout] Operation timed out after ${timeoutMs}ms (likely locked or syncing cloud file/folder).`);
      resolve(fallbackValue);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

// Helper for pure JS estimation of MP3 file duration in seconds (non-blocking with timeout)
export async function getMp3DurationSecondsAsync(filePath: string): Promise<number> {
  return withTimeout(
    (async () => {
      let handle: fs.promises.FileHandle | null = null;
      try {
        const stats = await fs.promises.stat(filePath);
        handle = await fs.promises.open(filePath, 'r');
        const buffer = Buffer.alloc(4096);
        const { bytesRead } = await handle.read(buffer, 0, 4096, 0);

        let offset = 0;
        if (bytesRead >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
          const id3Size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
          offset = 10 + id3Size;
        }

        const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
        const audioBuf = Buffer.alloc(2048);
        const readAudioRes = await handle.read(audioBuf, 0, 2048, Math.min(offset, Math.max(0, stats.size - 2048)));
        const readAudio = readAudioRes.bytesRead;
        await handle.close();
        handle = null;

        for (let i = 0; i < readAudio - 4; i++) {
          if (audioBuf[i] === 0xff && (audioBuf[i + 1] & 0xe0) === 0xe0) {
            const header = audioBuf.readUInt32BE(i);
            const bitrateIdx = (header >> 12) & 0x0f;
            const kbps = bitrates[bitrateIdx] || 128;
            if (kbps > 0) {
              const audioSizeBytes = Math.max(0, stats.size - offset);
              const durationSec = Math.round((audioSizeBytes * 8) / (kbps * 1000));
              if (durationSec > 0 && durationSec < 7200) {
                return durationSec;
              }
            }
            break;
          }
        }
      } catch (e) {
        if (handle) {
          try { await handle.close(); } catch (_) {}
        }
      }
      return 180;
    })(),
    1500,
    180
  );
}

export function getMp3DurationSeconds(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    let offset = 0;
    if (bytesRead >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      const id3Size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
      offset = 10 + id3Size;
    }

    const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
    const audioBuf = Buffer.alloc(2048);
    const fd2 = fs.openSync(filePath, 'r');
    const readAudio = fs.readSync(fd2, audioBuf, 0, 2048, Math.min(offset, Math.max(0, stats.size - 2048)));
    fs.closeSync(fd2);

    for (let i = 0; i < readAudio - 4; i++) {
      if (audioBuf[i] === 0xff && (audioBuf[i + 1] & 0xe0) === 0xe0) {
        const header = audioBuf.readUInt32BE(i);
        const bitrateIdx = (header >> 12) & 0x0f;
        const kbps = bitrates[bitrateIdx] || 128;
        if (kbps > 0) {
          const audioSizeBytes = Math.max(0, stats.size - offset);
          const durationSec = Math.round((audioSizeBytes * 8) / (kbps * 1000));
          if (durationSec > 0 && durationSec < 7200) {
            return durationSec;
          }
        }
        break;
      }
    }
  } catch (e) {
    // Ignore and fallback
  }
  return 180;
}

function parseID3Buffer(bytes: Uint8Array): { title?: string; artist?: string; albumArtist?: string; album?: string } | null {
  if (!bytes || bytes.length < 10) return null;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const majorVersion = bytes[3];
    if (majorVersion === 2 || majorVersion === 3 || majorVersion === 4) {
      const tagSize = ((bytes[6] & 0x7f) << 21) |
                      ((bytes[7] & 0x7f) << 14) |
                      ((bytes[8] & 0x7f) << 7) |
                      (bytes[9] & 0x7f);
      const limit = Math.min(bytes.length, tagSize + 10);
      let offset = 10;
      const parsed: { title?: string; artist?: string; albumArtist?: string; album?: string } = {};

      const textDecode = (data: Uint8Array): string => {
        try {
          const encoding = data[0];
          const content = data.subarray(1);
          let str = '';
          if (encoding === 0 || encoding === 3) {
            str = Buffer.from(content).toString(encoding === 3 ? 'utf-8' : 'latin1');
          } else if (encoding === 1 || encoding === 2) {
            str = Buffer.from(content).toString('utf16le');
          }
          return str.replace(/^[\s\uFEFF\0]+|[\s\uFEFF\0]+$/g, '').replace(/\0.*$/g, '').trim();
        } catch (e) {
          return '';
        }
      };

      if (majorVersion === 2) {
        while (offset + 6 < limit) {
          const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
          const frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
          offset += 6;
          if (frameSize <= 0 || offset + frameSize > limit) break;
          const frameData = bytes.subarray(offset, offset + frameSize);
          if (frameId === "TT2" || frameId === "TP1" || frameId === "TP2" || frameId === "TAL") {
            const text = textDecode(frameData);
            if (text) {
              if (frameId === "TT2") parsed.title = text;
              if (frameId === "TP1") parsed.artist = text;
              if (frameId === "TP2") parsed.albumArtist = text;
              if (frameId === "TAL") parsed.album = text;
            }
          }
          offset += frameSize;
        }
      } else {
        while (offset + 10 < limit) {
          const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
          let frameSize = 0;
          if (majorVersion === 4) {
            frameSize = ((bytes[offset + 4] & 0x7f) << 21) |
                        ((bytes[offset + 5] & 0x7f) << 14) |
                        ((bytes[offset + 6] & 0x7f) << 7) |
                        (bytes[offset + 7] & 0x7f);
          } else {
            frameSize = (bytes[offset + 4] << 24) |
                        (bytes[offset + 5] << 16) |
                        (bytes[offset + 6] << 8) |
                        bytes[offset + 7];
          }
          offset += 10;
          if (frameSize <= 0 || offset + frameSize > limit) break;
          const frameData = bytes.subarray(offset, offset + frameSize);
          if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TPE2" || frameId === "TALB") {
            const text = textDecode(frameData);
            if (text) {
              if (frameId === "TIT2") parsed.title = text;
              if (frameId === "TPE1") parsed.artist = text;
              if (frameId === "TPE2") parsed.albumArtist = text;
              if (frameId === "TALB") parsed.album = text;
            }
          }
          offset += frameSize;
        }
      }
      if (parsed.title || parsed.artist || parsed.albumArtist || parsed.album) {
        return parsed;
      }
    }
  }
  return null;
}

function parseID3v1Buffer(bytes: Uint8Array): { title?: string; artist?: string; albumArtist?: string; album?: string } | null {
  if (!bytes || bytes.length < 128) return null;
  const tagOffset = bytes.length - 128;
  if (bytes[tagOffset] === 0x54 && bytes[tagOffset + 1] === 0x41 && bytes[tagOffset + 2] === 0x47) { // "TAG"
    const cleanStr = (buf: Uint8Array) => {
      const decoded = Buffer.from(buf).toString('latin1');
      const nullIdx = decoded.indexOf('\0');
      const clean = nullIdx !== -1 ? decoded.substring(0, nullIdx) : decoded;
      return clean.trim();
    };
    const title = cleanStr(bytes.subarray(tagOffset + 3, tagOffset + 33));
    const artist = cleanStr(bytes.subarray(tagOffset + 33, tagOffset + 63));
    const album = cleanStr(bytes.subarray(tagOffset + 63, tagOffset + 93));
    if (title || artist || album) {
      return {
        title: title || undefined,
        artist: artist || undefined,
        albumArtist: artist || undefined,
        album: album || undefined
      };
    }
  }
  return null;
}

// Helper for reading audio metadata using standard music-metadata with fallback
export async function getMp3ServerMetadata(filePath: string): Promise<{ title?: string; artist?: string; albumArtist?: string; album?: string; durationSeconds?: number } | null> {
  const lower = filePath.toLowerCase();
  const isApprovedAudio = lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.flac') || lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.aac');
  if (!isApprovedAudio) return null;

  return withTimeout(
    (async () => {
      try {
        if (!fs.existsSync(filePath)) return null;

        // 1. Standard music-metadata extraction
        try {
          const mm = await import('music-metadata');
          const parsed = await mm.parseFile(filePath, { skipCovers: true, duration: true });
          if (parsed && parsed.common) {
            const title = parsed.common.title?.trim();
            const artist = parsed.common.artist?.trim();
            const albumArtist = (parsed.common.albumartist || parsed.common.artist)?.trim();
            const album = parsed.common.album?.trim();
            const durationSeconds = parsed.format?.duration ? Math.round(parsed.format.duration) : undefined;

            if (title || artist || album || durationSeconds) {
              return {
                title: title || undefined,
                artist: artist || undefined,
                albumArtist: albumArtist || artist || undefined,
                album: album || undefined,
                durationSeconds
              };
            }
          }
        } catch (_) {}

        // 2. Binary buffer fallback scanner
        let handle: fs.promises.FileHandle | null = null;
        try {
          const stats = await fs.promises.stat(filePath);
          handle = await fs.promises.open(filePath, 'r');

          const buffer = Buffer.alloc(65536);
          const { bytesRead } = await handle.read(buffer, 0, 65536, 0);
          let meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
          if (bytesRead > 0) {
            const rawBytes = new Uint8Array(buffer.subarray(0, bytesRead));
            meta = parseID3Buffer(rawBytes);

            if (!meta && lower.endsWith('.wav') && bytesRead >= 12) {
              if (rawBytes[0] === 0x52 && rawBytes[1] === 0x49 && rawBytes[2] === 0x46 && rawBytes[3] === 0x46) {
                let off = 12;
                while (off + 8 <= bytesRead) {
                  const chunkId = String.fromCharCode(rawBytes[off], rawBytes[off + 1], rawBytes[off + 2], rawBytes[off + 3]);
                  const chunkSize = rawBytes[off + 4] | (rawBytes[off + 5] << 8) | (rawBytes[off + 6] << 16) | (rawBytes[off + 7] << 24);
                  off += 8;
                  if (chunkSize <= 0 || off + chunkSize > bytesRead) break;
                  if (chunkId === 'LIST' && chunkSize >= 4) {
                    const listType = String.fromCharCode(rawBytes[off], rawBytes[off + 1], rawBytes[off + 2], rawBytes[off + 3]);
                    if (listType === 'INFO') {
                      let subOff = off + 4;
                      const subLimit = Math.min(bytesRead, off + chunkSize);
                      const wavMeta: { title?: string; artist?: string; albumArtist?: string; album?: string } = {};
                      while (subOff + 8 <= subLimit) {
                        const subId = String.fromCharCode(rawBytes[subOff], rawBytes[subOff + 1], rawBytes[subOff + 2], rawBytes[subOff + 3]);
                        const subSize = rawBytes[subOff + 4] | (rawBytes[subOff + 5] << 8) | (rawBytes[subOff + 6] << 16) | (rawBytes[subOff + 7] << 24);
                        subOff += 8;
                        if (subSize <= 0 || subOff + subSize > subLimit) break;
                        const text = Buffer.from(rawBytes.subarray(subOff, subOff + subSize)).toString('utf-8').replace(/\0.*$/, '').trim();
                        if (subId === 'INAM') wavMeta.title = text;
                        if (subId === 'IART') wavMeta.artist = text;
                        if (subId === 'IPRD') wavMeta.album = text;
                        subOff += subSize + (subSize % 2);
                      }
                      if (wavMeta.title || wavMeta.artist || wavMeta.album) {
                        if (!wavMeta.albumArtist && wavMeta.artist) wavMeta.albumArtist = wavMeta.artist;
                        meta = wavMeta;
                        break;
                      }
                    }
                  }
                  off += chunkSize + (chunkSize % 2);
                }
              }
            }

            if (!meta && (lower.endsWith('.flac') || lower.endsWith('.ogg'))) {
              for (let i = 0; i < bytesRead - 8; i++) {
                if (
                  (rawBytes[i] === 0x66 && rawBytes[i + 1] === 0x4c && rawBytes[i + 2] === 0x61 && rawBytes[i + 3] === 0x43) ||
                  (rawBytes[i] === 0x03 && rawBytes[i + 1] === 0x76 && rawBytes[i + 2] === 0x6f && rawBytes[i + 3] === 0x72) ||
                  (rawBytes[i] === 0x4f && rawBytes[i + 1] === 0x70 && rawBytes[i + 2] === 0x75 && rawBytes[i + 3] === 0x73)
                ) {
                  const slice = Buffer.from(rawBytes.subarray(i, bytesRead)).toString('utf-8', 0, Math.min(4096, bytesRead - i));
                  const flacMeta: { title?: string; artist?: string; albumArtist?: string; album?: string } = {};
                  const titleMatch = slice.match(/TITLE=([^\x00-\x1f\x80-\xff\r\n]+)/i);
                  const artistMatch = slice.match(/ARTIST=([^\x00-\x1f\x80-\xff\r\n]+)/i);
                  const albumMatch = slice.match(/ALBUM=([^\x00-\x1f\x80-\xff\r\n]+)/i);
                  const aaMatch = slice.match(/ALBUMARTIST=([^\x00-\x1f\x80-\xff\r\n]+)/i);
                  if (titleMatch) flacMeta.title = titleMatch[1].trim();
                  if (artistMatch) flacMeta.artist = artistMatch[1].trim();
                  if (albumMatch) flacMeta.album = albumMatch[1].trim();
                  if (aaMatch) flacMeta.albumArtist = aaMatch[1].trim();
                  if (flacMeta.title || flacMeta.artist || flacMeta.album) {
                    if (!flacMeta.albumArtist && flacMeta.artist) flacMeta.albumArtist = flacMeta.artist;
                    meta = flacMeta;
                    break;
                  }
                }
              }
            }
          }

          if (!meta && stats.size >= 128) {
            const tailBuf = Buffer.alloc(128);
            await handle.read(tailBuf, 0, 128, stats.size - 128);
            meta = parseID3v1Buffer(new Uint8Array(tailBuf));
          }

          await handle.close();
          handle = null;

          const fallbackDurSec = await getMp3DurationSecondsAsync(filePath);
          if (meta || fallbackDurSec > 0) {
            return {
              title: meta?.title,
              artist: meta?.artist,
              albumArtist: meta?.albumArtist || meta?.artist,
              album: meta?.album,
              durationSeconds: fallbackDurSec > 0 ? fallbackDurSec : undefined
            };
          }

          return null;
        } finally {
          if (handle) {
            try { await handle.close(); } catch (_) {}
          }
        }
      } catch (e) {
        return null;
      }
    })(),
    2500,
    null
  );
}

// Helper for flexible playlist show folder lookup
export function findShowPlaylistFolder(playlistsPath: string, showNameShort?: string, showName?: string): string | null {
  if (!playlistsPath || !fs.existsSync(playlistsPath)) return null;

  const candidates = [showNameShort, showName].filter(Boolean) as string[];
  if (candidates.length === 0) return null;

  for (const name of candidates) {
    const exactPath = path.join(playlistsPath, name);
    if (fs.existsSync(exactPath) && fs.statSync(exactPath).isDirectory()) {
      return exactPath;
    }
  }

  try {
    const dirItems = fs.readdirSync(playlistsPath);
    for (const candidate of candidates) {
      const normCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const item of dirItems) {
        const itemPath = path.join(playlistsPath, item);
        if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
          const normItem = item.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normItem === normCandidate || item.toLowerCase() === candidate.toLowerCase()) {
            return itemPath;
          }
        }
      }
    }
  } catch (e) {}

  return null;
}

// Helper for audio and playlist file scanning (scoped, non-recursive by default)
export async function getAllAudioAndPlaylistFilesAsync(
  dir: string,
  options?: {
    targetSubfolder?: string;
    externalAbsolutePath?: string;
    recursive?: boolean;
  }
): Promise<{ m3uFiles: string[]; audioFiles: Array<{ relPath: string; fullPath: string; name: string }> }> {
  return withTimeout(
    (async () => {
      const m3uFiles: string[] = [];
      const audioFiles: Array<{ relPath: string; fullPath: string; name: string }> = [];

      let scanDir = dir;
      if (options?.externalAbsolutePath && fs.existsSync(options.externalAbsolutePath)) {
        scanDir = options.externalAbsolutePath;
      } else if (options?.targetSubfolder && options.targetSubfolder !== '.') {
        const subPath = path.join(dir, options.targetSubfolder);
        if (fs.existsSync(subPath)) {
          scanDir = subPath;
        }
      }

      if (!scanDir || !fs.existsSync(scanDir)) {
        return { m3uFiles, audioFiles };
      }

      const isRecursive = options?.recursive === true;
      const audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

      async function scan(currentDir: string, relPrefix: string = '', depth: number = 0) {
        if (isRecursive && depth > 4) return;
        if (!fs.existsSync(currentDir)) return;
        try {
          const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              if (isRecursive) {
                await scan(fullPath, relPath, depth + 1);
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              if (ext === '.m3u' || ext === '.m3u8') {
                m3uFiles.push(fullPath);
              } else if (audioExtensions.includes(ext)) {
                audioFiles.push({ relPath, fullPath, name: entry.name });
              }
            }
          }
        } catch (e) {}
      }

      await scan(scanDir);
      return { m3uFiles, audioFiles };
    })(),
    3000,
    { m3uFiles: [], audioFiles: [] }
  );
}

export function getAllAudioAndPlaylistFiles(
  dir: string,
  options?: {
    targetSubfolder?: string;
    externalAbsolutePath?: string;
    recursive?: boolean;
  }
): { m3uFiles: string[]; audioFiles: Array<{ relPath: string; fullPath: string; name: string }> } {
  const m3uFiles: string[] = [];
  const audioFiles: Array<{ relPath: string; fullPath: string; name: string }> = [];

  let scanDir = dir;
  if (options?.externalAbsolutePath && fs.existsSync(options.externalAbsolutePath)) {
    scanDir = options.externalAbsolutePath;
  } else if (options?.targetSubfolder && options.targetSubfolder !== '.') {
    const subPath = path.join(dir, options.targetSubfolder);
    if (fs.existsSync(subPath)) {
      scanDir = subPath;
    }
  }

  if (!scanDir || !fs.existsSync(scanDir)) {
    return { m3uFiles, audioFiles };
  }

  const isRecursive = options?.recursive === true;
  const audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

  function scan(currentDir: string, relPrefix: string = '') {
    if (!fs.existsSync(currentDir)) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (isRecursive) {
            scan(fullPath, relPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.m3u' || ext === '.m3u8') {
            m3uFiles.push(fullPath);
          } else if (audioExtensions.includes(ext)) {
            audioFiles.push({ relPath, fullPath, name: entry.name });
          }
        }
      }
    } catch (e) {}
  }

  scan(scanDir);
  return { m3uFiles, audioFiles };
}

// Helper for parsing M3U files with robust relative path resolution (non-blocking async)
export async function parseM3uFileAsync(m3uPath: string, folderPath: string) {
  return withTimeout(
    (async () => {
      const content = await fs.promises.readFile(m3uPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const result: Array<{ fileName: string; title: string; durationSeconds: number; fullPath?: string; exists?: boolean }> = [];

      let pendingExtInfDuration: number | null = null;
      let pendingExtInfTitle: string | null = null;

      const m3uDir = path.dirname(m3uPath);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('#EXTINF:')) {
          const rest = trimmed.substring(8);
          const commaIdx = rest.indexOf(',');
          if (commaIdx !== -1) {
            const durStr = rest.substring(0, commaIdx).trim();
            const dur = parseInt(durStr, 10);
            if (!isNaN(dur) && dur > 0) {
              pendingExtInfDuration = dur;
            }
            pendingExtInfTitle = rest.substring(commaIdx + 1).trim();
          }
        } else if (!trimmed.startsWith('#')) {
          const rawFileName = trimmed.replace(/\\/g, '/');
          const fileName = path.basename(rawFileName);

          let fullPath = path.isAbsolute(rawFileName) ? rawFileName : path.join(m3uDir, rawFileName);
          let exists = fs.existsSync(fullPath);
          if (!exists) {
            const directInFolder = path.join(folderPath, fileName);
            if (fs.existsSync(directInFolder)) {
              fullPath = directInFolder;
              exists = true;
            }
          }

          let durationSeconds = pendingExtInfDuration;
          if (!durationSeconds || durationSeconds <= 0) {
            if (exists) {
              durationSeconds = await getMp3DurationSecondsAsync(fullPath);
            } else {
              durationSeconds = 0;
            }
          }

          const title = pendingExtInfTitle || fileName.replace(/\.[^/.]+$/, '');
          result.push({
            fileName: exists ? path.basename(fullPath) : fileName,
            title,
            durationSeconds,
            fullPath: exists ? fullPath : undefined,
            exists
          });

          pendingExtInfDuration = null;
          pendingExtInfTitle = null;
        }
      }
      return result;
    })(),
    2500,
    []
  );
}

// Helper for parsing M3U files with robust relative path resolution
export function parseM3uFile(m3uPath: string, folderPath: string) {
  const content = fs.readFileSync(m3uPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const result: Array<{ fileName: string; title: string; durationSeconds: number; fullPath?: string; exists?: boolean }> = [];

  let pendingExtInfDuration: number | null = null;
  let pendingExtInfTitle: string | null = null;

  const m3uDir = path.dirname(m3uPath);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#EXTINF:')) {
      const rest = trimmed.substring(8);
      const commaIdx = rest.indexOf(',');
      if (commaIdx !== -1) {
        const durStr = rest.substring(0, commaIdx).trim();
        const dur = parseInt(durStr, 10);
        if (!isNaN(dur) && dur > 0) {
          pendingExtInfDuration = dur;
        }
        pendingExtInfTitle = rest.substring(commaIdx + 1).trim();
      }
    } else if (!trimmed.startsWith('#')) {
      const rawFileName = trimmed.replace(/\\/g, '/');
      const fileName = path.basename(rawFileName);

      let fullPath = path.isAbsolute(rawFileName) ? rawFileName : path.join(m3uDir, rawFileName);
      let exists = fs.existsSync(fullPath);
      if (!exists) {
        const directInFolder = path.join(folderPath, fileName);
        if (fs.existsSync(directInFolder)) {
          fullPath = directInFolder;
          exists = true;
        }
      }

      let durationSeconds = pendingExtInfDuration;
      if (!durationSeconds || durationSeconds <= 0) {
        if (exists) {
          durationSeconds = getMp3DurationSeconds(fullPath);
        } else {
          durationSeconds = 0;
        }
      }

      const title = pendingExtInfTitle || fileName.replace(/\.[^/.]+$/, '');
      result.push({
        fileName: exists ? path.basename(fullPath) : fileName,
        title,
        durationSeconds,
        fullPath: exists ? fullPath : undefined,
        exists
      });

      pendingExtInfDuration = null;
      pendingExtInfTitle = null;
    }
  }

  return result;
}

function isWindowsStyleAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

function hasParentTraversal(p: string): boolean {
  return p.replace(/\\/g, '/').split('/').some((seg) => seg === '..');
}

function resolveFileStrictlyInsideMediaBucket(
  bucketRoot: string,
  fileName: string,
  showNameShort?: string,
  showName?: string
): string | null {
  if (!bucketRoot || !fileName || !fs.existsSync(bucketRoot)) return null;

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

  // Reject any absolute path pointing outside the configured media bucket root
  if (path.isAbsolute(cleanName) || isWindowsStyleAbsolutePath(cleanName)) {
    if (!path.isAbsolute(cleanName)) return null;
    if (!isPathWithinAnyDir(cleanName, [bucketRoot])) return null;
    if (fs.existsSync(cleanName) && fs.statSync(cleanName).isFile()) {
      return cleanName;
    }
    return null;
  }

  if (hasParentTraversal(cleanName)) return null;

  const normalizedRel = cleanName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedRel) return null;

  // 1. Check relative path inside bucket root (e.g. "ShowSubfolder/track.mp3")
  const directRelCandidate = path.join(bucketRoot, normalizedRel);
  if (
    isPathWithinAnyDir(directRelCandidate, [bucketRoot]) &&
    fs.existsSync(directRelCandidate) &&
    fs.statSync(directRelCandidate).isFile()
  ) {
    return directRelCandidate;
  }

  const baseName = path.basename(normalizedRel);
  if (!baseName || baseName === '.' || baseName === '..') return null;

  // 2. Check specific show subfolder inside bucket root
  const showFolder = findShowPlaylistFolder(bucketRoot, showNameShort, showName);
  if (showFolder && isPathWithinAnyDir(showFolder, [bucketRoot])) {
    const candidate = path.join(showFolder, baseName);
    if (
      isPathWithinAnyDir(candidate, [bucketRoot]) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }

  // 3. Check root and immediate show subfolders strictly inside bucketRoot
  const candidateRoot = path.join(bucketRoot, baseName);
  if (
    isPathWithinAnyDir(candidateRoot, [bucketRoot]) &&
    fs.existsSync(candidateRoot) &&
    fs.statSync(candidateRoot).isFile()
  ) {
    return candidateRoot;
  }

  try {
    const entries = fs.readdirSync(bucketRoot, { withFileTypes: true });
    const baseLower = baseName.toLowerCase();
    for (const entry of entries) {
      const fullPath = path.join(bucketRoot, entry.name);
      if (!isPathWithinAnyDir(fullPath, [bucketRoot])) continue;
      if (entry.isDirectory()) {
        const candidate = path.join(fullPath, baseName);
        if (
          isPathWithinAnyDir(candidate, [bucketRoot]) &&
          fs.existsSync(candidate) &&
          fs.statSync(candidate).isFile()
        ) {
          return candidate;
        }
      } else if (entry.isFile() && entry.name.toLowerCase() === baseLower) {
        return fullPath;
      }
    }
  } catch (_) {}

  return null;
}

// Helper to locate Evergreen track source file strictly inside Media Evergreens directory
export function findEvergreenSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
  if (!folderPath || !fileName) return null;

  const evergreensRoot = fs.existsSync(path.join(folderPath, 'media_evergreens'))
    ? path.join(folderPath, 'media_evergreens')
    : (fs.existsSync(path.join(folderPath, 'MediaEvergreens')) ? path.join(folderPath, 'MediaEvergreens') : folderPath);

  return resolveFileStrictlyInsideMediaBucket(evergreensRoot, fileName, showNameShort, showName);
}

// Helper to locate Show track / playlist source file strictly inside Media Shows directory
export function findShowSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
  if (!folderPath || !fileName) return null;

  const showsRoot = fs.existsSync(path.join(folderPath, 'media_shows'))
    ? path.join(folderPath, 'media_shows')
    : (fs.existsSync(path.join(folderPath, 'MediaShows')) ? path.join(folderPath, 'MediaShows') : folderPath);

  return resolveFileStrictlyInsideMediaBucket(showsRoot, fileName, showNameShort, showName);
}

function isAllowedStreamMediaFile(filePath: string | null): filePath is string {
  if (!filePath) return false;
  if (!ALLOWED_STREAM_MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function parseAnnouncementBucketParam(raw: unknown): AnnouncementFolderBucket {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'archived' || val === 'deleted') return val;
  return 'active';
}

// Universal Media File Path Resolution Engine
export function resolveMediaFilePath(query: any): string | null {
  const file = String(query.path || query.file || '').trim();
  const showNameShort = String(query.showNameShort || '').trim();
  const showName = String(query.showName || '').trim();
  const rawFolderType = String(query.folderType || '').trim();
  const targetSubfolder = String(query.targetSubfolder || '').trim();
  const externalAbsolutePath = String(query.externalAbsolutePath || '').trim();
  const announcementBucket = parseAnnouncementBucketParam(query.bucket);

  if (!file && !showNameShort && !showName && !externalAbsolutePath) return null;

  // 1. Direct absolute path check (restricted strictly to configured media dirs or active external media dirs + media extensions)
  if (
    file &&
    path.isAbsolute(file) &&
    isPathWithinConfiguredMediaDirs(file, true) &&
    isAllowedStreamMediaFile(file)
  ) {
    return file;
  }

  // 1b. External directory absolute path check (restricted to configured media or active external media directories)
  if (
    externalAbsolutePath &&
    isPathWithinConfiguredStationDirs(externalAbsolutePath, true) &&
    fs.existsSync(externalAbsolutePath)
  ) {
    if (fs.statSync(externalAbsolutePath).isFile()) {
      return isAllowedStreamMediaFile(externalAbsolutePath) ? externalAbsolutePath : null;
    }
    if (file && !hasParentTraversal(file)) {
      const cleanFileName = path.basename(file);
      const directTarget = path.join(externalAbsolutePath, cleanFileName);
      if (
        isPathWithinAnyDir(directTarget, [externalAbsolutePath]) &&
        isAllowedStreamMediaFile(directTarget)
      ) {
        return directTarget;
      }
    }
    return null;
  }

  // 2. Specific show playlist or evergreen lookup (strictly isolated to its own bucket)
  if (showNameShort || showName) {
    const isEvergreen = rawFolderType.toLowerCase().startsWith('evergreen');
    const targetDir = isEvergreen
      ? getAmpMediaEvergreensDir(currentSettings)
      : getAmpMediaShowsDir(currentSettings);

    if (targetDir && fs.existsSync(targetDir)) {
      const showFolderPath = findShowPlaylistFolder(targetDir, showNameShort, showName);
      if (showFolderPath && isPathWithinAnyDir(showFolderPath, [targetDir]) && fs.existsSync(showFolderPath)) {
        if (targetSubfolder && targetSubfolder !== '.' && !hasParentTraversal(targetSubfolder)) {
          const subDir = path.join(showFolderPath, targetSubfolder);
          if (
            isPathWithinAnyDir(subDir, [showFolderPath]) &&
            fs.existsSync(subDir) &&
            fs.statSync(subDir).isDirectory() &&
            file
          ) {
            const cleanFileName = path.basename(file);
            const subTarget = path.join(subDir, cleanFileName);
            if (isPathWithinAnyDir(subTarget, [subDir]) && isAllowedStreamMediaFile(subTarget)) {
              return subTarget;
            }
          }
        }

        if (file) {
          const cleanFileName = path.basename(file);
          const directTarget = path.join(showFolderPath, cleanFileName);
          if (isPathWithinAnyDir(directTarget, [showFolderPath]) && isAllowedStreamMediaFile(directTarget)) {
            return directTarget;
          }
          const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath, { targetSubfolder, recursive: false });
          const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
          if (
            matched &&
            isPathWithinAnyDir(matched.fullPath, [targetDir]) &&
            isAllowedStreamMediaFile(matched.fullPath)
          ) {
            return matched.fullPath;
          }
        }
      }
      if (file) {
        const resolved = isEvergreen
          ? findEvergreenSourceFile(targetDir, file, showNameShort, showName)
          : findShowSourceFile(targetDir, file, showNameShort, showName);
        if (resolved && isPathWithinAnyDir(resolved, [targetDir]) && isAllowedStreamMediaFile(resolved)) {
          return resolved;
        }
      }
    }
    return null;
  }

  // 3. Explicit bucket folderType without showName (Evergreens or Shows/Playlists)
  if (rawFolderType) {
    const ftLower = rawFolderType.toLowerCase();
    if (ftLower.startsWith('evergreen')) {
      const mediaEvergreens = getAmpMediaEvergreensDir(currentSettings);
      if (mediaEvergreens && fs.existsSync(mediaEvergreens) && file) {
        const resolved = findEvergreenSourceFile(mediaEvergreens, file);
        if (resolved && isPathWithinAnyDir(resolved, [mediaEvergreens]) && isAllowedStreamMediaFile(resolved)) {
          return resolved;
        }
      }
      return null;
    }
    if (ftLower.startsWith('playlist') || ftLower.startsWith('show')) {
      const mediaShows = getAmpMediaShowsDir(currentSettings);
      if (mediaShows && fs.existsSync(mediaShows) && file) {
        const resolved = findShowSourceFile(mediaShows, file);
        if (resolved && isPathWithinAnyDir(resolved, [mediaShows]) && isAllowedStreamMediaFile(resolved)) {
          return resolved;
        }
      }
      return null;
    }
  }

  // 4. Announcement lookup (strictly inside media_announcements active root unless bucket=archived|deleted is explicitly requested)
  const mediaAnnounce = getAmpMediaAnnouncementsDir(currentSettings);
  if (mediaAnnounce && fs.existsSync(mediaAnnounce) && file) {
    const resolved = findAnnouncementSourceFile(mediaAnnounce, file, { bucket: announcementBucket });
    if (resolved && isPathWithinAnyDir(resolved, [mediaAnnounce]) && isAllowedStreamMediaFile(resolved)) {
      return resolved;
    }
  }

  return null;
}

export function registerMediaRoutes(app: express.Express): void {
  // API - List announcement media files (Unified Local + Google Drive Provider)
  const handleListMediaFiles = async (req: express.Request, res: express.Response) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const list = await listServerDriveAnnouncementMedia(req);
        return res.json(list);
      }

      const targetDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!targetDir || !fs.existsSync(targetDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(targetDir);
      const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'];
      const filteredFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return allowedExtensions.includes(ext);
      });
      const mp3List = await Promise.all(
        filteredFiles.map(async (f) => {
          const fullPath = path.join(targetDir, f);
          const ext = path.extname(f).toLowerCase();
          const isScript = ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'].includes(ext);
          const { stats, cloudSyncPending } = await statFileWithCloudCatchUp(fullPath);
          if (!stats || cloudSyncPending) {
            return {
              name: f,
              duration: isScript ? '—' : '',
              path: `/api/media/stream?path=${encodeURIComponent(f)}`,
              cloudSyncPending: true
            };
          }
          let durationStr = '—';
          if (!isScript) {
            const durSec = await getMp3DurationSecondsAsync(fullPath);
            const mins = Math.floor(durSec / 60);
            const secs = Math.floor(durSec % 60);
            durationStr = `${mins}:${String(secs).padStart(2, '0')}`;
          }
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: durationStr,
            path: `/api/media/stream?path=${encodeURIComponent(f)}`,
            mtimeMs: stats.mtimeMs,
            modifiedTime: stats.mtime.toISOString(),
            cloudSyncPending: false
          };
        })
      );
      res.json(mp3List);
    } catch (e: any) {
      console.error('Failed to read announcements directory:', e);
      res.status(500).json([]);
    }
  };

  app.get('/api/local-mp3s', handleListMediaFiles);
  app.get('/api/media/list', handleListMediaFiles);

  // API - List all announcement files across active, archived, and deleted_in_AMP_OK_to_purge for File Manager (#26)
  app.get('/api/media/file-manager', async (req: express.Request, res: express.Response) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      if (isServerDriveStorageRequest(req)) {
        const driveResult = await listServerDriveAnnouncementFileManager(req);
        return res.json(driveResult);
      }

      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.json({
          files: [],
          folderPaths: { active: '', archived: '', deleted: '' }
        });
      }

      const archivedDir = path.join(announcementsDir, 'archived');
      const deletedDir = path.join(announcementsDir, 'deleted_in_AMP_OK_to_purge');
      for (const dirPath of [announcementsDir, archivedDir, deletedDir]) {
        try {
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
        } catch (mkdirErr) {
          console.warn(`[FileManager] Could not ensure directory ${dirPath}:`, mkdirErr);
        }
      }

      const allowedExtensions = [
        '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac',
        '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'
      ];

      const scanBucket = async (
        dirPath: string,
        folderBucket: 'active' | 'archived' | 'deleted'
      ) => {
        if (!dirPath || !fs.existsSync(dirPath)) return [];
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch (_) {
          return [];
        }
        const fileNames = entries
          .filter(e => e.isFile() && allowedExtensions.includes(path.extname(e.name).toLowerCase()))
          .map(e => e.name);

        return Promise.all(
          fileNames.map(async (f) => {
            const fullPath = path.join(dirPath, f);
            const ext = path.extname(f).toLowerCase();
            const isScript = ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'].includes(ext);
            const { stats, cloudSyncPending } = await statFileWithCloudCatchUp(fullPath);
            const bucketSuffix = folderBucket !== 'active' ? `&bucket=${encodeURIComponent(folderBucket)}` : '';
            if (!stats || cloudSyncPending) {
              return {
                name: f,
                duration: isScript ? '—' : '',
                path: `/api/media/stream?path=${encodeURIComponent(f)}${bucketSuffix}`,
                cloudSyncPending: true,
                folderBucket
              };
            }
            let durationStr = '—';
            if (!isScript) {
              const durSec = await getMp3DurationSecondsAsync(fullPath);
              const mins = Math.floor(durSec / 60);
              const secs = Math.floor(durSec % 60);
              durationStr = `${mins}:${String(secs).padStart(2, '0')}`;
            }
            return {
              name: f,
              size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
              duration: durationStr,
              path: `/api/media/stream?path=${encodeURIComponent(f)}${bucketSuffix}`,
              mtimeMs: stats.mtimeMs,
              modifiedTime: stats.mtime.toISOString(),
              cloudSyncPending: false,
              folderBucket
            };
          })
        );
      };

      const [activeFiles, archivedFiles, deletedFiles] = await Promise.all([
        scanBucket(announcementsDir, 'active'),
        scanBucket(archivedDir, 'archived'),
        scanBucket(deletedDir, 'deleted')
      ]);

      return res.json({
        files: [...activeFiles, ...archivedFiles, ...deletedFiles],
        folderPaths: {
          active: announcementsDir,
          archived: archivedDir,
          deleted: deletedDir
        }
      });
    } catch (e: any) {
      console.error('Failed to list File Manager media files:', e);
      return res.status(500).json({
        error: e.message || 'Failed to read File Manager directories',
        files: [],
        folderPaths: { active: '', archived: '', deleted: '' }
      });
    }
  });

  // API - Move announcement files between active, archived, and deleted_in_AMP_OK_to_purge (#26)
  app.post('/api/media/move-files', async (req: express.Request, res: express.Response) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const driveRes = await moveServerDriveAnnouncementFiles(req, req.body || {});
        if ((driveRes as any)?.collision) {
          return res.status(409).json(driveRes);
        }
        return res.json(driveRes);
      }

      const { fileNames, targetBucket, collisionResolution = 'prompt' } = req.body || {};
      if (!Array.isArray(fileNames) || fileNames.length === 0) {
        return res.status(400).json({ error: 'fileNames array is required' });
      }
      if (targetBucket !== 'active' && targetBucket !== 'archived' && targetBucket !== 'deleted') {
        return res.status(400).json({ error: 'Invalid targetBucket. Expected active, archived, or deleted.' });
      }

      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured' });
      }
      const archivedDir = path.join(announcementsDir, 'archived');
      const deletedDir = path.join(announcementsDir, 'deleted_in_AMP_OK_to_purge');
      const bucketDirs: Record<'active' | 'archived' | 'deleted', string> = {
        active: announcementsDir,
        archived: archivedDir,
        deleted: deletedDir
      };

      for (const dirPath of [announcementsDir, archivedDir, deletedDir]) {
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
      }

      const findFileInBucket = (dirPath: string, targetName: string): { fullPath: string; actualName: string } | null => {
        if (!fs.existsSync(dirPath)) return null;
        const cleanLower = targetName.toLowerCase();
        try {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.toLowerCase() === cleanLower) {
              return { fullPath: path.join(dirPath, entry.name), actualName: entry.name };
            }
          }
        } catch (_) {}
        return null;
      };

      const findFileAcrossBuckets = (
        rawName: string
      ): { fullPath: string; actualName: string; bucket: 'active' | 'archived' | 'deleted' } | null => {
        const cleanName = path.basename(String(rawName || '').trim());
        if (!cleanName) return null;
        for (const b of ['active', 'archived', 'deleted'] as const) {
          const hit = findFileInBucket(bucketDirs[b], cleanName);
          if (hit) {
            return { ...hit, bucket: b };
          }
        }
        return null;
      };

      const targetDir = bucketDirs[targetBucket as 'active' | 'archived' | 'deleted'];
      const conflicts: string[] = [];
      const results: Array<{
        sourceName: string;
        finalName?: string;
        status: 'moved' | 'already_in_target' | 'missing_external' | 'conflict';
        fromBucket?: 'active' | 'archived' | 'deleted';
        toBucket?: 'active' | 'archived' | 'deleted';
        message?: string;
      }> = [];

      const pendingMoves: Array<{
        cleanName: string;
        sourceFullPath: string;
        actualName: string;
        fromBucket: 'active' | 'archived' | 'deleted';
        existingTargetHit: { fullPath: string; actualName: string } | null;
      }> = [];

      for (const rawName of fileNames) {
        const cleanName = path.basename(String(rawName || '').trim());
        if (!cleanName) continue;
        const found = findFileAcrossBuckets(cleanName);
        if (!found) {
          results.push({
            sourceName: cleanName,
            status: 'missing_external',
            message: `File "${cleanName}" was moved, renamed, or deleted outside AMP.`
          });
          continue;
        }
        if (found.bucket === targetBucket) {
          results.push({
            sourceName: cleanName,
            finalName: found.actualName,
            status: 'already_in_target',
            fromBucket: found.bucket,
            toBucket: targetBucket
          });
          continue;
        }
        const existingInTarget = findFileInBucket(targetDir, found.actualName);
        if (existingInTarget && collisionResolution === 'prompt') {
          conflicts.push(found.actualName);
        }
        pendingMoves.push({
          cleanName,
          sourceFullPath: found.fullPath,
          actualName: found.actualName,
          fromBucket: found.bucket,
          existingTargetHit: existingInTarget
        });
      }

      if (conflicts.length > 0 && collisionResolution === 'prompt') {
        return res.status(409).json({
          collision: true,
          conflicts,
          targetBucket
        });
      }

      const removeFileResilientSync = (filePathToRemove: string) => {
        if (!fs.existsSync(filePathToRemove)) return;
        try {
          fs.chmodSync(filePathToRemove, 0o666);
        } catch (_) {}
        try {
          fs.rmSync(filePathToRemove, { force: true });
        } catch (_) {
          fs.unlinkSync(filePathToRemove);
        }
      };

      const moveFileResilientSync = (srcPath: string, destPath: string) => {
        try {
          fs.renameSync(srcPath, destPath);
        } catch (_) {
          fs.copyFileSync(srcPath, destPath);
          removeFileResilientSync(srcPath);
        }
      };

      for (const item of pendingMoves) {
        if (!fs.existsSync(item.sourceFullPath)) {
          results.push({
            sourceName: item.cleanName,
            status: 'missing_external',
            message: `File "${item.cleanName}" was moved, renamed, or deleted outside AMP just before transfer.`
          });
          continue;
        }

        let finalTargetName = item.actualName;
        const currentCollision = findFileInBucket(targetDir, finalTargetName);
        if (currentCollision && currentCollision.fullPath !== item.sourceFullPath) {
          if (collisionResolution === 'overwrite') {
            removeFileResilientSync(currentCollision.fullPath);
          } else if (collisionResolution === 'rename') {
            const ext = path.extname(item.actualName);
            const stem = ext ? item.actualName.slice(0, -ext.length) : item.actualName;
            let counter = 2;
            while (findFileInBucket(targetDir, `${stem} (${counter})${ext}`)) {
              counter++;
            }
            finalTargetName = `${stem} (${counter})${ext}`;
          }
        }

        const destFullPath = path.join(targetDir, finalTargetName);
        moveFileResilientSync(item.sourceFullPath, destFullPath);

        results.push({
          sourceName: item.cleanName,
          finalName: finalTargetName,
          status: 'moved',
          fromBucket: item.fromBucket,
          toBucket: targetBucket
        });
      }

      return res.json({
        success: true,
        targetBucket,
        results
      });
    } catch (e: any) {
      console.error('Failed to move announcement files:', e);
      return res.status(500).json({ error: e.message || 'Failed to move announcement files' });
    }
  });

  // Universal HTTP 206 Partial Content Streaming Engine (Local FS + AI Studio Drive Proxy Fallback)
  async function streamMediaFile(req: express.Request, res: express.Response) {
    try {
      const targetFilePath = resolveMediaFilePath(req.query);
      if (!targetFilePath || !fs.existsSync(targetFilePath) || !fs.statSync(targetFilePath).isFile()) {
        // Item 7: If not found on local disk, attempt server-side Google Drive stream proxy
        const rawQueryTarget = String(req.query.path || req.query.file || '').trim();
        if (rawQueryTarget) {
          const streamedFromDrive = await streamServerDriveFile(req, res, rawQueryTarget);
          if (streamedFromDrive) return;
        }
        return res.status(404).send('Media file not found');
      }

      const stat = fs.statSync(targetFilePath);
      const fileSize = stat.size;
      const ext = path.extname(targetFilePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aiff': 'audio/aiff',
        '.aif': 'audio/aiff',
        '.txt': 'text/plain; charset=utf-8',
        '.pdf': 'application/pdf',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const range = req.headers.range;
      if (range) {
        const rangeMatch = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
        let start = NaN;
        let end = NaN;
        if (rangeMatch && fileSize > 0) {
          const [, startStr, endStr] = rangeMatch;
          if (startStr === '' && endStr !== '') {
            // Suffix byte-range (e.g. bytes=-500)
            const suffixLength = parseInt(endStr, 10);
            if (!isNaN(suffixLength) && suffixLength > 0) {
              start = Math.max(0, fileSize - suffixLength);
              end = fileSize - 1;
            }
          } else if (startStr !== '') {
            start = parseInt(startStr, 10);
            end = endStr !== '' ? Math.min(parseInt(endStr, 10), fileSize - 1) : fileSize - 1;
          }
        }

        if (fileSize === 0 || isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes'
          }).end();
          return;
        }

        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });

        const fileStream = fs.createReadStream(targetFilePath, { start, end });
        fileStream.on('error', () => {
          if (!res.headersSent) {
            res.status(500).send('Streaming error');
          }
        });
        res.on('close', () => {
          fileStream.destroy();
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });

        const fileStream = fs.createReadStream(targetFilePath);
        fileStream.on('error', () => {
          if (!res.headersSent) {
            res.status(500).send('Streaming error');
          }
        });
        res.on('close', () => {
          fileStream.destroy();
        });
        fileStream.pipe(res);
      }
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).send(e.message || 'Streaming failed');
      }
    }
  }

  app.get('/api/media/stream', streamMediaFile);
  app.get('/api/shows/playlist/stream-file', streamMediaFile);

  // API - Get live-read script/image content
  app.get('/api/live-read/content', async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      const file = req.query.file as string;
      if (!file) return res.status(400).json({ error: 'Filename required' });

      if (file.startsWith('__up_next_promo__:')) {
        const rawEncoded = file.replace(/^__up_next_promo__:/, '').replace(/\.txt$/i, '');
        let decodedText = rawEncoded;
        try {
          decodedText = decodeURIComponent(rawEncoded);
        } catch (_) {}
        return res.json({
          name: 'Up Next Promo.txt',
          path: file,
          extension: '.txt',
          url: '',
          content: decodedText
        });
      }

      const requestedBucket = parseAnnouncementBucketParam(req.query.bucket);
      const bucketQuerySuffix = requestedBucket !== 'active' ? `&bucket=${encodeURIComponent(requestedBucket)}` : '';

      // AI Studio Google Drive Provider
      if (isServerDriveStorageRequest(req)) {
        const cleanName = path.basename(String(file).trim());
        const foundMatch = await serverDriveFindAnnouncementFileInBucket(req, cleanName, requestedBucket);
        if (!foundMatch) {
          return res.status(404).json({ error: `File "${cleanName}" not found in Google Drive Media Announcements` });
        }
        const found = foundMatch.file;
        const resolvedName = found.name || cleanName;
        const ext = path.extname(resolvedName).toLowerCase();
        const isText = ext === '.txt' || ext === '.md';
        const responseData: any = {
          name: resolvedName,
          id: found.id,
          path: `Google Drive / media_announcements / ${resolvedName}`,
          extension: ext,
          url: isText
            ? `/api/media/stream?path=${encodeURIComponent(resolvedName)}${bucketQuerySuffix}`
            : `/api/media/stream?path=${encodeURIComponent(found.id)}`,
          storageProvider: 'drive'
        };
        if (isText) {
          const mediaRes = await serverDriveFetch(req, `drive/v3/files/${found.id}?alt=media`);
          responseData.content = await mediaRes.text();
        }
        return res.json(responseData);
      }

      // Production Local Filesystem Provider (with short cloud-hydration catch-up retry)
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      const resolveLocalFilePath = (): string | null => {
        if (!announcementsDir || !fs.existsSync(announcementsDir)) return null;
        const resolved = findAnnouncementSourceFile(announcementsDir, file, { bucket: requestedBucket });
        if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
        return null;
      };

      let targetFilePath = resolveLocalFilePath();
      const hydrationDelays = [150, 350, 700];
      for (const delayMs of hydrationDelays) {
        if (targetFilePath) break;
        if (!announcementsDir || !fs.existsSync(announcementsDir)) {
          return res.status(404).json({ error: 'Media Announcements folder not defined or offline' });
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
        targetFilePath = resolveLocalFilePath();
      }

      if (!targetFilePath) {
        if (!announcementsDir || !fs.existsSync(announcementsDir)) {
          return res.status(404).json({ error: 'Media Announcements folder not defined or offline' });
        }
        return res.status(404).json({ error: 'File not found in Media Announcements directory' });
      }

      const ext = path.extname(targetFilePath).toLowerCase();
      const isText = ext === '.txt' || ext === '.md';
      const resolvedBaseName = path.basename(targetFilePath);

      const responseData: any = {
        name: resolvedBaseName,
        path: targetFilePath,
        extension: ext,
        url: `/api/media/stream?path=${encodeURIComponent(resolvedBaseName)}${bucketQuerySuffix}`,
        storageProvider: 'local'
      };

      if (isText) {
        let textContent = '';
        let lastReadErr: any = null;
        for (let attempt = 0; attempt <= hydrationDelays.length; attempt++) {
          try {
            textContent = fs.readFileSync(targetFilePath, 'utf8');
            lastReadErr = null;
            if (textContent.length > 0) break;
            // If file reports 0 bytes on disk while cloud sync is hydrating, wait briefly once
            const stat = fs.statSync(targetFilePath);
            if (stat.size === 0 && attempt < hydrationDelays.length) {
              await new Promise(resolve => setTimeout(resolve, hydrationDelays[attempt]));
              continue;
            }
            break;
          } catch (readErr: any) {
            lastReadErr = readErr;
            if (attempt < hydrationDelays.length) {
              await new Promise(resolve => setTimeout(resolve, hydrationDelays[attempt]));
            }
          }
        }
        if (lastReadErr) throw lastReadErr;
        responseData.content = textContent;
      }

      res.json(responseData);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to read file' });
    }
  });

  // API - Save or update a .txt live-read script in media_announcements
  app.post('/api/live-read/save', async (req, res) => {
    try {
      const { fileName, content, allowOverwrite } = req.body || {};
      const rawName = String(fileName || '').trim();
      if (!rawName) {
        return res.status(400).json({ error: 'Filename is required' });
      }

      const safeBase = path.basename(rawName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
      if (!safeBase) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const existingExt = path.extname(safeBase);
      const stem = (existingExt ? safeBase.slice(0, -existingExt.length) : safeBase)
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!stem) {
        return res.status(400).json({ error: 'Filename stem cannot be empty' });
      }
      const finalFileName = `${stem}.txt`;
      const textToWrite = typeof content === 'string' ? content : '';

      // AI Studio Google Drive Provider
      if (isServerDriveStorageRequest(req)) {
        const folderId = await resolveServerDriveAnnouncementsFolderId(req);
        const existing = await serverDriveFindFileCaseInsensitive(req, finalFileName, folderId);
        if (existing && !allowOverwrite) {
          return res.status(409).json({
            error: `A file named "${existing.name || finalFileName}" already exists in Google Drive Media Announcements.`,
            exists: true,
            name: existing.name || finalFileName
          });
        }
        const fileId = existing
          ? existing.id
          : await serverDriveCreateFileInFolder(req, finalFileName, folderId, 'text/plain');
        await serverDriveUploadFileContent(req, fileId, textToWrite, 'text/plain; charset=utf-8');
        const nowMs = Date.now();
        const sizeMb = Math.max(0.01, Buffer.byteLength(textToWrite, 'utf8') / (1024 * 1024));
        return res.json({
          success: true,
          name: finalFileName,
          id: fileId,
          path: fileId,
          size: `${sizeMb.toFixed(2)} MB`,
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
          storageProvider: 'drive'
        });
      }

      // Production Local Filesystem Provider
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured' });
      }
      if (!fs.existsSync(announcementsDir)) {
        fs.mkdirSync(announcementsDir, { recursive: true });
      }

      let targetFilePath = path.join(announcementsDir, finalFileName);
      if (!fs.existsSync(targetFilePath)) {
        const lowerTarget = finalFileName.toLowerCase();
        try {
          const activeEntries = fs.readdirSync(announcementsDir, { withFileTypes: true });
          const caseMatch = activeEntries.find(
            (entry) => entry.isFile() && entry.name.toLowerCase() === lowerTarget
          );
          if (caseMatch) {
            targetFilePath = path.join(announcementsDir, caseMatch.name);
          }
        } catch {
          // Ignore directory read errors; proceed with direct path
        }
      }

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${path.basename(targetFilePath)}" already exists in Media Announcements.`,
          exists: true,
          name: path.basename(targetFilePath)
        });
      }

      const tempPath = `${targetFilePath}.tmp-${Date.now()}`;
      fs.writeFileSync(tempPath, textToWrite, 'utf8');
      fs.renameSync(tempPath, targetFilePath);

      const stat = fs.statSync(targetFilePath);
      const sizeKb = Math.max(0.1, stat.size / (1024 * 1024));

      res.json({
        success: true,
        name: path.basename(targetFilePath),
        path: targetFilePath,
        size: `${sizeKb.toFixed(2)} MB`,
        mtimeMs: stat.mtimeMs,
        modifiedTime: stat.mtime.toISOString(),
        storageProvider: 'local'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to save script file' });
    }
  });

  // API - Duplicate a live-read or audio asset in media_announcements
  app.post('/api/live-read/copy-file', async (req, res) => {
    try {
      const { sourceFileName, targetFileName, allowOverwrite, sourceBucket } = req.body || {};
      const rawSource = String(sourceFileName || '').trim();
      const rawTarget = String(targetFileName || '').trim();
      const requestedSourceBucket = parseAnnouncementBucketParam(sourceBucket);
      if (!rawSource || !rawTarget) {
        return res.status(400).json({ error: 'Source and target filenames are required' });
      }

      const safeTargetBase = path.basename(rawTarget).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
      if (!safeTargetBase) {
        return res.status(400).json({ error: 'Invalid target filename' });
      }

      // AI Studio Google Drive Provider
      if (isServerDriveStorageRequest(req)) {
        const folderId = await resolveServerDriveAnnouncementsFolderId(req);
        const cleanSource = path.basename(rawSource);
        const foundSource = await serverDriveFindAnnouncementFileInBucket(req, cleanSource, requestedSourceBucket, folderId);
        const sourceFile = foundSource?.file || null;
        if (!sourceFile) {
          return res.status(404).json({
            error: `Source file "${cleanSource}" not found in Google Drive Media Announcements`
          });
        }
        const sourceExt = path.extname(sourceFile.name || cleanSource) || path.extname(rawTarget);
        const targetExt = path.extname(safeTargetBase);
        const stem = (
          targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
            ? safeTargetBase.slice(0, -targetExt.length)
            : safeTargetBase
        )
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (!stem) {
          return res.status(400).json({ error: 'Target filename stem cannot be empty' });
        }
        const finalFileName = `${stem}${sourceExt}`;
        const existingTarget = await serverDriveFindFileCaseInsensitive(req, finalFileName, folderId);
        if (existingTarget && !allowOverwrite) {
          return res.status(409).json({
            error: `A file named "${existingTarget.name || finalFileName}" already exists in Google Drive Media Announcements.`,
            exists: true,
            name: existingTarget.name || finalFileName
          });
        }

        const downloadRes = await serverDriveFetch(req, `drive/v3/files/${sourceFile.id}?alt=media`);
        const arrayBuf = await downloadRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const mimeType = sourceFile.mimeType || downloadRes.headers.get('content-type') || 'application/octet-stream';

        const targetFileId = existingTarget
          ? existingTarget.id
          : await serverDriveCreateFileInFolder(req, finalFileName, folderId, mimeType);
        await serverDriveUploadFileContent(req, targetFileId, buffer, mimeType);

        const nowMs = Date.now();
        const sizeMb = Math.max(0.01, buffer.length / (1024 * 1024));
        return res.json({
          success: true,
          name: finalFileName,
          id: targetFileId,
          path: targetFileId,
          size: `${sizeMb.toFixed(2)} MB`,
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
          storageProvider: 'drive'
        });
      }

      // Production Local Filesystem Provider
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir || !fs.existsSync(announcementsDir)) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured or offline' });
      }

      const sourceFilePath = findAnnouncementSourceFile(announcementsDir, rawSource, {
        bucket: requestedSourceBucket
      });

      if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
        return res.status(404).json({ error: `Source file "${rawSource}" not found in Media Announcements` });
      }

      const sourceExt = path.extname(sourceFilePath) || path.extname(rawSource);
      const targetExt = path.extname(safeTargetBase);
      const stem = (
        targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
          ? safeTargetBase.slice(0, -targetExt.length)
          : safeTargetBase
      )
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!stem) {
        return res.status(400).json({ error: 'Target filename stem cannot be empty' });
      }

      const finalFileName = `${stem}${sourceExt}`;
      const targetFilePath = path.join(announcementsDir, finalFileName);

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${finalFileName}" already exists in Media Announcements.`,
          exists: true,
          name: finalFileName
        });
      }

      const tempPath = `${targetFilePath}.tmp-${Date.now()}`;
      fs.copyFileSync(sourceFilePath, tempPath);
      fs.renameSync(tempPath, targetFilePath);

      const stat = fs.statSync(targetFilePath);
      const sizeMb = Math.max(0.01, stat.size / (1024 * 1024));

      const savedBaseName = path.basename(targetFilePath);
      res.json({
        success: true,
        name: savedBaseName,
        path: `/api/media/stream?path=${encodeURIComponent(savedBaseName)}`,
        size: `${sizeMb.toFixed(2)} MB`,
        mtimeMs: stat.mtimeMs,
        modifiedTime: stat.mtime.toISOString(),
        storageProvider: 'local'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to copy file' });
    }
  });

  // API - Upload an audio, script, document, or image file into media_announcements
  app.post('/api/announcements/upload-file', async (req, res) => {
    try {
      const { fileName, contentBase64, mimeType, allowOverwrite } = req.body || {};
      const rawName = String(fileName || '').trim();
      if (!rawName) {
        return res.status(400).json({ error: 'Filename is required' });
      }
      if (!contentBase64 || typeof contentBase64 !== 'string') {
        return res.status(400).json({ error: 'File content is required' });
      }

      const safeBase = path.basename(rawName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
      if (!safeBase) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      const ext = path.extname(safeBase).toLowerCase();
      const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'];
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({
          error: `Unsupported file type "${ext || 'unknown'}". Allowed: ${allowedExtensions.join(', ')}`
        });
      }

      const stem = safeBase.slice(0, -ext.length).replace(/\s{2,}/g, ' ').trim();
      if (!stem) {
        return res.status(400).json({ error: 'Filename stem cannot be empty' });
      }
      const finalFileName = `${stem}${ext}`;

      const base64Clean = contentBase64.includes(',')
        ? contentBase64.slice(contentBase64.indexOf(',') + 1)
        : contentBase64;
      const buffer = Buffer.from(base64Clean, 'base64');

      // AI Studio Google Drive Provider
      if (isServerDriveStorageRequest(req)) {
        const folderId = await resolveServerDriveAnnouncementsFolderId(req);
        const existing = await serverDriveFindFileCaseInsensitive(req, finalFileName, folderId);
        if (existing && !allowOverwrite) {
          return res.status(409).json({
            error: `A file named "${existing.name || finalFileName}" already exists in Google Drive Media Announcements.`,
            exists: true,
            name: existing.name || finalFileName
          });
        }
        const resolvedMime = String(mimeType || 'application/octet-stream');
        const fileId = existing
          ? existing.id
          : await serverDriveCreateFileInFolder(req, finalFileName, folderId, resolvedMime);
        await serverDriveUploadFileContent(req, fileId, buffer, resolvedMime);
        const nowMs = Date.now();
        const sizeMb = Math.max(0.01, buffer.length / (1024 * 1024));
        return res.json({
          success: true,
          name: finalFileName,
          id: fileId,
          path: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          size: `${sizeMb.toFixed(2)} MB`,
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
          storageProvider: 'drive'
        });
      }

      // Production Local Filesystem Provider
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured' });
      }
      if (!fs.existsSync(announcementsDir)) {
        fs.mkdirSync(announcementsDir, { recursive: true });
      }

      let targetFilePath = path.join(announcementsDir, finalFileName);
      if (!fs.existsSync(targetFilePath)) {
        const lowerTarget = finalFileName.toLowerCase();
        try {
          const activeEntries = fs.readdirSync(announcementsDir, { withFileTypes: true });
          const caseMatch = activeEntries.find(
            (entry) => entry.isFile() && entry.name.toLowerCase() === lowerTarget
          );
          if (caseMatch) {
            targetFilePath = path.join(announcementsDir, caseMatch.name);
          }
        } catch {
          // Ignore directory read errors; proceed with direct path
        }
      }

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${path.basename(targetFilePath)}" already exists in Media Announcements.`,
          exists: true,
          name: path.basename(targetFilePath)
        });
      }

      const tempPath = `${targetFilePath}.tmp-${Date.now()}`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, targetFilePath);

      const stat = fs.statSync(targetFilePath);
      const sizeMb = Math.max(0.01, stat.size / (1024 * 1024));
      const savedName = path.basename(targetFilePath);

      res.json({
        success: true,
        name: savedName,
        path: `/api/media/stream?path=${encodeURIComponent(savedName)}`,
        size: `${sizeMb.toFixed(2)} MB`,
        mtimeMs: stat.mtimeMs,
        modifiedTime: stat.mtime.toISOString(),
        storageProvider: 'local'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to upload announcement file' });
    }
  });

  // API - Rename or safely copy an audio/announcement file in media_announcements
  app.post('/api/announcements/rename-or-copy-file', async (req, res) => {
    try {
      const {
        sourceFileName,
        targetFileName,
        forceCopy,
        allowOverwrite,
        currentLiveReadName,
        editingAnnouncementId,
        contentBase64,
        mimeType
      } = req.body || {};

      const rawSource = String(sourceFileName || '').trim();
      const rawTarget = String(targetFileName || '').trim();
      if (!rawSource || !rawTarget) {
        return res.status(400).json({ error: 'Source and target filenames are required' });
      }

      const safeTargetBase = path.basename(rawTarget).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
      if (!safeTargetBase) {
        return res.status(400).json({ error: 'Invalid target filename' });
      }

      // AI Studio Google Drive Provider (strictly scoped to Active root; never mutates or deletes archived/deleted files)
      if (isServerDriveStorageRequest(req)) {
        const folderId = await resolveServerDriveAnnouncementsFolderId(req);
        const allFiles = await serverDriveListFolderFiles(req, folderId);
        const cleanSource = path.basename(rawSource);
        const sourceFile =
          allFiles.find(f => String(f.name || '').toLowerCase() === cleanSource.toLowerCase()) || null;
        if (!sourceFile && (!contentBase64 || typeof contentBase64 !== 'string')) {
          return res.status(404).json({
            error: `Source file "${cleanSource}" not found in Google Drive Media Announcements`
          });
        }

        const sourceExt = path.extname(sourceFile?.name || cleanSource) || path.extname(rawTarget);
        const targetExt = path.extname(safeTargetBase);
        const stem =
          targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
            ? safeTargetBase.slice(0, -targetExt.length).trim()
            : safeTargetBase;
        if (!stem) {
          return res.status(400).json({ error: 'Target filename stem cannot be empty' });
        }
        const finalFileName = `${stem}${sourceExt}`;
        const existingTarget =
          allFiles.find(f => String(f.name || '').toLowerCase() === finalFileName.toLowerCase()) || null;

        if (existingTarget && !allowOverwrite && (!sourceFile || existingTarget.id !== sourceFile.id)) {
          return res.status(409).json({
            error: `A file named "${existingTarget.name || finalFileName}" already exists in Google Drive Media Announcements.`,
            exists: true,
            name: existingTarget.name || finalFileName
          });
        }

        let isUsedElsewhere = Boolean(forceCopy);
        const sourceStemLower = cleanSource.slice(0, -path.extname(cleanSource).length).toLowerCase();
        const currentScriptLower = String(currentLiveReadName || '').trim().toLowerCase();
        if (!isUsedElsewhere) {
          for (const f of allFiles) {
            const fLower = String(f.name || '').toLowerCase();
            if ((fLower.endsWith('.txt') || fLower.endsWith('.md')) && fLower !== currentScriptLower) {
              const fStem = fLower.slice(0, -path.extname(fLower).length);
              if (fStem === sourceStemLower) {
                isUsedElsewhere = true;
                break;
              }
            }
          }
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        let targetId = '';
        let sizeMb = 0.1;
        let actionTaken: 'copied' | 'renamed' = isUsedElsewhere ? 'copied' : 'renamed';

        if (!isUsedElsewhere && sourceFile && !existingTarget) {
          await serverDriveFetch(req, `drive/v3/files/${sourceFile.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: finalFileName })
          });
          targetId = sourceFile.id;
          sizeMb = sourceFile.size ? Math.max(0.01, Number(sourceFile.size) / (1024 * 1024)) : 0.1;
          actionTaken = 'renamed';
        } else {
          let buffer: Buffer;
          let resolvedMime = String(mimeType || sourceFile?.mimeType || 'audio/mpeg');
          if (typeof contentBase64 === 'string' && contentBase64) {
            const base64Clean = contentBase64.includes(',')
              ? contentBase64.slice(contentBase64.indexOf(',') + 1)
              : contentBase64;
            buffer = Buffer.from(base64Clean, 'base64');
          } else if (sourceFile) {
            const downloadRes = await serverDriveFetch(req, `drive/v3/files/${sourceFile.id}?alt=media`);
            buffer = Buffer.from(await downloadRes.arrayBuffer());
            resolvedMime = sourceFile.mimeType || downloadRes.headers.get('content-type') || resolvedMime;
          } else {
            return res.status(404).json({
              error: `Source file "${cleanSource}" not found in Google Drive Media Announcements`
            });
          }

          targetId = existingTarget
            ? existingTarget.id
            : await serverDriveCreateFileInFolder(req, finalFileName, folderId, resolvedMime);
          await serverDriveUploadFileContent(req, targetId, buffer, resolvedMime);
          sizeMb = Math.max(0.01, buffer.length / (1024 * 1024));

          if (!isUsedElsewhere && sourceFile && sourceFile.id !== targetId) {
            try {
              await serverDriveFetch(req, `drive/v3/files/${sourceFile.id}`, { method: 'DELETE' });
            } catch (_) {}
          }
        }

        return res.json({
          success: true,
          name: finalFileName,
          id: targetId,
          path: `https://www.googleapis.com/drive/v3/files/${targetId}?alt=media`,
          size: `${sizeMb.toFixed(2)} MB`,
          mtimeMs: nowMs,
          modifiedTime: nowIso,
          action: actionTaken,
          usedElsewhere: isUsedElsewhere,
          storageProvider: 'drive'
        });
      }

      // Production Local Filesystem Provider (strictly scoped to Active root; never mutates or deletes archived/deleted files)
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured or offline' });
      }
      if (!fs.existsSync(announcementsDir)) {
        fs.mkdirSync(announcementsDir, { recursive: true });
      }

      const resolvedActiveSource = findAnnouncementSourceFile(announcementsDir, rawSource, { bucket: 'active' });
      const sourceFilePath = resolvedActiveSource || path.join(announcementsDir, path.basename(rawSource));
      const hasSourceOnDisk = Boolean(resolvedActiveSource && fs.existsSync(resolvedActiveSource));
      if (!hasSourceOnDisk && (!contentBase64 || typeof contentBase64 !== 'string')) {
        return res.status(404).json({ error: `Source file "${rawSource}" not found in Media Announcements` });
      }

      const sourceExt = path.extname(hasSourceOnDisk ? sourceFilePath : rawSource) || path.extname(rawTarget);
      const targetExt = path.extname(safeTargetBase);
      const stem =
        targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
          ? safeTargetBase.slice(0, -targetExt.length).trim()
          : safeTargetBase;
      if (!stem) {
        return res.status(400).json({ error: 'Target filename stem cannot be empty' });
      }

      const finalFileName = `${stem}${sourceExt}`;
      const cleanSourceName = hasSourceOnDisk ? path.basename(sourceFilePath) : path.basename(rawSource);

      if (hasSourceOnDisk && cleanSourceName.toLowerCase() === finalFileName.toLowerCase()) {
        const stat = fs.statSync(sourceFilePath);
        const sizeMb = Math.max(0.01, stat.size / (1024 * 1024));
        return res.json({
          success: true,
          name: cleanSourceName,
          path: `/api/media/stream?path=${encodeURIComponent(cleanSourceName)}`,
          size: `${sizeMb.toFixed(2)} MB`,
          mtimeMs: stat.mtimeMs,
          modifiedTime: stat.mtime.toISOString(),
          action: 'unchanged',
          usedElsewhere: false,
          storageProvider: 'local'
        });
      }

      const targetFilePath = path.join(announcementsDir, finalFileName);

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${finalFileName}" already exists in Media Announcements.`,
          exists: true,
          name: path.basename(targetFilePath)
        });
      }

      let isUsedElsewhere = Boolean(forceCopy);
      const sourceLower = cleanSourceName.toLowerCase();
      const sourceStemLower = cleanSourceName.slice(0, -path.extname(cleanSourceName).length).toLowerCase();
      const currentScriptLower = String(currentLiveReadName || '').trim().toLowerCase();

      if (!isUsedElsewhere) {
        try {
          const dirFiles = fs.readdirSync(announcementsDir);
          for (const f of dirFiles) {
            const fLower = f.toLowerCase();
            if ((fLower.endsWith('.txt') || fLower.endsWith('.md')) && fLower !== currentScriptLower) {
              const fStem = fLower.slice(0, -path.extname(fLower).length);
              if (fStem === sourceStemLower) {
                isUsedElsewhere = true;
                break;
              }
            }
          }
        } catch (_) {}
      }

      if (!isUsedElsewhere) {
        try {
          const calPath = getCalendarFilePath();
          if (calPath && fs.existsSync(calPath)) {
            const rawCal = fs.readFileSync(calPath, 'utf-8');
            const parsed = JSON.parse(rawCal || '[]');
            const list: any[] = Array.isArray(parsed)
              ? parsed
              : Array.isArray(parsed?.data)
                ? parsed.data
                : [];
            for (const ann of list) {
              if (!ann) continue;
              const isSameEditingAnn =
                editingAnnouncementId && String(ann.id) === String(editingAnnouncementId);
              const slots: any[] = Array.isArray(ann.timeGatedMp3s) ? ann.timeGatedMp3s : [];
              for (const slot of slots) {
                const mediaItems: any[] = Array.isArray(slot?.mediaItems) && slot.mediaItems.length > 0 ? slot.mediaItems : [slot];
                for (const mItem of mediaItems) {
                  const slotPrimary = path.basename(String(mItem?.mp3Url || '')).toLowerCase();
                  const slotBackup = path.basename(String(mItem?.backupMp3Url || '')).toLowerCase();
                  if (slotPrimary === sourceLower) {
                    isUsedElsewhere = true;
                    break;
                  }
                  if (slotBackup === sourceLower) {
                    if (!isSameEditingAnn || (currentScriptLower && slotPrimary !== currentScriptLower)) {
                      isUsedElsewhere = true;
                      break;
                    }
                  }
                }
                if (isUsedElsewhere) break;
              }
              if (isUsedElsewhere) break;
            }
          }
        } catch (_) {}
      }

      const tempPath = `${targetFilePath}.tmp-${Date.now()}`;
      let actionTaken: 'copied' | 'renamed' = 'renamed';
      if (!hasSourceOnDisk && typeof contentBase64 === 'string') {
        const base64Clean = contentBase64.includes(',')
          ? contentBase64.slice(contentBase64.indexOf(',') + 1)
          : contentBase64;
        fs.writeFileSync(tempPath, Buffer.from(base64Clean, 'base64'));
        fs.renameSync(tempPath, targetFilePath);
        actionTaken = isUsedElsewhere ? 'copied' : 'renamed';
      } else if (isUsedElsewhere) {
        fs.copyFileSync(sourceFilePath, tempPath);
        fs.renameSync(tempPath, targetFilePath);
        actionTaken = 'copied';
      } else {
        fs.copyFileSync(sourceFilePath, tempPath);
        fs.renameSync(tempPath, targetFilePath);
        try {
          if (sourceFilePath !== targetFilePath && fs.existsSync(sourceFilePath)) {
            fs.unlinkSync(sourceFilePath);
          }
        } catch (_) {}
        actionTaken = 'renamed';
      }

      const stat = fs.statSync(targetFilePath);
      const sizeMb = Math.max(0.01, stat.size / (1024 * 1024));
      const savedName = path.basename(targetFilePath);

      res.json({
        success: true,
        name: savedName,
        path: `/api/media/stream?path=${encodeURIComponent(savedName)}`,
        size: `${sizeMb.toFixed(2)} MB`,
        mtimeMs: stat.mtimeMs,
        modifiedTime: stat.mtime.toISOString(),
        action: actionTaken,
        usedElsewhere: isUsedElsewhere,
        storageProvider: 'local'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to rename or copy announcement file' });
    }
  });

  // API - Trigger Electron spawn live read window
  app.post('/api/live-read/spawn', (req, res) => {
    try {
      const data = req.body;
      if (typeof global !== 'undefined' && (global as any).spawnLiveRead) {
        (global as any).spawnLiveRead(data);
        return res.json({ success: true, mode: 'electron' });
      } else {
        console.log('Spawn live read window requested (browser fallback):', data);
        return res.json({ success: true, mode: 'browser' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to spawn window' });
    }
  });
}
