import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  Speech,
  Info,
  AlertTriangle,
  Save,
  Eye,
  MessageSquare,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  AdminMessage,
  AdminMessageClearMode,
  AdminMessageSeverity,
  AdminMessageTargetScope,
  Show,
} from '../types';
import {
  cn,
  getSortedShows,
  formatTime12,
  getDatePart,
  getTimePart,
  getCurrentDatetimeLocal,
} from '../lib/utils';
import {
  markdownTxtToEditableHtml,
  editableHtmlToMarkdownTxt,
  sanitizeClipboardToEditableHtml,
} from '../lib/liveReadFormatting';
import {
  getDefaultLiveReadFontSize,
  getDefaultLiveReadFontFamily,
  getLiveReadFontFamilyCss,
} from '../lib/compatibility';
import { CalendarDateInput, CalendarGateRangeSpan } from './CalendarDateInput';
import { MilitaryTimeInput } from './MilitaryTimeInput';
import AdminMessageReaderModal from './AdminMessageReaderModal';

export interface AdminMessageEditorModalProps {
  isOpen: boolean;
  editingMessage?: AdminMessage | null;
  reuseSourceMessage?: AdminMessage | null;
  initialTargetShowId?: string;
  shows: Show[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (message: AdminMessage) => Promise<boolean | void> | void;
}

type DeliveryTargetMode = 'app_startup' | 'shows';

export default function AdminMessageEditorModal({
  isOpen,
  editingMessage,
  reuseSourceMessage,
  initialTargetShowId,
  shows,
  isSaving = false,
  onClose,
  onSave,
}: AdminMessageEditorModalProps) {
  const isNew = !editingMessage;
  const activeShows = useMemo(
    () => (getSortedShows(shows) as Show[]).filter((sh) => sh.active !== false),
    [shows]
  );

  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<AdminMessageSeverity>('info');
  const [enabled, setEnabled] = useState(true);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryTargetMode>('shows');
  const [targetShowIds, setTargetShowIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [onlyShowOnce, setOnlyShowOnce] = useState(true);
  const [showPickerSearch, setShowPickerSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewBodySnapshot, setPreviewBodySnapshot] = useState('');
  const [privacyDisclaimerMode, setPrivacyDisclaimerMode] = useState<'before' | 'after' | null>(null);
  const [hasShownPreEditPrivacyNotice, setHasShownPreEditPrivacyNotice] = useState(false);
  const [pendingSaveMessage, setPendingSaveMessage] = useState<AdminMessage | null>(null);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const activeShowsRef = useRef<Show[]>(activeShows);
  activeShowsRef.current = activeShows;

  useEffect(() => {
    if (!isOpen) {
      setPrivacyDisclaimerMode(null);
      setPendingSaveMessage(null);
      setHasShownPreEditPrivacyNotice(false);
      return;
    }
    setValidationError(null);
    setShowPickerSearch('');
    setShowPreviewModal(false);
    setPendingSaveMessage(null);

    const allActiveIds = activeShowsRef.current.map((sh) => sh.id);
    const activeIdSet = new Set(allActiveIds);
    const seedMsg = editingMessage || reuseSourceMessage || null;
    let startsAsTargetedShows = false;

    if (seedMsg) {
      const isReuse = !editingMessage && Boolean(reuseSourceMessage);
      const isStartup = seedMsg.targetScope === 'app_startup';
      setTitle(seedMsg.title || '');
      setSeverity(seedMsg.severity || 'info');
      setEnabled(isReuse ? true : seedMsg.enabled !== false && !seedMsg.archived);
      setDeliveryMode(isStartup ? 'app_startup' : 'shows');

      if (isStartup) {
        setTargetShowIds(allActiveIds);
      } else if (
        seedMsg.targetScope === 'all_shows' ||
        seedMsg.targetScope === 'time_window'
      ) {
        setTargetShowIds(allActiveIds);
      } else {
        const existingActive = (seedMsg.targetShowIds || []).filter((id) =>
          activeIdSet.has(id)
        );
        const resolvedIds = existingActive.length > 0 ? existingActive : allActiveIds;
        setTargetShowIds(resolvedIds);
        startsAsTargetedShows =
          allActiveIds.length > 0 &&
          resolvedIds.length > 0 &&
          resolvedIds.length < allActiveIds.length;
      }

      setStartDate(isReuse ? '' : seedMsg.startDate || '');
      setEndDate(isReuse ? '' : seedMsg.endDate || '');
      setOnlyShowOnce(seedMsg.clearMode !== 'date_range');
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = markdownTxtToEditableHtml(seedMsg.body || '');
        }
      }, 0);
    } else {
      setTitle('');
      setSeverity('info');
      setEnabled(true);
      setDeliveryMode('shows');
      if (initialTargetShowId && activeIdSet.has(initialTargetShowId)) {
        setTargetShowIds([initialTargetShowId]);
        startsAsTargetedShows = allActiveIds.length > 1;
      } else {
        setTargetShowIds(allActiveIds);
      }
      setStartDate('');
      setEndDate('');
      setOnlyShowOnce(true);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
        }
      }, 0);
    }

    if (startsAsTargetedShows) {
      setPrivacyDisclaimerMode('before');
      setHasShownPreEditPrivacyNotice(true);
    } else {
      setPrivacyDisclaimerMode(null);
      setHasShownPreEditPrivacyNotice(false);
    }
  }, [isOpen, editingMessage, reuseSourceMessage, initialTargetShowId]);

  const activeShowIdSet = useMemo(
    () => new Set(activeShows.map((sh) => sh.id)),
    [activeShows]
  );
  const selectedActiveShowIds = useMemo(
    () => targetShowIds.filter((id) => activeShowIdSet.has(id)),
    [targetShowIds, activeShowIdSet]
  );
  const isSpecificShowsTargeted =
    deliveryMode === 'shows' &&
    activeShows.length > 0 &&
    selectedActiveShowIds.length > 0 &&
    selectedActiveShowIds.length < activeShows.length;

  useEffect(() => {
    if (!isOpen) return;
    if (isSpecificShowsTargeted && !hasShownPreEditPrivacyNotice) {
      setPrivacyDisclaimerMode('before');
      setHasShownPreEditPrivacyNotice(true);
    }
  }, [isOpen, isSpecificShowsTargeted, hasShownPreEditPrivacyNotice]);

  if (!isOpen) return null;

  const readCurrentMarkdown = (): string => {
    if (!editorRef.current) return '';
    return editableHtmlToMarkdownTxt(editorRef.current).trim();
  };

  const applyRichCommand = (command: 'bold' | 'italic' | 'underline') => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try {
      document.execCommand(command, false);
    } catch (_) {}
  };

  const handleInsertPronunciation = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
      range.collapse(false);
    }
    const html = ' <strong><em>(pro-NUN-see-AY-shun)</em></strong> ';
    try {
      document.execCommand('insertHTML', false, html);
    } catch (_) {}
  };

  const handleEditorPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    const cleanHtml = sanitizeClipboardToEditableHtml(html, plain);
    try {
      document.execCommand('insertHTML', false, cleanHtml);
    } catch (_) {}
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        applyRichCommand('bold');
      } else if (k === 'i') {
        e.preventDefault();
        applyRichCommand('italic');
      } else if (k === 'u') {
        e.preventDefault();
        applyRichCommand('underline');
      }
    }
  };

  const resolvedTargetScope = (): AdminMessageTargetScope => {
    if (deliveryMode === 'app_startup') return 'app_startup';
    if (activeShows.length > 0 && selectedActiveShowIds.length === activeShows.length) {
      return 'all_shows';
    }
    if (selectedActiveShowIds.length === 1) return 'single_show';
    return 'selected_shows';
  };

  const startDatePart = getDatePart(startDate);
  const startTimePart = getTimePart(startDate);
  const endDatePart = getDatePart(endDate);
  const endTimePart = getTimePart(endDate);

  const normalizedStartIso = startDatePart ? `${startDatePart}T${startTimePart || '00:00'}` : '';
  const normalizedEndIso = endDatePart ? `${endDatePart}T${endTimePart || '23:59'}` : '';
  const hasInvertedDateRange = Boolean(
    normalizedStartIso && normalizedEndIso && normalizedStartIso > normalizedEndIso
  );

  const messageGateRanges: CalendarGateRangeSpan[] = [
    {
      id: editingMessage?.id || 'draft-admin-msg',
      label: title.trim() || 'Message Window',
      startDate: startDatePart || undefined,
      endDate: endDatePart || undefined,
      startIso: normalizedStartIso || undefined,
      endIso: normalizedEndIso || undefined,
      isCurrent: true,
    },
  ];

  const buildDraftMessage = (): AdminMessage => {
    const nowIso = new Date().toISOString();
    const bodyMd = readCurrentMarkdown();
    const cleanTitle = title.trim() || 'Show Message';
    const nextScope = resolvedTargetScope();
    const nextClearMode: AdminMessageClearMode = onlyShowOnce ? 'once_acknowledged' : 'date_range';

    return {
      id: editingMessage?.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: cleanTitle,
      body: bodyMd,
      severity,
      enabled,
      ...(!enabled ? { archived: true, archivedAt: editingMessage?.archivedAt || nowIso } : {}),
      targetScope: nextScope,
      ...(nextScope === 'single_show' || nextScope === 'selected_shows'
        ? { targetShowIds: selectedActiveShowIds }
        : {}),
      ...(nextScope === 'app_startup' ? { startupCondition: 'all_users' as const } : {}),
      ...(normalizedStartIso ? { startDate: normalizedStartIso } : {}),
      ...(normalizedEndIso ? { endDate: normalizedEndIso } : {}),
      clearMode: nextClearMode,
      acknowledgedByShows: editingMessage?.acknowledgedByShows || [],
      createdAt: editingMessage?.createdAt || nowIso,
      updatedAt: nowIso,
      createdBy: editingMessage?.createdBy || 'Admin',
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const bodyMd = readCurrentMarkdown();

    if (!title.trim()) {
      setValidationError('Enter a message title.');
      return;
    }
    if (!bodyMd) {
      setValidationError('Enter message text in the Edit Text area.');
      return;
    }
    if (deliveryMode === 'shows' && selectedActiveShowIds.length === 0) {
      setValidationError('Select at least one active Show to receive this message.');
      return;
    }
    if (hasInvertedDateRange) {
      setValidationError('End Date/Time must be on or after Start Date/Time.');
      return;
    }

    const nextMsg = buildDraftMessage();
    if (
      nextMsg.targetScope === 'single_show' ||
      nextMsg.targetScope === 'selected_shows'
    ) {
      setPendingSaveMessage(nextMsg);
      setPrivacyDisclaimerMode('after');
      return;
    }
    await onSave(nextMsg);
  };

  const handleConfirmPrivacyDisclaimer = async () => {
    const mode = privacyDisclaimerMode;
    const msgToSave = pendingSaveMessage;
    setPrivacyDisclaimerMode(null);
    setPendingSaveMessage(null);
    if (mode === 'after' && msgToSave) {
      await onSave(msgToSave);
    }
  };

  const filteredShowsForPicker = activeShows.filter((sh) => {
    if (!showPickerSearch.trim()) return true;
    const q = showPickerSearch.toLowerCase();
    return (
      sh.name.toLowerCase().includes(q) ||
      (sh.host || '').toLowerCase().includes(q) ||
      sh.day.toLowerCase().includes(q)
    );
  });

  const isAlert = severity === 'alert';

  const previewTargetShow =
    deliveryMode === 'shows'
      ? activeShows.find((s) => s.id === selectedActiveShowIds[0]) || activeShows[0] || null
      : null;

  return (
    <div
      className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 text-left"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border-2 border-teal-700"
      >
        {/* Header */}
        <div
          className={cn(
            'px-4 py-3 flex items-center justify-between gap-2 text-white shrink-0',
            isAlert ? 'bg-amber-600' : 'bg-teal-700'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-wider truncate">
                Admin-to-Show Message Editor
              </h2>
              <p className="text-xs text-white/85 truncate">
                {reuseSourceMessage && isNew
                  ? `Reusing Message · Creating New Active Copy`
                  : isNew
                    ? 'Create Off-Air Show Message or AMP Launch Notice'
                    : `Editing Message · ${editingMessage?.id}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-black/20 text-white cursor-pointer shrink-0"
            title="Close Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-50/70">
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Row 1: Title, Severity, Status */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 space-y-1">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                Message Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Studio Mic Check / Station Notice"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                Severity Style
              </label>
              <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setSeverity('info')}
                  className={cn(
                    'py-1.5 px-2 rounded text-xs font-black uppercase flex items-center justify-center gap-1 cursor-pointer transition-colors',
                    severity === 'info'
                      ? 'bg-teal-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Info (i)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSeverity('alert')}
                  className={cn(
                    'py-1.5 px-2 rounded text-xs font-black uppercase flex items-center justify-center gap-1 cursor-pointer transition-colors',
                    severity === 'alert'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Alert (!)</span>
                </button>
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                Status
              </label>
              <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-slate-300">
                <button
                  type="button"
                  onClick={() => setEnabled(true)}
                  className={cn(
                    'py-1.5 px-2 rounded text-xs font-black uppercase cursor-pointer transition-colors',
                    enabled
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-100'
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setEnabled(false)}
                  className={cn(
                    'py-1.5 px-2 rounded text-xs font-black uppercase cursor-pointer transition-colors',
                    !enabled
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-100'
                  )}
                >
                  Archived
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Recipient & Delivery Target, Clearing Behavior, Gate-Style Date Window, & Active Shows Picker */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
            {/* Delivery Switch + Only Show Once */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              <div className="md:col-span-5 space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Recipient &amp; Delivery Target
                </label>
                <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('app_startup')}
                    className={cn(
                      'py-1.5 px-2 rounded text-xs font-black uppercase cursor-pointer transition-colors',
                      deliveryMode === 'app_startup'
                        ? 'bg-teal-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    AMP Launch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMode('shows');
                      if (selectedActiveShowIds.length === 0 && activeShows.length > 0) {
                        setTargetShowIds(activeShows.map((sh) => sh.id));
                      }
                    }}
                    className={cn(
                      'py-1.5 px-2 rounded text-xs font-black uppercase cursor-pointer transition-colors',
                      deliveryMode === 'shows'
                        ? 'bg-teal-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    Shows
                  </button>
                </div>
              </div>

              <div className="md:col-span-7 space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Clearing Behavior
                </label>
                <label className="flex items-start gap-2.5 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer select-none hover:bg-slate-100/70">
                  <input
                    type="checkbox"
                    checked={onlyShowOnce}
                    onChange={(e) => setOnlyShowOnce(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-black text-slate-800 block leading-tight">
                      Only show once
                    </span>
                    <span className="text-xs font-medium text-slate-500 block leading-snug mt-0.5">
                      {onlyShowOnce
                        ? deliveryMode === 'app_startup'
                          ? 'Once logged on this machine, do not show on future AMP launches.'
                          : 'Once logged for a Show, do not show on future occurrences.'
                        : deliveryMode === 'app_startup'
                          ? 'Unchecked: shows on every AMP launch within the date window.'
                          : 'Unchecked: shows on every scheduled instance on the calendar.'}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Gate-Style Start & End Date + Time Controls (Always Shown for Both AMP Launch and Shows) */}
            <div className="pt-2.5 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <label
                    className={cn(
                      'text-xs font-black uppercase tracking-wider w-11 shrink-0 select-none',
                      hasInvertedDateRange ? 'text-red-700' : 'text-blue-950'
                    )}
                    title="Effective Start"
                  >
                    Start
                  </label>
                  <div className="flex items-center gap-px">
                    <CalendarDateInput
                      inputDataKey="admin-msg-start"
                      role="start"
                      pairedDate={endDatePart}
                      currentTime={startTimePart || '00:00'}
                      pairedTime={endTimePart || '23:59'}
                      gateRanges={messageGateRanges}
                      value={startDatePart}
                      onChange={(d) => {
                        const t = startTimePart || '00:00';
                        setStartDate(d ? `${d}T${t}` : '');
                      }}
                      className={cn(
                        'w-[104px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                        hasInvertedDateRange
                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                          : 'border-blue-300 bg-white text-slate-800'
                      )}
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={startTimePart}
                        onChange={(t) => {
                          let d = startDatePart;
                          if (!d && t) {
                            d = getCurrentDatetimeLocal().split('T')[0];
                          }
                          setStartDate(d ? `${d}T${t || '00:00'}` : '');
                        }}
                        className={cn(
                          'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                          hasInvertedDateRange
                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                            : 'border-blue-300 bg-white text-slate-800'
                        )}
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label
                    className={cn(
                      'text-xs font-black uppercase tracking-wider w-11 shrink-0 select-none',
                      hasInvertedDateRange ? 'text-red-700' : 'text-blue-950'
                    )}
                    title="Expiration Date"
                  >
                    End
                  </label>
                  <div className="flex items-center gap-px">
                    <CalendarDateInput
                      inputDataKey="admin-msg-end"
                      role="end"
                      pairedDate={startDatePart}
                      currentTime={endTimePart || '23:59'}
                      pairedTime={startTimePart || '00:00'}
                      gateRanges={messageGateRanges}
                      value={endDatePart}
                      onChange={(d) => {
                        if (!d) {
                          setEndDate('');
                          return;
                        }
                        const t = endTimePart || '23:59';
                        setEndDate(`${d}T${t}`);
                      }}
                      className={cn(
                        'w-[104px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                        hasInvertedDateRange
                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                          : 'border-blue-300 bg-white text-slate-800'
                      )}
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={endTimePart}
                        onChange={(t) => {
                          let d = endDatePart;
                          if (!d && t) {
                            d = startDatePart || getCurrentDatetimeLocal().split('T')[0];
                          }
                          setEndDate(d ? `${d}T${t || '23:59'}` : '');
                        }}
                        className={cn(
                          'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                          hasInvertedDateRange
                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                            : 'border-blue-300 bg-white text-slate-800'
                        )}
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Shows Picker (Shows Mode Only, All Active Shows Preselected) */}
            {deliveryMode === 'shows' && (
              <div className="space-y-2 pt-2.5 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    Active Shows ({selectedActiveShowIds.length} of {activeShows.length} selected)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTargetShowIds(activeShows.map((s) => s.id))}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-bold cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetShowIds([])}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={showPickerSearch}
                    onChange={(e) => setShowPickerSearch(e.target.value)}
                    placeholder="Filter active shows..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50/50 custom-scrollbar">
                  {filteredShowsForPicker.length === 0 ? (
                    <div className="px-3 py-3 text-xs italic text-slate-400 text-center">
                      {activeShows.length === 0
                        ? 'No active shows found.'
                        : 'No active shows match your filter.'}
                    </div>
                  ) : (
                    filteredShowsForPicker.map((sh) => {
                      const checked = selectedActiveShowIds.includes(sh.id);
                      return (
                        <label
                          key={sh.id}
                          className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-white cursor-pointer text-xs select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTargetShowIds((prev) => Array.from(new Set([...prev, sh.id])));
                              } else {
                                setTargetShowIds((prev) => prev.filter((id) => id !== sh.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <span className="font-bold text-slate-800 truncate">{sh.name}</span>
                          {sh.host && <span className="text-slate-500 truncate">({sh.host})</span>}
                          <span className="ml-auto text-xs text-slate-400 font-semibold shrink-0">
                            {sh.day.slice(0, 3)}{' '}
                            {formatTime12(
                              `${String(sh.startHour).padStart(2, '0')}:${String(sh.startMinute || 0).padStart(2, '0')}`
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Formatting Toolbar & Edit Text Box (Modelled on CopyEditorModal) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichCommand('bold')}
                  className="px-2 py-1 bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Bold — Cmd/Ctrl+B"
                >
                  <Bold className="w-3.5 h-3.5" />
                  <span>Bold</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichCommand('italic')}
                  className="px-2 py-1 bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Italic — Cmd/Ctrl+I"
                >
                  <Italic className="w-3.5 h-3.5" />
                  <span className="italic">Italic</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRichCommand('underline')}
                  className="px-2 py-1 bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Underline — Cmd/Ctrl+U"
                >
                  <Underline className="w-3.5 h-3.5" />
                  <span className="underline">Underline</span>
                </button>
                <div className="w-px h-4 bg-slate-300 mx-0.5" />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleInsertPronunciation}
                  className="px-2 py-1 bg-white hover:bg-teal-50 text-slate-800 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Insert bold+italic pronunciation block"
                >
                  <Speech className="w-3.5 h-3.5" />
                  <span>Pronunciation</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewBodySnapshot(readCurrentMarkdown());
                  setShowPreviewModal(true);
                }}
                className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Test Pop-up</span>
              </button>
            </div>

            <div className="flex flex-col border border-slate-300 rounded-lg bg-white overflow-hidden focus-within:ring-2 focus-within:ring-teal-500">
              <div
                className={cn(
                  'px-3 py-1.5 border-b border-slate-200 flex items-center justify-between',
                  isAlert ? 'bg-amber-50' : 'bg-teal-50'
                )}
              >
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Edit Message Text (Off-Air)
                </span>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
                style={{
                  minHeight: '190px',
                  maxHeight: '300px',
                  fontSize: `${getDefaultLiveReadFontSize()}px`,
                  fontFamily: getLiveReadFontFamilyCss(getDefaultLiveReadFontFamily()),
                }}
                data-placeholder="Write off-air instructions or notices for the Show here..."
                className="w-full p-4 overflow-y-auto leading-relaxed text-slate-800 bg-white outline-none whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:italic empty:before:text-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-white border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={cn(
              'px-4 py-2 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50',
              isAlert ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-700 hover:bg-teal-800'
            )}
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{isSaving ? 'Saving...' : isNew ? 'Save Message' : 'Save Changes'}</span>
          </button>
        </div>
      </form>

      {/* Live Preview Pop-up */}
      <AdminMessageReaderModal
        isOpen={showPreviewModal}
        message={showPreviewModal ? { ...buildDraftMessage(), body: previewBodySnapshot } : null}
        show={previewTargetShow}
        isPreview={true}
        onClose={() => setShowPreviewModal(false)}
      />

      {/* Non-Private Targeted Message Disclaimer (Before & After Editing) */}
      {privacyDisclaimerMode && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border-2 border-amber-500 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-2.5 bg-amber-600 text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                Visibility Reminder
              </span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm font-bold text-slate-900 leading-relaxed">
                Reminder, this is NOT a private message. Anyone can find and read this message.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleConfirmPrivacyDisclaimer}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-xs disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
