import { Announcement, AnnouncementType } from '../../types';
import { formatTime12 } from '../../lib/utils';
import {
  SchedulePresetOption,
  AnnouncementPlacementModalState,
  computeSchedulePlacementOptions,
  cleanNameShort,
  addSoftHyphensForFirstLine,
} from '../../lib/schedulePlacement';
import {
  AnnouncementConflict,
  ShowConflict,
  getAnnouncementConflicts,
  getShowConflicts,
  formatGridRulesSummary,
} from '../../lib/scheduleConflicts';
import {
  AnnouncementGap,
  ShowGap,
  getAnnouncementGaps,
  getShowGaps,
} from '../../lib/scheduleGaps';

export type {
  SchedulePresetOption,
  AnnouncementPlacementModalState,
  AnnouncementConflict,
  ShowConflict,
  AnnouncementGap,
  ShowGap,
};

export {
  computeSchedulePlacementOptions,
  cleanNameShort,
  addSoftHyphensForFirstLine,
  getAnnouncementConflicts,
  getShowConflicts,
  formatGridRulesSummary,
  getAnnouncementGaps,
  getShowGaps,
};

export interface PreviewScriptOriginState {
  announcementId?: string | null;
  gateId?: string | null;
  gateIndex?: number;
  itemIndex?: number;
  fromPicker?: boolean;
}

export interface CopyEditorModalOpenState {
  isOpen: boolean;
  initialFileName?: string;
  sourceFileToCopy?: string;
  initialReadTime?: string;
  initialIsAutoReadTime?: boolean;
  initialBackupMp3Url?: string;
  targetGateId?: string | null;
  targetGateIndex?: number;
  targetItemIndex?: number;
  targetAnnouncementId?: string | null;
  fromPicker?: boolean;
}

export function formatMetadataDate(dString: string | Date | undefined): string {
  if (!dString) return 'N/A';
  try {
    const d = new Date(dString);
    if (isNaN(d.getTime())) return 'N/A';
    const year = d.getFullYear();
    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const mss = monthShorts[d.getMonth()] || 'JUN';
    const day = String(d.getDate()).padStart(2, '0');
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${mss}-${day} ${hours}:${mm} ${ampm}`;
  } catch {
    return 'N/A';
  }
}

export function getAnnouncementSummary(s: Announcement): string {
  if (s.type === AnnouncementType.ONE_TIME) {
    const minStr = (s.minute !== undefined ? s.minute : 0).toString().padStart(2, '0');
    const timeStr = (s.time !== undefined && s.time !== '')
      ? formatTime12(`${s.time}:${minStr}`)
      : `??:${minStr}`;
    return `${s.date || 'No Date'} @ ${timeStr}`;
  }
  if (s.type === AnnouncementType.BASIC_HOURLY) {
    return 'Every Hour';
  }

  if (!s.gridRules || s.gridRules.length === 0) {
    return 'No windows selected';
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const activeDaysSet = new Set<number>();
  const hoursByDay = new Map<number, number[]>();

  s.gridRules.forEach(rule => {
    const [d, h] = rule.split('-').map(Number);
    if (isNaN(d) || isNaN(h)) return;
    activeDaysSet.add(d);
    const list = hoursByDay.get(d) || [];
    if (!list.includes(h)) list.push(h);
    hoursByDay.set(d, list);
  });

  const sortedActiveDays = Array.from(activeDaysSet).sort((a, b) => a - b);
  sortedActiveDays.forEach(d => {
    const list = hoursByDay.get(d);
    if (list) list.sort((a, b) => a - b);
  });

  if (sortedActiveDays.length === 0) {
    return 'No windows selected';
  }

  const firstDayHours = hoursByDay.get(sortedActiveDays[0]) || [];
  const firstDayHoursKey = firstDayHours.join(',');
  const isUniformAcrossActiveDays = sortedActiveDays.every(
    d => (hoursByDay.get(d) || []).join(',') === firstDayHoursKey
  );

  const fmtHourShort = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

  const formatDayGroup = (dayNums: number[]): string => {
    if (dayNums.length === 7) return 'Daily';
    if (dayNums.join(',') === '1,2,3,4,5') return 'Mon–Fri';
    if (dayNums.join(',') === '0,6') return 'Sat–Sun';
    let isContiguous = dayNums.length >= 3;
    for (let i = 1; i < dayNums.length; i++) {
      if (dayNums[i] !== dayNums[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }
    if (isContiguous) {
      return `${days[dayNums[0]]}–${days[dayNums[dayNums.length - 1]]}`;
    }
    return dayNums.map(d => days[d]).join(', ');
  };

  const formatHoursGroup = (hourNums: number[]): string => {
    if (hourNums.length === 24) return '24 Hours';
    if (hourNums.length === 1) return fmtHourShort(hourNums[0]);
    if (hourNums.length >= 2) {
      const step = hourNums[1] - hourNums[0];
      let isUniformStep = step > 0;
      for (let i = 2; i < hourNums.length; i++) {
        if (hourNums[i] - hourNums[i - 1] !== step) {
          isUniformStep = false;
          break;
        }
      }
      if (isUniformStep) {
        if (step === 1) {
          return `${fmtHourShort(hourNums[0])}–${fmtHourShort(hourNums[hourNums.length - 1])}`;
        }
        if (step === 2) {
          const parity = hourNums[0] % 2 === 1 ? 'Odd' : 'Even';
          if (hourNums.length === 12) return `${parity} hours`;
          return `${parity} hours (${fmtHourShort(hourNums[0])}–${fmtHourShort(hourNums[hourNums.length - 1])})`;
        }
        if (step >= 3) {
          if (hourNums[0] < step && hourNums[hourNums.length - 1] + step >= 24) {
            return `Every ${step}h from ${fmtHourShort(hourNums[0])}`;
          }
          return `Every ${step}h (${fmtHourShort(hourNums[0])}–${fmtHourShort(hourNums[hourNums.length - 1])})`;
        }
      }
    }
    if (hourNums.length <= 4) {
      return hourNums.map(fmtHourShort).join(', ');
    }
    return `${hourNums.length} hrs/day`;
  };

  if (isUniformAcrossActiveDays) {
    if (sortedActiveDays.length === 7 && firstDayHours.length === 24) {
      return 'Always Active';
    }
    const dayLabel = formatDayGroup(sortedActiveDays);
    const hourLabel = formatHoursGroup(firstDayHours);
    if (sortedActiveDays.length === 7) {
      return `Daily · ${hourLabel}`;
    }
    if (firstDayHours.length === 24) {
      return `${dayLabel} · 24 Hours`;
    }
    return `${dayLabel} · ${hourLabel}`;
  }

  return `${s.gridRules.length} weekly slot${s.gridRules.length === 1 ? '' : 's'}`;
}
