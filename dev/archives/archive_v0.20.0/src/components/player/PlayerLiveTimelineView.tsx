import React from 'react';
import { format, startOfMinute } from 'date-fns';
import { Clock, RadioTower } from 'lucide-react';
import { Announcement, LogEntry, Show } from '../../types';
import {
  cn,
  getMP3Status,
  isTimeInShow,
  getActualShowStart,
  getSortedShows,
  getShowShade,
  getActiveMp3ForSlot,
  getGatedAssetType,
} from '../../lib/utils';
import { isLogForStationSlot } from '../../lib/compatibility';
import { InFlowLiveSpacer, LiveSpacerInfo } from './PlayerShowSpacer';
import { LiveToBeCard, LiveCardEntry } from './PlayerAnnouncementCard';

interface PlayerLiveTimelineViewProps {
  timeline: Date[];
  shows: Show[];
  effectiveShow: Show | null;
  logs: LogEntry[];
  now: Date;
  nowClock: Date;
  windowBeforeMinutes: number;
  windowAfterMinutes: number;
  showLookaroundHours: number;
  playingStates: Record<string, { currentTime: number; duration: number }>;
  isAudioPlaying: (key: string) => boolean;
  resolvedAdminContact: string;
  activeItemRef: React.RefObject<HTMLDivElement | null>;
  nowSectionRef: React.MutableRefObject<HTMLDivElement | null>;
  getAnnouncementsForSlot: (slot: Date) => Announcement[];
  renderCacheStatusMessage: () => React.ReactNode;
  scrollToNow: () => void;
  onPlay: (s: Announcement, slot: Date) => void;
  onOpenHelpPopup: (card: { name: string; timeLabel: string; errorLabel: string }) => void;
}

export function PlayerLiveTimelineView({
  timeline,
  shows,
  effectiveShow,
  logs,
  now,
  nowClock,
  windowBeforeMinutes,
  windowAfterMinutes,
  showLookaroundHours,
  playingStates,
  isAudioPlaying,
  resolvedAdminContact,
  activeItemRef,
  nowSectionRef,
  getAnnouncementsForSlot,
  renderCacheStatusMessage,
  scrollToNow,
  onPlay,
  onOpenHelpPopup,
}: PlayerLiveTimelineViewProps) {
  const sortedShows = getSortedShows(shows);
  const daysOrder = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ] as const;
  const nowExactMs = (nowClock || now).getTime();
  const nowMinuteMs = startOfMinute(nowClock || now).getTime();
  const nowStartMs = nowMinuteMs - windowBeforeMinutes * 60 * 1000;
  const nowEndMs = nowMinuteMs + windowAfterMinutes * 60 * 1000;
  const lookbackMs = Math.max(windowBeforeMinutes, showLookaroundHours * 60) * 60 * 1000;
  const lookaheadMs = Math.max(windowAfterMinutes, showLookaroundHours * 60) * 60 * 1000;
  const minWindowMs = nowMinuteMs - lookbackMs;
  const maxWindowMs = nowMinuteMs + lookaheadMs;

  const allSpacers: LiveSpacerInfo[] = [];
  const allCards: LiveCardEntry[] = [];

  for (const slot of timeline) {
    const dayName = daysOrder[slot.getDay()];
    const hour = slot.getHours();
    const minute = slot.getMinutes();

    const startingShows = shows.filter(
      (show) =>
        show.active !== false &&
        show.day === dayName &&
        show.startHour === hour &&
        show.startMinute === minute
    );
    for (const sh of startingShows) {
      const shade = getShowShade(sh, sortedShows);
      allSpacers.push({
        id: `spacer-${sh.id}-${slot.toISOString()}`,
        name: sh.name,
        time: format(slot, 'h:mm a'),
        slot,
        shadeBg: shade.bg,
        shadeBorder: shade.border,
      });
    }

    if (hour === 0 && minute === 0) {
      const continuingShows = shows.filter(
        (show) =>
          show.active !== false &&
          isTimeInShow(show, dayName, 0, 0) &&
          !(show.day === dayName && show.startHour === 0 && show.startMinute === 0)
      );
      for (const sh of continuingShows) {
        const shade = getShowShade(sh, sortedShows);
        allSpacers.push({
          id: `spacer-cont-${sh.id}-${slot.toISOString()}`,
          name: `(cont.) ${sh.name}`,
          time: format(slot, 'h:mm a'),
          slot,
          shadeBg: shade.bg,
          shadeBorder: shade.border,
        });
      }
    }

    const sForSlot = getAnnouncementsForSlot(slot);
    for (const s of sForSlot) {
      const slotKey = `${slot.toISOString()}-${s.id}`;
      const playedLog = logs.find(
        (l) =>
          l.announcementId === s.id &&
          isLogForStationSlot(l, slot) &&
          (l.status === 'played' || l.status === 'backup play')
      );
      const played = !!playedLog && playedLog.playMode !== 'Export';
      const exported = !!playedLog && playedLog.playMode === 'Export';
      const isCurrentlyPlaying = !!playingStates[slotKey] || isAudioPlaying(slotKey);
      const isCompleted = !isCurrentlyPlaying && (played || exported);
      allCards.push({
        key: `${slot.toISOString()}-${s.id}`,
        slot,
        announcement: s,
        playedLog,
        played,
        exported,
        isCompleted,
        isCurrentlyPlaying,
      });
    }
  }

  // Ensure the active show at the start of the timeline has an initial spacer if none started before it
  if (timeline.length > 0) {
    const firstSlot = timeline[0];
    const firstDay = daysOrder[firstSlot.getDay()];
    const firstActive = shows.find(
      (sh) =>
        sh.active !== false &&
        isTimeInShow(sh, firstDay, firstSlot.getHours(), firstSlot.getMinutes())
    );
    if (
      firstActive &&
      !allSpacers.some(
        (sp) => sp.name === firstActive.name && sp.slot.getTime() <= firstSlot.getTime()
      )
    ) {
      const actualStart = getActualShowStart(firstActive, firstSlot);
      const shade = getShowShade(firstActive, sortedShows);
      allSpacers.unshift({
        id: `spacer-init-${firstActive.id}`,
        name: firstActive.name,
        time: format(actualStart, 'h:mm a'),
        slot: firstSlot,
        shadeBg: shade.bg,
        shadeBorder: shade.border,
      });
    }
  }

  const pastCards = allCards.filter(
    (c) =>
      c.slot.getTime() >= minWindowMs &&
      c.slot.getTime() <= maxWindowMs &&
      (c.slot.getTime() < nowStartMs || c.isCompleted)
  );
  const nowCards = allCards.filter(
    (c) =>
      !c.isCompleted &&
      c.slot.getTime() >= nowStartMs &&
      c.slot.getTime() <= nowEndMs
  );
  const futureCards = allCards.filter(
    (c) =>
      !c.isCompleted &&
      c.slot.getTime() > nowEndMs &&
      c.slot.getTime() <= maxWindowMs
  );

  const pastSpacers = allSpacers.filter(
    (sp) => sp.slot.getTime() >= minWindowMs && sp.slot.getTime() < nowStartMs
  );
  const nowSpacers = allSpacers.filter(
    (sp) => sp.slot.getTime() >= nowStartMs && sp.slot.getTime() <= nowEndMs
  );
  const futureSpacers = allSpacers.filter(
    (sp) => sp.slot.getTime() > nowEndMs && sp.slot.getTime() <= maxWindowMs
  );

  type LiveTimelineNode =
    | { type: 'card'; card: LiveCardEntry; timeMs: number }
    | { type: 'spacer'; spacer: LiveSpacerInfo; timeMs: number };

  const sortedPastSpacerMs = pastSpacers
    .map((sp) => sp.slot.getTime())
    .sort((a, b) => a - b);
  const getPastShowBlockStartMs = (timeMs: number): number => {
    let blockMs = -Infinity;
    for (const spMs of sortedPastSpacerMs) {
      if (spMs <= timeMs) {
        blockMs = spMs;
      } else {
        break;
      }
    }
    return blockMs;
  };

  const pastEntries: LiveTimelineNode[] = [
    ...pastCards.map((card) => ({
      type: 'card' as const,
      card,
      timeMs: card.slot.getTime(),
    })),
    ...pastSpacers.map((spacer) => ({
      type: 'spacer' as const,
      spacer,
      timeMs: spacer.slot.getTime(),
    })),
  ].sort((a, b) => {
    const blockA = getPastShowBlockStartMs(a.timeMs);
    const blockB = getPastShowBlockStartMs(b.timeMs);
    if (blockA !== blockB) return blockA - blockB;

    const aIsSpacer = a.type === 'spacer';
    const bIsSpacer = b.type === 'spacer';
    if (aIsSpacer !== bIsSpacer) return aIsSpacer ? -1 : 1;

    const aMissed =
      a.type === 'card' && !a.card.isCompleted && !a.card.isCurrentlyPlaying;
    const bMissed =
      b.type === 'card' && !b.card.isCompleted && !b.card.isCurrentlyPlaying;
    if (aMissed !== bMissed) return aMissed ? 1 : -1;

    return a.timeMs !== b.timeMs ? a.timeMs - b.timeMs : 0;
  });

  const nowEntries: LiveTimelineNode[] = [
    ...nowCards.map((card) => ({
      type: 'card' as const,
      card,
      timeMs: card.slot.getTime(),
    })),
    ...nowSpacers.map((spacer) => ({
      type: 'spacer' as const,
      spacer,
      timeMs: spacer.slot.getTime(),
    })),
  ].sort((a, b) =>
    a.timeMs !== b.timeMs ? a.timeMs - b.timeMs : a.type === 'spacer' ? -1 : 1
  );

  const futureEntries: LiveTimelineNode[] = [
    ...futureCards.map((card) => ({
      type: 'card' as const,
      card,
      timeMs: card.slot.getTime(),
    })),
    ...futureSpacers.map((spacer) => ({
      type: 'spacer' as const,
      spacer,
      timeMs: spacer.slot.getTime(),
    })),
  ].sort((a, b) =>
    a.timeMs !== b.timeMs ? a.timeMs - b.timeMs : a.type === 'spacer' ? -1 : 1
  );

  // Roadmap #17: Whole "Now" Section Flash Detection (Added / Leaving)
  const unplayedNowCards = nowCards.filter((c) => {
    if (c.isCompleted || c.isCurrentlyPlaying) return false;
    const activeMp3 = getActiveMp3ForSlot(c.announcement, c.slot);
    const isScript = getGatedAssetType(activeMp3) === 'script';
    const status = getMP3Status(activeMp3?.mp3Url || '');
    return isScript ? status.exists : status.exists && status.valid;
  });

  const autoAddedNowCard = unplayedNowCards.find((c) => {
    const entryMs = c.slot.getTime() - windowAfterMinutes * 60 * 1000;
    const elapsedSec = (nowExactMs - entryMs) / 1000;
    return elapsedSec >= 0 && elapsedSec <= 25;
  });

  const autoLeavingNowCard =
    unplayedNowCards.find((c) => {
      const exitMs = c.slot.getTime() + windowBeforeMinutes * 60 * 1000;
      const remainingSec = (exitMs - nowExactMs) / 1000;
      return remainingSec >= 0 && remainingSec <= 60;
    }) ||
    pastCards.find((c) => {
      if (c.isCompleted || c.isCurrentlyPlaying) return false;
      const exitMs = c.slot.getTime() + windowBeforeMinutes * 60 * 1000;
      const elapsedSinceExitSec = (nowExactMs - exitMs) / 1000;
      return elapsedSinceExitSec >= 0 && elapsedSinceExitSec <= 15;
    });

  const nowCycleSec = (nowExactMs / 1000) % 6;
  const isLeavingInFlashPhase = nowCycleSec < 4;

  const nowSectionFlashClass = autoAddedNowCard
    ? 'amp-now-flash-added-merged'
    : autoLeavingNowCard
      ? isLeavingInFlashPhase
        ? 'amp-now-flash-leaving-2a'
        : 'amp-now-static-leaving-2a'
      : '';

  const nowActiveShade = effectiveShow
    ? getShowShade(effectiveShow, sortedShows)
    : {
        bg: 'var(--show-shade-none-bg, #f1f5f9)',
        border: 'var(--show-shade-none-border, #cbd5e1)',
      };

  return (
    <div className="py-2 px-0.5 space-y-2">
      {/* PAST Section Header Block */}
      <div className="w-[200px] mx-auto shrink-0 font-sans select-none mb-1">
        <div className="flex items-center justify-between px-2.5 py-1 rounded border border-slate-300 bg-slate-200 shadow-2xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
              Past
            </span>
          </div>
        </div>
      </div>

      {/* Past Cards & Past In-Flow Spacers */}
      <div className="w-[200px] mx-auto flex flex-col">
        {pastEntries.length === 0 ? (
          <div className="text-center py-2 text-[11px] text-slate-400 font-medium italic">
            No past items in window
          </div>
        ) : (
          pastEntries.map((entry) =>
            entry.type === 'spacer' ? (
              <InFlowLiveSpacer
                key={entry.spacer.id}
                spacer={entry.spacer}
                isExpanded={false}
              />
            ) : (
              <LiveToBeCard
                key={entry.card.key}
                cardEntry={entry.card}
                zone="past"
                shows={shows}
                sortedShows={sortedShows}
                nowExactMs={nowExactMs}
                windowBeforeMinutes={windowBeforeMinutes}
                windowAfterMinutes={windowAfterMinutes}
                playingStates={playingStates}
                resolvedAdminContact={resolvedAdminContact}
                onPlay={onPlay}
                onOpenHelpPopup={onOpenHelpPopup}
              />
            )
          )
        )}
      </div>

      {/* NOW Section Wrapper - "Super Card" enclosing all NOW cards */}
      <div
        id="now-indicator"
        ref={(el) => {
          nowSectionRef.current = el;
          (activeItemRef as any).current = el;
        }}
        className={cn(
          'w-[222px] max-w-[calc(100%-4px)] mx-auto shrink-0 font-sans select-none rounded-lg border-x-[3px] border-b-[3px] border-t-2 border-emerald-600 bg-white tobe-now-segment shadow-sm overflow-hidden my-2',
          nowSectionFlashClass
        )}
      >
        <div
          onClick={scrollToNow}
          title="Click to center NOW section"
          className="amp-now-header flex flex-col gap-0.5 px-3 py-1.5 bg-emerald-600 text-white border-b border-emerald-500 cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <RadioTower className="w-4 h-4 text-white animate-pulse shrink-0" />
              <span className="text-sm font-black uppercase tracking-widest text-white truncate">
                Now
              </span>
            </div>
            <span className="text-xs font-bold tabular-nums text-emerald-50 tracking-normal shrink-0">
              {format(nowClock || now, 'h:mm:ss a')}
            </span>
          </div>
          {renderCacheStatusMessage()}
        </div>

        <div className="amp-now-body flex flex-col">
          {nowCards.length === 0 ? (
            <>
              {nowSpacers.map((spacer) => (
                <InFlowLiveSpacer key={spacer.id} spacer={spacer} isExpanded={true} />
              ))}
              <div
                className="py-1.5 pr-1 pl-1.5 relative"
                style={{ backgroundColor: nowActiveShade.bg }}
              >
                <div className="flex items-center justify-center py-3.5 px-3 rounded border border-slate-300 bg-white shadow-2xs text-center">
                  <span className="text-xs font-sans font-bold text-slate-600 tabular-nums">
                    {futureCards.length > 0
                      ? `Next announcement at ${format(futureCards[0].slot, 'h:mm a')}`
                      : 'No upcoming announcements scheduled'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            nowEntries.map((entry) =>
              entry.type === 'spacer' ? (
                <InFlowLiveSpacer
                  key={entry.spacer.id}
                  spacer={entry.spacer}
                  isExpanded={true}
                />
              ) : (
                <LiveToBeCard
                  key={entry.card.key}
                  cardEntry={entry.card}
                  zone="now"
                  shows={shows}
                  sortedShows={sortedShows}
                  nowExactMs={nowExactMs}
                  windowBeforeMinutes={windowBeforeMinutes}
                  windowAfterMinutes={windowAfterMinutes}
                  playingStates={playingStates}
                  resolvedAdminContact={resolvedAdminContact}
                  onPlay={onPlay}
                  onOpenHelpPopup={onOpenHelpPopup}
                />
              )
            )
          )}
        </div>
      </div>

      {/* FUTURE Section Header Block */}
      <div className="w-[200px] mx-auto shrink-0 font-sans select-none my-1">
        <div className="flex items-center justify-between px-2.5 py-1 rounded border border-slate-300 bg-slate-200 shadow-2xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
              Future
            </span>
          </div>
        </div>
      </div>

      {/* Future Cards & Future In-Flow Spacers */}
      <div className="w-[200px] mx-auto flex flex-col">
        {futureEntries.length === 0 ? (
          <div className="text-center py-2 text-[11px] text-slate-400 font-medium italic">
            No future items in window
          </div>
        ) : (
          futureEntries.map((entry) =>
            entry.type === 'spacer' ? (
              <InFlowLiveSpacer
                key={entry.spacer.id}
                spacer={entry.spacer}
                isExpanded={false}
              />
            ) : (
              <LiveToBeCard
                key={entry.card.key}
                cardEntry={entry.card}
                zone="future"
                shows={shows}
                sortedShows={sortedShows}
                nowExactMs={nowExactMs}
                windowBeforeMinutes={windowBeforeMinutes}
                windowAfterMinutes={windowAfterMinutes}
                playingStates={playingStates}
                resolvedAdminContact={resolvedAdminContact}
                onPlay={onPlay}
                onOpenHelpPopup={onOpenHelpPopup}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
