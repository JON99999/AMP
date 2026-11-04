/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Announcement, AnnouncementRevision, LogEntry, Show, ShowRevision, TimeGatedMp3 } from '../types';
import {
  getStationTimezone,
  getStationNow,
  toStationDateParts,
  stationLocalToUtcIso,
  backfillLegacyAnnouncementRevisions,
  isLogPrerecordOrExport
} from './compatibility';
import { formatTime12 } from './utils';

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
  status: 'PLAYED' | 'MISSED' | 'EXTRA';
  badgeType: 'live' | 'prerecord' | 'export' | 'missed' | 'extra';
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
 * Parses a Date or date string safely in local station time when given YYYY-MM-DD
 */
function parseLocalTargetDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day, 12, 0, 0, 0);
  }
  return new Date(d);
}

/**
 * Normalizes any Date or ISO string into a canonical YYYY-MM-DD string in station time
 */
export function toCanonicalDateString(d: Date | string): string {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (typeof d === 'string' && (d.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(d))) {
    const parts = toStationDateParts(d, getStationTimezone());
    if (parts) return parts.dateStr;
  }
  const dateObj = parseLocalTargetDate(d);
  if (isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeToLocalDateTimePrefix(dateStr?: string, isEnd = false): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T${isEnd ? '23:59' : '00:00'}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) && !trimmed.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.substring(0, 16);
  }
  const parts = toStationDateParts(trimmed, getStationTimezone());
  if (parts) {
    return `${parts.dateStr}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Resolves whether a log entry's scheduled timestamp (announcementTime || scheduledFor || timestamp)
 * falls on targetDateStr (and optionally hour) in the station's configured timezone.
 * Never falls back to execution time or raw UTC prefix matching on 'Z' strings.
 */
export function doesLogMatchLocalSlot(
  log: LogEntry,
  targetDateStr: string,
  targetHour?: number
): boolean {
  if (log.status && log.status !== 'played' && log.status !== 'backup play') return false;
  const tz = getStationTimezone();
  const scheduledRef = log.announcementTime || log.scheduledFor || log.timestamp;
  if (!scheduledRef || typeof scheduledRef !== 'string') return false;
  const trimmed = scheduledRef.trim();
  if (!trimmed) return false;

  const isUtcOrOffset = trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed);
  if (isUtcOrOffset) {
    const parts = toStationDateParts(trimmed, tz);
    if (parts && parts.dateStr === targetDateStr) {
      if (targetHour === undefined || parts.hour === targetHour) {
        return true;
      }
    }
    return false;
  }

  if (targetHour !== undefined) {
    const prefix = `${targetDateStr}T${String(targetHour).padStart(2, '0')}`;
    if (trimmed.startsWith(prefix)) return true;
  } else if (trimmed.startsWith(targetDateStr)) {
    return true;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const localDateStr = toCanonicalDateString(parsed);
    if (localDateStr === targetDateStr) {
      if (targetHour === undefined || parsed.getHours() === targetHour) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves the state of announcements active on a historical or current date (and optional hour slot)
 */
export function resolveAnnouncementsForDate(
  targetDate: Date | string,
  announcements: Announcement[],
  allLogs?: LogEntry[],
  targetHour?: number,
  includeInactive = false
): Announcement[] {
  const dateObj = parseLocalTargetDate(targetDate);
  if (isNaN(dateObj.getTime())) return announcements.filter(a => !a.isDeleted);

  const tz = getStationTimezone();
  const targetDateStr = toCanonicalDateString(dateObj);
  const dayStartLocal = `${targetDateStr}T00:00`;
  const dayEndLocal = `${targetDateStr}T23:59`;

  return announcements.map(rawAnn => {
    const ann: Announcement = (!rawAnn.revisions || rawAnn.revisions.length === 0)
      ? backfillLegacyAnnouncementRevisions(rawAnn, allLogs, tz)
      : rawAnn;

    const annMinStr = String(typeof ann.minute === 'number' ? ann.minute : 0).padStart(2, '0');
    const slotCheckTimeStr = targetHour !== undefined
      ? `${targetDateStr}T${String(targetHour).padStart(2, '0')}:${annMinStr}:00`
      : `${targetDateStr}T23:59:59`;
    const targetIso = stationLocalToUtcIso(slotCheckTimeStr, tz);

    const hasRevisions = Array.isArray(ann.revisions) && ann.revisions.length > 0;
    const validFrom = (!ann.validFrom || (ann.validFrom === '2026-08-01T00:00:00.000Z' && !hasRevisions))
      ? '1970-01-01T00:00:00.000Z'
      : ann.validFrom;
    const validTo = ann.validTo || null;

    let resolved: Announcement | null = null;

    // Check if current head was active at targetIso
    if (validFrom <= targetIso && (!validTo || validTo > targetIso)) {
      resolved = ann.isDeleted ? null : ann;
    } else if (hasRevisions) {
      // Otherwise check past revisions
      const matchedRev = ann.revisions!.find(rev =>
        rev.validFrom <= targetIso && rev.validTo > targetIso
      );
      if (matchedRev) {
        resolved = {
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

    if (!resolved) return null;

    const minStr = String(typeof resolved.minute === 'number' ? resolved.minute : 0).padStart(2, '0');
    const slotLocal = targetHour !== undefined
      ? `${targetDateStr}T${String(targetHour).padStart(2, '0')}:${minStr}`
      : null;

    if (resolved.startDate) {
      const startLocal = normalizeToLocalDateTimePrefix(resolved.startDate, false);
      if (startLocal) {
        if (slotLocal !== null) {
          if (slotLocal < startLocal) return null;
        } else if (dayEndLocal < startLocal) {
          return null;
        }
      }
    }
    if (resolved.endDate) {
      const endLocal = normalizeToLocalDateTimePrefix(resolved.endDate, true);
      if (endLocal) {
        if (slotLocal !== null) {
          if (slotLocal > endLocal) return null;
        } else if (dayStartLocal > endLocal) {
          return null;
        }
      }
    }

    // Inactivation is a point-in-time event affecting forward dates:
    // If an announcement has an endDate, any slot at or prior to endDate acts as "did exist" (enabled: true).
    if (!resolved.enabled) {
      if (resolved.endDate && resolved.endDate.trim()) {
        resolved = {
          ...resolved,
          enabled: true
        };
      } else if (!includeInactive) {
        return null;
      }
    }

    return resolved;
  }).filter((a): a is Announcement => a !== null);
}

/**
 * Resolves the state of shows active on a historical or current date
 */
export function resolveShowsForDate(
  targetDate: Date | string,
  shows: Show[],
  targetHour?: number
): Show[] {
  const dateObj = parseLocalTargetDate(targetDate);
  if (isNaN(dateObj.getTime())) return shows.filter(s => !s.isDeleted && s.active);

  const tz = getStationTimezone();
  const targetDateStr = toCanonicalDateString(dateObj);
  const slotCheckTimeStr = targetHour !== undefined
    ? `${targetDateStr}T${String(targetHour).padStart(2, '0')}:59:59`
    : `${targetDateStr}T23:59:59`;
  const targetIso = stationLocalToUtcIso(slotCheckTimeStr, tz);

  return shows.map(show => {
    const hasRevisions = Array.isArray(show.revisions) && show.revisions.length > 0;
    const validFrom = (!show.validFrom || (show.validFrom === '2026-08-01T00:00:00.000Z' && !hasRevisions))
      ? '1970-01-01T00:00:00.000Z'
      : show.validFrom;
    const validTo = show.validTo || null;

    if (validFrom <= targetIso && (!validTo || validTo > targetIso)) {
      return show.isDeleted ? null : show;
    }

    if (hasRevisions) {
      const matchedRev = show.revisions!.find(rev =>
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
  }).filter((s): s is Show => s !== null && s.active);
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * Dynamic Planned vs. Actual Reconciliation Engine
 * Calculates on-the-fly audit metrics for any target date in the station's timezone
 */
export function reconcileScheduleAndLogs(
  targetDate: Date | string,
  allAnnouncements: Announcement[],
  allShows: Show[],
  allLogs: LogEntry[],
  referenceNow: Date = getStationNow()
): DayAuditSummary {
  const tz = getStationTimezone();
  const dateObj = parseLocalTargetDate(targetDate);
  const targetDateStr = toCanonicalDateString(dateObj);
  const [tYear, tMonth, tDay] = targetDateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(tYear, tMonth - 1, tDay, 12, 0, 0)).getUTCDay(); // 0 = Sunday
  const dayName = dayNames[dayOfWeek];

  const nowY = referenceNow.getFullYear();
  const nowM = String(referenceNow.getMonth() + 1).padStart(2, '0');
  const nowD = String(referenceNow.getDate()).padStart(2, '0');
  const nowH = String(referenceNow.getHours()).padStart(2, '0');
  const nowMin = String(referenceNow.getMinutes()).padStart(2, '0');
  const nowStationIso = `${nowY}-${nowM}-${nowD}T${nowH}:${nowMin}`;

  // Filter successful logs relevant to this target broadcast date in station timezone
  const relevantLogs = allLogs.filter(
    log => (!log.status || log.status === 'played' || log.status === 'backup play') && doesLogMatchLocalSlot(log, targetDateStr)
  );

  const slots: AuditSlotReconciliation[] = [];
  const matchedLogIndices = new Set<number>();
  let plannedCount = 0;
  let playedCount = 0;
  let missedCount = 0;

  // 2. Iterate through 24 hours
  for (let hour = 0; hour < 24; hour++) {
    const activeAnnouncements = resolveAnnouncementsForDate(dateObj, allAnnouncements, allLogs, hour);
    const activeShows = resolveShowsForDate(dateObj, allShows, hour);

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
      const time24 = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const timeLabel = formatTime12(time24);
      const slotLocalStr = `${targetDateStr}T${time24}`;
      const slotTimeIso = stationLocalToUtcIso(slotLocalStr, tz);
      const isSlotInPast = slotLocalStr <= nowStationIso;

      // Find matching log entry deterministically
      let matchedIdx = -1;
      for (let i = 0; i < relevantLogs.length; i++) {
        if (matchedLogIndices.has(i)) continue;
        const log = relevantLogs[i];

        const idMatch = log.announcementId === ann.id ||
          (log.announcementName && log.announcementName.toLowerCase() === ann.name.toLowerCase());

        if (idMatch && doesLogMatchLocalSlot(log, targetDateStr, hour)) {
          matchedIdx = i;
          break;
        }
      }

      if (matchedIdx !== -1) {
        matchedLogIndices.add(matchedIdx);
        playedCount++;
        const log = relevantLogs[matchedIdx];
        const execIso = log.executedAt || log.logTimeStamp || log.timestamp;
        const schedIso = log.announcementTime || log.scheduledFor || log.timestamp;
        const isExport = log.playMode === 'Export';
        const isPrerecord = log.playMode === 'Prerecord' || (!log.playMode && isLogPrerecordOrExport(log));

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
          badgeType: isExport ? 'export' : isPrerecord ? 'prerecord' : 'live',
          badgeLabel: isExport ? 'Exported' : isPrerecord ? 'Prerecorded' : 'Played',
          logEntry: log,
          executedAt: execIso,
          scheduledFor: schedIso || slotTimeIso
        });
      } else if (isSlotInPast) {
        // Past slot with no log -> MISSED
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

    const logTime = extraLog.announcementTime || extraLog.scheduledFor || extraLog.timestamp || extraLog.executedAt || '';
    const stationParts = toStationDateParts(logTime, tz);
    let h = 0;
    let m = 0;
    if (stationParts) {
      h = stationParts.hour;
      m = stationParts.minute;
    } else {
      const timeMatch = logTime.match(/T(\d{2}):(\d{2})/);
      h = timeMatch ? parseInt(timeMatch[1], 10) : 0;
      m = timeMatch ? parseInt(timeMatch[2], 10) : 0;
    }
    const time24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const timeLabel = formatTime12(time24);

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
      executedAt: extraLog.executedAt || extraLog.logTimeStamp || extraLog.timestamp
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
  mp3Url: string,
  allLogs: LogEntry[]
): GatedTrackAuditMetrics {
  const fileName = mp3Url ? mp3Url.split('/').pop()?.split('\\').pop() || '' : '';

  const matchedLogs = allLogs.filter(log => {
    if (log.status && log.status !== 'played' && log.status !== 'backup play') return false;
    const isIdMatch = log.announcementId === announcementId;
    const logFileName = log.mp3Name ? log.mp3Name.split('/').pop()?.split('\\').pop() || '' : '';
    const isFileMatch = fileName && logFileName && logFileName.toLowerCase() === fileName.toLowerCase();
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

  // Sort chronologically by scheduled slot time
  matchedLogs.sort((a, b) => {
    const timeA = a.announcementTime || a.scheduledFor || a.timestamp || '';
    const timeB = b.announcementTime || b.scheduledFor || b.timestamp || '';
    return timeA.localeCompare(timeB);
  });

  const firstLog = matchedLogs[0];
  const lastLog = matchedLogs[matchedLogs.length - 1];

  return {
    firstUsedAt: firstLog.announcementTime || firstLog.scheduledFor || firstLog.timestamp || firstLog.executedAt || null,
    lastUsedAt: lastLog.announcementTime || lastLog.scheduledFor || lastLog.timestamp || lastLog.executedAt || null,
    totalPlays: matchedLogs.length,
    historyLogs: matchedLogs
  };
}
