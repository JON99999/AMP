import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { format, addMinutes, subMinutes, subDays, isSameMinute, isBefore, isAfter, startOfMinute, differenceInSeconds, parseISO } from 'date-fns';
import { Play, Pause, Square, CheckCircle, AlertCircle, RefreshCw, Clock, X, Copy, RadioTower, CassetteTape, ListOrdered, Download, Ear, FileText, Volume2, ListMusic, ChevronUp, ChevronDown, RotateCcw, Music, Flag, ListPlus, HelpCircle } from 'lucide-react';
import { Announcement, AnnouncementType, LogEntry, Show } from '../types';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { cn, getMP3Status, parseCustomTimeText, getParsedCustomTimeISO, isTimeInShow, getActualShowStart, getSortedShows, getShowShade, readMp3ID3Metadata, Mp3ID3Metadata, formatDuration, formatTotalTrackTime, getActiveMp3ForSlot, getGatedAssetType, formatExportTimeAmPm, isAudioFile, isUpNextPromoUrl, decodeUpNextPromoText, getGateMediaItems, formatRotatedAnnouncementName, getAnnouncementsForSlot as getScheduledAnnouncementsForSlot } from '../lib/utils';
import { stationSlotDateToUtcIso, isLogForStationSlot, getStationNow, getAdminContactInfo, ScheduleWindowConfig, getScheduleWindowConfig } from '../lib/compatibility';
import LiveReadPopout from './LiveReadPopout';
import { WaveformVisualizer } from './WaveformVisualizer';
import { getPlayableUrl, updateAudioCache, getAccessToken, formatShowPlaylistLogFileName, getSavedSettings, getStorageApiHeaders } from '../lib/driveService';
import { mp3BlobCache, mp3DurationCache, availableFilesCache, driveFileNameCache } from '../lib/audioCache';
import { ShowPlaylistLog } from '../types';
import FolderChooserModal from './FolderChooserModal';
import PrerecordExportPopup, { PrerecordExportBreakItem, PrerecordExportTrackEntry } from './PrerecordExportPopup';
import { PinnedLiveShowBanner, PersistentModeShowHeader } from './player/PlayerShowSpacer';
import { PlayerPlaylistDeckView } from './player/PlayerPlaylistDeckView';
import { PlayerLiveTimelineView } from './player/PlayerLiveTimelineView';
import { PlayerPrerecordTimelineView } from './player/PlayerPrerecordTimelineView';

interface PlayerTabProps {
  announcements: Announcement[];
  logs: LogEntry[];
  onLog: (entry: LogEntry) => Promise<any> | void;
  now: Date;
  syncTime: Date;
  scrollTrigger: number;
  playMode?: 'Live' | 'Prerecord' | 'Playlist';
  playlistShow?: Show | null;
  prerecordDate?: Date | null;
  prerecordLengthMinutes?: number;
  onConfigureTimeframe?: () => void;
  onExecuteExport?: (items?: any[], txtSummary?: string) => void;
  isAdmin?: boolean;
  onRefresh?: () => Promise<any> | void;
  shows?: Show[];
  onTriggerCaching?: (targetMode: 'Live' | 'Prerecord' | 'Playlist', additionalUrls?: string[]) => void;
  isFolderChooserOpen?: boolean;
  onCloseFolderChooser?: () => void;
  onOpenFolderChooser?: () => void;
  isExportPopupOpen?: boolean;
  onCloseExportPopup?: () => void;
  onPrerecordPlaylistAvailableChange?: (available: boolean) => void;
  scheduleWindowConfig?: ScheduleWindowConfig;
  isReadOnly?: boolean;
  adminContactInfo?: string;
}

export default function PlayerTab({ 
  announcements, 
  logs, 
  onLog, 
  now, 
  syncTime, 
  scrollTrigger,
  playMode = 'Live',
  playlistShow = null,
  prerecordDate = null,
  prerecordLengthMinutes = 240,
  onConfigureTimeframe,
  onExecuteExport,
  isAdmin = false,
  onRefresh,
  shows = [],
  onTriggerCaching,
  isFolderChooserOpen,
  onCloseFolderChooser,
  onOpenFolderChooser,
  isExportPopupOpen = false,
  onCloseExportPopup,
  onPrerecordPlaylistAvailableChange,
  scheduleWindowConfig,
  isReadOnly = false,
  adminContactInfo,
}: PlayerTabProps) {
  const [helpPopupCard, setHelpPopupCard] = useState<{
    name: string;
    timeLabel: string;
    errorLabel: string;
  } | null>(null);
  const resolvedAdminContact = (adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo()).trim() || 'No admin contact info configured yet (set in Admin Mode > Folders > Help).';
  const {
    playingStates,
    playAudio,
    stopAudio,
    stopAllAudios,
    isAudioPlaying
  } = useAudioEngine();
  const [activeLiveReadOverlay, setActiveLiveReadOverlay] = useState<any | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [isLoggingExports, setIsLoggingExports] = useState(false);
  const [customScriptTimes, setCustomScriptTimes] = useState<Record<string, string>>({});
  const [nowClock, setNowClock] = useState(new Date());
  const [cardRotateStep, setCardRotateStep] = useState(0);
  const [movedHighlightTrackId, setMovedHighlightTrackId] = useState<string | null>(null);
  const movedHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerMovedHighlight = (trackId: string) => {
    setMovedHighlightTrackId(trackId);
    if (movedHighlightTimeoutRef.current) clearTimeout(movedHighlightTimeoutRef.current);
    movedHighlightTimeoutRef.current = setTimeout(() => {
      setMovedHighlightTrackId(null);
    }, 1200);
  };

  const pendingPlayedPlaylistTracksRef = useRef<Record<string, { playedAt: string; fileName: string; title: string }>>({});
  const cardRotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTriggeredCacheHashRef = useRef<string>('');

  // Synchronized 4-second rotation interval for playlist song cards
  const startCardRotateTimer = () => {
    if (cardRotateTimerRef.current) {
      clearInterval(cardRotateTimerRef.current);
    }
    cardRotateTimerRef.current = setInterval(() => {
      setCardRotateStep(prev => prev + 1);
      if (Object.keys(pendingPlayedPlaylistTracksRef.current).length > 0) {
        setPlayedPlaylistTracks(prev => ({
          ...prev,
          ...pendingPlayedPlaylistTracksRef.current
        }));
        pendingPlayedPlaylistTracksRef.current = {};
      }
    }, 4000);
  };

  useEffect(() => {
    startCardRotateTimer();
    return () => {
      if (cardRotateTimerRef.current) {
        clearInterval(cardRotateTimerRef.current);
      }
    };
  }, []);

  // Playlist Mode State
  const [playlistTracks, setPlaylistTracks] = useState<Array<{
    id: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }>>([]);
  const [playlistFile, setPlaylistFile] = useState<string | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [isVerifyingEvergreens, setIsVerifyingEvergreens] = useState(false);
  const [playedPlaylistTracks, setPlayedPlaylistTracks] = useState<Record<string, {
    id?: string;
    playedAt: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds?: number;
    durationFormatted?: string;
    isAnnouncement?: boolean;
  }>>({});
  const [cancelledTrackIds, setCancelledTrackIds] = useState<string[]>([]);
  const [pushedBeforeBreakTrackIds, setPushedBeforeBreakTrackIds] = useState<string[]>([]);
  const [breakPositions, setBreakPositions] = useState<Record<string, number>>({});
  const [breakOrder, setBreakOrder] = useState<string[]>([]);
  const [trackMetadataMap, setTrackMetadataMap] = useState<Record<string, Mp3ID3Metadata>>({});
  const [selectedFolderPath, setSelectedFolderPath] = useState<string>('.');
  const [isExternalFolder, setIsExternalFolder] = useState<boolean>(false);
  const [externalAbsolutePath, setExternalAbsolutePath] = useState<string | null>(null);
  const [showFolderChooserModal, setShowFolderChooserModal] = useState<boolean>(false);
  const [hasAvailableShowPlaylistFiles, setHasAvailableShowPlaylistFiles] = useState<boolean>(false);
  const isFolderChooserVisible = isFolderChooserOpen !== undefined ? isFolderChooserOpen : showFolderChooserModal;

  const [, setPlaylistDurationUpdates] = useState(0);

  // Derive effective show for Playlist and Prerecord modes, as well as Live mode
  const effectiveShow = useMemo(() => {
    if (playMode === 'Playlist') return playlistShow;
    if (playlistShow) return playlistShow;
    if (playMode === 'Prerecord' && prerecordDate && shows && shows.length > 0) {
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[prerecordDate.getDay()];
      const hour = prerecordDate.getHours();
      const minute = prerecordDate.getMinutes();
      const activeShows = shows.filter(show => 
        isTimeInShow(show, dayName, hour, minute)
      );
      return activeShows[0] || null;
    }
    if (playMode === 'Live' && shows && shows.length > 0) {
      const targetDate = now || syncTime || new Date();
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[targetDate.getDay()];
      const hour = targetDate.getHours();
      const minute = targetDate.getMinutes();
      const activeShows = shows.filter(show => 
        isTimeInShow(show, dayName, hour, minute)
      );
      return activeShows[0] || null;
    }
    return null;
  }, [playMode, playlistShow, prerecordDate, now, syncTime, shows]);

  const getShowForSlot = useCallback((slot: Date): Show | null => {
    if (playMode === 'Playlist') return playlistShow;
    if (playMode === 'Prerecord') {
      if (effectiveShow) return effectiveShow;
      const targetDate = prerecordDate || slot;
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[targetDate.getDay()];
      const hour = targetDate.getHours();
      const minute = targetDate.getMinutes();
      const activeShows = (shows || []).filter(show => isTimeInShow(show, dayName, hour, minute));
      return activeShows[0] || null;
    }
    // Live mode / general slot time resolution
    if (shows && shows.length > 0) {
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[slot.getDay()];
      const hour = slot.getHours();
      const minute = slot.getMinutes();
      const activeShows = shows.filter(show => isTimeInShow(show, dayName, hour, minute));
      if (activeShows.length > 0) return activeShows[0];
    }
    return effectiveShow || playlistShow || null;
  }, [playMode, playlistShow, effectiveShow, prerecordDate, shows]);

  const playlistFolderType: 'Playlists' | 'Evergreens' = 'Playlists';

  // Synchronization refs for background tasks & state persistence
  const playedPlaylistTracksRef = useRef(playedPlaylistTracks);
  useEffect(() => {
    playedPlaylistTracksRef.current = playedPlaylistTracks;
  }, [playedPlaylistTracks]);

  const cancelledTrackIdsRef = useRef(cancelledTrackIds);
  useEffect(() => {
    cancelledTrackIdsRef.current = cancelledTrackIds;
  }, [cancelledTrackIds]);

  const playlistTracksRef = useRef(playlistTracks);
  useEffect(() => {
    playlistTracksRef.current = playlistTracks;
  }, [playlistTracks]);

  const trackMetadataMapRef = useRef(trackMetadataMap);
  useEffect(() => {
    trackMetadataMapRef.current = trackMetadataMap;
  }, [trackMetadataMap]);

  const breakPositionsRef = useRef(breakPositions);
  useEffect(() => {
    breakPositionsRef.current = breakPositions;
  }, [breakPositions]);

  const breakOrderRef = useRef(breakOrder);
  useEffect(() => {
    breakOrderRef.current = breakOrder;
  }, [breakOrder]);

  const lastKnownUnplayedTrackIdsRef = useRef<string[]>([]);

  const selectedFolderPathRef = useRef(selectedFolderPath);
  useEffect(() => {
    selectedFolderPathRef.current = selectedFolderPath;
  }, [selectedFolderPath]);

  const isExternalFolderRef = useRef(isExternalFolder);
  useEffect(() => {
    isExternalFolderRef.current = isExternalFolder;
  }, [isExternalFolder]);

  const externalAbsolutePathRef = useRef(externalAbsolutePath);
  useEffect(() => {
    externalAbsolutePathRef.current = externalAbsolutePath;
  }, [externalAbsolutePath]);

  const lastShowIdRef = useRef<string | null>(null);
  const lastPlayModeRef = useRef<string | null>(null);
  const lastPrerecordDateMsRef = useRef<number | null>(null);
  const prerecordUserSelectedFolderRef = useRef<string | null>(null);

  const saveLogPromiseQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedLogJsonRef = useRef<string>('');

  // Helper to accurately resolve track duration in seconds and formatted string
  const resolveTrackDuration = (
    track: any,
    meta?: Mp3ID3Metadata,
    overrideSeconds?: number
  ): { durationSeconds: number; durationFormatted: string } => {
    let durSec = 0;

    if (typeof overrideSeconds === 'number' && !isNaN(overrideSeconds) && overrideSeconds > 0) {
      durSec = Math.round(overrideSeconds);
    } else if (track?.durationSeconds && track.durationSeconds > 0) {
      durSec = Math.round(track.durationSeconds);
    } else if (meta?.durationSeconds && meta.durationSeconds > 0) {
      durSec = Math.round(meta.durationSeconds);
    } else {
      const cachedStr = mp3DurationCache.get(track?.streamUrl) || availableFilesCache.get(track?.fileName)?.duration;
      if (cachedStr && typeof cachedStr === 'string') {
        const parts = cachedStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            durSec = mins * 60 + secs;
          }
        }
      }
    }

    if (durSec <= 0) durSec = 180;

    const mins = Math.floor(durSec / 60);
    const secs = Math.floor(durSec % 60);
    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

    return { durationSeconds: durSec, durationFormatted: formatted };
  };

  // Helper to persist the current playlist show state into JSON log file
  const saveCurrentShowPlaylistLog = (
    overridePlayedMap?: Record<string, {
      id?: string;
      playedAt: string;
      fileName: string;
      title: string;
      artist?: string;
      albumArtist?: string;
      album?: string;
      durationSeconds?: number;
      durationFormatted?: string;
      isAnnouncement?: boolean;
    }>,
    overrideCancelledIds?: string[],
    overrideTracksList?: Array<any>,
    overrideMetaMap?: Record<string, Mp3ID3Metadata>,
    overrideBreakPositions?: Record<string, number>,
    overrideFolderContext?: {
      selectedFolderPath?: string;
      isExternalFolder?: boolean;
      externalAbsolutePath?: string | null;
    },
    overrideBreakOrder?: string[]
  ) => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) return Promise.resolve();

    saveLogPromiseQueueRef.current = saveLogPromiseQueueRef.current.then(async () => {
      try {
        const settings = getSavedSettings();
        const showNameShort = effectiveShow.nameShort || effectiveShow.name;
        const showName = effectiveShow.name;
        const hostName = effectiveShow.host;

        const showStart = playMode === 'Prerecord' && prerecordDate
          ? prerecordDate
          : getActualShowStart(effectiveShow, now || syncTime || new Date());

        const activePlayedMap = (overridePlayedMap && Object.keys(overridePlayedMap).length > 0)
          ? { ...playedPlaylistTracksRef.current, ...overridePlayedMap }
          : playedPlaylistTracksRef.current;
        const activeCancelledIds = overrideCancelledIds !== undefined
          ? overrideCancelledIds
          : cancelledTrackIdsRef.current;
        const activeTracksList = overrideTracksList || playlistTracksRef.current;
        const activeMetaMap = overrideMetaMap || trackMetadataMapRef.current;
        const activeBreakPositions = overrideBreakPositions !== undefined
          ? overrideBreakPositions
          : breakPositionsRef.current;
        const activeBreakOrder = overrideBreakOrder !== undefined
          ? overrideBreakOrder
          : breakOrderRef.current;
        const activeSelectedFolder = overrideFolderContext?.selectedFolderPath !== undefined
          ? overrideFolderContext.selectedFolderPath
          : selectedFolderPathRef.current;
        const activeIsExternal = overrideFolderContext?.isExternalFolder !== undefined
          ? overrideFolderContext.isExternalFolder
          : isExternalFolderRef.current;
        const activeExternalPath = overrideFolderContext?.externalAbsolutePath !== undefined
          ? overrideFolderContext.externalAbsolutePath
          : externalAbsolutePathRef.current;

        const playedTrackMap = new Map<string, any>();
        Object.entries(activePlayedMap).forEach(([key, info]: [string, any]) => {
          if (!info) return;
          const trackId = info.id || key;
          if (!playedTrackMap.has(trackId)) {
            const trackObj = activeTracksList.find((t: any) => t.id === trackId || t.fileName === info.fileName);
            const meta = activeMetaMap[trackId] || activeMetaMap[info.fileName] || activeMetaMap[key];

            const durInfo = resolveTrackDuration(
              trackObj || { durationSeconds: info.durationSeconds, streamUrl: trackObj?.streamUrl, fileName: info.fileName },
              meta,
              info.durationSeconds
            );

            const finalDurationSeconds = info.durationSeconds && info.durationSeconds > 0 ? info.durationSeconds : durInfo.durationSeconds;
            const finalDurationFormatted = info.durationFormatted && info.durationFormatted !== '' ? info.durationFormatted : durInfo.durationFormatted;

            playedTrackMap.set(trackId, {
              id: trackId,
              fileName: info.fileName,
              title: info.title || meta?.title || trackObj?.title || info.fileName || '',
              artist: info.artist || meta?.artist || trackObj?.artist || '',
              albumArtist: info.albumArtist || meta?.albumArtist || trackObj?.albumArtist || meta?.artist || info.artist || '',
              album: info.album || meta?.album || trackObj?.album || '',
              durationSeconds: finalDurationSeconds,
              durationFormatted: finalDurationFormatted,
              streamUrl: trackObj?.streamUrl || info.streamUrl || availableFilesCache.get(info.fileName)?.path || '',
              playedAt: info.playedAt,
              isAnnouncement: info.isAnnouncement || false
            });
          }
        });

        const playedTracksList = Array.from(playedTrackMap.values());
        // Chronological sort by playedAt
        playedTracksList.sort((a, b) => {
          const timeA = new Date(a.playedAt).getTime();
          const timeB = new Date(b.playedAt).getTime();
          return timeA - timeB;
        });

        let unplayedIds = activeTracksList
          .filter(t => {
            const isPlayed = !!activePlayedMap[t.id] || !!activePlayedMap[t.fileName];
            const isCancelled = activeCancelledIds.includes(t.id) || activeCancelledIds.includes(t.fileName);
            return !isPlayed && !isCancelled;
          })
          .map(t => t.id);

        if (unplayedIds.length > 0) {
          lastKnownUnplayedTrackIdsRef.current = unplayedIds;
        } else if (activeSelectedFolder === '__no_playlist__' && activeTracksList.length === 0 && lastKnownUnplayedTrackIdsRef.current.length > 0) {
          unplayedIds = lastKnownUnplayedTrackIdsRef.current;
        }

        const metaObj: Record<string, any> = {};
        if (activeTracksList.length > 0) {
          activeTracksList.forEach(track => {
            const meta = activeMetaMap[track.id] || activeMetaMap[track.fileName] || activeMetaMap[track.streamUrl];
            metaObj[track.id] = {
              id: track.id,
              fileName: track.fileName,
              title: meta?.title || track.title || '',
              artist: meta?.artist || track.artist || '',
              albumArtist: meta?.albumArtist || meta?.artist || track.artist || '',
              album: meta?.album || ''
            };
          });
        } else {
          Object.entries(activeMetaMap).forEach(([k, meta]: [string, any]) => {
            if (k.startsWith('playlist-track-') && meta) {
              metaObj[k] = {
                id: (meta as any).id || k,
                fileName: (meta as any).fileName || '',
                title: meta.title || '',
                artist: meta.artist || '',
                albumArtist: meta.albumArtist || meta.artist || '',
                album: meta.album || ''
              };
            }
          });
        }

        const logPayload: ShowPlaylistLog = {
          showId: effectiveShow.id,
          showName,
          hostName,
          showDateTime: showStart.toISOString(),
          logFileName: formatShowPlaylistLogFileName(showNameShort || showName, showStart),
          selectedFolderPath: activeSelectedFolder,
          isExternalFolder: activeIsExternal,
          externalAbsolutePath: activeExternalPath,
          playedTracks: playedTracksList,
          cancelledTrackIds: activeCancelledIds,
          unplayedTrackIds: unplayedIds,
          breakPositions: activeBreakPositions,
          breakOrder: activeBreakOrder,
          trackMetadata: metaObj
        };

        const logPayloadJson = JSON.stringify(logPayload);
        if (lastSavedLogJsonRef.current === logPayloadJson) {
          return;
        }
        lastSavedLogJsonRef.current = logPayloadJson;

        const headers = await getStorageApiHeaders();
        await fetch('/api/shows/playlist/save-log-json', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            showNameShort,
            showName,
            showStartTime: showStart.toISOString(),
            logFileName: logPayload.logFileName,
            logData: logPayload,
            folderType: playlistFolderType
          })
        });
      } catch (err) {
        console.error('Failed to save show playlist log JSON:', err);
      }
    });

    return saveLogPromiseQueueRef.current;
  };

  const syncRequestIdRef = useRef(0);

  // Sync playlist tracks from server, update caches, and load/restore state from JSON show log
  const syncPlaylistTracks = async (
    isInitial = false,
    overrideFolder?: {
      relPath: string;
      isExternal?: boolean;
      externalAbsolutePath?: string | null;
    }
  ) => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) {
      setPlaylistTracks([]);
      setPlaylistFile(null);
      return;
    }

    const currentSyncId = ++syncRequestIdRef.current;

    if (isInitial) {
      setIsPlaylistLoading(true);
    }
    setPlaylistError(null);

    try {
      const settings = getSavedSettings();
      const showNameShort = effectiveShow.nameShort || effectiveShow.name;
      const showName = effectiveShow.name;

      const showStart = playMode === 'Prerecord' && prerecordDate
        ? prerecordDate
        : getActualShowStart(effectiveShow, now || syncTime || new Date());

      // 1. Fetch existing JSON playlist log for state restoration and folder targeting
      let existingLog: ShowPlaylistLog | null = null;
      try {
        const headers = await getStorageApiHeaders();
        const resp = await fetch('/api/shows/playlist/load-log-json', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            showNameShort,
            showName,
            showStartTime: showStart.toISOString(),
            logFileName: formatShowPlaylistLogFileName(showNameShort || showName, showStart),
            folderType: playlistFolderType
          })
        });
        if (currentSyncId !== syncRequestIdRef.current) return;
        if (resp.ok) {
          const data = await resp.json();
          existingLog = data?.logData || data;
        }
      } catch (e) {
        console.warn('No existing show playlist JSON log found or failed to fetch:', e);
      }

      if (existingLog && Array.isArray(existingLog.unplayedTrackIds)) {
        lastKnownUnplayedTrackIdsRef.current = existingLog.unplayedTrackIds;
      } else if (!existingLog) {
        lastKnownUnplayedTrackIdsRef.current = [];
      }

      const activeTargetSubfolder = overrideFolder
        ? overrideFolder.relPath
        : playMode === 'Prerecord'
          ? (prerecordUserSelectedFolderRef.current !== null
              ? prerecordUserSelectedFolderRef.current
              : (existingLog?.selectedFolderPath && existingLog.selectedFolderPath !== '__no_playlist__'
                  ? existingLog.selectedFolderPath
                  : '__no_playlist__'))
          : (existingLog?.selectedFolderPath !== undefined
              ? existingLog.selectedFolderPath
              : (selectedFolderPathRef.current || '.'));
      const activeIsExternal = overrideFolder
        ? !!overrideFolder.isExternal
        : existingLog?.isExternalFolder !== undefined
          ? existingLog.isExternalFolder
          : (isExternalFolderRef.current || false);
      const activeExternalPath = overrideFolder
        ? (overrideFolder.externalAbsolutePath || null)
        : existingLog?.externalAbsolutePath !== undefined
          ? existingLog.externalAbsolutePath
          : (externalAbsolutePathRef.current || null);

      if (playMode === 'Prerecord') {
        prerecordUserSelectedFolderRef.current = activeTargetSubfolder;
      }

      setSelectedFolderPath(activeTargetSubfolder);
      setIsExternalFolder(activeIsExternal);
      setExternalAbsolutePath(activeExternalPath);

      selectedFolderPathRef.current = activeTargetSubfolder;
      isExternalFolderRef.current = activeIsExternal;
      externalAbsolutePathRef.current = activeExternalPath;

      // Restore saved log state (even if currently in __no_playlist__ so re-opening playlist later retains prior state)
      let restoredPlayedMap: Record<string, {
        id?: string;
        playedAt: string;
        fileName: string;
        title: string;
        artist?: string;
        albumArtist?: string;
        album?: string;
        durationSeconds?: number;
        durationFormatted?: string;
        isAnnouncement?: boolean;
      }> = existingLog ? { ...playedPlaylistTracksRef.current } : {};
      let restoredCancelledIds: string[] = existingLog ? [...cancelledTrackIdsRef.current] : [];

      if (existingLog) {
        if (Array.isArray(existingLog.playedTracks)) {
          existingLog.playedTracks.forEach((pt: any) => {
            const key = pt.id || pt.fileName;
            if (key) {
              const info = {
                id: pt.id || key,
                playedAt: pt.playedAt,
                fileName: pt.fileName,
                title: pt.title,
                artist: pt.artist || '',
                albumArtist: pt.albumArtist || pt.artist || '',
                album: pt.album || '',
                durationSeconds: pt.durationSeconds || 0,
                durationFormatted: pt.durationFormatted || '',
                isAnnouncement: pt.isAnnouncement || false
              };
              if (pt.id) restoredPlayedMap[pt.id] = info;
              if (pt.fileName) restoredPlayedMap[pt.fileName] = info;
            }
          });
          setPlayedPlaylistTracks(restoredPlayedMap);
          playedPlaylistTracksRef.current = restoredPlayedMap;
        }

        if (Array.isArray(existingLog.cancelledTrackIds)) {
          const mergedCancelled = Array.from(new Set([...restoredCancelledIds, ...existingLog.cancelledTrackIds]));
          restoredCancelledIds = mergedCancelled;
          setCancelledTrackIds(restoredCancelledIds);
          cancelledTrackIdsRef.current = restoredCancelledIds;
        }

        if (existingLog.trackMetadata && typeof existingLog.trackMetadata === 'object') {
          setTrackMetadataMap(existingLog.trackMetadata);
          trackMetadataMapRef.current = existingLog.trackMetadata;
        }

        if (existingLog.breakPositions && typeof existingLog.breakPositions === 'object') {
          setBreakPositions(existingLog.breakPositions);
          breakPositionsRef.current = existingLog.breakPositions;
        } else {
          setBreakPositions({});
          breakPositionsRef.current = {};
        }

        if (Array.isArray(existingLog.breakOrder)) {
          setBreakOrder(existingLog.breakOrder);
          breakOrderRef.current = existingLog.breakOrder;
        } else {
          setBreakOrder([]);
          breakOrderRef.current = [];
        }
      } else {
        // No existing JSON log: fresh state for this show
        setPlayedPlaylistTracks({});
        playedPlaylistTracksRef.current = {};
        setCancelledTrackIds([]);
        cancelledTrackIdsRef.current = [];
        setBreakPositions({});
        breakPositionsRef.current = {};
        setBreakOrder([]);
        breakOrderRef.current = [];
        setTrackMetadataMap({});
        trackMetadataMapRef.current = {};
      }

      if (playMode === 'Prerecord' && activeTargetSubfolder === '__no_playlist__') {
        setPlaylistTracks([]);
        setPlaylistFile(null);
        setIsPlaylistLoading(false);
        if (onTriggerCaching) {
          onTriggerCaching('Prerecord', []);
        }
        return;
      }

      // 2. Fetch physical tracks present in targeted show playlist folder
      let serverTracks: any[] = [];
      let playlistFileName: string | null = null;

      if (activeTargetSubfolder !== '__no_playlist__') {
        const headers = await getStorageApiHeaders();
        const resp = await fetch('/api/shows/playlist/load-tracks', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            showNameShort,
            showName,
            folderType: playlistFolderType,
            targetSubfolder: activeTargetSubfolder,
            isExternal: activeIsExternal,
            externalAbsolutePath: activeExternalPath
          })
        });
        const data = await resp.json();
        if (currentSyncId !== syncRequestIdRef.current) return;
        if (!resp.ok) throw new Error(data.error || 'Failed to load tracks');
        serverTracks = data.tracks || [];
        playlistFileName = data.playlistFile || null;
      }

      setPlaylistFile(playlistFileName);

      if (currentSyncId !== syncRequestIdRef.current) return;

      // Reconcile and retain all played tracks from log, ensuring historical played tracks remain in state even if file is missing from current disk folder
      const playedTracksFromLog: any[] = [];
      let maxPlayedIndex = 0;

      if (existingLog && Array.isArray(existingLog.playedTracks)) {
        existingLog.playedTracks.forEach((pt: any, pIdx: number) => {
          if (pt.isAnnouncement) return;
          let assignedId = pt.id;
          if (assignedId && typeof assignedId === 'string' && assignedId.startsWith('playlist-track-')) {
            const num = parseInt(assignedId.replace('playlist-track-', ''), 10);
            if (!isNaN(num) && num > maxPlayedIndex) maxPlayedIndex = num;
          } else if (!assignedId) {
            maxPlayedIndex++;
            assignedId = `playlist-track-${maxPlayedIndex}`;
          }

          const restoredMeta = (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[assignedId]) ||
            (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[pt.fileName]);

          const matchingServerTrack = (serverTracks as any[]).find(
            (st: any) => (st.fileName || '').toLowerCase() === (pt.fileName || '').toLowerCase()
          );
          const resolvedStreamUrl =
            matchingServerTrack?.streamUrl ||
            pt.streamUrl ||
            availableFilesCache.get(pt.fileName)?.path ||
            '';

          const playedTrackObj = {
            id: assignedId,
            fileName: pt.fileName || `played-track-${pIdx + 1}.mp3`,
            title: pt.title || restoredMeta?.title || matchingServerTrack?.title || pt.fileName,
            artist: pt.artist || restoredMeta?.artist || matchingServerTrack?.artist || '',
            albumArtist: pt.albumArtist || restoredMeta?.albumArtist || pt.artist || restoredMeta?.artist || matchingServerTrack?.albumArtist || '',
            album: pt.album || restoredMeta?.album || matchingServerTrack?.album || '',
            durationSeconds: pt.durationSeconds || matchingServerTrack?.durationSeconds || 0,
            durationFormatted: pt.durationFormatted || matchingServerTrack?.durationFormatted || '0:00',
            streamUrl: resolvedStreamUrl,
            isAnnouncement: pt.isAnnouncement || false,
            isPlayed: true
          };

          playedTracksFromLog.push(playedTrackObj);
        });
      }

      // Check max index across existing log unplayed IDs and metadata keys as well
      if (existingLog?.trackMetadata && typeof existingLog.trackMetadata === 'object') {
        Object.keys(existingLog.trackMetadata).forEach(k => {
          if (k.startsWith('playlist-track-')) {
            const num = parseInt(k.replace('playlist-track-', ''), 10);
            if (!isNaN(num) && num > maxPlayedIndex) maxPlayedIndex = num;
          }
        });
      }

      // Map fileNames from existingLog.trackMetadata to preserve original track IDs across sessions
      const savedFileNameToIdMap = new Map<string, string>();
      if (existingLog?.trackMetadata && typeof existingLog.trackMetadata === 'object') {
        Object.entries(existingLog.trackMetadata).forEach(([k, meta]: [string, any]) => {
          if (meta?.fileName && k.startsWith('playlist-track-')) {
            savedFileNameToIdMap.set(meta.fileName.toLowerCase(), meta.id || k);
          }
        });
      }

      const playedFileNameSet = new Set(playedTracksFromLog.map(pt => pt.fileName.toLowerCase()));

      // Normalize newly scanned server tracks: reuse saved track ID if available, otherwise continue IDs from maxPlayedIndex
      let nextTrackIndex = maxPlayedIndex;
      const normalizedServerTracks = (serverTracks as any[])
        .filter((t: any) => !playedFileNameSet.has((t.fileName || '').toLowerCase()))
        .map((t: any) => {
          const savedId = savedFileNameToIdMap.get((t.fileName || '').toLowerCase());
          let id = savedId || (t as any).id;
          if (!id) {
            nextTrackIndex++;
            id = `playlist-track-${nextTrackIndex}`;
          }
          const restoredMeta = (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[id]) ||
            (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[t.fileName]);
          return {
            ...t,
            id,
            title: restoredMeta?.title || (t as any).title,
            artist: restoredMeta?.artist || (t as any).artist,
            albumArtist: restoredMeta?.albumArtist || (t as any).albumArtist || restoredMeta?.artist || (t as any).artist,
            album: restoredMeta?.album || (t as any).album
          };
        });

      // Combine played tracks from log with unplayed server tracks
      const allUnifiedTracks = [...playedTracksFromLog, ...normalizedServerTracks];

      // Register tracks in availableFilesCache & driveFileNameCache matching regular announcements
      allUnifiedTracks.forEach((t: any) => {
        if (t.streamUrl) {
          availableFilesCache.set(t.fileName, {
            path: t.streamUrl,
            size: '0 MB',
            duration: t.durationFormatted
          });
          driveFileNameCache.set(t.streamUrl, t.fileName);
        }
      });

      // Sequence unplayed tracks according to log sequence if log exists
      let orderedTracks = allUnifiedTracks;
      if (existingLog && Array.isArray(existingLog.unplayedTrackIds) && existingLog.unplayedTrackIds.length > 0) {
        const trackMap = new Map(allUnifiedTracks.map((t: any) => [t.id, t]));
        const fileNameMap = new Map(allUnifiedTracks.map((t: any) => [t.fileName, t]));

        const sequenced: any[] = [];
        const usedIds = new Set<string>();

        // 1. Keep played tracks first in historical order
        playedTracksFromLog.forEach((t: any) => {
          if (!usedIds.has(t.id)) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        // 2. Add unplayed tracks in existingLog.unplayedTrackIds sequence
        existingLog.unplayedTrackIds.forEach((uid: string) => {
          const match = trackMap.get(uid) || fileNameMap.get(uid);
          if (match && !usedIds.has(match.id)) {
            const isCancelled = restoredCancelledIds.includes(match.id) || restoredCancelledIds.includes(match.fileName);
            if (!isCancelled) {
              sequenced.push(match);
              usedIds.add(match.id);
            }
          }
        });

        // 3. Append physical files not in log sequence, not played, not cancelled
        normalizedServerTracks.forEach((t: any) => {
          const isCancelled = restoredCancelledIds.includes(t.id) || restoredCancelledIds.includes(t.fileName);
          if (!usedIds.has(t.id) && !isCancelled) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        // 4. Finally append cancelled tracks so they are preserved in state
        normalizedServerTracks.forEach((t: any) => {
          if (!usedIds.has(t.id)) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        orderedTracks = sequenced;
      }

      if (currentSyncId !== syncRequestIdRef.current) return;

      // 3. Complete audio pre-caching and tag extraction synchronously with per-file timeout guards
      const trackUrls = serverTracks.map((t: any) => t.streamUrl).filter(Boolean);
      const trackUrlsHash = trackUrls.join(',');
      const token = getAccessToken();

      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Playlist', trackUrls);
        lastTriggeredCacheHashRef.current = trackUrlsHash;
      } else if (trackUrls.length > 0 && lastTriggeredCacheHashRef.current !== trackUrlsHash) {
        lastTriggeredCacheHashRef.current = trackUrlsHash;
        try {
          await updateAudioCache(trackUrls, token);
        } catch (e) {
          console.warn('Playlist track pre-caching notice:', e);
        }
      }

      // Load ID3 metadata with a strict 1500ms timeout per track to prevent hung requests
      const loadedMetaMap: Record<string, Mp3ID3Metadata> = {};
      await Promise.all(
        orderedTracks.map(async (t: any) => {
          let directMeta: Mp3ID3Metadata | null = null;
          if (t.artist || t.album) {
            directMeta = {
              title: t.title || '',
              artist: t.artist || '',
              albumArtist: t.albumArtist || t.artist || '',
              album: t.album || ''
            };
          } else if (t.streamUrl) {
            try {
              const metaPromise = readMp3ID3Metadata(t.streamUrl, token || undefined);
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
              const meta = await Promise.race([metaPromise, timeoutPromise]);
              if (meta && (meta.artist || meta.album || meta.title)) {
                directMeta = {
                  title: meta.title || t.title || '',
                  artist: meta.artist || '',
                  albumArtist: meta.albumArtist || meta.artist || '',
                  album: meta.album || ''
                };
              }
            } catch (e) {
              // Fallback silently if ID3 read fails
            }
          }

          if (directMeta) {
            loadedMetaMap[t.id] = directMeta;
            loadedMetaMap[t.fileName] = directMeta;
            if (t.streamUrl) loadedMetaMap[t.streamUrl] = directMeta;

            if (directMeta.artist) t.artist = directMeta.artist;
            if (directMeta.albumArtist) t.albumArtist = directMeta.albumArtist;
            if (directMeta.album) t.album = directMeta.album;
            if (directMeta.title && directMeta.title !== t.fileName) t.title = directMeta.title;
          }
        })
      );

      if (currentSyncId !== syncRequestIdRef.current) return;

      if (Object.keys(loadedMetaMap).length > 0) {
        setTrackMetadataMap(prev => ({ ...prev, ...loadedMetaMap }));
      }

      // 4. Save/initialize show log safely
      try {
        await saveCurrentShowPlaylistLog(
          restoredPlayedMap,
          restoredCancelledIds,
          orderedTracks,
          loadedMetaMap,
          existingLog?.breakPositions,
          {
            selectedFolderPath: activeTargetSubfolder,
            isExternalFolder: activeIsExternal,
            externalAbsolutePath: activeExternalPath
          },
          existingLog?.breakOrder
        );
      } catch (logErr) {
        console.warn('Initial show log save notice:', logErr);
      }

      if (currentSyncId !== syncRequestIdRef.current) return;

      // 5. Final Display Unlock: set state and dismiss loading spinner
      setPlaylistTracks(orderedTracks);
      setIsPlaylistLoading(false);

    } catch (err: any) {
      if (currentSyncId !== syncRequestIdRef.current) return;
      console.error('Failed to sync playlist tracks:', err);
      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Playlist', []);
      }
      if (isInitial) {
        setPlaylistError(err.message || 'Error loading playlist tracks');
      }
    } finally {
      if (currentSyncId === syncRequestIdRef.current) {
        setIsPlaylistLoading(false);
      }
    }
  };

  // Reconcile folder switching dynamically on user selection
  const handleSwitchPlaylistFolder = async (newFolder: {
    relPath: string;
    isExternal?: boolean;
    externalAbsolutePath?: string | null;
  }) => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) return;

    const targetSubfolder = newFolder.relPath;
    const isExternal = !!newFolder.isExternal;
    const extAbsPath = newFolder.externalAbsolutePath || null;

    if (playMode === 'Prerecord') {
      prerecordUserSelectedFolderRef.current = targetSubfolder;
    }
    setSelectedFolderPath(targetSubfolder);
    setIsExternalFolder(isExternal);
    setExternalAbsolutePath(extAbsPath);

    selectedFolderPathRef.current = targetSubfolder;
    isExternalFolderRef.current = isExternal;
    externalAbsolutePathRef.current = extAbsPath;

    const settings = getSavedSettings();
    const showNameShort = effectiveShow.nameShort || effectiveShow.name;
    const showName = effectiveShow.name;

    if (targetSubfolder === '__no_playlist__') {
      // In Prerecord mode, choosing No Playlist returns to the announcements-only view
      // while preserving the saved track order and break sequence in the JSON log
      const currentPlayedMap = playedPlaylistTracksRef.current;
      const tracksForPersistence = playlistTracksRef.current;
      const playedList = playMode === 'Prerecord'
        ? []
        : playlistTracksRef.current.filter(
            t => !(t as any).isAnnouncement && (!!currentPlayedMap[t.id] || !!currentPlayedMap[t.fileName])
          );
      setPlaylistTracks(playedList);
      setPlaylistFile(null);
      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Prerecord', []);
      }
      await saveCurrentShowPlaylistLog(
        undefined,
        undefined,
        tracksForPersistence.length > 0 ? tracksForPersistence : playedList,
        undefined,
        undefined,
        {
          selectedFolderPath: '__no_playlist__',
          isExternalFolder: false,
          externalAbsolutePath: null
        }
      );
      return;
    }

    // If switching from __no_playlist__ (when playlistTracks in memory is empty),
    // delegate to syncPlaylistTracks with overrideFolder so any saved JSON log order and break positions are restored.
    if (playlistTracksRef.current.length === 0) {
      await syncPlaylistTracks(true, {
        relPath: targetSubfolder,
        isExternal,
        externalAbsolutePath: extAbsPath
      });
      return;
    }

    setIsPlaylistLoading(true);
    try {
      let serverTracks: any[] = [];
      let playlistFileName: string | null = null;

      const headers = await getStorageApiHeaders();
      const resp = await fetch('/api/shows/playlist/load-tracks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          showNameShort,
          showName,
          folderType: playlistFolderType,
          targetSubfolder,
          isExternal,
          externalAbsolutePath: extAbsPath
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to load tracks');
      serverTracks = data.tracks || [];
      playlistFileName = data.playlistFile || null;

      setPlaylistFile(playlistFileName);

      // Reconcile with existing state:
      const currentPlayedMap = playedPlaylistTracksRef.current;
      const currentCancelled = cancelledTrackIdsRef.current;
      const currentMetaMap = { ...trackMetadataMapRef.current };
      const currentTracks = playlistTracksRef.current;

      // Find highest index among all existing tracks (played and unplayed)
      let maxExistingIndex = 0;
      currentTracks.forEach(t => {
        if (t.id && typeof t.id === 'string' && t.id.startsWith('playlist-track-')) {
          const num = parseInt(t.id.replace('playlist-track-', ''), 10);
          if (!isNaN(num) && num > maxExistingIndex) maxExistingIndex = num;
        }
      });
      Object.keys(currentMetaMap).forEach(k => {
        if (k.startsWith('playlist-track-')) {
          const num = parseInt(k.replace('playlist-track-', ''), 10);
          if (!isNaN(num) && num > maxExistingIndex) maxExistingIndex = num;
        }
      });

      let nextNewTrackIndex = maxExistingIndex;
      const newNormalizedTracks = (serverTracks as any[]).map((t: any) => {
        nextNewTrackIndex++;
        const id = t.id || `playlist-track-${nextNewTrackIndex}`;
        return { ...t, id };
      });

      const newTrackMap = new Map<string, any>();
      newNormalizedTracks.forEach(t => {
        newTrackMap.set(t.fileName.toLowerCase(), t);
        availableFilesCache.set(t.fileName, {
          path: t.streamUrl,
          size: '0 MB',
          duration: t.durationFormatted
        });
        driveFileNameCache.set(t.streamUrl, t.fileName);
      });

      const reconciledTracks: any[] = [];
      const usedIds = new Set<string>();
      const usedFileNames = new Set<string>();

      // 1. Retain all played tracks from current session
      currentTracks.forEach(t => {
        const isPlayed = !!currentPlayedMap[t.id] || !!currentPlayedMap[t.fileName];
        if (isPlayed) {
          const matchingNewTrack = newTrackMap.get(t.fileName.toLowerCase());
          reconciledTracks.push({
            ...t,
            streamUrl: matchingNewTrack?.streamUrl || t.streamUrl || availableFilesCache.get(t.fileName)?.path || ''
          });
          usedIds.add(t.id);
          usedFileNames.add(t.fileName.toLowerCase());
        }
      });

      // 2. Retain existing unplayed tracks whose files exist in the new folder
      currentTracks.forEach(t => {
        const isPlayed = !!currentPlayedMap[t.id] || !!currentPlayedMap[t.fileName];
        if (!isPlayed) {
          const matchingNewTrack = newTrackMap.get(t.fileName.toLowerCase());
          if (matchingNewTrack && !usedFileNames.has(matchingNewTrack.fileName.toLowerCase())) {
            const merged = { ...matchingNewTrack, id: t.id };
            reconciledTracks.push(merged);
            usedIds.add(t.id);
            usedFileNames.add(t.fileName.toLowerCase());
          }
        }
      });

      // 3. Append newly discovered tracks in the new folder
      newNormalizedTracks.forEach(t => {
        if (!usedFileNames.has(t.fileName.toLowerCase())) {
          reconciledTracks.push(t);
          usedIds.add(t.id);
          usedFileNames.add(t.fileName.toLowerCase());
        }
      });

      // Update metadata map for new tracks
      reconciledTracks.forEach(t => {
        if (!currentMetaMap[t.id] && !currentMetaMap[t.fileName]) {
          currentMetaMap[t.id] = {
            title: t.title,
            artist: t.artist || '',
            albumArtist: t.albumArtist || t.artist || '',
            album: t.album || '',
            durationSeconds: t.durationSeconds
          };
        }
      });

      // Pre-cache only physical files present
      const trackUrls = serverTracks.map((t: any) => t.streamUrl).filter(Boolean);
      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Playlist', trackUrls);
      }

      setPlaylistTracks(reconciledTracks);
      setTrackMetadataMap(currentMetaMap);

      await saveCurrentShowPlaylistLog(
        undefined,
        currentCancelled,
        reconciledTracks,
        currentMetaMap,
        undefined,
        {
          selectedFolderPath: targetSubfolder,
          isExternalFolder: isExternal,
          externalAbsolutePath: extAbsPath
        }
      );
    } catch (err) {
      console.error('Failed to switch playlist folder:', err);
      setPlaylistError((err as Error).message || 'Failed to switch playlist folder');
    } finally {
      setIsPlaylistLoading(false);
    }
  };

  // Initial load when switching mode, show, or prerecord date
  useEffect(() => {
    // Invalidate any in-flight sync calls from previous view/mode
    syncRequestIdRef.current++;

    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) {
      setPlaylistTracks([]);
      setPlaylistFile(null);
      setCancelledTrackIds([]);
      setPushedBeforeBreakTrackIds([]);
      setBreakPositions({});
      setBreakOrder([]);
      setPlayedPlaylistTracks({});
      setIsPlaylistLoading(false);
      lastTriggeredCacheHashRef.current = '';
      lastSavedLogJsonRef.current = '';
      if (!effectiveShow && playMode === 'Prerecord' && onTriggerCaching) {
        onTriggerCaching(playMode, []);
      }
      return;
    }

    const dateMs = prerecordDate ? prerecordDate.getTime() : null;
    const showChanged =
      effectiveShow?.id !== lastShowIdRef.current ||
      playMode !== lastPlayModeRef.current ||
      (playMode === 'Prerecord' && dateMs !== lastPrerecordDateMsRef.current);

    if (showChanged) {
      lastShowIdRef.current = effectiveShow ? effectiveShow.id : null;
      lastPlayModeRef.current = playMode;
      lastPrerecordDateMsRef.current = dateMs;
      playedPlaylistTracksRef.current = {};
      cancelledTrackIdsRef.current = [];
      playlistTracksRef.current = [];
      trackMetadataMapRef.current = {};
      breakPositionsRef.current = {};
      breakOrderRef.current = [];
      lastKnownUnplayedTrackIdsRef.current = [];
      const initialFolder = playMode === 'Prerecord' ? '__no_playlist__' : '.';
      prerecordUserSelectedFolderRef.current = null;
      selectedFolderPathRef.current = initialFolder;
      isExternalFolderRef.current = false;
      externalAbsolutePathRef.current = null;
      setSelectedFolderPath(initialFolder);
      setIsExternalFolder(false);
      setExternalAbsolutePath(null);
      setTrackMetadataMap({});
    }

    // Immediately purge tracks and state so previous view/mode items are cleared before async load
    setPlaylistTracks([]);
    setPlaylistFile(null);
    setCancelledTrackIds([]);
    setPushedBeforeBreakTrackIds([]);
    setBreakPositions({});
    setBreakOrder([]);
    setPlayedPlaylistTracks({});
    setIsPlaylistLoading(true);
    lastTriggeredCacheHashRef.current = '';
    lastSavedLogJsonRef.current = '';

    if (onTriggerCaching) {
      onTriggerCaching((playMode as any) || 'Playlist');
    }

    syncPlaylistTracks(true);
  }, [playMode, effectiveShow?.id, prerecordDate ? prerecordDate.getTime() : 0]);

  // Periodic check for additional tracks added to folder (every 30 seconds)
  useEffect(() => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) return;
    if (playMode === 'Prerecord' && selectedFolderPathRef.current === '__no_playlist__') return;

    const interval = setInterval(() => {
      if (playMode === 'Prerecord' && selectedFolderPathRef.current === '__no_playlist__') return;
      syncPlaylistTracks(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [playMode, effectiveShow?.id, prerecordDate ? prerecordDate.getTime() : 0]);

  // Listen for browser duration calculation events ('mp3-duration-cached')
  useEffect(() => {
    const handleDurationCached = () => {
      setPlaylistDurationUpdates(prev => prev + 1);
    };
    window.addEventListener('mp3-duration-cached', handleDurationCached);
    return () => window.removeEventListener('mp3-duration-cached', handleDurationCached);
  }, []);

  // Listen for MP3 metadata parsing events ('mp3-metadata-loaded')
  useEffect(() => {
    const handleMetadataLoaded = (e: any) => {
      const { url, resolvedUrl, meta } = e.detail || {};
      if (meta) {
        setTrackMetadataMap(prev => {
          const updated = { ...prev };
          if (url) updated[url] = meta;
          if (resolvedUrl) updated[resolvedUrl] = meta;
          return updated;
        });
      }
    };
    window.addEventListener('mp3-metadata-loaded', handleMetadataLoaded);
    return () => window.removeEventListener('mp3-metadata-loaded', handleMetadataLoaded);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleLogged = (eventOrEntry?: any) => {
      const logEntry: LogEntry | undefined = eventOrEntry?.detail !== undefined ? eventOrEntry.detail : eventOrEntry;
      setActiveLiveReadOverlay(prev => {
        if (logEntry && logEntry.status === 'backup play' && prev) {
          if (prev.announcementId && prev.slotKey && prev.slotISO) {
            const targetAnnouncement = announcements.find(s => s.id === prev.announcementId);
            if (targetAnnouncement) {
              const slotDate = new Date(prev.slotISO);
              playBackupAudioTrack(logEntry.mp3Name || prev.backupMp3Url, prev.slotKey, targetAnnouncement, slotDate, true);
            }
          }
        }
        return null;
      });

      const activeShow = effectiveShow || playlistShow;
      const isPlaylistActive = playMode === 'Playlist' || (playMode === 'Prerecord' && selectedFolderPathRef.current !== '__no_playlist__');
      if (isPlaylistActive && activeShow && logEntry?.announcementId) {
        const targetAnnouncement = announcements.find(s => s.id === logEntry.announcementId);
        const activeMp3 = targetAnnouncement ? getActiveMp3ForSlot(targetAnnouncement, new Date(logEntry.announcementTime || logEntry.timestamp || Date.now())) : null;
        const durSec = activeMp3?.duration ? parseInt(activeMp3.duration, 10) || 60 : 60;
        const mins = Math.floor(durSec / 60);
        const secs = durSec % 60;
        const durFmt = `${mins}:${secs.toString().padStart(2, '0')}`;
        const updatedPlayed = {
          ...playedPlaylistTracksRef.current,
          [logEntry.announcementId]: {
            id: logEntry.announcementId,
            playedAt: logEntry.timestamp,
            fileName: logEntry.mp3Name || activeMp3?.mp3Url || (logEntry.status === 'backup play' ? `${targetAnnouncement?.name || 'Announcement'} (backup mp3)` : 'Live Read'),
            title: logEntry.announcementName || targetAnnouncement?.name || 'Live Read',
            durationSeconds: durSec,
            durationFormatted: durFmt,
            isAnnouncement: true
          }
        };
        setPlayedPlaylistTracks(updatedPlayed);
        saveCurrentShowPlaylistLog(updatedPlayed);
      }
    };
    const handleOpened = (event: any) => {
      const payload = event?.detail;
      if (payload) {
        setActiveLiveReadOverlay(payload);
      }
    };
    const handleClosed = () => {
      setActiveLiveReadOverlay(null);
    };

    window.addEventListener('live-read-logged', handleLogged);
    window.addEventListener('live-read-opened', handleOpened);
    window.addEventListener('live-read-closed', handleClosed);

    return () => {
      window.removeEventListener('live-read-logged', handleLogged);
      window.removeEventListener('live-read-opened', handleOpened);
      window.removeEventListener('live-read-closed', handleClosed);
    };
  }, [announcements, effectiveShow, playlistShow, playMode]);

  const currentTimeText = useMemo(() => {
    let hours = nowClock.getHours();
    const minutes = String(nowClock.getMinutes()).padStart(2, '0');
    const seconds = String(nowClock.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  }, [nowClock]);

  const [cacheDisplayStatus, setCacheDisplayStatus] = useState<'idle' | 'caching' | 'all-cached'>('idle');
  const [prevActiveUrlsHash, setPrevActiveUrlsHash] = useState<string>('');

  // Compute active verified Announcements and their cache status
  const activeVerifiedAnnouncements = useMemo(() => {
    return announcements.filter(s => {
      if (!s.enabled) return false;
      const activeMp3 = getActiveMp3ForSlot(s, nowClock);
      const url = activeMp3?.mp3Url || '';
      if (!url) return false;
      const status = getMP3Status(url);
      return status.exists && status.valid;
    });
  }, [announcements, nowClock]);

  const activeMp3Urls = useMemo(() => {
    const urls: string[] = [];
    announcements.forEach(s => {
      if (!s.enabled) return;
      if (Array.isArray(s.timeGatedMp3s)) {
        s.timeGatedMp3s.forEach(m => {
          const mediaItems = getGateMediaItems(m);
          mediaItems.forEach(mi => {
            if (mi.mp3Url && isAudioFile(mi.mp3Url) && !isUpNextPromoUrl(mi.mp3Url)) {
              const status = getMP3Status(mi.mp3Url);
              if (status.exists && status.valid) {
                urls.push(mi.mp3Url);
              }
            }
            if (mi.backupMp3Url && isAudioFile(mi.backupMp3Url)) {
              const bStatus = getMP3Status(mi.backupMp3Url);
              if (bStatus.exists && bStatus.valid) {
                urls.push(mi.backupMp3Url);
              }
            }
          });
        });
      }
    });

    if ((playMode === 'Playlist' || playMode === 'Prerecord') && playlistTracks.length > 0) {
      const trackUrls = playlistTracks.map(t => t.streamUrl).filter(Boolean);
      return Array.from(new Set([...urls, ...trackUrls]));
    }
    return Array.from(new Set(urls));
  }, [announcements, playMode, playlistTracks]);

  useEffect(() => {
    const hash = activeMp3Urls.join(',');
    
    let hasNewUncached = false;
    if (hash !== prevActiveUrlsHash) {
      setPrevActiveUrlsHash(hash);
      let uncached = 0;
      activeMp3Urls.forEach(url => {
        const fileInCache = availableFilesCache.get(url);
        const resolvedUrl = fileInCache ? fileInCache.path : url;
        const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(url) || getPlayableUrl(url).startsWith('blob:');
        if (!isCached) {
          uncached++;
        }
      });
      if (uncached > 0) {
        hasNewUncached = true;
      }
    }

    const checkStatus = () => {
      let uncached = 0;
      activeMp3Urls.forEach(url => {
        const fileInCache = availableFilesCache.get(url);
        const resolvedUrl = fileInCache ? fileInCache.path : url;
        const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(url) || getPlayableUrl(url).startsWith('blob:');
        if (!isCached) {
          uncached++;
        }
      });
      return uncached;
    };

    const currentUncached = checkStatus();

    if (currentUncached > 0) {
      if (cacheDisplayStatus !== 'caching') {
        setCacheDisplayStatus('caching');
      }
    } else {
      if (cacheDisplayStatus === 'caching') {
        setCacheDisplayStatus('all-cached');
        const timer = setTimeout(() => {
          setCacheDisplayStatus('idle');
        }, 30000);
        return () => clearTimeout(timer);
      }
    }

    if (cacheDisplayStatus === 'caching' || hasNewUncached) {
      const interval = setInterval(() => {
        const uncached = checkStatus();
        if (uncached === 0) {
          setCacheDisplayStatus('all-cached');
          clearInterval(interval);
          const timer = setTimeout(() => {
            setCacheDisplayStatus('idle');
          }, 30000);
          return () => clearTimeout(timer);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [activeMp3Urls, scrollTrigger, cacheDisplayStatus, prevActiveUrlsHash]);

  const renderCacheStatusMessage = () => {
    if (cacheDisplayStatus === 'idle') return null;

    if (cacheDisplayStatus === 'caching') {
      return (
        <div
          id="global-cache-status-caching"
          className="flex items-center gap-1.5 text-[11px] font-bold text-white/95 uppercase tracking-wider animate-pulse select-none w-full pt-0.5 border-t border-emerald-500/60"
        >
          <RefreshCw className="w-3 h-3 animate-spin shrink-0 text-white" />
          <span className="truncate">Caching mp3&apos;s</span>
        </div>
      );
    }

    if (cacheDisplayStatus === 'all-cached') {
      return (
        <div
          id="global-cache-status-cached"
          className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-100 uppercase tracking-wider select-none w-full pt-0.5 border-t border-emerald-500/60"
        >
          <CheckCircle className="w-3 h-3 text-emerald-200 shrink-0" />
          <span className="truncate">All mp3&apos;s cached</span>
        </div>
      );
    }

    return null;
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const userScrollTopRef = useRef<number | null>(null);
  const lastModeRef = useRef<string | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false);
  const prevScrollTriggerRef = useRef<number>(scrollTrigger);

  const persistentHeaderRef = useRef<HTMLDivElement>(null);
  const persistentLeftStripRef = useRef<HTMLDivElement>(null);
  const persistentTitleRef = useRef<HTMLDivElement>(null);
  const persistentTitleTextRef = useRef<HTMLSpanElement>(null);
  const persistentTextBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollContainerRef.current && !isAutoScrollingRef.current) {
        userScrollTopRef.current = scrollContainerRef.current.scrollTop;
      }
      if (persistentTitleRef.current && persistentLeftStripRef.current && persistentTextBoxRef.current) {
        if (playMode === 'Playlist' || playMode === 'Prerecord') {
          const defaultTitle = playMode === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode';
          const shade = effectiveShow 
            ? getShowShade(effectiveShow, getSortedShows(shows))
            : { bg: '#faf5ff', border: '#c084fc', title: defaultTitle };
          
          const newText = effectiveShow ? effectiveShow.name : defaultTitle;
          if (persistentTitleTextRef.current) {
            if (persistentTitleTextRef.current.textContent !== newText) {
              persistentTitleTextRef.current.textContent = newText;
            }
          } else if (persistentTitleRef.current.textContent !== newText) {
            persistentTitleRef.current.textContent = newText;
          }
          persistentLeftStripRef.current.style.backgroundColor = shade.bg;
          persistentLeftStripRef.current.title = shade.title;
          persistentTextBoxRef.current.style.backgroundColor = shade.bg;
          persistentTextBoxRef.current.style.borderColor = shade.border;
          return;
        }

        const slotElements = container.querySelectorAll('[data-slot-time]');
        let currentActiveShow: Show | null = null;
        const containerRect = container.getBoundingClientRect();
        
        for (let i = 0; i < slotElements.length; i++) {
          const el = slotElements[i] as HTMLElement;
          const rect = el.getBoundingClientRect();
          
          if (rect.top - containerRect.top <= 15 && rect.bottom - containerRect.top > 15) {
            const timeStr = el.getAttribute('data-slot-time');
            if (timeStr) {
              const slotDate = new Date(timeStr);
              const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
              const dayName = daysOrder[slotDate.getDay()];
              const hour = slotDate.getHours();
              const minute = slotDate.getMinutes();
              
              const activeShows = shows.filter(show => 
                isTimeInShow(show, dayName, hour, minute)
              );
              if (activeShows.length > 0) {
                currentActiveShow = activeShows[0];
              }
            }
            break;
          }
        }

        const shade = currentActiveShow 
          ? getShowShade(currentActiveShow, getSortedShows(shows))
          : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
        
        const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
        if (persistentTitleTextRef.current) {
          if (persistentTitleTextRef.current.textContent !== newText) {
            persistentTitleTextRef.current.textContent = newText;
          }
        } else if (persistentTitleRef.current.textContent !== newText) {
          persistentTitleRef.current.textContent = newText;
        }

        persistentLeftStripRef.current.style.backgroundColor = shade.bg;
        persistentLeftStripRef.current.title = shade.title;
        persistentTextBoxRef.current.style.backgroundColor = shade.bg;
        persistentTextBoxRef.current.style.borderColor = shade.border;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    const timer = setTimeout(handleScroll, 300);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [shows, scrollTrigger, playMode, playlistShow, effectiveShow]);

  useEffect(() => {
    // Initial call or when dependency changes to ensure header is correctly synced
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (container) {
        const slotElements = container.querySelectorAll('[data-slot-time]');
        let currentActiveShow: Show | null = null;
        const containerRect = container.getBoundingClientRect();
        
        for (let i = 0; i < slotElements.length; i++) {
          const el = slotElements[i] as HTMLElement;
          const rect = el.getBoundingClientRect();
          
          if (rect.top - containerRect.top <= 15 && rect.bottom - containerRect.top > 15) {
            const timeStr = el.getAttribute('data-slot-time');
            if (timeStr) {
              const slotDate = new Date(timeStr);
              const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
              const dayName = daysOrder[slotDate.getDay()];
              const hour = slotDate.getHours();
              const minute = slotDate.getMinutes();
              
              const activeShows = shows.filter(show => 
                isTimeInShow(show, dayName, hour, minute)
              );
              if (activeShows.length > 0) {
                currentActiveShow = activeShows[0];
              }
            }
            break;
          }
        }
        
        // Update persistent header DOM directly
        if (persistentTitleRef.current && persistentLeftStripRef.current && persistentTextBoxRef.current) {
          if (playMode === 'Playlist' || playMode === 'Prerecord') {
            const defaultTitle = playMode === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode';
            const shade = effectiveShow 
              ? getShowShade(effectiveShow, getSortedShows(shows))
              : { bg: '#faf5ff', border: '#c084fc', title: defaultTitle };
            
            const newText = effectiveShow ? effectiveShow.name : defaultTitle;
            if (persistentTitleTextRef.current) {
              if (persistentTitleTextRef.current.textContent !== newText) {
                persistentTitleTextRef.current.textContent = newText;
              }
            } else if (persistentTitleRef.current.textContent !== newText) {
              persistentTitleRef.current.textContent = newText;
            }
            persistentLeftStripRef.current.style.backgroundColor = shade.bg;
            persistentLeftStripRef.current.title = shade.title;
            persistentTextBoxRef.current.style.backgroundColor = shade.bg;
            persistentTextBoxRef.current.style.borderColor = shade.border;
          } else {
            const shade = currentActiveShow 
              ? getShowShade(currentActiveShow, getSortedShows(shows))
              : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
            
            const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
            if (persistentTitleTextRef.current) {
              if (persistentTitleTextRef.current.textContent !== newText) {
                persistentTitleTextRef.current.textContent = newText;
              }
            } else if (persistentTitleRef.current.textContent !== newText) {
              persistentTitleRef.current.textContent = newText;
            }
            persistentLeftStripRef.current.style.backgroundColor = shade.bg;
            persistentLeftStripRef.current.title = shade.title;
            persistentTextBoxRef.current.style.backgroundColor = shade.bg;
            persistentTextBoxRef.current.style.borderColor = shade.border;
          }
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [shows, scrollTrigger, playMode, playlistShow, effectiveShow]);

  // Auto-scroll logic: centered on "now" indicator or scrolled to top for Prerecord on initial mode switch or "Now" refresh click,
  // while preserving exact user scroll position across track re-orders, automated background updates, and post-cache updates.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isModeSwitch = lastModeRef.current !== playMode;
    const isSyncTriggered = prevScrollTriggerRef.current !== scrollTrigger;

    if (isModeSwitch || isSyncTriggered) {
      lastModeRef.current = playMode;
      prevScrollTriggerRef.current = scrollTrigger;
      userScrollTopRef.current = null;
      isAutoScrollingRef.current = true;

      const performAutoScroll = () => {
        const cont = scrollContainerRef.current;
        if (!cont) return;

        if (playMode === 'Prerecord') {
          cont.scrollTop = 0;
        } else if (playMode === 'Live') {
          const nowEl = (cont.querySelector('#now-indicator') as HTMLElement) || activeItemRef.current;
          if (nowEl) {
            const containerRect = cont.getBoundingClientRect();
            const targetRect = nowEl.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + cont.scrollTop;
            cont.scrollTop = Math.max(0, targetTop - (cont.clientHeight / 2) + (targetRect.height / 2));
          } else {
            cont.scrollTop = 0;
          }
        } else if (playMode === 'Playlist') {
          const targetEl = (cont.querySelector('#now-indicator') as HTMLElement) || activeItemRef.current;
          if (targetEl) {
            const containerRect = cont.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + cont.scrollTop;
            cont.scrollTop = Math.max(0, targetTop - (cont.clientHeight / 2) + (targetRect.height / 2));
          } else {
            cont.scrollTop = 0;
          }
        }

        if (scrollContainerRef.current) {
          userScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }

        requestAnimationFrame(() => {
          isAutoScrollingRef.current = false;
        });
      };

      // Double requestAnimationFrame ensures layout and DOM paint are fully complete
      requestAnimationFrame(() => {
        requestAnimationFrame(performAutoScroll);
      });
    } else {
      // Restore exact saved scroll position on re-renders, track re-orders, and refreshes without jumping
      if (!isAutoScrollingRef.current && userScrollTopRef.current !== null && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = userScrollTopRef.current;
      }
    }
  }, [scrollTrigger, playMode, playlistTracks, cancelledTrackIds, cacheDisplayStatus]);

  useLayoutEffect(() => {
    if (!isAutoScrollingRef.current && lastModeRef.current === playMode && prevScrollTriggerRef.current === scrollTrigger && userScrollTopRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = userScrollTopRef.current;
    }
  });

  const activeScheduleWindow = scheduleWindowConfig || getScheduleWindowConfig();
  const windowBeforeMinutes = activeScheduleWindow.windowBeforeMinutes ?? 5;
  const windowAfterMinutes = activeScheduleWindow.windowAfterMinutes ?? 5;
  const showLookaroundHours =
    activeScheduleWindow.showLookaroundMinutes !== undefined
      ? activeScheduleWindow.showLookaroundMinutes / 60
      : (activeScheduleWindow.showLookaroundHours ?? 1);

  // Check whether the user's show folder or subfolders contain audio files for the Prerecord Playlist button
  useEffect(() => {
    if (playMode !== 'Prerecord' || !effectiveShow) {
      setHasAvailableShowPlaylistFiles(false);
      return;
    }

    let cancelled = false;
    const checkAvailableFolders = async () => {
      try {
        const showNameShort = effectiveShow.nameShort || effectiveShow.name;
        const showName = effectiveShow.name;
        const headers = await getStorageApiHeaders();
        const resp = await fetch('/api/shows/discover-folders', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            showNameShort,
            showName,
            folderType: 'show'
          })
        });
        if (!cancelled && resp.ok) {
          const data = await resp.json();
          const folders = Array.isArray(data.folders) ? data.folders : [];
          const total =
            typeof data.totalFiles === 'number'
              ? data.totalFiles
              : folders.reduce((sum: number, f: any) => sum + (Number(f.fileCount) || 0), 0);
          setHasAvailableShowPlaylistFiles(total > 0);
        } else if (!cancelled) {
          setHasAvailableShowPlaylistFiles(false);
        }
      } catch {
        if (!cancelled) {
          setHasAvailableShowPlaylistFiles(false);
        }
      }
    };

    checkAvailableFolders();
    return () => {
      cancelled = true;
    };
  }, [playMode, effectiveShow?.id, effectiveShow?.nameShort, effectiveShow?.name]);

  useEffect(() => {
    if (!onPrerecordPlaylistAvailableChange) return;
    if (playMode === 'Prerecord') {
      onPrerecordPlaylistAvailableChange(Boolean(effectiveShow && hasAvailableShowPlaylistFiles));
    } else {
      onPrerecordPlaylistAvailableChange(false);
    }
  }, [playMode, effectiveShow, hasAvailableShowPlaylistFiles, playlistTracks.length, onPrerecordPlaylistAvailableChange]);

  const timeline = useMemo(() => {
    if (playMode === 'Prerecord' && prerecordDate) {
      const slots = [];
      let current = startOfMinute(prerecordDate);
      const end = addMinutes(current, prerecordLengthMinutes);
      while (isBefore(current, end)) {
        slots.push(new Date(current));
        current = addMinutes(current, 1);
      }
      return slots;
    } else {
      const baseTime = now || syncTime || new Date();
      const lookbackMins = Math.max(windowBeforeMinutes, showLookaroundHours * 60);
      const lookaheadMins = Math.max(windowAfterMinutes, showLookaroundHours * 60);
      const start = subMinutes(baseTime, lookbackMins);
      const end = addMinutes(baseTime, lookaheadMins);
      const endMinute = startOfMinute(end);

      const slots = [];
      let current = startOfMinute(start);
      while (!isAfter(current, endMinute)) {
        slots.push(new Date(current));
        current = addMinutes(current, 1);
      }
      return slots;
    }
  }, [now, syncTime, playMode, prerecordDate, prerecordLengthMinutes, windowBeforeMinutes, windowAfterMinutes, showLookaroundHours]);

  // Dynamic persistent header padding adjustment to align its right edge with the cards in the scrollable container.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateHeaderAlignment = () => {
      const header = persistentHeaderRef.current;
      if (header) {
        header.style.paddingRight = '4px';
      }
    };

    updateHeaderAlignment();

    const resizeObserver = new ResizeObserver(() => {
      updateHeaderAlignment();
    });
    resizeObserver.observe(container);

    const timer = setTimeout(updateHeaderAlignment, 100);
    const timer2 = setTimeout(updateHeaderAlignment, 500);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [playMode, timeline]);

  const getAnnouncementsForSlot = (slot: Date) =>
    getScheduledAnnouncementsForSlot(announcements, slot);

  const playlistTimeline = useMemo(() => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord') || !effectiveShow) return [];

    const showStart = playMode === 'Prerecord' && prerecordDate
      ? prerecordDate
      : getActualShowStart(effectiveShow, now || syncTime || new Date());

    const showDurationMinutes = (effectiveShow.durationHours * 60) + effectiveShow.durationMinutes;
    const showEnd = addMinutes(showStart, showDurationMinutes);

    // 1. Collect all scheduled Announcement Breaks in the show window (one break card per announcement so same-time items reorder independently)
    const scheduledBreaks: Array<{
      id: string;
      legacySlotId: string;
      slotTime: Date;
      announcements: Announcement[];
      totalDurationSec: number;
      initialOrderIndex: number;
    }> = [];

    let currentSlot = startOfMinute(showStart);
    let breakInitIdx = 0;
    while (isBefore(currentSlot, showEnd)) {
      const sForSlot = getAnnouncementsForSlot(currentSlot);
      if (sForSlot.length > 0) {
        const legacySlotId = `break-${currentSlot.toISOString()}`;
        for (const item of sForSlot) {
          const activeMp3 = getActiveMp3ForSlot(item, currentSlot);
          const durStr = activeMp3?.duration;
          const d = durStr ? parseInt(durStr, 10) : 60;
          const itemDur = !isNaN(d) && d > 0 ? d : 60;
          scheduledBreaks.push({
            id: `break-${currentSlot.toISOString()}-${item.id}`,
            legacySlotId,
            slotTime: new Date(currentSlot),
            announcements: [item],
            totalDurationSec: itemDur,
            initialOrderIndex: breakInitIdx++
          });
        }
      }
      currentSlot = addMinutes(currentSlot, 1);
    }

    type PlaylistTimelineEntry =
      | {
          type: 'header';
          id: string;
          show: Show;
          startTime: Date;
          playlistFile: string | null;
          trackCount: number;
        }
      | {
          type: 'track';
          id: string;
          track: {
            id: string;
            fileName: string;
            title: string;
            durationSeconds: number;
            durationFormatted: string;
            streamUrl: string;
          };
          trackNumber: number;
          startTime: Date;
          endTime: Date;
          played?: boolean;
          playedAt?: string;
          cancelled?: boolean;
          isOverrun?: boolean;
        }
      | {
          type: 'break';
          id: string;
          slotTime: Date;
          startTime: Date;
          endTime: Date;
          announcements: Announcement[];
          isOverrun?: boolean;
          played?: boolean;
          playedAt?: string;
          cancelled?: boolean;
        }
      | {
          type: 'show-end';
          id: string;
          showEnd: Date;
          diffSeconds: number;
          diffFormatted: string;
          status: 'over' | 'under' | 'exact';
          startTime: Date;
        }
      | {
          type: 'extra-tracks';
          id: string;
          totalExtraSeconds: number;
          extraFormatted: string;
          startTime: Date;
        };

    const items: PlaylistTimelineEntry[] = [
      {
        type: 'header',
        id: 'playlist-header',
        show: effectiveShow,
        startTime: showStart,
        playlistFile,
        trackCount: playlistTracks.length
      }
    ];

    let maxPlayedEnd = new Date(showStart);

    // 2. Add Played Tracks and Played Announcement Breaks sorted by playedAt timestamp
    const playedItems: PlaylistTimelineEntry[] = [];

    // 2.a. Played Music Tracks (announcements are excluded here so they render exclusively as unified scheduled break cards)
    const playedTracks = playlistTracks.filter(t => {
      if (t.isAnnouncement) return false;
      if (playingStates[t.id] || isAudioPlaying(t.id)) return false;
      const playedInfo = playedPlaylistTracks[t.id] || playedPlaylistTracks[t.fileName];
      if (playedInfo?.isAnnouncement) return false;
      return !!playedInfo;
    });
    for (const track of playedTracks) {
      const exactCachedDurationStr = mp3DurationCache.get(track.streamUrl) || availableFilesCache.get(track.fileName)?.duration;
      let trackDur = track.durationSeconds || 180;
      if (exactCachedDurationStr) {
        const parts = exactCachedDurationStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            trackDur = (mins * 60) + secs;
          }
        }
      }
      const playedInfo = playedPlaylistTracks[track.id] || playedPlaylistTracks[track.fileName];
      const playedDate = new Date(playedInfo.playedAt);
      const playedEnd = new Date(playedDate.getTime() + trackDur * 1000);
      playedItems.push({
        type: 'track',
        id: track.id,
        track,
        trackNumber: 0,
        startTime: playedDate,
        endTime: playedEnd,
        played: true,
        playedAt: playedInfo.playedAt,
        cancelled: false
      });
      if (playedEnd.getTime() > maxPlayedEnd.getTime()) {
        maxPlayedEnd = new Date(playedEnd);
      }
    }

    // 2.b. Played Announcement Breaks
    const playedBreakIds = new Set<string>();
    for (const b of scheduledBreaks) {
      const playedInBreak = b.announcements.filter(s => {
        const slotKey = `${b.slotTime.toISOString()}-${s.id}`;
        if (playingStates[slotKey] || isAudioPlaying(slotKey)) return false;
        if (playedPlaylistTracks[s.id]) return true;
        return logs.some(l => 
          l.announcementId === s.id && 
          isLogForStationSlot(l, b.slotTime) &&
          (l.status === 'played' || l.status === 'backup play') &&
          (playMode === 'Prerecord' || l.playMode !== 'Export')
        );
      });

      if (playedInBreak.length > 0) {
        playedBreakIds.add(b.id);
        let earliestPlayedAt = b.slotTime;
        for (const s of playedInBreak) {
          const pInfo = playedPlaylistTracks[s.id];
          if (pInfo?.playedAt) {
            const d = new Date(pInfo.playedAt);
            if (!isNaN(d.getTime())) earliestPlayedAt = d;
          } else {
            const pLog = logs.find(l => 
              l.announcementId === s.id && 
              isLogForStationSlot(l, b.slotTime) &&
              (l.status === 'played' || l.status === 'backup play') &&
              (playMode === 'Prerecord' || l.playMode !== 'Export')
            );
            if (pLog?.timestamp) {
              const d = new Date(pLog.timestamp);
              if (!isNaN(d.getTime())) earliestPlayedAt = d;
            }
          }
        }

        const bEnd = new Date(earliestPlayedAt.getTime() + b.totalDurationSec * 1000);
        playedItems.push({
          type: 'break',
          id: b.id,
          slotTime: b.slotTime,
          startTime: earliestPlayedAt,
          endTime: bEnd,
          announcements: b.announcements,
          played: true,
          playedAt: earliestPlayedAt.toISOString()
        });
        if (bEnd.getTime() > maxPlayedEnd.getTime()) {
          maxPlayedEnd = new Date(bEnd);
        }
      }
    }

    // Sort played items chronologically by playedAt / startTime
    playedItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    items.push(...playedItems);

    const unplayedScheduledBreaks = scheduledBreaks.filter(b => !playedBreakIds.has(b.id));

    // 3. Mode-specific unplayed cursor and announcement classification
    let totalPlayedSec = 0;
    Object.values(playedPlaylistTracks).forEach((p: any) => {
      if (p.durationSeconds && p.durationSeconds > 0) totalPlayedSec += p.durationSeconds;
      else totalPlayedSec += 180;
    });

    const isLivePlaylist = playMode === 'Playlist';
    const virtualCursor = new Date(Math.max(showStart.getTime() + totalPlayedSec * 1000, maxPlayedEnd.getTime()));
    
    // In Live with Playlist, reference current wall-clock. In Prerecord and Export, decouple completely from wall-clock.
    const unplayedStartCursor = isLivePlaylist
      ? new Date(Math.max((nowClock || syncTime || new Date()).getTime(), showStart.getTime(), maxPlayedEnd.getTime()))
      : virtualCursor;

    // Prerecord and Export have NO missed breaks by clock time; all unplayed breaks are upcoming and placed by cumulative duration.
    // Live with Playlist identifies breaks that have passed the live wall-clock cursor as missed (unless manually positioned by the user).
    const hasManualPosition = (b: typeof unplayedScheduledBreaks[0]) =>
      breakPositions[b.id] !== undefined || breakPositions[b.legacySlotId] !== undefined;

    const missedBreaks = isLivePlaylist
      ? unplayedScheduledBreaks.filter(b => !hasManualPosition(b) && b.slotTime.getTime() < unplayedStartCursor.getTime())
      : [];
    const upcomingBreaks = isLivePlaylist
      ? unplayedScheduledBreaks.filter(b => hasManualPosition(b) || b.slotTime.getTime() >= unplayedStartCursor.getTime())
      : unplayedScheduledBreaks;

    let missedCursor = new Date(maxPlayedEnd);
    for (const b of missedBreaks) {
      const bEnd = new Date(missedCursor.getTime() + b.totalDurationSec * 1000);
      items.push({
        type: 'break',
        id: b.id,
        slotTime: b.slotTime,
        startTime: new Date(missedCursor),
        endTime: bEnd,
        announcements: b.announcements
      });
      missedCursor = bEnd;
    }

    // 4. Calculate default track insertion indices for upcoming breaks, and interleave with active unplayed tracks
    const activeUnplayedTracks = playlistTracks.filter(t => !t.isAnnouncement && !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && !cancelledTrackIds.includes(t.id) && !cancelledTrackIds.includes(t.fileName));

    const getTrackDurationSec = (track: any): number => {
      const exactCachedDurationStr = mp3DurationCache.get(track.streamUrl) || availableFilesCache.get(track.fileName)?.duration;
      if (exactCachedDurationStr) {
        const parts = exactCachedDurationStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            return (mins * 60) + secs;
          }
        }
      }
      return track.durationSeconds || 180;
    };

    const breakTargetCounts: Array<{ breakObj: typeof upcomingBreaks[0]; afterCount: number }> = [];

    for (const b of upcomingBreaks) {
      const savedPos = breakPositions[b.id] !== undefined
        ? breakPositions[b.id]
        : breakPositions[b.legacySlotId];
      if (savedPos !== undefined) {
        breakTargetCounts.push({
          breakObj: b,
          afterCount: Math.min(activeUnplayedTracks.length, Math.max(0, savedPos))
        });
      } else {
        let defaultCount = 0;
        let tempTime = new Date(unplayedStartCursor);
        for (const track of activeUnplayedTracks) {
          const trackDur = getTrackDurationSec(track);
          const nominalEnd = new Date(tempTime.getTime() + trackDur * 1000);
          if (nominalEnd.getTime() <= b.slotTime.getTime()) {
            defaultCount++;
            tempTime = nominalEnd;
          } else {
            break;
          }
        }
        breakTargetCounts.push({
          breakObj: b,
          afterCount: defaultCount
        });
      }
    }

    const breaksByAfterCount = new Map<number, typeof upcomingBreaks>();
    for (const entry of breakTargetCounts) {
      const existing = breaksByAfterCount.get(entry.afterCount) || [];
      existing.push(entry.breakObj);
      breaksByAfterCount.set(entry.afterCount, existing);
    }
    for (const [, breakList] of breaksByAfterCount.entries()) {
      breakList.sort((a, b) => {
        const idxA = breakOrder.indexOf(a.id);
        const idxB = breakOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) {
          return idxA - idxB;
        }
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        const timeDiff = a.slotTime.getTime() - b.slotTime.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.initialOrderIndex - b.initialOrderIndex;
      });
    }

    type ActiveItem =
      | { type: 'track'; track: typeof activeUnplayedTracks[0] }
      | { type: 'break'; breakObj: typeof upcomingBreaks[0] };

    const activeTimelineSequence: ActiveItem[] = [];

    for (let i = 0; i <= activeUnplayedTracks.length; i++) {
      const breaksHere = breaksByAfterCount.get(i);
      if (breaksHere) {
        for (const b of breaksHere) {
          activeTimelineSequence.push({ type: 'break', breakObj: b });
        }
      }
      if (i < activeUnplayedTracks.length) {
        activeTimelineSequence.push({ type: 'track', track: activeUnplayedTracks[i] });
      }
    }

    let cursorTime = new Date(unplayedStartCursor);
    let activeTrackCounter = 1;
    let lastActiveTrackEnd = new Date(cursorTime);

    const activeTimelineEntries: PlaylistTimelineEntry[] = [];

    for (const item of activeTimelineSequence) {
      if (item.type === 'track') {
        const track = item.track;
        const trackDur = getTrackDurationSec(track);
        const trackStart = new Date(cursorTime);
        const trackEnd = new Date(trackStart.getTime() + trackDur * 1000);

        activeTimelineEntries.push({
          type: 'track',
          id: track.id,
          track,
          trackNumber: activeTrackCounter++,
          startTime: trackStart,
          endTime: trackEnd,
          played: false,
          cancelled: false
        });

        cursorTime = new Date(trackEnd);
        lastActiveTrackEnd = new Date(trackEnd);
      } else {
        const b = item.breakObj;
        const breakStart = new Date(cursorTime);
        const breakEnd = new Date(breakStart.getTime() + b.totalDurationSec * 1000);

        activeTimelineEntries.push({
          type: 'break',
          id: b.id,
          slotTime: b.slotTime,
          startTime: breakStart,
          endTime: breakEnd,
          announcements: b.announcements
        });

        cursorTime = new Date(breakEnd);
        lastActiveTrackEnd = new Date(breakEnd);
      }
    }

    // 5. Calculate Show End indicator card and Overrun card positions
    const showEndMs = showEnd.getTime();
    const showEntries = activeTimelineEntries.filter(i => i.startTime.getTime() < showEndMs);

    let maxShowEndMs = showStart.getTime();
    showEntries.forEach(i => {
      const endMs = (i.type === 'track' || i.type === 'break') ? i.endTime.getTime() : i.startTime.getTime();
      if (endMs > maxShowEndMs) {
        maxShowEndMs = endMs;
      }
    });

    let status: 'over' | 'under' | 'exact' = 'exact';
    let diffSeconds = 0;

    if (maxShowEndMs > showEndMs) {
      status = 'over';
      diffSeconds = Math.round((maxShowEndMs - showEndMs) / 1000);
    } else if (maxShowEndMs < showEndMs) {
      status = 'under';
      diffSeconds = Math.round((showEndMs - maxShowEndMs) / 1000);
    } else {
      status = 'exact';
      diffSeconds = 0;
    }

    const diffFormatted = formatDuration(diffSeconds);
    const showEndCardTimeMs = Math.max(showEndMs, maxShowEndMs);

    // Append show entries first
    items.push(...showEntries);

    // Append Show End indicator card strictly when in Playlist view (never on pure Prerecord view)
    const hasMusicTracks = (playlistTracks || []).some(t => !(t as any).isAnnouncement);
    const shouldShowEndIndicator =
      playMode === 'Playlist' ||
      (playMode === 'Prerecord' && selectedFolderPath !== '__no_playlist__' && hasMusicTracks);
    if (shouldShowEndIndicator) {
      items.push({
        type: 'show-end',
        id: 'show-end-indicator',
        showEnd,
        diffSeconds,
        diffFormatted,
        status,
        startTime: new Date(showEndCardTimeMs)
      });
    }

    // Extra entries are active entries starting at or after showEnd boundary / showEndCardTimeMs
    const extraEntries = activeTimelineEntries.filter(i => i.startTime.getTime() >= showEndMs || i.startTime.getTime() >= showEndCardTimeMs);
    let maxExtraEndMs = showEndCardTimeMs;

    if (extraEntries.length > 0) {
      extraEntries.forEach(i => {
        const endMs = (i.type === 'track' || i.type === 'break') ? i.endTime.getTime() : i.startTime.getTime();
        if (endMs > maxExtraEndMs) {
          maxExtraEndMs = endMs;
        }
      });

      const totalExtraSeconds = Math.round((maxExtraEndMs - showEndCardTimeMs) / 1000);
      const extraFormatted = formatDuration(totalExtraSeconds);

      items.push({
        type: 'extra-tracks',
        id: 'extra-tracks-indicator',
        totalExtraSeconds,
        extraFormatted,
        startTime: new Date(showEndCardTimeMs + 1)
      });

      // Append overrun extra entries after Overrun indicator card
      const overrunItems = extraEntries.map(entry => ({ ...entry, isOverrun: true }));
      items.push(...overrunItems);
    }

    // 6. Cancelled Playlist Tracks positioned after the Overrun card at the bottom of the view
    const cancelledTracks = playlistTracks.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
    let bottomCursor = new Date(Math.max(lastActiveTrackEnd.getTime(), showEnd.getTime(), maxExtraEndMs) + 60000);

    for (const track of cancelledTracks) {
      const trackDur = getTrackDurationSec(track);
      const trackStart = new Date(bottomCursor);
      const trackEnd = new Date(trackStart.getTime() + trackDur * 1000);
      items.push({
        type: 'track',
        id: track.id,
        track,
        trackNumber: 0,
        startTime: trackStart,
        endTime: trackEnd,
        played: false,
        cancelled: true
      });
      bottomCursor = new Date(trackEnd.getTime() + 1000);
    }

    return items;
  }, [playMode, playlistShow, effectiveShow, prerecordDate, playlistTracks, playlistFile, syncTime, announcements, logs, playedPlaylistTracks, playingStates, cancelledTrackIds, nowClock, breakPositions, breakOrder, selectedFolderPath]);

  const breakIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    let breakSlotCount = 0;
    playlistTimeline.forEach((item) => {
      if (item.type === 'break') {
        breakSlotCount++;
        item.announcements.forEach((s) => {
          const slotKey = `${item.slotTime.toISOString()}-${s.id}`;
          map[slotKey] = breakSlotCount;
        });
      }
    });
    return map;
  }, [playlistTimeline]);

  const applySwappedTimelineCards = (
    activeCards: Array<(typeof playlistTimeline)[number]>,
    idxA: number,
    idxB: number
  ) => {
    const swapped = [...activeCards];
    const itemA = swapped[idxA];
    const itemB = swapped[idxB];
    swapped[idxA] = itemB;
    swapped[idxB] = itemA;

    let trackCountSoFar = 0;
    const newBreakPositions: Record<string, number> = { ...breakPositions };
    const newBreakOrder: string[] = [];

    for (const card of swapped) {
      if (card.type === 'track') {
        trackCountSoFar++;
      } else if (card.type === 'break') {
        newBreakPositions[card.id] = trackCountSoFar;
        newBreakOrder.push(card.id);
      }
    }

    setBreakPositions(newBreakPositions);
    breakPositionsRef.current = newBreakPositions;
    setBreakOrder(newBreakOrder);
    breakOrderRef.current = newBreakOrder;

    if (itemA.type === 'track' && itemB.type === 'track') {
      setPlaylistTracks(prev => {
        const trackA = prev.find(t => t.id === itemA.id);
        const trackB = prev.find(t => t.id === itemB.id);
        if (trackA && trackB) {
          const newTracks = [...prev];
          const pos1 = newTracks.findIndex(t => t.id === trackA.id);
          const pos2 = newTracks.findIndex(t => t.id === trackB.id);
          if (pos1 !== -1 && pos2 !== -1) {
            newTracks[pos1] = trackB;
            newTracks[pos2] = trackA;
            playlistTracksRef.current = newTracks;
            saveCurrentShowPlaylistLog(undefined, undefined, newTracks, undefined, newBreakPositions, undefined, newBreakOrder);
            return newTracks;
          }
        }
        saveCurrentShowPlaylistLog(undefined, undefined, prev, undefined, newBreakPositions, undefined, newBreakOrder);
        return prev;
      });
    } else {
      saveCurrentShowPlaylistLog(undefined, undefined, undefined, undefined, newBreakPositions, undefined, newBreakOrder);
    }
  };

  const handleMoveTrackUp = (trackId: string) => {
    triggerMovedHighlight(trackId);
    
    // Check if moving inside cancelled tracks
    const isCancelled = cancelledTrackIds.includes(trackId);
    if (isCancelled) {
      setPlaylistTracks(prev => {
        let updatedTracks = prev;
        const cancelledTracks = prev.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
        const idxInCancelled = cancelledTracks.findIndex(t => t.id === trackId);
        if (idxInCancelled === 0) {
          // Reactivate track when moved above top cancelled item
          const newCancelled = cancelledTrackIds.filter(id => id !== trackId);
          setCancelledTrackIds(newCancelled);
          saveCurrentShowPlaylistLog(undefined, newCancelled, prev);
          return prev;
        } else if (idxInCancelled > 0) {
          const prevTrack = cancelledTracks[idxInCancelled - 1];
          const newTracks = [...prev];
          const pos1 = newTracks.findIndex(t => t.id === trackId);
          const pos2 = newTracks.findIndex(t => t.id === prevTrack.id);
          if (pos1 !== -1 && pos2 !== -1) {
            newTracks[pos1] = prevTrack;
            newTracks[pos2] = trackId ? prev.find(t => t.id === trackId)! : prevTrack;
            updatedTracks = newTracks;
          }
        }
        saveCurrentShowPlaylistLog(undefined, undefined, updatedTracks);
        return updatedTracks;
      });
      return;
    }

    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || (item.type === 'break' && !item.played && !item.cancelled)
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.type === 'track' && item.id === trackId);
    if (cardIdx > 0) {
      applySwappedTimelineCards(activeTimelineCards, cardIdx - 1, cardIdx);
    }
  };

  const handleMoveTrackDown = (trackId: string) => {
    triggerMovedHighlight(trackId);

    // Check if moving inside cancelled tracks
    const isCancelled = cancelledTrackIds.includes(trackId);
    if (isCancelled) {
      setPlaylistTracks(prev => {
        let updatedTracks = prev;
        const cancelledTracks = prev.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
        const idxInCancelled = cancelledTracks.findIndex(t => t.id === trackId);
        if (idxInCancelled >= 0 && idxInCancelled < cancelledTracks.length - 1) {
          const nextTrack = cancelledTracks[idxInCancelled + 1];
          const newTracks = [...prev];
          const pos1 = newTracks.findIndex(t => t.id === trackId);
          const pos2 = newTracks.findIndex(t => t.id === nextTrack.id);
          if (pos1 !== -1 && pos2 !== -1) {
            newTracks[pos1] = nextTrack;
            newTracks[pos2] = prev.find(t => t.id === trackId)!;
            updatedTracks = newTracks;
          }
        }
        saveCurrentShowPlaylistLog(undefined, undefined, updatedTracks);
        return updatedTracks;
      });
      return;
    }

    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || (item.type === 'break' && !item.played && !item.cancelled)
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.type === 'track' && item.id === trackId);
    if (cardIdx !== -1 && cardIdx < activeTimelineCards.length - 1) {
      applySwappedTimelineCards(activeTimelineCards, cardIdx, cardIdx + 1);
    }
  };

  const handleMoveBreakUp = (breakId: string) => {
    triggerMovedHighlight(breakId);
    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || (item.type === 'break' && !item.played && !item.cancelled)
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.id === breakId);
    if (cardIdx > 0) {
      applySwappedTimelineCards(activeTimelineCards, cardIdx - 1, cardIdx);
    }
  };

  const handleMoveBreakDown = (breakId: string) => {
    triggerMovedHighlight(breakId);
    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || (item.type === 'break' && !item.played && !item.cancelled)
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.id === breakId);
    if (cardIdx !== -1 && cardIdx < activeTimelineCards.length - 1) {
      applySwappedTimelineCards(activeTimelineCards, cardIdx, cardIdx + 1);
    }
  };

  const handleCancelTrack = (trackId: string) => {
    const updatedCancelled = [...cancelledTrackIds, trackId];
    setCancelledTrackIds(updatedCancelled);
    saveCurrentShowPlaylistLog(undefined, updatedCancelled);
  };

  const handleReactivateTrack = (trackId: string) => {
    const updatedCancelled = cancelledTrackIds.filter(id => id !== trackId);
    setCancelledTrackIds(updatedCancelled);
    saveCurrentShowPlaylistLog(undefined, updatedCancelled);
  };

  const handleTogglePlayTrack = async (track: {
    id: string;
    fileName: string;
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }) => {
    const slotKey = track.id;
    if (isAudioPlaying(slotKey)) {
      stopAudio(slotKey);
    } else {
      const playedAt = new Date().toISOString();
      try {
        const targetStreamUrl =
          track.streamUrl ||
          availableFilesCache.get(track.fileName)?.path ||
          track.fileName;
        const audio = await playAudio(slotKey, targetStreamUrl);
        if (!audio) return;

        const meta = trackMetadataMap[track.id] || trackMetadataMap[track.fileName] || trackMetadataMap[targetStreamUrl];
        const durRes = resolveTrackDuration({ ...track, streamUrl: targetStreamUrl }, meta, audio.duration);
        const trackDurationSeconds = durRes.durationSeconds;
        const trackDurationFormatted = durRes.durationFormatted;

        const showStart = playlistShow ? getActualShowStart(playlistShow, syncTime || new Date()) : undefined;

        const trackTitle = meta?.title || track.title || track.fileName;
        const trackArtist = meta?.artist || (track as any).artist || '';
        const trackAlbumArtist = meta?.albumArtist || (track as any).albumArtist || trackArtist;
        const trackAlbum = meta?.album || (track as any).album || '';

        // 1. Central Logs.json is strictly for announcements (playlist tracks are logged exclusively to the show JSON log)
        // onLog(logEntry) omitted for playlist music tracks as per logging configuration

        // 2. Defer moving played card above NOW bar until next regular redraw tick
        const playedInfo = {
          id: track.id,
          playedAt,
          fileName: track.fileName,
          title: trackTitle,
          artist: trackArtist,
          albumArtist: trackAlbumArtist,
          album: trackAlbum,
          durationSeconds: trackDurationSeconds,
          durationFormatted: trackDurationFormatted,
          streamUrl: targetStreamUrl,
          isAnnouncement: false
        };

        pendingPlayedPlaylistTracksRef.current[track.id] = playedInfo;
        pendingPlayedPlaylistTracksRef.current[track.fileName] = playedInfo;

        const updatedPlayedMap = {
          ...playedPlaylistTracks,
          [track.id]: playedInfo,
          [track.fileName]: playedInfo
        };
        setPlayedPlaylistTracks(updatedPlayedMap);

        // 3. Save entry to playlist show Log___.json
        saveCurrentShowPlaylistLog(updatedPlayedMap);

        // Reset card redraw timer when play is started
        startCardRotateTimer();
      } catch (e) {
        console.error('Error playing playlist track:', e);
      }
    }
  };

  const handleVerifyEvergreens = async () => {
    setIsVerifyingEvergreens(true);
    try {
      const headers = await getStorageApiHeaders();
      const resp = await fetch('/api/shows/verify-evergreens', {
        method: 'POST',
        headers,
        body: JSON.stringify({ shows })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to verify folders');
      
      if (data.announcementsReadonlyError) {
        alert(`Warning: ${data.announcementsReadonlyMessage}`);
        return;
      }

      const createdMsg = data.createdFolders?.length > 0
        ? `\n\nCreated folders for shows: ${data.createdFolders.join(', ')}`
        : '';
      const playlistsLoc = data.playlistsPath ? `\nPlaylists Location: ${data.playlistsPath}` : '';
      const intersLoc = data.announcementsPath ? `\nAnnouncements Location: ${data.announcementsPath}` : '';
      alert(`Evergreen, Playlist & Announcement folder verification completed successfully!\n\nEvergreens Location: ${data.evergreensPath}${playlistsLoc}${intersLoc}${createdMsg}`);
    } catch (err: any) {
      alert(`Error verifying folders:\n${err.message}`);
    } finally {
      setIsVerifyingEvergreens(false);
    }
  };

  const renderLiveReadOverlay = () => {
    if (!activeLiveReadOverlay) return null;

    // In Desktop App (Mac/Win), spawnLiveRead creates a standalone BrowserWindow.
    // Render a flat, semi-opaque blocking modal in the main window disabling interactions until closed.
    if (window.electronAPI && window.electronAPI.spawnLiveRead) {
      return (
        <div
          id="live-read-blocking-backdrop"
          className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 select-none"
          onClick={() => {
            if (window.electronAPI?.focusLiveReadWindow) {
              window.electronAPI.focusLiveReadWindow();
            }
          }}
        >
          <div
            id="live-read-blocking-card"
            className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 max-w-sm w-full text-center space-y-4 text-slate-100 animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white tracking-tight">
                Live Read Script Active
              </h3>
              <p className="text-sm text-slate-300 font-medium leading-relaxed">
                Please close popup to continue
              </p>
              {activeLiveReadOverlay.name || activeLiveReadOverlay.announcementName ? (
                <p className="text-xs text-slate-400 truncate pt-1 font-sans">
                  {activeLiveReadOverlay.name || activeLiveReadOverlay.announcementName}
                </p>
              ) : null}
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                id="focus-live-read-popup-btn"
                onClick={() => {
                  if (window.electronAPI?.focusLiveReadWindow) {
                    window.electronAPI.focusLiveReadWindow();
                  }
                }}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                Bring Popup to Front
              </button>
              <button
                type="button"
                id="dismiss-live-read-overlay-btn"
                onClick={() => {
                  if (window.electronAPI?.closeLiveReadWindow) {
                    window.electronAPI.closeLiveReadWindow();
                  }
                  setActiveLiveReadOverlay(null);
                }}
                className="w-full py-1.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer border border-slate-700"
              >
                Cancel &amp; Close Popup
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div id="live-read-in-app-overlay" className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
        <LiveReadPopout
          initialFileName={activeLiveReadOverlay.filePath || activeLiveReadOverlay.fileName}
          initialAnnouncementId={activeLiveReadOverlay.announcementId}
          initialAnnouncementName={activeLiveReadOverlay.announcementName}
          initialAnnouncementTime={activeLiveReadOverlay.announcementTime}
          initialLoggedTime={activeLiveReadOverlay.initialLoggedTime}
          initialShowId={activeLiveReadOverlay.showId}
          initialShowName={activeLiveReadOverlay.showName}
          initialHostName={activeLiveReadOverlay.hostName}
          initialShowDateTime={activeLiveReadOverlay.showDateTime}
          backupMp3Url={activeLiveReadOverlay.backupMp3Url}
          playMode={playMode}
          isOverlay={true}
          isPreview={activeLiveReadOverlay.playMode === 'Export' || activeLiveReadOverlay.isPreview}
          isReadOnly={isReadOnly}
          onClose={() => setActiveLiveReadOverlay(null)}
          onLogCommit={(logEntry) => {
            if (activeLiveReadOverlay.playMode !== 'Export' && !activeLiveReadOverlay.isPreview) {
              onLog(logEntry);
              const targetDate = new Date(logEntry.announcementTime || logEntry.timestamp || Date.now());
              const activeShow = getShowForSlot(targetDate);
              const isPlaylistActive = playMode === 'Playlist' || (playMode === 'Prerecord' && selectedFolderPathRef.current !== '__no_playlist__');
              if (isPlaylistActive && activeShow && logEntry.announcementId) {
                const targetAnnouncement = announcements.find(s => s.id === logEntry.announcementId);
                const activeMp3 = targetAnnouncement ? getActiveMp3ForSlot(targetAnnouncement, targetDate) : null;
                const durSec = activeMp3?.duration ? parseInt(activeMp3.duration, 10) || 60 : 60;
                const mins = Math.floor(durSec / 60);
                const secs = durSec % 60;
                const durFmt = `${mins}:${secs.toString().padStart(2, '0')}`;
                const updatedPlayed = {
                  ...playedPlaylistTracksRef.current,
                  [logEntry.announcementId]: {
                    id: logEntry.announcementId,
                    playedAt: logEntry.timestamp,
                    fileName: logEntry.mp3Name || activeMp3?.mp3Url || 'Live Read',
                    title: logEntry.announcementName || targetAnnouncement?.name || 'Live Read',
                    durationSeconds: durSec,
                    durationFormatted: durFmt,
                    isAnnouncement: true
                  }
                };
                setPlayedPlaylistTracks(updatedPlayed);
                saveCurrentShowPlaylistLog(updatedPlayed);
              }
            }
            setActiveLiveReadOverlay(null);
          }}
          onPlayBackupMp3={(backupUrl) => {
            setActiveLiveReadOverlay(null);
            if (activeLiveReadOverlay.announcementId && activeLiveReadOverlay.slotKey && activeLiveReadOverlay.slotISO) {
              const targetAnnouncement = announcements.find(s => s.id === activeLiveReadOverlay.announcementId);
              if (targetAnnouncement) {
                const slotDate = new Date(activeLiveReadOverlay.slotISO);
                playBackupAudioTrack(backupUrl, activeLiveReadOverlay.slotKey, targetAnnouncement, slotDate, true);
              }
            }
          }}
        />
      </div>
    );
  };

  const renderFolderChooserModal = () => {
    if (!isFolderChooserVisible) return null;
    return (
      <FolderChooserModal
        isOpen={isFolderChooserVisible}
        onClose={() => {
          setShowFolderChooserModal(false);
          if (onCloseFolderChooser) onCloseFolderChooser();
        }}
        show={effectiveShow}
        folderType="show"
        currentSelectedFolderPath={selectedFolderPath}
        isExternalFolder={isExternalFolder}
        externalAbsolutePath={externalAbsolutePath}
        onSelectFolder={async (params) => {
          await handleSwitchPlaylistFolder({
            relPath: params.selectedFolderPath,
            isExternal: params.isExternalFolder,
            externalAbsolutePath: params.externalAbsolutePath,
          });
        }}
      />
    );
  };

  const handlePlay = async (s: Announcement, slot: Date) => {
    const slotKey = `${slot.toISOString()}-${s.id}`;
    
    if (isAudioPlaying(slotKey)) {
      stopAudio(slotKey);
      return;
    }

    const activeMp3 = getActiveMp3ForSlot(s, slot);
    const isScript = getGatedAssetType(activeMp3) === 'script';

    if (isScript) {
      const targetScriptUrl = activeMp3?.mp3Url || '';
      const parts = targetScriptUrl ? targetScriptUrl.split('/') : [];
      const filename = parts[parts.length - 1] || 'Script';
      
      const announcementTimeISO = getParsedCustomTimeISO(customScriptTimes[slotKey], slot);

      const slotISO = stationSlotDateToUtcIso(slot);
      const playedLog = logs.find(l => 
        l.announcementId === s.id && 
        isLogForStationSlot(l, slot) &&
        (l.status === 'played' || l.status === 'backup play')
      );

      const activeShow = getShowForSlot(slot);
      const showStart = activeShow ? getActualShowStart(activeShow, slot) : undefined;

      const payload = {
        name: filename,
        fileName: filename,
        filePath: targetScriptUrl,
        announcementId: s.id,
        announcementName: formatRotatedAnnouncementName(s.name, activeMp3),
        announcementTime: announcementTimeISO,
        initialLoggedTime: playedLog?.logTimeStamp || playedLog?.timestamp || '',
        backupMp3Url: activeMp3?.backupMp3Url,
        slotKey,
        slotISO: announcementTimeISO,
        playMode,
        isPreview: false,
        showId: activeShow?.id || '',
        showName: activeShow?.name || '',
        hostName: activeShow?.host || '',
        showDateTime: showStart ? stationSlotDateToUtcIso(showStart) : slotISO
      };

      if (window.electronAPI && window.electronAPI.spawnLiveRead) {
        window.electronAPI.spawnLiveRead(payload);
        setActiveLiveReadOverlay(payload); // Set local state so we can show active ticking clock
      } else {
        // Fallback to server call & client-side overlay
        fetch('/api/live-read/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.mode === 'browser') {
              setActiveLiveReadOverlay(payload);
            } else {
              setActiveLiveReadOverlay(payload); // Keep local state active to show clock next to card
            }
          })
          .catch((err) => {
            console.error("Failed to spawn live read window:", err);
            // Even if server call fails, open overlay as a fallback
            setActiveLiveReadOverlay(payload);
          });
      }
      return;
    }

    const targetMp3Url = activeMp3?.mp3Url || '';
    try {
      const audio = await playAudio(slotKey, targetMp3Url);
      if (!audio) return;

      const playedAt = new Date().toISOString();
      const slotISO = stationSlotDateToUtcIso(slot);
      const activeShow = getShowForSlot(slot);
      const showStart = activeShow ? getActualShowStart(activeShow, slot) : undefined;
      const logEntry: LogEntry = {
        timestamp: playedAt,
        announcementTime: slotISO,
        mp3Name: targetMp3Url,
        announcementName: s.name,
        announcementId: s.id,
        status: 'played',
        playMode: playMode,
        logTimeStamp: playedAt,
        assetType: 'audio',
        ...(activeShow ? {
          showId: activeShow.id,
          showName: activeShow.name,
          hostName: activeShow.host,
          showDateTime: showStart ? stationSlotDateToUtcIso(showStart) : slotISO
        } : {})
      };
      onLog(logEntry);

      const isPlaylistActive = playMode === 'Playlist' || (playMode === 'Prerecord' && selectedFolderPathRef.current !== '__no_playlist__');
      if (isPlaylistActive && activeShow) {
        const durRes = resolveTrackDuration({ streamUrl: targetMp3Url, fileName: targetMp3Url }, undefined, audio.duration);
        const updatedPlayed = {
          ...playedPlaylistTracksRef.current,
          [s.id]: {
            id: s.id,
            playedAt,
            fileName: targetMp3Url,
            title: s.name,
            durationSeconds: durRes.durationSeconds,
            durationFormatted: durRes.durationFormatted,
            isAnnouncement: true
          }
        };
        setPlayedPlaylistTracks(updatedPlayed);
        saveCurrentShowPlaylistLog(updatedPlayed);
      }
    } catch (err) {
      console.error('Playback failed', err);
      const failedAt = new Date().toISOString();
      const slotISO = stationSlotDateToUtcIso(slot);
      const activeShow = getShowForSlot(slot);
      const showStart = activeShow ? getActualShowStart(activeShow, slot) : undefined;
      onLog({
        timestamp: failedAt,
        announcementTime: slotISO,
        mp3Name: targetMp3Url,
        announcementName: s.name,
        announcementId: s.id,
        status: 'failed',
        playMode: playMode,
        logTimeStamp: failedAt,
        assetType: 'audio',
        ...(activeShow ? {
          showId: activeShow.id,
          showName: activeShow.name,
          hostName: activeShow.host,
          showDateTime: showStart ? stationSlotDateToUtcIso(showStart) : slotISO
        } : {})
      });
    }
  };

  const playBackupAudioTrack = async (backupUrl: string, slotKey: string, s: Announcement, slot: Date, skipLogging = false) => {
    try {
      const audio = await playAudio(slotKey, backupUrl);
      if (!audio) return;

      const playedAt = new Date().toISOString();
      const slotISO = stationSlotDateToUtcIso(slot);
      const activeShow = getShowForSlot(slot);
      const showStart = activeShow ? getActualShowStart(activeShow, slot) : undefined;
      
      if (!skipLogging) {
        const logEntry: LogEntry = {
          timestamp: playedAt,
          announcementTime: slotISO,
          mp3Name: backupUrl,
          announcementName: s.name,
          announcementId: s.id,
          status: 'backup play',
          playMode: playMode,
          logTimeStamp: playedAt,
          assetType: 'audio',
          ...(activeShow ? {
            showId: activeShow.id,
            showName: activeShow.name,
            hostName: activeShow.host,
            showDateTime: showStart ? stationSlotDateToUtcIso(showStart) : slotISO
          } : {})
        };
        onLog(logEntry);
      }

      const isPlaylistActive = playMode === 'Playlist' || (playMode === 'Prerecord' && selectedFolderPathRef.current !== '__no_playlist__');
      if (isPlaylistActive && activeShow) {
        const durRes = resolveTrackDuration({ streamUrl: backupUrl, fileName: backupUrl }, undefined, audio.duration);
        const updatedPlayed = {
          ...playedPlaylistTracksRef.current,
          [s.id]: {
            id: s.id,
            playedAt,
            fileName: backupUrl,
            title: `${s.name} (backup mp3)`,
            durationSeconds: durRes.durationSeconds,
            durationFormatted: durRes.durationFormatted,
            isAnnouncement: true
          }
        };
        setPlayedPlaylistTracks(updatedPlayed);
        saveCurrentShowPlaylistLog(updatedPlayed);
      }
    } catch (err) {
      console.error('Backup MP3 playback failed', err);
    }
  };

  const isPlayed = (announcementId: string, slot: Date) => {
    return logs.some(l => 
      l.announcementId === announcementId && 
      (l.announcementTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
      (l.status === 'played' || l.status === 'backup play')
    );
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const itemsToExport = useMemo(() => {
    if (playMode !== 'Prerecord' || !prerecordDate) return [];
    
    const items: Array<{
      slotTime: string;
      fileName: string;
      announcementName: string;
      announcementId: string;
      minute: number;
      exists: boolean;
      targetFileName: string;
      slotISO: string;
      assetType?: 'audio' | 'script';
      approximateReadTime?: string;
      backupMp3Url?: string;
      backupMp3Exists?: boolean;
      isEvergreen?: boolean;
      showNameShort?: string;
      showName?: string;
      artist?: string;
      albumArtist?: string;
      album?: string;
    }> = [];

    const showPrefix = (playlistShow?.nameShort || playlistShow?.name || 'Show').trim();

    playlistTimeline.forEach((item) => {
      if (item.type === 'break') {
        item.announcements.forEach((s) => {
          const activeMp3 = getActiveMp3ForSlot(s, item.slotTime);
          const itemAssetType = getGatedAssetType(activeMp3);
          const itemIdx = items.length + 1;
          const slotTimeStr = format(item.slotTime, 'HH:mm');
          const safeSlotTime = formatExportTimeAmPm(item.slotTime.getHours(), item.slotTime.getMinutes());
          const rawName = s.name || 'Unnamed Break';
          const safeAnnouncementName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
          const rawMp3Url = activeMp3?.mp3Url || '';
          const isUpNextItem = Boolean(s.isUpNextPromo) || isUpNextPromoUrl(rawMp3Url);
          const cleanUpNextShowName = rawName.replace(/^Up Next:\s*/i, '').trim() || 'Upcoming Show';
          const sourceFileName = isUpNextItem ? `Up Next - ${cleanUpNextShowName}.txt` : rawMp3Url;
          const dotIndex = sourceFileName.lastIndexOf('.');
          const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : (itemAssetType === 'script' ? '.txt' : '.mp3');
          const paddedIdx = String(itemIdx).padStart(2, '0');
          const targetFileName = `${showPrefix} ${paddedIdx} Break at ${safeSlotTime} - ${safeAnnouncementName}${ext}`;
          const exists = rawMp3Url ? getMP3Status(rawMp3Url).exists : false;

          const backupUrl = activeMp3?.backupMp3Url;
          const backupMp3Exists = backupUrl ? getMP3Status(backupUrl).exists : false;

          items.push({
            slotTime: slotTimeStr,
            fileName: sourceFileName,
            announcementName: rawName,
            announcementId: s.id,
            minute: s.minute,
            exists,
            targetFileName,
            slotISO: stationSlotDateToUtcIso(item.slotTime),
            assetType: itemAssetType,
            approximateReadTime: activeMp3?.approximateReadTime,
            backupMp3Url: backupUrl,
            backupMp3Exists,
            isEvergreen: false,
          });
        });
      } else if (item.type === 'track') {
        const itemIdx = items.length + 1;
        const slotTimeStr = format(item.startTime, 'HH:mm');
        const safeSlotTime = formatExportTimeAmPm(item.startTime.getHours(), item.startTime.getMinutes());
        const rawName = item.track.title || item.track.fileName || 'Evergreen Track';
        const safeTrackName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = item.track.fileName || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const paddedIdx = String(itemIdx).padStart(2, '0');
        const targetFileName = `${showPrefix} ${paddedIdx} Track at ${safeSlotTime} - ${safeTrackName}${ext}`;
        const exists = getMP3Status(sourceFileName).exists;

        const meta = trackMetadataMap[item.track.streamUrl] || 
                     trackMetadataMap[item.track.fileName] || 
                     trackMetadataMap[item.track.id];

        const artist = meta?.artist?.trim() || item.track.artist?.trim() || undefined;
        const albumArtist = meta?.albumArtist?.trim() || item.track.albumArtist?.trim() || undefined;
        const album = meta?.album?.trim() || item.track.album?.trim() || undefined;

        items.push({
          slotTime: slotTimeStr,
          fileName: sourceFileName,
          announcementName: rawName,
          announcementId: item.track.id,
          minute: item.startTime.getMinutes(),
          exists,
          targetFileName,
          slotISO: stationSlotDateToUtcIso(item.startTime),
          assetType: 'audio',
          isEvergreen: true,
          showNameShort: playlistShow?.nameShort,
          showName: playlistShow?.name,
          artist,
          albumArtist,
          album,
        });
      }
    });

    return items;
  }, [playMode, prerecordDate, playlistTimeline, playlistShow, trackMetadataMap]);

  const previewText = useMemo(() => {
    if (playMode !== 'Prerecord' || !prerecordDate) return '';

    const year = prerecordDate.getFullYear();
    const month = String(prerecordDate.getMonth() + 1).padStart(2, '0');
    const day = String(prerecordDate.getDate()).padStart(2, '0');
    const hours = String(prerecordDate.getHours()).padStart(2, '0');
    const minutes = String(prerecordDate.getMinutes()).padStart(2, '0');

    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthShort = monthShorts[prerecordDate.getMonth()] || 'JUN';

    const dateStr = `${year}-${month}-${monthShort}-${day}`;

    const txtLines: string[] = [
      '========================================================================',
      '              PRERECORD BROADCAST SCHEDULE SUMMARY',
      '========================================================================',
      `Air Date: ${dateStr}`,
      `Start Time: ${hours}:${minutes}`,
      `Duration: ${prerecordLengthMinutes} minutes`,
      '========================================================================',
      '',
      'SEQUENCE OF SCHEDULED EVERGREENS, SPECIALS & BREAKS:',
      '------------------------------------------------------------------------'
    ];

    if (itemsToExport.length === 0) {
      txtLines.push('No active scheduled items or breaks found in this timeframe.');
    } else {
      itemsToExport.forEach((item: any, idx: number) => {
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime;
        const rawName = item.announcementName || 'Unnamed Item';
        const sourceFileName = item.fileName || '';
        const targetFileName = item.targetFileName || sourceFileName;
        const isScript = item.assetType === 'script';
        const typeLabel = item.isEvergreen ? 'EVERGREEN TRACK' : (isScript ? 'LIVE READ BREAK' : 'BREAK');
        const status = item.exists ? 'Found' : 'Missing';

        if (status === 'Found') {
          txtLines.push(`${itemIdx}. [${typeLabel}] Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          if (item.artist) {
            txtLines.push(`   Artist: ${item.artist}`);
          }
          if (item.albumArtist && (!item.artist || item.albumArtist.toLowerCase() !== item.artist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${item.albumArtist}`);
          }
          if (item.album) {
            txtLines.push(`   Album: ${item.album}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName}`);
        } else {
          txtLines.push(`${itemIdx}. [${typeLabel}] MISSING FILE - THIS FILE COULD NOT BE FOUND.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          if (item.artist) {
            txtLines.push(`   Artist: ${item.artist}`);
          }
          if (item.albumArtist && (!item.artist || item.albumArtist.toLowerCase() !== item.artist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${item.albumArtist}`);
          }
          if (item.album) {
            txtLines.push(`   Album: ${item.album}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName}`);
        }

        if (isScript && item.backupMp3Url) {
          const dotIdx = targetFileName.lastIndexOf('.');
          const baseName = dotIdx !== -1 ? targetFileName.substring(0, dotIdx) : targetFileName;
          const backupExt = item.backupMp3Url.lastIndexOf('.') !== -1 ? item.backupMp3Url.substring(item.backupMp3Url.lastIndexOf('.')) : '.mp3';
          const backupTargetName = `${baseName} (Backup)${backupExt}`;
          const backupStatus = item.backupMp3Exists ? 'Found' : 'Missing';
          txtLines.push(`   Alternate Backup MP3: ${backupTargetName} (${backupStatus})`);
          txtLines.push(`   Source Backup MP3: ${item.backupMp3Url}`);
        }

        txtLines.push('------------------------------------------------------------------------');
      });
    }

    return txtLines.join('\n');
  }, [playMode, prerecordDate, prerecordLengthMinutes, itemsToExport]);

  const exportActiveShow = useMemo(() => {
    if (playMode !== 'Prerecord' || !prerecordDate) return null;
    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const dayName = daysOrder[prerecordDate.getDay()];
    const hour = prerecordDate.getHours();
    const minute = prerecordDate.getMinutes();
    const activeShows = shows.filter(show => 
      isTimeInShow(show, dayName, hour, minute)
    );
    return activeShows[0] || null;
  }, [playMode, prerecordDate, shows]);

  const exportShade = useMemo(() => {
    if (exportActiveShow) {
      return getShowShade(exportActiveShow, getSortedShows(shows));
    }
    return { bg: '#FFF6BC', border: '#EADA76', title: 'Export Show' };
  }, [exportActiveShow, shows]);

  const hasUnlogged = useMemo(() => {
    if (!itemsToExport) return false;
    return itemsToExport.some(item => {
      if (item.isEvergreen) return false;
      const slot = getStationNow(parseISO(item.slotISO));
      const playedLog = logs.find(l => 
        l.announcementId === item.announcementId && 
        isLogForStationSlot(l, slot) &&
        (l.status === 'played' || l.status === 'backup play')
      );
      return !playedLog;
    });
  }, [itemsToExport, logs]);

  const handleLogExportAsPlayed = async () => {
    const unlogged = itemsToExport.filter(item => {
      if (item.isEvergreen) return false;
      const slot = getStationNow(parseISO(item.slotISO));
      const playedLog = logs.find(l => 
        l.announcementId === item.announcementId && 
        isLogForStationSlot(l, slot) &&
        (l.status === 'played' || l.status === 'backup play')
      );
      return !playedLog;
    });

    if (unlogged.length === 0) return;

    setIsLoggingExports(true);
    try {
      const nowISO = new Date().toISOString();
      for (const item of unlogged) {
        const slot = getStationNow(parseISO(item.slotISO));
        const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const dayName = daysOrder[slot.getDay()];
        const hour = slot.getHours();
        const minute = slot.getMinutes();
        const activeShow = exportActiveShow || (shows && shows.find(show => isTimeInShow(show, dayName, hour, minute)));
        const showStart = activeShow ? getActualShowStart(activeShow, slot) : undefined;

        await onLog({
          timestamp: nowISO,
          announcementTime: item.slotISO,
          mp3Name: item.fileName,
          announcementName: item.announcementName,
          announcementId: item.announcementId,
          status: 'played',
          playMode: 'Export',
          logTimeStamp: nowISO,
          assetType: item.assetType || 'audio',
          artist: item.artist,
          albumArtist: item.albumArtist,
          album: item.album,
          ...(activeShow ? {
            showId: activeShow.id,
            showName: activeShow.name,
            hostName: activeShow.host,
            showDateTime: showStart ? stationSlotDateToUtcIso(showStart) : item.slotISO
          } : {})
        });
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error("Failed to log exports:", err);
    } finally {
      setIsLoggingExports(false);
    }
  };

  // Option 2 Pinned Show Spacer State for Live Mode
  const [topPinnedSpacer, setTopPinnedSpacer] = useState<{
    id: string;
    name: string;
    time: string;
    shadeBg: string;
    shadeBorder: string;
  } | null>(null);
  const [bottomPinnedSpacer, setBottomPinnedSpacer] = useState<{
    id: string;
    name: string;
    time: string;
    shadeBg: string;
    shadeBorder: string;
  } | null>(null);
  const nowSectionRef = useRef<HTMLDivElement>(null);

  const handleLiveScrollContainer = useCallback(() => {
    if (playMode !== 'Live' || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const containerRect = container.getBoundingClientRect();

    const spacerEls = Array.from(
      container.querySelectorAll('[data-spacer-id]')
    ) as HTMLElement[];
    if (spacerEls.length === 0) {
      setTopPinnedSpacer(null);
      setBottomPinnedSpacer(null);
      return;
    }

    const measures = spacerEls.map((el) => {
      const elRect = el.getBoundingClientRect();
      const top = elRect.top - containerRect.top;
      const offsetHeight = elRect.height || el.offsetHeight || 32;
      const bottom = top + offsetHeight;
      const offsetTop = top + scrollTop;
      return {
        id: el.getAttribute('data-spacer-id') || '',
        name: el.getAttribute('data-spacer-name') || '',
        time: el.getAttribute('data-spacer-time') || '',
        shadeBg: el.getAttribute('data-spacer-bg') || 'var(--show-shade-odd-bg)',
        shadeBorder: el.getAttribute('data-spacer-border') || 'var(--show-shade-odd-border)',
        offsetTop,
        isOffScreenTop: top < -2,
        isOffScreenBottom: bottom > clientHeight + 2,
      };
    });

    measures.sort((a, b) => a.offsetTop - b.offsetTop);

    const offTop = measures.filter((m) => m.isOffScreenTop);
    const newTop = offTop.length > 0 ? offTop[offTop.length - 1] : null;

    const offBottom = measures.filter((m) => m.isOffScreenBottom);
    const newBottom = offBottom.find((m) => !newTop || m.id !== newTop.id) || null;

    setTopPinnedSpacer(
      newTop
        ? {
            id: newTop.id,
            name: newTop.name,
            time: newTop.time,
            shadeBg: newTop.shadeBg,
            shadeBorder: newTop.shadeBorder,
          }
        : null
    );
    setBottomPinnedSpacer(
      newBottom
        ? {
            id: newBottom.id,
            name: newBottom.name,
            time: newBottom.time,
            shadeBg: newBottom.shadeBg,
            shadeBorder: newBottom.shadeBorder,
          }
        : null
    );
  }, [playMode]);

  useEffect(() => {
    if (playMode === 'Live') {
      const timer = setTimeout(() => {
        handleLiveScrollContainer();
      }, 60);
      return () => clearTimeout(timer);
    } else {
      setTopPinnedSpacer(null);
      setBottomPinnedSpacer(null);
    }
  }, [playMode, timeline, announcements, shows, handleLiveScrollContainer]);

  const scrollToSpacer = (spacerId: string) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const el = container.querySelector(`[data-spacer-id="${spacerId}"]`) as HTMLElement | null;
    if (!el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elOffsetTop = elRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({
      top: Math.max(0, elOffsetTop - 8),
      behavior: 'smooth',
    });
  };

  const scrollToNow = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const nowEl = nowSectionRef.current || (container.querySelector('#now-indicator') as HTMLElement | null);
    if (!nowEl) return;
    const containerHeight = container.clientHeight;
    const nowHeight = nowEl.offsetHeight;
    const nowTop = nowEl.offsetTop;
    if (nowHeight >= containerHeight) {
      container.scrollTo({
        top: Math.max(0, nowTop - 8),
        behavior: 'smooth',
      });
    } else {
      const targetScrollTop = nowTop + nowHeight / 2 - containerHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    }
  }, []);

  const prerecordExportBreakItems = useMemo<PrerecordExportBreakItem[]>(() => {
    if (playMode !== 'Prerecord' || !prerecordDate) return [];
    const results: PrerecordExportBreakItem[] = [];
    const buildBreakItem = (slot: Date, s: Announcement): PrerecordExportBreakItem => {
      const activeMp3 = getActiveMp3ForSlot(s, slot);
      const isScript = getGatedAssetType(activeMp3) === 'script';
      const activeMp3Url = activeMp3?.mp3Url || '';
      const fileInCache = availableFilesCache.get(activeMp3Url);
      const resolvedUrl = fileInCache ? fileInCache.path : activeMp3Url;
      const rawDur = isScript
        ? activeMp3?.approximateReadTime
          ? activeMp3.approximateReadTime.startsWith('~')
            ? activeMp3.approximateReadTime
            : `~${activeMp3.approximateReadTime}`
          : '0:20'
        : mp3DurationCache.get(activeMp3Url) || activeMp3?.duration || '0:30';
      let durSec = 30;
      const cleanDur = rawDur.replace(/^~/, '');
      const parts = cleanDur.split(':');
      if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const sec = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(sec)) durSec = m * 60 + sec;
      }
      const decodedUpNextText = decodeUpNextPromoText(activeMp3Url) || (s as any).upNextScriptText || undefined;
      return {
        slot,
        announcement: s,
        activeMp3,
        isScript,
        isUpNextPromo: Boolean(s.isUpNextPromo) || isUpNextPromoUrl(activeMp3Url),
        resolvedUrl,
        durationLabel: rawDur,
        durationSeconds: durSec,
        scriptText: decodedUpNextText,
      };
    };

    const timelineBreaks = playlistTimeline.filter(
      (item): item is Extract<(typeof playlistTimeline)[number], { type: 'break' }> =>
        item.type === 'break'
    );

    if (timelineBreaks.length > 0) {
      for (const bEntry of timelineBreaks) {
        for (const s of bEntry.announcements) {
          results.push(buildBreakItem(bEntry.slotTime, s));
        }
      }
    } else {
      const playedResults: PrerecordExportBreakItem[] = [];
      const upcomingResults: PrerecordExportBreakItem[] = [];
      for (const slot of timeline) {
        const sForSlot = getAnnouncementsForSlot(slot);
        for (const s of sForSlot) {
          const item = buildBreakItem(slot, s);
          const isCompleted = logs.some(
            (l) =>
              l.announcementId === s.id &&
              isLogForStationSlot(l, slot) &&
              (l.status === 'played' || l.status === 'backup play')
          );
          if (isCompleted) {
            playedResults.push(item);
          } else {
            upcomingResults.push(item);
          }
        }
      }
      results.push(...playedResults, ...upcomingResults);
    }
    return results;
  }, [playMode, prerecordDate, playlistTimeline, timeline, announcements, logs]);

  const prerecordExportPlaylistSequence = useMemo<PrerecordExportTrackEntry[]>(() => {
    if (playMode !== 'Prerecord' || playlistTracks.length === 0) return [];
    const seq: PrerecordExportTrackEntry[] = [];
    for (const item of playlistTimeline) {
      if (item.type === 'track' && !item.cancelled) {
        const durStr =
          mp3DurationCache.get(item.track.streamUrl) ||
          availableFilesCache.get(item.track.fileName)?.duration ||
          item.track.durationFormatted ||
          '3:00';
        seq.push({
          kind: 'track',
          title: item.track.title || item.track.fileName,
          durationSeconds: item.track.durationSeconds || 180,
          durationLabel: durStr,
          filename: item.track.fileName,
        });
      } else if (item.type === 'break') {
        const bItems = prerecordExportBreakItems.filter(
          (b) =>
            item.announcements.some((a) => a.id === b.announcement.id) &&
            isSameMinute(b.slot, item.slotTime)
        );
        if (bItems.length > 0) {
          seq.push({
            kind: 'break',
            title: `Break ${format(item.slotTime, 'h:mm a')}`,
            durationSeconds: item.totalDurationSec,
            durationLabel: formatTime(item.totalDurationSec),
            slot: item.slotTime,
            breakItems: bItems,
          });
        }
      }
    }
    return seq;
  }, [playMode, playlistTracks.length, playlistTimeline, prerecordExportBreakItems]);

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      <div
        className="flex-1 min-h-0 flex flex-col relative overflow-hidden w-full bg-slate-100/60 tobe-timeline-canvas rec-dark-safe-pills rec-warm-dark-shades"
      >
      {playMode === 'Live' ? (
        topPinnedSpacer && (
          <PinnedLiveShowBanner
            spacer={topPinnedSpacer}
            position="top"
            onScrollToSpacer={scrollToSpacer}
          />
        )
      ) : (
        <PersistentModeShowHeader
          playMode={playMode}
          effectiveShow={effectiveShow}
          shows={shows}
          timeline={timeline}
          persistentHeaderRef={persistentHeaderRef}
          persistentLeftStripRef={persistentLeftStripRef}
          persistentTextBoxRef={persistentTextBoxRef}
          persistentTitleRef={persistentTitleRef}
          persistentTitleTextRef={persistentTitleTextRef}
        />
      )}

      <div 
        ref={scrollContainerRef}
        onScroll={playMode === 'Live' ? handleLiveScrollContainer : undefined}
        className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-4 relative"
      >
        {(() => {
          const modeStr = playMode as string;
          const hasMusicTracks = playlistTracks.some(t => !(t as any).isAnnouncement);
          const shouldRenderPlaylistView = modeStr === 'Playlist' || 
            (modeStr === 'Prerecord' && selectedFolderPath !== '__no_playlist__' && hasMusicTracks);

          if (shouldRenderPlaylistView) {
            return (
              <PlayerPlaylistDeckView
                playMode={playMode}
                effectiveShow={effectiveShow}
                shows={shows}
                now={now}
                logs={logs}
                isPlaylistLoading={isPlaylistLoading}
                playlistFolderType={playlistFolderType}
                playlistTimeline={playlistTimeline}
                playlistTracks={playlistTracks}
                playedPlaylistTracks={playedPlaylistTracks}
                pendingPlayedPlaylistTracksRef={pendingPlayedPlaylistTracksRef}
                trackMetadataMap={trackMetadataMap}
                playingStates={playingStates}
                isAudioPlaying={isAudioPlaying}
                movedHighlightTrackId={movedHighlightTrackId}
                resolvedAdminContact={resolvedAdminContact}
                activeItemRef={activeItemRef}
                nowSectionRef={nowSectionRef}
                renderCacheStatusMessage={renderCacheStatusMessage}
                scrollToNow={scrollToNow}
                handleMoveTrackUp={handleMoveTrackUp}
                handleMoveTrackDown={handleMoveTrackDown}
                handleCancelTrack={handleCancelTrack}
                handleReactivateTrack={handleReactivateTrack}
                handleTogglePlayTrack={handleTogglePlayTrack}
                handleMoveBreakUp={handleMoveBreakUp}
                handleMoveBreakDown={handleMoveBreakDown}
                handlePlay={handlePlay}
                onOpenHelpPopup={setHelpPopupCard}
              />
            );
          }

          if (playMode === 'Live') {
            return (
              <PlayerLiveTimelineView
                timeline={timeline}
                shows={shows}
                effectiveShow={effectiveShow}
                logs={logs}
                now={now}
                nowClock={nowClock}
                windowBeforeMinutes={windowBeforeMinutes}
                windowAfterMinutes={windowAfterMinutes}
                showLookaroundHours={showLookaroundHours}
                playingStates={playingStates}
                isAudioPlaying={isAudioPlaying}
                resolvedAdminContact={resolvedAdminContact}
                activeItemRef={activeItemRef}
                nowSectionRef={nowSectionRef}
                getAnnouncementsForSlot={getAnnouncementsForSlot}
                renderCacheStatusMessage={renderCacheStatusMessage}
                scrollToNow={scrollToNow}
                onPlay={handlePlay}
                onOpenHelpPopup={setHelpPopupCard}
              />
            );
          }

          return (
            <PlayerPrerecordTimelineView
              playMode={playMode}
              timeline={timeline}
              shows={shows}
              effectiveShow={effectiveShow}
              logs={logs}
              now={now}
              playingStates={playingStates}
              isAudioPlaying={isAudioPlaying}
              resolvedAdminContact={resolvedAdminContact}
              activeItemRef={activeItemRef}
              nowSectionRef={nowSectionRef}
              getAnnouncementsForSlot={getAnnouncementsForSlot}
              renderCacheStatusMessage={renderCacheStatusMessage}
              scrollToNow={scrollToNow}
              onPlay={handlePlay}
              onOpenHelpPopup={setHelpPopupCard}
            />
          );
        })()}
      </div>

      {/* Option 2 Pinned Bottom Show Spacer in Live Mode */}
      {playMode === 'Live' && bottomPinnedSpacer && (
        <PinnedLiveShowBanner
          spacer={bottomPinnedSpacer}
          position="bottom"
          onScrollToSpacer={scrollToSpacer}
        />
      )}
      </div>

      {/* Combined Prerecord + Export In-Window 250px Pop-Up Overlay */}
      {playMode === 'Prerecord' && prerecordDate && (
        <PrerecordExportPopup
          isOpen={Boolean(isExportPopupOpen)}
          onClose={() => onCloseExportPopup && onCloseExportPopup()}
          show={exportActiveShow || effectiveShow}
          timeframeStart={prerecordDate}
          timeframeEnd={addMinutes(prerecordDate, prerecordLengthMinutes)}
          breakItems={prerecordExportBreakItems}
          playlistSequence={prerecordExportPlaylistSequence}
          hasUnloggedBreaks={hasUnlogged}
          isExporting={false}
          isLoggingExports={isLoggingExports}
          onExecuteExport={() => {
            if (onExecuteExport) {
              onExecuteExport(itemsToExport, previewText);
            }
          }}
          onMarkAllAsLogged={handleLogExportAsPlayed}
        />
      )}

      {helpPopupCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3"
          onClick={() => setHelpPopupCard(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-[260px] p-3.5 text-left space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <HelpCircle className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 truncate">
                  Get Help — Media Issue
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHelpPopupCard(null)}
                className="text-slate-400 hover:text-slate-800 p-0.5 rounded cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-bold text-slate-800 break-words">{helpPopupCard.name}</div>
              <div className="text-slate-500 font-semibold">{helpPopupCard.timeLabel}</div>
              <div className="text-rose-600 font-bold uppercase tracking-tight">{helpPopupCard.errorLabel}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Admin Contact
              </span>
              <p className="text-xs font-bold text-slate-800 whitespace-pre-wrap break-words leading-snug">
                {resolvedAdminContact}
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setHelpPopupCard(null)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {renderLiveReadOverlay()}
      {renderFolderChooserModal()}
    </div>
  );
}


