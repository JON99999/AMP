/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  HardDrive,
  Network,
  ShieldCheck,
  Download,
  Folder,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface LocalHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LocalHelpModal({ isOpen, onClose }: LocalHelpModalProps) {
  const [confirmAction, setConfirmAction] = useState<'keep_folders' | 'full' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecuteReset = async (keepFolders: boolean) => {
    setIsProcessing(true);
    setStatusMessage(
      keepFolders
        ? 'Resetting preferences (preserving folder links)...'
        : 'Performing full factory reset...'
    );

    try {
      await fetch('/api/settings/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepFolders }),
      });

      if (keepFolders) {
        let preservedFolders: Record<string, any> | null = null;
        try {
          const raw = localStorage.getItem('amp_location_settings');
          if (raw) {
            const parsed = JSON.parse(raw);
            preservedFolders = {
              mode: parsed.mode || 'Local',
              localPathAmp: parsed.localPathAmp || '',
              driveFolderAmp: parsed.driveFolderAmp || '',
              paths: parsed.paths || null,
              localPathMP3s: parsed.localPathMP3s || '',
              localPathMediaAnnouncements: parsed.localPathMediaAnnouncements || '',
              localPathMediaEvergreens: parsed.localPathMediaEvergreens || '',
              localPathMediaShows: parsed.localPathMediaShows || '',
              localPathLogs: parsed.localPathLogs || '',
              localPathCalendar: parsed.localPathCalendar || '',
              driveFolderLogs: parsed.driveFolderLogs || '',
              driveFolderMP3s: parsed.driveFolderMP3s || '',
              driveFolderPreferences: parsed.driveFolderPreferences || '',
              driveFolderAnnouncements: parsed.driveFolderAnnouncements || '',
              driveFolderEvergreens: parsed.driveFolderEvergreens || '',
              driveFolderShows: parsed.driveFolderShows || '',
            };
          }
        } catch (_) {}

        localStorage.clear();
        sessionStorage.clear();

        if (preservedFolders) {
          localStorage.setItem('amp_location_settings', JSON.stringify(preservedFolders));
        }

        document.documentElement.classList.remove('dark', 'theme-dark-test');
        document.documentElement.classList.add('theme-light');
      } else {
        localStorage.clear();
        sessionStorage.clear();
        document.documentElement.classList.remove('dark', 'theme-dark-test');
        document.documentElement.classList.add('theme-light');
      }

      setStatusMessage('Reset complete. Reloading...');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('Reset error:', err);
      setStatusMessage('Error executing reset. Please retry.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 text-left">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 font-sans">Sync Folder &amp; Setup Guide</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-700 font-sans text-sm leading-relaxed custom-scrollbar">
          
          {/* Section 1: Intro */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-sm font-bold text-slate-900 block mb-1">How Collaborative Sync Works</span>
            <p className="text-slate-600 mb-3.5">
              This app keeps your team in sync by sharing broadcast calendars and logs through a shared folder on cloud storage or a local office network.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <a
                href="#access-requirements"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Folder settings
              </a>
              <a
                href="#cloud-platforms"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Cloud Services
              </a>
              <a
                href="#office-local"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                Office / PC
              </a>
              <a
                href="#macos-noindex"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-purple-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
              >
                macOS .noindex
              </a>
              <a
                href="#system-reset"
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 text-rose-700 border border-slate-300 rounded text-sm font-bold tracking-tight text-center leading-tight transition-all cursor-pointer flex items-center justify-center min-h-[44px] col-span-2 sm:col-span-1"
              >
                Reset &amp; Defaults
              </a>
            </div>
          </div>

          {/* Section 2: Folder Settings & Permissions */}
          <div className="space-y-3" id="access-requirements">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Folder settings &amp; permissions</span>
            </h3>
            <p className="text-slate-600">
              When you choose a main station folder, the application automatically manages and creates these 5 subfolders within it:
            </p>
            <div className="space-y-2">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">1. Settings Folder (settings/ &mdash; Read &amp; Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Stores schedule files (announcements.json, shows_schedule.json) and automated backups. Requires full read and write access so admins and schedulers can update programming.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">2. Logs Folder (logs/ &mdash; Read &amp; Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Stores daily playout logs and audit history files (log_YYYY-MM-DD.json). Requires full read and write access so the broadcast player can continuously record play history.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">3. Media Announcements (media_announcements/ &mdash; Read-Only or Read-Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Stores station IDs, PSAs, promos, and underwriting cart audio. Can be Read-Only on playback machines, or Read-Write on production workstations uploading new spots.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">4. Media Evergreens (media_evergreens/ &mdash; Read-Only or Read-Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Stores prerecorded fallback show episodes organized by show name. Can be Read-Only for playout machines, or Read-Write for show producers.
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block">5. Media Shows (media_shows/ &mdash; Read-Only or Read-Write)</strong>
                <span className="text-slate-600 text-sm block mt-0.5">
                  Stores scheduled show tracks, episodic media, and playlist files. Can be Read-Only for playback terminals, or Read-Write for audio uploaders.
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 italic mt-1">
              Note: Pointing to one main root folder (e.g. AMP_files.noindex/) handles all 5 folders automatically. Individual folder overrides are available in Advanced folder settings if needed.
            </p>
          </div>

          {/* Section 3: Commercial Cloud Setup & Apps */}
          <div className="space-y-3" id="cloud-platforms">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <HardDrive className="w-4 h-4" />
              <span>Cloud Services</span>
            </h3>
            <p className="text-slate-600">
              These cloud services are common and can be used with your OS.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {/* Google Drive */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Google Drive</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Choose "Mirror Files" or select "Available Offline" so MP3 files play instantly without streaming lag.
                  </span>
                </div>
                <a
                  href="https://www.google.com/drive/download/"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>

              {/* OneDrive */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Microsoft OneDrive</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Right-click your folder and choose "Always keep on this device" so files play offline reliably.
                  </span>
                </div>
                <a
                  href="https://www.microsoft.com/microsoft-356/onedrive/download"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>

              {/* Dropbox */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left">
                <div>
                  <strong className="text-slate-900 font-bold block mb-1">Dropbox</strong>
                  <span className="text-slate-600 text-sm block leading-normal mb-3">
                    Right-click folder assets and choose "Make available offline" to avoid playback delays.
                  </span>
                </div>
                <a
                  href="https://www.dropbox.com/install"
                  target="_blank"
                  rel="noreferrer referrer"
                  className="mt-auto px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download App</span>
                </a>
              </div>
            </div>
          </div>

          {/* Section 4: Local Networks & True Local */}
          <div className="space-y-3" id="office-local">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Network className="w-4 h-4" />
              <span>Office or single PC</span>
            </h3>
            <div className="space-y-2 text-left">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block mb-0.5">Local Server &amp; Office Networks</strong>
                <p className="text-slate-600">
                  Calendar, MP3s, and logs can reside on mapped office volumes. Ask your network administrator to set up a folder share that mounts on boot.
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <strong className="text-slate-900 font-bold block mb-0.5">Single PC (True Local Option)</strong>
                <p className="text-slate-600">
                  Calendar and logs can be stored on your local drive, but they will not sync online or with other team members.
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: macOS .noindex Optimization */}
          <div className="space-y-3" id="macos-noindex">
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Folder className="w-4 h-4" />
              <span>macOS Optimization (.noindex)</span>
            </h3>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5 text-left">
              <p className="text-slate-700">
                Adding <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono font-bold text-slate-900">.noindex</code> to the end of your main folder name (e.g., <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono font-bold text-slate-900">AMP_files.noindex</code>) prevents macOS from adding <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs font-mono font-bold text-slate-900">.json</code> schedules, logs, and MP3 files to your Mac's <strong>Finder Recents</strong> list.
              </p>
              <div>
                <strong className="text-slate-900 font-bold block mb-1">How it helps:</strong>
                <ul className="list-disc list-inside space-y-1 text-slate-600 text-sm pl-1">
                  <li>Stops broadcast files and daily play logs from cluttering your personal recent files view in Finder.</li>
                  <li>Eliminates background Spotlight re-indexing overhead whenever the player saves logs or updates schedules.</li>
                  <li>Minimizes risk of non-Admin users from accidentally editing these critical files.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 6: System Maintenance & Reset */}
          <div className="space-y-3" id="system-reset">
            <h3 className="text-sm font-black uppercase tracking-widest text-rose-600 flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <RotateCcw className="w-4 h-4" />
              <span>System Maintenance &amp; Reset</span>
            </h3>
            <p className="text-slate-600">
              Restore default interface configurations or perform a complete clean-slate reinstall. Select an option below:
            </p>

            {/* In-Modal Confirmation Panel */}
            {confirmAction && (
              <div
                className={`p-4 rounded-lg border text-left space-y-3 transition-all ${
                  confirmAction === 'keep_folders'
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                    : 'bg-rose-50/90 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 ${
                      confirmAction === 'keep_folders' ? 'text-amber-600' : 'text-rose-600'
                    }`}
                  />
                  <span className="text-sm font-black uppercase tracking-tight">
                    {confirmAction === 'keep_folders'
                      ? 'Confirm: Reset Preferences (Keep Folders)'
                      : 'Confirm: Full Factory Reset'}
                  </span>
                </div>

                <div className="text-xs leading-relaxed space-y-1">
                  {confirmAction === 'keep_folders' ? (
                    <>
                      <p>
                        <strong>Kept:</strong> Main station folder path, subfolder links, and operating mode.
                      </p>
                      <p>
                        <strong>Reset:</strong> Display theme, calendar modes, issue filters, lookahead windows, and cached tokens will be reverted to factory defaults.
                      </p>
                    </>
                  ) : (
                    <p>
                      <strong>Warning:</strong> All folder definitions, server configurations, credentials, and local preferences will be permanently wiped. You will need to select your station folders again upon restart.
                    </p>
                  )}
                </div>

                {statusMessage && (
                  <div className="text-xs font-mono font-bold flex items-center gap-1.5 text-slate-700 bg-white/80 p-2 rounded border border-slate-200">
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{statusMessage}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setConfirmAction(null);
                      setStatusMessage(null);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleExecuteReset(confirmAction === 'keep_folders')}
                    className={`px-3 py-1.5 text-white rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                      confirmAction === 'keep_folders'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>
                        {confirmAction === 'keep_folders'
                          ? 'Reset Preferences Now'
                          : 'Erase Everything & Reset'}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Action Cards (Hidden while confirming) */}
            {!confirmAction && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Button 1: Reset Preferences (Keep Folders) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left space-y-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                      <strong className="text-slate-900 font-bold text-sm">
                        Reset Preferences
                      </strong>
                    </div>
                    <span className="text-slate-600 text-xs block leading-relaxed">
                      Reverts themes, calendar views, and window offsets to factory defaults. Leaves your configured AMP folder paths and network links intact.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAction('keep_folders');
                      setStatusMessage(null);
                    }}
                    className="w-full mt-auto px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                    <span>Reset (Keep Folders)</span>
                  </button>
                </div>

                {/* Button 2: Full Factory Reset */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between text-left space-y-2.5">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <strong className="text-slate-900 font-bold text-sm">
                        Full Factory Reset
                      </strong>
                    </div>
                    <span className="text-slate-600 text-xs block leading-relaxed">
                      Clears all folder links, server settings, and local preferences. The app restarts into a fresh unconfigured installation state.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmAction('full');
                      setStatusMessage(null);
                    }}
                    className="w-full mt-auto px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 rounded text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                    <span>Full Factory Reset</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-2.5 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-sm font-black uppercase tracking-wider transition-all cursor-pointer font-sans"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
