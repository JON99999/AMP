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

  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const activeDays = new Set<number>();
  const activeHours = new Set<number>();

  s.gridRules.forEach(rule => {
    const [d, h] = rule.split('-').map(Number);
    activeDays.add(d);
    activeHours.add(h);
  });

  const fullDays: string[] = [];
  days.forEach((day, i) => {
    let allHoursActive = true;
    for (let h = 0; h < 24; h++) {
      if (!s.gridRules?.includes(`${i}-${h}`)) {
        allHoursActive = false;
        break;
      }
    }
    if (allHoursActive) fullDays.push(day);
  });

  const fullHourNums: number[] = [];
  for (let h = 0; h < 24; h++) {
    let allDaysActive = true;
    for (let d = 0; d < 7; d++) {
      if (!s.gridRules?.includes(`${d}-${h}`)) {
        allDaysActive = false;
        break;
      }
    }
    if (allDaysActive) fullHourNums.push(h);
  }

  if (fullDays.length === 7 && fullHourNums.length === 24) return 'Always Active';
  if (fullDays.length > 0 && fullDays.length === activeDays.size && fullHourNums.length === 0) {
    return `Days: ${fullDays.join(', ')}`;
  }
  if (fullHourNums.length > 0 && fullHourNums.length === activeHours.size && fullDays.length === 0) {
    const fmtHourShort = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    if (fullHourNums.length >= 3) {
      const step = fullHourNums[1] - fullHourNums[0];
      let isUniformStep = step > 0;
      for (let i = 2; i < fullHourNums.length; i++) {
        if (fullHourNums[i] - fullHourNums[i - 1] !== step) {
          isUniformStep = false;
          break;
        }
      }
      if (isUniformStep) {
        if (step === 2) {
          const parity = fullHourNums[0] % 2 === 1 ? 'Odd' : 'Even';
          if (fullHourNums.length === 12) {
            return `Hours: ${parity} hours`;
          }
          if (fullHourNums.length >= 4) {
            return `Hours: ${parity} hours (${fmtHourShort(fullHourNums[0])}–${fmtHourShort(fullHourNums[fullHourNums.length - 1])})`;
          }
        } else if (step >= 3) {
          if (fullHourNums[0] < step && fullHourNums[fullHourNums.length - 1] + step >= 24) {
            return `Hours: Every ${step} hours starting at ${fmtHourShort(fullHourNums[0])}`;
          }
          return `Hours: Every ${step} hours (${fmtHourShort(fullHourNums[0])}–${fmtHourShort(fullHourNums[fullHourNums.length - 1])})`;
        } else if (step === 1 && fullHourNums.length >= 4) {
          return `Hours: ${fmtHourShort(fullHourNums[0])}–${fmtHourShort(fullHourNums[fullHourNums.length - 1])}`;
        }
      }
    }

    const amNums = fullHourNums.filter(h => h < 12).map(h => h % 12 || 12);
    const pmNums = fullHourNums.filter(h => h >= 12).map(h => h % 12 || 12);
    const formatMeridiemGroup = (nums: number[], meridiem: 'AM' | 'PM') => {
      if (nums.length === 0) return '';
      if (nums.length === 1) return `${nums[0]} ${meridiem}`;
      if (nums.length === 2) return `${nums[0]} and ${nums[1]} ${meridiem}`;
      return `${nums.slice(0, -1).join(', ')}, and ${nums[nums.length - 1]} ${meridiem}`;
    };
    const parts = [
      formatMeridiemGroup(amNums, 'AM'),
      formatMeridiemGroup(pmNums, 'PM'),
    ].filter(Boolean);
    return `Hours: ${parts.join(' and ')}`;
  }

  return 'Open for details';
}
