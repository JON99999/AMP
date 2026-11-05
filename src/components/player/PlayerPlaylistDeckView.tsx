import React, { Fragment } from 'react';
import {
  format,
  isSameMinute,
  isBefore,
  isAfter,
  differenceInSeconds,
  parseISO,
} from 'date-fns';
import {
  Play,
  Square,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  X,
  RadioTower,
  CassetteTape,
  Ear,
  FileText,
  Volume2,
  ListMusic,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Flag,
  ListPlus,
  HelpCircle,
} from 'lucide-react';
import { Announcement, LogEntry, Show } from '../../types';
import {
  cn,
  getMP3Status,
  isTimeInShow,
  getSortedShows,
  getShowShade,
  Mp3ID3Metadata,
  getActiveMp3ForSlot,
  getGatedAssetType,
  formatRotatedAnnouncementName,
} from '../../lib/utils';
import { isLogForStationSlot } from '../../lib/compatibility';
import { availableFilesCache, mp3DurationCache } from '../../lib/audioCache';
import { WaveformVisualizer } from '../WaveformVisualizer';
import { PlaylistTimelineEntry, formatPlayerTime } from './PlayerAnnouncementCard';

interface PlayerPlaylistDeckViewProps {
  playMode: string;
  effectiveShow: Show | null;
  shows: Show[];
  now: Date;
  logs: LogEntry[];
  isPlaylistLoading: boolean;
  playlistFolderType: 'Playlists' | 'Evergreens';
  playlistTimeline: PlaylistTimelineEntry[];
  playlistTracks: Array<{
    id: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }>;
  playedPlaylistTracks: Record<
    string,
    {
      id?: string;
      playedAt: string;
      fileName: string;
      title: string;
      artist?: string;
      albumArtist?: string;
      album?: string;
      durationSeconds?: number;
      durationFormatted?: string;
      isAnnouncement?: boolean;
    }
  >;
  pendingPlayedPlaylistTracksRef: React.MutableRefObject<
    Record<string, { playedAt: string; fileName: string; title: string }>
  >;
  trackMetadataMap: Record<string, Mp3ID3Metadata>;
  playingStates: Record<string, { currentTime: number; duration: number }>;
  isAudioPlaying: (key: string) => boolean;
  movedHighlightTrackId: string | null;
  resolvedAdminContact: string;
  activeItemRef: React.RefObject<HTMLDivElement | null>;
  nowSectionRef: React.MutableRefObject<HTMLDivElement | null>;
  renderCacheStatusMessage: () => React.ReactNode;
  scrollToNow: () => void;
  handleMoveTrackUp: (trackId: string) => void;
  handleMoveTrackDown: (trackId: string) => void;
  handleCancelTrack: (trackId: string) => void;
  handleReactivateTrack: (trackId: string) => void;
  handleTogglePlayTrack: (track: {
    id: string;
    fileName: string;
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }) => void;
  handleMoveBreakUp: (breakId: string) => void;
  handleMoveBreakDown: (breakId: string) => void;
  handlePlay: (s: Announcement, slot: Date) => void;
  onOpenHelpPopup: (card: { name: string; timeLabel: string; errorLabel: string }) => void;
}

export function PlayerPlaylistDeckView({
  playMode,
  effectiveShow,
  shows,
  now,
  logs,
  isPlaylistLoading,
  playlistFolderType,
  playlistTimeline,
  playlistTracks,
  playedPlaylistTracks,
  pendingPlayedPlaylistTracksRef,
  trackMetadataMap,
  playingStates,
  isAudioPlaying,
  movedHighlightTrackId,
  resolvedAdminContact,
  activeItemRef,
  nowSectionRef,
  renderCacheStatusMessage,
  scrollToNow,
  handleMoveTrackUp,
  handleMoveTrackDown,
  handleCancelTrack,
  handleReactivateTrack,
  handleTogglePlayTrack,
  handleMoveBreakUp,
  handleMoveBreakDown,
  handlePlay,
  onOpenHelpPopup,
}: PlayerPlaylistDeckViewProps) {
  const modeStr = playMode as string;

  if (!effectiveShow) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-slate-200 rounded-xl m-4 space-y-3">
        <ListMusic className="w-8 h-8 text-purple-600" />
        <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">
          No Show Selected
        </h3>
        <p className="text-xs text-slate-600 max-w-sm">
          Select a show to load its automated music tracks.
        </p>
      </div>
    );
  }

  if (isPlaylistLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-purple-700 space-x-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-xs font-black uppercase tracking-wider">
          Assembling Playlist Tracks &amp; Announcements...
        </span>
      </div>
    );
  }

  const noMp3sTooltip = `Please place .m3u playlist files or .mp3 tracks inside:\n/medialibrary/${playlistFolderType}/${effectiveShow.nameShort || effectiveShow.name}`;
  const firstUnplayedIdx = playlistTimeline.findIndex((item) => {
    if (item.type === 'track') return !item.played;
    if (item.type === 'break') {
      return item.announcements.some((s) => {
        const playedLog = logs.find(
          (l) =>
            l.announcementId === s.id &&
            isLogForStationSlot(l, item.slotTime) &&
            (l.status === 'played' || l.status === 'backup play')
        );
        return !playedLog;
      });
    }
    return false;
  });

  const unplayedTimelineCards = playlistTimeline.filter(
    (item) =>
      (item.type === 'track' && !item.played && !item.cancelled) ||
      (item.type === 'break' && !item.played && !item.cancelled)
  );

  const renderPlaylistItem = (
    item: PlaylistTimelineEntry,
    index: number,
    showInlineNowCard: boolean
  ) => {
    if (item.type === 'header') {
      return null;
    }

    const isNowPosition =
      index === firstUnplayedIdx ||
      (firstUnplayedIdx === -1 && index === playlistTimeline.length - 1);

    const nowCard =
      showInlineNowCard && isNowPosition ? (
        <div
          key="now-indicator"
          ref={activeItemRef}
          className="h-6 flex items-center justify-between px-3 rounded shadow-sm border my-1.5 ml-1 bg-blue-600 border-blue-500 text-white select-none"
          id="now-indicator"
        >
          <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
            <RadioTower className="w-3.5 h-3.5 text-white/90 shrink-0" />
            {modeStr === 'Prerecord' ? 'next' : 'now'}
          </span>
          {renderCacheStatusMessage()}
        </div>
      ) : null;

    if (item.type === 'track') {
      const isCurrentlyPlaying =
        !!playingStates[item.track.id] || isAudioPlaying(item.track.id);
      const isPlayedTrack =
        !isCurrentlyPlaying &&
        (!!item.played ||
          !!playedPlaylistTracks[item.track.id] ||
          !!playedPlaylistTracks[item.track.fileName] ||
          !!pendingPlayedPlaylistTracksRef.current[item.track.id] ||
          !!pendingPlayedPlaylistTracksRef.current[item.track.fileName]);
      const playedAtTime =
        item.playedAt ||
        playedPlaylistTracks[item.track.id]?.playedAt ||
        playedPlaylistTracks[item.track.fileName]?.playedAt ||
        pendingPlayedPlaylistTracksRef.current[item.track.id]?.playedAt ||
        pendingPlayedPlaylistTracksRef.current[item.track.fileName]?.playedAt;
      const formattedPlayedAt = playedAtTime
        ? format(parseISO(playedAtTime), 'h:mm a')
        : format(new Date(), 'h:mm a');
      const isCancelledTrack = !!item.cancelled;

      const timelineCardIdx = unplayedTimelineCards.findIndex((c) => c.id === item.id);
      const isTopCardInTimeline = timelineCardIdx === 0;
      const isBottomCardInTimeline = timelineCardIdx === unplayedTimelineCards.length - 1;

      const meta =
        trackMetadataMap[item.track.streamUrl] ||
        trackMetadataMap[item.track.fileName] ||
        trackMetadataMap[item.track.id];

      const isParsed = !!meta;

      const mp3FileName = item.track.fileName || item.track.title || '';
      const rawArtist = meta?.artist ? meta.artist.trim() : null;
      const rawAlbumArtist = meta?.albumArtist ? meta.albumArtist.trim() : null;
      const rawTitle = meta?.title ? meta.title.trim() : null;
      const rawAlbum = meta?.album ? meta.album.trim() : null;

      let row1Text: string | null = null;
      if (rawArtist && rawAlbumArtist) {
        const normArtist = rawArtist.toLowerCase();
        const normAlbumArtist = rawAlbumArtist.toLowerCase();
        if (normArtist === normAlbumArtist || normArtist.includes(normAlbumArtist)) {
          row1Text = rawArtist;
        } else {
          row1Text = `${rawArtist} (${rawAlbumArtist})`;
        }
      } else if (rawArtist) {
        row1Text = rawArtist;
      } else if (rawAlbumArtist) {
        row1Text = rawAlbumArtist;
      }

      let row2Text: string = mp3FileName;
      if (rawTitle && rawAlbum) {
        row2Text = `${rawTitle} - ${rawAlbum}`;
      } else if (rawTitle) {
        row2Text = rawTitle;
      } else if (rawAlbum) {
        row2Text = rawAlbum;
      } else {
        row2Text = mp3FileName;
      }

      const tooltipParts: string[] = [];
      if (mp3FileName) tooltipParts.push(`File: ${mp3FileName}`);
      if (rawTitle) tooltipParts.push(`Track: ${rawTitle}`);
      if (rawArtist) tooltipParts.push(`Artist: ${rawArtist}`);
      if (rawAlbumArtist) tooltipParts.push(`Album Artist: ${rawAlbumArtist}`);
      if (rawAlbum) tooltipParts.push(`Album: ${rawAlbum}`);
      if (!isParsed) tooltipParts.push(`(ID3 Tags: ...parsing...)`);

      const tooltipText = tooltipParts.join('\n');

      return (
        <Fragment key={item.id}>
          {nowCard}
          <div
            className={cn(
              'rounded border shadow-xs p-2 my-1.5 transition-all flex flex-col gap-0 select-none text-left border-l-[4px]',
              item.track ? 'pb-[1px]' : '',
              item.isOverrun ? 'border-amber-600' : '',
              item.track && item.track.id === movedHighlightTrackId
                ? 'ring-2 ring-purple-500/90 shadow-lg scale-[1.01] z-10'
                : isCurrentlyPlaying
                  ? 'ring-1 ring-purple-500/40'
                  : isPlayedTrack
                    ? 'opacity-90'
                    : isCancelledTrack
                      ? 'opacity-75'
                      : ''
            )}
            style={{
              backgroundColor: 'var(--playlist-card-bg)',
              borderColor: item.isOverrun ? '#d97706' : 'var(--playlist-card-border)',
              color: 'var(--playlist-card-text)',
              borderLeftColor: isCurrentlyPlaying
                ? '#9333ea'
                : isPlayedTrack
                  ? '#10b981'
                  : isCancelledTrack
                    ? '#94a3b8'
                    : '#a855f7',
            }}
            title={tooltipText}
          >
            <div
              className={cn(
                'flex justify-between items-center -mx-2 -mt-2 px-2 py-1 rounded-t border-b',
                item.isOverrun
                  ? 'border-amber-600/50'
                  : 'border-slate-200/60 dark:border-slate-700/60'
              )}
              style={{
                backgroundColor: item.isOverrun
                  ? 'rgba(217, 119, 6, 0.15)'
                  : 'var(--playlist-card-header-bg)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <ListMusic
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    item.isOverrun
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-purple-600 dark:text-purple-300'
                  )}
                />

                <div className="flex items-center gap-0.5 ml-0.5">
                  {!isPlayedTrack && !isCancelledTrack && (
                    <>
                      {!isTopCardInTimeline && (
                        <button
                          onClick={() => handleMoveTrackUp(item.track.id)}
                          className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                          title="Move song up in queue"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                      {!isBottomCardInTimeline && (
                        <button
                          onClick={() => handleMoveTrackDown(item.track.id)}
                          className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                          title="Move song down in queue"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelTrack(item.track.id)}
                        className="p-0.5 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-950/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                        title="Cancel song (move to bottom)"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  {isCancelledTrack && (
                    <button
                      onClick={() => handleReactivateTrack(item.track.id)}
                      className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors shadow-xs"
                      title="Reactivate song to queue"
                    >
                      <RotateCcw className="w-2.5 h-2.5 text-slate-600 dark:text-slate-300" />
                      <span>Reactivate</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={() => handleTogglePlayTrack(item.track)}
                  className={cn(
                    'w-5 h-5 rounded-full shrink-0 aspect-square transition-all shadow-xs cursor-pointer flex items-center justify-center p-0 border border-transparent',
                    isCurrentlyPlaying
                      ? 'bg-purple-700 hover:bg-purple-800 text-white'
                      : isPlayedTrack
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : isCancelledTrack
                          ? 'bg-slate-400 dark:bg-slate-700 hover:bg-slate-500 text-white'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                  )}
                  title={
                    isCurrentlyPlaying
                      ? 'Stop track'
                      : isPlayedTrack
                        ? 'Replay playlist track'
                        : 'Play track'
                  }
                >
                  {isCurrentlyPlaying ? (
                    <Square className="w-2.5 h-2.5 fill-current" />
                  ) : isPlayedTrack ? (
                    <RefreshCw className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                  )}
                </button>
              </div>
            </div>

            <div
              className={cn(
                'flex flex-col justify-start items-start text-left w-full font-sans font-normal text-xs leading-snug gap-0.5 pt-[3px] pb-[3px]',
                isCurrentlyPlaying
                  ? 'text-purple-800 dark:text-purple-200'
                  : isPlayedTrack
                    ? 'text-emerald-950 dark:text-emerald-100'
                    : isCancelledTrack
                      ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-400/60'
                      : 'text-slate-900 dark:text-slate-100'
              )}
              title={tooltipText}
            >
              {!isParsed ? (
                <div className="line-clamp-3 break-words font-sans font-normal text-xs w-full">
                  {mp3FileName}
                </div>
              ) : (
                <>
                  {row1Text && (
                    <div className="line-clamp-1 truncate font-sans font-normal text-xs w-full text-slate-600 dark:text-slate-300">
                      {row1Text}
                    </div>
                  )}
                  <div
                    className={cn(
                      'break-words font-sans font-normal text-xs w-full',
                      row1Text ? 'line-clamp-2' : 'line-clamp-3'
                    )}
                  >
                    {row2Text}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-[1px] pt-0.5">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  {isCurrentlyPlaying ? (
                    <>
                      <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tighter">
                        Playing
                      </span>
                    </>
                  ) : isPlayedTrack ? (
                    <>
                      <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                      <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-tighter">
                        Played {formattedPlayedAt}
                      </span>
                    </>
                  ) : isCancelledTrack ? (
                    <>
                      <AlertCircle className="w-2.5 h-2.5 text-slate-400" />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                        Cancelled
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-2.5 h-2.5 text-slate-500" />
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                        To be played
                      </span>
                    </>
                  )}
                </div>

                {isCurrentlyPlaying ? (
                  <div className="flex items-center gap-1 text-xs font-sans font-bold tabular-nums leading-none text-purple-600 dark:text-purple-400">
                    <span>{formatPlayerTime(playingStates[item.track.id]?.currentTime || 0)}</span>
                    <span className="opacity-30">/</span>
                    <span>
                      {formatPlayerTime(
                        playingStates[item.track.id]?.duration || item.track.durationSeconds || 0
                      )}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-sans font-bold tabular-nums text-slate-500 dark:text-slate-400 leading-none">
                    {mp3DurationCache.get(item.track.streamUrl) ||
                      availableFilesCache.get(item.track.fileName)?.duration ||
                      item.track.durationFormatted}
                  </span>
                )}
              </div>

              <WaveformVisualizer
                url={item.track.streamUrl || item.track.fileName}
                currentTime={
                  isCurrentlyPlaying ? playingStates[item.track.id]?.currentTime || 0 : 0
                }
                duration={
                  playingStates[item.track.id]?.duration || item.track.durationSeconds || 0
                }
                isPlaying={isCurrentlyPlaying}
                isPlayed={isPlayedTrack}
              />
            </div>
          </div>
        </Fragment>
      );
    }

    if (item.type === 'break') {
      const slot = item.slotTime;
      const sForSlot = item.announcements;
      const daysOrder = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ] as const;
      const dayName = daysOrder[slot.getDay()];
      const hour = slot.getHours();
      const minute = slot.getMinutes();
      const isPre = modeStr === 'Prerecord';
      const isPresent = !isPre && isSameMinute(slot, now);
      const isPast = !isPre && isBefore(slot, now) && !isPresent;
      const diffSeconds = !isPre ? Math.abs(differenceInSeconds(now, slot)) : 0;

      const timelineCardIdx = unplayedTimelineCards.findIndex((c) => c.id === item.id);
      const isTopBreakInTimeline = timelineCardIdx === 0;
      const isBottomBreakInTimeline = timelineCardIdx === unplayedTimelineCards.length - 1;
      const isBreakMovedHighlight = item.id === movedHighlightTrackId;

      return (
        <Fragment key={item.id}>
          {nowCard}
          <div className="space-y-1.5 my-1.5">
            {sForSlot.map((s, idx) => {
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
              const isCurrentlyPlaying =
                !!playingStates[slotKey] || isAudioPlaying(slotKey);
              const isCompleted = !isCurrentlyPlaying && (played || exported);

              const fileInCache = availableFilesCache.get(activeMp3Url);
              const activeShows = shows.filter((show) =>
                isTimeInShow(show, dayName, hour, minute)
              );
              const activeShow = activeShows[0] || effectiveShow;
              const sortedShows = getSortedShows(shows);
              const showShade = activeShow
                ? getShowShade(activeShow, sortedShows)
                : {
                    bg: 'var(--show-shade-none-bg, #f1f5f9)',
                    border: 'var(--show-shade-none-border, #cbd5e1)',
                    title: 'No active show scheduled',
                  };
              const resolvedUrl = fileInCache ? fileInCache.path : activeMp3Url;

              if (isPre) {
                const isUnread = !isCompleted && !isCurrentlyPlaying;
                const isExpanded = isUnread && isVerified;
                const isReadNow = isUnread && isVerified && isScript;
                const isPlayNow = isUnread && isVerified && !isScript;
                const isMutedGray = isCompleted && isVerified;
                const currentTimeSec = playingStates[slotKey]?.currentTime || 0;
                const totalDurationSec = playingStates[slotKey]?.duration || 0;
                const remainingSec = Math.max(0, totalDurationSec - currentTimeSec);

                const cardBorderClass = !isVerified
                  ? 'border-amber-500'
                  : isBreakMovedHighlight || s.id === movedHighlightTrackId
                    ? 'ring-2 ring-purple-500/90 shadow-lg scale-[1.01] z-10 border-purple-600'
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
                    key={`${slot.toISOString()}-${s.id}-${idx}`}
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
                      onClick={() => (isVerified ? handlePlay(s, slot) : null)}
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

                          {playlistTracks.length > 0 && !played && !exported && (
                            <div className="flex items-center gap-0.5">
                              {!isTopBreakInTimeline && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveBreakUp(item.id);
                                  }}
                                  className="p-0.5 text-slate-700 hover:text-purple-800 hover:bg-purple-200/60 rounded border border-slate-300 cursor-pointer transition-colors"
                                  title="Move announcement break up in queue"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                              )}
                              {!isBottomBreakInTimeline && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveBreakDown(item.id);
                                  }}
                                  className="p-0.5 text-slate-700 hover:text-purple-800 hover:bg-purple-200/60 rounded border border-slate-300 cursor-pointer transition-colors"
                                  title="Move announcement break down in queue"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}

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
                              if (isVerified) handlePlay(s, slot);
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
                                className={cn(
                                  isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5',
                                  'fill-current'
                                )}
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
                              if (isVerified) handlePlay(s, slot);
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
                                className={cn(
                                  isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5',
                                  'fill-current'
                                )}
                              />
                            ) : isCompleted ? (
                              <RefreshCw className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
                            ) : (
                              <Play
                                className={cn(
                                  isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5',
                                  'fill-current'
                                )}
                              />
                            )}
                          </button>
                        )}
                      </div>

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
                                            parseISO(
                                              playedLog.logTimeStamp || playedLog.timestamp
                                            ),
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
                                ? availableFilesCache.get(activeMp3?.backupMp3Url || '')
                                    ?.path ||
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

              const isUpcoming =
                !played &&
                !exported &&
                !isPast &&
                !isPresent &&
                diffSeconds <= 600 &&
                isAfter(slot, now);
              const isMissedRecent = isPast && !played && !exported && diffSeconds <= 1800;
              const isMissedOld = isPast && !played && !exported && diffSeconds > 1800;

              const cardBorderClass = !isVerified
                ? 'border-red-500'
                : isBreakMovedHighlight || s.id === movedHighlightTrackId
                  ? 'ring-2 ring-purple-500/90 shadow-lg scale-[1.01] z-10 border-purple-600'
                  : isCurrentlyPlaying || isUpcoming
                    ? 'border-purple-600 ring-1 ring-purple-600/30'
                    : exported
                      ? 'border-emerald-600'
                      : isMissedRecent || isMissedOld
                        ? 'border-amber-600'
                        : played
                          ? 'border-emerald-600'
                          : 'border-slate-500';

              const cardBgClass = !isVerified
                ? 'bg-[#fef2f2]'
                : isCurrentlyPlaying
                  ? 'bg-white'
                  : isUpcoming
                    ? 'bg-[#faf5ff]'
                    : exported
                      ? 'bg-[#f0fdf4]'
                      : isMissedRecent || isMissedOld
                        ? 'bg-[#fffbeb]'
                        : played
                          ? 'bg-white'
                          : isPresent && !played && !exported
                            ? 'bg-[#faf5ff]'
                            : 'bg-white';

              const cardOpacityClass =
                isPast && (played || exported) && !isCurrentlyPlaying
                  ? 'opacity-75'
                  : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
                    ? 'opacity-95'
                    : 'opacity-100';

              return (
                <div
                  key={`${slot.toISOString()}-${s.id}-${idx}`}
                  className="flex items-stretch gap-2 w-full pr-1 relative min-h-[4.5rem]"
                >
                  {activeShow ? (
                    <div
                      className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10"
                      style={{ backgroundColor: showShade?.bg }}
                      title={showShade?.title}
                    />
                  ) : null}
                  <div
                    onClick={() => (isVerified ? handlePlay(s, slot) : null)}
                    title={
                      !isVerified
                        ? `${!status.exists ? 'File not found.' : isScript ? 'Invalid script file.' : 'File not mp3.'} — Admin Contact: ${resolvedAdminContact}`
                        : undefined
                    }
                    style={{
                      borderLeftColor: !isVerified
                        ? '#f43f5e'
                        : isScript
                          ? '#3b82f6'
                          : '#a855f7',
                    }}
                    className={cn(
                      'flex-1 min-w-0 rounded border shadow-sm p-2 transition-colors flex flex-col gap-1.5 select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left',
                      activeShow ? 'ml-1' : '',
                      'border-l-[4px] rounded-l-none',
                      !isScript && isVerified ? 'pb-[1px]' : '',
                      cardBorderClass,
                      cardBgClass,
                      cardOpacityClass
                    )}
                  >
                    <div className="flex justify-between items-center bg-slate-50 -mx-2 -mt-2 px-2 py-1 rounded-t border-b border-slate-200/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                          {format(slot, 'MMM dd')}
                        </span>

                        {playlistTracks.length > 0 && !played && !exported && (
                          <div className="flex items-center gap-0.5">
                            {!isTopBreakInTimeline && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBreakUp(item.id);
                                }}
                                className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                title="Move announcement break up in queue"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                            )}
                            {!isBottomBreakInTimeline && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveBreakDown(item.id);
                                }}
                                className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                title="Move announcement break down in queue"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}

                        <span className="text-xs font-sans font-black tabular-nums text-purple-600">
                          {format(slot, 'h:mm a')}
                        </span>
                      </div>
                      {isCurrentlyPlaying ? (
                        <div className="flex items-center gap-1 text-xs font-black uppercase text-purple-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                          Playing
                        </div>
                      ) : isPresent && !played && !exported ? (
                        <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none bg-purple-600">
                          Next
                        </span>
                      ) : isUpcoming ? (
                        <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm animate-pulse bg-purple-500 shadow-purple-200">
                          Next
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          'text-xs font-bold leading-tight break-words line-clamp-2 flex-1',
                          isCurrentlyPlaying ? 'text-purple-700' : 'text-slate-800'
                        )}
                      >
                        {formatRotatedAnnouncementName(s.name, activeMp3)}
                      </div>

                      {isScript ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlay(s, slot);
                          }}
                          className={cn(
                            'shrink-0 p-1 rounded-full transition-colors shadow-sm cursor-pointer',
                            !isVerified
                              ? 'bg-red-50 text-red-300'
                              : isCurrentlyPlaying
                                ? 'bg-slate-900 text-white'
                                : played || exported
                                  ? 'bg-slate-100 text-slate-500'
                                  : isMissedRecent
                                    ? 'bg-slate-500 text-white'
                                    : isPresent || isUpcoming
                                      ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                                      : 'bg-slate-700 text-white'
                          )}
                          title={
                            !isVerified
                              ? 'Invalid or missing file'
                              : isCurrentlyPlaying
                                ? 'Stop Audio'
                                : played || exported
                                  ? 'Read Again'
                                  : 'Display Script'
                          }
                        >
                          {!isVerified ? (
                            <X className="w-2.5 h-2.5" />
                          ) : isCurrentlyPlaying ? (
                            <Square className="w-2.5 h-2.5 fill-current" />
                          ) : played || exported ? (
                            <RefreshCw className="w-2.5 h-2.5" />
                          ) : (
                            <FileText className="w-2.5 h-2.5" />
                          )}
                        </button>
                      ) : (
                        <div
                          className={cn(
                            'shrink-0 p-1 rounded-full transition-colors shadow-sm',
                            !isVerified
                              ? 'bg-red-50 text-red-300'
                              : isCurrentlyPlaying
                                ? 'bg-slate-900 text-white'
                                : played || exported
                                  ? 'bg-slate-100 text-slate-500'
                                  : isMissedRecent
                                    ? 'bg-slate-500 text-white'
                                    : isPresent || isUpcoming
                                      ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                                      : 'bg-slate-700 text-white'
                          )}
                          title={
                            !isVerified
                              ? 'Invalid or missing file'
                              : played || exported
                                ? 'Play Again'
                                : undefined
                          }
                        >
                          {!isVerified ? (
                            <X className="w-2.5 h-2.5" />
                          ) : isCurrentlyPlaying ? (
                            <Square className="w-2.5 h-2.5 fill-current" />
                          ) : played || exported ? (
                            <RefreshCw className="w-2.5 h-2.5" />
                          ) : modeStr === 'Export' ? (
                            <Ear className="w-2.5 h-2.5" />
                          ) : (
                            <Play className="w-2.5 h-2.5 fill-current" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-[1px]">
                      <div className="flex items-center justify-between">
                        {isVerified ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              {exported ? (
                                <>
                                  <CheckCircle className="w-2.5 h-2.5 text-purple-500" />
                                  <span className="text-xs font-bold uppercase tracking-tighter text-purple-600">
                                    Exported
                                  </span>
                                </>
                              ) : isCurrentlyPlaying ? (
                                <>
                                  <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                                  <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">
                                    Playing
                                  </span>
                                </>
                              ) : played ? (
                                <>
                                  <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                  <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">
                                    {isScript
                                      ? playedLog?.status === 'backup play'
                                        ? 'Played'
                                        : 'Read'
                                      : 'Played'}{' '}
                                    {playedLog
                                      ? format(
                                          parseISO(
                                            playedLog.logTimeStamp || playedLog.timestamp
                                          ),
                                          'h:mm a'
                                        )
                                      : format(new Date(), 'h:mm a')}
                                  </span>
                                </>
                              ) : isMissedRecent || isMissedOld ? (
                                <>
                                  <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                  <span className="text-xs font-bold text-amber-700 uppercase tracking-tighter">
                                    Missed
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-2.5 h-2.5 text-slate-500" />
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">
                                    {isScript ? 'To be read' : 'To be played'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5 w-full">
                            <div className="flex items-center gap-1 min-w-0">
                              <AlertCircle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                              <span className="text-xs font-bold text-red-600 uppercase tracking-tighter truncate">
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
                          <div className="flex items-center gap-1 text-xs font-sans font-bold tabular-nums leading-none text-purple-600">
                            <span>
                              {formatPlayerTime(playingStates[slotKey]?.currentTime || 0)}
                            </span>
                            <span className="opacity-30">/</span>
                            <span>
                              {formatPlayerTime(playingStates[slotKey]?.duration || 0)}
                            </span>
                          </div>
                        ) : isVerified ? (
                          <span className="text-xs font-sans font-bold tabular-nums text-slate-500 leading-none">
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
                              ? availableFilesCache.get(activeMp3?.backupMp3Url || '')
                                  ?.path ||
                                activeMp3?.backupMp3Url ||
                                ''
                              : resolvedUrl
                          }
                          currentTime={
                            isCurrentlyPlaying ? playingStates[slotKey]?.currentTime || 0 : 0
                          }
                          duration={playingStates[slotKey]?.duration || 0}
                          isPlaying={isCurrentlyPlaying}
                          isPlayed={played || exported}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Fragment>
      );
    }

    if (item.type === 'show-end') {
      return (
        <Fragment key={item.id}>
          {nowCard}
          <div
            className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-slate-700 border-slate-600 text-white select-none w-full flex-wrap"
            id="show-end-indicator"
          >
            <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
              <Flag className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              show end
              <span className="text-[10px] text-slate-300 font-sans font-normal tabular-nums">
                ({format(item.showEnd, 'h:mm a')})
              </span>
            </span>
            <span className="text-xs font-bold font-sans tracking-wide px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-600 text-slate-100 shrink-0 tabular-nums">
              {item.status === 'over'
                ? `Over by: ${item.diffFormatted}`
                : item.status === 'under'
                  ? `Under by: ${item.diffFormatted}`
                  : `On time (${item.diffFormatted})`}
            </span>
          </div>
        </Fragment>
      );
    }

    if (item.type === 'extra-tracks') {
      return (
        <Fragment key={item.id}>
          {nowCard}
          <div
            className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-amber-700 border-amber-600 text-white select-none w-full flex-wrap"
            id="extra-tracks-indicator"
          >
            <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
              <ListPlus className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              overrun
            </span>
            <span className="text-xs font-bold font-sans tracking-wide px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-500/50 text-amber-100 shrink-0 tabular-nums">
              {`Over by: ${item.extraFormatted}`}
            </span>
          </div>
        </Fragment>
      );
    }

    return null;
  };

  if (modeStr === 'Prerecord') {
    const indexedTimeline = playlistTimeline
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.type !== 'header');
    const playedEntries = indexedTimeline.filter(({ item }) => 'played' in item && item.played);
    const nextEntries = indexedTimeline.filter(({ item }) => !('played' in item && item.played));
    const prerecordShade = effectiveShow
      ? getShowShade(effectiveShow, getSortedShows(shows))
      : {
          bg: 'var(--show-shade-none-bg, #f1f5f9)',
          border: 'var(--show-shade-none-border, #cbd5e1)',
        };

    return (
      <div className="py-2 px-0.5 space-y-2">
        {playedEntries.length > 0 && (
          <>
            <div className="w-[200px] mx-auto shrink-0 font-sans select-none mb-1">
              <div className="flex items-center justify-between px-2.5 py-1 rounded border border-slate-300 bg-slate-200 shadow-2xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
                    Played/Read
                  </span>
                </div>
              </div>
            </div>

            <div className="w-[200px] mx-auto flex flex-col">
              {playedEntries.map(({ item, idx }) => renderPlaylistItem(item, idx, false))}
            </div>
          </>
        )}

        <div
          id="now-indicator"
          ref={(el) => {
            nowSectionRef.current = el;
            (activeItemRef as any).current = el;
          }}
          className="w-[222px] max-w-[calc(100%-4px)] mx-auto shrink-0 font-sans select-none rounded-lg border-x-[3px] border-b-[3px] border-t-2 border-emerald-600 bg-white tobe-now-segment shadow-sm overflow-hidden my-2"
        >
          <div
            onClick={scrollToNow}
            title="Click to center NEXT section"
            className="amp-now-header flex flex-col gap-0.5 px-3 py-1.5 bg-emerald-600 text-white border-b border-emerald-500 cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CassetteTape className="w-4 h-4 text-white shrink-0" />
              <span className="text-sm font-black uppercase tracking-widest text-white truncate">
                Next
              </span>
            </div>
            {renderCacheStatusMessage()}
          </div>

          <div
            className="amp-now-body flex flex-col px-1 py-1"
            style={{ backgroundColor: prerecordShade.bg }}
          >
            {nextEntries.length === 0 ? (
              <div className="flex items-center justify-center py-3.5 px-3 rounded border border-slate-300 bg-white shadow-2xs text-center">
                <span className="text-xs font-sans font-bold text-slate-600">
                  All items completed
                </span>
              </div>
            ) : (
              nextEntries.map(({ item, idx }) => renderPlaylistItem(item, idx, false))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[200px] mx-auto space-y-2 py-2">
      {playlistTracks.length === 0 && (
        <div
          key="no-mp3s-card"
          id="no-mp3s-indicator"
          title={noMp3sTooltip}
          className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-purple-50 border-purple-200 text-purple-900 select-none w-full cursor-help my-1.5"
        >
          <span className="text-xs font-black uppercase text-purple-900 tracking-widest font-sans flex items-center gap-1.5">
            <ListMusic className="w-3.5 h-3.5 text-purple-700 shrink-0" />
            No mp3&apos;s found.
          </span>
        </div>
      )}
      {playlistTimeline.map((item, index) => renderPlaylistItem(item, index, true))}
    </div>
  );
}
