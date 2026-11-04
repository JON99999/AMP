import { Announcement, AnnouncementType, Show } from '../types';
import { formatTime12, formatHour12, formatToDatetimeLocal } from './utils';

export interface AnnouncementConflict {
  announcement1: Announcement;
  announcement2: Announcement;
  message: string;
}

export interface ShowConflict {
  show1: Show;
  show2: Show;
  message: string;
}

const daysOrderList = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function getAnnouncementActiveWindowMs(s: Announcement, nowMs: number): { startMs: number; endMs: number } | null {
  if (s.enabled === false || s.isDeleted) return null;

  if (s.type === AnnouncementType.ONE_TIME) {
    if (!s.date) return null;
    const h = (s.time || '00').split(':')[0].padStart(2, '0');
    const m = (s.minute || 0).toString().padStart(2, '0');
    const slotMs = new Date(`${s.date}T${h}:${m}:00`).getTime();
    if (isNaN(slotMs) || slotMs < nowMs) return null;
    return { startMs: slotMs, endMs: slotMs };
  }

  let startMs = -Infinity;
  let endMs = Infinity;

  if (s.startDate) {
    const parsedStart = new Date(formatToDatetimeLocal(s.startDate)).getTime();
    if (!isNaN(parsedStart)) startMs = parsedStart;
  }
  if (s.endDate) {
    const parsedEnd = new Date(formatToDatetimeLocal(s.endDate)).getTime();
    if (!isNaN(parsedEnd)) endMs = parsedEnd;
  }

  if (Array.isArray(s.timeGatedMp3s) && s.timeGatedMp3s.length > 0) {
    let minGatedStart = Infinity;
    let maxGatedEnd = -Infinity;
    let hasOpenEnd = false;

    for (const m of s.timeGatedMp3s) {
      const mStart = m.startDate ? new Date(formatToDatetimeLocal(m.startDate)).getTime() : -Infinity;
      const mEnd = m.endDate ? new Date(formatToDatetimeLocal(m.endDate)).getTime() : Infinity;
      if (!isNaN(mStart) && mStart < minGatedStart) minGatedStart = mStart;
      if (mEnd === Infinity) {
        hasOpenEnd = true;
      } else if (!isNaN(mEnd) && mEnd > maxGatedEnd) {
        maxGatedEnd = mEnd;
      }
    }

    if (minGatedStart !== Infinity && minGatedStart > startMs) {
      startMs = minGatedStart;
    }
    const effectiveGatedEnd = hasOpenEnd ? Infinity : maxGatedEnd;
    if (effectiveGatedEnd !== -Infinity && effectiveGatedEnd < endMs) {
      endMs = effectiveGatedEnd;
    }
  }

  if (endMs < nowMs || startMs > endMs) return null;
  return { startMs, endMs };
}

export function formatGridRulesSummary(gridRules: string[]): string {
  if (!gridRules || gridRules.length === 0) return '';
  if (gridRules.length === 168) return 'Every hour of every day';
  
  const formatted = gridRules.map(rule => {
    const parts = rule.split('-');
    if (parts.length < 2) return rule;
    const d = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    const dayName = daysOrderList[d] || `Day ${d}`;
    return `${dayName} ${formatHour12(h)}`;
  });

  if (formatted.length <= 3) {
    return formatted.join(', ');
  }
  return `${formatted.slice(0, 3).join(', ')} (+${formatted.length - 3} more timeslots)`;
}

export function getAnnouncementConflicts(announcementsList: Announcement[]): AnnouncementConflict[] {
  const nowMs = Date.now();
  const activeWithWindows = announcementsList
    .map(s => ({ item: s, window: getAnnouncementActiveWindowMs(s, nowMs) }))
    .filter((entry): entry is { item: Announcement; window: { startMs: number; endMs: number } } => entry.window !== null);

  const conflicts: AnnouncementConflict[] = [];

  for (let i = 0; i < activeWithWindows.length; i++) {
    for (let j = i + 1; j < activeWithWindows.length; j++) {
      const a = activeWithWindows[i].item;
      const b = activeWithWindows[j].item;
      const winA = activeWithWindows[i].window;
      const winB = activeWithWindows[j].window;

      if (winA.startMs > winB.endMs || winB.startMs > winA.endMs) continue;

      const minA = a.minute || 0;
      const minB = b.minute || 0;
      if (minA !== minB) continue;

      const mStr = minA.toString().padStart(2, '0');

      if (a.type === AnnouncementType.BASIC_HOURLY && b.type === AnnouncementType.BASIC_HOURLY) {
        conflicts.push({
          announcement1: a,
          announcement2: b,
          message: `"${a.name}" and "${b.name}" both start at :${mStr} every hour`
        });
        continue;
      }

      if (
        (a.type === AnnouncementType.BASIC_HOURLY && b.type === AnnouncementType.ADVANCED) ||
        (b.type === AnnouncementType.BASIC_HOURLY && a.type === AnnouncementType.ADVANCED)
      ) {
        const adv = a.type === AnnouncementType.ADVANCED ? a : b;
        const hly = a.type === AnnouncementType.BASIC_HOURLY ? a : b;
        const rules = adv.gridRules || [];
        if (rules.length > 0) {
          conflicts.push({
            announcement1: a,
            announcement2: b,
            message: `"${hly.name}" and "${adv.name}" both start at :${mStr} (${formatGridRulesSummary(rules)})`
          });
        }
        continue;
      }

      if (a.type === AnnouncementType.ADVANCED && b.type === AnnouncementType.ADVANCED) {
        const rulesA = new Set(a.gridRules || []);
        const commonRules = (b.gridRules || []).filter(r => rulesA.has(r));
        if (commonRules.length > 0) {
          conflicts.push({
            announcement1: a,
            announcement2: b,
            message: `"${a.name}" and "${b.name}" both start at :${mStr} (${formatGridRulesSummary(commonRules)})`
          });
        }
        continue;
      }

      if (a.type === AnnouncementType.ONE_TIME && b.type === AnnouncementType.ONE_TIME) {
        if (a.date && b.date && a.date === b.date) {
          const hA = parseInt(a.time || '0', 10);
          const hB = parseInt(b.time || '0', 10);
          if (hA === hB) {
            conflicts.push({
              announcement1: a,
              announcement2: b,
              message: `"${a.name}" and "${b.name}" both start on ${a.date} at ${formatTime12(`${hA.toString().padStart(2, '0')}:${mStr}`)}`
            });
          }
        }
        continue;
      }

      const ot = a.type === AnnouncementType.ONE_TIME ? a : b.type === AnnouncementType.ONE_TIME ? b : null;
      const rec = ot === a ? b : ot === b ? a : null;

      if (ot && rec && ot.date && ot.time) {
        const otHour = parseInt(ot.time, 10);
        const otDayIdx = new Date(`${ot.date}T00:00:00`).getDay();
        const otRule = `${otDayIdx}-${otHour}`;

        if (rec.type === AnnouncementType.BASIC_HOURLY) {
          conflicts.push({
            announcement1: a,
            announcement2: b,
            message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${formatTime12(`${otHour.toString().padStart(2, '0')}:${mStr}`)}`
          });
        } else if (rec.type === AnnouncementType.ADVANCED) {
          if ((rec.gridRules || []).includes(otRule)) {
            conflicts.push({
              announcement1: a,
              announcement2: b,
              message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${formatTime12(`${otHour.toString().padStart(2, '0')}:${mStr}`)}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function getShowConflicts(showsList: Show[]): ShowConflict[] {
  const active = showsList.filter(s => s.active !== false && !s.isDeleted);
  const conflicts: ShowConflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const dayIdxA = daysOrderList.indexOf(a.day as any);
      const dayIdxB = daysOrderList.indexOf(b.day as any);
      if (dayIdxA === -1 || dayIdxB === -1) continue;

      const startA = dayIdxA * 1440 + a.startHour * 60 + (a.startMinute || 0);
      const durA = (a.durationHours || 0) * 60 + (a.durationMinutes || 0);
      const startB = dayIdxB * 1440 + b.startHour * 60 + (b.startMinute || 0);
      const durB = (b.durationHours || 0) * 60 + (b.durationMinutes || 0);

      if (durA <= 0 || durB <= 0) continue;

      const endA = startA + durA;
      const intervalsA = endA <= 10080 
        ? [{ s: startA, e: endA }] 
        : [{ s: startA, e: 10080 }, { s: 0, e: endA - 10080 }];

      const endB = startB + durB;
      const intervalsB = endB <= 10080 
        ? [{ s: startB, e: endB }] 
        : [{ s: startB, e: 10080 }, { s: 0, e: endB - 10080 }];

      for (const iA of intervalsA) {
        for (const iB of intervalsB) {
          const ovStart = Math.max(iA.s, iB.s);
          const ovEnd = Math.min(iA.e, iB.e);

          if (ovStart < ovEnd) {
            const dIdx = Math.floor(ovStart / 1440);
            const sH = Math.floor((ovStart % 1440) / 60).toString().padStart(2, '0');
            const sM = ((ovStart % 1440) % 60).toString().padStart(2, '0');
            const eH = Math.floor((ovEnd % 1440) / 60).toString().padStart(2, '0');
            const eM = ((ovEnd % 1440) % 60).toString().padStart(2, '0');
            const dayName = daysOrderList[dIdx] || `Day ${dIdx}`;

            conflicts.push({
              show1: a,
              show2: b,
              message: `"${a.name}" and "${b.name}" overlap on ${dayName} from ${formatTime12(`${sH}:${sM}`)} to ${formatTime12(`${eH}:${eM}`)}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}
