import React from 'react';
import { format } from 'date-fns';
import { Show } from '../../types';
import { cn, getShowShade, getSortedShows, isTimeInShow } from '../../lib/utils';

export interface PinnedSpacerInfo {
  id: string;
  name: string;
  time: string;
  shadeBg: string;
  shadeBorder: string;
}

export interface LiveSpacerInfo {
  id: string;
  name: string;
  time: string;
  slot: Date;
  shadeBg: string;
  shadeBorder: string;
}

interface PinnedLiveShowBannerProps {
  spacer: PinnedSpacerInfo;
  position: 'top' | 'bottom';
  onScrollToSpacer: (spacerId: string) => void;
}

export function PinnedLiveShowBanner({
  spacer,
  position,
  onScrollToSpacer,
}: PinnedLiveShowBannerProps) {
  const isTop = position === 'top';
  return (
    <div
      key={`pinned-banner-${position}-${spacer.id}`}
      className={cn(
        'flex items-stretch w-full relative min-h-[2rem] select-none cursor-pointer transition-colors shrink-0 z-30 rounded-none',
        isTop ? 'border-b shadow-sm' : 'border-t shadow-[0_-2px_6px_rgba(0,0,0,0.06)]'
      )}
      style={{
        backgroundColor: spacer.shadeBg,
        borderColor: spacer.shadeBorder,
      }}
      onClick={() => onScrollToSpacer(spacer.id)}
      title={`${spacer.time} ${spacer.name} (${isTop ? 'Current' : 'Next'} Show Pinned - Click to scroll to card)`}
    >
      <div
        className="w-1.5 shrink-0"
        style={{ backgroundColor: spacer.shadeBorder }}
        title={`Active during show: ${spacer.name}`}
      />
      <div className="px-2.5 py-1 flex items-center justify-between gap-1.5 flex-1 min-w-0 uppercase">
        <div
          className="line-clamp-2 font-sans text-xs leading-tight break-words flex-1 min-w-0"
          title={`${spacer.time} ${spacer.name}`}
        >
          <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5 shrink-0">
            {spacer.time}
          </span>
          <span className="font-black text-slate-800">{spacer.name}</span>
        </div>
        {isTop ? (
          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 tabular-nums border bg-slate-900/10 text-slate-700 border-slate-900/15 rec-pinned-current-badge">
            Current
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 tabular-nums border bg-purple-100 text-purple-700 border-purple-300 rec-pinned-next-badge">
            Next
          </span>
        )}
      </div>
    </div>
  );
}

interface PersistentModeShowHeaderProps {
  playMode: string;
  effectiveShow: Show | null;
  shows: Show[];
  timeline: Date[];
  persistentHeaderRef: React.RefObject<HTMLDivElement | null>;
  persistentLeftStripRef: React.RefObject<HTMLDivElement | null>;
  persistentTextBoxRef: React.RefObject<HTMLDivElement | null>;
  persistentTitleRef: React.RefObject<HTMLDivElement | null>;
  persistentTitleTextRef: React.RefObject<HTMLSpanElement | null>;
}

export function PersistentModeShowHeader({
  playMode,
  effectiveShow,
  shows,
  timeline,
  persistentHeaderRef,
  persistentLeftStripRef,
  persistentTextBoxRef,
  persistentTitleRef,
  persistentTitleTextRef,
}: PersistentModeShowHeaderProps) {
  const modeStr = playMode as string;
  const initialActiveShow =
    modeStr === 'Playlist' || modeStr === 'Prerecord'
      ? effectiveShow
      : timeline.length > 0
        ? (() => {
            const firstSlot = timeline[0];
            const daysOrder = [
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ] as const;
            const dayName = daysOrder[firstSlot.getDay()];
            const hour = firstSlot.getHours();
            const minute = firstSlot.getMinutes();
            const activeShows = shows.filter((show) =>
              isTimeInShow(show, dayName, hour, minute)
            );
            return activeShows[0] || null;
          })()
        : null;

  const initialShade =
    modeStr === 'Playlist' || modeStr === 'Prerecord'
      ? effectiveShow
        ? getShowShade(effectiveShow, getSortedShows(shows))
        : {
            bg: '#faf5ff',
            border: '#c084fc',
            title: modeStr === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode',
          }
      : initialActiveShow
        ? getShowShade(initialActiveShow, getSortedShows(shows))
        : {
            bg: 'var(--show-shade-none-bg, #f1f5f9)',
            border: 'var(--show-shade-none-border, #cbd5e1)',
            title: 'No active show scheduled',
          };

  const targetShowObj =
    modeStr === 'Playlist' || modeStr === 'Prerecord' ? effectiveShow : initialActiveShow;
  const showStartTimeLabel = targetShowObj
    ? format(
        new Date(2000, 0, 1, targetShowObj.startHour, targetShowObj.startMinute || 0),
        'h:mm a'
      )
    : '';

  return (
    <div
      ref={persistentHeaderRef}
      className="flex items-stretch w-full relative min-h-[2rem] select-none transition-colors shrink-0 z-30 rounded-none border-b shadow-sm font-sans"
      style={{
        backgroundColor: initialShade.bg,
        borderColor: initialShade.border,
      }}
    >
      <div
        ref={persistentLeftStripRef}
        className="w-1.5 shrink-0"
        style={{ backgroundColor: initialShade.border }}
        title={initialShade.title}
      />
      <div
        ref={persistentTextBoxRef}
        className="px-2.5 py-1 flex items-center justify-between gap-1.5 flex-1 min-w-0 uppercase"
      >
        <div
          ref={persistentTitleRef}
          className="line-clamp-2 font-sans text-xs leading-tight break-words flex-1 min-w-0"
        >
          {showStartTimeLabel && (
            <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5 shrink-0">
              {showStartTimeLabel}
            </span>
          )}
          <span ref={persistentTitleTextRef} className="font-black text-slate-800">
            {modeStr === 'Playlist' || modeStr === 'Prerecord'
              ? effectiveShow
                ? effectiveShow.name
                : modeStr === 'Prerecord'
                  ? 'Prerecord Mode'
                  : 'Playlist Mode'
              : initialActiveShow
                ? initialActiveShow.name
                : 'No Scheduled Show'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface InFlowLiveSpacerProps {
  key?: React.Key;
  spacer: LiveSpacerInfo;
  isExpanded?: boolean;
}

export function InFlowLiveSpacer({ spacer, isExpanded = false }: InFlowLiveSpacerProps) {
  return (
    <div
      data-spacer-id={spacer.id}
      data-spacer-name={spacer.name}
      data-spacer-time={spacer.time}
      data-spacer-bg={spacer.shadeBg}
      data-spacer-border={spacer.shadeBorder}
      className="w-full py-1 pr-1 relative shrink-0 select-none"
      style={{ backgroundColor: spacer.shadeBg }}
    >
      <div
        className={cn('absolute left-0 top-0 bottom-0 z-10', isExpanded ? 'w-1.5' : 'w-1')}
        style={{ backgroundColor: spacer.shadeBg }}
        title={`Active during show: ${spacer.name}`}
      />
      <div
        className={cn(
          'flex items-stretch relative border overflow-hidden rounded-none shadow-sm',
          isExpanded ? 'ml-1.5 min-h-[2.25rem]' : 'ml-1 min-h-[2rem]'
        )}
        style={{
          backgroundColor: spacer.shadeBg,
          borderColor: spacer.shadeBorder,
        }}
      >
        <div
          className="w-1.5 shrink-0"
          style={{ backgroundColor: spacer.shadeBorder }}
          title={`Active during show: ${spacer.name}`}
        />
        <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
          <div
            className="line-clamp-2 font-sans text-xs leading-tight break-words"
            title={`${spacer.time} ${spacer.name}`}
          >
            <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5">
              {spacer.time}
            </span>
            <span className="font-black text-slate-800">{spacer.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
