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
  Clock,
  Lock,
} from 'lucide-react';
import {
  STATION_TIMEZONE_OPTIONS,
  getStationTimezone,
  setStationTimezone,
  getStationTimezoneOption,
  getAdminContactInfo,
  setAdminContactInfo,
  UpNextPromoSettings,
  getUpNextPromoConfig,
  setUpNextPromoConfig,
  ScheduleWindowConfig,
  getScheduleWindowConfig,
  setScheduleWindowConfig,
  getShowLookaroundMinutes,
  formatLookaroundHhMm,
  parseLookaroundHhMm,
  getLiveReadWpm,
} from '../lib/compatibility';
import { clearAudioCache } from '../lib/driveService';

interface LocalHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  stationTimezone?: string;
  onSaveStationTimezone?: (newTimezone: string) => Promise<boolean | void> | void;
  adminContactInfo?: string;
  onSaveAdminContactInfo?: (newContact: string) => Promise<boolean | void> | void;
  upNextPromoConfig?: UpNextPromoSettings;
  onSaveUpNextPromoConfig?: (newConfig: UpNextPromoSettings) => Promise<boolean | void> | void;
  scheduleWindowConfig?: ScheduleWindowConfig;
  onSaveScheduleWindowConfig?: (newConfig: ScheduleWindowConfig) => Promise<boolean | void> | void;
}

export default function LocalHelpModal({
  isOpen,
  onClose,
  isAdmin = false,
  stationTimezone,
  onSaveStationTimezone,
  adminContactInfo,
  onSaveAdminContactInfo,
  upNextPromoConfig,
  onSaveUpNextPromoConfig,
  scheduleWindowConfig,
  onSaveScheduleWindowConfig,
}: LocalHelpModalProps) {
  const [confirmAction, setConfirmAction] = useState<'keep_folders' | 'full' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tzEditStage, setTzEditStage] = useState<'locked' | 'confirm_unlock' | 'editing' | 'confirm_save'>('locked');
  const [draftTimezone, setDraftTimezone] = useState<string>(() => stationTimezone || getStationTimezone());
  const [isSavingTz, setIsSavingTz] = useState(false);
  const [tzStatusMessage, setTzStatusMessage] = useState<string | null>(null);

  const [contactEditStage, setContactEditStage] = useState<'locked' | 'editing'>('locked');
  const [draftAdminContact, setDraftAdminContact] = useState<string>(() =>
    adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo()
  );
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactStatusMessage, setContactStatusMessage] = useState<string | null>(null);

  const [upNextEditStage, setUpNextEditStage] = useState<'locked' | 'editing'>('locked');
  const [draftUpNextEnabled, setDraftUpNextEnabled] = useState<boolean>(() =>
    (upNextPromoConfig || getUpNextPromoConfig()).enabled
  );
  const [draftUpNextMinutes, setDraftUpNextMinutes] = useState<number>(() =>
    (upNextPromoConfig || getUpNextPromoConfig()).minutesBefore
  );
  const [isSavingUpNext, setIsSavingUpNext] = useState(false);
  const [upNextStatusMessage, setUpNextStatusMessage] = useState<string | null>(null);

  const [windowEditStage, setWindowEditStage] = useState<'locked' | 'editing'>('locked');
  const [draftWindowBefore, setDraftWindowBefore] = useState<number>(() =>
    (scheduleWindowConfig || getScheduleWindowConfig()).windowBeforeMinutes
  );
  const [draftWindowAfter, setDraftWindowAfter] = useState<number>(() =>
    (scheduleWindowConfig || getScheduleWindowConfig()).windowAfterMinutes
  );
  const [draftShowLookaroundText, setDraftShowLookaroundText] = useState<string>(() =>
    formatLookaroundHhMm(scheduleWindowConfig || getScheduleWindowConfig())
  );
  const [isSavingWindow, setIsSavingWindow] = useState(false);
  const [windowStatusMessage, setWindowStatusMessage] = useState<string | null>(null);

  const [wpmEditStage, setWpmEditStage] = useState<'locked' | 'editing'>('locked');
  const [draftLiveReadWpm, setDraftLiveReadWpm] = useState<number>(() =>
    getLiveReadWpm(scheduleWindowConfig || getScheduleWindowConfig())
  );
  const [isSavingWpm, setIsSavingWpm] = useState(false);
  const [wpmStatusMessage, setWpmStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeTz = stationTimezone || getStationTimezone();
  const activeTzOption = getStationTimezoneOption(activeTz);
  const draftTzOption = getStationTimezoneOption(draftTimezone);
  const activeAdminContact = adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo();
  const activeUpNext = upNextPromoConfig || getUpNextPromoConfig();
  const activeScheduleWindow = scheduleWindowConfig || getScheduleWindowConfig();
  const activeLiveReadWpm = getLiveReadWpm(activeScheduleWindow);

  const handleExecuteReset = async (keepFolders: boolean) => {
    setIsProcessing(true);
    setStatusMessage(
      keepFolders
        ? 'Resetting preferences and clearing runtime cache (preserving folder links)...'
        : 'Performing full factory reset and clearing runtime caches...'
    );

    try {
      let preservedFolders: Record<string, any> | null = null;
      if (keepFolders) {
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
      }

      await fetch('/api/settings/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepFolders }),
      });

      if (typeof window !== 'undefined' && window.electronAPI?.clearAppCache) {
        try {
          await window.electronAPI.clearAppCache({ keepFolders });
        } catch (ipcErr) {
          console.warn('Electron clearAppCache warning:', ipcErr);
        }
      }

      try {
        clearAudioCache();
      } catch (_) {}

      localStorage.clear();
      sessionStorage.clear();

      if (keepFolders && preservedFolders) {
        localStorage.setItem('amp_location_settings', JSON.stringify(preservedFolders));
      }

      document.documentElement.classList.remove('dark', 'theme-dark-test');
      document.documentElement.classList.add('theme-light');

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
              Manage station-wide broadcast timezone settings, restore default interface configurations, or perform a clean-slate reset:
            </p>

            {/* Station Timezone Maintenance Card (Admin Only) */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <strong className="text-slate-900 font-bold text-sm">
                    Station Timezone (Broadcast Origin)
                  </strong>
                </div>
                <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800">
                  {activeTzOption.label}
                </span>
              </div>

              {tzStatusMessage && (
                <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{tzStatusMessage}</span>
                </div>
              )}

              {!isAdmin ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100/80 p-2.5 rounded border border-slate-200">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Station Timezone is read-only in Live / Non-Admin mode. Switch to <strong>Admin Mode</strong> to modify the broadcast timezone.
                  </span>
                </div>
              ) : tzEditStage === 'locked' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Defines the wall-clock timezone where the broadcast originates. Used across all schedules, Live clocks, Prerecord/Export slots, and Calendar audits.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftTimezone(activeTz);
                      setTzStatusMessage(null);
                      setTzEditStage('confirm_unlock');
                    }}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-350 rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                  >
                    Edit Station Timezone...
                  </button>
                </div>
              ) : tzEditStage === 'confirm_unlock' ? (
                <div className="p-3.5 bg-amber-50/95 border border-amber-300 rounded-lg space-y-2.5 text-amber-950">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-tight">
                      Are You Sure You Want to Edit the Station Timezone?
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-xs space-y-1 leading-relaxed text-amber-900">
                    <li>
                      <strong>Broadcast Origin Requirement:</strong> This setting must be set to the timezone where the broadcast originates from. Users working remotely in other timezones should not change this to their personal timezone.
                    </li>
                    <li>
                      <strong>What Will Not Be Changed:</strong> Existing Show start hours, Announcement grid rules, and naive start/end dates are not rewritten when you change the timezone.
                    </li>
                    <li>
                      <strong>Historical Log Alignment Warning:</strong> Because playout history in <code className="font-mono font-bold">logs.json</code> is stored in UTC, changing the station timezone shifts which wall-clock hour slots historical logs map into on the Calendar and Audit views.
                    </li>
                  </ul>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setTzEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftTimezone(activeTz);
                        setTzEditStage('editing');
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all"
                    >
                      Yes, Unlock Timezone Editor
                    </button>
                  </div>
                </div>
              ) : tzEditStage === 'editing' ? (
                <div className="p-3.5 bg-white border border-blue-200 rounded-lg space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="maintenance-station-timezone-select"
                      className="text-xs font-black uppercase tracking-wider text-slate-700 block"
                    >
                      Select Broadcast Origin Timezone
                    </label>
                    <select
                      id="maintenance-station-timezone-select"
                      value={draftTimezone}
                      onChange={(e) => setDraftTimezone(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {STATION_TIMEZONE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 pt-0.5">
                      Set strictly to the timezone where the station broadcast originates.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setTzEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={draftTimezone === activeTz}
                      onClick={() => setTzEditStage('confirm_save')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Review &amp; Save Change...
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-rose-50/95 border border-rose-300 rounded-lg space-y-2.5 text-rose-950">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-tight">
                      Are You Sure You Want to Save This Timezone Change?
                    </span>
                  </div>
                  <div className="text-xs space-y-1.5 leading-relaxed text-rose-900">
                    <p>
                      <strong>From:</strong> {activeTzOption.label}
                      <br />
                      <strong>To:</strong> {draftTzOption.label}
                    </p>
                    <p>
                      <strong>Broadcast Origin Warning:</strong> Confirm that <strong>{draftTzOption.label}</strong> is the timezone where your broadcast originates. Every workstation sharing this station folder will adopt this timezone.
                    </p>
                    <p>
                      <strong>Schedule &amp; Log Impact:</strong> Show start hours and Announcement slot hours will stay at their current wall-clock numbers (they are not shifted), while existing UTC play records in <code className="font-mono font-bold">logs.json</code> will now be interpreted in {draftTzOption.offsetLabel} (which may shift how prior plays align with past calendar slots).
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingTz}
                      onClick={() => setTzEditStage('editing')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={isSavingTz}
                      onClick={() => setTzEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingTz}
                      onClick={async () => {
                        setIsSavingTz(true);
                        try {
                          setStationTimezone(draftTimezone);
                          if (onSaveStationTimezone) {
                            await onSaveStationTimezone(draftTimezone);
                          }
                          setTzEditStage('locked');
                          setTzStatusMessage(`Station timezone updated to ${draftTzOption.label}.`);
                        } finally {
                          setIsSavingTz(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingTz ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Confirm &amp; Save Timezone</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Contact Information Card (Admin Only) */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" />
                  <strong className="text-slate-900 font-bold text-sm">
                    Admin Contact Information
                  </strong>
                </div>
                <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 max-w-[260px] truncate">
                  {activeAdminContact || 'Not configured'}
                </span>
              </div>

              {contactStatusMessage && (
                <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{contactStatusMessage}</span>
                </div>
              )}

              {!isAdmin ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100/80 p-2.5 rounded border border-slate-200">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Admin Contact Information is read-only in Live / Non-Admin mode. Switch to <strong>Admin Mode</strong> to edit contact details.
                  </span>
                </div>
              ) : contactEditStage === 'locked' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Displayed on the Calendar Admin warning screen and in the &quot;Get Help&quot; tooltip and pop-up when a card has a missing or invalid file.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftAdminContact(activeAdminContact);
                      setContactStatusMessage(null);
                      setContactEditStage('editing');
                    }}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-350 rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                  >
                    Edit Admin Contact...
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-white border border-purple-200 rounded-lg space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="maintenance-admin-contact-input"
                      className="text-xs font-black uppercase tracking-wider text-slate-700 block"
                    >
                      Admin Contact Details
                    </label>
                    <textarea
                      id="maintenance-admin-contact-input"
                      rows={2}
                      value={draftAdminContact}
                      onChange={(e) => setDraftAdminContact(e.target.value)}
                      placeholder="e.g., Admin 1 — admin@station.org / (555) 000-0000"
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingContact}
                      onClick={() => setContactEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingContact}
                      onClick={async () => {
                        setIsSavingContact(true);
                        try {
                          const cleaned = setAdminContactInfo(draftAdminContact);
                          if (onSaveAdminContactInfo) {
                            await onSaveAdminContactInfo(cleaned);
                          }
                          setContactEditStage('locked');
                          setContactStatusMessage(
                            cleaned
                              ? 'Admin contact information saved.'
                              : 'Admin contact information cleared.'
                          );
                        } finally {
                          setIsSavingContact(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingContact ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Contact Info</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* "Up Next" Auto-Seeded Show Promo Cards Configuration */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-left space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <strong className="text-slate-900 font-bold text-sm">
                    &ldquo;Up Next&rdquo; Auto-Seeded Show Promo Cards
                  </strong>
                </div>
                <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800">
                  {activeUpNext.enabled
                    ? `Enabled — ${activeUpNext.minutesBefore} mins before each show`
                    : 'Disabled'}
                </span>
              </div>

              {upNextStatusMessage && (
                <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{upNextStatusMessage}</span>
                </div>
              )}

              {!isAdmin ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100/80 p-2.5 rounded border border-slate-200">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    &ldquo;Up Next&rdquo; Promo Settings are read-only in Live / Non-Admin mode. Switch to <strong>Admin Mode</strong> to edit promo settings.
                  </span>
                </div>
              ) : upNextEditStage === 'locked' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5">
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Automatically seeds a Live Read promo card on the schedule timeline before each upcoming show (included across Live, Prerecord, Export, Playlist, and Calendar).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftUpNextEnabled(activeUpNext.enabled);
                      setDraftUpNextMinutes(activeUpNext.minutesBefore);
                      setUpNextStatusMessage(null);
                      setUpNextEditStage('editing');
                    }}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-350 rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                  >
                    Edit Up Next Settings...
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-white border border-purple-200 rounded-lg space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draftUpNextEnabled}
                      onChange={(e) => setDraftUpNextEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-900">
                      Enable Auto-Seeded &ldquo;Up Next&rdquo; Show Promo Cards
                    </span>
                  </label>

                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                      Minutes Before Next Show (1–120 mins)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={draftUpNextMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setDraftUpNextMinutes(isNaN(val) ? 20 : Math.max(1, Math.min(120, val)));
                        }}
                        className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-xs text-slate-600">
                        minutes before show start (default <code className="font-mono font-bold">20</code> mins, e.g. <code className="font-mono font-bold">:40</code> for shows starting on the hour)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 pt-0.5">
                      Individual shows can also be included or excluded using the checkbox in the Show Editor.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingUpNext}
                      onClick={() => setUpNextEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingUpNext}
                      onClick={async () => {
                        setIsSavingUpNext(true);
                        try {
                          const updated = setUpNextPromoConfig({
                            enabled: draftUpNextEnabled,
                            minutesBefore: draftUpNextMinutes,
                          });
                          if (onSaveUpNextPromoConfig) {
                            await onSaveUpNextPromoConfig(updated);
                          }
                          setUpNextEditStage('locked');
                          setUpNextStatusMessage(
                            updated.enabled
                              ? `Up Next promos enabled (${updated.minutesBefore} mins before each show).`
                              : 'Up Next promos disabled.'
                          );
                        } finally {
                          setIsSavingUpNext(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingUpNext ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Up Next Settings</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Live Schedule Window (-x / +y mins & Show Lookaround) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Live Schedule Window (&ldquo;Now&rdquo; Window &amp; Show Lookaround)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Controls the active <strong className="text-slate-900">&ldquo;Now&rdquo;</strong> broadcast window (<code className="font-mono font-bold">-x</code> mins grace before Missed, <code className="font-mono font-bold">+y</code> mins early lookahead) and how many hours before/after the current show remain visible in the Live timeline.
                  </p>
                </div>
              </div>

              {windowStatusMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{windowStatusMessage}</span>
                </div>
              )}

              {!isAdmin ? (
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2 text-xs text-slate-600">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Live Schedule Window settings are read-only in Live / Non-Admin mode (currently{' '}
                    <strong className="text-slate-900">
                      -{activeScheduleWindow.windowBeforeMinutes}m grace / +{activeScheduleWindow.windowAfterMinutes}m early · {formatLookaroundHhMm(activeScheduleWindow)} show lookaround
                    </strong>
                    ). Switch to <strong className="text-slate-800">Admin Mode</strong> to edit schedule window settings.
                  </span>
                </div>
              ) : windowEditStage === 'locked' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-start gap-2 min-w-0">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Current Live Schedule Window
                      </span>
                      <span className="text-xs font-bold text-slate-900 block">
                        -{activeScheduleWindow.windowBeforeMinutes}m grace / +{activeScheduleWindow.windowAfterMinutes}m early · {formatLookaroundHhMm(activeScheduleWindow)} show lookaround
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftWindowBefore(activeScheduleWindow.windowBeforeMinutes);
                      setDraftWindowAfter(activeScheduleWindow.windowAfterMinutes);
                      setDraftShowLookaroundText(formatLookaroundHhMm(activeScheduleWindow));
                      setWindowStatusMessage(null);
                      setWindowEditStage('editing');
                    }}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-350 rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                  >
                    Edit Schedule Window...
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-white border border-purple-200 rounded-lg space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                        Grace Window (-x mins)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={draftWindowBefore}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setDraftWindowBefore(isNaN(val) ? 5 : Math.max(1, Math.min(60, val)));
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Mins after slot before Missed (default <code className="font-mono font-bold">5</code>m).
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                        Early Window (+y mins)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={draftWindowAfter}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setDraftWindowAfter(isNaN(val) ? 5 : Math.max(1, Math.min(60, val)));
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Mins before slot to enter Now (default <code className="font-mono font-bold">5</code>m).
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                        Show Lookaround (hh:mm)
                      </label>
                      <input
                        type="text"
                        placeholder="01:00"
                        value={draftShowLookaroundText}
                        onChange={(e) => setDraftShowLookaroundText(e.target.value)}
                        onBlur={() => {
                          const parsedMins = parseLookaroundHhMm(
                            draftShowLookaroundText,
                            getShowLookaroundMinutes(activeScheduleWindow)
                          );
                          setDraftShowLookaroundText(formatLookaroundHhMm(parsedMins));
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        Adjacent time shown around show (<code className="font-mono font-bold">00:00</code>–<code className="font-mono font-bold">06:00</code>, default <code className="font-mono font-bold">01:00</code>).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingWindow}
                      onClick={() => setWindowEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingWindow}
                      onClick={async () => {
                        setIsSavingWindow(true);
                        try {
                          const lookaroundMins = parseLookaroundHhMm(
                            draftShowLookaroundText,
                            getShowLookaroundMinutes(activeScheduleWindow)
                          );
                          const updated = setScheduleWindowConfig({
                            windowBeforeMinutes: draftWindowBefore,
                            windowAfterMinutes: draftWindowAfter,
                            showLookaroundMinutes: lookaroundMins,
                            showLookaroundHours: Number((lookaroundMins / 60).toFixed(4)),
                          });
                          setDraftShowLookaroundText(formatLookaroundHhMm(updated));
                          if (onSaveScheduleWindowConfig) {
                            await onSaveScheduleWindowConfig(updated);
                          }
                          setWindowEditStage('locked');
                          setWindowStatusMessage(
                            `Live Schedule Window saved (-${updated.windowBeforeMinutes}m / +${updated.windowAfterMinutes}m · ${formatLookaroundHhMm(updated)} lookaround).`
                          );
                        } finally {
                          setIsSavingWindow(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingWindow ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Schedule Window</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Live Read Calculation Speed (WPM) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Live Read Calculation Speed (WPM)
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800">
                  {activeLiveReadWpm} WPM
                </span>
              </div>

              {wpmStatusMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{wpmStatusMessage}</span>
                </div>
              )}

              {!isAdmin ? (
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center gap-2 text-xs text-slate-600">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    Live Read Calculation Speed is read-only in Live / Non-Admin mode (currently{' '}
                    <strong className="text-slate-900">{activeLiveReadWpm} words per minute</strong>). Switch to{' '}
                    <strong className="text-slate-800">Admin Mode</strong> to edit WPM speed.
                  </span>
                </div>
              ) : wpmEditStage === 'locked' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Used to calculate automatic <strong className="text-slate-900">Approx. Read Time</strong> estimates (<code className="font-mono font-bold">0mXXs</code>, rounded up to the nearest 5 seconds) in the Live Read Editor and legacy script upgrades (default <code className="font-mono font-bold">150</code> WPM).
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftLiveReadWpm(activeLiveReadWpm);
                      setWpmStatusMessage(null);
                      setWpmEditStage('editing');
                    }}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-350 rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                  >
                    Edit Live Read WPM...
                  </button>
                </div>
              ) : (
                <div className="p-3.5 bg-white border border-purple-200 rounded-lg space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                      Words Per Minute (50–300 WPM)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={300}
                        value={draftLiveReadWpm}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setDraftLiveReadWpm(isNaN(val) ? 150 : Math.max(50, Math.min(300, val)));
                        }}
                        className="w-28 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-xs text-slate-600">
                        words per minute (default <code className="font-mono font-bold">150</code> WPM &mdash; 2.5 words/sec)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSavingWpm}
                      onClick={() => setWpmEditStage('locked')}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSavingWpm}
                      onClick={async () => {
                        setIsSavingWpm(true);
                        try {
                          const clampedWpm = Math.max(50, Math.min(300, Math.round(draftLiveReadWpm || 150)));
                          const updated = setScheduleWindowConfig({
                            liveReadWpm: clampedWpm,
                          });
                          if (onSaveScheduleWindowConfig) {
                            await onSaveScheduleWindowConfig(updated);
                          }
                          setWpmEditStage('locked');
                          setWpmStatusMessage(`Live Read calculation speed saved (${updated.liveReadWpm} WPM).`);
                        } finally {
                          setIsSavingWpm(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSavingWpm ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Live Read WPM</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

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

            {/* Buried Admin Diagnostic Console (#64) */}
            {isAdmin && typeof window !== 'undefined' && !!window.electronAPI?.openDevTools && (
              <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-400">
                <span>Advanced Admin Diagnostics</span>
                <button
                  type="button"
                  onClick={() => {
                    window.electronAPI?.openDevTools?.();
                  }}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-transparent hover:border-slate-300 transition-colors cursor-pointer"
                >
                  Open Diagnostic Console
                </button>
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
