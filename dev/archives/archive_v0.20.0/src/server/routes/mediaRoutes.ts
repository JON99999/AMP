import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  currentSettings,
  getAmpMediaAnnouncementsDir,
  getAmpMediaEvergreensDir,
  getAmpMediaShowsDir,
  getCalendarFilePath,
  findAnnouncementSourceFile
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

            if (title || artist || album) {
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

          if (meta) {
            return {
              title: meta.title,
              artist: meta.artist,
              albumArtist: meta.albumArtist || meta.artist,
              album: meta.album
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
              durationSeconds = 180;
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
          durationSeconds = 180;
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

// Helper to locate Evergreen track source file strictly inside Media Evergreens directory
export function findEvergreenSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
  if (!fileName) return null;
  if (fs.existsSync(fileName)) return fileName;

  let cleanName = fileName;
  if (cleanName.includes('/api/media/stream')) {
    const parts = cleanName.split(/(?:file|path)=/);
    if (parts.length > 1) {
      cleanName = decodeURIComponent(parts[1].split('&')[0]);
    }
  }

  const evergreensRoot = fs.existsSync(path.join(folderPath, 'media_evergreens'))
    ? path.join(folderPath, 'media_evergreens')
    : (fs.existsSync(path.join(folderPath, 'MediaEvergreens')) ? path.join(folderPath, 'MediaEvergreens') : folderPath);
  const baseName = path.basename(cleanName);

  const showFolder = findShowPlaylistFolder(evergreensRoot, showNameShort, showName);
  if (showFolder) {
    const candidate = path.join(showFolder, baseName);
    if (fs.existsSync(candidate)) return candidate;
  }

  if (fs.existsSync(evergreensRoot)) {
    const candidateRoot = path.join(evergreensRoot, baseName);
    if (fs.existsSync(candidateRoot)) return candidateRoot;

    try {
      const entries = fs.readdirSync(evergreensRoot);
      for (const entry of entries) {
        const fullPath = path.join(evergreensRoot, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          const candidate = path.join(fullPath, baseName);
          if (fs.existsSync(candidate)) return candidate;
        } else if (entry.toLowerCase() === baseName.toLowerCase()) {
          return fullPath;
        }
      }
    } catch (e) {}
  }

  const candidateDirect = path.join(folderPath, baseName);
  if (fs.existsSync(candidateDirect)) return candidateDirect;

  return null;
}

// Helper to locate Show track / playlist source file strictly inside Media Shows directory
export function findShowSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
  if (!fileName) return null;
  if (fs.existsSync(fileName)) return fileName;

  let cleanName = fileName;
  if (cleanName.includes('/api/media/stream')) {
    const parts = cleanName.split(/(?:file|path)=/);
    if (parts.length > 1) {
      cleanName = decodeURIComponent(parts[1].split('&')[0]);
    }
  }

  const showsRoot = fs.existsSync(path.join(folderPath, 'media_shows'))
    ? path.join(folderPath, 'media_shows')
    : (fs.existsSync(path.join(folderPath, 'MediaShows')) ? path.join(folderPath, 'MediaShows') : folderPath);
  const baseName = path.basename(cleanName);

  const showFolder = findShowPlaylistFolder(showsRoot, showNameShort, showName);
  if (showFolder) {
    const candidate = path.join(showFolder, baseName);
    if (fs.existsSync(candidate)) return candidate;
  }

  if (fs.existsSync(showsRoot)) {
    const candidateRoot = path.join(showsRoot, baseName);
    if (fs.existsSync(candidateRoot)) return candidateRoot;

    try {
      const entries = fs.readdirSync(showsRoot);
      for (const entry of entries) {
        const fullPath = path.join(showsRoot, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          const candidate = path.join(fullPath, baseName);
          if (fs.existsSync(candidate)) return candidate;
        } else if (entry.toLowerCase() === baseName.toLowerCase()) {
          return fullPath;
        }
      }
    } catch (e) {}
  }

  const candidateDirect = path.join(folderPath, baseName);
  if (fs.existsSync(candidateDirect)) return candidateDirect;

  return null;
}

// Universal Media File Path Resolution Engine
export function resolveMediaFilePath(query: any): string | null {
  const file = (query.path || query.file) as string;
  const showNameShort = (query.showNameShort || '') as string;
  const showName = (query.showName || '') as string;
  const folderType = (query.folderType || 'Playlists') as string;
  const targetSubfolder = (query.targetSubfolder || '') as string;
  const externalAbsolutePath = (query.externalAbsolutePath || '') as string;

  if (!file && !showNameShort && !showName && !externalAbsolutePath) return null;

  // 1. Direct absolute path check
  if (file && path.isAbsolute(file) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return file;
  }

  // 1b. External directory absolute path check
  if (externalAbsolutePath && fs.existsSync(externalAbsolutePath)) {
    if (fs.statSync(externalAbsolutePath).isFile()) {
      return externalAbsolutePath;
    }
    if (file) {
      const cleanFileName = path.basename(file);
      const directTarget = path.join(externalAbsolutePath, cleanFileName);
      if (fs.existsSync(directTarget) && fs.statSync(directTarget).isFile()) {
        return directTarget;
      }
    }
  }

  // 2. Specific show playlist or evergreen subfolder lookup
  if (showNameShort || showName) {
    const isEvergreen = folderType && folderType.toLowerCase().startsWith('evergreen');
    const targetDir = isEvergreen
      ? getAmpMediaEvergreensDir(currentSettings)
      : getAmpMediaShowsDir(currentSettings);

    if (targetDir && fs.existsSync(targetDir)) {
      const showFolderPath = findShowPlaylistFolder(targetDir, showNameShort, showName);
      if (showFolderPath && fs.existsSync(showFolderPath)) {
        if (targetSubfolder && targetSubfolder !== '.') {
          const subDir = path.join(showFolderPath, targetSubfolder);
          if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
            if (file) {
              const cleanFileName = path.basename(file);
              const subTarget = path.join(subDir, cleanFileName);
              if (fs.existsSync(subTarget) && fs.statSync(subTarget).isFile()) {
                return subTarget;
              }
            }
          }
        }

        if (file) {
          const cleanFileName = path.basename(file);
          const directTarget = path.join(showFolderPath, cleanFileName);
          if (fs.existsSync(directTarget) && fs.statSync(directTarget).isFile()) {
            return directTarget;
          }
          const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath, { targetSubfolder, recursive: false });
          const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
          if (matched && fs.existsSync(matched.fullPath) && fs.statSync(matched.fullPath).isFile()) {
            return matched.fullPath;
          }
        }
      }
    }
  }

  // 3. Check Media Announcements (media_announcements)
  const mediaAnnounce = getAmpMediaAnnouncementsDir(currentSettings);
  if (mediaAnnounce && fs.existsSync(mediaAnnounce) && file) {
    const p = path.join(mediaAnnounce, path.basename(file));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findAnnouncementSourceFile(mediaAnnounce, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  // 4. Check Media Evergreens (media_evergreens)
  const mediaEvergreens = getAmpMediaEvergreensDir(currentSettings);
  if (mediaEvergreens && fs.existsSync(mediaEvergreens) && file) {
    const p = path.join(mediaEvergreens, file);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findEvergreenSourceFile(mediaEvergreens, file, showNameShort, showName);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  // 5. Check Media Shows (media_shows)
  const mediaShows = getAmpMediaShowsDir(currentSettings);
  if (mediaShows && fs.existsSync(mediaShows) && file) {
    const p = path.join(mediaShows, file);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findShowSourceFile(mediaShows, file, showNameShort, showName) || findAnnouncementSourceFile(mediaShows, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  // 6. Check relative to unified AMP station root
  if (currentSettings.localPathAmp && fs.existsSync(currentSettings.localPathAmp) && file) {
    const directAmpRel = path.join(currentSettings.localPathAmp, file);
    if (fs.existsSync(directAmpRel) && fs.statSync(directAmpRel).isFile()) {
      return directAmpRel;
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
      const mp3List = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return allowedExtensions.includes(ext);
        })
        .map(f => {
          const fullPath = path.join(targetDir, f);
          const stats = fs.statSync(fullPath);
          const ext = path.extname(f).toLowerCase();
          const isScript = ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.md'].includes(ext);
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: isScript ? '—' : '0:15',
            path: `/api/media/stream?path=${encodeURIComponent(f)}`,
            mtimeMs: stats.mtimeMs,
            modifiedTime: stats.mtime.toISOString()
          };
        });
      res.json(mp3List);
    } catch (e: any) {
      console.error('Failed to read announcements directory:', e);
      res.status(500).json([]);
    }
  };

  app.get('/api/local-mp3s', handleListMediaFiles);
  app.get('/api/media/list', handleListMediaFiles);

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
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
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

      // AI Studio Google Drive Provider
      if (isServerDriveStorageRequest(req)) {
        const folderId = await resolveServerDriveAnnouncementsFolderId(req);
        const cleanName = path.basename(String(file).trim());
        const found = await serverDriveFindFileCaseInsensitive(req, cleanName, folderId);
        if (!found) {
          return res.status(404).json({ error: `File "${cleanName}" not found in Google Drive Media Announcements` });
        }
        const resolvedName = found.name || cleanName;
        const ext = path.extname(resolvedName).toLowerCase();
        const isText = ext === '.txt' || ext === '.md';
        const responseData: any = {
          name: resolvedName,
          id: found.id,
          path: `Google Drive / media_announcements / ${resolvedName}`,
          extension: ext,
          url: isText
            ? `/api/media/stream?path=${encodeURIComponent(resolvedName)}`
            : `/api/media/stream?path=${encodeURIComponent(found.id)}`,
          storageProvider: 'drive'
        };
        if (isText) {
          const mediaRes = await serverDriveFetch(req, `drive/v3/files/${found.id}?alt=media`);
          responseData.content = await mediaRes.text();
        }
        return res.json(responseData);
      }

      // Production Local Filesystem Provider
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);

      let targetFilePath = file;
      if (!fs.existsSync(targetFilePath)) {
        if (!announcementsDir || !fs.existsSync(announcementsDir)) {
          return res.status(404).json({ error: 'Media Announcements folder not defined or offline' });
        }
        targetFilePath = path.join(announcementsDir, path.basename(file));
        if (!fs.existsSync(targetFilePath)) {
          const resolved = findAnnouncementSourceFile(announcementsDir, file);
          if (resolved && fs.existsSync(resolved)) {
            targetFilePath = resolved;
          }
        }
      }

      if (!fs.existsSync(targetFilePath)) {
        return res.status(404).json({ error: 'File not found in Media Announcements directory' });
      }

      const ext = path.extname(file).toLowerCase();
      const isText = ext === '.txt' || ext === '.md';

      const responseData: any = {
        name: file,
        path: targetFilePath,
        extension: ext,
        url: `/api/media/stream?path=${encodeURIComponent(file)}`,
        storageProvider: 'local'
      };

      if (isText) {
        const textContent = fs.readFileSync(targetFilePath, 'utf8');
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
      const stem = existingExt ? safeBase.slice(0, -existingExt.length).trim() : safeBase;
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
      const existingResolved = findAnnouncementSourceFile(announcementsDir, finalFileName);
      if (existingResolved && fs.existsSync(existingResolved)) {
        targetFilePath = existingResolved;
      }

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${finalFileName}" already exists in Media Announcements.`,
          exists: true,
          name: finalFileName
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
      const { sourceFileName, targetFileName, allowOverwrite } = req.body || {};
      const rawSource = String(sourceFileName || '').trim();
      const rawTarget = String(targetFileName || '').trim();
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
        const sourceFile = await serverDriveFindFileCaseInsensitive(req, cleanSource, folderId);
        if (!sourceFile) {
          return res.status(404).json({
            error: `Source file "${cleanSource}" not found in Google Drive Media Announcements`
          });
        }
        const sourceExt = path.extname(sourceFile.name || cleanSource) || path.extname(rawTarget);
        const targetExt = path.extname(safeTargetBase);
        const stem =
          targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
            ? safeTargetBase.slice(0, -targetExt.length).trim()
            : safeTargetBase;
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

      let sourceFilePath = path.join(announcementsDir, path.basename(rawSource));
      if (!fs.existsSync(sourceFilePath)) {
        const resolved = findAnnouncementSourceFile(announcementsDir, rawSource);
        if (resolved && fs.existsSync(resolved)) {
          sourceFilePath = resolved;
        }
      }

      if (!fs.existsSync(sourceFilePath)) {
        return res.status(404).json({ error: `Source file "${rawSource}" not found in Media Announcements` });
      }

      const sourceExt = path.extname(sourceFilePath) || path.extname(rawSource);
      const targetExt = path.extname(safeTargetBase);
      const stem =
        targetExt && targetExt.toLowerCase() === sourceExt.toLowerCase()
          ? safeTargetBase.slice(0, -targetExt.length).trim()
          : safeTargetBase;
      if (!stem) {
        return res.status(400).json({ error: 'Target filename stem cannot be empty' });
      }

      const finalFileName = `${stem}${sourceExt}`;
      let targetFilePath = path.join(announcementsDir, finalFileName);
      const existingResolved = findAnnouncementSourceFile(announcementsDir, finalFileName);
      if (existingResolved && fs.existsSync(existingResolved)) {
        targetFilePath = existingResolved;
      }

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

      const stem = safeBase.slice(0, -ext.length).trim();
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
      const existingResolved = findAnnouncementSourceFile(announcementsDir, finalFileName);
      if (existingResolved && fs.existsSync(existingResolved)) {
        targetFilePath = existingResolved;
      }

      if (fs.existsSync(targetFilePath) && !allowOverwrite) {
        return res.status(409).json({
          error: `A file named "${finalFileName}" already exists in Media Announcements.`,
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

      // AI Studio Google Drive Provider
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

      // Production Local Filesystem Provider
      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!announcementsDir) {
        return res.status(400).json({ error: 'Media Announcements folder is not configured or offline' });
      }
      if (!fs.existsSync(announcementsDir)) {
        fs.mkdirSync(announcementsDir, { recursive: true });
      }

      let sourceFilePath = path.join(announcementsDir, path.basename(rawSource));
      if (!fs.existsSync(sourceFilePath)) {
        const resolved = findAnnouncementSourceFile(announcementsDir, rawSource);
        if (resolved && fs.existsSync(resolved)) {
          sourceFilePath = resolved;
        }
      }

      const hasSourceOnDisk = fs.existsSync(sourceFilePath);
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

      if (cleanSourceName.toLowerCase() === finalFileName.toLowerCase()) {
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

      let targetFilePath = path.join(announcementsDir, finalFileName);
      const existingResolved = findAnnouncementSourceFile(announcementsDir, finalFileName);
      if (existingResolved && fs.existsSync(existingResolved)) {
        targetFilePath = existingResolved;
      }

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
