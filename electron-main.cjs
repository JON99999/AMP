const { app, BrowserWindow, screen, Menu, session, dialog, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');

const APP_VERSION = '0.20.5';
const AMP_GITHUB_REPO_URL = 'https://github.com/JON99999/AMP';

// ==========================================================================================
// INTEL MAC PERFORMANCE OPTIMIZATIONS (1-3) FOR MOUSE-MOVEMENT CPU LAG
// ==========================================================================================
// Under user rule guidelines, these options are clearly grouped and notated below for easy
// toggle, adjustments, or future removal if needed.

const isMac = process.platform === 'darwin';
const isIntelMac = isMac && process.arch === 'x64';

let appMode = 'Admin';
let startupServerError = null;

try {
  const configPath = path.join(__dirname, 'dist', 'app-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.mode) {
      appMode = config.mode;
    }
  }
} catch (e) {
  console.log('Using default App Mode: Admin');
}

// Windows Application User Model ID registration for taskbar, shortcuts, and notification isolation
if (process.platform === 'win32') {
  app.setAppUserModelId(`com.amp.scheduler.${appMode.toLowerCase()}`);
}

// ------------------------------------------------------------------------------------------
// STRATEGY A: ISOLATED RUNTIME USERDATA PER TYPE + SHARED SETTINGS DIRECTORY
// ------------------------------------------------------------------------------------------
// 1. Runtime Isolation: Each app type (Admin, Live, Studio) uses its own isolated userData directory
//    (e.g., ~/Library/Application Support/AMP-Admin). This prevents Electron/Chromium lock collisions
//    and allows Admin, Live, and Studio to run simultaneously on the same machine.
// 2. Settings Sharing: All app types and future version upgrades share a single persistent configuration
//    directory (~/Library/Application Support/AMP) for amp_settings.json.
// 3. Portable Mode: When running in portable mode, all paths are redirected to the launch directory.
const isExplicitPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const isExtractedPortable = !isMac && !process.defaultApp && path.basename(process.execPath).toLowerCase().includes('portable');
const isPortableMode = isExplicitPortable || isExtractedPortable;

let sharedSettingsDirPath = '';

if (isPortableMode) {
  const portableLaunchDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  process.env.PORTABLE_EXECUTABLE_DIR = portableLaunchDir;
  
  const portableUserData = path.join(portableLaunchDir, 'userData');
  try {
    if (!fs.existsSync(portableUserData)) {
      fs.mkdirSync(portableUserData, { recursive: true });
    }
    app.setPath('userData', portableUserData);
    app.setPath('appData', portableLaunchDir);
    sharedSettingsDirPath = portableLaunchDir;
    console.log(`[Portable Mode] Isolated userData path set to: ${portableUserData}`);
  } catch (err) {
    console.error('[Portable Mode] Failed to set custom isolated userData path:', err);
  }
} else {
  try {
    const baseAppData = app.getPath('appData');
    // Unified shared settings directory across all modes and version upgrades
    sharedSettingsDirPath = path.join(baseAppData, 'AMP');
    if (!fs.existsSync(sharedSettingsDirPath)) {
      fs.mkdirSync(sharedSettingsDirPath, { recursive: true });
    }

    // Isolated runtime userData per application type (AMP-Admin, AMP-Live, AMP-Studio)
    const typeSpecificUserData = path.join(baseAppData, `AMP-${appMode}`);
    if (!fs.existsSync(typeSpecificUserData)) {
      fs.mkdirSync(typeSpecificUserData, { recursive: true });
    }
    app.setPath('userData', typeSpecificUserData);
    console.log(`[Installed Mode] Isolated runtime userData for ${appMode}: ${typeSpecificUserData}`);
    console.log(`[Installed Mode] Shared suite settings directory: ${sharedSettingsDirPath}`);
  } catch (err) {
    console.error('[Installed Mode] Failed to configure runtime paths:', err);
  }
}
// ------------------------------------------------------------------------------------------

// Ensure single running instance per application type
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log(`Another instance of AMP ${appMode} is already running. Exiting duplicate process.`);
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus main window if user tries to launch another instance of this exact app type
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// OPTION 1: Use Updated Electron Framework Version
// Note: Handled in package.json. The application currently targets and runs on a very modern 
// Electron version ("^42.1.0"), ensuring that the underlying Chromium engine has modern patches
// to address historical macOS Sequoia/Tahoe drawing bugs.

// OPTION 2: Disable Hardware Acceleration (Bypasses rendering bottlenecks on Intel graphics card drivers)
const DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC = false; // Set to false to disable this optimization
if (DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC && isIntelMac) {
  console.log('[Intel Mac Optimization] Option 2 Active: Disabling Hardware Acceleration to bypass GPU rendering lag.');
  app.disableHardwareAcceleration();
}

// OPTION 3: Disable App Window Shadows (Drastically reduces WindowServer compositing overhead during mouse movement)
const DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC = false; // Set to false to disable this optimization
// ==========================================================================================

let mainWindow;
let serverPort = 3000;

function getFreePort(startingPort = 3000, attempts = 0, maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    if (attempts >= maxAttempts) {
      reject(new Error(`Could not find a free port within ${maxAttempts} attempts starting from port 3000.`));
      return;
    }
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      getFreePort(startingPort + 1, attempts + 1, maxAttempts)
        .then(resolve)
        .catch(reject);
    });
    server.listen(startingPort, '0.0.0.0', () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function startServer() {
  try {
    serverPort = await getFreePort(3000);
    console.log(`Resolved free port for desktop server: ${serverPort}`);
  } catch (err) {
    console.error('Error finding free port, defaulting to 3000:', err);
    serverPort = 3000;
  }

  // Set environment for the server
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(serverPort);
  try {
    process.env.APP_USER_DATA_PATH = app.getPath('userData');
    if (sharedSettingsDirPath) {
      process.env.APP_SETTINGS_DIR_PATH = sharedSettingsDirPath;
    }
    console.log(`Setting user data path env: ${process.env.APP_USER_DATA_PATH}`);
    console.log(`Setting shared settings dir path env: ${process.env.APP_SETTINGS_DIR_PATH || process.env.APP_USER_DATA_PATH}`);
  } catch (err) {
    console.error('Failed to resolve electron userData path:', err);
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log(`Windows Portable mode active. Executable directory: ${process.env.PORTABLE_EXECUTABLE_DIR}`);
  }

  // Import and run the compiled production server
  // Because it's bundled as CommonJS (.cjs), we can simply require it
  try {
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    require(serverPath);
    startupServerError = null;
    console.log(`Backend server started successfully on port ${serverPort}.`);
  } catch (err) {
    startupServerError = err;
    console.error('Failed to start backend server:', err);
  }
}

function resolveLocalAdminContactAndStationInfo() {
  const info = {
    stationPath: '',
    adminContact: ''
  };
  try {
    const candidateSettingsDirs = [];
    if (sharedSettingsDirPath) candidateSettingsDirs.push(sharedSettingsDirPath);
    try {
      candidateSettingsDirs.push(app.getPath('userData'));
    } catch (_) {}

    let parsedAppSettings = null;
    for (const dir of candidateSettingsDirs) {
      if (!dir) continue;
      const settingsFile = path.join(dir, 'amp_settings.json');
      if (fs.existsSync(settingsFile)) {
        try {
          parsedAppSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
          if (parsedAppSettings && typeof parsedAppSettings === 'object') break;
        } catch (_) {}
      }
    }

    if (parsedAppSettings) {
      const rootAmp =
        (parsedAppSettings.localPathAmp && String(parsedAppSettings.localPathAmp).trim()) ||
        (parsedAppSettings.paths && parsedAppSettings.paths.settings
          ? path.dirname(String(parsedAppSettings.paths.settings).trim())
          : '');
      if (rootAmp) info.stationPath = rootAmp;

      const stationSettingsDir =
        (parsedAppSettings.paths && parsedAppSettings.paths.settings && String(parsedAppSettings.paths.settings).trim()) ||
        (rootAmp ? path.join(rootAmp, 'settings') : '');

      if (stationSettingsDir && fs.existsSync(stationSettingsDir)) {
        const candidateJsonFiles = [
          path.join(stationSettingsDir, 'station_settings.json'),
          path.join(stationSettingsDir, 'shows_schedule.json'),
          path.join(stationSettingsDir, 'shows.json'),
          path.join(stationSettingsDir, 'announcements.json')
        ];
        for (const jsonPath of candidateJsonFiles) {
          if (!fs.existsSync(jsonPath)) continue;
          try {
            const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const contact =
              (raw && typeof raw.adminContactInfo === 'string' && raw.adminContactInfo.trim()) ||
              (raw && raw._meta && typeof raw._meta.adminContactInfo === 'string' && raw._meta.adminContactInfo.trim()) ||
              (raw &&
                Array.isArray(raw.data) &&
                raw.data[0] &&
                raw.data[0]._stationMeta &&
                typeof raw.data[0]._stationMeta.adminContactInfo === 'string' &&
                raw.data[0]._stationMeta.adminContactInfo.trim()) ||
              '';
            if (contact) {
              info.adminContact = contact;
              break;
            }
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  return info;
}

function renderStartupCrashWindow(win, errObj, port) {
  if (!win || win.isDestroyed()) return;

  try {
    if (appMode !== 'Admin') {
      win.setMinimumSize(360, 480);
      win.setMaximumSize(1400, 1400);
      win.setSize(680, 660);
      win.center();
    }
  } catch (_) {}

  const { stationPath, adminContact } = resolveLocalAdminContactAndStationInfo();
  const osPlatformLabel =
    process.platform === 'darwin'
      ? 'macOS'
      : process.platform === 'win32'
        ? 'Windows'
        : process.platform;
  const osSummary = `${osPlatformLabel} (${os.type()} ${os.release()} / ${process.arch})`;
  const appSummary = `AMP ${appMode} v${APP_VERSION}`;
  const errorText =
    errObj && (errObj.stack || errObj.message)
      ? String(errObj.stack || errObj.message)
      : String(errObj || 'Unknown startup error');
  const errorHeadline =
    errObj && errObj.message
      ? String(errObj.message)
      : 'Local Express backend server failed to respond on startup.';
  const adminContactDisplay =
    adminContact || 'Not configured on disk — contact your station administrator or report on GitHub below';
  const nowIso = new Date().toISOString();
  let userDataDir = '';
  try {
    userDataDir = app.getPath('userData');
  } catch (_) {}

  const crashLogLines = [
    '============================================================',
    'AMP (Announcement Media Player) — Startup Crash Log',
    '============================================================',
    `Timestamp (UTC):      ${nowIso}`,
    `Application:          ${appSummary}`,
    `Operating System:     ${osSummary}`,
    `Runtime Versions:     Electron ${process.versions.electron || 'N/A'} | Node ${process.versions.node || 'N/A'} | Chromium ${process.versions.chrome || 'N/A'}`,
    `Local Server Port:    ${port}`,
    `Portable Mode:        ${isPortableMode ? 'Yes' : 'No'}`,
    `Shared Settings Dir:  ${sharedSettingsDirPath || 'N/A'}`,
    `Isolated UserData:    ${userDataDir || 'N/A'}`,
    `Station Folder Path:  ${stationPath || 'Not configured'}`,
    `Admin Contact Info:   ${adminContact || 'Not configured'}`,
    `GitHub Repository:    ${AMP_GITHUB_REPO_URL}`,
    '------------------------------------------------------------',
    'ERROR DETAILS & STACK TRACE:',
    errorText,
    '============================================================'
  ].join('\n');

  const issueTitle = `[Bug] Startup Error on ${appSummary} (${osPlatformLabel} ${process.arch}): ${errorHeadline.slice(0, 80)}`;
  const issueBody = [
    '### Description',
    'AMP encountered a startup error before the main interface could load.',
    '',
    '### Crash Log',
    '```text',
    crashLogLines,
    '```'
  ].join('\n');
  const githubNewIssueUrl = `${AMP_GITHUB_REPO_URL}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  const escapeHtml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(appSummary)} — Startup Diagnostic Report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.45;
    }
    .card {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }
    .header {
      background: #fff1f2;
      border-bottom: 1px solid #fecdd3;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .header-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #9f1239;
    }
    .badge {
      font-size: 12px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid #fda4af;
      color: #881337;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .summary {
      font-size: 13px;
      color: #334155;
      margin: 0;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .meta-label {
      font-weight: 800;
      color: #475569;
      min-width: 150px;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.04em;
    }
    .meta-value {
      font-weight: 700;
      color: #0f172a;
      word-break: break-word;
    }
    .contact-highlight {
      color: #6d28d9;
    }
    .log-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .log-label {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
    }
    .log-box {
      width: 100%;
      height: 230px;
      padding: 10px 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      line-height: 1.45;
      color: #0f172a;
      background: #f8fafc;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      resize: vertical;
      white-space: pre;
      overflow: auto;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding-top: 4px;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button {
      cursor: pointer;
      border-radius: 7px;
      padding: 8px 13px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.03em;
      border: 1px solid transparent;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-github {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-github:hover {
      background: #1e293b;
    }
    .btn-secondary {
      background: #f1f5f9;
      color: #1e293b;
      border-color: #cbd5e1;
    }
    .btn-secondary:hover {
      background: #e2e8f0;
    }
    a.link {
      color: #2563eb;
      text-decoration: underline;
      cursor: pointer;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-title">AMP Startup Error — Local Server Failed to Start</div>
      <div class="badge">${escapeHtml(appSummary)}</div>
    </div>
    <div class="body">
      <p class="summary">
        AMP could not start or connect to its internal background server on port <strong>${escapeHtml(String(port))}</strong>.
        Copy the crash log below to send to your <strong>Station Admin Contact</strong>, or click <strong>Report Issue on GitHub</strong> to open a pre-filled issue in your browser.
      </p>

      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-label">Application Version:</span>
          <span class="meta-value">${escapeHtml(appSummary)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Operating System:</span>
          <span class="meta-value">${escapeHtml(osSummary)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Admin Contact:</span>
          <span class="meta-value contact-highlight">${escapeHtml(adminContactDisplay)}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">AMP GitHub:</span>
          <span class="meta-value">
            <a class="link" id="repo-link" href="${escapeHtml(AMP_GITHUB_REPO_URL)}">${escapeHtml(AMP_GITHUB_REPO_URL)}</a>
          </span>
        </div>
      </div>

      <div class="log-label-row">
        <span class="log-label">Diagnostic Crash Log (Scrollable — Copy &amp; Send to Admin Contact)</span>
        <span id="copy-status" style="font-size: 11px; font-weight: 700; color: #059669;"></span>
      </div>

      <textarea id="crash-log-box" class="log-box" readonly>${escapeHtml(crashLogLines)}</textarea>

      <div class="actions">
        <div class="btn-group">
          <button type="button" class="btn-primary" id="copy-btn">Copy Crash Log</button>
          <button type="button" class="btn-github" id="github-issue-btn">Report Issue on GitHub</button>
          <button type="button" class="btn-secondary" id="github-repo-btn">Open AMP GitHub</button>
        </div>
        <button type="button" class="btn-secondary" id="retry-btn">Retry Startup</button>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const logBox = document.getElementById('crash-log-box');
      const copyBtn = document.getElementById('copy-btn');
      const copyStatus = document.getElementById('copy-status');
      const issueBtn = document.getElementById('github-issue-btn');
      const repoBtn = document.getElementById('github-repo-btn');
      const repoLink = document.getElementById('repo-link');
      const retryBtn = document.getElementById('retry-btn');

      const issueUrl = ${JSON.stringify(githubNewIssueUrl)};
      const repoUrl = ${JSON.stringify(AMP_GITHUB_REPO_URL)};
      const targetAppUrl = ${JSON.stringify(`http://127.0.0.1:${port}`)};

      function openExternal(url) {
        if (window.electronAPI && typeof window.electronAPI.openExternalUrl === 'function') {
          window.electronAPI.openExternalUrl(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }

      copyBtn.addEventListener('click', function() {
        const text = logBox.value;
        const onCopied = function() {
          copyStatus.textContent = '✓ Copied crash log to clipboard';
          copyBtn.textContent = 'Copied Crash Log';
          setTimeout(function() {
            copyBtn.textContent = 'Copy Crash Log';
          }, 2500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(onCopied).catch(function() {
            logBox.focus();
            logBox.select();
            document.execCommand('copy');
            onCopied();
          });
        } else {
          logBox.focus();
          logBox.select();
          document.execCommand('copy');
          onCopied();
        }
      });

      issueBtn.addEventListener('click', function() {
        openExternal(issueUrl);
      });

      repoBtn.addEventListener('click', function() {
        openExternal(repoUrl);
      });

      repoLink.addEventListener('click', function(e) {
        e.preventDefault();
        openExternal(repoUrl);
      });

      retryBtn.addEventListener('click', function() {
        window.location.href = targetAppUrl;
      });
    })();
  </script>
</body>
</html>`;

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  win.loadURL(dataUrl);
}

let isLiveReadMenuLocked = false;
let currentActiveTab = 'player';
let currentCalendarSubTab = 'calendar';

function buildAppMenu(activeTab = 'player', calendarSubTab = 'calendar') {
  currentActiveTab = activeTab;
  currentCalendarSubTab = calendarSubTab;

  if (appMode !== 'Admin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const sendNavigate = (tab, subTab) => {
    if (isLiveReadMenuLocked) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate-tab', { tab, subTab });
    }
  };

  const openSourceLicensesDetail = `AMP (Announcement Media Player) is licensed under the GNU General Public License v3.0 (GPLv3).

Key Open Source Libraries & Components:
• Electron (Chromium & Node.js runtime) - MIT License
• React & React DOM - MIT License
• Express - MIT License
• Vite & esbuild - MIT License
• Tailwind CSS - MIT License
• Lucide Icons - ISC License
• Motion (motion/react) - MIT License
• electron-builder - MIT License
• date-fns, music-metadata, node-id3, & SheetJS (xlsx) - MIT / Apache 2.0
• Google GenAI & Firebase SDKs - Apache 2.0
• dotenv - BSD-2-Clause

For full component listings and complete license texts, see OPEN_SOURCE_LICENSES.md and LICENSE in the application directory.`;

  const macAppMenu = isMac ? {
    label: app.name || 'AMP',
    submenu: [
      { role: 'about' },
      {
        label: 'Open Source Licenses',
        enabled: !isLiveReadMenuLocked,
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Open Source Licenses',
            message: 'Open Source Licenses and Third-Party Notices',
            detail: openSourceLicensesDetail
          });
        }
      },
      { type: 'separator' },
      { role: 'hide', enabled: !isLiveReadMenuLocked },
      { role: 'hideOthers', enabled: !isLiveReadMenuLocked },
      { role: 'unhide', label: 'Show All', enabled: !isLiveReadMenuLocked },
      { type: 'separator' },
      { role: 'quit' }
    ]
  } : null;

  const fileMenu = {
    label: 'File',
    submenu: [
      ...(isMac ? [
        { role: 'close', label: 'Close Window', accelerator: 'Cmd+W', enabled: !isLiveReadMenuLocked }
      ] : [
        { role: 'quit', label: 'Exit', accelerator: 'Alt+F4' }
      ])
    ]
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Player',
        type: 'radio',
        checked: activeTab === 'player',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('player')
      },
      {
        label: 'Calendar',
        type: activeTab === 'calendar' ? 'submenu' : 'radio',
        checked: activeTab === 'calendar',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('calendar', calendarSubTab || 'calendar'),
        ...(activeTab === 'calendar' ? {
          submenu: [
            {
              label: 'Calendar Grid',
              type: 'radio',
              checked: calendarSubTab === 'calendar',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'calendar')
            },
            {
              label: 'Announcements',
              type: 'radio',
              checked: calendarSubTab === 'list',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'list')
            },
            {
              label: 'Shows',
              type: 'radio',
              checked: calendarSubTab === 'shows',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'shows')
            }
          ]
        } : {})
      },
      {
        label: 'Log',
        type: 'radio',
        checked: activeTab === 'log',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('log')
      },
      { type: 'separator' },
      {
        label: 'Folders',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('folders')
      },
      { type: 'separator' },
      {
        label: 'Reload',
        enabled: !isLiveReadMenuLocked,
        accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
        click: (item, focusedWindow) => {
          if (focusedWindow) focusedWindow.reload();
        }
      }
    ]
  };

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize', accelerator: isMac ? 'Cmd+M' : undefined, enabled: !isLiveReadMenuLocked },
      ...(isMac ? [
        { role: 'zoom', enabled: !isLiveReadMenuLocked }
      ] : [
        {
          label: 'Maximize',
          enabled: !isLiveReadMenuLocked,
          click: (item, focusedWindow) => {
            if (focusedWindow) {
              if (focusedWindow.isMaximized()) {
                focusedWindow.unmaximize();
              } else {
                focusedWindow.maximize();
              }
            }
          }
        },
        { role: 'close', enabled: !isLiveReadMenuLocked }
      ])
    ]
  };

  const helpMenu = {
    label: 'Help',
    submenu: [
      {
        label: 'Local Help / User Manual',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('help')
      },
      ...(!isMac ? [
        {
          label: 'Open Source Licenses',
          enabled: !isLiveReadMenuLocked,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Open Source Licenses',
              message: 'Open Source Licenses and Third-Party Notices',
              detail: openSourceLicensesDetail
            });
          }
        },
        {
          label: 'About AMP',
          enabled: !isLiveReadMenuLocked,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About AMP',
              message: 'AMP - Announcement Media Player',
              detail: `Version 0.20.5\nCross-platform Desktop MP3 Scheduler optimized for MacOS and Windows.`
            });
          }
        }
      ] : [])
    ]
  };

  const template = [
    ...(macAppMenu ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function attachEditContextMenu(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on('context-menu', (event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    const hasSelection = typeof selectionText === 'string' && selectionText.trim().length > 0;
    if (!isEditable && !hasSelection) return;

    const menuItems = isEditable
      ? [
          { role: 'undo', enabled: editFlags.canUndo },
          { role: 'redo', enabled: editFlags.canRedo },
          { type: 'separator' },
          { role: 'cut', enabled: editFlags.canCut },
          { role: 'copy', enabled: editFlags.canCopy },
          { role: 'paste', enabled: editFlags.canPaste },
          { type: 'separator' },
          { role: 'selectAll', enabled: editFlags.canSelectAll }
        ]
      : [
          { role: 'copy', enabled: editFlags.canCopy },
          { type: 'separator' },
          { role: 'selectAll', enabled: editFlags.canSelectAll }
        ];

    const contextMenu = Menu.buildFromTemplate(menuItems);
    contextMenu.popup({ window: win });
  });
}

ipcMain.on('set-active-tab-menu', (event, { tab, subTab }) => {
  currentActiveTab = tab;
  currentCalendarSubTab = subTab;
  buildAppMenu(tab, subTab);
});

ipcMain.on('set-live-read-active', (event, active) => {
  isLiveReadMenuLocked = !!active;
  buildAppMenu(currentActiveTab, currentCalendarSubTab);
});

function getAppIcon() {
  const modeKey = (appMode || 'Admin').toLowerCase();
  const modeDir = path.join(__dirname, 'src', 'assets', 'images', modeKey);

  const candidates = isMac
    ? [
        path.join(modeDir, 'macos', 'icon.icns'),
        path.join(__dirname, 'build', 'icon.icns'),
        path.join(modeDir, 'macos', '512x512@2x.png'),
        path.join(modeDir, 'icon.png'),
        path.join(__dirname, 'build', 'icon.png'),
      ]
    : [
        path.join(modeDir, 'windows', 'icon.ico'),
        path.join(__dirname, 'build', 'icon.ico'),
        path.join(modeDir, 'icon.png'),
        path.join(__dirname, 'build', 'icon.png'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const img = nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          return img;
        }
      } catch (_) {}
    }
  }
  return undefined;
}

function createWindow() {
  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  const appTitle = appMode === 'Live'
    ? "AMP Live"
    : appMode === 'Studio'
      ? "AMP Studio"
      : "AMP Admin";

  const appIcon = getAppIcon();

  let windowOptions = {
    height: 800,
    title: appTitle,
    fullscreenable: false,
    acceptsFirstMouse: true, // Allow direct first-click activation on unfocused/background windows (macOS)
    hasShadow: !disableShadows, // OPTION 3: Disable window shadows on Intel Macs to bypass expensive WindowServer calculations
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Prevent timer & input throttling when window is backgrounded
      devTools: appMode === 'Admin',
      preload: path.join(__dirname, 'preload.cjs'),
    },
  };

  if (appIcon) {
    windowOptions.icon = appIcon;
  }

  if (appMode !== 'Admin') {
    // Disable dev tools and remove menus for Live and Studio versions
    Menu.setApplicationMenu(null);

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { x, y, width, height } = primaryDisplay.workArea;
      windowOptions.width = 250;
      windowOptions.height = height;
      windowOptions.x = x + width - 250;
      windowOptions.y = y;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    } catch (e) {
      windowOptions.width = 250;
      windowOptions.height = 800;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    }
  } else {
    buildAppMenu('player', 'calendar');
  }

  mainWindow = new BrowserWindow(windowOptions);
  attachEditContextMenu(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      const prefix = level >= 3 ? '[Renderer Error]' : '[Renderer Warn]';
      console.error(`${prefix} ${message} (${sourceId}:${line})`);
    }
  });

  // Active polling inter-process status loop to load as soon as port is listening
  function loadAppWhenReady(port, url, win, attempts = 0) {
    if (!win || win.isDestroyed()) return;
    if (startupServerError) {
      console.error('Backend server threw startup exception; rendering diagnostic crash report.');
      renderStartupCrashWindow(win, startupServerError, port);
      return;
    }
    if (attempts > 100) { // 100 * 100ms = 10s max timeout
      console.error('Timeout waiting for backend server; rendering diagnostic crash report.');
      renderStartupCrashWindow(
        win,
        new Error(`Timed out after 10 seconds waiting for local backend server at http://127.0.0.1:${port}/api/settings`),
        port
      );
      return;
    }
    const req = http.get(`http://127.0.0.1:${port}/api/settings`, (res) => {
      if (res.statusCode === 200) {
        console.log(`Backend server is ready on port ${port}. Loading URL.`);
        win.loadURL(url);
      } else {
        setTimeout(() => loadAppWhenReady(port, url, win, attempts + 1), 100);
      }
    });
    req.on('error', () => {
      setTimeout(() => loadAppWhenReady(port, url, win, attempts + 1), 100);
    });
  }

  loadAppWhenReady(serverPort, `http://127.0.0.1:${serverPort}`, mainWindow);

  mainWindow.on('close', function () {
    // When the main window is closed on non-macOS platforms, destroy child popout windows and quit
    if (process.platform !== 'darwin') {
      if (liveReadWindow && !liveReadWindow.isDestroyed()) {
        try {
          liveReadWindow.destroy();
        } catch (_) {}
        liveReadWindow = null;
      }
      app.quit();
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  if (isMac && app.dock && typeof app.dock.setIcon === 'function') {
    const dockIcon = getAppIcon();
    if (dockIcon) {
      try {
        app.dock.setIcon(dockIcon);
      } catch (err) {
        console.warn('Could not set macOS dock icon:', err);
      }
    }
  }

  await startServer();
  createWindow();

  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Set standard default path to Downloads folder
    const fileName = item.getFilename();
    const defaultPath = path.join(app.getPath('downloads'), fileName);

    // Show native save dialog synchronously
    const filePath = dialog.showSaveDialogSync(BrowserWindow.getFocusedWindow() || mainWindow, {
      title: 'Save Exported Log File',
      defaultPath: defaultPath,
      buttonLabel: 'Save'
    });

    if (filePath) {
      item.setSavePath(filePath);
    } else {
      event.preventDefault();
    }
  });
});

app.on('window-all-closed', function () {
  app.quit();
});

app.on('before-quit', () => {
  // Ensure any secondary popouts are destroyed during application shutdown
  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    try {
      liveReadWindow.destroy();
    } catch (_) {}
    liveReadWindow = null;
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Ensure backend server sockets and background Node threads terminate cleanly
app.on('will-quit', () => {
  try {
    process.exit(0);
  } catch (_) {}
});

// ==========================================================================================
// ELECTRON IPC HANDLERS FOR LIVE READ POP-OUT WINDOW (PHASE 2)
// ==========================================================================================
let liveReadWindow = null;
let currentLiveReadData = null; // Holds { name, path, content, isScript, text }

global.spawnLiveRead = async (data) => {
  currentLiveReadData = data;

  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    try {
      liveReadWindow.close();
    } catch (e) {}
  }

  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  const popoutIcon = getAppIcon();

  liveReadWindow = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 480,
    minHeight: 380,
    ...(popoutIcon ? { icon: popoutIcon } : {}),
    title: "Live Read Script - " + (data.name || data.announcementName || "Script"),
    alwaysOnTop: true, // Floats over other apps for the broadcaster
    acceptsFirstMouse: true, // Direct first-click response on macOS
    resizable: true,
    fullscreenable: false,
    hasShadow: !disableShadows,
    titleBarStyle: isMac ? 'hiddenInset' : 'default', // Minimally bordered / modern standard title bar
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      devTools: appMode === 'Admin',
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  liveReadWindow.setMenu(null);
  attachEditContextMenu(liveReadWindow);

  // Load the web app with a special query parameter indicating it is a popout
  const popoutUrl = `http://127.0.0.1:${serverPort}/?popout=true`;
  liveReadWindow.loadURL(popoutUrl);

  liveReadWindow.once('ready-to-show', () => {
    if (liveReadWindow && !liveReadWindow.isDestroyed()) {
      liveReadWindow.show();
      liveReadWindow.focus();
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-read-opened', data);
  }

  isLiveReadMenuLocked = true;
  buildAppMenu(currentActiveTab, currentCalendarSubTab);

  liveReadWindow.on('closed', () => {
    liveReadWindow = null;
    isLiveReadMenuLocked = false;
    buildAppMenu(currentActiveTab, currentCalendarSubTab);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('live-read-closed');
    }
  });

  return { success: true };
};

ipcMain.handle('spawn-live-read', async (event, data) => {
  return global.spawnLiveRead(data);
});

ipcMain.handle('get-live-read-data', async () => {
  return currentLiveReadData;
});

ipcMain.handle('log-live-read-commit', async (event, logEntry) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-read-logged', logEntry);
  }
  return { success: true };
});

ipcMain.handle('focus-live-read-window', async () => {
  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    liveReadWindow.show();
    liveReadWindow.focus();
  }
  return { success: true };
});

ipcMain.handle('close-live-read-window', async () => {
  if (liveReadWindow) {
    try {
      liveReadWindow.close();
    } catch (e) {}
    liveReadWindow = null;
  }
  return { success: true };
});

ipcMain.handle('dialog:openDirectory', async (event, defaultPath) => {
  try {
    const focusedWin = BrowserWindow.getFocusedWindow() || mainWindow;
    if (focusedWin && !focusedWin.isDestroyed()) {
      focusedWin.focus();
    }
    
    const dialogOptions = {
      title: 'Select Playlist Folder',
      properties: ['openDirectory', 'createDirectory']
    };
    if (defaultPath && fs.existsSync(defaultPath)) {
      dialogOptions.defaultPath = defaultPath;
    } else if (isPortableMode && process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(process.env.PORTABLE_EXECUTABLE_DIR)) {
      dialogOptions.defaultPath = process.env.PORTABLE_EXECUTABLE_DIR;
    } else {
      dialogOptions.defaultPath = app.getPath('documents') || app.getPath('home');
    }
    
    const result = focusedWin && !focusedWin.isDestroyed()
      ? await dialog.showOpenDialog(focusedWin, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
      
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: true, cancelled: true };
  } catch (err) {
    console.error('Failed to open native directory selection dialog:', err);
    return { success: false, error: err.message || 'Failed to open directory selection dialog.' };
  }
});

ipcMain.handle('browse-folder', async (event, defaultPath) => {
  try {
    const focusedWin = BrowserWindow.getFocusedWindow() || mainWindow;
    if (focusedWin && !focusedWin.isDestroyed()) {
      focusedWin.focus();
    }
    
    // Ensure default directory exists or fallback safely
    const dialogOptions = {
      title: 'Select Folder Destination',
      properties: ['openDirectory', 'createDirectory']
    };
    if (defaultPath && fs.existsSync(defaultPath)) {
      dialogOptions.defaultPath = defaultPath;
    } else if (isPortableMode && process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(process.env.PORTABLE_EXECUTABLE_DIR)) {
      dialogOptions.defaultPath = process.env.PORTABLE_EXECUTABLE_DIR;
    } else {
      dialogOptions.defaultPath = app.getPath('documents') || app.getPath('home');
    }
    
    // Asynchronous showOpenDialog attached directly to focused window ensures proper z-order and foreground display on macOS
    const result = focusedWin && !focusedWin.isDestroyed()
      ? await dialog.showOpenDialog(focusedWin, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
      
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: true, cancelled: true };
  } catch (err) {
    console.error('Failed to open native directory browse dialog:', err);
    return { success: false, error: err.message || 'Failed to open directory selection dialog.' };
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  try {
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Valid directory path is required' };
    }
    const trimmedPath = targetPath.trim();
    if (!fs.existsSync(trimmedPath)) {
      // Attempt to auto-create directory if user manually typed a valid new path
      try {
        fs.mkdirSync(trimmedPath, { recursive: true });
      } catch (mkdirErr) {
        return { success: false, error: `Directory does not exist and could not be created: ${trimmedPath}` };
      }
    }
    
    // On macOS, try showItemInFolder or openPath natively
    if (process.platform === 'darwin') {
      shell.showItemInFolder(trimmedPath);
      return { success: true };
    }
    
    // Default native open
    const errMsg = await shell.openPath(targetPath);
    if (errMsg) {
      console.warn('shell.openPath returned warning/error:', errMsg);
      return { success: false, error: errMsg };
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to open path natively via shell:', err);
    return { success: false, error: err.message || 'Failed to open path' };
  }
});

ipcMain.handle('clear-app-cache', async (event, options) => {
  const keepFolders = !!(options && options.keepFolders);
  try {
    if (session && session.defaultSession) {
      try {
        await session.defaultSession.clearCache();
      } catch (cacheErr) {
        console.warn('session.defaultSession.clearCache warning:', cacheErr);
      }
      try {
        const storages = keepFolders
          ? ['serviceworkers', 'cachestorage', 'shadercache', 'indexdb']
          : ['serviceworkers', 'cachestorage', 'shadercache', 'indexdb', 'localstorage', 'cookies'];
        await session.defaultSession.clearStorageData({ storages });
      } catch (storageErr) {
        console.warn('session.defaultSession.clearStorageData warning:', storageErr);
      }
    }

    const cacheSubdirs = [
      'Cache',
      'Code Cache',
      'GPUCache',
      'Service Worker',
      'DawnCache',
      'Blob_storage',
      'Network Persistent State',
      ...(keepFolders ? [] : ['Session Storage'])
    ];

    const targetRuntimeDirs = new Set();
    try {
      targetRuntimeDirs.add(app.getPath('userData'));
    } catch (_) {}
    if (!isPortableMode) {
      try {
        const baseAppData = app.getPath('appData');
        for (const modeName of ['AMP-Admin', 'AMP-Live', 'AMP-Studio']) {
          targetRuntimeDirs.add(path.join(baseAppData, modeName));
        }
      } catch (_) {}
    }

    for (const runtimeDir of targetRuntimeDirs) {
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

    return { success: true };
  } catch (err) {
    console.error('Failed to clear Electron app cache:', err);
    return { success: false, error: err.message || 'Failed to clear app cache' };
  }
});

ipcMain.handle('open-dev-tools', async () => {
  try {
    if (appMode !== 'Admin') {
      return { success: false, error: 'Diagnostic console is only available in Admin mode.' };
    }
    const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.openDevTools({ mode: 'detach' });
      return { success: true };
    }
    return { success: false, error: 'No active application window found.' };
  } catch (err) {
    console.error('Failed to open developer tools:', err);
    return { success: false, error: err.message || 'Failed to open developer tools' };
  }
});

ipcMain.handle('open-external-url', async (event, targetUrl) => {
  try {
    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl.trim())) {
      return { success: false, error: 'A valid http/https URL is required.' };
    }
    await shell.openExternal(targetUrl.trim());
    return { success: true };
  } catch (err) {
    console.error('Failed to open external URL:', err);
    return { success: false, error: err.message || 'Failed to open external URL' };
  }
});





