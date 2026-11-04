import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, Save, FileText, Calendar, Clock, CheckCircle, AlertCircle, AlertTriangle, ShieldAlert, Copy, Check, XCircle, X, FolderOpen, Music, Search, Play, Square, ChevronUp, ChevronDown, RefreshCw, Eye, User, BookOpen, ArrowRight, Edit3, ListChecks, CheckSquare } from 'lucide-react';
import { Announcement, AnnouncementType, AnnouncementMetadata, MediaAssetFile, Show, ShowRevision, TimeGatedMediaItem, TimeGatedMp3, ScheduleIssue, LogEntry, UpNextPromoConfig } from '../types';
import { cn, getMP3Status, formatDuration, getFilenameFromUrlOrPath, isTimeInShow, getSortedShows, getShowShade, readMp3ID3Metadata, parseID3Bytes, normalizeAnnouncement, normalizeAnnouncements, formatToDatetimeLocal, getCurrentDatetimeLocal, getDatePart, getTimePart, sortMp3sByStartDate, findFirstGapOrEnd, validateTimeGatedMp3s, getActiveMp3ForSlot, getGatedAssetType, isContiguousMidnightTransition, computeBackfilledEndTime, getNextGapAutoFillStart, formatTime12, formatDatetime12, formatHour12, formatHourShort12, isAudioFile, isScriptFile, classifyMediaAsset, AUDIO_EXTENSIONS, SCRIPT_EXTENSIONS, buildUpNextPromoAnnouncements, getGateMediaItems, formatRotatedAnnouncementName, formatRotatedFileName, DAYS_ORDER, isAnnouncementWithinDateBounds, isAnnouncementRuleMatch } from '../lib/utils';
import { evaluateScheduleDiagnostics } from '../lib/scheduleDiagnostics';
import { getPlayableUrl, DRIVE_FOLDERS, getSavedSettings, getStorageApiHeaders, cacheMP3, getAccessToken } from '../lib/driveService';
import { availableFilesCache, driveFileNameCache, upsertMediaCatalogFile, syncMediaCatalogFiles } from '../lib/audioCache';
import { reconcileScheduleAndLogs, calculateGatedTrackAudit, resolveAnnouncementsForDate, resolveShowsForDate, GatedTrackAuditMetrics, toCanonicalDateString, doesLogMatchLocalSlot } from '../lib/temporalReconciliation';
import { STATION_TIMEZONE_OPTIONS, getStationTimezone, setStationTimezone, getStationTimezoneOption, isLogPrerecordOrExport, toStationDateParts, getStationNow, getAdminContactInfo, setAdminContactInfo } from '../lib/compatibility';
import LiveReadPopout from './LiveReadPopout';
import ScheduleAuditModal from './ScheduleAuditModal';
import { MilitaryTimeInput } from './MilitaryTimeInput';
import { PlacementPresetModal } from './PlacementPresetModal';
import { MediaPickerModal } from './MediaPickerModal';
import { CopyEditorModal } from './CopyEditorModal';
import { normalizeReadTimeDisplay } from '../lib/liveReadFormatting';
import {
  DeleteAnnouncementModal,
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
  currentViewMode?: 'list' | 'calendar' | 'shows';
  onViewModeChange?: (mode: 'list' | 'calendar' | 'shows') => void;
  showPixelRuler?: boolean;
}

function CalendarTab({ announcements, onSave, isAdmin, onAdminToggle, now: _liveNow, driveMP3s: propDriveMP3s = [], isDriveActive = false, onRefresh, shows = [], onSaveShows, stationTimezone, onSaveStationTimezone, adminContactInfo, hasSavedAdminContact = false, onSaveAdminContactInfo, upNextPromoConfig, logs = [], currentViewMode, onViewModeChange, showPixelRuler = false }: CalendarTabProps) {
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

  const isFormModified = useMemo(() => {
    if (!editingId || !initialFormDataJson) return false;
    return JSON.stringify(formData) !== initialFormDataJson;
  }, [editingId, formData, initialFormDataJson]);

  const handleCancelEdit = () => {
    if (isSavingAnnouncement) return;
    if (isFormModified) {
      setShowCancelConfirm(true);
    } else {
      setEditingId(null);
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
  const [saveValidationWarnings, setSaveValidationWarnings] = useState<string[] | null>(null);
  const isNew = editingId ? !announcements.some(s => s.id === editingId) : false;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [announcementFilterQuery, setAnnouncementFilterQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScriptFile, setPreviewScriptFile] = useState<string | null>(null);
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
  const [placementModal, setPlacementModal] = useState<AnnouncementPlacementModalState | null>(null);
  const [selectedListMediaByAnnId, setSelectedListMediaByAnnId] = useState<Record<string, string>>({});
  const [copyEditorState, setCopyEditorState] = useState<{
    isOpen: boolean;
    initialFileName?: string;
    sourceFileToCopy?: string;
    initialReadTime?: string;
    targetGateId?: string | null;
    targetGateIndex?: number;
    targetItemIndex?: number;
    targetAnnouncementId?: string | null;
    fromPicker?: boolean;
  }>({ isOpen: false });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleAddMp3 = () => {
    setPickerTarget('newTimeGated');
    setPickerMp3Id(null);
    setPickerItemIndex(null);
    setSearchQuery('');
    setIsPickerOpen(true);
  };

   const applyAddMp3WithDateChecks = (
    selectedFile?: {
      name: string;
      duration?: string | number;
      path?: string;
      approximateReadTime?: string;
      backupMp3Url?: string;
    },
    inferredAssetType?: 'audio' | 'script',
    overrideMediaItems?: TimeGatedMediaItem[]
  ) => {
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
              ...(selectedFile?.backupMp3Url ? { backupMp3Url: selectedFile.backupMp3Url } : {})
            }
          ];

    // 1.a: If there are no MP3s, default to the start and end date of the Announcement
    if (current.length === 0) {
      const defaultStart = formData.startDate 
        ? formatToDatetimeLocal(formData.startDate) 
        : getCurrentDatetimeLocal();
      const defaultEnd = formData.endDate 
        ? formatToDatetimeLocal(formData.endDate) 
        : undefined;

      const gateId = `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newEntry: TimeGatedMp3 = {
        id: gateId,
        startDate: defaultStart,
        endDate: defaultEnd,
        mediaItems: resolvedItems
      };
      const sorted = sortMp3sByStartDate([newEntry]);
      setFormData({
        ...formData,
        timeGatedMp3s: sorted
      });
      return;
    }

    const { presets } = computeSchedulePlacementOptions(
      current,
      formData.startDate,
      formData.endDate
    );

    // Always show the pop-up modal offering detected gaps (including now() -> first startDate),
    // subsequent gaps, the 1-week-out option or trailing end check, and "enter my own"
    const defaultPreset = presets[0] || presets[presets.length - 1];
    setPlacementModal({
      pendingFile: selectedFile,
      pendingMediaItems: resolvedItems,
      inferredAssetType,
      nextIndex: current.length + 1,
      presets,
      selectedPresetId: defaultPreset.id,
      startDate: defaultPreset.startDate,
      startTime: defaultPreset.startTime,
      endDate: defaultPreset.endDate,
      endTime: defaultPreset.endTime,
      transitionMp3Id: defaultPreset.transitionMp3Id,
      transitionMp3Index: defaultPreset.transitionMp3Index
    });
  };

  const handleSelectPlacementPreset = (preset: SchedulePresetOption) => {
    setPlacementModal(prev => {
      if (!prev) return null;
      return {
        ...prev,
        selectedPresetId: preset.id,
        startDate: preset.startDate,
        startTime: preset.startTime,
        endDate: preset.endDate,
        endTime: preset.endTime,
        transitionMp3Id: preset.transitionMp3Id,
        transitionMp3Index: preset.transitionMp3Index
      };
    });
  };

  const handleUpdatePlacementModalDates = (updates: Partial<{ startDate: string; startTime: string; endDate: string; endTime: string }>) => {
    setPlacementModal(prev => {
      if (!prev) return null;
      const nextStartDate = updates.startDate !== undefined ? updates.startDate : prev.startDate;
      const nextStartTime = updates.startTime !== undefined ? updates.startTime : prev.startTime;
      const nextEndDate = updates.endDate !== undefined ? updates.endDate : prev.endDate;
      const nextEndTime = updates.endTime !== undefined ? updates.endTime : prev.endTime;

      // 1. Check if this combination matches any of the gap presets (excluding 'custom')
      const matchingPreset = prev.presets.find(p => {
        if (p.id === 'custom') return false;
        const matchStart = (p.startDate || '') === (nextStartDate || '') && (p.startTime || '') === (nextStartTime || '');
        const matchEnd = (p.endDate || '') === (nextEndDate || '') && (p.endTime || '') === (nextEndTime || '');
        return matchStart && matchEnd;
      });

      if (matchingPreset) {
        return {
          ...prev,
          startDate: nextStartDate,
          startTime: nextStartTime,
          endDate: nextEndDate,
          endTime: nextEndTime,
          selectedPresetId: matchingPreset.id,
          transitionMp3Id: matchingPreset.transitionMp3Id,
          transitionMp3Index: matchingPreset.transitionMp3Index
        };
      }

      // 2. Check for "After" edits in "Last file has a blank end" scenarios
      const trailingTransitionPreset = prev.presets.find(p => p.transitionMp3Id);
      if (trailingTransitionPreset && !nextEndDate) {
        const refStart = trailingTransitionPreset.referenceStartDate;
        const nextStartDt = nextStartDate ? `${nextStartDate}T${nextStartTime || '00:00'}` : '';
        if (refStart && nextStartDt && nextStartDt >= refStart) {
          return {
            ...prev,
            startDate: nextStartDate,
            startTime: nextStartTime,
            endDate: nextEndDate,
            endTime: nextEndTime,
            selectedPresetId: trailingTransitionPreset.id,
            transitionMp3Id: trailingTransitionPreset.transitionMp3Id,
            transitionMp3Index: trailingTransitionPreset.transitionMp3Index
          };
        }
      }

      return {
        ...prev,
        startDate: nextStartDate,
        startTime: nextStartTime,
        endDate: nextEndDate,
        endTime: nextEndTime,
        selectedPresetId: 'custom',
        transitionMp3Id: undefined,
        transitionMp3Index: undefined
      };
    });
  };

  const handleCancelPlacementModal = () => {
    setPlacementModal(null);
  };

  const handleConfirmPlacementModal = () => {
    if (!placementModal) return;
    const current = formData.timeGatedMp3s || [];
    const mp3Name = placementModal.pendingFile ? placementModal.pendingFile.name : '';
    const rawDur = placementModal.pendingFile?.duration;
    const mp3Duration = rawDur === undefined || rawDur === null 
      ? undefined 
      : typeof rawDur === 'number' 
        ? formatDuration(rawDur) 
        : String(rawDur);

    const startIso = placementModal.startDate
      ? (placementModal.startTime ? `${placementModal.startDate}T${placementModal.startTime}` : `${placementModal.startDate}T00:00`)
      : '';
    const endIso = placementModal.endDate
      ? (placementModal.endTime ? `${placementModal.endDate}T${placementModal.endTime}` : `${placementModal.endDate}T23:59`)
      : undefined;

    if (!startIso) {
      return;
    }

    let updatedCurrent = [...current];
    if (placementModal.transitionMp3Id && startIso) {
      const backfillEnd = computeBackfilledEndTime(startIso);
      updatedCurrent = updatedCurrent.map(m =>
        m.id === placementModal.transitionMp3Id ? { ...m, endDate: backfillEnd } : m
      );
    } else {
      const sortedCurrent = sortMp3sByStartDate(current);
      const last = sortedCurrent[sortedCurrent.length - 1];
      if (last && (!last.endDate || !last.endDate.trim()) && startIso > (last.startDate || '')) {
        const backfillEnd = computeBackfilledEndTime(startIso);
        updatedCurrent = updatedCurrent.map(m =>
          m.id === last.id ? { ...m, endDate: backfillEnd } : m
        );
      }
    }

     const gateId = `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const resolvedItems: TimeGatedMediaItem[] =
      placementModal.pendingMediaItems && placementModal.pendingMediaItems.length > 0
        ? placementModal.pendingMediaItems
        : [
            {
              mp3Url: mp3Name,
              assetType: placementModal.inferredAssetType,
              duration: mp3Duration,
              ...(placementModal.pendingFile?.approximateReadTime
                ? { approximateReadTime: placementModal.pendingFile.approximateReadTime }
                : {}),
              ...(placementModal.pendingFile?.backupMp3Url
                ? { backupMp3Url: placementModal.pendingFile.backupMp3Url }
                : {})
            }
          ];
    const newEntry: TimeGatedMp3 = {
      id: gateId,
      startDate: startIso,
      endDate: endIso,
      mediaItems: resolvedItems
    };

    const updated = sortMp3sByStartDate([...updatedCurrent, newEntry]);
    setFormData({
      ...formData,
      timeGatedMp3s: updated
    });

    setPlacementModal(null);
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
  const hideCalendarIcon = headerContainerWidth < 780;
  const hideAnnouncementsIcons = headerContainerWidth < 780;
  const hideShowsIcon = headerContainerWidth < 780;
  const addTextShort = headerContainerWidth < (isCalendarView ? 1040 : 900) && headerContainerWidth >= (isCalendarView ? 920 : 800);
  const addTextIconOnly = headerContainerWidth < (isCalendarView ? 920 : 800);
  const halfFilter = headerContainerWidth < (isCalendarView ? 980 : 840);
  const modeIconsOnly = headerContainerWidth < 520;
  const isHeaderStacked = headerContainerWidth < (isCalendarView ? 640 : 540);
  const isUltraNarrowHeader = headerContainerWidth < 360;
  const showsFolderCheckShort = headerContainerWidth < 420 && headerContainerWidth >= 320;
  const showsFolderCheckMinimal = headerContainerWidth < 320;

  const listCardCollapsePreviewText = headerContainerWidth < 520;
  const listCardCollapseCopyText = headerContainerWidth < 460;
  const listCardCollapseViewEditText = headerContainerWidth < 420;
  const listCardHideSummaryTag = headerContainerWidth < 480;
  const listCardHideTypeTag = headerContainerWidth < 420;

  const activeTriggerWidth = isCalendarView ? controlsContainerWidth : headerContainerWidth;

  const dropShowIssuesText = controlsContainerWidth < 1360;
  const dropAuditWord = controlsContainerWidth < 1180;

  const isCell3Below = controlsContainerWidth < 630;

  const isFilterModeSplit = controlsContainerWidth < 1130;
  const isIssuesAuditStacked = controlsContainerWidth < 1130;

  const controlsNavShort = controlsContainerWidth < 1300;

  const controlsNavIconOnly = controlsContainerWidth < 690;

  const showsCardsCollapse = headerContainerWidth < 450;

  const isWeekDayStacked = controlsContainerWidth < 1130;

  const isNavStacked = controlsContainerWidth < 1130;
  const isFullStacked = controlsContainerWidth < 390;

  // Shows related states
  const [showFilterQuery, setShowFilterQuery] = useState('');
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [showFormData, setShowFormData] = useState<Partial<Show>>({});
  const [isNameShortManuallyEdited, setIsNameShortManuallyEdited] = useState(false);
  const [isVerifyingEvergreens, setIsVerifyingEvergreens] = useState(false);
  const [folderCheckModal, setFolderCheckModal] = useState<{
    isOpen: boolean;
    isRunning: boolean;
    hasError: boolean;
    lines: string[];
  } | null>(null);

  // Global unsaved changes listener for top-level navigation and auto-refresh guards
  useEffect(() => {
    window.ampHasUnsavedChanges = () => {
      if (editingId !== null) return true;
      if (editingShowId !== null) return true;
      if (placementModal !== null) return true;
      if (copyEditorState.isOpen) return true;
      if (isPickerOpen) return true;
      if (previewScriptFile !== null) return true;
      if (deleteConfirmId !== null) return true;
      if (inactivateEndModal !== null) return true;
      return false;
    };
    window.ampDiscardEdits = () => {
      setEditingId(null);
      setEditingShowId(null);
      setPlacementModal(null);
      setCopyEditorState({ isOpen: false });
      setIsPickerOpen(false);
      setPreviewScriptFile(null);
      setDeleteConfirmId(null);
      setInactivateEndModal(null);
      setShowCancelConfirm(false);
      setOpenedFromAudit(false);
    };
    return () => {
      window.ampHasUnsavedChanges = undefined;
      window.ampDiscardEdits = undefined;
    };
  }, [
    editingId,
    editingShowId,
    placementModal,
    copyEditorState.isOpen,
    isPickerOpen,
    previewScriptFile,
    deleteConfirmId,
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
    const showsWithShortNameCount = shows.filter(s => String(s?.nameShort || '').trim().length > 0).length;

    setIsVerifyingEvergreens(true);
    setFolderCheckModal({
      isOpen: true,
      isRunning: true,
      hasError: false,
      lines: [
        `[Starting] Folder verification (${modeLabel})...`
      ]
    });

    const appendLines = (newLines: string[], updates?: { isRunning?: boolean; hasError?: boolean }) => {
      setFolderCheckModal(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(updates?.isRunning !== undefined ? { isRunning: updates.isRunning } : {}),
          ...(updates?.hasError !== undefined ? { hasError: updates.hasError } : {}),
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
        `  • Announcements: ${data.announcementsPath || 'Verified'}`
      ];

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
      } else if (!data.announcementsReadonlyError) {
        resultLines.push(
          '[OK] All show Evergreen and Playlist folders were already present. No fixes needed.'
        );
      }

      resultLines.push('[Complete] Folder verification finished.');
      appendLines(resultLines, {
        isRunning: false,
        hasError: Boolean(data.announcementsReadonlyError)
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

  const createNewShow = () => {
    setEditingShowId('new');
    setIsNameShortManuallyEdited(false);
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
    setIsNameShortManuallyEdited(false);
    setShowFormData({ ...show });
  };

  const handleDeleteShow = async (id: string) => {
    if (isSavingShow) return;
    if (confirm("Are you sure you want to delete this show?")) {
      const filtered = shows.filter(s => s.id !== id);
      if (onSaveShows) {
        setIsSavingShow(true);
        try {
          const result = await onSaveShows(filtered);
          if (result !== false) {
            setEditingShowId(null);
          }
        } catch (err) {
          console.error("Delete show failed:", err);
        } finally {
          setIsSavingShow(false);
        }
      } else {
        setEditingShowId(null);
      }
    }
  };

  const handleSaveShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingShow) return;
    if (!showFormData.name) {
      alert("Show name is required.");
      return;
    }

    const finalNameShort = showFormData.nameShort ? cleanNameShort(showFormData.nameShort) : cleanNameShort(showFormData.name);
    if (!finalNameShort) {
      alert("Short Name is required.");
      return;
    }

    // 6.a. Before adding or editing, ensure nameShort is unique
    const otherShows = shows.filter(s => s.id !== editingShowId);
    const isUnique = !otherShows.some(s => s.nameShort.toLowerCase() === finalNameShort.toLowerCase());
    if (!isUnique) {
      alert(`The short name "${finalNameShort}" is already in use by another show. Please provide a unique short name.`);
      return;
    }

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
    const soundLibrary = driveMP3s || [];
    const tgFiles = (formData.timeGatedMp3s || [])
      .flatMap(m => getGateMediaItems(m).flatMap(mi => [mi.mp3Url, mi.backupMp3Url]))
      .filter(Boolean) as string[];
    const allFileNames = Array.from(new Set([...soundLibrary.map(f => f.name), ...tgFiles]));
    
    allFileNames.forEach(filename => {
      if (filename && isAudioFile(filename) && !pickerDurations[filename]) {
        try {
          const playableUrl = getPlayableUrl(filename);
          if (playableUrl) {
            const audio = new Audio(playableUrl);
            const handleLoaded = () => {
              const d = audio.duration;
              if (!isNaN(d) && d > 0) {
                const formatted = formatDuration(d);
                setPickerDurations(prev => ({
                  ...prev,
                  [filename]: formatted
                }));
              }
            };
            audio.addEventListener('loadedmetadata', handleLoaded);
            audio.addEventListener('error', () => {});
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
          availableFilesCache.set(f.name, {
            path: f.path || f.name,
            size: f.size || '0.1 MB',
            duration: f.duration || '',
            mtimeMs: f.mtimeMs,
            modifiedTime: f.modifiedTime
          });
          if (f.path) {
            driveFileNameCache.set(f.path, f.name);
          }
        }
      });
    }
  }, [driveMP3s]);

  useEffect(() => {
    if (!isPickerOpen) return;
    
    const soundLibrary = driveMP3s;
    soundLibrary.slice(0, 40).forEach(file => {
      let alreadyFetched = false;
      setMetadataCache(current => {
        if (current[file.name] !== undefined) {
          alreadyFetched = true;
        }
        return current;
      });
      
      if (alreadyFetched) return;

      setMetadataCache(prev => ({ ...prev, [file.name]: {} }));

      const playableUrl = getPlayableUrl(file.name);
      readMp3ID3Metadata(playableUrl).then(meta => {
        if (meta) {
          setMetadataCache(prev => ({ ...prev, [file.name]: meta }));
        }
      });
    });
  }, [isPickerOpen, driveMP3s, isDriveActive]);

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
  const [viewMode, setViewModeState] = useState<'list' | 'calendar' | 'shows'>(currentViewMode || 'calendar');

  const setViewMode = (mode: 'list' | 'calendar' | 'shows') => {
    setViewModeState(mode);
    if (onViewModeChange) onViewModeChange(mode);
  };

  useEffect(() => {
    if (currentViewMode && currentViewMode !== viewMode) {
      setViewModeState(currentViewMode);
    }
  }, [currentViewMode]);
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
      placementModal !== null ||
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
    placementModal,
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

  const togglePreview = async (url: string | undefined, e?: React.MouseEvent) => {
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
      let playable = getPlayableUrl(url) || `/api/media/stream?path=${encodeURIComponent(cleanName)}`;

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
        const fallbackUrl = `/api/media/stream?path=${encodeURIComponent(cleanName)}`;
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
    options?: { pairedBackupAudioFile?: string; doNotAttachBackup?: boolean; approximateReadTime?: string }
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
          backupMp3Url: suggestedBackupAudio
        },
        inferredAssetType
      );
    } else if (pickerTarget === 'addGateFile' && pickerMp3Id) {
      const currentMp3s = formData.timeGatedMp3s || [];
      const updatedMp3s = currentMp3s.map(m => {
        if (m.id === pickerMp3Id) {
          const existingItems = getGateMediaItems(m);
          const newItem: TimeGatedMediaItem = {
            mp3Url: file.name,
            assetType: inferredAssetType,
            duration: inferredAssetType === 'audio' ? (pickerDurations[file.name] || file.duration) : undefined,
            ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
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
        const nextItems = items.map((mi, idx) => {
          if (idx === targetIdx) {
            return {
              ...mi,
              mp3Url: file.name,
              assetType: inferredAssetType,
              duration: inferredAssetType === 'audio' ? (pickerDurations[file.name] || file.duration || mi.duration) : undefined,
              ...(resolvedApproxReadTime ? { approximateReadTime: resolvedApproxReadTime } : {}),
              ...(suggestedBackupAudio && !mi.backupMp3Url ? { backupMp3Url: suggestedBackupAudio } : {})
            };
          }
          return mi;
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
        const existingItems = getGateMediaItems(m).filter(mi => mi.mp3Url && mi.mp3Url.trim() !== '');
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
    } else {
      handleSelectFileFromPicker(files[0]);
    }
  };

  const handleProceedWithoutFileFromPicker = () => {
    setIsPickerOpen(false);
    applyAddMp3WithDateChecks(undefined, undefined, [{ mp3Url: '' }]);
  };

  const startEdit = (s: Announcement, fromAudit: boolean = false) => {
    const canonical = announcements.find(a => a.id === s.id) || s;
    const norm = normalizeAnnouncement(canonical);
    setEditingId(canonical.id);
    setFormData(norm);
    setInitialFormDataJson(JSON.stringify(norm));
    setOpenedFromAudit(fromAudit);
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
    const newSchedule: Announcement = normalizeAnnouncement({
      ...normS,
      id,
      name: `${s.name} (Copy)`,
      enabled: true, // Reset to active as requested
      startDate: newStartDate,
      endDate: newEndDate,
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

  const saveEdit = async (overrideEndDate?: string) => {
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
    const validation = validateTimeGatedMp3s(currentMp3s, undefined, effectiveEndDate, formData.startDate);
    if (validation.hasErrors) {
      const warningMessages: string[] = [];
      if (currentMp3s.length === 0) {
        warningMessages.push('At least one Announcement Gate is required.');
      } else {
        validation.sorted.forEach((gate, idx) => {
          const gateNum = idx + 1;
          const gateErrors = validation.errors[gate.id] || [];
          const gateWarnings = validation.warnings[gate.id] || [];
          const isMissingStart = validation.missingStartIds.has(gate.id);
          const isMissingFile = validation.missingFileIds.has(gate.id);

          if (isMissingStart) {
            warningMessages.push(`Gate #${gateNum}: Start date & time is missing.`);
          }
          if (isMissingFile) {
            warningMessages.push(`Gate #${gateNum}: File attachment selection is missing.`);
          }
          for (const err of gateErrors) {
            warningMessages.push(`Gate #${gateNum}: ${err}`);
          }
          for (const warn of gateWarnings) {
            if (
              warn !== 'Start date & time is required.' &&
              warn !== 'File attachment is required.'
            ) {
              warningMessages.push(`Gate #${gateNum}: ${warn}`);
            }
          }
        });
      }
      setSaveValidationWarnings(
        warningMessages.length > 0
          ? warningMessages
          : ['Please complete all required Gate dates and file attachments before saving.']
      );
      return;
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
          duration: derivedAssetType === 'audio' ? mi.duration : undefined,
          fileSize: mi.fileSize
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
    const updated: Announcement = normalizeAnnouncement({
      ...formData as Announcement,
      endDate: effectiveEndDate || formData.endDate,
      timeGatedMp3s: sortedMp3s,
      metadata: {
        ...(formData.metadata as AnnouncementMetadata),
        lastModifiedDate: now
      }
    });
    
    const exists = announcements.some(s => s.id === editingId);
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
        if (openedFromAudit) {
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
    setIsSavingAnnouncement(true);
    try {
      const result = await onSave(announcements.filter(s => s.id !== id));
      if (result !== false) {
        setEditingId(null);
        if (openedFromAudit) {
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
            createNew={createNew}
            createNewShow={createNewShow}
            isHeaderStacked={isHeaderStacked}
            isUltraNarrowHeader={isUltraNarrowHeader}
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
            />
          ) : (
            <AnnouncementsListView
              announcements={announcements}
              now={now}
              announcementFilterQuery={announcementFilterQuery}
              inactiveSortMode={inactiveSortMode}
              setInactiveSortMode={setInactiveSortMode}
              selectedListMediaByAnnId={selectedListMediaByAnnId}
              setSelectedListMediaByAnnId={setSelectedListMediaByAnnId}
              startEdit={startEdit}
              duplicate={duplicate}
              listCardHideTypeTag={listCardHideTypeTag}
              listCardHideSummaryTag={listCardHideSummaryTag}
              listCardCollapseViewEditText={listCardCollapseViewEditText}
              listCardCollapseCopyText={listCardCollapseCopyText}
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
            targetGateId: pickerMp3Id,
            targetItemIndex: pickerItemIndex ?? undefined,
            targetAnnouncementId: editingId || formData.id || null,
            fromPicker: true
          });
        }}
         onSelectFile={handleSelectFileFromPicker}
        allowMultiSelect={pickerTarget === 'newTimeGated' || pickerTarget === 'addGateFile'}
        allowProceedEmpty={pickerTarget === 'newTimeGated'}
        onSelectMultipleFiles={handleSelectMultipleFilesFromPicker}
        onProceedWithoutFile={handleProceedWithoutFileFromPicker}
        onClose={() => {
          setIsPickerOpen(false);
          setPickerTarget('main');
          setPickerItemIndex(null);
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
          upsertMediaCatalogFile({
            name: uploaded.name,
            path: uploaded.path || uploaded.name,
            size: uploaded.size || '0.1 MB',
            duration: '',
            mtimeMs: nowMs,
            modifiedTime: nowIso,
          });
          setLocalSavedMediaFiles(prev => [
            {
              name: uploaded.name,
              path: uploaded.path || uploaded.name,
              size: uploaded.size || '0.1 MB',
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
        initialReadTime={copyEditorState.initialReadTime}
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
          if (previousRenamedName && previousRenamedName.toLowerCase() !== uploaded.name.toLowerCase()) {
            availableFilesCache.delete(previousRenamedName);
          }
          upsertMediaCatalogFile({
            name: uploaded.name,
            path: uploaded.path || uploaded.name,
            size: uploaded.size || '0.1 MB',
            duration: '',
            mtimeMs: nowMs,
            modifiedTime: nowIso,
          });
          setLocalSavedMediaFiles(prev => [
            {
              name: uploaded.name,
              path: uploaded.path || uploaded.name,
              size: uploaded.size || '0.1 MB',
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
        onSaved={async ({ name, path, size, approximateReadTime, pairedBackupAudioFile, doNotAttachBackup, adoptNewFile }) => {
          const shouldAdopt = adoptNewFile !== false;
          const isSplitFromExisting = Boolean(
            copyEditorState.initialFileName &&
            getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase() !== name.toLowerCase()
          );
          const wasEditingExistingInPicker =
            copyEditorState.fromPicker && Boolean(copyEditorState.initialFileName);
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
              next.push({
                name: pairedBackupAudioFile,
                path: pairedBackupAudioFile,
                size: '0.1 MB',
                mtimeMs: nowMs,
                modifiedTime: nowIso
              });
            }
            return next;
          });

          if (onRefresh && !editingId && !editingShowId) {
            Promise.resolve(onRefresh()).catch(() => {});
          }

          // If user split to a new filename and explicitly chose to keep the original file in the slot, stop here
          if (isSplitFromExisting && !shouldAdopt) {
            return;
          }

          if (copyEditorState.fromPicker) {
            if (!wasEditingExistingInPicker || isSplitFromExisting) {
              handleSelectFileFromPicker(
                { name, path, size },
                {
                  pairedBackupAudioFile: resolvedBackup,
                  doNotAttachBackup,
                  approximateReadTime: nextApprox
                }
              );
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
              let updatedGateIdx = targetGateIndex ?? 0;
              let updatedItemIdx = targetItemIndex ?? 0;

              const updatedMp3s = sortedTargetGates.map((m, gIdx) => {
                const items = getGateMediaItems(m);
                const matchesGate =
                  (targetGateId && m.id === targetGateId) ||
                  (targetGateIndex !== undefined && gIdx === targetGateIndex);

                if (matchesGate) {
                  updatedGateIdx = gIdx;
                  return {
                    ...m,
                    mediaItems: items.map((mi, iIdx) => {
                      const matchesItem =
                        targetItemIndex !== undefined ? iIdx === targetItemIndex : iIdx === 0;
                      if (!matchesItem) return mi;
                      updatedItemIdx = iIdx;
                      return {
                        ...mi,
                        mp3Url: name,
                        assetType: classifyMediaAsset(name, 'script'),
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        ...(resolvedBackup &&
                        (!mi.backupMp3Url || Boolean(copyEditorState.sourceFileToCopy) || isSplitFromExisting)
                          ? { backupMp3Url: resolvedBackup }
                          : {})
                      };
                    })
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
            }
          } else if (targetGateId || targetGateIndex !== undefined) {
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
                              ...(resolvedBackup && !mi.backupMp3Url ? { backupMp3Url: resolvedBackup } : {})
                            }
                          : mi
                      )
                    };
                  }
                  return m;
                }
                return {
                  ...m,
                  mediaItems: items.map((mi, idx) => {
                    const matchesItem =
                      targetItemIndex !== undefined ? idx === targetItemIndex : idx === 0;
                    if (matchesItem) {
                      return {
                        ...mi,
                        mp3Url: name,
                        assetType: classifyMediaAsset(name, 'script'),
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        ...(resolvedBackup &&
                        (!mi.backupMp3Url || Boolean(copyEditorState.sourceFileToCopy) || isSplitFromExisting)
                          ? { backupMp3Url: resolvedBackup }
                          : {})
                      };
                    }
                    // If edited in-place, sync read time on sibling items sharing the same file
                    if (
                      !isSplitFromExisting &&
                      !copyEditorState.sourceFileToCopy &&
                      copyEditorState.initialFileName &&
                      getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() ===
                        getFilenameFromUrlOrPath(copyEditorState.initialFileName).toLowerCase()
                    ) {
                      return {
                        ...mi,
                        approximateReadTime: nextApprox || mi.approximateReadTime,
                        ...(resolvedBackup && !mi.backupMp3Url ? { backupMp3Url: resolvedBackup } : {})
                      };
                    }
                    return mi;
                  })
                };
              });
              const sorted = sortMp3sByStartDate(updated);
              return {
                ...prev,
                timeGatedMp3s: sorted
              };
            });
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

      {/* Delete Confirmation Modal Overlay */}
      <DeleteAnnouncementModal
        isOpen={!!deleteConfirmId}
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

      {/* Cancel Unsaved Changes Confirmation Modal Overlay */}
      <CancelUnsavedModal
        isOpen={showCancelConfirm}
        onKeepEditing={() => setShowCancelConfirm(false)}
        onDiscard={() => {
          setShowCancelConfirm(false);
          setEditingId(null);
          if (openedFromAudit) {
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

      {/* Schedule Placement & Gap Selection Modal Overlay */}
      {placementModal && (
        <PlacementPresetModal
          placementModal={placementModal}
          onSelectPreset={handleSelectPlacementPreset}
          onUpdateDates={handleUpdatePlacementModalDates}
          onConfirm={handleConfirmPlacementModal}
          onCancel={handleCancelPlacementModal}
        />
      )}

      {/* Calendar Show Details Modal Overlay */}
      <ShowDetailsModal
        show={selectedCalendarShow}
        onClose={() => setSelectedCalendarShow(null)}
        onEditShow={(s) => {
          setSelectedCalendarShow(null);
          startEditShow(s);
        }}
      />

      {previewScriptFile && (
        <div id="preview-script-modal-backdrop" className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-[135] animate-in fade-in duration-150">
          <LiveReadPopout
            initialFileName={previewScriptFile}
            initialAnnouncementName="File Preview"
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
                    setPreviewScriptFile(null);
                    setPreviewScriptBackupUrl(undefined);
                    setPreviewScriptOrigin(null);
                    setCopyEditorState({
                      isOpen: true,
                      initialFileName: cleanName,
                      sourceFileToCopy: undefined,
                      initialReadTime: matchingItem?.approximateReadTime,
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
                    setPreviewScriptFile(null);
                    setPreviewScriptBackupUrl(undefined);
                    setPreviewScriptOrigin(null);
                    setCopyEditorState({
                      isOpen: true,
                      initialFileName: undefined,
                      sourceFileToCopy: cleanName,
                      initialReadTime: matchingItem?.approximateReadTime,
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
              if (openedFromAudit) {
                setOpenedFromAudit(false);
                setIsScheduleAuditOpen(true);
              }
            }
          } finally {
            setIsSavingAnnouncement(false);
          }
        }}
      />

      {/* Incomplete Gate Data On-Save Warning Modal */}
      {saveValidationWarnings && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/60"
          onClick={() => setSaveValidationWarnings(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                    Incomplete Gate Data
                  </h4>
                  <p className="text-xs font-bold text-amber-800 truncate mt-1">
                    Please fix the following before saving
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaveValidationWarnings(null)}
                className="text-amber-700 hover:text-amber-950 cursor-pointer p-1"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs text-slate-700">
              <p className="font-bold text-slate-800">
                One or more Announcement Gates have missing or invalid fields:
              </p>
              <ul className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scrollbar">
                {saveValidationWarnings.map((msg, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 p-2 rounded bg-amber-50/70 border border-amber-200 text-amber-950 font-bold"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{msg}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSaveValidationWarnings(null)}
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
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

            <div className="p-4 overflow-y-auto flex-1">
              <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-xs space-y-1.5 leading-relaxed border border-slate-800">
                {folderCheckModal.lines.map((line, idx) => {
                  const isError = line.startsWith('[Error]') || line.startsWith('[Warning]');
                  const isFixed = line.startsWith('[Fixed]');
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
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-500">
                {folderCheckModal.isRunning
                  ? 'Checking folders...'
                  : folderCheckModal.hasError
                    ? 'Completed with issues'
                    : 'Verification complete'}
              </span>
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
      )}
    </div>
  );
}

export default React.memo(CalendarTab, (prev, next) => {
  return (
    prev.announcements === next.announcements &&
    prev.shows === next.shows &&
    prev.logs === next.logs &&
    prev.stationTimezone === next.stationTimezone &&
    prev.isAdmin === next.isAdmin &&
    prev.driveMP3s === next.driveMP3s &&
    prev.isDriveActive === next.isDriveActive &&
    prev.currentViewMode === next.currentViewMode &&
    prev.showPixelRuler === next.showPixelRuler
  );
});
