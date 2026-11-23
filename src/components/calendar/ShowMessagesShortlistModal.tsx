import React, { useState, useMemo } from 'react';
import {
  X,
  Speech,
  Plus,
  Eye,
  Edit3,
  Copy,
  Archive,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { AdminMessage, Show } from '../../types';
import { cn, formatDatetime12 } from '../../lib/utils';
import {
  getShowMessagesShortlist,
  getAdminMessageTargetSummary,
  isAdminMessageExpired,
} from '../../lib/adminMessages';
import { stripFormattingMarkers } from '../../lib/liveReadTextUtils';
import { toStationDateParts, getStationTimezone } from '../../lib/compatibility';

export interface ShowMessagesShortlistModalProps {
  isOpen: boolean;
  show: Show | null;
  messages: AdminMessage[];
  shows: Show[];
  now: Date;
  onClose: () => void;
  onCreateMessageForShow: (show: Show) => void;
  onPreviewMessage: (msg: AdminMessage, show: Show) => void;
  onEditMessage: (msg: AdminMessage) => void;
  onReuseMessage: (msg: AdminMessage) => void;
  onArchiveMessage: (msg: AdminMessage) => void;
  onRestoreMessage: (msg: AdminMessage) => void;
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

export function ShowMessagesShortlistModal({
  isOpen,
  show,
  messages,
  shows,
  now,
  onClose,
  onCreateMessageForShow,
  onPreviewMessage,
  onEditMessage,
  onReuseMessage,
  onArchiveMessage,
  onRestoreMessage,
}: ShowMessagesShortlistModalProps) {
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Record<string, boolean>>({});
  const [showHistorical, setShowHistorical] = useState<boolean>(true);

  const shortlist = useMemo(
    () => getShowMessagesShortlist(messages, show, now),
    [messages, show, now]
  );

  if (!isOpen || !show) return null;

  const toggleDetails = (id: string) => {
    setExpandedDetailsIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderRow = (msg: AdminMessage, isHistorical: boolean) => {
    const isAlert = msg.severity === 'alert';
    const isExpired = isAdminMessageExpired(msg, now);
    const isExpanded = Boolean(expandedDetailsIds[msg.id]);
    const plainBody = stripFormattingMarkers(msg.body || '').trim();
    const targetSummary = getAdminMessageTargetSummary(msg, shows);
    const showAcks = (msg.acknowledgedByShows || []).filter((r) => r.showId === show.id);

    return (
      <div
        key={msg.id}
        className={cn(
          'p-3 border-l-4 transition-colors',
          isHistorical
            ? 'bg-slate-50/80 border-l-slate-300 opacity-90'
            : isAlert
              ? 'bg-amber-50/25 border-l-amber-500'
              : 'bg-teal-50/20 border-l-teal-600'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className={cn(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black shrink-0',
                isHistorical
                  ? 'bg-slate-400 text-white'
                  : isAlert
                    ? 'bg-amber-600 text-white'
                    : 'bg-teal-700 text-white'
              )}
            >
              {isAlert ? '!' : 'i'}
            </span>
            <span className="text-sm font-black text-slate-900 truncate">{msg.title}</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-black uppercase border shrink-0',
                !isHistorical
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isExpired && !msg.archived
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
              )}
            >
              {!isHistorical ? 'Active' : isExpired && !msg.archived ? 'Expired' : 'Archived'}
            </span>
            {showAcks.length > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase shrink-0">
                <CheckCircle2 className="w-3 h-3" />
                <span>Read ({showAcks.length})</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleDetails(msg.id)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 text-xs font-black uppercase cursor-pointer"
              title="Show or hide message details"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 shrink-0" />
              )}
              <span>Details</span>
            </button>
            <button
              type="button"
              onClick={() => onPreviewMessage(msg, show)}
              className="px-2 py-0.5 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Preview message pop-up"
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
            {!isHistorical && (
              <button
                type="button"
                onClick={() => onEditMessage(msg)}
                className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Edit message"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onReuseMessage(msg)}
              className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Reuse as a new active draft"
            >
              <Copy className="w-3 h-3" />
              <span>Reuse</span>
            </button>
            {!isHistorical ? (
              <button
                type="button"
                onClick={() => onArchiveMessage(msg)}
                className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Archive message"
              >
                <Archive className="w-3 h-3" />
                <span>Archive</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRestoreMessage(msg)}
                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Restore message"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore</span>
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-2 text-xs text-slate-600">
            {plainBody && (
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-2 rounded border border-slate-200">
                {plainBody}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-semibold">
              <span>Target: {targetSummary}</span>
              {(msg.startDate || msg.endDate) && (
                <span>
                  Window: {msg.startDate ? formatDatetime12(msg.startDate) : 'Now'} &rarr;{' '}
                  {msg.endDate ? formatDatetime12(msg.endDate) : 'Ongoing'}
                </span>
              )}
              <span>
                Display:{' '}
                {msg.clearMode === 'date_range' ? 'Every Calendar Instance' : 'Only Show Once'}
              </span>
              <span>Updated: {formatDateTimeShort(msg.updatedAt)}</span>
            </div>
            {showAcks.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-700 block">
                  Read History for {show.name}:
                </span>
                {showAcks.map((rec, idx) => (
                  <div
                    key={`${rec.acknowledgedAt}-${idx}`}
                    className="flex flex-wrap items-center gap-2 text-xs bg-white px-2 py-1 rounded border border-slate-200"
                  >
                    <span className="font-bold text-slate-800">
                      {formatDateTimeShort(rec.acknowledgedAt)}
                    </span>
                    {rec.personaName && (
                      <span className="text-slate-600">· {rec.personaName}</span>
                    )}
                    {rec.playMode && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                        {rec.playMode}
                      </span>
                    )}
                    {rec.appVersion && (
                      <span className="font-mono text-slate-500">v{rec.appVersion}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5 text-left"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-teal-700 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Speech className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-wider truncate">
                Messages for {show.name}
              </h2>
              <p className="text-xs text-white/85 truncate">
                {show.host ? `Host: ${show.host} · ` : ''}
                {shortlist.active.length} active · {shortlist.historical.length} historical
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onCreateMessageForShow(show)}
              className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add Message</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-black/20 text-white cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-5 custom-scrollbar">
          {/* Current / Active Messages */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px bg-emerald-300/60 flex-1" />
              <span className="text-xs font-black text-emerald-800 uppercase tracking-widest leading-none">
                Current / Active Messages ({shortlist.active.length})
              </span>
              <div className="h-px bg-emerald-300/60 flex-1" />
            </div>

            {shortlist.active.length === 0 ? (
              <div className="py-5 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  No active messages for this show
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-200 bg-white">
                {shortlist.active.map((msg) => renderRow(msg, false))}
              </div>
            )}
          </div>

          {/* Historical / Archived Messages */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-px bg-slate-300 flex-1" />
              <button
                type="button"
                onClick={() => setShowHistorical((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
              >
                {showHistorical ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                )}
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest leading-none">
                  Historical / Archived Messages ({shortlist.historical.length})
                </span>
              </button>
              <div className="h-px bg-slate-300 flex-1" />
            </div>

            {showHistorical &&
              (shortlist.historical.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center py-3">
                  No historical messages for this show
                </p>
              ) : (
                <div className="border border-slate-300 rounded-lg overflow-hidden divide-y divide-slate-200 bg-white">
                  {shortlist.historical.map((msg) => renderRow(msg, true))}
                </div>
              ))}
          </div>
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
