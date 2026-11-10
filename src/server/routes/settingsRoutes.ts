import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import {
  currentSettings,
  setCurrentSettings,
  DEFAULT_SERVER_SETTINGS,
  SETTINGS_FILE,
  BASE_DIR,
  IS_PORTABLE,
  _appDirname,
  electronDialog,
  getRegisteredOAuthToken,
  setRegisteredOAuthToken,
  getAmpLogsDir,
  getAmpLogHistoryDir,
  getAmpSettingsDir,
  getAmpMediaAnnouncementsDir,
  getAmpMediaEvergreensDir,
  getAmpMediaShowsDir,
  atomicWriteFileSync
} from '../state';
import {
  isServerDriveStorageRequest,
  checkServerDriveMissingItems
} from '../storage/driveProvider';

const require = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);

export function registerSettingsRoutes(app: express.Express): void {
  // API - Custom OAuth Loopback Handlers (Method B)
  app.post('/api/register-token', (req, res) => {
    const { token } = req.body;
    if (token) {
      setRegisteredOAuthToken(token);
      console.log('Successfully registered OAuth token on local server.');
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Token is required' });
    }
  });

  app.get('/api/check-registered-token', (req, res) => {
    const token = getRegisteredOAuthToken();
    if (token) {
      setRegisteredOAuthToken(null); // Consume token to prevent re-use
      res.json({ token });
    } else {
      res.json({ token: null });
    }
  });

  app.get('/api/oauth-callback', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WIPE Sign-In Success</title>
  <style>
    body {
      background-color: #0f172a; /* Slate 900 */
      color: #cbd5e1; /* Slate 300 */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background-color: #1e293b; /* Slate 800 */
      border: 1px solid #334155; /* Slate 700 */
      border-radius: 8px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      text-align: center;
    }
    .title {
      color: #f1f5f9; /* Slate 100 */
      font-size: 20px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-text {
      font-weight: 600;
      font-size: 14px;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    .status-success {
      color: #34d399; /* Emerald 400 */
    }
    .status-error {
      color: #f87171; /* Red 400 */
    }
    .status-pending {
      color: #60a5fa; /* Blue 400 */
    }
    .desc {
      font-size: 13px;
      color: #94a3b8; /* Slate 400 */
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .token-container {
      margin-top: 20px;
      text-align: left;
    }
    .token-label {
      font-size: 9px;
      font-weight: bold;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      display: block;
    }
    .token-box {
      width: 100%;
      height: 60px;
      background-color: #0f172a;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #38bdf8;
      font-family: monospace;
      font-size: 11px;
      padding: 8px;
      box-sizing: border-box;
      resize: none;
      word-break: break-all;
    }
    .btn-copy {
      background-color: #3b82f6;
      border: none;
      color: white;
      padding: 6px 12px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: background-color 0.15s;
    }
    .btn-copy:hover {
      background-color: #2563eb;
    }
    .brand {
      font-size: 11px;
      color: #64748b; /* Slate 500 */
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-top: 24px;
      border-top: 1px solid #334155;
      padding-top: 16px;
    }
    .loader {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid #334155;
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 1s ease-in-out infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">WIPE OAuth</div>
    <div id="loader-container" style="margin: 16px 0;">
      <div id="loader" class="loader"></div>
    </div>
    <div id="status" class="status-text status-pending">Exchanging Token...</div>
    <div id="message" class="desc">Please wait while the application registers your Google Drive access session credentials.</div>
    
    <div id="token-section" class="token-container" style="display: none;">
      <span class="token-label">Access Token (Option 2 Manual Copy-Paste)</span>
      <textarea id="token-textarea" class="token-box" readonly onclick="this.select()"></textarea>
      <button id="btn-copy" class="btn-copy">Copy to Clipboard</button>
    </div>

    <div class="brand">WIPE</div>
  </div>

  <script>
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');
    
    if (accessToken) {
      if (state === 'manual') {
        document.getElementById('loader').style.display = 'none';
        const st = document.getElementById('status');
        st.innerText = 'MANUAL TOKEN GENERATED';
        st.className = 'status-text status-success';
        document.getElementById('message').innerText = 'Please copy the secure access token below and paste it into the WIPE Option: Copy-Paste input field.';
        
        document.getElementById('token-section').style.display = 'block';
        document.getElementById('token-textarea').value = accessToken;
      } else {
        fetch('/api/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: accessToken })
        })
        .then(res => res.json())
        .then(data => {
          document.getElementById('loader').style.display = 'none';
          const st = document.getElementById('status');
          st.innerText = 'AUTHENTICATION COMPLETED';
          st.className = 'status-text status-success';
          document.getElementById('message').innerHTML = 'Your credentials have been verified and applied.<br>This window will close automatically.';
          
          setTimeout(() => {
            window.close();
            // Fallback if window.close() is blocked by the browser
            document.getElementById('message').innerHTML = 'Your login session is fully registered.<br>You can now safely close this browser window/tab.';
          }, 1200);
        })
        .catch(err => {
          document.getElementById('loader').style.display = 'none';
          const st = document.getElementById('status');
          st.innerText = 'AUTOMATION REGISTRATION FAILED';
          st.className = 'status-text status-error';
          document.getElementById('message').innerText = 'Failed to transmit token to the local server. Please write down or copy the manual option below to paste in Google settings:';
          
          // Show manual fallback only since auto transmission failed
          document.getElementById('token-section').style.display = 'block';
          document.getElementById('token-textarea').value = accessToken;
        });
      }

      document.getElementById('btn-copy').addEventListener('click', () => {
        const textarea = document.getElementById('token-textarea');
        textarea.select();
        navigator.clipboard.writeText(accessToken).then(() => {
          const btn = document.getElementById('btn-copy');
          btn.innerText = 'Copied!';
          btn.style.backgroundColor = '#10b981';
          setTimeout(() => {
            btn.innerText = 'Copy to Clipboard';
            btn.style.backgroundColor = '#3b82f6';
          }, 2050);
        });
      });
    } else {
      document.getElementById('loader').style.display = 'none';
      const st = document.getElementById('status');
      st.innerText = 'NO ACCESS TOKEN DETECTED';
      st.className = 'status-text status-error';
      document.getElementById('message').innerText = 'Could not find a valid Google access token in the redirect URL fragment. Google may have denied your request or redirected incorrectly.';
    }
  </script>
</body>
</html>`);
  });

  // API - Get application mode / flavor and icon url
  app.get('/api/app-flavor', (req, res) => {
    let mode = 'Admin';
    try {
      const configPath = path.join(_appDirname, 'dist', 'app-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mode) mode = config.mode;
      } else if (process.env.VITE_APP_MODE) {
        mode = process.env.VITE_APP_MODE;
      }
    } catch (_) {}
    const modeKey = mode.toLowerCase();

    // Check if local bundled icon exists in dist (packaged desktop app) or local workspace
    const distIconPath = path.join(_appDirname, 'dist', 'app-icon.png');
    const localAssetIconPath = path.join(_appDirname, 'src', 'assets', 'images', modeKey, 'icon.png');
    let iconUrl = '';
    if (fs.existsSync(distIconPath) || fs.existsSync(localAssetIconPath)) {
      iconUrl = '/api/app-flavor/icon';
    } else {
      // In web preview / cloud environments without local sync, supply the branch reference
      iconUrl = `https://raw.githubusercontent.com/JON99999/AMP/assets/src/assets/images/${modeKey}/icon.png`;
    }
    res.json({ mode, modeKey, iconUrl });
  });

  app.get('/api/app-flavor/icon', (req, res) => {
    let mode = 'Admin';
    try {
      const configPath = path.join(_appDirname, 'dist', 'app-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mode) mode = config.mode;
      } else if (process.env.VITE_APP_MODE) {
        mode = process.env.VITE_APP_MODE;
      }
    } catch (_) {}
    const modeKey = mode.toLowerCase();
    const distIconPath = path.join(_appDirname, 'dist', 'app-icon.png');
    const localAssetIconPath = path.join(_appDirname, 'src', 'assets', 'images', modeKey, 'icon.png');

    if (fs.existsSync(distIconPath)) {
      return res.sendFile(distIconPath);
    }
    if (fs.existsSync(localAssetIconPath)) {
      return res.sendFile(localAssetIconPath);
    }
    res.status(404).send('Icon not bundled');
  });

  // API - Sync settings from frontend
  app.get('/api/settings', (req, res) => {
    res.json(currentSettings);
  });

  app.post('/api/settings', (req, res) => {
    try {
      const updated = setCurrentSettings({ ...currentSettings, ...req.body });
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
      res.json({ success: true, settings: updated });
    } catch (e: any) {
      console.error('Failed to write settings:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write settings: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: SETTINGS_FILE
      });
    }
  });

  // API - Reset settings (keep folders or full factory reset)
  app.post('/api/settings/reset', (req, res) => {
    try {
      const keepFolders = req.body?.keepFolders === true;

      // Purge cached Chromium disk directories in userData (AMP-Admin, AMP-Live, AMP-Studio)
      const cacheSubdirs = [
        'Cache',
        'Code Cache',
        'GPUCache',
        'Service Worker',
        'DawnCache',
        'Blob_storage',
        'Network Persistent State',
        ...(keepFolders ? [] : ['Session Storage']),
      ];

      const runtimeDirs = new Set<string>();
      if (process.env.APP_USER_DATA_PATH) {
        runtimeDirs.add(process.env.APP_USER_DATA_PATH);
        if (!IS_PORTABLE) {
          const parentAppData = path.dirname(process.env.APP_USER_DATA_PATH);
          for (const modeName of ['AMP-Admin', 'AMP-Live', 'AMP-Studio']) {
            runtimeDirs.add(path.join(parentAppData, modeName));
          }
        }
      }

      for (const runtimeDir of runtimeDirs) {
        if (!runtimeDir || !fs.existsSync(runtimeDir)) continue;
        for (const sub of cacheSubdirs) {
          const target = path.join(runtimeDir, sub);
          if (fs.existsSync(target)) {
            try {
              fs.rmSync(target, { recursive: true, force: true });
            } catch (_) {}
          }
        }
      }

      if (keepFolders) {
        // Retain only folder paths, subfolder paths, and operating mode
        const retained = setCurrentSettings({
          mode: currentSettings.mode || 'Demo',
          localPathAmp: currentSettings.localPathAmp || '',
          driveFolderAmp: currentSettings.driveFolderAmp || '',
          paths: currentSettings.paths || { ...DEFAULT_SERVER_SETTINGS.paths },
          localPathMP3s: currentSettings.localPathMP3s || '',
          localPathMediaAnnouncements: currentSettings.localPathMediaAnnouncements || '',
          localPathMediaEvergreens: currentSettings.localPathMediaEvergreens || '',
          localPathMediaShows: currentSettings.localPathMediaShows || '',
          localPathLogs: currentSettings.localPathLogs || '',
          localPathCalendar: currentSettings.localPathCalendar || '',
          driveFolderLogs: currentSettings.driveFolderLogs || '',
          driveFolderMP3s: currentSettings.driveFolderMP3s || '',
          driveFolderPreferences: currentSettings.driveFolderPreferences || '',
          driveFolderAnnouncements: currentSettings.driveFolderAnnouncements || '',
          driveFolderEvergreens: currentSettings.driveFolderEvergreens || '',
          driveFolderShows: currentSettings.driveFolderShows || '',
          googleAuth: currentSettings.googleAuth || null,
        });
        atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(retained, null, 2));
        return res.json({ success: true, settings: retained, preservedFolders: true });
      } else {
        // Full factory reset
        const reset = setCurrentSettings({ ...DEFAULT_SERVER_SETTINGS });
        try {
          if (fs.existsSync(SETTINGS_FILE)) {
            fs.unlinkSync(SETTINGS_FILE);
          }
        } catch (_) {}
        return res.json({ success: true, settings: reset, preservedFolders: false });
      }
    } catch (e: any) {
      console.error('Failed to reset settings:', e);
      return res.status(500).json({
        success: false,
        error: 'Failed to reset settings: ' + (e?.message || e)
      });
    }
  });

  // API - Persistent Google Drive Auth Session & OAuth Playground Token Auto-Refresh
  app.get('/api/auth/session', (req, res) => {
    res.json({
      success: true,
      googleAuth: currentSettings.googleAuth || null
    });
  });

  app.post('/api/auth/save-session', (req, res) => {
    try {
      if (req.body?.clear === true) {
        currentSettings.googleAuth = null;
      } else {
        const existing = currentSettings.googleAuth || {};
        currentSettings.googleAuth = {
          accessToken: req.body?.accessToken !== undefined ? req.body.accessToken : existing.accessToken || null,
          refreshToken: req.body?.refreshToken !== undefined ? req.body.refreshToken : existing.refreshToken || null,
          expiresAt: req.body?.expiresAt !== undefined ? req.body.expiresAt : existing.expiresAt || null,
          userProfile: req.body?.userProfile !== undefined ? req.body.userProfile : existing.userProfile || null,
        };
      }
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
      res.json({ success: true, googleAuth: currentSettings.googleAuth });
    } catch (e: any) {
      console.error('Failed to save auth session:', e);
      res.status(500).json({ success: false, error: e?.message || 'Failed to save auth session' });
    }
  });

  app.post('/api/auth/exchange-playground-code', async (req, res) => {
    try {
      let rawCode = (req.body?.code || '').trim();
      if (!rawCode) {
        return res.status(400).json({
          success: false,
          error: 'No authorization code provided.'
        });
      }

      // If full URL was passed, extract ?code=... parameter
      if (rawCode.includes('code=')) {
        try {
          const urlObj = new URL(rawCode.startsWith('http') ? rawCode : `https://dummy.local/?${rawCode}`);
          const extractedCode = urlObj.searchParams.get('code');
          if (extractedCode) {
            rawCode = extractedCode.trim();
          }
        } catch {
          const m = rawCode.match(/[?&]code=([^&#\s]+)/);
          if (m && m[1]) {
            rawCode = decodeURIComponent(m[1]).trim();
          }
        }
      } else if (rawCode.includes('%2F')) {
        try {
          rawCode = decodeURIComponent(rawCode).trim();
        } catch {}
      }

      const playgroundRes = await fetch('https://developers.google.com/oauthplayground/exchangeAuthCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          code: rawCode
        })
      });

      const playgroundData: any = await playgroundRes.json().catch(() => null);
      if (!playgroundData) {
        return res.status(502).json({
          success: false,
          error: `OAuth Playground exchangeAuthCode endpoint returned non-JSON (HTTP ${playgroundRes.status}).`
        });
      }

      let accessToken: string | null = playgroundData.access_token || null;
      let refreshToken: string | null = playgroundData.refresh_token || null;
      let expiresIn: number = typeof playgroundData.expires_in === 'number' ? playgroundData.expires_in : 3599;
      let innerError: string | null = Array.isArray(playgroundData.error)
        ? playgroundData.error.join(': ')
        : (playgroundData.error || null);

      const encodedBody = playgroundData?.Response?.['message-body'];
      if (encodedBody && typeof encodedBody === 'string') {
        try {
          const decodedStr = Buffer.from(encodedBody, 'base64').toString('utf-8');
          const decodedJson = JSON.parse(decodedStr);
          if (decodedJson.access_token) {
            accessToken = decodedJson.access_token;
          }
          if (decodedJson.refresh_token) {
            refreshToken = decodedJson.refresh_token;
          }
          if (typeof decodedJson.expires_in === 'number') {
            expiresIn = decodedJson.expires_in;
          }
          if (decodedJson.error) {
            innerError = decodedJson.error_description
              ? `${decodedJson.error}: ${decodedJson.error_description}`
              : String(decodedJson.error);
          }
        } catch {
          // Ignore base64 decode errors if top-level fields succeeded
        }
      }

      if (!accessToken) {
        return res.status(400).json({
          success: false,
          error: innerError || 'Failed to exchange authorization code. Codes are single-use; if you already clicked "Exchange authorization code for tokens" in OAuth Playground, paste the Step 2 JSON response instead.'
        });
      }

      const expiresAt = Date.now() + expiresIn * 1000;
      currentSettings.googleAuth = {
        ...(currentSettings.googleAuth || {}),
        accessToken,
        refreshToken: refreshToken || currentSettings.googleAuth?.refreshToken || null,
        expiresAt
      };
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn,
        expiresAt
      });
    } catch (err: any) {
      console.error('Error exchanging OAuth Playground auth code:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Unexpected error during authorization code exchange.'
      });
    }
  });

  app.post('/api/auth/refresh-playground-token', async (req, res) => {
    try {
      const refreshToken = (req.body?.refreshToken || currentSettings.googleAuth?.refreshToken || '').trim();
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'No refresh_token available to exchange for a new access_token.'
        });
      }

      const playgroundRes = await fetch('https://developers.google.com/oauthplayground/refreshAccessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          token_uri: 'https://oauth2.googleapis.com/token',
          refresh_token: refreshToken
        })
      });

      const playgroundData: any = await playgroundRes.json().catch(() => null);
      if (!playgroundData) {
        return res.status(502).json({
          success: false,
          error: `OAuth Playground refresh endpoint returned non-JSON (HTTP ${playgroundRes.status}).`
        });
      }

      let accessToken: string | null = playgroundData.access_token || null;
      let expiresIn: number = typeof playgroundData.expires_in === 'number' ? playgroundData.expires_in : 3599;
      let innerError: string | null = playgroundData.error || null;

      const encodedBody = playgroundData?.Response?.['message-body'];
      if (encodedBody && typeof encodedBody === 'string') {
        try {
          const decodedStr = Buffer.from(encodedBody, 'base64').toString('utf-8');
          const decodedJson = JSON.parse(decodedStr);
          if (decodedJson.access_token) {
            accessToken = decodedJson.access_token;
          }
          if (typeof decodedJson.expires_in === 'number') {
            expiresIn = decodedJson.expires_in;
          }
          if (decodedJson.error) {
            innerError = decodedJson.error_description
              ? `${decodedJson.error}: ${decodedJson.error_description}`
              : String(decodedJson.error);
          }
        } catch (decodeErr) {
          // Ignore base64 decode errors if top-level fields succeeded
        }
      }

      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: innerError || 'Failed to mint a new access_token from the provided refresh_token.'
        });
      }

      const expiresAt = Date.now() + expiresIn * 1000;
      currentSettings.googleAuth = {
        ...(currentSettings.googleAuth || {}),
        accessToken,
        refreshToken,
        expiresAt
      };
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));

      return res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn,
        expiresAt
      });
    } catch (err: any) {
      console.error('Error refreshing OAuth Playground token:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'Unexpected error during token refresh.'
      });
    }
  });

  // Consolidated Startup Verification & Path Auto-Provisioning Gate
  const handleStartupVerify = (req: express.Request, res: express.Response) => {
    try {
      const settings = { ...currentSettings, ...(req.body || {}) };
      const effectiveMode = settings.mode || 'Local';

      // Cloud / Demo modes bypass local path validation
      if (effectiveMode === 'Drive' || effectiveMode === 'Demo') {
        return res.json({ ready: true, status: 'READY', mode: effectiveMode });
      }

      // --- STRATEGY 1: Unified AMP Station Location ---
      const ampRoot = settings.localPathAmp || '';
      if (ampRoot) {
        if (!fs.existsSync(ampRoot)) {
          return res.json({
            ready: false,
            status: 'INACCESSIBLE',
            message: `AMP Station Location folder could not be accessed at: ${ampRoot}`,
            missingFolders: {
              amp: true
            }
          });
        }

        // Standard 5-folder subdirectories
        const logsDir = getAmpLogsDir(settings) || path.join(ampRoot, 'logs');
        const logHistoryDir = getAmpLogHistoryDir(settings) || path.join(logsDir, 'loghistory');
        const settingsDir = getAmpSettingsDir(settings) || path.join(ampRoot, 'settings');
        const settingsBackupsDir = path.join(settingsDir, 'backups');
        const mediaAnnounceDir = getAmpMediaAnnouncementsDir(settings) || path.join(ampRoot, 'media_announcements');
        const mediaEvergreensDir = getAmpMediaEvergreensDir(settings) || path.join(ampRoot, 'media_evergreens');
        const mediaShowsDir = getAmpMediaShowsDir(settings) || path.join(ampRoot, 'media_shows');

        const dirsToEnsure = [
          logsDir,
          logHistoryDir,
          settingsDir,
          settingsBackupsDir,
          mediaAnnounceDir,
          mediaEvergreensDir,
          mediaShowsDir
        ];

        const createMissing = req.body?.createMissing === true || req.path === '/api/create-local-paths';

        if (createMissing) {
          // Auto-create missing subdirectories only when explicitly requested
          dirsToEnsure.forEach(dir => {
            if (!fs.existsSync(dir)) {
              try {
                fs.mkdirSync(dir, { recursive: true });
              } catch (err) {
                console.error(`Error ensuring directory ${dir}:`, err);
              }
            }
          });

          // Atomic auto-seeding of missing database stores
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');

          if (!fs.existsSync(logsFile)) {
            atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
          }

          if (!fs.existsSync(announcementsFile)) {
            atomicWriteFileSync(announcementsFile, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }, null, 2));
          }

          if (!fs.existsSync(showsFile)) {
            atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
          }
        } else {
          // Do not auto-create; verify physical existence and prompt user if missing
          const missingSubdirs: Record<string, boolean> = {};
          if (!fs.existsSync(logsDir)) missingSubdirs.logs = true;
          if (!fs.existsSync(settingsDir)) missingSubdirs.settings = true;
          if (!fs.existsSync(mediaAnnounceDir)) missingSubdirs.media_announcements = true;
          if (!fs.existsSync(mediaEvergreensDir)) missingSubdirs.media_evergreens = true;
          if (!fs.existsSync(mediaShowsDir)) missingSubdirs.media_shows = true;

          if (Object.keys(missingSubdirs).length > 0) {
            return res.json({
              ready: false,
              status: 'INACCESSIBLE',
              message: `One or more configured subfolders could not be accessed at: ${ampRoot}`,
              missingFolders: missingSubdirs
            });
          }
        }

        return res.json({
          ready: true,
          status: 'READY',
          message: 'AMP Station Location and 5-folder structure verified successfully.'
        });
      }

      // --- STRATEGY 2: Individual 5-Folder Path Overrides ---
      const settingsDir = getAmpSettingsDir(settings);
      const logsDir = getAmpLogsDir(settings);
      const mediaAnnounceDir = getAmpMediaAnnouncementsDir(settings);
      const mediaEvergreensDir = getAmpMediaEvergreensDir(settings);
      const mediaShowsDir = getAmpMediaShowsDir(settings);

      if (!settingsDir && !logsDir && !mediaAnnounceDir && !mediaEvergreensDir && !mediaShowsDir) {
        return res.json({
          ready: false,
          status: 'NOT_DEFINED',
          message: 'AMP Station Location or folder definitions are missing.',
          missingDefinitions: {
            amp: true,
            settings: !settingsDir,
            logs: !logsDir,
            media_announcements: !mediaAnnounceDir,
            media_evergreens: !mediaEvergreensDir,
            media_shows: !mediaShowsDir
          }
        });
      }

      const missingFolders: Record<string, boolean> = {};
      if (settingsDir && !fs.existsSync(settingsDir)) missingFolders.settings = true;
      if (logsDir && !fs.existsSync(logsDir)) missingFolders.logs = true;
      if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) missingFolders.media_announcements = true;
      if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) missingFolders.media_evergreens = true;
      if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) missingFolders.media_shows = true;

      const createMissing = req.body?.createMissing === true || req.path === '/api/create-local-paths';

      if (Object.keys(missingFolders).length > 0) {
        if (createMissing) {
          if (settingsDir && !fs.existsSync(settingsDir)) {
            try { fs.mkdirSync(settingsDir, { recursive: true }); } catch (e) {}
          }
          if (logsDir && !fs.existsSync(logsDir)) {
            try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) {}
          }
          if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) {
            try { fs.mkdirSync(mediaAnnounceDir, { recursive: true }); } catch (e) {}
          }
          if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) {
            try { fs.mkdirSync(mediaEvergreensDir, { recursive: true }); } catch (e) {}
          }
          if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) {
            try { fs.mkdirSync(mediaShowsDir, { recursive: true }); } catch (e) {}
          }
        } else {
          return res.json({
            ready: false,
            status: 'INACCESSIBLE',
            message: 'Configured folders could not be accessed on the local filesystem.',
            missingFolders
          });
        }
      }

      // Ensure backup directories and data stores in configured locations if createMissing is true
      if (createMissing) {
        if (settingsDir && fs.existsSync(settingsDir)) {
          const backupsDir = path.join(settingsDir, 'backups');
          if (!fs.existsSync(backupsDir)) {
            try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}
          }
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          if (!fs.existsSync(announcementsFile)) {
            atomicWriteFileSync(announcementsFile, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }, null, 2));
          }
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');
          if (!fs.existsSync(showsFile)) {
            atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
          }
        }

        if (logsDir && fs.existsSync(logsDir)) {
          const logHistoryDir = getAmpLogHistoryDir(settings) || path.join(logsDir, 'loghistory');
          if (!fs.existsSync(logHistoryDir)) {
            try { fs.mkdirSync(logHistoryDir, { recursive: true }); } catch (e) {}
          }
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          if (!fs.existsSync(logsFile)) {
            atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
          }
        }
      }

      return res.json({
        ready: true,
        status: 'READY',
        message: 'Configured 5-folder AMP structure verified successfully.'
      });
    } catch (e: any) {
      console.error('Verify startup check failed:', e);
      return res.status(500).json({ ready: false, status: 'ERROR', message: e?.message || 'Verification error' });
    }
  };

  app.post('/api/startup/verify', handleStartupVerify);
  app.post('/api/check-local-paths', handleStartupVerify);
  app.post('/api/create-local-paths', handleStartupVerify);

  // Pre-flight check for missing folders/files before saving (Unified Local + Drive)
  app.post('/api/check-missing-items', async (req, res) => {
    try {
      const settings = { ...currentSettings, ...(req.body || {}) };
      if (isServerDriveStorageRequest(req) || settings.mode === 'Drive' || settings.mode === 'Demo') {
        const result = await checkServerDriveMissingItems(req, settings);
        return res.json(result);
      }

      const missingItems: string[] = [];
      const ampRoot = settings.localPathAmp || '';
      const targetFolderDesc = ampRoot || 'configured folder locations';

      const logsDir = settings.localPathLogs || (ampRoot ? path.join(ampRoot, 'logs') : '');
      const settingsDir = settings.localPathCalendar || (ampRoot ? path.join(ampRoot, 'settings') : '');
      const mediaAnnounceDir = settings.localPathMediaAnnouncements || settings.localPathMP3s || (ampRoot ? path.join(ampRoot, 'media_announcements') : '');
      const mediaEvergreensDir = settings.localPathMediaEvergreens || (ampRoot ? path.join(ampRoot, 'media_evergreens') : '');
      const mediaShowsDir = settings.localPathMediaShows || (ampRoot ? path.join(ampRoot, 'media_shows') : '');

      if (ampRoot && !fs.existsSync(ampRoot)) {
        missingItems.push('AMP folder');
      }

      if (settingsDir) {
        if (!fs.existsSync(settingsDir)) {
          missingItems.push('settings folder');
        } else {
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          if (!fs.existsSync(announcementsFile)) {
            missingItems.push('announcements.json');
          }
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');
          if (!fs.existsSync(showsFile)) {
            missingItems.push('shows.json');
          }
        }
      }

      if (logsDir) {
        if (!fs.existsSync(logsDir)) {
          missingItems.push('logs folder');
        } else {
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          if (!fs.existsSync(logsFile)) {
            missingItems.push('logs.json');
          }
        }
      }

      if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) {
        missingItems.push('media_announcements folder');
      }
      if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) {
        missingItems.push('media_evergreens folder');
      }
      if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) {
        missingItems.push('media_shows folder');
      }

      return res.json({
        hasMissing: missingItems.length > 0,
        missingItems,
        targetFolderDesc
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API - Standard Native selection dialogue via Electron Process
  app.post('/api/browse-folder', (req, res) => {
    try {
      if (electronDialog) {
        const dialogOptions: any = {
          title: 'Select Folder Destination',
          properties: ['openDirectory', 'createDirectory']
        };
        const defaultPath = req.body?.defaultPath;
        if (defaultPath && fs.existsSync(defaultPath)) {
          dialogOptions.defaultPath = defaultPath;
        } else if (IS_PORTABLE && BASE_DIR && fs.existsSync(BASE_DIR)) {
          dialogOptions.defaultPath = BASE_DIR;
        }
        const result = electronDialog.showOpenDialogSync(dialogOptions);
        if (result && result.length > 0) {
          res.json({ success: true, path: result[0] });
        } else {
          res.json({ success: true, cancelled: true });
        }
      } else {
        res.json({ success: false, error: 'Standard Browse dialog is only available when running inside Desktop App frame.' });
      }
    } catch (e: any) {
      res.json({ success: false, error: e.message || 'Native selection query errored' });
    }
  });

  // API - Get the default system Downloads path
  app.get('/api/downloads-path', (req, res) => {
    try {
      const downloadsPath = path.join(os.homedir(), 'Downloads');
      res.json({ success: true, path: downloadsPath });
    } catch (e: any) {
      res.json({ success: false, path: '' });
    }
  });

  // API - Custom web directory list (Browse Fancy)
  app.get('/api/list-directories', (req, res) => {
    try {
      let targetPath = req.query.path as string;
      if (!targetPath) {
        if (IS_PORTABLE && BASE_DIR) {
          targetPath = BASE_DIR;
        } else {
          try {
            targetPath = os.homedir() || process.cwd();
          } catch {
            targetPath = process.cwd();
          }
        }
      }

      // Resolve absolute path
      const resolvedPath = path.resolve(targetPath);

      if (!fs.existsSync(resolvedPath)) {
        return res.json({ success: false, error: 'Path does not exist' });
      }

      const files = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const folders: string[] = [];

      files.forEach((file) => {
        if (file.isDirectory()) {
          folders.push(file.name);
        }
      });

      folders.sort();

      const parentPath = path.dirname(resolvedPath);

      res.json({
        success: true,
        currentPath: resolvedPath,
        parentPath: parentPath !== resolvedPath ? parentPath : null,
        folders
      });
    } catch (e: any) {
      res.json({ success: false, error: e.message || 'Failed to list directory' });
    }
  });

  // API - Open local folder in OS neutral fashion
  app.post('/api/open-local-folder', async (req, res) => {
    try {
      const { path: folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path is required' });
      }
      if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder directory does not exist' });
      }

      // Try electron shell.openPath if running in Electron environment
      if (process.versions && process.versions.electron) {
        try {
          const electron = require('electron');
          if (electron && electron.shell && electron.shell.openPath) {
            const errMsg = await electron.shell.openPath(folderPath);
            if (!errMsg) {
              return res.json({ success: true });
            }
            console.warn('electron.shell.openPath returned warning:', errMsg);
          }
        } catch (_) {
          // Fallback to child_process
        }
      }

      const startCmd = process.platform === 'win32'
        ? 'explorer'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';

      execFile(startCmd, [folderPath], (err: any) => {
        if (err) {
          console.error('Failed to open local directory:', err);
          return res.status(500).json({ error: 'Failed to open directory natively: ' + err.message });
        }
        res.json({ success: true });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Cannot open directory' });
    }
  });

  // API - Write custom files on localhost (Native desktop save file helper)
  app.post('/api/write-file', (req, res) => {
    try {
      const { filePath, content, isBinary } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }

      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (isBinary) {
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to write file via API:', e);
      res.status(500).json({ error: 'Failed to write file: ' + e.message });
    }
  });
}
