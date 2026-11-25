import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Save, FileText, Calendar, Clock, CheckCircle, AlertCircle, AlertTriangle, ShieldAlert, Copy, Check, XCircle, X, FolderOpen, Music, Search, Play, Square, ChevronUp, ChevronDown, RefreshCw, Eye, User, BookOpen, ArrowRight, ArrowDown, Edit3, ListChecks, CheckSquare, HelpCircle } from 'lucide-react';
import { Announcement, AnnouncementRevision, AnnouncementType, AnnouncementMetadata, MediaAssetFile, Show, ShowRevision, TimeGatedMediaItem, TimeGatedMp3, ScheduleIssue, LogEntry, UpNextPromoConfig, AdminMessage } from '../types';
import { cn, getMP3Status, formatDuration, getFilenameFromUrlOrPath, isTimeInShow, getSortedShows, getShowShade, readMp3ID3Metadata, parseID3Bytes, normalizeAnnouncement, normalizeAnnouncements, formatToDatetimeLocal, getCurrentDatetimeLocal, getDatePart, getTimePart, sortMp3sByStartDate, findFirstGapOrEnd, validateTimeGatedMp3s, getActiveMp3ForSlot, getGatedAssetType, isGateExpiredOrInactivated, isContiguousMidnightTransition, computeBackfilledEndTime, getNextGapAutoFillStart, formatTime12, formatDatetime12, formatHour12, formatHourShort12, isAudioFile, isScriptFile, classifyMediaAsset, AUDIO_EXTENSIONS, SCRIPT_EXTENSIONS, buildUpNextPromoAnnouncements, getGateMediaItems, formatRotatedAnnouncementName, formatRotatedFileName, DAYS_ORDER, isAnnouncementWithinDateBounds, isAnnouncementRuleMatch, isUpNextPromoUrl, formatUpNextPromoFilename } from '../lib/utils';
import { evaluateScheduleDiagnostics } from '../lib/scheduleDiagnostics';
import { getPlayableUrl, DRIVE_FOLDERS, getSavedSettings, getStorageApiHeaders, cacheMP3, getAccessToken } from '../lib/driveService';
import { availableFilesCache, driveFileNameCache, mp3DurationCache, upsertMediaCatalogFile, syncMediaCatalogFiles } from '../lib/audioCache';
import { reconcileScheduleAndLogs, calculateGatedTrackAudit, resolveAnnouncementsForDate, resolveShowsForDate, GatedTrackAuditMetrics, toCanonicalDateString, doesLogMatchLocalSlot, computePlayedGateBoundsMap } from '../lib/temporalReconciliation';
import { STATION_TIMEZONE_OPTIONS, getStationTimezone, setStationTimezone, getStationTimezoneOption, isLogPrerecordOrExport, toStationDateParts, getStationNow, getAdminContactInfo, setAdminContactInfo, CompatibilityReport } from '../lib/compatibility';
import LiveReadPopout from './LiveReadPopout';
import ScheduleAuditModal from './ScheduleAuditModal';
import { MilitaryTimeInput } from './MilitaryTimeInput';
import { MediaPickerModal } from './MediaPickerModal';
import { CopyEditorModal } from './CopyEditorModal';
import { normalizeReadTimeDisplay } from '../lib/liveReadFormatting';
import {
  DeleteAnnouncementModal,
  DeleteShowModal,
  CancelUnsavedModal,
  AnnouncementConflictModal,
  ShowOverlapModal,
  ShowDetailsModal,
  InactivateEndDateModal,
} from './CalendarModals';
import {
  SchedulePresetOption,
  AnnouncementPlacementModalState,
  computeSchedulePlacementOptions,
  cleanNameShort,
  addSoftHyphensForFirstLine,
  AnnouncementConflict,
  ShowConflict,
  getAnnouncementConflicts,
  getShowConflicts,
  formatGridRulesSummary,
  AnnouncementGap,
  ShowGap,
  getAnnouncementGaps,
  getShowGaps,
  formatMetadataDate,
  getAnnouncementSummary,
} from './calendar/calendarHelpers';
import { CalendarHeaderBar } from './calendar/CalendarHeaderBar';
import { ShowEditorForm, ShowsManagerList } from './calendar/ShowsManagerView';
import { WeeklyCalendarGrid } from './calendar/WeeklyCalendarGrid';
import { AnnouncementsListView } from './calendar/AnnouncementsListView';
import { AnnouncementEditorView } from './calendar/AnnouncementEditorView';
import { FileManagerView, FileManagerBucket } from './calendar/FileManagerView';
import { AdminMessagesManagerView } from './calendar/AdminMessagesManagerView';
import { ShowMessagesShortlistModal } from './calendar/ShowMessagesShortlistModal';
import AdminMessageEditorModal from './AdminMessageEditorModal';
import AdminMessageReaderModal from './AdminMessageReaderModal';
import { doesAdminMessageApplyToShowAnytime, isAdminMessageArchived, isAdminMessageExpired, isSystemBuiltInMessage, SYSTEM_MSG_REQUIRED_UPGRADE_ID } from '../lib/adminMessages';

export type { SchedulePresetOption, AnnouncementPlacementModalState, AnnouncementConflict, ShowConflict, AnnouncementGap, ShowGap };
export { computeSchedulePlacementOptions, addSoftHyphensForFirstLine, getAnnouncementConflicts, getShowConflicts, formatGridRulesSummary, getAnnouncementGaps, getShowGaps, formatMetadataDate, getAnnouncementSummary };

interface CalendarTabProps {
  announcements: Announcement[];
  onSave: (announcements: Announcement[]) => Promise<boolean | void> | void;
  isAdmin: boolean;
  onAdminToggle: (val: boolean) => void;
  now: Date;
  driveMP3s?: MediaAssetFile[];
  isDriveActive?: boolean;
  onRefresh?: () => Promise<any> | void;
  shows?: Show[];
  onSaveShows?: (shows: Show[], explicitStationTimezone?: string, explicitAdminContactInfo?: string) => Promise<boolean | void> | void;
  stationTimezone?: string;
  onSaveStationTimezone?: (newTimezone: string) => Promise<boolean | void> | void;
  adminContactInfo?: string;
  hasSavedAdminContact?: boolean;
  onSaveAdminContactInfo?: (newContact: string) => Promise<boolean | void> | void;
  upNextPromoConfig?: UpNextPromoConfig;
  logs?: LogEntry[];
  adminMessages?: AdminMessage[];
  onSaveAdminMessages?: (messages: AdminMessage[]) => Promise<boolean | void> | void;
  compatibilityReport?: CompatibilityReport | null;
  currentViewMode?: 'list' | 'calendar' | 'shows' | 'files' | 'messages';
  onViewModeChange?: (mode: 'list' | 'calendar' | 'shows' | 'files' | 'messages') => void;
  showPixelRuler?: boolean;
  showLocationsModal?: boolean;
  onOpenLocationsModal?: () => void;
  onOpenLocalStationFolder?: () => void;
  onOpenAnnouncementsFolder?: (bucket: FileManagerBucket, resolvedLocalPath?: string, resolvedDriveId?: string) => void;
  onOpenEvergreensFolder?: (resolvedLocalPath?: string, resolvedDriveId?: string) => void;
  onOpenShowsFolder?: (resolvedLocalPath?: string, resolvedDriveId?: string) => void;
}

function CalendarTab({ announcements, onSave, isAdmin, onAdminToggle, now: _liveNow, driveMP3s: propDriveMP3s = [], isDriveActive = false, onRefresh, shows = [], onSaveShows, stationTimezone, onSaveStationTimezone, adminContactInfo, hasSavedAdminContact = false, onSaveAdminContactInfo, upNextPromoConfig, logs = [], adminMessages = [], onSaveAdminMessages, compatibilityReport = null, currentViewMode, onViewModeChange, showPixelRuler = false, showLocationsModal = false, onOpenLocationsModal, onOpenLocalStationFolder, onOpenAnnouncementsFolder, onOpenEvergreensFolder, onOpenShowsFolder }: CalendarTabProps) {
  const [localSavedMediaFiles, setLocalSavedMediaFiles] = useState<MediaAssetFile[]>([]);
  const driveMP3s = useMemo<MediaAssetFile[]>(() => {
    const base = propDriveMP3s || [];
    if (localSavedMediaFiles.length === 0) return base;
    const localByLower = new Map<string, MediaAssetFile>(
      localSavedMediaFiles.map(f => [f.name.toLowerCase(), f])
    );
    const updatedBase = base.map((f) => {
      const key = String(f?.name || '').toLowerCase();
      if (localByLower.has(key)) {
        const override = localByLower.get(key)!;
        localByLower.delete(key);
        return { ...(typeof f === 'object' && f ? f : {}), ...override };
      }
      return f;
    });
    const extras = Array.from(localByLower.values());
    return [...extras, ...updatedBase];
  }, [propDriveMP3s, localSavedMediaFiles]);
  const existingFileNames = useMemo(
    () => (driveMP3s || []).map((f) => f.name).filter(Boolean),
    [driveMP3s]
  );
  const upNextAnnouncements = useMemo(
    () => buildUpNextPromoAnnouncements(shows, upNextPromoConfig),
    [shows, upNextPromoConfig]
  );
  const calendarAnnouncements = useMemo(
    () => [...announcements, ...upNextAnnouncements],
    [announcements, upNextAnnouncements]
  );
  const [firstRunContactDraft, setFirstRunContactDraft] = useState<string>(() => adminContactInfo || getAdminContactInfo());
  const [isSavingFirstRunContact, setIsSavingFirstRunContact] = useState<boolean>(false);
  const [dismissedFirstRunContact, setDismissedFirstRunContact] = useState<boolean>(false);

  useEffect(() => {
    syncMediaCatalogFiles(driveMP3s);
  }, [driveMP3s]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Announcement>>({});
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [isSavingShow, setIsSavingShow] = useState(false);

  const [initialFormDataJson, setInitialFormDataJson] = useState<string>('');
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [openedFromAudit, setOpenedFromAudit] = useState<boolean>(false);
  const [openedFromFileManagerFile, setOpenedFromFileManagerFile] = useState<string | null>(null);
  const [fileManagerReturnFocusFile, setFileManagerReturnFocusFile] = useState<string | null>(null);
  const [fileManagerRefreshTrigger, setFileManagerRefreshTrigger] = useState<number>(0);
  const [fileManagerSearchQuery, setFileManagerSearchQuery] = useState<string>('');

  const isFormModified = useMemo(() => {
    if (!editingId || !initialFormDataJson) return false;
    return JSON.stringify(formData) !== initialFormDataJson;
  }, [editingId, formData, initialFormDataJson]);

  const finishReturnToFileManager = () => {
    if (openedFromFileManagerFile) {
      const targetFile = openedFromFileManagerFile;
      setOpenedFromFileManagerFile(null);
      setViewMode('files');
      setFileManagerReturnFocusFile(targetFile);
      setFileManagerRefreshTrigger(prev => prev + 1);
      if (onRefresh) {
        Promise.resolve(onRefresh()).catch(() => {});
      }
      return true;
    }
    return false;
  };

  const handleCancelEdit = () => {
    if (isSavingAnnouncement) return;
    if (isFormModified) {
      setShowCancelConfirm(true);
    } else {
      setEditingId(null);
      if (finishReturnToFileManager()) {
        return;
      }
      if (openedFromAudit) {
        setOpenedFromAudit(false);
        setIsScheduleAuditOpen(true);
      }
    }
  };

  const isFormValid = (() => {
    if (!formData.name) return false;
    if (formData.type === AnnouncementType.ONE_TIME && (!formData.date || !formData.time)) return false;
    return true;
  })();
  const [saveValidationState, setSaveValidationState] = useState<{
    blockingErrors: string[];
    softWarnings: string[];
  } | null>(null);
  const [saveValidationOverrideEndDate, setSaveValidationOverrideEndDate] = useState<string | undefined>(undefined);
  const [focusBottomProblemGateNonce, setFocusBottomProblemGateNonce] = useState<number>(0);
  const isNew = editingId ? !announcements.some(s => s.id === editingId) : false;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [announcementFilterQuery, setAnnouncementFilterQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScriptFile, setPreviewScriptFile] = useState<string | null>(null);
  const [previewScriptBucket, setPreviewScriptBucket] = useState<'active' | 'archived' | 'deleted' | undefined>(undefined);
  const [previewScriptBackupUrl, setPreviewScriptBackupUrl] = useState<string | undefined>(undefined);
  const [previewScriptFromPicker, setPreviewScriptFromPicker] = useState<boolean>(false);
  const [previewScriptOrigin, setPreviewScriptOrigin] = useState<{
    announcementId?: string | null;
    gateId?: string | null;
    gateIndex?: number;
    itemIndex?: number;
    fromPicker?: boolean;
  } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<'main' | 'backup' | 'timeGated' | 'newTimeGated' | 'addGateFile'>('main');
  const [pickerMp3Id, setPickerMp3Id] = useState<string | null>(null);
  const [pickerItemIndex, setPickerItemIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [inactivateEndModal, setInactivateEndModal] = useState<{ date: string; time: string } | null>(null);
  const [selectedListMediaByAnnId, setSelectedListMediaByAnnId] = useState<Record<string, string>>({});
  const [copyEditorState, setCopyEditorState] = useState<{
    isOpen: boolean;
    initialFileName?: string;
    sourceFileToCopy?: string;
    sourceBucket?: 'active' | 'archived' | 'deleted';
    initialReadTime?: string;
    initialIsAutoReadTime?: boolean;
    initialBackupMp3Url?: string;
    targetGateId?: string | null;
    targetGateIndex?: number;
    targetItemIndex?: number;
    targetAnnouncementId?: string | null;
    fromPicker?: boolean;
  }>({ isOpen: false });
  const [pickerHighlightedFileName, setPickerHighlightedFileName] = useState<string | null>(null);
  const [pickerExternalConfirmSelection, setPickerExternalConfirmSelection] = useState<{
    file: { name: string; duration?: string | number; path?: string; size?: string };
    options?: {
      pairedBackupAudioFile?: string;
      doNotAttachBackup?: boolean;
      approximateReadTime?: string;
      isAutoReadTime?: boolean;
    };
  } | null>(null);
  const [directReplacePlayedConfirm, setDirectReplacePlayedConfirm] = useState<{
    priorFileName: string;
    newFileName: string;
    playCount: number;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleAddMp3 = () => {
    setPickerTarget('newTimeGated');
    setPickerMp3Id(null);
    setPickerItemIndex(null);
    setSearchQuery('');
    setPickerHighlightedFileName(null);
    setIsPickerOpen(true);
  };

  const handleReuseGate = (gate: TimeGatedMp3): string | undefined => {
    const rawItems = getGateMediaItems(gate);
    // Copy only active (non-inactivated) media rows on Reuse (#43/#113); fall back to all items only if all were inactivated
    const activeOnly = rawItems.filter(mi => !mi.inactivated);
    const sourceItems = activeOnly.length > 0 ? activeOnly : rawItems;
    const items = sourceItems.map(mi => {
      const nextMi = { ...mi };
      delete nextMi.inactivated;
      delete nextMi.inactivatedAt;
      return nextMi;
    });
    const first = items[0];
    const firstFileName = first?.mp3Url ? getFilenameFromUrlOrPath(first.mp3Url) : 'Reused Gate Media';
    const inferredType = first?.mp3Url ? classifyMediaAsset(first.mp3Url, first.assetType) : undefined;
    return applyAddMp3WithDateChecks(
      {
        name: firstFileName,
        duration: first?.duration,
        approximateReadTime: first?.approximateReadTime,
        isAutoReadTime: first?.isAutoReadTime,
        backupMp3Url: first?.backupMp3Url,
      },
      inferredType,
      items
    );
  };

   const applyAddMp3WithDateChecks = (
    selectedFile?: {
      name: string;
      duration?: string | number;
      path?: string;
      approximateReadTime?: string;
      isAutoReadTime?: boolean;
      backupMp3Url?: string;
    },
    inferredAssetType?: 'audio' | 'script',
    overrideMediaItems?: TimeGatedMediaItem[]
  ): string => {
    setPickerTarget('main');
    const current = formData.timeGatedMp3s || [];
    const mp3Name = selectedFile ? selectedFile.name : '';
    const rawDur = selectedFile?.duration;
    const mp3Duration = rawDur === undefined || rawDur === null 
      ? undefined 
      : typeof rawDur === 'number' 
        ? formatDuration(rawDur) 
        : String(rawDur);

    const resolvedItems: TimeGatedMediaItem[] =
      overrideMediaItems && overrideMediaItems.length > 0
        ? overrideMediaItems
        : [
            {
              mp3Url: mp3Name,
              assetType: inferredAssetType,
              duration: mp3Duration,
              ...(selectedFile?.approximateReadTime ? { approximateReadTime: selectedFile.approximateReadTime } : {}),
              ...(selectedFile?.isAutoReadTime !== undefined ? { isAutoReadTime: selectedFile.isAutoReadTime } : {}),
              ...(selectedFile?.backupMp3Url ? { backupMp3Url: selectedFile.backupMp3Url } : {})
            }
          ];

    const nowIso = getCurrentDatetimeLocal();
    const activeGates = sortMp3sByStartDate(
      current.filter(
        m => !m.inactivated && (!m.endDate || !m.endDate.trim() || formatToDatetimeLocal(m.endDate) >= nowIso)
      )
    );

    if (activeGates.length === 0) {
      const formStartIso = formData.startDate ? formatToDatetimeLocal(formData.startDate) : '';
      const defaultStart =
        current.length > 0 || !formStartIso || formStartIso < nowIso ? nowIso : formStartIso;
      const formEndIso = formData.endDate ? formatToDatetimeLocal(formData.endDate) : '';
      const defaultEnd = formEndIso && formEndIso > defaultStart ? formEndIso : undefined;

      const gateId = `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newEntry: TimeGatedMp3 = {
        id: gateId,
        startDate: defaultStart,
        endDate: defaultEnd,
        mediaItems: resolvedItems
      };
      const sorted = sortMp3sByStartDate([...current, newEntry]);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      return gateId;
    }

    const lastActive = activeGates[activeGates.length - 1];
    let nextStart = '';
    let nextEnd: string | undefined = undefined;
    if (lastActive.endDate && lastActive.endDate.trim()) {
      nextStart = getNextGapAutoFillStart(lastActive.endDate).startIso;
      const parentEndLocal = formData.endDate ? formatToDatetimeLocal(formData.endDate) : '';
      if (parentEndLocal && parentEndLocal > nextStart) {
        nextEnd = parentEndLocal;
      }
    }

    const gateId = `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newEntry: TimeGatedMp3 = {
      id: gateId,
      startDate: nextStart,
      endDate: nextEnd,
      mediaItems: resolvedItems
    };
    const nextList = nextStart
      ? sortMp3sByStartDate([...current, newEntry])
      : [...current, newEntry];
    setFormData({
      ...formData,
      timeGatedMp3s: nextList
    });
    return gateId;
  };

  // Audit states for save confirmations
  const [pendingSaveAnnouncement, setPendingSaveAnnouncement] = useState<{
    updatedList: Announcement[];
    conflicts: AnnouncementConflict[];
  } | null>(null);

  const [pendingSaveShow, setPendingSaveShow] = useState<{
    updatedList: Show[];
    conflicts: ShowConflict[];
  } | null>(null);

  const headerContainerRef = useRef<HTMLDivElement>(null);
  const [headerContainerWidth, setHeaderContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(300, window.innerWidth - 32);
    }
    return 1200;
  });

  const controlsContainerRef = useRef<HTMLDivElement>(null);
  const [controlsContainerWidth, setControlsContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(300, window.innerWidth - 32);
    }
    return 1200;
  });

  const [calendarLayoutMode, setCalendarLayoutMode] = useState<'full' | 'compact'>(() => (localStorage.getItem('announcement_calendar_layout_mode') as 'full' | 'compact') || 'full');
  const [calendarTimeframe, setCalendarTimeframe] = useState<'weekly' | 'daily'>(() => (localStorage.getItem('announcement_calendar_timeframe') as 'weekly' | 'daily') || 'weekly');

  const activeViewMode = currentViewMode || 'calendar';

  const measureContainers = React.useCallback(() => {
    let hWidth = 0;
    if (headerContainerRef.current) {
      hWidth = headerContainerRef.current.getBoundingClientRect().width;
      if (hWidth > 0) {
        setHeaderContainerWidth(hWidth);
      }
    }
    if (controlsContainerRef.current) {
      const cWidth = controlsContainerRef.current.getBoundingClientRect().width;
      if (cWidth > 0) {
        setControlsContainerWidth(cWidth);
      }
    } else if (hWidth > 0) {
      setControlsContainerWidth(hWidth);
    }
  }, []);

  React.useLayoutEffect(() => {
    measureContainers();
  });

  useEffect(() => {
    const handleResize = () => measureContainers();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureContainers]);

  useEffect(() => {
    if (!headerContainerRef.current) return;
    const observer = new ResizeObserver(() => measureContainers());
    observer.observe(headerContainerRef.current);
    return () => observer.disconnect();
  }, [activeViewMode, measureContainers]);

  useEffect(() => {
    if (!controlsContainerRef.current) return;
    const observer = new ResizeObserver(() => measureContainers());
    observer.observe(controlsContainerRef.current);
    return () => observer.disconnect();
  }, [activeViewMode, calendarTimeframe, calendarLayoutMode, measureContainers]);

  const isCalendarView = activeViewMode === 'calendar';
  const addTextShort = headerContainerWidth < (isCalendarView ? 1220 : 1060) && headerContainerWidth >= (isCalendarView ? 940 : 800);
  const compactNavBar = headerContainerWidth < (isCalendarView ? 1120 : 960);
  const hideCalendarIcon = headerContainerWidth < (isCalendarView ? 1040 : 880);
  const hideAnnouncementsIcons = headerContainerWidth < (isCalendarView ? 1040 : 880);
  const hideShowsIcon = headerContainerWidth < (isCalendarView ? 1040 : 880);
  const halfFilter = headerContainerWidth < (isCalendarView ? 1040 : 880);
  const abbreviateAnnouncements = headerContainerWidth < (isCalendarView ? 940 : 800);
  const addTextIconOnly = headerContainerWidth < (isCalendarView ? 940 : 800);
  const isHeaderStacked = headerContainerWidth < (isCalendarView ? 700 : 600);
  const modeIconsOnly = headerContainerWidth < 460;
  const isUltraNarrowHeader = headerContainerWidth < 360;
  const showsFolderCheckShort = headerContainerWidth < 420 && headerContainerWidth >= 320;
  const showsFolderCheckMinimal = headerContainerWidth < 320;

  const listCardCollapsePreviewText = headerContainerWidth < 520;
  const listCardCollapseCopyText = headerContainerWidth < 460;
  const listCardCollapseDetailsText = headerContainerWidth < 440;
  const listCardCollapseViewEditText = headerContainerWidth < 420;
  const listCardHideSummaryTag = headerContainerWidth < 480;
  const listCardHideTypeTag = headerContainerWidth < 420;

  // Msgs cards include a 64px left type-icon gutter plus both Archive/Restore and Delete controls
  const msgCardCollapsePreviewText = headerContainerWidth < 660;
  const msgCardCollapseCopyText = headerContainerWidth < 610;
  const msgCardCollapseDetailsText = headerContainerWidth < 560;
  const msgCardCollapseViewEditText = headerContainerWidth < 430;

  const activeTriggerWidth = isCalendarView ? controlsContainerWidth : headerContainerWidth;

  const dropFilterModeLabels = controlsContainerWidth < 1140;
  const dropShowIssuesText = controlsContainerWidth < 1080;
  const controlsNavShort = controlsContainerWidth < 990;
  const dropAuditWord = controlsContainerWidth < 920;

  const isFilterModeSplit = controlsContainerWidth < 860;
  const isIssuesAuditStacked = controlsContainerWidth < 860;

  const isWeekDayStacked = controlsContainerWidth < 720;
  const isNavStacked = controlsContainerWidth < 720;

  const isCell3Below = controlsContainerWidth < 560;
  const controlsNavIconOnly = controlsContainerWidth < 480;
  const isFullStacked = controlsContainerWidth < 390;

  const showsCardsCollapse = headerContainerWidth < 450;

  // Shows related states
  const [showFilterQuery, setShowFilterQuery] = useState('');
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [showFormData, setShowFormData] = useState<Partial<Show>>({});
  const [isNameShortManuallyEdited, setIsNameShortManuallyEdited] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState<string[]>([]);
  const [deleteShowConfirmId, setDeleteShowConfirmId] = useState<string | null>(null);
  const [isVerifyingEvergreens, setIsVerifyingEvergreens] = useState(false);
  const [folderCheckModal, setFolderCheckModal] = useState<{
    isOpen: boolean;
    isRunning: boolean;
    hasError: boolean;
    lines: string[];
    extraFolders: Array<{ category: 'media_evergreens' | 'media_shows'; name: string }>;
    evergreensPath?: string;
    playlistsPath?: string;
    evergreensFolderId?: string;
    playlistsFolderId?: string;
    subfolderStats?: Record<string, { fileCount: number; localPath?: string; driveFolderId?: string }>;
  } | null>(null);
  const [isReadoutCollapsed, setIsReadoutCollapsed] = useState<boolean>(false);
  const [selectedStrandedKey, setSelectedStrandedKey] = useState<string>('');
  const [mergeTargetCategory, setMergeTargetCategory] = useState<'media_shows' | 'media_evergreens'>('media_shows');
  const [selectedMergeTargetShortName, setSelectedMergeTargetShortName] = useState<string>('');
  const [isMergingStranded, setIsMergingStranded] = useState<boolean>(false);
  const [confirmMergeStrandedOpen, setConfirmMergeStrandedOpen] = useState<boolean>(false);
  const mergeTargetListRef = useRef<HTMLDivElement | null>(null);
  const lastLocationsSaveAtOnOpenRef = useRef<number>(0);

  const sortedActiveShowsWithShortName = useMemo(() => {
    return [...shows]
      .filter(s => !s?.isDeleted && String(s?.nameShort || '').trim().length > 0)
      .sort((a, b) =>
        String(a.nameShort || '').localeCompare(String(b.nameShort || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      );
  }, [shows]);

  const findClosestShowShortName = (rawStrandedName: string): string => {
    if (sortedActiveShowsWithShortName.length === 0) return '';
    const cleanSource = rawStrandedName.replace(/^media_(evergreens|shows)\//i, '').toLowerCase();
    const commonPrefixLen = (a: string, b: string) => {
      const minLen = Math.min(a.length, b.length);
      let i = 0;
      while (i < minLen && a[i] === b[i]) {
        i++;
      }
      return i;
    };
    let bestShortName = sortedActiveShowsWithShortName[0].nameShort || '';
    let bestScore = 0;
    for (const s of sortedActiveShowsWithShortName) {
      const shortLower = String(s.nameShort || '').toLowerCase();
      const nameCleanLower = cleanNameShort(s.name || '').toLowerCase();
      const score = Math.max(
        commonPrefixLen(cleanSource, shortLower),
        commonPrefixLen(cleanSource, nameCleanLower)
      );
      if (score > bestScore) {
        bestScore = score;
        bestShortName = s.nameShort || '';
      }
    }
    return bestShortName;
  };

  useEffect(() => {
    if (!selectedMergeTargetShortName || !mergeTargetListRef.current) return;
    const container = mergeTargetListRef.current;
    const targetBtn = container.querySelector<HTMLElement>(
      `[data-target-short="${CSS.escape(selectedMergeTargetShortName)}"]`
    );
    if (targetBtn) {
      targetBtn.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedMergeTargetShortName, selectedStrandedKey, folderCheckModal?.extraFolders.length]);

  useEffect(() => {
    if (showLocationsModal) {
      lastLocationsSaveAtOnOpenRef.current = Number((window as any).__ampLastLocationsSaveAt || 0);
    } else if (folderCheckModal?.isOpen && !folderCheckModal.isRunning) {
      const latestSaveAt = Number((window as any).__ampLastLocationsSaveAt || 0);
      if (latestSaveAt > lastLocationsSaveAtOnOpenRef.current) {
        lastLocationsSaveAtOnOpenRef.current = latestSaveAt;
        handleVerifyEvergreens();
      }
    }
  }, [showLocationsModal]);

  // Global unsaved changes listener for top-level navigation and auto-refresh guards
  useEffect(() => {
    window.ampHasUnsavedChanges = () => {
      if (editingId !== null) return true;
      if (editingShowId !== null) return true;
      if (copyEditorState.isOpen) return true;
      if (isPickerOpen) return true;
      if (previewScriptFile !== null) return true;
      if (deleteConfirmId !== null) return true;
      if (deleteShowConfirmId !== null) return true;
      if (inactivateEndModal !== null) return true;
      return false;
    };
    window.ampDiscardEdits = () => {
      setEditingId(null);
      setEditingShowId(null);
      setShowValidationErrors([]);
      setDeleteShowConfirmId(null);
      setCopyEditorState({ isOpen: false });
      setIsPickerOpen(false);
      setPreviewScriptFile(null);
      setDeleteConfirmId(null);
      setInactivateEndModal(null);
      setShowCancelConfirm(false);
      setOpenedFromAudit(false);
      setOpenedFromFileManagerFile(null);
    };
    return () => {
      window.ampHasUnsavedChanges = undefined;
      window.ampDiscardEdits = undefined;
    };
  }, [
    editingId,
    editingShowId,
    copyEditorState.isOpen,
    isPickerOpen,
    previewScriptFile,
    deleteConfirmId,
    deleteShowConfirmId,
    inactivateEndModal
  ]);

  const handleVerifyEvergreens = async () => {
    const settings = getSavedSettings();
    const modeLabel =
      settings.mode === 'Drive'
        ? 'Google Drive'
        : settings.mode === 'Demo'
          ? 'Demo Mode'
          : 'Local Folder';
    const showsWithShortName = shows.filter(s => !s?.isDeleted && String(s?.nameShort || '').trim().length > 0);
    const showsWithShortNameCount = showsWithShortName.length;

    setIsVerifyingEvergreens(true);
    setIsReadoutCollapsed(false);
    setConfirmMergeStrandedOpen(false);
    setSelectedStrandedKey('');
    setSelectedMergeTargetShortName(sortedActiveShowsWithShortName[0]?.nameShort || showsWithShortName[0]?.nameShort || '');
    setFolderCheckModal({
      isOpen: true,
      isRunning: true,
      hasError: false,
      lines: [
        `[Starting] Folder verification (${modeLabel})...`
      ],
      extraFolders: []
    });

    const appendLines = (
      newLines: string[],
      updates?: {
        isRunning?: boolean;
        hasError?: boolean;
        extraFolders?: Array<{ category: 'media_evergreens' | 'media_shows'; name: string }>;
        evergreensPath?: string;
        playlistsPath?: string;
        evergreensFolderId?: string;
        playlistsFolderId?: string;
        subfolderStats?: Record<string, { fileCount: number; localPath?: string; driveFolderId?: string }>;
      }
    ) => {
      setFolderCheckModal(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(updates?.isRunning !== undefined ? { isRunning: updates.isRunning } : {}),
          ...(updates?.hasError !== undefined ? { hasError: updates.hasError } : {}),
          ...(updates?.extraFolders !== undefined ? { extraFolders: updates.extraFolders } : {}),
          ...(updates?.evergreensPath !== undefined ? { evergreensPath: updates.evergreensPath } : {}),
          ...(updates?.playlistsPath !== undefined ? { playlistsPath: updates.playlistsPath } : {}),
          ...(updates?.evergreensFolderId !== undefined ? { evergreensFolderId: updates.evergreensFolderId } : {}),
          ...(updates?.playlistsFolderId !== undefined ? { playlistsFolderId: updates.playlistsFolderId } : {}),
          ...(updates?.subfolderStats !== undefined ? { subfolderStats: updates.subfolderStats } : {}),
          lines: [...prev.lines, ...newLines]
        };
      });
    };

    try {
      if (settings.mode === 'Demo') {
        appendLines(
          [
            '[Error] Evergreen folder verification/creation cannot execute in Demo mode. Please configure either Local or Google Drive mode in Settings.',
            '[Complete] Folder verification stopped.'
          ],
          { isRunning: false, hasError: true }
        );
        return;
      }

      appendLines([
        '[Starting] Validating base media folders (media_announcements, media_evergreens, media_shows)...',
        `[Starting] Validating show subfolders for ${showsWithShortNameCount} show${showsWithShortNameCount === 1 ? '' : 's'}...`
      ]);

      const headers = await getStorageApiHeaders();
      const response = await fetch('/api/shows/verify-evergreens', {
        method: 'POST',
        headers,
        body: JSON.stringify({ shows })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify evergreen/playlist/announcement folders');
      }

      const resultLines: string[] = [
        '[Validated] Base media folders verified:',
        `  • Evergreens: ${data.evergreensPath || 'Verified'}`,
        `  • Playlists: ${data.playlistsPath || 'Verified'}`,
        `  • Announcements: ${data.announcementsPath || 'Verified'} (+ archived, deleted_in_AMP_OK_to_purge)`
      ];

      if (data.evergreensFolderCreated) {
        resultLines.push(`[Fixed] Created missing base Evergreens folder: ${data.evergreensPath || 'media_evergreens'}`);
      }
      if (data.playlistsFolderCreated) {
        resultLines.push(`[Fixed] Created missing base Playlists folder: ${data.playlistsPath || 'media_shows'}`);
      }
      if (data.announcementsFolderCreated) {
        resultLines.push(`[Fixed] Created missing base Announcements folder: ${data.announcementsPath || 'media_announcements'}`);
      }

      const createdAnnouncementSubfolders: string[] = Array.isArray(data.createdAnnouncementSubfolders)
        ? data.createdAnnouncementSubfolders
        : [];
      for (const subFolder of createdAnnouncementSubfolders) {
        resultLines.push(`[Fixed] Created missing Announcements subfolder: media_announcements/${subFolder}`);
      }

      if (data.announcementsReadonlyError) {
        resultLines.push(`[Warning] ${data.announcementsReadonlyMessage}`);
      }

      const checkedCount =
        typeof data.checkedShowCount === 'number' ? data.checkedShowCount : showsWithShortNameCount;
      resultLines.push(
        `[Validated] Checked ${checkedCount} show profile${checkedCount === 1 ? '' : 's'} across media_evergreens and media_shows.`
      );

      const createdEvergreens: string[] = Array.isArray(data.createdEvergreenFolders)
        ? data.createdEvergreenFolders
        : [];
      const createdPlaylists: string[] = Array.isArray(data.createdPlaylistFolders)
        ? data.createdPlaylistFolders
        : [];
      const fallbackCreated: string[] = Array.isArray(data.createdFolders) ? data.createdFolders : [];
      const extraEvergreens: string[] = Array.isArray(data.extraEvergreenFolders)
        ? data.extraEvergreenFolders
        : [];
      const extraPlaylists: string[] = Array.isArray(data.extraPlaylistFolders)
        ? data.extraPlaylistFolders
        : [];

      const anyBaseFolderCreated = Boolean(
        data.evergreensFolderCreated ||
          data.playlistsFolderCreated ||
          data.announcementsFolderCreated ||
          createdAnnouncementSubfolders.length > 0
      );

      if (createdEvergreens.length > 0 || createdPlaylists.length > 0) {
        for (const folder of createdEvergreens) {
          resultLines.push(`[Fixed] Created missing Evergreen folder: ${folder}`);
        }
        for (const folder of createdPlaylists) {
          resultLines.push(`[Fixed] Created missing Show Playlist folder: ${folder}`);
        }
      } else if (fallbackCreated.length > 0) {
        for (const folder of fallbackCreated) {
          resultLines.push(`[Fixed] Created missing show folder: ${folder}`);
        }
      } else if (!data.announcementsReadonlyError && !anyBaseFolderCreated) {
        resultLines.push(
          '[OK] All show Evergreen, Playlist, and Announcement (archived / deleted_in_AMP_OK_to_purge) folders were already present. No fixes needed.'
        );
      }

      const discoveredExtras: Array<{ category: 'media_evergreens' | 'media_shows'; name: string }> = [
        ...extraEvergreens.map(name => ({ category: 'media_evergreens' as const, name })),
        ...extraPlaylists.map(name => ({ category: 'media_shows' as const, name })),
      ];

      if (discoveredExtras.length > 0) {
        resultLines.push('[Notice] Notice Extra folder(s) found');
        for (const extra of discoveredExtras) {
          resultLines.push(`  ${extra.category}/${extra.name}`);
        }
        const firstExtra = discoveredExtras[0];
        setSelectedStrandedKey(`${firstExtra.category}/${firstExtra.name}`);
        setMergeTargetCategory(firstExtra.category);
        const bestMatch = findClosestShowShortName(firstExtra.name);
        if (bestMatch) {
          setSelectedMergeTargetShortName(bestMatch);
        }
      }

      resultLines.push('[Complete] Folder verification finished.');
      appendLines(resultLines, {
        isRunning: false,
        hasError: Boolean(data.announcementsReadonlyError),
        extraFolders: discoveredExtras,
        evergreensPath: typeof data.evergreensPath === 'string' ? data.evergreensPath : undefined,
        playlistsPath: typeof data.playlistsPath === 'string' ? data.playlistsPath : undefined,
        evergreensFolderId: typeof data.evergreensFolderId === 'string' ? data.evergreensFolderId : undefined,
        playlistsFolderId: typeof data.playlistsFolderId === 'string' ? data.playlistsFolderId : undefined,
        subfolderStats:
          data.subfolderStats && typeof data.subfolderStats === 'object'
            ? data.subfolderStats
            : {},
      });
    } catch (err: any) {
      appendLines(
        [
          `[Error] ${err?.message || 'Unknown error verifying folders.'}`,
          '[Complete] Folder verification stopped with errors.'
        ],
        { isRunning: false, hasError: true }
      );
    } finally {
      setIsVerifyingEvergreens(false);
    }
  };

  const handleSelectStrandedItem = (ef: { category: 'media_evergreens' | 'media_shows'; name: string }) => {
    const key = `${ef.category}/${ef.name}`;
    setSelectedStrandedKey(key);
    setMergeTargetCategory(ef.category);
    const bestMatch = findClosestShowShortName(ef.name);
    if (bestMatch) {
      setSelectedMergeTargetShortName(bestMatch);
    }
    setConfirmMergeStrandedOpen(false);
  };

  const handleMergeStrandedFolder = async () => {
    if (!folderCheckModal || isMergingStranded || !selectedStrandedKey || !selectedMergeTargetShortName) return;
    const slashIdx = selectedStrandedKey.indexOf('/');
    if (slashIdx <= 0) return;
    const folderCategory = selectedStrandedKey.slice(0, slashIdx) as 'media_evergreens' | 'media_shows';
    const sourceFolderName = selectedStrandedKey.slice(slashIdx + 1);
    const targetFolderCategory = mergeTargetCategory || folderCategory;
    const targetShowShortName = selectedMergeTargetShortName.trim();
    if (!sourceFolderName || !targetShowShortName) return;

    setIsMergingStranded(true);
    try {
      const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/shows/merge-stranded-folder', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          folderCategory,
          targetFolderCategory,
          sourceFolderName,
          targetShowShortName
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to merge stranded folder.');
      }

      const movedCount = typeof data.movedCount === 'number' ? data.movedCount : 0;
      const skippedCount = typeof data.skippedCount === 'number' ? data.skippedCount : 0;
      const removedSourceFolder = Boolean(data.removedSourceFolder);

      const summaryLine = `[Fixed] Merged ${folderCategory}/${sourceFolderName} -> ${targetFolderCategory}/${targetShowShortName} (${movedCount} file${movedCount === 1 ? '' : 's'} moved${skippedCount > 0 ? `, ${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped` : ''}${removedSourceFolder ? ', stranded folder removed' : ''}).`;

      setFolderCheckModal(prev => {
        if (!prev) return prev;
        const remainingExtras = removedSourceFolder
          ? prev.extraFolders.filter(
              e => !(e.category === folderCategory && e.name === sourceFolderName)
            )
          : prev.extraFolders;
        const nextFirst = remainingExtras[0];
        if (nextFirst) {
          setSelectedStrandedKey(`${nextFirst.category}/${nextFirst.name}`);
          setMergeTargetCategory(nextFirst.category);
          const bestMatch = findClosestShowShortName(nextFirst.name);
          if (bestMatch) {
            setSelectedMergeTargetShortName(bestMatch);
          }
        } else {
          setSelectedStrandedKey('');
        }
        const nextStats = { ...(prev.subfolderStats || {}) };
        const sourceKey = `${folderCategory}/${sourceFolderName}`;
        const destKey = `${targetFolderCategory}/${targetShowShortName}`;
        if (removedSourceFolder) {
          delete nextStats[sourceKey];
        } else if (nextStats[sourceKey]) {
          nextStats[sourceKey] = {
            ...nextStats[sourceKey],
            fileCount: Math.max(0, (nextStats[sourceKey].fileCount || 0) - movedCount),
          };
        }
        const prevDest = nextStats[destKey];
        nextStats[destKey] = {
          ...(prevDest || {}),
          fileCount: (prevDest?.fileCount || 0) + movedCount,
        };
        return {
          ...prev,
          extraFolders: remainingExtras,
          subfolderStats: nextStats,
          lines: [...prev.lines, summaryLine]
        };
      });
      setConfirmMergeStrandedOpen(false);
    } catch (err: any) {
      setFolderCheckModal(prev =>
        prev
          ? {
              ...prev,
              hasError: true,
              lines: [...prev.lines, `[Error] Merge failed: ${err?.message || 'Unknown error'}`]
            }
          : prev
      );
      setConfirmMergeStrandedOpen(false);
    } finally {
      setIsMergingStranded(false);
    }
  };

  const createNewShow = () => {
    setEditingShowId('new');
    setIsNameShortManuallyEdited(false);
    setShowValidationErrors([]);
    const maxIdNum = shows.reduce((max, s) => {
      const num = parseInt(s.id, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = (maxIdNum + 1).toString();

    setShowFormData({
      id: newId,
      day: 'Monday',
      startHour: 9,
      startMinute: 0,
      durationHours: 1,
      durationMinutes: 0,
      name: '',
      nameShort: '',
      host: '',
      description: '',
      active: true,
      includeInUpNext: true
    });
  };

  const startEditShow = (show: Show) => {
    setEditingShowId(show.id);
    setIsNameShortManuallyEdited(
      Boolean(show.nameShort && show.nameShort !== cleanNameShort(show.name || ''))
    );
    setShowValidationErrors([]);
    setShowFormData({ ...show });
  };

  const handleDeleteShow = (id: string) => {
    if (isSavingShow) return;
    setDeleteShowConfirmId(id);
  };

  const confirmDeleteShow = async (id: string) => {
    if (isSavingShow) return;
    const filtered = shows.filter(s => s.id !== id);
    if (onSaveShows) {
      setIsSavingShow(true);
      try {
        const result = await onSaveShows(filtered);
        if (result !== false) {
          setDeleteShowConfirmId(null);
          setShowValidationErrors([]);
          setEditingShowId(null);
        }
      } catch (err) {
        console.error("Delete show failed:", err);
      } finally {
        setIsSavingShow(false);
      }
    } else {
      setDeleteShowConfirmId(null);
      setShowValidationErrors([]);
      setEditingShowId(null);
    }
  };

  const handleSaveShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingShow) return;

    const validationErrors: string[] = [];
    const trimmedName = String(showFormData.name || '').trim();
    const trimmedHost = String(showFormData.host || '').trim();
    const rawShort = String(showFormData.nameShort || '').trim();
    const finalNameShort = cleanNameShort(rawShort);
    const totalDurationMinutes =
      (Number(showFormData.durationHours) || 0) * 60 + (Number(showFormData.durationMinutes) || 0);

    if (!trimmedName) {
      validationErrors.push('Show Name is required.');
    }
    if (!finalNameShort) {
      validationErrors.push('Short Name (for filenames) is required.');
    } else {
      const otherShows = shows.filter(s => s.id !== editingShowId && !s.isDeleted);
      const isUnique = !otherShows.some(s => s.nameShort.toLowerCase() === finalNameShort.toLowerCase());
      if (!isUnique) {
        validationErrors.push(
          `The Short Name "${finalNameShort}" is already in use by another show. Please provide a unique Short Name.`
        );
      }
    }
    if (!trimmedHost) {
      validationErrors.push('Show Host is required.');
    }
    if (totalDurationMinutes <= 0) {
      validationErrors.push('Duration of Show must be greater than 0 minutes.');
    }

    if (validationErrors.length > 0) {
      setShowValidationErrors(validationErrors);
      return;
    }

    setShowValidationErrors([]);

    const isNewShow = editingShowId === 'new';
    let renameFolder = false;
    let oldNameShort = '';

    if (!isNewShow) {
      const originalShow = shows.find(s => s.id === editingShowId);
      if (originalShow) {
        oldNameShort = originalShow.nameShort;
      }
    }

    try {
      const settings = getSavedSettings();
      if (settings.mode === 'Demo') {
        console.warn('Evergreen folder synchronization did not execute because the app is in Demo mode.');
      } else {
        const headers = await getStorageApiHeaders();
        const applyRes = await fetch('/api/shows/evergreen/apply-change', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: isNewShow ? 'create' : 'update',
            nameShort: finalNameShort,
            oldNameShort: isNewShow ? undefined : oldNameShort,
            renameFolder: true
          })
        });

        if (!applyRes.ok) {
          const applyErr = await applyRes.json().catch(() => ({}));
          console.warn('Evergreen folder sync status:', applyErr.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to sync Evergreen folder:', err);
    }

    const existingShow = shows.find(s => s.id === editingShowId);
    const nowIso = new Date().toISOString();
    const existingRevisions: ShowRevision[] = Array.isArray(existingShow?.revisions)
      ? [...existingShow!.revisions!]
      : [];
    let nextValidFrom = existingShow?.validFrom || (isNewShow ? nowIso : '1970-01-01T00:00:00.000Z');

    const nextActive = showFormData.active !== undefined ? showFormData.active : true;
    const nextIncludeInUpNext = showFormData.includeInUpNext !== false;

    if (existingShow) {
      const hasShowChanged =
        existingShow.day !== (showFormData.day || 'Monday') ||
        existingShow.startHour !== (typeof showFormData.startHour === 'number' ? showFormData.startHour : 9) ||
        existingShow.startMinute !== (typeof showFormData.startMinute === 'number' ? showFormData.startMinute : 0) ||
        existingShow.durationHours !== (typeof showFormData.durationHours === 'number' ? showFormData.durationHours : 0) ||
        existingShow.durationMinutes !== (typeof showFormData.durationMinutes === 'number' ? showFormData.durationMinutes : 0) ||
        existingShow.name !== (showFormData.name || '') ||
        existingShow.nameShort !== finalNameShort ||
        existingShow.host !== (showFormData.host || '') ||
        existingShow.description !== (showFormData.description || '') ||
        existingShow.active !== nextActive ||
        (existingShow.includeInUpNext !== false) !== nextIncludeInUpNext;

      if (hasShowChanged) {
        existingRevisions.push({
          day: existingShow.day,
          startHour: existingShow.startHour,
          startMinute: existingShow.startMinute,
          durationHours: existingShow.durationHours,
          durationMinutes: existingShow.durationMinutes,
          name: existingShow.name,
          nameShort: existingShow.nameShort,
          host: existingShow.host,
          description: existingShow.description,
          active: existingShow.active,
          includeInUpNext: existingShow.includeInUpNext !== false,
          validFrom: existingShow.validFrom || '1970-01-01T00:00:00.000Z',
          validTo: nowIso,
        });
        nextValidFrom = nowIso;
      }
    }

    const updatedShow: Show = {
      id: showFormData.id || (shows.reduce((max, s) => {
        const num = parseInt(s.id, 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0) + 1).toString(),
      day: showFormData.day || 'Monday',
      startHour: typeof showFormData.startHour === 'number' ? showFormData.startHour : 9,
      startMinute: typeof showFormData.startMinute === 'number' ? showFormData.startMinute : 0,
      durationHours: typeof showFormData.durationHours === 'number' ? showFormData.durationHours : 0,
      durationMinutes: typeof showFormData.durationMinutes === 'number' ? showFormData.durationMinutes : 0,
      name: showFormData.name || '',
      nameShort: finalNameShort || 'show',
      host: showFormData.host || '',
      description: showFormData.description || '',
      active: nextActive,
      includeInUpNext: nextIncludeInUpNext,
      validFrom: nextValidFrom,
      validTo: existingShow?.validTo !== undefined ? existingShow.validTo : null,
      isDeleted: Boolean(existingShow?.isDeleted),
      revisions: existingRevisions,
    };

    let newShows: Show[];
    const exists = shows.some(s => s.id === editingShowId);
    if (exists) {
      newShows = shows.map(s => s.id === editingShowId ? updatedShow : s);
    } else {
      newShows = [...shows, updatedShow];
    }

    const showConflictsList = getShowConflicts(newShows).filter(
      c => c.show1.id === updatedShow.id || c.show2.id === updatedShow.id
    );
    if (showConflictsList.length > 0) {
      setPendingSaveShow({
        updatedList: newShows,
        conflicts: showConflictsList
      });
      return;
    }

    if (onSaveShows) {
      setIsSavingShow(true);
      try {
        let finalNewShows = newShows;
        if (!exists) {
          const latestShowsFromStorage = await fetchLatestStorageShows();
          const existsInStorage = latestShowsFromStorage.some(s => s.id === updatedShow.id);
          if (existsInStorage) {
            // Assign a unique ID if collision detected
            const showIds = latestShowsFromStorage.map(s => parseInt(s.id.replace(/\D/g, ''))).filter(n => !isNaN(n));
            const maxId = showIds.length > 0 ? Math.max(...showIds) : 100;
            const freshShowId = `show-${maxId + 1}`;
            const rekeyedShow = { ...updatedShow, id: freshShowId };
            finalNewShows = [...latestShowsFromStorage.filter(s => s.id !== updatedShow.id), rekeyedShow];
          }
        }
        const result = await onSaveShows(finalNewShows);
        if (result !== false) {
          setEditingShowId(null);
        }
      } catch (err) {
        console.error("Save show failed:", err);
      } finally {
        setIsSavingShow(false);
      }
    } else {
      setEditingShowId(null);
    }
  };

  useEffect(() => {
    // Do not trigger backend data refreshes while any editing window is open
    if (isPickerOpen && onRefresh && !editingId && !editingShowId && !copyEditorState.isOpen) {
      onRefresh();
    }
  }, [isPickerOpen, onRefresh, editingId, editingShowId, copyEditorState.isOpen]);

  // MP3 Metadata Cache and loader
  const [metadataCache, setMetadataCache] = useState<Record<string, { title?: string; artist?: string; album?: string }>>({});
  const [pickerDurations, setPickerDurations] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleDurationCached = (e: Event) => {
      const custom = e as CustomEvent<{
        name?: string;
        fileName?: string;
        url?: string;
        resolvedUrl?: string;
        duration?: string;
      }>;
      const rawName =
        custom.detail?.name ||
        custom.detail?.fileName ||
        custom.detail?.url ||
        custom.detail?.resolvedUrl ||
        '';
      const name = rawName ? getFilenameFromUrlOrPath(rawName) : '';
      const duration = custom.detail?.duration || '';
      if (name && duration) {
        setPickerDurations(prev => (prev[name] === duration ? prev : { ...prev, [name]: duration }));
      }
    };
    window.addEventListener('mp3-duration-cached', handleDurationCached as EventListener);
    return () => {
      window.removeEventListener('mp3-duration-cached', handleDurationCached as EventListener);
    };
  }, []);

  useEffect(() => {
    const soundLibrary = driveMP3s || [];
    const tgFiles = (formData.timeGatedMp3s || [])
      .flatMap(m => getGateMediaItems(m).flatMap(mi => [mi.mp3Url, mi.backupMp3Url]))
      .map(u => (u ? getFilenameFromUrlOrPath(u) : ''))
      .filter(Boolean);

    // 1. Seed known durations synchronously from catalog and mp3DurationCache without network fetches
    const seededUpdates: Record<string, string> = {};
    for (const f of soundLibrary) {
      if (f?.name && f.duration && !pickerDurations[f.name]) {
        seededUpdates[f.name] = String(f.duration);
      }
    }
    for (const fname of [...tgFiles, ...soundLibrary.map(f => f.name)]) {
      if (!fname || pickerDurations[fname] || seededUpdates[fname]) continue;
      const fromDurCache = mp3DurationCache.get(fname) || availableFilesCache.get(fname)?.duration;
      if (fromDurCache) {
        seededUpdates[fname] = fromDurCache;
      }
    }
    if (Object.keys(seededUpdates).length > 0) {
      setPickerDurations(prev => ({ ...prev, ...seededUpdates }));
    }

    // 2. Only probe audio duration via browser Audio element for attached gate files (or picker files when picker is open)
    const candidateFiles = isPickerOpen
      ? Array.from(new Set([...tgFiles, ...soundLibrary.slice(0, 25).map(f => f.name)]))
      : Array.from(new Set(tgFiles));

    candidateFiles.forEach(filename => {
      if (
        filename &&
        isAudioFile(filename) &&
        !pickerDurations[filename] &&
        !seededUpdates[filename]
      ) {
        try {
          const playableUrl = getPlayableUrl(filename);
          if (playableUrl) {
            const audio = new Audio();
            audio.preload = 'metadata';
            const handleLoaded = () => {
              const d = audio.duration;
              if (!isNaN(d) && d > 0) {
                const formatted = formatDuration(d);
                mp3DurationCache.set(filename, formatted);
                setPickerDurations(prev => ({
                  ...prev,
                  [filename]: formatted
                }));
              }
            };
            audio.addEventListener('loadedmetadata', handleLoaded, { once: true });
            audio.addEventListener('error', () => {}, { once: true });
            audio.src = playableUrl;
          }
        } catch (e) {
          console.error("Failed to load metadata for " + filename, e);
        }
      }
    });
  }, [isPickerOpen, driveMP3s, formData.timeGatedMp3s, pickerDurations]);

  useEffect(() => {
    if (driveMP3s && driveMP3s.length > 0) {
      driveMP3s.forEach(f => {
        if (f && f.name) {
          const existing = availableFilesCache.get(f.name);
          availableFilesCache.set(f.name, {
            path: f.path || existing?.path || f.name,
            size: f.size || existing?.size || '0.1 MB',
            duration: f.duration || existing?.duration || mp3DurationCache.get(f.name) || '',
            mtimeMs: f.mtimeMs ?? existing?.mtimeMs,
            modifiedTime: f.modifiedTime ?? existing?.modifiedTime
          });
          if (f.path) {
            driveFileNameCache.set(f.path, f.name);
          }
        }
      });
    }
  }, [driveMP3s]);

  useEffect(() => {
    if (!isPickerOpen && !editingId) return;

    const tgAudioFiles = (formData.timeGatedMp3s || [])
      .flatMap(m => getGateMediaItems(m).flatMap(mi => [mi.mp3Url, mi.backupMp3Url]))
      .map(u => (u ? getFilenameFromUrlOrPath(u) : ''))
      .filter(fname => Boolean(fname && isAudioFile(fname)));

    const pickerAudioFiles = isPickerOpen
      ? (driveMP3s || []).filter(f => f?.name && isAudioFile(f.name)).slice(0, 20).map(f => f.name)
      : [];

    const filesToInspect = Array.from(new Set([...tgAudioFiles, ...pickerAudioFiles]));
    filesToInspect.forEach(fileName => {
      let alreadyFetched = false;
      setMetadataCache(current => {
        if (current[fileName] !== undefined) {
          alreadyFetched = true;
        }
        return current;
      });

      if (alreadyFetched) return;

      setMetadataCache(prev => ({ ...prev, [fileName]: {} }));

      const playableUrl = getPlayableUrl(fileName);
      readMp3ID3Metadata(playableUrl).then(meta => {
        if (meta) {
          setMetadataCache(prev => ({ ...prev, [fileName]: meta }));
          if (meta.durationSeconds && meta.durationSeconds > 0) {
            const formatted = formatDuration(meta.durationSeconds);
            if (formatted) {
              mp3DurationCache.set(fileName, formatted);
              setPickerDurations(prev =>
                prev[fileName] === formatted ? prev : { ...prev, [fileName]: formatted }
              );
            }
          }
        }
      });
    });
  }, [isPickerOpen, editingId, formData.timeGatedMp3s, driveMP3s, isDriveActive]);

  // States and helper for interactive clock-style dialing
  const [isDraggingClock, setIsDraggingClock] = useState(false);
  const handleClockInteraction = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    // If it is a touch event, prevent default scrolling to make dialing super smooth
    if (e.cancelable) {
      e.preventDefault();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = clientX - centerX;
    const y = clientY - centerY;
    
    let angleDegrees = Math.atan2(y, x) * (180 / Math.PI);
    let adjustedAngle = angleDegrees + 90;
    if (adjustedAngle < 0) {
      adjustedAngle += 360;
    }
    
    let minute = Math.round(adjustedAngle / 6);
    if (minute >= 60) minute = 0;
    
    setFormData(prev => ({ ...prev, minute }));
  };

  // Calendar View states
  const [viewMode, setViewModeState] = useState<'list' | 'calendar' | 'shows' | 'files' | 'messages'>(currentViewMode || 'calendar');

  const setViewMode = (mode: 'list' | 'calendar' | 'shows' | 'files' | 'messages') => {
    setViewModeState(mode);
    if (onViewModeChange) onViewModeChange(mode);
  };

  useEffect(() => {
    if (currentViewMode && currentViewMode !== viewMode) {
      setViewModeState(currentViewMode);
    }
  }, [currentViewMode]);

  // Admin-to-Show Messages state (#78)
  const [messageFilterQuery, setMessageFilterQuery] = useState<string>('');
  const [isMessageEditorOpen, setIsMessageEditorOpen] = useState<boolean>(false);
  const [editingAdminMessage, setEditingAdminMessage] = useState<AdminMessage | null>(null);
  const [reuseSourceAdminMessage, setReuseSourceAdminMessage] = useState<AdminMessage | null>(null);
  const [messageInitialShowId, setMessageInitialShowId] = useState<string | undefined>(undefined);
  const [previewingAdminMessage, setPreviewingAdminMessage] = useState<AdminMessage | null>(null);
  const [previewingAdminMessageShow, setPreviewingAdminMessageShow] = useState<Show | null>(null);
  const [viewingMessagesForShow, setViewingMessagesForShow] = useState<Show | null>(null);
  const [isSavingAdminMessage, setIsSavingAdminMessage] = useState<boolean>(false);

  const activeMessagesCount = useMemo(() => {
    const refDate = getStationNow();
    return (adminMessages || []).filter(
      (m) => !isSystemBuiltInMessage(m) && !isAdminMessageArchived(m, refDate)
    ).length;
  }, [adminMessages]);

  const activeMessagesCountByShowId = useMemo(() => {
    const counts: Record<string, number> = {};
    const refDate = getStationNow();
    for (const sh of shows) {
      let c = 0;
      for (const msg of adminMessages || []) {
        if (
          !isAdminMessageArchived(msg, refDate) &&
          doesAdminMessageApplyToShowAnytime(msg, sh)
        ) {
          c += 1;
        }
      }
      if (c > 0) counts[sh.id] = c;
    }
    return counts;
  }, [adminMessages, shows]);

  const createNewMessage = (initialShowId?: string) => {
    setEditingAdminMessage(null);
    setReuseSourceAdminMessage(null);
    setMessageInitialShowId(initialShowId);
    setIsMessageEditorOpen(true);
  };

  const handleReuseAdminMessage = (msg: AdminMessage) => {
    setEditingAdminMessage(null);
    setReuseSourceAdminMessage(msg);
    setMessageInitialShowId(undefined);
    setIsMessageEditorOpen(true);
  };

  const handleSaveAdminMessage = async (savedMsg: AdminMessage) => {
    if (!onSaveAdminMessages) return false;
    setIsSavingAdminMessage(true);
    try {
      const exists = (adminMessages || []).some((m) => m.id === savedMsg.id);
      const updatedList = exists
        ? (adminMessages || []).map((m) => (m.id === savedMsg.id ? savedMsg : m))
        : [savedMsg, ...(adminMessages || [])];
      const ok = await onSaveAdminMessages(updatedList);
      if (ok !== false) {
        setIsMessageEditorOpen(false);
        setEditingAdminMessage(null);
        setReuseSourceAdminMessage(null);
        setMessageInitialShowId(undefined);
      }
      return ok;
    } finally {
      setIsSavingAdminMessage(false);
    }
  };

  const handleArchiveAdminMessage = async (msg: AdminMessage) => {
    if (!onSaveAdminMessages) return;
    const nowIso = new Date().toISOString();
    const updatedList = (adminMessages || []).map((m) =>
      m.id === msg.id
        ? { ...m, enabled: false, archived: true, archivedAt: nowIso, updatedAt: nowIso }
        : m
    );
    await onSaveAdminMessages(updatedList);
  };

  const handleRestoreAdminMessage = async (msg: AdminMessage) => {
    if (!onSaveAdminMessages) return;
    if (isAdminMessageExpired(msg, getStationNow())) {
      setReuseSourceAdminMessage(null);
      setMessageInitialShowId(undefined);
      setEditingAdminMessage({ ...msg, enabled: true, archived: false, archivedAt: undefined });
      setIsMessageEditorOpen(true);
      return;
    }
    const nowIso = new Date().toISOString();
    const updatedList = (adminMessages || []).map((m) =>
      m.id === msg.id
        ? { ...m, enabled: true, archived: false, archivedAt: undefined, updatedAt: nowIso }
        : m
    );
    await onSaveAdminMessages(updatedList);
  };

  const handleToggleBuiltInSystemMessage = async (systemMsgId: string, nextEnabled: boolean) => {
    if (!onSaveAdminMessages) return;
    const nowIso = new Date().toISOString();
    const isRequiredUpgrade = systemMsgId === SYSTEM_MSG_REQUIRED_UPGRADE_ID;
    const existing = (adminMessages || []).find((m) => m.id === systemMsgId);
    const updatedEntry: AdminMessage = existing
      ? {
          ...existing,
          enabled: nextEnabled,
          isSystemBuiltIn: true,
          updatedAt: nowIso,
        }
      : {
          id: systemMsgId,
          title: isRequiredUpgrade ? 'Required AMP Upgrade Notice' : 'AMP Update Available',
          body: '',
          severity: isRequiredUpgrade ? 'alert' : 'info',
          enabled: nextEnabled,
          isSystemBuiltIn: true,
          targetScope: 'app_startup',
          clearMode: isRequiredUpgrade ? 'date_range' : 'once_acknowledged',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
    const updatedList = existing
      ? (adminMessages || []).map((m) => (m.id === systemMsgId ? updatedEntry : m))
      : [updatedEntry, ...(adminMessages || [])];
    await onSaveAdminMessages(updatedList);
  };

  const handleDeleteAdminMessage = async (msg: AdminMessage) => {
    if (!onSaveAdminMessages) return;
    const updatedList = (adminMessages || []).filter((m) => m.id !== msg.id);
    await onSaveAdminMessages(updatedList);
  };

  const handleResetAdminMessageAcks = async (msg: AdminMessage) => {
    if (!onSaveAdminMessages) return;
    const updatedList = (adminMessages || []).map((m) =>
      m.id === msg.id
        ? { ...m, acknowledgedByShows: [], updatedAt: new Date().toISOString() }
        : m
    );
    await onSaveAdminMessages(updatedList);
  };
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [inactiveSortMode, setInactiveSortMode] = useState<'scheduleTime' | 'newestFirst' | 'oldestFirst'>('scheduleTime');
  const [showIssues, setShowIssues] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('announcement_calendar_show_issues');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isScheduleAuditOpen, setIsScheduleAuditOpen] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(() => getStationNow());
  const [selectedCalendarAnnouncement, setSelectedCalendarAnnouncement] = useState<Announcement | null>(null);
  const [selectedCalendarShow, setSelectedCalendarShow] = useState<Show | null>(null);
  const [selectedHours, setSelectedHours] = useState<number[]>(() => Array.from({ length: 24 }, (_, i) => i));
  const [isHoursDropdownOpen, setIsHoursDropdownOpen] = useState(false);

  // Option 1A: Static reference "now" for Calendar & Audit assessments.
  // Refreshes strictly upon opening the view or when a date scope, filter, or data store changes.
  const now = React.useMemo(
    () => getStationNow(),
    [
      viewMode,
      calendarDate,
      calendarTimeframe,
      announcementFilterQuery,
      showFilterQuery,
      showInactive,
      selectedHours,
      announcements,
      shows,
      logs,
      stationTimezone
    ]
  );

  // Computed schedule audit conflicts & gaps
  const announcementConflicts = React.useMemo(() => getAnnouncementConflicts(announcements), [announcements]);
  const announcementGaps = React.useMemo(() => getAnnouncementGaps(announcements, now), [announcements, now]);
  const leadingGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'leading_gap'), [announcementGaps]);
  const scheduleGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'coverage_gap'), [announcementGaps]);
  const trailingGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'trailing_gap'), [announcementGaps]);
  const overlapGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'overlap'), [announcementGaps]);
  const missingMediaGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'missing_media'), [announcementGaps]);
  const missingFileGaps = React.useMemo(() => announcementGaps.filter(g => g.type === 'missing_file'), [announcementGaps]);

  const showConflicts = React.useMemo(() => getShowConflicts(shows), [shows]);
  const showGaps = React.useMemo(() => getShowGaps(shows), [shows]);

  // Trigger Fresh Views on Focus when internal dialogs or overlays close (never while an edit window is open)
  const prevAnyCalendarModalOpenRef = useRef(false);
  useEffect(() => {
    const isAnyCalendarModalOpen =
      isPickerOpen ||
      copyEditorState.isOpen ||
      isScheduleAuditOpen ||
      deleteConfirmId !== null ||
      inactivateEndModal !== null ||
      showCancelConfirm ||
      previewScriptFile !== null ||
      selectedCalendarShow !== null ||
      pendingSaveAnnouncement !== null ||
      pendingSaveShow !== null;

    if (prevAnyCalendarModalOpenRef.current && !isAnyCalendarModalOpen) {
      if (onRefresh && !editingId && !editingShowId && !copyEditorState.isOpen) {
        onRefresh();
      }
    }
    prevAnyCalendarModalOpenRef.current = isAnyCalendarModalOpen;
  }, [
    isPickerOpen,
    copyEditorState.isOpen,
    isScheduleAuditOpen,
    deleteConfirmId,
    inactivateEndModal,
    showCancelConfirm,
    previewScriptFile,
    selectedCalendarShow,
    pendingSaveAnnouncement,
    pendingSaveShow,
    editingId,
    editingShowId,
    onRefresh
  ]);

  // Visible on-screen calendar diagnostics
  // Computes status across all visible on-screen calendar days and all 24 hours of each day
  const visibleCalendarDays = React.useMemo(() => {
    if (calendarTimeframe === 'daily') {
      return [calendarDate];
    }
    const currentDay = calendarDate.getDay();
    const weekStart = new Date(calendarDate);
    weekStart.setDate(calendarDate.getDate() - currentDay);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [calendarDate, calendarTimeframe]);

  const scheduleDiagnostics = React.useMemo(() => {
    if (visibleCalendarDays.length === 0) {
      return evaluateScheduleDiagnostics({
        announcements: calendarAnnouncements,
        shows,
        now,
        mediaFiles: driveMP3s,
        startDate: calendarDate,
        endDate: calendarDate,
        includePastHours: true
      });
    }
    const firstDay = visibleCalendarDays[0];
    const lastDay = visibleCalendarDays[visibleCalendarDays.length - 1];
    return evaluateScheduleDiagnostics({
      announcements: calendarAnnouncements,
      shows,
      now,
      mediaFiles: driveMP3s,
      startDate: firstDay,
      endDate: lastDay,
      includePastHours: true
    });
  }, [calendarAnnouncements, shows, now, visibleCalendarDays, calendarDate, driveMP3s, stationTimezone]);

  const logsByDayHour = React.useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    if (!logs || logs.length === 0) return map;
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      if (log.status && log.status !== 'played' && log.status !== 'backup play') continue;
      const scheduledRef = log.announcementTime || log.scheduledFor || log.timestamp;
      if (scheduledRef) {
        const parts = toStationDateParts(scheduledRef);
        if (parts) {
          const key = `${parts.dateStr}_${parts.hour}`;
          let arr = map.get(key);
          if (!arr) {
            arr = [];
            map.set(key, arr);
          }
          arr.push(log);
        }
      }
    }
    return map;
  }, [logs, stationTimezone]);

  const dayAuditByDayKey = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof reconcileScheduleAndLogs>>();
    for (const day of visibleCalendarDays) {
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      map.set(key, reconcileScheduleAndLogs(day, calendarAnnouncements, shows, logs, now));
    }
    return map;
  }, [visibleCalendarDays, calendarAnnouncements, shows, logs, stationTimezone, now]);

  const handleLocateScheduleIssue = (issue: ScheduleIssue) => {
    setIsScheduleAuditOpen(false);
    setViewMode('calendar');

    // 1. Parse issue timestamp and update calendarDate
    const targetDate = new Date(issue.timestamp);
    if (!isNaN(targetDate.getTime())) {
      setCalendarDate(targetDate);
    }

    // 2. Ensure target hour is visible
    if (!selectedHours.includes(issue.hour)) {
      setSelectedHours(prev => [...prev, issue.hour].sort((a, b) => a - b));
    }

    // 3. Directly navigate to Edit Announcement instead of showing details modal
    const targetAnnouncement = announcements.find(s => s.id === issue.announcementId);
    if (targetAnnouncement) {
      // Commented out per user instructions:
      // setSelectedCalendarAnnouncement(targetAnnouncement);
      startEdit(targetAnnouncement, true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const togglePreview = async (
    url: string | undefined,
    e?: React.MouseEvent,
    bucket?: 'active' | 'archived' | 'deleted'
  ) => {
    if (e) e.stopPropagation();
    if (!url) return;

    if (previewUrl === url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      setPreviewUrl(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }

      setPreviewUrl(url);
      const cleanName = getFilenameFromUrlOrPath(url) || url;
      const bucketQuery = bucket && bucket !== 'active' ? `&bucket=${encodeURIComponent(bucket)}` : '';
      let playable =
        (bucketQuery ? '' : getPlayableUrl(url)) ||
        `/api/media/stream?path=${encodeURIComponent(cleanName)}${bucketQuery}`;

      if (playable.includes('googleapis.com') && !playable.startsWith('blob:')) {
        try {
          const cachedBlobUrl = await cacheMP3(url, getAccessToken() || '');
          if (cachedBlobUrl) {
            playable = cachedBlobUrl;
          }
        } catch (_) {}
      }

      const audio = new Audio(playable);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewUrl(null);
      };
      audio.play().catch(() => {
        const fallbackUrl = `/api/media/stream?path=${encodeURIComponent(cleanName)}${bucketQuery}`;
        if (playable !== fallbackUrl) {
          const fallbackAudio = new Audio(fallbackUrl);
          audioRef.current = fallbackAudio;
          fallbackAudio.onended = () => setPreviewUrl(null);
          fallbackAudio.onerror = () => setPreviewUrl(null);
          fallbackAudio.play().catch(err => {
            console.error("Preview failed", err);
            setPreviewUrl(null);
          });
        } else {
          setPreviewUrl(null);
        }
      });
    }
  };

  const soundLibrary = driveMP3s;
  const filteredFiles = soundLibrary.filter(f => {
    const nameLower = f.name.toLowerCase();
    
    // Filter by unified allowed types
    if (!isAudioFile(nameLower) && !isScriptFile(nameLower)) return false;
    
    return nameLower.includes(searchQuery.toLowerCase());
  });

  const findMatchingAudioByBasename = (scriptFileName: string): string | undefined => {
    const base = getFilenameFromUrlOrPath(scriptFileName || '').trim();
    const dotIdx = base.lastIndexOf('.');
    const stem = (dotIdx > 0 ? base.slice(0, dotIdx) : base).toLowerCase();
    if (!stem) return undefined;
    const match = (driveMP3s || []).find((f) => {
      if (!f || !f.name || !isAudioFile(f.name)) return false;
      const fBase = String(f.name).trim();
      const fDot = fBase.lastIndexOf('.');
      const fStem = (fDot > 0 ? fBase.slice(0, fDot) : fBase).toLowerCase();
      return fStem === stem;
    });
    return match ? match.name : undefined;
  };

  const handleSelectFileFromPicker = (
    file: { name: string; duration?: string | number; path?: string; size?: string },
    options?: {
      pairedBackupAudioFile?: string;
      doNotAttachBackup?: boolean;
      approximateReadTime?: string;
      isAutoReadTime?: boolean;
    }
  ) => {
    const inferredAssetType = classifyMediaAsset(file.name);
    const fileDuration = pickerDurations[file.name] || file.duration;
    const suggestedBackupAudio =
      inferredAssetType === 'script' && !options?.doNotAttachBackup
        ? options?.pairedBackupAudioFile || findMatchingAudioByBasename(file.name)
        : undefined;
    const resolvedApproxReadTime =
      inferredAssetType === 'script' && options?.approximateReadTime
        ? options.approximateReadTime.startsWith('~')
          ? options.approximateReadTime
          : `~${options.approximateReadTime}`
        : undefined;
    const resolvedIsAutoReadTime =
      inferredAssetType === 'script' && options?.isAutoReadTime !== undefined
        ? options.isAutoReadTime
        : undefined;

    upsertMediaCatalogFile({
      name: file.name,
      path: file.path || file.name,
      size: file.size || '0.1 MB',
      duration: fileDuration ? String(fileDuration) : '',
    });

    if (pickerTarget === 'newTimeGated') {
      setIsPickerOpen(false);
      applyAddMp3WithDateChecks(
        {
          name: file.name,
          duration: fileDuration,
          path: file.path,
          approximateReadTime: resolvedApproxReadTime,
          isAutoReadTime: resolvedIsAutoReadTime,
          backupMp3Url: suggestedBackupAudio
        },
        inferredAssetType
      );
    } else if (pickerTarget === 'addGateFile' && pickerMp3Id) {
      const currentMp3s = formData.timeGatedMp3s || [];
      const updatedMp3s = currentMp3s.map(m => {
        if (m.id === pickerMp3Id) {
          const existingItems = getGateMediaItems(m).filter(
            mi => Boolean(mi.mp3Url && mi.mp3Url.trim()) || Boolean(mi.inactivated)
          );
          const newItem: TimeGatedMediaItem = {
            mp3Url: file.name,
            assetType: inferredAssetType,
            duration: inferredAssetType === 'audio' ? (pickerDurations[file.name] || file.duration) : undefined,
            ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
            ...(resolvedIsAutoReadTime !== undefined ? { isAutoReadTime: resolvedIsAutoReadTime } : {}),
            ...(suggestedBackupAudio ? { backupMp3Url: suggestedBackupAudio } : {})
          };
           return {
            ...m,
            id: m.id,
            startDate: m.startDate,
            endDate: m.endDate,
            mediaItems: [...existingItems, newItem]
          };
        }
        return m;
      });
      const sorted = sortMp3sByStartDate(updatedMp3s);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    } else if (pickerTarget === 'timeGated' && pickerMp3Id) {
      const currentMp3s = formData.timeGatedMp3s || [];
      const targetIdx = pickerItemIndex ?? 0;
      const updatedMp3s = currentMp3s.map(m => {
        if (m.id !== pickerMp3Id) return m;
        const items = getGateMediaItems(m);
        const nextItems: TimeGatedMediaItem[] = [];
        items.forEach((mi, idx) => {
          if (idx === targetIdx) {
            const oldFileLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
            const newFileLower = getFilenameFromUrlOrPath(file.name).toLowerCase();
            const existingPlays =
              oldFileLower && oldFileLower !== newFileLower
                ? calculateGatedTrackAudit(editingId || formData.id || '', mi.mp3Url || '', logs, {
                    gate: m,
                    announcement: formData,
                    itemIndex: idx,
                    referenceNow: now,
                  }).totalPlays
                : 0;
            const replacementItem: TimeGatedMediaItem = {
              ...mi,
              mp3Url: file.name,
              assetType: inferredAssetType,
              duration:
                inferredAssetType === 'audio'
                  ? pickerDurations[file.name] || file.duration || mi.duration
                  : undefined,
              ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
              ...(resolvedIsAutoReadTime !== undefined ? { isAutoReadTime: resolvedIsAutoReadTime } : {}),
              ...(suggestedBackupAudio && !mi.backupMp3Url ? { backupMp3Url: suggestedBackupAudio } : {}),
              inactivated: undefined,
              inactivatedAt: undefined,
            };
            if (existingPlays > 0) {
              nextItems.push({
                ...mi,
                inactivated: true,
                inactivatedAt: getCurrentDatetimeLocal(),
              });
            }
            nextItems.push(replacementItem);
          } else {
            nextItems.push(mi);
          }
        });
        return {
          ...m,
          id: m.id,
          startDate: m.startDate,
          endDate: m.endDate,
          mediaItems: nextItems
        };
      });

      const sorted = sortMp3sByStartDate(updatedMp3s);

      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    } else if (pickerTarget === 'backup') {
      const currentMp3s = formData.timeGatedMp3s || [];
      const targetIdx = pickerItemIndex ?? 0;
      let updatedMp3s: TimeGatedMp3[];
      if (pickerMp3Id) {
        updatedMp3s = currentMp3s.map(m => {
          if (m.id !== pickerMp3Id) return m;
          const items = getGateMediaItems(m);
          return {
            ...m,
            id: m.id,
            startDate: m.startDate,
            endDate: m.endDate,
            mediaItems: items.map((mi, idx) =>
              idx === targetIdx
                ? { ...mi, backupMp3Url: file.name }
                : mi
            )
          };
        });
      } else if (currentMp3s.length > 0) {
        updatedMp3s = currentMp3s.map((m, idx) => {
          if (idx !== 0) return m;
          const items = getGateMediaItems(m);
          return {
            ...m,
            id: m.id,
            startDate: m.startDate,
            endDate: m.endDate,
            mediaItems: items.map((mi, mIdx) => (mIdx === 0 ? { ...mi, backupMp3Url: file.name } : mi))
          };
        });
      } else {
        const gateId = `mp3-${Date.now()}-1`;
        updatedMp3s = [{
          id: gateId,
          startDate: formData.startDate ? formatToDatetimeLocal(formData.startDate) : getCurrentDatetimeLocal(),
          mediaItems: [{
            mp3Url: '',
            backupMp3Url: file.name
          }]
        }];
      }
      const sorted = sortMp3sByStartDate(updatedMp3s);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    } else {
      const currentMp3s = formData.timeGatedMp3s || [];
      let updatedMp3s: TimeGatedMp3[];
      if (currentMp3s.length > 0) {
        updatedMp3s = currentMp3s.map((m, idx) => {
          if (idx !== 0) return m;
          const items = getGateMediaItems(m);
          return {
            ...m,
            id: m.id,
            startDate: m.startDate,
            endDate: m.endDate,
            mediaItems: items.map((mi, mIdx) =>
              mIdx === 0
                ? {
                    ...mi,
                    mp3Url: file.name,
                    assetType: inferredAssetType,
                    duration: inferredAssetType === 'audio' ? (pickerDurations[file.name] || file.duration || mi.duration) : undefined,
                    ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
                    ...(suggestedBackupAudio && !mi.backupMp3Url ? { backupMp3Url: suggestedBackupAudio } : {})
                  }
                : mi
            )
          };
        });
      } else {
        const gateId = `mp3-${Date.now()}-1`;
        updatedMp3s = [{
          id: gateId,
          startDate: formData.startDate ? formatToDatetimeLocal(formData.startDate) : getCurrentDatetimeLocal(),
          mediaItems: [{
            mp3Url: file.name,
            assetType: inferredAssetType,
            duration: inferredAssetType === 'audio' ? (pickerDurations[file.name] || file.duration) : undefined,
            ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
            ...(suggestedBackupAudio ? { backupMp3Url: suggestedBackupAudio } : {})
          }]
        }];
      }

      const sorted = sortMp3sByStartDate(updatedMp3s);

      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    }
  };

  const handleSelectMultipleFilesFromPicker = (
    files: { name: string; duration?: string | number; path?: string; size?: string }[]
  ) => {
    if (!files || files.length === 0) return;

    const builtItems: TimeGatedMediaItem[] = files.map(file => {
      const inferredAssetType = classifyMediaAsset(file.name);
      const rawDur = pickerDurations[file.name] || file.duration;
      const formattedDur =
        rawDur === undefined || rawDur === null
          ? undefined
          : typeof rawDur === 'number'
            ? formatDuration(rawDur)
            : String(rawDur);
      const suggestedBackupAudio =
        inferredAssetType === 'script' ? findMatchingAudioByBasename(file.name) : undefined;

      upsertMediaCatalogFile({
        name: file.name,
        path: file.path || file.name,
        size: file.size || '0.1 MB',
        duration: formattedDur ? String(formattedDur) : '',
      });

      return {
        mp3Url: file.name,
        assetType: inferredAssetType,
        duration: inferredAssetType === 'audio' ? formattedDur : undefined,
        ...(suggestedBackupAudio ? { backupMp3Url: suggestedBackupAudio } : {}),
      };
    });

    if (pickerTarget === 'newTimeGated') {
      setIsPickerOpen(false);
      const firstFile = files[0];
      applyAddMp3WithDateChecks(
        {
          name: firstFile.name,
          duration: pickerDurations[firstFile.name] || firstFile.duration,
          path: firstFile.path,
        },
        classifyMediaAsset(firstFile.name),
        builtItems
      );
    } else if (pickerTarget === 'addGateFile' && pickerMp3Id) {
      const currentMp3s = formData.timeGatedMp3s || [];
      const updatedMp3s = currentMp3s.map(m => {
        if (m.id !== pickerMp3Id) return m;
        const existingItems = getGateMediaItems(m).filter(
          mi => Boolean(mi.mp3Url && mi.mp3Url.trim()) || Boolean(mi.inactivated)
        );
        return {
          ...m,
          mediaItems: [...existingItems, ...builtItems],
        };
      });
      const sorted = sortMp3sByStartDate(updatedMp3s);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted,
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    } else if (pickerTarget === 'timeGated' && pickerMp3Id) {
      const currentMp3s = formData.timeGatedMp3s || [];
      const targetIdx = pickerItemIndex ?? 0;
      const updatedMp3s = currentMp3s.map(m => {
        if (m.id !== pickerMp3Id) return m;
        const items = getGateMediaItems(m);
        const nextItems: TimeGatedMediaItem[] = [];
        let replaced = false;
        items.forEach((mi, idx) => {
          if (idx === targetIdx) {
            const oldFileLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
            const replacingWithSameFile = builtItems.some(
              b => getFilenameFromUrlOrPath(b.mp3Url || '').toLowerCase() === oldFileLower
            );
            const existingPlays =
              oldFileLower && !replacingWithSameFile
                ? calculateGatedTrackAudit(editingId || formData.id || '', mi.mp3Url || '', logs, {
                    gate: m,
                    announcement: formData,
                    itemIndex: idx,
                    referenceNow: now,
                  }).totalPlays
                : 0;
            if (existingPlays > 0) {
              nextItems.push({
                ...mi,
                inactivated: true,
                inactivatedAt: getCurrentDatetimeLocal(),
              });
            }
            nextItems.push(...builtItems);
            replaced = true;
          } else if (Boolean(mi.mp3Url && mi.mp3Url.trim()) || Boolean(mi.inactivated)) {
            nextItems.push(mi);
          }
        });
        if (!replaced) {
          nextItems.unshift(...builtItems);
        }
        return {
          ...m,
          mediaItems: nextItems,
        };
      });
      const sorted = sortMp3sByStartDate(updatedMp3s);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted,
      });
      setIsPickerOpen(false);
      setPickerTarget('main');
      setPickerItemIndex(null);
    } else {
      handleSelectFileFromPicker(files[0]);
    }
  };

  const handleProceedWithoutFileFromPicker = () => {
    setIsPickerOpen(false);
    applyAddMp3WithDateChecks(undefined, undefined, [{ mp3Url: '' }]);
  };

  const [initialEditorFocusTarget, setInitialEditorFocusTarget] = useState<{
    slotIso?: string;
    gateId?: string;
    itemIndex?: number;
    mp3Url?: string;
  } | null>(null);

  const startEdit = (
    s: Announcement,
    fromAudit: boolean = false,
    focusTarget?: { slotIso?: string; gateId?: string; itemIndex?: number; mp3Url?: string }
  ) => {
    const canonical = announcements.find(a => a.id === s.id) || s;
    const norm = normalizeAnnouncement(canonical);
    setEditingId(canonical.id);
    setFormData(norm);
    setInitialFormDataJson(JSON.stringify(norm));
    setOpenedFromAudit(fromAudit);
    setInitialEditorFocusTarget(focusTarget || null);
  };

  const getNextIdFromList = (list: Announcement[]) => {
    const ids = list.map(s => parseInt(s.id)).filter(id => !isNaN(id));
    const max = ids.length > 0 ? Math.max(...ids) : 99999;
    return (max + 1).toString();
  };

  const getNextId = () => {
    return getNextIdFromList(announcements);
  };

  const fetchLatestStorageAnnouncements = async (): Promise<Announcement[]> => {
    try {
      const headers = await getStorageApiHeaders();
      const res = await fetch('/api/announcements', { headers });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return normalizeAnnouncements(list);
        }
      }
    } catch (e) {
      console.warn("Could not poll latest storage announcements before save:", e);
    }
    return announcements;
  };

  const fetchLatestStorageShows = async (): Promise<Show[]> => {
    try {
      const headers = await getStorageApiHeaders();
      const res = await fetch('/api/shows', { headers });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      }
    } catch (e) {
      console.warn("Could not poll latest storage shows before save:", e);
    }
    return shows;
  };

  const createNew = () => {
    const id = getNextId();
    const today = new Date().toISOString().split('T')[0];
    const allGridRules = Array.from({ length: 7 }, (_, d) =>
      Array.from({ length: 24 }, (_, h) => `${d}-${h}`)
    ).flat();

    const newSchedule: Announcement = normalizeAnnouncement({
      id,
      name: '',
      type: AnnouncementType.ADVANCED,
      gridRules: allGridRules,
      enabled: true,
      minute: 0,
      startDate: today,
      timeGatedMp3s: [{
        id: `mp3-${Date.now()}-1`,
        mp3Url: '',
        startDate: formatToDatetimeLocal(today)
      }],
      metadata: {
        createdBy: 'Admin',
        createdDate: new Date().toISOString(),
        lastModifiedBy: 'Admin',
        lastModifiedDate: new Date().toISOString()
      }
    });
    setEditingId(id);
    setFormData(newSchedule);
    setInitialFormDataJson(JSON.stringify(newSchedule));
  };

  const duplicate = (s: Announcement, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = getNextId();
    const nowIso = getCurrentDatetimeLocal();
    
    // Check if start date is in the past
    let newStartDate = s.startDate;
    if (s.startDate && formatToDatetimeLocal(s.startDate) < nowIso) {
      newStartDate = nowIso;
    }

    // Clear expired endDate from previous run if it precedes the new startDate
    let newEndDate = s.endDate;
    if (newEndDate && newStartDate && formatToDatetimeLocal(newEndDate) < formatToDatetimeLocal(newStartDate)) {
      newEndDate = undefined;
    }

    const normS = normalizeAnnouncement(s);
    const copiedGates: TimeGatedMp3[] = (normS.timeGatedMp3s || []).map((g, gIdx) => {
      const allItems = getGateMediaItems(g);
      const activeOnly = allItems.filter(mi => !mi.inactivated);
      const baseItems = activeOnly.length > 0 ? activeOnly : allItems;
      return {
        ...g,
        id: `gate-copy-${Date.now()}-${gIdx}`,
        startDate:
          g.startDate && formatToDatetimeLocal(g.startDate) < nowIso ? nowIso : g.startDate,
        endDate:
          g.endDate && formatToDatetimeLocal(g.endDate) < nowIso ? undefined : g.endDate,
        inactivated: undefined,
        inactivatedAt: undefined,
        mediaItems: baseItems.map(mi => ({
          ...mi,
          inactivated: undefined,
          inactivatedAt: undefined,
        })),
      };
    });
    const newSchedule: Announcement = normalizeAnnouncement({
      ...normS,
      id,
      name: `${s.name} (Copy)`,
      enabled: true, // Reset to active as requested
      startDate: newStartDate,
      endDate: newEndDate,
      timeGatedMp3s: copiedGates,
      validFrom: '1970-01-01T00:00:00.000Z',
      validTo: null,
      isDeleted: false,
      revisions: [],
      metadata: {
        ...s.metadata,
        createdBy: 'Admin',
        createdDate: new Date().toISOString(),
        lastModifiedDate: new Date().toISOString()
      }
    });
    setEditingId(id);
    setFormData(newSchedule);
    setInitialFormDataJson(JSON.stringify(newSchedule));
  };

  const saveEdit = async (overrideEndDate?: string, forceSaveAnyway: boolean = false) => {
    if (!editingId || isSavingAnnouncement) return;
    
    if (!formData.name) {
      return;
    }

    if (formData.type === AnnouncementType.ONE_TIME) {
      if (!formData.date || !formData.time) {
        return;
      }
    }

    const effectiveEndDate = typeof overrideEndDate === 'string'
      ? overrideEndDate
      : formData.endDate;

    if (
      formData.type !== AnnouncementType.ONE_TIME &&
      formData.enabled === false &&
      (!effectiveEndDate || !effectiveEndDate.trim())
    ) {
      const nowLocal = getCurrentDatetimeLocal();
      setInactivateEndModal({
        date: getDatePart(nowLocal),
        time: getTimePart(nowLocal) || '00:00'
      });
      return;
    }

    const currentMp3s = formData.timeGatedMp3s || [];
    const nowSaveCheck = getCurrentDatetimeLocal();
    const existingForValidation = announcements.find(s => s.id === editingId);
    const preExistingExpiredIds = new Set<string>(
      (existingForValidation?.timeGatedMp3s || [])
        .filter(g => !g.inactivated && isGateExpiredOrInactivated(g, nowSaveCheck))
        .map(g => g.id)
    );
    const playedGateBounds = computePlayedGateBoundsMap(
      { ...formData, id: editingId || formData.id },
      currentMp3s,
      logs,
      existingForValidation?.timeGatedMp3s
    );
    const validation = validateTimeGatedMp3s(
      currentMp3s,
      nowSaveCheck,
      effectiveEndDate,
      formData.startDate,
      playedGateBounds,
      preExistingExpiredIds
    );
    if (validation.hasErrors) {
      const blockingErrors = [...validation.blockingErrors];
      const softWarnings = [...validation.softWarnings];
      // Hard blocking errors CANNOT be bypassed via "Save Anyway" (#43/#113)
      if (blockingErrors.length > 0 || (!forceSaveAnyway && softWarnings.length > 0)) {
        setSaveValidationOverrideEndDate(effectiveEndDate);
        setSaveValidationState({ blockingErrors, softWarnings });
        return;
      }
    }

    const sortedMp3s: TimeGatedMp3[] = validation.sorted.map(m => {
      const rawItems = getGateMediaItems(m);
      const sanitizedMediaItems: TimeGatedMediaItem[] = rawItems.map(mi => {
        const sanitizedUrl = getFilenameFromUrlOrPath(mi.mp3Url || '');
        const derivedAssetType: 'audio' | 'script' = classifyMediaAsset(sanitizedUrl, mi.assetType);
        return {
          mp3Url: sanitizedUrl,
          assetType: derivedAssetType,
          backupMp3Url: derivedAssetType === 'script' && mi.backupMp3Url ? getFilenameFromUrlOrPath(mi.backupMp3Url) : undefined,
          approximateReadTime: derivedAssetType === 'script' ? mi.approximateReadTime : undefined,
          ...(derivedAssetType === 'script' && typeof mi.isAutoReadTime === 'boolean'
            ? { isAutoReadTime: mi.isAutoReadTime }
            : {}),
          duration: derivedAssetType === 'audio' ? mi.duration : undefined,
          fileSize: mi.fileSize,
          ...(mi.inactivated ? { inactivated: true } : {}),
          ...(mi.inactivated && mi.inactivatedAt ? { inactivatedAt: mi.inactivatedAt } : {})
        };
      });

      return {
        id: m.id,
        startDate: m.startDate,
        endDate: m.endDate,
        ...(m.inactivated ? { inactivated: true } : {}),
        ...(m.inactivated && m.inactivatedAt ? { inactivatedAt: m.inactivatedAt } : {}),
        mediaItems: sanitizedMediaItems
      };
    });

    const now = new Date().toISOString();
    const existingAnnouncement = announcements.find(s => s.id === editingId);
    const exists = Boolean(existingAnnouncement);
    const existingRevisions: AnnouncementRevision[] = Array.isArray(existingAnnouncement?.revisions)
      ? [...existingAnnouncement!.revisions!]
      : [];
    let nextValidFrom =
      existingAnnouncement?.validFrom || (exists ? '1970-01-01T00:00:00.000Z' : now);

    const resolvedEndDate = effectiveEndDate || formData.endDate;

    if (existingAnnouncement) {
      const sortNumArr = (arr?: number[]) => [...(arr || [])].map(Number).sort((a, b) => a - b).join(',');
      const sortStrArr = (arr?: string[]) => [...(arr || [])].map(String).sort().join(',');
      // Canonicalize gate arrays without v0.15.4 sibling-bridge fields so no-op saves do not push duplicate revisions
      const canonicalizeGates = (gates?: TimeGatedMp3[]) =>
        (gates || []).map(g => ({
          id: g.id || '',
          startDate: g.startDate || '',
          endDate: g.endDate || '',
          inactivated: Boolean(g.inactivated),
          inactivatedAt: g.inactivated ? (g.inactivatedAt || '') : '',
          mediaItems: getGateMediaItems(g).map(mi => ({
            mp3Url: getFilenameFromUrlOrPath(mi.mp3Url || ''),
            assetType: classifyMediaAsset(getFilenameFromUrlOrPath(mi.mp3Url || ''), mi.assetType),
            backupMp3Url: mi.backupMp3Url ? getFilenameFromUrlOrPath(mi.backupMp3Url) : '',
            approximateReadTime: mi.approximateReadTime || '',
            inactivated: Boolean(mi.inactivated),
            inactivatedAt: mi.inactivated ? (mi.inactivatedAt || '') : '',
          })),
        }));

      const hasScheduleChanged =
        (existingAnnouncement.name || '') !== (formData.name || '') ||
        existingAnnouncement.type !== formData.type ||
        Boolean(existingAnnouncement.enabled) !== Boolean(formData.enabled) ||
        (Number(existingAnnouncement.minute) || 0) !== (Number(formData.minute) || 0) ||
        (existingAnnouncement.date || '') !== (formData.date || '') ||
        (existingAnnouncement.time || '') !== (formData.time || '') ||
        (existingAnnouncement.startDate || '') !== (formData.startDate || '') ||
        (existingAnnouncement.endDate || '') !== (resolvedEndDate || '') ||
        sortNumArr(existingAnnouncement.days) !== sortNumArr(formData.days) ||
        sortNumArr(existingAnnouncement.hours) !== sortNumArr(formData.hours) ||
        sortStrArr(existingAnnouncement.gridRules) !== sortStrArr(formData.gridRules) ||
        JSON.stringify(canonicalizeGates(existingAnnouncement.timeGatedMp3s)) !==
          JSON.stringify(canonicalizeGates(sortedMp3s));

      if (hasScheduleChanged) {
        const prevValidFrom =
          !existingAnnouncement.validFrom ||
          (existingAnnouncement.validFrom === '2026-08-01T00:00:00.000Z' && existingRevisions.length === 0)
            ? '1970-01-01T00:00:00.000Z'
            : existingAnnouncement.validFrom;

        existingRevisions.push({
          name: existingAnnouncement.name,
          type: existingAnnouncement.type,
          enabled: existingAnnouncement.enabled,
          minute: existingAnnouncement.minute,
          ...(existingAnnouncement.date !== undefined ? { date: existingAnnouncement.date } : {}),
          ...(existingAnnouncement.time !== undefined ? { time: existingAnnouncement.time } : {}),
          ...(existingAnnouncement.days !== undefined ? { days: [...existingAnnouncement.days] } : {}),
          ...(existingAnnouncement.hours !== undefined ? { hours: [...existingAnnouncement.hours] } : {}),
          ...(existingAnnouncement.gridRules !== undefined ? { gridRules: [...existingAnnouncement.gridRules] } : {}),
          ...(existingAnnouncement.startDate !== undefined ? { startDate: existingAnnouncement.startDate } : {}),
          ...(existingAnnouncement.endDate !== undefined ? { endDate: existingAnnouncement.endDate } : {}),
          ...(existingAnnouncement.timeGatedMp3s !== undefined
            ? { timeGatedMp3s: existingAnnouncement.timeGatedMp3s }
            : {}),
          validFrom: prevValidFrom,
          validTo: now,
        });
        nextValidFrom = now;
      }
    }

    const updated: Announcement = normalizeAnnouncement({
      ...formData as Announcement,
      endDate: resolvedEndDate,
      timeGatedMp3s: sortedMp3s,
      validFrom: nextValidFrom,
      validTo: existingAnnouncement?.validTo !== undefined ? existingAnnouncement.validTo : null,
      isDeleted: Boolean(existingAnnouncement?.isDeleted),
      revisions: existingRevisions,
      metadata: {
        ...(formData.metadata as AnnouncementMetadata),
        lastModifiedDate: now
      }
    });
    
    let newAnnouncements: Announcement[];
    if (exists) {
      newAnnouncements = announcements.map(s => s.id === editingId ? updated : s);
    } else {
      newAnnouncements = [...announcements, updated];
    }
    newAnnouncements = normalizeAnnouncements(newAnnouncements);

    const announcementConflictsList = getAnnouncementConflicts(newAnnouncements).filter(
      c => c.announcement1.id === updated.id || c.announcement2.id === updated.id
    );
    if (announcementConflictsList.length > 0) {
      setPendingSaveAnnouncement({
        updatedList: newAnnouncements,
        conflicts: announcementConflictsList
      });
      return;
    }
    
    setIsSavingAnnouncement(true);
    try {
      // Just-in-time check: For new record creation, check latest storage to prevent ID collision
      let finalNewAnnouncements = newAnnouncements;
      if (!exists) {
        const latestFromStorage = await fetchLatestStorageAnnouncements();
        const freshId = getNextIdFromList(latestFromStorage);
        if (freshId !== updated.id) {
          const rekeyedUpdated: Announcement = {
            ...updated,
            id: freshId
          };
          finalNewAnnouncements = normalizeAnnouncements([
            ...latestFromStorage.filter(s => s.id !== updated.id && s.id !== freshId),
            rekeyedUpdated
          ]);
        }
      }

      const result = await onSave(finalNewAnnouncements);
      if (result !== false) {
        setEditingId(null);
        if (!finishReturnToFileManager() && openedFromAudit) {
          setOpenedFromAudit(false);
          setIsScheduleAuditOpen(true);
        }
      }
    } catch (err) {
      console.error("Save announcement failed:", err);
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (isSavingAnnouncement) return;
    if (!announcements.some(s => s.id === id)) {
      setEditingId(null);
      if (!finishReturnToFileManager() && openedFromAudit) {
        setOpenedFromAudit(false);
        setIsScheduleAuditOpen(true);
      }
      return;
    }
    setIsSavingAnnouncement(true);
    try {
      const result = await onSave(announcements.filter(s => s.id !== id));
      if (result !== false) {
        setEditingId(null);
        if (!finishReturnToFileManager() && openedFromAudit) {
          setOpenedFromAudit(false);
          setIsScheduleAuditOpen(true);
        }
      }
    } catch (err) {
      console.error("Delete announcement failed:", err);
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const toggleDay = (day: number) => {
    const currentDays = formData.days || [];
    if (currentDays.includes(day)) {
      setFormData({ ...formData, days: currentDays.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, days: [...currentDays, day] });
    }
  };

  const toggleGridCell = (day: number, hour: number) => {
    const currentRules = formData.gridRules || [];
    const key = `${day}-${hour}`;
    if (currentRules.includes(key)) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => k !== key) });
    } else {
      setFormData({ ...formData, gridRules: [...currentRules, key] });
    }
  };

  const toggleColumn = (day: number) => {
    const currentRules = formData.gridRules || [];
    const columnKeys = Array.from({ length: 24 }, (_, h) => `${day}-${h}`);
    const allPresent = columnKeys.every(k => currentRules.includes(k));
    
    if (allPresent) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => !columnKeys.includes(k)) });
    } else {
      const newRules = [...new Set([...currentRules, ...columnKeys])];
      setFormData({ ...formData, gridRules: newRules });
    }
  };

  const toggleRow = (hour: number) => {
    const currentRules = formData.gridRules || [];
    const rowKeys = Array.from({ length: 7 }, (_, d) => `${d}-${hour}`);
    const allPresent = rowKeys.every(k => currentRules.includes(k));
    
    if (allPresent) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => !rowKeys.includes(k)) });
    } else {
      const newRules = [...new Set([...currentRules, ...rowKeys])];
      setFormData({ ...formData, gridRules: newRules });
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    const newDate = new Date(calendarDate);
    newDate.setMonth(newMonth);
    setCalendarDate(newDate);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    const newDate = new Date(calendarDate);
    newDate.setFullYear(newYear);
    setCalendarDate(newDate);
  };

  const navigateWeek = (weeks: number) => {
    const newDate = new Date(calendarDate);
    newDate.setDate(calendarDate.getDate() + (weeks * 7));
    setCalendarDate(newDate);
  };

  const navigateCalendar = (offset: number) => {
    if (calendarTimeframe === 'daily') {
      const newDate = new Date(calendarDate);
      newDate.setDate(calendarDate.getDate() + offset);
      setCalendarDate(newDate);
    } else {
      navigateWeek(offset);
    }
  };

  const jumpToToday = () => {
    setCalendarDate(getStationNow());
  };

  const computeAnnouncementsForDateTime = (date: Date, hour: number) => {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const localDateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = date.getDay(); // 0-6

    const activeList = resolveAnnouncementsForDate(date, calendarAnnouncements, logs, hour, showInactive);

    return activeList.filter(s => {
      // Apply basic text filter search
      if (announcementFilterQuery) {
        const q = announcementFilterQuery.toLowerCase();
        const summaryText = getAnnouncementSummary(s).toLowerCase();
        const playModeText = (s.type === AnnouncementType.ONE_TIME ? "One-Time" : s.type === AnnouncementType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
        const matchesQuery = s.name.toLowerCase().includes(q) || 
                             (s.timeGatedMp3s && s.timeGatedMp3s.some(m => getGateMediaItems(m).some(mi => mi.mp3Url && mi.mp3Url.toLowerCase().includes(q)))) ||
                             playModeText.includes(q) ||
                             summaryText.includes(q);
        if (!matchesQuery) return false;
      }

      // If showFilterQuery is set on Calendar view, filter announcements by active show
      if (showFilterQuery && viewMode === 'calendar') {
        const qShow = showFilterQuery.toLowerCase();
        const dayName = DAYS_ORDER[date.getDay()];
        const activeShowsForS = shows.filter(show => isTimeInShow(show, dayName, hour, s.minute));
        const matchesShow = activeShowsForS.some(show =>
          show.name.toLowerCase().includes(qShow) ||
          (show.description && show.description.toLowerCase().includes(qShow)) ||
          show.day.toLowerCase().includes(qShow)
        );
        if (!matchesShow) return false;
      }

      // Hide all inactive announcements by default if setting checked
      if (!showInactive && !s.enabled) return false;

      if (!isAnnouncementWithinDateBounds(s, localDateStr, hour, s.minute || 0)) {
        return false;
      }

      return isAnnouncementRuleMatch(s, dayOfWeek, hour, s.minute || 0, localDateStr, {
        ignoreMinute: true,
      });
    }).sort((a, b) => a.minute - b.minute);
  };

  const announcementsByDayHourMap = React.useMemo(() => {
    const map = new Map<string, Announcement[]>();
    if (viewMode !== 'calendar') return map;
    for (const day of visibleCalendarDays) {
      const yyyy = day.getFullYear();
      const mm = (day.getMonth() + 1).toString().padStart(2, '0');
      const dd = day.getDate().toString().padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      for (let h = 0; h < 24; h++) {
        map.set(`${dateStr}_${h}`, computeAnnouncementsForDateTime(day, h));
      }
    }
    return map;
  }, [
    viewMode,
    visibleCalendarDays,
    calendarAnnouncements,
    logs,
    shows,
    announcementFilterQuery,
    showFilterQuery,
    showInactive,
    stationTimezone
  ]);

  const getAnnouncementsForDateTime = (date: Date, hour: number) => {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}_${hour}`;
    const cached = announcementsByDayHourMap.get(key);
    if (cached !== undefined) return cached;
    return computeAnnouncementsForDateTime(date, hour);
  };

  if (!isAdmin) {
    const resolvedContact = (adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo()).trim();
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="bg-orange-50 p-4 rounded-full mb-4">
          <ShieldAlert className="w-12 h-12 text-orange-500" />
        </div>
        <h2 className="text-xs font-black text-slate-800 uppercase tracking-tighter mb-2">For Administrators ONLY</h2>
        <p className="text-xs text-slate-500 max-w-[280px] mb-4 leading-relaxed font-medium">
          Please don&apos;t change or edit unless you know how it all works. Thanks!
        </p>
        <div className="w-full max-w-[320px] mb-6 p-3 rounded-lg bg-slate-50 border border-slate-200 text-left">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
            Admin Contact
          </span>
          <p className="text-xs font-bold text-slate-800 whitespace-pre-wrap break-words leading-snug">
            {resolvedContact || 'No admin contact info saved yet. Configure in Admin Mode under Calendar or Folders > Help.'}
          </p>
        </div>
        <button 
          onClick={() => onAdminToggle(true)}
          className="admin-challenge-btn px-6 py-2.5 bg-slate-900 text-white rounded text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          Enter Admin Mode
        </button>
      </div>
    );
  }

  const activeAdminContact = (adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo()).trim();
  const showFirstRunAdminContactBanner = isAdmin && !hasSavedAdminContact && !activeAdminContact && !dismissedFirstRunContact;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 font-sans">
      {showFirstRunAdminContactBanner && (
        <div className="mb-2.5 px-3 py-2.5 bg-purple-50 border border-purple-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <span className="text-xs font-black uppercase tracking-wider text-purple-900 block">
              First-Run Setup: Admin Contact Info
            </span>
            <span className="text-xs text-purple-800 block">
              Enter contact details shown on the Calendar Admin warning screen and on &quot;Get Help&quot; alerts for missing/invalid files (editable anytime in Admin Mode under Folders &gt; Help).
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="text"
              value={firstRunContactDraft}
              onChange={(e) => setFirstRunContactDraft(e.target.value)}
              placeholder="Name, email, or phone..."
              className="px-2.5 py-1 bg-white border border-purple-300 rounded text-xs font-bold text-slate-900 w-56 outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              disabled={isSavingFirstRunContact || !firstRunContactDraft.trim()}
              onClick={async () => {
                setIsSavingFirstRunContact(true);
                try {
                  const cleaned = setAdminContactInfo(firstRunContactDraft);
                  if (onSaveAdminContactInfo) {
                    await onSaveAdminContactInfo(cleaned);
                  }
                  setDismissedFirstRunContact(true);
                } finally {
                  setIsSavingFirstRunContact(false);
                }
              }}
              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {isSavingFirstRunContact ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setDismissedFirstRunContact(true)}
              className="p-1 text-purple-700 hover:text-purple-950 rounded cursor-pointer"
              title="Dismiss for now"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {editingShowId ? (
        <ShowEditorForm
          editingShowId={editingShowId}
          shows={shows}
          showFormData={showFormData}
          setShowFormData={setShowFormData}
          isNameShortManuallyEdited={isNameShortManuallyEdited}
          setIsNameShortManuallyEdited={setIsNameShortManuallyEdited}
          setEditingShowId={setEditingShowId}
          isSavingShow={isSavingShow}
          handleSaveShow={handleSaveShow}
          handleDeleteShow={handleDeleteShow}
          showValidationErrors={showValidationErrors}
          onClearShowValidationErrors={() => {
            if (showValidationErrors.length > 0) setShowValidationErrors([]);
          }}
          onSendMessageToShow={(sh) => createNewMessage(sh.id)}
          onViewMessagesForShow={(sh) => setViewingMessagesForShow(sh)}
          activeMessagesCountByShowId={activeMessagesCountByShowId}
        />
      ) : !editingId ? (
        <div className="flex flex-col h-full min-h-0 flex-1">
          <CalendarHeaderBar
            headerContainerRef={headerContainerRef}
            viewMode={viewMode}
            setViewMode={setViewMode}
            stationTimezone={stationTimezone}
            announcementFilterQuery={announcementFilterQuery}
            setAnnouncementFilterQuery={setAnnouncementFilterQuery}
            showFilterQuery={showFilterQuery}
            setShowFilterQuery={setShowFilterQuery}
            messageFilterQuery={messageFilterQuery}
            setMessageFilterQuery={setMessageFilterQuery}
            activeMessagesCount={activeMessagesCount}
            createNew={createNew}
            createNewShow={createNewShow}
            createNewMessage={() => createNewMessage()}
            isHeaderStacked={isHeaderStacked}
            isUltraNarrowHeader={isUltraNarrowHeader}
            compactNavBar={compactNavBar}
            abbreviateAnnouncements={abbreviateAnnouncements}
            hideCalendarIcon={hideCalendarIcon}
            hideAnnouncementsIcons={hideAnnouncementsIcons}
            hideShowsIcon={hideShowsIcon}
            modeIconsOnly={modeIconsOnly}
            addTextIconOnly={addTextIconOnly}
            addTextShort={addTextShort}
            halfFilter={halfFilter}
            showPixelRuler={showPixelRuler}
            isFullStacked={isFullStacked}
            isCell3Below={isCell3Below}
            isFilterModeSplit={isFilterModeSplit}
            activeTriggerWidth={activeTriggerWidth}
            headerContainerWidth={headerContainerWidth}
            controlsContainerWidth={controlsContainerWidth}
          />

          {viewMode === 'calendar' ? (
            <WeeklyCalendarGrid
              controlsContainerRef={controlsContainerRef}
              announcementConflicts={announcementConflicts}
              showConflicts={showConflicts}
              isCell3Below={isCell3Below}
              isFullStacked={isFullStacked}
              isIssuesAuditStacked={isIssuesAuditStacked}
              controlsNavShort={controlsNavShort}
              controlsNavIconOnly={controlsNavIconOnly}
              isWeekDayStacked={isWeekDayStacked}
              isNavStacked={isNavStacked}
              isFilterModeSplit={isFilterModeSplit}
              dropFilterModeLabels={dropFilterModeLabels}
              dropShowIssuesText={dropShowIssuesText}
              dropAuditWord={dropAuditWord}
              calendarTimeframe={calendarTimeframe}
              setCalendarTimeframe={setCalendarTimeframe}
              calendarLayoutMode={calendarLayoutMode}
              setCalendarLayoutMode={setCalendarLayoutMode}
              calendarDate={calendarDate}
              handleMonthChange={handleMonthChange}
              handleYearChange={handleYearChange}
              navigateCalendar={navigateCalendar}
              jumpToToday={jumpToToday}
              selectedHours={selectedHours}
              setSelectedHours={setSelectedHours}
              isHoursDropdownOpen={isHoursDropdownOpen}
              setIsHoursDropdownOpen={setIsHoursDropdownOpen}
              showInactive={showInactive}
              setShowInactive={setShowInactive}
              showIssues={showIssues}
              setShowIssues={setShowIssues}
              setIsScheduleAuditOpen={setIsScheduleAuditOpen}
              scheduleDiagnostics={scheduleDiagnostics}
              now={now}
              shows={shows}
              showFilterQuery={showFilterQuery}
              dayAuditByDayKey={dayAuditByDayKey}
              logsByDayHour={logsByDayHour}
              getAnnouncementsForDateTime={getAnnouncementsForDateTime}
              setSelectedCalendarShow={setSelectedCalendarShow}
              setPreviewScriptFile={setPreviewScriptFile}
              startEdit={startEdit}
            />
          ) : viewMode === 'shows' ? (
            <ShowsManagerList
              shows={shows}
              showFilterQuery={showFilterQuery}
              showConflicts={showConflicts}
              showGaps={showGaps}
              showsCardsCollapse={showsCardsCollapse}
              startEditShow={startEditShow}
              handleVerifyEvergreens={handleVerifyEvergreens}
              isVerifyingEvergreens={isVerifyingEvergreens}
              showsFolderCheckMinimal={showsFolderCheckMinimal}
              showsFolderCheckShort={showsFolderCheckShort}
              onSendMessageToShow={(sh) => createNewMessage(sh.id)}
              onViewMessagesForShow={(sh) => setViewingMessagesForShow(sh)}
              activeMessagesCountByShowId={activeMessagesCountByShowId}
            />
          ) : viewMode === 'messages' ? (
            <AdminMessagesManagerView
              messages={adminMessages}
              shows={shows}
              now={now}
              compatibilityReport={compatibilityReport}
              filterQuery={messageFilterQuery}
              listCardCollapseViewEditText={msgCardCollapseViewEditText}
              listCardCollapseCopyText={msgCardCollapseCopyText}
              listCardCollapseDetailsText={msgCardCollapseDetailsText}
              listCardCollapsePreviewText={msgCardCollapsePreviewText}
              onCreateNewMessage={() => createNewMessage()}
              onEditMessage={(msg) => {
                setReuseSourceAdminMessage(null);
                setEditingAdminMessage(msg);
                setMessageInitialShowId(undefined);
                setIsMessageEditorOpen(true);
              }}
              onReuseMessage={handleReuseAdminMessage}
              onPreviewMessage={(msg) => setPreviewingAdminMessage(msg)}
              onArchiveMessage={handleArchiveAdminMessage}
              onRestoreMessage={handleRestoreAdminMessage}
              onDeleteMessage={handleDeleteAdminMessage}
              onToggleBuiltInSystemMessage={handleToggleBuiltInSystemMessage}
              onResetAcknowledgements={handleResetAdminMessageAcks}
            />
          ) : viewMode === 'files' ? (
            <FileManagerView
              announcements={announcements}
              fallbackFiles={driveMP3s}
              pickerDurations={pickerDurations}
              metadataCache={metadataCache}
              previewUrl={previewUrl}
              onTogglePreview={(name, bucket) => togglePreview(name, undefined, bucket)}
              onPreviewScript={(name, bucket) => {
                setPreviewScriptOrigin(null);
                setPreviewScriptFromPicker(false);
                setPreviewScriptBucket(bucket);
                setPreviewScriptFile(name);
              }}
              onNewCopy={() => {
                setCopyEditorState({
                  isOpen: true,
                  initialFileName: undefined,
                  sourceFileToCopy: undefined,
                  sourceBucket: undefined,
                  initialReadTime: undefined,
                  targetGateId: null,
                  targetItemIndex: undefined,
                  targetAnnouncementId: null,
                  fromPicker: false,
                });
              }}
              onEditScript={(name, bucket) => {
                const allMediaItems = announcements.flatMap(a =>
                  (a.timeGatedMp3s || []).flatMap(m => getGateMediaItems(m))
                );
                const matchingItem = allMediaItems.find(
                  mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === name.toLowerCase()
                );
                setCopyEditorState({
                  isOpen: true,
                  initialFileName: name,
                  sourceFileToCopy: undefined,
                  sourceBucket: bucket,
                  initialReadTime: matchingItem?.approximateReadTime,
                  initialIsAutoReadTime: matchingItem?.isAutoReadTime,
                  initialBackupMp3Url: matchingItem?.backupMp3Url,
                  targetGateId: null,
                  targetItemIndex: undefined,
                  targetAnnouncementId: null,
                  fromPicker: false,
                });
              }}
              onCopyScript={(name, bucket) => {
                const allMediaItems = announcements.flatMap(a =>
                  (a.timeGatedMp3s || []).flatMap(m => getGateMediaItems(m))
                );
                const matchingItem = allMediaItems.find(
                  mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === name.toLowerCase()
                );
                setCopyEditorState({
                  isOpen: true,
                  initialFileName: undefined,
                  sourceFileToCopy: name,
                  sourceBucket: bucket,
                  initialReadTime: matchingItem?.approximateReadTime,
                  initialIsAutoReadTime: matchingItem?.isAutoReadTime,
                  initialBackupMp3Url: matchingItem?.backupMp3Url,
                  targetGateId: null,
                  targetItemIndex: undefined,
                  targetAnnouncementId: null,
                  fromPicker: false,
                });
              }}
              onFileUploaded={(uploaded) => {
                const nowMs = uploaded.mtimeMs || Date.now();
                const nowIso = uploaded.modifiedTime || new Date(nowMs).toISOString();
                const resolvedDuration =
                  (uploaded as any).duration || mp3DurationCache.get(uploaded.name) || '';
                if (resolvedDuration) {
                  setPickerDurations(prev => ({ ...prev, [uploaded.name]: resolvedDuration }));
                }
                upsertMediaCatalogFile({
                  name: uploaded.name,
                  path: uploaded.path || uploaded.name,
                  size: uploaded.size || '0.1 MB',
                  duration: resolvedDuration,
                  mtimeMs: nowMs,
                  modifiedTime: nowIso,
                });
                setLocalSavedMediaFiles(prev => [
                  {
                    name: uploaded.name,
                    path: uploaded.path || uploaded.name,
                    size: uploaded.size || '0.1 MB',
                    duration: resolvedDuration,
                    mtimeMs: nowMs,
                    modifiedTime: nowIso,
                  },
                  ...prev.filter(f => f.name.toLowerCase() !== uploaded.name.toLowerCase()),
                ]);
              }}
              onRefreshParent={onRefresh}
              isDriveActive={isDriveActive}
              externalSearchQuery={fileManagerSearchQuery}
              onExternalSearchQueryChange={setFileManagerSearchQuery}
              onJumpToAnnouncement={(announcementId, sourceFileName) => {
                const targetAnn = announcements.find(a => a.id === announcementId);
                if (targetAnn) {
                  setOpenedFromFileManagerFile(sourceFileName);
                  startEdit(targetAnn, false, { mp3Url: sourceFileName });
                }
              }}
              returnFocusFileName={fileManagerReturnFocusFile}
              onClearReturnFocusFileName={() => setFileManagerReturnFocusFile(null)}
              refreshTrigger={fileManagerRefreshTrigger}
              onOpenFolder={onOpenAnnouncementsFolder}
            />
          ) : (
            <AnnouncementsListView
              announcements={announcements}
              logs={logs}
              now={now}
              announcementFilterQuery={announcementFilterQuery}
              inactiveSortMode={inactiveSortMode}
              setInactiveSortMode={setInactiveSortMode}
              selectedListMediaByAnnId={selectedListMediaByAnnId}
              setSelectedListMediaByAnnId={setSelectedListMediaByAnnId}
              startEdit={startEdit}
              createNew={createNew}
              duplicate={duplicate}
              onInactivateOrReactivate={async (s, nextEnabled, e) => {
                e.stopPropagation();
                if (isSavingAnnouncement) return;
                const nowLocal = getCurrentDatetimeLocal();
                if (!nextEnabled && s.type !== AnnouncementType.ONE_TIME && (!s.endDate || !s.endDate.trim())) {
                  startEdit(s);
                  setFormData(prev => ({ ...prev, enabled: false }));
                  setInactivateEndModal({
                    date: getDatePart(nowLocal),
                    time: getTimePart(nowLocal) || '00:00',
                  });
                  return;
                }
                const nowUtc = new Date().toISOString();
                const updatedList = normalizeAnnouncements(
                  announcements.map(item => {
                    if (item.id !== s.id) return item;
                    const existingRevs: AnnouncementRevision[] = Array.isArray(item.revisions)
                      ? [...item.revisions]
                      : [];
                    const prevValidFrom =
                      !item.validFrom ||
                      (item.validFrom === '2026-08-01T00:00:00.000Z' && existingRevs.length === 0)
                        ? '1970-01-01T00:00:00.000Z'
                        : item.validFrom;
                    existingRevs.push({
                      name: item.name,
                      type: item.type,
                      enabled: item.enabled,
                      minute: item.minute,
                      ...(item.date !== undefined ? { date: item.date } : {}),
                      ...(item.time !== undefined ? { time: item.time } : {}),
                      ...(item.days !== undefined ? { days: [...item.days] } : {}),
                      ...(item.hours !== undefined ? { hours: [...item.hours] } : {}),
                      ...(item.gridRules !== undefined ? { gridRules: [...item.gridRules] } : {}),
                      ...(item.startDate !== undefined ? { startDate: item.startDate } : {}),
                      ...(item.endDate !== undefined ? { endDate: item.endDate } : {}),
                      ...(item.timeGatedMp3s !== undefined ? { timeGatedMp3s: item.timeGatedMp3s } : {}),
                      validFrom: prevValidFrom,
                      validTo: nowUtc,
                    });
                    const shouldClearPastEndOnReactivate = Boolean(
                      nextEnabled && item.endDate && formatToDatetimeLocal(item.endDate) <= nowLocal
                    );
                    return {
                      ...item,
                      enabled: nextEnabled,
                      ...(shouldClearPastEndOnReactivate ? { endDate: undefined } : {}),
                      validFrom: nowUtc,
                      revisions: existingRevs,
                      metadata: {
                        createdBy: item.metadata?.createdBy || 'Admin',
                        createdDate: item.metadata?.createdDate || nowUtc,
                        lastModifiedBy: item.metadata?.lastModifiedBy || 'Admin',
                        lastModifiedDate: nowUtc,
                      },
                    };
                  })
                );
                setIsSavingAnnouncement(true);
                try {
                  await onSave(updatedList);
                } finally {
                  setIsSavingAnnouncement(false);
                }
              }}
              onDeleteAnnouncementCard={(s, e) => {
                e.stopPropagation();
                setDeleteConfirmId(s.id);
              }}
              listCardHideTypeTag={listCardHideTypeTag}
              listCardHideSummaryTag={listCardHideSummaryTag}
              listCardCollapseViewEditText={listCardCollapseViewEditText}
              listCardCollapseCopyText={listCardCollapseCopyText}
              listCardCollapseDetailsText={listCardCollapseDetailsText}
              listCardCollapsePreviewText={listCardCollapsePreviewText}
              previewUrl={previewUrl}
              togglePreview={togglePreview}
              setPreviewScriptBackupUrl={setPreviewScriptBackupUrl}
              setPreviewScriptOrigin={setPreviewScriptOrigin}
              setPreviewScriptFromPicker={setPreviewScriptFromPicker}
              setPreviewScriptFile={setPreviewScriptFile}
              announcementGaps={announcementGaps}
              announcementConflicts={announcementConflicts}
            />
          )}
      </div>
    ) : (
        <AnnouncementEditorView
          editingId={editingId!}
          formData={formData}
          setFormData={setFormData}
          isNew={isNew}
          isDraggingClock={isDraggingClock}
          setIsDraggingClock={setIsDraggingClock}
          handleClockInteraction={handleClockInteraction}
          handleAddMp3={handleAddMp3}
          onReuseGate={handleReuseGate}
          savedGates={announcements.find(a => a.id === editingId)?.timeGatedMp3s}
          initialFocusTarget={initialEditorFocusTarget}
          onClearInitialFocusTarget={() => setInitialEditorFocusTarget(null)}
          focusBottomProblemGateNonce={focusBottomProblemGateNonce}
          logs={logs}
          pickerDurations={pickerDurations}
          metadataCache={metadataCache}
          previewUrl={previewUrl}
          togglePreview={togglePreview}
          setCopyEditorState={setCopyEditorState}
          setPreviewScriptBackupUrl={setPreviewScriptBackupUrl}
          setPreviewScriptOrigin={setPreviewScriptOrigin}
          setPreviewScriptFromPicker={setPreviewScriptFromPicker}
          setPreviewScriptFile={setPreviewScriptFile}
          setPickerTarget={setPickerTarget}
          setPickerMp3Id={setPickerMp3Id}
          setPickerItemIndex={setPickerItemIndex}
          setSearchQuery={setSearchQuery}
          setIsPickerOpen={setIsPickerOpen}
          toggleColumn={toggleColumn}
          toggleRow={toggleRow}
          toggleGridCell={toggleGridCell}
          isSavingAnnouncement={isSavingAnnouncement}
          setDeleteConfirmId={setDeleteConfirmId}
          handleCancelEdit={handleCancelEdit}
          saveEdit={saveEdit}
          isFormValid={isFormValid}
          isDriveActive={isDriveActive}
          existingFileNames={existingFileNames}
          onFileUploaded={(uploaded) => {
            const nowMs = uploaded.mtimeMs || Date.now();
            const nowIso = uploaded.modifiedTime || new Date(nowMs).toISOString();
            const resolvedDuration = uploaded.duration || mp3DurationCache.get(uploaded.name) || '';
            if (resolvedDuration) {
              setPickerDurations(prev => ({ ...prev, [uploaded.name]: resolvedDuration }));
            }
            upsertMediaCatalogFile({
              name: uploaded.name,
              path: uploaded.path || uploaded.name,
              size: uploaded.size || '0.1 MB',
              duration: resolvedDuration,
              mtimeMs: nowMs,
              modifiedTime: nowIso,
            });
            setLocalSavedMediaFiles(prev => [
              {
                name: uploaded.name,
                path: uploaded.path || uploaded.name,
                size: uploaded.size || '0.1 MB',
                duration: resolvedDuration,
                mtimeMs: nowMs,
                modifiedTime: nowIso
              },
              ...prev.filter(f => f.name.toLowerCase() !== uploaded.name.toLowerCase())
            ]);
          }}
        />
      )}

      {/* MP3 Picker Modal */}
      <MediaPickerModal
        isOpen={isPickerOpen}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        filteredFiles={filteredFiles}
        pickerDurations={pickerDurations}
        metadataCache={metadataCache}
        previewUrl={previewUrl}
        onTogglePreview={togglePreview}
        onPreviewScript={(name) => {
          setPreviewScriptOrigin({
            announcementId: editingId || formData.id || null,
            gateId: pickerMp3Id,
            itemIndex: pickerItemIndex ?? undefined,
            fromPicker: true
          });
          setPreviewScriptFromPicker(true);
          setPreviewScriptFile(name);
        }}
        onNewCopy={
          pickerTarget !== 'backup'
            ? () => {
                setCopyEditorState({
                  isOpen: true,
                  initialFileName: undefined,
                  sourceFileToCopy: undefined,
                  initialReadTime: undefined,
                  targetGateId: pickerMp3Id,
                  targetItemIndex: pickerItemIndex ?? undefined,
                  targetAnnouncementId: editingId || formData.id || null,
                  fromPicker: true
                });
              }
            : undefined
        }
        onEditScript={(name) => {
          const allMediaItems = (formData.timeGatedMp3s || []).flatMap(m => getGateMediaItems(m));
          const matchingItem = allMediaItems.find(
            mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === name.toLowerCase()
          );
          setCopyEditorState({
            isOpen: true,
            initialFileName: name,
            sourceFileToCopy: undefined,
            initialReadTime: matchingItem?.approximateReadTime,
            initialIsAutoReadTime: matchingItem?.isAutoReadTime,
            initialBackupMp3Url: matchingItem?.backupMp3Url,
            targetGateId: pickerMp3Id,
            targetItemIndex: pickerItemIndex ?? undefined,
            targetAnnouncementId: editingId || formData.id || null,
            fromPicker: true
          });
        }}
        onCopyScript={(name) => {
          const allMediaItems = (formData.timeGatedMp3s || []).flatMap(m => getGateMediaItems(m));
          const matchingItem = allMediaItems.find(
            mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === name.toLowerCase()
          );
          setCopyEditorState({
            isOpen: true,
            initialFileName: undefined,
            sourceFileToCopy: name,
            initialReadTime: matchingItem?.approximateReadTime,
            initialIsAutoReadTime: matchingItem?.isAutoReadTime,
            initialBackupMp3Url: matchingItem?.backupMp3Url,
            targetGateId: pickerMp3Id,
            targetItemIndex: pickerItemIndex ?? undefined,
            targetAnnouncementId: editingId || formData.id || null,
            fromPicker: true
          });
        }}
         onSelectFile={handleSelectFileFromPicker}
        allowMultiSelect={
          pickerTarget === 'newTimeGated' ||
          pickerTarget === 'addGateFile' ||
          (pickerTarget === 'timeGated' &&
            (() => {
              const targetGate = (formData.timeGatedMp3s || []).find(m => m.id === pickerMp3Id);
              const items = targetGate ? getGateMediaItems(targetGate) : [];
              const targetItem = items[pickerItemIndex ?? 0];
              return !targetItem || !targetItem.mp3Url || !targetItem.mp3Url.trim();
            })())
        }
        allowProceedEmpty={pickerTarget === 'newTimeGated'}
        onSelectMultipleFiles={handleSelectMultipleFilesFromPicker}
        onProceedWithoutFile={handleProceedWithoutFileFromPicker}
        highlightedFileName={pickerHighlightedFileName}
        externalPendingConfirmSelection={pickerExternalConfirmSelection}
        onClearExternalPendingConfirmSelection={() => setPickerExternalConfirmSelection(null)}
        pickerContextInfo={(() => {
          const annName = formData.name?.trim() || 'Unnamed Announcement';
          const annId = editingId || formData.id || 'New';
          const playtimeLabel =
            formData.type === AnnouncementType.ONE_TIME
              ? 'One-Time'
              : `:${String(formData.minute ?? 0).padStart(2, '0')}m`;
          const annPrefix = `${annName} (ID: ${annId} • ${playtimeLabel})`;
          const allGates = formData.timeGatedMp3s || [];
          const gateIdx = pickerMp3Id ? allGates.findIndex(m => m.id === pickerMp3Id) : -1;
          const targetGate = gateIdx >= 0 ? allGates[gateIdx] : null;
          const gateRangeLabel = targetGate
            ? `${
                targetGate.startDate
                  ? formatDatetime12(formatToDatetimeLocal(targetGate.startDate))
                  : 'Unset Start'
              } – ${
                targetGate.endDate
                  ? formatDatetime12(formatToDatetimeLocal(targetGate.endDate))
                  : 'Open-ended'
              }`
            : '';

          if (pickerTarget === 'newTimeGated') {
            return {
              mode: 'choose' as const,
              contextDescription: `${annPrefix} • Adding New Gate #${allGates.length + 1}`,
              currentFile: null,
            };
          }

          if (pickerTarget === 'addGateFile') {
            const activeCount = targetGate
              ? getGateMediaItems(targetGate).filter(
                  mi => !mi.inactivated && Boolean(mi.mp3Url && mi.mp3Url.trim())
                ).length
              : 0;
            return {
              mode: 'choose' as const,
              contextDescription: `${annPrefix} • Gate #${gateIdx + 1}${
                gateRangeLabel ? ` (${gateRangeLabel})` : ''
              } • Adding Rotation File (${activeCount + 1}/${activeCount + 1})`,
              currentFile: null,
            };
          }

          if (pickerTarget === 'backup') {
            const items = targetGate ? getGateMediaItems(targetGate) : [];
            const targetIdx = pickerItemIndex ?? 0;
            const targetItem = items[targetIdx];
            const hasBackup = Boolean(targetItem?.backupMp3Url && targetItem.backupMp3Url.trim());
            const scriptName = targetItem?.mp3Url
              ? getFilenameFromUrlOrPath(targetItem.mp3Url)
              : 'Live Read';
            return {
              mode: (hasBackup ? 'replace' : 'choose') as 'choose' | 'replace',
              contextDescription: `${annPrefix} • Gate #${gateIdx + 1}${
                gateRangeLabel ? ` (${gateRangeLabel})` : ''
              } • Backup Audio for "${scriptName}"`,
              currentFile:
                hasBackup && targetItem?.backupMp3Url
                  ? {
                      name: getFilenameFromUrlOrPath(targetItem.backupMp3Url),
                    }
                  : null,
            };
          }

          if (pickerTarget === 'timeGated') {
            const items = targetGate ? getGateMediaItems(targetGate) : [];
            const targetIdx = pickerItemIndex ?? 0;
            const targetItem = items[targetIdx];
            const hasAttached = Boolean(targetItem?.mp3Url && targetItem.mp3Url.trim());
            const activeItems = items
              .map((mi, idx) => ({ mi, idx }))
              .filter(x => !x.mi.inactivated);
            const activePos = activeItems.findIndex(x => x.idx === targetIdx);
            const slotLabel =
              activeItems.length > 1 && activePos >= 0
                ? `Rotation Slot (${activePos + 1}/${activeItems.length})`
                : 'Gate Media';
            const playCount =
              hasAttached && targetGate && targetItem?.mp3Url
                ? calculateGatedTrackAudit(
                    editingId || formData.id || '',
                    targetItem.mp3Url,
                    logs,
                    {
                      gate: targetGate,
                      announcement: formData,
                      itemIndex: targetIdx,
                      referenceNow: now,
                    }
                  ).totalPlays
                : 0;
            return {
              mode: (hasAttached ? 'replace' : 'choose') as 'choose' | 'replace',
              contextDescription: `${annPrefix} • Gate #${gateIdx + 1}${
                gateRangeLabel ? ` (${gateRangeLabel})` : ''
              } • ${slotLabel}`,
              currentFile:
                hasAttached && targetItem?.mp3Url
                  ? {
                      name: getFilenameFromUrlOrPath(targetItem.mp3Url),
                      duration: targetItem.duration ? String(targetItem.duration) : undefined,
                      approximateReadTime: targetItem.approximateReadTime,
                      playCount,
                    }
                  : null,
            };
          }

          return {
            mode: 'choose' as const,
            contextDescription: `${annPrefix} • Gate #1 Media`,
            currentFile: null,
          };
        })()}
        replacingPlayedMediaInfo={
          pickerTarget === 'timeGated' && pickerMp3Id
            ? (() => {
                const targetGate = (formData.timeGatedMp3s || []).find(m => m.id === pickerMp3Id);
                if (!targetGate) return null;
                const items = getGateMediaItems(targetGate);
                const targetIdx = pickerItemIndex ?? 0;
                const targetItem = items[targetIdx];
                if (!targetItem || !targetItem.mp3Url || !targetItem.mp3Url.trim()) return null;
                const priorFileName = getFilenameFromUrlOrPath(targetItem.mp3Url);
                const audit = calculateGatedTrackAudit(
                  editingId || formData.id || '',
                  targetItem.mp3Url,
                  logs,
                  {
                    gate: targetGate,
                    announcement: formData,
                    itemIndex: targetIdx,
                    referenceNow: now,
                  }
                );
                if (audit.totalPlays <= 0) return null;
                return {
                  priorFileName,
                  playCount: audit.totalPlays,
                };
              })()
            : null
        }
        onClose={() => {
          setIsPickerOpen(false);
          setPickerTarget('main');
          setPickerItemIndex(null);
          setPickerHighlightedFileName(null);
          setPickerExternalConfirmSelection(null);
        }}
        onRefresh={async () => {
          if (onRefresh) {
            setIsRefreshing(true);
            await onRefresh();
            setTimeout(() => setIsRefreshing(false), 800);
          }
        }}
        isRefreshing={isRefreshing}
        isDriveActive={isDriveActive}
        announcements={announcements}
        currentEditingAnnouncement={editingId ? formData : null}
        lockAudioOnly={pickerTarget === 'backup'}
        onFileUploaded={(uploaded) => {
          const nowMs = uploaded.mtimeMs || Date.now();
          const nowIso = uploaded.modifiedTime || new Date(nowMs).toISOString();
          const resolvedDuration = (uploaded as any).duration || mp3DurationCache.get(uploaded.name) || '';
          if (resolvedDuration) {
            setPickerDurations(prev => ({ ...prev, [uploaded.name]: resolvedDuration }));
          }
          upsertMediaCatalogFile({
            name: uploaded.name,
            path: uploaded.path || uploaded.name,
            size: uploaded.size || '0.1 MB',
            duration: resolvedDuration,
            mtimeMs: nowMs,
            modifiedTime: nowIso,
          });
          setLocalSavedMediaFiles(prev => [
            {
              name: uploaded.name,
              path: uploaded.path || uploaded.name,
              size: uploaded.size || '0.1 MB',
              duration: resolvedDuration,
              mtimeMs: nowMs,
              modifiedTime: nowIso
            },
            ...prev.filter(f => f.name.toLowerCase() !== uploaded.name.toLowerCase())
          ]);
          if (onRefresh && !editingId && !editingShowId) {
            Promise.resolve(onRefresh()).catch(() => {});
          }
        }}
      />

      {/* Live Read .txt Copy Editor Modal */}
      <CopyEditorModal
        isOpen={copyEditorState.isOpen}
        initialFileName={copyEditorState.initialFileName}
        sourceFileToCopy={copyEditorState.sourceFileToCopy}
        sourceBucket={copyEditorState.sourceBucket}
        initialReadTime={copyEditorState.initialReadTime}
        initialIsAutoReadTime={copyEditorState.initialIsAutoReadTime}
        initialBackupMp3Url={copyEditorState.initialBackupMp3Url}
        suggestedBaseName={formData.name || ''}
        isDriveActive={isDriveActive}
        existingFileNames={existingFileNames}
        availableFiles={driveMP3s}
        pickerDurations={pickerDurations}
        metadataCache={metadataCache}
        announcements={announcements}
        currentEditingAnnouncement={editingId ? formData : null}
        usedByDescriptions={(() => {
          const targetName = (copyEditorState.initialFileName || '').toLowerCase();
          if (!targetName) return [];
          const usages: string[] = [];
          announcements.forEach(a => {
            if (editingId && a.id === editingId) return;
            const slots = a.timeGatedMp3s || [];
            slots.forEach((s, gIdx) => {
              const items = getGateMediaItems(s);
              items.forEach((mi, iIdx) => {
                if (getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === targetName) {
                  const baseLabel = a.name || `Announcement #${a.id}`;
                  if (slots.length > 1 || items.length > 1) {
                    usages.push(
                      items.length > 1
                        ? `${baseLabel} (Gate #${gIdx + 1} (${iIdx + 1}/${items.length}))`
                        : `${baseLabel} (Gate #${gIdx + 1})`
                    );
                  } else {
                    usages.push(baseLabel);
                  }
                }
              });
            });
          });
          if (editingId) {
            const localSlots = formData.timeGatedMp3s || [];
            localSlots.forEach((s, gIdx) => {
              const items = getGateMediaItems(s);
              items.forEach((mi, iIdx) => {
                if (getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === targetName) {
                  const baseLabel = formData.name || 'Current Announcement';
                  usages.push(
                    items.length > 1
                      ? `${baseLabel} (Gate #${gIdx + 1} (${iIdx + 1}/${items.length}))`
                      : `${baseLabel} (Gate #${gIdx + 1})`
                  );
                }
              });
            });
          }
          return usages;
        })()}
        onClose={() => setCopyEditorState({ isOpen: false })}
        onBackupAudioUploaded={(uploaded, previousRenamedName) => {
          const nowMs = uploaded.mtimeMs || Date.now();
          const nowIso = uploaded.modifiedTime || new Date(nowMs).toISOString();
          const resolvedDuration = (uploaded as any).duration || mp3DurationCache.get(uploaded.name) || '';
          if (resolvedDuration) {
            setPickerDurations(prev => ({ ...prev, [uploaded.name]: resolvedDuration }));
          }
          if (previousRenamedName && previousRenamedName.toLowerCase() !== uploaded.name.toLowerCase()) {
            availableFilesCache.delete(previousRenamedName);
          }
          upsertMediaCatalogFile({
            name: uploaded.name,
            path: uploaded.path || uploaded.name,
            size: uploaded.size || '0.1 MB',
            duration: resolvedDuration,
            mtimeMs: nowMs,
            modifiedTime: nowIso,
          });
          setLocalSavedMediaFiles(prev => [
            {
              name: uploaded.name,
              path: uploaded.path || uploaded.name,
              size: uploaded.size || '0.1 MB',
              duration: resolvedDuration,
              mtimeMs: nowMs,
              modifiedTime: nowIso
            },
            ...prev.filter(
              f =>
                f.name.toLowerCase() !== uploaded.name.toLowerCase() &&
                (!previousRenamedName || f.name.toLowerCase() !== previousRenamedName.toLowerCase())
            )
          ]);
        }}
        onSaved={async ({ name, path, size, approximateReadTime, isAutoReadTime, pairedBackupAudioFile, doNotAttachBackup, adoptNewFile }) => {
          const shouldAdopt = adoptNewFile !== false;
          const nextIsAutoReadTime = isAutoReadTime !== undefined ? isAutoReadTime : true;
          const isSplitFromExisting = Boolean(
            copyEditorState.initialFileName &&
            getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase() !== name.toLowerCase()
          );
          const wasEditingExistingInPicker =
            copyEditorState.fromPicker && Boolean(copyEditorState.initialFileName);
          const wasCopyingInPicker =
            copyEditorState.fromPicker && Boolean(copyEditorState.sourceFileToCopy);
          const targetGateId = copyEditorState.targetGateId;
          const targetGateIndex = copyEditorState.targetGateIndex;
          const targetItemIndex = copyEditorState.targetItemIndex;
          const targetAnnouncementId = copyEditorState.targetAnnouncementId;
          const resolvedBackup = !doNotAttachBackup
            ? pairedBackupAudioFile || findMatchingAudioByBasename(name)
            : undefined;
          const nextApprox = approximateReadTime
            ? (approximateReadTime.startsWith('~') ? approximateReadTime : `~${approximateReadTime}`)
            : undefined;
          const nowMs = Date.now();
          const nowIso = new Date(nowMs).toISOString();

          upsertMediaCatalogFile({
            name,
            path: path || name,
            size: size || '0.01 MB',
            duration: '',
            mtimeMs: nowMs,
            modifiedTime: nowIso,
          });
          setLocalSavedMediaFiles(prev => {
            const next = [
              { name, path: path || name, size: size || '0.01 MB', mtimeMs: nowMs, modifiedTime: nowIso },
              ...prev.filter(f => f.name.toLowerCase() !== name.toLowerCase())
            ];
            if (pairedBackupAudioFile && !next.some(f => f.name.toLowerCase() === pairedBackupAudioFile.toLowerCase())) {
              const cachedBackup = availableFilesCache.get(pairedBackupAudioFile);
              next.push({
                name: pairedBackupAudioFile,
                path: cachedBackup?.path || pairedBackupAudioFile,
                size: cachedBackup?.size || '0.1 MB',
                mtimeMs: cachedBackup?.mtimeMs || nowMs,
                modifiedTime: cachedBackup?.modifiedTime || nowIso
              });
            }
            return next;
          });

          if (onRefresh && !editingId && !editingShowId) {
            Promise.resolve(onRefresh()).catch(() => {});
          }
          setFileManagerRefreshTrigger(prev => prev + 1);
          if (viewMode === 'files' && !editingId) {
            setFileManagerReturnFocusFile(name);
          }

          // If user split to a new filename and explicitly chose to keep the original file in the slot, stop here
          if (isSplitFromExisting && !shouldAdopt) {
            if (copyEditorState.fromPicker) {
              setPickerHighlightedFileName(name);
            }
            return;
          }

          if (copyEditorState.fromPicker) {
            if (wasCopyingInPicker) {
              // User clicked Copy on an item inside Choose/Replace Announcement: keep modal open showing and selecting the newly created copy
              setPickerHighlightedFileName(name);
              return;
            }
            if (!wasEditingExistingInPicker || isSplitFromExisting) {
              setPickerExternalConfirmSelection({
                file: { name, path, size },
                options: {
                  pairedBackupAudioFile: resolvedBackup,
                  doNotAttachBackup,
                  approximateReadTime: nextApprox,
                  isAutoReadTime: nextIsAutoReadTime
                }
              });
            } else {
              // Edited an existing file in-place while MediaPickerModal was open: sync metadata on any slots using this file
              const nameLower = name.toLowerCase();
              setFormData(prev => {
                const list = prev.timeGatedMp3s || [];
                const updated = list.map(m => ({
                  ...m,
                  mediaItems: getGateMediaItems(m).map(mi =>
                    getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === nameLower
                      ? {
                          ...mi,
                          approximateReadTime: nextApprox || mi.approximateReadTime,
                          isAutoReadTime: nextIsAutoReadTime,
                          ...(resolvedBackup && !mi.backupMp3Url ? { backupMp3Url: resolvedBackup } : {})
                        }
                      : mi
                  )
                }));
                return {
                  ...prev,
                  timeGatedMp3s: updated
                };
              });
            }
          } else if (!editingId && targetAnnouncementId) {
            // Opened from Active / Inactive Announcements list card Preview -> Edit / Copy / SPLIT
            const targetAnn = announcements.find(a => a.id === targetAnnouncementId);
            if (targetAnn) {
              const oldLower = (
                copyEditorState.initialFileName ||
                copyEditorState.sourceFileToCopy ||
                ''
              ).toLowerCase();
              const sortedTargetGates = sortMp3sByStartDate(targetAnn.timeGatedMp3s || []);
              let detectedPlayedReplace: { priorFileName: string; playCount: number } | null = null;
              sortedTargetGates.forEach((m, gIdx) => {
                const matchesGate =
                  (targetGateId && m.id === targetGateId) ||
                  (targetGateIndex !== undefined && gIdx === targetGateIndex);
                if (!matchesGate) return;
                const items = getGateMediaItems(m);
                items.forEach((mi, iIdx) => {
                  const matchesItem =
                    targetItemIndex !== undefined ? iIdx === targetItemIndex : iIdx === 0;
                  if (!matchesItem) return;
                  const oldNameLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
                  const newNameLower = getFilenameFromUrlOrPath(name).toLowerCase();
                  if (oldNameLower && oldNameLower !== newNameLower) {
                    const plays = calculateGatedTrackAudit(targetAnn.id || '', mi.mp3Url || '', logs, {
                      gate: m,
                      announcement: targetAnn,
                      itemIndex: iIdx,
                      referenceNow: now,
                    }).totalPlays;
                    if (plays > 0) {
                      detectedPlayedReplace = {
                        priorFileName: getFilenameFromUrlOrPath(mi.mp3Url || ''),
                        playCount: plays,
                      };
                    }
                  }
                });
              });

              const applyTargetAnnSave = async () => {
                let updatedGateIdx = targetGateIndex ?? 0;
                let updatedItemIdx = targetItemIndex ?? 0;

                const updatedMp3s = sortedTargetGates.map((m, gIdx) => {
                  const items = getGateMediaItems(m);
                  const matchesGate =
                    (targetGateId && m.id === targetGateId) ||
                    (targetGateIndex !== undefined && gIdx === targetGateIndex);

                  if (matchesGate) {
                    updatedGateIdx = gIdx;
                    const nextMediaItems: TimeGatedMediaItem[] = [];
                    items.forEach((mi, iIdx) => {
                      const matchesItem =
                        targetItemIndex !== undefined ? iIdx === targetItemIndex : iIdx === 0;
                      if (!matchesItem) {
                        nextMediaItems.push(mi);
                        return;
                      }
                      const oldNameLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
                      const newNameLower = getFilenameFromUrlOrPath(name).toLowerCase();
                      const existingPlays =
                        oldNameLower && oldNameLower !== newNameLower
                          ? calculateGatedTrackAudit(targetAnn.id || '', mi.mp3Url || '', logs, {
                              gate: m,
                              announcement: targetAnn,
                              itemIndex: iIdx,
                              referenceNow: now,
                            }).totalPlays
                          : 0;
                      if (existingPlays > 0) {
                        nextMediaItems.push({
                          ...mi,
                          inactivated: true,
                          inactivatedAt: getCurrentDatetimeLocal(),
                        });
                      }
                      updatedItemIdx = nextMediaItems.length;
                      nextMediaItems.push({
                        ...mi,
                        mp3Url: name,
                        assetType: classifyMediaAsset(name, 'script'),
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        isAutoReadTime: nextIsAutoReadTime,
                        inactivated: undefined,
                        inactivatedAt: undefined,
                        ...(resolvedBackup &&
                        (!mi.backupMp3Url || Boolean(copyEditorState.sourceFileToCopy) || isSplitFromExisting)
                          ? { backupMp3Url: resolvedBackup }
                          : {}),
                      });
                    });
                    return {
                      ...m,
                      mediaItems: nextMediaItems,
                    };
                  }

                  if (!targetGateId && targetGateIndex === undefined && oldLower) {
                    return {
                      ...m,
                      mediaItems: items.map((mi, iIdx) => {
                        if (getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === oldLower) {
                          updatedGateIdx = gIdx;
                          updatedItemIdx = iIdx;
                          return {
                            ...mi,
                            mp3Url: name,
                            assetType: classifyMediaAsset(name, 'script'),
                            approximateReadTime: nextApprox || mi.approximateReadTime,
                            isAutoReadTime: nextIsAutoReadTime,
                            ...(resolvedBackup &&
                            (!mi.backupMp3Url || Boolean(copyEditorState.sourceFileToCopy) || isSplitFromExisting)
                              ? { backupMp3Url: resolvedBackup }
                              : {})
                          };
                        }
                        return mi;
                      })
                    };
                  }

                  return m;
                });

                const nowModified = new Date().toISOString();
                const updatedAnn: Announcement = normalizeAnnouncement({
                  ...targetAnn,
                  timeGatedMp3s: updatedMp3s,
                  metadata: {
                    ...(targetAnn.metadata || {
                      createdBy: 'Admin',
                      createdDate: nowModified,
                      lastModifiedBy: 'Admin',
                      lastModifiedDate: nowModified
                    }),
                    lastModifiedDate: nowModified
                  }
                });

                const nextAnnouncements = normalizeAnnouncements(
                  announcements.map(a => (a.id === targetAnn.id ? updatedAnn : a))
                );
                setSelectedListMediaByAnnId(prev => ({
                  ...prev,
                  [targetAnn.id]: `${updatedGateIdx}-${updatedItemIdx}`
                }));
                await onSave(nextAnnouncements);
              };

              if (detectedPlayedReplace) {
                const info = detectedPlayedReplace as { priorFileName: string; playCount: number };
                setDirectReplacePlayedConfirm({
                  priorFileName: info.priorFileName,
                  newFileName: name,
                  playCount: info.playCount,
                  onConfirm: applyTargetAnnSave,
                });
              } else {
                await applyTargetAnnSave();
              }
            }
          } else if (targetGateId || targetGateIndex !== undefined) {
            let detectedPlayedReplace: { priorFileName: string; playCount: number } | null = null;
            const currentGatesSnapshot = formData.timeGatedMp3s || [];
            currentGatesSnapshot.forEach((m, gIdx) => {
              const matchesGate =
                (targetGateId && m.id === targetGateId) ||
                (targetGateIndex !== undefined && gIdx === targetGateIndex);
              if (!matchesGate) return;
              const items = getGateMediaItems(m);
              if (targetItemIndex !== undefined && targetItemIndex >= items.length) return;
              items.forEach((mi, idx) => {
                const matchesItem =
                  targetItemIndex !== undefined ? idx === targetItemIndex : idx === 0;
                if (!matchesItem) return;
                const oldNameLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
                const newNameLower = getFilenameFromUrlOrPath(name).toLowerCase();
                if (oldNameLower && oldNameLower !== newNameLower) {
                  const plays = calculateGatedTrackAudit(
                    editingId || formData.id || '',
                    mi.mp3Url || '',
                    logs,
                    {
                      gate: m,
                      announcement: formData,
                      itemIndex: idx,
                      referenceNow: now,
                    }
                  ).totalPlays;
                  if (plays > 0) {
                    detectedPlayedReplace = {
                      priorFileName: getFilenameFromUrlOrPath(mi.mp3Url || ''),
                      playCount: plays,
                    };
                  }
                }
              });
            });

            const applyFormDataGateSave = () => {
              setFormData(prev => {
                const current = prev.timeGatedMp3s || [];
                const updated = current.map((m, gIdx) => {
                  const items = getGateMediaItems(m);
                  const matchesGate =
                    (targetGateId && m.id === targetGateId) ||
                    (targetGateIndex !== undefined && gIdx === targetGateIndex);
                  if (!matchesGate) {
                    // If edited in-place (not split or copied), sync read time on other slots sharing the same file
                    if (!isSplitFromExisting && !copyEditorState.sourceFileToCopy && copyEditorState.initialFileName) {
                      const sameLower = getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase();
                      return {
                        ...m,
                        mediaItems: items.map(mi =>
                          getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === sameLower
                            ? {
                                ...mi,
                                approximateReadTime: nextApprox || mi.approximateReadTime,
                                isAutoReadTime: nextIsAutoReadTime,
                                ...(resolvedBackup && !mi.backupMp3Url ? { backupMp3Url: resolvedBackup } : {})
                              }
                            : mi
                        )
                      };
                    }
                    return m;
                  }
                  if (targetItemIndex !== undefined && targetItemIndex >= items.length) {
                    return {
                      ...m,
                      mediaItems: [
                        ...items.filter(mi => Boolean(mi.mp3Url && mi.mp3Url.trim() !== '') || Boolean(mi.inactivated)),
                        {
                          mp3Url: name,
                          assetType: classifyMediaAsset(name, 'script'),
                          approximateReadTime: nextApprox,
                          isAutoReadTime: nextIsAutoReadTime,
                          ...(resolvedBackup ? { backupMp3Url: resolvedBackup } : {})
                        }
                      ]
                    };
                  }
                  const nextMediaItems: TimeGatedMediaItem[] = [];
                  items.forEach((mi, idx) => {
                    const matchesItem =
                      targetItemIndex !== undefined ? idx === targetItemIndex : idx === 0;
                    if (matchesItem) {
                      const oldNameLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
                      const newNameLower = getFilenameFromUrlOrPath(name).toLowerCase();
                      const existingPlays =
                        oldNameLower && oldNameLower !== newNameLower
                          ? calculateGatedTrackAudit(editingId || prev.id || '', mi.mp3Url || '', logs, {
                              gate: m,
                              announcement: prev,
                              itemIndex: idx,
                              referenceNow: now,
                            }).totalPlays
                          : 0;
                      if (existingPlays > 0) {
                        nextMediaItems.push({
                          ...mi,
                          inactivated: true,
                          inactivatedAt: getCurrentDatetimeLocal(),
                        });
                      }
                      nextMediaItems.push({
                        ...mi,
                        mp3Url: name,
                        assetType: classifyMediaAsset(name, 'script'),
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        isAutoReadTime: nextIsAutoReadTime,
                        inactivated: undefined,
                        inactivatedAt: undefined,
                        ...(resolvedBackup &&
                        (!mi.backupMp3Url || Boolean(copyEditorState.sourceFileToCopy) || isSplitFromExisting)
                          ? { backupMp3Url: resolvedBackup }
                          : {}),
                      });
                      return;
                    }
                    // If edited in-place, sync read time on sibling items sharing the same file
                    if (
                      !isSplitFromExisting &&
                      !copyEditorState.sourceFileToCopy &&
                      copyEditorState.initialFileName &&
                      getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() ===
                        getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase()
                    ) {
                      nextMediaItems.push({
                        ...mi,
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        isAutoReadTime: nextIsAutoReadTime,
                        ...(resolvedBackup && !mi.backupMp3Url ? { backupMp3Url: resolvedBackup } : {}),
                      });
                      return;
                    }
                    nextMediaItems.push(mi);
                  });
                  return {
                    ...m,
                    mediaItems: nextMediaItems,
                  };
                });
                const sorted = sortMp3sByStartDate(updated);
                return {
                  ...prev,
                  timeGatedMp3s: sorted
                };
              });
            };

            if (detectedPlayedReplace) {
              const info = detectedPlayedReplace as { priorFileName: string; playCount: number };
              setDirectReplacePlayedConfirm({
                priorFileName: info.priorFileName,
                newFileName: name,
                playCount: info.playCount,
                onConfirm: applyFormDataGateSave,
              });
            } else {
              applyFormDataGateSave();
            }
          } else if (copyEditorState.initialFileName) {
            const oldLower = getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase();
            setFormData(prev => {
              const current = prev.timeGatedMp3s || [];
              const updated = current.map(m => ({
                ...m,
                mediaItems: getGateMediaItems(m).map(mi =>
                  getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === oldLower
                    ? {
                        ...mi,
                        mp3Url: name,
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        isAutoReadTime: nextIsAutoReadTime,
                        ...(resolvedBackup && (!mi.backupMp3Url || isSplitFromExisting)
                          ? { backupMp3Url: resolvedBackup }
                          : {})
                      }
                    : mi
                )
              }));
              return {
                ...prev,
                timeGatedMp3s: updated
              };
            });
          }
        }}
      />

      {/* Confirmation Popup When Replacing a Played Media Item Directly From CopyEditorModal (Edge Case 5) */}
      {directReplacePlayedConfirm && (
        <div
          className="fixed inset-0 z-[195] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setDirectReplacePlayedConfirm(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                  Replace Played Media
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setDirectReplacePlayedConfirm(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Cancel"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900">
                Replace &quot;{directReplacePlayedConfirm.priorFileName}&quot; with &quot;
                {directReplacePlayedConfirm.newFileName}&quot;?
              </p>
              <p className="font-medium text-slate-600">
                &quot;{directReplacePlayedConfirm.priorFileName}&quot; has{' '}
                <strong className="text-slate-900">
                  {directReplacePlayedConfirm.playCount}{' '}
                  {directReplacePlayedConfirm.playCount === 1 ? 'logged play' : 'logged plays'}
                </strong>{' '}
                and will be moved to the{' '}
                <strong className="text-slate-900">Past / Inactivated Media</strong> section of this
                gate so its broadcast history is preserved.
              </p>
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDirectReplacePlayedConfirm(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirmFn = directReplacePlayedConfirm.onConfirm;
                  setDirectReplacePlayedConfirm(null);
                  await confirmFn();
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Confirm &amp; Replace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      <DeleteAnnouncementModal
        isOpen={!!deleteConfirmId}
        announcementName={
          announcements.find(s => s.id === deleteConfirmId)?.name ||
          (editingId === deleteConfirmId ? formData.name : undefined)
        }
        isSaving={isSavingAnnouncement}
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={async () => {
          const targetId = deleteConfirmId;
          setDeleteConfirmId(null);
          if (targetId) {
            await deleteAnnouncement(targetId);
          }
        }}
      />

      {/* Delete Show Confirmation Modal Overlay */}
      <DeleteShowModal
        isOpen={!!deleteShowConfirmId}
        showName={
          shows.find(s => s.id === deleteShowConfirmId)?.name ||
          (editingShowId === deleteShowConfirmId ? showFormData.name : undefined)
        }
        isSaving={isSavingShow}
        onCancel={() => setDeleteShowConfirmId(null)}
        onConfirm={async () => {
          if (deleteShowConfirmId) {
            await confirmDeleteShow(deleteShowConfirmId);
          }
        }}
      />

      {/* Cancel Unsaved Changes Confirmation Modal Overlay */}
      <CancelUnsavedModal
        isOpen={showCancelConfirm}
        onKeepEditing={() => setShowCancelConfirm(false)}
        onDiscard={() => {
          setShowCancelConfirm(false);
          setEditingId(null);
          if (!finishReturnToFileManager() && openedFromAudit) {
            setOpenedFromAudit(false);
            setIsScheduleAuditOpen(true);
          }
        }}
      />

      {/* Inactivate Without End Date Prompt Modal Overlay */}
      <InactivateEndDateModal
        modalState={
          inactivateEndModal
            ? { endDate: inactivateEndModal.date, endTime: inactivateEndModal.time || '00:00' }
            : null
        }
        isSaving={isSavingAnnouncement}
        onUpdate={({ endDate, endTime }) =>
          setInactivateEndModal((prev) =>
            prev
              ? {
                  date: endDate !== undefined ? endDate : prev.date,
                  time: endTime !== undefined ? endTime : prev.time,
                }
              : null
          )
        }
        onCancel={() => setInactivateEndModal(null)}
        onSave={async () => {
          if (!inactivateEndModal?.date) return;
          const combined = `${inactivateEndModal.date}T${inactivateEndModal.time || '00:00'}`;
          setFormData((prev) => ({ ...prev, endDate: combined }));
          setInactivateEndModal(null);
          await saveEdit(combined);
        }}
      />

      {/* Calendar Show Details Modal Overlay */}
      <ShowDetailsModal
        show={selectedCalendarShow}
        onClose={() => setSelectedCalendarShow(null)}
        onEditShow={(s) => {
          setSelectedCalendarShow(null);
          startEditShow(s);
        }}
        onMessageShow={(s) => {
          setSelectedCalendarShow(null);
          createNewMessage(s.id);
        }}
        onViewMessagesForShow={(s) => {
          setSelectedCalendarShow(null);
          setViewingMessagesForShow(s);
        }}
        activeMessagesCount={
          selectedCalendarShow ? activeMessagesCountByShowId[selectedCalendarShow.id] || 0 : 0
        }
      />

      <ShowMessagesShortlistModal
        isOpen={Boolean(viewingMessagesForShow)}
        show={viewingMessagesForShow}
        messages={adminMessages}
        shows={shows}
        now={now}
        onClose={() => setViewingMessagesForShow(null)}
        onCreateMessageForShow={(sh) => {
          createNewMessage(sh.id);
        }}
        onPreviewMessage={(msg, sh) => {
          setPreviewingAdminMessageShow(sh);
          setPreviewingAdminMessage(msg);
        }}
        onEditMessage={(msg) => {
          setReuseSourceAdminMessage(null);
          setEditingAdminMessage(msg);
          setMessageInitialShowId(undefined);
          setIsMessageEditorOpen(true);
        }}
        onReuseMessage={handleReuseAdminMessage}
        onArchiveMessage={handleArchiveAdminMessage}
        onRestoreMessage={handleRestoreAdminMessage}
      />

      <AdminMessageEditorModal
        isOpen={isMessageEditorOpen}
        editingMessage={editingAdminMessage}
        reuseSourceMessage={reuseSourceAdminMessage}
        initialTargetShowId={messageInitialShowId}
        shows={shows}
        isSaving={isSavingAdminMessage}
        onClose={() => {
          setIsMessageEditorOpen(false);
          setEditingAdminMessage(null);
          setReuseSourceAdminMessage(null);
          setMessageInitialShowId(undefined);
        }}
        onSave={handleSaveAdminMessage}
      />

      <AdminMessageReaderModal
        isOpen={Boolean(previewingAdminMessage)}
        message={previewingAdminMessage}
        show={previewingAdminMessageShow}
        isPreview={true}
        onClose={() => {
          setPreviewingAdminMessage(null);
          setPreviewingAdminMessageShow(null);
        }}
      />

      {previewScriptFile && (
        <div id="preview-script-modal-backdrop" className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-[135] animate-in fade-in duration-150">
          <LiveReadPopout
            initialFileName={previewScriptFile}
            sourceBucket={previewScriptBucket}
            initialAnnouncementName={
              isUpNextPromoUrl(previewScriptFile)
                ? formatUpNextPromoFilename(previewScriptFile)
                : 'File Preview'
            }
            backupMp3Url={previewScriptBackupUrl}
            isOverlay={true}
            isPreview={true}
            onEditScript={
              /\.(txt|md)$/i.test(previewScriptFile) && !previewScriptFile.startsWith('__up_next_promo__:')
                ? (fileName) => {
                    const cleanName = getFilenameFromUrlOrPath(fileName);
                    const originAnn =
                      !editingId && previewScriptOrigin?.announcementId
                        ? announcements.find(a => a.id === previewScriptOrigin.announcementId)
                        : null;
                    const sourceGates = editingId
                      ? formData.timeGatedMp3s || []
                      : sortMp3sByStartDate(originAnn?.timeGatedMp3s || []);
                    const originGate =
                      (previewScriptOrigin?.gateId
                        ? sourceGates.find(g => g.id === previewScriptOrigin.gateId)
                        : undefined) ||
                      (previewScriptOrigin?.gateIndex !== undefined
                        ? sourceGates[previewScriptOrigin.gateIndex]
                        : undefined);
                    const originItem =
                      originGate && previewScriptOrigin?.itemIndex !== undefined
                        ? getGateMediaItems(originGate)[previewScriptOrigin.itemIndex]
                        : undefined;
                    const allItems = sourceGates.flatMap(m => getGateMediaItems(m));
                    const matchingItem =
                      originItem ||
                      allItems.find(
                        mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === cleanName.toLowerCase()
                      );
                    const originSnap = previewScriptOrigin;
                    const bucketSnap = previewScriptBucket;
                    const backupSnap = previewScriptBackupUrl || matchingItem?.backupMp3Url;
                    setPreviewScriptFile(null);
                    setPreviewScriptBucket(undefined);
                    setPreviewScriptBackupUrl(undefined);
                    setPreviewScriptOrigin(null);
                    setCopyEditorState({
                      isOpen: true,
                      initialFileName: cleanName,
                      sourceFileToCopy: undefined,
                      sourceBucket: bucketSnap,
                      initialReadTime: matchingItem?.approximateReadTime,
                      initialIsAutoReadTime: matchingItem?.isAutoReadTime,
                      initialBackupMp3Url: backupSnap,
                      targetGateId: originSnap?.gateId || null,
                      targetGateIndex: originSnap?.gateIndex,
                      targetItemIndex: originSnap?.itemIndex,
                      targetAnnouncementId: originSnap?.announcementId || editingId || null,
                      fromPicker: previewScriptFromPicker
                    });
                  }
                : undefined
            }
            onCopyScript={
              /\.(txt|md)$/i.test(previewScriptFile) && !previewScriptFile.startsWith('__up_next_promo__:')
                ? (fileName) => {
                    const cleanName = getFilenameFromUrlOrPath(fileName);
                    const originAnn =
                      !editingId && previewScriptOrigin?.announcementId
                        ? announcements.find(a => a.id === previewScriptOrigin.announcementId)
                        : null;
                    const sourceGates = editingId
                      ? formData.timeGatedMp3s || []
                      : sortMp3sByStartDate(originAnn?.timeGatedMp3s || []);
                    const originGate =
                      (previewScriptOrigin?.gateId
                        ? sourceGates.find(g => g.id === previewScriptOrigin.gateId)
                        : undefined) ||
                      (previewScriptOrigin?.gateIndex !== undefined
                        ? sourceGates[previewScriptOrigin.gateIndex]
                        : undefined);
                    const originItem =
                      originGate && previewScriptOrigin?.itemIndex !== undefined
                        ? getGateMediaItems(originGate)[previewScriptOrigin.itemIndex]
                        : undefined;
                    const allItems = sourceGates.flatMap(m => getGateMediaItems(m));
                    const matchingItem =
                      originItem ||
                      allItems.find(
                        mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === cleanName.toLowerCase()
                      );
                    const originSnap = previewScriptOrigin;
                    const bucketSnap = previewScriptBucket;
                    const backupSnap = previewScriptBackupUrl || matchingItem?.backupMp3Url;
                    setPreviewScriptFile(null);
                    setPreviewScriptBucket(undefined);
                    setPreviewScriptBackupUrl(undefined);
                    setPreviewScriptOrigin(null);
                    setCopyEditorState({
                      isOpen: true,
                      initialFileName: undefined,
                      sourceFileToCopy: cleanName,
                      sourceBucket: bucketSnap,
                      initialReadTime: matchingItem?.approximateReadTime,
                      initialIsAutoReadTime: matchingItem?.isAutoReadTime,
                      initialBackupMp3Url: backupSnap,
                      targetGateId: originSnap?.gateId || null,
                      targetGateIndex: originSnap?.gateIndex,
                      targetItemIndex: originSnap?.itemIndex,
                      targetAnnouncementId: originSnap?.announcementId || editingId || null,
                      fromPicker: previewScriptFromPicker
                    });
                  }
                : undefined
            }
            onClose={() => {
              setPreviewScriptFile(null);
              setPreviewScriptBucket(undefined);
              setPreviewScriptBackupUrl(undefined);
              setPreviewScriptOrigin(null);
              setPreviewScriptFromPicker(false);
            }}
          />
        </div>
      )}

       {/* Announcement Conflict Confirmation Dialog */}
      <AnnouncementConflictModal
        pendingSaveAnnouncement={pendingSaveAnnouncement}
        isSaving={isSavingAnnouncement}
        onContinueEditing={() => setPendingSaveAnnouncement(null)}
        onSaveAnyway={async () => {
          if (!pendingSaveAnnouncement) return;
          setIsSavingAnnouncement(true);
          try {
            const res = await onSave(pendingSaveAnnouncement.updatedList);
            if (res !== false) {
              setEditingId(null);
              setPendingSaveAnnouncement(null);
              if (!finishReturnToFileManager() && openedFromAudit) {
                setOpenedFromAudit(false);
                setIsScheduleAuditOpen(true);
              }
            }
          } finally {
            setIsSavingAnnouncement(false);
          }
        }}
      />

      {/* Gate Data On-Save Validation Modal (Hard Blocking Errors vs. Soft Warnings) */}
      {saveValidationState && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/60"
          onClick={() => {
            setSaveValidationState(null);
            setSaveValidationOverrideEndDate(undefined);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {saveValidationState.blockingErrors.length > 0 ? (
              <div className="p-3.5 px-4 bg-red-50 border-b border-red-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-red-600 p-1.5 rounded text-white shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-red-950 uppercase tracking-widest leading-none">
                      Cannot Save — Gate Errors
                    </h4>
                    <p className="text-xs font-bold text-red-800 truncate mt-1">
                      Fix required errors before saving
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSaveValidationState(null);
                    setSaveValidationOverrideEndDate(undefined);
                  }}
                  className="text-red-700 hover:text-red-950 cursor-pointer p-1"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                      Gate Schedule Warnings
                    </h4>
                    <p className="text-xs font-bold text-amber-800 truncate mt-1">
                      Review before saving or continue anyway
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSaveValidationState(null);
                    setSaveValidationOverrideEndDate(undefined);
                  }}
                  className="text-amber-700 hover:text-amber-950 cursor-pointer p-1"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="p-4 space-y-3 text-xs text-slate-700 max-h-[300px] overflow-y-auto custom-scrollbar">
              {saveValidationState.blockingErrors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-bold text-red-900">
                    Must be fixed before saving:
                  </p>
                  <ul className="space-y-1.5">
                    {saveValidationState.blockingErrors.map((msg, i) => (
                      <li
                        key={`err-${i}`}
                        className="flex items-start gap-1.5 p-2 rounded bg-red-50/80 border border-red-200 text-red-950 font-bold"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {saveValidationState.softWarnings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-bold text-slate-800">
                    {saveValidationState.blockingErrors.length > 0
                      ? 'Additional schedule warnings:'
                      : 'One or more Announcement Gates have schedule warnings:'}
                  </p>
                  <ul className="space-y-1.5">
                    {saveValidationState.softWarnings.map((msg, i) => (
                      <li
                        key={`warn-${i}`}
                        className="flex items-start gap-1.5 p-2 rounded bg-amber-50/70 border border-amber-200 text-amber-950 font-bold"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>{msg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              {saveValidationState.blockingErrors.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const overrideEnd = saveValidationOverrideEndDate;
                    setSaveValidationState(null);
                    setSaveValidationOverrideEndDate(undefined);
                    saveEdit(overrideEnd, true);
                  }}
                  className="px-3.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Save Anyway
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setSaveValidationState(null);
                  setSaveValidationOverrideEndDate(undefined);
                  setFocusBottomProblemGateNonce(prev => prev + 1);
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Return to Editor to Fix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Overlap Confirmation Dialog */}
      <ShowOverlapModal
        pendingSaveShow={pendingSaveShow}
        isSaving={isSavingShow}
        onContinueEditing={() => setPendingSaveShow(null)}
        onSaveAnyway={async () => {
          if (!pendingSaveShow || !onSaveShows) return;
          setIsSavingShow(true);
          try {
            const res = await onSaveShows(pendingSaveShow.updatedList);
            if (res !== false) {
              setEditingShowId(null);
              setPendingSaveShow(null);
            }
          } finally {
            setIsSavingShow(false);
          }
        }}
      />

      {/* Issues Audit Modal */}
      <ScheduleAuditModal
        isOpen={isScheduleAuditOpen}
        onClose={() => setIsScheduleAuditOpen(false)}
        announcements={announcements}
        shows={shows}
        now={now}
        defaultStartDate={visibleCalendarDays.length > 0 ? visibleCalendarDays[0] : calendarDate}
        defaultEndDate={visibleCalendarDays.length > 0 ? visibleCalendarDays[visibleCalendarDays.length - 1] : calendarDate}
        onLocateInCalendar={handleLocateScheduleIssue}
      />

      {/* Folder Verification Progress & Results Modal */}
      {folderCheckModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-[95%] max-w-[95vw] overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {folderCheckModal.isRunning ? (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                ) : folderCheckModal.hasError ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  Folder Verification
                </h3>
              </div>
              <button
                type="button"
                disabled={folderCheckModal.isRunning}
                onClick={() => setFolderCheckModal(null)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="bg-slate-900 text-slate-100 rounded-lg border border-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsReadoutCollapsed(prev => !prev)}
                  className="w-full px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 border-b border-slate-800 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300 cursor-pointer select-none"
                >
                  <span>Verification Log ({folderCheckModal.lines.length})</span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <span>{isReadoutCollapsed ? 'Expand' : 'Collapse'}</span>
                    {isReadoutCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5" />
                    )}
                  </span>
                </button>
                {!isReadoutCollapsed && (
                  <div
                    className={cn(
                      'p-3 font-mono text-xs space-y-1.5 leading-relaxed overflow-y-auto custom-scrollbar',
                      folderCheckModal.extraFolders.length > 0 ? 'max-h-36' : 'max-h-64'
                    )}
                  >
                    {folderCheckModal.lines.map((line, idx) => {
                      const isError = line.startsWith('[Error]') || line.startsWith('[Warning]');
                      const isFixed = line.startsWith('[Fixed]');
                      const isNotice =
                        line.startsWith('[Notice]') ||
                        line.startsWith('  media_evergreens/') ||
                        line.startsWith('  media_shows/');
                      const isOk =
                        line.startsWith('[Validated]') ||
                        line.startsWith('[OK]') ||
                        line.startsWith('[Complete]');
                      return (
                        <div
                          key={idx}
                          className={cn(
                            'break-words',
                            isError
                              ? 'text-rose-300 font-semibold'
                              : isFixed
                                ? 'text-amber-300 font-semibold'
                                : isNotice
                                  ? 'text-sky-300 font-semibold'
                                  : isOk
                                    ? 'text-emerald-300'
                                    : 'text-slate-300'
                          )}
                        >
                          {line}
                        </div>
                      );
                    })}
                    {folderCheckModal.isRunning && (
                      <div className="text-blue-300 flex items-center gap-2 pt-1">
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                        <span>Running folder checks...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!folderCheckModal.isRunning &&
                folderCheckModal.extraFolders.length > 0 &&
                sortedActiveShowsWithShortName.length > 0 && (
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-900">
                        Merge Stranded Folder into Show
                      </span>
                      <span
                        title="Moves non-duplicate files into the selected destination show folder and removes the empty stranded folder."
                        className="text-sky-700 hover:text-sky-900 cursor-help inline-flex items-center"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-end">
                      {/* Left / Top: Stranded Folder */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="min-h-[26px] flex items-center">
                          <label className="text-[11px] font-bold uppercase text-slate-600 block">
                            Stranded Folder ({folderCheckModal.extraFolders.length})
                          </label>
                        </div>
                        <div
                          role="listbox"
                          aria-label="Stranded Folder"
                          className="h-[130px] overflow-y-auto bg-white border border-slate-300 rounded divide-y divide-slate-100 custom-scrollbar"
                        >
                          {folderCheckModal.extraFolders.map(ef => {
                            const key = `${ef.category}/${ef.name}`;
                            const isSelected = selectedStrandedKey === key;
                            const isShowsCat = ef.category === 'media_shows';
                            const stat = folderCheckModal.subfolderStats?.[key];
                            const fileCount = typeof stat?.fileCount === 'number' ? stat.fileCount : 0;
                            const countText = `(${fileCount} ${fileCount === 1 ? 'file' : 'files'})`;
                            const canPreviewFolder = isShowsCat
                              ? Boolean(onOpenShowsFolder)
                              : Boolean(onOpenEvergreensFolder);
                            const handlePreviewStrandedFolder = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (isShowsCat && onOpenShowsFolder) {
                                const fallbackLocal =
                                  folderCheckModal.playlistsPath &&
                                  !folderCheckModal.playlistsPath.startsWith('Google Drive:')
                                    ? `${folderCheckModal.playlistsPath.replace(/[\\/]+$/, '')}/${ef.name}`
                                    : undefined;
                                onOpenShowsFolder(
                                  stat?.localPath || fallbackLocal,
                                  stat?.driveFolderId || folderCheckModal.playlistsFolderId
                                );
                              } else if (!isShowsCat && onOpenEvergreensFolder) {
                                const fallbackLocal =
                                  folderCheckModal.evergreensPath &&
                                  !folderCheckModal.evergreensPath.startsWith('Google Drive:')
                                    ? `${folderCheckModal.evergreensPath.replace(/[\\/]+$/, '')}/${ef.name}`
                                    : undefined;
                                onOpenEvergreensFolder(
                                  stat?.localPath || fallbackLocal,
                                  stat?.driveFolderId || folderCheckModal.evergreensFolderId
                                );
                              }
                            };
                            return (
                              <div
                                key={key}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  if (!isMergingStranded) {
                                    handleSelectStrandedItem(ef);
                                  }
                                }}
                                className={cn(
                                  'w-full px-2 py-1 text-left text-xs flex items-center justify-between gap-1.5 cursor-pointer select-none',
                                  isSelected
                                    ? isShowsCat
                                      ? 'bg-amber-600 text-white font-bold'
                                      : 'bg-emerald-600 text-white font-bold'
                                    : isShowsCat
                                      ? 'text-amber-950 bg-amber-50/40 hover:bg-amber-100/70 font-medium'
                                      : 'text-emerald-950 bg-emerald-50/40 hover:bg-emerald-100/70 font-medium'
                                )}
                                title={`${key} ${countText}`}
                              >
                                <span className="font-mono truncate min-w-0 flex-1">
                                  {key}{' '}
                                  <span
                                    className={cn(
                                      'font-sans text-[11px]',
                                      isSelected
                                        ? isShowsCat
                                          ? 'text-amber-100'
                                          : 'text-emerald-100'
                                        : isShowsCat
                                          ? 'text-amber-700'
                                          : 'text-emerald-700'
                                    )}
                                  >
                                    {countText}
                                  </span>
                                </span>
                                {canPreviewFolder && (
                                  <button
                                    type="button"
                                    onClick={handlePreviewStrandedFolder}
                                    className={cn(
                                      'p-1 rounded border shrink-0 inline-flex items-center justify-center cursor-pointer',
                                      isSelected
                                        ? isShowsCat
                                          ? 'bg-amber-700/80 hover:bg-amber-800 border-amber-400/60 text-white'
                                          : 'bg-emerald-700/80 hover:bg-emerald-800 border-emerald-400/60 text-white'
                                        : isShowsCat
                                          ? 'bg-white hover:bg-amber-100 border-amber-300 text-amber-700'
                                          : 'bg-white hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                                    )}
                                    title={`Open ${key}`}
                                    aria-label={`Open ${key}`}
                                  >
                                    <FolderOpen className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Middle Connector: Right Arrow button on wide screens; Down Arrow button + Merge button when stacked on narrow screens */}
                      <div className="hidden md:flex items-center justify-center h-[130px]">
                        <button
                          type="button"
                          disabled={
                            isMergingStranded ||
                            !selectedStrandedKey ||
                            !selectedMergeTargetShortName
                          }
                          onClick={() => setConfirmMergeStrandedOpen(true)}
                          className={cn(
                            'p-1.5 rounded border shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors',
                            mergeTargetCategory === 'media_shows'
                              ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                          )}
                          title="Merge into Folder..."
                          aria-label="Merge into Folder..."
                        >
                          <ArrowRight className="w-4 h-4 shrink-0" />
                        </button>
                      </div>

                      <div className="flex md:hidden items-center justify-center gap-2 py-1">
                        <button
                          type="button"
                          disabled={
                            isMergingStranded ||
                            !selectedStrandedKey ||
                            !selectedMergeTargetShortName
                          }
                          onClick={() => setConfirmMergeStrandedOpen(true)}
                          className={cn(
                            'p-1.5 rounded border shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors',
                            mergeTargetCategory === 'media_shows'
                              ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700'
                              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                          )}
                          title="Merge into Folder..."
                          aria-label="Merge into Folder..."
                        >
                          <ArrowDown className="w-4 h-4 shrink-0" />
                        </button>
                        {!confirmMergeStrandedOpen && (
                          <button
                            type="button"
                            disabled={
                              isMergingStranded ||
                              !selectedStrandedKey ||
                              !selectedMergeTargetShortName
                            }
                            onClick={() => setConfirmMergeStrandedOpen(true)}
                            className={cn(
                              'px-3 py-1.5 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50',
                              mergeTargetCategory === 'media_shows'
                                ? 'bg-amber-600 hover:bg-amber-700'
                                : 'bg-emerald-600 hover:bg-emerald-700'
                            )}
                          >
                            Merge into Folder...
                          </button>
                        )}
                      </div>

                      {/* Right / Bottom: Joined Shows/Evergreens Radio Control always placed just over Target Show Folder */}
                      <div className="space-y-1.5 min-w-0">
                        <div className="min-h-[26px] flex flex-wrap items-center justify-between gap-2">
                          <label
                            className={cn(
                              'text-[11px] font-bold uppercase block truncate',
                              mergeTargetCategory === 'media_shows'
                                ? 'text-amber-800'
                                : 'text-emerald-800'
                            )}
                          >
                            Target Show Folder (
                            {mergeTargetCategory === 'media_shows' ? 'Shows' : 'Evergreens'})
                          </label>

                          <div className="flex items-center gap-1 shrink-0">
                            {onOpenShowsFolder && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenShowsFolder(
                                    folderCheckModal.playlistsPath &&
                                      !folderCheckModal.playlistsPath.startsWith('Google Drive:')
                                      ? folderCheckModal.playlistsPath
                                      : undefined,
                                    folderCheckModal.playlistsFolderId
                                  )
                                }
                                className="p-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 rounded cursor-pointer inline-flex items-center justify-center"
                                title="Open Shows Folder (media_shows)"
                                aria-label="Open Shows Folder (media_shows)"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                              </button>
                            )}

                            <div
                              role="radiogroup"
                              aria-label="Target Show Folder Category"
                              className="inline-flex bg-slate-200/80 p-0.5 rounded border border-slate-300"
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={mergeTargetCategory === 'media_shows'}
                                disabled={isMergingStranded}
                                onClick={() => {
                                  setMergeTargetCategory('media_shows');
                                  setConfirmMergeStrandedOpen(false);
                                }}
                                className={cn(
                                  'px-2.5 py-0.5 rounded-xs text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50',
                                  mergeTargetCategory === 'media_shows'
                                    ? 'bg-amber-600 text-white shadow-2xs'
                                    : 'text-amber-800 hover:bg-amber-50/80'
                                )}
                              >
                                Shows
                              </button>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={mergeTargetCategory === 'media_evergreens'}
                                disabled={isMergingStranded}
                                onClick={() => {
                                  setMergeTargetCategory('media_evergreens');
                                  setConfirmMergeStrandedOpen(false);
                                }}
                                className={cn(
                                  'px-2.5 py-0.5 rounded-xs text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50',
                                  mergeTargetCategory === 'media_evergreens'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-emerald-800 hover:bg-emerald-50/80'
                                )}
                              >
                                Evergreens
                              </button>
                            </div>

                            {onOpenEvergreensFolder && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenEvergreensFolder(
                                    folderCheckModal.evergreensPath &&
                                      !folderCheckModal.evergreensPath.startsWith('Google Drive:')
                                      ? folderCheckModal.evergreensPath
                                      : undefined,
                                    folderCheckModal.evergreensFolderId
                                  )
                                }
                                className="p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded cursor-pointer inline-flex items-center justify-center"
                                title="Open Evergreens Folder (media_evergreens)"
                                aria-label="Open Evergreens Folder (media_evergreens)"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          ref={mergeTargetListRef}
                          role="listbox"
                          aria-label="Target Show Folder"
                          className={cn(
                            'h-[130px] overflow-y-auto bg-white border rounded divide-y divide-slate-100 custom-scrollbar',
                            mergeTargetCategory === 'media_shows'
                              ? 'border-amber-300'
                              : 'border-emerald-300'
                          )}
                        >
                          {sortedActiveShowsWithShortName.map(s => {
                            const shortName = String(s.nameShort || '').trim();
                            const isSelected = selectedMergeTargetShortName === shortName;
                            const isShowsCat = mergeTargetCategory === 'media_shows';
                            const targetPath = `${mergeTargetCategory}/${shortName}`;
                            const stat = folderCheckModal.subfolderStats?.[targetPath];
                            const fileCount = typeof stat?.fileCount === 'number' ? stat.fileCount : 0;
                            const countText = `(${fileCount} ${fileCount === 1 ? 'file' : 'files'})`;
                            const canPreviewFolder = isShowsCat
                              ? Boolean(onOpenShowsFolder)
                              : Boolean(onOpenEvergreensFolder);
                            const handlePreviewTargetFolder = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (isShowsCat && onOpenShowsFolder) {
                                const fallbackLocal =
                                  folderCheckModal.playlistsPath &&
                                  !folderCheckModal.playlistsPath.startsWith('Google Drive:')
                                    ? `${folderCheckModal.playlistsPath.replace(/[\\/]+$/, '')}/${shortName}`
                                    : undefined;
                                onOpenShowsFolder(
                                  stat?.localPath || fallbackLocal,
                                  stat?.driveFolderId || folderCheckModal.playlistsFolderId
                                );
                              } else if (!isShowsCat && onOpenEvergreensFolder) {
                                const fallbackLocal =
                                  folderCheckModal.evergreensPath &&
                                  !folderCheckModal.evergreensPath.startsWith('Google Drive:')
                                    ? `${folderCheckModal.evergreensPath.replace(/[\\/]+$/, '')}/${shortName}`
                                    : undefined;
                                onOpenEvergreensFolder(
                                  stat?.localPath || fallbackLocal,
                                  stat?.driveFolderId || folderCheckModal.evergreensFolderId
                                );
                              }
                            };
                            return (
                              <div
                                key={s.id}
                                role="option"
                                aria-selected={isSelected}
                                data-target-short={shortName}
                                onClick={() => {
                                  if (!isMergingStranded) {
                                    setSelectedMergeTargetShortName(shortName);
                                    setConfirmMergeStrandedOpen(false);
                                  }
                                }}
                                className={cn(
                                  'w-full px-2 py-1 text-left text-xs flex items-center justify-between gap-1.5 cursor-pointer select-none',
                                  isSelected
                                    ? isShowsCat
                                      ? 'bg-amber-600 text-white font-bold'
                                      : 'bg-emerald-600 text-white font-bold'
                                    : isShowsCat
                                      ? 'text-amber-950 bg-amber-50/30 hover:bg-amber-100/60 font-medium'
                                      : 'text-emerald-950 bg-emerald-50/30 hover:bg-emerald-100/60 font-medium'
                                )}
                                title={`${targetPath} ${countText} — ${s.name}`}
                              >
                                <span className="font-mono truncate min-w-0 flex-1">
                                  {targetPath}{' '}
                                  <span
                                    className={cn(
                                      'font-sans text-[11px]',
                                      isSelected
                                        ? isShowsCat
                                          ? 'text-amber-100'
                                          : 'text-emerald-100'
                                        : isShowsCat
                                          ? 'text-amber-700'
                                          : 'text-emerald-700'
                                    )}
                                  >
                                    {countText}
                                  </span>
                                </span>
                                <span
                                  className={cn(
                                    'text-[11px] truncate shrink-0 max-w-[35%]',
                                    isSelected
                                      ? isShowsCat
                                        ? 'text-amber-100'
                                        : 'text-emerald-100'
                                      : 'text-slate-500'
                                  )}
                                >
                                  {s.name}
                                </span>
                                {canPreviewFolder && (
                                  <button
                                    type="button"
                                    onClick={handlePreviewTargetFolder}
                                    className={cn(
                                      'p-1 rounded border shrink-0 inline-flex items-center justify-center cursor-pointer',
                                      isSelected
                                        ? isShowsCat
                                          ? 'bg-amber-700/80 hover:bg-amber-800 border-amber-400/60 text-white'
                                          : 'bg-emerald-700/80 hover:bg-emerald-800 border-emerald-400/60 text-white'
                                        : isShowsCat
                                          ? 'bg-white hover:bg-amber-100 border-amber-300 text-amber-700'
                                          : 'bg-white hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                                    )}
                                    title={`Open ${targetPath}`}
                                    aria-label={`Open ${targetPath}`}
                                  >
                                    <FolderOpen className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {!confirmMergeStrandedOpen ? (
                      <div className="hidden md:flex items-center justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          disabled={
                            isMergingStranded ||
                            !selectedStrandedKey ||
                            !selectedMergeTargetShortName
                          }
                          onClick={() => setConfirmMergeStrandedOpen(true)}
                          className={cn(
                            'px-3 py-1.5 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50',
                            mergeTargetCategory === 'media_shows'
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          )}
                        >
                          Merge into Folder...
                        </button>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded flex flex-col gap-2">
                        <span className="text-xs font-bold text-amber-950 break-words">
                          Move files from <span className="font-mono">{selectedStrandedKey}</span> into{' '}
                          <span className="font-mono">
                            {mergeTargetCategory}/{selectedMergeTargetShortName}
                          </span>
                          ?
                        </span>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isMergingStranded}
                            onClick={() => setConfirmMergeStrandedOpen(false)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isMergingStranded}
                            onClick={handleMergeStrandedFolder}
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase cursor-pointer flex items-center gap-1"
                          >
                            {isMergingStranded && <RefreshCw className="w-3 h-3 animate-spin" />}
                            <span>{isMergingStranded ? 'Merging...' : 'Confirm Merge'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {onOpenLocationsModal && (
                  <button
                    type="button"
                    disabled={folderCheckModal.isRunning || isMergingStranded}
                    onClick={() => onOpenLocationsModal()}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Open Storage Folders settings"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Folders</span>
                  </button>
                )}
                <span className="text-xs font-bold text-slate-500">
                  {folderCheckModal.isRunning
                    ? 'Checking folders...'
                    : folderCheckModal.hasError
                      ? 'Completed with issues'
                      : 'Verification complete'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(folderCheckModal.isRunning ||
                  folderCheckModal.extraFolders.length === 0 ||
                  sortedActiveShowsWithShortName.length === 0) && (
                  <>
                    {onOpenShowsFolder && (
                      <button
                        type="button"
                        disabled={folderCheckModal.isRunning}
                        onClick={() =>
                          onOpenShowsFolder(
                            folderCheckModal.playlistsPath &&
                              !folderCheckModal.playlistsPath.startsWith('Google Drive:')
                              ? folderCheckModal.playlistsPath
                              : undefined,
                            folderCheckModal.playlistsFolderId
                          )
                        }
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
                        title="Open Shows Folder (media_shows)"
                        aria-label="Open Shows Folder (media_shows)"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                    )}
                    {onOpenEvergreensFolder && (
                      <button
                        type="button"
                        disabled={folderCheckModal.isRunning}
                        onClick={() =>
                          onOpenEvergreensFolder(
                            folderCheckModal.evergreensPath &&
                              !folderCheckModal.evergreensPath.startsWith('Google Drive:')
                              ? folderCheckModal.evergreensPath
                              : undefined,
                            folderCheckModal.evergreensFolderId
                          )
                        }
                        className="p-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded cursor-pointer disabled:opacity-50 inline-flex items-center justify-center"
                        title="Open Evergreens Folder (media_evergreens)"
                        aria-label="Open Evergreens Folder (media_evergreens)"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-600" />
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  disabled={folderCheckModal.isRunning || isMergingStranded}
                  onClick={handleVerifyEvergreens}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Re-run folder verification check"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5 text-slate-600', folderCheckModal.isRunning && 'animate-spin')} />
                  <span>Recheck</span>
                </button>
                <button
                  type="button"
                  disabled={folderCheckModal.isRunning}
                  onClick={() => setFolderCheckModal(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {folderCheckModal.isRunning ? 'Checking...' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(CalendarTab, (prev, next) => {
  return (
    prev.announcements === next.announcements &&
    prev.shows === next.shows &&
    prev.logs === next.logs &&
    prev.adminMessages === next.adminMessages &&
    prev.compatibilityReport === next.compatibilityReport &&
    prev.stationTimezone === next.stationTimezone &&
    prev.adminContactInfo === next.adminContactInfo &&
    prev.hasSavedAdminContact === next.hasSavedAdminContact &&
    prev.upNextPromoConfig === next.upNextPromoConfig &&
    prev.isAdmin === next.isAdmin &&
    prev.driveMP3s === next.driveMP3s &&
    prev.isDriveActive === next.isDriveActive &&
    prev.currentViewMode === next.currentViewMode &&
    prev.showPixelRuler === next.showPixelRuler &&
    prev.showLocationsModal === next.showLocationsModal &&
    prev.onOpenLocationsModal === next.onOpenLocationsModal &&
    prev.onOpenLocalStationFolder === next.onOpenLocalStationFolder &&
    prev.onOpenAnnouncementsFolder === next.onOpenAnnouncementsFolder &&
    prev.onOpenEvergreensFolder === next.onOpenEvergreensFolder &&
    prev.onOpenShowsFolder === next.onOpenShowsFolder
  );
});
