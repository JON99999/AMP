import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  ChevronDown,
  ChevronRight,
  Archive,
  Trash2,
  RotateCcw,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { Announcement } from '../../types';
import {
  cn,
  isAudioFile,
  getFileExtension,
  getFilenameFromUrlOrPath,
} from '../../lib/utils';
import {
  uploadAnnouncementMediaFile,
  copyDriveAnnouncementFile,
  availableFilesCache,
  upsertMediaCatalogFile,
  getSavedSettings,
  getStorageApiHeaders,
} from '../../lib/driveService';
import {
  FileScheduleUsageEntry,
  FileScheduleUsageSummary,
  formatShortDateMDY,
  computeFileScheduleUsageMap,
} from '../../lib/scheduleEngine';
import {
  MediaPickerFile,
  PickerTypeFilter,
  PickerSortField,
  PickerSortOrder,
} from '../MediaPickerModal';

export type FileManagerBucket = 'active' | 'archived' | 'deleted';
export type FileManagerSectionId = 'never_used' | 'current' | 'past' | 'archived' | 'deleted';

export interface FileManagerItem extends MediaPickerFile {
  folderBucket: FileManagerBucket;
  cloudSyncPending?: boolean;
}

export interface FileManagerViewProps {
  announcements: Announcement[];
  fallbackFiles: MediaPickerFile[];
  pickerDurations: Record<string, string>;
  metadataCache: Record<string, any>;
  previewUrl: string | null;
  onTogglePreview: (fileName: string) => void;
  onPreviewScript: (fileName: string) => void;
  onNewCopy: () => void;
  onEditScript: (fileName: string) => void;
  onCopyScript: (fileName: string) => void;
  onFileUploaded?: (uploadedFile: MediaPickerFile) => void;
  onRefreshParent?: () => Promise<any> | void;
  isDriveActive: boolean;
  externalSearchQuery?: string;
  onExternalSearchQueryChange?: (q: string) => void;
  onJumpToAnnouncement: (announcementId: string, sourceFileName: string) => void;
  returnFocusFileName?: string | null;
  onClearReturnFocusFileName?: () => void;
  refreshTrigger?: number;
  onOpenFolder?: (
    bucket: FileManagerBucket,
    resolvedLocalPath?: string,
    resolvedDriveFolderId?: string
  ) => void;
}

export const FileManagerView: React.FC<FileManagerViewProps> = ({
  announcements,
  fallbackFiles,
  pickerDurations,
  metadataCache,
  previewUrl,
  onTogglePreview,
  onPreviewScript,
  onNewCopy,
  onEditScript,
  onCopyScript,
  onFileUploaded,
  onRefreshParent,
  isDriveActive,
  externalSearchQuery = '',
  onExternalSearchQueryChange,
  onJumpToAnnouncement,
  returnFocusFileName = null,
  onClearReturnFocusFileName,
  refreshTrigger = 0,
  onOpenFolder,
}) => {
  const [files, setFiles] = useState<FileManagerItem[]>([]);
  const [folderPaths, setFolderPaths] = useState<{
    active: string;
    archived: string;
    deleted: string;
  }>({ active: '', archived: '', deleted: '' });
  const [folderIds, setFolderIds] = useState<{
    active: string;
    archived: string;
    deleted: string;
  }>({ active: '', archived: '', deleted: '' });
  const [demoBucketOverrides, setDemoBucketOverrides] = useState<Record<string, FileManagerBucket>>({});

  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const [typeFilter, setTypeFilter] = useState<PickerTypeFilter>('all');
  const [sortField, setSortField] = useState<PickerSortField>('name');
  const [sortOrder, setSortOrder] = useState<PickerSortOrder>('asc');

  const [expandedSections, setExpandedSections] = useState<Record<FileManagerSectionId, boolean>>({
    never_used: true,
    current: true,
    past: true,
    archived: false,
    deleted: false,
  });

  // Keyed by `${folderBucket}:${name.toLowerCase()}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [recentlyMovedKeys, setRecentlyMovedKeys] = useState<Set<string>>(new Set());
  const [recentlyMovedFromByKey, setRecentlyMovedFromByKey] = useState<
    Record<string, FileManagerBucket>
  >({});
  const [highlightedFileKey, setHighlightedFileKey] = useState<string | null>(null);

  // Modals
  const [usageDetailFile, setUsageDetailFile] = useState<FileScheduleUsageSummary | null>(null);
  const [announcementPickerModal, setAnnouncementPickerModal] = useState<{
    fileName: string;
    announcements: Array<{
      announcementId: string;
      announcementName: string;
      minute: number;
      status: 'Current' | 'Ended' | 'Inactive';
      roles: string[];
      dateSummary: string;
    }>;
  } | null>(null);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    items: FileManagerItem[];
  } | null>(null);

  const [collisionModal, setCollisionModal] = useState<{
    fileNames: string[];
    targetBucket: FileManagerBucket;
    conflicts: string[];
  } | null>(null);

  const [isMovingFiles, setIsMovingFiles] = useState<boolean>(false);

  // Upload & Duplicate states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadCollision, setPendingUploadCollision] = useState<{
    file: File;
    existingName: string;
    copyCandidateName: string;
  } | null>(null);

  const [copyPromptState, setCopyPromptState] = useState<{
    sourceFile: FileManagerItem;
    targetStem: string;
    ext: string;
    isCopying: boolean;
    error: string | null;
    overwriteConfirmName: string | null;
  } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [collapseAnnouncementToIcon, setCollapseAnnouncementToIcon] = useState<boolean>(true);
  const [collapseActionsToIcons, setCollapseActionsToIcons] = useState<boolean>(false);

  const makeItemKey = (bucket: FileManagerBucket, name: string) =>
    `${bucket}:${name.toLowerCase()}`;

  const fetchFileManagerList = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setIsLoadingFiles(true);
      try {
        const settings = getSavedSettings();
        if (settings.mode === 'Demo') {
          const demoItems: FileManagerItem[] = (fallbackFiles || []).map(f => ({
            ...f,
            folderBucket: demoBucketOverrides[f.name.toLowerCase()] || 'active',
          }));
          setFiles(demoItems);
          return;
        }

        const headers = await getStorageApiHeaders();
        const res = await fetch('/api/media/file-manager', { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load File Manager directory listing.');
        }

        const fetchedFiles: FileManagerItem[] = Array.isArray(data.files)
          ? data.files.map((f: any) => ({
              name: String(f.name || ''),
              size: f.size,
              duration: f.duration,
              path: f.path,
              mtimeMs: f.mtimeMs,
              modifiedTime: f.modifiedTime,
              cloudSyncPending: Boolean(f.cloudSyncPending),
              folderBucket:
                f.folderBucket === 'archived' || f.folderBucket === 'deleted'
                  ? f.folderBucket
                  : 'active',
            }))
          : [];

        // Merge any newly saved/uploaded active files from fallbackFiles not yet present
        const seenActive = new Set(
          fetchedFiles.map(f => f.name.toLowerCase())
        );
        for (const fb of fallbackFiles || []) {
          if (fb?.name && !seenActive.has(fb.name.toLowerCase())) {
            // Only add if fetchedFiles was completely empty in Demo fallback
            if (fetchedFiles.length === 0 && (fallbackFiles || []).length > 0 && !data.folderPaths?.active) {
              fetchedFiles.push({
                ...fb,
                folderBucket: demoBucketOverrides[fb.name.toLowerCase()] || 'active',
              });
            }
          }
        }

        setFiles(fetchedFiles);
        if (data.folderPaths) {
          setFolderPaths({
            active: String(data.folderPaths.active || ''),
            archived: String(data.folderPaths.archived || ''),
            deleted: String(data.folderPaths.deleted || ''),
          });
        }
        const incomingFolderIds = data.folderIds || data.driveFolderIds;
        if (incomingFolderIds) {
          setFolderIds({
            active: String(incomingFolderIds.active || ''),
            archived: String(incomingFolderIds.archived || ''),
            deleted: String(incomingFolderIds.deleted || ''),
          });
        }
      } catch (err: any) {
        setStatusBanner({
          type: 'error',
          message: err?.message || 'Failed to load files.',
        });
      } finally {
        if (!silent) setIsLoadingFiles(false);
      }
    },
    [fallbackFiles, demoBucketOverrides]
  );

  useEffect(() => {
    fetchFileManagerList();
  }, [fetchFileManagerList, refreshTrigger]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const checkWidth = () => {
      const width = el.clientWidth || window.innerWidth;
      setCollapseAnnouncementToIcon(width < 1160);
      setCollapseActionsToIcons(width < 900);
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
  }, [files.length, typeFilter, externalSearchQuery]);

  const usageMap = useMemo(
    () => computeFileScheduleUsageMap(announcements, null),
    [announcements]
  );

  const getUsageForFile = useCallback(
    (fileName: string): FileScheduleUsageSummary => {
      const key = getFilenameFromUrlOrPath(fileName).toLowerCase();
      return (
        usageMap.get(key) || {
          fileName,
          isUsed: false,
          isCurrent: false,
          lastUsedLabel: 'Never',
          sortRankMs: 0,
          entries: [],
        }
      );
    },
    [usageMap]
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

  const getSectionForFile = useCallback(
    (file: FileManagerItem): FileManagerSectionId => {
      if (file.folderBucket === 'archived') return 'archived';
      if (file.folderBucket === 'deleted') return 'deleted';
      const usage = getUsageForFile(file.name);
      if (usage.isCurrent) return 'current';
      if (usage.isUsed) return 'past';
      return 'never_used';
    },
    [getUsageForFile]
  );

  // Restore scroll and highlight when returning from Announcement Editor (#26 5.b.ii update)
  useEffect(() => {
    if (!returnFocusFileName || files.length === 0) return;
    const targetLower = getFilenameFromUrlOrPath(returnFocusFileName).toLowerCase();
    const matchedItem = files.find(f => f.name.toLowerCase() === targetLower);
    if (!matchedItem) {
      if (onClearReturnFocusFileName) onClearReturnFocusFileName();
      return;
    }
    const secId = getSectionForFile(matchedItem);
    setExpandedSections(prev => (prev[secId] ? prev : { ...prev, [secId]: true }));
    const itemKey = makeItemKey(matchedItem.folderBucket, matchedItem.name);
    setHighlightedFileKey(itemKey);

    const timer = window.setTimeout(() => {
      const rowEl = tableContainerRef.current?.querySelector<HTMLElement>(
        `[data-file-key="${CSS.escape(itemKey)}"]`
      );
      if (rowEl) {
        rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        rowEl.focus({ preventScroll: true });
      }
      if (onClearReturnFocusFileName) onClearReturnFocusFileName();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [returnFocusFileName, files, getSectionForFile, onClearReturnFocusFileName]);

  const toggleSort = (field: PickerSortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'fileDate' || field === 'lastUsed' ? 'desc' : 'asc');
    }
  };

  const filteredAndSortedBySection = useMemo(() => {
    const q = (externalSearchQuery || '').trim().toLowerCase();

    const filtered = files.filter(f => {
      const itemKey = makeItemKey(f.folderBucket, f.name);
      // Always keep checked rows visible even when filtered
      if (selectedKeys.has(itemKey)) return true;

      const isAudio = isAudioFile(f.name);
      if (typeFilter === 'audio' && !isAudio) return false;
      if (typeFilter === 'liveread' && isAudio) return false;

      if (q) {
        const usage = getUsageForFile(f.name);
        const matchesName = f.name.toLowerCase().includes(q);
        const matchesAnn = usage.entries.some(e =>
          e.announcementName.toLowerCase().includes(q)
        );
        if (!matchesName && !matchesAnn) return false;
      }
      return true;
    });

    const sortList = (list: FileManagerItem[]) => {
      return [...list].sort((a, b) => {
        const usageA = getUsageForFile(a.name);
        const usageB = getUsageForFile(b.name);
        let cmp = 0;
        if (sortField === 'name') {
          cmp = a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: 'base',
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
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
    };

    const buckets: Record<FileManagerSectionId, FileManagerItem[]> = {
      never_used: [],
      current: [],
      past: [],
      archived: [],
      deleted: [],
    };

    for (const f of filtered) {
      const sec = getSectionForFile(f);
      buckets[sec].push(f);
    }

    return {
      never_used: sortList(buckets.never_used),
      current: sortList(buckets.current),
      past: sortList(buckets.past),
      archived: sortList(buckets.archived),
      deleted: sortList(buckets.deleted),
      totalCount: filtered.length,
    };
  }, [files, externalSearchQuery, typeFilter, sortField, sortOrder, selectedKeys, getUsageForFile, getSectionForFile]);

  // Clean up any selected keys that are no longer selectable (e.g. if a file became Current)
  const selectableItemsByKey = useMemo(() => {
    const map = new Map<string, FileManagerItem>();
    for (const sec of ['never_used', 'past', 'archived', 'deleted'] as const) {
      for (const item of filteredAndSortedBySection[sec]) {
        map.set(makeItemKey(item.folderBucket, item.name), item);
      }
    }
    // Also include any unselected items from full files list that aren't in 'current'
    for (const item of files) {
      if (getSectionForFile(item) !== 'current') {
        map.set(makeItemKey(item.folderBucket, item.name), item);
      }
    }
    return map;
  }, [filteredAndSortedBySection, files, getSectionForFile]);

  const selectedItems = useMemo(() => {
    const res: FileManagerItem[] = [];
    selectedKeys.forEach(k => {
      const item = selectableItemsByKey.get(k);
      if (item) res.push(item);
    });
    return res;
  }, [selectedKeys, selectableItemsByKey]);

  const toggleSelectItem = (item: FileManagerItem) => {
    if (getSectionForFile(item) === 'current') return;
    const key = makeItemKey(item.folderBucket, item.name);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectSection = (secId: FileManagerSectionId) => {
    if (secId === 'current') return;
    const secItems = filteredAndSortedBySection[secId];
    if (secItems.length === 0) return;
    const secKeys = secItems.map(item => makeItemKey(item.folderBucket, item.name));
    const allSelected = secKeys.every(k => selectedKeys.has(k));
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allSelected) {
        secKeys.forEach(k => next.delete(k));
      } else {
        secKeys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  // Deduplicate announcements for a file's usage entries (#26 5.b.ii update)
  const getUniqueAnnouncementsForFile = (usage: FileScheduleUsageSummary) => {
    const byId = new Map<
      string,
      {
        announcementId: string;
        announcementName: string;
        minute: number;
        status: 'Current' | 'Ended' | 'Inactive';
        roles: string[];
        dateSummary: string;
      }
    >();

    for (const entry of usage.entries) {
      const existing = byId.get(entry.announcementId);
      if (!existing) {
        byId.set(entry.announcementId, {
          announcementId: entry.announcementId,
          announcementName: entry.announcementName,
          minute: entry.minute,
          status: entry.status,
          roles: [entry.role],
          dateSummary: `${entry.startDateFormatted} – ${entry.endDateFormatted}`,
        });
      } else {
        if (!existing.roles.includes(entry.role)) {
          existing.roles.push(entry.role);
        }
        if (entry.status === 'Current') {
          existing.status = 'Current';
        } else if (entry.status === 'Ended' && existing.status === 'Inactive') {
          existing.status = 'Ended';
        }
      }
    }
    return Array.from(byId.values());
  };

  const handleAnnouncementButtonClick = (
    fileName: string,
    usage: FileScheduleUsageSummary,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const uniqueAnns = getUniqueAnnouncementsForFile(usage);
    if (uniqueAnns.length === 0) return;
    if (uniqueAnns.length === 1) {
      onJumpToAnnouncement(uniqueAnns[0].announcementId, fileName);
      return;
    }
    setAnnouncementPickerModal({
      fileName,
      announcements: uniqueAnns,
    });
  };

  // Execute move between active, archived, and deleted_in_AMP_OK_to_purge
  const executeMoveFiles = async (
    fileNames: string[],
    targetBucket: FileManagerBucket,
    collisionResolution: 'prompt' | 'overwrite' | 'rename' = 'prompt',
    undoSourceKey?: string
  ) => {
    if (fileNames.length === 0 || isMovingFiles) return;
    setIsMovingFiles(true);
    setStatusBanner(null);

    const prevBucketsByNameLower: Record<string, FileManagerBucket> = {};
    for (const fn of fileNames) {
      const lower = fn.toLowerCase();
      const existing = files.find(f => f.name.toLowerCase() === lower && f.folderBucket !== targetBucket) ||
        files.find(f => f.name.toLowerCase() === lower);
      prevBucketsByNameLower[lower] =
        existing?.folderBucket && existing.folderBucket !== targetBucket
          ? existing.folderBucket
          : targetBucket === 'active'
            ? 'archived'
            : 'active';
    }

    try {
      const settings = getSavedSettings();
      if (settings.mode === 'Demo') {
        setDemoBucketOverrides(prev => {
          const next = { ...prev };
          for (const fn of fileNames) {
            next[fn.toLowerCase()] = targetBucket;
          }
          return next;
        });
        setSelectedKeys(new Set());
        setHighlightedFileKey(null);
        if (undoSourceKey) {
          setRecentlyMovedKeys(prev => {
            const next = new Set(prev);
            next.delete(undoSourceKey);
            return next;
          });
          setRecentlyMovedFromByKey(prev => {
            const next = { ...prev };
            delete next[undoSourceKey];
            return next;
          });
        } else {
          const nextKeys = new Set<string>();
          const nextFrom: Record<string, FileManagerBucket> = {};
          for (const fn of fileNames) {
            const k = makeItemKey(targetBucket, fn);
            nextKeys.add(k);
            nextFrom[k] = prevBucketsByNameLower[fn.toLowerCase()] || 'active';
          }
          setRecentlyMovedKeys(nextKeys);
          setRecentlyMovedFromByKey(nextFrom);
        }
        setCollisionModal(null);
        setDeleteConfirmModal(null);
        if (targetBucket === 'archived') {
          setExpandedSections(prev => ({ ...prev, archived: true }));
        } else if (targetBucket === 'deleted') {
          setExpandedSections(prev => ({ ...prev, deleted: true }));
        }
        setStatusBanner({
          type: 'info',
          message: `${undoSourceKey ? 'Undid move: returned' : 'Moved'} ${fileNames.length} file${fileNames.length === 1 ? '' : 's'} to ${
            targetBucket === 'active'
              ? 'Active (media_announcements)'
              : targetBucket === 'archived'
                ? 'Archived (media_announcements/archived)'
                : 'Deleted (media_announcements/deleted_in_AMP_OK_to_purge)'
          }.`,
        });
        return;
      }

      const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/media/move-files', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileNames,
          targetBucket,
          collisionResolution,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.collision) {
        setCollisionModal({
          fileNames,
          targetBucket,
          conflicts: Array.isArray(data.conflicts) ? data.conflicts : fileNames,
        });
        return;
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to move files.');
      }

      setCollisionModal(null);
      setDeleteConfirmModal(null);
      setSelectedKeys(new Set());
      setHighlightedFileKey(null);

      const results: Array<{
        sourceName: string;
        finalName?: string;
        status: 'moved' | 'already_in_target' | 'missing_external' | 'conflict';
        message?: string;
      }> = Array.isArray(data.results) ? data.results : [];

      const movedCount = results.filter(r => r.status === 'moved').length;
      const missingCount = results.filter(r => r.status === 'missing_external').length;
      const alreadyCount = results.filter(r => r.status === 'already_in_target').length;

      if (undoSourceKey) {
        setRecentlyMovedKeys(prev => {
          const next = new Set(prev);
          next.delete(undoSourceKey);
          return next;
        });
        setRecentlyMovedFromByKey(prev => {
          const next = { ...prev };
          delete next[undoSourceKey];
          return next;
        });
      } else {
        const nextMovedKeys = new Set<string>();
        const nextMovedFrom: Record<string, FileManagerBucket> = {};
        for (const r of results) {
          if (r.status === 'moved' || r.status === 'already_in_target') {
            const targetFileName = r.finalName || r.sourceName;
            if (targetFileName) {
              const k = makeItemKey(targetBucket, targetFileName);
              nextMovedKeys.add(k);
              nextMovedFrom[k] =
                prevBucketsByNameLower[(r.sourceName || targetFileName).toLowerCase()] ||
                'active';
            }
          }
        }
        if (nextMovedKeys.size === 0 && results.length === 0) {
          for (const fn of fileNames) {
            const k = makeItemKey(targetBucket, fn);
            nextMovedKeys.add(k);
            nextMovedFrom[k] = prevBucketsByNameLower[fn.toLowerCase()] || 'active';
          }
        }
        setRecentlyMovedKeys(nextMovedKeys);
        setRecentlyMovedFromByKey(nextMovedFrom);
      }

      // Auto-expand destination section if user moved items into Archived or Deleted
      if (movedCount > 0 || alreadyCount > 0) {
        if (targetBucket === 'archived') {
          setExpandedSections(prev => ({ ...prev, archived: true }));
        } else if (targetBucket === 'deleted') {
          setExpandedSections(prev => ({ ...prev, deleted: true }));
        }
      }

      const targetLabel =
        targetBucket === 'active'
          ? 'Active (media_announcements)'
          : targetBucket === 'archived'
            ? 'Archived (media_announcements/archived)'
            : 'Deleted (media_announcements/deleted_in_AMP_OK_to_purge)';

      if (missingCount > 0) {
        setStatusBanner({
          type: 'warning',
          message: `${
            movedCount > 0 ? `Moved ${movedCount} file${movedCount === 1 ? '' : 's'} to ${targetLabel}. ` : ''
          }${missingCount} file${missingCount === 1 ? ' was' : 's were'} already moved, renamed, or deleted outside AMP. File list refreshed.`,
        });
      } else if (movedCount > 0) {
        setStatusBanner({
          type: 'info',
          message: `Moved ${movedCount} file${movedCount === 1 ? '' : 's'} to ${targetLabel}${
            alreadyCount > 0 ? ` (${alreadyCount} already in folder)` : ''
          }.`,
        });
      } else if (alreadyCount > 0) {
        setStatusBanner({
          type: 'info',
          message: `Selected file${alreadyCount === 1 ? ' is' : 's are'} already in ${targetLabel}.`,
        });
      }

      await fetchFileManagerList(true);
      if (onRefreshParent) {
        await onRefreshParent();
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        message: err?.message || 'Failed to move files.',
      });
      await fetchFileManagerList(true);
    } finally {
      setIsMovingFiles(false);
    }
  };

  const generateUniqueCopyName = (originalName: string): string => {
    const ext = getFileExtension(originalName);
    const rawStem = (ext ? originalName.slice(0, -ext.length) : originalName)
      .replace(/^(?:Copy of\s+)+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const baseStem = rawStem.replace(/\s*\(\d+\)$/, '').trim() || rawStem;
    const lowerSet = new Set(
      files.map(f => f.name.replace(/\s{2,}/g, ' ').trim().toLowerCase())
    );
    let counter = 2;
    let candidate = `${baseStem} (${counter})${ext}`;
    while (lowerSet.has(candidate.toLowerCase())) {
      counter += 1;
      candidate = `${baseStem} (${counter})${ext}`;
    }
    return candidate;
  };

  const openDuplicateFilePrompt = (file: FileManagerItem) => {
    const ext = getFileExtension(file.name);
    const uniqueName = generateUniqueCopyName(file.name);
    const targetStem =
      ext && uniqueName.toLowerCase().endsWith(ext.toLowerCase())
        ? uniqueName.slice(0, -ext.length)
        : uniqueName;
    setCopyPromptState({
      sourceFile: file,
      targetStem,
      ext,
      isCopying: false,
      error: null,
      overwriteConfirmName: null,
    });
  };

  const executeDuplicateFile = async (allowOverwrite: boolean = false) => {
    if (!copyPromptState) return;
    const cleanStem = copyPromptState.targetStem
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!cleanStem) {
      setCopyPromptState(prev =>
        prev ? { ...prev, error: 'Please enter a valid filename.' } : null
      );
      return;
    }
    const finalTargetName = `${cleanStem}${copyPromptState.ext}`;
    setCopyPromptState(prev => (prev ? { ...prev, isCopying: true, error: null } : null));

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
          duration: copyPromptState.sourceFile.duration
            ? String(copyPromptState.sourceFile.duration)
            : '',
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
        });
        duplicatedFile = {
          name: copied.name,
          path: streamPath,
          size: copied.size,
          duration: copyPromptState.sourceFile.duration,
          mtimeMs: nowMs,
          modifiedTime: new Date(nowMs).toISOString(),
        };
      } else {
        const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch('/api/live-read/copy-file', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceFileName: copyPromptState.sourceFile.name,
            targetFileName: finalTargetName,
            allowOverwrite,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setCopyPromptState(null);
          setStatusBanner({
            type: 'warning',
            message: `Source file "${copyPromptState.sourceFile.name}" was moved, renamed, or deleted outside AMP. File list refreshed.`,
          });
          await fetchFileManagerList(true);
          return;
        }
        if (res.status === 409 && data.exists) {
          setCopyPromptState(prev =>
            prev
              ? {
                  ...prev,
                  isCopying: false,
                  overwriteConfirmName: data.name || finalTargetName,
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
          duration: copyPromptState.sourceFile.duration
            ? String(copyPromptState.sourceFile.duration)
            : '',
          mtimeMs: data.mtimeMs || Date.now(),
          modifiedTime: data.modifiedTime || new Date().toISOString(),
        });
        duplicatedFile = {
          name: savedName,
          path: savedPath,
          size: data.size || copyPromptState.sourceFile.size,
          duration: copyPromptState.sourceFile.duration,
          mtimeMs: data.mtimeMs || Date.now(),
          modifiedTime: data.modifiedTime || new Date().toISOString(),
        };
      }

      setCopyPromptState(null);
      setExpandedSections(prev => ({ ...prev, never_used: true }));
      setRecentlyMovedKeys(new Set());
      setRecentlyMovedFromByKey({});
      setHighlightedFileKey(makeItemKey('active', duplicatedFile.name));
      if (onFileUploaded) {
        onFileUploaded(duplicatedFile);
      }
      await fetchFileManagerList(true);
      if (onRefreshParent) {
        await onRefreshParent();
      }
    } catch (err: any) {
      if (err && err.exists) {
        setCopyPromptState(prev =>
          prev
            ? {
                ...prev,
                isCopying: false,
                overwriteConfirmName: err.name || finalTargetName,
              }
            : null
        );
      } else {
        setCopyPromptState(prev =>
          prev
            ? {
                ...prev,
                isCopying: false,
                error: err?.message || 'Failed to duplicate file',
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
        isDriveActive,
      });
      const uploadedFileObj: MediaPickerFile = {
        name: saved.name,
        path: saved.path,
        size: saved.size,
        mtimeMs: saved.mtimeMs,
        modifiedTime: saved.modifiedTime,
      };
      setPendingUploadCollision(null);
      setExpandedSections(prev => ({ ...prev, never_used: true }));
      setRecentlyMovedKeys(new Set());
      setRecentlyMovedFromByKey({});
      setHighlightedFileKey(makeItemKey('active', saved.name));
      if (onFileUploaded) {
        onFileUploaded(uploadedFileObj);
      }
      await fetchFileManagerList(true);
      if (onRefreshParent) {
        await onRefreshParent();
      }
    } catch (err: any) {
      if (err && err.exists) {
        const existingName = err.name || targetFileNameOverride || file.name;
        setPendingUploadCollision({
          file,
          existingName,
          copyCandidateName: generateUniqueCopyName(existingName),
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

    const existingMatch = files.find(
      f =>
        f.folderBucket === 'active' &&
        f.name.toLowerCase() === selected.name.trim().toLowerCase()
    );
    if (existingMatch) {
      setPendingUploadCollision({
        file: selected,
        existingName: existingMatch.name,
        copyCandidateName: generateUniqueCopyName(existingMatch.name),
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
          'inline-flex flex-col shrink-0 select-none leading-none -space-y-1',
          !noMargin && 'ml-1'
        )}
      >
        <span
          className={cn(
            'text-[10px] leading-none transition-all',
            isAsc ? 'text-blue-600 font-black' : 'text-slate-300 font-normal opacity-50'
          )}
        >
          ▲
        </span>
        <span
          className={cn(
            'text-[10px] leading-none transition-all',
            isDesc ? 'text-blue-600 font-black' : 'text-slate-300 font-normal opacity-50'
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

  const sectionsMeta: Array<{
    id: FileManagerSectionId;
    title: string;
    subtitle: string;
    bucket: FileManagerBucket;
    folderTooltip: string;
    headerClassName: string;
    rowEvenClassName: string;
    rowOddClassName: string;
    badgeClassName: string;
  }> = [
    {
      id: 'never_used',
      title: 'Never Used',
      subtitle: 'Unscheduled files in media_announcements',
      bucket: 'active',
      folderTooltip: 'Open Media Announcements Folder (media_announcements)',
      headerClassName: 'fm-sec-header-never',
      rowEvenClassName: 'fm-row-never-even',
      rowOddClassName: 'fm-row-never-odd',
      badgeClassName: 'bg-slate-700 text-white border-slate-700',
    },
    {
      id: 'current',
      title: 'Current',
      subtitle: 'Actively scheduled now or in future gates (protected)',
      bucket: 'active',
      folderTooltip: 'Open Media Announcements Folder (media_announcements)',
      headerClassName: 'fm-sec-header-current',
      rowEvenClassName: 'fm-row-current-even',
      rowOddClassName: 'fm-row-current-odd',
      badgeClassName: 'bg-emerald-700 text-white border-emerald-700',
    },
    {
      id: 'past',
      title: 'Past / Ended',
      subtitle: 'Previously used files with no active future schedule',
      bucket: 'active',
      folderTooltip: 'Open Media Announcements Folder (media_announcements)',
      headerClassName: 'fm-sec-header-past',
      rowEvenClassName: 'fm-row-past-even',
      rowOddClassName: 'fm-row-past-odd',
      badgeClassName: 'bg-amber-700 text-white border-amber-700',
    },
    {
      id: 'archived',
      title: 'Archived',
      subtitle: 'media_announcements/archived',
      bucket: 'archived',
      folderTooltip: 'Open Archived Folder (media_announcements/archived)',
      headerClassName: 'fm-sec-header-archived',
      rowEvenClassName: 'fm-row-archived-even',
      rowOddClassName: 'fm-row-archived-odd',
      badgeClassName: 'bg-indigo-700 text-white border-indigo-700',
    },
    {
      id: 'deleted',
      title: 'Deleted',
      subtitle: 'media_announcements/deleted_in_AMP_OK_to_purge',
      bucket: 'deleted',
      folderTooltip: 'Open Deleted Folder (media_announcements/deleted_in_AMP_OK_to_purge)',
      headerClassName: 'fm-sec-header-deleted',
      rowEvenClassName: 'fm-row-deleted-even',
      rowOddClassName: 'fm-row-deleted-odd',
      badgeClassName: 'bg-rose-700 text-white border-rose-700',
    },
  ];

  // Total count of selected items that will end up in the destination folder (#26 Item 3)
  const selectedTotalCount = selectedItems.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-300 flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Top Header Bar: Title + Search + Refresh */}
      <div className="py-2 px-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 justify-between shrink-0 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <div className="bg-blue-600 p-1.5 rounded">
            <FolderOpen className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
              File Manager
            </h3>
            <span
              className="text-xs font-bold text-slate-400 cursor-help"
              title={
                'Audio (6): .mp3, .wav, .flac, .ogg, .m4a, .aac\nScripts / Docs (3): .txt, .md, .pdf\nImages (4): .png, .jpg, .jpeg, .webp'
              }
            >
              (.mp3, .txt, .pdf, .png, .jpg, and more)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[240px] justify-end">
          {onExternalSearchQueryChange && (
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audio, scripts, images & announcements..."
                value={externalSearchQuery}
                onChange={e => onExternalSearchQueryChange(e.target.value)}
                className="w-full pl-8 pr-6 py-1 bg-white border border-slate-300 rounded text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-800"
              />
              {externalSearchQuery && (
                <button
                  type="button"
                  onClick={() => onExternalSearchQueryChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={isLoadingFiles || isMovingFiles}
            onClick={async () => {
              await fetchFileManagerList();
              if (onRefreshParent) await onRefreshParent();
            }}
            className="text-slate-500 hover:text-slate-800 cursor-pointer p-1 rounded hover:bg-slate-200/70 transition-colors disabled:opacity-50"
            title="Refresh Files"
          >
            <RefreshCw className={cn('w-4 h-4', isLoadingFiles && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-2.5 flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.flac,.ogg,.m4a,.aac,.txt,.md,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Pinned Toolbar Row: + Write New Live Read, Upload, Type Filter, Total Count */}
        <div className="py-1.5 px-2.5 rounded bg-slate-100 border border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setRecentlyMovedKeys(new Set());
                setRecentlyMovedFromByKey({});
                setHighlightedFileKey(null);
                onNewCopy();
              }}
              className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer h-6"
              title="Write a new .txt Live Read announcement in Media Announcements"
            >
              <span>+ Write New Live Read</span>
            </button>
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
                  { id: 'liveread', label: 'LiveRead' },
                ] as const
              ).map(opt => {
                const isChecked = typeFilter === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      'flex items-center gap-1 text-xs font-bold select-none cursor-pointer',
                      isChecked ? 'text-blue-700 font-black' : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <input
                      type="radio"
                      name="file-manager-type-filter"
                      value={opt.id}
                      checked={isChecked}
                      onChange={() => setTypeFilter(opt.id)}
                      className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            <span className="text-xs font-black text-slate-500 tabular-nums pl-1">
              Total Files: <span className="text-slate-800">{filteredAndSortedBySection.totalCount}</span>
            </span>
          </div>
        </div>

        {/* Status / External Change Notice Banner */}
        {statusBanner && (
          <div
            className={cn(
              'py-1.5 px-2.5 rounded border flex items-center justify-between gap-2 text-xs font-bold shrink-0',
              statusBanner.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : statusBanner.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {statusBanner.type === 'error' || statusBanner.type === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Check className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-xs font-black uppercase hover:underline cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

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

        {/* Collapsible Grouped Spreadsheet Table */}
        <div
          ref={tableContainerRef}
          className="@container border border-slate-300 rounded bg-white flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar"
        >
          <table className="w-full border-collapse text-left table-fixed">
            <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-300 text-xs font-black text-slate-650 uppercase tracking-wider select-none">
              <tr>
                <th className="p-0 border-r border-slate-200 w-auto">
                  <div className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleSort('type')}
                      className={cn(
                        'py-1.5 pl-[26px] pr-1.5 border-r border-slate-200 inline-flex items-center justify-center cursor-pointer hover:text-slate-900 transition-colors shrink-0',
                        sortField === 'type' ? 'text-blue-700' : 'text-slate-650'
                      )}
                      title="Sort by File Type (Audio vs. LiveRead)"
                      aria-label="File Type"
                    >
                      <SortArrow field="type" noMargin />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className={cn(
                        'py-1.5 px-2 flex-1 flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase min-w-0',
                        sortField === 'name' ? 'text-blue-700' : 'text-slate-650'
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
                      'flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase',
                      sortField === 'fileDate' ? 'text-blue-700' : 'text-slate-650'
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
                      'flex items-center gap-0.5 cursor-pointer hover:text-slate-900 transition-colors uppercase',
                      sortField === 'lastUsed' ? 'text-blue-700' : 'text-slate-650'
                    )}
                    title="Sort by Schedule Last Used (Current > Past Date > Never)"
                  >
                    <span>Last Used</span>
                    <SortArrow field="lastUsed" />
                  </button>
                </th>
                <th
                  className={cn(
                    'py-1.5 px-1.5 text-right',
                    collapseActionsToIcons
                      ? 'w-[210px]'
                      : collapseAnnouncementToIcon
                        ? 'w-[328px]'
                        : 'w-[440px]'
                  )}
                >
                  <span>Actions</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-xs">
              {sectionsMeta.map(sec => {
                const secItems = filteredAndSortedBySection[sec.id];
                const isExpanded = expandedSections[sec.id];
                const isCurrentSec = sec.id === 'current';
                const secKeys = secItems.map(item =>
                  makeItemKey(item.folderBucket, item.name)
                );
                const selectedInSecCount = secKeys.filter(k => selectedKeys.has(k)).length;
                const allInSecSelected =
                  !isCurrentSec && secItems.length > 0 && selectedInSecCount === secItems.length;
                const someInSecSelected =
                  !isCurrentSec && selectedInSecCount > 0 && selectedInSecCount < secItems.length;

                return (
                  <React.Fragment key={sec.id}>
                    {/* Collapsible Section Header Bar */}
                    <tr
                      onClick={() =>
                        setExpandedSections(prev => ({ ...prev, [sec.id]: !prev[sec.id] }))
                      }
                      className={cn(
                        'border-y border-slate-300 cursor-pointer select-none transition-colors',
                        sec.headerClassName
                      )}
                    >
                      <td colSpan={4} className="py-1.5 px-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {isCurrentSec ? (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 text-emerald-700 shrink-0"
                                title="Current files are actively scheduled and cannot be archived or deleted until removed or inactivated on their announcement"
                                onClick={e => e.stopPropagation()}
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={allInSecSelected}
                                ref={el => {
                                  if (el) el.indeterminate = someInSecSelected;
                                }}
                                disabled={secItems.length === 0}
                                onClick={e => e.stopPropagation()}
                                onChange={() => toggleSelectSection(sec.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40 shrink-0"
                                title={`Select all ${sec.title} files`}
                              />
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 shrink-0 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 shrink-0 text-slate-600" />
                            )}
                            <span className="font-black uppercase tracking-wider text-xs truncate">
                              {sec.title}
                            </span>
                            <span
                              className={cn(
                                'px-1.5 py-0.2 rounded border text-[11px] font-black tabular-nums shrink-0',
                                sec.badgeClassName
                              )}
                            >
                              {secItems.length}
                            </span>
                            {!isCurrentSec && selectedInSecCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0">
                                {selectedInSecCount} checked
                              </span>
                            )}
                            <span className="hidden sm:inline text-[11px] font-semibold opacity-85 truncate">
                              — {sec.subtitle}
                            </span>
                          </div>

                          {/* Opposite side of section collapsible bar: Open Folder button (#26 7.a) */}
                          {onOpenFolder && (
                            <button
                              type="button"
                              onClick={async e => {
                                e.stopPropagation();
                                let resolvedDriveId = folderIds[sec.bucket] || undefined;
                                let resolvedLocalPath = folderPaths[sec.bucket] || undefined;
                                if (!resolvedDriveId && !resolvedLocalPath) {
                                  try {
                                    const headers = await getStorageApiHeaders();
                                    const res = await fetch('/api/media/file-manager', { headers });
                                    const data = await res.json().catch(() => ({}));
                                    const ids = data?.folderIds || data?.driveFolderIds;
                                    if (ids) {
                                      setFolderIds({
                                        active: String(ids.active || ''),
                                        archived: String(ids.archived || ''),
                                        deleted: String(ids.deleted || ''),
                                      });
                                      resolvedDriveId = String(ids[sec.bucket] || '') || undefined;
                                    }
                                    if (data?.folderPaths) {
                                      setFolderPaths({
                                        active: String(data.folderPaths.active || ''),
                                        archived: String(data.folderPaths.archived || ''),
                                        deleted: String(data.folderPaths.deleted || ''),
                                      });
                                      resolvedLocalPath =
                                        String(data.folderPaths[sec.bucket] || '') || undefined;
                                    }
                                  } catch (_) {}
                                }
                                onOpenFolder(sec.bucket, resolvedLocalPath, resolvedDriveId);
                              }}
                              className="p-1 px-1.5 bg-white/95 hover:bg-white text-slate-800 border border-slate-400 rounded text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                              title={sec.folderTooltip}
                              aria-label={sec.folderTooltip}
                            >
                              <FolderOpen
                                className={cn(
                                  'w-3.5 h-3.5 shrink-0',
                                  sec.bucket === 'archived'
                                    ? 'text-indigo-600'
                                    : sec.bucket === 'deleted'
                                      ? 'text-rose-600'
                                      : 'text-blue-600'
                                )}
                              />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Section Rows */}
                    {isExpanded &&
                      (secItems.length > 0 ? (
                        secItems.map((file, i) => {
                          const itemKey = makeItemKey(file.folderBucket, file.name);
                          const dispDuration =
                            pickerDurations[file.name] || file.duration || '';
                          const isAudio = isAudioFile(file.name);
                          const ext = getFileExtension(file.name).toLowerCase();
                          const isEditableTxt = ext === '.txt' || ext === '.md';
                          const usage = getUsageForFile(file.name);
                          const uniqueAnns = getUniqueAnnouncementsForFile(usage);
                          const fileMtimeMs = getFileMtimeMs(file);
                          const fileDateLabel =
                            fileMtimeMs > 0 ? formatShortDateMDY(fileMtimeMs) : '—';
                          const isRowSelected = selectedKeys.has(itemKey);
                          const isRecentlyMoved = recentlyMovedKeys.has(itemKey);
                          const isHighlighted = highlightedFileKey === itemKey;

                          const meta = isAudio ? metadataCache[file.name] : null;
                          const id3Tooltip =
                            meta && (meta.title || meta.artist || meta.album)
                              ? [meta.title, meta.artist, meta.album]
                                  .filter(Boolean)
                                  .join(' • ')
                              : '';
                          const typeCellTooltip = isAudio
                            ? `Audio (${ext || '.mp3'})`
                            : `LiveRead (${ext || '.txt'})`;

                          return (
                            <tr
                              key={itemKey}
                              tabIndex={-1}
                              data-file-key={itemKey}
                              onClick={() => {
                                if (!isCurrentSec) toggleSelectItem(file);
                              }}
                              className={cn(
                                'transition-colors outline-none',
                                !isCurrentSec && 'cursor-pointer',
                                i % 2 === 0 ? sec.rowEvenClassName : sec.rowOddClassName,
                                isRowSelected
                                  ? 'fm-row-selected'
                                  : isRecentlyMoved || isHighlighted
                                    ? 'fm-row-just-moved'
                                    : ''
                              )}
                            >
                              {/* Column 1: Checkbox + Type Icon + Name + Duration */}
                              <td
                                className="py-1 px-2.5 border-r border-slate-200/70 truncate"
                                title={
                                  id3Tooltip ? `${file.name} (${id3Tooltip})` : file.name
                                }
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <input
                                      type="checkbox"
                                      disabled={isCurrentSec}
                                      checked={isRowSelected}
                                      onClick={e => e.stopPropagation()}
                                      onChange={() => toggleSelectItem(file)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                                      title={
                                        isCurrentSec
                                          ? 'Current files cannot be moved to Archived or Deleted while actively scheduled'
                                          : `Select ${file.name}`
                                      }
                                    />
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
                                  {isRecentlyMoved && (
                                    <span className="inline-flex items-center gap-1 shrink-0">
                                      <span className="font-black uppercase px-1 py-0.5 rounded bg-blue-600 text-white shrink-0 leading-none">
                                        Moved
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isMovingFiles}
                                        onClick={e => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const prevBucket =
                                            recentlyMovedFromByKey[itemKey] ||
                                            (file.folderBucket === 'active'
                                              ? 'archived'
                                              : 'active');
                                          executeMoveFiles(
                                            [file.name],
                                            prevBucket,
                                            'prompt',
                                            itemKey
                                          );
                                        }}
                                        className="p-0.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-800 inline-flex items-center justify-center cursor-pointer shadow-2xs shrink-0 transition-colors disabled:opacity-40"
                                        title={`Undo move (return "${file.name}" to ${
                                          (recentlyMovedFromByKey[itemKey] ||
                                            (file.folderBucket === 'active'
                                              ? 'archived'
                                              : 'active')) === 'active'
                                            ? 'Active'
                                            : (recentlyMovedFromByKey[itemKey] ||
                                                  (file.folderBucket === 'active'
                                                    ? 'archived'
                                                    : 'active')) === 'archived'
                                              ? 'Archived'
                                              : 'Deleted'
                                        })`}
                                        aria-label={`Undo move for ${file.name}`}
                                      >
                                        <RotateCcw className="w-3 h-3 stroke-[2.5]" />
                                      </button>
                                    </span>
                                  )}
                                  {!isRecentlyMoved && isHighlighted && (
                                    <span className="font-black uppercase px-1 py-0.5 rounded bg-blue-600 text-white shrink-0 leading-none">
                                      New
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Column 2: File Date */}
                              <td className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap font-medium text-slate-600 tabular-nums">
                                {renderCollapsibleDate(fileDateLabel)}
                              </td>

                              {/* Column 3: Last Used */}
                              <td className="py-1 px-1.5 border-r border-slate-200/70 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setUsageDetailFile(usage);
                                  }}
                                  className={cn(
                                    'font-bold inline-flex items-center gap-1 leading-none cursor-pointer hover:underline tabular-nums',
                                    usage.isCurrent
                                      ? 'text-emerald-700 font-black'
                                      : usage.isUsed
                                        ? 'text-amber-800'
                                        : 'text-slate-500'
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

                              {/* Column 4: Actions (Preview/Copy/Edit + Announcement Jump + Archive/Restore/Delete) */}
                              <td className="py-1 px-1.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {/* Segmented Preview / Copy / Edit group */}
                                  <div className="inline-flex items-center rounded border border-slate-300 bg-white divide-x divide-slate-300 overflow-hidden shrink-0">
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
                                          'text-xs font-bold uppercase cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0',
                                          previewUrl === file.name
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-white text-blue-600 hover:bg-blue-50'
                                        )}
                                        title={
                                          previewUrl === file.name
                                            ? 'Stop audio preview'
                                            : 'Preview audio'
                                        }
                                      >
                                        {previewUrl === file.name ? (
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
                                        if (isEditableTxt) {
                                          setRecentlyMovedKeys(new Set());
                                          setRecentlyMovedFromByKey({});
                                          setHighlightedFileKey(null);
                                          onCopyScript(file.name);
                                        } else {
                                          openDuplicateFilePrompt(file);
                                        }
                                      }}
                                      className="text-xs font-bold uppercase text-slate-700 bg-white hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center h-6 w-6 shrink-0"
                                      title={
                                        isEditableTxt
                                          ? 'Duplicate live read into Active and open in editor'
                                          : `Duplicate ${isAudio ? 'audio' : 'file'} into Active with a new name`
                                      }
                                    >
                                      <Copy className="w-3 h-3 shrink-0" />
                                    </button>

                                    {isEditableTxt && (
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

                                  {/* Go to Announcement(s) button for every row with announcement attachments (#26 5.b.ii update) */}
                                  {uniqueAnns.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={e =>
                                        handleAnnouncementButtonClick(file.name, usage, e)
                                      }
                                      className={cn(
                                        'h-6 px-1.5 rounded border text-[11px] font-black uppercase tracking-tight inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors',
                                        isCurrentSec
                                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-300'
                                      )}
                                      title={
                                        uniqueAnns.length === 1
                                          ? `Go to Announcement: ${uniqueAnns[0].announcementName}`
                                          : `Attached to ${uniqueAnns.length} announcements (${uniqueAnns
                                              .map(a => a.announcementName)
                                              .join(', ')}) — click to select`
                                      }
                                    >
                                      <Calendar className="w-3 h-3 shrink-0" />
                                      {!collapseAnnouncementToIcon && !collapseActionsToIcons && (
                                        <span>
                                          {uniqueAnns.length === 1
                                            ? 'Announcement'
                                            : `Announcements (${uniqueAnns.length})`}
                                        </span>
                                      )}
                                      {(collapseAnnouncementToIcon || collapseActionsToIcons) &&
                                        uniqueAnns.length > 1 && (
                                          <span>{uniqueAnns.length}</span>
                                        )}
                                    </button>
                                  )}

                                  {/* Folder Move Buttons (for non-Current rows) */}
                                  {!isCurrentSec && (
                                    <div className="inline-flex items-center rounded border border-slate-300 bg-white divide-x divide-slate-300 overflow-hidden shrink-0">
                                      {file.folderBucket !== 'active' && (
                                        <button
                                          type="button"
                                          disabled={isMovingFiles}
                                          onClick={e => {
                                            e.stopPropagation();
                                            executeMoveFiles([file.name], 'active');
                                          }}
                                          className="h-6 px-1.5 text-[11px] font-black uppercase text-emerald-700 bg-white hover:bg-emerald-50 cursor-pointer inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                                          title="Restore file to Active (media_announcements)"
                                        >
                                          <RotateCcw className="w-3 h-3 shrink-0" />
                                          {!collapseActionsToIcons && <span>Restore</span>}
                                        </button>
                                      )}

                                      {file.folderBucket !== 'archived' && (
                                        <button
                                          type="button"
                                          disabled={isMovingFiles}
                                          onClick={e => {
                                            e.stopPropagation();
                                            executeMoveFiles([file.name], 'archived');
                                          }}
                                          className="h-6 px-1.5 text-[11px] font-black uppercase text-indigo-700 bg-white hover:bg-indigo-50 cursor-pointer inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                                          title="Move file to Archived (media_announcements/archived)"
                                        >
                                          <Archive className="w-3 h-3 shrink-0" />
                                          {!collapseActionsToIcons && <span>Archive</span>}
                                        </button>
                                      )}

                                      {file.folderBucket !== 'deleted' && (
                                        <button
                                          type="button"
                                          disabled={isMovingFiles}
                                          onClick={e => {
                                            e.stopPropagation();
                                            setDeleteConfirmModal({ items: [file] });
                                          }}
                                          className="h-6 px-1.5 text-[11px] font-black uppercase text-rose-700 bg-white hover:bg-rose-50 cursor-pointer inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
                                          title="Move file to Deleted (media_announcements/deleted_in_AMP_OK_to_purge)"
                                        >
                                          <Trash2 className="w-3 h-3 shrink-0" />
                                          {!collapseActionsToIcons && <span>Delete</span>}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-3 px-4 text-xs font-medium text-slate-400 italic bg-slate-50/40"
                          >
                            No files in {sec.title}.
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Bulk Action Bar for Multi-Selected Files (#26 5.b.ii) */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">
              {selectedItems.length > 0 ? (
                <>
                  <span className="font-black text-blue-700">{selectedItems.length}</span>{' '}
                  file{selectedItems.length === 1 ? '' : 's'} checked
                </>
              ) : (
                'Check files in Never Used, Past / Ended, Archived, or Deleted to move in bulk.'
              )}
            </span>
            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedKeys(new Set());
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedTotalCount === 0 || isMovingFiles}
              onClick={() => {
                const toMove = selectedItems.map(i => i.name);
                executeMoveFiles(toMove, 'active');
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              title="Move selected files to Active (media_announcements)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Move to Active ({selectedTotalCount})</span>
            </button>

            <button
              type="button"
              disabled={selectedTotalCount === 0 || isMovingFiles}
              onClick={() => {
                const toMove = selectedItems.map(i => i.name);
                executeMoveFiles(toMove, 'archived');
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              title="Move selected files to Archived (media_announcements/archived)"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive Selected ({selectedTotalCount})</span>
            </button>

            <button
              type="button"
              disabled={selectedTotalCount === 0 || isMovingFiles}
              onClick={() => {
                if (selectedItems.length > 0) {
                  setDeleteConfirmModal({ items: selectedItems });
                }
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
              title="Move selected files to Deleted (media_announcements/deleted_in_AMP_OK_to_purge)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedTotalCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Heavy "Are You Sure?" Delete Confirmation Modal (#26 6.a) */}
      {deleteConfirmModal && (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => !isMovingFiles && setDeleteConfirmModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-rose-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-rose-600 p-1.5 rounded text-white shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-rose-950 uppercase tracking-widest leading-none">
                    Are You Sure? — Move to Deleted
                  </h4>
                  <p className="text-xs font-bold text-rose-800 truncate mt-1">
                    Target folder: media_announcements/deleted_in_AMP_OK_to_purge
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() => setDeleteConfirmModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Cancel"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900">
                Are you sure you want to move{' '}
                <strong className="text-rose-700">
                  {deleteConfirmModal.items.length}{' '}
                  {deleteConfirmModal.items.length === 1 ? 'file' : 'files'}
                </strong>{' '}
                into <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">deleted_in_AMP_OK_to_purge</code>?
              </p>

              <div className="max-h-[160px] overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 space-y-1 custom-scrollbar">
                {deleteConfirmModal.items.map(item => {
                  const usage = getUsageForFile(item.name);
                  const uniqueAnns = getUniqueAnnouncementsForFile(usage);
                  return (
                    <div
                      key={makeItemKey(item.folderBucket, item.name)}
                      className="flex items-center justify-between gap-2 py-0.5 px-1 rounded bg-white border border-slate-200/80"
                    >
                      <span className="font-mono font-bold text-slate-800 truncate">
                        {item.name}
                      </span>
                      {uniqueAnns.length > 0 && (
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                          Past History ({uniqueAnns.length} Ann.)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-950 font-medium space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>What happens when you confirm:</span>
                </p>
                <p>
                  Files are moved into{' '}
                  <span className="font-mono font-bold">media_announcements/deleted_in_AMP_OK_to_purge</span>{' '}
                  so station admins know they are safe to permanently purge from disk. You can still restore them from the{' '}
                  <strong>Deleted</strong> section until they are purged externally.
                </p>
              </div>
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() => setDeleteConfirmModal(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() =>
                  executeMoveFiles(
                    deleteConfirmModal.items.map(i => i.name),
                    'deleted'
                  )
                }
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isMovingFiles ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Moving...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Move to Deleted</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destination Collision Resolution Modal (#26 Item 8) */}
      {collisionModal && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => !isMovingFiles && setCollisionModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-amber-300 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                  Filename Collision in Destination Folder
                </h4>
              </div>
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() => setCollisionModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Cancel"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900">
                The destination folder already contains{' '}
                {collisionModal.conflicts.length === 1 ? 'a file' : 'files'} with the same name:
              </p>
              <div className="max-h-[120px] overflow-y-auto border border-slate-200 rounded bg-slate-50 p-2 font-mono font-bold text-slate-800 space-y-1">
                {collisionModal.conflicts.map(c => (
                  <div key={c}>{c}</div>
                ))}
              </div>
              <p className="font-medium text-slate-600">
                Would you like to keep both files by auto-renaming the moved file (e.g.{' '}
                <span className="font-mono font-bold text-slate-800">&lt;name&gt; (2)</span>) or overwrite the existing file in the destination folder?
              </p>
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() => setCollisionModal(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() =>
                  executeMoveFiles(
                    collisionModal.fileNames,
                    collisionModal.targetBucket,
                    'overwrite'
                  )
                }
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Overwrite Destination
              </button>
              <button
                type="button"
                disabled={isMovingFiles}
                onClick={() =>
                  executeMoveFiles(
                    collisionModal.fileNames,
                    collisionModal.targetBucket,
                    'rename'
                  )
                }
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Keep Both (Auto-Rename)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Announcement Selector Dialog (#26 5.b.ii update: presents each announcement as its own button) */}
      {announcementPickerModal && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setAnnouncementPickerModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-blue-600 p-1.5 rounded text-white shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                    Go to Announcement
                  </h4>
                  <p className="text-xs font-mono font-bold text-slate-500 truncate mt-1">
                    {announcementPickerModal.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAnnouncementPickerModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar">
              <p className="text-xs font-bold text-slate-600 mb-2">
                Select an announcement to open in the editor:
              </p>
              {announcementPickerModal.announcements.map(ann => (
                <button
                  key={ann.announcementId}
                  type="button"
                  onClick={() => {
                    const targetId = ann.announcementId;
                    const srcFile = announcementPickerModal.fileName;
                    setAnnouncementPickerModal(null);
                    onJumpToAnnouncement(targetId, srcFile);
                  }}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:border-blue-400 transition-colors text-left flex items-center justify-between gap-2 cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-900 group-hover:text-blue-800 truncate">
                        {ann.announcementName}
                      </span>
                      <span className="text-xs font-bold text-slate-500 shrink-0">
                        (:{String(ann.minute || 0).padStart(2, '0')}m)
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                      {ann.roles.join(' & ')} • {ann.dateSummary}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-1.5 py-0.5 rounded border',
                        ann.status === 'Current'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : ann.status === 'Inactive'
                            ? 'bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                      )}
                    >
                      {ann.status}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                  </div>
                </button>
              ))}
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAnnouncementPickerModal(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
            </div>
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
                    Duplicate File into Active
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
                  New File Name (Saved to Active media_announcements)
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
                              overwriteConfirmName: null,
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
                      &quot;{copyPromptState.overwriteConfirmName}&quot; already exists in Active. Overwrite it?
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
                      'p-2.5 rounded-lg border flex flex-col gap-1',
                      entry.status === 'Current'
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
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
                            'text-xs font-black uppercase px-1.5 py-0.5 rounded border',
                            entry.status === 'Current'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : entry.status === 'Inactive'
                                ? 'bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                          )}
                        >
                          {entry.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = entry.announcementId;
                            const srcName = usageDetailFile.fileName;
                            setUsageDetailFile(null);
                            onJumpToAnnouncement(targetId, srcName);
                          }}
                          className="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase cursor-pointer inline-flex items-center gap-0.5"
                          title={`Open ${entry.announcementName}`}
                        >
                          <span>Open</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
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
