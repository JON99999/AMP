import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  Announcement,
  LogEntry,
  Show,
  LocationPathsOverride,
  LocationSettings,
  MediaAssetFile,
} from '../types';
import {
  extractAudioMetadataBytes,
  normalizeAnnouncements,
  isAudioFile
} from './utils';
import {
  CURRENT_APP_VERSION,
  DataMetaHeader
} from './compatibility';
import {
  mp3BlobCache,
  rawBlobCache,
  mp3MetadataCache,
  mp3DurationCache,
  mp3WaveformCache,
  availableFilesCache,
  pendingAudioFetches,
  driveFileNameCache,
  CachingProgressReport,
  clearAudioCache,
  upsertMediaCatalogFile,
  syncMediaCatalogFiles,
  mediaCatalogStore,
} from './audioCache';
import firebaseConfig from '../../firebase-applet-config.json';

export {
  mp3BlobCache,
  rawBlobCache,
  mp3MetadataCache,
  mp3DurationCache,
  mp3WaveformCache,
  availableFilesCache,
  driveFileNameCache,
  clearAudioCache,
  upsertMediaCatalogFile,
  syncMediaCatalogFiles,
  mediaCatalogStore,
};
export type { CachingProgressReport, LocationPathsOverride, LocationSettings, MediaAssetFile };

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
// Required Scope for reading and writing files in Drive
provider.addScope('https://www.googleapis.com/auth/drive');

let cachedAccessToken: string | null = (typeof window !== 'undefined')
  ? (sessionStorage.getItem('amp_drive_token') || localStorage.getItem('amp_override_token'))
  : null;
let cachedRefreshToken: string | null = (typeof window !== 'undefined')
  ? localStorage.getItem('amp_refresh_token')
  : null;
let cachedTokenExpiresAt: number | null = (typeof window !== 'undefined' && localStorage.getItem('amp_token_expires_at'))
  ? Number(localStorage.getItem('amp_token_expires_at'))
  : null;
let currentAuthUser: any = null;
let isSigningIn = false;
let activeRefreshPromise: Promise<string | null> | null = null;
let backgroundRefreshTimer: any = null;

export const isElectronEnv = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!window.electronAPI || (navigator && navigator.userAgent && navigator.userAgent.includes('Electron'));
};

export const DEFAULT_SETTINGS: LocationSettings = {
  mode: isElectronEnv() ? 'Local' : 'Drive',
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
    showsFile: null,
  },
  localPathMP3s: '',
  localPathLogs: '',
  localPathCalendar: '',
  driveFolderLogs: '',
  driveFolderMP3s: '',
  driveFolderPreferences: '',
  driveFolderAnnouncements: '',
  driveFolderEvergreens: '',
  driveFolderShows: '',
};

export interface EffectiveLocalPaths {
  localPathAmp: string;
  mediaAnnouncements: string;
  mediaEvergreens: string;
  mediaShows: string;
  settingsDir: string;
  logsDir: string;
  hasValidLocalConfig: boolean;
  hasAnyConfiguredPath: boolean;
}

/**
 * Centralizes resolution of canonical unified paths and legacy v0.14–v0.15 triple-folder
 * fallback fields (`localPathMP3s`, `localPathCalendar`, `localPathLogs`).
 */
export function resolveEffectiveLocalPaths(
  settings?: Partial<LocationSettings> | null
): EffectiveLocalPaths {
  const s = settings || {};
  const localPathAmp = s.localPathAmp || '';
  const mediaAnnouncements =
    s.paths?.media_announcements || s.localPathMediaAnnouncements || s.localPathMP3s || '';
  const mediaEvergreens =
    s.paths?.media_evergreens || s.localPathMediaEvergreens || '';
  const mediaShows =
    s.paths?.media_shows || s.localPathMediaShows || '';
  const settingsDir =
    s.localPathCalendar || s.paths?.settings || '';
  const logsDir =
    s.localPathLogs || s.paths?.logs || '';
  const hasValidLocalConfig =
    Boolean(localPathAmp) ||
    (Boolean(mediaAnnouncements) && Boolean(logsDir) && Boolean(settingsDir));
  const hasAnyConfiguredPath =
    Boolean(localPathAmp) ||
    Boolean(mediaAnnouncements) ||
    Boolean(logsDir) ||
    Boolean(settingsDir);

  return {
    localPathAmp,
    mediaAnnouncements,
    mediaEvergreens,
    mediaShows,
    settingsDir,
    logsDir,
    hasValidLocalConfig,
    hasAnyConfiguredPath,
  };
}

export const getSavedSettings = (): LocationSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem('amp_location_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: LocationSettings) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('amp_location_settings', JSON.stringify(settings));
};

// Folders
export const DRIVE_FOLDERS = {
  get amp() {
    const settings = getSavedSettings();
    return settings.driveFolderAmp || '';
  },
  get logs() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx';
    return settings.driveFolderLogs || '';
  },
  get mp3s() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
    return settings.driveFolderAnnouncements || settings.driveFolderMP3s || '';
  },
  get announcements() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
    return settings.driveFolderAnnouncements || settings.driveFolderMP3s || '';
  },
  get evergreens() {
    const settings = getSavedSettings();
    return settings.driveFolderEvergreens || '';
  },
  get shows() {
    const settings = getSavedSettings();
    return settings.driveFolderShows || '';
  },
  get preferences() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED';
    return settings.driveFolderPreferences || '';
  }
};

export const getRefreshToken = (): string | null => {
  return cachedRefreshToken;
};

export const setRefreshToken = (refreshToken: string | null, expiresAt?: number | null) => {
  cachedRefreshToken = refreshToken ? refreshToken.trim() : null;
  if (expiresAt !== undefined) {
    cachedTokenExpiresAt = expiresAt;
  }
  if (typeof window !== 'undefined') {
    if (cachedRefreshToken) {
      localStorage.setItem('amp_refresh_token', cachedRefreshToken);
    } else {
      localStorage.removeItem('amp_refresh_token');
    }
    if (cachedTokenExpiresAt) {
      localStorage.setItem('amp_token_expires_at', String(cachedTokenExpiresAt));
    } else if (expiresAt === null) {
      localStorage.removeItem('amp_token_expires_at');
    }
  }
};

export const syncAuthSessionToServer = async (params: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  userProfile?: any;
  clear?: boolean;
}) => {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/save-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  } catch (e) {
    // Non-fatal if server is unreachable
  }
};

export const getPlaygroundDirectConsentUrl = (): string => {
  return 'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fdevelopers.google.com%2Foauthplayground&prompt=consent&response_type=code&client_id=407408718192.apps.googleusercontent.com&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&access_type=offline&include_granted_scopes=false';
};

export const parseAndExtractAuthTokens = (rawInput: string): {
  accessToken: string | null;
  refreshToken: string | null;
  authCode: string | null;
  expiresIn: number | null;
} => {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return { accessToken: null, refreshToken: null, authCode: null, expiresIn: null };

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let authCode: string | null = null;
  let expiresIn: number | null = null;

  if (trimmed.includes('code=') && (trimmed.startsWith('http') || trimmed.includes('oauthplayground') || trimmed.includes('scope='))) {
    try {
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.local/?${trimmed}`);
      const c = urlObj.searchParams.get('code');
      if (c) {
        authCode = c.trim();
        return { accessToken: null, refreshToken: null, authCode, expiresIn: null };
      }
    } catch {
      const m = trimmed.match(/[?&]code=([^&#\s]+)/);
      if (m && m[1]) {
        try {
          authCode = decodeURIComponent(m[1]).trim();
        } catch {
          authCode = m[1].trim();
        }
        return { accessToken: null, refreshToken: null, authCode, expiresIn: null };
      }
    }
  }

  if (trimmed.includes('{') || trimmed.includes('access_token') || trimmed.includes('refresh_token')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.access_token && typeof parsed.access_token === 'string') {
        accessToken = parsed.access_token.trim();
      }
      if (parsed.refresh_token && typeof parsed.refresh_token === 'string') {
        refreshToken = parsed.refresh_token.trim();
      }
      if (typeof parsed.expires_in === 'number') {
        expiresIn = parsed.expires_in;
      }
    } catch {
      const mAccess = trimmed.match(/"access_token"\s*:\s*"([^"]+)"/);
      if (mAccess && mAccess[1]) accessToken = mAccess[1].trim();
      const mRefresh = trimmed.match(/"refresh_token"\s*:\s*"([^"]+)"/);
      if (mRefresh && mRefresh[1]) refreshToken = mRefresh[1].trim();
      const mExpires = trimmed.match(/"expires_in"\s*:\s*(\d+)/);
      if (mExpires && mExpires[1]) expiresIn = parseInt(mExpires[1], 10);
    }
  }

  if (!accessToken && !refreshToken && !authCode) {
    let clean = trimmed.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
    if (clean.startsWith('4%2F') || clean.startsWith('4/')) {
      try {
        if (clean.startsWith('4%2F')) clean = decodeURIComponent(clean);
      } catch {}
      authCode = clean;
    } else if (clean.startsWith('1//')) {
      refreshToken = clean;
    } else {
      accessToken = clean;
    }
  }

  return { accessToken, refreshToken, authCode, expiresIn };
};

export const exchangePlaygroundAuthCode = async (authCode: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}> => {
  const res = await fetch('/api/auth/exchange-playground-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: authCode.trim() })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success || !data?.accessToken) {
    throw new Error(
      data?.error ||
        'Could not exchange the authorization code for tokens. Authorization codes are single-use; if you already clicked "Exchange authorization code for tokens" in OAuth Playground, paste the Step 2 JSON response instead.'
    );
  }
  const expiresAt = data.expiresAt || (Date.now() + 3599 * 1000);
  setOverrideAccessToken(data.accessToken);
  if (data.refreshToken) {
    setRefreshToken(data.refreshToken, expiresAt);
  }
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || null,
    expiresAt
  };
};

export const refreshAccessTokenSilently = async (overrideRefreshToken?: string): Promise<string | null> => {
  const targetRefresh = (overrideRefreshToken || cachedRefreshToken || '').trim();
  if (!targetRefresh) return null;

  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh-playground-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: targetRefresh })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Silent token refresh failed:', errData.error || res.statusText);
        return null;
      }
      const data = await res.json();
      if (data && data.success && data.accessToken) {
        setOverrideAccessToken(data.accessToken);
        setRefreshToken(targetRefresh, data.expiresAt || (Date.now() + 3599 * 1000));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('amp-token-refreshed', {
            detail: { token: data.accessToken, expiresAt: data.expiresAt }
          }));
        }
        return data.accessToken as string;
      }
      return null;
    } catch (e) {
      console.warn('Silent token refresh network error:', e);
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
};

export const ensureValidAccessToken = async (): Promise<string | null> => {
  const now = Date.now();
  const isNearExpiry = cachedTokenExpiresAt ? (now >= cachedTokenExpiresAt - 3 * 60 * 1000) : false;

  if (cachedAccessToken && !isNearExpiry) {
    return cachedAccessToken;
  }

  if (cachedRefreshToken) {
    const refreshed = await refreshAccessTokenSilently(cachedRefreshToken);
    if (refreshed) return refreshed;
  }

  return cachedAccessToken;
};

const fetchUserProfileWithToken = async (tokenStr: string): Promise<{ email: string; displayName: string } | null> => {
  try {
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user&supportsAllDrives=true', {
      headers: { 'Authorization': `Bearer ${tokenStr}` }
    });
    if (!aboutRes.ok) {
      return null;
    }
    const aboutData = await aboutRes.json().catch(() => ({}));
    if (aboutData?.user?.emailAddress) {
      return {
        email: aboutData.user.emailAddress,
        displayName: aboutData.user.displayName || 'Authorized User'
      };
    }

    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenStr}` }
    });
    if (res.ok) {
      const data = await res.json();
      return {
        email: data.email || 'authorized-device@amp.local',
        displayName: data.name || 'Authorized User'
      };
    }
    return {
      email: 'authorized-device@amp.local',
      displayName: 'Authorized User'
    };
  } catch {
    return null;
  }
};

// Listen to Auth changes & restore persistent session
export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (typeof window !== 'undefined') {
    if (backgroundRefreshTimer) {
      clearInterval(backgroundRefreshTimer);
    }
    backgroundRefreshTimer = setInterval(() => {
      if (cachedRefreshToken) {
        refreshAccessTokenSilently(cachedRefreshToken);
      }
    }, 45 * 60 * 1000);

    (async () => {
      let savedToken = cachedAccessToken || localStorage.getItem('amp_override_token');
      let savedRefresh = cachedRefreshToken || localStorage.getItem('amp_refresh_token');
      let savedExpiresAt = cachedTokenExpiresAt || (localStorage.getItem('amp_token_expires_at') ? Number(localStorage.getItem('amp_token_expires_at')) : null);
      const savedUserJson = localStorage.getItem('amp_user_profile');
      let parsedUser: any = null;

      if (savedUserJson) {
        try {
          parsedUser = JSON.parse(savedUserJson);
        } catch (e) {}
      }

      if (!savedToken && !savedRefresh) {
        try {
          const sessionRes = await fetch('/api/auth/session');
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            const gAuth = sessionData?.googleAuth;
            if (gAuth) {
              if (gAuth.accessToken) savedToken = gAuth.accessToken;
              if (gAuth.refreshToken) savedRefresh = gAuth.refreshToken;
              if (gAuth.expiresAt) savedExpiresAt = gAuth.expiresAt;
              if (gAuth.userProfile && !parsedUser) parsedUser = gAuth.userProfile;
            }
          }
        } catch (e) {}
      } else if (!savedRefresh) {
        try {
          const sessionRes = await fetch('/api/auth/session');
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            if (sessionData?.googleAuth?.refreshToken) {
              savedRefresh = sessionData.googleAuth.refreshToken;
            }
          }
        } catch (e) {}
      }

      if (savedRefresh) {
        setRefreshToken(savedRefresh, savedExpiresAt);
      }

      const isExpired = savedExpiresAt ? (Date.now() >= savedExpiresAt - 2 * 60 * 1000) : false;
      if ((!savedToken || isExpired) && savedRefresh) {
        const refreshed = await refreshAccessTokenSilently(savedRefresh);
        if (refreshed) {
          savedToken = refreshed;
        }
      }

      if (savedToken) {
        setOverrideAccessToken(savedToken);
        let profile = await fetchUserProfileWithToken(savedToken);
        if (!profile && savedRefresh) {
          const refreshed = await refreshAccessTokenSilently(savedRefresh);
          if (refreshed) {
            savedToken = refreshed;
            profile = await fetchUserProfileWithToken(savedToken);
          }
        }

        if (profile && savedToken) {
          currentAuthUser = profile;
          localStorage.setItem('amp_user_profile', JSON.stringify(profile));
          syncAuthSessionToServer({
            accessToken: savedToken,
            refreshToken: savedRefresh || cachedRefreshToken,
            expiresAt: cachedTokenExpiresAt,
            userProfile: profile
          });
          if (onAuthSuccess) {
            onAuthSuccess(profile, savedToken);
          }
          return;
        } else if (!savedRefresh) {
          setOverrideAccessToken(null);
          syncAuthSessionToServer({ clear: true });
        }
      }

      if (onAuthFailure) onAuthFailure();
    })();
  } else {
    if (onAuthFailure) onAuthFailure();
  }

  return () => {
    if (backgroundRefreshTimer) {
      clearInterval(backgroundRefreshTimer);
      backgroundRefreshTimer = null;
    }
  };
};

export const googleSignIn = async (): Promise<{ user: any; accessToken: string } | null> => {
  if (isSigningIn) return null;
  isSigningIn = true;
  try {
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error('Google Sign-In succeeded, but no Drive OAuth access token was returned.');
    }
    const userObj = {
      email: result.user?.email || 'authorized-user@amp.local',
      displayName: result.user?.displayName || 'Google User'
    };
    currentAuthUser = userObj;
    const expiresAt = Date.now() + 3550 * 1000;
    setOverrideAccessToken(accessToken);
    if (typeof window !== 'undefined') {
      localStorage.setItem('amp_user_profile', JSON.stringify(userObj));
      localStorage.setItem('amp_token_expires_at', String(expiresAt));
    }
    cachedTokenExpiresAt = expiresAt;
    await syncAuthSessionToServer({
      accessToken,
      expiresAt,
      userProfile: userObj
    });
    return { user: userObj, accessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setOverrideAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('amp_drive_token', token);
      localStorage.setItem('amp_override_token', token);
    } else {
      sessionStorage.removeItem('amp_drive_token');
      localStorage.removeItem('amp_override_token');
      localStorage.removeItem('amp_user_profile');
    }
  }
};

export const getCurrentUser = (): any => {
  return currentAuthUser;
};

export const handleLogout = async () => {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedTokenExpiresAt = null;
  currentAuthUser = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('amp_drive_token');
    localStorage.removeItem('amp_override_token');
    localStorage.removeItem('amp_refresh_token');
    localStorage.removeItem('amp_token_expires_at');
    localStorage.removeItem('amp_user_profile');
  }
  await syncAuthSessionToServer({ clear: true });
  try {
    await signOut(auth);
  } catch (e) {}
  clearAudioCache();
};

/**
 * Builds request headers for unified `/api/*` storage routes so the server
 * can route cleanly between the Local `fs` provider (Desktop App) and the
 * Google Drive provider (AI Studio Test Harness) without component-level branching.
 */
export const getStorageApiHeaders = async (
  extraHeaders: Record<string, string> = {},
  explicitMode?: 'Local' | 'Drive' | 'Demo'
): Promise<Record<string, string>> => {
  const settings = getSavedSettings();
  const mode = explicitMode || settings.mode || 'Local';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
    'x-amp-storage-mode': mode
  };

  if (mode === 'Drive' || (mode === 'Demo' && DRIVE_FOLDERS.amp)) {
    const token = await ensureValidAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (DRIVE_FOLDERS.amp) {
      headers['x-amp-drive-folder-amp'] = DRIVE_FOLDERS.amp;
    }
    if (DRIVE_FOLDERS.announcements) {
      headers['x-amp-drive-folder-announcements'] = DRIVE_FOLDERS.announcements;
    }
    if (DRIVE_FOLDERS.preferences) {
      headers['x-amp-drive-folder-preferences'] = DRIVE_FOLDERS.preferences;
    }
    if (DRIVE_FOLDERS.logs) {
      headers['x-amp-drive-folder-logs'] = DRIVE_FOLDERS.logs;
    }
    if (DRIVE_FOLDERS.evergreens) {
      headers['x-amp-drive-folder-evergreens'] = DRIVE_FOLDERS.evergreens;
    }
    if (DRIVE_FOLDERS.shows) {
      headers['x-amp-drive-folder-shows'] = DRIVE_FOLDERS.shows;
    }
  }

  return headers;
};

export const extractWaveformForUrl = async (url: string, sourceUrlOrBlob?: string | Blob): Promise<number[]> => {
  if (!url) return [];
  const fileInCache = availableFilesCache.get(url);
  const resolvedUrl = fileInCache?.path || url;
  const mappedFileName = driveFileNameCache.get(url) || driveFileNameCache.get(resolvedUrl);

  if (!isAudioFile(url) && !isAudioFile(resolvedUrl) && !(mappedFileName && isAudioFile(mappedFileName))) {
    return [];
  }

  const existingPeaks =
    mp3WaveformCache.get(url) ||
    mp3WaveformCache.get(resolvedUrl) ||
    (mappedFileName ? mp3WaveformCache.get(mappedFileName) : undefined);
  if (existingPeaks && existingPeaks.length > 0) {
    mp3WaveformCache.set(url, existingPeaks);
    mp3WaveformCache.set(resolvedUrl, existingPeaks);
    if (mappedFileName) mp3WaveformCache.set(mappedFileName, existingPeaks);
    return existingPeaks;
  }
  if (typeof window === 'undefined') return [];

  try {
    let arrayBuffer: ArrayBuffer | null = null;
    const cachedBlob =
      rawBlobCache.get(url) ||
      rawBlobCache.get(resolvedUrl) ||
      (mappedFileName ? rawBlobCache.get(mappedFileName) : undefined);
    if (cachedBlob) {
      arrayBuffer = await cachedBlob.arrayBuffer();
    } else if (sourceUrlOrBlob instanceof Blob) {
      arrayBuffer = await sourceUrlOrBlob.arrayBuffer();
    } else if (typeof sourceUrlOrBlob === 'string') {
      const targetUrl = mp3BlobCache.get(sourceUrlOrBlob) || getPlayableUrl(sourceUrlOrBlob) || sourceUrlOrBlob;
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token && targetUrl.includes('googleapis.com')) {
        headers.Authorization = `Bearer ${token}`;
      }
      const resp = await fetch(targetUrl, { headers });
      if (resp.ok) {
        const blob = await resp.blob();
        arrayBuffer = await blob.arrayBuffer();
      }
    } else {
      const cacheKey = mappedFileName || url;
      await cacheMP3(cacheKey, getAccessToken() || '');
      const newlyCachedBlob =
        rawBlobCache.get(url) ||
        rawBlobCache.get(resolvedUrl) ||
        (mappedFileName ? rawBlobCache.get(mappedFileName) : undefined);
      if (newlyCachedBlob) {
        arrayBuffer = await newlyCachedBlob.arrayBuffer();
      } else {
        const playable = mp3BlobCache.get(url) || mp3BlobCache.get(resolvedUrl) || getPlayableUrl(resolvedUrl) || getPlayableUrl(url);
        if (playable) {
          try {
            const token = getAccessToken();
            const headers: Record<string, string> = {};
            if (token && playable.includes('googleapis.com')) {
              headers.Authorization = `Bearer ${token}`;
            }
            const resp = await fetch(playable, { headers });
            if (resp.ok) {
              const blob = await resp.blob();
              arrayBuffer = await blob.arrayBuffer();
            }
          } catch (_) {}
        }
      }
    }

    if (!arrayBuffer) return [];

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return [];
    const audioCtx = new AudioCtx();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const durationSec = audioBuffer.duration;
    if (durationSec && !isNaN(durationSec) && durationSec !== Infinity && durationSec > 0) {
      const minutes = Math.floor(durationSec / 60);
      const seconds = Math.floor(durationSec % 60);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      mp3DurationCache.set(url, formatted);
      mp3DurationCache.set(resolvedUrl, formatted);
      if (mappedFileName) mp3DurationCache.set(mappedFileName, formatted);
      window.dispatchEvent(new CustomEvent('mp3-duration-cached', {
        detail: { url, resolvedUrl, fileName: mappedFileName, duration: formatted }
      }));
    }

    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const numBars = 60;
    const samplesPerBar = Math.floor(totalSamples / numBars);
    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      let max = 0;
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, totalSamples);
      const step = Math.max(1, Math.floor((end - start) / 80));
      for (let j = start; j < end; j += step) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    const maxPeak = Math.max(...peaks, 0.001);
    const normalized = peaks.map(p => Math.max(0.15, Math.min(1.0, p / maxPeak)));

    mp3WaveformCache.set(url, normalized);
    mp3WaveformCache.set(resolvedUrl, normalized);
    if (mappedFileName) mp3WaveformCache.set(mappedFileName, normalized);
    try { audioCtx.close(); } catch (e) {}

    window.dispatchEvent(new CustomEvent('mp3-waveform-cached', {
      detail: { url, resolvedUrl, fileName: mappedFileName, peaks: normalized }
    }));

    return normalized;
  } catch (err) {
    console.warn(`Could not extract waveform for ${url}:`, err);
    return [];
  }
};

export const calculateDurationForUrl = (url: string, sourceUrl: string) => {
  if (!url) return;
  const fileInCache = availableFilesCache.get(url);
  const resolvedUrl = fileInCache?.path || url;
  const mappedFileName = driveFileNameCache.get(url) || driveFileNameCache.get(resolvedUrl);

  if (!isAudioFile(url) && !isAudioFile(resolvedUrl) && !(mappedFileName && isAudioFile(mappedFileName))) return;
  const existingDur =
    mp3DurationCache.get(url) ||
    mp3DurationCache.get(resolvedUrl) ||
    (mappedFileName ? mp3DurationCache.get(mappedFileName) : undefined);
  if (existingDur) {
    mp3DurationCache.set(url, existingDur);
    mp3DurationCache.set(resolvedUrl, existingDur);
    if (mappedFileName) mp3DurationCache.set(mappedFileName, existingDur);
    return;
  }

  if (typeof window === 'undefined') return;

  const audio = new Audio();
  audio.src = sourceUrl;
  audio.addEventListener('loadedmetadata', () => {
    const durationSec = audio.duration;
    if (durationSec && !isNaN(durationSec) && durationSec !== Infinity) {
      const minutes = Math.floor(durationSec / 60);
      const seconds = Math.floor(durationSec % 60);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      mp3DurationCache.set(url, formatted);
      mp3DurationCache.set(resolvedUrl, formatted);
      if (mappedFileName) mp3DurationCache.set(mappedFileName, formatted);
      window.dispatchEvent(new CustomEvent('mp3-duration-cached', {
        detail: { url, resolvedUrl, fileName: mappedFileName, duration: formatted }
      }));
    }
  });
  audio.addEventListener('error', (err) => {
    console.warn(`Could not load audio metadata for calculating duration: ${url}`, err);
  });
};

/**
 * Download an MP3 from Drive or Local into memory cache and parse ID3 metadata simultaneously
 */
export const cacheMP3 = async (url: string, token: string): Promise<string> => {
  let resolvedUrl = url;
  const fileInCache = availableFilesCache.get(url);
  if (fileInCache) {
    resolvedUrl = fileInCache.path;
  }

  if (/^[a-zA-Z0-9_-]{25,50}$/.test(resolvedUrl)) {
    resolvedUrl = `https://www.googleapis.com/drive/v3/files/${resolvedUrl}?alt=media`;
  }

  if (mp3BlobCache.has(resolvedUrl)) {
    return mp3BlobCache.get(resolvedUrl)!;
  }
  if (mp3BlobCache.has(url)) {
    return mp3BlobCache.get(url)!;
  }

  if (pendingAudioFetches.has(resolvedUrl)) {
    return pendingAudioFetches.get(resolvedUrl)!;
  }

  const isDriveUrl = resolvedUrl.includes('googleapis.com') || resolvedUrl.includes('drive.google.com');
  const isAudio = isAudioFile(resolvedUrl) || isAudioFile(url);

  const headers: HeadersInit = {};
  if (isDriveUrl) {
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      throw new Error(`Google Drive token is required to fetch Drive file: ${resolvedUrl}`);
    }
  }

  const fetchPromise = (async () => {
    try {
      if (isDriveUrl) {
        const freshToken = await ensureValidAccessToken();
        const activeBearer = freshToken || token;
        if (activeBearer) {
          headers['Authorization'] = `Bearer ${activeBearer}`;
        }
      }
      let res = await fetch(resolvedUrl, { headers });
      if (isDriveUrl && res.status === 401 && cachedRefreshToken) {
        const refreshed = await refreshAccessTokenSilently(cachedRefreshToken);
        if (refreshed) {
          headers['Authorization'] = `Bearer ${refreshed}`;
          res = await fetch(resolvedUrl, { headers });
        }
      }
      if (!res.ok) throw new Error(`Failed to fetch MP3 from url: ${res.statusText}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      mp3BlobCache.set(resolvedUrl, blobUrl);
      mp3BlobCache.set(url, blobUrl);
      rawBlobCache.set(resolvedUrl, blob);
      rawBlobCache.set(url, blob);

      if (isAudio) {
        calculateDurationForUrl(url, blobUrl);
        calculateDurationForUrl(resolvedUrl, blobUrl);

        try {
          await extractWaveformForUrl(url, blob);
          await extractWaveformForUrl(resolvedUrl, blob);
        } catch (e) {
          console.warn('Waveform analysis failed during caching', e);
        }

        try {
          const arrayBuf = await blob.arrayBuffer();
          const meta = extractAudioMetadataBytes(new Uint8Array(arrayBuf), resolvedUrl);
          if (meta && (meta.title || meta.artist || meta.albumArtist || meta.album)) {
            mp3MetadataCache.set(resolvedUrl, meta);
            mp3MetadataCache.set(url, meta);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('mp3-metadata-loaded', {
                detail: { url, resolvedUrl, meta }
              }));
            }
          }
        } catch (_) {}
      }

      return blobUrl;
    } catch (err) {
      console.error(`Error caching MP3 (${url}):`, err);
      if (!isDriveUrl) {
        if (isAudio) {
          calculateDurationForUrl(url, resolvedUrl);
        }
        return resolvedUrl;
      }
      throw err;
    } finally {
      pendingAudioFetches.delete(resolvedUrl);
    }
  })();

  pendingAudioFetches.set(resolvedUrl, fetchPromise);
  return fetchPromise;
};

/**
 * Clean up the audio memory cache by revoking files that are no longer part of active schedules,
 * and pre-cache new URLs with detailed progress reporting.
 */
export const updateAudioCacheWithProgress = async (
  activeUrls: string[],
  token: string | null,
  onProgress?: (report: CachingProgressReport) => void
): Promise<CachingProgressReport> => {
  const resolvedActiveUrls = activeUrls.map(url => {
    const file = availableFilesCache.get(url);
    return file ? file.path : url;
  });

  const uniqueActiveUrls = Array.from(new Set(activeUrls));
  let completed = 0;
  let failed = 0;
  const errors: Array<{ url: string; fileName?: string; error: string }> = [];

  const reportProgress = (isComplete = false) => {
    if (onProgress) {
      onProgress({
        total: uniqueActiveUrls.length,
        completed,
        failed,
        errors,
        isComplete
      });
    }
  };

  reportProgress(false);

  if (uniqueActiveUrls.length > 0) {
    await Promise.all(
      uniqueActiveUrls.map(async (url) => {
        const file = availableFilesCache.get(url);
        const resolvedUrl = file ? file.path : url;
        const fileName = file ? file.path : (driveFileNameCache.get(url) || url.split('/').pop() || url);

        if (mp3BlobCache.has(resolvedUrl)) {
          completed++;
          reportProgress(false);
          return;
        }

        try {
          await cacheMP3(url, token || '');
          completed++;
        } catch (err: any) {
          failed++;
          errors.push({
            url,
            fileName,
            error: err?.message || 'Failed to download audio file'
          });
        }
        reportProgress(false);
      })
    );
  }

  const activeSet = new Set([...activeUrls, ...resolvedActiveUrls]);

  for (const cachedUrl of Array.from(mp3BlobCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      const blobUrl = mp3BlobCache.get(cachedUrl);
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (e) {
          console.warn('Revoke error:', e);
        }
      }
      mp3BlobCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(rawBlobCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      rawBlobCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3MetadataCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3MetadataCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3DurationCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3DurationCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3WaveformCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3WaveformCache.delete(cachedUrl);
    }
  }

  const finalReport = {
    total: uniqueActiveUrls.length,
    completed,
    failed,
    errors,
    isComplete: true
  };
  reportProgress(true);
  return finalReport;
};

export const updateAudioCache = async (activeUrls: string[], token: string | null) => {
  return updateAudioCacheWithProgress(activeUrls, token);
};

/**
 * Prepare and cache context for a specific show on-demand (Prerecord / Export / Playlist)
 */
export const prepareShowContext = async (params: {
  showId: string;
  showName?: string;
  showNameShort?: string;
  context?: 'Prerecord' | 'Export' | 'Playlist';
  folderType?: 'Playlists' | 'Evergreens';
}): Promise<{
  success: boolean;
  context: any;
  totalTracks: number;
  totalDurationSeconds: number;
}> => {
  try {
    const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/shows/${encodeURIComponent(params.showId)}/prepare-context`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to prepare show context');
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error preparing show context:', err);
    throw err;
  }
};

/**
 * Clear the server-side show context and release memory
 */
export const clearShowContext = async (showId?: string): Promise<void> => {
  try {
    const endpoint = showId ? `/api/shows/${encodeURIComponent(showId)}/clear-context` : '/api/shows/clear-context';
    await fetch(endpoint, { method: 'POST' });
  } catch (err) {
    console.warn('Error clearing show context:', err);
  }
};

/**
 * Get the currently active prepared show context
 */
export const getActiveShowContext = async (): Promise<any> => {
  try {
    const res = await fetch('/api/shows/active-context');
    if (!res.ok) return null;
    const data = await res.json();
    return data.context || null;
  } catch (err) {
    return null;
  }
};

// ============================================================================
// Unified Server-Backed Storage Functions (#33)
// All CRUD, Schema Upgrade, Backup, Evergreen, Show Discovery, and Playlist
// operations delegate to `/api/*` using `getStorageApiHeaders()`.
// ============================================================================

export const loadCalendarFromDrive = async (): Promise<Announcement[]> => {
  const headers = await getStorageApiHeaders({}, 'Drive');
  const res = await fetch('/api/announcements', { headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load announcements from Google Drive');
  }
  const data = await res.json();
  const rawList = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
  return normalizeAnnouncements(rawList);
};

export const saveCalendarToDrive = async (schedules: Announcement[]): Promise<void> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/announcements', {
    method: 'POST',
    headers,
    body: JSON.stringify(schedules)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save announcements to Google Drive');
  }
};

export const loadShowsFromDrive = async (): Promise<Show[]> => {
  const headers = await getStorageApiHeaders({}, 'Drive');
  const res = await fetch('/api/shows', { headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load shows from Google Drive');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
};

export const saveShowsToDrive = async (
  shows: Show[],
  explicitStationTimezone?: string,
  explicitAdminContactInfo?: string,
  explicitUpNextPromo?: { enabled: boolean; minutesBefore: number },
  explicitScheduleWindow?: { windowBeforeMinutes: number; windowAfterMinutes: number; showLookaroundHours: number }
): Promise<void> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/shows', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: shows,
      ...(explicitStationTimezone ? { stationTimezone: explicitStationTimezone } : {}),
      ...(explicitAdminContactInfo !== undefined ? { adminContactInfo: explicitAdminContactInfo } : {}),
      ...(explicitUpNextPromo !== undefined ? { upNextPromo: explicitUpNextPromo } : {}),
      ...(explicitScheduleWindow !== undefined ? { scheduleWindow: explicitScheduleWindow } : {})
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to save shows to Google Drive');
  }
};

export const upgradeDriveDataSchema = async (): Promise<{
  success: boolean;
  announcements: Announcement[];
  shows: Show[];
  logs?: LogEntry[];
  meta: DataMetaHeader;
}> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/compatibility/upgrade', {
    method: 'POST',
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to upgrade Google Drive data schema');
  }
  return {
    success: true,
    announcements: data.announcements || [],
    shows: data.shows || [],
    logs: data.logs,
    meta: data.meta
  };
};

export const loadLogsFromDrive = async (): Promise<LogEntry[]> => {
  const headers = await getStorageApiHeaders({}, 'Drive');
  const res = await fetch('/api/logs', { headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load logs from Google Drive');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const appendLogToDrive = async (entry: LogEntry): Promise<LogEntry[]> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/logs', {
    method: 'POST',
    headers,
    body: JSON.stringify(entry)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to append log to Google Drive');
  }
  return Array.isArray(data?.logs) ? data.logs : [];
};

export const triggerDriveBackup = async (appMode?: string): Promise<void> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/trigger-backup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ workstationMode: appMode || 'DRIVE' })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to trigger Google Drive backup');
  }
};

export type DriveMP3 = MediaAssetFile & {
  size: string;
  duration: string;
};

export const listMP3sFromDrive = async (): Promise<DriveMP3[]> => {
  try {
    const headers = await getStorageApiHeaders({}, 'Drive');
    const res = await fetch('/api/local-mp3s', { headers });
    if (!res.ok) return [];
    const list: DriveMP3[] = await res.json().catch(() => []);
    if (!Array.isArray(list)) return [];
    syncMediaCatalogFiles(list);
    return list;
  } catch (err) {
    console.error('Error listing MP3s from Google Drive Announcements folder:', err);
    return [];
  }
};

/**
 * Resolves a URL to a playable one, utilizing the cache or attaching the token if needed
 */
export const getPlayableUrl = (url: string | undefined): string => {
  if (!url) return '';

  let resolvedUrl = url;
  const fileInCache = availableFilesCache.get(url);
  if (fileInCache && fileInCache.path) {
    resolvedUrl = fileInCache.path;
  }

  if (mp3BlobCache.has(resolvedUrl)) {
    return mp3BlobCache.get(resolvedUrl)!;
  }
  if (mp3BlobCache.has(url)) {
    return mp3BlobCache.get(url)!;
  }

  if (/^[a-zA-Z0-9_-]{25,50}$/.test(resolvedUrl)) {
    resolvedUrl = `https://www.googleapis.com/drive/v3/files/${resolvedUrl}?alt=media`;
  }

  const token = getAccessToken();
  if (resolvedUrl.includes('googleapis.com') && token) {
    return `${resolvedUrl}&access_token=${token}`;
  }
  if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://') && !resolvedUrl.startsWith('blob:') && !resolvedUrl.startsWith('/api/')) {
    return `/api/media/stream?path=${encodeURIComponent(resolvedUrl)}`;
  }
  return resolvedUrl;
};

export interface DriveValidationResult {
  valid: boolean;
  tokenValid: boolean;
  tokenUser?: { email: string; displayName: string };
  checkedFolders: {
    amp?: { id: string; ok: boolean; status?: number; name?: string };
    preferences?: { id: string; ok: boolean; status?: number; name?: string };
    announcements?: { id: string; ok: boolean; status?: number; name?: string };
    evergreens?: { id: string; ok: boolean; status?: number; name?: string };
    shows?: { id: string; ok: boolean; status?: number; name?: string };
    logs?: { id: string; ok: boolean; status?: number; name?: string };
  };
  errorMessage?: string;
  warningMessage?: string;
}

export const verifyGoogleDriveDetails = async (
  foldersOverride?: Partial<LocationSettings>,
  tokenOverride?: string
): Promise<DriveValidationResult> => {
  let token = tokenOverride || (await ensureValidAccessToken()) || getAccessToken();
  if (!token && cachedRefreshToken) {
    token = await refreshAccessTokenSilently(cachedRefreshToken);
  }
  if (!token) {
    return {
      valid: false,
      tokenValid: false,
      checkedFolders: {},
      errorMessage: 'Missing Google authentication token. Please connect your Google account.'
    };
  }

  const settings = { ...getSavedSettings(), ...(foldersOverride || {}) };
  if (settings.mode === 'Demo') {
    return {
      valid: true,
      tokenValid: true,
      checkedFolders: {}
    };
  }

  let tokenUser: { email: string; displayName: string } | undefined;
  try {
    let tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if ((tokenInfoRes.status === 400 || tokenInfoRes.status === 401) && cachedRefreshToken) {
      const refreshed = await refreshAccessTokenSilently(cachedRefreshToken);
      if (refreshed) {
        token = refreshed;
        tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
      }
    }
    if (tokenInfoRes.ok) {
      const info = await tokenInfoRes.json();
      if (info.email) {
        tokenUser = { email: info.email, displayName: info.email.split('@')[0] };
      }
      const scopes = (info.scope || '').split(' ').filter(Boolean);
      const hasDriveScope = scopes.some((s: string) => s === 'https://www.googleapis.com/auth/drive' || s === 'https://www.googleapis.com/auth/drive.file');
      if (!hasDriveScope && scopes.includes('https://www.googleapis.com/auth/drive.appdata')) {
        return {
          valid: false,
          tokenValid: false,
          tokenUser,
          checkedFolders: {},
          errorMessage: 'Token was issued with scope "drive.appdata", which only allows access to hidden app data. Use the "1. Launch Google Sign-In (OAuth Playground)" button so "https://www.googleapis.com/auth/drive" is automatically selected.'
        };
      }
      if (scopes.length > 0 && !hasDriveScope) {
        return {
          valid: false,
          tokenValid: false,
          tokenUser,
          checkedFolders: {},
          errorMessage: 'This token does not include Google Drive permission (https://www.googleapis.com/auth/drive). Click "1. Launch Google Sign-In (OAuth Playground)" below and paste the resulting code or JSON.'
        };
      }
    } else if (tokenInfoRes.status === 400 || tokenInfoRes.status === 401) {
      return {
        valid: false,
        tokenValid: false,
        checkedFolders: {},
        errorMessage: 'Google token is invalid or has expired. Paste the OAuth Playground code/JSON or generate a fresh token.'
      };
    }
  } catch (e) {
    console.warn('tokeninfo check non-fatal error:', e);
  }

  try {
    let aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user&supportsAllDrives=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (aboutRes.status === 401 && cachedRefreshToken) {
      const refreshed = await refreshAccessTokenSilently(cachedRefreshToken);
      if (refreshed) {
        token = refreshed;
        aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user&supportsAllDrives=true', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    }
    if (!aboutRes.ok) {
      const errBody = await aboutRes.json().catch(() => ({}));
      const apiReason = errBody?.error?.errors?.[0]?.reason || '';
      const apiMsg = errBody?.error?.message || '';
      let detailedError = `Google token rejected by Drive API (HTTP ${aboutRes.status}).`;
      if (apiReason === 'accessNotConfigured' || apiMsg.includes('has not been used in project')) {
        detailedError = 'The OAuth project that minted this token does not have the Google Drive API enabled. Use the "1. Launch Google Sign-In (OAuth Playground)" button below — it uses Google\'s pre-configured Drive client so no Cloud project setup is needed.';
      } else if (apiReason === 'insufficientPermissions' || aboutRes.status === 403) {
        detailedError = `Google Drive API rejected this token (HTTP 403${apiMsg ? `: ${apiMsg}` : ''}). Use the "1. Launch Google Sign-In (OAuth Playground)" button below to authorize with full Drive read/write scope.`;
      }
      return {
        valid: false,
        tokenValid: false,
        checkedFolders: {},
        errorMessage: detailedError
      };
    }
    const aboutData = await aboutRes.json().catch(() => ({}));
    if (aboutData.user) {
      tokenUser = {
        email: aboutData.user.emailAddress || tokenUser?.email || '',
        displayName: aboutData.user.displayName || tokenUser?.displayName || 'Google User'
      };
    }
  } catch (err: any) {
    return {
      valid: false,
      tokenValid: false,
      checkedFolders: {},
      errorMessage: `Failed to reach Google Drive API: ${err?.message || 'Network error'}`
    };
  }

  const checkedFolders: DriveValidationResult['checkedFolders'] = {};

  const checkFolder = async (folderId: string): Promise<{ ok: boolean; status?: number; name?: string }> => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,trashed&supportsAllDrives=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, name: data.name };
      }
      return { ok: false, status: res.status };
    } catch (e) {
      return { ok: false };
    }
  };

  const ampFolder = (settings.driveFolderAmp || '').trim();
  const logsFolder = (settings.driveFolderLogs || '').trim();
  const announcementsFolder = (settings.driveFolderAnnouncements || settings.driveFolderMP3s || '').trim();
  const evergreensFolder = (settings.driveFolderEvergreens || '').trim();
  const showsFolder = (settings.driveFolderShows || '').trim();
  const prefsFolder = (settings.driveFolderPreferences || '').trim();

  if (ampFolder) {
    const ampRes = await checkFolder(ampFolder);
    checkedFolders.amp = { id: ampFolder, ...ampRes };
    if (!ampRes.ok) {
      const reason = ampRes.status === 404 ? 'Folder not found' : ampRes.status === 403 ? 'Access denied' : `HTTP ${ampRes.status || 'unknown'}`;
      return {
        valid: false,
        tokenValid: true,
        tokenUser,
        checkedFolders,
        errorMessage: `Main Station folder (${ampFolder}) could not be accessed (${reason}). Ensure the folder exists in Google Drive and is shared with ${tokenUser?.email || 'your account'}.`
      };
    }

    const overrideErrors: string[] = [];
    if (prefsFolder) {
      const res = await checkFolder(prefsFolder);
      checkedFolders.preferences = { id: prefsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Preferences override folder (${prefsFolder}) not accessible`);
    }
    if (announcementsFolder) {
      const res = await checkFolder(announcementsFolder);
      checkedFolders.announcements = { id: announcementsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Announcements override folder (${announcementsFolder}) not accessible`);
    }
    if (evergreensFolder) {
      const res = await checkFolder(evergreensFolder);
      checkedFolders.evergreens = { id: evergreensFolder, ...res };
      if (!res.ok) overrideErrors.push(`Evergreens override folder (${evergreensFolder}) not accessible`);
    }
    if (showsFolder) {
      const res = await checkFolder(showsFolder);
      checkedFolders.shows = { id: showsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Shows override folder (${showsFolder}) not accessible`);
    }
    if (logsFolder) {
      const res = await checkFolder(logsFolder);
      checkedFolders.logs = { id: logsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Logs override folder (${logsFolder}) not accessible`);
    }

    if (overrideErrors.length > 0) {
      return {
        valid: false,
        tokenValid: true,
        tokenUser,
        checkedFolders,
        errorMessage: overrideErrors.join('; ')
      };
    }

    return {
      valid: true,
      tokenValid: true,
      tokenUser,
      checkedFolders
    };
  }

  const foldersToCheck = [
    { key: 'preferences', id: prefsFolder, label: 'Preferences' },
    { key: 'announcements', id: announcementsFolder, label: 'Announcements' },
    { key: 'evergreens', id: evergreensFolder, label: 'Evergreens' },
    { key: 'shows', id: showsFolder, label: 'Shows' },
    { key: 'logs', id: logsFolder, label: 'Logs' }
  ].filter(f => !!f.id);

  if (foldersToCheck.length === 0) {
    return {
      valid: true,
      tokenValid: true,
      tokenUser,
      checkedFolders,
      warningMessage: 'Google account authenticated. Please configure the AMP Station folder above.'
    };
  }

  const errors: string[] = [];
  for (const f of foldersToCheck) {
    const res = await checkFolder(f.id);
    (checkedFolders as any)[f.key] = { id: f.id, ...res };
    if (!res.ok) {
      errors.push(`${f.label} folder (${f.id}) not accessible`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      tokenValid: true,
      tokenUser,
      checkedFolders,
      errorMessage: errors.join('; ')
    };
  }

  return {
    valid: true,
    tokenValid: true,
    tokenUser,
    checkedFolders
  };
};

export const validateGoogleDriveAccess = async (
  foldersOverride?: Partial<LocationSettings>,
  tokenOverride?: string
): Promise<boolean> => {
  const result = await verifyGoogleDriveDetails(foldersOverride, tokenOverride);
  return result.valid;
};

export const checkEvergreenFolderOnDrive = async (
  oldNameShort: string | undefined,
  newNameShort: string | undefined
): Promise<{ success: boolean; oldExists: boolean; newExists: boolean }> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/shows/evergreen/check-folder', {
    method: 'POST',
    headers,
    body: JSON.stringify({ oldNameShort, newNameShort })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Error checking evergreen/playlist folder on Drive');
  }
  return {
    success: true,
    oldExists: Boolean(data.oldExists),
    newExists: Boolean(data.newExists)
  };
};

export const applyEvergreenChangeOnDrive = async (
  action: 'create' | 'update',
  nameShort: string,
  oldNameShort?: string,
  renameFolder?: boolean
): Promise<{ success: boolean; folderCreated: boolean; folderRenamed: boolean }> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/shows/evergreen/apply-change', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, nameShort, oldNameShort, renameFolder })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Error applying evergreen/playlist change on Drive');
  }
  return {
    success: true,
    folderCreated: Boolean(data.folderCreated),
    folderRenamed: Boolean(data.folderRenamed)
  };
};

export const verifyEvergreensOnDrive = async (_shows?: Show[]): Promise<{
  success: boolean;
  evergreensFolderCreated: boolean;
  playlistsFolderCreated: boolean;
  announcementsFolderCreated: boolean;
  evergreensPath: string;
  playlistsPath: string;
  announcementsPath: string;
  createdFolders: string[];
}> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/shows/verify-evergreens', {
    method: 'POST',
    headers
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Error verifying folders on Google Drive');
  }
  return data;
};

export const loadPlaylistTracksFromDrive = async (
  showNameShort?: string,
  showName?: string,
  mode: 'Local' | 'Drive' | 'Demo' = 'Drive',
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists',
  targetSubfolder?: string
): Promise<{ tracks: Array<{ id: string; fileName: string; title: string; durationSeconds: number; durationFormatted: string; streamUrl: string }>; playlistFile: string | null }> => {
  if (targetSubfolder === '__no_playlist__') {
    return { tracks: [], playlistFile: null };
  }

  try {
    const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, mode);
    const res = await fetch('/api/shows/playlist/load-tracks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        showNameShort,
        showName,
        folderType: parentFolder,
        targetSubfolder
      })
    });
    if (!res.ok) {
      return { tracks: [], playlistFile: null };
    }
    const data = await res.json().catch(() => ({}));
    const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
    tracks.forEach((t: { fileName?: string; streamUrl?: string; durationFormatted?: string }) => {
      if (t && t.fileName && t.streamUrl) {
        upsertMediaCatalogFile({
          name: t.fileName,
          path: t.streamUrl,
          size: '0.1 MB',
          duration: t.durationFormatted || '3:00',
        });
      }
    });
    return { tracks, playlistFile: data?.playlistFile || null };
  } catch (err) {
    console.error('Error loading playlist tracks from Google Drive:', err);
    return { tracks: [], playlistFile: null };
  }
};

export interface DriveDiscoveredFolderItem {
  id: string;
  name: string;
  relPath: string;
  fileCount: number;
  isRoot: boolean;
  hasM3u: boolean;
  m3uName?: string;
  itemType?: 'folder' | 'playlist';
  playlistFileName?: string;
  missingCount?: number;
  totalTracks?: number;
  depth?: number;
}

export const discoverShowFoldersOnDrive = async (
  showNameShort?: string,
  showName?: string,
  mode: 'Local' | 'Drive' | 'Demo' = 'Drive',
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists'
): Promise<{
  defaultFolderName: string;
  folders: DriveDiscoveredFolderItem[];
  totalFiles: number;
}> => {
  const baseFlavorFolder = parentFolder === 'Evergreens' ? 'media_evergreens' : 'media_shows';
  const fallbackFolderName = showNameShort || showName || 'Show';

  try {
    const headers = await getStorageApiHeaders({}, mode);
    const query = new URLSearchParams({
      folderType: parentFolder,
      showNameShort: showNameShort || '',
      showName: showName || ''
    });
    const res = await fetch(`/api/shows/discover-folders?${query.toString()}`, { headers });
    if (!res.ok) {
      return {
        defaultFolderName: `${baseFlavorFolder}/${fallbackFolderName}`,
        folders: [],
        totalFiles: 0
      };
    }
    const data = await res.json().catch(() => ({}));
    return {
      defaultFolderName: data.defaultFolderName || `${baseFlavorFolder}/${fallbackFolderName}`,
      folders: Array.isArray(data.folders) ? data.folders : [],
      totalFiles: typeof data.totalFiles === 'number' ? data.totalFiles : 0
    };
  } catch (err) {
    console.warn('Error discovering show folders on Google Drive:', err);
    return {
      defaultFolderName: `${baseFlavorFolder}/${fallbackFolderName}`,
      folders: [],
      totalFiles: 0
    };
  }
};

export const checkPlaylistShowFilesOnDrive = async (
  currentShowNameShort?: string,
  currentShowName?: string,
  nextShowNameShort?: string,
  nextShowName?: string,
  mode: 'Local' | 'Drive' | 'Demo' = 'Drive'
): Promise<{
  currentShowFileCount: number;
  currentShowFolderCount: number;
  nextShowFileCount: number;
  nextShowFolderCount: number;
}> => {
  try {
    const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, mode);
    const res = await fetch('/api/shows/playlist/check-show-files', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currentShowNameShort,
        currentShowName,
        nextShowNameShort,
        nextShowName
      })
    });
    if (!res.ok) {
      return {
        currentShowFileCount: 0,
        currentShowFolderCount: 0,
        nextShowFileCount: 0,
        nextShowFolderCount: 0
      };
    }
    const data = await res.json().catch(() => ({}));
    return {
      currentShowFileCount: data.currentShowFileCount || 0,
      currentShowFolderCount: data.currentShowFolderCount || 0,
      nextShowFileCount: data.nextShowFileCount || 0,
      nextShowFolderCount: data.nextShowFolderCount || 0
    };
  } catch (err) {
    console.error('Error checking playlist show files on Google Drive:', err);
    return {
      currentShowFileCount: 0,
      currentShowFolderCount: 0,
      nextShowFileCount: 0,
      nextShowFolderCount: 0
    };
  }
};

export const formatShowPlaylistLogFileName = (showNameShort: string, showStartTime?: string | Date): string => {
  const safeShowName = String(showNameShort || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
  const dateObj = showStartTime ? new Date(showStartTime) : new Date();
  const YYYY = dateObj.getFullYear();
  const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const DD = String(dateObj.getDate()).padStart(2, '0');
  const HH = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  return `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
};

export const saveShowPlaylistLogToDrive = async (
  showNameShort: string,
  showName: string,
  showStartTime: string | Date | undefined,
  logData: any,
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists'
): Promise<string> => {
  const logFileName = formatShowPlaylistLogFileName(showNameShort || showName, showStartTime);
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/shows/playlist/save-log-json', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      showNameShort,
      showName,
      showStartTime,
      logData,
      folderType: parentFolder,
      logFileName
    })
  });
  const data = await res.json().catch(() => ({}));
  return data.logFileName || logFileName;
};

export const loadShowPlaylistLogFromDrive = async (
  showNameShort: string,
  showName: string,
  showStartTime: string | Date | undefined,
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists'
): Promise<any | null> => {
  try {
    const logFileName = formatShowPlaylistLogFileName(showNameShort || showName, showStartTime);
    const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
    const res = await fetch('/api/shows/playlist/load-log-json', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        showNameShort,
        showName,
        showStartTime,
        folderType: parentFolder,
        logFileName
      })
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.logData || null;
  } catch (err) {
    console.error('Error loading show playlist log from Drive:', err);
    return null;
  }
};

export const checkMissingDriveItems = async (
  settingsOverride?: Partial<LocationSettings>
): Promise<{ hasMissing: boolean; missingItems: string[]; targetFolderDesc: string }> => {
  try {
    const s = { ...getSavedSettings(), ...(settingsOverride || {}) };
    const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
    if (s.driveFolderAmp) headers['x-amp-drive-folder-amp'] = s.driveFolderAmp;
    const res = await fetch('/api/check-missing-items', {
      method: 'POST',
      headers,
      body: JSON.stringify(s)
    });
    if (!res.ok) {
      return { hasMissing: false, missingItems: [], targetFolderDesc: s.driveFolderAmp || '' };
    }
    const data = await res.json().catch(() => ({}));
    return {
      hasMissing: Boolean(data.hasMissing),
      missingItems: Array.isArray(data.missingItems) ? data.missingItems : [],
      targetFolderDesc: data.targetFolderDesc || s.driveFolderAmp || ''
    };
  } catch (err) {
    console.warn('Error checking missing Drive items:', err);
    return { hasMissing: false, missingItems: [], targetFolderDesc: '' };
  }
};

/**
 * Synchronizes a saved/copied/uploaded/renamed announcement file response from `/api/*`
 * into the client-side `availableFilesCache` and `driveFileNameCache`.
 */
export const registerSavedAnnouncementFileInCache = (
  data: {
    name?: string;
    id?: string;
    path?: string;
    size?: string;
    mtimeMs?: number;
    modifiedTime?: string;
  },
  fallbackDuration: string = ''
) => {
  if (!data || !data.name) return;
  const existing = availableFilesCache.get(data.name);
  const nowMs = typeof data.mtimeMs === 'number' ? data.mtimeMs : (existing?.mtimeMs || Date.now());
  const nowIso = data.modifiedTime || existing?.modifiedTime || new Date(nowMs).toISOString();
  const resolvedPath = data.path || data.id || `/api/media/stream?path=${encodeURIComponent(data.name)}`;
  const resolvedSize = data.size || existing?.size || '0.05 MB';
  const resolvedDuration = fallbackDuration || existing?.duration || '';

  upsertMediaCatalogFile({
    name: data.name,
    id: data.id,
    path: resolvedPath,
    size: resolvedSize,
    duration: resolvedDuration,
    mtimeMs: nowMs,
    modifiedTime: nowIso,
  });
};

/**
 * Reads the UTF-8 text content of a script file (.txt / .md) via the unified server storage provider.
 */
export const readDriveAnnouncementScript = async (fileName: string): Promise<string | null> => {
  try {
    const cleanName = String(fileName || '').trim().split(/[/\\]/).pop() || '';
    if (!cleanName) return null;
    const headers = await getStorageApiHeaders({}, 'Drive');
    const res = await fetch(`/api/live-read/content?file=${encodeURIComponent(cleanName)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && typeof data.content === 'string' ? data.content : null;
  } catch (err) {
    console.warn('Error reading announcement script via server Drive provider:', err);
    return null;
  }
};

/**
 * Saves or updates a .txt live-read script via the unified server storage provider.
 */
export const saveDriveAnnouncementScript = async (
  fileName: string,
  content: string,
  allowOverwrite: boolean = false
): Promise<{ name: string; id: string; size: string }> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/live-read/save', {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileName, content, allowOverwrite })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.exists) {
    const conflictErr: any = new Error(
      data.error || `A file named "${data.name || fileName}" already exists in Media Announcements.`
    );
    conflictErr.exists = true;
    conflictErr.name = data.name || fileName;
    throw conflictErr;
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to save script to Google Drive Media Announcements.');
  }
  registerSavedAnnouncementFileInCache(data);
  return {
    name: data.name,
    id: data.id || data.path || data.name,
    size: data.size || '0.01 MB'
  };
};

/**
 * Duplicates a live-read or audio file inside media_announcements via the unified server storage provider.
 */
export const copyDriveAnnouncementFile = async (
  sourceFileName: string,
  targetFileName: string,
  allowOverwrite: boolean = false
): Promise<{ name: string; id: string; size: string }> => {
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, 'Drive');
  const res = await fetch('/api/live-read/copy-file', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sourceFileName, targetFileName, allowOverwrite })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.exists) {
    const conflictErr: any = new Error(
      data.error || `A file named "${data.name || targetFileName}" already exists in Media Announcements.`
    );
    conflictErr.exists = true;
    conflictErr.name = data.name || targetFileName;
    throw conflictErr;
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to copy file in Google Drive Media Announcements.');
  }
  const prevDuration = availableFilesCache.get(sourceFileName)?.duration || '';
  registerSavedAnnouncementFileInCache(data, prevDuration);
  return {
    name: data.name,
    id: data.id || data.path || data.name,
    size: data.size || '0.05 MB'
  };
};

const readBrowserFileAsBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode file as Base64'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Unified helper to upload an announcement file (audio, .txt, .pdf, image) via `/api/announcements/upload-file`.
 * `server.ts` routes to Local `fs` in Desktop mode or Google Drive in AI Studio Drive mode.
 */
export const uploadAnnouncementMediaFile = async (
  file: File,
  options?: {
    targetFileNameOverride?: string;
    allowOverwrite?: boolean;
    isDriveActive?: boolean;
  }
): Promise<{
  name: string;
  path: string;
  size: string;
  mtimeMs: number;
  modifiedTime: string;
}> => {
  const targetName = (options?.targetFileNameOverride || file.name || '').trim();
  const allowOverwrite = Boolean(options?.allowOverwrite);
  const explicitMode = options?.isDriveActive !== undefined
    ? (options.isDriveActive ? 'Drive' : 'Local')
    : undefined;

  const base64 = await readBrowserFileAsBase64(file);
  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, explicitMode);
  const res = await fetch('/api/announcements/upload-file', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: targetName,
      contentBase64: base64,
      mimeType: file.type || 'application/octet-stream',
      allowOverwrite
    })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.exists) {
    const conflictErr: any = new Error(
      data.error || `A file named "${data.name || targetName}" already exists in Media Announcements.`
    );
    conflictErr.exists = true;
    conflictErr.name = data.name || targetName;
    throw conflictErr;
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to upload file to Media Announcements');
  }

  const nowMs = typeof data.mtimeMs === 'number' ? data.mtimeMs : Date.now();
  const nowIso = data.modifiedTime || new Date(nowMs).toISOString();
  const savedName = data.name || targetName;
  const savedPath = data.path || `/api/media/stream?path=${encodeURIComponent(savedName)}`;
  const savedSize = data.size || `${Math.max(0.01, file.size / (1024 * 1024)).toFixed(2)} MB`;

  registerSavedAnnouncementFileInCache({
    name: savedName,
    id: data.id,
    path: savedPath,
    size: savedSize,
    mtimeMs: nowMs,
    modifiedTime: nowIso
  });

  return {
    name: savedName,
    path: savedPath,
    size: savedSize,
    mtimeMs: nowMs,
    modifiedTime: nowIso
  };
};

/**
 * Renames or copies an announcement media file (e.g., backup audio in Create/Edit Live Read)
 * via `/api/announcements/rename-or-copy-file`. `server.ts` routes to Local `fs` in Desktop mode
 * or Google Drive in AI Studio Drive mode.
 */
export const renameOrCopyAnnouncementMediaFile = async (params: {
  sourceFileName: string;
  targetFileName: string;
  forceCopy?: boolean;
  allowOverwrite?: boolean;
  isDriveActive?: boolean;
  currentLiveReadName?: string;
  editingAnnouncementId?: string;
  fileBlob?: File | Blob;
}): Promise<{
  name: string;
  path: string;
  size: string;
  mtimeMs: number;
  modifiedTime: string;
  action: 'noop' | 'copied' | 'renamed';
  usedElsewhere: boolean;
}> => {
  const cleanSource = String(params.sourceFileName || '').trim().split(/[/\\]/).pop() || '';
  const cleanTarget = String(params.targetFileName || '').trim().split(/[/\\]/).pop() || '';
  const allowOverwrite = Boolean(params.allowOverwrite);
  const forceCopy = Boolean(params.forceCopy);
  const explicitMode = params.isDriveActive !== undefined
    ? (params.isDriveActive ? 'Drive' : 'Local')
    : undefined;

  if (!cleanSource || !cleanTarget) {
    throw new Error('Both sourceFileName and targetFileName are required.');
  }

  if (cleanSource.toLowerCase() === cleanTarget.toLowerCase()) {
    const existing = availableFilesCache.get(cleanSource);
    const nowMs = existing?.mtimeMs || Date.now();
    const nowIso = existing?.modifiedTime || new Date(nowMs).toISOString();
    return {
      name: cleanSource,
      path: existing?.path || `/api/media/stream?path=${encodeURIComponent(cleanSource)}`,
      size: String(existing?.size || '0.10 MB'),
      mtimeMs: nowMs,
      modifiedTime: nowIso,
      action: 'noop',
      usedElsewhere: false
    };
  }

  const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' }, explicitMode);
  let res = await fetch('/api/announcements/rename-or-copy-file', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sourceFileName: cleanSource,
      targetFileName: cleanTarget,
      forceCopy,
      allowOverwrite,
      currentLiveReadName: params.currentLiveReadName,
      editingAnnouncementId: params.editingAnnouncementId
    })
  });

  if (res.status === 404 && params.fileBlob) {
    const base64 = await readBrowserFileAsBase64(params.fileBlob);
    res = await fetch('/api/announcements/rename-or-copy-file', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceFileName: cleanSource,
        targetFileName: cleanTarget,
        forceCopy,
        allowOverwrite,
        currentLiveReadName: params.currentLiveReadName,
        editingAnnouncementId: params.editingAnnouncementId,
        contentBase64: base64,
        mimeType: params.fileBlob.type || 'audio/mpeg'
      })
    });
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.exists) {
    const conflictErr: any = new Error(
      data.error || `A file named "${data.name || cleanTarget}" already exists in Media Announcements.`
    );
    conflictErr.exists = true;
    conflictErr.name = data.name || cleanTarget;
    throw conflictErr;
  }
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to rename or copy backup audio file');
  }

  const savedName = data.name || cleanTarget;
  const nowMs = typeof data.mtimeMs === 'number' ? data.mtimeMs : Date.now();
  const nowIso = data.modifiedTime || new Date(nowMs).toISOString();
  const savedPath = data.path || `/api/media/stream?path=${encodeURIComponent(savedName)}`;
  const savedSize = data.size || availableFilesCache.get(cleanSource)?.size || '0.10 MB';
  const prevDuration = availableFilesCache.get(cleanSource)?.duration || '';
  const action: 'noop' | 'copied' | 'renamed' =
    data.action === 'copied' || data.action === 'noop' ? data.action : 'renamed';

  registerSavedAnnouncementFileInCache(
    {
      name: savedName,
      id: data.id,
      path: savedPath,
      size: savedSize,
      mtimeMs: nowMs,
      modifiedTime: nowIso
    },
    prevDuration
  );

  if (action === 'renamed' && cleanSource.toLowerCase() !== savedName.toLowerCase()) {
    availableFilesCache.delete(cleanSource);
  }

  return {
    name: savedName,
    path: savedPath,
    size: savedSize,
    mtimeMs: nowMs,
    modifiedTime: nowIso,
    action,
    usedElsewhere: Boolean(data.usedElsewhere)
  };
};
