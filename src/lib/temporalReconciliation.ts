/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Announcement, AnnouncementRevision, LogEntry, Show, ShowRevision, TimeGatedMp3 } from '../types';

export interface AuditSlotReconciliation {
  slotId: string;
  timeLabel: string;
  dateStr: string;
  hour: number;
  minute: number;
  showId?: string;
  showName?: string;
  hostName?: string;
  announcementId?: string;
  announcementName?: string;
  announcementType?: string;
  status: 'PLAYED' | 'MISSED' | 'EXTRA' | 'READY_PRERECORD';
  badgeType: 'live' | 'prerecord' | 'missed' | 'extra' | 'future_ready';
  badgeLabel: string;
  logEntry?: LogEntry;
  executedAt?: string;
  scheduledFor?: string;
}

export interface DayAuditSummary {
  dateStr: string;
  totalPlanned: number;
  totalPlayed: number;
  totalMissed: number;
  totalExtra: number;
  slots: AuditSlotReconciliation[];
}

export interface GatedTrackAuditMetrics {
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  totalPlays: number;
  historyLogs: LogEntry[];
}

/**
 * Normalizes any Date or ISO string into a canonical YYYY-MM-DD string
 */
export function toCanonicalDateString(d: Date | string): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Resolves the state of announcements active on a historical or current date
 */
export function resolveAnnouncementsForDate(
  targetDate: Date | string,
  announcements: Announcement[]
): Announcement[] {
  const dateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(dateObj.getTime())) return announcements.filter(a => !a.isDeleted);

  // Set target to end of the day in UTC for inclusive comparison
  const targetIso = dateObj.toISOString();

  return announcements.map(ann => {
    const validFrom = ann.validFrom || '2026-08-01T00:00:00.000Z';
    const validTo = ann.validTo || null;

    // Check if current head was active on targetDate
    if (validFrom <= targetIso && (!validTo || validTo > targetIso)) {
      return ann.isDeleted ? null : ann;
    }

    // Otherwise check past revisions
    if (Array.isArray(ann.revisions)) {
      const matchedRev = ann.revisions.find(rev => 
        rev.validFrom <= targetIso && rev.validTo > targetIso
      );
      if (matchedRev) {
        return {
          ...ann,
          name: matchedRev.name,
          type: matchedRev.type,
          enabled: matchedRev.enabled,
          minute: matchedRev.minute,
          date: matchedRev.date,
          time: matchedRev.time,
          days: matchedRev.days,
          hours: matchedRev.hours,
          gridRules: matchedRev.gridRules,
          startDate: matchedRev.startDate,
          endDate: matchedRev.endDate,
          timeGatedMp3s: matchedRev.timeGatedMp3s || ann.timeGatedMp3s,
          isDeleted: false
        };
      }
    }

    return null;
  }).filter((a): a is Announcement => a !== null && a.enabled);
}

/**
 * Resolves the state of shows active on a historical or current date
 */
export function resolveShowsForDate(
  targetDate: Date | string,
  shows: Show[]
): Show[] {
  const dateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  if (isNaN(dateObj.getTime())) return shows.filter(s => !s.isDeleted && s.active);

  const targetIso = dateObj.toISOString();

  return shows.map(show => {
    const validFrom = show.validFrom || '2026-08-01T00:00:00.000Z';
    const validTo = show.validTo || null;

    if (validFrom <= targetIso && (!validTo || validTo > targetIso)) {
      return show.isDeleted ? null : show;
    }

    if (Array.isArray(show.revisions)) {
      const matchedRev = show.revisions.find(rev => 
        rev.validFrom <= targetIso && rev.validTo > targetIso
      );
      if (matchedRev) {
        return {
          ...show,
          name: matchedRev.name,
          nameShort: matchedRev.nameShort,
          host: matchedRev.host,
          description: matchedRev.description,
          day: matchedRev.day,
          startHour: matchedRev.startHour,
          startMinute: matchedRev.startMinute,
          durationHours: matchedRev.durationHours,
          durationMinutes: matchedRev.durationMinutes,
          active: matchedRev.active,
          isDeleted: false
        };
      }
    }

    return null;
  }).filter((s): a is Show => s !== null && s.active);
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Dynamic Planned vs. Actual Reconciliation Engine
 * Calculates on-the-fly audit metrics for any target date
 */
export function reconcileScheduleAndLogs(
  targetDate: Date | string,
  allAnnouncements: Announcement[],
  allShows: Show[],
  allLogs: LogEntry[]
): DayAuditSummary {
  const dateObj = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const targetDateStr = toCanonicalDateString(dateObj);
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday
  const dayName = dayNames[dayOfWeek];

  const now = new Date();
  const todayStr = toCanonicalDateString(now);
  const isPastOrToday = targetDateStr <= todayStr;

  // 1. Resolve active schedule for this date
  const activeAnnouncements = resolveAnnouncementsForDate(dateObj, allAnnouncements);
  const activeShows = resolveShowsForDate(dateObj, allShows);

  // Filter logs relevant to this target broadcast date
  const relevantLogs = allLogs.filter(log => {
    // Check scheduledFor target date or fallback to execution date
    if (log.scheduledFor) {
      return log.scheduledFor.startsWith(targetDateStr);
    }
    const logDate = log.timestamp ? log.timestamp.split('T')[0] : '';
    return logDate === targetDateStr;
  });

  const slots: AuditSlotReconciliation[] = [];
  const matchedLogIndices = new Set<number>();
  let plannedCount = 0;
  let playedCount = 0;
  let missedCount = 0;

  // 2. Iterate through 24 hours
  for (let hour = 0; hour < 24; hour++) {
    // Find active show for this hour
    const currentShow = activeShows.find(s => {
      if (s.day !== dayName) return false;
      const endHour = s.startHour + s.durationHours;
      return hour >= s.startHour && hour < endHour;
    });

    // Find announcements scheduled for this day and hour
    const scheduledAnns = activeAnnouncements.filter(ann => {
      if (ann.type === 'one-time') {
        if (ann.date !== targetDateStr) return false;
        if (ann.time) {
          const [h] = ann.time.split(':').map(Number);
          return h === hour;
        }
        return false;
      }

      if (ann.type === 'advanced') {
        if (Array.isArray(ann.gridRules) && ann.gridRules.length > 0) {
          const gridKey = `${dayOfWeek}-${hour}`;
          return ann.gridRules.includes(gridKey);
        }
        const hasDay = Array.isArray(ann.days) && ann.days.includes(dayOfWeek);
        const hasHour = Array.isArray(ann.hours) && ann.hours.includes(hour);
        return hasDay && hasHour;
      }

      // Basic hourly
      const hasDay = !ann.days || ann.days.includes(dayOfWeek);
      const hasHour = !ann.hours || ann.hours.includes(hour);
      return hasDay && hasHour;
    });

    // For each scheduled announcement in this hour
    for (const ann of scheduledAnns) {
      plannedCount++;
      const minute = typeof ann.minute === 'number' ? ann.minute : 0;
      const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const slotTimeIso = `${targetDateStr}T${timeLabel}:00`;

      // Find matching log entry deterministically
      let matchedIdx = -1;
      for (let i = 0; i < relevantLogs.length; i++) {
        if (matchedLogIndices.has(i)) continue;
        const log = relevantLogs[i];

        const idMatch = log.announcementId === ann.id || 
          (log.announcementName && log.announcementName.toLowerCase() === ann.name.toLowerCase());

        if (idMatch) {
          // Check if scheduledFor matches or timestamp minute matches
          if (log.scheduledFor && log.scheduledFor.startsWith(`${targetDateStr}T${String(hour).padStart(2, '0')}`)) {
            matchedIdx = i;
            break;
          } else if (log.timestamp && log.timestamp.startsWith(`${targetDateStr}T${String(hour).padStart(2, '0')}`)) {
            matchedIdx = i;
            break;
          }
        }
      }

      if (matchedIdx !== -1) {
        matchedLogIndices.add(matchedIdx);
        playedCount++;
        const log = relevantLogs[matchedIdx];
        const isAdvance = log.executedAt && log.scheduledFor && log.executedAt !== log.scheduledFor;
        const isPrerecord = log.playMode === 'Prerecord' || log.playMode === 'Export' || isAdvance;

        slots.push({
          slotId: `slot-${hour}-${minute}-${ann.id}`,
          timeLabel,
          dateStr: targetDateStr,
          hour,
          minute,
          showId: currentShow?.id,
          showName: currentShow?.name || 'Unassigned Show',
          hostName: currentShow?.host,
          announcementId: ann.id,
          announcementName: ann.name,
          announcementType: ann.type,
          status: 'PLAYED',
          badgeType: isPrerecord ? 'prerecord' : 'live',
          badgeLabel: isPrerecord ? 'Prerecorded' : 'Played',
          logEntry: log,
          executedAt: log.executedAt || log.timestamp,
          scheduledFor: log.scheduledFor || slotTimeIso
        });
      } else if (!isPastOrToday) {
        // Future date - check if prerecorded in advance
        const advanceLogIdx = allLogs.findIndex(log => 
          log.scheduledFor && 
          log.scheduledFor.startsWith(`${targetDateStr}T${String(hour).padStart(2, '0')}`) &&
          (log.announcementId === ann.id || log.announcementName === ann.name)
        );

        if (advanceLogIdx !== -1) {
          const advLog = allLogs[advanceLogIdx];
          slots.push({
            slotId: `slot-${hour}-${minute}-${ann.id}`,
            timeLabel,
            dateStr: targetDateStr,
            hour,
            minute,
            showId: currentShow?.id,
            showName: currentShow?.name || 'Unassigned Show',
            hostName: currentShow?.host,
            announcementId: ann.id,
            announcementName: ann.name,
            announcementType: ann.type,
            status: 'READY_PRERECORD',
            badgeType: 'future_ready',
            badgeLabel: 'Prerecorded Ready',
            logEntry: advLog,
            executedAt: advLog.executedAt || advLog.timestamp,
            scheduledFor: advLog.scheduledFor || slotTimeIso
          });
        }
      } else {
        // Past or current date with no log -> MISSED
        missedCount++;
        slots.push({
          slotId: `slot-${hour}-${minute}-${ann.id}`,
          timeLabel,
          dateStr: targetDateStr,
          hour,
          minute,
          showId: currentShow?.id,
          showName: currentShow?.name || 'Unassigned Show',
          hostName: currentShow?.host,
          announcementId: ann.id,
          announcementName: ann.name,
          announcementType: ann.type,
          status: 'MISSED',
          badgeType: 'missed',
          badgeLabel: 'Missed',
          scheduledFor: slotTimeIso
        });
      }
    }
  }

  // 3. Process Unscheduled / Ad-hoc / Orphaned logs
  let extraCount = 0;
  for (let i = 0; i < relevantLogs.length; i++) {
    if (matchedLogIndices.has(i)) continue;
    const extraLog = relevantLogs[i];
    extraCount++;

    const logTime = extraLog.timestamp || extraLog.executedAt || '';
    const timeMatch = logTime.match(/T(\d{2}):(\d{2})/);
    const h = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    const m = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    slots.push({
      slotId: `extra-${i}-${extraLog.timestamp}`,
      timeLabel,
      dateStr: targetDateStr,
      hour: h,
      minute: m,
      showName: extraLog.showName || 'Unassigned Show',
      hostName: extraLog.hostName,
      announcementId: extraLog.announcementId,
      announcementName: extraLog.announcementName || extraLog.mp3Name || 'Unscheduled Audio',
      status: 'EXTRA',
      badgeType: 'extra',
      badgeLabel: 'Unscheduled / Extra',
      logEntry: extraLog,
      executedAt: extraLog.executedAt || extraLog.timestamp
    });
  }

  // Sort slots chronologically
  slots.sort((a, b) => {
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.minute - b.minute;
  });

  return {
    dateStr: targetDateStr,
    totalPlanned: plannedCount,
    totalPlayed: playedCount,
    totalMissed: missedCount,
    totalExtra: extraCount,
    slots
  };
}

/**
 * Calculates lifetime audit metrics for a specific TimeGatedMp3 track
 */
export function calculateGatedTrackAudit(
  announcementId: string,
  trackId: string,
  mp3Url: string,
  allLogs: LogEntry[]
): GatedTrackAuditMetrics {
  const fileName = mp3Url ? mp3Url.split('/').pop()?.split('\\').pop() || '' : '';

  const matchedLogs = allLogs.filter(log => {
    const isIdMatch = log.announcementId === announcementId;
    const isFileMatch = fileName && log.mp3Name && log.mp3Name.toLowerCase() === fileName.toLowerCase();
    return isIdMatch && isFileMatch;
  });

  if (matchedLogs.length === 0) {
    return {
      firstUsedAt: null,
      lastUsedAt: null,
      totalPlays: 0,
      historyLogs: []
    };
  }

  // Sort chronologically
  matchedLogs.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  return {
    firstUsedAt: matchedLogs[0].timestamp || matchedLogs[0].executedAt || null,
    lastUsedAt: matchedLogs[matchedLogs.length - 1].timestamp || matchedLogs[matchedLogs.length - 1].executedAt || null,
    totalPlays: matchedLogs.length,
    historyLogs: matchedLogs
  };
}
