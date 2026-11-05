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
  onSelectFile: (file: MediaPickerFile) => void;
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
  onProceedWithoutFile
}) => {
  const [typeFilter, setTypeFilter] = useState<PickerTypeFilter>(
    lockAudioOnly ? 'audio' : 'all'
  );
  const [selectedFiles, setSelectedFiles] = useState<MediaPickerFile[]>([]);
  const [unusedFirst, setUnusedFirst] = useState<boolean>(false);
  const [sortField, setSortField] = useState<PickerSortField>('name');
  const [sortOrder, setSortOrder] = useState<PickerSortOrder>('asc');
  const [usageDetailFile, setUsageDetailFile] = useState<FileScheduleUsageSummary | null>(null);

  // Responsive action button icon-collapse state (collapses actions to icons first when space is tight)
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [collapseActionsToIcons, setCollapseActionsToIcons] = useState<boolean>(false);

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
      setSelectedFiles([]);
    }
  }, [isOpen, lockAudioOnly]);

  const toggleMultiSelectFile = (file: MediaPickerFile) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.name === file.name);
      if (exists) {
        return prev.filter(f => f.name !== file.name);
      }
      return [...prev, file];
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const el = tableContainerRef.current;
    if (!el) return;

    const checkWidth = () => {
      const width = el.clientWidth || window.innerWidth;
      setCollapseActionsToIcons(width < 760);
    };
    checkWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => checkWidth());
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener('resize', checkWidth);
      return () => window.removeEventListener('resize', checkWidth);
    }
  }, [isOpen]);

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
  }, [filteredFiles, lockAudioOnly, typeFilter, unusedFirst, sortField, sortOrder, usageMap]);

  if (!isOpen) return null;

  const generateUniqueCopyName = (originalName: string): string => {
    const ext = getFileExtension(originalName);
    const stem = ext ? originalName.slice(0, -ext.length) : originalName;
    const lowerSet = new Set(filteredFiles.map(f => f.name.toLowerCase()));
    let candidate = `Copy of ${stem}${ext}`;
    let counter = 2;
    while (lowerSet.has(candidate.toLowerCase())) {
      candidate = `Copy of ${stem} (${counter})${ext}`;
      counter += 1;
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
    const cleanStem = copyPromptState.targetStem.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
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
      setPendingUploadCollision(null);
      setRecentlyUploadedName(saved.name);
      if (onFileUploaded) {
        onFileUploaded({
          name: saved.name,
          path: saved.path,
          size: saved.size,
          mtimeMs: saved.mtimeMs,
          modifiedTime: saved.modifiedTime
        });
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

  const SortArrow = ({ field }: { field: PickerSortField }) => {
    const isActive = sortField === field;
    const isAsc = isActive && sortOrder === 'asc';
    const isDesc = isActive && sortOrder === 'desc';

    return (
      <span className="inline-flex flex-col ml-1 shrink-0 select-none leading-none -space-y-1">
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

  const acceptAttr = lockAudioOnly
    ? '.mp3,.wav,.flac,.ogg,.m4a,.aac'
    : '.mp3,.wav,.flac,.ogg,.m4a,.aac,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp';

  return (
    <div className={cn("fixed inset-0 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm", zIndexClassName)}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Compact Header */}
        <div className="py-2 px-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 justify-between shrink-0 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-blue-600 p-1.5 rounded">
              <FolderOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                Select Announcement
              </h3>
              <span className="text-xs font-bold text-slate-400">
                {lockAudioOnly
                  ? '(.mp3, .wav, .flac, .ogg, .m4a, .aac)'
                  : '(.mp3, .txt, .pdf, .png, .jpg, .jpeg)'}
              </span>
            </div>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-sm">
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

        {/* Body */}
        <div className="p-2.5 flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Compact Pinned Toolbar Row: Actions + Type Filter + Unused First + Count */}
          <div className="py-1.5 px-2.5 rounded bg-slate-100 border border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {onNewCopy && !lockAudioOnly && (
                <button
                  type="button"
                  onClick={onNewCopy}
                  className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer h-6"
                  title="Create a new .txt Live Read announcement"
                >
                  <span>+ CREATE LIVE READ</span>
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
                <span>{isUploading ? 'UPLOADING...' : '+ UPLOAD FILE'}</span>
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
            className="border border-slate-300 rounded bg-white flex-1 min-h-0 max-h-[460px] overflow-y-auto custom-scrollbar"
          >
            <table className="w-full border-collapse text-left table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-xs font-black text-slate-650 uppercase tracking-wider select-none">
                <tr>
                  <th
                    className={cn(
                      "py-1.5 px-2.5 border-r border-slate-200",
                      collapseActionsToIcons ? "w-[50%]" : "w-[44%]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className={cn(
                        "flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase",
                        sortField === 'name' ? "text-blue-700" : "text-slate-650"
                      )}
                      title="Sort by Filename (A–Z / Z–A)"
                    >
                      <span>Name</span>
                      <SortArrow field="name" />
                    </button>
                  </th>
                  <th className="py-1.5 px-1.5 border-r border-slate-200 w-[7%] text-center">
                    <button
                      type="button"
                      onClick={() => toggleSort('type')}
                      className={cn(
                        "inline-flex items-center justify-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase",
                        sortField === 'type' ? "text-blue-700" : "text-slate-650"
                      )}
                      title="Sort by File Type (Audio / LiveRead)"
                    >
                      <span>Type</span>
                      <SortArrow field="type" />
                    </button>
                  </th>
                  <th className="py-1.5 px-2 border-r border-slate-200 w-[13%]">
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
                  <th className="py-1.5 px-2 border-r border-slate-200 w-[13%]">
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
                  <th
                    className={cn(
                      "py-1.5 px-2.5 text-right",
                      collapseActionsToIcons ? "w-[17%]" : "w-[23%]"
                    )}
                  >
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
                    const selectedIdx = allowMultiSelect
                      ? selectedFiles.findIndex(f => f.name === file.name)
                      : -1;
                    const isRowSelected = selectedIdx !== -1;

                    return (
                      <tr
                        key={file.name || i}
                        onClick={() => {
                          if (allowMultiSelect) {
                            toggleMultiSelectFile(file);
                          }
                        }}
                        onDoubleClick={() => onSelectFile(file)}
                        className={cn(
                          "transition-colors hover:bg-blue-50/70",
                          allowMultiSelect && "cursor-pointer",
                          isRowSelected
                            ? "bg-blue-50/90"
                            : isJustUploaded
                              ? "bg-blue-50/90"
                              : i % 2 === 0
                                ? "bg-white"
                                : "bg-slate-50/70"
                        )}
                      >
                        {/* Column 1: Name + Duration */}
                        <td
                          className="py-1 px-2.5 border-r border-slate-200/70 truncate"
                          title={id3Tooltip ? `${file.name} (${id3Tooltip})` : file.name}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {allowMultiSelect && (
                              <label
                                className="inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                onClick={e => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isRowSelected}
                                  onChange={() => toggleMultiSelectFile(file)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                {isRowSelected && (
                                  <span className="px-1 py-0.2 rounded bg-blue-600 text-white text-[10px] font-black tabular-nums leading-tight">
                                    {selectedIdx + 1}
                                  </span>
                                )}
                              </label>
                            )}
                            <span className="font-bold text-slate-800 truncate">
                              {file.name}
                            </span>
                            {isAudio && dispDuration && dispDuration !== '—' && (
                              <span className="font-mono font-bold text-slate-400 shrink-0">
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

                        {/* Column 2: Type (Icon Only) */}
                        <td
                          className="py-1 px-1.5 border-r border-slate-200/70 text-center whitespace-nowrap"
                          title={typeCellTooltip}
                        >
                          <div className="inline-flex items-center justify-center">
                            {isAudio ? (
                              <Music className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            )}
                          </div>
                        </td>

                        {/* Column 3: File Date */}
                        <td className="py-1 px-2 border-r border-slate-200/70 whitespace-nowrap font-medium text-slate-600 tabular-nums">
                          {fileDateLabel}
                        </td>

                        {/* Column 4: Last Used (Plain Text, No Blob Wrapper) */}
                        <td className="py-1 px-2 border-r border-slate-200/70 whitespace-nowrap">
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
                            <span>{usage.lastUsedLabel}</span>
                          </button>
                        </td>

                        {/* Column 5: Actions (Order: Select -> Preview -> Copy -> Edit; collapses to icons first) */}
                        <td
                          className="py-1 px-2 text-right whitespace-nowrap"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            {/* 1. Select */}
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                onSelectFile(file);
                              }}
                              className={cn(
                                "bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer inline-flex items-center justify-center gap-0.5 h-6",
                                collapseActionsToIcons ? "px-1.5" : "px-2"
                              )}
                              title={`Select ${file.name}`}
                            >
                              {collapseActionsToIcons ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              ) : (
                                <span>Select</span>
                              )}
                            </button>

                            {/* 2. Preview */}
                            {!isAudio ? (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onPreviewScript(file.name);
                                }}
                                className={cn(
                                  "rounded text-xs font-bold uppercase border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center gap-1 h-6",
                                  collapseActionsToIcons ? "px-1.5" : "px-2"
                                )}
                                title="Preview file"
                              >
                                <FileText className="w-3 h-3 shrink-0" />
                                {!collapseActionsToIcons && <span>Preview</span>}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onTogglePreview(file.name);
                                }}
                                className={cn(
                                  "rounded text-xs font-bold uppercase border cursor-pointer inline-flex items-center justify-center gap-1 h-6",
                                  collapseActionsToIcons ? "px-1.5" : "px-2",
                                  previewUrl === file.name
                                    ? "bg-slate-900 text-white border-slate-900"
                                    : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                                )}
                                title={previewUrl === file.name ? 'Stop audio preview' : 'Preview audio'}
                              >
                                {previewUrl === file.name ? (
                                  <>
                                    <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                    {!collapseActionsToIcons && <span>Stop</span>}
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                    {!collapseActionsToIcons && <span>Preview</span>}
                                  </>
                                )}
                              </button>
                            )}

                            {/* 3. Copy (Duplicate on both Audio & LiveRead) */}
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
                              className="rounded text-xs font-bold uppercase border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center gap-0.5 h-6 px-1.5"
                              title={
                                isEditableTxt
                                  ? 'Duplicate live read and open in editor'
                                  : `Duplicate ${isAudio ? 'audio' : 'live read'} file with a new name`
                              }
                            >
                              <Copy className="w-3 h-3 shrink-0" />
                              {!collapseActionsToIcons && <span>Copy</span>}
                            </button>

                            {/* 4. Edit (Editable text scripts) */}
                            {isEditableTxt && onEditScript && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onEditScript(file.name);
                                }}
                                className="rounded text-xs font-bold uppercase border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center gap-0.5 h-6 px-1.5"
                                title="Edit .txt live read"
                              >
                                <Edit3 className="w-3 h-3 shrink-0" />
                                {!collapseActionsToIcons && <span>Edit</span>}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center">
                      <AlertCircle className="w-6 h-6 text-amber-500/60 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {isDriveActive ? 'No files inside Drive folder' : 'No matching resources'}
                      </p>
                      {isDriveActive && (
                        <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed uppercase font-bold">
                          Use &quot;+ UPLOAD FILE&quot; above or upload files into your Google Drive media_announcements folder.
                        </p>
                      )}
                    </td>
                  </tr>
                )}
               </tbody>
            </table>
          </div>

          {(allowMultiSelect || allowProceedEmpty) && (
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
                {allowMultiSelect && (
                  <span className="text-xs font-bold text-slate-600">
                    {selectedFiles.length > 0 ? (
                      <>
                        <span className="font-black text-blue-700">{selectedFiles.length}</span>{' '}
                        file{selectedFiles.length === 1 ? '' : 's'} checked for rotation
                      </>
                    ) : (
                      'Check multiple files to seed a rotating gate, or click Select on one file.'
                    )}
                  </span>
                )}
                {allowMultiSelect && selectedFiles.length > 0 && (
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
                  onClick={onClose}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                {allowMultiSelect && onSelectMultipleFiles && (
                  <button
                    type="button"
                    disabled={selectedFiles.length === 0}
                    onClick={() => onSelectMultipleFiles(selectedFiles)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Use Selected ({selectedFiles.length})</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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

