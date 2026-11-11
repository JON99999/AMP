/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Announcement, AnnouncementRevision, AnnouncementType, LogEntry, Show, ShowRevision, TimeGatedMp3 } from '../types';
import {
  getStationTimezone,
  getStationNow,
  toStationDateParts,
  stationLocalToUtcIso,
  backfillLegacyAnnouncementRevisions,
  isLogPrerecordOrExport
} from './compatibility';
import { formatTime12, formatToDatetimeLocal, getGateMediaItems } from './utils';

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

export interface SlotAssessmentScore {
  played: number;
  missed: number;
  future: number;
  cancelled: number;
  total: number;
  isInfiniteFuture: boolean;
  futureLabel: string;
  totalLabel: string;
}

export interface GatedTrackAuditMetrics extends SlotAssessmentScore {
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  totalPlays: number;
  historyLogs: LogEntry[];
}

import {
  DAYS_ORDER,
  parseLocalTargetDate,
  toCanonicalDateString,
  normalizeToLocalDateTimePrefix,
  isAnnouncementRuleMatch,
} from './scheduleEngine';

export { parseLocalTargetDate, toCanonicalDateString, normalizeToLocalDateTimePrefix };


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
        const currentGates = Array.isArray(ann.timeGatedMp3s) ? ann.timeGatedMp3s : [];
        const revGates = Array.isArray(matchedRev.timeGatedMp3s) ? matchedRev.timeGatedMp3s : [];
        const currentGateIds = new Set(currentGates.map(g => g.id));
        const mergedGates =
          currentGates.length > 0
            ? [...currentGates, ...revGates.filter(rg => !currentGateIds.has(rg.id))]
            : revGates;

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
          timeGatedMp3s: mergedGates,
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
  const dayName = DAYS_ORDER[dayOfWeek];

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

    // Find announcements scheduled for this day and hour using canonical rule matcher
    const scheduledAnns = activeAnnouncements.filter(ann =>
      isAnnouncementRuleMatch(ann, dayOfWeek, hour, ann.minute || 0, targetDateStr, {
        ignoreMinute: true,
      })
    );

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
 * Converts a log entry's scheduled/broadcast timestamp into station-local YYYY-MM-DDTHH:mm
 * so it can be compared accurately against gate startDate, endDate, and inactivatedAt bounds.
 */
export function logTimestampToStationLocalIso(
  rawTs: string | undefined | null,
  tz: string = getStationTimezone()
): string {
  if (!rawTs || typeof rawTs !== 'string') return '';
  const trimmed = rawTs.trim();
  if (!trimmed) return '';

  const isUtcOrOffset = trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed);
  if (isUtcOrOffset) {
    const parts = toStationDateParts(trimmed, tz);
    if (parts) {
      return `${parts.dateStr}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    }
  }

  return formatToDatetimeLocal(trimmed);
}

/**
 * Formats a multi-line tooltip summarizing Played, Missed, Future, Total (and Cancelled if > 0)
 */
export function formatSlotAssessmentTooltip(
  score: SlotAssessmentScore,
  options?: {
    scopeTitle?: string;
    firstUsedFormatted?: string | null;
    lastUsedFormatted?: string | null;
  }
): string {
  const lines: string[] = [];
  if (options?.scopeTitle) {
    lines.push(options.scopeTitle);
  }
  lines.push(`Played: ${score.played}`);
  lines.push(`Missed: ${score.missed}`);
  lines.push(`Future: ${score.futureLabel}`);
  if (score.cancelled > 0) {
    lines.push(`Cancelled (Inactivated): ${score.cancelled}`);
  }
  lines.push(`Total: ${score.totalLabel}`);
  if (options?.firstUsedFormatted) {
    lines.push(`First Broadcast: ${options.firstUsedFormatted}`);
  }
  if (options?.lastUsedFormatted) {
    lines.push(`Last Broadcast: ${options.lastUsedFormatted}`);
  }
  return lines.join('\n');
}

function buildAssessmentScore(
  played: number,
  missed: number,
  future: number,
  cancelled: number,
  isInfiniteFuture: boolean
): SlotAssessmentScore {
  const finiteTotal = played + missed + (isInfiniteFuture ? 0 : future);
  const futureLabel = isInfiniteFuture ? '∞ (Open-Ended)' : String(future);
  const totalLabel = isInfiniteFuture
    ? `${played + missed} + ∞`
    : cancelled > 0
      ? `${finiteTotal} (${cancelled} cancelled)`
      : String(finiteTotal);

  return {
    played,
    missed,
    future: isInfiniteFuture ? 0 : future,
    cancelled,
    total: finiteTotal,
    isInfiniteFuture,
    futureLabel,
    totalLabel,
  };
}

/**
 * Common Calendar & Review Assessment Engine for a specific Announcement Gate and its rotating media items.
 * Scopes Played, Missed, Future, Cancelled, and Total strictly to this gate's time window and rotation slots.
 */
export function calculateGateSlotAssessment(
  announcement: Partial<Announcement>,
  gate: TimeGatedMp3,
  allLogs: LogEntry[],
  referenceNow: Date = getStationNow()
): {
  gateScore: SlotAssessmentScore;
  itemAudits: GatedTrackAuditMetrics[];
} {
  const mediaItems = getGateMediaItems(gate);
  const itemCount = Math.max(1, mediaItems.length);

  const emptyItemAudit = (): GatedTrackAuditMetrics => ({
    ...buildAssessmentScore(0, 0, 0, 0, false),
    firstUsedAt: null,
    lastUsedAt: null,
    totalPlays: 0,
    historyLogs: [],
  });

  if (!gate.startDate || !gate.startDate.trim()) {
    return {
      gateScore: buildAssessmentScore(0, 0, 0, 0, false),
      itemAudits: mediaItems.map(() => emptyItemAudit()),
    };
  }

  const tz = getStationTimezone();
  const pad = (n: number) => String(n).padStart(2, '0');
  const nowStationIso = `${referenceNow.getFullYear()}-${pad(referenceNow.getMonth() + 1)}-${pad(referenceNow.getDate())}T${pad(referenceNow.getHours())}:${pad(referenceNow.getMinutes())}`;

  const gStart = formatToDatetimeLocal(gate.startDate);
  const parentStart =
    announcement.startDate && announcement.startDate.trim()
      ? formatToDatetimeLocal(announcement.startDate)
      : '';
  const effectiveStart = parentStart && parentStart > gStart ? parentStart : gStart;

  const rawEnd =
    gate.endDate && gate.endDate.trim() ? formatToDatetimeLocal(gate.endDate) : '';
  const parentEnd =
    announcement.endDate && announcement.endDate.trim()
      ? formatToDatetimeLocal(announcement.endDate)
      : '';
  const scheduledEnd =
    rawEnd && parentEnd
      ? rawEnd < parentEnd
        ? rawEnd
        : parentEnd
      : rawEnd || parentEnd || '';

  const inactIso =
    gate.inactivated && gate.inactivatedAt && gate.inactivatedAt.trim()
      ? formatToDatetimeLocal(gate.inactivatedAt)
      : '';
  const effectiveEnd = inactIso
    ? scheduledEnd && scheduledEnd < inactIso
      ? scheduledEnd
      : inactIso
    : scheduledEnd;

  const isInfiniteFuture = Boolean(
    announcement.type !== AnnouncementType.ONE_TIME &&
      announcement.enabled !== false &&
      !gate.inactivated &&
      !effectiveEnd
  );

  const annId = String(announcement.id || '');
  const extractFileName = (url?: string) =>
    url ? (url.split('/').pop()?.split('\\').pop() || '').toLowerCase() : '';

  const itemFileNames = mediaItems.map(mi => extractFileName(mi.mp3Url));

  // Filter logs strictly to this announcement AND this gate's active window [effectiveStart, effectiveEnd]
  const gateScopedLogs: { log: LogEntry; localIso: string; fileName: string }[] = [];
  if (annId && Array.isArray(allLogs)) {
    for (const log of allLogs) {
      if (log.status && log.status !== 'played' && log.status !== 'backup play') continue;
      if (String(log.announcementId || '') !== annId) continue;
      const rawTs =
        log.announcementTime || log.scheduledFor || log.timestamp || log.executedAt || '';
      const localIso = logTimestampToStationLocalIso(String(rawTs), tz);
      if (!localIso) continue;
      if (effectiveStart && localIso < effectiveStart) continue;
      if (effectiveEnd && localIso > effectiveEnd) continue;
      const logFile = extractFileName(log.mp3Name);
      gateScopedLogs.push({ log, localIso, fileName: logFile });
    }
  }

  gateScopedLogs.sort((a, b) => a.localIso.localeCompare(b.localIso));

  const matchedLogIndices = new Set<number>();
  const itemPlayedLogs: LogEntry[][] = Array.from({ length: itemCount }, () => []);
  const itemMissedCounts: number[] = Array.from({ length: itemCount }, () => 0);
  const itemFutureCounts: number[] = Array.from({ length: itemCount }, () => 0);
  const itemCancelledCounts: number[] = Array.from({ length: itemCount }, () => 0);

  let gatePlayed = 0;
  let gateMissed = 0;
  let gateFuture = 0;
  let gateCancelled = 0;

  const scanEndIso = scheduledEnd || effectiveEnd || nowStationIso;
  const startMs = new Date(effectiveStart).getTime();
  const scanEndMs = new Date(scanEndIso).getTime();

  if (!isNaN(startMs) && !isNaN(scanEndMs) && startMs <= scanEndMs) {
    const baseMinute = Number(announcement.minute) || 0;
    const cursor = new Date(startMs);
    cursor.setMinutes(baseMinute, 0, 0);
    if (cursor.getTime() < startMs) {
      cursor.setHours(cursor.getHours() + 1);
    }

    const tz = getStationTimezone();
    const hasRevisions = Array.isArray(announcement.revisions) && announcement.revisions.length > 0;
    const headValidFrom =
      !announcement.validFrom || (announcement.validFrom === '2026-08-01T00:00:00.000Z' && !hasRevisions)
        ? '1970-01-01T00:00:00.000Z'
        : announcement.validFrom;
    const headValidTo = announcement.validTo || null;

    let slotIndex = 0;
    let safety = 0;
    const MAX_SCAN_HOURS = 8760; // Cap scan at 1 year of hours for fast UI rendering

    while (cursor.getTime() <= scanEndMs && safety < MAX_SCAN_HOURS) {
      safety++;
      const y = cursor.getFullYear();
      const m = cursor.getMonth() + 1;
      const d = cursor.getDate();
      const h = cursor.getHours();
      const localDateStr = `${y}-${pad(m)}-${pad(d)}`;
      const dayOfWeek = cursor.getDay();

      let effectiveAnnForSlot: Partial<Announcement> = announcement;
      if (hasRevisions) {
        const slotCheckUtcIso = stationLocalToUtcIso(`${localDateStr}T${pad(h)}:59:59`, tz);
        if (!(headValidFrom <= slotCheckUtcIso && (!headValidTo || headValidTo > slotCheckUtcIso))) {
          const matchedRev = announcement.revisions!.find(
            rev => rev.validFrom <= slotCheckUtcIso && rev.validTo > slotCheckUtcIso
          );
          if (matchedRev) {
            effectiveAnnForSlot = {
              ...announcement,
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
            };
          }
        }
      }

      const annMinute = Number(effectiveAnnForSlot.minute ?? baseMinute) || 0;
      const slotIso = `${localDateStr}T${pad(h)}:${pad(annMinute)}`;

      const matchesRule = isAnnouncementRuleMatch(
        effectiveAnnForSlot as Announcement,
        dayOfWeek,
        h,
        annMinute,
        localDateStr
      );

      if (matchesRule) {
        // Resolve which media items were active at slotIso (respecting per-item inactivatedAt)
        const eligibleItemIndices: number[] = [];
        mediaItems.forEach((mi, idx) => {
          if (!mi.inactivated) {
            eligibleItemIndices.push(idx);
          } else if (mi.inactivatedAt && mi.inactivatedAt.trim()) {
            const itemInactIso = formatToDatetimeLocal(mi.inactivatedAt);
            if (itemInactIso && slotIso <= itemInactIso) {
              eligibleItemIndices.push(idx);
            }
          }
        });
        const rotIdx =
          eligibleItemIndices.length > 0
            ? eligibleItemIndices[slotIndex % eligibleItemIndices.length]
            : slotIndex % itemCount;
        slotIndex++;

        const isAfterInactivation = Boolean(inactIso && effectiveEnd && slotIso > effectiveEnd);

        if (isAfterInactivation) {
          gateCancelled++;
          itemCancelledCounts[rotIdx]++;
        } else if (slotIso > nowStationIso) {
          gateFuture++;
          itemFutureCounts[rotIdx]++;
        } else {
          // Past or current slot within effective window: check for matching play log in this hour
          const slotHourPrefix = slotIso.slice(0, 13);
          const expectedFile = itemFileNames[rotIdx];

          let foundLogIdx = -1;
          for (let i = 0; i < gateScopedLogs.length; i++) {
            if (matchedLogIndices.has(i)) continue;
            if (gateScopedLogs[i].localIso.slice(0, 13) === slotHourPrefix) {
              if (expectedFile && gateScopedLogs[i].fileName === expectedFile) {
                foundLogIdx = i;
                break;
              }
              if (foundLogIdx === -1) {
                foundLogIdx = i;
              }
            }
          }

          if (foundLogIdx !== -1) {
            matchedLogIndices.add(foundLogIdx);
            const matchedEntry = gateScopedLogs[foundLogIdx];
            gatePlayed++;

            // Attribute play to the rotation slot if it matches expectedFile, or to the matching file item in this gate
            let targetItemIdx = rotIdx;
            if (
              matchedEntry.fileName &&
              itemFileNames[rotIdx] !== matchedEntry.fileName
            ) {
              const fileMatchIdx = itemFileNames.findIndex(fn => fn === matchedEntry.fileName);
              if (fileMatchIdx !== -1) {
                targetItemIdx = fileMatchIdx;
              }
            }
            itemPlayedLogs[targetItemIdx].push(matchedEntry.log);
          } else {
            gateMissed++;
            itemMissedCounts[rotIdx]++;
          }
        }
      }

      cursor.setHours(cursor.getHours() + 1);
    }
  }

  // Include any remaining unmatched logs that occurred within the gate's active window (e.g. extra/manual plays or minute shifts)
  for (let i = 0; i < gateScopedLogs.length; i++) {
    if (matchedLogIndices.has(i)) continue;
    const entry = gateScopedLogs[i];
    gatePlayed++;
    const fileMatchIdx = entry.fileName
      ? itemFileNames.findIndex(fn => fn === entry.fileName)
      : -1;
    const targetIdx = fileMatchIdx !== -1 ? fileMatchIdx : 0;
    if (itemPlayedLogs[targetIdx]) {
      itemPlayedLogs[targetIdx].push(entry.log);
    }
  }

  const gateScore = buildAssessmentScore(
    gatePlayed,
    gateMissed,
    gateFuture,
    gateCancelled,
    isInfiniteFuture
  );

  const itemAudits: GatedTrackAuditMetrics[] = mediaItems.map((mi, idx) => {
    const fileName = itemFileNames[idx];
    if (!fileName) {
      return emptyItemAudit();
    }

    const logsForThisItem = itemPlayedLogs[idx] || [];
    logsForThisItem.sort((a, b) => {
      const timeA = a.announcementTime || a.scheduledFor || a.timestamp || '';
      const timeB = b.announcementTime || b.scheduledFor || b.timestamp || '';
      return timeA.localeCompare(timeB);
    });

    const firstLog = logsForThisItem[0];
    const lastLog = logsForThisItem[logsForThisItem.length - 1];
    const playedCount = logsForThisItem.length;
    const itemIsInfiniteFuture = isInfiniteFuture && !mi.inactivated;
    const score = buildAssessmentScore(
      playedCount,
      itemMissedCounts[idx] || 0,
      mi.inactivated ? 0 : itemFutureCounts[idx] || 0,
      itemCancelledCounts[idx] || 0,
      itemIsInfiniteFuture
    );

    return {
      ...score,
      firstUsedAt: firstLog
        ? firstLog.announcementTime || firstLog.scheduledFor || firstLog.timestamp || firstLog.executedAt || null
        : null,
      lastUsedAt: lastLog
        ? lastLog.announcementTime || lastLog.scheduledFor || lastLog.timestamp || lastLog.executedAt || null
        : null,
      totalPlays: playedCount,
      historyLogs: logsForThisItem,
    };
  });

  return { gateScore, itemAudits };
}

/**
 * Calculates audit metrics for a specific TimeGatedMp3 track.
 * When `options.gate` is provided, scopes metrics strictly to that gate and rotation item.
 */
export function calculateGatedTrackAudit(
  announcementId: string,
  mp3Url: string,
  allLogs: LogEntry[],
  options?: {
    gate?: TimeGatedMp3;
    announcement?: Partial<Announcement>;
    itemIndex?: number;
    referenceNow?: Date;
  }
): GatedTrackAuditMetrics {
  if (options?.gate) {
    const ann: Partial<Announcement> = options.announcement || { id: announcementId };
    const { itemAudits } = calculateGateSlotAssessment(
      ann,
      options.gate,
      allLogs,
      options.referenceNow
    );
    if (
      typeof options.itemIndex === 'number' &&
      options.itemIndex >= 0 &&
      options.itemIndex < itemAudits.length
    ) {
      return itemAudits[options.itemIndex];
    }
    const targetFile = mp3Url ? (mp3Url.split('/').pop()?.split('\\').pop() || '').toLowerCase() : '';
    const items = getGateMediaItems(options.gate);
    const matchIdx = items.findIndex(
      mi => (mi.mp3Url?.split('/').pop()?.split('\\').pop() || '').toLowerCase() === targetFile
    );
    if (matchIdx !== -1 && itemAudits[matchIdx]) {
      return itemAudits[matchIdx];
    }
  }

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
      ...buildAssessmentScore(0, 0, 0, 0, false),
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
  const played = matchedLogs.length;

  return {
    ...buildAssessmentScore(played, 0, 0, 0, false),
    firstUsedAt: firstLog.announcementTime || firstLog.scheduledFor || firstLog.timestamp || firstLog.executedAt || null,
    lastUsedAt: lastLog.announcementTime || lastLog.scheduledFor || lastLog.timestamp || lastLog.executedAt || null,
    totalPlays: played,
    historyLogs: matchedLogs
  };
}
