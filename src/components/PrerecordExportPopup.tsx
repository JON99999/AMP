import React, { useState, useMemo, useEffect } from 'react';
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
import { getStorageApiHeaders } from '../lib/driveService';
import {
  stripFormattingMarkers,
  renderFormattedTxtContent,
  markdownTxtToRichClipboardHtml,
} from '../lib/liveReadFormatting';

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

export interface PrerecordExportSequenceItem {
  index: number;
  paddedIdx: string;
  slotTime: string;
  slotTimeAmPm: string;
  fileName: string;
  rawMp3Url?: string;
  announcementName: string;
  announcementId: string;
  minute: number;
  exists: boolean;
  targetFileName: string;
  slotISO: string;
  assetType?: 'audio' | 'script';
  isUpNextPromo?: boolean;
  upNextScriptText?: string;
  scriptText?: string;
  approximateReadTime?: string;
  durationSeconds?: number;
  durationLabel?: string;
  backupMp3Url?: string;
  backupMp3Exists?: boolean;
  backupTargetFileName?: string;
  isEvergreen?: boolean;
  showNameShort?: string;
  showName?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
}

interface PrerecordExportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  show?: Show | null;
  timeframeStart: Date;
  timeframeEnd: Date;
  breakItems: PrerecordExportBreakItem[];
  playlistSequence?: PrerecordExportTrackEntry[];
  exportItems?: PrerecordExportSequenceItem[];
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
  exportItems,
  hasUnloggedBreaks,
  isExporting,
  isLoggingExports = false,
  onExecuteExport,
  onMarkAllAsLogged,
}: PrerecordExportPopupProps) {
  const [previewMode, setPreviewMode] = useState<'plan' | 'playlist' | 'live_reads'>('plan');
  const [copiedMode, setCopiedMode] = useState<string | null>(null);
  const [loadedScriptTexts, setLoadedScriptTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !exportItems || exportItems.length === 0) return;
    let cancelled = false;
    const scriptFilesToLoad = Array.from(
      new Set(
        exportItems
          .filter(
            (it) =>
              (it.assetType === 'script' || it.isUpNextPromo) &&
              !it.isUpNextPromo &&
              !it.upNextScriptText &&
              !it.scriptText &&
              it.fileName &&
              !it.fileName.startsWith('__up_next_promo__:') &&
              /\.(txt|md)$/i.test(it.fileName)
          )
          .map((it) => it.fileName)
      )
    );
    if (scriptFilesToLoad.length === 0) return;

    (async () => {
      try {
        const headers = await getStorageApiHeaders();
        const fetched: Record<string, string> = {};
        for (const fName of scriptFilesToLoad) {
          try {
            const res = await fetch(`/api/live-read/content?file=${encodeURIComponent(fName)}`, {
              headers,
              cache: 'no-store',
            });
            if (res.ok) {
              const data = await res.json();
              if (typeof data?.content === 'string' && data.content.trim()) {
                fetched[fName] = data.content.trim();
              }
            }
          } catch (_) {}
        }
        if (!cancelled && Object.keys(fetched).length > 0) {
          setLoadedScriptTexts((prev) => ({ ...prev, ...fetched }));
        }
      } catch (_) {}
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, exportItems]);

  const showTitle = show?.name || 'Prerecord Show';
  const subheaderLabel = `${showTitle} · ${format(timeframeStart, 'EEE, MMM dd')} (${format(timeframeStart, 'h:mm a')}–${format(timeframeEnd, 'h:mm a')})`;

  const planCopyText = useMemo(() => {
    const header = `${showTitle} — Broadcast Plan\n${format(timeframeStart, 'EEE, MMM dd, yyyy')} · ${format(timeframeStart, 'h:mm a')} – ${format(timeframeEnd, 'h:mm a')}\n${'-'.repeat(44)}`;
    if (exportItems && exportItems.length > 0) {
      const lines = exportItems.map((item) => {
        if (item.isEvergreen) {
          return `${item.paddedIdx}. [TRACK] ${item.announcementName} (${item.durationLabel || '3:00'})\n   Exported File: ${item.targetFileName}`;
        }
        const tag = item.isUpNextPromo ? 'PROMO' : item.assetType === 'script' ? 'READ' : 'MP3';
        const isTextScript =
          item.isUpNextPromo ||
          (item.assetType === 'script' && /\.(txt|md|rtf)$/i.test(item.targetFileName || item.fileName || ''));
        const scriptBase = (item.targetFileName || '').replace(/\.(txt|md|rtf)$/i, '');
        const exportedLabel = isTextScript && scriptBase
          ? `${scriptBase}.txt (+ .rtf)`
          : item.targetFileName;
        return `${item.paddedIdx}. ${item.slotTimeAmPm} [${tag}] ${item.announcementName} (${item.durationLabel || '0:30'})\n   Exported ${item.assetType === 'script' ? 'Scripts' : 'File'}: ${exportedLabel}`;
      });
      return `${header}\n${lines.join('\n')}`;
    }

    if (playlistSequence && playlistSequence.length > 0) {
      const lines: string[] = [];
      let seqIdx = 1;
      for (const entry of playlistSequence) {
        if (entry.kind === 'track') {
          lines.push(`${String(seqIdx).padStart(2, '0')}. [TRACK] ${entry.title} (${entry.durationLabel})`);
          seqIdx += 1;
        } else if (entry.breakItems && entry.breakItems.length > 0) {
          for (const b of entry.breakItems) {
            const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
            lines.push(`${String(seqIdx).padStart(2, '0')}. ${format(b.slot, 'h:mm a')} [${tag}] ${b.announcement.name} (${b.durationLabel})`);
            seqIdx += 1;
          }
        }
      }
      return `${header}\n${lines.join('\n')}`;
    }

    if (breakItems.length === 0) {
      return `${header}\nNo scheduled announcements in this timeframe.`;
    }
    const lines = breakItems.map((b, idx) => {
      const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
      return `${String(idx + 1).padStart(2, '0')}. ${format(b.slot, 'h:mm a')} [${tag}] ${b.announcement.name} (${b.durationLabel})`;
    });
    return `${header}\n${lines.join('\n')}`;
  }, [showTitle, timeframeStart, timeframeEnd, breakItems, playlistSequence, exportItems]);

  const m3uEntries = useMemo(() => {
    const entries: { extinfSeconds: number; extinfTitle: string; filename: string }[] = [];

    if (exportItems && exportItems.length > 0) {
      for (const item of exportItems) {
        const typePrefix = item.isEvergreen ? 'Track' : 'Break';
        const isScript = item.assetType === 'script';
        const isMp3Target = item.targetFileName.toLowerCase().endsWith('.mp3') || item.fileName.toLowerCase().endsWith('.mp3');
        if (!isScript && isMp3Target) {
          entries.push({
            extinfSeconds: -1,
            extinfTitle: `${item.paddedIdx} ${typePrefix} - ${item.slotTime} - ${item.announcementName}`,
            filename: item.targetFileName,
          });
        } else if (isScript && item.backupMp3Url && item.backupTargetFileName && item.backupMp3Exists) {
          entries.push({
            extinfSeconds: -1,
            extinfTitle: `${item.paddedIdx} ${typePrefix} - ${item.slotTime} - ${item.announcementName} (Backup MP3)`,
            filename: item.backupTargetFileName,
          });
        }
      }
      return entries;
    }

    let index = 1;
    if (playlistSequence && playlistSequence.length > 0) {
      for (const entry of playlistSequence) {
        if (entry.kind === 'track' && entry.filename) {
          const cleanBase = entry.filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = entry.filename.match(/\.[^/.]+$/)?.[0] || '.mp3';
          entries.push({
            extinfSeconds: -1,
            extinfTitle: `${String(index).padStart(2, '0')} Track - ${entry.title}`,
            filename: `${String(index).padStart(2, '0')}_TRACK_${cleanBase}${ext}`,
          });
          index += 1;
        } else if (entry.kind === 'break' && entry.breakItems) {
          for (const b of entry.breakItems) {
            if (b.isScript) {
              index += 1;
              continue;
            }
            const rawUrl = b.activeMp3?.mp3Url || b.resolvedUrl || b.announcement.name;
            const rawFilename = rawUrl.split(/[\\/]/).pop() || `${b.announcement.name}.mp3`;
            const ext = rawFilename.match(/\.[^/.]+$/)?.[0] || '.mp3';
            const safeName = b.announcement.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            entries.push({
              extinfSeconds: -1,
              extinfTitle: `${String(index).padStart(2, '0')} Break - ${format(b.slot, 'HH:mm')} - ${b.announcement.name}`,
              filename: `${String(index).padStart(2, '0')}_${format(b.slot, 'HHmm')}_${safeName}${ext}`,
            });
            index += 1;
          }
        }
      }
      return entries;
    }

    for (let i = 0; i < breakItems.length; i++) {
      const b = breakItems[i];
      const seqNum = String(i + 1).padStart(2, '0');
      if (b.isScript) continue;
      const rawUrl = b.activeMp3?.mp3Url || b.resolvedUrl || b.announcement.name;
      const rawFilename = rawUrl.split(/[\\/]/).pop() || `${b.announcement.name}.mp3`;
      const ext = rawFilename.match(/\.[^/.]+$/)?.[0] || '.mp3';
      const safeName = b.announcement.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      entries.push({
        extinfSeconds: -1,
        extinfTitle: `${seqNum} Break - ${format(b.slot, 'HH:mm')} - ${b.announcement.name}`,
        filename: `${seqNum}_${format(b.slot, 'HHmm')}_${safeName}${ext}`,
      });
    }
    return entries;
  }, [breakItems, playlistSequence, exportItems]);

  const m3uCopyText = useMemo(() => {
    if (m3uEntries.length === 0) {
      return '#EXTM3U\n# No audio files scheduled in this timeframe.';
    }
    const blocks = m3uEntries.map(
      (e) => `#EXTINF:${e.extinfSeconds},${e.extinfTitle}\n${e.filename}`
    );
    return `#EXTM3U\n${blocks.join('\n')}`;
  }, [m3uEntries]);

  const sequencedLiveReadItems = useMemo(() => {
    const formatDualScriptLabel = (rawTarget: string) => {
      if (/\.(txt|md|rtf)$/i.test(rawTarget)) {
        const stem = rawTarget.replace(/\.(txt|md|rtf)$/i, '');
        return `${stem}.txt (+ .rtf)`;
      }
      return rawTarget;
    };

    if (exportItems && exportItems.length > 0) {
      return exportItems
        .filter((it) => it.assetType === 'script' || it.isUpNextPromo)
        .map((it) => {
          const textBody =
            (it.upNextScriptText || it.scriptText || loadedScriptTexts[it.fileName] || '').trim();
          return {
            paddedIdx: it.paddedIdx,
            slotTimeAmPm: it.slotTimeAmPm,
            announcementName: it.announcementName,
            targetFileName: formatDualScriptLabel(it.targetFileName),
            sourceFileName: it.fileName,
            isUpNextPromo: Boolean(it.isUpNextPromo),
            scriptText: textBody,
          };
        });
    }
    return breakItems
      .map((b, idx) => ({ b, paddedIdx: String(idx + 1).padStart(2, '0') }))
      .filter(({ b }) => b.isScript)
      .map(({ b, paddedIdx }) => {
        const rawUrl = b.activeMp3?.mp3Url || '';
        const cleanShowName = b.announcement.name.replace(/^Up Next:\s*/i, '').trim() || 'Upcoming Show';
        const displayFile =
          b.isUpNextPromo || rawUrl.startsWith('__up_next_promo__:')
            ? `Up Next - ${cleanShowName}.txt`
            : rawUrl || b.announcement.name;
        return {
          paddedIdx,
          slotTimeAmPm: format(b.slot, 'h:mm a'),
          announcementName: b.announcement.name,
          targetFileName: formatDualScriptLabel(displayFile),
          sourceFileName: displayFile,
          isUpNextPromo: Boolean(b.isUpNextPromo),
          scriptText: (b.scriptText || loadedScriptTexts[displayFile] || '').trim(),
        };
      });
  }, [exportItems, breakItems, loadedScriptTexts]);

  const liveReadsCopyText = useMemo(() => {
    if (sequencedLiveReadItems.length === 0) {
      return 'No live read scripts scheduled in this timeframe.';
    }
    return sequencedLiveReadItems
      .map((item) => {
        const cleanPlainBody = item.scriptText
          ? stripFormattingMarkers(item.scriptText).trim()
          : `(Open ${item.targetFileName} to view script content)`;
        return `#${item.paddedIdx} · ${item.slotTimeAmPm} · ${item.announcementName}\nExported Scripts: ${item.targetFileName}\n${cleanPlainBody}`;
      })
      .join('\n\n---\n\n');
  }, [sequencedLiveReadItems]);

  const liveReadsCopyHtml = useMemo(() => {
    if (sequencedLiveReadItems.length === 0) {
      return '<p>No live read scripts scheduled in this timeframe.</p>';
    }
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return sequencedLiveReadItems
      .map((item) => {
        const richBodyHtml = item.scriptText
          ? markdownTxtToRichClipboardHtml(item.scriptText)
          : `<em>(Open ${escapeHtml(item.targetFileName)} to view script content)</em>`;
        return `<div><strong>#${escapeHtml(item.paddedIdx)} &middot; ${escapeHtml(item.slotTimeAmPm)} &middot; ${escapeHtml(item.announcementName)}</strong><br><span>Exported Scripts: ${escapeHtml(item.targetFileName)}</span><br><br>${richBodyHtml}</div>`;
      })
      .join('<hr>');
  }, [sequencedLiveReadItems]);

  if (!isOpen) return null;

  const handleCopyActivePreview = async () => {
    const textToCopy =
      previewMode === 'plan'
        ? planCopyText
        : previewMode === 'playlist'
          ? m3uCopyText
          : liveReadsCopyText;
    try {
      if (
        previewMode === 'live_reads' &&
        typeof ClipboardItem !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function'
      ) {
        const item = new ClipboardItem({
          'text/plain': new Blob([liveReadsCopyText], { type: 'text/plain' }),
          'text/html': new Blob([liveReadsCopyHtml], { type: 'text/html' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopiedMode(previewMode);
      setTimeout(() => {
        setCopiedMode((prev) => (prev === previewMode ? null : prev));
      }, 1800);
    } catch (err) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopiedMode(previewMode);
        setTimeout(() => {
          setCopiedMode((prev) => (prev === previewMode ? null : prev));
        }, 1800);
      } catch (fallbackErr) {
        console.error('Failed to copy preview text:', fallbackErr);
      }
    }
  };

  const hasExportableItems =
    (exportItems && exportItems.length > 0) ||
    breakItems.length > 0 ||
    (playlistSequence && playlistSequence.length > 0);

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
            disabled={isExporting || !hasExportableItems}
            onClick={onExecuteExport}
            className={cn(
              "w-full py-1.5 px-2 rounded border-b-[3px] font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 shadow-xs transition-colors",
              isExporting || !hasExportableItems
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
                  {exportItems && exportItems.length > 0 ? (
                    exportItems.map((item) => {
                      if (item.isEvergreen) {
                        return (
                          <div key={`plan-exp-${item.index}`} className="break-words">
                            <span className="font-bold text-slate-900">{item.paddedIdx}.</span>{' '}
                            <span className="font-bold text-purple-700">[TRACK]</span>{' '}
                            {item.announcementName} ({item.durationLabel || '3:00'})
                          </div>
                        );
                      }
                      const tag = item.isUpNextPromo
                        ? 'PROMO'
                        : item.assetType === 'script'
                          ? 'READ'
                          : 'MP3';
                      return (
                        <div key={`plan-exp-${item.index}`} className="break-words">
                          <span className="font-bold text-slate-900">{item.paddedIdx}.</span>{' '}
                          <span className="font-bold text-slate-800">{item.slotTimeAmPm}</span>{' '}
                          <span className="font-semibold text-blue-700">[{tag}]</span>{' '}
                          {item.announcementName} ({item.durationLabel || '0:30'})
                        </div>
                      );
                    })
                  ) : breakItems.length === 0 ? (
                    <div className="text-slate-400 italic font-sans">
                      No scheduled announcements in this timeframe.
                    </div>
                  ) : (
                    breakItems.map((b, idx) => {
                      const tag = b.isUpNextPromo ? 'PROMO' : b.isScript ? 'READ' : 'MP3';
                      return (
                        <div key={`plan-item-${idx}`}>
                          <span className="font-bold text-slate-900">
                            {String(idx + 1).padStart(2, '0')}. {format(b.slot, 'h:mm a')}
                          </span>{' '}
                          [{tag}] {b.announcement.name} ({b.durationLabel})
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
                {sequencedLiveReadItems.length === 0 ? (
                  <div className="p-2 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-400 italic">
                    No live read scripts scheduled in this timeframe.
                  </div>
                ) : (
                  sequencedLiveReadItems.map((item, idx) => (
                    <div
                      key={`lr-preview-${item.paddedIdx}-${idx}`}
                      className={cn(
                        "p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 space-y-0.5",
                        item.isUpNextPromo ? "border-l-teal-500" : "border-l-blue-500"
                      )}
                    >
                      <div className="text-[10px] font-black text-slate-800 break-words">
                        #{item.paddedIdx} · {item.slotTimeAmPm} · {item.announcementName}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 break-all">
                        {item.targetFileName}
                      </div>
                      <div className="text-[11px] text-slate-700 leading-snug whitespace-pre-wrap break-words pt-0.5">
                        {item.scriptText
                          ? renderFormattedTxtContent(item.scriptText)
                          : `Script file: ${item.sourceFileName}`}
                      </div>
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
