import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  FileText,
  XCircle,
  Bold,
  Italic,
  Underline,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Speech,
  ChevronRight,
  ChevronDown,
  Music,
  Play,
  Square,
  Upload,
  FolderOpen
} from 'lucide-react';
import { cn, getFileExtension, isImageFile, isAudioFile, getFilenameFromUrlOrPath, getGateMediaItems } from '../lib/utils';
import {
  stripHtmlComments,
  hasInlineFormattingMarkers,
  serializeTxtScriptContent,
  calculateLiveReadWordStats,
  isParseableReadTimeFormat,
  parseReadTimeToSeconds,
  normalizeReadTimeDisplay,
  markdownTxtToEditableHtml,
  editableHtmlToMarkdownTxt,
  sanitizeClipboardToEditableHtml
} from '../lib/liveReadFormatting';
import {
  getLiveReadWpm,
  getDefaultLiveReadFontSize,
  getDefaultLiveReadFontFamily,
  getLiveReadFontFamilyCss
} from '../lib/compatibility';
import {
  uploadAnnouncementMediaFile,
  renameOrCopyAnnouncementMediaFile,
  getStorageApiHeaders,
  registerSavedAnnouncementFileInCache,
  availableFilesCache,
  getPlayableUrl,
  cacheMP3,
  getAccessToken
} from '../lib/driveService';
import { Announcement } from '../types';
import { MediaPickerModal, MediaPickerFile } from './MediaPickerModal';
import LiveReadPopout from './LiveReadPopout';

const DEFAULT_EDIT_BOX_WIDTH = 672;
const DEFAULT_EDIT_BOX_HEIGHT = 440;

export interface CopyEditorModalProps {
  isOpen: boolean;
  initialFileName?: string;
  sourceFileToCopy?: string;
  sourceBucket?: 'active' | 'archived' | 'deleted';
  initialReadTime?: string;
  initialIsAutoReadTime?: boolean;
  initialBackupMp3Url?: string;
  suggestedBaseName?: string;
  isDriveActive: boolean;
  existingFileNames: string[];
  availableFiles?: MediaPickerFile[];
  pickerDurations?: Record<string, string>;
  metadataCache?: Record<string, any>;
  announcements?: Announcement[];
  currentEditingAnnouncement?: Partial<Announcement> | null;
  usedByDescriptions?: string[];
  onClose: () => void;
  onBackupAudioUploaded?: (file: MediaPickerFile, previousRenamedName?: string) => void;
  onSaved: (result: {
    name: string;
    path?: string;
    size?: string;
    approximateReadTime: string;
    isAutoReadTime?: boolean;
    pairedBackupAudioFile?: string;
    doNotAttachBackup?: boolean;
    adoptNewFile?: boolean;
  }) => void;
}

const normalizeStem = (raw: string) => {
  const base = raw.trim().split(/[/\\]/).pop() || '';
  const dotIdx = base.lastIndexOf('.');
  const stem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  return stem.replace(/\s{2,}/g, ' ').trim();
};

const generateIncrementedCopyStem = (
  rawStem: string,
  extWithDot: string,
  existingNames: string[]
): string => {
  const collapsed = rawStem
    .replace(/^(?:Copy of\s+)+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const baseStem = collapsed.replace(/\s*\(\d+\)$/, '').trim() || collapsed;
  const lowerSet = new Set(
    existingNames.map(n => n.replace(/\s{2,}/g, ' ').trim().toLowerCase())
  );
  let copyNum = 2;
  let candidateStem = `${baseStem} (${copyNum})`;
  while (lowerSet.has(`${candidateStem}${extWithDot}`.toLowerCase())) {
    copyNum += 1;
    candidateStem = `${baseStem} (${copyNum})`;
  }
  return candidateStem;
};

function fragmentToPlainTextWithNewlines(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue || '').replace(/\u00A0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return '';
  }
  const el = node as HTMLElement;
  const tag = el.tagName ? el.tagName.toUpperCase() : '';
  if (tag === 'BR') {
    return '\n';
  }
  let res = '';
  const children = Array.from(node.childNodes);
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childTag =
      child.nodeType === Node.ELEMENT_NODE
        ? (child as HTMLElement).tagName.toUpperCase()
        : '';
    const isBlock = childTag === 'DIV' || childTag === 'P' || childTag === 'LI';
    if (isBlock && res.length > 0 && !res.endsWith('\n')) {
      res += '\n';
    }
    res += fragmentToPlainTextWithNewlines(child);
    if (isBlock && !res.endsWith('\n')) {
      res += '\n';
    }
  }
  return res;
}

export const CopyEditorModal: React.FC<CopyEditorModalProps> = ({
  isOpen,
  initialFileName,
  sourceFileToCopy,
  sourceBucket,
  initialReadTime,
  initialIsAutoReadTime,
  initialBackupMp3Url,
  suggestedBaseName,
  isDriveActive,
  existingFileNames,
  availableFiles = [],
  pickerDurations = {},
  metadataCache = {},
  announcements = [],
  currentEditingAnnouncement = null,
  usedByDescriptions = [],
  onClose,
  onBackupAudioUploaded,
  onSaved
}) => {
  const sourceOrInitialName = sourceFileToCopy || initialFileName || '';
  const sourceExt = getFileExtension(sourceOrInitialName).toLowerCase();
  const isNonTextCopyMode = Boolean(
    sourceFileToCopy && sourceExt && sourceExt !== '.txt' && sourceExt !== '.md'
  );
  const isEditingExisting = Boolean(
    !sourceFileToCopy && initialFileName && initialFileName.trim()
  );

  const [fileNameStem, setFileNameStem] = useState('');
  const [initialSuggestedStem, setInitialSuggestedStem] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [plainWordStats, setPlainWordStats] = useState(() =>
    calculateLiveReadWordStats('')
  );
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadedSessionKey, setLoadedSessionKey] = useState<string | null>(null);
  const loadedInitialTextRef = useRef<string>('');
  const loadedInitialRoundtripTextRef = useRef<string>('');
  const initialSessionSnapshotRef = useRef<{
    sessionKey: string;
    fileNameStem: string;
    autoApplyReadTime: boolean;
    manualReadTime: string;
    customSelectedBackupAudio: string | null;
    doNotAttachAudio: boolean;
    adoptNewSplitFile: boolean;
  } | null>(null);
  const [showUnsavedCloseConfirm, setShowUnsavedCloseConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overwritePromptName, setOverwritePromptName] = useState<string | null>(null);
  const [autoApplyReadTime, setAutoApplyReadTime] = useState(true);
  const [manualReadTime, setManualReadTime] = useState('');
  const [readTimeWarning, setReadTimeWarning] = useState<string | null>(null);
  const [nonTextPreviewUrl, setNonTextPreviewUrl] = useState('');
  const [adoptNewSplitFile, setAdoptNewSplitFile] = useState<boolean>(true);
  const fileNameInputRef = useRef<HTMLInputElement | null>(null);
  const readTimeInputRef = useRef<HTMLInputElement | null>(null);

  const currentSessionKey = isOpen
    ? `${sourceFileToCopy || ''}::${initialFileName || ''}::${initialReadTime || ''}::${suggestedBaseName || ''}`
    : null;
  const isSessionLoaded = isOpen && !loadingContent && loadedSessionKey === currentSessionKey;

  // Alternative / Backup Audio Dumb Pairing & Explicit Selection States
  const [pendingDuplicateSourceAudio, setPendingDuplicateSourceAudio] = useState<string | null>(null);
  const [customSelectedBackupAudio, setCustomSelectedBackupAudio] = useState<string | null>(null);
  const [doNotAttachAudio, setDoNotAttachAudio] = useState(false);
  const [previewingAudioFile, setPreviewingAudioFile] = useState<string | null>(null);
  const [testPopupContent, setTestPopupContent] = useState<string | null>(null);
  const [isAudioPickerOpen, setIsAudioPickerOpen] = useState(false);
  const [audioPickerSearchQuery, setAudioPickerSearchQuery] = useState('');
  const [isUploadingBackupAudio, setIsUploadingBackupAudio] = useState(false);
  const [pendingAudioUploadCollision, setPendingAudioUploadCollision] = useState<{
    file: File;
    existingName: string;
    copyCandidateName: string;
    intendedOriginalName?: string;
    intendedUseOriginal?: boolean;
  } | null>(null);
  const [uploadedAudioFileObj, setUploadedAudioFileObj] = useState<File | null>(null);
  const [uploadedAudioOriginalName, setUploadedAudioOriginalName] = useState<string | null>(null);
  const [uploadedAudioCurrentDiskName, setUploadedAudioCurrentDiskName] = useState<string | null>(null);
  const [useOriginalAudioName, setUseOriginalAudioName] = useState<boolean>(false);
  const [backupAudioWasCopiedOnRename, setBackupAudioWasCopiedOnRename] = useState<boolean>(false);
  const backupAudioInputRef = useRef<HTMLInputElement | null>(null);

  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 900
  }));

  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen]);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const existingFileNamesRef = useRef<string[]>(existingFileNames);
  existingFileNamesRef.current = existingFileNames;
  const suggestedBaseNameRef = useRef<string | undefined>(suggestedBaseName);
  suggestedBaseNameRef.current = suggestedBaseName;

  const stopAudioPreview = useCallback(() => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
      audioPreviewRef.current = null;
    }
    setPreviewingAudioFile(null);
  }, []);

  const initialIsAutoReadTimeRef = useRef<boolean | undefined>(initialIsAutoReadTime);
  initialIsAutoReadTimeRef.current = initialIsAutoReadTime;
  const initialBackupMp3UrlRef = useRef<string | undefined>(initialBackupMp3Url);
  initialBackupMp3UrlRef.current = initialBackupMp3Url;
  const announcementsRef = useRef<Announcement[]>(announcements);
  announcementsRef.current = announcements;
  const currentEditingAnnouncementRef = useRef<Partial<Announcement> | null>(currentEditingAnnouncement);
  currentEditingAnnouncementRef.current = currentEditingAnnouncement;

  const populateRichEditorDom = useCallback(
    (rawMarkdownText: string, initReadTimeClean?: string, sessionKeyToCommit?: string | null) => {
      const cleaned = stripHtmlComments(rawMarkdownText || '');
      const initialStats = calculateLiveReadWordStats(cleaned);
      loadedInitialTextRef.current = cleaned;
      setBodyText(cleaned);
      setPlainWordStats(initialStats);
      if (initReadTimeClean !== undefined) {
        const normalizedInit = normalizeReadTimeDisplay(initReadTimeClean);
        const explicitAuto = initialIsAutoReadTimeRef.current;
        if (explicitAuto === false && normalizedInit && normalizedInit !== '0m00s' && normalizedInit !== '00 min 00 sec') {
          setAutoApplyReadTime(false);
          setManualReadTime(normalizedInit);
        } else if (
          explicitAuto === true ||
          !normalizedInit ||
          normalizedInit === initialStats.formattedReadTime ||
          normalizedInit === '0m00s' ||
          normalizedInit === '00 min 00 sec'
        ) {
          setAutoApplyReadTime(true);
          setManualReadTime(initialStats.formattedReadTime);
        } else {
          setAutoApplyReadTime(false);
          setManualReadTime(normalizedInit);
        }
      }
      if (sessionKeyToCommit !== undefined) {
        setLoadedSessionKey(sessionKeyToCommit);
      }
      if (editorRef.current) {
        editorRef.current.innerHTML = markdownTxtToEditableHtml(cleaned);
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (isSessionLoaded && !isNonTextCopyMode && editorRef.current) {
      editorRef.current.innerHTML = markdownTxtToEditableHtml(loadedInitialTextRef.current);
      loadedInitialRoundtripTextRef.current = editableHtmlToMarkdownTxt(editorRef.current);
    }
  }, [isSessionLoaded, isNonTextCopyMode, loadedSessionKey]);

  useEffect(() => {
    if (!isSessionLoaded || !loadedSessionKey) return;
    if (initialSessionSnapshotRef.current?.sessionKey === loadedSessionKey) return;
    initialSessionSnapshotRef.current = {
      sessionKey: loadedSessionKey,
      fileNameStem,
      autoApplyReadTime,
      manualReadTime,
      customSelectedBackupAudio,
      doNotAttachAudio,
      adoptNewSplitFile
    };
  }, [
    isSessionLoaded,
    loadedSessionKey,
    fileNameStem,
    autoApplyReadTime,
    manualReadTime,
    customSelectedBackupAudio,
    doNotAttachAudio,
    adoptNewSplitFile
  ]);

  useEffect(() => {
    if (
      isSessionLoaded &&
      !isEditingExisting &&
      !sourceFileToCopy &&
      initialSuggestedStem &&
      fileNameInputRef.current
    ) {
      fileNameInputRef.current.focus();
      fileNameInputRef.current.select();
    }
  }, [isSessionLoaded, isEditingExisting, sourceFileToCopy, initialSuggestedStem]);

  const updateLightweightWordStats = useCallback(() => {
    if (!editorRef.current) return;
    const rawText = editorRef.current.innerText || editorRef.current.textContent || '';
    const nextStats = calculateLiveReadWordStats(rawText);
    setPlainWordStats(nextStats);
  }, []);

  const syncEditorToMarkdownState = useCallback((): string => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!editorRef.current) return bodyText;
    const nextMarkdown = editableHtmlToMarkdownTxt(editorRef.current);
    setBodyText(nextMarkdown);
    setPlainWordStats(calculateLiveReadWordStats(nextMarkdown));
    return nextMarkdown;
  }, [bodyText]);

  const scheduleIdleEditorSync = useCallback(
    (shouldSyncMarkdown: boolean) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (!editorRef.current) return;
        if (shouldSyncMarkdown) {
          const nextMarkdown = editableHtmlToMarkdownTxt(editorRef.current);
          setBodyText(nextMarkdown);
          setPlainWordStats(calculateLiveReadWordStats(nextMarkdown));
        } else {
          updateLightweightWordStats();
        }
      }, 450);
    },
    [updateLightweightWordStats]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      stopAudioPreview();
    };
  }, [stopAudioPreview]);

  useEffect(() => {
    if (!isOpen) {
      stopAudioPreview();
      setLoadedSessionKey(null);
      setLoadingContent(false);
      loadedInitialTextRef.current = '';
      loadedInitialRoundtripTextRef.current = '';
      initialSessionSnapshotRef.current = null;
      setShowUnsavedCloseConfirm(false);
      return;
    }
    const activeSessionKey = `${sourceFileToCopy || ''}::${initialFileName || ''}::${initialReadTime || ''}::${suggestedBaseNameRef.current || ''}`;
    initialSessionSnapshotRef.current = null;
    setShowUnsavedCloseConfirm(false);
    setErrorMsg(null);
    setOverwritePromptName(null);
    setReadTimeWarning(null);
    setNonTextPreviewUrl('');
    setShowMarkdown(false);
    setCopiedMarkdown(false);
    setAdoptNewSplitFile(true);
    setDoNotAttachAudio(false);
    setCustomSelectedBackupAudio(null);
    setUploadedAudioFileObj(null);
    setUploadedAudioOriginalName(null);
    setUploadedAudioCurrentDiskName(null);
    setUseOriginalAudioName(false);
    setBackupAudioWasCopiedOnRename(false);
    setIsAudioPickerOpen(false);
    setAudioPickerSearchQuery('');
    setPendingAudioUploadCollision(null);
    setTestPopupContent(null);
    stopAudioPreview();

    const fileToLoad = sourceFileToCopy || initialFileName;

    // Resolve any explicitly attached or base-stem paired backup audio for fileToLoad
    const findExistingAudioMatch = (candidateName?: string | null): string | null => {
      if (!candidateName || !candidateName.trim()) return null;
      const cleanCandidate = getFilenameFromUrlOrPath(candidateName).toLowerCase();
      const foundInList = existingFileNamesRef.current.find(
        f => isAudioFile(f) && f.toLowerCase() === cleanCandidate
      );
      if (foundInList) return foundInList;
      const cached = availableFilesCache.get(candidateName);
      if (cached && isAudioFile(candidateName)) return getFilenameFromUrlOrPath(candidateName);
      return null;
    };

    const resolveFallbackBackupForScript = (scriptName: string): string | null => {
      // 1. Explicit initialBackupMp3Url prop
      const fromProp = findExistingAudioMatch(initialBackupMp3UrlRef.current);
      if (fromProp) return fromProp;

      // 2. Check currentEditingAnnouncement or announcements for a gate media item using scriptName
      const cleanScriptLower = getFilenameFromUrlOrPath(scriptName).toLowerCase();
      const allAnns: Array<Partial<Announcement>> = [];
      if (currentEditingAnnouncementRef.current) allAnns.push(currentEditingAnnouncementRef.current);
      if (Array.isArray(announcementsRef.current)) allAnns.push(...announcementsRef.current);
      for (const ann of allAnns) {
        for (const gate of ann?.timeGatedMp3s || []) {
          for (const mi of getGateMediaItems(gate)) {
            if (
              getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase() === cleanScriptLower &&
              mi.backupMp3Url
            ) {
              const matched = findExistingAudioMatch(mi.backupMp3Url);
              if (matched) return matched;
            }
          }
        }
      }

      // 3. Check if scriptName is a "Copy of X (2)" variant whose base stem X has an audio file
      const rawStem = normalizeStem(scriptName);
      const strippedStem = rawStem
        .replace(/^(?:Copy of\s+)+/i, '')
        .replace(/\s*\(\d+\)$/, '')
        .trim()
        .toLowerCase();
      if (strippedStem && strippedStem !== rawStem.toLowerCase()) {
        const baseMatch = existingFileNamesRef.current.find(
          f => isAudioFile(f) && normalizeStem(f).toLowerCase() === strippedStem
        );
        if (baseMatch) return baseMatch;
      }
      return null;
    };

    if (sourceFileToCopy && sourceFileToCopy.trim()) {
      const sourceStemLower = normalizeStem(sourceFileToCopy).toLowerCase();
      const matchedAudio =
        existingFileNamesRef.current.find(
          f => isAudioFile(f) && normalizeStem(f).toLowerCase() === sourceStemLower
        ) || resolveFallbackBackupForScript(sourceFileToCopy);
      setPendingDuplicateSourceAudio(matchedAudio || null);
    } else if (initialFileName && initialFileName.trim()) {
      setPendingDuplicateSourceAudio(null);
      const exactStemLower = normalizeStem(initialFileName).toLowerCase();
      const hasExactStemAudio = existingFileNamesRef.current.some(
        f => isAudioFile(f) && normalizeStem(f).toLowerCase() === exactStemLower
      );
      if (!hasExactStemAudio) {
        const fallbackBackup = resolveFallbackBackupForScript(initialFileName);
        if (fallbackBackup) {
          setCustomSelectedBackupAudio(fallbackBackup);
        }
      }
    } else {
      setPendingDuplicateSourceAudio(null);
    }

    if (fileToLoad && fileToLoad.trim()) {
      setInitialSuggestedStem('');
      const cleanStem = normalizeStem(fileToLoad);
      if (sourceFileToCopy) {
        const copyExt = isNonTextCopyMode ? sourceExt : '.txt';
        const nextStem = generateIncrementedCopyStem(
          cleanStem,
          copyExt,
          existingFileNamesRef.current
        );
        setFileNameStem(nextStem);
      } else {
        setFileNameStem(cleanStem);
      }

      const cleanInitRead = normalizeReadTimeDisplay(initialReadTime);
      setManualReadTime(cleanInitRead);
      setAutoApplyReadTime(initialIsAutoReadTimeRef.current !== false);

      const bucketQuery =
        sourceBucket && sourceBucket !== 'active' ? `&bucket=${encodeURIComponent(sourceBucket)}` : '';

      if (isNonTextCopyMode) {
        setLoadingContent(true);
        let cancelled = false;
        (async () => {
          try {
            const headers = await getStorageApiHeaders();
            const r = await fetch(`/api/live-read/content?file=${encodeURIComponent(fileToLoad)}${bucketQuery}`, {
              headers,
              cache: 'no-store'
            });
            const data = r.ok ? await r.json() : null;
            if (cancelled) return;
            if (data && data.url) {
              setNonTextPreviewUrl(data.url);
            } else {
              setNonTextPreviewUrl(
                (bucketQuery ? '' : getPlayableUrl(fileToLoad)) ||
                  `/api/media/stream?path=${encodeURIComponent(fileToLoad)}${bucketQuery}`
              );
            }
          } catch {
            if (!cancelled) {
              setNonTextPreviewUrl(
                (bucketQuery ? '' : getPlayableUrl(fileToLoad)) ||
                  `/api/media/stream?path=${encodeURIComponent(fileToLoad)}${bucketQuery}`
              );
            }
          } finally {
            if (!cancelled) {
              setLoadedSessionKey(activeSessionKey);
              setLoadingContent(false);
            }
          }
        })();
        return () => {
          cancelled = true;
        };
      }

      let cancelled = false;
      const loadExisting = async () => {
        setLoadingContent(true);
        try {
          const headers = await getStorageApiHeaders();
          const res = await fetch(`/api/live-read/content?file=${encodeURIComponent(fileToLoad)}${bucketQuery}`, {
            headers,
            cache: 'no-store'
          });
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && typeof data.content === 'string') {
              populateRichEditorDom(data.content, cleanInitRead, activeSessionKey);
              setLoadingContent(false);
              return;
            }
          }
          if (!cancelled) {
            populateRichEditorDom('', cleanInitRead, activeSessionKey);
            setErrorMsg(`Could not load script "${fileToLoad}".`);
          }
        } catch (err: any) {
          if (!cancelled) {
            populateRichEditorDom('', cleanInitRead, activeSessionKey);
            setErrorMsg(err.message || 'Failed to load script.');
          }
        } finally {
          if (!cancelled) setLoadingContent(false);
        }
      };
      loadExisting();
      return () => {
        cancelled = true;
      };
    } else {
      const currentSuggested = suggestedBaseNameRef.current;
      const defaultStem = currentSuggested
        ? normalizeStem(currentSuggested).replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s{2,}/g, ' ').trim()
        : '';
      setFileNameStem(defaultStem);
      setInitialSuggestedStem(defaultStem);
      populateRichEditorDom('', '', activeSessionKey);
      setManualReadTime('0m00s');
      setAutoApplyReadTime(true);
      setLoadingContent(false);
    }
  }, [
    isOpen,
    initialFileName,
    sourceFileToCopy,
    initialReadTime,
    isDriveActive,
    isNonTextCopyMode,
    populateRichEditorDom,
    stopAudioPreview
  ]);

  if (!isOpen) return null;

  const stats = plainWordStats;

  const targetExtension = isNonTextCopyMode ? sourceExt : '.txt';
  const sanitizedStem = fileNameStem
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const escapedExtRegex = new RegExp(`\\${targetExtension}$`, 'i');
  const cleanStemWithoutExt = sanitizedStem.replace(escapedExtRegex, '').trim();
  const finalFileName = cleanStemWithoutExt
    ? `${cleanStemWithoutExt}${targetExtension}`
    : '';

  const isSameAsInitial =
    isEditingExisting &&
    initialFileName &&
    finalFileName.toLowerCase() ===
      initialFileName
        .trim()
        .split(/[/\\]/)
        .pop()!
        .replace(/\.md$/i, '.txt')
        .toLowerCase();

  const collidesWithOtherExisting =
    Boolean(finalFileName) &&
    !isSameAsInitial &&
    existingFileNames.some(f => f.toLowerCase() === finalFileName.toLowerCase());

  const isSplittingToNewName = Boolean(
    isEditingExisting && finalFileName && !isSameAsInitial
  );

  const initialMatchedSourceAudio =
    isSplittingToNewName && initialFileName
      ? existingFileNames.find(
          f =>
            isAudioFile(f) &&
            normalizeStem(f).toLowerCase() === normalizeStem(initialFileName).toLowerCase()
        ) || null
      : null;

  const effectivePendingDuplicateSourceAudio =
    pendingDuplicateSourceAudio || initialMatchedSourceAudio;

  // Dumb pairing for alternative backup audio based solely on filename stem before extension
  const matchedExistingAudioForStem = cleanStemWithoutExt
    ? existingFileNames.find(
        f => isAudioFile(f) && normalizeStem(f).toLowerCase() === cleanStemWithoutExt.toLowerCase()
      )
    : undefined;

  const activeSelectedOrMatchedAudio =
    customSelectedBackupAudio || matchedExistingAudioForStem;

  const mirroredDuplicateAudioName =
    !customSelectedBackupAudio && effectivePendingDuplicateSourceAudio && cleanStemWithoutExt
      ? `${cleanStemWithoutExt}${getFileExtension(effectivePendingDuplicateSourceAudio) || '.mp3'}`
      : '';

  const isAudioAlreadySavedOnDisk = Boolean(
    !customSelectedBackupAudio &&
      matchedExistingAudioForStem &&
      !effectivePendingDuplicateSourceAudio &&
      isEditingExisting &&
      isSameAsInitial
  );

  // Check if an audio file is already used elsewhere in schedules or paired with another Live Read script
  const isAudioFileUsedElsewhere = (audioFileName: string): boolean => {
    if (!audioFileName || !audioFileName.trim()) return false;
    const targetLower = getFilenameFromUrlOrPath(audioFileName).toLowerCase();
    const targetStemLower = normalizeStem(audioFileName).toLowerCase();
    const currentScriptLower = (finalFileName || '').toLowerCase();
    const initialScriptLower = (initialFileName || '')
      .trim()
      .split(/[/\\]/)
      .pop()
      ?.toLowerCase() || '';

    const allAnns: Announcement[] = [...announcements];
    if (currentEditingAnnouncement && currentEditingAnnouncement.id) {
      const idx = allAnns.findIndex(a => a.id === currentEditingAnnouncement.id);
      if (idx >= 0) {
        allAnns[idx] = { ...allAnns[idx], ...currentEditingAnnouncement } as Announcement;
      } else {
        allAnns.push(currentEditingAnnouncement as Announcement);
      }
    }

    for (const ann of allAnns) {
      if (!ann || ann.isDeleted) continue;
      const slots = ann.timeGatedMp3s || [];
      for (const slot of slots) {
        const mediaItems = getGateMediaItems(slot);
        for (const mi of mediaItems) {
          const slotPrimaryLower = getFilenameFromUrlOrPath(mi.mp3Url || '').toLowerCase();
          const slotBackupLower = getFilenameFromUrlOrPath(mi.backupMp3Url || '').toLowerCase();
          const isCurrentEditingScriptSlot =
            Boolean(currentScriptLower && slotPrimaryLower === currentScriptLower) ||
            Boolean(initialScriptLower && slotPrimaryLower === initialScriptLower);

          if (slotPrimaryLower === targetLower) {
            return true;
          }
          if (slotBackupLower === targetLower && !isCurrentEditingScriptSlot) {
            return true;
          }
        }
      }
    }

    // Also check if another .txt/.md script in existingFileNames shares the stem with this audio file
    for (const fName of existingFileNames) {
      const fLower = fName.toLowerCase();
      if (!fLower.endsWith('.txt') && !fLower.endsWith('.md')) continue;
      if (fLower === currentScriptLower || fLower === initialScriptLower) continue;
      if (normalizeStem(fName).toLowerCase() === targetStemLower) {
        return true;
      }
    }

    return false;
  };

  const performBackupAudioUpload = async (
    file: File,
    targetNameOverride?: string,
    allowOverwrite: boolean = false,
    originalNameRecord?: string,
    useOriginalToggleState?: boolean
  ) => {
    setErrorMsg(null);
    setIsUploadingBackupAudio(true);
    const origName = (originalNameRecord || file.name || '').trim();
    const ext = getFileExtension(origName) || '.mp3';
    const shouldUseOriginal = Boolean(useOriginalToggleState);
    const resolvedTargetName =
      targetNameOverride ||
      (!shouldUseOriginal && cleanStemWithoutExt
        ? `${cleanStemWithoutExt}${ext}`
        : origName);

    // Safety check: if overwriting a file name that is already used elsewhere, do NOT overwrite in place without warning/copying
    try {
      const saved = await uploadAnnouncementMediaFile(file, {
        targetFileNameOverride: resolvedTargetName,
        allowOverwrite,
        isDriveActive
      });
      const origUsedElsewhere = isAudioFileUsedElsewhere(origName);
      setPendingAudioUploadCollision(null);
      setUploadedAudioFileObj(file);
      setUploadedAudioOriginalName(origName);
      setUploadedAudioCurrentDiskName(saved.name);
      setUseOriginalAudioName(shouldUseOriginal);
      setBackupAudioWasCopiedOnRename(!shouldUseOriginal && origUsedElsewhere);
      setCustomSelectedBackupAudio(saved.name);
      setDoNotAttachAudio(false);
      if (onBackupAudioUploaded) {
        onBackupAudioUploaded({
          name: saved.name,
          path: saved.path,
          size: saved.size,
          ...(saved.duration ? { duration: saved.duration } : {}),
          mtimeMs: saved.mtimeMs,
          modifiedTime: saved.modifiedTime
        });
      }
    } catch (err: any) {
      if (err && err.exists) {
        const existingName = err.name || resolvedTargetName || file.name;
        const collExt = getFileExtension(existingName) || '.mp3';
        const stem = existingName.slice(0, -collExt.length);
        const copyStem = generateIncrementedCopyStem(stem, collExt, existingFileNames);
        const copyCandidate = `${copyStem}${collExt}`;
        setPendingAudioUploadCollision({
          file,
          existingName,
          copyCandidateName: copyCandidate,
          intendedOriginalName: origName,
          intendedUseOriginal: shouldUseOriginal
        });
      } else {
        setErrorMsg(err?.message || 'Failed to upload backup audio file');
      }
    } finally {
      setIsUploadingBackupAudio(false);
    }
  };

  const handleBackupAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    const origName = selected.name.trim();
    const ext = getFileExtension(origName) || '.mp3';
    // Default when uploading in Create/Edit Live Read: rename to match Live Read name (useOriginalAudioName = false)
    const defaultTargetName = cleanStemWithoutExt
      ? `${cleanStemWithoutExt}${ext}`
      : origName;

    const existingMatch = existingFileNames.find(
      n => n.toLowerCase() === defaultTargetName.toLowerCase()
    );
    if (existingMatch && isAudioFileUsedElsewhere(existingMatch)) {
      const collExt = getFileExtension(existingMatch) || '.mp3';
      const stem = existingMatch.slice(0, -collExt.length);
      const copyStem = generateIncrementedCopyStem(stem, collExt, existingFileNames);
      const copyCandidate = `${copyStem}${collExt}`;
      setPendingAudioUploadCollision({
        file: selected,
        existingName: existingMatch,
        copyCandidateName: copyCandidate,
        intendedOriginalName: origName,
        intendedUseOriginal: false
      });
      return;
    }
    performBackupAudioUpload(selected, defaultTargetName, true, origName, false);
  };

  const handleToggleUseOriginalAudioName = async (nextUseOriginal: boolean) => {
    if (!uploadedAudioOriginalName) {
      setUseOriginalAudioName(nextUseOriginal);
      return;
    }

    const previousUseOriginal = useOriginalAudioName;
    // Optimistically update checkbox state so controlled input never flashes back
    setUseOriginalAudioName(nextUseOriginal);

    const ext = getFileExtension(uploadedAudioOriginalName) || '.mp3';
    const liveReadMatchedAudioName = cleanStemWithoutExt
      ? `${cleanStemWithoutExt}${ext}`
      : uploadedAudioOriginalName;
    const desiredTargetName = nextUseOriginal
      ? uploadedAudioOriginalName
      : liveReadMatchedAudioName;
    const currentSourceName =
      uploadedAudioCurrentDiskName ||
      customSelectedBackupAudio ||
      uploadedAudioOriginalName;

    if (currentSourceName.toLowerCase() === desiredTargetName.toLowerCase()) {
      setUploadedAudioCurrentDiskName(desiredTargetName);
      setCustomSelectedBackupAudio(desiredTargetName);
      setBackupAudioWasCopiedOnRename(false);
      return;
    }

    setErrorMsg(null);
    setIsUploadingBackupAudio(true);
    try {
      const sourceUsedElsewhere = isAudioFileUsedElsewhere(currentSourceName);
      const origUsedElsewhere = isAudioFileUsedElsewhere(uploadedAudioOriginalName);
      let result: {
        name: string;
        path: string;
        size: string;
        mtimeMs: number;
        modifiedTime: string;
        action: 'noop' | 'copied' | 'renamed';
        usedElsewhere: boolean;
      };

      try {
        result = await renameOrCopyAnnouncementMediaFile({
          sourceFileName: currentSourceName,
          targetFileName: desiredTargetName,
          forceCopy: sourceUsedElsewhere,
          allowOverwrite: true,
          isDriveActive,
          currentLiveReadName: finalFileName || initialFileName,
          editingAnnouncementId: currentEditingAnnouncement?.id,
          fileBlob: uploadedAudioFileObj || undefined
        });
      } catch (renameErr) {
        if (uploadedAudioFileObj) {
          const uploadedFallback = await uploadAnnouncementMediaFile(uploadedAudioFileObj, {
            targetFileNameOverride: desiredTargetName,
            allowOverwrite: true,
            isDriveActive
          });
          result = {
            ...uploadedFallback,
            action: sourceUsedElsewhere ? 'copied' : 'renamed',
            usedElsewhere: sourceUsedElsewhere
          };
        } else {
          throw renameErr;
        }
      }

      setUploadedAudioCurrentDiskName(result.name);
      setCustomSelectedBackupAudio(result.name);
      setBackupAudioWasCopiedOnRename(
        !nextUseOriginal && (result.action === 'copied' || result.usedElsewhere || origUsedElsewhere)
      );
      setDoNotAttachAudio(false);

      if (onBackupAudioUploaded) {
        onBackupAudioUploaded(
          {
            name: result.name,
            path: result.path,
            size: result.size,
            mtimeMs: result.mtimeMs,
            modifiedTime: result.modifiedTime
          },
          result.action === 'renamed' ? currentSourceName : undefined
        );
      }
    } catch (err: any) {
      setUseOriginalAudioName(previousUseOriginal);
      setErrorMsg(err?.message || 'Failed to update backup audio file name');
    } finally {
      setIsUploadingBackupAudio(false);
    }
  };

  const handleToggleAudioPreview = async (audioFileName: string) => {
    if (!audioFileName) return;
    if (previewingAudioFile === audioFileName && audioPreviewRef.current) {
      stopAudioPreview();
      return;
    }
    stopAudioPreview();
    const cleanName = audioFileName.split(/[/\\]/).pop() || audioFileName;
    let playable =
      getPlayableUrl(audioFileName) ||
      `/api/media/stream?path=${encodeURIComponent(cleanName)}`;
    if (playable.includes('googleapis.com') && !playable.startsWith('blob:')) {
      try {
        const cachedBlobUrl = await cacheMP3(audioFileName, getAccessToken() || '');
        if (cachedBlobUrl) {
          playable = cachedBlobUrl;
        }
      } catch (_) {}
    }
    const audio = new Audio(playable);
    audioPreviewRef.current = audio;
    audio
      .play()
      .then(() => {
        setPreviewingAudioFile(audioFileName);
      })
      .catch(() => {
        const fallback = new Audio(
          `/api/media/stream?path=${encodeURIComponent(cleanName)}`
        );
        audioPreviewRef.current = fallback;
        fallback
          .play()
          .then(() => setPreviewingAudioFile(audioFileName))
          .catch(() => stopAudioPreview());
        fallback.onended = () => stopAudioPreview();
        fallback.onerror = () => stopAudioPreview();
      });
    audio.onended = () => stopAudioPreview();
    audio.onerror = () => stopAudioPreview();
  };

  const applyRichCommand = (command: 'bold' | 'italic' | 'underline') => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false);
    if (showMarkdown) {
      syncEditorToMarkdownState();
    } else {
      updateLightweightWordStats();
    }
  };

  const handleInsertPronunciation = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (!sel) return;

    let range: Range;
    if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const rawSelected = range.toString();
    const trimmedSelected = rawSelected.trim();
    const hasSelection = trimmedSelected.length > 0;

    if (hasSelection) {
      // Do NOT replace the selection; collapse to the right of the selection
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    // Inspect character immediately before and immediately after the insertion point
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = fragmentToPlainTextWithNewlines(preRange.cloneContents());

    const postRange = document.createRange();
    postRange.selectNodeContents(el);
    postRange.setStart(range.endContainer, range.endOffset);
    const textAfter = fragmentToPlainTextWithNewlines(postRange.cloneContents());

    const charBefore = textBefore.length > 0 ? textBefore.slice(-1) : '';
    const charAfter = textAfter.length > 0 ? textAfter[0] : '';

    const isSpaceOrPunct = (ch: string) => /[\s.,!?;:'"()[\]{}\-–—/\\]/.test(ch);

    // Ensure preceding space or punctuation mark (unless at start of text or line)
    const isStartOfTextOrLine =
      textBefore.length === 0 || charBefore === '\n' || charBefore === '\r';
    const needsLeadingSpace = !isStartOfTextOrLine && !isSpaceOrPunct(charBefore);

    // Ensure trailing space or punctuation mark (unless at very end of text or line)
    const isEndOfTextOrLine =
      textAfter.length === 0 || charAfter === '\n' || charAfter === '\r';
    const needsTrailingSpace = !isEndOfTextOrLine && !isSpaceOrPunct(charAfter);

    const innerWord = hasSelection ? trimmedSelected : 'RAY-dee-oh';
    const safeInner = innerWord
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const htmlSnippet = `${needsLeadingSpace ? ' ' : ''}<strong><em>(<span data-pronounce-target="1">${safeInner}</span>)</em></strong>${needsTrailingSpace ? ' ' : ''}`;
    document.execCommand('insertHTML', false, htmlSnippet);

    const targetSpan = el.querySelector('span[data-pronounce-target="1"]');
    if (targetSpan) {
      targetSpan.removeAttribute('data-pronounce-target');
      if (!hasSelection) {
        const nextRange = document.createRange();
        nextRange.selectNodeContents(targetSpan);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    }

    if (showMarkdown) {
      syncEditorToMarkdownState();
    } else {
      updateLightweightWordStats();
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        applyRichCommand('bold');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        applyRichCommand('italic');
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        applyRichCommand('underline');
        return;
      }
    }
  };

  const handleEditorKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
      if (showMarkdown) {
        syncEditorToMarkdownState();
      } else {
        updateLightweightWordStats();
      }
    } else {
      scheduleIdleEditorSync(showMarkdown);
    }
  };

  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rawHtml = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (!rawHtml && !plain) return;
    const html = sanitizeClipboardToEditableHtml(rawHtml, plain);
    if (!html) return;
    document.execCommand('insertHTML', false, html);
    if (showMarkdown) {
      syncEditorToMarkdownState();
    } else {
      updateLightweightWordStats();
    }
  };

  const handleToggleMarkdownSection = () => {
    if (!showMarkdown) {
      syncEditorToMarkdownState();
      setShowMarkdown(true);
    } else {
      setShowMarkdown(false);
    }
  };

  const handleCopyMarkdownCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const latest = syncEditorToMarkdownState();
    const serialized = serializeTxtScriptContent(latest);
    try {
      await navigator.clipboard.writeText(serialized);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 1500);
    } catch (_) {}
  };

  const executeSaveNonTextCopy = async (targetFileName: string, allowOverwrite: boolean) => {
    if (!sourceFileToCopy) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/live-read/copy-file', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sourceFileName: sourceFileToCopy,
          targetFileName,
          allowOverwrite
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.exists) {
        setOverwritePromptName(data.name || targetFileName);
        setIsSaving(false);
        return;
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to copy file');
      }

      registerSavedAnnouncementFileInCache(data, '');

      onSaved({
        name: data.name,
        path: data.path,
        size: data.size,
        approximateReadTime: '',
        adoptNewFile: isSplittingToNewName ? adoptNewSplitFile : true
      });
      onClose();
    } catch (err: any) {
      if (err && err.exists) {
        setOverwritePromptName(err.name || targetFileName);
      } else {
        setErrorMsg(err.message || 'Failed to copy file');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const duplicatePairedAudioIfApplicable = async (targetTxtFileName: string): Promise<string | undefined> => {
    if (doNotAttachAudio) return undefined;
    if (customSelectedBackupAudio) {
      // If user uploaded backup audio and kept "Use original file name" unchecked, ensure it matches the final saved Live Read stem
      if (uploadedAudioOriginalName && !useOriginalAudioName) {
        const targetStem = normalizeStem(targetTxtFileName);
        const audioExt = getFileExtension(customSelectedBackupAudio || uploadedAudioOriginalName) || '.mp3';
        const expectedAudioName = `${targetStem}${audioExt}`;
        if (
          targetStem &&
          customSelectedBackupAudio.toLowerCase() !== expectedAudioName.toLowerCase()
        ) {
          try {
            const usedElsewhere = isAudioFileUsedElsewhere(customSelectedBackupAudio);
            const renamed = await renameOrCopyAnnouncementMediaFile({
              sourceFileName: customSelectedBackupAudio,
              targetFileName: expectedAudioName,
              forceCopy: usedElsewhere,
              allowOverwrite: true,
              isDriveActive,
              currentLiveReadName: targetTxtFileName,
              editingAnnouncementId: currentEditingAnnouncement?.id,
              fileBlob: uploadedAudioFileObj || undefined
            });
            if (onBackupAudioUploaded) {
              onBackupAudioUploaded(
                {
                  name: renamed.name,
                  path: renamed.path,
                  size: renamed.size,
                  mtimeMs: renamed.mtimeMs,
                  modifiedTime: renamed.modifiedTime
                },
                renamed.action === 'renamed' ? customSelectedBackupAudio : undefined
              );
            }
            return renamed.name;
          } catch (_) {
            return customSelectedBackupAudio;
          }
        }
      }
      return customSelectedBackupAudio;
    }
    if (effectivePendingDuplicateSourceAudio) {
      const targetStem = normalizeStem(targetTxtFileName);
      const audioExt = getFileExtension(effectivePendingDuplicateSourceAudio) || '.mp3';
      const targetAudioFileName = `${targetStem}${audioExt}`;
      try {
        const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
        const audioRes = await fetch('/api/live-read/copy-file', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sourceFileName: effectivePendingDuplicateSourceAudio,
            targetFileName: targetAudioFileName,
            allowOverwrite: true
          })
        });
        if (audioRes.ok) {
          const audioData = await audioRes.json().catch(() => ({}));
          if (audioData.name) {
            const prevDuration = availableFilesCache.get(effectivePendingDuplicateSourceAudio)?.duration || '';
            registerSavedAnnouncementFileInCache(audioData, prevDuration);
            return audioData.name;
          }
        }
        return effectivePendingDuplicateSourceAudio;
      } catch (_) {
        return effectivePendingDuplicateSourceAudio;
      }
    }
    if (matchedExistingAudioForStem) {
      return matchedExistingAudioForStem;
    }
    return undefined;
  };

  const executeSaveText = async (
    targetFileName: string,
    latestBodyText: string,
    allowOverwrite: boolean
  ) => {
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const serialized = serializeTxtScriptContent(latestBodyText);
      const latestStats = calculateLiveReadWordStats(latestBodyText);
      const normalizedManual = normalizeReadTimeDisplay(manualReadTime.trim());
      const latestReadTime = autoApplyReadTime
        ? latestStats.formattedReadTime
        : (normalizedManual || manualReadTime.trim() || latestStats.formattedReadTime);

      const headers = await getStorageApiHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/live-read/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: targetFileName,
          content: serialized,
          allowOverwrite
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.exists) {
        setOverwritePromptName(data.name || targetFileName);
        setIsSaving(false);
        return;
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to save .txt file');
      }

      registerSavedAnnouncementFileInCache(data, '');

      const pairedBackupAudioFile = await duplicatePairedAudioIfApplicable(data.name);

      onSaved({
        name: data.name,
        path: data.path,
        size: data.size,
        approximateReadTime:
          latestReadTime && latestReadTime !== '0:00' && latestReadTime !== '0m00s' && latestReadTime !== '00 min 00 sec'
            ? latestReadTime.replace(/^~/, '')
            : '',
        isAutoReadTime: autoApplyReadTime,
        pairedBackupAudioFile,
        doNotAttachBackup: doNotAttachAudio,
        adoptNewFile: isSplittingToNewName ? adoptNewSplitFile : true
      });
      onClose();
    } catch (err: any) {
      if (err && err.exists) {
        setOverwritePromptName(err.name || targetFileName);
      } else {
        setErrorMsg(err.message || 'Failed to save .txt script');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const READ_TIME_PARSE_WARNING =
    'Unrecognized Approx. Read Time format. Use 0m20s, 0:20, or seconds (e.g. 20).';

  const handlePrimarySave = () => {
    if (!finalFileName) {
      setErrorMsg(`Please enter a filename for the ${targetExtension} file.`);
      return;
    }

    if (isNonTextCopyMode) {
      if (collidesWithOtherExisting) {
        setOverwritePromptName(finalFileName);
        return;
      }
      executeSaveNonTextCopy(finalFileName, false);
      return;
    }

    const latestBody = syncEditorToMarkdownState();
    if (!latestBody.trim()) {
      setErrorMsg('Please enter live read copy text before saving.');
      return;
    }

    if (!autoApplyReadTime) {
      const trimmedManual = manualReadTime.trim();
      if (
        !trimmedManual ||
        !isParseableReadTimeFormat(trimmedManual) ||
        parseReadTimeToSeconds(trimmedManual) <= 0
      ) {
        setReadTimeWarning(READ_TIME_PARSE_WARNING);
        setErrorMsg(READ_TIME_PARSE_WARNING);
        if (readTimeInputRef.current) {
          readTimeInputRef.current.focus();
          readTimeInputRef.current.select();
        }
        return;
      }
      const coercedManual = normalizeReadTimeDisplay(trimmedManual);
      if (coercedManual !== manualReadTime) {
        setManualReadTime(coercedManual);
      }
      setReadTimeWarning(null);
    }

    if (isSameAsInitial) {
      executeSaveText(finalFileName, latestBody, true);
      return;
    }
    if (collidesWithOtherExisting) {
      setOverwritePromptName(finalFileName);
      return;
    }
    executeSaveText(finalFileName, latestBody, false);
  };

  const handleSaveAsNewCopy = () => {
    const nextStem = generateIncrementedCopyStem(
      cleanStemWithoutExt,
      targetExtension,
      existingFileNames
    );
    setFileNameStem(nextStem);
    setAdoptNewSplitFile(true);
    setOverwritePromptName(null);
  };

  // Only serialize Markdown when the Markdown section is visible
  const exposedTxtContent = showMarkdown ? serializeTxtScriptContent(bodyText) : '';
  const hasFormatting = showMarkdown ? hasInlineFormattingMarkers(bodyText) : false;

  // Match default Live Read pop-up text box dimensions (672px wide x 440px high inside the 720x620 pop-up window)
  // Size down dynamically when the app window is too narrow or too short
  const availableEditBoxWidth = Math.max(
    220,
    Math.min(DEFAULT_EDIT_BOX_WIDTH, windowSize.width - 66)
  );
  const availableEditBoxHeight = Math.max(
    150,
    Math.min(DEFAULT_EDIT_BOX_HEIGHT, windowSize.height - 460)
  );
  const isEditorSizedDown =
    availableEditBoxWidth < DEFAULT_EDIT_BOX_WIDTH ||
    availableEditBoxHeight < DEFAULT_EDIT_BOX_HEIGHT;

  const effectiveReadTimeSeconds = autoApplyReadTime
    ? stats.estimatedSeconds
    : parseReadTimeToSeconds(manualReadTime);
  const isReadTimeOver30 = effectiveReadTimeSeconds > 30;

  const handleOpenTestPopup = () => {
    const latestMarkdown = syncEditorToMarkdownState();
    const serialized = serializeTxtScriptContent(latestMarkdown);
    const activeBackupAudio = !doNotAttachAudio
      ? customSelectedBackupAudio || effectivePendingDuplicateSourceAudio || matchedExistingAudioForStem
      : undefined;
    const displayFileName = finalFileName || 'Untitled.txt';
    const displayTitle =
      suggestedBaseName || cleanStemWithoutExt || 'Live Read Test Pop-up';

    if (window.electronAPI && window.electronAPI.spawnLiveRead) {
      window.electronAPI.spawnLiveRead({
        name: displayFileName,
        fileName: displayFileName,
        announcementName: displayTitle,
        content: serialized,
        backupMp3Url: activeBackupAudio,
        playMode: 'Live',
        isTestPopup: true
      });
      return;
    }

    setTestPopupContent(serialized);
  };

  const hasUnsavedChanges = (): boolean => {
    if (!isSessionLoaded) return false;
    const snap = initialSessionSnapshotRef.current;
    if (!snap || snap.sessionKey !== loadedSessionKey) return false;

    if (fileNameStem.trim() !== snap.fileNameStem.trim()) return true;
    if (adoptNewSplitFile !== snap.adoptNewSplitFile) return true;

    if (!isNonTextCopyMode) {
      const currentMarkdown = editorRef.current
        ? editableHtmlToMarkdownTxt(editorRef.current)
        : bodyText;
      const baselineMarkdown =
        loadedInitialRoundtripTextRef.current || loadedInitialTextRef.current;
      if (currentMarkdown !== baselineMarkdown) return true;
      if (autoApplyReadTime !== snap.autoApplyReadTime) return true;
      if (!autoApplyReadTime && manualReadTime.trim() !== snap.manualReadTime.trim()) return true;
      if (customSelectedBackupAudio !== snap.customSelectedBackupAudio) return true;
      if (doNotAttachAudio !== snap.doNotAttachAudio) return true;
      if (Boolean(uploadedAudioOriginalName)) return true;
    }

    return false;
  };

  const handleRequestClose = () => {
    if (isSaving || isUploadingBackupAudio) return;
    if (hasUnsavedChanges()) {
      setShowUnsavedCloseConfirm(true);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[706px] overflow-hidden border border-slate-200 flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-2 rounded">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                {isNonTextCopyMode
                  ? `Copy Live Read Asset (${targetExtension})`
                  : isEditingExisting
                    ? 'Edit Live Read (.txt)'
                    : 'Create Live Read (.txt)'}
              </h3>
              <p className="text-xs font-bold text-slate-500 mt-1">
                {isNonTextCopyMode
                  ? `Previewing "${sourceFileToCopy}" — edit filename below to save a copy`
                  : 'Format and edit live read text directly below'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRequestClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
            title="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
          {!isSessionLoaded && !isNonTextCopyMode ? (
            <div className="h-80 flex flex-col items-center justify-center border border-slate-200 rounded-lg bg-slate-50 gap-2.5">
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Loading script content...
              </span>
            </div>
          ) : (
            <>
          {/* Shared-file notice if editing a script used by multiple slots */}
          {isEditingExisting && usedByDescriptions.length > 1 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold">
                  Shared by {usedByDescriptions.length} scheduled slots ({usedByDescriptions.slice(0, 3).join(', ')}). Saving overwrites all slots sharing this file, or click &quot;SPLIT&quot; to split to a separate .txt file.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveAsNewCopy}
                className="px-2 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-black uppercase tracking-wider shrink-0 cursor-pointer flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                SPLIT
              </button>
            </div>
          )}

          {/* Post-split choice when saving an existing file under a new split filename */}
          {isSplittingToNewName && initialFileName && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5 text-xs text-slate-800">
              <div className="font-black text-blue-900 uppercase tracking-wider">
                Split File Assignment
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <label className="inline-flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="adopt-split-file-choice"
                    checked={adoptNewSplitFile}
                    onChange={() => setAdoptNewSplitFile(true)}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>
                    Use new split file (<span className="font-mono text-blue-700">{finalFileName}</span>) in this slot (Recommended)
                  </span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-bold text-slate-600 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="adopt-split-file-choice"
                    checked={!adoptNewSplitFile}
                    onChange={() => setAdoptNewSplitFile(false)}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>
                    Keep original file (<span className="font-mono text-slate-700">{getFilenameFromUrlOrPath(initialFileName)}</span>) in this slot
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Filename & Read Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            <div className={cn(isNonTextCopyMode ? "sm:col-span-12" : "sm:col-span-7", "space-y-1")}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider block">
                  Filename ({targetExtension})
                </label>
              </div>
              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                <input
                  ref={fileNameInputRef}
                  type="text"
                  value={fileNameStem}
                  onChange={e => {
                    setFileNameStem(e.target.value);
                    setOverwritePromptName(null);
                  }}
                  onBlur={() => {
                    setFileNameStem(prev => prev.replace(/\s{2,}/g, ' ').trim());
                  }}
                  placeholder="e.g. underwriting-community-garden"
                  className="flex-1 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none bg-transparent"
                />
                <span className="px-2.5 py-1.5 bg-slate-100 border-l border-slate-200 text-xs font-mono font-black text-slate-600 select-none">
                  {targetExtension}
                </span>
              </div>
            </div>

            {!isNonTextCopyMode && (
              <div className="sm:col-span-5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider">
                    Approx. Read Time
                  </label>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 whitespace-nowrap">
                    <span>
                      {stats.wordCount} {stats.wordCount === 1 ? 'word' : 'words'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className={cn(
                      "w-24 shrink-0 flex items-center gap-1.5 border rounded-lg bg-white px-2 py-1.5 focus-within:ring-1",
                      readTimeWarning && !autoApplyReadTime
                        ? "border-amber-500 bg-amber-50/40 focus-within:ring-amber-500 focus-within:border-amber-500"
                        : "border-slate-300 focus-within:ring-blue-500 focus-within:border-blue-500"
                    )}
                  >
                    <Clock
                      className={cn(
                        "w-3.5 h-3.5 shrink-0",
                        readTimeWarning && !autoApplyReadTime ? "text-amber-600" : "text-slate-400"
                      )}
                    />
                    <input
                      ref={readTimeInputRef}
                      type="text"
                      value={autoApplyReadTime ? stats.formattedReadTime : manualReadTime}
                      onChange={e => {
                        const val = e.target.value;
                        setManualReadTime(val);
                        setReadTimeWarning(null);
                        if (errorMsg === READ_TIME_PARSE_WARNING) {
                          setErrorMsg(null);
                        }
                        if (autoApplyReadTime) {
                          setAutoApplyReadTime(false);
                        }
                      }}
                      onBlur={() => {
                        if (!autoApplyReadTime) {
                          const trimmed = manualReadTime.trim();
                          if (
                            trimmed &&
                            isParseableReadTimeFormat(trimmed) &&
                            parseReadTimeToSeconds(trimmed) > 0
                          ) {
                            setManualReadTime(normalizeReadTimeDisplay(trimmed));
                            setReadTimeWarning(null);
                            if (errorMsg === READ_TIME_PARSE_WARNING) {
                              setErrorMsg(null);
                            }
                          } else {
                            setReadTimeWarning(READ_TIME_PARSE_WARNING);
                          }
                        }
                      }}
                      placeholder="0m30s"
                      title="Enter as 0m30s, 0:30, 30s, or seconds (e.g. 20)"
                      className="w-full text-xs font-mono font-bold outline-none bg-transparent text-slate-900"
                    />
                  </div>
                  <label
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 cursor-pointer select-none shrink-0"
                    title={`${getLiveReadWpm()} wpm`}
                  >
                    <input
                      type="checkbox"
                      checked={autoApplyReadTime}
                      onChange={e => {
                        const checked = e.target.checked;
                        setAutoApplyReadTime(checked);
                        setManualReadTime(stats.formattedReadTime);
                        setReadTimeWarning(null);
                        if (errorMsg === READ_TIME_PARSE_WARNING) {
                          setErrorMsg(null);
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title={`${getLiveReadWpm()} wpm`}
                    />
                    <span>Auto</span>
                  </label>
                  <span
                    className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-1 rounded font-mono font-bold text-[11px] shrink-0 select-none"
                    title={`Calculated approximate read time at ${getLiveReadWpm()} words per minute`}
                  >
                    Est: ~{stats.formattedReadTime}
                  </span>
                </div>
                {readTimeWarning && !autoApplyReadTime && (
                  <div className="flex items-start gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1 leading-tight">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{readTimeWarning}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {isNonTextCopyMode ? (
            /* Non-readable Live Read file preview (PDF / Image) */
            <div className="border border-slate-300 rounded-lg bg-slate-50 overflow-hidden flex flex-col h-[360px]">
              <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                  File Content Preview ({sourceFileToCopy})
                </span>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-3">
                {loadingContent ? (
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Loading file preview...
                    </span>
                  </div>
                ) : sourceExt === '.pdf' && nonTextPreviewUrl ? (
                  <iframe
                    src={`${nonTextPreviewUrl}#toolbar=0&navpanes=0`}
                    title="PDF Preview"
                    className="w-full h-full border-0 rounded bg-white"
                  />
                ) : isImageFile(sourceFileToCopy || '') && nonTextPreviewUrl ? (
                  <img
                    src={nonTextPreviewUrl}
                    alt={sourceFileToCopy}
                    className="max-h-full max-w-full object-contain rounded shadow-sm border border-slate-200"
                  />
                ) : (
                  <div className="text-center space-y-1">
                    <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">{sourceFileToCopy}</p>
                    <p className="text-xs text-slate-400">
                      Ready to save duplicate copy as &quot;{finalFileName}&quot;
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Formatting Toolbar + Pronunciation Button */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 border border-slate-200 rounded-lg p-1.5 px-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider mr-1 select-none">
                    Style:
                  </span>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => applyRichCommand('bold')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded text-xs font-black flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Bold — Cmd/Ctrl+B"
                  >
                    <Bold className="w-3.5 h-3.5" />
                    <span>Bold</span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => applyRichCommand('italic')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Italic — Cmd/Ctrl+I"
                  >
                    <Italic className="w-3.5 h-3.5" />
                    <span className="italic font-bold">Italic</span>
                  </button>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => applyRichCommand('underline')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Underline — Cmd/Ctrl+U"
                  >
                    <Underline className="w-3.5 h-3.5" />
                    <span className="underline">Underline</span>
                  </button>

                  <div className="w-px h-4 bg-slate-300 mx-1" />

                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleInsertPronunciation}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Insert bold+italic (RAY-dee-oh) pronunciation guide at cursor or to the right of selected text"
                  >
                    <Speech className="w-3.5 h-3.5" />
                    <span>Insert Pronunciation Block</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {/* Primary Editable Formatted Preview (Sized to match default Live Read Pop-up) */}
                <div className="flex flex-col border border-slate-300 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                    <div className="px-3 py-1.5 bg-blue-50/70 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-black uppercase tracking-wider text-blue-900 shrink-0">
                        Edit Text
                      </span>
                      {isReadTimeOver30 && (
                        <span className="text-xs font-bold text-red-600">
                          Approx Read time over 30 seconds.
                        </span>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-bold text-blue-700">
                          Editable
                        </span>
                        {isEditorSizedDown && (
                          <button
                            type="button"
                            onClick={handleOpenTestPopup}
                            className="px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer shadow-2xs"
                            title="Open pop-up window as it opens in Live or Prerecord mode"
                          >
                            Test Pop-up
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onKeyDown={handleEditorKeyDown}
                      onKeyUp={handleEditorKeyUp}
                      onPaste={handleEditorPaste}
                      onBlur={() => {
                        if (showMarkdown) {
                          syncEditorToMarkdownState();
                        } else {
                          updateLightweightWordStats();
                        }
                      }}
                      style={{
                        height: `${availableEditBoxHeight}px`,
                        fontSize: `${getDefaultLiveReadFontSize()}px`,
                        fontFamily: getLiveReadFontFamilyCss(getDefaultLiveReadFontFamily()),
                      }}
                      data-placeholder="Type or paste live read copy here... Highlight text and use Bold, Italic, Underline, or Insert Pronunciation Block above."
                      className="w-full p-6 overflow-y-auto leading-relaxed text-slate-800 bg-white outline-none whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:italic empty:before:text-base"
                    />
                  </div>

                  {/* Collapsible View/Hide Markdown Section (Hidden by default) */}
                  <div className="flex flex-col border border-slate-300 rounded-lg bg-slate-50 overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={handleToggleMarkdownSection}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleMarkdownSection();
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 bg-slate-100 hover:bg-slate-200/70 flex items-center justify-between cursor-pointer select-none",
                        showMarkdown && "border-b border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {showMarkdown ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                          {showMarkdown ? 'Hide Markdown' : 'View Markdown'}
                        </span>
                      </div>

                      {showMarkdown && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-400">
                            Read-Only
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyMarkdownCode}
                            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                            title={copiedMarkdown ? 'Copied' : 'Copy Markdown'}
                          >
                            {copiedMarkdown ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {showMarkdown && (
                      <>
                        <textarea
                          readOnly
                          value={exposedTxtContent}
                          placeholder="Raw .txt file content (including any auto-injected Markdown comment header) appears here..."
                          className="w-full h-44 p-3 font-['ui-monospace','SFMono-Regular','Menlo','Monaco','Consolas','Liberation_Mono','Courier_New',monospace] text-xs leading-relaxed text-slate-700 bg-slate-50 outline-none resize-none select-all"
                        />
                        <div className="px-3 py-1.5 bg-slate-100/70 border-t border-slate-200 text-xs text-slate-500">
                          {hasFormatting
                            ? 'Formatted .txt: The explanatory comment header shown above is saved for Notepad/TextEdit readers and automatically hidden in AMP.'
                            : 'Plain .txt: No formatting symbols used yet; file saves as clean plain text.'}
                        </div>
                      </>
                    )}
                  </div>
              </div>

              {/* Bottom Segment: Alternative / Backup Audio File Pairing (Dumb Basename Match or Explicit Selection) */}
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg space-y-2">
                <input
                  ref={backupAudioInputRef}
                  type="file"
                  accept=".mp3,.wav,.flac,.ogg,.m4a,.aac"
                  onChange={handleBackupAudioFileChange}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Music className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Alternative Backup Audio (.mp3)
                    </span>
                  </div>

                  {/* Action Controls for Paired / Unpaired Audio */}
                  {!customSelectedBackupAudio && effectivePendingDuplicateSourceAudio && !doNotAttachAudio ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleAudioPreview(effectivePendingDuplicateSourceAudio)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 cursor-pointer",
                          previewingAudioFile === effectivePendingDuplicateSourceAudio
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                        )}
                        title="Preview backup audio"
                      >
                        {previewingAudioFile === effectivePendingDuplicateSourceAudio ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() => backupAudioInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Upload a new backup audio file"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingBackupAudio ? 'UPLOADING...' : 'UPLOAD NEW AUDIO'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAudioPickerSearchQuery('');
                          setIsAudioPickerOpen(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        title="Choose an existing audio file from Media Announcements"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>CHOOSE EXISTING AUDIO</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          stopAudioPreview();
                          setDoNotAttachAudio(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        title="Do not attach or duplicate this backup audio file"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Do Not Attach</span>
                      </button>
                    </div>
                  ) : activeSelectedOrMatchedAudio && !doNotAttachAudio ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleAudioPreview(activeSelectedOrMatchedAudio)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 cursor-pointer",
                          previewingAudioFile === activeSelectedOrMatchedAudio
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                        )}
                        title="Preview backup audio"
                      >
                        {previewingAudioFile === activeSelectedOrMatchedAudio ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() => backupAudioInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Upload a new backup audio file"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingBackupAudio ? 'UPLOADING...' : 'UPLOAD NEW AUDIO'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAudioPickerSearchQuery('');
                          setIsAudioPickerOpen(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        title="Choose an existing audio file from Media Announcements"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>CHOOSE EXISTING AUDIO</span>
                      </button>

                      {!isAudioAlreadySavedOnDisk && (
                        <button
                          type="button"
                          onClick={() => {
                            stopAudioPreview();
                            setDoNotAttachAudio(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                          title="Do not attach this backup audio file"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Do Not Attach</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(customSelectedBackupAudio || effectivePendingDuplicateSourceAudio || matchedExistingAudioForStem) &&
                        doNotAttachAudio && (
                          <button
                            type="button"
                            onClick={() => setDoNotAttachAudio(false)}
                            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-300 rounded text-xs font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Attach Matched Audio
                          </button>
                        )}
                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() => backupAudioInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Upload a new backup audio file"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingBackupAudio ? 'UPLOADING...' : 'UPLOAD NEW AUDIO'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioPickerSearchQuery('');
                          setIsAudioPickerOpen(true);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        title="Choose an existing audio file from Media Announcements"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>CHOOSE EXISTING AUDIO</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Audio Upload Collision Prompt */}
                {pendingAudioUploadCollision && (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="truncate">
                        &quot;{pendingAudioUploadCollision.existingName}&quot; already exists in Media Announcements.
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() =>
                          performBackupAudioUpload(
                            pendingAudioUploadCollision.file,
                            pendingAudioUploadCollision.copyCandidateName,
                            false,
                            pendingAudioUploadCollision.intendedOriginalName || pendingAudioUploadCollision.file.name,
                            pendingAudioUploadCollision.intendedUseOriginal
                          )
                        }
                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase cursor-pointer"
                      >
                        Save as &quot;{pendingAudioUploadCollision.copyCandidateName}&quot;
                      </button>
                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() =>
                          performBackupAudioUpload(
                            pendingAudioUploadCollision.file,
                            pendingAudioUploadCollision.existingName,
                            true,
                            pendingAudioUploadCollision.intendedOriginalName || pendingAudioUploadCollision.file.name,
                            pendingAudioUploadCollision.intendedUseOriginal
                          )
                        }
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase cursor-pointer"
                      >
                        Overwrite Existing
                      </button>
                      <button
                        type="button"
                        disabled={isUploadingBackupAudio}
                        onClick={() => setPendingAudioUploadCollision(null)}
                        className="px-2 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Pairing Status Row */}
                <div className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1.5 flex items-center justify-between gap-2">
                  {!customSelectedBackupAudio && effectivePendingDuplicateSourceAudio && !doNotAttachAudio ? (
                    <span className="truncate">
                      Pre-copied backup audio:{' '}
                      <span className="font-mono text-blue-700">
                        {mirroredDuplicateAudioName || effectivePendingDuplicateSourceAudio}
                      </span>{' '}
                      <span className="text-slate-400 font-normal">
                        (mirrors live read name from {effectivePendingDuplicateSourceAudio})
                      </span>
                    </span>
                  ) : customSelectedBackupAudio && !doNotAttachAudio ? (
                    <span className="truncate">
                      Selected backup audio:{' '}
                      <span className="font-mono text-emerald-700">
                        {uploadedAudioOriginalName
                          ? useOriginalAudioName
                            ? uploadedAudioOriginalName
                            : cleanStemWithoutExt
                              ? `${cleanStemWithoutExt}${getFileExtension(customSelectedBackupAudio || uploadedAudioOriginalName) || '.mp3'}`
                              : customSelectedBackupAudio
                          : customSelectedBackupAudio}
                      </span>
                    </span>
                  ) : matchedExistingAudioForStem && !doNotAttachAudio ? (
                    <span className="truncate">
                      Matched backup audio:{' '}
                      <span className="font-mono text-emerald-700">
                        {matchedExistingAudioForStem}
                      </span>
                    </span>
                  ) : doNotAttachAudio ? (
                    <span className="text-slate-400 italic font-normal">
                      Backup audio will not be attached on save.
                    </span>
                  ) : (
                    <span className="text-slate-500 font-normal">
                      &apos;{cleanStemWithoutExt ? `${cleanStemWithoutExt}.mp3` : 'backup.mp3'}&apos; not found.  Upload an audio file or choose an existing one.
                    </span>
                  )}
                </div>

                {/* "Use original file name" toggle checkbox below the backup audio name when uploading alternative backup audio */}
                {uploadedAudioOriginalName && !doNotAttachAudio && (
                  <div className="pt-0.5">
                    <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useOriginalAudioName}
                        disabled={isUploadingBackupAudio}
                        onChange={e => handleToggleUseOriginalAudioName(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                      />
                      <span>
                        Use original file name ({uploadedAudioOriginalName})
                      </span>
                    </label>
                  </div>
                )}

                <p className="text-xs text-slate-500 font-medium leading-snug">
                  If desired, AMP checks for a backup audio file of the same name for the live read.
                  {uploadedAudioOriginalName && !doNotAttachAudio && (
                    <span className="text-slate-700 font-semibold">
                      {' '}
                      {!useOriginalAudioName
                        ? `Uploaded audio "${uploadedAudioOriginalName}" has been and is being renamed to "${
                            cleanStemWithoutExt
                              ? `${cleanStemWithoutExt}${getFileExtension(customSelectedBackupAudio || uploadedAudioOriginalName) || '.mp3'}`
                              : customSelectedBackupAudio || uploadedAudioOriginalName
                          }" to match this live read${
                            backupAudioWasCopiedOnRename
                              ? ' (copied behind the scenes because the file is already used elsewhere)'
                              : ''
                          }.`
                        : `Using original uploaded file name "${uploadedAudioOriginalName}" without renaming.`}
                    </span>
                  )}
                </p>
              </div>
            </>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs font-bold text-red-700">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-slate-500 truncate">
            {finalFileName ? (
              <span>
                Target: <span className="font-mono text-slate-800">{finalFileName}</span>
              </span>
            ) : (
              <span>Enter a filename above</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving || isUploadingBackupAudio}
              onClick={handleRequestClose}
              className="px-3.5 py-1.5 border border-slate-200 rounded text-xs font-black text-slate-600 hover:bg-slate-100 uppercase tracking-wider bg-white cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || isUploadingBackupAudio || loadingContent || (!isSessionLoaded && !isNonTextCopyMode) || !finalFileName}
              onClick={() => handlePrimarySave()}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              <span>
                {isSaving
                  ? 'Saving...'
                  : isNonTextCopyMode
                    ? 'Save Copy'
                    : isEditingExisting && isSameAsInitial
                      ? 'Save Changes'
                      : 'Save Live Read'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Centered Pop-Up Modal for Unsaved Changes Warning (#121) */}
      {showUnsavedCloseConfirm && (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setShowUnsavedCloseConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3.5 px-4 bg-amber-50 border-b border-amber-200 flex items-center gap-2.5">
              <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest leading-none">
                  Unsaved Changes
                </h4>
                <p className="text-xs text-amber-800 font-bold mt-1">
                  You have unsaved live read edits.
                </p>
              </div>
            </div>

            <div className="p-4 text-xs font-medium text-slate-600 leading-relaxed">
              Closing this editor will discard any unsaved script changes. Are you sure you want to leave?
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnsavedCloseConfirm(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded text-xs font-black text-slate-700 hover:bg-slate-100 uppercase tracking-wider bg-white cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedCloseConfirm(false);
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Discard &amp; Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Pop-Up Modal for Filename Collision / Overwrite Prompt (#102) */}
      {overwritePromptName && (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setOverwritePromptName(null)}
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
                  File Already Exists
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setOverwritePromptName(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                title="Close"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 text-xs font-bold text-slate-800 leading-relaxed">
              &quot;{overwritePromptName}&quot; already exists in Media Announcements. Overwrite it or save under a new name?
            </div>

            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOverwritePromptName(null);
                  requestAnimationFrame(() => {
                    if (fileNameInputRef.current) {
                      fileNameInputRef.current.focus();
                      fileNameInputRef.current.select();
                    }
                  });
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase cursor-pointer"
              >
                Edit Filename
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = overwritePromptName;
                  setOverwritePromptName(null);
                  if (isNonTextCopyMode) {
                    executeSaveNonTextCopy(target, true);
                  } else {
                    const latest = syncEditorToMarkdownState();
                    executeSaveText(target, latest, true);
                  }
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Overwrite Existing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocking Upload Status / Error Overlay Modal */}
      {(isUploadingBackupAudio || (errorMsg && errorMsg.toLowerCase().includes('upload'))) && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden p-4 space-y-3">
            {isUploadingBackupAudio ? (
              <>
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div className="min-w-0">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Uploading Audio File...
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Please wait while the backup audio upload completes.
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
                      {errorMsg}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
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

      {testPopupContent !== null && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/80">
          <LiveReadPopout
            initialFileName={finalFileName || 'Untitled.txt'}
            initialAnnouncementName={
              suggestedBaseName || cleanStemWithoutExt || 'Live Read Test Pop-up'
            }
            initialContent={testPopupContent}
            backupMp3Url={
              !doNotAttachAudio
                ? customSelectedBackupAudio || effectivePendingDuplicateSourceAudio || matchedExistingAudioForStem
                : undefined
            }
            playMode="Live"
            isOverlay={true}
            isPreview={false}
            isTestPopup={true}
            onClose={() => setTestPopupContent(null)}
          />
        </div>
      )}

      {/* Existing Audio Chooser Modal for Backup Audio */}
      {isAudioPickerOpen && (
        <MediaPickerModal
          isOpen={isAudioPickerOpen}
          zIndexClassName="z-[160]"
          searchQuery={audioPickerSearchQuery}
          onSearchQueryChange={setAudioPickerSearchQuery}
          filteredFiles={(availableFiles.length > 0
            ? availableFiles
            : existingFileNames.map(n => ({ name: n }))
          ).filter(
            f =>
              isAudioFile(f.name) &&
              f.name.toLowerCase().includes(audioPickerSearchQuery.toLowerCase())
          )}
          pickerDurations={pickerDurations}
          metadataCache={metadataCache}
          previewUrl={previewingAudioFile}
          onTogglePreview={handleToggleAudioPreview}
          onPreviewScript={() => {}}
          onSelectFile={file => {
            stopAudioPreview();
            setUploadedAudioOriginalName(null);
            setUploadedAudioCurrentDiskName(null);
            setUseOriginalAudioName(false);
            setBackupAudioWasCopiedOnRename(false);
            setCustomSelectedBackupAudio(file.name);
            setDoNotAttachAudio(false);
            setIsAudioPickerOpen(false);
          }}
          onClose={() => {
            stopAudioPreview();
            setIsAudioPickerOpen(false);
          }}
          isRefreshing={false}
          isDriveActive={isDriveActive}
          announcements={announcements}
          currentEditingAnnouncement={currentEditingAnnouncement}
          lockAudioOnly={true}
          pickerContextInfo={{
            mode:
              !doNotAttachAudio &&
              Boolean(
                customSelectedBackupAudio ||
                  effectivePendingDuplicateSourceAudio ||
                  matchedExistingAudioForStem
              )
                ? 'replace'
                : 'choose',
            contextDescription: `Backup Audio for Live Read "${finalFileName || initialFileName || 'Untitled.txt'}"`,
            currentFile:
              !doNotAttachAudio &&
              (customSelectedBackupAudio ||
                effectivePendingDuplicateSourceAudio ||
                matchedExistingAudioForStem)
                ? {
                    name:
                      customSelectedBackupAudio ||
                      effectivePendingDuplicateSourceAudio ||
                      matchedExistingAudioForStem ||
                      '',
                  }
                : null,
          }}
          onFileUploaded={async uploaded => {
            const origName = uploaded.name;
            const ext = getFileExtension(origName) || '.mp3';
            const desiredTarget = cleanStemWithoutExt
              ? `${cleanStemWithoutExt}${ext}`
              : origName;
            setUploadedAudioOriginalName(origName);
            setUseOriginalAudioName(false);

            if (desiredTarget.toLowerCase() !== origName.toLowerCase()) {
              try {
                const usedElsewhere = isAudioFileUsedElsewhere(origName);
                const renamed = await renameOrCopyAnnouncementMediaFile({
                  sourceFileName: origName,
                  targetFileName: desiredTarget,
                  forceCopy: usedElsewhere,
                  allowOverwrite: true,
                  isDriveActive,
                  currentLiveReadName: finalFileName || initialFileName,
                  editingAnnouncementId: currentEditingAnnouncement?.id
                });
                setUploadedAudioCurrentDiskName(renamed.name);
                setCustomSelectedBackupAudio(renamed.name);
                setBackupAudioWasCopiedOnRename(renamed.action === 'copied' || renamed.usedElsewhere);
                setDoNotAttachAudio(false);
                if (onBackupAudioUploaded) {
                  onBackupAudioUploaded({
                    name: renamed.name,
                    path: renamed.path,
                    size: renamed.size,
                    mtimeMs: renamed.mtimeMs,
                    modifiedTime: renamed.modifiedTime
                  });
                }
                return;
              } catch (_) {}
            }

            setUploadedAudioCurrentDiskName(origName);
            setCustomSelectedBackupAudio(origName);
            setBackupAudioWasCopiedOnRename(false);
            setDoNotAttachAudio(false);
            if (onBackupAudioUploaded) {
              onBackupAudioUploaded(uploaded);
            }
          }}
        />
      )}
    </div>
  );
};
