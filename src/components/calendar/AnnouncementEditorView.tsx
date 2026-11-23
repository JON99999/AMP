import React from 'react';
import {
  FileText,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  AlertCircle,
  Square,
  Play,
  Edit3,
  Eye,
  FolderOpen,
  Check,
  X,
  Clock,
  XCircle,
  RefreshCw,
  CheckCircle,
  ChevronRight,
  Archive,
  HelpCircle,
  Volume2,
  Calendar,
  ArrowUp,
  ArrowDown,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { Announcement, AnnouncementType, TimeGatedMediaItem, TimeGatedMp3, LogEntry } from '../../types';
import {
  cn,
  getFilenameFromUrlOrPath,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getDatePart,
  getTimePart,
  sortMp3sByStartDate,
  validateTimeGatedMp3s,
  formatDatetime12,
  formatHour12,
  isAudioFile,
  isScriptFile,
  getGateMediaItems,
  isGateExpiredOrInactivated,
  isAnnouncementRuleMatch,
  isContiguousMidnightTransition,
  computeBackfilledEndTime,
  getNextGapAutoFillStart,
  formatDurationMmSs,
  getFileExtension,
} from '../../lib/utils';
import { availableFilesCache } from '../../lib/audioCache';
import { uploadAnnouncementMediaFile, upsertMediaCatalogFile } from '../../lib/driveService';
import { formatShortDateMDY, getGateEffectiveEndIso } from '../../lib/scheduleEngine';
import {
  calculateGatedTrackAudit,
  calculateGateSlotAssessment,
  formatSlotAssessmentTooltip,
  computePlayedGateBoundsMap,
} from '../../lib/temporalReconciliation';
import { normalizeReadTimeDisplay } from '../../lib/liveReadFormatting';
import { MilitaryTimeInput } from '../MilitaryTimeInput';
import { CalendarDateInput } from '../CalendarDateInput';
import {
  formatMetadataDate,
  PreviewScriptOriginState,
  CopyEditorModalOpenState,
} from './calendarHelpers';

export interface AnnouncementEditorViewProps {
  editingId: string;
  isNew: boolean;
  formData: Partial<Announcement>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Announcement>>>;
  isDraggingClock: boolean;
  setIsDraggingClock: (val: boolean) => void;
  handleClockInteraction: (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => void;
  handleAddMp3: () => void;
  onReuseGate?: (gate: TimeGatedMp3) => string | undefined;
  savedGates?: TimeGatedMp3[];
  initialFocusTarget?: {
    slotIso?: string;
    gateId?: string;
    itemIndex?: number;
    mp3Url?: string;
  } | null;
  onClearInitialFocusTarget?: () => void;
  logs: LogEntry[];
  pickerDurations: Record<string, string>;
  metadataCache: Record<string, { title?: string; artist?: string; album?: string }>;
  previewUrl: string | null;
  togglePreview: (url: string | undefined, e?: React.MouseEvent) => void;
  setCopyEditorState: React.Dispatch<React.SetStateAction<CopyEditorModalOpenState>>;
  setPreviewScriptBackupUrl: (url: string | undefined) => void;
  setPreviewScriptOrigin: (origin: PreviewScriptOriginState | null) => void;
  setPreviewScriptFromPicker: (val: boolean) => void;
  setPreviewScriptFile: (file: string | null) => void;
  setPickerTarget: (target: 'main' | 'backup' | 'timeGated' | 'newTimeGated' | 'addGateFile') => void;
  setPickerMp3Id: (id: string | null) => void;
  setPickerItemIndex: (idx: number | null) => void;
  setSearchQuery: (q: string) => void;
  setIsPickerOpen: (val: boolean) => void;
  toggleColumn: (day: number) => void;
  toggleRow: (hour: number) => void;
  toggleGridCell: (day: number, hour: number) => void;
  isSavingAnnouncement: boolean;
  setDeleteConfirmId: (id: string | null) => void;
  handleCancelEdit: () => void;
  saveEdit: (overrideEndDate?: string) => void;
  isFormValid: boolean;
  isDriveActive?: boolean;
  existingFileNames?: string[];
  onFileUploaded?: (file: {
    name: string;
    path?: string;
    size?: string;
    duration?: string;
    mtimeMs?: number;
    modifiedTime?: string;
  }) => void;
}

function formatMonthDay(raw?: string): string {
  if (!raw || !raw.trim()) return '';
  const clean = raw.trim();
  const ymdMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return `${parseInt(ymdMatch[2], 10)}/${parseInt(ymdMatch[3], 10)}`;
  }
  const dt = new Date(clean);
  if (isNaN(dt.getTime())) return clean;
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function AnnouncementEditorView({
  editingId,
  isNew,
  formData,
  setFormData,
  isDraggingClock,
  setIsDraggingClock,
  handleClockInteraction,
  handleAddMp3,
  onReuseGate,
  savedGates,
  initialFocusTarget,
  onClearInitialFocusTarget,
  logs,
  pickerDurations,
  metadataCache,
  previewUrl,
  togglePreview,
  setCopyEditorState,
  setPreviewScriptBackupUrl,
  setPreviewScriptOrigin,
  setPreviewScriptFromPicker,
  setPreviewScriptFile,
  setPickerTarget,
  setPickerMp3Id,
  setPickerItemIndex,
  setSearchQuery,
  setIsPickerOpen,
  toggleColumn,
  toggleRow,
  toggleGridCell,
  isSavingAnnouncement,
  setDeleteConfirmId,
  handleCancelEdit,
  saveEdit,
  isFormValid,
  isDriveActive = false,
  existingFileNames = [],
  onFileUploaded,
}: AnnouncementEditorViewProps) {
  const [showPastGates, setShowPastGates] = React.useState(false);
  const [showInactivatedGates, setShowInactivatedGates] = React.useState(false);
  const [highlightedGateId, setHighlightedGateId] = React.useState<string | null>(null);
  const [highlightedMediaKey, setHighlightedMediaKey] = React.useState<string | null>(null);
  const [lastDateAdjustment, setLastDateAdjustment] = React.useState<{
    targetKeys: string[];
    prevStartDate?: string;
    prevEndDate?: string;
    prevTimeGatedMp3s?: TimeGatedMp3[];
  } | null>(null);
  const [reactivatePromptState, setReactivatePromptState] = React.useState<{
    gate: TimeGatedMp3;
    missedCount: number;
  } | null>(null);
  const [gateDeleteConfirmState, setGateDeleteConfirmState] = React.useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [expandedInactivatedMediaGateIds, setExpandedInactivatedMediaGateIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [inactivateLastMediaPromptState, setInactivateLastMediaPromptState] = React.useState<{
    gateNumber: number;
  } | null>(null);

  // Direct file upload from gate media rows and backup MP3 sub-rows
  const gateUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const [gateUploadTarget, setGateUploadTarget] = React.useState<{
    gateId: string;
    itemIndex: number | null;
    mode?: 'replace' | 'append' | 'backup';
  } | null>(null);
  const [isGateUploading, setIsGateUploading] = React.useState(false);
  const [gateUploadError, setGateUploadError] = React.useState<string | null>(null);
  const [pendingGateUploadCollision, setPendingGateUploadCollision] = React.useState<{
    file: File;
    existingName: string;
    copyCandidateName: string;
    target: { gateId: string; itemIndex: number | null; mode?: 'replace' | 'append' | 'backup' };
  } | null>(null);

  const generateUniqueGateUploadName = (originalName: string): string => {
    const ext = getFileExtension(originalName);
    const stem = ext ? originalName.slice(0, -ext.length) : originalName;
    const lowerSet = new Set(existingFileNames.map(n => n.toLowerCase()));
    let candidate = `${stem} (2)${ext}`;
    let counter = 2;
    while (lowerSet.has(candidate.toLowerCase())) {
      counter += 1;
      candidate = `${stem} (${counter})${ext}`;
    }
    return candidate;
  };

  const attachUploadedFileToGate = (
    savedFile: {
      name: string;
      path?: string;
      size?: string;
      duration?: string;
      mtimeMs?: number;
      modifiedTime?: string;
    },
    target: { gateId: string; itemIndex: number | null; mode?: 'replace' | 'append' | 'backup' }
  ) => {
    const fileUrl = savedFile.path || savedFile.name;
    const isAudio = isAudioFile(savedFile.name.toLowerCase());
    const currentList = formData.timeGatedMp3s || [];
    const updated = currentList.map(m => {
      if (m.id !== target.gateId) return m;
      const items = getGateMediaItems(m);
      if (target.mode === 'backup' && target.itemIndex !== null) {
        return {
          ...m,
          mediaItems: items.map((mi, iIdx) =>
            iIdx === target.itemIndex ? { ...mi, backupMp3Url: fileUrl } : mi
          ),
        };
      }
      const newMediaEntry: TimeGatedMediaItem = {
        mp3Url: fileUrl,
        assetType: isAudio ? 'audio' : 'script',
        fileSize: savedFile.size,
        ...(isAudio && savedFile.duration ? { duration: savedFile.duration } : {}),
      };
      if (target.mode === 'append' || target.itemIndex === null || target.itemIndex >= items.length) {
        const cleaned = items.filter(mi => Boolean(mi.mp3Url && mi.mp3Url.trim()) || Boolean(mi.inactivated));
        return {
          ...m,
          mediaItems: [...cleaned, newMediaEntry],
        };
      }
      const nextItems: TimeGatedMediaItem[] = [];
      items.forEach((mi, iIdx) => {
        if (iIdx === target.itemIndex) {
          const oldFileLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
          const newFileLower = getFilenameFromUrlOrPath(fileUrl).toLowerCase();
          const existingPlays =
            oldFileLower && oldFileLower !== newFileLower
              ? calculateGatedTrackAudit(editingId || formData.id || '', mi.mp3Url || '', logs, {
                  gate: m,
                  announcement: formData,
                  itemIndex: iIdx,
                }).totalPlays
              : 0;
          if (existingPlays > 0) {
            nextItems.push({
              ...mi,
              inactivated: true,
              inactivatedAt: getCurrentDatetimeLocal(),
            });
            setExpandedInactivatedMediaGateIds(prev => {
              const next = new Set(prev);
              next.add(target.gateId);
              return next;
            });
          }
          nextItems.push({
            ...mi,
            ...newMediaEntry,
            inactivated: undefined,
            inactivatedAt: undefined,
          });
        } else {
          nextItems.push(mi);
        }
      });
      return {
        ...m,
        mediaItems: nextItems,
      };
    });
    setFormData(prev => ({
      ...prev,
      timeGatedMp3s: updated,
    }));
  };

  const performGateFileUpload = async (
    file: File,
    target: { gateId: string; itemIndex: number | null; mode?: 'replace' | 'append' | 'backup' },
    targetFileNameOverride?: string,
    allowOverwrite: boolean = false
  ) => {
    setGateUploadError(null);
    setIsGateUploading(true);
    try {
      const saved = await uploadAnnouncementMediaFile(file, {
        targetFileNameOverride,
        allowOverwrite,
        isDriveActive,
      });
      const nowMs = saved.mtimeMs || Date.now();
      const nowIsoStr = saved.modifiedTime || new Date(nowMs).toISOString();
      upsertMediaCatalogFile({
        name: saved.name,
        path: saved.path || saved.name,
        size: saved.size || '0.1 MB',
        duration: saved.duration || '',
        mtimeMs: nowMs,
        modifiedTime: nowIsoStr,
      });
      if (onFileUploaded) {
        onFileUploaded({
          name: saved.name,
          path: saved.path,
          size: saved.size,
          duration: saved.duration,
          mtimeMs: nowMs,
          modifiedTime: nowIsoStr,
        });
      }
      attachUploadedFileToGate(saved, target);
      setPendingGateUploadCollision(null);
      setGateUploadTarget(null);
    } catch (err: any) {
      if (err && err.exists) {
        const existingName = err.name || targetFileNameOverride || file.name;
        setPendingGateUploadCollision({
          file,
          existingName,
          copyCandidateName: generateUniqueGateUploadName(existingName),
          target,
        });
      } else {
        setGateUploadError(err?.message || 'Failed to upload file');
      }
    } finally {
      setIsGateUploading(false);
    }
  };

  const handleGateFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected || !gateUploadTarget) return;
    const matchExisting = existingFileNames.find(
      n => n.toLowerCase() === selected.name.trim().toLowerCase()
    );
    if (matchExisting) {
      setPendingGateUploadCollision({
        file: selected,
        existingName: matchExisting,
        copyCandidateName: generateUniqueGateUploadName(matchExisting),
        target: gateUploadTarget,
      });
      return;
    }
    performGateFileUpload(selected, gateUploadTarget, selected.name, false);
  };

  // Track gate IDs that were active when the editor opened (or added/reactivated during this edit session)
  // so changing an active gate's End date into the past does not abruptly drop it into Past / Inactivated Gates mid-edit (#71).
  const [sessionActiveGateIds, setSessionActiveGateIds] = React.useState<Set<string>>(() => {
    const initialNow = getCurrentDatetimeLocal();
    const initialList = formData.timeGatedMp3s || [];
    return new Set(
      initialList
        .filter(g => !isGateExpiredOrInactivated(g, initialNow))
        .map(g => g.id)
    );
  });
  const knownGateIdsRef = React.useRef<Set<string>>(
    new Set((formData.timeGatedMp3s || []).map(g => g.id))
  );

  const [pendingDateFocusGateId, setPendingDateFocusGateId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const initialNow = getCurrentDatetimeLocal();
    const initialList = formData.timeGatedMp3s || [];
    knownGateIdsRef.current = new Set(initialList.map(g => g.id));
    setSessionActiveGateIds(
      new Set(
        initialList
          .filter(g => !isGateExpiredOrInactivated(g, initialNow))
          .map(g => g.id)
      )
    );
    setLastDateAdjustment(null);
    setPendingDateFocusGateId(null);
  }, [editingId]);

  const announcementAudit = React.useMemo(
    () => calculateGatedTrackAudit(formData.id || editingId || '', '', logs, { announcement: formData }),
    [formData, editingId, logs]
  );
  const announcementTotalPlays = isNew ? 0 : announcementAudit.totalPlays;
  const announcementFirstUsedFormatted = announcementAudit.firstUsedAt
    ? formatDatetime12(formatToDatetimeLocal(announcementAudit.firstUsedAt))
    : '—';
  const announcementLastUsedFormatted = announcementAudit.lastUsedAt
    ? formatDatetime12(formatToDatetimeLocal(announcementAudit.lastUsedAt))
    : '—';

  const focusDateInputByKey = (targetKey: string) => {
    if (typeof document === 'undefined') return;
    window.setTimeout(() => {
      const el = document.querySelector(`input[data-date-input-key="${targetKey}"]`) as HTMLInputElement | null;
      if (el && typeof el.focus === 'function') {
        el.focus({ preventScroll: false });
      }
    }, 30);
  };

  const focusGateAndMedia = React.useCallback(
    (gateId: string, itemIndex: number = 0, focusStartInput: boolean = false) => {
      if (typeof document === 'undefined') return;
      const nowCheck = getCurrentDatetimeLocal();
      const targetGate = (formData.timeGatedMp3s || []).find(g => g.id === gateId);
      if (targetGate) {
        if (targetGate.inactivated) {
          setShowInactivatedGates(true);
        } else if (
          isGateExpiredOrInactivated(targetGate, nowCheck) &&
          !sessionActiveGateIds.has(targetGate.id)
        ) {
          setShowPastGates(true);
        }
      }
      setHighlightedGateId(gateId);
      setHighlightedMediaKey(`${gateId}-${itemIndex}`);

      const attemptScrollAndFocus = () => {
        const mediaRowEl = document.querySelector(
          `[data-gate-media-key="${gateId}-${itemIndex}"]`
        ) as HTMLElement | null;
        const gateCardEl = document.querySelector(
          `[data-gate-card-id="${gateId}"]`
        ) as HTMLElement | null;
        const startInputEl = document.querySelector(
          `input[data-date-input-key="gate-${gateId}-start"]`
        ) as HTMLInputElement | null;

        const scrollTarget = focusStartInput ? gateCardEl || mediaRowEl : mediaRowEl || gateCardEl;
        if (scrollTarget && typeof scrollTarget.scrollIntoView === 'function') {
          scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (focusStartInput && startInputEl && !startInputEl.disabled) {
          startInputEl.focus({ preventScroll: true });
        } else if (mediaRowEl) {
          const firstBtn = mediaRowEl.querySelector('button:not([disabled])') as HTMLButtonElement | null;
          if (firstBtn) {
            firstBtn.focus({ preventScroll: true });
          } else if (startInputEl && !startInputEl.disabled) {
            startInputEl.focus({ preventScroll: true });
          }
        }
      };

      window.setTimeout(attemptScrollAndFocus, 60);
      window.setTimeout(attemptScrollAndFocus, 180);

      window.setTimeout(() => {
        setHighlightedGateId(prev => (prev === gateId ? null : prev));
        setHighlightedMediaKey(prev => (prev === `${gateId}-${itemIndex}` ? null : prev));
      }, 2400);
    },
    [formData.timeGatedMp3s, sessionActiveGateIds]
  );

  React.useEffect(() => {
    if (!initialFocusTarget) return;
    const { gateId, itemIndex = 0, mp3Url } = initialFocusTarget;
    const gates = formData.timeGatedMp3s || [];
    let resolvedGateId = gateId;
    let resolvedItemIdx = itemIndex;
    if (!resolvedGateId && mp3Url) {
      const targetName = getFilenameFromUrlOrPath(mp3Url).toLowerCase();
      for (const g of gates) {
        const items = getGateMediaItems(g);
        const foundIdx = items.findIndex(
          mi => getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === targetName
        );
        if (foundIdx !== -1) {
          resolvedGateId = g.id;
          resolvedItemIdx = foundIdx;
          break;
        }
      }
    }
    if (!resolvedGateId && gates.length > 0) {
      resolvedGateId = gates[0].id;
      resolvedItemIdx = 0;
    }
    if (resolvedGateId) {
      focusGateAndMedia(resolvedGateId, resolvedItemIdx, false);
    }
    if (onClearInitialFocusTarget) {
      onClearInitialFocusTarget();
    }
  }, [initialFocusTarget, formData.timeGatedMp3s, focusGateAndMedia, onClearInitialFocusTarget]);

  const recordDateAdjustment = (targetKeyOrKeys: string | string[], applyFn: () => void) => {
    const keys = Array.isArray(targetKeyOrKeys) ? targetKeyOrKeys : [targetKeyOrKeys];
    const prevSnapshot = {
      targetKeys: keys,
      prevStartDate: formData.startDate,
      prevEndDate: formData.endDate,
      prevTimeGatedMp3s: (formData.timeGatedMp3s || []).map(g => ({
        ...g,
        mediaItems: getGateMediaItems(g).map(mi => ({ ...mi })),
      })),
    };
    setLastDateAdjustment(prevSnapshot);
    applyFn();
    if (keys[0]) {
      focusDateInputByKey(keys[0]);
    }
  };

  const renderInlineUndoButton = (targetKey: string) => {
    if (!lastDateAdjustment || !lastDateAdjustment.targetKeys.includes(targetKey)) return null;
    return (
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          const snap = lastDateAdjustment;
          setLastDateAdjustment(null);
          setFormData(prev => ({
            ...prev,
            startDate: snap.prevStartDate,
            endDate: snap.prevEndDate,
            timeGatedMp3s: snap.prevTimeGatedMp3s || prev.timeGatedMp3s,
          }));
          focusDateInputByKey(targetKey);
        }}
        className="ml-0.5 p-0.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center justify-center cursor-pointer shadow-2xs shrink-0 transition-colors"
        title={
          lastDateAdjustment.targetKeys.length > 1
            ? `Undo date adjustments (${lastDateAdjustment.targetKeys.length} dates)`
            : 'Undo date adjustment'
        }
      >
        <RotateCcw className="w-3 h-3 stroke-[2.5]" />
      </button>
    );
  };

  const buildMediaFilenameTooltip = (rawUrl?: string, prefixLabel?: string): string => {
    if (!rawUrl || !rawUrl.trim()) return 'No file selected';
    const fileName = getFilenameFromUrlOrPath(rawUrl);
    const baseText = prefixLabel ? `${prefixLabel}: ${fileName}` : fileName;
    const meta = metadataCache[fileName];
    if (meta && (meta.title || meta.artist || meta.album)) {
      const metaParts = [
        meta.title ? `Title: ${meta.title}` : '',
        meta.artist ? `Artist: ${meta.artist}` : '',
        meta.album ? `Album: ${meta.album}` : '',
      ].filter(Boolean);
      if (metaParts.length > 0) {
        return `${baseText}\nMetadata: ${metaParts.join(' • ')}`;
      }
    }
    return baseText;
  };

  const allGateRangesForCalendar = React.useMemo(() => {
    const list = formData.timeGatedMp3s || [];
    const nowCheck = getCurrentDatetimeLocal();
    return list
      .map((g, idx) => {
        const sFormatted = g.startDate ? formatToDatetimeLocal(g.startDate) : '';
        const eFormatted = g.endDate ? formatToDatetimeLocal(g.endDate) : '';
        return {
          gate: g,
          id: g.id,
          label: `Gate #${idx + 1}`,
          startDate: getDatePart(sFormatted),
          endDate: getDatePart(eFormatted),
          startIso: sFormatted || undefined,
          endIso: eFormatted || undefined,
        };
      })
      .filter(
        ({ gate }) =>
          !gate.inactivated &&
          (!isGateExpiredOrInactivated(gate, nowCheck) || sessionActiveGateIds.has(gate.id))
      )
      .map(({ id, label, startDate, endDate, startIso, endIso }) => ({
        id,
        label,
        startDate,
        endDate,
        startIso,
        endIso,
      }));
  }, [formData.timeGatedMp3s, sessionActiveGateIds]);

  const playedGateBounds = React.useMemo(
    () =>
      computePlayedGateBoundsMap(
        { ...formData, id: editingId || formData.id },
        formData.timeGatedMp3s || [],
        logs,
        savedGates
      ),
    [formData, editingId, logs, savedGates]
  );

  const { overallFirstPlayed, overallLastPlayed } = React.useMemo(() => {
    let first: string | null = null;
    let last: string | null = null;
    Object.keys(playedGateBounds).forEach(gateId => {
      const b = playedGateBounds[gateId];
      if (b && b.playCount > 0) {
        if (b.firstPlayedLocalIso && (!first || b.firstPlayedLocalIso < first)) {
          first = b.firstPlayedLocalIso;
        }
        if (b.lastPlayedLocalIso && (!last || b.lastPlayedLocalIso > last)) {
          last = b.lastPlayedLocalIso;
        }
      }
    });
    return { overallFirstPlayed: first, overallLastPlayed: last };
  }, [playedGateBounds]);

  React.useEffect(() => {
    const currentList = formData.timeGatedMp3s || [];
    const newlyAddedActiveIds: string[] = [];
    for (const g of currentList) {
      if (!knownGateIdsRef.current.has(g.id)) {
        knownGateIdsRef.current.add(g.id);
        if (!g.inactivated) {
          newlyAddedActiveIds.push(g.id);
        }
      }
    }
    if (newlyAddedActiveIds.length > 0) {
      setSessionActiveGateIds(prev => {
        const next = new Set(prev);
        newlyAddedActiveIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [formData.timeGatedMp3s]);

  const dateFocusTimersRef = React.useRef<number[]>([]);
  const clearDateFocusTimers = React.useCallback(() => {
    dateFocusTimersRef.current.forEach(id => window.clearTimeout(id));
    dateFocusTimersRef.current = [];
  }, []);

  React.useEffect(() => clearDateFocusTimers, [clearDateFocusTimers]);
  React.useEffect(() => {
    clearDateFocusTimers();
  }, [editingId, clearDateFocusTimers]);

  // Smart auto-focus, scroll, and calendar open on Create / Reuse / Reactivate:
  // Priority 1: Gap handler or open-ended prior gate End immediately before target gate
  // Priority 2: Target gate Start (if unset or has Start warning/error and not locked)
  // Priority 3: Target gate End (if unset or has End warning/error)
  // All Clear: Scroll to gate card only — do NOT open any calendar
  React.useEffect(() => {
    if (!pendingDateFocusGateId || typeof document === 'undefined') return;
    const currentList = formData.timeGatedMp3s || [];
    const targetGate = currentList.find(g => g.id === pendingDateFocusGateId);
    if (!targetGate) return;

    clearDateFocusTimers();
    setPendingDateFocusGateId(null);
    setHighlightedGateId(targetGate.id);
    const clearHighlightTimer = window.setTimeout(() => {
      setHighlightedGateId(prev => (prev === targetGate.id ? null : prev));
    }, 2400);
    dateFocusTimersRef.current.push(clearHighlightTimer);

    const nowIso = getCurrentDatetimeLocal();
    const preExistingExpiredIds = new Set<string>(
      (savedGates || [])
        .filter(g => !g.inactivated && isGateExpiredOrInactivated(g, nowIso))
        .map(g => g.id)
    );
    const liveValidation = validateTimeGatedMp3s(
      currentList,
      nowIso,
      formData.endDate,
      formData.startDate,
      playedGateBounds,
      preExistingExpiredIds
    );

    const activeGates = currentList.filter(item => {
      const rawExpired = isGateExpiredOrInactivated(item, nowIso);
      const isKeptInActive = !item.inactivated && sessionActiveGateIds.has(item.id);
      return !(rawExpired && !isKeptInActive);
    });
    const activeIdx = activeGates.findIndex(g => g.id === targetGate.id);
    const prevGate = activeIdx > 0 ? activeGates[activeIdx - 1] : undefined;

    const targetBounds = playedGateBounds[targetGate.id];
    const targetAssessment = calculateGateSlotAssessment(formData, targetGate, logs);
    const targetPlayCount = Math.max(
      targetAssessment.gateScore.played,
      targetBounds?.playCount || 0
    );
    const isTargetStartLocked = targetPlayCount > 0;
    const hasRenderedGapHandlerBefore = Boolean(
      document.querySelector(`[data-gap-handler-for="${targetGate.id}"]`)
    );

    let action:
      | { type: 'gap-handler'; gateId: string }
      | { type: 'calendar'; key: string; cardGateId: string }
      | { type: 'card-only'; gateId: string };

    // Priority 1: Open-ended prior gate or gap handler immediately before target gate
    if (prevGate && (!prevGate.endDate || !prevGate.endDate.trim())) {
      action = { type: 'calendar', key: `gate-${prevGate.id}-end`, cardGateId: prevGate.id };
    } else if (liveValidation.gapStartIds.has(targetGate.id) || hasRenderedGapHandlerBefore) {
      action = { type: 'gap-handler', gateId: targetGate.id };
    }
    // Priority 2: Target gate Start unset or has Start warning/error (and unlocked)
    else if (
      !isTargetStartLocked &&
      (!targetGate.startDate?.trim() ||
        liveValidation.missingStartIds.has(targetGate.id) ||
        liveValidation.overlapStartIds.has(targetGate.id) ||
        liveValidation.overreachStartIds.has(targetGate.id))
    ) {
      action = { type: 'calendar', key: `gate-${targetGate.id}-start`, cardGateId: targetGate.id };
    }
    // Priority 3: Target gate End unset or has End warning/error
    else if (
      !targetGate.endDate?.trim() ||
      liveValidation.overlapEndIds.has(targetGate.id) ||
      liveValidation.overreachEndIds.has(targetGate.id) ||
      liveValidation.gapEndIds.has(targetGate.id) ||
      (liveValidation.errors[targetGate.id] || []).length > 0
    ) {
      action = { type: 'calendar', key: `gate-${targetGate.id}-end`, cardGateId: targetGate.id };
    }
    // All Clear: Scroll to gate card only without opening a calendar
    else {
      action = { type: 'card-only', gateId: targetGate.id };
    }

    const scrollTimer = window.setTimeout(() => {
      if (action.type === 'gap-handler') {
        const gapEl = document.querySelector(
          `[data-gap-handler-for="${action.gateId}"]`
        ) as HTMLElement | null;
        if (gapEl) {
          gapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusGapBtnTimer = window.setTimeout(() => {
            const firstBtn = gapEl.querySelector('button:not([disabled])') as HTMLButtonElement | null;
            if (firstBtn) {
              firstBtn.focus({ preventScroll: true });
            }
          }, 180);
          dateFocusTimersRef.current.push(focusGapBtnTimer);
          return;
        }
        const fallbackCard = document.querySelector(
          `[data-gate-card-id="${action.gateId}"]`
        ) as HTMLElement | null;
        if (fallbackCard) {
          fallbackCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      if (action.type === 'calendar') {
        const inputEl = document.querySelector(
          `input[data-date-input-key="${action.key}"]`
        ) as HTMLInputElement | null;
        const cardEl = document.querySelector(
          `[data-gate-card-id="${action.cardGateId}"]`
        ) as HTMLElement | null;
        const scrollEl = cardEl || inputEl;
        if (scrollEl && typeof scrollEl.scrollIntoView === 'function') {
          scrollEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (inputEl && !inputEl.disabled) {
          const openCalTimer = window.setTimeout(() => {
            inputEl.focus({ preventScroll: true });
            window.dispatchEvent(
              new CustomEvent('amp-open-calendar-input', { detail: { key: action.key } })
            );
          }, 200);
          dateFocusTimersRef.current.push(openCalTimer);
        }
        return;
      }

      const cardEl = document.querySelector(
        `[data-gate-card-id="${action.gateId}"]`
      ) as HTMLElement | null;
      if (cardEl && typeof cardEl.scrollIntoView === 'function') {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
    dateFocusTimersRef.current.push(scrollTimer);
  }, [
    pendingDateFocusGateId,
    formData,
    savedGates,
    logs,
    playedGateBounds,
    sessionActiveGateIds,
    clearDateFocusTimers,
  ]);

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-300 flex flex-col h-full overflow-hidden shadow-md transition-all duration-300',
        !formData.enabled &&
          'bg-orange-50/40 border-orange-500 border-2 shadow-[0_0_12px_rgba(249,115,22,0.15)] ring-1 ring-orange-500'
      )}
    >
      {/* Top General Header Block: Fixed shrink-0 block above the scroll container so the scrollbar never extends past the scrollable lower area and scrolled content never bleeds behind the header */}
      <div className="@container px-3 py-2 border-b border-slate-300 bg-slate-100 shrink-0 z-20 shadow-2xs">
        <div className="rounded-lg border border-slate-350 bg-white overflow-hidden shadow-xs divide-y divide-slate-250">
          {/* Merged Top Section: Left Column (Segment 1 Context Banner + Segment 2 Name/History Row) & Right Merged Clock Cell */}
          <div className="flex items-stretch">
            <div className="flex-1 min-w-0 divide-y divide-slate-250">
              {/* Segment 1: Prominent Top Context Banner with Speaker + Document Icons, Larger ANNOUNCEMENT Title, & ID */}
              <div className="px-2.5 py-1 bg-slate-100 flex items-center justify-between gap-2 select-none flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    className="px-2.5 py-0.5 rounded bg-blue-600 text-white text-sm font-black uppercase tracking-widest shadow-2xs inline-flex items-center gap-1.5 shrink-0 cursor-help"
                    title={editingId === 'new' ? 'New Announcement' : `Announcement ID: ${formData.id}`}
                  >
                    <Volume2 className="w-4 h-4 text-white shrink-0" />
                    <span>ANNOUNCEMENT</span>
                    <FileText className="w-4 h-4 text-white shrink-0" />
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-600 truncate">
                    {isNew ? 'New Announcement' : 'View / Edit Announcement'}
                  </span>
                  {!isNew && (
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-1.5 py-0.5 rounded border leading-none',
                        formData.enabled !== false
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      )}
                    >
                      {formData.enabled !== false ? 'Active' : 'Inactivated'}
                    </span>
                  )}
                </div>

                {!isNew && formData.id && (
                  <span className="text-[11px] font-mono font-bold text-slate-500 shrink-0 ml-auto">
                    ID: {formData.id}
                  </span>
                )}
              </div>

              {/* Segment 2: Compact Name + History Badge Row (Inactivate/Delete lives solely in the bottom-left footer bar) */}
              <div className="px-2.5 py-1 bg-white flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-stretch w-full shadow-2xs rounded overflow-hidden border border-slate-350 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white h-6.5">
                    <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-wider px-2 flex items-center justify-center leading-none select-none shrink-0 text-center">
                      <span>Name</span>
                    </div>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Name is required"
                      className={cn(
                        'w-full px-2 py-0.5 text-xs font-black text-slate-800 bg-white outline-none placeholder:text-red-500 placeholder:font-bold h-full',
                        !formData.name && editingId ? 'bg-red-50/50' : ''
                      )}
                    />
                  </div>
                </div>

                {!isNew && (
                  <span
                    className="text-xs font-sans font-bold tabular-nums px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 select-none cursor-help h-6.5 flex items-center leading-none shrink-0"
                    title={formatSlotAssessmentTooltip(announcementAudit, {
                      scopeTitle: `${formData.name || 'Announcement'} Assessment (History)`,
                      firstUsedFormatted: announcementFirstUsedFormatted,
                      lastUsedFormatted: announcementLastUsedFormatted,
                    })}
                  >
                    History ({announcementTotalPlays})
                  </span>
                )}
              </div>
            </div>

            {/* Right Merged Cell: Interactive Clock Icon Spanning Both Segment 1 (Top Header) and Segment 2 (Name/History Row) with 2px border/padding */}
            <div
              className="shrink-0 border-l border-slate-250 bg-white hover:bg-slate-50 p-[2px] flex items-center justify-center select-none transition-colors"
              title={`Play Time: :${(formData.minute || 0).toString().padStart(2, '0')}m (drag or click clock to adjust minute)`}
            >
              <svg
                width="56"
                height="56"
                viewBox="0 0 80 80"
                className="cursor-pointer select-none active:brightness-95 transition-all w-[56px] h-[56px] shrink-0"
                onMouseDown={e => {
                  setIsDraggingClock(true);
                  handleClockInteraction(e);
                }}
                  onMouseMove={e => {
                    if (isDraggingClock) {
                      handleClockInteraction(e);
                    }
                  }}
                  onMouseUp={() => setIsDraggingClock(false)}
                  onMouseLeave={() => setIsDraggingClock(false)}
                  onTouchStart={e => {
                    setIsDraggingClock(true);
                    handleClockInteraction(e);
                  }}
                  onTouchMove={e => {
                    if (isDraggingClock) {
                      handleClockInteraction(e);
                    }
                  }}
                  onTouchEnd={() => setIsDraggingClock(false)}
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="38"
                    className={cn(
                      'fill-white stroke-slate-300 stroke-[2.5]',
                      isDraggingClock && 'stroke-blue-500 stroke-[3]'
                    )}
                  />
                  <text
                    x="40"
                    y="19"
                    textAnchor="middle"
                    className={cn(
                      'text-[13px] font-black fill-slate-500 select-none',
                      isDraggingClock && 'fill-slate-700'
                    )}
                  >
                    0
                  </text>
                  <text x="66" y="44" textAnchor="middle" className="text-[11px] font-bold fill-slate-400 select-none">
                    15
                  </text>
                  <text x="40" y="71" textAnchor="middle" className="text-[11px] font-bold fill-slate-400 select-none">
                    30
                  </text>
                  <text x="14" y="44" textAnchor="middle" className="text-[11px] font-bold fill-slate-400 select-none">
                    45
                  </text>
                  {Array.from({ length: 12 }).map((_, idx) => {
                    const angle = idx * 30;
                    if (idx % 3 === 0) return null;
                    return (
                      <line
                        key={idx}
                        x1="40"
                        y1="5"
                        x2="40"
                        y2="9"
                        transform={`rotate(${angle}, 40, 40)`}
                        className={cn(
                          'stroke-slate-300 stroke-[2]',
                          isDraggingClock && 'stroke-slate-400'
                        )}
                      />
                    );
                  })}
                  <line
                    x1="40"
                    y1="40"
                    x2="40"
                    y2="10"
                    transform={`rotate(${(formData.minute || 0) * 6}, 40, 40)`}
                    stroke={isDraggingClock ? '#1e3a8a' : '#2563eb'}
                    strokeWidth={isDraggingClock ? 5.5 : 4.5}
                    strokeLinecap="round"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="5"
                    className={cn('fill-slate-800', isDraggingClock && 'fill-slate-950')}
                  />
                  <circle cx="40" cy="40" r="1.5" className="fill-white" />
              </svg>
            </div>
          </div>

          {/* Segment 3: Compact Type & Play Time Row with Internal Segmentation */}
          <div className="px-2.5 py-1 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-[180px] flex-1">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest shrink-0 select-none">
                  Type
                </label>
                {!isNew ? (
                  <div className="px-2.5 py-0.5 rounded border border-slate-350 bg-white text-xs font-bold text-slate-700 flex-1 select-none h-6.5 flex items-center shadow-2xs leading-none">
                    {formData.type === AnnouncementType.ONE_TIME && 'One-Time Play'}
                    {formData.type === AnnouncementType.BASIC_HOURLY && 'Repeating Hourly'}
                    {formData.type === AnnouncementType.ADVANCED && 'Advanced Calendar'}
                  </div>
                ) : (
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as AnnouncementType })}
                    className="px-2 py-0.5 rounded border text-xs font-black outline-none transition-all flex-1 bg-white border-slate-350 text-slate-700 hover:border-blue-400 cursor-pointer h-6.5 shadow-2xs leading-none"
                  >
                    <option value={AnnouncementType.ONE_TIME}>One-Time Play</option>
                    <option value={AnnouncementType.BASIC_HOURLY}>Repeating Hourly</option>
                    <option value={AnnouncementType.ADVANCED}>Advanced Calendar</option>
                  </select>
                )}
              </div>

              <div className="h-4 w-px bg-slate-300 hidden @[460px]:block shrink-0" />

              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest shrink-0 select-none">
                  Play Time
                </label>
                <div className="flex items-center gap-1">
                  <div className="relative w-13 shrink-0">
                    <input
                      type="text"
                      value={`:${(formData.minute || 0).toString().padStart(2, '0')}`}
                      onChange={e => {
                        const clean = e.target.value.replace(/\D/g, '');
                        const parsed = parseInt(clean, 10);
                        const val = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
                        setFormData({ ...formData, minute: val });
                      }}
                      className="w-full text-center text-blue-600 bg-white pl-1 pr-3.5 py-0.5 border border-slate-350 rounded font-black outline-none focus:ring-1 focus:ring-blue-500 text-xs h-6.5 shadow-2xs"
                    />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-400 pointer-events-none select-none">
                      m
                    </span>
                  </div>

                  <div className="flex flex-col -space-y-px shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const val = ((formData.minute || 0) + 1) % 60;
                        const wrapped = val >= 60 ? 0 : val;
                        setFormData({ ...formData, minute: wrapped });
                      }}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-t rounded-b-none text-slate-700 h-[13.5px] w-5 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-2xs"
                      title="Increase Minute"
                    >
                      <ChevronUp className="w-3 h-3 stroke-[3]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = ((formData.minute || 0) - 1 + 60) % 60;
                        setFormData({ ...formData, minute: val });
                      }}
                      className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-b rounded-t-none text-slate-700 h-[13.5px] w-5 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-2xs"
                      title="Decrease Minute"
                    >
                      <ChevronDown className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Segment 4: Compact Whole-Announcement Start & End Row Highlighted in Solid Blue */}
            <div className="px-2.5 py-1 bg-blue-50 border-t-2 border-t-blue-400 flex flex-col @[460px]:flex-row @[460px]:items-center gap-y-0.5 gap-x-3">
              <div className="text-xs font-black text-blue-950 uppercase tracking-wider @[460px]:w-[116px] shrink-0 select-none leading-tight">
                Announcement
              </div>
              <div className="ann-gate-dates-group flex-1 min-w-0">
                <div className="flex items-center gap-1 shrink-0">
                  <label
                    className="text-xs font-black text-blue-900 uppercase tracking-wider w-11 pr-1 shrink-0 select-none"
                    title="Effective Start"
                  >
                    Start
                  </label>
                  <div className="flex items-center gap-px">
                    <CalendarDateInput
                      inputDataKey="ann-start"
                      role="start"
                      pairedDate={getDatePart(formData.endDate)}
                      currentTime={getTimePart(formData.startDate) || '00:00'}
                      pairedTime={getTimePart(formData.endDate) || '23:59'}
                      gateRanges={allGateRangesForCalendar}
                      hardMaxDate={overallFirstPlayed ? getDatePart(overallFirstPlayed) : undefined}
                      hardMaxReason={
                        overallFirstPlayed
                          ? `Cannot start after first logged play (${formatDatetime12(overallFirstPlayed)}).`
                          : undefined
                      }
                      value={getDatePart(formData.startDate)}
                      onCalendarConfirm={(_newDate, prevDate) => {
                        const prevT = getTimePart(formData.startDate) || '00:00';
                        setLastDateAdjustment({
                          targetKeys: ['ann-start'],
                          prevStartDate: prevDate ? `${prevDate}T${prevT}` : '',
                          prevEndDate: formData.endDate,
                          prevTimeGatedMp3s: (formData.timeGatedMp3s || []).map(g => ({ ...g })),
                        });
                        focusDateInputByKey('ann-start');
                      }}
                      onChange={d => {
                        setLastDateAdjustment(null);
                        const t = getTimePart(formData.startDate) || '00:00';
                        const newVal = d ? `${d}T${t}` : '';
                        setFormData({ ...formData, startDate: newVal });
                      }}
                      className="w-[104px] p-0.5 border-0 border-b border-blue-400 rounded-none text-xs font-bold font-sans tabular-nums outline-none bg-white text-slate-900 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={getTimePart(formData.startDate)}
                        onChange={t => {
                          setLastDateAdjustment(null);
                          let d = getDatePart(formData.startDate);
                          if (!d && t) {
                            d = getCurrentDatetimeLocal().split('T')[0];
                          }
                          const newVal = d ? `${d}T${t || '00:00'}` : '';
                          setFormData({ ...formData, startDate: newVal });
                        }}
                        className="p-0.5 border-0 border-b border-blue-400 rounded-none text-xs font-bold outline-none bg-white text-slate-900 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                        placeholder="hh:mm AM"
                      />
                    </div>
                    {renderInlineUndoButton('ann-start')}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <label
                    className="text-xs font-black text-blue-900 uppercase tracking-wider w-11 pr-1 shrink-0 select-none"
                    title="Expiration Date"
                  >
                    End
                  </label>
                  <div className="flex items-center gap-px">
                    <CalendarDateInput
                      inputDataKey="ann-end"
                      role="end"
                      pairedDate={getDatePart(formData.startDate)}
                      currentTime={getTimePart(formData.endDate) || '23:59'}
                      pairedTime={getTimePart(formData.startDate) || '00:00'}
                      gateRanges={allGateRangesForCalendar}
                      hardMinDate={overallLastPlayed ? getDatePart(overallLastPlayed) : undefined}
                      hardMinReason={
                        overallLastPlayed
                          ? `Cannot end before last logged play (${formatDatetime12(overallLastPlayed)}).`
                          : undefined
                      }
                      value={getDatePart(formData.endDate)}
                      onCalendarConfirm={(_newDate, prevDate) => {
                        const prevT = getTimePart(formData.endDate) || '23:59';
                        setLastDateAdjustment({
                          targetKeys: ['ann-end'],
                          prevStartDate: formData.startDate,
                          prevEndDate: prevDate ? `${prevDate}T${prevT}` : undefined,
                          prevTimeGatedMp3s: (formData.timeGatedMp3s || []).map(g => ({ ...g })),
                        });
                        focusDateInputByKey('ann-end');
                      }}
                      onChange={d => {
                        setLastDateAdjustment(null);
                        if (!d) {
                          setFormData({ ...formData, endDate: undefined });
                          return;
                        }
                        const t = getTimePart(formData.endDate) || '23:59';
                        const newVal = `${d}T${t}`;
                        setFormData({ ...formData, endDate: newVal });
                      }}
                      className="w-[104px] p-0.5 border-0 border-b border-blue-400 rounded-none text-xs font-bold font-sans tabular-nums outline-none bg-white text-slate-900 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={getTimePart(formData.endDate)}
                        onChange={t => {
                          setLastDateAdjustment(null);
                          let d = getDatePart(formData.endDate);
                          if (!d && t) {
                            d = getDatePart(formData.startDate) || getCurrentDatetimeLocal().split('T')[0];
                          }
                          const newVal = d ? `${d}T${t || '23:59'}` : undefined;
                          setFormData({ ...formData, endDate: newVal });
                        }}
                        className="p-0.5 border-0 border-b border-blue-400 rounded-none text-xs font-bold outline-none bg-white text-slate-900 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                        placeholder="hh:mm AM"
                      />
                    </div>
                    {renderInlineUndoButton('ann-end')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Scrollable Lower Two-Column Area: GATE(S) & Weekly Calendar */}
      <div className="overflow-y-auto flex-1 min-h-0 custom-scrollbar p-4">
        <div className="grid grid-cols-1 min-[1500px]:grid-cols-[1fr_650px] gap-4 items-start">
            {/* Left Column: GATE(S) */}
            <div className="@container space-y-2.5 min-w-0">
              {/* Time-Gated Section */}
              <div className="space-y-0 mt-0">
              <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-t-lg select-none flex items-center justify-between gap-2 flex-wrap">
                <span>GATE(S)</span>
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-100 hover:text-white cursor-help"
                  title="Multiple files inside a gate will be auto rotated (1, 2, 3) across scheduled broadcast slots."
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="bg-white border-x border-b border-slate-350 rounded-b-lg overflow-hidden shadow-xs">
                {/* Hidden file input for direct Gate Media Row Upload button */}
                <input
                  type="file"
                  ref={gateUploadInputRef}
                  className="hidden"
                  accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,.txt,.md,audio/*,text/plain,text/markdown"
                  onChange={handleGateFileInputChange}
                />
                {(() => {
                  const currentMp3s = formData.timeGatedMp3s || [];
                  const nowIso = getCurrentDatetimeLocal();
                  const preExistingExpiredIds = new Set<string>(
                    (savedGates || [])
                      .filter(g => !g.inactivated && isGateExpiredOrInactivated(g, nowIso))
                      .map(g => g.id)
                  );
                  const validation = validateTimeGatedMp3s(
                    currentMp3s,
                    nowIso,
                    formData.endDate,
                    formData.startDate,
                    playedGateBounds,
                    preExistingExpiredIds
                  );

                  const addInlineDraftGate = (prefillStart?: string, prefillEnd?: string) => {
                    const gateId = `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                    let startIso = prefillStart !== undefined ? prefillStart : '';
                    let endIso: string | undefined = prefillEnd;

                    if (prefillStart === undefined) {
                      const activeList = currentMp3s.filter(
                        m => !isGateExpiredOrInactivated(m, nowIso) || (!m.inactivated && sessionActiveGateIds.has(m.id))
                      );
                      if (activeList.length === 0) {
                        const formStartIso = formData.startDate ? formatToDatetimeLocal(formData.startDate) : '';
                        const formEndIso = formData.endDate ? formatToDatetimeLocal(formData.endDate) : '';
                        // 2.x fix: When past/inactivated gates already exist or Announcement Start is in the past, start at now rather than the historical Announcement Start
                        startIso =
                          currentMp3s.length > 0 || !formStartIso || formStartIso < nowIso ? nowIso : formStartIso;
                        endIso = formEndIso && formEndIso > startIso ? formEndIso : undefined;
                      } else {
                        const lastActive = activeList[activeList.length - 1];
                        if (lastActive.endDate && lastActive.endDate.trim()) {
                          startIso = getNextGapAutoFillStart(lastActive.endDate).startIso;
                          const annEndLocal = formData.endDate ? formatToDatetimeLocal(formData.endDate) : '';
                          if (annEndLocal && annEndLocal > startIso) {
                            endIso = annEndLocal;
                          }
                        } else {
                          // Per #108 (13.a Option B): Leave Start and End blank when prior gate is open-ended
                          startIso = '';
                          endIso = undefined;
                        }
                      }
                    }

                    const newGate: TimeGatedMp3 = {
                      id: gateId,
                      startDate: startIso,
                      endDate: endIso,
                      mediaItems: [{ mp3Url: '' }],
                    };

                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.add(gateId);
                      return next;
                    });

                    const nextList = startIso
                      ? sortMp3sByStartDate([...currentMp3s, newGate])
                      : [...currentMp3s, newGate];
                    setFormData({
                      ...formData,
                      timeGatedMp3s: nextList,
                    });
                    setPendingDateFocusGateId(gateId);
                  };

                  if (currentMp3s.length === 0) {
                    return (
                      <div className="p-2 space-y-2 bg-slate-50/40">
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-center space-y-1">
                          <p className="text-xs font-bold text-amber-700 uppercase">
                            No gates added.
                          </p>
                          <p className="text-xs text-slate-600">
                            Click <span className="font-bold text-emerald-700">&apos;+ ADD GATE&apos;</span> below to
                            add a schedule gate.
                          </p>
                        </div>
                        <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-100/70">
                          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-slate-200/60">
                            <button
                              type="button"
                              onClick={() => addInlineDraftGate()}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs select-none"
                              title="Add a new schedule gate"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>ADD GATE</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const getOneMinuteBeforeIso = (isoStr: string): string => {
                    const formatted = formatToDatetimeLocal(isoStr);
                    const dPart = getDatePart(formatted);
                    const tPart = getTimePart(formatted) || '00:00';
                    const [y, m, d] = dPart.split('-').map(Number);
                    const [hh, mm] = tPart.split(':').map(Number);
                    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && !isNaN(hh) && !isNaN(mm)) {
                      const dt = new Date(y, m - 1, d, hh, mm - 1);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                    }
                    return formatted;
                  };

                  const getGateAssessment = (gate: TimeGatedMp3) =>
                    calculateGateSlotAssessment(formData, gate, logs);

                  const handleInactivateGate = (gate: TimeGatedMp3) => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const updated = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      return {
                        ...m,
                        inactivated: true,
                        inactivatedAt: currentNowIso,
                      };
                    });
                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.delete(gate.id);
                      return next;
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                  };

                  const applyInactivateSingleMediaItem = (targetGate: TimeGatedMp3, targetMIdx: number) => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const updated = currentMp3s.map(m => {
                      if (m.id !== targetGate.id) return m;
                      const existingItems = getGateMediaItems(m);
                      const nextItems = existingItems.map((mi, iIdx) =>
                        iIdx === targetMIdx
                          ? { ...mi, inactivated: true, inactivatedAt: currentNowIso }
                          : mi
                      );
                      const hasRemainingActive = nextItems.some(mi => !mi.inactivated);
                      return {
                        ...m,
                        mediaItems: hasRemainingActive ? nextItems : [{ mp3Url: '' }, ...nextItems],
                      };
                    });
                    setExpandedInactivatedMediaGateIds(prev => {
                      const next = new Set(prev);
                      next.add(targetGate.id);
                      return next;
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                    setInactivateLastMediaPromptState(null);
                  };

                  const handleReactivateMediaItem = (targetGate: TimeGatedMp3, targetMIdx: number) => {
                    const updated = currentMp3s.map(m => {
                      if (m.id !== targetGate.id) return m;
                      const existingItems = getGateMediaItems(m);
                      const restoredItems = existingItems
                        .map((mi, iIdx) => {
                          if (iIdx !== targetMIdx) return mi;
                          const nextMi = { ...mi };
                          delete nextMi.inactivated;
                          delete nextMi.inactivatedAt;
                          return nextMi;
                        })
                        .filter(mi => Boolean(mi.mp3Url && mi.mp3Url.trim()) || Boolean(mi.inactivated));
                      return {
                        ...m,
                        mediaItems: restoredItems.length > 0 ? restoredItems : [{ mp3Url: '' }],
                      };
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                  };

                  const countMissedSlotsDuringInactivation = (gate: TimeGatedMp3): number => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const inactIso =
                      gate.inactivatedAt && gate.inactivatedAt.trim()
                        ? formatToDatetimeLocal(gate.inactivatedAt)
                        : '';
                    if (!inactIso || inactIso >= currentNowIso) return 0;

                    const gStart =
                      gate.startDate && gate.startDate.trim()
                        ? formatToDatetimeLocal(gate.startDate)
                        : inactIso;
                    const windowStartIso = gStart > inactIso ? gStart : inactIso;
                    const gEnd =
                      gate.endDate && gate.endDate.trim()
                        ? formatToDatetimeLocal(gate.endDate)
                        : currentNowIso;
                    const windowEndIso = gEnd < currentNowIso ? gEnd : currentNowIso;
                    if (windowStartIso > windowEndIso) return 0;

                    const startMs = new Date(windowStartIso).getTime();
                    const endMs = new Date(windowEndIso).getTime();
                    if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) return 0;

                    const annMinute = Number(formData.minute) || 0;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const cursor = new Date(startMs);
                    cursor.setMinutes(annMinute, 0, 0);
                    if (cursor.getTime() < startMs) {
                      cursor.setHours(cursor.getHours() + 1);
                    }

                    let missed = 0;
                    let safety = 0;
                    while (cursor.getTime() <= endMs && safety < 2500) {
                      safety++;
                      const y = cursor.getFullYear();
                      const m = cursor.getMonth() + 1;
                      const d = cursor.getDate();
                      const h = cursor.getHours();
                      const localDateStr = `${y}-${pad(m)}-${pad(d)}`;
                      const slotIso = `${localDateStr}T${pad(h)}:${pad(annMinute)}`;
                      const dayOfWeek = cursor.getDay();

                      const matchesRule = isAnnouncementRuleMatch(
                        formData as Announcement,
                        dayOfWeek,
                        h,
                        annMinute,
                        localDateStr
                      );

                      if (matchesRule) {
                        const hasLogInHour =
                          Boolean(formData.id) &&
                          Array.isArray(logs) &&
                          logs.some(l => {
                            if (String(l.announcementId || '') !== String(formData.id)) return false;
                            const rawTs =
                              l.scheduledFor || l.executedAt || l.announcementTime || l.timestamp || '';
                            if (!rawTs) return false;
                            const logIso = formatToDatetimeLocal(String(rawTs));
                            return logIso.slice(0, 13) === slotIso.slice(0, 13);
                          });
                        if (!hasLogInHour) {
                          missed++;
                        }
                      }

                      cursor.setHours(cursor.getHours() + 1);
                    }

                    return missed;
                  };

                  const applyReactivateInPlace = (gate: TimeGatedMp3) => {
                    const updated = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      const next = { ...m };
                      delete next.inactivated;
                      delete next.inactivatedAt;
                      return next;
                    });
                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.add(gate.id);
                      return next;
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                    setReactivatePromptState(null);
                    setPendingDateFocusGateId(gate.id);
                  };

                  const applyReactivateSplitToNewGate = (gate: TimeGatedMp3) => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const closedEndIso =
                      gate.inactivatedAt && gate.inactivatedAt.trim()
                        ? formatToDatetimeLocal(gate.inactivatedAt)
                        : getOneMinuteBeforeIso(currentNowIso);
                    const gStart = gate.startDate ? formatToDatetimeLocal(gate.startDate) : '';

                    const updatedExisting = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      const next: TimeGatedMp3 = {
                        ...m,
                        startDate: gStart && gStart > closedEndIso ? closedEndIso : m.startDate,
                        endDate: closedEndIso,
                      };
                      delete next.inactivated;
                      delete next.inactivatedAt;
                      return next;
                    });

                    const rawSplitItems = getGateMediaItems(gate);
                    const activeSplitItems = rawSplitItems.filter(mi => !mi.inactivated);
                    const splitSourceItems = activeSplitItems.length > 0 ? activeSplitItems : rawSplitItems;
                    const newActiveGate: TimeGatedMp3 = {
                      id: `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      startDate: currentNowIso,
                      endDate: gate.endDate,
                      mediaItems: splitSourceItems.map(mi => {
                        const nextMi = { ...mi };
                        delete nextMi.inactivated;
                        delete nextMi.inactivatedAt;
                        return nextMi;
                      }),
                    };

                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.delete(gate.id);
                      next.add(newActiveGate.id);
                      return next;
                    });

                    const nextSorted = sortMp3sByStartDate([...updatedExisting, newActiveGate]);
                    setFormData({
                      ...formData,
                      timeGatedMp3s: nextSorted,
                    });
                    setReactivatePromptState(null);
                    setPendingDateFocusGateId(newActiveGate.id);
                  };

                  const handleReactivateGateClick = (gate: TimeGatedMp3) => {
                    const missedCount = countMissedSlotsDuringInactivation(gate);
                    if (missedCount <= 0) {
                      applyReactivateInPlace(gate);
                    } else {
                      setReactivatePromptState({ gate, missedCount });
                    }
                  };

                  const handleReuseGate = (gate: TimeGatedMp3) => {
                    if (onReuseGate) {
                      const reusedGateId = onReuseGate(gate);
                      if (reusedGateId) {
                        setSessionActiveGateIds(prev => {
                          const next = new Set(prev);
                          next.add(reusedGateId);
                          return next;
                        });
                        setPendingDateFocusGateId(reusedGateId);
                      }
                      return;
                    }
                    const rawFallbackItems = getGateMediaItems(gate);
                    const activeFallbackItems = rawFallbackItems.filter(mi => !mi.inactivated);
                    const fallbackSourceItems =
                      activeFallbackItems.length > 0 ? activeFallbackItems : rawFallbackItems;
                    const clonedGate: TimeGatedMp3 = {
                      id: `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      startDate: getCurrentDatetimeLocal(),
                      endDate: undefined,
                      mediaItems: fallbackSourceItems.map(mi => {
                        const nextMi = { ...mi };
                        delete nextMi.inactivated;
                        delete nextMi.inactivatedAt;
                        return nextMi;
                      }),
                    };

                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.add(clonedGate.id);
                      return next;
                    });

                    const nextSorted = sortMp3sByStartDate([...currentMp3s, clonedGate]);
                    setFormData({
                      ...formData,
                      timeGatedMp3s: nextSorted,
                    });
                    setPendingDateFocusGateId(clonedGate.id);
                  };

                  const indexedGates = currentMp3s.map((item, idx) => {
                    const rawExpired = isGateExpiredOrInactivated(item, nowIso);
                    // Keep gates that were active in this editing session in Active Gates until saved or explicitly inactivated (#71)
                    const isKeptInActiveDuringSession =
                      !item.inactivated && sessionActiveGateIds.has(item.id);
                    const isItemExpired = rawExpired && !isKeptInActiveDuringSession;
                    return { item, idx, isItemExpired };
                  });

                  const activeIndexedGates = indexedGates.filter(g => !g.isItemExpired);
                  const archivedIndexedGates = indexedGates.filter(g => g.isItemExpired);
                  const pastIndexedGates = archivedIndexedGates.filter(g => !g.item.inactivated);
                  const inactivatedIndexedGates = archivedIndexedGates.filter(g => Boolean(g.item.inactivated));

                  const renderGateCard = (item: TimeGatedMp3, idx: number, isItemExpired: boolean) => {
                    const rawItemErrors = validation.errors[item.id] || [];
                    const rawItemWarnings = validation.warnings[item.id] || [];
                    // Filter out inter-gate gap/overlap/overreach notices because they are represented by interstitial bars between/around gates
                    const itemErrors = rawItemErrors.filter(
                      msg =>
                        !msg.startsWith('Schedule overlap:') &&
                        !msg.startsWith('Overreach:') &&
                        !msg.includes('overlaps with Gate') &&
                        !msg.includes('starts before Gate') &&
                        !msg.includes('starts before Announcement')
                    );
                    const itemWarnings = rawItemWarnings.filter(
                      msg =>
                        !msg.startsWith('Schedule gap:') &&
                        !msg.startsWith('Gap ') &&
                        !msg.includes('ends after Announcement') &&
                        !msg.startsWith('Announcement ends ') &&
                        msg !== 'File attachment selection is missing.' &&
                        msg !== 'File attachment is required.'
                    );
                    const hasStartGap = validation.gapStartIds?.has(item.id);
                    const hasEndGap = validation.gapEndIds?.has(item.id);
                    const hasStartOverlap =
                      validation.overlapStartIds?.has(item.id) || validation.overreachStartIds?.has(item.id);
                    const hasEndOverlap =
                      validation.overlapEndIds?.has(item.id) || validation.overreachEndIds?.has(item.id);
                    const hasMissingStart =
                      validation.missingStartIds?.has(item.id) || !item.startDate || item.startDate.trim() === '';
                    const gateMediaItems = getGateMediaItems(item);
                    const indexedActiveMediaItems = gateMediaItems
                      .map((mItem, mIdx) => ({ mItem, mIdx }))
                      .filter(entry => !entry.mItem.inactivated);
                    const indexedInactivatedMediaItems = gateMediaItems
                      .map((mItem, mIdx) => ({ mItem, mIdx }))
                      .filter(entry => Boolean(entry.mItem.inactivated));
                    const activeRowsToRender =
                      indexedActiveMediaItems.length > 0
                        ? indexedActiveMediaItems
                        : [{ mItem: { mp3Url: '' } as TimeGatedMediaItem, mIdx: gateMediaItems.length }];
                    const totalActiveInGate = activeRowsToRender.length;
                    const isInactivatedMediaExpanded = expandedInactivatedMediaGateIds.has(item.id);
                    const gateAssessment = getGateAssessment(item);
                    const gateBounds = playedGateBounds[item.id];
                    const gatePlayCount = Math.max(
                      gateAssessment.gateScore.played,
                      gateBounds?.playCount || 0
                    );
                    const isStartLocked = isItemExpired || gatePlayCount > 0;
                    const isManuallyInactivated = Boolean(item.inactivated);
                    const isDateExpired = Boolean(
                      item.endDate && item.endDate.trim() && formatToDatetimeLocal(item.endDate) < nowIso
                    );
                    const isPendingArchiveOnSave = !isItemExpired && isDateExpired;
                    const canReactivateGate = isManuallyInactivated && !isDateExpired;

                    const activeGatePos = activeIndexedGates.findIndex(g => g.item.id === item.id);
                    const prevActiveGate =
                      activeGatePos > 0 ? activeIndexedGates[activeGatePos - 1].item : undefined;
                    const nextActiveGate =
                      activeGatePos >= 0 && activeGatePos < activeIndexedGates.length - 1
                        ? activeIndexedGates[activeGatePos + 1].item
                        : undefined;

                    const promptDeleteGate = () => {
                      setGateDeleteConfirmState({
                        title: `Delete Gate #${idx + 1}`,
                        message: `Are you sure you want to delete Gate #${idx + 1}? This unused gate has 0 logged plays and will be removed from this announcement.`,
                        confirmLabel: 'Delete Gate',
                        onConfirm: () => {
                          const remaining = currentMp3s.filter(m => m.id !== item.id);
                          setFormData({
                            ...formData,
                            timeGatedMp3s: remaining,
                          });
                          setGateDeleteConfirmState(null);
                        },
                      });
                    };

                    const updateGateStartDate = (newVal: string) => {
                      if (isStartLocked) return;
                      // Reciprocal boundary prefill (#108 / 13.a): if previous active gate is open-ended and this gate had an open start, prefill previous gate's End using 11:59-to-12:00 logic
                      const candidateBackfillEnd = newVal ? computeBackfilledEndTime(newVal) : undefined;
                      const prevGateLastPlayed = prevActiveGate
                        ? playedGateBounds[prevActiveGate.id]?.lastPlayedLocalIso
                        : null;
                      const backfillViolatesPrevLastPlay = Boolean(
                        candidateBackfillEnd &&
                          prevGateLastPlayed &&
                          formatToDatetimeLocal(candidateBackfillEnd) < prevGateLastPlayed
                      );
                      const shouldBackfillPrevEnd = Boolean(
                        newVal &&
                          prevActiveGate &&
                          (!prevActiveGate.endDate || !prevActiveGate.endDate.trim()) &&
                          (!item.startDate || !item.startDate.trim()) &&
                          !backfillViolatesPrevLastPlay
                      );
                      const backfilledPrevEnd = shouldBackfillPrevEnd ? candidateBackfillEnd : undefined;

                      const applyChange = () => {
                        const updated = currentMp3s.map(m => {
                          if (m.id === item.id) return { ...m, startDate: newVal };
                          if (shouldBackfillPrevEnd && prevActiveGate && m.id === prevActiveGate.id) {
                            return { ...m, endDate: backfilledPrevEnd };
                          }
                          return m;
                        });
                        setFormData({
                          ...formData,
                          timeGatedMp3s: updated,
                        });
                      };

                      if (shouldBackfillPrevEnd && prevActiveGate) {
                        recordDateAdjustment([`gate-${item.id}-start`, `gate-${prevActiveGate.id}-end`], applyChange);
                      } else {
                        applyChange();
                      }
                    };

                    const updateGateEndDate = (newVal: string | undefined) => {
                      if (isItemExpired) return;
                      // Reciprocal boundary prefill (#108 / 13.a): if next active gate has an open start and this gate was open-ended, prefill next gate's Start using 11:59-to-12:00 logic
                      const shouldForwardFillNextStart = Boolean(
                        newVal &&
                          nextActiveGate &&
                          (!nextActiveGate.startDate || !nextActiveGate.startDate.trim()) &&
                          (!item.endDate || !item.endDate.trim())
                      );
                      const autoNextStart =
                        shouldForwardFillNextStart && newVal ? getNextGapAutoFillStart(newVal).startIso : undefined;

                      const applyChange = () => {
                        const updated = currentMp3s.map(m => {
                          if (m.id === item.id) return { ...m, endDate: newVal };
                          if (shouldForwardFillNextStart && nextActiveGate && m.id === nextActiveGate.id && autoNextStart) {
                            return { ...m, startDate: autoNextStart };
                          }
                          return m;
                        });
                        setFormData({
                          ...formData,
                          timeGatedMp3s: updated,
                        });
                      };

                      if (shouldForwardFillNextStart && nextActiveGate && autoNextStart) {
                        recordDateAdjustment([`gate-${item.id}-end`, `gate-${nextActiveGate.id}-start`], applyChange);
                      } else {
                        applyChange();
                      }
                    };

                    return (
                      <div
                        key={item.id}
                        data-gate-card-id={item.id}
                        className={cn(
                          'border-2 border-slate-400 dark:border-slate-600 rounded-lg overflow-hidden shadow-xs transition-all',
                          isItemExpired
                            ? 'bg-slate-50/90'
                            : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-100/70',
                          (itemErrors.length > 0 || hasStartOverlap || hasEndOverlap) && 'bg-red-50/20 border-red-400',
                          highlightedGateId === item.id && 'ring-2 ring-blue-500 border-blue-500'
                        )}
                      >
                        <div
                          className={cn(
                            'px-2.5 py-1.5 flex flex-col @[460px]:flex-row @[460px]:items-center gap-y-1 gap-x-3',
                            isItemExpired
                              ? 'bg-slate-200/80 border-b border-slate-300'
                              : idx % 2 === 0
                                ? 'bg-blue-100/80 border-b border-blue-200'
                                : 'bg-blue-200/80 border-b border-blue-300'
                          )}
                        >
                          <div
                            className={cn(
                              'text-xs font-black uppercase tracking-wider @[460px]:w-[106px] shrink-0 select-none flex items-center gap-1 flex-wrap',
                              isItemExpired ? 'text-slate-700' : 'text-blue-950'
                            )}
                          >
                            <span>Gate #{idx + 1}</span>
                            {isManuallyInactivated ? (
                              <span
                                className="text-[10px] font-bold px-1 py-px rounded bg-amber-200/80 text-amber-900 border border-amber-300"
                                title={
                                  item.inactivatedAt
                                    ? `Inactivated at ${formatDatetime12(formatToDatetimeLocal(item.inactivatedAt))} (Original End date preserved)`
                                    : 'Manually inactivated (Original End date preserved)'
                                }
                              >
                                Inact.
                              </span>
                            ) : isItemExpired ? (
                              <span
                                className="text-[10px] font-bold px-1 py-px rounded bg-slate-300/80 text-slate-700"
                                title="Archived past gate (Read-only — click Reuse to schedule again)"
                              >
                                Past
                              </span>
                            ) : isPendingArchiveOnSave ? (
                              <span
                                className="text-[10px] font-bold px-1 py-px rounded bg-amber-200/90 text-amber-950 border border-amber-300"
                                title="End date is in the past — this gate will move to Past Gates when saved"
                              >
                                Past
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-x-2 gap-y-1 flex-1 min-w-0 justify-between flex-wrap">
                            <div className="ann-gate-dates-group shrink-0">
                              <div className="flex items-center gap-1 shrink-0">
                                <label
                                  className={cn(
                                    'text-xs font-black uppercase tracking-wider w-11 pr-1 shrink-0 select-none',
                                    hasStartOverlap
                                      ? 'text-red-700 font-black'
                                      : hasMissingStart
                                        ? 'text-amber-700 font-black'
                                        : hasStartGap
                                          ? 'text-amber-700 font-black'
                                          : isItemExpired
                                            ? 'text-slate-600'
                                            : 'text-blue-950'
                                  )}
                                >
                                  Start
                                </label>
                                <div className="flex items-center gap-px">
                                  <CalendarDateInput
                                    inputDataKey={`gate-${item.id}-start`}
                                    role="start"
                                    pairedDate={getDatePart(item.endDate)}
                                    currentTime={getTimePart(item.startDate) || '00:00'}
                                    pairedTime={getTimePart(item.endDate) || '23:59'}
                                    announcementStartDate={getDatePart(formData.startDate)}
                                    announcementEndDate={getDatePart(formData.endDate)}
                                    splitPriorGateId={
                                      prevActiveGate &&
                                      (!prevActiveGate.endDate || !prevActiveGate.endDate.trim())
                                        ? prevActiveGate.id
                                        : undefined
                                    }
                                    gateRanges={allGateRangesForCalendar.map(gr => ({
                                      ...gr,
                                      isCurrent: gr.id === item.id,
                                    }))}
                                    disabled={isStartLocked}
                                    value={getDatePart(item.startDate)}
                                    onCalendarConfirm={(newDate, prevDate) => {
                                      const prevT = getTimePart(item.startDate) || '00:00';
                                      const didBackfillPrev = Boolean(
                                        newDate &&
                                          prevActiveGate &&
                                          (!prevActiveGate.endDate || !prevActiveGate.endDate.trim()) &&
                                          (!prevDate || !prevDate.trim())
                                      );
                                      setLastDateAdjustment({
                                        targetKeys:
                                          didBackfillPrev && prevActiveGate
                                            ? [`gate-${item.id}-start`, `gate-${prevActiveGate.id}-end`]
                                            : [`gate-${item.id}-start`],
                                        prevStartDate: formData.startDate,
                                        prevEndDate: formData.endDate,
                                        prevTimeGatedMp3s: currentMp3s.map(g =>
                                          g.id === item.id
                                            ? { ...g, startDate: prevDate ? `${prevDate}T${prevT}` : '' }
                                            : { ...g }
                                        ),
                                      });
                                      focusDateInputByKey(`gate-${item.id}-start`);
                                    }}
                                    onChange={d => {
                                      if (isStartLocked) return;
                                      setLastDateAdjustment(null);
                                      const t = getTimePart(item.startDate) || '00:00';
                                      const newVal = d ? `${d}T${t}` : '';
                                      updateGateStartDate(newVal);
                                    }}
                                    className={cn(
                                      'w-[104px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                      isStartLocked
                                        ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                        : hasStartOverlap
                                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                          : hasMissingStart
                                            ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-bold'
                                            : hasStartGap
                                              ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                              : 'border-blue-300 bg-white text-slate-800'
                                    )}
                                  />
                                  <div
                                    className={cn('shrink-0', isStartLocked && 'pointer-events-none opacity-75')}
                                    title={
                                      !isItemExpired && gatePlayCount > 0
                                        ? 'Start date & time are locked because this gate has logged plays'
                                        : undefined
                                    }
                                  >
                                    <MilitaryTimeInput
                                      value={getTimePart(item.startDate)}
                                      onChange={t => {
                                        if (isStartLocked) return;
                                        setLastDateAdjustment(null);
                                        let d = getDatePart(item.startDate);
                                        if (!d && t) {
                                          d = getCurrentDatetimeLocal().split('T')[0];
                                        }
                                        const newVal = d ? `${d}T${t || '00:00'}` : '';
                                        updateGateStartDate(newVal);
                                      }}
                                      className={cn(
                                        'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                        isStartLocked
                                          ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                          : hasStartOverlap
                                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                            : hasMissingStart
                                              ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-bold'
                                              : hasStartGap
                                                ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                                : 'border-blue-300 bg-white text-slate-800'
                                      )}
                                      placeholder="hh:mm AM"
                                    />
                                  </div>
                                  {renderInlineUndoButton(`gate-${item.id}-start`)}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <label
                                  className={cn(
                                    'text-xs font-black uppercase tracking-wider w-11 pr-1 shrink-0 select-none',
                                    hasEndOverlap
                                      ? 'text-red-700 font-black'
                                      : hasEndGap
                                        ? 'text-amber-700 font-black'
                                        : isItemExpired
                                          ? 'text-slate-600'
                                          : 'text-blue-950'
                                  )}
                                >
                                  End
                                </label>
                                <div className="flex items-center gap-px">
                                  <CalendarDateInput
                                    inputDataKey={`gate-${item.id}-end`}
                                    role="end"
                                    pairedDate={getDatePart(item.startDate)}
                                    currentTime={getTimePart(item.endDate) || '23:59'}
                                    pairedTime={getTimePart(item.startDate) || '00:00'}
                                    announcementStartDate={getDatePart(formData.startDate)}
                                    announcementEndDate={getDatePart(formData.endDate)}
                                    splitNextGate={
                                      (!item.endDate || !item.endDate.trim()) &&
                                      nextActiveGate &&
                                      (!nextActiveGate.startDate || !nextActiveGate.startDate.trim())
                                        ? {
                                            id: nextActiveGate.id,
                                            label: `Gate #${activeGatePos + 2}`,
                                            endDate: getDatePart(nextActiveGate.endDate),
                                            endIso: nextActiveGate.endDate
                                              ? formatToDatetimeLocal(nextActiveGate.endDate)
                                              : undefined,
                                          }
                                        : undefined
                                    }
                                    gateRanges={allGateRangesForCalendar.map(gr => ({
                                      ...gr,
                                      isCurrent: gr.id === item.id,
                                    }))}
                                    hardMinDate={
                                      gateBounds && gateBounds.playCount > 0 && gateBounds.lastPlayedLocalIso
                                        ? getDatePart(gateBounds.lastPlayedLocalIso)
                                        : undefined
                                    }
                                    hardMinReason={
                                      gateBounds && gateBounds.playCount > 0 && gateBounds.lastPlayedLocalIso
                                        ? `Cannot end before last logged play (${formatDatetime12(gateBounds.lastPlayedLocalIso)}).`
                                        : undefined
                                    }
                                    disabled={isItemExpired}
                                    value={getDatePart(item.endDate)}
                                    onCalendarConfirm={(newDate, prevDate) => {
                                      const prevT = getTimePart(item.endDate) || '23:59';
                                      const didForwardFillNext = Boolean(
                                        newDate &&
                                          nextActiveGate &&
                                          (!nextActiveGate.startDate || !nextActiveGate.startDate.trim()) &&
                                          (!prevDate || !prevDate.trim())
                                      );
                                      setLastDateAdjustment({
                                        targetKeys:
                                          didForwardFillNext && nextActiveGate
                                            ? [`gate-${item.id}-end`, `gate-${nextActiveGate.id}-start`]
                                            : [`gate-${item.id}-end`],
                                        prevStartDate: formData.startDate,
                                        prevEndDate: formData.endDate,
                                        prevTimeGatedMp3s: currentMp3s.map(g =>
                                          g.id === item.id
                                            ? { ...g, endDate: prevDate ? `${prevDate}T${prevT}` : undefined }
                                            : { ...g }
                                        ),
                                      });
                                      focusDateInputByKey(`gate-${item.id}-end`);
                                    }}
                                    onChange={d => {
                                      setLastDateAdjustment(null);
                                      if (!d) {
                                        updateGateEndDate(undefined);
                                        return;
                                      }
                                      const t = getTimePart(item.endDate) || '23:59';
                                      updateGateEndDate(`${d}T${t}`);
                                    }}
                                    className={cn(
                                      'w-[104px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                      isItemExpired
                                        ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                        : hasEndOverlap
                                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                          : hasEndGap
                                            ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                            : 'border-blue-300 bg-white text-slate-800'
                                    )}
                                  />
                                  <div className={cn('shrink-0', isItemExpired && 'pointer-events-none opacity-75')}>
                                    <MilitaryTimeInput
                                      value={getTimePart(item.endDate)}
                                      onChange={t => {
                                        if (isItemExpired) return;
                                        setLastDateAdjustment(null);
                                        let d = getDatePart(item.endDate);
                                        if (!d && t) {
                                          d = getDatePart(item.startDate) || getCurrentDatetimeLocal().split('T')[0];
                                        }
                                        const newVal = d ? `${d}T${t || '23:59'}` : undefined;
                                        updateGateEndDate(newVal);
                                      }}
                                      className={cn(
                                        'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                        isItemExpired
                                          ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                          : hasEndOverlap
                                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                            : hasEndGap
                                              ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                              : 'border-blue-300 bg-white text-slate-800'
                                      )}
                                      placeholder="hh:mm AM"
                                    />
                                  </div>
                                  {renderInlineUndoButton(`gate-${item.id}-end`)}
                                </div>
                              </div>
                            </div>

                            {/* Context-Aware Gate Lifecycle Actions (3.b, 3.d, 4.e) */}
                            <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                              <span
                                className={cn(
                                  'text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded border select-none cursor-help flex items-center',
                                  isItemExpired
                                    ? 'bg-slate-100 text-slate-600 border-slate-300'
                                    : 'bg-white text-slate-700 border-blue-300'
                                )}
                                title={formatSlotAssessmentTooltip(gateAssessment.gateScore, {
                                  scopeTitle: `Gate #${idx + 1} Assessment (History)`,
                                })}
                              >
                                <span className="gate-hdr-btn-text">History&nbsp;</span>({gatePlayCount})
                              </span>

                              {isItemExpired ? (
                                <>
                                  {canReactivateGate && (
                                    <button
                                      type="button"
                                      onClick={() => handleReactivateGateClick(item)}
                                      className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                      title="Restore this inactivated gate to active status with its original End date"
                                    >
                                      <CheckCircle className="w-3 h-3 shrink-0" />
                                      <span className="gate-hdr-btn-text">Reactivate</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleReuseGate(item)}
                                    className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                    title="Clone this gate's media items into a new gate and choose its Start and End schedule"
                                  >
                                    <RefreshCw className="w-3 h-3 shrink-0" />
                                    <span className="gate-hdr-btn-text">Reuse</span>
                                  </button>
                                  {gatePlayCount === 0 && (
                                    <button
                                      type="button"
                                      onClick={promptDeleteGate}
                                      className="px-1.5 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                      title="Delete this unused gate (0 logged plays)"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500 shrink-0" />
                                      <span className="gate-hdr-btn-text">Delete</span>
                                    </button>
                                  )}
                                </>
                              ) : gatePlayCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleInactivateGate(item)}
                                  className="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                  title="Inactivate this gate without losing its original End date (moves to Inactivated Gates)"
                                >
                                  <Archive className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span className="gate-hdr-btn-text">Inactivate</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={promptDeleteGate}
                                  className="px-1.5 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                  title="Delete this unused gate (0 logged plays)"
                                >
                                  <Trash2 className="w-3 h-3 text-red-500 shrink-0" />
                                  <span className="gate-hdr-btn-text">Delete</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {isPendingArchiveOnSave && (
                          <div className="px-2.5 py-1 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>
                              End date ({formatDatetime12(formatToDatetimeLocal(item.endDate!))}) is in the past — this gate will move to Past Gates when saved.
                            </span>
                          </div>
                        )}

                        {/* Gate-Internal Warnings & Errors Strip Directly Below Header (#81) */}
                        {(itemErrors.length > 0 || itemWarnings.length > 0) && (
                          <div className="px-2.5 py-1.5 bg-amber-50/90 border-b border-amber-200 space-y-1">
                            {itemErrors.map((err, errIdx) => (
                              <div
                                key={`err-${errIdx}`}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5"
                              >
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                <span>{err}</span>
                              </div>
                            ))}
                            {itemWarnings.map((warn, warnIdx) => (
                              <div
                                key={`warn-${warnIdx}`}
                                className="flex items-center justify-between gap-2 text-xs font-bold text-amber-800 bg-amber-100/70 border border-amber-300 rounded px-2 py-0.5"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                                  <span>{warn}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {isItemExpired && (
                          <div className="px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 bg-slate-100 border-b border-slate-200 select-none flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                            <span className="italic">
                              Read-only — click Reuse to schedule a new gate with this media
                            </span>
                            <span
                              className="font-sans font-bold tabular-nums text-slate-600 cursor-help ml-auto"
                              title={formatSlotAssessmentTooltip(gateAssessment.gateScore, {
                                scopeTitle: `Gate #${idx + 1} Assessment (History)`,
                              })}
                            >
                              History: {gatePlayCount} {gatePlayCount === 1 ? 'play' : 'plays'}
                              {gateAssessment.gateScore.missed > 0
                                ? ` • ${gateAssessment.gateScore.missed} missed`
                                : ''}
                            </span>
                          </div>
                        )}

                        <div className="p-2 space-y-1.5">
                          <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-2xs">
                            {activeRowsToRender.map(({ mItem, mIdx }, activePos) => {
                              const hasMissingItemFile = !mItem.mp3Url || mItem.mp3Url.trim() === '';
                              const url = (mItem.mp3Url || '').toLowerCase();
                              const isItemAudio = isAudioFile(url);
                              const isItemScriptExt = isScriptFile(url);
                              const showBackup =
                                !hasMissingItemFile &&
                                ((mItem.assetType === 'script' && !isItemAudio) || isItemScriptExt);
                              const totalInGate = totalActiveInGate;
                              const itemTrackAudit =
                                gateAssessment.itemAudits[mIdx] ||
                                calculateGatedTrackAudit(
                                  formData.id || '',
                                  mItem.mp3Url || '',
                                  logs,
                                  {
                                    gate: item,
                                    announcement: formData,
                                    itemIndex: mIdx,
                                  }
                                );

                              return (
                                <div
                                  key={`${item.id}-${mIdx}`}
                                  data-gate-media-key={`${item.id}-${mIdx}`}
                                  className={cn(
                                    'px-2 py-1.5 space-y-1 border-l-4 transition-colors',
                                    activePos % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                                    hasMissingItemFile
                                      ? 'border-l-amber-500 bg-amber-50/30'
                                      : isItemAudio
                                        ? 'border-l-purple-500'
                                        : 'border-l-blue-500',
                                    highlightedMediaKey === `${item.id}-${mIdx}` && 'bg-blue-50/90 ring-2 ring-inset ring-blue-500'
                                  )}
                                >
                                  <div className="@container flex items-center justify-between gap-1.5 flex-nowrap min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                                      {!isItemExpired && totalInGate > 1 && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={activePos === 0}
                                            onClick={() => {
                                              const prevEntry = activeRowsToRender[activePos - 1];
                                              if (!prevEntry) return;
                                              const nextItems = [...gateMediaItems];
                                              const tmp = nextItems[prevEntry.mIdx];
                                              nextItems[prevEntry.mIdx] = nextItems[mIdx];
                                              nextItems[mIdx] = tmp;
                                              const updated = currentMp3s.map(m =>
                                                m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                              );
                                              setFormData({ ...formData, timeGatedMp3s: updated });
                                            }}
                                            className="p-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                            title="Move file earlier in rotation"
                                          >
                                            <ChevronUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={activePos === totalInGate - 1}
                                            onClick={() => {
                                              const nextEntry = activeRowsToRender[activePos + 1];
                                              if (!nextEntry) return;
                                              const nextItems = [...gateMediaItems];
                                              const tmp = nextItems[nextEntry.mIdx];
                                              nextItems[nextEntry.mIdx] = nextItems[mIdx];
                                              nextItems[mIdx] = tmp;
                                              const updated = currentMp3s.map(m =>
                                                m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                              );
                                              setFormData({ ...formData, timeGatedMp3s: updated });
                                            }}
                                            className="p-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                            title="Move file later in rotation"
                                          >
                                            <ChevronDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                      <span
                                        className={cn(
                                          'media-row-filename text-xs font-sans font-bold truncate',
                                          hasMissingItemFile ? 'text-amber-900 font-semibold' : 'text-slate-800'
                                        )}
                                        title={buildMediaFilenameTooltip(mItem.mp3Url)}
                                      >
                                        {totalInGate > 1 ? `(${activePos + 1}/${totalInGate}) ` : ''}
                                        {mItem.mp3Url ? (
                                          getFilenameFromUrlOrPath(mItem.mp3Url)
                                        ) : (
                                          <span className="italic text-amber-700 font-sans font-bold">
                                            <span className="req-row-text-nofile">
                                              No file <span className="req-row-text-selected">selected </span>(
                                            </span>
                                            Required
                                            <span className="req-row-text-nofile">)</span>
                                          </span>
                                        )}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {/* Icon-only .txt Edit Pencil to the left of duration, plays, and standard buttons (#92, #107) */}
                                      {!hasMissingItemFile &&
                                        !isItemExpired &&
                                        !isItemAudio &&
                                        /\.(txt|md)$/i.test(mItem.mp3Url) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCopyEditorState({
                                                isOpen: true,
                                                initialFileName: getFilenameFromUrlOrPath(mItem.mp3Url),
                                                initialReadTime: mItem.approximateReadTime,
                                                initialIsAutoReadTime: mItem.isAutoReadTime,
                                                initialBackupMp3Url: mItem.backupMp3Url,
                                                targetGateId: item.id,
                                                targetGateIndex: idx,
                                                targetItemIndex: mIdx,
                                                targetAnnouncementId: editingId || formData.id || null,
                                                fromPicker: false,
                                              });
                                            }}
                                            className="w-6 h-6 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center shadow-2xs transition-colors cursor-pointer shrink-0 select-none"
                                            title="Edit .txt copy"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        )}

                                      {/* Estimated duration in parentheses (m:ss) with identical plain text rendering on both .mp3 and .txt (C.6.d / A.4.d) */}
                                      {!hasMissingItemFile &&
                                        (() => {
                                          if (isItemAudio) {
                                            const filename = mItem.mp3Url ? getFilenameFromUrlOrPath(mItem.mp3Url) : '';
                                            const dispDur =
                                              mItem.duration ||
                                              pickerDurations[filename] ||
                                              (filename ? availableFilesCache.get(filename)?.duration : '') ||
                                              '';
                                            const formattedDur = dispDur ? formatDurationMmSs(dispDur) || dispDur : '';
                                            return (
                                              <span
                                                className="text-xs font-sans font-bold tabular-nums text-slate-600 select-none shrink-0"
                                                title="Audio duration (m:ss)"
                                              >
                                                ({formattedDur || '--:--'})
                                              </span>
                                            );
                                          } else {
                                            const rawReadVal = (mItem.approximateReadTime || '').replace(/^~\s*/, '');
                                            const formattedReadDur = rawReadVal
                                              ? formatDurationMmSs(rawReadVal) || rawReadVal
                                              : '';
                                            return (
                                              <span
                                                className="text-xs font-sans font-bold tabular-nums text-slate-600 select-none shrink-0"
                                                title="Approximate read time (m:ss)"
                                              >
                                                ({formattedReadDur || '--:--'})
                                              </span>
                                            );
                                          }
                                        })()}

                                      {/* Play count box — always visible on populated rows, showing 0 plays when zero (#92, #97) */}
                                      {!hasMissingItemFile &&
                                        (() => {
                                          const firstUsedFormatted = itemTrackAudit.firstUsedAt
                                            ? formatDatetime12(formatToDatetimeLocal(itemTrackAudit.firstUsedAt))
                                            : '—';
                                          const lastUsedFormatted = itemTrackAudit.lastUsedAt
                                            ? formatDatetime12(formatToDatetimeLocal(itemTrackAudit.lastUsedAt))
                                            : '—';
                                          const trackFileName = mItem.mp3Url
                                            ? getFilenameFromUrlOrPath(mItem.mp3Url)
                                            : 'Track';
                                          return (
                                            <span
                                              className={cn(
                                                'text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded border select-none shrink-0 min-w-[54px] text-center',
                                                itemTrackAudit.totalPlays > 0
                                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                                  : 'bg-slate-100 text-slate-600 border-slate-300'
                                              )}
                                              title={formatSlotAssessmentTooltip(itemTrackAudit, {
                                                scopeTitle: `${trackFileName} (Gate #${idx + 1})`,
                                                firstUsedFormatted,
                                                lastUsedFormatted,
                                              })}
                                            >
                                              {itemTrackAudit.totalPlays}{' '}
                                              {itemTrackAudit.totalPlays === 1 ? 'play' : 'plays'}
                                            </span>
                                          );
                                        })()}

                                      <div className="flex items-center gap-0 shrink-0">
                                        {mItem.mp3Url &&
                                          (isItemAudio ? (
                                            <button
                                              type="button"
                                              onClick={() => togglePreview(mItem.mp3Url)}
                                              className={cn(
                                                'flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 min-w-[26px]',
                                                isItemExpired
                                                  ? 'rounded'
                                                  : 'rounded-l rounded-r-none border-r-0',
                                                previewUrl === mItem.mp3Url
                                                  ? 'bg-slate-900 text-white border-slate-900'
                                                  : 'bg-white text-blue-600 border-slate-300 hover:bg-slate-50'
                                              )}
                                              title={previewUrl === mItem.mp3Url ? 'Stop preview' : 'Preview audio'}
                                            >
                                              {previewUrl === mItem.mp3Url ? (
                                                <Square className="w-3.5 h-3.5 fill-current" />
                                              ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                              )}
                                              <span className="mp3-btn-text">
                                                {previewUrl === mItem.mp3Url ? 'Stop' : 'Preview'}
                                              </span>
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setPreviewScriptBackupUrl(mItem.backupMp3Url);
                                                setPreviewScriptOrigin({
                                                  announcementId: editingId || formData.id || null,
                                                  gateId: item.id,
                                                  gateIndex: idx,
                                                  itemIndex: mIdx,
                                                  fromPicker: false,
                                                });
                                                setPreviewScriptFromPicker(false);
                                                setPreviewScriptFile(mItem.mp3Url);
                                              }}
                                              className={cn(
                                                'flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 min-w-[26px] bg-white text-blue-600 border-slate-300 hover:bg-slate-50',
                                                isItemExpired
                                                  ? 'rounded'
                                                  : 'rounded-l rounded-r-none border-r-0'
                                              )}
                                              title="Preview file"
                                            >
                                              <Eye className="w-3.5 h-3.5 fill-none" />
                                              <span className="mp3-btn-text">Preview</span>
                                            </button>
                                          ))}

                                        {!isItemExpired &&
                                          (() => {
                                            const hasAttachedFile = Boolean(mItem.mp3Url && mItem.mp3Url.trim());
                                            const canDeleteThisRow =
                                              itemTrackAudit.totalPlays === 0 &&
                                              (totalInGate > 1 || hasAttachedFile);
                                            const showRowInactivate = itemTrackAudit.totalPlays > 0;
                                            const hasTrailingAfterChoose = canDeleteThisRow || showRowInactivate;

                                            return (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setPickerTarget('timeGated');
                                                    setPickerMp3Id(item.id);
                                                    setPickerItemIndex(mIdx);
                                                    setIsPickerOpen(true);
                                                  }}
                                                  className={cn(
                                                    'px-1.5 py-px text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none border min-w-[26px]',
                                                    hasMissingItemFile
                                                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
                                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300',
                                                    hasMissingItemFile
                                                      ? hasTrailingAfterChoose
                                                        ? 'rounded-l rounded-r-none border-r-amber-700'
                                                        : 'rounded'
                                                      : hasTrailingAfterChoose
                                                        ? 'rounded-none border-r-slate-300'
                                                        : 'rounded-r rounded-l-none'
                                                  )}
                                                  title={
                                                    hasMissingItemFile
                                                      ? 'Choose one or more files for this gate'
                                                      : showRowInactivate
                                                        ? 'Replace file (prior played file will move to Past / Inactivated Media)'
                                                        : 'Replace file'
                                                  }
                                                >
                                                  <FolderOpen className="w-3.5 h-3.5" />
                                                  <span className={hasMissingItemFile ? 'req-row-btn-existing' : 'mp3-btn-text'}>
                                                    {hasAttachedFile ? 'Replace' : 'Choose'}
                                                  </span>
                                                </button>

                                                {showRowInactivate && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const populatedActiveCount = indexedActiveMediaItems.filter(
                                                        x => Boolean(x.mItem.mp3Url && x.mItem.mp3Url.trim())
                                                      ).length;
                                                      applyInactivateSingleMediaItem(item, mIdx);
                                                      if (populatedActiveCount <= 1) {
                                                        setInactivateLastMediaPromptState({
                                                          gateNumber: idx + 1,
                                                        });
                                                      }
                                                    }}
                                                    className="mp3-end-action-btn px-1.5 py-px bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-r rounded-l-none text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none shrink-0"
                                                    title="Inactivate this media file and move it to Past / Inactivated Media inside this gate (preserves broadcast history)"
                                                  >
                                                    <Archive className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                                    <span className="mp3-btn-text">Inactivate</span>
                                                  </button>
                                                )}

                                                {canDeleteThisRow && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const fileNameLabel = mItem.mp3Url
                                                        ? getFilenameFromUrlOrPath(mItem.mp3Url)
                                                        : 'this empty media slot';
                                                      setGateDeleteConfirmState({
                                                        title:
                                                          totalInGate > 1
                                                            ? `Remove Media Row (${activePos + 1}/${totalInGate})`
                                                            : `Clear Media Slot in Gate #${idx + 1}`,
                                                        message:
                                                          totalInGate > 1
                                                            ? `Are you sure you want to remove "${fileNameLabel}" from Gate #${idx + 1}'s rotation?`
                                                            : `Are you sure you want to remove "${fileNameLabel}" from Gate #${idx + 1}? Gate #${idx + 1} will remain in the schedule with an empty media slot.`,
                                                        confirmLabel: totalInGate > 1 ? 'Remove File' : 'Clear Media',
                                                        onConfirm: () => {
                                                          if (totalInGate > 1) {
                                                            const nextItems = gateMediaItems.filter(
                                                              (_, iIdx) => iIdx !== mIdx
                                                            );
                                                            const updated = currentMp3s.map(m =>
                                                              m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                                            );
                                                            setFormData({
                                                              ...formData,
                                                              timeGatedMp3s: updated,
                                                            });
                                                          } else {
                                                            const preservedInactivated = gateMediaItems.filter(
                                                              mi => Boolean(mi.inactivated)
                                                            );
                                                            const updated = currentMp3s.map(m =>
                                                              m.id === item.id
                                                                ? {
                                                                    ...m,
                                                                    mediaItems: [
                                                                      { mp3Url: '' },
                                                                      ...preservedInactivated,
                                                                    ],
                                                                  }
                                                                : m
                                                            );
                                                            setFormData({
                                                              ...formData,
                                                              timeGatedMp3s: updated,
                                                            });
                                                          }
                                                          setGateDeleteConfirmState(null);
                                                        },
                                                      });
                                                    }}
                                                    className="mp3-end-action-btn px-1.5 py-px bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-r rounded-l-none text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none shrink-0"
                                                    title={
                                                      totalInGate > 1
                                                        ? 'Remove this unplayed file from rotation'
                                                        : 'Clear this unplayed file from the gate (keeps gate intact)'
                                                    }
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                    <span className="mp3-btn-text">Delete</span>
                                                  </button>
                                                )}
                                              </>
                                            );
                                          })()}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Dedicated Sub-Row for .txt Backup MP3 Controls (C.6.a / A.2.b — U-style hanging border inside cell) */}
                                  {showBackup &&
                                    (mItem.backupMp3Url || !isItemExpired) &&
                                    (() => {
                                      const backupFileName = mItem.backupMp3Url
                                        ? getFilenameFromUrlOrPath(mItem.backupMp3Url)
                                        : '';
                                      const backupDispDur =
                                        (backupFileName && pickerDurations[backupFileName]) ||
                                        (backupFileName ? availableFilesCache.get(backupFileName)?.duration : '') ||
                                        '';
                                      const formattedBackupDur = backupDispDur
                                        ? formatDurationMmSs(backupDispDur) || backupDispDur
                                        : '';
                                      const hasTrailingAfterBackupChoose =
                                        !isItemExpired && Boolean(mItem.backupMp3Url);

                                      return (
                                        <div className="@container ml-3 mr-0.5 mb-0.5 mt-0.5 px-2 py-1 bg-purple-50/90 border-x-2 border-b-2 border-t border-purple-300 border-t-purple-200/70 rounded-b-md flex items-center justify-between gap-1.5 flex-nowrap min-w-0 shadow-2xs">
                                          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                                            <Volume2 className="w-3 h-3 text-purple-600 shrink-0" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 shrink-0 select-none">
                                              Backup:
                                            </span>
                                            {mItem.backupMp3Url ? (
                                              <span
                                                className="media-row-filename text-[11px] font-sans font-bold text-purple-950 truncate"
                                                title={buildMediaFilenameTooltip(mItem.backupMp3Url, 'Backup MP3')}
                                              >
                                                {backupFileName}
                                              </span>
                                            ) : (
                                              <span className="media-row-filename text-[11px] font-sans italic text-purple-700/80 truncate select-none">
                                                Optional backup audio (.mp3)
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {mItem.backupMp3Url && (
                                              <span
                                                className="text-[11px] font-sans font-bold tabular-nums text-purple-800 select-none shrink-0"
                                                title="Backup audio duration (m:ss)"
                                              >
                                                ({formattedBackupDur || '--:--'})
                                              </span>
                                            )}

                                            <div className="flex items-center gap-0 shrink-0">
                                              {mItem.backupMp3Url && (
                                                <button
                                                  type="button"
                                                  onClick={() => togglePreview(mItem.backupMp3Url!)}
                                                  className={cn(
                                                    'flex items-center justify-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-px border shadow-2xs transition-all cursor-pointer select-none h-5 min-w-[24px]',
                                                    isItemExpired
                                                      ? 'rounded'
                                                      : 'rounded-l rounded-r-none border-r-0',
                                                    previewUrl === mItem.backupMp3Url
                                                      ? 'bg-slate-900 text-white border-slate-900'
                                                      : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-100/70'
                                                  )}
                                                  title={
                                                    previewUrl === mItem.backupMp3Url
                                                      ? 'Stop backup preview'
                                                      : 'Preview backup audio'
                                                  }
                                                >
                                                  {previewUrl === mItem.backupMp3Url ? (
                                                    <Square className="w-3 h-3 fill-current" />
                                                  ) : (
                                                    <Play className="w-3 h-3 fill-current" />
                                                  )}
                                                  <span className="mp3-btn-text">
                                                    {previewUrl === mItem.backupMp3Url ? 'Stop' : 'Preview'}
                                                  </span>
                                                </button>
                                              )}

                                              {!isItemExpired && (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setPickerTarget('backup');
                                                      setPickerMp3Id(item.id);
                                                      setPickerItemIndex(mIdx);
                                                      setSearchQuery('');
                                                      setIsPickerOpen(true);
                                                    }}
                                                    className={cn(
                                                      'px-1.5 py-px text-[10px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-2xs cursor-pointer h-5 select-none border min-w-[24px]',
                                                      mItem.backupMp3Url
                                                        ? 'bg-white hover:bg-purple-100 text-purple-800 border-purple-300'
                                                        : 'bg-purple-700 hover:bg-purple-800 text-white border-purple-800',
                                                      !mItem.backupMp3Url &&
                                                        (hasTrailingAfterBackupChoose
                                                          ? 'rounded-l rounded-r-none border-r-purple-900'
                                                          : 'rounded'),
                                                      mItem.backupMp3Url &&
                                                        (hasTrailingAfterBackupChoose
                                                          ? 'rounded-none border-r-purple-300'
                                                          : 'rounded-r rounded-l-none')
                                                    )}
                                                    title={
                                                      mItem.backupMp3Url
                                                        ? 'Replace backup audio file'
                                                        : 'Choose backup audio file'
                                                    }
                                                  >
                                                    <FolderOpen className="w-3 h-3" />
                                                    <span className="mp3-btn-text">
                                                      {mItem.backupMp3Url ? 'Replace' : 'Choose'}
                                                    </span>
                                                  </button>

                                                  {mItem.backupMp3Url && (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setGateDeleteConfirmState({
                                                          title: `Remove Backup Audio`,
                                                          message: `Are you sure you want to remove backup audio "${backupFileName}" from Gate #${idx + 1}?`,
                                                          confirmLabel: 'Remove Backup',
                                                          onConfirm: () => {
                                                            const updated = currentMp3s.map(m =>
                                                              m.id === item.id
                                                                ? {
                                                                    ...m,
                                                                    mediaItems: getGateMediaItems(m).map((mi, iIdx) =>
                                                                      iIdx === mIdx
                                                                        ? { ...mi, backupMp3Url: undefined }
                                                                        : mi
                                                                    ),
                                                                  }
                                                                : m
                                                            );
                                                            setFormData({
                                                              ...formData,
                                                              timeGatedMp3s: updated,
                                                            });
                                                            setGateDeleteConfirmState(null);
                                                          },
                                                        });
                                                      }}
                                                      className="mp3-end-action-btn px-1.5 py-px bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-r rounded-l-none text-[10px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-2xs cursor-pointer h-5 select-none shrink-0"
                                                      title="Remove backup audio"
                                                    >
                                                      <Trash2 className="w-3 h-3 text-red-500 shrink-0" />
                                                      <span className="mp3-btn-text">Delete</span>
                                                    </button>
                                                  )}
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                </div>
                              );
                            })}
                            {/* Compact "Add another file to the rotation." Row */}
                            {!isItemExpired &&
                              indexedActiveMediaItems.length > 0 &&
                              indexedActiveMediaItems.every(x => Boolean(x.mItem.mp3Url && x.mItem.mp3Url.trim())) && (
                                <div className="@container px-2 py-1 bg-slate-50/80 border-l-4 border-l-slate-300 flex items-center justify-between gap-1.5 flex-nowrap min-w-0">
                                  <span
                                    className="text-xs italic text-slate-500 font-sans font-medium truncate select-none min-w-0"
                                    title="Add another file to the rotation."
                                  >
                                    <span className="add-rot-text-s3">Add </span>
                                    <span className="add-rot-text-s1">another </span>
                                    <span className="add-rot-text-s3">file </span>
                                    <span className="add-rot-text-s2">to the rotation.</span>
                                  </span>
                                  <div className="flex items-center gap-0 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPickerTarget('addGateFile');
                                        setPickerMp3Id(item.id);
                                        setPickerItemIndex(null);
                                        setSearchQuery('');
                                        setIsPickerOpen(true);
                                      }}
                                      className="px-2 py-px bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 rounded text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none min-w-[26px]"
                                      title="Choose one or more files to add to this gate's rotation"
                                    >
                                      <FolderOpen className="w-3.5 h-3.5" />
                                      <span className="add-rot-btn-existing">Choose</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>

                          {/* Collapsible Past / Inactivated Media Subsection Inside Gate (#86) */}
                          {indexedInactivatedMediaItems.length > 0 && (
                            <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100/80">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedInactivatedMediaGateIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) {
                                      next.delete(item.id);
                                    } else {
                                      next.add(item.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full px-2 py-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer select-none"
                              >
                                <span className="flex items-center gap-1">
                                  {isInactivatedMediaExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                  <Archive className="w-3 h-3 text-slate-500" />
                                  <span>
                                    Past / Inactivated Media ({indexedInactivatedMediaItems.length})
                                  </span>
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                                  {isInactivatedMediaExpanded ? 'Hide inactivated files' : 'Show inactivated files'}
                                </span>
                              </button>

                              {isInactivatedMediaExpanded && (
                                <div className="divide-y divide-slate-200 border-t border-slate-300 bg-slate-50">
                                  {indexedInactivatedMediaItems.map(({ mItem, mIdx }) => {
                                    const fileName = mItem.mp3Url
                                      ? getFilenameFromUrlOrPath(mItem.mp3Url)
                                      : 'Inactivated Media';
                                    const isItemAudio = isAudioFile(fileName.toLowerCase());
                                    const itemAudit =
                                      gateAssessment.itemAudits[mIdx] ||
                                      calculateGatedTrackAudit(
                                        formData.id || '',
                                        mItem.mp3Url || '',
                                        logs,
                                        {
                                          gate: item,
                                          announcement: formData,
                                          itemIndex: mIdx,
                                        }
                                      );
                                    return (
                                      <div
                                        key={`inact-media-${item.id}-${mIdx}`}
                                        className="px-2 py-1.5 flex items-center justify-between gap-2 min-w-0"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                          <span
                                            className="text-xs font-sans font-bold text-slate-600 truncate"
                                            title={fileName}
                                          >
                                            {fileName}
                                          </span>
                                          <span
                                            className="text-[10px] font-bold px-1.5 py-px rounded bg-amber-200/80 text-amber-900 border border-amber-300 shrink-0"
                                            title={
                                              mItem.inactivatedAt
                                                ? `Inactivated at ${formatDatetime12(formatToDatetimeLocal(mItem.inactivatedAt))}`
                                                : 'Inactivated media file'
                                            }
                                          >
                                            Inactivated
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                                          {itemAudit.totalPlays > 0 && (
                                            <span
                                              className="text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300 select-none cursor-help"
                                              title={formatSlotAssessmentTooltip(itemAudit, {
                                                scopeTitle: `${fileName} (Gate #${idx + 1} History)`,
                                                firstUsedFormatted: itemAudit.firstUsedAt
                                                  ? formatDatetime12(formatToDatetimeLocal(itemAudit.firstUsedAt))
                                                  : '—',
                                                lastUsedFormatted: itemAudit.lastUsedAt
                                                  ? formatDatetime12(formatToDatetimeLocal(itemAudit.lastUsedAt))
                                                  : '—',
                                              })}
                                            >
                                              History ({itemAudit.totalPlays}{' '}
                                              {itemAudit.totalPlays === 1 ? 'play' : 'plays'})
                                            </span>
                                          )}

                                          {mItem.mp3Url &&
                                            (isItemAudio ? (
                                              <button
                                                type="button"
                                                onClick={() => togglePreview(mItem.mp3Url)}
                                                className={cn(
                                                  'flex items-center justify-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 border rounded shadow-2xs transition-all cursor-pointer select-none',
                                                  previewUrl === mItem.mp3Url
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-white text-blue-600 border-slate-300 hover:bg-slate-50'
                                                )}
                                                title={previewUrl === mItem.mp3Url ? 'Stop preview' : 'Preview audio'}
                                              >
                                                {previewUrl === mItem.mp3Url ? (
                                                  <Square className="w-3 h-3 fill-current" />
                                                ) : (
                                                  <Play className="w-3 h-3 fill-current" />
                                                )}
                                                <span>{previewUrl === mItem.mp3Url ? 'Stop' : 'Preview'}</span>
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPreviewScriptBackupUrl(mItem.backupMp3Url);
                                                  setPreviewScriptOrigin({
                                                    announcementId: editingId || formData.id || null,
                                                    gateId: item.id,
                                                    gateIndex: idx,
                                                    itemIndex: mIdx,
                                                    fromPicker: false,
                                                  });
                                                  setPreviewScriptFromPicker(false);
                                                  setPreviewScriptFile(mItem.mp3Url);
                                                }}
                                                className="flex items-center justify-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 border rounded shadow-2xs transition-all cursor-pointer select-none bg-white text-blue-600 border-slate-300 hover:bg-slate-50"
                                                title="Preview script"
                                              >
                                                <Eye className="w-3 h-3" />
                                                <span>Preview</span>
                                              </button>
                                            ))}

                                          {!isItemExpired && (
                                            <button
                                              type="button"
                                              onClick={() => handleReactivateMediaItem(item, mIdx)}
                                              className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                              title="Restore this media file to active rotation in this gate"
                                            >
                                              <CheckCircle className="w-3 h-3" />
                                              <span>Reactivate</span>
                                            </button>
                                          )}

                                          {itemAudit.totalPlays === 0 && gateMediaItems.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setGateDeleteConfirmState({
                                                  title: `Delete Unused Media File`,
                                                  message: `Are you sure you want to permanently remove "${fileName}" from Gate #${idx + 1}? (0 logged plays)`,
                                                  confirmLabel: 'Delete File',
                                                  onConfirm: () => {
                                                    const updated = currentMp3s.map(m =>
                                                      m.id === item.id
                                                        ? {
                                                            ...m,
                                                            mediaItems: getGateMediaItems(m).filter((_, iIdx) => iIdx !== mIdx),
                                                          }
                                                        : m
                                                    );
                                                    setFormData({
                                                      ...formData,
                                                      timeGatedMp3s: updated,
                                                    });
                                                    setGateDeleteConfirmState(null);
                                                  },
                                                });
                                              }}
                                              className="px-1.5 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                              title="Delete this unused media file (0 logged plays)"
                                            >
                                              <Trash2 className="w-3 h-3 text-red-500" />
                                              <span>Delete</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  };

                  const renderLeadingInterstitial = () => {
                    if (activeIndexedGates.length === 0) return null;
                    const firstEntry = activeIndexedGates[0];
                    const firstGate = firstEntry.item;
                    const firstNum = firstEntry.idx + 1;
                    const annStart =
                      formData.startDate && formData.startDate.trim()
                        ? formatToDatetimeLocal(formData.startDate)
                        : '';
                    const g1Start =
                      firstGate.startDate && firstGate.startDate.trim()
                        ? formatToDatetimeLocal(firstGate.startDate)
                        : '';
                    if (!annStart || !g1Start) return null;

                    // Account for prior past / inactivated gates so we don't falsely treat a contiguous gate after past gates as a gap back to Announcement Start
                    let latestPriorGateEnd = '';
                    let priorArchivedCount = 0;
                    for (const archEntry of archivedIndexedGates) {
                      const archStart = archEntry.item.startDate
                        ? formatToDatetimeLocal(archEntry.item.startDate)
                        : '';
                      if (!archStart || archStart <= g1Start) {
                        priorArchivedCount++;
                        const effEnd = getGateEffectiveEndIso(archEntry.item);
                        if (effEnd && effEnd > latestPriorGateEnd) {
                          latestPriorGateEnd = effEnd;
                        }
                      }
                    }

                    const effectiveBeforeStart =
                      latestPriorGateEnd && latestPriorGateEnd > annStart ? latestPriorGateEnd : annStart;

                    if (
                      g1Start > effectiveBeforeStart &&
                      !isContiguousMidnightTransition(effectiveBeforeStart, g1Start)
                    ) {
                      const isPriorAllPast = effectiveBeforeStart <= nowIso;
                      const nowMd = formatMonthDay(nowIso);
                      const targetStartFromPrior =
                        latestPriorGateEnd && latestPriorGateEnd > annStart
                          ? getNextGapAutoFillStart(latestPriorGateEnd).startIso
                          : annStart;
                      const startBoundaryMd = formatMonthDay(targetStartFromPrior);
                      const g1StartMd = formatMonthDay(g1Start);

                      return (
                        <div
                          key="leading-gap-interstitial"
                          data-gap-handler-for={firstGate.id}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Gap before Gate #{firstNum}.</span>
                            {priorArchivedCount > 0 && (
                              <span
                                className="text-[10px] font-bold text-amber-800/80 bg-amber-100/80 px-1.5 py-px rounded border border-amber-200"
                                title={`Preceded by ${priorArchivedCount} past or inactivated ${priorArchivedCount === 1 ? 'gate' : 'gates'} (latest ended ${formatDatetime12(effectiveBeforeStart)})`}
                              >
                                after {priorArchivedCount} past {priorArchivedCount === 1 ? 'gate' : 'gates'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            {((playedGateBounds[firstGate.id]?.playCount ?? 0) === 0) && (
                              isPriorAllPast ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentNow = getCurrentDatetimeLocal();
                                    recordDateAdjustment(`gate-${firstGate.id}-start`, () => {
                                      const updated = currentMp3s.map(m =>
                                        m.id === firstGate.id ? { ...m, startDate: currentNow } : m
                                      );
                                      setFormData({ ...formData, timeGatedMp3s: updated });
                                    });
                                  }}
                                  className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                  title={`Set Gate #${firstNum} Start to now (${formatDatetime12(nowIso)})`}
                                >
                                  <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span>Set to now ({nowMd})</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    recordDateAdjustment(`gate-${firstGate.id}-start`, () => {
                                      const updated = currentMp3s.map(m =>
                                        m.id === firstGate.id ? { ...m, startDate: targetStartFromPrior } : m
                                      );
                                      setFormData({ ...formData, timeGatedMp3s: updated });
                                    });
                                  }}
                                  className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                  title={`Set Gate #${firstNum} Start to ${formatDatetime12(targetStartFromPrior)}`}
                                >
                                  <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span>Set Gate #{firstNum} to Start ({startBoundaryMd})</span>
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                recordDateAdjustment('ann-start', () =>
                                  setFormData({ ...formData, startDate: g1Start })
                                )
                              }
                              className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title={`Set Announcement Start to Gate #${firstNum} Start (${formatDatetime12(g1Start)})`}
                            >
                              <ArrowDown className="w-3 h-3 text-amber-700 shrink-0" />
                              <span>Set Announc. Start to Gate #{firstNum} ({g1StartMd})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLastDateAdjustment(null);
                                addInlineDraftGate(
                                  isPriorAllPast ? getCurrentDatetimeLocal() : targetStartFromPrior,
                                  computeBackfilledEndTime(g1Start)
                                );
                              }}
                              className="px-2 py-0.5 rounded border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title="Add a new gate into this gap"
                            >
                              <Plus className="w-3 h-3 stroke-[3] shrink-0" />
                              <span>Add New Gate</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (g1Start < annStart) {
                      const annStartMd = formatMonthDay(annStart);
                      const g1StartMd = formatMonthDay(g1Start);
                      return (
                        <div
                          key="leading-overreach-interstitial"
                          className="px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-red-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>
                              Gate #{firstNum} starts before Announcement starts.
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            {!(playedGateBounds[firstGate.id]?.playCount > 0) && (
                              <button
                                type="button"
                                onClick={() => {
                                  recordDateAdjustment(`gate-${firstGate.id}-start`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === firstGate.id ? { ...m, startDate: annStart } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-red-300 bg-white hover:bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                title={`Set Gate #${firstNum} Start to Announcement Start (${formatDatetime12(annStart)})`}
                              >
                                <ArrowDown className="w-3 h-3 text-red-700 shrink-0" />
                                <span>Set Gate #{firstNum} to Start ({annStartMd})</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                recordDateAdjustment('ann-start', () =>
                                  setFormData({ ...formData, startDate: g1Start })
                                )
                              }
                              className="px-2 py-0.5 rounded border border-red-300 bg-white hover:bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title={`Set Announcement Start to Gate #${firstNum} Start (${formatDatetime12(g1Start)})`}
                            >
                              <ArrowUp className="w-3 h-3 text-red-700 shrink-0" />
                              <span>Set Announc. Start to Gate #{firstNum} ({g1StartMd})</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  };

                  const renderMiddleInterstitial = (activePos: number) => {
                    if (activePos < 0 || activePos >= activeIndexedGates.length - 1) return null;
                    const currEntry = activeIndexedGates[activePos];
                    const nextEntry = activeIndexedGates[activePos + 1];
                    const currGate = currEntry.item;
                    const nextGate = nextEntry.item;
                    const currNum = currEntry.idx + 1;
                    const nextNum = nextEntry.idx + 1;

                    const currStart =
                      currGate.startDate && currGate.startDate.trim()
                        ? formatToDatetimeLocal(currGate.startDate)
                        : '';
                    const currEnd =
                      currGate.endDate && currGate.endDate.trim()
                        ? formatToDatetimeLocal(currGate.endDate)
                        : '';
                    const nextStart =
                      nextGate.startDate && nextGate.startDate.trim()
                        ? formatToDatetimeLocal(nextGate.startDate)
                        : '';

                    // 1. Middle Gap
                    if (
                      currEnd &&
                      nextStart &&
                      currEnd < nextStart &&
                      !isContiguousMidnightTransition(currEnd, nextStart)
                    ) {
                      const gapFillStart = getNextGapAutoFillStart(currEnd).startIso;
                      const gapFillEnd = computeBackfilledEndTime(nextStart);
                      const gapFillEndMd = formatMonthDay(gapFillEnd);
                      const gapFillStartMd = formatMonthDay(gapFillStart);
                      return (
                        <div
                          key={`mid-gap-${currGate.id}-${nextGate.id}`}
                          data-gap-handler-for={nextGate.id}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Gap between Gate #{currNum} and Gate #{nextNum}.
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            <button
                              type="button"
                              onClick={() => {
                                recordDateAdjustment(`gate-${currGate.id}-end`, () => {
                                  const updated = currentMp3s.map(m =>
                                    m.id === currGate.id ? { ...m, endDate: gapFillEnd } : m
                                  );
                                  setFormData({ ...formData, timeGatedMp3s: updated });
                                });
                              }}
                              className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title={`Set Gate #${currNum} End to ${formatDatetime12(gapFillEnd)}`}
                            >
                              <ArrowDown className="w-3 h-3 text-amber-700 shrink-0" />
                              <span>Extend Gate #{currNum} ({gapFillEndMd})</span>
                            </button>
                            {!(playedGateBounds[nextGate.id]?.playCount > 0) && (
                              <button
                                type="button"
                                onClick={() => {
                                  recordDateAdjustment(`gate-${nextGate.id}-start`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === nextGate.id ? { ...m, startDate: gapFillStart } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                title={`Set Gate #${nextNum} Start to ${formatDatetime12(gapFillStart)}`}
                              >
                                <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>Set Gate #{nextNum} to Prior ({gapFillStartMd})</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setLastDateAdjustment(null);
                                addInlineDraftGate(gapFillStart, gapFillEnd);
                              }}
                              className="px-2 py-0.5 rounded border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                            >
                              <Plus className="w-3 h-3 stroke-[3] shrink-0" />
                              <span>Add New Gate</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // 2. Overlap (currGate open-ended with nextStart set, or currEnd > nextStart)
                    if (
                      (!currEnd && nextStart && (!currStart || nextStart >= currStart)) ||
                      (currEnd && nextStart && currEnd > nextStart)
                    ) {
                      const truncatedCurrEnd = computeBackfilledEndTime(nextStart);
                      const truncatedCurrEndMd = formatMonthDay(truncatedCurrEnd);
                      const nextStartFromCurr = currEnd ? getNextGapAutoFillStart(currEnd).startIso : '';
                      const nextStartFromCurrMd = nextStartFromCurr ? formatMonthDay(nextStartFromCurr) : '';
                      const currLastPlayed = playedGateBounds[currGate.id]?.lastPlayedLocalIso;
                      const canTruncateCurrEnd =
                        !currLastPlayed || truncatedCurrEnd >= currLastPlayed;
                      const canMoveNextStart = !(playedGateBounds[nextGate.id]?.playCount > 0);
                      return (
                        <div
                          key={`mid-overlap-${currGate.id}-${nextGate.id}`}
                          className="px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-red-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>
                              Gate #{currNum} overlaps with Gate #{nextNum}.
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            {canTruncateCurrEnd && (
                              <button
                                type="button"
                                onClick={() => {
                                  recordDateAdjustment(`gate-${currGate.id}-end`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === currGate.id ? { ...m, endDate: truncatedCurrEnd } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-red-300 bg-white hover:bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                title={`Set Gate #${currNum} End to ${formatDatetime12(truncatedCurrEnd)}`}
                              >
                                <ArrowUp className="w-3 h-3 text-red-700 shrink-0" />
                                <span>End Gate #{currNum} ({truncatedCurrEndMd})</span>
                              </button>
                            )}
                            {currEnd && canMoveNextStart && (
                              <button
                                type="button"
                                onClick={() => {
                                  recordDateAdjustment(`gate-${nextGate.id}-start`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === nextGate.id ? { ...m, startDate: nextStartFromCurr } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-red-300 bg-white hover:bg-red-100 text-red-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                                title={`Set Gate #${nextNum} Start to ${formatDatetime12(nextStartFromCurr)}`}
                              >
                                <ArrowDown className="w-3 h-3 text-red-700 shrink-0" />
                                <span>Set Gate #{nextNum} to Prior ({nextStartFromCurrMd})</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // 3. Open boundary -> "Transition" inline date/time picker (#108 refinement)
                    if (!nextStart) {
                      const applyTransitionStartIso = (transitionStartIso: string) => {
                        if (!transitionStartIso) return;
                        const alsoFillsCurrEnd = !currEnd || !currEnd.trim();
                        const affectedKeys = alsoFillsCurrEnd
                          ? [`gate-${currGate.id}-end`, `gate-${nextGate.id}-start`]
                          : [`gate-${nextGate.id}-start`];
                        recordDateAdjustment(affectedKeys, () => {
                          const backfilledEnd = computeBackfilledEndTime(transitionStartIso);
                          const updated = currentMp3s.map(m => {
                            if (m.id === currGate.id && alsoFillsCurrEnd) {
                              return { ...m, endDate: backfilledEnd };
                            }
                            if (m.id === nextGate.id) {
                              return { ...m, startDate: transitionStartIso };
                            }
                            return m;
                          });
                          setFormData({ ...formData, timeGatedMp3s: updated });
                        });
                      };

                      const suggestedTransitionIso = currEnd ? getNextGapAutoFillStart(currEnd).startIso : '';
                      const suggestedTransitionMd = suggestedTransitionIso
                        ? formatMonthDay(suggestedTransitionIso)
                        : '';

                      return (
                        <div
                          key={`mid-open-${currGate.id}-${nextGate.id}`}
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 flex-wrap min-w-0 max-w-full">
                            <span
                              className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1 select-none"
                              title={`Select transition date/time between Gate #${currNum} and Gate #${nextNum} (auto-fills Gate #${currNum} End and Gate #${nextNum} Start)`}
                            >
                              <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Transition</span>
                            </span>
                            <div className="flex items-center gap-px bg-white px-1 py-0.5 rounded border border-amber-300">
                              <CalendarDateInput
                                role="start"
                                pairedDate={getDatePart(nextGate.endDate)}
                                currentTime={getTimePart(suggestedTransitionIso) || '00:00'}
                                pairedTime={getTimePart(nextGate.endDate) || '23:59'}
                                announcementStartDate={getDatePart(formData.startDate)}
                                announcementEndDate={getDatePart(formData.endDate)}
                                splitPriorGateId={!currEnd || !currEnd.trim() ? currGate.id : undefined}
                                gateRanges={allGateRangesForCalendar.map(gr => ({
                                  ...gr,
                                  isCurrent: gr.id === nextGate.id,
                                }))}
                                value={getDatePart(suggestedTransitionIso)}
                                onChange={d => {
                                  if (!d) return;
                                  const t = getTimePart(suggestedTransitionIso) || '00:00';
                                  applyTransitionStartIso(`${d}T${t}`);
                                }}
                                className="w-[104px] p-0.5 border-0 border-b border-amber-300 rounded-none text-xs font-bold font-sans tabular-nums outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                              />
                              <div className="shrink-0">
                                <MilitaryTimeInput
                                  value={getTimePart(suggestedTransitionIso) || '00:00'}
                                  onChange={t => {
                                    const d =
                                      getDatePart(suggestedTransitionIso) ||
                                      getDatePart(currStart) ||
                                      getCurrentDatetimeLocal().split('T')[0];
                                    if (!d) return;
                                    applyTransitionStartIso(`${d}T${t || '00:00'}`);
                                  }}
                                  className="p-0.5 border-0 border-b border-amber-300 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6"
                                  placeholder="12:00 AM"
                                />
                              </div>
                            </div>
                            <span className="text-[11px] font-semibold text-amber-800">
                              (Gate #{currNum} → Gate #{nextNum})
                            </span>
                          </div>
                          {currEnd && (
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                              <button
                                type="button"
                                onClick={() => {
                                  const autoStartIso = getNextGapAutoFillStart(currEnd).startIso;
                                  recordDateAdjustment(`gate-${nextGate.id}-start`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === nextGate.id ? { ...m, startDate: autoStartIso } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              >
                                <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>Set Gate #{nextNum} to Prior ({suggestedTransitionMd})</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return null;
                  };

                  const renderTrailingInterstitial = () => {
                    if (activeIndexedGates.length === 0) return null;
                    const lastEntry = activeIndexedGates[activeIndexedGates.length - 1];
                    const lastGate = lastEntry.item;
                    const lastNum = lastEntry.idx + 1;
                    const annEnd =
                      formData.endDate && formData.endDate.trim()
                        ? formatToDatetimeLocal(formData.endDate)
                        : '';
                    const lastEnd =
                      lastGate.endDate && lastGate.endDate.trim()
                        ? formatToDatetimeLocal(lastGate.endDate)
                        : '';
                    const lastStart =
                      lastGate.startDate && lastGate.startDate.trim()
                        ? formatToDatetimeLocal(lastGate.startDate)
                        : '';

                    // Trailing Gap: lastGate has an End date before Announcement End (or while Announcement is open-ended)
                    if (
                      (annEnd && lastEnd && lastEnd < annEnd && !isContiguousMidnightTransition(lastEnd, annEnd)) ||
                      (!annEnd && lastEnd)
                    ) {
                      const nextGateStartIso = getNextGapAutoFillStart(lastEnd).startIso;
                      const annEndMd = annEnd ? formatMonthDay(annEnd) : '';
                      const lastEndMd = formatMonthDay(lastEnd);
                      return (
                        <div
                          key="trailing-gap-interstitial"
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/95 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-900 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Gap after Gate #{lastNum}.</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            <button
                              type="button"
                              onClick={() => {
                                recordDateAdjustment(`gate-${lastGate.id}-end`, () => {
                                  const updated = currentMp3s.map(m =>
                                    m.id === lastGate.id ? { ...m, endDate: annEnd || undefined } : m
                                  );
                                  setFormData({ ...formData, timeGatedMp3s: updated });
                                });
                              }}
                              className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title={
                                annEnd
                                  ? `Extend Gate #${lastNum} End to Announcement End (${formatDatetime12(annEnd)})`
                                  : `Clear Gate #${lastNum} End date to match open-ended Announcement`
                              }
                            >
                              <ArrowDown className="w-3 h-3 text-amber-700 shrink-0" />
                              <span>
                                {annEnd
                                  ? `Extend Gate #${lastNum} (${annEndMd})`
                                  : `Clear Gate #${lastNum} End (${lastEndMd})`}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                recordDateAdjustment('ann-end', () =>
                                  setFormData({ ...formData, endDate: lastEnd })
                                )
                              }
                              className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title={`Set Announcement End to Gate #${lastNum} End (${formatDatetime12(lastEnd)})`}
                            >
                              <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                              <span>Set Announc. End to Gate #{lastNum} ({lastEndMd})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLastDateAdjustment(null);
                                addInlineDraftGate(nextGateStartIso, annEnd || undefined);
                              }}
                              className="px-2 py-0.5 rounded border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                            >
                              <Plus className="w-3 h-3 stroke-[3] shrink-0" />
                              <span>Add New Gate</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // Trailing Overreach: Announcement has an End date, and lastGate is open-ended or ends after Announcement End
                    if (annEnd && ((!lastEnd && lastStart) || (lastEnd && lastEnd > annEnd))) {
                      const annEndMd = formatMonthDay(annEnd);
                      const lastEndMd = lastEnd ? formatMonthDay(lastEnd) : '';
                      return (
                        <div
                          key="trailing-overreach-interstitial"
                          className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-100/70 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-800 shadow-2xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Gate #{lastNum} ends after Announcement ends.
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
                            {!(
                              playedGateBounds[lastGate.id]?.lastPlayedLocalIso &&
                              annEnd < playedGateBounds[lastGate.id]!.lastPlayedLocalIso!
                            ) && (
                              <button
                                type="button"
                                onClick={() => {
                                  recordDateAdjustment(`gate-${lastGate.id}-end`, () => {
                                    const updated = currentMp3s.map(m =>
                                      m.id === lastGate.id ? { ...m, endDate: annEnd } : m
                                    );
                                    setFormData({ ...formData, timeGatedMp3s: updated });
                                  });
                                }}
                                className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 transition-colors flex items-center gap-1 cursor-pointer select-none shadow-2xs whitespace-normal text-left leading-tight"
                                title={`Set Gate #${lastNum} End date to ${formatDatetime12(annEnd)}`}
                              >
                                <ArrowUp className="w-3 h-3 text-indigo-700 shrink-0" />
                                <span>End Gate #{lastNum} ({annEndMd})</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                recordDateAdjustment('ann-end', () =>
                                  setFormData({ ...formData, endDate: undefined })
                                )
                              }
                              className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors select-none shadow-2xs whitespace-normal text-left leading-tight"
                              title={`Clear the ${formatShortDateMDY(annEnd)} Announcement End date`}
                            >
                              Clear Announc. End ({annEndMd})
                            </button>
                            {lastEnd && (
                              <button
                                type="button"
                                onClick={() =>
                                  recordDateAdjustment('ann-end', () =>
                                    setFormData({ ...formData, endDate: lastEnd })
                                  )
                                }
                                className="px-2 py-0.5 rounded border border-amber-400 bg-white hover:bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors select-none shadow-2xs whitespace-normal text-left leading-tight"
                              >
                                <ArrowDown className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>Set Announc. End to Gate #{lastNum} ({lastEndMd})</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setLastDateAdjustment(null);
                                addInlineDraftGate();
                              }}
                              className="px-2 py-0.5 rounded border border-emerald-700 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-0.5 cursor-pointer transition-colors whitespace-normal text-left leading-tight"
                              title="Add a new gate"
                            >
                              <Plus className="w-3 h-3 stroke-[3] shrink-0" />
                              <span>Add New Gate</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  };

                  return (
                    <>
                      {pastIndexedGates.length > 0 && (
                        <div className="border-b border-slate-300 bg-slate-100/80">
                          <button
                            type="button"
                            onClick={() => setShowPastGates(prev => !prev)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-1.5">
                              {showPastGates ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <Archive className="w-3.5 h-3.5 text-slate-500" />
                              <span>Past Gates ({pastIndexedGates.length})</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                              {showPastGates ? 'Hide past gates' : 'Show past gates (Reuse)'}
                            </span>
                          </button>

                          {showPastGates && (
                            <div className="p-2 space-y-2.5 border-t border-slate-300 bg-slate-100/60">
                              {pastIndexedGates.map(({ item, idx }) => renderGateCard(item, idx, true))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="p-2 space-y-2 bg-slate-50/40">
                        {validation.parentBlockingErrors && validation.parentBlockingErrors.length > 0 && (
                          <div className="space-y-1">
                            {validation.parentBlockingErrors.map((msg, i) => (
                              <div
                                key={`parent-err-${i}`}
                                className="px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50 flex items-center gap-1.5 text-xs font-bold text-red-900 shadow-2xs"
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                <span>{msg}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeIndexedGates.length > 0 ? (
                          <>
                            {renderLeadingInterstitial()}
                            {activeIndexedGates.map(({ item, idx }, activePos) => (
                              <React.Fragment key={item.id}>
                                {renderGateCard(item, idx, false)}
                                {renderMiddleInterstitial(activePos)}
                              </React.Fragment>
                            ))}
                            {renderTrailingInterstitial()}
                          </>
                        ) : (
                          <div className="p-2.5 bg-amber-50/70 rounded border border-amber-200 text-xs font-bold text-amber-800 flex items-center justify-between gap-2">
                            <span>
                              No active or upcoming gates scheduled. Expand Past or Inactivated Gates to reuse a prior gate, or click &apos;+ ADD GATE&apos;.
                            </span>
                          </div>
                        )}

                        {/* Persistent blank gate header bar with + ADD GATE in the Gate #x position */}
                        <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-100/70">
                          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-slate-200/60">
                            <button
                              type="button"
                              onClick={() => addInlineDraftGate()}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs select-none"
                              title="Add a new schedule gate"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>ADD GATE</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {inactivatedIndexedGates.length > 0 && (
                        <div className="border-t border-slate-300 bg-slate-100/80">
                          <button
                            type="button"
                            onClick={() => setShowInactivatedGates(prev => !prev)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-1.5">
                              {showInactivatedGates ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <Archive className="w-3.5 h-3.5 text-slate-500" />
                              <span>Inactivated Gates ({inactivatedIndexedGates.length})</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                              {showInactivatedGates
                                ? 'Hide inactivated gates'
                                : 'Show inactivated gates (Reactivate / Reuse)'}
                            </span>
                          </button>

                          {showInactivatedGates && (
                            <div className="p-2 space-y-2.5 border-t border-slate-300 bg-slate-100/60">
                              {inactivatedIndexedGates.map(({ item, idx }) => renderGateCard(item, idx, true))}
                            </div>
                          )}
                        </div>
                      )}

                      {pendingGateUploadCollision && (
                        <div
                          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setPendingGateUploadCollision(null)}
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
                                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none truncate">
                                  File Already Exists
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPendingGateUploadCollision(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Cancel"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-4 space-y-2 text-xs text-slate-700 leading-relaxed">
                              <p className="font-bold text-slate-800">
                                &ldquo;{pendingGateUploadCollision.file.name}&rdquo; already exists in the Announcements folder.
                              </p>
                              <p className="text-slate-600 font-medium">
                                Choose whether to save as a new copy or overwrite the existing file.
                              </p>
                            </div>
                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setPendingGateUploadCollision(null)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const { file, target, copyCandidateName } = pendingGateUploadCollision;
                                  setPendingGateUploadCollision(null);
                                  performGateFileUpload(file, target, copyCandidateName, false);
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-xs font-black uppercase tracking-wider cursor-pointer shadow-xs"
                              >
                                Save Copy ({pendingGateUploadCollision.copyCandidateName})
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const { file, target, existingName } = pendingGateUploadCollision;
                                  setPendingGateUploadCollision(null);
                                  performGateFileUpload(file, target, existingName, true);
                                }}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white border border-amber-700 rounded text-xs font-black uppercase tracking-wider cursor-pointer shadow-xs"
                              >
                                Overwrite
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {gateDeleteConfirmState && (
                        <div
                          className="fixed inset-0 z-[175] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setGateDeleteConfirmState(null)}
                        >
                          <div
                            className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-3.5 px-4 bg-red-50 border-b border-red-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-red-600 p-1.5 rounded text-white shrink-0">
                                  <Trash2 className="w-4 h-4" />
                                </div>
                                <h4 className="text-xs font-black text-red-950 uppercase tracking-widest leading-none truncate">
                                  {gateDeleteConfirmState.title}
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => setGateDeleteConfirmState(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Cancel"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-4 text-xs font-bold text-slate-700 leading-relaxed">
                              {gateDeleteConfirmState.message}
                            </div>
                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setGateDeleteConfirmState(null)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={gateDeleteConfirmState.onConfirm}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border border-red-700 rounded text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {gateDeleteConfirmState.confirmLabel || 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {inactivateLastMediaPromptState && (
                        <div
                          className="fixed inset-0 z-[175] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setInactivateLastMediaPromptState(null)}
                        >
                          <div
                            className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                                  <AlertCircle className="w-4 h-4" />
                                </div>
                                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                                  No Active Media
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => setInactivateLastMediaPromptState(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Close"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="p-4 text-xs font-bold text-slate-800 leading-relaxed">
                              Warning - Gate #{inactivateLastMediaPromptState.gateNumber} has no active media.
                            </div>

                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => setInactivateLastMediaPromptState(null)}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-xs font-black uppercase tracking-wider cursor-pointer shadow-xs"
                              >
                                OK
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {reactivatePromptState && (
                        <div
                          className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setReactivatePromptState(null)}
                        >
                          <div
                            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                                  <AlertCircle className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                                    Reactivate Inactivated Gate
                                  </h4>
                                  <p className="text-xs font-bold text-slate-500 truncate mt-1">
                                    {reactivatePromptState.missedCount} scheduled{' '}
                                    {reactivatePromptState.missedCount === 1 ? 'slot was' : 'slots were'} missed while
                                    inactivated
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReactivatePromptState(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Cancel"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="p-4 space-y-3 text-xs text-slate-700 leading-relaxed">
                              <p className="font-bold text-slate-800">
                                While this gate was inactivated,{' '}
                                <span className="text-amber-700 font-black">
                                  {reactivatePromptState.missedCount} scheduled{' '}
                                  {reactivatePromptState.missedCount === 1 ? 'occurrence' : 'occurrences'}
                                </span>{' '}
                                passed without playing. How would you like to reactivate it?
                              </p>

                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => applyReactivateInPlace(reactivatePromptState.gate)}
                                  className="w-full text-left p-2.5 rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 transition-colors cursor-pointer space-y-0.5"
                                >
                                  <div className="font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                                    <span>1. Reactivate With Gaps</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                      Keep Single Gate
                                    </span>
                                  </div>
                                  <p className="text-slate-600 font-medium">
                                    Restores the gate in-place across its original Start and End dates. The{' '}
                                    {reactivatePromptState.missedCount} missed{' '}
                                    {reactivatePromptState.missedCount === 1 ? 'slot' : 'slots'} during the inactivated
                                    window will appear as unplayed gaps.
                                  </p>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => applyReactivateSplitToNewGate(reactivatePromptState.gate)}
                                  className="w-full text-left p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/30 hover:border-emerald-500 hover:bg-emerald-50/70 transition-colors cursor-pointer space-y-0.5"
                                >
                                  <div className="font-black text-emerald-950 uppercase tracking-wider flex items-center justify-between">
                                    <span>2. Split to New Gate</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                      Clean History
                                    </span>
                                  </div>
                                  <p className="text-slate-600 font-medium">
                                    Closes the historical gate at the time it was inactivated and creates a new active
                                    gate from now until the original End date.
                                  </p>
                                </button>
                              </div>
                            </div>

                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => setReactivatePromptState(null)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {(isGateUploading || gateUploadError) && (
                        <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-950/60">
                          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden p-4 space-y-3 text-center">
                            {isGateUploading ? (
                              <>
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
                                  <RefreshCw className="w-5 h-5 animate-spin" />
                                </div>
                                <div className="space-y-1">
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                    Uploading File...
                                  </h4>
                                  <p className="text-xs font-medium text-slate-600">
                                    Please wait while the file is uploaded and attached to this gate.
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
                                  <AlertCircle className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <h4 className="text-xs font-black text-red-900 uppercase tracking-widest">
                                    Upload Failed
                                  </h4>
                                  <p className="text-xs font-bold text-red-700 break-words">
                                    {gateUploadError}
                                  </p>
                                </div>
                                <div className="pt-1 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => setGateUploadError(null)}
                                    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                                  >
                                    Close
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right Column: Date/Advanced Rules */}
          <div className="space-y-4 w-full max-w-[650px] min-[1500px]:sticky min-[1500px]:top-0 min-[1500px]:self-start">
            {formData.type === AnnouncementType.ONE_TIME && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-4">
                <h4 className="text-xs font-black text-purple-700 uppercase tracking-widest">Static Play Logic</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-400 uppercase">Target Date</label>
                    <CalendarDateInput
                      value={formData.date || ''}
                      onChange={d => setFormData({ ...formData, date: d })}
                      className={cn(
                        'w-full px-2 py-1.5 border rounded text-xs font-bold text-slate-850 outline-none bg-white',
                        !formData.date && editingId ? 'border-red-300 bg-red-50' : 'border-purple-200'
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-400 uppercase">Target Hour</label>
                    <select
                      value={formData.time || ''}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                      className={cn(
                        'w-full px-2 py-1.5 border rounded text-xs outline-none bg-white font-bold',
                        !formData.time && editingId ? 'border-red-300 bg-red-50' : 'border-purple-200'
                      )}
                    >
                      <option value="">Select Hour</option>
                      {Array.from({ length: 24 }).map((_, i) => {
                        const val = i.toString().padStart(2, '0');
                        return (
                          <option key={val} value={val}>
                            {formatHour12(i, false)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {formData.type === AnnouncementType.ADVANCED && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">Weekly Announcement</h4>
                  <div className="flex gap-2 text-xs font-black uppercase text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400 stroke-[3.5] grid-weekly-check-icon" />{' '}
                      Active
                    </span>
                    <span className="flex items-center gap-1.5">
                      <X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" />{' '}
                      Inactive
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-blue-200/80 dark:border-slate-700/60 rounded-lg bg-white dark:bg-slate-900 shadow-xs grid-weekly-table-container">
                  <table className="w-full border-collapse table-fixed grid-weekly-table">
                    <thead>
                      <tr className="bg-blue-50/60 dark:bg-slate-800/60 border-b border-blue-200/80 dark:border-slate-700/60">
                        <th className="p-1 w-20 text-center border-r border-blue-200/80 dark:border-slate-700/60">
                          <button
                            onClick={() => {
                              const currentRules = formData.gridRules || [];
                              const allKeys = Array.from({ length: 7 }, (_, d) =>
                                Array.from({ length: 24 }, (_, h) => `${d}-${h}`)
                              ).flat();

                              if (currentRules.length === allKeys.length) {
                                setFormData({ ...formData, gridRules: [] });
                              } else {
                                setFormData({ ...formData, gridRules: allKeys });
                              }
                            }}
                            className="px-1.5 py-0.5 rounded bg-blue-600 text-xs font-black text-white hover:bg-blue-700 transition-colors uppercase cursor-pointer"
                          >
                            All
                          </button>
                        </th>
                        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, i) => (
                          <th
                            key={i}
                            onClick={() => toggleColumn(i)}
                            className="p-1 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase text-center border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0"
                          >
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <tr key={h} className="hover:bg-blue-100/30 dark:hover:bg-slate-800/40 transition-colors">
                          <td
                            onClick={() => toggleRow(h)}
                            className="p-0 text-xs font-black text-slate-500 dark:text-slate-400 pr-1.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-r border-b border-blue-200/80 dark:border-slate-700/60 text-right leading-none h-4 font-sans tabular-nums select-none"
                          >
                            {formatHour12(h, false)}
                          </td>
                          {Array.from({ length: 7 }).map((_, d) => {
                            const active = formData.gridRules?.includes(`${d}-${h}`);
                            return (
                              <td
                                key={d}
                                className="p-0 border-b border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0"
                              >
                                <button
                                  onClick={() => toggleGridCell(d, h)}
                                  className={cn(
                                    'w-full h-4 flex items-center justify-center transition-all cursor-pointer',
                                    active
                                      ? 'grid-weekly-cell-active bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-800 dark:hover:bg-emerald-700 shadow-xs'
                                      : 'grid-weekly-cell-inactive bg-slate-100 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50'
                                  )}
                                >
                                  {active ? (
                                    <Check className="w-3 h-3 text-white stroke-[3.5] grid-weekly-check-icon" />
                                  ) : (
                                    <X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-400 italic font-medium pt-2 border-t border-blue-100/50">
                  * Headers are clickable to toggle entire columns or rows.
                </p>
              </div>
            )}

            {formData.type === AnnouncementType.BASIC_HOURLY && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center space-y-2 min-h-[100px]">
                <div className="flex flex-col items-center justify-center opacity-80">
                  <Clock className="w-6 h-6 text-blue-500 mb-1" />
                  <p className="text-xs text-blue-700 font-medium">
                    Auto-repeat hourly trigger enabled at minute :
                    {formData.minute?.toString().padStart(2, '0') || '00'}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Bar (History lives in top header next to Name; bottom-left holds Inactivate / Reactivate / Delete) */}
      <div className="p-4 py-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew &&
            (formData.enabled !== false ? (
              announcementTotalPlays > 0 ? (
                <button
                  type="button"
                  disabled={isSavingAnnouncement || isGateUploading}
                  onClick={() => setFormData({ ...formData, enabled: false })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs select-none disabled:opacity-50"
                  title="Inactivate this announcement (preserves schedule and broadcast history)"
                >
                  <Archive className="w-3.5 h-3.5 text-amber-700" />
                  <span>Inactivate</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSavingAnnouncement || isGateUploading}
                  onClick={() => setDeleteConfirmId(editingId!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded text-xs font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-wider transition-all cursor-pointer shadow-xs bg-white disabled:opacity-50 select-none"
                  title="Delete this unused announcement (0 logged plays)"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  <span>Delete</span>
                </button>
              )
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSavingAnnouncement || isGateUploading}
                  onClick={() => {
                    const nowLocal = getCurrentDatetimeLocal();
                    const shouldClearPastEnd = Boolean(
                      formData.endDate && formatToDatetimeLocal(formData.endDate) <= nowLocal
                    );
                    setFormData({
                      ...formData,
                      enabled: true,
                      ...(shouldClearPastEnd ? { endDate: undefined } : {}),
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs select-none disabled:opacity-50"
                  title="Reactivate this announcement"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Reactivate</span>
                </button>
                {announcementTotalPlays === 0 && (
                  <button
                    type="button"
                    disabled={isSavingAnnouncement || isGateUploading}
                    onClick={() => setDeleteConfirmId(editingId!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded text-xs font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-wider transition-all cursor-pointer shadow-xs bg-white disabled:opacity-50 select-none"
                    title="Delete this unused announcement (0 logged plays)"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    <span>Delete</span>
                  </button>
                )}
              </>
            ))}
          {isNew && (
            <button
              type="button"
              disabled={isSavingAnnouncement || isGateUploading}
              onClick={() => setDeleteConfirmId(editingId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded text-xs font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-wider transition-all cursor-pointer shadow-xs bg-white disabled:opacity-50 select-none"
              title="Delete this new announcement draft"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>Delete</span>
            </button>
          )}
        </div>

        {formData.metadata && (
          <div
            className="text-xs font-sans tabular-nums text-slate-400 text-center leading-tight cursor-help select-none"
            title={`Created: ${formatMetadataDate(formData.metadata.createdDate)}`}
          >
            Modified {formatMetadataDate(formData.metadata.lastModifiedDate)}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isSavingAnnouncement || isGateUploading}
            onClick={handleCancelEdit}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </button>

          <button
            type="button"
            onClick={() => saveEdit()}
            disabled={!isFormValid || isSavingAnnouncement || isGateUploading}
            className={cn(
              'flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-blue-100 cursor-pointer hover:bg-blue-700',
              (!isFormValid || isSavingAnnouncement || isGateUploading) &&
                'opacity-50 cursor-not-allowed hover:bg-blue-600 shadow-none'
            )}
          >
            {isSavingAnnouncement ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            <span>{isSavingAnnouncement ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
