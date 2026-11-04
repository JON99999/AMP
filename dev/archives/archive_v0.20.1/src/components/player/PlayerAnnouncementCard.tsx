import React from 'react';
import { format, addMinutes, parseISO } from 'date-fns';
import {
  Play,
  Square,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  X,
  FileText,
  Volume2,
  HelpCircle,
} from 'lucide-react';
import { Announcement, LogEntry, Show } from '../../types';
import {
  cn,
  getMP3Status,
  isTimeInShow,
  getShowShade,
  getActiveMp3ForSlot,
  getGatedAssetType,
  formatRotatedAnnouncementName,
} from '../../lib/utils';
import { isLogForStationSlot } from '../../lib/compatibility';
import { availableFilesCache, mp3DurationCache } from '../../lib/audioCache';
import { WaveformVisualizer } from '../WaveformVisualizer';

export interface LiveCardEntry {
  key: string;
  slot: Date;
  announcement: Announcement;
  playedLog?: LogEntry;
  played: boolean;
  exported: boolean;
  isCompleted: boolean;
  isCurrentlyPlaying: boolean;
}

export type PlaylistTimelineEntry =
  | {
      type: 'header';
      id: string;
      show: Show;
      startTime: Date;
      playlistFile: string | null;
      trackCount: number;
    }
  | {
      type: 'track';
      id: string;
      track: {
        id: string;
        fileName: string;
        title: string;
        artist?: string;
        albumArtist?: string;
        album?: string;
        durationSeconds: number;
        durationFormatted: string;
        streamUrl: string;
      };
      trackNumber: number;
      startTime: Date;
      endTime: Date;
      played?: boolean;
      playedAt?: string;
      cancelled?: boolean;
      isOverrun?: boolean;
    }
  | {
      type: 'break';
      id: string;
      slotTime: Date;
      startTime: Date;
      endTime: Date;
      announcements: Announcement[];
      isOverrun?: boolean;
      played?: boolean;
      playedAt?: string;
      cancelled?: boolean;
    }
  | {
      type: 'show-end';
      id: string;
      showEnd: Date;
      diffSeconds: number;
      diffFormatted: string;
      status: 'over' | 'under' | 'exact';
      startTime: Date;
    }
  | {
      type: 'extra-tracks';
      id: string;
      totalExtraSeconds: number;
      extraFormatted: string;
      startTime: Date;
    };

export function formatPlayerTime(time: number): string {
  if (isNaN(time) || time === Infinity) return '0:00';
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface LiveToBeCardProps {
  key?: React.Key;
  cardEntry: LiveCardEntry;
  zone: 'past' | 'now' | 'future';
  shows: Show[];
  sortedShows: any[];
  nowExactMs: number;
  windowBeforeMinutes: number;
  windowAfterMinutes: number;
  playingStates: Record<string, { currentTime: number; duration: number }>;
  resolvedAdminContact: string;
  onPlay: (s: Announcement, slot: Date) => void;
  onOpenHelpPopup: (card: { name: string; timeLabel: string; errorLabel: string }) => void;
}

const DAYS_ORDER = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function LiveToBeCard({
  cardEntry,
  zone,
  shows,
  sortedShows,
  nowExactMs,
  windowBeforeMinutes,
  windowAfterMinutes,
  playingStates,
  resolvedAdminContact,
  onPlay,
  onOpenHelpPopup,
}: LiveToBeCardProps) {
  const { slot, announcement: s, playedLog, played, exported, isCurrentlyPlaying } = cardEntry;
  const isExpanded = zone === 'now';
  const slotKey = `${slot.toISOString()}-${s.id}`;
  const activeMp3 = getActiveMp3ForSlot(s, slot);
  const isScript = getGatedAssetType(activeMp3) === 'script';
  const activeMp3Url = activeMp3?.mp3Url || '';
  const status = getMP3Status(activeMp3Url);
  const isVerified = isScript ? status.exists : status.exists && status.valid;

  const dayName = DAYS_ORDER[slot.getDay()];
  const activeShow = shows.find(
    (sh) =>
      sh.active !== false && isTimeInShow(sh, dayName, slot.getHours(), slot.getMinutes())
  );
  const showShade = activeShow
    ? getShowShade(activeShow, sortedShows)
    : {
        bg: 'var(--show-shade-none-bg, #f1f5f9)',
        border: 'var(--show-shade-none-border, #cbd5e1)',
        title: 'No active show scheduled',
      };

  const isCompleted = !isCurrentlyPlaying && (played || exported);
  const isMissed = zone === 'past' && !isCompleted && !isCurrentlyPlaying;
  const isNext = zone === 'future' && !isCompleted && !isCurrentlyPlaying;
  const isReadNow = zone === 'now' && !isCompleted && !isCurrentlyPlaying && isScript;
  const isPlayNow = zone === 'now' && !isCompleted && !isCurrentlyPlaying && !isScript;
  const isNow = isExpanded || isReadNow || isPlayNow || isCurrentlyPlaying;
  const isMutedGray = !isNow && !isMissed && isVerified;

  // Roadmap #17: 4-Stage Per-Card Escalating Urgency
  const minutesSinceSlot = (nowExactMs - slot.getTime()) / 60000;
  const minutesSinceEntry =
    (nowExactMs - (slot.getTime() - windowAfterMinutes * 60000)) / 60000;
  const isUnplayedNowCard =
    isNow && isVerified && !isCurrentlyPlaying && !isCompleted && (isReadNow || isPlayNow);
  const isCardNewlyAdded =
    isUnplayedNowCard && minutesSinceEntry >= 0 && minutesSinceEntry <= 0.45;

  let cardUrgencyStage: 0 | 1 | 2 | 3 | 4 = 0;
  if (isUnplayedNowCard) {
    if (minutesSinceSlot < 0) {
      cardUrgencyStage = 1;
    } else if (minutesSinceSlot < Math.max(1, windowBeforeMinutes * 0.4)) {
      cardUrgencyStage = 2;
    } else if (minutesSinceSlot < Math.max(2, windowBeforeMinutes * 0.8)) {
      cardUrgencyStage = 3;
    } else {
      cardUrgencyStage = 4;
    }
  }

  const cardUrgencySurfaceClass = cardUrgencyStage === 4 ? 'tobe-card-urgency-4' : '';
  const cardUrgencyAnimClass = !isUnplayedNowCard
    ? ''
    : cardUrgencyStage === 4
      ? 'amp-card-stage4-strobe'
      : cardUrgencyStage === 3
        ? 'amp-card-stage3-pulse'
        : cardUrgencyStage === 2
          ? 'amp-card-stage2-pulse'
          : isCardNewlyAdded
            ? 'amp-card-entry-pulse'
            : '';

  const cardBorderClass = !isVerified
    ? 'border-amber-500'
    : isCurrentlyPlaying
      ? 'border-purple-600 ring-1 ring-purple-600/40'
      : isReadNow || isPlayNow
        ? isScript
          ? 'border-emerald-600 ring-1 ring-emerald-600/30'
          : 'border-purple-600 ring-1 ring-purple-600/30'
        : isMissed
          ? 'border-rose-500'
          : 'border-slate-300';

  const cardBgClass = !isVerified
    ? 'bg-[#fffbeb]'
    : isCurrentlyPlaying
      ? 'bg-white'
      : isReadNow
        ? 'bg-[#f0fdf4]'
        : isPlayNow
          ? 'bg-[#faf5ff]'
          : isMissed
            ? 'bg-[#fff1f2]'
            : 'bg-white';

  const cardOpacityClass = isMutedGray
    ? 'opacity-75'
    : isMissed || !isVerified
      ? 'opacity-95'
      : 'opacity-100';

  // Badge labels
  const playByDate = addMinutes(slot, windowBeforeMinutes);
  const playByBadgeLabel = `by ${format(playByDate, 'h:mm')}`;
  const missedBorderMs = slot.getTime() + windowBeforeMinutes * 60000;
  const missedMinutesAgo = Math.max(1, Math.floor((nowExactMs - missedBorderMs) / 60000));
  const missedAgoLabel = `${missedMinutesAgo}m ago`;

  const futureDiffMins = Math.max(1, Math.ceil((slot.getTime() - nowExactMs) / 60000));
  const futureBadgeLabel =
    futureDiffMins >= 60
      ? `in ${Math.floor(futureDiffMins / 60)}h ${futureDiffMins % 60}m`
      : `in ${futureDiffMins}m`;

  const fileInCache = availableFilesCache.get(activeMp3Url);
  const resolvedUrl = fileInCache ? fileInCache.path : activeMp3Url;

  const currentTimeSec = playingStates[slotKey]?.currentTime || 0;
  const totalDurationSec = playingStates[slotKey]?.duration || 0;
  const remainingSec = Math.max(0, totalDurationSec - currentTimeSec);

  return (
    <div
      data-slot-time={slot.toISOString()}
      className={cn(
        'flex items-stretch gap-2 w-full relative shrink-0 py-1 pr-1',
        isExpanded
          ? 'min-h-[5.5rem]'
          : isMissed
            ? 'min-h-[5.25rem]'
            : 'min-h-[4.5rem]'
      )}
      style={{ backgroundColor: showShade.bg }}
    >
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 z-10',
          isExpanded ? 'w-1.5' : 'w-1'
        )}
        style={{ backgroundColor: showShade.bg }}
        title={showShade.title}
      />

      <div
        onClick={() => (isVerified ? onPlay(s, slot) : null)}
        title={
          !isVerified
            ? `${!status.exists ? 'File not found.' : isScript ? 'Invalid script file.' : 'File not mp3.'} — Admin Contact: ${resolvedAdminContact}`
            : undefined
        }
        style={{
          borderLeftColor: !isVerified
            ? '#f59e0b'
            : cardUrgencyStage === 4
              ? '#e11d48'
              : cardUrgencyStage === 3
                ? '#f59e0b'
                : s.isUpNextPromo
                  ? '#0d9488'
                  : isScript
                    ? '#3b82f6'
                    : '#a855f7',
        }}
        className={cn(
          'flex-1 min-w-0 rounded border shadow-sm transition-colors flex flex-col justify-between select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left overflow-hidden',
          isExpanded ? 'p-2 gap-0.5 ml-1.5' : 'p-1.5 gap-0.5 ml-1',
          'border-l-[4px] rounded-l-none',
          !isScript && isVerified ? 'pb-[1px]' : '',
          !isVerified ? 'tobe-missed-amber-card' : isMissed ? 'tobe-alert-card' : '',
          cardBorderClass,
          cardBgClass,
          cardOpacityClass,
          cardUrgencySurfaceClass,
          cardUrgencyAnimClass
        )}
      >
        {/* Header: Date & Time + Status Pill */}
        <div
          className={cn(
            'flex justify-between items-center gap-1 bg-slate-50 rounded-t shrink-0 border-b border-slate-200/80 whitespace-nowrap',
            isExpanded
              ? '-mx-2 -mt-2 px-2 pt-1 pb-[2px]'
              : '-mx-1.5 -mt-1.5 px-1.5 py-0.5'
          )}
        >
          <div className="flex items-center gap-1 leading-none whitespace-nowrap shrink-0">
            <span
              className={cn(
                'uppercase font-black tracking-tighter text-xs',
                isExpanded
                  ? 'text-slate-700'
                  : isMutedGray
                    ? 'text-slate-500'
                    : 'text-slate-600'
              )}
            >
              {format(slot, 'MMM dd')}
            </span>
            <span
              className={cn(
                'font-sans font-black tabular-nums text-xs',
                !isVerified
                  ? 'text-amber-800'
                  : isMissed || cardUrgencyStage === 4
                    ? 'text-rose-700'
                    : isReadNow
                      ? 'text-emerald-700'
                      : isPlayNow
                        ? 'text-purple-700'
                        : isMutedGray
                          ? 'text-slate-600'
                          : 'text-slate-700'
              )}
            >
              {format(slot, 'h:mm a')}
            </span>
          </div>

          {isCurrentlyPlaying ? (
            <span
              className={cn(
                'bg-purple-600 text-white rounded font-black uppercase leading-none animate-pulse shrink-0',
                isExpanded ? 'text-xs px-2 py-0.5' : 'text-xs px-1.5 py-0.5'
              )}
            >
              Playing
            </span>
          ) : isReadNow || isPlayNow ? (
            <span
              className={cn(
                cardUrgencyStage === 4
                  ? 'bg-rose-600 text-white font-black'
                  : 'bg-slate-200 text-slate-700 font-bold rec-distinct-header-pill',
                'rounded tabular-nums leading-none whitespace-nowrap shrink-0 text-xs px-1.5 py-0.5'
              )}
            >
              {playByBadgeLabel}
            </span>
          ) : isMissed ? (
            <span
              className={cn(
                'bg-rose-600 text-white rounded flex flex-col items-center justify-center leading-none',
                isExpanded ? 'px-2.5 py-1 gap-0.5' : 'px-2 py-0.5 gap-0.5'
              )}
            >
              <span className="text-xs font-black uppercase leading-none">Missed</span>
              <span className="text-[10px] font-bold tabular-nums leading-none">
                {missedAgoLabel}
              </span>
            </span>
          ) : isNext ? (
            <span
              className={cn(
                'bg-slate-200 text-slate-700 rounded font-bold tabular-nums leading-none rec-distinct-header-pill',
                isExpanded ? 'text-xs px-2.5 py-1' : 'text-xs px-2 py-1'
              )}
            >
              {futureBadgeLabel}
            </span>
          ) : isCompleted ? (
            <span
              className={cn(
                'bg-slate-200 text-slate-700 rounded font-bold uppercase leading-none rec-distinct-header-pill',
                isExpanded ? 'text-xs px-2.5 py-1' : 'text-xs px-2 py-1'
              )}
            >
              {exported ? 'Exported' : isScript ? 'Read' : 'Played'}
            </span>
          ) : null}
        </div>

        {/* Track Row: Title + Action Icon */}
        <div
          className={cn(
            'flex justify-between gap-1.5',
            isExpanded
              ? 'flex-1 items-stretch min-h-[2.25rem] mt-[2px] mb-0.5'
              : isMissed
                ? 'flex-1 items-stretch min-h-[2rem] mt-[2px] mb-0.5'
                : 'items-center shrink-0'
          )}
        >
          <div
            className={cn(
              'leading-tight break-words flex-1 flex flex-col justify-center',
              isExpanded
                ? 'text-sm font-black line-clamp-2'
                : isMissed
                  ? 'text-xs font-bold line-clamp-2'
                  : 'text-xs font-bold line-clamp-1',
              isCurrentlyPlaying
                ? 'text-purple-700'
                : cardUrgencyStage === 4
                  ? 'text-rose-900 font-black'
                  : isReadNow
                    ? 'text-emerald-800 font-black'
                    : isMutedGray
                      ? 'text-slate-600'
                      : 'text-slate-800'
            )}
          >
            {formatRotatedAnnouncementName(s.name, activeMp3)}
          </div>

          {isScript ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isVerified) onPlay(s, slot);
              }}
              className={cn(
                'shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border',
                isExpanded
                  ? 'self-stretch min-h-[2.25rem] px-3 my-[1px] rounded-lg'
                  : isMissed
                    ? 'self-stretch min-h-[2rem] px-2.5 my-[1px] rounded-md'
                    : 'rounded-full p-1',
                !isVerified
                  ? 'bg-amber-50 text-amber-600 border-amber-300'
                  : isCurrentlyPlaying
                    ? 'bg-slate-900 text-white border-slate-700'
                    : isMissed || cardUrgencyStage === 4
                      ? 'bg-rose-600 text-white hover:bg-rose-700 border-rose-500 shadow-md'
                      : isReadNow
                        ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700 border-emerald-500'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn'
              )}
              title={
                !isVerified
                  ? 'Invalid or missing file'
                  : isCurrentlyPlaying
                    ? 'Stop Audio'
                    : isCompleted
                      ? 'Read Again'
                      : isReadNow
                        ? 'Read Now'
                        : 'Display Script'
              }
            >
              {!isVerified ? (
                <X
                  className={isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5'}
                />
              ) : isCurrentlyPlaying ? (
                <Square
                  className={cn(
                    isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5',
                    'fill-current'
                  )}
                />
              ) : isCompleted ? (
                <RefreshCw
                  className={isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5'}
                />
              ) : (
                <FileText
                  className={isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5'}
                />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isVerified) onPlay(s, slot);
              }}
              className={cn(
                'shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border',
                isExpanded
                  ? 'self-stretch min-h-[2.25rem] px-3 my-[1px] rounded-lg'
                  : isMissed
                    ? 'self-stretch min-h-[2rem] px-2.5 my-[1px] rounded-md'
                    : 'rounded-full p-1',
                !isVerified
                  ? 'bg-amber-50 text-amber-600 border-amber-300'
                  : isCurrentlyPlaying
                    ? 'bg-slate-900 text-white border-slate-700'
                    : isMissed || cardUrgencyStage === 4
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md hover:bg-rose-700'
                      : isPlayNow
                        ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700 border-purple-500'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn'
              )}
              title={
                !isVerified
                  ? 'Invalid or missing file'
                  : isCurrentlyPlaying
                    ? 'Stop Audio'
                    : isCompleted
                      ? 'Play Again'
                      : 'Play Now'
              }
            >
              {!isVerified ? (
                <X
                  className={isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5'}
                />
              ) : isCurrentlyPlaying ? (
                <Square
                  className={cn(
                    isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5',
                    'fill-current'
                  )}
                />
              ) : isCompleted ? (
                <RefreshCw
                  className={isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5'}
                />
              ) : (
                <Play
                  className={cn(
                    isExpanded ? 'w-5 h-5' : isMissed ? 'w-4 h-4' : 'w-2.5 h-2.5',
                    'fill-current'
                  )}
                />
              )}
            </button>
          )}
        </div>

        {/* Status & Details */}
        <div className="flex flex-col gap-[1px] shrink-0">
          <div className="flex items-center justify-between">
            {isVerified ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  {isCurrentlyPlaying ? (
                    <>
                      <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                      <span className="font-bold text-purple-600 uppercase tracking-tighter text-xs">
                        Playing
                      </span>
                    </>
                  ) : isMissed ? (
                    <>
                      <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                      <span className="font-bold uppercase tracking-tighter text-xs text-rose-700">
                        Missed
                      </span>
                    </>
                  ) : isReadNow ? (
                    <>
                      <Clock
                        className={cn(
                          'w-2.5 h-2.5',
                          cardUrgencyStage === 4 ? 'text-rose-600' : 'text-emerald-600'
                        )}
                      />
                      <span
                        className={cn(
                          'font-black uppercase tracking-tighter text-xs',
                          cardUrgencyStage === 4 ? 'text-rose-700' : 'text-emerald-700'
                        )}
                      >
                        Read Now
                      </span>
                    </>
                  ) : isPlayNow ? (
                    <>
                      <Clock
                        className={cn(
                          'w-2.5 h-2.5',
                          cardUrgencyStage === 4 ? 'text-rose-600' : 'text-purple-600'
                        )}
                      />
                      <span
                        className={cn(
                          'font-black uppercase tracking-tighter text-xs',
                          cardUrgencyStage === 4 ? 'text-rose-700' : 'text-purple-700'
                        )}
                      >
                        Play Now
                      </span>
                    </>
                  ) : isCompleted ? (
                    <>
                      <CheckCircle className="w-2.5 h-2.5 text-slate-400" />
                      <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                        {exported
                          ? 'Exported'
                          : isScript
                            ? playedLog?.status === 'backup play'
                              ? 'Played'
                              : 'Read'
                            : 'Played'}{' '}
                        {playedLog
                          ? format(
                              parseISO(playedLog.logTimeStamp || playedLog.timestamp),
                              'h:mm a'
                            )
                          : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-2.5 h-2.5 text-slate-400" />
                      <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                        {isScript ? 'To Be Read' : 'To Be Played'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1.5 w-full">
                <div className="flex items-center gap-1 min-w-0">
                  <AlertCircle className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                  <span className="font-bold uppercase tracking-tighter text-xs truncate text-amber-700">
                    {!status.exists
                      ? 'File not found.'
                      : isScript
                        ? 'Invalid script file.'
                        : 'File not mp3.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHelpPopup({
                      name: s.name,
                      timeLabel: format(slot, 'MMM dd · h:mm a'),
                      errorLabel: !status.exists
                        ? 'File not found.'
                        : isScript
                          ? 'Invalid script file.'
                          : 'File not mp3.',
                    });
                  }}
                  title={`Admin Contact: ${resolvedAdminContact}`}
                  className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-tight flex items-center gap-0.5 cursor-pointer"
                >
                  <HelpCircle className="w-2.5 h-2.5 shrink-0" />
                  <span>Get Help</span>
                </button>
              </div>
            )}

            {isCurrentlyPlaying ? (
              <div className="flex items-center gap-1 font-sans font-bold tabular-nums leading-none text-purple-600 text-xs">
                <span>{formatPlayerTime(currentTimeSec)}</span>
                <span className="opacity-30">/</span>
                <span>-{formatPlayerTime(remainingSec)}</span>
              </div>
            ) : isVerified ? (
              <span className="font-sans font-bold tabular-nums text-slate-500 leading-none text-xs">
                {isScript
                  ? activeMp3?.approximateReadTime
                    ? activeMp3.approximateReadTime.startsWith('~')
                      ? activeMp3.approximateReadTime
                      : `~${activeMp3.approximateReadTime}`
                    : '-:--'
                  : mp3DurationCache.get(activeMp3Url) ||
                    mp3DurationCache.get(resolvedUrl) ||
                    fileInCache?.duration ||
                    activeMp3?.duration ||
                    '--:--'}
              </span>
            ) : null}
          </div>

          {((!isScript && isVerified) ||
            (isScript && activeMp3?.backupMp3Url && isCurrentlyPlaying)) && (
            <WaveformVisualizer
              url={
                isScript
                  ? availableFilesCache.get(activeMp3?.backupMp3Url || '')?.path ||
                    activeMp3?.backupMp3Url ||
                    ''
                  : resolvedUrl
              }
              currentTime={isCurrentlyPlaying ? currentTimeSec : 0}
              duration={totalDurationSec}
              isPlaying={isCurrentlyPlaying}
              isPlayed={isCompleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface PrerecordAnnouncementCardProps {
  key?: React.Key;
  announcement: Announcement;
  slot: Date;
  showShade: { bg: string; border: string; title?: string };
  logs: LogEntry[];
  playingStates: Record<string, { currentTime: number; duration: number }>;
  isAudioPlaying: (key: string) => boolean;
  resolvedAdminContact: string;
  onPlay: (s: Announcement, slot: Date) => void;
  onOpenHelpPopup: (card: { name: string; timeLabel: string; errorLabel: string }) => void;
}

export function PrerecordAnnouncementCard({
  announcement: s,
  slot,
  showShade,
  logs,
  playingStates,
  isAudioPlaying,
  resolvedAdminContact,
  onPlay,
  onOpenHelpPopup,
}: PrerecordAnnouncementCardProps) {
  const playedLog = logs.find(
    (l) =>
      l.announcementId === s.id &&
      isLogForStationSlot(l, slot) &&
      (l.status === 'played' || l.status === 'backup play')
  );
  const played = !!playedLog && playedLog.playMode !== 'Export';
  const exported = !!playedLog && playedLog.playMode === 'Export';
  const slotKey = `${slot.toISOString()}-${s.id}`;
  const activeMp3 = getActiveMp3ForSlot(s, slot);
  const isScript = getGatedAssetType(activeMp3) === 'script';
  const activeMp3Url = activeMp3?.mp3Url || '';
  const status = getMP3Status(activeMp3Url);
  const isVerified = isScript ? status.exists : status.exists && status.valid;
  const isCurrentlyPlaying = !!playingStates[slotKey] || isAudioPlaying(slotKey);
  const isCompleted = !isCurrentlyPlaying && (played || exported);
  const isUnread = !isCompleted && !isCurrentlyPlaying;
  const isExpanded = isUnread && isVerified;
  const isReadNow = isUnread && isVerified && isScript;
  const isPlayNow = isUnread && isVerified && !isScript;
  const isMutedGray = isCompleted && isVerified;

  const fileInCache = availableFilesCache.get(activeMp3Url);
  const resolvedUrl = fileInCache ? fileInCache.path : activeMp3Url;

  const currentTimeSec = playingStates[slotKey]?.currentTime || 0;
  const totalDurationSec = playingStates[slotKey]?.duration || 0;
  const remainingSec = Math.max(0, totalDurationSec - currentTimeSec);

  const cardBorderClass = !isVerified
    ? 'border-amber-500'
    : isCurrentlyPlaying
      ? 'border-purple-600 ring-1 ring-purple-600/40'
      : isReadNow
        ? 'border-emerald-600 ring-1 ring-emerald-600/30'
        : isPlayNow
          ? 'border-purple-600 ring-1 ring-purple-600/30'
          : 'border-slate-300';

  const cardBgClass = !isVerified
    ? 'bg-[#fffbeb]'
    : isCurrentlyPlaying
      ? 'bg-white'
      : isReadNow
        ? 'bg-[#f0fdf4]'
        : isPlayNow
          ? 'bg-[#faf5ff]'
          : 'bg-white';

  const cardOpacityClass = isMutedGray
    ? 'opacity-75'
    : !isVerified
      ? 'opacity-95'
      : 'opacity-100';

  return (
    <div
      data-slot-time={slot.toISOString()}
      className={cn(
        'flex items-stretch gap-2 w-full relative shrink-0 py-1 pr-1',
        isExpanded ? 'min-h-[5.5rem]' : 'min-h-[4.5rem]'
      )}
      style={{ backgroundColor: showShade.bg }}
    >
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 z-10',
          isExpanded ? 'w-1.5' : 'w-1'
        )}
        style={{ backgroundColor: showShade.bg }}
        title={showShade.title}
      />
      <div
        onClick={() => (isVerified ? onPlay(s, slot) : null)}
        title={
          !isVerified
            ? `${!status.exists ? 'File not found.' : isScript ? 'Invalid script file.' : 'File not mp3.'} — Admin Contact: ${resolvedAdminContact}`
            : undefined
        }
        style={{
          borderLeftColor: !isVerified
            ? '#f59e0b'
            : s.isUpNextPromo
              ? '#0d9488'
              : isScript
                ? '#3b82f6'
                : '#a855f7',
        }}
        className={cn(
          'flex-1 min-w-0 rounded border shadow-sm transition-colors flex flex-col justify-between select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left overflow-hidden',
          isExpanded ? 'p-2 gap-0.5 ml-1.5' : 'p-1.5 gap-0.5 ml-1',
          'border-l-[4px] rounded-l-none',
          !isScript && isVerified ? 'pb-[1px]' : '',
          !isVerified ? 'tobe-missed-amber-card' : '',
          cardBorderClass,
          cardBgClass,
          cardOpacityClass
        )}
      >
        {/* Header: Date & Time + Completed/Playing Pill */}
        <div
          className={cn(
            'flex justify-between items-center gap-1 bg-slate-50 rounded-t shrink-0 border-b border-slate-200/80 whitespace-nowrap',
            isExpanded
              ? '-mx-2 -mt-2 px-2 pt-1 pb-[2px]'
              : '-mx-1.5 -mt-1.5 px-1.5 py-0.5'
          )}
        >
          <div className="flex items-center gap-1 leading-none whitespace-nowrap shrink-0">
            <span
              className={cn(
                'uppercase font-black tracking-tighter text-xs',
                isExpanded
                  ? 'text-slate-700'
                  : isMutedGray
                    ? 'text-slate-500'
                    : 'text-slate-600'
              )}
            >
              {format(slot, 'MMM dd')}
            </span>
            <span
              className={cn(
                'font-sans font-black tabular-nums text-xs',
                !isVerified
                  ? 'text-amber-800'
                  : isReadNow
                    ? 'text-emerald-700'
                    : isPlayNow
                      ? 'text-purple-700'
                      : isMutedGray
                        ? 'text-slate-600'
                        : 'text-slate-700'
              )}
            >
              {format(slot, 'h:mm a')}
            </span>
          </div>

          {isCurrentlyPlaying ? (
            <span
              className={cn(
                'bg-purple-600 text-white rounded font-black uppercase leading-none animate-pulse shrink-0',
                isExpanded ? 'text-xs px-2 py-0.5' : 'text-xs px-1.5 py-0.5'
              )}
            >
              Playing
            </span>
          ) : isCompleted ? (
            <span className="bg-slate-200 text-slate-700 rounded font-bold uppercase leading-none rec-distinct-header-pill text-xs px-2 py-1">
              {exported
                ? 'Exported'
                : isScript
                  ? playedLog?.status === 'backup play'
                    ? 'Played'
                    : 'Read'
                  : 'Played'}
            </span>
          ) : null}
        </div>

        {/* Track Row: Title + Action Icon */}
        <div
          className={cn(
            'flex justify-between gap-1.5',
            isExpanded
              ? 'flex-1 items-stretch min-h-[2.25rem] mt-[2px] mb-0.5'
              : 'items-center shrink-0'
          )}
        >
          <div
            className={cn(
              'leading-tight break-words flex-1 flex flex-col justify-center',
              isExpanded
                ? 'text-sm font-black line-clamp-2'
                : 'text-xs font-bold line-clamp-1',
              isCurrentlyPlaying
                ? 'text-purple-700'
                : isReadNow
                  ? 'text-emerald-800 font-black'
                  : isMutedGray
                    ? 'text-slate-600'
                    : 'text-slate-800'
            )}
          >
            {formatRotatedAnnouncementName(s.name, activeMp3)}
          </div>

          {isScript ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isVerified) onPlay(s, slot);
              }}
              className={cn(
                'shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border',
                isExpanded
                  ? 'self-stretch min-h-[2.25rem] px-3 my-[1px] rounded-lg'
                  : 'rounded-full p-1',
                !isVerified
                  ? 'bg-amber-50 text-amber-600 border-amber-300'
                  : isCurrentlyPlaying
                    ? 'bg-slate-900 text-white border-slate-700'
                    : isReadNow
                      ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700 border-emerald-500'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn'
              )}
              title={
                !isVerified
                  ? 'Invalid or missing file'
                  : isCurrentlyPlaying
                    ? 'Stop Audio'
                    : isCompleted
                      ? 'Read Again'
                      : 'Read Now'
              }
            >
              {!isVerified ? (
                <X className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
              ) : isCurrentlyPlaying ? (
                <Square
                  className={cn(isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5', 'fill-current')}
                />
              ) : isCompleted ? (
                <RefreshCw className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
              ) : (
                <FileText className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isVerified) onPlay(s, slot);
              }}
              className={cn(
                'shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border',
                isExpanded
                  ? 'self-stretch min-h-[2.25rem] px-3 my-[1px] rounded-lg'
                  : 'rounded-full p-1',
                !isVerified
                  ? 'bg-amber-50 text-amber-600 border-amber-300'
                  : isCurrentlyPlaying
                    ? 'bg-slate-900 text-white border-slate-700'
                    : isPlayNow
                      ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700 border-purple-500'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn'
              )}
              title={
                !isVerified
                  ? 'Invalid or missing file'
                  : isCurrentlyPlaying
                    ? 'Stop Audio'
                    : isCompleted
                      ? 'Play Again'
                      : 'Play Now'
              }
            >
              {!isVerified ? (
                <X className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
              ) : isCurrentlyPlaying ? (
                <Square
                  className={cn(isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5', 'fill-current')}
                />
              ) : isCompleted ? (
                <RefreshCw className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
              ) : (
                <Play
                  className={cn(isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5', 'fill-current')}
                />
              )}
            </button>
          )}
        </div>

        {/* Status & Details */}
        <div className="flex flex-col gap-[1px] shrink-0">
          <div className="flex items-center justify-between">
            {isVerified ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  {isCurrentlyPlaying ? (
                    <>
                      <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                      <span className="font-bold text-purple-600 uppercase tracking-tighter text-xs">
                        Playing
                      </span>
                    </>
                  ) : isReadNow ? (
                    <>
                      <Clock className="w-2.5 h-2.5 text-emerald-600" />
                      <span className="font-black uppercase tracking-tighter text-xs text-emerald-700">
                        Read Now
                      </span>
                    </>
                  ) : isPlayNow ? (
                    <>
                      <Clock className="w-2.5 h-2.5 text-purple-600" />
                      <span className="font-black uppercase tracking-tighter text-xs text-purple-700">
                        Play Now
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-2.5 h-2.5 text-slate-400" />
                      <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                        {exported
                          ? 'Exported'
                          : isScript
                            ? playedLog?.status === 'backup play'
                              ? 'Played'
                              : 'Read'
                            : 'Played'}{' '}
                        {playedLog
                          ? format(
                              parseISO(playedLog.logTimeStamp || playedLog.timestamp),
                              'h:mm a'
                            )
                          : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1.5 w-full">
                <div className="flex items-center gap-1 min-w-0">
                  <AlertCircle className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                  <span className="font-bold uppercase tracking-tighter text-xs truncate text-amber-700">
                    {!status.exists
                      ? 'File not found.'
                      : isScript
                        ? 'Invalid script file.'
                        : 'File not mp3.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHelpPopup({
                      name: s.name,
                      timeLabel: format(slot, 'MMM dd · h:mm a'),
                      errorLabel: !status.exists
                        ? 'File not found.'
                        : isScript
                          ? 'Invalid script file.'
                          : 'File not mp3.',
                    });
                  }}
                  title={`Admin Contact: ${resolvedAdminContact}`}
                  className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-tight flex items-center gap-0.5 cursor-pointer"
                >
                  <HelpCircle className="w-2.5 h-2.5 shrink-0" />
                  <span>Get Help</span>
                </button>
              </div>
            )}

            {isCurrentlyPlaying ? (
              <div className="flex items-center gap-1 font-sans font-bold tabular-nums leading-none text-purple-600 text-xs">
                <span>{formatPlayerTime(currentTimeSec)}</span>
                <span className="opacity-30">/</span>
                <span>-{formatPlayerTime(remainingSec)}</span>
              </div>
            ) : isVerified ? (
              <span className="font-sans font-bold tabular-nums text-slate-500 leading-none text-xs">
                {isScript
                  ? activeMp3?.approximateReadTime
                    ? activeMp3.approximateReadTime.startsWith('~')
                      ? activeMp3.approximateReadTime
                      : `~${activeMp3.approximateReadTime}`
                    : '-:--'
                  : mp3DurationCache.get(activeMp3Url) ||
                    mp3DurationCache.get(resolvedUrl) ||
                    fileInCache?.duration ||
                    activeMp3?.duration ||
                    '--:--'}
              </span>
            ) : null}
          </div>

          {((!isScript && isVerified) ||
            (isScript && activeMp3?.backupMp3Url && isCurrentlyPlaying)) && (
            <WaveformVisualizer
              url={
                isScript
                  ? availableFilesCache.get(activeMp3?.backupMp3Url || '')?.path ||
                    activeMp3?.backupMp3Url ||
                    ''
                  : resolvedUrl
              }
              currentTime={isCurrentlyPlaying ? currentTimeSec : 0}
              duration={totalDurationSec}
              isPlaying={isCurrentlyPlaying}
              isPlayed={isCompleted}
            />
          )}
        </div>
      </div>
    </div>
  );
}
