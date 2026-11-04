import React from 'react';
import { Calendar, Clock, Music, FileText, BookOpen, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getStationTimezone, getStationTimezoneOption } from '../../lib/compatibility';

export interface CalendarHeaderBarProps {
  headerContainerRef: React.RefObject<HTMLDivElement | null>;
  viewMode: 'list' | 'calendar' | 'shows';
  setViewMode: (mode: 'list' | 'calendar' | 'shows') => void;
  stationTimezone?: string;
  announcementFilterQuery: string;
  setAnnouncementFilterQuery: (val: string) => void;
  showFilterQuery: string;
  setShowFilterQuery: (val: string) => void;
  createNew: () => void;
  createNewShow: () => void;
  isHeaderStacked: boolean;
  isUltraNarrowHeader: boolean;
  hideCalendarIcon: boolean;
  hideAnnouncementsIcons: boolean;
  hideShowsIcon: boolean;
  modeIconsOnly: boolean;
  addTextIconOnly: boolean;
  addTextShort: boolean;
  halfFilter: boolean;
  showPixelRuler: boolean;
  isFullStacked: boolean;
  isCell3Below: boolean;
  isFilterModeSplit: boolean;
  activeTriggerWidth: number;
  headerContainerWidth: number;
  controlsContainerWidth: number;
}

export function CalendarHeaderBar({
  headerContainerRef,
  viewMode,
  setViewMode,
  stationTimezone,
  announcementFilterQuery,
  setAnnouncementFilterQuery,
  showFilterQuery,
  setShowFilterQuery,
  createNew,
  createNewShow,
  isHeaderStacked,
  isUltraNarrowHeader,
  hideCalendarIcon,
  hideAnnouncementsIcons,
  hideShowsIcon,
  modeIconsOnly,
  addTextIconOnly,
  addTextShort,
  halfFilter,
  showPixelRuler,
  isFullStacked,
  isCell3Below,
  isFilterModeSplit,
  activeTriggerWidth,
  headerContainerWidth,
  controlsContainerWidth,
}: CalendarHeaderBarProps) {
  return (
    <>
      <div
        ref={headerContainerRef}
        className={cn(
          'mb-3 px-1 shrink-0 overflow-hidden w-full',
          isHeaderStacked ? 'flex flex-col gap-2' : 'flex items-center justify-between flex-nowrap gap-2'
        )}
      >
        {isHeaderStacked ? (
          <div className="flex items-center justify-between w-full gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  title="Calendar View"
                  className={cn(
                    'flex items-center text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                    isUltraNarrowHeader ? 'px-2 py-1 gap-1' : 'px-3 py-1.5 gap-1.5',
                    viewMode === 'calendar'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                      viewMode === 'calendar'
                        ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                        : 'bg-slate-800'
                    )}
                  />
                  {(!hideCalendarIcon || modeIconsOnly) && <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  {!modeIconsOnly && <span>Calendar</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="Announcements View"
                  className={cn(
                    'flex items-center text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                    isUltraNarrowHeader ? 'px-2 py-1 gap-1' : 'px-3 py-1.5 gap-1.5',
                    viewMode === 'list'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                      viewMode === 'list'
                        ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                        : 'bg-slate-800'
                    )}
                  />
                  {(!hideAnnouncementsIcons || modeIconsOnly) && <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  {!modeIconsOnly && <span>Announcements</span>}
                  {(!hideAnnouncementsIcons || (modeIconsOnly && !isUltraNarrowHeader)) && (
                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('shows')}
                  title="Shows View"
                  className={cn(
                    'flex items-center text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                    isUltraNarrowHeader ? 'px-2 py-1 gap-1' : 'px-3 py-1.5 gap-1.5',
                    viewMode === 'shows'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                      viewMode === 'shows'
                        ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                        : 'bg-slate-800'
                    )}
                  />
                  {(!hideShowsIcon || modeIconsOnly) && <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  {!modeIconsOnly && <span>Shows</span>}
                </button>
              </div>

              {(() => {
                const activeTzOpt = getStationTimezoneOption(stationTimezone || getStationTimezone());
                return (
                  <div
                    title={`Station Timezone: ${activeTzOpt.label}\nRead-only note. You can edit the station timezone in Admin Mode under Folders > Help > System Maintenance & Reset.`}
                    className={cn(
                      'flex items-center bg-slate-100 border border-slate-250 rounded font-bold text-slate-600 select-none cursor-help min-w-0 truncate',
                      isUltraNarrowHeader ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1 px-2 py-1 text-[11px]'
                    )}
                  >
                    <Clock className="w-3 h-3 text-slate-450 shrink-0" />
                    <span className="truncate">{activeTzOpt.offsetLabel}</span>
                  </div>
                );
              })()}
            </div>

            <button
              onClick={viewMode === 'shows' ? createNewShow : createNew}
              className={cn(
                'bg-blue-600 text-white rounded text-xs font-black tracking-tighter shadow-sm hover:bg-blue-700 transition-colors uppercase cursor-pointer border border-blue-700 shrink-0 whitespace-nowrap',
                isUltraNarrowHeader ? 'px-2 py-1 h-7' : 'p-1.5 px-3 h-8'
              )}
              title={viewMode === 'shows' ? 'Add Show' : 'Add Announcement'}
            >
              {addTextIconOnly ? '+' : addTextShort ? '+ ADD' : viewMode === 'shows' ? '+ ADD SHOW' : '+ ADD NEW'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                  viewMode === 'calendar'
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                    viewMode === 'calendar'
                      ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                      : 'bg-slate-800'
                  )}
                />
                {(!hideCalendarIcon || modeIconsOnly) && <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Calendar</span>}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                  viewMode === 'list'
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                    viewMode === 'list'
                      ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                      : 'bg-slate-800'
                  )}
                />
                {(!hideAnnouncementsIcons || modeIconsOnly) && <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Announcements</span>}
                {(!hideAnnouncementsIcons || modeIconsOnly) && <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('shows')}
                className={cn(
                  'px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0',
                  viewMode === 'shows'
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-300'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0',
                    viewMode === 'shows'
                      ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                      : 'bg-slate-800'
                  )}
                />
                {(!hideShowsIcon || modeIconsOnly) && <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Shows</span>}
              </button>
            </div>

            {(() => {
              const activeTzOpt = getStationTimezoneOption(stationTimezone || getStationTimezone());
              return (
                <div
                  title={`Station Timezone: ${activeTzOpt.label}\nRead-only note. You can edit the station timezone in Admin Mode under Folders > Help > System Maintenance & Reset.`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-250 rounded-lg text-[11px] font-bold text-slate-600 select-none cursor-help min-w-0 truncate"
                >
                  <Clock className="w-3 h-3 text-slate-450 shrink-0" />
                  <span className="truncate">
                    {halfFilter ? activeTzOpt.offsetLabel : activeTzOpt.label.replace(' — ', ' · ')}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        <div
          className={cn(
            'flex gap-2 items-center shrink-0 min-w-0',
            isHeaderStacked ? 'w-full' : 'flex-nowrap',
            isHeaderStacked && isUltraNarrowHeader && viewMode === 'calendar' && 'flex-col items-stretch gap-1.5'
          )}
        >
          {!(isHeaderStacked && isUltraNarrowHeader && viewMode === 'calendar') && (
            <Search className="w-3.5 h-3.5 text-slate-450 shrink-0" />
          )}
          {viewMode === 'calendar' ? (
            <>
              <div
                className={cn(
                  'relative transition-all min-w-0',
                  isHeaderStacked ? 'flex-1 w-full' : halfFilter ? 'w-24 shrink-0' : 'w-36 sm:w-44 shrink-0'
                )}
              >
                <input
                  type="text"
                  placeholder={halfFilter ? 'Announcements...' : 'Filter announcements...'}
                  value={announcementFilterQuery}
                  onChange={e => setAnnouncementFilterQuery(e.target.value)}
                  className="w-full min-w-0 px-2.5 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                />
                {announcementFilterQuery && (
                  <button
                    onClick={() => setAnnouncementFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                    title="Clear announcement filter"
                  >
                    ×
                  </button>
                )}
              </div>

              <div
                className={cn(
                  'relative transition-all min-w-0',
                  isHeaderStacked ? 'flex-1 w-full' : halfFilter ? 'w-24 shrink-0' : 'w-36 sm:w-44 shrink-0'
                )}
              >
                <input
                  type="text"
                  placeholder={halfFilter ? 'Shows...' : 'Filter shows...'}
                  value={showFilterQuery}
                  onChange={e => setShowFilterQuery(e.target.value)}
                  className="w-full min-w-0 px-2.5 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                />
                {showFilterQuery && (
                  <button
                    onClick={() => setShowFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                    title="Clear show filter"
                  >
                    ×
                  </button>
                )}
              </div>
            </>
          ) : (
            <div
              className={cn(
                'relative transition-all min-w-0',
                isHeaderStacked ? 'flex-1 w-full' : halfFilter ? 'w-28 shrink-0' : 'w-48 sm:w-56 shrink-0'
              )}
            >
              <input
                type="text"
                placeholder={
                  halfFilter
                    ? viewMode === 'shows'
                      ? 'Shows...'
                      : 'Announcements...'
                    : viewMode === 'shows'
                      ? 'Filter shows...'
                      : 'Filter announcements...'
                }
                value={viewMode === 'shows' ? showFilterQuery : announcementFilterQuery}
                onChange={e =>
                  viewMode === 'shows'
                    ? setShowFilterQuery(e.target.value)
                    : setAnnouncementFilterQuery(e.target.value)
                }
                className="w-full min-w-0 px-2.5 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
              />
              {((viewMode === 'shows' && showFilterQuery) ||
                (viewMode !== 'shows' && announcementFilterQuery)) && (
                <button
                  onClick={() =>
                    viewMode === 'shows' ? setShowFilterQuery('') : setAnnouncementFilterQuery('')
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                  title="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {!isHeaderStacked && (
            <button
              onClick={viewMode === 'shows' ? createNewShow : createNew}
              className="p-1.5 px-3 bg-blue-600 text-white rounded text-xs font-black tracking-tighter shadow-sm hover:bg-blue-700 transition-colors uppercase cursor-pointer h-8 border border-blue-700 shrink-0 whitespace-nowrap"
            >
              {addTextIconOnly ? '+' : addTextShort ? '+ ADD' : viewMode === 'shows' ? '+ ADD SHOW' : '+ ADD NEW'}
            </button>
          )}
        </div>
      </div>

      {showPixelRuler && (
        <div className="my-2 p-1.5 bg-slate-900 text-slate-100 rounded-lg text-[10px] font-sans tabular-nums select-none overflow-hidden shrink-0 border border-slate-700 shadow-sm">
          <div className="flex justify-between items-center px-1 mb-1 text-[11px] font-bold text-amber-400">
            <span className="flex items-center gap-2">
              <span>DEBUG PIXEL RULER</span>
              <span className="text-[10px] font-normal text-slate-400">
                (
                {isUltraNarrowHeader
                  ? 'Ultra Narrow <360'
                  : isFullStacked
                    ? 'Full Stacked <390'
                    : isHeaderStacked
                      ? 'Header Stacked <640/540'
                      : isCell3Below
                        ? 'Cell 3 Below <630'
                        : isFilterModeSplit
                          ? 'Filter/Mode Split <1130'
                          : 'Full Width ≥1130'}
                )
              </span>
            </span>
            <span>
              Trigger Value:{' '}
              <span className="text-cyan-300 font-extrabold text-xs">{Math.round(activeTriggerWidth)}px</span>
            </span>
          </div>
          <div className="relative h-8 bg-slate-800/80 rounded border border-slate-700/80 overflow-x-auto overflow-y-hidden">
            <div
              className="absolute inset-y-0 left-0 flex items-center"
              style={{ width: `${Math.max(headerContainerWidth, controlsContainerWidth, 1360)}px` }}
            >
              {[
                320, 360, 390, 420, 450, 460, 480, 520, 540, 630, 640, 690, 780, 800, 840, 900, 920,
                980, 1040, 1130, 1180, 1300, 1360,
              ].map((px, idx) => {
                const isTop = idx % 2 === 0;
                return (
                  <div
                    key={px}
                    className="absolute inset-y-0 flex flex-col items-center -translate-x-1/2 pointer-events-none"
                    style={{ left: `${px}px` }}
                  >
                    {isTop ? (
                      <>
                        <span className="text-[9px] leading-none text-amber-300 font-bold bg-slate-900/90 px-0.5 rounded-xs mt-0.5">
                          {px}
                        </span>
                        <div className="w-px flex-1 bg-amber-400/80 my-0.5" />
                      </>
                    ) : (
                      <>
                        <div className="w-px flex-1 bg-amber-400/80 my-0.5" />
                        <span className="text-[9px] leading-none text-amber-300 font-bold bg-slate-900/90 px-0.5 rounded-xs mb-0.5">
                          {px}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}

              <div
                className="absolute inset-y-0 flex flex-col items-center z-10 pointer-events-none -translate-x-1/2"
                style={{ left: `${activeTriggerWidth}px` }}
              >
                <span className="text-[9px] font-extrabold text-slate-900 bg-cyan-300 px-1 rounded-xs -mt-0.5 shadow-xs whitespace-nowrap z-20">
                  {Math.round(activeTriggerWidth)}px
                </span>
                <div className="w-0.5 flex-1 bg-cyan-300 shadow-[0_0_4px_rgba(103,232,249,0.8)]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
