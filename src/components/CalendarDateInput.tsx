import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  cn,
  getCurrentDatetimeLocal,
  computeBackfilledEndTime,
  getNextGapAutoFillStart,
} from '../lib/utils';
import { isContiguousMidnightTransition } from '../lib/scheduleEngine';

export interface CalendarGateRangeSpan {
  id: string;
  label: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startIso?: string; // YYYY-MM-DDTHH:mm
  endIso?: string; // YYYY-MM-DDTHH:mm
  isCurrent?: boolean;
}

export interface CalendarDateInputProps {
  value: string; // YYYY-MM-DD or ''
  onChange: (newDate: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  role?: 'start' | 'end';
  pairedDate?: string; // YYYY-MM-DD of paired Start or End
  currentTime?: string; // HH:mm of the endpoint being edited
  pairedTime?: string; // HH:mm of the paired anchor endpoint
  gateRanges?: CalendarGateRangeSpan[];
  announcementStartDate?: string; // YYYY-MM-DD of parent Announcement Start
  announcementEndDate?: string; // YYYY-MM-DD of parent Announcement End
  splitPriorGateId?: string; // ID of open-ended prior gate being split by Transition / next Gate Start
  splitNextGate?: {
    id: string;
    label: string;
    endDate?: string; // YYYY-MM-DD
    endIso?: string; // YYYY-MM-DDTHH:mm
  }; // Next gate with open start being forward-filled when selecting prior Gate End
  onCalendarConfirm?: (newDate: string, prevDate: string) => void;
  inputDataKey?: string;
}

interface CalendarGridCell {
  year: number;
  month: number;
  day: number;
  ymd: string;
  isOutsideMonth: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseYmd(val: string): { year: number; month: number; day: number } | null {
  if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return null;
  const [y, m, d] = val.trim().split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d < 31 === false && d > 31) return null;
  return { year: y, month: m, day: d };
}

function formatYmdToDisplay(val: string): string {
  const parsed = parseYmd(val);
  if (!parsed) return val || '';
  const mm = String(parsed.month).padStart(2, '0');
  const dd = String(parsed.day).padStart(2, '0');
  return `${mm}/${dd}/${parsed.year}`;
}

function parseUserTextToYmd(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseYmd(trimmed) ? trimmed : null;
  }
  const mdyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdyMatch) {
    const m = Number(mdyMatch[1]);
    const d = Number(mdyMatch[2]);
    let y = Number(mdyMatch[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1970 && y <= 2100) {
      const dt = new Date(y, m - 1, d);
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function doTimeSlicesConflictOnDay(
  dayYmd: string,
  startIsoA: string,
  endIsoA: string,
  startIsoB: string,
  endIsoB: string
): boolean {
  const dayMin = `${dayYmd}T00:00`;
  const dayMax = `${dayYmd}T23:59`;
  const sA = startIsoA > dayMin ? startIsoA : dayMin;
  const eA = endIsoA < dayMax ? endIsoA : dayMax;
  const sB = startIsoB > dayMin ? startIsoB : dayMin;
  const eB = endIsoB < dayMax ? endIsoB : dayMax;
  if (sA > eA || sB > eB) return false;
  if (isContiguousMidnightTransition(eA, sB) || isContiguousMidnightTransition(eB, sA)) {
    return false;
  }
  return sA < eB && sB < eA;
}

export const CalendarDateInput: React.FC<CalendarDateInputProps> = ({
  value,
  onChange,
  disabled = false,
  className,
  title,
  role,
  pairedDate,
  currentTime,
  pairedTime,
  gateRanges,
  announcementStartDate,
  announcementEndDate,
  splitPriorGateId,
  splitNextGate,
  onCalendarConfirm,
  inputDataKey,
}) => {
  const [textValue, setTextValue] = useState(() => formatYmdToDisplay(value));
  const [isEditingText, setIsEditingText] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredYmd, setHoveredYmd] = useState<string | null>(null);
  const [pendingConfirmYmd, setPendingConfirmYmd] = useState<string | null>(null);

  // Store the initial value when popover opens so Cancel can restore it cleanly
  const initialOpenValueRef = useRef<string>(value);

  const rawPriorSplitGate = splitPriorGateId
    ? (gateRanges || []).find(g => g.id === splitPriorGateId)
    : undefined;
  const priorSplitStartYmd = (rawPriorSplitGate?.startDate || '').trim();
  const priorSplitStartIso =
    rawPriorSplitGate?.startIso && rawPriorSplitGate.startIso.trim()
      ? rawPriorSplitGate.startIso.trim()
      : priorSplitStartYmd
        ? `${priorSplitStartYmd}T00:00`
        : '';

  const getDefaultViewYmd = () => {
    const todayStr = getCurrentDatetimeLocal().split('T')[0];
    if (value && parseYmd(value)) return value;
    if (pairedDate && parseYmd(pairedDate)) return pairedDate;
    if (priorSplitStartYmd && parseYmd(priorSplitStartYmd)) {
      return priorSplitStartYmd > todayStr ? priorSplitStartYmd : todayStr;
    }
    return todayStr;
  };

  // Month/year navigation state inside the popover (changing months NEVER mutates `value`)
  const [viewYear, setViewYear] = useState<number>(() => {
    const parsed = parseYmd(getDefaultViewYmd());
    return parsed ? parsed.year : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parsed = parseYmd(getDefaultViewYmd());
    return parsed ? parsed.month : new Date().getMonth() + 1;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!isEditingText) {
      setTextValue(formatYmdToDisplay(value));
    }
  }, [value, isEditingText]);

  const openPopover = () => {
    if (disabled) return;
    initialOpenValueRef.current = value;
    setPendingConfirmYmd(null);
    setHoveredYmd(null);
    const parsed = parseYmd(getDefaultViewYmd());
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
    setIsOpen(true);
  };

  const updatePopoverPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popWidth = 244;
    const popHeight = 290;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + popWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popWidth - 8);
    }
    if (top + popHeight > window.innerHeight - 8 && rect.top > popHeight + 8) {
      top = rect.top - popHeight - 4;
    }
    setPopoverCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePopoverPosition();
    const handleScrollOrResize = () => updatePopoverPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setPendingConfirmYmd(null);
        setHoveredYmd(null);
        setIsOpen(false);
      }
    };
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (pendingConfirmYmd !== null) {
          setPendingConfirmYmd(null);
          return;
        }
        onChange(initialOpenValueRef.current);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleDocKeyDown);
    };
  }, [isOpen, onChange, pendingConfirmYmd]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Navigating months only updates viewMonth/viewYear, never overwriting the selected date
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Navigating months only updates viewMonth/viewYear, never overwriting the selected date
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectCell = (cell: CalendarGridCell) => {
    setPendingConfirmYmd(cell.ymd);
  };

  const handleToday = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const todayYmd = getCurrentDatetimeLocal().split('T')[0];
    const parsedToday = parseYmd(todayYmd);
    if (parsedToday) {
      setViewYear(parsedToday.year);
      setViewMonth(parsedToday.month);
    }
    setPendingConfirmYmd(todayYmd);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingConfirmYmd('');
  };

  const handleConfirmPendingDate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingConfirmYmd === null) return;
    const prevVal = initialOpenValueRef.current;
    const nextVal = pendingConfirmYmd;
    onChange(nextVal);
    if (onCalendarConfirm && nextVal !== prevVal) {
      onCalendarConfirm(nextVal, prevVal);
    }
    setTextValue(formatYmdToDisplay(nextVal));
    setPendingConfirmYmd(null);
    setHoveredYmd(null);
    setIsOpen(false);
  };

  const handleCancelPendingDate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingConfirmYmd(null);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingConfirmYmd(null);
    setHoveredYmd(null);
    if (value !== initialOpenValueRef.current) {
      onChange(initialOpenValueRef.current);
    }
    setTextValue(formatYmdToDisplay(initialOpenValueRef.current));
    setIsOpen(false);
  };

  const commitTextInput = () => {
    setIsEditingText(false);
    const parsed = parseUserTextToYmd(textValue);
    if (parsed !== null) {
      if (parsed !== value) {
        onChange(parsed);
      }
      setTextValue(formatYmdToDisplay(parsed));
    } else {
      setTextValue(formatYmdToDisplay(value));
    }
  };

  const activeCandidateYmd =
    pendingConfirmYmd !== null
      ? pendingConfirmYmd
      : hoveredYmd !== null
        ? hoveredYmd
        : value;
  const cleanPairedYmd =
    pairedDate && /^\d{4}-\d{2}-\d{2}$/.test(pairedDate.trim()) ? pairedDate.trim() : '';
  const cleanAnnStartYmd =
    announcementStartDate && /^\d{4}-\d{2}-\d{2}$/.test(announcementStartDate.trim())
      ? announcementStartDate.trim()
      : '';
  const cleanAnnEndYmd =
    announcementEndDate && /^\d{4}-\d{2}-\d{2}$/.test(announcementEndDate.trim())
      ? announcementEndDate.trim()
      : '';

  // Extend the active blob in BOTH directions from the anchor (and forward to eternity when open-ended)
  let activeSpanStart = '';
  let activeSpanEnd = '';
  if (activeCandidateYmd && cleanPairedYmd) {
    activeSpanStart = activeCandidateYmd <= cleanPairedYmd ? activeCandidateYmd : cleanPairedYmd;
    activeSpanEnd = activeCandidateYmd <= cleanPairedYmd ? cleanPairedYmd : activeCandidateYmd;
  } else if (activeCandidateYmd) {
    if (role === 'start') {
      activeSpanStart = activeCandidateYmd;
      activeSpanEnd = '9999-12-31';
    } else {
      activeSpanStart = activeCandidateYmd;
      activeSpanEnd = activeCandidateYmd;
    }
  } else if (role === 'end' && cleanPairedYmd) {
    // Open-ended gate while editing End: default blob extends from Start anchor forward to eternity
    activeSpanStart = cleanPairedYmd;
    activeSpanEnd = '9999-12-31';
  }

  const effectiveCurrentTime =
    currentTime && /^\d{2}:\d{2}$/.test(currentTime.trim())
      ? currentTime.trim()
      : role === 'end'
        ? '23:59'
        : '00:00';
  const effectivePairedTime =
    pairedTime && /^\d{2}:\d{2}$/.test(pairedTime.trim())
      ? pairedTime.trim()
      : role === 'end'
        ? '00:00'
        : '23:59';

  const rawStartYmd = role === 'start' ? activeCandidateYmd : cleanPairedYmd;
  const rawEndYmd = role === 'end' ? activeCandidateYmd : cleanPairedYmd;
  const rawStartTime = role === 'start' ? effectiveCurrentTime : effectivePairedTime;
  const rawEndTime = role === 'end' ? effectiveCurrentTime : effectivePairedTime;

  const candidateStartIso = rawStartYmd ? `${rawStartYmd}T${rawStartTime}` : '';
  const candidateEndIso = rawEndYmd
    ? `${rawEndYmd}T${rawEndTime}`
    : candidateStartIso
      ? '9999-12-31T23:59'
      : '';

  const isInvertedPairOverlap = Boolean(
    rawStartYmd && rawEndYmd && candidateStartIso > candidateEndIso
  );

  const activeSpanStartIso = isInvertedPairOverlap
    ? `${rawEndYmd}T00:00`
    : candidateStartIso || (activeSpanStart ? `${activeSpanStart}T00:00` : '');
  const activeSpanEndIso = isInvertedPairOverlap
    ? `${rawStartYmd}T23:59`
    : candidateEndIso || (activeSpanEnd ? `${activeSpanEnd}T23:59` : '');

  // When splitting an open-ended prior gate via Transition or next Gate Start, compute the dynamic split boundary
  const isValidForwardSplit = Boolean(
    splitPriorGateId &&
      priorSplitStartYmd &&
      activeCandidateYmd &&
      candidateStartIso &&
      candidateStartIso > priorSplitStartIso
  );
  const splitPriorBackfilledEndIso = isValidForwardSplit
    ? computeBackfilledEndTime(candidateStartIso)
    : '';
  const splitPriorBackfilledEndYmd = splitPriorBackfilledEndIso
    ? splitPriorBackfilledEndIso.split('T')[0]
    : '';

  const normalizedGateSpans = (gateRanges || [])
    .filter(g => g.startDate || g.endDate)
    .map(g => {
      const isTargetSplitPrior = Boolean(
        splitPriorGateId && g.id === splitPriorGateId && !(g.endDate || '').trim()
      );
      const rawS = (g.startDate || '').trim();
      const rawE =
        isTargetSplitPrior && isValidForwardSplit && splitPriorBackfilledEndYmd >= rawS
          ? splitPriorBackfilledEndYmd
          : (g.endDate || '').trim();
      const s = rawS || rawE;
      const e = rawE || (rawS ? '9999-12-31' : s);
      const startYmd = s <= e ? s : e;
      const endYmd = e >= s ? e : s;
      const startIso =
        g.startIso && g.startIso.trim()
          ? g.startIso.trim()
          : `${startYmd}T00:00`;
      const endIso =
        isTargetSplitPrior && isValidForwardSplit && splitPriorBackfilledEndIso
          ? splitPriorBackfilledEndIso
          : g.endIso && g.endIso.trim()
            ? g.endIso.trim()
            : `${endYmd}T23:59`;
      const isConjoinedSplitSpan = Boolean(
        isTargetSplitPrior && (!activeCandidateYmd || isValidForwardSplit)
      );
      return {
        ...g,
        start: startYmd,
        end: endYmd,
        resolvedStartIso: startIso <= endIso ? startIso : `${startYmd}T00:00`,
        resolvedEndIso: endIso >= startIso ? endIso : `${endYmd}T23:59`,
        isConjoinedSplitSpan,
      };
    });

  const baseOtherGateSpans = normalizedGateSpans.filter(g => !g.isCurrent);
  const otherGateSpans = [...baseOtherGateSpans];

  // Reciprocal case: editing an open-ended prior Gate's End when the next gate has an open Start (Transition state)
  if (
    splitNextGate &&
    role === 'end' &&
    activeCandidateYmd &&
    cleanPairedYmd &&
    !isInvertedPairOverlap &&
    candidateEndIso
  ) {
    const nextAutoStartIso = getNextGapAutoFillStart(candidateEndIso).startIso;
    const nextAutoStartYmd = nextAutoStartIso.split('T')[0];
    const nextRawEndYmd = (splitNextGate.endDate || '').trim();
    const nextEndYmd = nextRawEndYmd || '9999-12-31';
    const nextEndIso =
      splitNextGate.endIso && splitNextGate.endIso.trim()
        ? splitNextGate.endIso.trim()
        : nextRawEndYmd
          ? `${nextRawEndYmd}T23:59`
          : '9999-12-31T23:59';
    if (nextAutoStartYmd && nextAutoStartIso <= nextEndIso) {
      otherGateSpans.push({
        id: splitNextGate.id,
        label: splitNextGate.label,
        startDate: nextAutoStartYmd,
        endDate: nextRawEndYmd || undefined,
        startIso: nextAutoStartIso,
        endIso: nextEndIso,
        isCurrent: false,
        start: nextAutoStartYmd,
        end: nextEndYmd,
        resolvedStartIso: nextAutoStartIso,
        resolvedEndIso: nextEndIso,
        isConjoinedSplitSpan: true,
      });
    }
  }

  const currentGateSpan =
    normalizedGateSpans.find(g => g.isCurrent) || (gateRanges || []).find(g => g.isCurrent);
  const isParentAnnouncementPicker = Boolean(inputDataKey && inputDataKey.startsWith('ann-'));

  const todayYmd = getCurrentDatetimeLocal().split('T')[0];

  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate();
  const prevMonthYear = viewMonth === 1 ? viewYear - 1 : viewYear;
  const prevMonthNum = viewMonth === 1 ? 12 : viewMonth - 1;
  const nextMonthYear = viewMonth === 12 ? viewYear + 1 : viewYear;
  const nextMonthNum = viewMonth === 12 ? 1 : viewMonth + 1;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const cells: CalendarGridCell[] = [];

  // Leading days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({
      year: prevMonthYear,
      month: prevMonthNum,
      day: d,
      ymd: `${prevMonthYear}-${pad2(prevMonthNum)}-${pad2(d)}`,
      isOutsideMonth: true,
    });
  }

  // Days in current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      year: viewYear,
      month: viewMonth,
      day: d,
      ymd: `${viewYear}-${pad2(viewMonth)}-${pad2(d)}`,
      isOutsideMonth: false,
    });
  }

  // Trailing days from next month to complete the final 7-column row
  const trailingCount = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= trailingCount; d++) {
    cells.push({
      year: nextMonthYear,
      month: nextMonthNum,
      day: d,
      ymd: `${nextMonthYear}-${pad2(nextMonthNum)}-${pad2(d)}`,
      isOutsideMonth: true,
    });
  }

  return (
    <div
      ref={containerRef}
      title={title}
      className={cn('relative inline-flex items-center', className)}
    >
      <input
        type="text"
        data-date-input-key={inputDataKey}
        disabled={disabled}
        placeholder="mm/dd/yyyy"
        value={textValue}
        onFocus={() => setIsEditingText(true)}
        onChange={e => setTextValue(e.target.value)}
        onBlur={commitTextInput}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTextInput();
            setIsOpen(false);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditingText(false);
            setTextValue(formatYmdToDisplay(value));
            setIsOpen(false);
          }
        }}
        className={cn(
          'w-full bg-transparent outline-none border-0 p-0 text-xs font-bold font-sans tabular-nums pr-4',
          disabled ? 'cursor-not-allowed' : 'text-inherit'
        )}
      />
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            if (isOpen) {
              setIsOpen(false);
            } else {
              openPopover();
            }
          }}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-700 hover:text-blue-600 cursor-pointer"
          title="Open calendar picker"
        >
          <CalendarIcon className="w-3 h-3" />
        </button>
      )}

      {isOpen &&
        !disabled &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: popoverCoords.top, left: popoverCoords.left }}
            className="fixed z-[300] w-[244px] bg-white border border-slate-300 rounded-lg shadow-xl p-2.5 select-none text-slate-800"
            onClick={e => e.stopPropagation()}
          >
            {/* Month / Year Navigation Header (Does NOT overwrite date) */}
            <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-200">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-xs font-black uppercase tracking-wider text-slate-800">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-x-0 pt-1.5 pb-1 text-center">
              {DAY_HEADERS.map(dh => (
                <div key={dh} className="text-[10px] font-black uppercase text-slate-400">
                  {dh}
                </div>
              ))}
            </div>

            {/* Calendar Day Grid: gap-x-0 joins adjacent dates in a blob */}
            <div
              className="relative"
              onMouseLeave={() => setHoveredYmd(null)}
            >
              <div className="grid grid-cols-7 gap-x-0 gap-y-1 text-center">
                {cells.map(cell => {
                  const cellYmd = cell.ymd;
                  const isEditedEndpoint = Boolean(
                    activeCandidateYmd && cellYmd === activeCandidateYmd
                  );
                  const isToday = cellYmd === todayYmd;
                  const isPairedAnchor = Boolean(cleanPairedYmd && cellYmd === cleanPairedYmd);
                  const isInActiveSpan = Boolean(
                    activeSpanStart &&
                      activeSpanEnd &&
                      cellYmd >= activeSpanStart &&
                      cellYmd <= activeSpanEnd
                  );
                  const matchingOtherGates = otherGateSpans.filter(
                    g => cellYmd >= g.start && cellYmd <= g.end
                  );

                  // Timestamp-aware conflict check on this day
                  const hasActiveVsOtherConflict =
                    !isParentAnnouncementPicker &&
                    isInActiveSpan &&
                    Boolean(activeSpanStartIso && activeSpanEndIso) &&
                    matchingOtherGates.some(g =>
                      doTimeSlicesConflictOnDay(
                        cellYmd,
                        activeSpanStartIso,
                        activeSpanEndIso,
                        g.resolvedStartIso,
                        g.resolvedEndIso
                      )
                    );

                  let hasOtherVsOtherConflict = false;
                  if (matchingOtherGates.length > 1) {
                    for (let i = 0; i < matchingOtherGates.length; i++) {
                      for (let j = i + 1; j < matchingOtherGates.length; j++) {
                        if (
                          doTimeSlicesConflictOnDay(
                            cellYmd,
                            matchingOtherGates[i].resolvedStartIso,
                            matchingOtherGates[i].resolvedEndIso,
                            matchingOtherGates[j].resolvedStartIso,
                            matchingOtherGates[j].resolvedEndIso
                          )
                        ) {
                          hasOtherVsOtherConflict = true;
                          break;
                        }
                      }
                      if (hasOtherVsOtherConflict) break;
                    }
                  }

                  const isOverlapCell = Boolean(
                    hasActiveVsOtherConflict ||
                      hasOtherVsOtherConflict ||
                      (isInvertedPairOverlap && isInActiveSpan)
                  );

                  const isOutsideAnnouncementBounds = Boolean(
                    (cleanAnnStartYmd && cellYmd < cleanAnnStartYmd) ||
                      (cleanAnnEndYmd && cellYmd > cleanAnnEndYmd)
                  );
                  const isAnnouncementStartBoundary = Boolean(
                    cleanAnnStartYmd && cellYmd === cleanAnnStartYmd
                  );
                  const isAnnouncementEndBoundary = Boolean(
                    cleanAnnEndYmd && cellYmd === cleanAnnEndYmd
                  );

                  const cellTooltipParts: string[] = [];
                  if (isAnnouncementStartBoundary) {
                    cellTooltipParts.push(
                      `Announcement Start (${formatYmdToDisplay(cleanAnnStartYmd)})`
                    );
                  }
                  if (isAnnouncementEndBoundary) {
                    cellTooltipParts.push(
                      `Announcement End (${formatYmdToDisplay(cleanAnnEndYmd)})`
                    );
                  }
                  if (isOutsideAnnouncementBounds) {
                    cellTooltipParts.push('Outside Announcement Start/End Window');
                  }
                  if (isOverlapCell) {
                    cellTooltipParts.push('Schedule Overlap');
                  }
                  if (isPairedAnchor) {
                    cellTooltipParts.push(role === 'start' ? 'Paired End Date' : 'Paired Start Date');
                  }
                  if (matchingOtherGates.length > 0) {
                    for (const g of matchingOtherGates) {
                      cellTooltipParts.push(g.label);
                    }
                  }
                  if (isInActiveSpan) {
                    if (currentGateSpan?.label) {
                      if (!cellTooltipParts.includes(currentGateSpan.label)) {
                        cellTooltipParts.push(currentGateSpan.label);
                      }
                    } else if (activeSpanStart !== activeSpanEnd) {
                      cellTooltipParts.push(
                        activeSpanEnd === '9999-12-31'
                          ? `${formatYmdToDisplay(activeSpanStart)} – Open-ended`
                          : `${formatYmdToDisplay(activeSpanStart)} – ${formatYmdToDisplay(activeSpanEnd)}`
                      );
                    }
                  }

                  const hasAnyBlob = matchingOtherGates.length > 0 || isInActiveSpan;
                  const hasConjoinedSplitSpan = matchingOtherGates.some(
                    g => g.isConjoinedSplitSpan
                  );
                  const isConjoinedSplitAnchor = matchingOtherGates.some(
                    g =>
                      g.isConjoinedSplitSpan &&
                      (cellYmd === g.start ||
                        (g.end !== '9999-12-31' && cellYmd === g.end))
                  );
                  const isBoldEndpointOrAnchor =
                    isPairedAnchor || isEditedEndpoint || isConjoinedSplitAnchor;

                  return (
                    <button
                      key={cellYmd}
                      type="button"
                      onMouseEnter={() => setHoveredYmd(cellYmd)}
                      onClick={() => handleSelectCell(cell)}
                      title={cellTooltipParts.length > 0 ? cellTooltipParts.join(' • ') : undefined}
                      className={cn(
                        'h-6 text-xs tabular-nums flex items-center justify-center cursor-pointer transition-colors relative overflow-visible',
                        !hasAnyBlob && 'rounded',
                        isOutsideAnnouncementBounds && !hasAnyBlob
                          ? 'bg-slate-100/80 text-slate-400 font-normal opacity-55 hover:bg-slate-200/70'
                          : cell.isOutsideMonth && !hasAnyBlob
                            ? 'text-slate-400 font-normal hover:bg-slate-100'
                            : !hasAnyBlob && isToday
                              ? 'bg-blue-50 text-blue-700 border border-blue-300 font-black hover:bg-blue-100'
                              : !hasAnyBlob && !isToday
                                ? 'text-slate-700 font-normal hover:bg-slate-100'
                                : ''
                      )}
                    >
                      {/* Vertical Spacer Indicator on Left Edge for Announcement Start Date */}
                      {isAnnouncementStartBoundary && (
                        <span
                          className="absolute -left-[2px] -top-0.5 -bottom-0.5 w-[3px] bg-blue-700 rounded-full pointer-events-none z-[6] shadow-2xs"
                          title={`Announcement Start (${formatYmdToDisplay(cleanAnnStartYmd)})`}
                        />
                      )}

                      {/* Vertical Spacer Indicator on Right Edge for Announcement End Date */}
                      {isAnnouncementEndBoundary && (
                        <span
                          className="absolute -right-[2px] -top-0.5 -bottom-0.5 w-[3px] bg-blue-700 rounded-full pointer-events-none z-[6] shadow-2xs"
                          title={`Announcement End (${formatYmdToDisplay(cleanAnnEndYmd)})`}
                        />
                      )}

                      {/* Other Gate Blob Layers: joined horizontally; row-break outer borders stay open (border-l/r only at true span start/end) */}
                      {matchingOtherGates.map((g, gIdx) => {
                        const isGStart = cellYmd === g.start;
                        const isGEnd = cellYmd === g.end;
                        return (
                          <span
                            key={`${g.id}-${gIdx}`}
                            className={cn(
                              'absolute inset-0 pointer-events-none border-t-2 border-b-2',
                              isOverlapCell && !isInActiveSpan
                                ? 'bg-red-100/90 border-red-500'
                                : g.isConjoinedSplitSpan
                                  ? 'bg-sky-100/90 border-sky-400'
                                  : 'bg-slate-200/80 border-slate-400',
                              (isOutsideAnnouncementBounds || cell.isOutsideMonth) &&
                                (g.isConjoinedSplitSpan ? 'opacity-65' : 'opacity-55'),
                              isGStart && 'border-l-2 rounded-l-md',
                              isGEnd && 'border-r-2 rounded-r-md'
                            )}
                          />
                        );
                      })}

                      {/* Light-Blue Active / Preview Blob Layer (turns Red on overlap days) */}
                      {isInActiveSpan && (
                        <span
                          className={cn(
                            'absolute inset-0 pointer-events-none border-t-2 border-b-2 z-[1]',
                            isOverlapCell
                              ? 'bg-red-100/95 border-red-500'
                              : 'bg-sky-100/90 border-sky-400',
                            (isOutsideAnnouncementBounds || cell.isOutsideMonth) && 'opacity-65',
                            cellYmd === activeSpanStart && 'border-l-2 rounded-l-md',
                            cellYmd === activeSpanEnd && 'border-r-2 rounded-r-md'
                          )}
                        />
                      )}

                      {/* Today ring when inside a blob */}
                      {hasAnyBlob && isToday && (
                        <span className="absolute inset-0.5 rounded ring-1 ring-blue-500 pointer-events-none z-[2]" />
                      )}

                      <span
                        className={cn(
                          'relative z-[4]',
                          isOverlapCell
                            ? isBoldEndpointOrAnchor
                              ? 'text-red-950 font-black'
                              : 'text-red-800 font-normal'
                            : isBoldEndpointOrAnchor
                              ? 'text-slate-950 font-black'
                              : isOutsideAnnouncementBounds || cell.isOutsideMonth
                                ? 'text-slate-400 font-normal'
                                : isInActiveSpan || hasConjoinedSplitSpan
                                  ? 'text-sky-900 font-normal'
                                  : matchingOtherGates.length > 0
                                    ? 'text-slate-700 font-normal'
                                    : ''
                        )}
                      >
                        {cell.day}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer Area: Shows START:/END: Date + OK/Cancel when a selection is pending; Cancel undoes selection and reveals Clear, Today, Cancel */}
            <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between gap-1 min-h-[28px]">
              {pendingConfirmYmd !== null ? (
                <>
                  <span className="text-[11px] font-black text-sky-900 truncate">
                    {role === 'start' ? 'START: ' : role === 'end' ? 'END: ' : ''}
                    {pendingConfirmYmd
                      ? formatYmdToDisplay(pendingConfirmYmd)
                      : 'Clear date?'}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleConfirmPendingDate}
                      className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-wider cursor-pointer shadow-2xs transition-colors"
                      title="Confirm selected date"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelPendingDate}
                      className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                      title="Undo selection and return to calendar controls"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 cursor-pointer transition-colors"
                    title="Clear date"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors"
                    title="Select today"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-colors"
                    title="Cancel and keep current date"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
