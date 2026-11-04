import React from 'react';
import { AlertCircle, AlertTriangle, ListChecks } from 'lucide-react';
import { Announcement, AnnouncementType, Show, ScheduleIssue, LogEntry } from '../../types';
import {
  cn,
  getMP3Status,
  isTimeInShow,
  getSortedShows,
  getShowShade,
  getActiveMp3ForSlot,
  getGatedAssetType,
  formatTime12,
  formatHour12,
  formatHourShort12,
  formatRotatedAnnouncementName,
  formatRotatedFileName,
} from '../../lib/utils';
import { evaluateScheduleDiagnostics } from '../../lib/scheduleDiagnostics';
import { reconcileScheduleAndLogs, doesLogMatchLocalSlot } from '../../lib/temporalReconciliation';
import { addSoftHyphensForFirstLine, AnnouncementConflict, ShowConflict } from './calendarHelpers';

export interface WeeklyCalendarGridProps {
  controlsContainerRef: React.RefObject<HTMLDivElement | null>;
  announcementConflicts: AnnouncementConflict[];
  showConflicts: ShowConflict[];
  isCell3Below: boolean;
  isFullStacked: boolean;
  isIssuesAuditStacked: boolean;
  controlsNavShort: boolean;
  controlsNavIconOnly: boolean;
  isWeekDayStacked: boolean;
  isNavStacked: boolean;
  isFilterModeSplit: boolean;
  dropShowIssuesText: boolean;
  dropAuditWord: boolean;
  calendarTimeframe: 'weekly' | 'daily';
  setCalendarTimeframe: (val: 'weekly' | 'daily') => void;
  calendarLayoutMode: 'full' | 'compact';
  setCalendarLayoutMode: (val: 'full' | 'compact') => void;
  calendarDate: Date;
  handleMonthChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  handleYearChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  navigateCalendar: (offset: number) => void;
  jumpToToday: () => void;
  selectedHours: number[];
  setSelectedHours: React.Dispatch<React.SetStateAction<number[]>>;
  isHoursDropdownOpen: boolean;
  setIsHoursDropdownOpen: (val: boolean) => void;
  showInactive: boolean;
  setShowInactive: (val: boolean) => void;
  showIssues: boolean;
  setShowIssues: (val: boolean) => void;
  setIsScheduleAuditOpen: (val: boolean) => void;
  scheduleDiagnostics: ReturnType<typeof evaluateScheduleDiagnostics>;
  now: Date;
  shows: Show[];
  showFilterQuery: string;
  dayAuditByDayKey: Map<string, ReturnType<typeof reconcileScheduleAndLogs>>;
  logsByDayHour: Map<string, LogEntry[]>;
  getAnnouncementsForDateTime: (date: Date, hour: number) => Announcement[];
  setSelectedCalendarShow: (show: Show | null) => void;
  setPreviewScriptFile: (file: string | null) => void;
  startEdit: (s: Announcement) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

export function WeeklyCalendarGrid({
  controlsContainerRef,
  announcementConflicts,
  showConflicts,
  isCell3Below,
  isFullStacked,
  isIssuesAuditStacked,
  controlsNavShort,
  controlsNavIconOnly,
  isWeekDayStacked,
  isNavStacked,
  isFilterModeSplit,
  dropShowIssuesText,
  dropAuditWord,
  calendarTimeframe,
  setCalendarTimeframe,
  calendarLayoutMode,
  setCalendarLayoutMode,
  calendarDate,
  handleMonthChange,
  handleYearChange,
  navigateCalendar,
  jumpToToday,
  selectedHours,
  setSelectedHours,
  isHoursDropdownOpen,
  setIsHoursDropdownOpen,
  showInactive,
  setShowInactive,
  showIssues,
  setShowIssues,
  setIsScheduleAuditOpen,
  scheduleDiagnostics,
  now,
  shows,
  showFilterQuery,
  dayAuditByDayKey,
  logsByDayHour,
  getAnnouncementsForDateTime,
  setSelectedCalendarShow,
  setPreviewScriptFile,
  startEdit,
}: WeeklyCalendarGridProps) {
  const getWeekDays = (baseDate: Date) => {
    const currentDay = baseDate.getDay();
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - currentDay);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getCalendarDays = (baseDate: Date) => {
    if (calendarTimeframe === 'daily') {
      return [baseDate];
    }
    return getWeekDays(baseDate);
  };

  const formatDayHeader = (date: Date) => {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return {
      dayName: dayNames[date.getDay()],
      dateStr: `${month}/${day}`,
    };
  };

  const isDayPast = (d: Date) => {
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return dStart < todayStart;
  };

  const isHourPast = (d: Date, h: number) => {
    const cellHourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h + 1, 0, 0, 0).getTime();
    return cellHourEnd <= now.getTime();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {(announcementConflicts.length > 0 || showConflicts.length > 0) && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 px-3.5 mb-3 text-amber-800 text-xs italic flex items-start gap-2.5 shadow-2xs shrink-0">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
          <div className="space-y-1">
            {announcementConflicts.length > 0 && (
              <div>
                <span className="font-semibold not-italic text-amber-900">Announcement Caution: </span>
                {announcementConflicts.map(c => c.message).join('; ')}
              </div>
            )}
            {showConflicts.length > 0 && (
              <div>
                <span className="font-semibold not-italic text-amber-900">Show Caution: </span>
                {showConflicts.map(c => c.message).join('; ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar View Controls */}
      <div
        ref={controlsContainerRef}
        className={cn(
          'mb-3 flex items-center justify-between gap-3 w-full min-w-0',
          isCell3Below ? 'flex-wrap' : 'flex-nowrap'
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3 min-w-0',
            isCell3Below ? 'w-full justify-between' : 'shrink-0',
            isFullStacked && 'flex-col items-stretch gap-2'
          )}
        >
          <div
            className={cn(
              'bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2.5 shrink-0 shadow-2xs',
              isFullStacked ? 'w-full justify-between min-w-0' : 'min-w-max',
              isIssuesAuditStacked && 'self-stretch'
            )}
          >
            <div
              className={cn(
                'inline-flex bg-slate-200/70 p-0.5 rounded border border-slate-300/40 font-black uppercase select-none shrink-0 gap-0.5',
                controlsNavShort ? 'text-[11px]' : 'text-xs',
                isWeekDayStacked ? 'flex-col' : 'flex-row mr-1'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setCalendarTimeframe('weekly');
                  localStorage.setItem('announcement_calendar_timeframe', 'weekly');
                }}
                className={cn(
                  'relative rounded font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer',
                  controlsNavShort ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
                  calendarTimeframe === 'weekly'
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => {
                  setCalendarTimeframe('daily');
                  localStorage.setItem('announcement_calendar_timeframe', 'daily');
                }}
                className={cn(
                  'relative rounded font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer',
                  controlsNavShort ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
                  calendarTimeframe === 'daily'
                    ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Day
              </button>
            </div>

            {isNavStacked ? (
              <div className={cn('flex flex-col gap-1.5', isFullStacked ? 'flex-1 min-w-0' : 'shrink-0')}>
                <div className="flex items-center gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => navigateCalendar(-1)}
                    className={cn(
                      'flex-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer font-black uppercase tracking-tighter whitespace-nowrap flex items-center justify-center transition-all',
                      controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
                    )}
                    title={calendarTimeframe === 'daily' ? 'Previous Day' : 'Previous Week'}
                  >
                    <span>&larr;</span>
                    {!controlsNavIconOnly && (
                      <span className="ml-1">
                        PREV{!controlsNavShort ? ` ${calendarTimeframe === 'daily' ? 'DAY' : 'WEEK'}` : ''}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateCalendar(1)}
                    className={cn(
                      'flex-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer font-black uppercase tracking-tighter whitespace-nowrap flex items-center justify-center transition-all',
                      controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
                    )}
                    title={calendarTimeframe === 'daily' ? 'Next Day' : 'Next Week'}
                  >
                    {!controlsNavIconOnly && (
                      <span className="mr-1">
                        NEXT{!controlsNavShort ? ` ${calendarTimeframe === 'daily' ? 'DAY' : 'WEEK'}` : ''}
                      </span>
                    )}
                    <span>&rarr;</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className={cn(
                    'w-full rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-black cursor-pointer uppercase tracking-tighter whitespace-nowrap text-center transition-all',
                    controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
                  )}
                >
                  Today
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0 flex-row">
                <button
                  type="button"
                  onClick={() => navigateCalendar(-1)}
                  className={cn(
                    'rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer font-black uppercase tracking-tighter whitespace-nowrap flex items-center justify-center transition-all',
                    controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
                  )}
                  title={calendarTimeframe === 'daily' ? 'Previous Day' : 'Previous Week'}
                >
                  <span>&larr;</span>
                  {!controlsNavIconOnly && (
                    <span className="ml-1">
                      PREV{!controlsNavShort ? ` ${calendarTimeframe === 'daily' ? 'DAY' : 'WEEK'}` : ''}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={jumpToToday}
                  className={cn(
                    'rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-black cursor-pointer uppercase tracking-tighter whitespace-nowrap text-center transition-all',
                    controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
                  )}
                >
                  Today
                </button>

                <button
                  type="button"
                  onClick={() => navigateCalendar(1)}
                  className={cn(
                    'rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer font-black uppercase tracking-tighter whitespace-nowrap flex items-center justify-center transition-all',
                    controlsNavShort ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
                  )}
                  title={calendarTimeframe === 'daily' ? 'Next Day' : 'Next Week'}
                >
                  {!controlsNavIconOnly && (
                    <span className="mr-1">
                      NEXT{!controlsNavShort ? ` ${calendarTimeframe === 'daily' ? 'DAY' : 'WEEK'}` : ''}
                    </span>
                  )}
                  <span>&rarr;</span>
                </button>
              </div>
            )}
          </div>

          {isCell3Below && (
            <div
              className={cn(
                'bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex text-xs font-black uppercase tracking-tighter shadow-2xs shrink-0',
                isFullStacked
                  ? 'w-full flex-row items-center justify-between gap-2'
                  : isIssuesAuditStacked
                    ? 'flex-col justify-between items-stretch gap-1.5 self-stretch'
                    : 'items-center gap-2.5'
              )}
            >
              <label className="flex items-center gap-1.5 text-slate-650 cursor-pointer select-none text-xs font-black uppercase tracking-tighter shrink-0">
                <input
                  type="checkbox"
                  checked={showIssues}
                  onChange={e => {
                    setShowIssues(e.target.checked);
                    try {
                      localStorage.setItem('announcement_calendar_show_issues', String(e.target.checked));
                    } catch {
                      // ignore storage errors
                    }
                  }}
                  className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 cursor-pointer"
                />
                <span>{dropShowIssuesText ? 'Issues' : 'Show Issues'}</span>
              </label>

              <button
                type="button"
                onClick={() => setIsScheduleAuditOpen(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border shrink-0',
                  isIssuesAuditStacked && !isFullStacked && 'justify-center',
                  scheduleDiagnostics.summary.total > 0
                    ? scheduleDiagnostics.summary.criticalCount > 0
                      ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-250 shadow-2xs'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-250 shadow-2xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-250 shadow-2xs'
                )}
                title={`Issues Audit (${scheduleDiagnostics.summary.total} issues detected)`}
              >
                <ListChecks
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    scheduleDiagnostics.summary.total > 0
                      ? scheduleDiagnostics.summary.criticalCount > 0
                        ? 'text-red-600'
                        : 'text-amber-600'
                      : 'text-emerald-600'
                  )}
                />
                {!dropAuditWord && <span>Audit</span>}
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-black text-white shrink-0',
                    scheduleDiagnostics.summary.total > 0
                      ? scheduleDiagnostics.summary.criticalCount > 0
                        ? 'bg-red-600'
                        : 'bg-amber-600'
                      : 'bg-emerald-600'
                  )}
                >
                  {scheduleDiagnostics.summary.total}
                </span>
              </button>
            </div>
          )}
        </div>

        <div
          className={cn(
            'flex items-center gap-3 min-w-0',
            isCell3Below ? 'w-full justify-start' : 'justify-end shrink-0',
            isFullStacked && 'w-full flex-col items-stretch'
          )}
        >
          <div
            className={cn(
              'bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-tighter shadow-2xs min-w-0',
              isFilterModeSplit ? 'flex-col items-start gap-2' : 'items-center',
              isIssuesAuditStacked && 'self-stretch',
              isCell3Below && 'w-full justify-between'
            )}
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto">
              <span className="text-slate-450">Filter:</span>
              <select
                value={calendarDate.getMonth()}
                onChange={handleMonthChange}
                className="bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-0 max-w-full"
              >
                {MONTHS.map((m, idx) => (
                  <option key={idx} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={calendarDate.getFullYear()}
                onChange={handleYearChange}
                className="bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-0 max-w-full"
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <div className="relative inline-block text-left min-w-0">
                <button
                  type="button"
                  onClick={() => setIsHoursDropdownOpen(!isHoursDropdownOpen)}
                  className={cn(
                    'bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 justify-between',
                    isFullStacked ? 'min-w-[96px]' : 'min-w-[110px]'
                  )}
                >
                  <span className="truncate">
                    {selectedHours.length === 24
                      ? 'All (24 Hours)'
                      : selectedHours.length === 0
                        ? 'None selected'
                        : `${selectedHours.length} selected`}
                  </span>
                  <span className="text-slate-440 text-[9px] shrink-0">▼</span>
                </button>

                {isHoursDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setIsHoursDropdownOpen(false)}
                    />
                    <div className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-64 max-w-[calc(100vw-2rem)] bg-white border border-slate-250 rounded-xl shadow-lg z-25 p-2.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">
                          Select Hours
                        </span>
                        <div className="flex gap-1.5 text-xs font-black uppercase tracking-tighter">
                          <button
                            type="button"
                            onClick={() => setSelectedHours(Array.from({ length: 24 }, (_, i) => i))}
                            className="text-blue-600 hover:text-blue-700 cursor-pointer"
                          >
                            All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedHours([])}
                            className="text-slate-500 hover:text-slate-600 cursor-pointer"
                          >
                            None
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1 max-h-[180px] overflow-y-auto custom-scrollbar">
                        {Array.from({ length: 24 }).map((_, h) => {
                          const isSelected = selectedHours.includes(h);
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedHours(selectedHours.filter(item => item !== h));
                                } else {
                                  setSelectedHours([...selectedHours, h].sort((a, b) => a - b));
                                }
                              }}
                              className={cn(
                                'p-1 py-1 rounded text-xs font-black font-sans tabular-nums tracking-tight text-center border cursor-pointer select-none transition-all',
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600 font-extrabold'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              )}
                            >
                              {formatHourShort12(h)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn('text-slate-450', !isFullStacked && 'ml-1')}>Mode:</span>
                <div className="inline-flex bg-slate-200/70 p-0.5 rounded border border-slate-300/40 font-black text-xs uppercase select-none shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarLayoutMode('full');
                      localStorage.setItem('announcement_calendar_layout_mode', 'full');
                    }}
                    className={cn(
                      'relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer',
                      calendarLayoutMode === 'full'
                        ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarLayoutMode('compact');
                      localStorage.setItem('announcement_calendar_layout_mode', 'compact');
                    }}
                    className={cn(
                      'relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer',
                      calendarLayoutMode === 'compact'
                        ? 'bg-white text-slate-800 shadow-sm font-extrabold'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Compact
                  </button>
                </div>
              </div>

              <label
                className={cn(
                  'flex items-center gap-1.5 text-slate-650 cursor-pointer select-none text-xs font-black uppercase tracking-tighter shrink-0',
                  !isFullStacked && 'ml-1'
                )}
              >
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                />
                <span>{dropShowIssuesText ? 'Inactive' : 'Show Inactive'}</span>
              </label>
            </div>
          </div>

          {!isCell3Below && (
            <div
              className={cn(
                'bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex text-xs font-black uppercase tracking-tighter shadow-2xs shrink-0',
                isIssuesAuditStacked ? 'flex-col justify-between items-stretch gap-1.5' : 'items-center gap-2.5',
                isIssuesAuditStacked && 'self-stretch'
              )}
            >
              <label className="flex items-center gap-1.5 text-slate-650 cursor-pointer select-none text-xs font-black uppercase tracking-tighter shrink-0">
                <input
                  type="checkbox"
                  checked={showIssues}
                  onChange={e => {
                    setShowIssues(e.target.checked);
                    try {
                      localStorage.setItem('announcement_calendar_show_issues', String(e.target.checked));
                    } catch {
                      // ignore storage errors
                    }
                  }}
                  className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 cursor-pointer"
                />
                <span>{dropShowIssuesText ? 'Issues' : 'Show Issues'}</span>
              </label>

              <button
                type="button"
                onClick={() => setIsScheduleAuditOpen(true)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border shrink-0',
                  isIssuesAuditStacked && 'justify-center',
                  scheduleDiagnostics.summary.total > 0
                    ? scheduleDiagnostics.summary.criticalCount > 0
                      ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-250 shadow-2xs'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-250 shadow-2xs'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-250 shadow-2xs'
                )}
                title={`Issues Audit (${scheduleDiagnostics.summary.total} issues detected)`}
              >
                <ListChecks
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    scheduleDiagnostics.summary.total > 0
                      ? scheduleDiagnostics.summary.criticalCount > 0
                        ? 'text-red-600'
                        : 'text-amber-600'
                      : 'text-emerald-600'
                  )}
                />
                {!dropAuditWord && <span>Audit</span>}
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-black text-white shrink-0',
                    scheduleDiagnostics.summary.total > 0
                      ? scheduleDiagnostics.summary.criticalCount > 0
                        ? 'bg-red-600'
                        : 'bg-amber-600'
                      : 'bg-emerald-600'
                  )}
                >
                  {scheduleDiagnostics.summary.total}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The Calendar Grid Container */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col flex-1 min-h-0">
        <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 flex flex-col">
          <div
            className={cn(
              'grid bg-slate-100 border-b border-slate-250 select-none text-xs font-black text-slate-500 uppercase tracking-tighter shrink-0 shadow-sm sticky top-0 z-20',
              calendarTimeframe === 'daily'
                ? 'grid-cols-[74px_1fr]'
                : 'grid-cols-[74px_repeat(7,minmax(0,1fr))]'
            )}
          >
            <div className="p-2 border-r border-slate-205 flex items-center justify-center font-sans text-slate-450">
              Hour
            </div>
            {getCalendarDays(calendarDate).map((day, idx) => {
              const { dayName, dateStr } = formatDayHeader(day);
              const isToday = day.toISOString().split('T')[0] === now.toISOString().split('T')[0];
              const isPast = isDayPast(day);
              const dayLookupKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
                day.getDate()
              ).padStart(2, '0')}`;
              const dayAudit = dayAuditByDayKey.get(dayLookupKey) || null;
              const showDayAuditCounts = Boolean(
                dayAudit &&
                  dayAudit.totalPlanned > 0 &&
                  (isPast || isToday || dayAudit.totalPlayed > 0 || dayAudit.totalExtra > 0)
              );
              const tooltip =
                showDayAuditCounts && dayAudit
                  ? `${dayName} ${dateStr}\nTotal Planned: ${dayAudit.totalPlanned} | Played: ${dayAudit.totalPlayed} | Missed: ${dayAudit.totalMissed}${
                      dayAudit.totalExtra > 0 ? ` | Extra: ${dayAudit.totalExtra}` : ''
                    }`
                  : `${dayName} ${dateStr}`;

              return (
                <div
                  key={idx}
                  className={cn(
                    'p-1.5 text-center border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center min-w-0 transition-colors',
                    isToday
                      ? 'bg-blue-500/10 text-blue-700 font-black'
                      : isPast
                        ? 'bg-slate-200/50 text-slate-400 opacity-80 italic font-normal'
                        : 'text-slate-650'
                  )}
                  title={tooltip}
                >
                  <span className={cn('text-xs leading-tight truncate', isPast ? 'italic' : 'font-black')}>
                    {dayName} <span className="opacity-80 font-normal ml-1">{dateStr}</span>
                  </span>
                  {showDayAuditCounts && dayAudit && (
                    <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px] font-sans tabular-nums leading-none not-italic select-none">
                      <span className="text-emerald-700 font-bold" title={`Played: ${dayAudit.totalPlayed}`}>
                        {dayAudit.totalPlayed}✓
                      </span>
                      {dayAudit.totalMissed > 0 && (
                        <span className="text-rose-700 font-bold" title={`Missed: ${dayAudit.totalMissed}`}>
                          {dayAudit.totalMissed}⚠
                        </span>
                      )}
                      {dayAudit.totalExtra > 0 && (
                        <span className="text-amber-700 font-bold" title={`Extra: ${dayAudit.totalExtra}`}>
                          +{dayAudit.totalExtra}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {Array.from({ length: 24 })
            .map((_, h) => h)
            .filter(h => selectedHours.includes(h))
            .map(hour => {
              const calendarDays = getCalendarDays(calendarDate);
              const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

              const matchesShowFilter = (show: Show) => {
                if (!showFilterQuery) return true;
                const q = showFilterQuery.toLowerCase();
                return (
                  show.name.toLowerCase().includes(q) ||
                  (show.description && show.description.toLowerCase().includes(q)) ||
                  show.day.toLowerCase().includes(q)
                );
              };

              const hourHasTopShows = calendarDays.some(d => {
                const dName = daysOrder[d.getDay()];
                const topStarting = shows.filter(
                  show =>
                    show.day === dName &&
                    show.startHour === hour &&
                    (show.startMinute === 0 || !show.startMinute) &&
                    matchesShowFilter(show)
                );
                if (topStarting.length > 0) return true;

                if (hour === 0) {
                  const currentDayIdx = daysOrder.indexOf(dName);
                  const priorDayIdx = (currentDayIdx - 1 + 7) % 7;
                  const priorDayName = daysOrder[priorDayIdx];
                  const continuing = shows.filter(
                    show => show.day === priorDayName && isTimeInShow(show, dName, 0, 0) && matchesShowFilter(show)
                  );
                  if (continuing.length > 0) return true;
                }

                return false;
              });

              const hourMidMinutes = Array.from(
                new Set(
                  calendarDays.flatMap(d => {
                    const dName = daysOrder[d.getDay()];
                    const dayIdx = daysOrder.indexOf(dName);
                    const hourStartTotal = dayIdx * 1440 + hour * 60;
                    const hourEndTotal = hourStartTotal + 60;

                    const midMins: number[] = [];

                    shows
                      .filter(show => matchesShowFilter(show))
                      .forEach(show => {
                        const showDayIdx = daysOrder.indexOf(show.day);
                        if (showDayIdx === -1) return;

                        const showStartTotal = showDayIdx * 1440 + show.startHour * 60 + (show.startMinute || 0);
                        const durationMin = (show.durationHours || 0) * 60 + (show.durationMinutes || 0);
                        const showEndTotal = showStartTotal + durationMin;

                        if (showStartTotal >= hourStartTotal && showStartTotal < hourEndTotal) {
                          const relStart = showStartTotal - hourStartTotal;
                          if (relStart > 0 && relStart < 60) midMins.push(relStart);
                        } else if (showStartTotal >= 10080) {
                          const modStart = showStartTotal % 10080;
                          if (modStart >= hourStartTotal && modStart < hourEndTotal) {
                            const relStart = modStart - hourStartTotal;
                            if (relStart > 0 && relStart < 60) midMins.push(relStart);
                          }
                        }

                        if (showEndTotal > hourStartTotal && showEndTotal < hourEndTotal) {
                          const relEnd = showEndTotal - hourStartTotal;
                          if (relEnd > 0 && relEnd < 60) midMins.push(relEnd);
                        } else if (showEndTotal >= 10080) {
                          const modEnd = showEndTotal % 10080;
                          if (modEnd > hourStartTotal && modEnd < hourEndTotal) {
                            const relEnd = modEnd - hourStartTotal;
                            if (relEnd > 0 && relEnd < 60) midMins.push(relEnd);
                          }
                        }
                      });

                    return midMins;
                  })
                )
              ).sort((a, b) => a - b);

              const allShowStartMins: number[] = [];
              if (hourHasTopShows) {
                allShowStartMins.push(0);
              }
              hourMidMinutes.forEach(m => {
                if (!allShowStartMins.includes(m)) {
                  allShowStartMins.push(m);
                }
              });
              allShowStartMins.sort((a, b) => a - b);

              interface SubRowDef {
                id: string;
                type: 'show_slot' | 'announcements';
                min?: number;
                startMin?: number;
                endMin?: number;
              }

              const initialSubRowDefs: SubRowDef[] = [];
              if (allShowStartMins.length === 0) {
                initialSubRowDefs.push({
                  id: 'inters-0-60',
                  type: 'announcements',
                  startMin: 0,
                  endMin: 60,
                });
              } else {
                let currMin = 0;
                allShowStartMins.forEach(showMin => {
                  if (showMin > currMin) {
                    initialSubRowDefs.push({
                      id: `inters-${currMin}-${showMin}`,
                      type: 'announcements',
                      startMin: currMin,
                      endMin: showMin,
                    });
                  }
                  initialSubRowDefs.push({
                    id: `show-slot-${showMin}`,
                    type: 'show_slot',
                    min: showMin,
                  });
                  currMin = showMin;
                });

                if (currMin < 60) {
                  initialSubRowDefs.push({
                    id: `inters-${currMin}-60`,
                    type: 'announcements',
                    startMin: currMin,
                    endMin: 60,
                  });
                }
              }

              const activeSubRowDefs = initialSubRowDefs.filter(def => {
                if (def.type === 'show_slot') return true;
                if (def.type === 'announcements') {
                  return calendarDays.some(day => {
                    const cellInters = getAnnouncementsForDateTime(day, hour);
                    return cellInters.some(s => s.minute >= def.startMin! && s.minute < def.endMin!);
                  });
                }
                return false;
              });

              if (activeSubRowDefs.length === 0) {
                activeSubRowDefs.push({
                  id: 'default-empty',
                  type: 'announcements',
                  startMin: 0,
                  endMin: 60,
                });
              }

              return (
                <div
                  key={hour}
                  className="border-b border-slate-150 last:border-b-0 hover:bg-slate-50/10 transition-colors"
                >
                  {activeSubRowDefs.map((def, defIdx) => {
                    const subRowIntersByDay = calendarDays.map(d => {
                      const dayInters = getAnnouncementsForDateTime(d, hour);
                      return dayInters.filter(s => s.minute >= def.startMin! && s.minute < def.endMin!);
                    });

                    const subRowUniqueMins = Array.from(
                      new Set(subRowIntersByDay.flatMap(list => list.map(s => s.minute)))
                    ).sort((a, b) => a - b);

                    return (
                      <div
                        key={def.id}
                        className={cn(
                          'grid',
                          calendarTimeframe === 'daily'
                            ? 'grid-cols-[74px_1fr]'
                            : 'grid-cols-[74px_repeat(7,minmax(0,1fr))]'
                        )}
                      >
                        {defIdx === 0 ? (
                          <div
                            className={cn(
                              'border-r border-slate-200 flex items-center justify-center select-none font-black font-sans tabular-nums uppercase shrink-0 transition-colors',
                              calendarLayoutMode === 'compact'
                                ? 'p-1 px-0.5 text-xs min-h-[26px]'
                                : 'p-1.5 px-0.5 text-xs min-h-[28px]',
                              (
                                calendarTimeframe === 'daily'
                                  ? isHourPast(calendarDays[0], hour)
                                  : calendarDays.every(d => isHourPast(d, hour))
                              )
                                ? 'bg-slate-150/70 text-slate-400 opacity-75 italic'
                                : calendarTimeframe === 'daily' &&
                                    !isHourPast(calendarDays[0], hour) &&
                                    calendarDays[0].toISOString().split('T')[0] === now.toISOString().split('T')[0] &&
                                    hour === now.getHours()
                                  ? 'bg-blue-500/10 text-blue-700 font-extrabold'
                                  : 'bg-slate-50/50 text-slate-455'
                            )}
                          >
                            {formatHour12(hour)}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'border-r border-slate-200 shrink-0',
                              calendarLayoutMode === 'compact' ? 'min-h-[26px]' : 'min-h-[28px]',
                              (
                                calendarTimeframe === 'daily'
                                  ? isHourPast(calendarDays[0], hour)
                                  : calendarDays.every(d => isHourPast(d, hour))
                              )
                                ? 'bg-slate-150/40'
                                : 'bg-slate-50/50'
                            )}
                          />
                        )}

                        {calendarDays.map((day, dayIdx) => {
                          const cellAnnouncements = getAnnouncementsForDateTime(day, hour);
                          const dayName = daysOrder[day.getDay()];
                          const cellIsPast = isHourPast(day, hour);

                          const cellStartingShows = shows.filter(
                            show => show.day === dayName && show.startHour === hour && matchesShowFilter(show)
                          );

                          const cellContinuingShows = (() => {
                            if (hour === 0 && cellStartingShows.length === 0) {
                              const currentDayIdx = daysOrder.indexOf(dayName);
                              const priorDayIdx = (currentDayIdx - 1 + 7) % 7;
                              const priorDayName = daysOrder[priorDayIdx];
                              return shows.filter(
                                show =>
                                  show.day === priorDayName &&
                                  isTimeInShow(show, dayName, 0, 0) &&
                                  matchesShowFilter(show)
                              );
                            }
                            return [];
                          })();

                          const subRowMin = def.type === 'show_slot' ? def.min || 0 : def.startMin || 0;
                          const cellShows = shows.filter(
                            show => isTimeInShow(show, dayName, hour, subRowMin) && matchesShowFilter(show)
                          );
                          const cellShow = cellShows[0];

                          const renderShowCard = (show: Show, isContinuation = false) => {
                            const startMin = show.startMinute || 0;
                            const timePrefix =
                              !isContinuation && startMin !== 0 ? `:${startMin.toString().padStart(2, '0')} ` : '';
                            const rawTitle = isContinuation ? `(cont.) ${show.name}` : `${timePrefix}${show.name}`;
                            const displayTitle =
                              calendarLayoutMode === 'compact'
                                ? rawTitle
                                : addSoftHyphensForFirstLine(rawTitle, 15);

                            const startHourStr = show.startHour.toString().padStart(2, '0');
                            const startMinStr = (show.startMinute || 0).toString().padStart(2, '0');
                            const durH = show.durationHours || 0;
                            const durM = show.durationMinutes || 0;
                            const durationStr = `${durH}h${durM > 0 ? ` ${durM}m` : ''}`;
                            const showSummaryText = `Show: ${show.name}${
                              show.nameShort ? ` (${show.nameShort})` : ''
                            }\nDay: ${show.day}\nStart: ${formatTime12(
                              `${startHourStr}:${startMinStr}`
                            )}\nDuration: ${durationStr}${show.host ? `\nHost: ${show.host}` : ''}${
                              show.description ? `\nDescription: ${show.description}` : ''
                            }${cellIsPast ? '\nStatus: Past' : ''}`;

                            return (
                              <button
                                type="button"
                                onClick={() => setSelectedCalendarShow(show)}
                                key={isContinuation ? `show-cont-${show.id}` : `show-start-${show.id}`}
                                title={showSummaryText}
                                className={cn(
                                  'text-slate-800 flex flex-col justify-center text-xs font-black tracking-normal leading-tight w-full uppercase mb-0.5 text-left cursor-pointer transition-all hover:translate-x-0.5 border-0 border-b-2 rounded-none shrink-0 py-0.5 px-1 overflow-hidden',
                                  cellIsPast && 'opacity-80 contrast-90 italic',
                                  calendarLayoutMode === 'compact' ? 'h-[1.75rem] text-xs' : 'h-[2.25rem]'
                                )}
                                style={{
                                  backgroundColor: getShowShade(show, getSortedShows(shows)).bg,
                                  borderBottomColor: getShowShade(show, getSortedShows(shows)).border,
                                }}
                              >
                                <div
                                  className={cn(
                                    'font-sans break-words [overflow-wrap:anywhere] [word-break:break-all] [hyphens:manual] [text-overflow:clip] overflow-hidden leading-tight',
                                    cellIsPast && 'italic',
                                    calendarLayoutMode === 'compact' ? 'max-h-[1.1rem]' : 'max-h-[2.1rem]'
                                  )}
                                >
                                  {displayTitle}
                                </div>
                              </button>
                            );
                          };

                          const renderShowPlaceholder = (key: string) => (
                            <div
                              key={key}
                              className={cn(
                                'w-full shrink-0 mb-0.5 pointer-events-none opacity-0 select-none',
                                calendarLayoutMode === 'compact' ? 'h-[1.75rem]' : 'h-[2.25rem]'
                              )}
                            />
                          );

                          const renderAnnouncementCard = (s: Announcement) => {
                            const formattedMin = s.minute.toString().padStart(2, '0');
                            const slotDateTime = new Date(
                              day.getFullYear(),
                              day.getMonth(),
                              day.getDate(),
                              hour,
                              s.minute,
                              0,
                              0
                            );
                            const activeMp3 = getActiveMp3ForSlot(s, slotDateTime);
                            const activeUrl = activeMp3?.mp3Url?.trim() || '';
                            const backupUrl = activeMp3?.backupMp3Url?.trim() || '';
                            const isScript = getGatedAssetType(activeMp3) === 'script';
                            const fileStatus = activeUrl ? getMP3Status(activeUrl) : null;
                            const fileName = fileStatus ? fileStatus.filename || activeUrl : '';

                            const { dayName: dNameHeader, dateStr: dDateHeader } = formatDayHeader(day);
                            const scheduledTimeStr = `${dNameHeader} ${dDateHeader} at ${formatTime12(
                              `${hour.toString().padStart(2, '0')}:${formattedMin}`
                            )}`;

                            const yyyy = day.getFullYear();
                            const mm = (day.getMonth() + 1).toString().padStart(2, '0');
                            const dd = day.getDate().toString().padStart(2, '0');
                            const dayKey = `${yyyy}-${mm}-${dd}`;
                            const slotLookupKey = `${s.id}_${dayKey}_${hour}`;
                            const rawSlotIssues: ScheduleIssue[] =
                              scheduleDiagnostics.issuesBySlotId[slotLookupKey] || [];
                            const slotIssues: ScheduleIssue[] = Array.from(
                              new Map(rawSlotIssues.map(iss => [iss.id, iss])).values()
                            );
                            const hasSlotIssues = slotIssues.length > 0;
                            const hasCriticalIssue = slotIssues.some(iss => iss.severity === 'critical');

                            const fileLine = activeUrl
                              ? `${isScript ? 'Script' : 'File'}: ${formatRotatedFileName(fileName, activeMp3)}`
                              : 'File: None';

                            const backupLine = backupUrl
                              ? `\nBackup: ${getMP3Status(backupUrl).filename || backupUrl}`
                              : '';

                            const candidateLogs = logsByDayHour.get(`${dayKey}_${hour}`) || [];
                            const matchingLog = candidateLogs.find(l => {
                              const isAnn =
                                l.announcementId === s.id ||
                                (l.announcementName && l.announcementName.toLowerCase() === s.name.toLowerCase());
                              if (!isAnn) return false;
                              return doesLogMatchLocalSlot(l, dayKey, hour);
                            });
                            const isPlayed = Boolean(matchingLog);
                            const isExport = Boolean(matchingLog && matchingLog.playMode === 'Export');
                            const isPrerecord = Boolean(matchingLog && matchingLog.playMode === 'Prerecord');
                            const isMissed = cellIsPast && !matchingLog && s.enabled;

                            const auditLine = isPlayed
                              ? `\n✓ Status: ${
                                  isExport ? 'Exported' : isPrerecord ? 'Prerecorded' : 'Played On-Air'
                                }`
                              : isMissed
                                ? '\n⚠ Status: Missed Broadcast'
                                : '';

                            const issuesSummary = hasSlotIssues
                              ? `\n⚠️ ISSUES DETECTED (${slotIssues.length}):\n` +
                                slotIssues.map(iss => `• ${iss.description}`).join('\n')
                              : '';

                            const summaryText = `ID: ${s.id} — ${s.name}\nScheduled: ${scheduledTimeStr}\n${fileLine}${backupLine}\nType: ${
                              isScript ? 'Live Read (Script)' : 'Audio MP3'
                            }\nMode: ${
                              s.type === AnnouncementType.ONE_TIME
                                ? 'One-Time'
                                : s.type === AnnouncementType.BASIC_HOURLY
                                  ? 'Hourly'
                                  : 'Advanced'
                            }\nStatus: ${!s.enabled ? 'Disabled (Inactive)' : 'Active'}${
                              cellIsPast ? ' • Past' : ''
                            }${auditLine}${issuesSummary}`;

                            if (calendarLayoutMode === 'compact') {
                              return (
                                <div key={s.id} className="inline-flex items-stretch gap-[2px]">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (s.isUpNextPromo) {
                                        if (activeUrl) setPreviewScriptFile(activeUrl);
                                      } else {
                                        startEdit(s);
                                      }
                                    }}
                                    className={cn(
                                      'inline-flex items-center justify-center p-0.5 px-0.5 rounded font-sans tabular-nums text-xs font-black leading-none shadow-sm border cursor-pointer select-none shrink-0 transition-all hover:scale-105 relative',
                                      !s.enabled
                                        ? 'bg-slate-100 text-slate-400 border-grid-inactive line-through'
                                        : showIssues && hasSlotIssues
                                          ? hasCriticalIssue
                                            ? 'bg-red-50 text-red-900 border-red-500 font-extrabold ring-1 ring-red-400'
                                            : 'bg-amber-50 text-amber-900 border-amber-500 font-extrabold ring-1 ring-amber-400'
                                          : isMissed
                                            ? 'bg-rose-50 text-rose-900 border-rose-400 font-extrabold ring-1 ring-rose-300'
                                            : isPlayed
                                              ? 'bg-emerald-50 text-emerald-900 border-emerald-400 font-extrabold'
                                              : s.type === AnnouncementType.ONE_TIME
                                                ? 'bg-purple-100 text-purple-700 border-grid-onetime font-extrabold'
                                                : s.type === AnnouncementType.BASIC_HOURLY
                                                  ? 'bg-blue-100 text-blue-700 border-grid-hourly'
                                                  : 'bg-orange-100 text-orange-700 border-grid-advanced',
                                      isScript ? 'border-l-2 border-l-blue-500' : 'border-l-2 border-l-purple-500',
                                      cellIsPast && 'opacity-80 italic'
                                    )}
                                    title={summaryText}
                                  >
                                    {formattedMin}
                                    {isPlayed && (
                                      <span className="ml-0.5 text-[9px] text-emerald-700 not-italic">✓</span>
                                    )}
                                    {isMissed && (
                                      <span className="ml-0.5 text-[9px] text-rose-700 not-italic">⚠</span>
                                    )}
                                    {showIssues && hasSlotIssues && (
                                      <span
                                        className={cn(
                                          'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-white shrink-0 pointer-events-none',
                                          hasCriticalIssue ? 'bg-red-600' : 'bg-amber-500'
                                        )}
                                      />
                                    )}
                                  </button>
                                </div>
                              );
                            }

                            return (
                              <div key={s.id} className="flex items-stretch gap-1 w-full relative">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (s.isUpNextPromo) {
                                      if (activeUrl) setPreviewScriptFile(activeUrl);
                                    } else {
                                      startEdit(s);
                                    }
                                  }}
                                  className={cn(
                                    'flex-1 text-left p-1 rounded font-sans text-xs leading-tight truncate shadow-sm border block cursor-pointer select-none transition-all hover:translate-x-0.5',
                                    !s.enabled
                                      ? 'bg-slate-105 text-slate-400 border-grid-inactive line-through'
                                      : showIssues && hasSlotIssues
                                        ? hasCriticalIssue
                                          ? 'bg-red-50/90 text-red-900 border-red-400 font-semibold shadow-2xs'
                                          : 'bg-amber-50/90 text-amber-900 border-amber-400 font-semibold shadow-2xs'
                                        : isMissed
                                          ? 'bg-rose-50/90 text-rose-950 border-rose-350 font-semibold shadow-2xs'
                                          : isPlayed
                                            ? 'bg-emerald-50/70 text-emerald-950 border-emerald-350 font-semibold'
                                            : s.type === AnnouncementType.ONE_TIME
                                              ? 'bg-purple-50 text-purple-700 border-grid-onetime font-bold'
                                              : s.type === AnnouncementType.BASIC_HOURLY
                                                ? 'bg-blue-50 text-blue-700 border-grid-hourly'
                                                : 'bg-orange-50 text-orange-700 border-grid-advanced',
                                    isScript
                                      ? 'border-l-[4px] border-l-blue-500 rounded-l-sm'
                                      : 'border-l-[4px] border-l-purple-500 rounded-l-sm',
                                    cellIsPast && 'opacity-85 italic'
                                  )}
                                  title={summaryText}
                                >
                                  <div className={cn('truncate flex items-center gap-1', cellIsPast && 'italic')}>
                                    <span
                                      className={cn(
                                        'font-sans tabular-nums font-black text-xs text-slate-455 shrink-0',
                                        cellIsPast && 'italic'
                                      )}
                                    >
                                      :{formattedMin}
                                    </span>
                                    {isPlayed && (
                                      <span className="shrink-0 px-1 py-0.2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[9px] font-black uppercase leading-none not-italic">
                                        {isExport ? 'EXPORT' : isPrerecord ? 'PREREC' : 'PLAYED'}
                                      </span>
                                    )}
                                    {isMissed && (
                                      <span className="shrink-0 px-1 py-0.2 bg-rose-100 text-rose-800 border border-rose-300 rounded text-[9px] font-black uppercase leading-none not-italic">
                                        MISSED
                                      </span>
                                    )}
                                    {showIssues && hasSlotIssues && (
                                      <span
                                        className="shrink-0 inline-flex items-center"
                                        title={slotIssues[0]?.description}
                                      >
                                        {hasCriticalIssue ? (
                                          <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                        ) : (
                                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                        )}
                                      </span>
                                    )}
                                    <span className={cn('truncate', cellIsPast && 'italic')}>
                                      {formatRotatedAnnouncementName(s.name, activeMp3)}
                                    </span>
                                  </div>
                                </button>
                              </div>
                            );
                          };

                          const renderAnnouncementPlaceholder = (key: string) => (
                            <div
                              key={key}
                              className="flex items-stretch gap-1 w-full relative pointer-events-none opacity-0 select-none shrink-0"
                            >
                              <div className="flex-1 text-left p-1 rounded font-sans text-xs leading-tight border border-transparent block">
                                <div className="flex items-center gap-0.5">
                                  <span className="font-sans tabular-nums font-black text-xs shrink-0">:00</span>
                                  <span className="truncate">Placeholder</span>
                                </div>
                              </div>
                            </div>
                          );

                          const renderCompactAnnouncementPlaceholder = (key: string) => (
                            <div
                              key={key}
                              className="inline-flex items-stretch gap-[2px] opacity-0 pointer-events-none select-none shrink-0"
                            >
                              <div className="inline-flex items-center justify-center p-0.5 px-0.5 rounded font-sans tabular-nums text-xs font-black leading-none border border-transparent">
                                00
                              </div>
                            </div>
                          );

                          const renderSubRowContent = () => {
                            if (def.type === 'show_slot') {
                              if (def.min === 0) {
                                const topStartingShows = cellStartingShows.filter(s => (s.startMinute || 0) === 0);
                                const topShows = [...topStartingShows, ...cellContinuingShows];
                                if (topShows.length > 0) {
                                  return topShows.map(s => renderShowCard(s, cellContinuingShows.includes(s)));
                                }
                                return renderShowPlaceholder('top-placeholder');
                              } else {
                                const showsAtMid = cellStartingShows.filter(s => (s.startMinute || 0) === def.min);
                                if (showsAtMid.length > 0) {
                                  return showsAtMid.map(s => renderShowCard(s, false));
                                }
                                return renderShowPlaceholder(`mid-placeholder-${def.min}`);
                              }
                            } else {
                              if (calendarLayoutMode === 'compact') {
                                const day = calendarDays[dayIdx];
                                const startMin = def.startMin ?? 0;
                                const endMin = def.endMin ?? 60;

                                const cellIntersInSubRow = cellAnnouncements.filter(
                                  s => s.minute >= startMin && s.minute < endMin
                                );

                                if (cellIntersInSubRow.length === 0) {
                                  return null;
                                }

                                const dayAllHoursInters = Array.from({ length: 24 }, (_, h) => {
                                  return getAnnouncementsForDateTime(day, h).filter(
                                    s => s.minute >= startMin && s.minute < endMin
                                  );
                                });

                                const dayUniqueMins = Array.from(
                                  new Set(dayAllHoursInters.flatMap(list => list.map(s => s.minute)))
                                ).sort((a, b) => a - b);

                                if (dayUniqueMins.length === 0) {
                                  return null;
                                }

                                return dayUniqueMins.flatMap(m => {
                                  const maxItemsAtMForDay = Math.max(
                                    ...dayAllHoursInters.map(list => list.filter(s => s.minute === m).length)
                                  );
                                  const cellIntersAtM = cellIntersInSubRow.filter(s => s.minute === m);
                                  const items = cellIntersAtM.map(s => renderAnnouncementCard(s));
                                  const placeholdersNeeded = maxItemsAtMForDay - cellIntersAtM.length;
                                  const placeholders = Array.from({ length: placeholdersNeeded }, (_, pIdx) =>
                                    renderCompactAnnouncementPlaceholder(`placeholder-compact-${m}-${dayIdx}-${pIdx}`)
                                  );
                                  return [...items, ...placeholders];
                                });
                              } else {
                                if (subRowUniqueMins.length === 0) {
                                  return null;
                                }
                                return subRowUniqueMins.flatMap(m => {
                                  const maxItemsAtM = Math.max(
                                    ...subRowIntersByDay.map(list => list.filter(s => s.minute === m).length)
                                  );
                                  const dayIntersAtM = subRowIntersByDay[dayIdx].filter(s => s.minute === m);
                                  const items = dayIntersAtM.map(s => renderAnnouncementCard(s));
                                  const placeholdersNeeded = maxItemsAtM - dayIntersAtM.length;
                                  const placeholders = Array.from({ length: placeholdersNeeded }, (_, pIdx) =>
                                    renderAnnouncementPlaceholder(`placeholder-${m}-${dayIdx}-${pIdx}`)
                                  );
                                  return [...items, ...placeholders];
                                });
                              }
                            }
                          };

                          return (
                            <div
                              key={dayIdx}
                              style={
                                cellShow
                                  ? { backgroundColor: getShowShade(cellShow, getSortedShows(shows)).bg }
                                  : undefined
                              }
                              className={cn(
                                'p-1 border-r border-slate-205 last:border-r-0 h-auto overflow-visible justify-start relative transition-colors',
                                cellIsPast && !cellShow && 'bg-slate-105/70',
                                cellIsPast && cellShow && 'brightness-95 contrast-95 opacity-90',
                                calendarLayoutMode === 'compact'
                                  ? 'min-h-[26px] flex flex-row flex-wrap gap-[1px] items-start content-start'
                                  : 'min-h-[28px] flex flex-col gap-1'
                              )}
                            >
                              {renderSubRowContent()}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
