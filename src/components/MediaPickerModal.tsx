import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Search,
  RefreshCw,
  XCircle,
  FileText,
  Music,
  Check,
  Square,
  Play,
  AlertCircle,
  AlertTriangle,
  Edit3,
  Copy,
  Upload,
  Calendar,
  Clock,
  CheckCircle
} from 'lucide-react';
import { Announcement, AnnouncementType } from '../types';
import {
  cn,
  isAudioFile,
  isImageFile,
  getFileExtension,
  getFilenameFromUrlOrPath,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  formatTime12
} from '../lib/utils';
import {
  uploadAnnouncementMediaFile,
  copyDriveAnnouncementFile,
  availableFilesCache,
  upsertMediaCatalogFile,
  getSavedSettings,
  getStorageApiHeaders
} from '../lib/driveService';

export interface MediaPickerFile {
  name: string;
  duration?: string | number;
  path?: string;
  size?: string;
  mtimeMs?: number;
  modifiedTime?: string;
}

import {
  FileScheduleUsageEntry,
  FileScheduleUsageSummary,
  formatShortDateMDY,
  computeFileScheduleUsageMap,
} from '../lib/scheduleEngine';

export type { FileScheduleUsageEntry, FileScheduleUsageSummary };
export { formatShortDateMDY, computeFileScheduleUsageMap };

export type PickerTypeFilter = 'all' | 'audio' | 'liveread';
export type PickerSortField = 'name' | 'type' | 'fileDate' | 'lastUsed';
export type PickerSortOrder = 'asc' | 'desc';

export interface MediaPickerSelectOptions {
  pairedBackupAudioFile?: string;
  doNotAttachBackup?: boolean;
  approximateReadTime?: string;
  isAutoReadTime?: boolean;
}

export interface MediaPickerContextInfo {
  mode: 'choose' | 'replace';
  contextDescription: string;
  currentFile?: {
    name: string;
    duration?: string;
    approximateReadTime?: string;
    playCount?: number;
  } | null;
}

export interface MediaPickerModalProps {
  isOpen: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filteredFiles: MediaPickerFile[];
  pickerDurations: Record<string, string>;
  metadataCache: Record<string, any>;
  previewUrl: string | null;
  onTogglePreview: (fileName: string) => void;
  onPreviewScript: (fileName: string) => void;
  onNewCopy?: () => void;
  onEditScript?: (fileName: string) => void;
  onCopyScript?: (fileName: string) => void;
  onSelectFile: (file: MediaPickerFile, options?: MediaPickerSelectOptions) => void;
  onClose: () => void;
  onRefresh?: () => Promise<any> | void;
  isRefreshing: boolean;
  isDriveActive: boolean;
  announcements?: Announcement[];
  currentEditingAnnouncement?: Partial<Announcement> | null;
  lockAudioOnly?: boolean;
  onFileUploaded?: (uploadedFile: MediaPickerFile) => void;
  zIndexClassName?: string;
  allowMultiSelect?: boolean;
  allowProceedEmpty?: boolean;
  onSelectMultipleFiles?: (files: MediaPickerFile[]) => void;
  onProceedWithoutFile?: () => void;
  highlightedFileName?: string | null;
  replacingPlayedMediaInfo?: {
    priorFileName: string;
    playCount: number;
  } | null;
  pickerContextInfo?: MediaPickerContextInfo | null;
  externalPendingConfirmSelection?: {
    file: MediaPickerFile;
    options?: MediaPickerSelectOptions;
  } | null;
  onClearExternalPendingConfirmSelection?: () => void;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  searchQuery,
  onSearchQueryChange,
  filteredFiles,
  pickerDurations,
  metadataCache,
  previewUrl,
  onTogglePreview,
  onPreviewScript,
  onNewCopy,
  onEditScript,
  onCopyScript,
  onSelectFile,
  onClose,
  onRefresh,
  isRefreshing,
  isDriveActive,
  announcements = [],
  currentEditingAnnouncement = null,
  lockAudioOnly = false,
  onFileUploaded,
  zIndexClassName = 'z-[120]',
  allowMultiSelect = false,
  allowProceedEmpty = false,
  onSelectMultipleFiles,
  onProceedWithoutFile,
  highlightedFileName = null,
  replacingPlayedMediaInfo = null,
  pickerContextInfo = null,
  externalPendingConfirmSelection = null,
  onClearExternalPendingConfirmSelection
}) => {
  const [typeFilter, setTypeFilter] = useState<PickerTypeFilter>(
    lockAudioOnly ? 'audio' : 'all'
  );
  const [selectedFiles, setSelectedFiles] = useState<MediaPickerFile[]>([]);
  const [unusedFirst, setUnusedFirst] = useState<boolean>(false);
  const [sortField, setSortField] = useState<PickerSortField>('name');
  const [sortOrder, setSortOrder] = useState<PickerSortOrder>('asc');
  const [usageDetailFile, setUsageDetailFile] = useState<FileScheduleUsageSummary | null>(null);
  const [pendingReplaceConfirmFile, setPendingReplaceConfirmFile] = useState<MediaPickerFile | null>(null);
  const [pendingReplaceConfirmOptions, setPendingReplaceConfirmOptions] = useState<MediaPickerSelectOptions | undefined>(undefined);

  // Responsive action button icon-collapse state (collapses actions to icons first when space is tight)
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [collapseActionsToIcons, setCollapseActionsToIcons] = useState<boolean>(false);
  const [tableScrollbarWidth, setTableScrollbarWidth] = useState<number>(0);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentlyUploadedName, setRecentlyUploadedName] = useState<string | null>(null);
  const [pendingUploadCollision, setPendingUploadCollision] = useState<{
    file: File;
    existingName: string;
    copyCandidateName: string;
  } | null>(null);

  // Duplicate / Copy rename prompt state for audio and non-editable files
  const [copyPromptState, setCopyPromptState] = useState<{
    sourceFile: MediaPickerFile;
    targetStem: string;
    ext: string;
    isCopying: boolean;
    error: string | null;
    overwriteConfirmName: string | null;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTypeFilter(lockAudioOnly ? 'audio' : 'all');
      setUploadError(null);
      setPendingUploadCollision(null);
      setUsageDetailFile(null);
      setCopyPromptState(null);
      setPendingReplaceConfirmFile(null);
      setPendingReplaceConfirmOptions(undefined);
      setSelectedFiles([]);
    }
  }, [isOpen, lockAudioOnly]);

  useEffect(() => {
    if (isOpen && externalPendingConfirmSelection) {
      const { file, options } = externalPendingConfirmSelection;
      setRecentlyUploadedName(file.name);
      setSelectedFiles([file]);
      if (
        replacingPlayedMediaInfo &&
        replacingPlayedMediaInfo.playCount > 0 &&
        getFilenameFromUrlOrPath(file.name).toLowerCase() !==
          getFilenameFromUrlOrPath(replacingPlayedMediaInfo.priorFileName).toLowerCase()
      ) {
        setPendingReplaceConfirmFile(file);
        setPendingReplaceConfirmOptions(options);
      } else {
        onSelectFile(file, options);
      }
      if (onClearExternalPendingConfirmSelection) {
        onClearExternalPendingConfirmSelection();
      }
    }
  }, [isOpen, externalPendingConfirmSelection, replacingPlayedMediaInfo, onSelectFile, onClearExternalPendingConfirmSelection]);

  useEffect(() => {
    if (isOpen && highlightedFileName) {
      setRecentlyUploadedName(highlightedFileName);
      const match = filteredFiles.find(
        f => f.name.toLowerCase() === highlightedFileName.toLowerCase()
      ) || { name: highlightedFileName };
      setSelectedFiles(prev => {
        const filtered = prev.filter(f => f.name.toLowerCase() !== highlightedFileName.toLowerCase());
        return allowMultiSelect ? [...filtered, match] : [match];
      });
    }
  }, [isOpen, highlightedFileName]);

  useEffect(() => {
    if (!isOpen || !recentlyUploadedName) return;
    const timer = window.setTimeout(() => {
      const rowEl = tableContainerRef.current?.querySelector('[data-recently-uploaded="true"]');
      if (rowEl && typeof (rowEl as HTMLElement).scrollIntoView === 'function') {
        (rowEl as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [isOpen, recentlyUploadedName, filteredFiles.length, unusedFirst, sortField, sortOrder]);

  const toggleSelectFile = (file: MediaPickerFile) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.name.toLowerCase() === file.name.toLowerCase());
      if (allowMultiSelect) {
        if (exists) {
          return prev.filter(f => f.name.toLowerCase() !== file.name.toLowerCase());
        }
        return [...prev, file];
      }
      // Single-select mode: toggle the clicked file as the sole selection
      return exists ? [] : [file];
    });
  };

  const attemptSelectSingleFile = (file: MediaPickerFile, options?: MediaPickerSelectOptions) => {
    if (
      replacingPlayedMediaInfo &&
      replacingPlayedMediaInfo.playCount > 0 &&
      getFilenameFromUrlOrPath(file.name).toLowerCase() !==
        getFilenameFromUrlOrPath(replacingPlayedMediaInfo.priorFileName).toLowerCase()
    ) {
      setPendingReplaceConfirmFile(file);
      setPendingReplaceConfirmOptions(options);
      return;
    }
    onSelectFile(file, options);
  };

  useEffect(() => {
    if (!isOpen) return;
    const el = tableContainerRef.current;
    if (!el) return;

    const checkWidth = () => {
      const width = el.clientWidth || window.innerWidth;
      setCollapseActionsToIcons(width < 640);
      const borderWidth = (el.offsetWidth - el.clientWidth) >= 2 ? 2 : 0;
      const sbWidth = Math.max(0, el.offsetWidth - el.clientWidth - borderWidth);
      setTableScrollbarWidth(sbWidth);
    };
    checkWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => checkWidth());
      ro.observe(el);
      if (el.firstElementChild) {
        ro.observe(el.firstElementChild);
      }
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', checkWidth);
      return () => window.removeEventListener('resize', checkWidth);
    }
  }, [isOpen, filteredFiles.length, typeFilter, searchQuery]);

  const usageMap = useMemo(
    () => computeFileScheduleUsageMap(announcements, currentEditingAnnouncement),
    [announcements, currentEditingAnnouncement]
  );

  const getFileMtimeMs = (file: MediaPickerFile): number => {
    if (typeof file.mtimeMs === 'number' && !isNaN(file.mtimeMs)) {
      return file.mtimeMs;
    }
    if (file.modifiedTime) {
      const parsed = new Date(file.modifiedTime).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    const cached = availableFilesCache.get(file.name);
    if (cached) {
      if (typeof cached.mtimeMs === 'number' && !isNaN(cached.mtimeMs)) {
        return cached.mtimeMs;
      }
      if (cached.modifiedTime) {
        const parsed = new Date(cached.modifiedTime).getTime();
        if (!isNaN(parsed)) return parsed;
      }
    }
    return 0;
  };

  const getUsageForFile = (fileName: string): FileScheduleUsageSummary => {
    const key = getFilenameFromUrlOrPath(fileName).toLowerCase();
    return (
      usageMap.get(key) || {
        fileName,
        isUsed: false,
        isCurrent: false,
        lastUsedLabel: 'Never',
        sortRankMs: 0,
        entries: []
      }
    );
  };

  const toggleSort = (field: PickerSortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      // Default to descending for dates/usage so newest/current appear first, ascending for Name/Type
      setSortOrder(field === 'fileDate' || field === 'lastUsed' ? 'desc' : 'asc');
    }
  };

  const sortedAndFilteredFiles = useMemo(() => {
    const effectiveTypeFilter: PickerTypeFilter = lockAudioOnly ? 'audio' : typeFilter;

    const list = filteredFiles.filter(f => {
      const isAudio = isAudioFile(f.name);
      if (effectiveTypeFilter === 'audio') return isAudio;
      if (effectiveTypeFilter === 'liveread') return !isAudio;
      return true;
    });

    // Always keep checked files visible even when filtered out by searchQuery or typeFilter (#79)
    if (selectedFiles.length > 0) {
      const existingNames = new Set(list.map(f => f.name.toLowerCase()));
      for (const sel of selectedFiles) {
        if (!existingNames.has(sel.name.toLowerCase())) {
          list.push(sel);
          existingNames.add(sel.name.toLowerCase());
        }
      }
    }

    list.sort((a, b) => {
      const usageA = getUsageForFile(a.name);
      const usageB = getUsageForFile(b.name);

      // If "Unused First" toggle is active, surface unused files (Last Used === Never) to the top
      if (unusedFirst) {
        const aUnused = !usageA.isUsed;
        const bUnused = !usageB.isUsed;
        if (aUnused !== bUnused) {
          return aUnused ? -1 : 1;
        }
      }

      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      } else if (sortField === 'type') {
        const typeA = isAudioFile(a.name) ? 'Audio' : 'LiveRead';
        const typeB = isAudioFile(b.name) ? 'Audio' : 'LiveRead';
        cmp = typeA.localeCompare(typeB, undefined, { sensitivity: 'base' });
        if (cmp === 0) {
          const extA = getFileExtension(a.name).toLowerCase();
          const extB = getFileExtension(b.name).toLowerCase();
          cmp = extA.localeCompare(extB, undefined, { sensitivity: 'base' });
        }
      } else if (sortField === 'fileDate') {
        const dateA = getFileMtimeMs(a);
        const dateB = getFileMtimeMs(b);
        cmp = dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
      } else if (sortField === 'lastUsed') {
        const rankA = usageA.sortRankMs;
        const rankB = usageB.sortRankMs;
        cmp = rankA < rankB ? -1 : rankA > rankB ? 1 : 0;
      }

      if (cmp !== 0) {
        return sortOrder === 'asc' ? cmp : -cmp;
      }

      // Tie-breaker: alphabetical A-Z by filename
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });

    return list;
  }, [filteredFiles, selectedFiles, lockAudioOnly, typeFilter, unusedFirst, sortField, sortOrder, usageMap]);

  if (!isOpen) return null;

  const generateUniqueCopyName = (originalName: string): string => {
    const ext = getFileExtension(originalName);
    const rawStem = (ext ? originalName.slice(0, -ext.length) : originalName)
      .replace(/^(?:Copy of\s+)+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const baseStem = rawStem.replace(/\s*\(\d+\)$/, '').trim() || rawStem;
    const lowerSet = new Set(
      filteredFiles.map(f => f.name.replace(/\s{2,}/g, ' ').trim().toLowerCase())
    );
    let counter = 2;
    let candidate = `${baseStem} (${counter})${ext}`;
    while (lowerSet.has(candidate.toLowerCase())) {
      counter += 1;
      candidate = `${baseStem} (${counter})${ext}`;
    }
    return candidate;
  };

  const openDuplicateFilePrompt = (file: MediaPickerFile) => {
    const ext = getFileExtension(file.name);
    const uniqueName = generateUniqueCopyName(file.name);
    const targetStem = ext && uniqueName.toLowerCase().endsWith(ext.toLowerCase())
      ? uniqueName.slice(0, -ext.length)
      : uniqueName;
    setCopyPromptState({
      sourceFile: file,
      targetStem,
      ext,
      isCopying: false,
      error: null,
      overwriteConfirmName: null
    });
  };

  const executeDuplicateFile = async (allowOverwrite: boolean = false) => {
    if (!copyPromptState) return;
    const cleanStem = copyPromptState.targetStem
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!cleanStem) {
      setCopyPromptState(prev => prev ? { ...prev, error: 'Please enter a valid filename.' } : null);
      return;
    }
    const finalTargetName = `${cleanStem}${copyPromptState.ext}`;
    setCopyPromptState(prev => prev ? { ...prev, isCopying: true, error: null } : null);

    try {
      let duplicatedFile: MediaPickerFile;
      if (isDriveActive && getSavedSettings().mode !== 'Local') {
        const copied = await copyDriveAnnouncementFile(
          copyPromptState.sourceFile.name,
          finalTargetName,
          allowOverwrite
        );
        const nowMs = Date.now();
        const streamPath = `https://www.googleapis.com/drive/v3/files/${copied.id}?alt=media`;
        upsertMediaCatalogFile({
          name: copied.name,
          id: copied.id,
          path: streamPath,
          size: copied.size,
          duration: copyPromptState.sourceFile.duration ? String(copyPromptState.sourceFile.duration) : '',
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
        });
        duplicatedFile = {
          name: copied.name,
          path: streamPath,
          size: copied.size,
          duration: copyPromptState.sourceFile.duration,
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString()
        };
      } else {
        const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch('/api/live-read/copy-file', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceFileName: copyPromptState.sourceFile.name,
            targetFileName: finalTargetName,
            allowOverwrite
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.exists) {
          setCopyPromptState(prev =>
            prev
              ? {
                  ...prev,
                  isCopying: false,
                  overwriteConfirmName: data.name || finalTargetName
                }
              : null
          );
          return;
        }
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to duplicate file');
        }
        const savedName = data.name || finalTargetName;
        const savedPath = data.path || `/api/media/stream?path=${encodeURIComponent(savedName)}`;
        upsertMediaCatalogFile({
          name: savedName,
          path: savedPath,
          size: data.size || copyPromptState.sourceFile.size || '0.1 MB',
          duration: copyPromptState.sourceFile.duration ? String(copyPromptState.sourceFile.duration) : '',
          mtimeMs: data.mtimeMs || Date.now(),
          modifiedTime: data.modifiedTime || new Date().toISOString(),
        });
        duplicatedFile = {
          name: savedName,
          path: savedPath,
          size: data.size || copyPromptState.sourceFile.size,
          duration: copyPromptState.sourceFile.duration,
          mtimeMs: data.mtimeMs || Date.now(),
          modifiedTime: data.modifiedTime || new Date().toISOString()
        };
      }

      setRecentlyUploadedName(duplicatedFile.name);
      setSelectedFiles(prev => {
        const filtered = prev.filter(f => f.name.toLowerCase() !== duplicatedFile.name.toLowerCase());
        return allowMultiSelect ? [...filtered, duplicatedFile] : [duplicatedFile];
      });
      setCopyPromptState(null);
      if (onFileUploaded) {
        onFileUploaded(duplicatedFile);
      }
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      if (err && err.exists) {
        setCopyPromptState(prev =>
          prev
            ? {
                ...prev,
                isCopying: false,
                overwriteConfirmName: err.name || finalTargetName
              }
            : null
        );
      } else {
        setCopyPromptState(prev =>
          prev
            ? {
                ...prev,
                isCopying: false,
                error: err?.message || 'Failed to duplicate file'
              }
            : null
        );
      }
    }
  };

  const performFileUpload = async (
    file: File,
    targetFileNameOverride?: string,
    allowOverwrite: boolean = false
  ) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const saved = await uploadAnnouncementMediaFile(file, {
        targetFileNameOverride,
        allowOverwrite,
        isDriveActive
      });
      const uploadedFileObj: MediaPickerFile = {
        name: saved.name,
        path: saved.path,
        size: saved.size,
        mtimeMs: saved.mtimeMs,
        modifiedTime: saved.modifiedTime
      };
      setPendingUploadCollision(null);
      setRecentlyUploadedName(saved.name);
      setSelectedFiles(prev => {
        const filtered = prev.filter(f => f.name.toLowerCase() !== saved.name.toLowerCase());
        return allowMultiSelect ? [...filtered, uploadedFileObj] : [uploadedFileObj];
      });
      if (onFileUploaded) {
        onFileUploaded(uploadedFileObj);
      }
    } catch (err: any) {
      if (err && err.exists) {
        const existingName = err.name || targetFileNameOverride || file.name;
        setPendingUploadCollision({
          file,
          existingName,
          copyCandidateName: generateUniqueCopyName(existingName)
        });
      } else {
        setUploadError(err?.message || 'Failed to upload file');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    const existingMatch = filteredFiles.find(
      f => f.name.toLowerCase() === selected.name.trim().toLowerCase()
    );
    if (existingMatch) {
      setPendingUploadCollision({
        file: selected,
        existingName: existingMatch.name,
        copyCandidateName: generateUniqueCopyName(existingMatch.name)
      });
      return;
    }

    performFileUpload(selected, selected.name, false);
  };

  const SortArrow = ({ field, noMargin = false }: { field: PickerSortField; noMargin?: boolean }) => {
    const isActive = sortField === field;
    const isAsc = isActive && sortOrder === 'asc';
    const isDesc = isActive && sortOrder === 'desc';

    return (
      <span
        className={cn(
          "inline-flex flex-col shrink-0 select-none leading-none -space-y-1",
          !noMargin && "ml-1"
        )}
      >
        <span
          className={cn(
            "text-[10px] leading-none transition-all",
            isAsc ? "text-blue-600 font-black" : "text-slate-300 font-normal opacity-50"
          )}
        >
          ▲
        </span>
        <span
          className={cn(
            "text-[10px] leading-none transition-all",
            isDesc ? "text-blue-600 font-black" : "text-slate-300 font-normal opacity-50"
          )}
        >
          ▼
        </span>
      </span>
    );
  };

  const renderCollapsibleDate = (label: string) => {
    if (!label || label === '—' || label === 'Never' || label === 'Current' || label === 'Past') {
      return <span>{label}</span>;
    }
    const match = label.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(\d{2})(.*)$/);
    if (match) {
      const m = String(parseInt(match[1], 10));
      const d = String(parseInt(match[2], 10));
      const century = match[3];
      const yy = match[4];
      const rest = match[5];
      if (collapseActionsToIcons) {
        return <span>{`${m}/${d}/${yy}${rest}`}</span>;
      }
      return (
        <span>
          {`${m}/${d}/`}
          <span className="picker-date-century">{century}</span>
          {yy}
          {rest}
        </span>
      );
    }
    return <span>{label}</span>;
  };

  const acceptAttr = lockAudioOnly
    ? '.mp3,.wav,.flac,.ogg,.m4a,.aac'
    : '.mp3,.wav,.flac,.ogg,.m4a,.aac,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp';

  return (
    <div className={cn("fixed inset-0 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm", zIndexClassName)}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Compact Header: Filter + Refresh + Close grouped together so they wrap to row 2 as a unit */}
        <div className="py-2 px-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 justify-between shrink-0 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-blue-600 p-1.5 rounded">
              <FolderOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                {pickerContextInfo?.mode === 'replace'
                  ? 'Replace Announcement'
                  : 'Choose New Announcement'}
              </h3>
              <span
                className="text-xs font-bold text-slate-400 cursor-help"
                title={
                  lockAudioOnly
                    ? 'Audio (6): .mp3, .wav, .flac, .ogg, .m4a, .aac'
                    : 'Audio (6): .mp3, .wav, .flac, .ogg, .m4a, .aac\nScripts / Docs (3): .txt, .md, .pdf\nImages (4): .png, .jpg, .jpeg, .webp'
                }
              >
                {lockAudioOnly
                  ? '(.mp3, .wav, .flac, .ogg, .m4a, .aac)'
                  : '(.mp3, .txt, .pdf, .png, .jpg, and more)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[240px] justify-end">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={
                  lockAudioOnly
                    ? 'Search backup audio files...'
                    : 'Search audio, scripts & images...'
                }
                value={searchQuery}
                onChange={e => onSearchQueryChange(e.target.value)}
                className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-800"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded hover:bg-slate-100 transition-colors"
                  title="Refresh Files"
                >
                  <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                title="Close"
              >
                <XCircle className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-2.5 flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Context & Current File Row (Above Write New Live Read Toolbar Row) */}
          {pickerContextInfo && (
            <div className="rounded border border-slate-300 bg-white overflow-hidden shrink-0">
              {pickerContextInfo.mode === 'replace' && pickerContextInfo.currentFile?.name ? (
                (() => {
                  const curName = getFilenameFromUrlOrPath(pickerContextInfo.currentFile.name);
                  const curIsAudio = isAudioFile(curName);
                  const curExt = getFileExtension(curName).toLowerCase();
                  const curIsEditableTxt = curExt === '.txt' || curExt === '.md';
                  const curCatalogMatch =
                    filteredFiles.find(f => f.name.toLowerCase() === curName.toLowerCase()) ||
                    availableFilesCache.get(curName);
                  const curDispDuration = curIsAudio
                    ? pickerDurations[curName] ||
                      pickerContextInfo.currentFile.duration ||
                      (curCatalogMatch?.duration ? String(curCatalogMatch.duration) : '')
                    : (pickerContextInfo.currentFile.approximateReadTime || '').replace(/^~\s*/, '');
                  const curMtimeMs = curCatalogMatch
                    ? getFileMtimeMs(curCatalogMatch as MediaPickerFile)
                    : 0;
                  const curDateLabel = curMtimeMs > 0 ? formatShortDateMDY(curMtimeMs) : '—';
                  const curUsage = getUsageForFile(curName);
                  const curMeta = curIsAudio ? metadataCache[curName] : null;
                  const curId3Tooltip =
                    curMeta && (curMeta.title || curMeta.artist || curMeta.album)
                      ? [curMeta.title, curMeta.artist, curMeta.album].filter(Boolean).join(' • ')
                      : '';
                  const curPlayCount = pickerContextInfo.currentFile.playCount;

                  return (
                    <div className="@container divide-y divide-slate-200 text-xs">
                      <div className="py-1 px-2.5 bg-slate-100/90 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0 select-none">
                            Context:
                          </span>
                          <span
                            className="font-bold text-slate-800 truncate"
                            title={pickerContextInfo.contextDescription}
                          >
                            {pickerContextInfo.contextDescription}
                          </span>
                        </div>
                      </div>
                      <div
                        className="bg-amber-50/40"
                        style={{
                          paddingRight: tableScrollbarWidth > 0 ? `${tableScrollbarWidth}px` : undefined
                        }}
                      >
                        <table className="w-full border-collapse text-left table-fixed">
                          <tbody>
                            <tr className="text-xs">
                              <td
                                className="py-1 px-2.5 border-r border-slate-200/70 truncate w-auto"
                                title={curId3Tooltip ? `${curName} (${curId3Tooltip})` : curName}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider shrink-0 select-none">
                                    Current
                                  </span>
                                  <span
                                    className="inline-flex items-center justify-center shrink-0"
                                    title={curIsAudio ? `Audio (${curExt || '.mp3'})` : `LiveRead (${curExt || '.txt'})`}
                                  >
                                    {curIsAudio ? (
                                      <Music className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    )}
                                  </span>
                                  <span className="font-bold text-slate-900 truncate">
                                    {curName}
                                  </span>
                                  {curDispDuration && curDispDuration !== '—' && (
                                    <span className="font-mono font-bold text-slate-500 shrink-0">
                                      ({curDispDuration})
                                    </span>
                                  )}
                                  {typeof curPlayCount === 'number' && (
                                    <span
                                      className={cn(
                                        "text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded border select-none shrink-0",
                                        curPlayCount > 0
                                          ? "bg-blue-50 text-blue-800 border-blue-200"
                                          : "bg-slate-100 text-slate-600 border-slate-300"
                                      )}
                                    >
                                      {curPlayCount} {curPlayCount === 1 ? 'play' : 'plays'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap font-medium text-slate-600 tabular-nums w-[68px] @[640px]:w-[82px]"
                                title="File Modification Date"
                              >
                                {renderCollapsibleDate(curDateLabel)}
                              </td>
                            <td className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap w-[68px] @[640px]:w-[82px]">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setUsageDetailFile(curUsage);
                                }}
                                className={cn(
                                  "font-bold inline-flex items-center gap-1 leading-none cursor-pointer hover:underline tabular-nums",
                                  curUsage.isCurrent
                                    ? "text-emerald-700 font-black"
                                    : curUsage.isUsed
                                      ? "text-amber-800"
                                      : "text-slate-500"
                                )}
                                title={
                                  curUsage.isUsed
                                    ? `Scheduled in ${curUsage.entries.length} slot(s). Click to view schedule usage history.`
                                    : 'Never scheduled. Click for details.'
                                }
                              >
                                {renderCollapsibleDate(curUsage.lastUsedLabel)}
                              </button>
                            </td>
                            <td className="py-1 px-1.5 text-right whitespace-nowrap overflow-hidden w-[84px]">
                              <div className="inline-flex items-center justify-end max-w-full">
                                <div className="inline-flex items-center rounded border border-slate-300 bg-white divide-x divide-slate-300 overflow-hidden shrink-0">
                                  {!curIsAudio ? (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onPreviewScript(curName);
                                      }}
                                      className="text-xs font-bold uppercase text-blue-600 bg-white hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                      title="Preview current file"
                                    >
                                      <FileText className="w-3 h-3 shrink-0" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onTogglePreview(curName);
                                      }}
                                      className={cn(
                                        "text-xs font-bold uppercase cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0",
                                        previewUrl === curName
                                          ? "bg-slate-900 text-white"
                                          : "bg-white text-blue-600 hover:bg-blue-50"
                                      )}
                                      title={previewUrl === curName ? 'Stop audio preview' : 'Preview current audio'}
                                    >
                                      {previewUrl === curName ? (
                                        <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                      ) : (
                                        <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                      )}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (curIsEditableTxt && onCopyScript) {
                                        onCopyScript(curName);
                                      } else {
                                        openDuplicateFilePrompt({
                                          name: curName,
                                          duration: curDispDuration || undefined
                                        });
                                      }
                                    }}
                                    className="text-xs font-bold uppercase text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                    title={
                                      curIsEditableTxt
                                        ? 'Duplicate live read and open in editor'
                                        : `Duplicate ${curIsAudio ? 'audio' : 'live read'} file with a new name`
                                    }
                                  >
                                    <Copy className="w-3 h-3 shrink-0" />
                                  </button>
                                  {curIsEditableTxt && onEditScript && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        onEditScript(curName);
                                      }}
                                      className="text-xs font-bold uppercase text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                      title="Edit .txt live read"
                                    >
                                      <Edit3 className="w-3 h-3 shrink-0" />
                                    </button>
                                  )}
                                </div>
                                {!(curIsEditableTxt && onEditScript) && (
                                  <span className="inline-block h-6 w-6 shrink-0" aria-hidden="true" />
                                )}
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="py-1.5 px-2.5 bg-slate-50 flex items-center gap-1.5 text-xs">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 shrink-0 select-none">
                    Context:
                  </span>
                  <span
                    className="font-bold text-slate-800 truncate"
                    title={pickerContextInfo.contextDescription}
                  >
                    {pickerContextInfo.contextDescription}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Compact Pinned Toolbar Row: Actions + Type Filter + Unused First + Count */}
          <div className="py-1.5 px-2.5 rounded bg-slate-100 border border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {onNewCopy && !lockAudioOnly && (
                <button
                  type="button"
                  onClick={onNewCopy}
                  className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer h-6"
                  title="Write a new .txt Live Read announcement"
                >
                  <span>+ Write New Live Read</span>
                </button>
              )}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer h-6 disabled:opacity-50"
                title="Upload a file from your computer into Media Announcements"
              >
                {isUploading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3 stroke-[2.5]" />
                )}
                <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center gap-1.5 bg-white border border-slate-300 rounded px-2 py-0.5 h-6"
                role="radiogroup"
                aria-label="Filter announcement files by type"
              >
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider select-none">
                  Type:
                </span>
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'audio', label: 'Audio' },
                    { id: 'liveread', label: 'LiveRead' }
                  ] as const
                ).map(opt => {
                  const isDisabled = lockAudioOnly && opt.id !== 'audio';
                  const isChecked = (lockAudioOnly ? 'audio' : typeFilter) === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={cn(
                        "flex items-center gap-1 text-xs font-bold select-none",
                        isDisabled
                          ? "text-slate-300 cursor-not-allowed"
                          : isChecked
                            ? "text-blue-700 font-black cursor-pointer"
                            : "text-slate-600 hover:text-slate-900 cursor-pointer"
                      )}
                    >
                      <input
                        type="radio"
                        name="media-picker-type-filter"
                        value={opt.id}
                        disabled={isDisabled}
                        checked={isChecked}
                        onChange={() => setTypeFilter(opt.id)}
                        className="text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              <label
                className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-0.5 h-6 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer select-none"
                title="Surface newly added / unscheduled files (Last Used: Never) to the top of the list"
              >
                <input
                  type="checkbox"
                  checked={unusedFirst}
                  onChange={e => setUnusedFirst(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Unused First</span>
              </label>

              <span className="text-xs font-black text-slate-500 tabular-nums pl-1">
                Count: <span className="text-slate-800">{sortedAndFilteredFiles.length}</span>
              </span>
            </div>
          </div>

          {/* Overwrite / Collision Confirmation Banner for Upload */}
          {pendingUploadCollision && (
            <div className="py-1.5 px-2.5 bg-amber-50 border border-amber-300 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">
                  &quot;{pendingUploadCollision.existingName}&quot; already exists in Media Announcements.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() =>
                    performFileUpload(
                      pendingUploadCollision.file,
                      pendingUploadCollision.copyCandidateName,
                      false
                    )
                  }
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase cursor-pointer"
                >
                  Save as &quot;{pendingUploadCollision.copyCandidateName}&quot;
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() =>
                    performFileUpload(
                      pendingUploadCollision.file,
                      pendingUploadCollision.existingName,
                      true
                    )
                  }
                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase cursor-pointer"
                >
                  Overwrite Existing
                </button>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setPendingUploadCollision(null)}
                  className="px-1.5 py-0.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="py-1.5 px-2.5 bg-red-50 border border-red-200 rounded flex items-center justify-between gap-2 text-xs font-bold text-red-700 shrink-0">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>{uploadError}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-xs font-black uppercase text-red-600 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Windows Explorer "Details" / Spreadsheet Table View */}
          <div
            ref={tableContainerRef}
            className="@container border border-slate-300 rounded bg-white flex-1 min-h-0 max-h-[460px] overflow-y-auto overflow-x-hidden custom-scrollbar"
          >
            <table className="w-full border-collapse text-left table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-xs font-black text-slate-650 uppercase tracking-wider select-none">
                <tr>
                  <th className="p-0 border-r border-slate-200 w-auto">
                    <div className="flex items-stretch min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSort('type')}
                        className={cn(
                          "py-1.5 pl-[26px] pr-1.5 border-r border-slate-200 inline-flex items-center justify-center cursor-pointer hover:text-slate-900 transition-colors shrink-0",
                          sortField === 'type' ? "text-blue-700" : "text-slate-650"
                        )}
                        title="File Type"
                        aria-label="File Type"
                      >
                        <SortArrow field="type" noMargin />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSort('name')}
                        className={cn(
                          "py-1.5 px-2 flex-1 flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase min-w-0",
                          sortField === 'name' ? "text-blue-700" : "text-slate-650"
                        )}
                        title="Sort by Filename (A–Z / Z–A)"
                      >
                        <span>Name</span>
                        <SortArrow field="name" />
                      </button>
                    </div>
                  </th>
                  <th className="py-1.5 px-1.5 border-r border-slate-200 w-[68px] @[640px]:w-[82px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('fileDate')}
                      className={cn(
                        "flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase",
                        sortField === 'fileDate' ? "text-blue-700" : "text-slate-650"
                      )}
                      title="Sort by File Modification Date"
                    >
                      <span>File Date</span>
                      <SortArrow field="fileDate" />
                    </button>
                  </th>
                  <th className="py-1.5 px-1.5 border-r border-slate-200 w-[68px] @[640px]:w-[82px]">
                    <button
                      type="button"
                      onClick={() => toggleSort('lastUsed')}
                      className={cn(
                        "flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase",
                        sortField === 'lastUsed' ? "text-blue-700" : "text-slate-650"
                      )}
                      title="Sort by Schedule Last Used (Current > Past Date > Never)"
                    >
                      <span>Last Used</span>
                      <SortArrow field="lastUsed" />
                    </button>
                  </th>
                  <th className="py-1.5 px-1.5 text-right w-[84px]">
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {sortedAndFilteredFiles.length > 0 ? (
                  sortedAndFilteredFiles.map((file, i) => {
                    const dispDuration = pickerDurations[file.name] || file.duration || '';
                    const isAudio = isAudioFile(file.name);
                    const ext = getFileExtension(file.name).toLowerCase();
                    const isEditableTxt = ext === '.txt' || ext === '.md';
                    const usage = getUsageForFile(file.name);
                    const fileMtimeMs = getFileMtimeMs(file);
                    const fileDateLabel = fileMtimeMs > 0 ? formatShortDateMDY(fileMtimeMs) : '—';
                    const isJustUploaded =
                      recentlyUploadedName &&
                      recentlyUploadedName.toLowerCase() === file.name.toLowerCase();

                    const meta = isAudio ? metadataCache[file.name] : null;
                    const id3Tooltip =
                      meta && (meta.title || meta.artist || meta.album)
                        ? [meta.title, meta.artist, meta.album].filter(Boolean).join(' • ')
                        : '';

                    const typeCellTooltip = isAudio
                      ? `Audio (${ext || '.mp3'})`
                      : `LiveRead (${ext || '.txt'})`;
                    const selectedIdx = selectedFiles.findIndex(
                      f => f.name.toLowerCase() === file.name.toLowerCase()
                    );
                    const isRowSelected = selectedIdx !== -1;

                    return (
                      <tr
                        key={file.name || i}
                        data-recently-uploaded={isJustUploaded ? 'true' : undefined}
                        onClick={() => toggleSelectFile(file)}
                        onDoubleClick={() => attemptSelectSingleFile(file)}
                        className={cn(
                          "transition-colors cursor-pointer",
                          isRowSelected
                            ? "bg-blue-200/85 hover:bg-blue-200"
                            : isJustUploaded
                              ? "bg-blue-100/90 hover:bg-blue-100"
                              : i % 2 === 0
                                ? "bg-white hover:bg-blue-50/70"
                                : "bg-slate-50/70 hover:bg-blue-50/70"
                        )}
                      >
                        {/* Column 1: Checkbox + Type Icon + Name + Duration */}
                        <td
                          className="py-1 px-2.5 border-r border-slate-200/70 truncate"
                          title={id3Tooltip ? `${file.name} (${id3Tooltip})` : file.name}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="inline-flex items-center gap-1 shrink-0">
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onClick={e => e.stopPropagation()}
                                onChange={() => toggleSelectFile(file)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              {allowMultiSelect && isRowSelected && (
                                <span className="px-1 py-0.2 rounded bg-blue-600 text-white text-[10px] font-black tabular-nums leading-tight">
                                  {selectedIdx + 1}
                                </span>
                              )}
                            </span>
                            <span
                              className="inline-flex items-center justify-center shrink-0"
                              title={typeCellTooltip}
                            >
                              {isAudio ? (
                                <Music className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              ) : (
                                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              )}
                            </span>
                            <span className="font-bold text-slate-900 truncate">
                              {file.name}
                            </span>
                            {isAudio && dispDuration && dispDuration !== '—' && (
                              <span className="font-mono font-bold text-slate-500 shrink-0">
                                ({dispDuration})
                              </span>
                            )}
                            {isJustUploaded && (
                              <span className="font-black uppercase px-1 py-0.5 rounded bg-blue-600 text-white shrink-0 leading-none">
                                New
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Column 3: File Date (folds to m/d/yy when narrow) */}
                        <td className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap font-medium text-slate-600 tabular-nums">
                          {renderCollapsibleDate(fileDateLabel)}
                        </td>

                        {/* Column 4: Last Used (folds to m/d/yy when narrow) */}
                        <td className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setUsageDetailFile(usage);
                            }}
                            className={cn(
                              "font-bold inline-flex items-center gap-1 leading-none cursor-pointer hover:underline tabular-nums",
                              usage.isCurrent
                                ? "text-emerald-700 font-black"
                                : usage.isUsed
                                  ? "text-amber-800"
                                  : "text-slate-500"
                            )}
                            title={
                              usage.isUsed
                                ? `Scheduled in ${usage.entries.length} slot(s). Click to view schedule usage history.`
                                : 'Never scheduled. Click for details.'
                            }
                          >
                            {renderCollapsibleDate(usage.lastUsedLabel)}
                          </button>
                        </td>

                        {/* Column 5: Actions (Joined segmented group; Play/Preview & Copy vertically aligned; Edit in its own right-hand land) */}
                        <td className="py-1 px-1.5 text-right whitespace-nowrap overflow-hidden">
                          <div className="inline-flex items-center justify-end max-w-full">
                            <div className="inline-flex items-center rounded border border-slate-300 bg-white divide-x divide-slate-300 overflow-hidden shrink-0">
                              {/* 1. Preview / Play */}
                              {!isAudio ? (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onPreviewScript(file.name);
                                  }}
                                  className="text-xs font-bold uppercase text-blue-600 bg-white hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                  title="Preview file"
                                >
                                  <FileText className="w-3 h-3 shrink-0" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onTogglePreview(file.name);
                                  }}
                                  className={cn(
                                    "text-xs font-bold uppercase cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0",
                                    previewUrl === file.name
                                      ? "bg-slate-900 text-white"
                                      : "bg-white text-blue-600 hover:bg-blue-50"
                                  )}
                                  title={previewUrl === file.name ? 'Stop audio preview' : 'Preview audio'}
                                >
                                  {previewUrl === file.name ? (
                                    <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                  ) : (
                                    <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                  )}
                                </button>
                              )}

                              {/* 2. Copy (Duplicate on both Audio & LiveRead) */}
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  if (isEditableTxt && onCopyScript) {
                                    onCopyScript(file.name);
                                  } else {
                                    openDuplicateFilePrompt(file);
                                  }
                                }}
                                className="text-xs font-bold uppercase text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                title={
                                  isEditableTxt
                                    ? 'Duplicate live read and open in editor'
                                    : `Duplicate ${isAudio ? 'audio' : 'live read'} file with a new name`
                                }
                              >
                                <Copy className="w-3 h-3 shrink-0" />
                              </button>

                              {/* 3. Edit (Editable text scripts) */}
                              {isEditableTxt && onEditScript && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    onEditScript(file.name);
                                  }}
                                  className="text-xs font-bold uppercase text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                  title="Edit .txt live read"
                                >
                                  <Edit3 className="w-3 h-3 shrink-0" />
                                </button>
                              )}
                            </div>
                            {!(isEditableTxt && onEditScript) && (
                              <span className="inline-block h-6 w-6 shrink-0" aria-hidden="true" />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-10 text-center">
                      <AlertCircle className="w-6 h-6 text-amber-500/60 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {isDriveActive ? 'No files inside Drive folder' : 'No matching resources'}
                      </p>
                      {isDriveActive && (
                        <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed uppercase font-bold">
                          Use &quot;Upload&quot; above or upload files into your Google Drive media_announcements folder.
                        </p>
                      )}
                    </td>
                  </tr>
                )}
               </tbody>
            </table>
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {allowProceedEmpty && onProceedWithoutFile && (
                <button
                  type="button"
                  onClick={() => onProceedWithoutFile()}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                  title="Create announcement gate now and attach files later"
                >
                  Proceed Without File
                </button>
              )}
              <span className="text-xs font-bold text-slate-600">
                {selectedFiles.length > 0 ? (
                  allowMultiSelect ? (
                    <>
                      <span className="font-black text-blue-700">{selectedFiles.length}</span>{' '}
                      file{selectedFiles.length === 1 ? '' : 's'} checked for rotation
                    </>
                  ) : (
                    <>
                      <span className="font-black text-blue-700">1</span> file checked:{' '}
                      <span className="font-mono text-slate-800">{selectedFiles[0].name}</span>
                    </>
                  )
                ) : allowMultiSelect ? (
                  'Check one or more files, then click Use Selected.'
                ) : (
                  'Check a file, then click Use Selected.'
                )}
              </span>
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isUploading}
                onClick={onClose}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedFiles.length === 0 || isUploading}
                onClick={() => {
                  if (selectedFiles.length === 0) return;
                  if (allowMultiSelect && onSelectMultipleFiles) {
                    onSelectMultipleFiles(selectedFiles);
                  } else {
                    attemptSelectSingleFile(selectedFiles[0]);
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Use Selected ({selectedFiles.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Popup Before Leaving Select Announcement When Replacing a Media Item With Logged Plays (7.c) */}
      {pendingReplaceConfirmFile && replacingPlayedMediaInfo && (
        <div
          className="fixed inset-0 z-[195] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setPendingReplaceConfirmFile(null)}
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
                onClick={() => setPendingReplaceConfirmFile(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Cancel"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900">
                Replace &quot;{replacingPlayedMediaInfo.priorFileName}&quot; with &quot;
                {pendingReplaceConfirmFile.name}&quot;?
              </p>
              <p className="font-medium text-slate-600">
                &quot;{replacingPlayedMediaInfo.priorFileName}&quot; has{' '}
                <strong className="text-slate-900">
                  {replacingPlayedMediaInfo.playCount}{' '}
                  {replacingPlayedMediaInfo.playCount === 1 ? 'logged play' : 'logged plays'}
                </strong>{' '}
                and will be moved to the{' '}
                <strong className="text-slate-900">Past / Inactivated Media</strong> section of this
                gate so its broadcast history is preserved.
              </p>
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingReplaceConfirmFile(null);
                  setPendingReplaceConfirmOptions(undefined);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const chosen = pendingReplaceConfirmFile;
                  const opts = pendingReplaceConfirmOptions;
                  setPendingReplaceConfirmFile(null);
                  setPendingReplaceConfirmOptions(undefined);
                  onSelectFile(chosen, opts);
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

      {/* Blocking Upload Status / Error Overlay Modal */}
      {(isUploading || uploadError) && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden p-4 space-y-3">
            {isUploading ? (
              <>
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div className="min-w-0">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Uploading File...
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Please wait while the file upload completes.
                    </p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full w-2/3 animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-red-900">
                      Upload Failed
                    </h4>
                    <p className="text-xs text-red-700 font-medium mt-1 leading-relaxed">
                      {uploadError}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setUploadError(null)}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Duplicate & Rename Prompt Modal for Audio / Non-Editable Files */}
      {copyPromptState && (
        <div
          className="fixed inset-0 z-[175] flex items-center justify-center p-4 bg-slate-950/60"
          onClick={() => !copyPromptState.isCopying && setCopyPromptState(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-blue-600 p-1.5 rounded text-white shrink-0">
                  <Copy className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                    Duplicate File
                  </h4>
                  <p className="text-xs font-mono font-bold text-slate-500 truncate mt-1">
                    Source: {copyPromptState.sourceFile.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={copyPromptState.isCopying}
                onClick={() => setCopyPromptState(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                  New File Name
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    disabled={copyPromptState.isCopying}
                    value={copyPromptState.targetStem}
                    onChange={e =>
                      setCopyPromptState(prev =>
                        prev
                          ? {
                              ...prev,
                              targetStem: e.target.value,
                              error: null,
                              overwriteConfirmName: null
                            }
                          : null
                      )
                    }
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !copyPromptState.isCopying) {
                        e.preventDefault();
                        executeDuplicateFile(false);
                      }
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter new file name..."
                  />
                  {copyPromptState.ext && (
                    <span className="px-2 py-1.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono font-bold text-slate-600 shrink-0">
                      {copyPromptState.ext}
                    </span>
                  )}
                </div>
              </div>

              {copyPromptState.error && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{copyPromptState.error}</span>
                </div>
              )}

              {copyPromptState.overwriteConfirmName && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-300 space-y-2">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      &quot;{copyPromptState.overwriteConfirmName}&quot; already exists. Overwrite it?
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={copyPromptState.isCopying}
                      onClick={() => executeDuplicateFile(true)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase cursor-pointer"
                    >
                      Overwrite Existing
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={copyPromptState.isCopying}
                onClick={() => setCopyPromptState(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={copyPromptState.isCopying || !copyPromptState.targetStem.trim()}
                onClick={() => executeDuplicateFile(false)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {copyPromptState.isCopying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Copying...</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Duplicate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Usage History Detail Pop-up */}
      {usageDetailFile && (
        <div
          className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-950/60"
          onClick={() => setUsageDetailFile(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="bg-blue-600 p-1.5 rounded text-white shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                    Schedule Usage History
                  </h4>
                  <p className="text-xs font-mono font-bold text-slate-500 truncate mt-1">
                    {usageDetailFile.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUsageDetailFile(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 max-h-[360px] overflow-y-auto custom-scrollbar">
              {usageDetailFile.entries.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Last Used: Never
                  </p>
                  <p className="text-xs text-slate-500">
                    This file is not attached to any active or past Announcement schedules.
                  </p>
                </div>
              ) : (
                usageDetailFile.entries.map((entry, idx) => (
                  <div
                    key={`${entry.announcementId}-${entry.role}-${idx}`}
                    className={cn(
                      "p-2.5 rounded-lg border flex flex-col gap-1",
                      entry.status === 'Current'
                        ? "bg-emerald-50/50 border-emerald-200"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-black text-slate-800 truncate">
                          {entry.announcementName}
                        </span>
                        <span className="text-xs font-bold text-slate-500 shrink-0">
                          (:{String(entry.minute || 0).padStart(2, '0')}m)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {entry.role}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-black uppercase px-1.5 py-0.5 rounded border",
                            entry.status === 'Current'
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : entry.status === 'Inactive'
                                ? "bg-slate-200 text-slate-700 border-slate-300"
                                : "bg-amber-100 text-amber-900 border-amber-300"
                          )}
                        >
                          {entry.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-medium text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span>
                        <strong className="text-slate-700">Start:</strong> {entry.startDateFormatted}
                      </span>
                      <span>
                        <strong className="text-slate-700">End:</strong> {entry.endDateFormatted}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">
                Overall Status:{' '}
                <strong className="text-slate-800">{usageDetailFile.lastUsedLabel}</strong>
              </span>
              <button
                type="button"
                onClick={() => setUsageDetailFile(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

