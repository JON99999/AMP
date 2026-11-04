import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Download,
  X,
  CheckCircle,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { Announcement, Show, TimeGatedMp3 } from '../types';
import { cn } from '../lib/utils';

export interface PrerecordExportBreakItem {
  slot: Date;
  announcement: Announcement;
  activeMp3?: TimeGatedMp3;
  isScript: boolean;
  isUpNextPromo?: boolean;
  resolvedUrl: string;
  durationLabel: string;
  durationSeconds: number;
  scriptText?: string;
}

export interface PrerecordExportTrackEntry {
  kind: 'track' | 'break';
  title: string;
  durationSeconds: number;
  durationLabel: string;
  filename?: string;
  slot?: Date;
  breakItems?: PrerecordExportBreakItem[];
}

interface PrerecordExportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  show?: Show | null;
  timeframeStart: Date;
  timeframeEnd: Date;
  breakItems: PrerecordExportBreakItem[];
  playlistSequence?: PrerecordExportTrackEntry[];
  hasUnloggedBreaks: boolean;
  isExporting: boolean;
  isLoggingExports?: boolean;
  onExecuteExport: () => void;
  onMarkAllAsLogged: () => void;
}

export default function PrerecordExportPopup({
  isOpen,
  onClose,
  show,
  timeframeStart,
  timeframeEnd,
  breakItems,
  playlistSequence,
  hasUnloggedBreaks,
  isExporting,
  isLoggingExports = false,
  onExecuteExport,
  onMarkAllAsLogged,
}: PrerecordExportPopupProps) {
  const [previewMode, setPreviewMode] = useState<'plan' | 'playlist' | 'live_reads'>('plan');
  const [copiedMode, setCopiedMode] = useState<string | null>(null);

  const showTitle = show?.name || 'Prerecord Show';
  const subheaderLabel = `${showTitle} · ${format(timeframeStart, 'EEE, MMM dd')} (${format(timeframeStart, 'h:mm a')}–${format(timeframeEnd, 'h:mm a')})`;

  const planCopyText = useMemo(() => {
    const header = `${showTitle} — Broadcast Plan\n${format(timeframeStart, 'EEE, MMM dd, yyyy')} · ${format(timeframeStart, 'h:mm a')} – ${format(timeframeEnd, 'h:mm a')}\n${'-'.repeat(44)}`;
    if (playlistSequence && playlistSequence.length > 0) {
      const lines: string[] = [];
      let trackIdx = 1;
      for (const entry of playlistSequence) {
        if (entry.kind === 'track') {
          lines.push(`[TRACK ${String(trackIdx).padStart(2, '0')}] ${entry.title} (${entry.durationLabel})`);
          trackIdx += 1;
        } else if (entry.breakItems && entry.breakItems.length > 0) {
          for (const b of entry.breakItems) {
            const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
            lines.push(`${format(b.slot, 'h:mm a')} [${tag}] ${b.announcement.name} (${b.durationLabel})`);
          }
        }
      }
      return `${header}\n${lines.join('\n')}`;
    }

    if (breakItems.length === 0) {
      return `${header}\nNo scheduled announcements in this timeframe.`;
    }
    const lines = breakItems.map((b) => {
      const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
      return `${format(b.slot, 'h:mm a')} [${tag}] ${b.announcement.name} (${b.durationLabel})`;
    });
    return `${header}\n${lines.join('\n')}`;
  }, [showTitle, timeframeStart, timeframeEnd, breakItems, playlistSequence]);

  const m3uEntries = useMemo(() => {
    const entries: { extinfSeconds: number; extinfTitle: string; filename: string }[] = [];
    let index = 1;

    if (playlistSequence && playlistSequence.length > 0) {
      for (const entry of playlistSequence) {
        if (entry.kind === 'track' && entry.filename) {
          const cleanBase = entry.filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = entry.filename.match(/\.[^/.]+$/)?.[0] || '.mp3';
          entries.push({
            extinfSeconds: Math.max(0, Math.round(entry.durationSeconds || 0)),
            extinfTitle: entry.title,
            filename: `${String(index).padStart(2, '0')}_TRACK_${cleanBase}${ext}`,
          });
          index += 1;
        } else if (entry.kind === 'break' && entry.breakItems) {
          for (const b of entry.breakItems) {
            if (b.isScript) continue;
            const rawUrl = b.activeMp3?.mp3Url || b.resolvedUrl || b.announcement.name;
            const rawFilename = rawUrl.split(/[\\/]/).pop() || `${b.announcement.name}.mp3`;
            const ext = rawFilename.match(/\.[^/.]+$/)?.[0] || '.mp3';
            const safeName = b.announcement.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            entries.push({
              extinfSeconds: Math.max(0, Math.round(b.durationSeconds || 30)),
              extinfTitle: `${format(b.slot, 'h:mm a')} - ${b.announcement.name}`,
              filename: `${String(index).padStart(2, '0')}_${format(b.slot, 'HHmm')}_${safeName}${ext}`,
            });
            index += 1;
          }
        }
      }
      return entries;
    }

    const audioBreaks = breakItems.filter((b) => !b.isScript);
    for (const b of audioBreaks) {
      const rawUrl = b.activeMp3?.mp3Url || b.resolvedUrl || b.announcement.name;
      const rawFilename = rawUrl.split(/[\\/]/).pop() || `${b.announcement.name}.mp3`;
      const ext = rawFilename.match(/\.[^/.]+$/)?.[0] || '.mp3';
      const safeName = b.announcement.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      entries.push({
        extinfSeconds: Math.max(0, Math.round(b.durationSeconds || 30)),
        extinfTitle: `${format(b.slot, 'h:mm a')} - ${b.announcement.name}`,
        filename: `${String(index).padStart(2, '0')}_${format(b.slot, 'HHmm')}_${safeName}${ext}`,
      });
      index += 1;
    }
    return entries;
  }, [breakItems, playlistSequence]);

  const m3uCopyText = useMemo(() => {
    if (m3uEntries.length === 0) {
      return '#EXTM3U\n# No audio files scheduled in this timeframe.';
    }
    const blocks = m3uEntries.map(
      (e) => `#EXTINF:${e.extinfSeconds},${e.extinfTitle}\n${e.filename}`
    );
    return `#EXTM3U\n${blocks.join('\n')}`;
  }, [m3uEntries]);

  const liveReadItems = useMemo(() => {
    return breakItems.filter((b) => b.isScript);
  }, [breakItems]);

  const getLiveReadDisplayFilename = (b: PrerecordExportBreakItem): string => {
    const rawUrl = b.activeMp3?.mp3Url || '';
    if (b.isUpNextPromo || rawUrl.startsWith('__up_next_promo__:')) {
      const cleanShowName = b.announcement.name.replace(/^Up Next:\s*/i, '').trim() || 'Upcoming Show';
      return `Up Next - ${cleanShowName}.txt`;
    }
    return rawUrl || b.announcement.name;
  };

  const liveReadsCopyText = useMemo(() => {
    if (liveReadItems.length === 0) {
      return 'No live read scripts scheduled in this timeframe.';
    }
    return liveReadItems
      .map((b) => {
        const displayFile = getLiveReadDisplayFilename(b);
        const body = (b.scriptText || '').trim() || `(Open ${displayFile} to view script content)`;
        return `${format(b.slot, 'h:mm a')} · ${b.announcement.name}\n${body}`;
      })
      .join('\n\n---\n\n');
  }, [liveReadItems]);

  if (!isOpen) return null;

  const handleCopyActivePreview = async () => {
    const textToCopy =
      previewMode === 'plan'
        ? planCopyText
        : previewMode === 'playlist'
          ? m3uCopyText
          : liveReadsCopyText;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMode(previewMode);
      setTimeout(() => {
        setCopiedMode((prev) => (prev === previewMode ? null : prev));
      }, 1800);
    } catch (err) {
      console.error('Failed to copy preview text:', err);
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-[1px] flex flex-col p-1">
      <div className="w-full flex-1 min-h-0 bg-white border-2 border-slate-400 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-2 py-1.5 flex items-center justify-between gap-1 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Download className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-wider truncate">
              Export Show
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
            title="Close Export pop-up"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Show Subheader (No Counts) */}
        <div
          className="px-2 py-1 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 shrink-0 truncate"
          title={subheaderLabel}
        >
          {subheaderLabel}
        </div>

        {/* Stacked Action Buttons */}
        <div className="p-2 space-y-1.5 border-b border-slate-200 bg-slate-50 shrink-0">
          {/* 1. Export Files */}
          <button
            type="button"
            disabled={isExporting || (breakItems.length === 0 && (!playlistSequence || playlistSequence.length === 0))}
            onClick={onExecuteExport}
            className={cn(
              "w-full py-1.5 px-2 rounded border-b-[3px] font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 shadow-xs transition-colors",
              isExporting || (breakItems.length === 0 && (!playlistSequence || playlistSequence.length === 0))
                ? "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white border-blue-800 cursor-pointer"
            )}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                <span className="truncate">Exporting...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Export Files...</span>
              </>
            )}
          </button>

          {/* 2. Log Exports (Darker Blue Variant — No Count) */}
          <button
            type="button"
            disabled={isLoggingExports || !hasUnloggedBreaks || breakItems.length === 0}
            onClick={onMarkAllAsLogged}
            className={cn(
              "w-full py-1.5 px-2 rounded border-b-[3px] font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 shadow-xs transition-colors",
              !hasUnloggedBreaks && breakItems.length > 0
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default"
                : isLoggingExports || breakItems.length === 0
                  ? "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                  : "bg-blue-800 hover:bg-blue-700 text-white border-blue-950 cursor-pointer"
            )}
          >
            {isLoggingExports ? (
              <>
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                <span className="truncate">Logging...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {!hasUnloggedBreaks && breakItems.length > 0
                    ? 'All Breaks Logged'
                    : 'Log Exports'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Bottom Section: 3-Button Radio Selector (Plan / .m3u LIST / Live Reads) + Copy + Internal Scrollbar */}
        <div className="flex-1 min-h-0 flex flex-col bg-white">
          <div className="px-1 py-1 bg-slate-100 border-b border-slate-200 flex items-center justify-start gap-1 shrink-0">
            <div
              className="inline-flex items-stretch rounded border border-slate-300 bg-white overflow-hidden shrink-0"
              role="radiogroup"
              aria-label="Preview selector"
            >
              {(
                [
                  { id: 'plan', label: 'Plan' },
                  { id: 'playlist', label: '.m3u LIST' },
                  { id: 'live_reads', label: 'Live Reads' },
                ] as const
              ).map((opt, idx) => {
                const isSelected = previewMode === opt.id;
                return (
                  <React.Fragment key={opt.id}>
                    {idx > 0 && (
                      <span
                        className="w-px self-stretch bg-slate-300 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setPreviewMode(opt.id)}
                      className={cn(
                        "px-1.5 py-1 text-[10px] font-black tracking-tighter leading-none whitespace-nowrap cursor-pointer transition-colors",
                        opt.id !== 'playlist' && "uppercase",
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {opt.label}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Single "Copy" Button */}
            <button
              type="button"
              onClick={handleCopyActivePreview}
              className="px-1.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-tighter leading-none flex items-center gap-0.5 cursor-pointer shrink-0 shadow-2xs"
              title={`Copy ${previewMode === 'plan' ? 'Plan' : previewMode === 'playlist' ? '.m3u LIST' : 'Live Reads'}`}
            >
              {copiedMode === previewMode ? (
                <>
                  <Check className="w-2.5 h-2.5 shrink-0" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-2.5 h-2.5 shrink-0" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Internal Scrollable Preview Body */}
          <div className="p-1.5 overflow-y-auto flex-1 min-h-0 text-left">
            {previewMode === 'plan' && (
              <div className="space-y-1 font-mono text-[10px] text-slate-700 leading-snug">
                <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-sans">
                  <div className="font-black text-slate-900 text-[10px] uppercase">
                    {showTitle} — Broadcast Plan
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {format(timeframeStart, 'EEE, MMM dd, yyyy')} · {format(timeframeStart, 'h:mm a')} – {format(timeframeEnd, 'h:mm a')}
                  </div>
                </div>
                <div className="p-1.5 rounded bg-slate-50 border border-slate-200 space-y-1">
                  {playlistSequence && playlistSequence.length > 0 ? (
                    (() => {
                      let trackNum = 1;
                      return playlistSequence.map((entry, idx) => {
                        if (entry.kind === 'track') {
                          const num = trackNum++;
                          return (
                            <div key={`plan-trk-${idx}`}>
                              <span className="font-bold text-purple-700">[TRACK {String(num).padStart(2, '0')}]</span>{' '}
                              {entry.title} ({entry.durationLabel})
                            </div>
                          );
                        }
                        return (entry.breakItems || []).map((b, bIdx) => {
                          const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
                          return (
                            <div key={`plan-brk-${idx}-${bIdx}`}>
                              <span className="font-bold text-slate-900">{format(b.slot, 'h:mm a')}</span> [{tag}] {b.announcement.name} ({b.durationLabel})
                            </div>
                          );
                        });
                      });
                    })()
                  ) : breakItems.length === 0 ? (
                    <div className="text-slate-400 italic font-sans">
                      No scheduled announcements in this timeframe.
                    </div>
                  ) : (
                    breakItems.map((b, idx) => {
                      const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
                      return (
                        <div key={`plan-item-${idx}`}>
                          <span className="font-bold text-slate-900">{format(b.slot, 'h:mm a')}</span> [{tag}] {b.announcement.name} ({b.durationLabel})
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {previewMode === 'playlist' && (
              <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700 space-y-1.5 leading-snug">
                <div className="font-bold text-slate-500">#EXTM3U</div>
                {m3uEntries.length === 0 ? (
                  <div className="text-slate-400 italic font-sans">
                    No audio files scheduled in this timeframe.
                  </div>
                ) : (
                  m3uEntries.map((entry, idx) => (
                    <div key={`m3u-entry-${idx}`}>
                      <div className="text-slate-500">
                        #EXTINF:{entry.extinfSeconds},{entry.extinfTitle}
                      </div>
                      <div className="font-bold text-slate-900 break-all">
                        {entry.filename}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {previewMode === 'live_reads' && (
              <div className="space-y-1.5">
                {liveReadItems.length === 0 ? (
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-400 italic">
                    No live read scripts scheduled in this timeframe.
                  </div>
                ) : (
                  liveReadItems.map((b, idx) => (
                    <div
                      key={`lr-preview-${idx}`}
                      className={cn(
                        "p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 space-y-0.5",
                        b.isUpNextPromo ? "border-l-teal-500" : "border-l-blue-500"
                      )}
                    >
                      <div className="text-[10px] font-black text-slate-800 truncate">
                        {format(b.slot, 'h:mm a')} · {b.announcement.name}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug whitespace-pre-wrap break-words">
                        {(b.scriptText || '').trim() ||
                          `Script file: ${getLiveReadDisplayFilename(b)}`}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
