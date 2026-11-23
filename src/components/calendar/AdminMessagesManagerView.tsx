import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  FileText,
  Trash2,
  Eye,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Archive,
  Copy,
  Plus,
  ShieldCheck,
  Power,
  Monitor,
  MonitorPlay,
  Speech,
  User,
} from 'lucide-react';
import { AdminMessage, AdminMessageAckRecord, Show } from '../../types';
import { cn, formatDatetime12 } from '../../lib/utils';
import {
  getAdminMessageTargetSummary,
  getBuiltInSystemMessages,
  isSystemBuiltInMessage,
  isAdminMessageArchived,
  isAdminMessageExpired,
} from '../../lib/adminMessages';
import { getPcUseTypeLabel } from '../../lib/machinePersona';
import { stripFormattingMarkers } from '../../lib/liveReadTextUtils';
import {
  CURRENT_APP_VERSION,
  CompatibilityReport,
  toStationDateParts,
  getStationTimezone,
} from '../../lib/compatibility';

export interface AdminMessagesManagerViewProps {
  messages: AdminMessage[];
  shows: Show[];
  now: Date;
  compatibilityReport?: CompatibilityReport | null;
  filterQuery: string;
  listCardCollapseViewEditText?: boolean;
  listCardCollapseCopyText?: boolean;
  listCardCollapseDetailsText?: boolean;
  listCardCollapsePreviewText?: boolean;
  onCreateNewMessage?: () => void;
  onEditMessage: (msg: AdminMessage) => void;
  onReuseMessage: (msg: AdminMessage) => void;
  onPreviewMessage: (msg: AdminMessage) => void;
  onArchiveMessage: (msg: AdminMessage) => void;
  onRestoreMessage: (msg: AdminMessage) => void;
  onDeleteMessage: (msg: AdminMessage) => void;
  onToggleBuiltInSystemMessage: (systemMsgId: string, nextEnabled: boolean) => void;
  onResetAcknowledgements: (msg: AdminMessage) => void;
}

function formatDateTimeShort(iso?: string): string {
  if (!iso) return '—';
  const parts = toStationDateParts(iso, getStationTimezone());
  if (!parts) return iso;
  const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const ampm = parts.hour >= 12 ? 'PM' : 'AM';
  const min = String(parts.minute).padStart(2, '0');
  return `${parts.month}/${parts.day}/${parts.year} ${h12}:${min} ${ampm}`;
}

export function AdminMessagesManagerView({
  messages,
  shows,
  now,
  compatibilityReport,
  filterQuery,
  listCardCollapseViewEditText = false,
  listCardCollapseCopyText = false,
  listCardCollapseDetailsText = false,
  listCardCollapsePreviewText = false,
  onCreateNewMessage,
  onEditMessage,
  onReuseMessage,
  onPreviewMessage,
  onArchiveMessage,
  onRestoreMessage,
  onDeleteMessage,
  onToggleBuiltInSystemMessage,
  onResetAcknowledgements,
}: AdminMessagesManagerViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'shows' | 'startup'>('all');
  const [expandedDetailsById, setExpandedDetailsById] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isArchivedSectionOpen, setIsArchivedSectionOpen] = useState<boolean>(false);

  const toggleDetailsDrawer = (id: string) => {
    setExpandedDetailsById((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const builtInSystemMessages = useMemo(
    () => getBuiltInSystemMessages(messages, CURRENT_APP_VERSION, compatibilityReport),
    [messages, compatibilityReport]
  );

  const customMessages = useMemo(
    () => (messages || []).filter((m) => m && !isSystemBuiltInMessage(m)),
    [messages]
  );

  const matchesSearchAndCategory = (msg: AdminMessage): boolean => {
    if (categoryFilter === 'shows' && msg.targetScope === 'app_startup') return false;
    if (categoryFilter === 'startup' && msg.targetScope !== 'app_startup') return false;
    const q = (filterQuery || '').trim().toLowerCase();
    if (!q) return true;
    const targetSummary = getAdminMessageTargetSummary(msg, shows).toLowerCase();
    const plainBody = stripFormattingMarkers(msg.body || '').toLowerCase();
    return (
      msg.title.toLowerCase().includes(q) ||
      plainBody.includes(q) ||
      targetSummary.includes(q)
    );
  };

  const activeCustomMessages = useMemo(
    () =>
      customMessages
        .filter((msg) => !isAdminMessageArchived(msg, now) && matchesSearchAndCategory(msg))
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [customMessages, now, filterQuery, categoryFilter, shows]
  );

  const archivedCustomMessages = useMemo(
    () =>
      customMessages
        .filter((msg) => isAdminMessageArchived(msg, now) && matchesSearchAndCategory(msg))
        .sort((a, b) =>
          (b.archivedAt || b.updatedAt || '').localeCompare(a.archivedAt || a.updatedAt || '')
        ),
    [customMessages, now, filterQuery, categoryFilter, shows]
  );

  const allActiveCustomCount = customMessages.filter((m) => !isAdminMessageArchived(m, now)).length;
  const activeShowMsgCount = customMessages.filter(
    (m) => !isAdminMessageArchived(m, now) && m.targetScope !== 'app_startup'
  ).length;
  const activeStartupMsgCount = customMessages.filter(
    (m) => !isAdminMessageArchived(m, now) && m.targetScope === 'app_startup'
  ).length;

  const renderAckRecordsBlock = (
    msg: AdminMessage,
    ackList: AdminMessageAckRecord[],
    allowReset: boolean
  ) => {
    const isStartup = msg.targetScope === 'app_startup';
    return (
      <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              Acknowledged by {ackList.length}{' '}
              {isStartup
                ? ackList.length === 1
                  ? 'Computer'
                  : 'Computers'
                : ackList.length === 1
                  ? 'Show'
                  : 'Shows'}
            </span>
          </span>

          {allowReset && ackList.length > 0 && (
            <button
              type="button"
              onClick={() => onResetAcknowledgements(msg)}
              className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase flex items-center gap-1 cursor-pointer"
              title="Clear read status so recipients see this message as unread again"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Mark Unread Again</span>
            </button>
          )}
        </div>

        {ackList.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            {isStartup
              ? 'No computer has acknowledged this notice yet.'
              : 'No Show has acknowledged this message yet.'}
          </p>
        ) : (
          <div className="space-y-1">
            {ackList.map((rec, idx) => {
              const showObj = !isStartup ? shows.find((s) => s.id === rec.showId) : undefined;
              const useTypeLabel = getPcUseTypeLabel(rec.pcUseType);
              const primaryLabel = isStartup
                ? rec.personaName || useTypeLabel || rec.showName || rec.machineId || 'Unlabeled Computer'
                : rec.showName || showObj?.name || rec.showId;
              return (
                <div
                  key={`${rec.showId}-${rec.machineId || ''}-${rec.acknowledgedAt}-${idx}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 bg-white px-2.5 py-1.5 rounded border border-slate-200"
                >
                  <span className="font-bold text-slate-800">{primaryLabel}</span>
                  {!isStartup && showObj?.host && (
                    <span className="text-slate-500">({showObj.host})</span>
                  )}
                  {!isStartup && rec.personaName && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      {rec.personaType === 'personal' ? (
                        <User className="w-3 h-3 text-slate-400" />
                      ) : (
                        <Monitor className="w-3 h-3 text-slate-400" />
                      )}
                      <span>{rec.personaName}</span>
                    </span>
                  )}
                  {useTypeLabel && useTypeLabel !== primaryLabel && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                      {useTypeLabel}
                    </span>
                  )}
                  {rec.personaType && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold uppercase">
                      {rec.personaType === 'personal' ? 'Personal' : 'Shared'}
                    </span>
                  )}
                  <span className="text-slate-400">&middot;</span>
                  <span>{formatDateTimeShort(rec.acknowledgedAt)}</span>
                  {rec.playMode && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                      {rec.playMode}
                    </span>
                  )}
                  {(rec.appEdition || rec.platform) && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                      {[rec.appEdition, rec.platform].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {rec.appVersion && (
                    <span className="font-mono text-xs font-bold text-slate-500">
                      v{rec.appVersion}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderTypeIconGutter = (isStartup: boolean, isMuted: boolean, isAlert: boolean) => (
    <div
      className="shrink-0 flex flex-col items-center justify-center gap-0.5 p-1 bg-slate-50 border-r border-grid-active w-[64px] select-none"
      title={isStartup ? 'At Launch (AMP Startup Notice)' : 'On Show (Off-Air Show Message)'}
    >
      {isStartup ? (
        <MonitorPlay
          className={cn(
            'w-6 h-6 shrink-0',
            isMuted ? 'text-slate-400' : isAlert ? 'text-amber-600' : 'text-blue-600'
          )}
        />
      ) : (
        <Speech
          className={cn(
            'w-6 h-6 shrink-0',
            isMuted ? 'text-slate-400' : isAlert ? 'text-amber-600' : 'text-teal-700'
          )}
        />
      )}
      <span
        className={cn(
          'text-[10px] font-black uppercase tracking-tight leading-none text-center',
          isMuted ? 'text-slate-500' : 'text-slate-700'
        )}
      >
        {isStartup ? 'At Launch' : 'On Show'}
      </span>
    </div>
  );

  const renderEditSpacer = () => (
    <span
      aria-hidden="true"
      className={cn(
        'invisible pointer-events-none select-none flex items-center gap-1 py-0.5 border border-transparent rounded',
        listCardCollapseViewEditText ? 'px-1.5' : 'px-2'
      )}
    >
      <FileText className="w-2.5 h-2.5 shrink-0" />
      {!listCardCollapseViewEditText && (
        <span className="text-xs font-black uppercase">Edit</span>
      )}
    </span>
  );

  const renderReuseSpacer = () => (
    <span
      aria-hidden="true"
      className={cn(
        'invisible pointer-events-none select-none flex items-center gap-1 py-0.5 border border-transparent rounded',
        listCardCollapseCopyText ? 'px-1.5' : 'px-2'
      )}
    >
      <Copy className="w-2.5 h-2.5 shrink-0" />
      {!listCardCollapseCopyText && (
        <span className="text-xs font-black uppercase">Reuse</span>
      )}
    </span>
  );

  const renderCustomMessageCard = (msg: AdminMessage, isArchivedBucket: boolean) => {
    const isAlert = msg.severity === 'alert';
    const isStartup = msg.targetScope === 'app_startup';
    const isExpired = isAdminMessageExpired(msg, now);
    const targetSummary = getAdminMessageTargetSummary(msg, shows);
    const plainSnippet = stripFormattingMarkers(msg.body || '').trim();
    const ackList = Array.isArray(msg.acknowledgedByShows) ? msg.acknowledgedByShows : [];
    const isDetailsExpanded = Boolean(expandedDetailsById[msg.id]);

    const statusLabel = !isArchivedBucket
      ? 'Active'
      : isExpired && !msg.archived
        ? 'Expired'
        : 'Archived';

    return (
      <div
        key={msg.id}
        className={cn(
          'transition-colors border-l-4 flex items-stretch min-h-[64px]',
          isArchivedBucket
            ? 'bg-slate-50/70 border-l-slate-300 opacity-85'
            : isAlert
              ? 'bg-amber-50/15 border-l-amber-500'
              : 'bg-teal-50/10 border-l-teal-600'
        )}
      >
        {renderTypeIconGutter(isStartup, isArchivedBucket, isAlert)}

        <div className="flex-1 min-w-0 py-2 pr-3 pl-3.5 flex flex-col justify-between gap-1.5">
          {/* Row 1: Title (left) + Status/Target Summary (right) — Matches AnnouncementsListView */}
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2 basis-2/5 min-w-0">
              <span
                className={cn(
                  'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black shrink-0',
                  isArchivedBucket
                    ? 'bg-slate-400 text-white'
                    : isAlert
                      ? 'bg-amber-600 text-white'
                      : 'bg-teal-700 text-white'
                )}
                title={isAlert ? 'Alert (!)' : 'Info (i)'}
              >
                {isAlert ? '!' : 'i'}
              </span>
              <span
                className="text-base font-black text-slate-800 leading-tight line-clamp-2 min-w-0 break-words"
                title={msg.title}
              >
                {msg.title}
              </span>
            </div>

            <div className="text-xs font-bold uppercase tracking-tighter basis-3/5 min-w-0 text-right line-clamp-2 leading-tight">
              <span
                className={cn(
                  'font-black',
                  !isArchivedBucket ? 'text-emerald-700' : 'text-slate-500'
                )}
              >
                {statusLabel}
              </span>
              <span className="text-slate-400 mx-1">&bull;</span>
              <span className="text-slate-550 font-bold" title={targetSummary}>
                {targetSummary}
              </span>
            </div>
          </div>

          {/* Row 2: Action Controls (left, aligned across all card types) + Preview (right) */}
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              {!isArchivedBucket ? (
                <button
                  type="button"
                  onClick={() => onEditMessage(msg)}
                  className={cn(
                    'flex items-center gap-1 py-0.5 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm cursor-pointer',
                    listCardCollapseViewEditText ? 'px-1.5' : 'px-2'
                  )}
                  title="Edit Message"
                >
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                  {!listCardCollapseViewEditText && (
                    <span className="text-xs font-black uppercase">Edit</span>
                  )}
                </button>
              ) : (
                renderEditSpacer()
              )}

              <button
                type="button"
                onClick={() => onReuseMessage(msg)}
                className={cn(
                  'flex items-center gap-1 py-0.5 hover:bg-blue-50 bg-white border border-slate-350 rounded text-blue-700 transition-all shadow-sm cursor-pointer',
                  listCardCollapseCopyText ? 'px-1.5' : 'px-2'
                )}
                title="Reuse Message as New Draft"
              >
                <Copy className="w-2.5 h-2.5 shrink-0" />
                {!listCardCollapseCopyText && (
                  <span className="text-xs font-black uppercase">Reuse</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleDetailsDrawer(msg.id)}
                className={cn(
                  'flex items-center gap-0.5 py-0.5 hover:bg-slate-100 bg-white border border-slate-350 rounded text-slate-600 transition-all shadow-sm cursor-pointer',
                  listCardCollapseDetailsText ? 'px-1' : 'px-1.5'
                )}
                title="Show or hide message text, date window, and acknowledgements"
              >
                {isDetailsExpanded ? (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                )}
                {!listCardCollapseDetailsText && (
                  <span className="text-xs font-black uppercase">Details</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleDetailsDrawer(msg.id)}
                className={cn(
                  'text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 select-none text-center cursor-pointer transition-colors',
                  listCardCollapseDetailsText ? 'min-w-[26px]' : 'min-w-[62px]'
                )}
                title="Click to show or hide acknowledgements and message details"
              >
                {!listCardCollapseDetailsText ? `Read (${ackList.length})` : `${ackList.length}`}
              </button>

              {!isArchivedBucket ? (
                <button
                  type="button"
                  onClick={() => {
                    onArchiveMessage(msg);
                    setIsArchivedSectionOpen(true);
                  }}
                  className={cn(
                    'flex items-center gap-1 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded text-amber-800 transition-all shadow-sm cursor-pointer',
                    listCardCollapseDetailsText ? 'px-1.5' : 'px-2'
                  )}
                  title="Archive Message (preserves acknowledgement history)"
                >
                  <Archive className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                  {!listCardCollapseDetailsText && (
                    <span className="text-xs font-black uppercase">Archive</span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onRestoreMessage(msg)}
                  className={cn(
                    'flex items-center gap-1 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded text-emerald-800 transition-all shadow-sm cursor-pointer',
                    listCardCollapseDetailsText ? 'px-1.5' : 'px-2'
                  )}
                  title={
                    isExpired
                      ? 'Open editor to update end date and reactivate'
                      : 'Restore Message to Active Messages'
                  }
                >
                  <RotateCcw className="w-2.5 h-2.5 text-emerald-700 shrink-0" />
                  {!listCardCollapseDetailsText && (
                    <span className="text-xs font-black uppercase">Restore</span>
                  )}
                </button>
              )}

              {(isArchivedBucket || ackList.length === 0) &&
                (confirmDeleteId === msg.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDeleteMessage(msg);
                      }}
                      className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-black uppercase cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-black uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(msg.id)}
                    className={cn(
                      'flex items-center gap-1 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded transition-all shadow-sm cursor-pointer',
                      listCardCollapseDetailsText ? 'px-1.5' : 'px-2'
                    )}
                    title="Delete Message Permanently"
                  >
                    <Trash2 className="w-2.5 h-2.5 shrink-0" />
                    {!listCardCollapseDetailsText && (
                      <span className="text-xs font-black uppercase">Delete</span>
                    )}
                  </button>
                ))}
            </div>

            {/* Right-aligned Preview Button (Matches AnnouncementsListView) */}
            <button
              type="button"
              onClick={() => onPreviewMessage(msg)}
              className={cn(
                'flex items-center gap-1 py-0.5 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded transition-all shadow-sm cursor-pointer shrink-0',
                listCardCollapsePreviewText ? 'px-1.5' : 'px-2'
              )}
              title="Preview message pop-up"
            >
              <Eye className="w-2.5 h-2.5 shrink-0" />
              {!listCardCollapsePreviewText && (
                <span className="text-xs font-black uppercase">Preview</span>
              )}
            </button>
          </div>

          {/* Collapsible Details Drawer (Everything Below Main Card Rows) */}
          {isDetailsExpanded && (
            <div className="mt-1.5 pt-2.5 border-t border-slate-200/80 space-y-2.5">
              {plainSnippet && (
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-white px-2.5 py-2 rounded border border-slate-200">
                  {plainSnippet}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-semibold">
                {(msg.startDate || msg.endDate) && (
                  <span>
                    Window: {msg.startDate ? formatDatetime12(msg.startDate) : 'Now'} &rarr;{' '}
                    {msg.endDate ? formatDatetime12(msg.endDate) : 'Ongoing'}
                  </span>
                )}
                <span>
                  Display:{' '}
                  {msg.clearMode === 'date_range'
                    ? msg.targetScope === 'app_startup'
                      ? 'Every AMP Launch'
                      : 'Every Calendar Instance'
                    : 'Only Show Once'}
                </span>
                <span>Updated: {formatDateTimeShort(msg.updatedAt)}</span>
              </div>

              {renderAckRecordsBlock(msg, ackList, !isArchivedBucket)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 overflow-y-auto flex-1 pb-4 pr-1.5 custom-scrollbar min-h-0">
      {/* Pinned Top Section: Built-In Auto-Triggered Version & Schema Notices */}
      <div className="space-y-2 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-px bg-slate-300 flex-1" />
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase tracking-widest leading-none">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Built-In System Notices (Auto-Triggered on AMP Launch)</span>
          </span>
          <div className="h-px bg-slate-300 flex-1" />
        </div>

        <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-sm">
          {builtInSystemMessages.map((item) => {
            const isAlert = item.message.severity === 'alert';
            const plainSnippet = stripFormattingMarkers(item.message.body || '').trim();
            const ackList = Array.isArray(item.message.acknowledgedByShows)
              ? item.message.acknowledgedByShows
              : [];
            const isDetailsExpanded = Boolean(expandedDetailsById[item.id]);

            return (
              <div
                key={item.id}
                className={cn(
                  'transition-colors border-l-4 flex items-stretch min-h-[64px]',
                  !item.enabled
                    ? 'bg-slate-50/70 border-l-slate-300 opacity-75'
                    : isAlert
                      ? 'bg-amber-50/20 border-l-amber-500'
                      : 'bg-teal-50/15 border-l-teal-600'
                )}
              >
                {renderTypeIconGutter(true, !item.enabled, isAlert)}

                <div className="flex-1 min-w-0 py-2 pr-3 pl-3.5 flex flex-col justify-between gap-1.5">
                  {/* Row 1: Title (left) + Built-In Status Summary (right) */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 basis-3/5 min-w-0">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black shrink-0',
                          !item.enabled
                            ? 'bg-slate-400 text-white'
                            : isAlert
                              ? 'bg-amber-600 text-white'
                              : 'bg-teal-700 text-white'
                        )}
                        title={isAlert ? 'Alert (!)' : 'Info (i)'}
                      >
                        {isAlert ? '!' : 'i'}
                      </span>
                      <span
                        className="text-base font-black text-slate-800 leading-tight line-clamp-2 min-w-0 break-words"
                        title={item.message.title}
                      >
                        {item.message.title}
                      </span>
                    </div>

                    <div className="text-xs font-bold uppercase tracking-tighter basis-2/5 min-w-0 text-right line-clamp-2 leading-tight">
                      <span className="font-black text-blue-700">Built-In</span>
                      <span className="text-slate-400 mx-1">&bull;</span>
                      <span
                        className={cn(
                          'font-bold',
                          item.enabled ? 'text-emerald-700' : 'text-slate-500'
                        )}
                      >
                        {item.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Invisible Edit/Reuse Spacers + Details, Read Count, Enable/Disable (left) + Preview (right) */}
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                      {renderEditSpacer()}
                      {renderReuseSpacer()}

                      <button
                        type="button"
                        onClick={() => toggleDetailsDrawer(item.id)}
                        className={cn(
                          'flex items-center gap-0.5 py-0.5 hover:bg-slate-100 bg-white border border-slate-350 rounded text-slate-600 transition-all shadow-sm cursor-pointer',
                          listCardCollapseDetailsText ? 'px-1' : 'px-1.5'
                        )}
                        title="Show or hide built-in notice text, trigger rule, and acknowledgements"
                      >
                        {isDetailsExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        {!listCardCollapseDetailsText && (
                          <span className="text-xs font-black uppercase">Details</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDetailsDrawer(item.id)}
                        className={cn(
                          'text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 select-none text-center cursor-pointer transition-colors',
                          listCardCollapseDetailsText ? 'min-w-[26px]' : 'min-w-[62px]'
                        )}
                        title="Click to show or hide acknowledgements and built-in notice details"
                      >
                        {!listCardCollapseDetailsText
                          ? `Read (${ackList.length})`
                          : `${ackList.length}`}
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleBuiltInSystemMessage(item.id, !item.enabled)}
                        className={cn(
                          'flex items-center gap-1 py-0.5 rounded text-xs font-black uppercase border transition-all shadow-sm cursor-pointer',
                          listCardCollapseDetailsText ? 'px-1.5' : 'px-2',
                          item.enabled
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                        )}
                        title={
                          item.enabled
                            ? 'Disable this built-in notice'
                            : 'Enable this built-in notice'
                        }
                      >
                        <Power className="w-2.5 h-2.5 shrink-0" />
                        {!listCardCollapseDetailsText && (
                          <span>{item.enabled ? 'Disable' : 'Enable'}</span>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onPreviewMessage(item.message)}
                      className={cn(
                        'flex items-center gap-1 py-0.5 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded transition-all shadow-sm cursor-pointer shrink-0',
                        listCardCollapsePreviewText ? 'px-1.5' : 'px-2'
                      )}
                      title="Preview built-in notice pop-up"
                    >
                      <Eye className="w-2.5 h-2.5 shrink-0" />
                      {!listCardCollapsePreviewText && (
                        <span className="text-xs font-black uppercase">Preview</span>
                      )}
                    </button>
                  </div>

                  {/* Collapsible Details Drawer (Descriptive Text, Trigger Info, & Acknowledgements) */}
                  {isDetailsExpanded && (
                    <div className="mt-1.5 pt-2.5 border-t border-slate-200/80 space-y-2.5">
                      <p className="text-xs text-slate-700 font-semibold whitespace-pre-wrap leading-relaxed bg-white px-2.5 py-2 rounded border border-slate-200">
                        {plainSnippet}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                        <span>{item.triggerDescription}</span>
                        <span className="font-mono font-bold text-slate-700">
                          {item.currentSchemaNote}
                        </span>
                      </div>
                      {renderAckRecordsBlock(item.message, ackList, item.enabled)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Custom Messages Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-px bg-emerald-300/60 flex-1" />
          <span className="text-xs font-black text-emerald-800 uppercase tracking-widest leading-none">
            Active Messages ({activeCustomMessages.length})
          </span>
          <div className="h-px bg-emerald-300/60 flex-1" />
        </div>

        {/* Compact Right-Aligned Filter Strip (Matches Announcements Inactive Sort Controls) */}
        <div className="flex items-center justify-end gap-1.5">
          {(
            [
              { id: 'all', label: `All (${allActiveCustomCount})` },
              { id: 'shows', label: `Shows (${activeShowMsgCount})` },
              { id: 'startup', label: `AMP Launch (${activeStartupMsgCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider border cursor-pointer transition-colors',
                categoryFilter === tab.id
                  ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeCustomMessages.length === 0 ? (
          <div className="py-8 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-350">
            <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-450 uppercase tracking-widest leading-none">
              {filterQuery ? 'No active messages match your filter' : 'No active messages'}
            </p>
          </div>
        ) : (
          <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-sm">
            {activeCustomMessages.map((msg) => renderCustomMessageCard(msg, false))}
          </div>
        )}

        {/* Lower "+ ADD MESSAGE" Bar (Matches AnnouncementsListView) */}
        {onCreateNewMessage && (
          <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-100/70">
            <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-slate-200/60">
              <button
                type="button"
                onClick={onCreateNewMessage}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs select-none"
                title="Add a new message"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>ADD MESSAGE</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Archived / Expired Messages Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-px bg-slate-300 flex-1 min-w-[24px]" />
          <button
            type="button"
            onClick={() => setIsArchivedSectionOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-200/70 transition-colors cursor-pointer select-none"
            title={isArchivedSectionOpen ? 'Collapse Archived Messages' : 'Expand Archived Messages'}
          >
            {isArchivedSectionOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            )}
            <span className="text-xs font-black text-slate-600 uppercase tracking-widest leading-none">
              Archived Messages ({archivedCustomMessages.length})
            </span>
          </button>
          <div className="h-px bg-slate-300 flex-1 min-w-[24px]" />
        </div>

        {isArchivedSectionOpen &&
          (archivedCustomMessages.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                No archived messages
              </p>
            </div>
          ) : (
            <div className="border border-slate-350 rounded-lg overflow-hidden divide-y divide-slate-250 bg-white shadow-sm">
              {archivedCustomMessages.map((msg) => renderCustomMessageCard(msg, true))}
            </div>
          ))}
      </div>
    </div>
  );
}
