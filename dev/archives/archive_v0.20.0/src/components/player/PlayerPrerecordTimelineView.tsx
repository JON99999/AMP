import React from 'react';
import { format, isSameMinute } from 'date-fns';
import { Clock, CassetteTape } from 'lucide-react';
import { Announcement, LogEntry, Show } from '../../types';
import { isTimeInShow, getSortedShows, getShowShade } from '../../lib/utils';
import { isLogForStationSlot } from '../../lib/compatibility';
import { PrerecordAnnouncementCard } from './PlayerAnnouncementCard';

interface PlayerPrerecordTimelineViewProps {
  playMode: string;
  timeline: Date[];
  shows: Show[];
  effectiveShow: Show | null;
  logs: LogEntry[];
  now: Date;
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

export function PlayerPrerecordTimelineView({
  playMode,
  timeline,
  shows,
  effectiveShow,
  logs,
  now,
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
}: PlayerPrerecordTimelineViewProps) {
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

  if (playMode === 'Prerecord') {
    const pastElements: React.ReactNode[] = [];
    const nextElements: React.ReactNode[] = [];

    timeline.forEach((slot, index) => {
      const sForSlot = getAnnouncementsForSlot(slot);
      const dayName = daysOrder[slot.getDay()];
      const hour = slot.getHours();
      const minute = slot.getMinutes();

      const activeShows = shows.filter((show) =>
        isTimeInShow(show, dayName, hour, minute)
      );
      const activeShow = activeShows[0] || effectiveShow;
      const showShade = activeShow
        ? getShowShade(activeShow, sortedShows)
        : {
            bg: 'var(--show-shade-none-bg, #f1f5f9)',
            border: 'var(--show-shade-none-border, #cbd5e1)',
            title: 'No active show scheduled',
          };

      const startingShows =
        index !== 0
          ? shows.filter(
              (show) =>
                show.day === dayName &&
                show.startHour === hour &&
                show.startMinute === minute
            )
          : [];

      const continuingShows =
        index !== 0 && hour === 0 && minute === 0
          ? shows.filter(
              (show) =>
                isTimeInShow(show, dayName, 0, 0) &&
                !(show.day === dayName && show.startHour === 0 && show.startMinute === 0)
            )
          : [];

      startingShows.forEach((show) => {
        const shade = getShowShade(show, sortedShows);
        nextElements.push(
          <div
            key={`show-start-${slot.toISOString()}-${show.id}`}
            className="w-full py-1 pr-1 relative shrink-0 select-none"
            style={{ backgroundColor: shade.bg }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
              style={{ backgroundColor: shade.bg }}
              title={shade.title}
            />
            <div
              className="flex items-stretch relative border overflow-hidden rounded-none shadow-sm ml-1.5 min-h-[2.25rem]"
              style={{ backgroundColor: shade.bg, borderColor: shade.border }}
            >
              <div className="w-1.5 shrink-0" style={{ backgroundColor: shade.border }} />
              <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
                <div className="line-clamp-2 font-sans text-xs leading-tight break-words">
                  <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5">
                    {format(slot, 'h:mm a')}
                  </span>
                  <span className="font-black text-slate-800">{show.name}</span>
                </div>
              </div>
            </div>
          </div>
        );
      });

      continuingShows.forEach((show) => {
        const shade = getShowShade(show, sortedShows);
        nextElements.push(
          <div
            key={`show-cont-${slot.toISOString()}-${show.id}`}
            className="w-full py-1 pr-1 relative shrink-0 select-none"
            style={{ backgroundColor: shade.bg }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
              style={{ backgroundColor: shade.bg }}
              title={shade.title}
            />
            <div
              className="flex items-stretch relative border overflow-hidden rounded-none shadow-sm ml-1.5 min-h-[2.25rem]"
              style={{ backgroundColor: shade.bg, borderColor: shade.border }}
            >
              <div className="w-1.5 shrink-0" style={{ backgroundColor: shade.border }} />
              <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
                <div className="line-clamp-2 font-sans text-xs leading-tight break-words">
                  <span className="font-black text-slate-800">(cont.) {show.name}</span>
                </div>
              </div>
            </div>
          </div>
        );
      });

      sForSlot.forEach((s, idx) => {
        const playedLog = logs.find(
          (l) =>
            l.announcementId === s.id &&
            isLogForStationSlot(l, slot) &&
            (l.status === 'played' || l.status === 'backup play')
        );
        const played = !!playedLog && playedLog.playMode !== 'Export';
        const exported = !!playedLog && playedLog.playMode === 'Export';
        const slotKey = `${slot.toISOString()}-${s.id}`;
        const isCurrentlyPlaying = !!playingStates[slotKey] || isAudioPlaying(slotKey);
        const isCompleted = !isCurrentlyPlaying && (played || exported);

        const cardNode = (
          <PrerecordAnnouncementCard
            key={`${slot.toISOString()}-${s.id}-${idx}`}
            announcement={s}
            slot={slot}
            showShade={showShade}
            logs={logs}
            playingStates={playingStates}
            isAudioPlaying={isAudioPlaying}
            resolvedAdminContact={resolvedAdminContact}
            onPlay={onPlay}
            onOpenHelpPopup={onOpenHelpPopup}
          />
        );
        if (isCompleted) {
          pastElements.push(cardNode);
        } else {
          nextElements.push(cardNode);
        }
      });
    });

    const prerecordDefaultShade = effectiveShow
      ? getShowShade(effectiveShow, sortedShows)
      : {
          bg: 'var(--show-shade-none-bg, #f1f5f9)',
          border: 'var(--show-shade-none-border, #cbd5e1)',
        };

    return (
      <div className="py-2 px-0.5 space-y-2">
        {pastElements.length > 0 && (
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

            <div className="w-[200px] mx-auto flex flex-col">{pastElements}</div>
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

          <div className="amp-now-body flex flex-col">
            {nextElements.length === 0 ? (
              <div
                className="py-1.5 pr-1 pl-1.5 relative"
                style={{ backgroundColor: prerecordDefaultShade.bg }}
              >
                <div className="flex items-center justify-center py-3.5 px-3 rounded border border-slate-300 bg-white shadow-2xs text-center">
                  <span className="text-xs font-sans font-bold text-slate-600">
                    No upcoming announcements scheduled
                  </span>
                </div>
              </div>
            ) : (
              nextElements
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {timeline.map((slot, index) => {
        const sForSlot = getAnnouncementsForSlot(slot);
        const isPre = (playMode as string) === 'Prerecord';
        const isPresent = !isPre && isSameMinute(slot, now);

        const dayName = daysOrder[slot.getDay()];
        const hour = slot.getHours();
        const minute = slot.getMinutes();

        const activeShows = shows.filter((show) =>
          isTimeInShow(show, dayName, hour, minute)
        );
        const activeShow = activeShows[0] || effectiveShow;
        const showShade = activeShow
          ? getShowShade(activeShow, sortedShows)
          : {
              bg: 'var(--show-shade-none-bg, #f1f5f9)',
              border: 'var(--show-shade-none-border, #cbd5e1)',
              title: 'No active show scheduled',
            };

        const startingShows = shows.filter(
          (show) =>
            show.day === dayName &&
            show.startHour === hour &&
            show.startMinute === minute
        );

        const continuingShows =
          hour === 0 && minute === 0
            ? shows.filter(
                (show) =>
                  isTimeInShow(show, dayName, 0, 0) &&
                  !(show.day === dayName && show.startHour === 0 && show.startMinute === 0)
              )
            : [];

        if (
          sForSlot.length === 0 &&
          !isPresent &&
          !(isPre && index === 0) &&
          startingShows.length === 0 &&
          continuingShows.length === 0
        ) {
          return null;
        }

        return (
          <div
            key={slot.toISOString()}
            data-slot-time={slot.toISOString()}
            className="w-[200px] mx-auto flex flex-col"
            style={{ backgroundColor: showShade.bg }}
          >
            {(!isPre || index !== 0) &&
              startingShows.map((show) => {
                const shade = getShowShade(show, sortedShows);
                return (
                  <div
                    key={`show-start-${show.id}`}
                    className="w-full py-1 pr-1 relative shrink-0 select-none"
                    style={{ backgroundColor: shade.bg }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 z-10"
                      style={{ backgroundColor: shade.bg }}
                      title={shade.title}
                    />
                    <div
                      className="flex items-stretch relative border overflow-hidden rounded-none shadow-sm ml-1 min-h-[2rem]"
                      style={{ backgroundColor: shade.bg, borderColor: shade.border }}
                    >
                      <div
                        className="w-1.5 shrink-0"
                        style={{ backgroundColor: shade.border }}
                      />
                      <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
                        <div className="line-clamp-2 font-sans text-xs leading-tight break-words">
                          <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5">
                            {format(slot, 'h:mm a')}
                          </span>
                          <span className="font-black text-slate-800">{show.name}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            {(!isPre || index !== 0) &&
              continuingShows.map((show) => {
                const shade = getShowShade(show, sortedShows);
                return (
                  <div
                    key={`show-cont-${show.id}`}
                    className="w-full py-1 pr-1 relative shrink-0 select-none"
                    style={{ backgroundColor: shade.bg }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 z-10"
                      style={{ backgroundColor: shade.bg }}
                      title={shade.title}
                    />
                    <div
                      className="flex items-stretch relative border overflow-hidden rounded-none shadow-sm ml-1 min-h-[2rem]"
                      style={{ backgroundColor: shade.bg, borderColor: shade.border }}
                    >
                      <div
                        className="w-1.5 shrink-0"
                        style={{ backgroundColor: shade.border }}
                      />
                      <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
                        <div className="line-clamp-2 font-sans text-xs leading-tight break-words">
                          <span className="font-black text-slate-800">
                            (cont.) {show.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

            {sForSlot.map((s, idx) => (
              <PrerecordAnnouncementCard
                key={`${slot.toISOString()}-${s.id}-${idx}`}
                announcement={s}
                slot={slot}
                showShade={showShade}
                logs={logs}
                playingStates={playingStates}
                isAudioPlaying={isAudioPlaying}
                resolvedAdminContact={resolvedAdminContact}
                onPlay={onPlay}
                onOpenHelpPopup={onOpenHelpPopup}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
