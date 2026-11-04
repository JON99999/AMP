import React from 'react';
import { FileText, Copy, Eye, XCircle, Square, Play, Music, AlertCircle } from 'lucide-react';
import { Announcement, AnnouncementType } from '../../types';
import {
  cn,
  getMP3Status,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  sortMp3sByStartDate,
  formatDatetime12,
  classifyMediaAsset,
  getGateMediaItems,
} from '../../lib/utils';
import {
  getAnnouncementSummary,
  AnnouncementConflict,
  AnnouncementGap,
  PreviewScriptOriginState,
} from './calendarHelpers';

export interface AnnouncementsListViewProps {
  announcements: Announcement[];
  now: Date;
  announcementFilterQuery: string;
  selectedListMediaByAnnId: Record<string, string>;
  setSelectedListMediaByAnnId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  startEdit: (s: Announcement) => void;
  duplicate: (s: Announcement, e: React.MouseEvent) => void;
  listCardHideTypeTag: boolean;
  listCardHideSummaryTag: boolean;
  listCardCollapseViewEditText: boolean;
  listCardCollapseCopyText: boolean;
  listCardCollapsePreviewText: boolean;
  previewUrl: string | null;
  togglePreview: (url: string | undefined, e?: React.MouseEvent) => void;
  setPreviewScriptBackupUrl: (url: string | undefined) => void;
  setPreviewScriptOrigin: (origin: PreviewScriptOriginState | null) => void;
  setPreviewScriptFromPicker: (val: boolean) => void;
  setPreviewScriptFile: (file: string | null) => void;
  announcementGaps: AnnouncementGap[];
  announcementConflicts: AnnouncementConflict[];
  inactiveSortMode: 'scheduleTime' | 'newestFirst' | 'oldestFirst';
  setInactiveSortMode: (mode: 'scheduleTime' | 'newestFirst' | 'oldestFirst') => void;
}

export function AnnouncementsListView({
  announcements,
  now,
  announcementFilterQuery,
  selectedListMediaByAnnId,
  setSelectedListMediaByAnnId,
  startEdit,
  duplicate,
  listCardHideTypeTag,
  listCardHideSummaryTag,
  listCardCollapseViewEditText,
  listCardCollapseCopyText,
  listCardCollapsePreviewText,
  previewUrl,
  togglePreview,
  setPreviewScriptBackupUrl,
  setPreviewScriptOrigin,
  setPreviewScriptFromPicker,
  setPreviewScriptFile,
  announcementGaps,
  announcementConflicts,
  inactiveSortMode,
  setInactiveSortMode,
}: AnnouncementsListViewProps) {
  return (
    <div className="flex flex-col gap-6 overflow-y-auto flex-1 pb-4 pr-1.5 custom-scrollbar min-h-0">
      {/* Active Announcements Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-px bg-emerald-300/60 dark:bg-emerald-700/50 flex-1"></div>
          <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest leading-none">
            Active Announcements
          </span>
          <div className="h-px bg-emerald-300/60 dark:bg-emerald-700/50 flex-1"></div>
        </div>

        {(() => {
          const today = now.toISOString().split('T')[0];
          const activeOnes = announcements.filter(s => {
            let isExpired = false;
            if (s.type === AnnouncementType.ONE_TIME) {
              if (s.date && s.time) {
                const expiry = new Date(
                  `${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`
                );
                isExpired = expiry < now;
              } else if (s.date) {
                isExpired = s.date < today;
              }
            } else {
              const endIso = s.endDate ? formatToDatetimeLocal(s.endDate) : null;
              const nowIso = getCurrentDatetimeLocal();
              isExpired = !!(endIso && endIso < nowIso);
            }

            if (announcementFilterQuery) {
              const q = announcementFilterQuery.toLowerCase();
              const summaryText = getAnnouncementSummary(s).toLowerCase();
              const playModeText = (
                s.type === AnnouncementType.ONE_TIME
                  ? 'One-Time'
                  : s.type === AnnouncementType.BASIC_HOURLY
                    ? 'Hourly'
                    : 'Advanced'
              ).toLowerCase();
              const matchesFilter =
                s.name.toLowerCase().includes(q) ||
                (s.timeGatedMp3s &&
                  s.timeGatedMp3s.some(m =>
                    getGateMediaItems(m).some(mi => mi.mp3Url && mi.mp3Url.toLowerCase().includes(q))
                  )) ||
                playModeText.includes(q) ||
                summaryText.includes(q);
              return s.enabled && !isExpired && matchesFilter;
            }

            return s.enabled && !isExpired;
          });

          if (activeOnes.length === 0) {
            return (
              <div className="py-8 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-350">
                <p className="text-xs font-bold text-slate-450 uppercase tracking-widest leading-none">
                  No active triggers
                </p>
              </div>
            );
          }

          return (
            <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-sm">
              {activeOnes
                .sort(
                  (a, b) =>
                    (a.minute || 0) - (b.minute || 0) ||
                    (a.name || '').localeCompare(b.name || '', undefined, {
                      sensitivity: 'base',
                    })
                )
                .map((s, idx) => {
                  const sortedGates = sortMp3sByStartDate(s.timeGatedMp3s || []);
                  const totalGates = sortedGates.length;
                  const nowMs = now.getTime();
                  let currentGateIdx = -1;
                  let nextFutureGateIdx = -1;
                  let nextFutureStartMs = Infinity;
                  let closestPastGateIdx = -1;
                  let closestPastRefMs = -Infinity;

                  const cardMediaOptions: Array<{
                    key: string;
                    gateIndex: number;
                    itemIndex: number;
                    mp3Url: string;
                    backupMp3Url?: string;
                    isScript: boolean;
                    status: ReturnType<typeof getMP3Status>;
                    isVerified: boolean;
                    displayLabel: string;
                  }> = [];
                  sortedGates.forEach((gate, gIdx) => {
                    const startRaw = gate.startDate ? formatToDatetimeLocal(gate.startDate) : '';
                    const endRaw = gate.endDate && gate.endDate.trim() ? formatToDatetimeLocal(gate.endDate) : '';
                    const parsedStart = startRaw ? new Date(startRaw).getTime() : NaN;
                    const parsedEnd = endRaw ? new Date(endRaw).getTime() : NaN;
                    const startMs = !isNaN(parsedStart) ? parsedStart : -Infinity;
                    const endMs = !isNaN(parsedEnd) ? parsedEnd : Infinity;

                    if (startMs <= nowMs && nowMs <= endMs) {
                      if (currentGateIdx === -1) {
                        currentGateIdx = gIdx;
                      }
                    } else if (startMs > nowMs) {
                      if (startMs < nextFutureStartMs) {
                        nextFutureStartMs = startMs;
                        nextFutureGateIdx = gIdx;
                      }
                    } else if (endMs < nowMs) {
                      const refMs = Number.isFinite(endMs) ? endMs : startMs;
                      if (refMs >= closestPastRefMs) {
                        closestPastRefMs = refMs;
                        closestPastGateIdx = gIdx;
                      }
                    }

                    const items = getGateMediaItems(gate);
                    const totalInGate = items.length;
                    items.forEach((mItem, mIdx) => {
                      const mp3Url = mItem.mp3Url || '';
                      const status = getMP3Status(mp3Url);
                      const isScriptItem = classifyMediaAsset(mp3Url, mItem.assetType) === 'script';
                      const isVerified = isScriptItem ? status.exists : status.exists && status.valid;
                      const fileText = !status.exists
                        ? 'File not found.'
                        : !status.valid && !isScriptItem
                          ? 'File not mp3.'
                          : status.filename;
                      let prefix = '';
                      if (totalGates > 1 && totalInGate > 1) {
                        prefix = `Gate #${gIdx + 1} (${mIdx + 1}/${totalInGate}) `;
                      } else if (totalGates > 1) {
                        prefix = `Gate #${gIdx + 1}: `;
                      } else if (totalInGate > 1) {
                        prefix = `(${mIdx + 1}/${totalInGate}) `;
                      }
                      cardMediaOptions.push({
                        key: `${gIdx}-${mIdx}`,
                        gateIndex: gIdx,
                        itemIndex: mIdx,
                        mp3Url,
                        backupMp3Url: mItem.backupMp3Url,
                        isScript: isScriptItem,
                        status,
                        isVerified,
                        displayLabel: `${prefix}${fileText}`,
                      });
                    });
                  });
                  const defaultGateIdx =
                    currentGateIdx !== -1
                      ? currentGateIdx
                      : nextFutureGateIdx !== -1
                        ? nextFutureGateIdx
                        : closestPastGateIdx !== -1
                          ? closestPastGateIdx
                          : Math.max(0, totalGates - 1);
                  const savedMediaKey = selectedListMediaByAnnId[s.id];
                  const selectedMedia =
                    (savedMediaKey ? cardMediaOptions.find(o => o.key === savedMediaKey) : undefined) ||
                    cardMediaOptions.find(o => o.gateIndex === defaultGateIdx && o.itemIndex === 0) ||
                    cardMediaOptions[0] || {
                      key: 'empty',
                      gateIndex: 0,
                      itemIndex: 0,
                      mp3Url: '',
                      backupMp3Url: undefined,
                      isScript: false,
                      status: getMP3Status(''),
                      isVerified: false,
                      displayLabel: 'File not found.',
                    };
                  const isScript = selectedMedia.isScript;
                  return (
                    <div
                      key={s.id}
                      onClick={() => startEdit(s)}
                      className={cn(
                        'transition-all cursor-pointer group relative flex items-stretch min-h-[64px]',
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                        isScript ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-purple-500'
                      )}
                    >
                      <div className="shrink-0 flex items-center justify-center p-1 bg-slate-50 border-r border-grid-active w-[64px] select-none">
                        <svg
                          width="56"
                          height="56"
                          viewBox="0 0 80 80"
                          className="w-[52px] h-[52px] select-none"
                        >
                          <circle cx="40" cy="40" r="37" className="fill-white stroke-slate-350 stroke-[2]" />
                          <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-500">
                            0
                          </text>
                          <text x="66" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-450">
                            15
                          </text>
                          <text x="40" y="69" textAnchor="middle" className="text-xs font-bold fill-slate-450">
                            30
                          </text>
                          <text x="14" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-450">
                            45
                          </text>
                          {Array.from({ length: 12 }).map((_, ticksIdx) => {
                            const angle = ticksIdx * 30;
                            if (ticksIdx % 3 === 0) return null;
                            return (
                              <line
                                key={ticksIdx}
                                x1="40"
                                y1="5"
                                x2="40"
                                y2="9"
                                transform={`rotate(${angle}, 40, 40)`}
                                className="stroke-slate-300 stroke-[2]"
                              />
                            );
                          })}
                          <line
                            x1="40"
                            y1="40"
                            x2="40"
                            y2="11"
                            transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                            stroke="#2563eb"
                            strokeWidth="4"
                            strokeLinecap="round"
                          />
                          <circle cx="40" cy="40" r="5" className="fill-slate-800" />
                          <circle cx="40" cy="40" r="1.5" className="fill-white" />
                        </svg>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <span
                            className="text-base font-black text-slate-800 leading-tight basis-2/5 min-w-0 line-clamp-2"
                            title={s.name}
                          >
                            {s.name}
                          </span>
                          <div className="text-xs font-bold uppercase tracking-tighter basis-3/5 min-w-0 text-right line-clamp-2 leading-tight">
                            {!listCardHideTypeTag && (
                              <span
                                className={cn(
                                  'font-black',
                                  s.type === AnnouncementType.ONE_TIME
                                    ? 'text-purple-700 dark:text-purple-400'
                                    : s.type === AnnouncementType.BASIC_HOURLY
                                      ? 'text-blue-700 dark:text-blue-400'
                                      : 'text-orange-700 dark:text-orange-400'
                                )}
                              >
                                {s.type === AnnouncementType.ONE_TIME
                                  ? 'One-Time'
                                  : s.type === AnnouncementType.BASIC_HOURLY
                                    ? 'Hourly'
                                    : 'Advanced'}
                              </span>
                            )}
                            {!listCardHideTypeTag && !listCardHideSummaryTag && (
                              <span className="text-slate-400 mx-1">•</span>
                            )}
                            {!listCardHideSummaryTag && (
                              <span
                                className="text-slate-550 dark:text-slate-400 font-bold"
                                title={getAnnouncementSummary(s)}
                              >
                                {getAnnouncementSummary(s)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold uppercase tracking-tighter">
                              <span>:{s.minute.toString().padStart(2, '0')}m</span>
                            </div>

                            <div className="flex items-center gap-1.5 underline-offset-4">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  startEdit(s);
                                }}
                                className={cn(
                                  'flex items-center gap-1 py-0.5 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm group/btn cursor-pointer',
                                  listCardCollapseViewEditText ? 'px-1.5' : 'px-2'
                                )}
                                title="View or Edit Announcement"
                              >
                                <FileText className="w-2.5 h-2.5 shrink-0" />
                                {!listCardCollapseViewEditText && (
                                  <span className="text-xs font-black uppercase">View/Edit</span>
                                )}
                              </button>
                              <button
                                onClick={e => duplicate(s, e)}
                                className={cn(
                                  'flex items-center gap-1 py-0.5 hover:bg-blue-50 bg-white border border-slate-350 rounded text-blue-700 transition-all shadow-sm cursor-pointer',
                                  listCardCollapseCopyText ? 'px-1.5' : 'px-2'
                                )}
                                title="Copy Announcement"
                              >
                                <Copy className="w-2.5 h-2.5 shrink-0" />
                                {!listCardCollapseCopyText && (
                                  <span className="text-xs font-black uppercase">Copy</span>
                                )}
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const activeUrl = selectedMedia.mp3Url;
                            const status = selectedMedia.status;
                            const isVerified = selectedMedia.isVerified;
                            const hasMultipleFiles = cardMediaOptions.length > 1;

                            if (hasMultipleFiles) {
                              return (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  className="flex items-center gap-1.5 min-w-0 overflow-hidden text-right justify-end flex-1"
                                >
                                  <div
                                    className={cn(
                                      'flex items-center rounded border shadow-sm transition-all min-w-0 w-full overflow-hidden',
                                      !isScript && previewUrl === activeUrl
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : isVerified
                                          ? 'bg-white text-blue-700 border-blue-300'
                                          : 'bg-slate-50 text-slate-400 border-slate-300'
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        if (isVerified) {
                                          if (isScript) {
                                            const targetGate = sortedGates[selectedMedia.gateIndex];
                                            setPreviewScriptBackupUrl(selectedMedia.backupMp3Url);
                                            setPreviewScriptOrigin({
                                              announcementId: s.id,
                                              gateId: targetGate?.id || null,
                                              gateIndex: selectedMedia.gateIndex,
                                              itemIndex: selectedMedia.itemIndex,
                                              fromPicker: false,
                                            });
                                            setPreviewScriptFromPicker(false);
                                            setPreviewScriptFile(activeUrl);
                                          } else {
                                            togglePreview(activeUrl, e);
                                          }
                                        }
                                      }}
                                      disabled={!isVerified}
                                      className={cn(
                                        'flex items-center gap-1.5 py-0.5 shrink-0 cursor-pointer transition-colors',
                                        listCardCollapsePreviewText ? 'px-2' : 'px-2.5',
                                        !isScript && previewUrl === activeUrl
                                          ? 'hover:bg-slate-800 text-white'
                                          : isVerified
                                            ? 'hover:bg-blue-50 text-blue-700'
                                            : 'cursor-not-allowed text-slate-400'
                                      )}
                                      title={
                                        isScript
                                          ? isVerified
                                            ? 'Preview script'
                                            : 'File not found'
                                          : previewUrl === activeUrl
                                            ? 'Stop preview'
                                            : isVerified
                                              ? 'Preview audio'
                                              : 'File not found'
                                      }
                                    >
                                      {isScript ? (
                                        isVerified ? (
                                          <Eye className="w-2.5 h-2.5 fill-none shrink-0" />
                                        ) : (
                                          <XCircle className="w-2.5 h-2.5 shrink-0" />
                                        )
                                      ) : previewUrl === activeUrl ? (
                                        <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                      ) : isVerified ? (
                                        <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                      ) : (
                                        <XCircle className="w-2.5 h-2.5 shrink-0" />
                                      )}
                                      {!listCardCollapsePreviewText && (
                                        <span className="text-xs font-black uppercase whitespace-nowrap">
                                          {isScript
                                            ? isVerified
                                              ? 'Preview'
                                              : 'Locked'
                                            : previewUrl === activeUrl
                                              ? 'Stop'
                                              : isVerified
                                                ? 'Preview'
                                                : 'Locked'}
                                        </span>
                                      )}
                                    </button>

                                    <div
                                      className={cn(
                                        'h-3.5 w-px shrink-0',
                                        !isScript && previewUrl === activeUrl ? 'bg-slate-700' : 'bg-slate-300'
                                      )}
                                    />

                                    <div className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-0.5">
                                      {isScript ? (
                                        <FileText
                                          className={cn(
                                            'w-2.5 h-2.5 shrink-0',
                                            isVerified ? 'text-slate-400' : 'text-slate-300'
                                          )}
                                        />
                                      ) : (
                                        <Music
                                          className={cn(
                                            'w-2.5 h-2.5 shrink-0',
                                            previewUrl === activeUrl
                                              ? 'text-slate-400'
                                              : isVerified
                                                ? 'text-slate-400'
                                                : 'text-slate-300'
                                          )}
                                        />
                                      )}
                                      <select
                                        value={selectedMedia.key}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          e.stopPropagation();
                                          setSelectedListMediaByAnnId(prev => ({
                                            ...prev,
                                            [s.id]: e.target.value,
                                          }));
                                        }}
                                        className={cn(
                                          'w-full min-w-0 text-xs font-bold uppercase truncate bg-transparent outline-none cursor-pointer',
                                          !isScript && previewUrl === activeUrl
                                            ? 'text-white [&>option]:text-slate-800 [&>option]:bg-white'
                                            : !status.exists
                                              ? 'text-red-600 font-extrabold'
                                              : !status.valid && !isScript
                                                ? 'text-orange-600 font-extrabold'
                                                : 'text-slate-700 hover:text-blue-800'
                                        )}
                                        title="Select file to preview"
                                      >
                                        {cardMediaOptions.map(opt => (
                                          <option key={opt.key} value={opt.key}>
                                            {opt.displayLabel}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-right justify-end flex-1">
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (isVerified) {
                                      if (isScript) {
                                        const targetGate = sortedGates[selectedMedia.gateIndex];
                                        setPreviewScriptBackupUrl(selectedMedia.backupMp3Url);
                                        setPreviewScriptOrigin({
                                          announcementId: s.id,
                                          gateId: targetGate?.id || null,
                                          gateIndex: selectedMedia.gateIndex,
                                          itemIndex: selectedMedia.itemIndex,
                                          fromPicker: false,
                                        });
                                        setPreviewScriptFromPicker(false);
                                        setPreviewScriptFile(activeUrl);
                                      } else {
                                        togglePreview(activeUrl, e);
                                      }
                                    }
                                  }}
                                  disabled={!isVerified}
                                  className={cn(
                                    'flex items-center gap-2 py-0.5 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start',
                                    listCardCollapsePreviewText ? 'px-2' : 'px-3',
                                    !isScript && previewUrl === activeUrl
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : isVerified
                                        ? 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                                        : 'bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed'
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-1 text-left order-3">
                                    {isScript ? (
                                      <FileText
                                        className={cn(
                                          'w-2.5 h-2.5 shrink-0',
                                          isVerified ? 'text-slate-400 group-hover/play:text-blue-500' : 'text-slate-300'
                                        )}
                                      />
                                    ) : (
                                      <Music
                                        className={cn(
                                          'w-2.5 h-2.5 shrink-0',
                                          previewUrl === activeUrl
                                            ? 'text-slate-400'
                                            : isVerified
                                              ? 'text-slate-400 group-hover/play:text-blue-500'
                                              : 'text-slate-300'
                                        )}
                                      />
                                    )}
                                    <span
                                      className={cn(
                                        'text-xs font-bold uppercase truncate',
                                        !isScript && previewUrl === activeUrl
                                          ? 'text-white'
                                          : !status.exists
                                            ? 'text-red-600 font-extrabold'
                                            : !status.valid && !isScript
                                              ? 'text-orange-600 font-extrabold'
                                              : 'text-slate-600 group-hover/play:text-blue-800'
                                      )}
                                    >
                                      {selectedMedia.displayLabel}
                                    </span>
                                  </div>

                                  <div
                                    className={cn(
                                      'h-3 w-px shrink-0 mx-0.5',
                                      !isScript && previewUrl === activeUrl
                                        ? 'bg-slate-700'
                                        : isVerified
                                          ? 'bg-slate-300 group-hover/play:bg-blue-300'
                                          : 'bg-slate-300'
                                    )}
                                  />

                                  <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                    {isScript ? (
                                      isVerified ? (
                                        <Eye className="w-2.5 h-2.5 fill-none shrink-0" />
                                      ) : (
                                        <XCircle className="w-2.5 h-2.5 shrink-0" />
                                      )
                                    ) : previewUrl === activeUrl ? (
                                      <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                    ) : isVerified ? (
                                      <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                    ) : (
                                      <XCircle className="w-2.5 h-2.5 shrink-0" />
                                    )}
                                    {!listCardCollapsePreviewText && (
                                      <span className="text-xs font-black uppercase whitespace-nowrap">
                                        {isScript
                                          ? isVerified
                                            ? 'Preview'
                                            : 'Locked'
                                          : previewUrl === activeUrl
                                            ? 'Stop'
                                            : isVerified
                                              ? 'Preview'
                                              : 'Locked'}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        {(() => {
                          const cardGaps = announcementGaps.filter(g => g.announcementId === s.id);
                          const cardConflicts = announcementConflicts.filter(
                            c => c.announcement1.id === s.id || c.announcement2.id === s.id
                          );
                          if (cardGaps.length === 0 && cardConflicts.length === 0) return null;

                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1 border-t border-slate-200/60">
                              {cardConflicts.map((c, cIdx) => (
                                <span
                                  key={`conf-${cIdx}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold leading-tight select-none bg-amber-50 text-amber-800 border border-amber-200/90"
                                  title={c.message}
                                >
                                  <AlertCircle className="w-3 h-3 shrink-0 text-amber-600" />
                                  <span>Timeslot Conflict</span>
                                </span>
                              ))}
                              {cardGaps.map((g, gIdx) => (
                                <span
                                  key={`gap-${gIdx}`}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold leading-tight select-none',
                                    g.severity === 'critical'
                                      ? 'bg-red-50 text-red-700 border border-red-200/90 font-black'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200/90'
                                  )}
                                  title={g.message}
                                >
                                  <AlertCircle
                                    className={cn(
                                      'w-3 h-3 shrink-0',
                                      g.severity === 'critical' ? 'text-red-500' : 'text-amber-600'
                                    )}
                                  />
                                  <span>{g.shortNotice}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
            </div>
          );
        })()}
      </div>

      {/* Inactive Announcements Section */}
      <div className="space-y-2">
        {(() => {
          const today = now.toISOString().split('T')[0];
          const getInactiveEffectiveDateInfo = (
            s: Announcement
          ): {
            hasDate: boolean;
            timestampMs: number;
            formatted12: string;
          } => {
            let rawDateStr = '';
            if (s.type === AnnouncementType.ONE_TIME) {
              if (s.date && s.time !== undefined && s.time !== '') {
                rawDateStr = `${s.date}T${String(s.time).padStart(2, '0')}:${String(s.minute || 0).padStart(
                  2,
                  '0'
                )}`;
              } else if (s.date) {
                rawDateStr = s.date;
              } else if (s.endDate) {
                rawDateStr = s.endDate;
              }
            } else if (s.endDate) {
              rawDateStr = s.endDate;
            }

            if (!rawDateStr || !rawDateStr.trim()) {
              return { hasDate: false, timestampMs: 0, formatted12: '' };
            }

            const clean = rawDateStr.trim();
            const formatted12 = clean.includes('T') ? formatDatetime12(clean) : clean;
            const localIso = clean.includes('T') ? formatToDatetimeLocal(clean) : `${clean}T23:59`;
            const parsedMs = new Date(localIso).getTime();
            const timestampMs = !isNaN(parsedMs) ? parsedMs : 0;

            return {
              hasDate: Boolean(formatted12 && timestampMs > 0),
              timestampMs,
              formatted12,
            };
          };

          const inactiveOnes = announcements.filter(s => {
            let isExpired = false;
            if (s.type === AnnouncementType.ONE_TIME) {
              if (s.date && s.time) {
                const expiry = new Date(
                  `${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`
                );
                isExpired = expiry < now;
              } else if (s.date) {
                isExpired = s.date < today;
              }
            } else {
              const endIso = s.endDate ? formatToDatetimeLocal(s.endDate) : null;
              const nowIso = getCurrentDatetimeLocal();
              isExpired = !!(endIso && endIso < nowIso);
            }

            if (announcementFilterQuery) {
              const q = announcementFilterQuery.toLowerCase();
              const summaryText = getAnnouncementSummary(s).toLowerCase();
              const playModeText = (
                s.type === AnnouncementType.ONE_TIME
                  ? 'One-Time'
                  : s.type === AnnouncementType.BASIC_HOURLY
                    ? 'Hourly'
                    : 'Advanced'
              ).toLowerCase();
              const matchesFilter =
                s.name.toLowerCase().includes(q) ||
                (s.timeGatedMp3s &&
                  s.timeGatedMp3s.some(m =>
                    getGateMediaItems(m).some(mi => mi.mp3Url && mi.mp3Url.toLowerCase().includes(q))
                  )) ||
                playModeText.includes(q) ||
                summaryText.includes(q);
              return (!s.enabled || isExpired) && matchesFilter;
            }

            return !s.enabled || isExpired;
          });

          const hasAnyInactiveDate = inactiveOnes.some(s => getInactiveEffectiveDateInfo(s).hasDate);

          return (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="h-px bg-slate-300 flex-1 min-w-[24px]"></div>
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest leading-none">
                  Inactive Announcements
                </span>
                <div className="h-px bg-slate-300 flex-1 min-w-[24px]"></div>
                {hasAnyInactiveDate && inactiveOnes.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded p-0.5 shrink-0 select-none">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider px-1.5">
                      Sort:
                    </span>
                    {(
                      [
                        { id: 'scheduleTime', label: 'Schedule time' },
                        { id: 'newestFirst', label: 'Newest first' },
                        { id: 'oldestFirst', label: 'Oldest first' },
                      ] as const
                    ).map(opt => {
                      const isActive = inactiveSortMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setInactiveSortMode(opt.id)}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer',
                            isActive
                              ? 'bg-blue-600 text-white font-black shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {inactiveOnes.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No inactive items</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="border border-grid-inactive rounded-lg overflow-hidden divide-y divide-grid-inactive bg-slate-50/10 shadow-sm">
                    {inactiveOnes
                      .sort((a, b) => {
                        if (hasAnyInactiveDate && inactiveSortMode !== 'scheduleTime') {
                          const infoA = getInactiveEffectiveDateInfo(a);
                          const infoB = getInactiveEffectiveDateInfo(b);
                          if (infoA.hasDate !== infoB.hasDate) {
                            return infoA.hasDate ? -1 : 1;
                          }
                          if (infoA.hasDate && infoB.hasDate && infoA.timestampMs !== infoB.timestampMs) {
                            return inactiveSortMode === 'newestFirst'
                              ? infoB.timestampMs - infoA.timestampMs
                              : infoA.timestampMs - infoB.timestampMs;
                          }
                        }
                        return (
                          (a.minute || 0) - (b.minute || 0) ||
                          (a.name || '').localeCompare(b.name || '', undefined, {
                            sensitivity: 'base',
                          })
                        );
                      })
                      .map((s, idx) => {
                        let isExpired = false;
                        if (s.type === AnnouncementType.ONE_TIME) {
                          if (s.date && s.time) {
                            const expiry = new Date(
                              `${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`
                            );
                            isExpired = expiry < now;
                          } else if (s.date) {
                            isExpired = s.date < today;
                          }
                        } else {
                          const endIso = s.endDate ? formatToDatetimeLocal(s.endDate) : null;
                          const nowIso = getCurrentDatetimeLocal();
                          isExpired = !!(endIso && endIso < nowIso);
                        }
                        const inactiveDateInfo = getInactiveEffectiveDateInfo(s);
                        const sortedGates = sortMp3sByStartDate(s.timeGatedMp3s || []);
                        const totalGates = sortedGates.length;
                        const nowMs = now.getTime();
                        let currentGateIdx = -1;
                        let nextFutureGateIdx = -1;
                        let nextFutureStartMs = Infinity;
                        let closestPastGateIdx = -1;
                        let closestPastRefMs = -Infinity;

                        const cardMediaOptions: Array<{
                          key: string;
                          gateIndex: number;
                          itemIndex: number;
                          mp3Url: string;
                          backupMp3Url?: string;
                          isScript: boolean;
                          status: ReturnType<typeof getMP3Status>;
                          isVerified: boolean;
                          displayLabel: string;
                        }> = [];
                        sortedGates.forEach((gate, gIdx) => {
                          const startRaw = gate.startDate ? formatToDatetimeLocal(gate.startDate) : '';
                          const endRaw = gate.endDate && gate.endDate.trim() ? formatToDatetimeLocal(gate.endDate) : '';
                          const parsedStart = startRaw ? new Date(startRaw).getTime() : NaN;
                          const parsedEnd = endRaw ? new Date(endRaw).getTime() : NaN;
                          const startMs = !isNaN(parsedStart) ? parsedStart : -Infinity;
                          const endMs = !isNaN(parsedEnd) ? parsedEnd : Infinity;

                          if (startMs <= nowMs && nowMs <= endMs) {
                            if (currentGateIdx === -1) {
                              currentGateIdx = gIdx;
                            }
                          } else if (startMs > nowMs) {
                            if (startMs < nextFutureStartMs) {
                              nextFutureStartMs = startMs;
                              nextFutureGateIdx = gIdx;
                            }
                          } else if (endMs < nowMs) {
                            const refMs = Number.isFinite(endMs) ? endMs : startMs;
                            if (refMs >= closestPastRefMs) {
                              closestPastRefMs = refMs;
                              closestPastGateIdx = gIdx;
                            }
                          }

                          const items = getGateMediaItems(gate);
                          const totalInGate = items.length;
                          items.forEach((mItem, mIdx) => {
                            const mp3Url = mItem.mp3Url || '';
                            const status = getMP3Status(mp3Url);
                            const isScriptItem = classifyMediaAsset(mp3Url, mItem.assetType) === 'script';
                            const isVerified = isScriptItem ? status.exists : status.exists && status.valid;
                            const fileText = !status.exists
                              ? 'File not found.'
                              : !status.valid && !isScriptItem
                                ? 'File not mp3.'
                                : status.filename;
                            let prefix = '';
                            if (totalGates > 1 && totalInGate > 1) {
                              prefix = `Gate #${gIdx + 1} (${mIdx + 1}/${totalInGate}) `;
                            } else if (totalGates > 1) {
                              prefix = `Gate #${gIdx + 1}: `;
                            } else if (totalInGate > 1) {
                              prefix = `(${mIdx + 1}/${totalInGate}) `;
                            }
                            cardMediaOptions.push({
                              key: `${gIdx}-${mIdx}`,
                              gateIndex: gIdx,
                              itemIndex: mIdx,
                              mp3Url,
                              backupMp3Url: mItem.backupMp3Url,
                              isScript: isScriptItem,
                              status,
                              isVerified,
                              displayLabel: `${prefix}${fileText}`,
                            });
                          });
                        });
                        const defaultGateIdx =
                          currentGateIdx !== -1
                            ? currentGateIdx
                            : nextFutureGateIdx !== -1
                              ? nextFutureGateIdx
                              : closestPastGateIdx !== -1
                                ? closestPastGateIdx
                                : Math.max(0, totalGates - 1);
                        const savedMediaKey = selectedListMediaByAnnId[s.id];
                        const selectedMedia =
                          (savedMediaKey ? cardMediaOptions.find(o => o.key === savedMediaKey) : undefined) ||
                          cardMediaOptions.find(o => o.gateIndex === defaultGateIdx && o.itemIndex === 0) ||
                          cardMediaOptions[0] || {
                            key: 'empty',
                            gateIndex: 0,
                            itemIndex: 0,
                            mp3Url: '',
                            backupMp3Url: undefined,
                            isScript: false,
                            status: getMP3Status(''),
                            isVerified: false,
                            displayLabel: 'File not found.',
                          };
                        const isScript = selectedMedia.isScript;
                        return (
                          <div
                            key={s.id}
                            onClick={() => startEdit(s)}
                            className={cn(
                              'transition-all cursor-pointer group relative flex items-stretch min-h-[64px]',
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                              isScript ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-purple-500'
                            )}
                          >
                            <div className="shrink-0 flex items-center justify-center p-1 bg-slate-100/55 border-r border-grid-inactive w-[64px] select-none">
                              <svg
                                width="56"
                                height="56"
                                viewBox="0 0 80 80"
                                className="w-[52px] h-[52px] select-none opacity-80"
                              >
                                <circle cx="40" cy="40" r="37" className="fill-white stroke-slate-350 stroke-[2]" />
                                <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-400">
                                  0
                                </text>
                                <text x="66" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-355">
                                  15
                                </text>
                                <text x="40" y="69" textAnchor="middle" className="text-xs font-bold fill-slate-355">
                                  30
                                </text>
                                <text x="14" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-355">
                                  45
                                </text>
                                {Array.from({ length: 12 }).map((_, ticksIdx) => {
                                  const angle = ticksIdx * 30;
                                  if (ticksIdx % 3 === 0) return null;
                                  return (
                                    <line
                                      key={ticksIdx}
                                      x1="40"
                                      y1="5"
                                      x2="40"
                                      y2="9"
                                      transform={`rotate(${angle}, 40, 40)`}
                                      className="stroke-slate-250 stroke-[2]"
                                    />
                                  );
                                })}
                                <line
                                  x1="40"
                                  y1="40"
                                  x2="40"
                                  y2="11"
                                  transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                                  stroke="#475569"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                />
                                <circle cx="40" cy="40" r="5" className="fill-slate-600" />
                                <circle cx="40" cy="40" r="1.5" className="fill-white" />
                              </svg>
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5 opacity-90">
                              <div className="flex justify-between items-start mb-1 gap-2">
                                <span
                                  className="text-base font-black text-slate-500 leading-tight basis-2/5 min-w-0 line-clamp-2"
                                  title={s.name}
                                >
                                  {s.name}
                                </span>
                                <div className="text-xs font-bold uppercase tracking-tighter basis-3/5 min-w-0 text-right line-clamp-2 leading-tight">
                                  {!listCardHideTypeTag && (
                                    <span
                                      className={cn(
                                        'font-black opacity-80',
                                        s.type === AnnouncementType.ONE_TIME
                                          ? 'text-purple-700 dark:text-purple-400'
                                          : s.type === AnnouncementType.BASIC_HOURLY
                                            ? 'text-blue-700 dark:text-blue-400'
                                            : 'text-orange-700 dark:text-orange-400'
                                      )}
                                    >
                                      {s.type === AnnouncementType.ONE_TIME
                                        ? 'One-Time'
                                        : s.type === AnnouncementType.BASIC_HOURLY
                                          ? 'Hourly'
                                          : 'Advanced'}
                                    </span>
                                  )}
                                  {!listCardHideTypeTag && <span className="text-slate-400 mx-1">•</span>}
                                  {!listCardHideSummaryTag && (
                                    <>
                                      <span className="text-slate-500 font-bold">{getAnnouncementSummary(s)}</span>
                                      <span className="text-slate-400 mx-1">•</span>
                                    </>
                                  )}
                                  <span
                                    className="text-slate-500 font-bold"
                                    title={`${getAnnouncementSummary(s)} • ${
                                      isExpired ? 'EXPIRED' : 'SUSPENDED'
                                    }${inactiveDateInfo.hasDate ? `: ${inactiveDateInfo.formatted12}` : ''}`}
                                  >
                                    {isExpired ? (
                                      <span className="text-red-650 font-black">
                                        EXPIRED
                                        {inactiveDateInfo.hasDate ? `: ${inactiveDateInfo.formatted12}` : ''}
                                      </span>
                                    ) : (
                                      <span>
                                        SUSPENDED
                                        {inactiveDateInfo.hasDate ? `: ${inactiveDateInfo.formatted12}` : ''}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              <div className="flex justify-between items-center gap-4">
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold uppercase tracking-tighter">
                                    <span>:{s.minute.toString().padStart(2, '0')}m</span>
                                  </div>

                                  <div className="flex items-center gap-1.5 underline-offset-4">
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        startEdit(s);
                                      }}
                                      className={cn(
                                        'flex items-center gap-1 py-0.5 hover:bg-slate-100 hover:text-slate-600 bg-white border border-slate-300 rounded text-slate-400 transition-all shadow-sm cursor-pointer',
                                        listCardCollapseViewEditText ? 'px-1.5' : 'px-2'
                                      )}
                                      title="View or Edit Announcement"
                                    >
                                      <FileText className="w-2.5 h-2.5 shrink-0" />
                                      {!listCardCollapseViewEditText && (
                                        <span className="text-xs font-black uppercase">View/Edit</span>
                                      )}
                                    </button>
                                    <button
                                      onClick={e => duplicate(s, e)}
                                      className={cn(
                                        'flex items-center gap-1 py-0.5 hover:bg-white hover:text-slate-600 bg-slate-100/50 border border-slate-300 rounded text-slate-400 transition-all shadow-sm cursor-pointer',
                                        listCardCollapseCopyText ? 'px-1.5' : 'px-2'
                                      )}
                                      title="Copy Announcement"
                                    >
                                      <Copy className="w-2.5 h-2.5 shrink-0" />
                                      {!listCardCollapseCopyText && (
                                        <span className="text-xs font-black uppercase">Copy</span>
                                      )}
                                    </button>
                                  </div>
                                </div>

                                {(() => {
                                  const activeUrl = selectedMedia.mp3Url;
                                  const status = selectedMedia.status;
                                  const isVerified = selectedMedia.isVerified;
                                  const hasMultipleFiles = cardMediaOptions.length > 1;

                                  if (hasMultipleFiles) {
                                    return (
                                      <div
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center gap-1.5 min-w-0 overflow-hidden text-right justify-end flex-1 opacity-90"
                                      >
                                        <div
                                          className={cn(
                                            'flex items-center rounded border shadow-sm transition-all min-w-0 w-full overflow-hidden',
                                            !isScript && previewUrl === activeUrl
                                              ? 'bg-slate-900 text-white border-slate-900 opacity-100'
                                              : isVerified
                                                ? 'bg-white text-slate-700 border-slate-350'
                                                : 'bg-slate-50 text-slate-400 border-slate-300'
                                          )}
                                        >
                                          <button
                                            type="button"
                                            onClick={e => {
                                              e.stopPropagation();
                                              if (isVerified) {
                                                if (isScript) {
                                                  const targetGate = sortedGates[selectedMedia.gateIndex];
                                                  setPreviewScriptBackupUrl(selectedMedia.backupMp3Url);
                                                  setPreviewScriptOrigin({
                                                    announcementId: s.id,
                                                    gateId: targetGate?.id || null,
                                                    gateIndex: selectedMedia.gateIndex,
                                                    itemIndex: selectedMedia.itemIndex,
                                                    fromPicker: false,
                                                  });
                                                  setPreviewScriptFromPicker(false);
                                                  setPreviewScriptFile(activeUrl);
                                                } else {
                                                  togglePreview(activeUrl, e);
                                                }
                                              }
                                            }}
                                            disabled={!isVerified}
                                            className={cn(
                                              'flex items-center gap-1.5 py-0.5 shrink-0 cursor-pointer transition-colors',
                                              listCardCollapsePreviewText ? 'px-2' : 'px-2.5',
                                              !isScript && previewUrl === activeUrl
                                                ? 'hover:bg-slate-800 text-white'
                                                : isVerified
                                                  ? 'hover:bg-slate-50 text-slate-700'
                                                  : 'cursor-not-allowed text-slate-400'
                                            )}
                                            title={
                                              isScript
                                                ? isVerified
                                                  ? 'Preview script'
                                                  : 'File not found'
                                                : previewUrl === activeUrl
                                                  ? 'Stop preview'
                                                  : isVerified
                                                    ? 'Preview audio'
                                                    : 'File not found'
                                            }
                                          >
                                            {isScript ? (
                                              isVerified ? (
                                                <Eye className="w-2.5 h-2.5 fill-none shrink-0" />
                                              ) : (
                                                <XCircle className="w-2.5 h-2.5 shrink-0" />
                                              )
                                            ) : previewUrl === activeUrl ? (
                                              <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                            ) : isVerified ? (
                                              <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                            ) : (
                                              <XCircle className="w-2.5 h-2.5 shrink-0" />
                                            )}
                                            {!listCardCollapsePreviewText && (
                                              <span className="text-xs font-black uppercase whitespace-nowrap">
                                                {isScript
                                                  ? isVerified
                                                    ? 'Preview'
                                                    : 'Locked'
                                                  : previewUrl === activeUrl
                                                    ? 'Stop'
                                                    : isVerified
                                                      ? 'Preview'
                                                      : 'Locked'}
                                              </span>
                                            )}
                                          </button>

                                          <div
                                            className={cn(
                                              'h-3.5 w-px shrink-0',
                                              !isScript && previewUrl === activeUrl ? 'bg-slate-700' : 'bg-slate-300'
                                            )}
                                          />

                                          <div className="flex items-center gap-1.5 min-w-0 flex-1 px-2 py-0.5">
                                            {isScript ? (
                                              <FileText
                                                className={cn(
                                                  'w-2.5 h-2.5 shrink-0',
                                                  isVerified ? 'text-slate-450' : 'text-slate-300'
                                                )}
                                              />
                                            ) : (
                                              <Music
                                                className={cn(
                                                  'w-2.5 h-2.5 shrink-0',
                                                  previewUrl === activeUrl
                                                    ? 'text-slate-400'
                                                    : isVerified
                                                      ? 'text-slate-450'
                                                      : 'text-slate-300'
                                                )}
                                              />
                                            )}
                                            <select
                                              value={selectedMedia.key}
                                              onClick={e => e.stopPropagation()}
                                              onChange={e => {
                                                e.stopPropagation();
                                                setSelectedListMediaByAnnId(prev => ({
                                                  ...prev,
                                                  [s.id]: e.target.value,
                                                }));
                                              }}
                                              className={cn(
                                                'w-full min-w-0 text-xs font-bold uppercase truncate bg-transparent outline-none cursor-pointer',
                                                !isScript && previewUrl === activeUrl
                                                  ? 'text-white [&>option]:text-slate-800 [&>option]:bg-white'
                                                  : !status.exists
                                                    ? 'text-red-600 font-extrabold'
                                                    : !status.valid && !isScript
                                                      ? 'text-orange-600 font-extrabold'
                                                      : 'text-slate-600 hover:text-slate-800'
                                              )}
                                              title="Select file to preview"
                                            >
                                              {cardMediaOptions.map(opt => (
                                                <option key={opt.key} value={opt.key}>
                                                  {opt.displayLabel}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="flex items-center gap-1.5 overflow-hidden text-right justify-end flex-1 opacity-90">
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          if (isVerified) {
                                            if (isScript) {
                                              const targetGate = sortedGates[selectedMedia.gateIndex];
                                              setPreviewScriptBackupUrl(selectedMedia.backupMp3Url);
                                              setPreviewScriptOrigin({
                                                announcementId: s.id,
                                                gateId: targetGate?.id || null,
                                                gateIndex: selectedMedia.gateIndex,
                                                itemIndex: selectedMedia.itemIndex,
                                                fromPicker: false,
                                              });
                                              setPreviewScriptFromPicker(false);
                                              setPreviewScriptFile(activeUrl);
                                            } else {
                                              togglePreview(activeUrl, e);
                                            }
                                          }
                                        }}
                                        disabled={!isVerified}
                                        className={cn(
                                          'flex items-center gap-2 py-0.5 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start',
                                          listCardCollapsePreviewText ? 'px-2' : 'px-3',
                                          !isScript && previewUrl === activeUrl
                                            ? 'bg-slate-900 text-white border-slate-900 opacity-100'
                                            : isVerified
                                              ? 'bg-white text-slate-700 border-slate-350 hover:bg-slate-50'
                                              : 'bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed'
                                        )}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden font-bold flex-1 text-left order-3">
                                          {isScript ? (
                                            <FileText
                                              className={cn(
                                                'w-2.5 h-2.5 shrink-0',
                                                isVerified ? 'text-slate-450 group-hover/play:text-slate-600' : 'text-slate-300'
                                              )}
                                            />
                                          ) : (
                                            <Music
                                              className={cn(
                                                'w-2.5 h-2.5 shrink-0',
                                                previewUrl === activeUrl
                                                  ? 'text-slate-400'
                                                  : isVerified
                                                    ? 'text-slate-450 group-hover/play:text-slate-600'
                                                    : 'text-slate-300'
                                              )}
                                            />
                                          )}
                                          <span
                                            className={cn(
                                              'text-xs font-bold uppercase truncate',
                                              !isScript && previewUrl === activeUrl
                                                ? 'text-white'
                                                : !status.exists
                                                  ? 'text-red-600 font-extrabold'
                                                  : !status.valid && !isScript
                                                    ? 'text-orange-600 font-extrabold'
                                                    : 'text-slate-600 group-hover/play:text-slate-800'
                                            )}
                                          >
                                            {selectedMedia.displayLabel}
                                          </span>
                                        </div>

                                        <div
                                          className={cn(
                                            'h-3 w-px shrink-0 mx-0.5',
                                            !isScript && previewUrl === activeUrl
                                              ? 'bg-slate-700'
                                              : isVerified
                                                ? 'bg-slate-300 group-hover/play:bg-slate-400'
                                                : 'bg-slate-355'
                                          )}
                                        />

                                        <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                          {isScript ? (
                                            isVerified ? (
                                              <Eye className="w-2.5 h-2.5 fill-none shrink-0" />
                                            ) : (
                                              <XCircle className="w-2.5 h-2.5 shrink-0" />
                                            )
                                          ) : previewUrl === activeUrl ? (
                                            <Square className="w-2.5 h-2.5 fill-current shrink-0" />
                                          ) : isVerified ? (
                                            <Play className="w-2.5 h-2.5 fill-current shrink-0" />
                                          ) : (
                                            <XCircle className="w-2.5 h-2.5 shrink-0" />
                                          )}
                                          {!listCardCollapsePreviewText && (
                                            <span className="text-xs font-black uppercase whitespace-nowrap">
                                              {isScript
                                                ? isVerified
                                                  ? 'Preview'
                                                  : 'Locked'
                                                : previewUrl === activeUrl
                                                  ? 'Stop'
                                                  : isVerified
                                                    ? 'Preview'
                                                    : 'Locked'}
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>

                              {(() => {
                                const cardGaps = announcementGaps.filter(g => g.announcementId === s.id);
                                const cardConflicts = announcementConflicts.filter(
                                  c => c.announcement1.id === s.id || c.announcement2.id === s.id
                                );
                                if (cardGaps.length === 0 && cardConflicts.length === 0) return null;

                                return (
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1 border-t border-slate-200/60">
                                    {cardConflicts.map((c, cIdx) => (
                                      <span
                                        key={`conf-inact-${cIdx}`}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold leading-tight select-none bg-amber-50 text-amber-800 border border-amber-200/90"
                                        title={c.message}
                                      >
                                        <AlertCircle className="w-3 h-3 shrink-0 text-amber-600" />
                                        <span>Timeslot Conflict</span>
                                      </span>
                                    ))}
                                    {cardGaps.map((g, gIdx) => (
                                      <span
                                        key={`gap-inact-${gIdx}`}
                                        className={cn(
                                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold leading-tight select-none',
                                          g.severity === 'critical'
                                            ? 'bg-red-50 text-red-700 border border-red-200/90 font-black'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200/90'
                                        )}
                                        title={g.message}
                                      >
                                        <AlertCircle
                                          className={cn(
                                            'w-3 h-3 shrink-0',
                                            g.severity === 'critical' ? 'text-red-500' : 'text-amber-600'
                                          )}
                                        />
                                        <span>{g.shortNotice}</span>
                                      </span>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
