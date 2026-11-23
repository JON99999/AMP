import React, { useState, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { Announcement, Show, LogEntry, UpNextPromoConfig, AdminMessage, AdminMessageAckRecord } from '../types';
import { normalizeAnnouncements, isTimeInShow, getActualShowStart, classifyMediaAsset, isUpNextPromoUrl, formatUpNextPromoFilename } from '../lib/utils';
import {
  CURRENT_APP_VERSION,
  getStationTimezone,
  setStationTimezone,
  detectSystemStationTimezone,
  getStationNow,
  stationSlotDateToUtcIso,
  getAdminContactInfo,
  setAdminContactInfo,
  getUpNextPromoConfig,
  setUpNextPromoConfig,
  getScheduleWindowConfig,
  setScheduleWindowConfig,
  getAdminMessages,
  setAdminMessages,
  ScheduleWindowConfig,
} from '../lib/compatibility';
import {
  normalizeAdminMessages,
  getStationAirDateStr,
  markStartupMessageAcknowledgedLocal,
  isSystemBuiltInMessage,
} from '../lib/adminMessages';
import {
  getMachinePersona,
  getEffectivePersonaLabel,
  getRuntimeAppContext,
} from '../lib/machinePersona';
import {
  getSavedSettings,
  getAccessToken,
  getStorageApiHeaders,
} from '../lib/driveService';
import { SaveRecoveryInfo } from '../components/SaveRecoveryModal';

export interface UseScheduleManagerProps {
  token?: string | null;
  now: Date;
  playMode: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
  selectedPrerecordShowId?: string;
  selectedPlaylistShow?: Show | null;
  onShowLocationsModal?: () => void;
  isReadOnly?: boolean;
}

export interface UseScheduleManagerResult {
  announcements: Announcement[];
  setAnnouncements: Dispatch<SetStateAction<Announcement[]>>;
  shows: Show[];
  setShows: Dispatch<SetStateAction<Show[]>>;
  logs: LogEntry[];
  setLogs: Dispatch<SetStateAction<LogEntry[]>>;
  isSaving: boolean;
  savingLabel: string | null;
  saveRecoveryModal: SaveRecoveryInfo | null;
  setSaveRecoveryModal: Dispatch<SetStateAction<SaveRecoveryInfo | null>>;
  loadShows: () => Promise<void>;
  saveShows: (
    newShows: Show[],
    explicitStationTimezone?: string,
    explicitAdminContactInfo?: string,
    explicitUpNextPromo?: UpNextPromoConfig,
    explicitScheduleWindow?: ScheduleWindowConfig,
    explicitAdminMessages?: AdminMessage[]
  ) => Promise<boolean>;
  stationTimezone: string;
  saveStationTimezone: (newTimezone: string) => Promise<boolean>;
  adminContactInfo: string;
  hasSavedAdminContact: boolean;
  saveAdminContactInfo: (newContact: string) => Promise<boolean>;
  upNextPromoConfig: UpNextPromoConfig;
  saveUpNextPromoConfig: (newConfig: UpNextPromoConfig) => Promise<boolean>;
  scheduleWindowConfig: ScheduleWindowConfig;
  saveScheduleWindowConfig: (newConfig: ScheduleWindowConfig) => Promise<boolean>;
  adminMessages: AdminMessage[];
  setAdminMessagesState: Dispatch<SetStateAction<AdminMessage[]>>;
  saveAdminMessages: (newMessages: AdminMessage[]) => Promise<boolean>;
  acknowledgeAdminMessage: (
    message: AdminMessage,
    context?: {
      show?: Show | null;
      airDate?: Date;
      playMode?: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
    }
  ) => Promise<boolean>;
  saveAnnouncements: (newAnnouncements: Announcement[]) => Promise<boolean>;
  addLog: (entry: LogEntry) => Promise<void>;
}

export function useScheduleManager({
  token,
  now,
  playMode,
  selectedPrerecordShowId,
  selectedPlaylistShow,
  onShowLocationsModal,
  isReadOnly = false,
}: UseScheduleManagerProps): UseScheduleManagerResult {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [stationTimezone, setStationTimezoneState] = useState<string>(() => getStationTimezone());
  const [adminContactInfo, setAdminContactInfoState] = useState<string>(() => getAdminContactInfo());
  const [hasSavedAdminContact, setHasSavedAdminContact] = useState<boolean>(false);
  const [upNextPromoConfig, setUpNextPromoConfigState] = useState<UpNextPromoConfig>(() => getUpNextPromoConfig());
  const [scheduleWindowConfig, setScheduleWindowConfigState] = useState<ScheduleWindowConfig>(() => getScheduleWindowConfig());
  const [adminMessages, setAdminMessagesState] = useState<AdminMessage[]>(() =>
    normalizeAdminMessages(getAdminMessages())
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  const [saveRecoveryModal, setSaveRecoveryModal] = useState<SaveRecoveryInfo | null>(null);

  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;

  const showsRef = useRef(shows);
  showsRef.current = shows;

  const adminMessagesRef = useRef(adminMessages);
  adminMessagesRef.current = adminMessages;

  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;

  const selectedPrerecordShowIdRef = useRef(selectedPrerecordShowId);
  selectedPrerecordShowIdRef.current = selectedPrerecordShowId;

  const selectedPlaylistShowRef = useRef(selectedPlaylistShow);
  selectedPlaylistShowRef.current = selectedPlaylistShow;

  const loadShows = useCallback(async () => {
    const settings = getSavedSettings();
    try {
      if (settings.mode === 'Drive') {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive.');
        }
      }
      const headers = await getStorageApiHeaders();
      const res = await fetch('/api/shows?withEnvelope=true', { headers });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload)) {
          const sysTz = setStationTimezone(detectSystemStationTimezone());
          setStationTimezoneState(sysTz);
          setShows(payload);
        } else if (payload && typeof payload === 'object') {
          const loadedShows = Array.isArray(payload.data) ? payload.data : [];
          const rawContact = payload.adminContactInfo !== undefined ? payload.adminContactInfo : payload._meta?.adminContactInfo;
          const existingLocalContact = getAdminContactInfo();
          const effectiveContact =
            rawContact && String(rawContact).trim()
              ? String(rawContact).trim()
              : payload.hasSavedAdminContact && rawContact !== undefined
                ? String(rawContact).trim()
                : existingLocalContact;
          if (effectiveContact !== undefined) {
            const resolvedContact = setAdminContactInfo(effectiveContact);
            setAdminContactInfoState(resolvedContact);
          }
          setHasSavedAdminContact(Boolean(payload.hasSavedAdminContact || effectiveContact));

          const rawUpNext = payload.upNextPromo || payload._meta?.upNextPromo;
          if (rawUpNext && (payload.hasSavedTimezone || payload._meta)) {
            const resolvedUpNext = setUpNextPromoConfig(rawUpNext);
            setUpNextPromoConfigState(resolvedUpNext);
          }

          const rawScheduleWindow = payload.scheduleWindow || payload._meta?.scheduleWindow;
          if (rawScheduleWindow && (payload.hasSavedTimezone || payload._meta)) {
            const resolvedScheduleWindow = setScheduleWindowConfig(rawScheduleWindow);
            setScheduleWindowConfigState(resolvedScheduleWindow);
          }

          const rawAdminMessages = Array.isArray(payload.adminMessages)
            ? payload.adminMessages
            : Array.isArray(payload._meta?.adminMessages)
              ? payload._meta.adminMessages
              : undefined;
          if (rawAdminMessages !== undefined) {
            const normalizedMsgs = normalizeAdminMessages(rawAdminMessages);
            setAdminMessages(normalizedMsgs);
            setAdminMessagesState(normalizedMsgs);
          }

          if (!payload.hasSavedTimezone) {
            const sysTz = setStationTimezone(detectSystemStationTimezone());
            setStationTimezoneState(sysTz);
            setShows(loadedShows);
            if (!isReadOnlyRef.current) {
              fetch('/api/shows', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  stationTimezone: sysTz,
                  ...(effectiveContact !== undefined ? { adminContactInfo: effectiveContact } : {}),
                  upNextPromo: getUpNextPromoConfig(),
                  scheduleWindow: getScheduleWindowConfig(),
                  adminMessages: rawAdminMessages !== undefined ? normalizeAdminMessages(rawAdminMessages) : getAdminMessages(),
                  data: loadedShows
                }),
              }).catch(() => {});
            }
          } else {
            const resolvedTz = setStationTimezone(payload.stationTimezone || payload._meta?.stationTimezone || detectSystemStationTimezone());
            setStationTimezoneState(resolvedTz);
            setShows(loadedShows);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load shows:', e);
    }
  }, [token]);

  const saveShows = useCallback(async (
    newShows: Show[],
    explicitStationTimezone?: string,
    explicitAdminContactInfo?: string,
    explicitUpNextPromo?: UpNextPromoConfig,
    explicitScheduleWindow?: ScheduleWindowConfig,
    explicitAdminMessages?: AdminMessage[]
  ): Promise<boolean> => {
    if (isReadOnlyRef.current) {
      console.warn('Saving shows skipped: Station data is in read-only compatibility mode.');
      return false;
    }
    const targetTz = explicitStationTimezone ? setStationTimezone(explicitStationTimezone) : getStationTimezone();
    setStationTimezoneState(targetTz);
    const targetContact =
      explicitAdminContactInfo !== undefined
        ? setAdminContactInfo(explicitAdminContactInfo)
        : getAdminContactInfo();
    setAdminContactInfoState(targetContact);
    const targetUpNext =
      explicitUpNextPromo !== undefined
        ? setUpNextPromoConfig(explicitUpNextPromo)
        : getUpNextPromoConfig();
    setUpNextPromoConfigState(targetUpNext);
    const targetScheduleWindow =
      explicitScheduleWindow !== undefined
        ? setScheduleWindowConfig(explicitScheduleWindow)
        : getScheduleWindowConfig();
    setScheduleWindowConfigState(targetScheduleWindow);
    const targetAdminMessages =
      explicitAdminMessages !== undefined
        ? setAdminMessages(normalizeAdminMessages(explicitAdminMessages))
        : getAdminMessages();
    setAdminMessagesState(targetAdminMessages);
    const settings = getSavedSettings();
    setIsSaving(true);
    setSavingLabel('Saving shows profile...');

    try {
      if (settings.mode === 'Drive') {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive. Saving is disabled.');
        }
      }
      const headers = await getStorageApiHeaders();
      const res = await fetch('/api/shows', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stationTimezone: targetTz,
          adminContactInfo: targetContact,
          upNextPromo: targetUpNext,
          scheduleWindow: targetScheduleWindow,
          adminMessages: targetAdminMessages,
          data: newShows
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Failed to write shows (Status ${res.status})`);
      }
      setShows(newShows);
      if (Array.isArray(data.announcements)) {
        setAnnouncements(normalizeAnnouncements(data.announcements));
      }
      if (explicitAdminContactInfo !== undefined || targetContact) {
        setHasSavedAdminContact(true);
      }
      setIsSaving(false);
      setSavingLabel(null);
      return true;
    } catch (error: any) {
      setIsSaving(false);
      setSavingLabel(null);
      console.error('Failed to save shows:', error);
      setSaveRecoveryModal({
        title: settings.mode === 'Drive' ? 'Failed to Save Shows to Google Drive' : 'Failed to Save Shows File',
        targetName: 'shows.json',
        filePath: settings.mode === 'Drive' ? (settings.driveFolderPreferences || 'Google Drive Preferences Folder') : (settings.localPathCalendar || 'Local Shows Storage'),
        error: error.message || 'Write error',
        retryAction: async () => {
          await saveShows(newShows, targetTz, targetContact, targetUpNext, targetScheduleWindow, targetAdminMessages);
        },
        onFixFolder: () => {
          if (onShowLocationsModal) onShowLocationsModal();
        }
      });
      return false;
    }
  }, [token, onShowLocationsModal]);

  const saveStationTimezone = useCallback(async (newTimezone: string): Promise<boolean> => {
    const resolvedTz = setStationTimezone(newTimezone);
    setStationTimezoneState(resolvedTz);
    return saveShows(showsRef.current, resolvedTz, getAdminContactInfo(), getUpNextPromoConfig(), getScheduleWindowConfig(), adminMessagesRef.current);
  }, [saveShows]);

  const saveAdminContactInfo = useCallback(async (newContact: string): Promise<boolean> => {
    const resolvedContact = setAdminContactInfo(newContact);
    setAdminContactInfoState(resolvedContact);
    setHasSavedAdminContact(true);
    return saveShows(showsRef.current, getStationTimezone(), resolvedContact, getUpNextPromoConfig(), getScheduleWindowConfig(), adminMessagesRef.current);
  }, [saveShows]);

  const saveUpNextPromoConfig = useCallback(async (newConfig: UpNextPromoConfig): Promise<boolean> => {
    const resolvedUpNext = setUpNextPromoConfig(newConfig);
    setUpNextPromoConfigState(resolvedUpNext);
    return saveShows(showsRef.current, getStationTimezone(), getAdminContactInfo(), resolvedUpNext, getScheduleWindowConfig(), adminMessagesRef.current);
  }, [saveShows]);

  const saveScheduleWindowConfig = useCallback(async (newConfig: ScheduleWindowConfig): Promise<boolean> => {
    const resolvedWindow = setScheduleWindowConfig(newConfig);
    setScheduleWindowConfigState(resolvedWindow);
    return saveShows(showsRef.current, getStationTimezone(), getAdminContactInfo(), getUpNextPromoConfig(), resolvedWindow, adminMessagesRef.current);
  }, [saveShows]);

  const saveAdminMessages = useCallback(async (newMessages: AdminMessage[]): Promise<boolean> => {
    const normalized = normalizeAdminMessages(newMessages);
    setAdminMessages(normalized);
    setAdminMessagesState(normalized);
    return saveShows(
      showsRef.current,
      getStationTimezone(),
      getAdminContactInfo(),
      getUpNextPromoConfig(),
      getScheduleWindowConfig(),
      normalized
    );
  }, [saveShows]);

  const saveAnnouncements = useCallback(async (newAnnouncements: Announcement[]): Promise<boolean> => {
    if (isReadOnlyRef.current) {
      console.warn('Saving announcements skipped: Station data is in read-only compatibility mode.');
      return false;
    }
    const persistedOnly = (newAnnouncements || []).filter(
      (a) => a && !a.isUpNextPromo && !String(a.id || '').startsWith('up-next-promo-')
    );
    const normalized = normalizeAnnouncements(persistedOnly);
    const settings = getSavedSettings();
    setIsSaving(true);
    setSavingLabel('Saving announcements schedule...');

    try {
      if (settings.mode === 'Drive') {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive. Saving is disabled.');
        }
      }
      const headers = await getStorageApiHeaders();
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers,
        body: JSON.stringify(normalized),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Failed to write announcements (Status ${res.status})`);
      }
      setAnnouncements(normalized);
      setIsSaving(false);
      setSavingLabel(null);
      return true;
    } catch (error: any) {
      setIsSaving(false);
      setSavingLabel(null);
      console.error('Failed to save announcements:', error);
      setSaveRecoveryModal({
        title: settings.mode === 'Drive' ? 'Failed to Save Announcements to Google Drive' : 'Failed to Save Announcements Schedule',
        targetName: 'announcements.json',
        filePath: settings.mode === 'Drive' ? (settings.driveFolderPreferences || 'Google Drive Preferences Folder') : (settings.localPathCalendar || 'Local Announcements Storage'),
        error: error.message || 'Write error',
        retryAction: async () => {
          await saveAnnouncements(newAnnouncements);
        },
        onFixFolder: () => {
          if (onShowLocationsModal) onShowLocationsModal();
        }
      });
      return false;
    }
  }, [token, onShowLocationsModal]);

  const addLog = useCallback(async (entry: LogEntry) => {
    if (isReadOnlyRef.current) {
      console.warn('Recording play log skipped: Station data is in read-only compatibility mode.');
      return;
    }
    const settings = getSavedSettings();

    let showId = entry.showId;
    let showName = entry.showName;
    let hostName = entry.hostName;
    let showDateTime = entry.showDateTime;

    const rawTarget = entry.announcementTime ? new Date(entry.announcementTime) : new Date(entry.timestamp || now);
    const targetTime = getStationNow(rawTarget);

    const currentShows = showsRef.current || [];
    const currentPlayMode = playModeRef.current;
    const currentPrerecordShowId = selectedPrerecordShowIdRef.current;
    const currentPlaylistShow = selectedPlaylistShowRef.current;

    if (!showName) {
      if (currentPlayMode === 'Prerecord' && currentPrerecordShowId && currentShows.length > 0) {
        const pShow = currentShows.find((s) => s.id === currentPrerecordShowId);
        if (pShow) {
          showId = pShow.id;
          showName = pShow.name;
          hostName = pShow.host;
          showDateTime = stationSlotDateToUtcIso(getActualShowStart(pShow, targetTime));
        }
      } else if (currentPlayMode === 'Playlist' && currentPlaylistShow) {
        showId = currentPlaylistShow.id;
        showName = currentPlaylistShow.name;
        hostName = currentPlaylistShow.host;
        showDateTime = stationSlotDateToUtcIso(getActualShowStart(currentPlaylistShow, targetTime));
      }
    }

    if (!showName && currentShows.length > 0) {
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[targetTime.getDay()];
      const hour = targetTime.getHours();
      const minute = targetTime.getMinutes();

      const activeShow = currentShows.find((s) => isTimeInShow(s, dayName, hour, minute));
      if (activeShow) {
        showId = activeShow.id;
        showName = activeShow.name;
        hostName = activeShow.host;
        showDateTime = stationSlotDateToUtcIso(getActualShowStart(activeShow, targetTime));
      }
    }

    if (showName && !hostName && currentShows.length > 0) {
      const matchedShow = currentShows.find(s => s.id === showId || s.name.toLowerCase() === showName.toLowerCase());
      if (matchedShow && matchedShow.host) {
        hostName = matchedShow.host;
      }
    }

    const resolvedAssetType =
      entry.assetType === 'message' || entry.status === 'acknowledged'
        ? 'message'
        : entry.status === 'backup play'
          ? 'audio'
          : classifyMediaAsset(entry.mp3Name, entry.assetType);

    const cleanMp3Name = isUpNextPromoUrl(entry.mp3Name)
      ? formatUpNextPromoFilename(entry.mp3Name, entry.announcementName)
      : entry.mp3Name;

    const actualExecutedIso = entry.executedAt || entry.logTimeStamp || new Date().toISOString();
    const slotIso = entry.announcementTime || entry.scheduledFor || entry.timestamp || actualExecutedIso;

    const enrichedEntry: LogEntry = {
      ...entry,
      mp3Name: cleanMp3Name,
      showId,
      showName,
      hostName,
      showDateTime,
      playMode: entry.playMode === "Export" ? "Export" : (entry.playMode || currentPlayMode),
      logTimeStamp: actualExecutedIso,
      timestamp: slotIso,
      announcementTime: slotIso,
      scheduledFor: slotIso,
      executedAt: actualExecutedIso,
      assetType: resolvedAssetType,
    };

    // Optimistically update local React state immediately so completed cards move to Played/Read without delay
    setLogs((prev) => [...prev, enrichedEntry]);

    try {
      if (settings.mode === "Drive") {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error("Not connected to Google Drive. Saving logs is disabled.");
        }
      }
      const headers = await getStorageApiHeaders();
      const postRes = await fetch("/api/logs", {
        method: "POST",
        headers,
        body: JSON.stringify(enrichedEntry),
      });
      const postData = await postRes.json().catch(() => null);
      if (postData && Array.isArray(postData.logs)) {
        setLogs(postData.logs);
      } else {
        const updatedLogs = await fetch("/api/logs", { headers }).then((r) => r.json());
        if (Array.isArray(updatedLogs)) {
          setLogs(updatedLogs);
        }
      }
    } catch (error) {
      console.error("Failed to add log:", error);
    }
  }, [now, token]);

  const acknowledgeAdminMessage = useCallback(
    async (
      message: AdminMessage,
      context?: {
        show?: Show | null;
        airDate?: Date;
        playMode?: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
      }
    ): Promise<boolean> => {
      const nowIso = new Date().toISOString();
      const targetAirDate = context?.airDate || getStationNow(new Date());
      const airDateStr = getStationAirDateStr(targetAirDate);
      const effectiveMode = context?.playMode || playModeRef.current || 'Live';

      if (message.targetScope === 'app_startup' && message.clearMode !== 'date_range') {
        markStartupMessageAcknowledgedLocal(message.id, message.updatedAt, CURRENT_APP_VERSION);
      }

      const persona = getMachinePersona();
      const runtimeCtx = getRuntimeAppContext();
      const effectivePersonaLabel = getEffectivePersonaLabel(persona);

      const showId = context?.show?.id || (message.targetScope === 'app_startup' ? `machine:${persona.machineId}` : 'station');
      const showName = context?.show?.name || (message.targetScope === 'app_startup' ? effectivePersonaLabel : undefined);

      const ackRecord: AdminMessageAckRecord = {
        showId,
        ...(showName ? { showName } : {}),
        acknowledgedAt: nowIso,
        airDate: airDateStr,
        playMode: effectiveMode,
        appVersion: runtimeCtx.appVersion,
        machineId: persona.machineId,
        personaName: effectivePersonaLabel,
        personaType: persona.personaType,
        pcUseType: persona.pcUseType,
        appEdition: runtimeCtx.appEdition,
        platform: runtimeCtx.platform,
      };

      // Persist acknowledgement directly on the message record in shows.json
      // (covering Show Messages, custom AMP Launch messages, and Built-In System Notices)
      // rather than cluttering broadcast logs.json.
      const currentMsgs = adminMessagesRef.current;
      const existsInStored = currentMsgs.some((m) => m.id === message.id);
      let nextMsgs: AdminMessage[];

      if (existsInStored) {
        nextMsgs = currentMsgs.map((m) => {
          if (m.id !== message.id) return m;
          const existingAcks = Array.isArray(m.acknowledgedByShows) ? m.acknowledgedByShows : [];
          const filtered = existingAcks.filter((r) => {
            if (message.targetScope === 'app_startup') {
              const sameMachine =
                (r.machineId && r.machineId === persona.machineId) || r.showId === showId;
              if (m.clearMode === 'once_acknowledged') {
                return !(sameMachine && r.appVersion === runtimeCtx.appVersion);
              }
              return !(sameMachine && r.airDate === airDateStr);
            }
            if (m.clearMode === 'once_acknowledged') {
              return r.showId !== showId;
            }
            return !(r.showId === showId && r.airDate === airDateStr);
          });
          return {
            ...m,
            acknowledgedByShows: [...filtered, ackRecord],
          };
        });
      } else if (isSystemBuiltInMessage(message)) {
        const persistedBuiltIn: AdminMessage = {
          id: message.id,
          title: message.title,
          body: '',
          severity: message.severity,
          enabled: message.enabled !== false,
          isSystemBuiltIn: true,
          targetScope: 'app_startup',
          clearMode: message.clearMode,
          acknowledgedByShows: [ackRecord],
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: 'System',
        };
        nextMsgs = [persistedBuiltIn, ...currentMsgs];
      } else {
        nextMsgs = currentMsgs;
      }

      if (nextMsgs !== currentMsgs) {
        setAdminMessages(nextMsgs);
        setAdminMessagesState(nextMsgs);
        if (!isReadOnlyRef.current) {
          await saveShows(
            showsRef.current,
            getStationTimezone(),
            getAdminContactInfo(),
            getUpNextPromoConfig(),
            getScheduleWindowConfig(),
            nextMsgs
          );
        }
      }

      return true;
    },
    [addLog, saveShows]
  );

  return {
    announcements,
    setAnnouncements,
    shows,
    setShows,
    logs,
    setLogs,
    isSaving,
    savingLabel,
    saveRecoveryModal,
    setSaveRecoveryModal,
    loadShows,
    saveShows,
    stationTimezone,
    saveStationTimezone,
    adminContactInfo,
    hasSavedAdminContact,
    saveAdminContactInfo,
    upNextPromoConfig,
    saveUpNextPromoConfig,
    scheduleWindowConfig,
    saveScheduleWindowConfig,
    adminMessages,
    setAdminMessagesState,
    saveAdminMessages,
    acknowledgeAdminMessage,
    saveAnnouncements,
    addLog,
  };
}
