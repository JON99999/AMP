import { Announcement, AnnouncementType, MediaAssetFile, Show, TimeGatedMp3 } from '../types';
import {
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getFilenameFromUrlOrPath,
  getMP3Status,
  formatDuration,
  validateTimeGatedMp3s,
  formatTime12,
  classifyMediaAsset,
  getGateMediaItems
} from './utils';
import { driveFileNameCache, availableFilesCache, mp3DurationCache, syncMediaCatalogFiles } from './audioCache';

export type ScheduleIssueType = 'missing_media' | 'overlap' | 'gap';
export type ScheduleIssueSeverity = 'critical' | 'warning' | 'info';

export interface ScheduleIssue {
  id: string;                      // Unique identifier for this diagnosed issue
  type: ScheduleIssueType;
  severity: ScheduleIssueSeverity;
  timestamp: string;               // ISO 8601 string of the occurrence
  timeLabel: string;               // e.g. "Thu, Aug 20 14:15"
  slotId: string;                  // Composite slot ID: `${announcementId}_${dayKey}_${hour}`
  dayKey: string;                  // YYYY-MM-DD
  hour: number;                    // 0-23
  minute: number;                  // 0-59
  announcementId: string;
  announcementName: string;
  announcementType: AnnouncementType;
  fileName?: string;
  fileStatus?: { exists: boolean; valid: boolean; filename: string };
  durationSeconds?: number;
  offsetSeconds?: number;          // Overlap excess or gap duration in seconds
  description: string;
  suggestedAction?: string;
}

export interface ScheduleDiagnosticsSummary {
  total: number;
  missingMediaCount: number;
  overlapCount: number;
  gapCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ScheduleDiagnosticsResult {
  scopeStartDate: string;          // ISO string of window start
  scopeEndDate: string;            // ISO string of window end (14 days forward)
  evaluatedAt: string;             // ISO timestamp of evaluation run
  issues: ScheduleIssue[];         // Chronologically ordered list of all detected issues
  issuesBySlotId: Record<string, ScheduleIssue[]>; // O(1) row access by slotId, announcementId, and composite key
  issuesByDayKey: Record<string, ScheduleIssue[]>; // Grouped by day key "YYYY-MM-DD"
  issuesByHourKey: Record<string, ScheduleIssue[]>; // Grouped by "YYYY-MM-DD_HH"
  summary: ScheduleDiagnosticsSummary;
}

/**
 * Parses duration string (e.g. "01:30", "00:45", "0m30s", "30s", "90", "1:15:30") or number into seconds.
 */
export function parseDurationToSeconds(duration?: string | number): number {
  if (duration === undefined || duration === null || duration === '') return 0;
  if (typeof duration === 'number') {
    return isNaN(duration) || duration < 0 ? 0 : duration;
  }
  const clean = String(duration).replace(/^~\s*/, '').trim();
  if (!clean) return 0;

  const minSecMatch = clean.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+)\s*s(?:ec(?:ond)?s?)?$/i);
  if (minSecMatch) {
    return (parseInt(minSecMatch[1], 10) || 0) * 60 + (parseInt(minSecMatch[2], 10) || 0);
  }

  const onlyMinMatch = clean.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/i);
  if (onlyMinMatch) {
    return (parseInt(onlyMinMatch[1], 10) || 0) * 60;
  }

  const onlySecMatch = clean.match(/^(\d+)\s*s(?:ec(?:ond)?s?)?$/i);
  if (onlySecMatch) {
    return parseInt(onlySecMatch[1], 10) || 0;
  }

  if (clean.includes(':')) {
    const parts = clean.split(':').map(p => (p === '' ? 0 : parseFloat(p)));
    if (parts.some(p => isNaN(p))) return 0;
    if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    }
    if (parts.length === 3) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Resolves effective duration in seconds for an announcement or specific timeGatedMp3 entry.
 */
export function resolveEffectiveDurationSeconds(
  announcement: Announcement,
  activeMp3?: TimeGatedMp3 | null
): number {
  const firstMediaItem = activeMp3 ? getGateMediaItems(activeMp3)[0] : undefined;
  const effDur = activeMp3?.duration || firstMediaItem?.duration;
  const effApprox = activeMp3?.approximateReadTime || firstMediaItem?.approximateReadTime;
  const candidateUrl = activeMp3?.mp3Url || firstMediaItem?.mp3Url;

  // 1. Check active timeGatedMp3 / mediaItem duration
  if (effDur) {
    const d = parseDurationToSeconds(effDur);
    if (d > 0) return d;
  }

  // 2. Check read time if script
  if (effApprox) {
    const d = parseDurationToSeconds(effApprox);
    if (d > 0) return d;
  }

  // 3. Check cached duration from driveService duration cache or availableFilesCache
  if (candidateUrl) {
    const cachedStr = mp3DurationCache.get(candidateUrl);
    if (cachedStr) {
      const d = parseDurationToSeconds(cachedStr);
      if (d > 0) return d;
    }

    const rawFname = getFilenameFromUrlOrPath(candidateUrl);
    const fnameLower = rawFname.toLowerCase();
    let driveFile = availableFilesCache.get(rawFname) || availableFilesCache.get(fnameLower);
    if (!driveFile) {
      for (const [key, val] of availableFilesCache.entries()) {
        if (key.toLowerCase() === fnameLower) {
          driveFile = val;
          break;
        }
      }
    }
    if (driveFile?.duration) {
      const d = parseDurationToSeconds(driveFile.duration);
      if (d > 0) return d;
    }
  }

  return 0;
}

import {
  getMatchingMp3sForSlot,
  isAnnouncementActiveInHour,
} from './scheduleEngine';

export { getMatchingMp3sForSlot, isAnnouncementActiveInHour };


export interface EvaluateScheduleDiagnosticsParams {
  announcements: Announcement[];
  shows?: Show[];
  now?: Date;
  startDate?: Date;
  endDate?: Date;
  lookaheadDays?: number;
  includePastHours?: boolean;
  mediaFiles?: Array<Partial<MediaAssetFile> & { name: string }>;
}

/**
 * Pure calculation engine for evaluating schedule anomalies across a date window or visible calendar cells.
 * Iterates through each realized calendar occurrence and audits its exact state.
 */
export function evaluateScheduleDiagnostics({
  announcements,
  shows = [],
  now = new Date(),
  startDate,
  endDate,
  lookaheadDays = 14,
  includePastHours = false,
  mediaFiles
}: EvaluateScheduleDiagnosticsParams): ScheduleDiagnosticsResult {
  if (mediaFiles && mediaFiles.length > 0) {
    syncMediaCatalogFiles(mediaFiles);
  }

  const issues: ScheduleIssue[] = [];
  const issuesBySlotId: Record<string, ScheduleIssue[]> = {};
  const issuesByDayKey: Record<string, ScheduleIssue[]> = {};
  const issuesByHourKey: Record<string, ScheduleIssue[]> = {};

  const summary: ScheduleDiagnosticsSummary = {
    total: 0,
    missingMediaCount: 0,
    overlapCount: 0,
    gapCount: 0,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0
  };

  const addIssue = (issue: ScheduleIssue) => {
    issues.push(issue);

    // Index by unique slotId, announcementId, and composite keys
    const slotKeys = Array.from(new Set([
      issue.slotId,
      issue.announcementId,
      `${issue.announcementId}_${issue.dayKey}`,
      `${issue.announcementId}_${issue.dayKey}_${issue.hour}`,
      `${issue.dayKey}_${issue.hour}_${issue.minute}`
    ].filter(Boolean)));

    for (const key of slotKeys) {
      if (!issuesBySlotId[key]) {
        issuesBySlotId[key] = [];
      }
      if (!issuesBySlotId[key].some(existing => existing.id === issue.id)) {
        issuesBySlotId[key].push(issue);
      }
    }

    if (!issuesByDayKey[issue.dayKey]) {
      issuesByDayKey[issue.dayKey] = [];
    }
    if (!issuesByDayKey[issue.dayKey].some(existing => existing.id === issue.id)) {
      issuesByDayKey[issue.dayKey].push(issue);
    }

    const hourKey = `${issue.dayKey}_${issue.hour.toString().padStart(2, '0')}`;
    if (!issuesByHourKey[hourKey]) {
      issuesByHourKey[hourKey] = [];
    }
    if (!issuesByHourKey[hourKey].some(existing => existing.id === issue.id)) {
      issuesByHourKey[hourKey].push(issue);
    }

    // Tally summary counts
    summary.total++;
    if (issue.type === 'missing_media') summary.missingMediaCount++;
    else if (issue.type === 'overlap') summary.overlapCount++;
    else if (issue.type === 'gap') summary.gapCount++;

    if (issue.severity === 'critical') summary.criticalCount++;
    else if (issue.severity === 'warning') summary.warningCount++;
    else if (issue.severity === 'info') summary.infoCount++;
  };

  let startDay: Date;
  let totalDays: number;
  let scopeStartIso: string;
  let scopeEndIso: string;

  if (startDate && endDate) {
    startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
    const diffMs = endDay.getTime() - startDay.getTime();
    totalDays = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  } else if (startDate) {
    startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
    totalDays = lookaheadDays || 14;
    const endDay = new Date(startDay.getTime() + totalDays * 24 * 60 * 60 * 1000);
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  } else {
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    startDay = defaultStart;
    totalDays = lookaheadDays || 14;
    const endDay = new Date(startDay.getTime() + totalDays * 24 * 60 * 60 * 1000);
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const activeAnnouncements = announcements.filter(
    s => s.enabled !== false || Boolean(s.endDate && s.endDate.trim())
  );

  // Timeline Slot Analysis: Evaluate each realized instance of an announcement in the calendar
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDayDate = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + dayOffset);
    const yyyy = currentDayDate.getFullYear();
    const mm = (currentDayDate.getMonth() + 1).toString().padStart(2, '0');
    const dd = currentDayDate.getDate().toString().padStart(2, '0');
    const dayKey = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = currentDayDate.getDay();

    const isToday = currentDayDate.getFullYear() === now.getFullYear() &&
                    currentDayDate.getMonth() === now.getMonth() &&
                    currentDayDate.getDate() === now.getDate();

    const startHour = (!includePastHours && isToday && !startDate) ? now.getHours() : 0;

    for (let hour = startHour; hour < 24; hour++) {
      // Find all announcements scheduled to broadcast in this specific realized calendar slot
      const hourAnnouncements = activeAnnouncements.filter(s =>
        isAnnouncementActiveInHour(s, currentDayDate, hour, dayKey, dayOfWeek)
      ).sort((a, b) => (a.minute || 0) - (b.minute || 0));

      for (const s of hourAnnouncements) {
        const minute = s.minute || 0;
        const slotDateTime = new Date(yyyy, currentDayDate.getMonth(), currentDayDate.getDate(), hour, minute, 0, 0);
        const slotMs = slotDateTime.getTime();
        const slotIso = `${dayKey}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const timeLabel = `${dayNames[dayOfWeek]}, ${monthNames[currentDayDate.getMonth()]} ${currentDayDate.getDate()} at ${formatTime12(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)}`;
        const slotId = `${s.id}_${dayKey}_${hour}`;

        const timeGated = s.timeGatedMp3s || [];

        // Check 1: Realized instance has 0 timeGated entries
        if (timeGated.length === 0) {
          addIssue({
            id: `missing_media_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'missing_media',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            announcementId: s.id,
            announcementName: s.name,
            announcementType: s.type,
            description: `"${s.name}" has no media assigned at this time.`,
            suggestedAction: 'Edit the announcement and click "Add Announcement" to assign an audio or script file.'
          });
          continue;
        }

        // Check 2: Evaluate matching time-gated files specifically for this realized slot instance
        const matchingEntries = getMatchingMp3sForSlot(s, slotMs, slotIso);

        // Case A: Schedule Gap / No file covers this realized slot
        if (matchingEntries.length === 0) {
          // Check if slot is after the last scheduled time-gated item ended
          const sortedEntries = [...timeGated].filter(t => t.endDate).sort((a, b) => {
            const aEnd = a.endDate ? new Date(formatToDatetimeLocal(a.endDate)).getTime() : 0;
            const bEnd = b.endDate ? new Date(formatToDatetimeLocal(b.endDate)).getTime() : 0;
            return bEnd - aEnd;
          });
          const lastEndedItem = sortedEntries[0];
          const lastEndMs = lastEndedItem?.endDate ? new Date(formatToDatetimeLocal(lastEndedItem.endDate)).getTime() : NaN;
          const isPostExpiration = !isNaN(lastEndMs) && slotMs > lastEndMs;

          addIssue({
            id: `gap_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'gap',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            announcementId: s.id,
            announcementName: s.name,
            announcementType: s.type,
            description: isPostExpiration
              ? `"${s.name}" has no announcements scheduled after the last scheduled announcement.`
              : `"${s.name}" has a gap with no announcements scheduled at this time.`,
            suggestedAction: isPostExpiration
              ? 'Add a new time-gated item or extend the end date of the last active item to maintain continuous coverage.'
              : 'Add or adjust time-gated start/end dates so this time window is covered.'
          });
          continue;
        }

        // Case B: Dual Media Collision (More than one time-gate window is scheduled to play simultaneously for this single announcement)
        if (matchingEntries.length > 1) {
          const fileNames = matchingEntries.map(m => {
            const firstItem = getGateMediaItems(m)[0];
            return firstItem?.mp3Url ? getFilenameFromUrlOrPath(firstItem.mp3Url) : '(no file)';
          }).join(' AND ');
          const firstEntryMedia = getGateMediaItems(matchingEntries[0])[0];
          addIssue({
            id: `overlap_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'overlap',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            announcementId: s.id,
            announcementName: s.name,
            announcementType: s.type,
            fileName: firstEntryMedia?.mp3Url,
            description: `"${s.name}" has an overlap with ${fileNames}.`,
            suggestedAction: 'Adjust transition dates/times so only one file is active at this slot.'
          });
        }

        // Case C: For each active matching gate in this slot, verify that all rotating media files in the gate are valid and present on disk/Drive
        for (const entry of matchingEntries) {
          const entryItems = getGateMediaItems(entry);
          if (entryItems.length === 0) {
            addIssue({
              id: `empty_file_${s.id}_${entry.id}_${dayKey}_${hour}_${minute}`,
              type: 'missing_media',
              severity: 'critical',
              timestamp: slotDateTime.toISOString(),
              timeLabel,
              slotId,
              dayKey,
              hour,
              minute,
              announcementId: s.id,
              announcementName: s.name,
              announcementType: s.type,
              description: `"${s.name}" has no media assigned at this time.`,
              suggestedAction: 'Click "Choose" to select an audio or script file.'
            });
            continue;
          }

          for (let itemIdx = 0; itemIdx < entryItems.length; itemIdx++) {
            const mItem = entryItems[itemIdx];
            if (!mItem.mp3Url || mItem.mp3Url.trim() === '') {
              addIssue({
                id: `empty_file_${s.id}_${entry.id}_${itemIdx}_${dayKey}_${hour}_${minute}`,
                type: 'missing_media',
                severity: 'critical',
                timestamp: slotDateTime.toISOString(),
                timeLabel,
                slotId,
                dayKey,
                hour,
                minute,
                announcementId: s.id,
                announcementName: s.name,
                announcementType: s.type,
                description: `"${s.name}" has no media assigned at this time.`,
                suggestedAction: 'Click "Choose" to select an audio or script file.'
              });
              continue;
            }

            const status = getMP3Status(mItem.mp3Url);
            const entryIsScript = classifyMediaAsset(mItem.mp3Url, mItem.assetType) === 'script';

            if (!status.exists) {
              addIssue({
                id: `missing_file_${s.id}_${entry.id}_${itemIdx}_${dayKey}_${hour}_${minute}`,
                type: 'missing_media',
                severity: 'critical',
                timestamp: slotDateTime.toISOString(),
                timeLabel,
                slotId,
                dayKey,
                hour,
                minute,
                announcementId: s.id,
                announcementName: s.name,
                announcementType: s.type,
                fileName: mItem.mp3Url,
                fileStatus: status,
                description: `Missing File: "${status.filename || mItem.mp3Url}" scheduled for "${s.name}" was not found in storage or media cache.`,
                suggestedAction: 'Upload the missing audio file to your media folder or select an available track.'
              });
            } else if (!entryIsScript && !status.valid) {
              addIssue({
                id: `invalid_file_${s.id}_${entry.id}_${itemIdx}_${dayKey}_${hour}_${minute}`,
                type: 'missing_media',
                severity: 'warning',
                timestamp: slotDateTime.toISOString(),
                timeLabel,
                slotId,
                dayKey,
                hour,
                minute,
                announcementId: s.id,
                announcementName: s.name,
                announcementType: s.type,
                fileName: mItem.mp3Url,
                fileStatus: status,
                description: `File format warning: "${status.filename}" may not be a valid audio file.`,
                suggestedAction: 'Verify audio encoding or re-upload as a standard MP3.'
              });
            }

            // Check backup audio file if script mode
            if (entryIsScript && mItem.backupMp3Url) {
              const bUrl = mItem.backupMp3Url;
              if (bUrl) {
                const bStatus = getMP3Status(bUrl);
                if (!bStatus.exists) {
                  addIssue({
                    id: `missing_backup_${s.id}_${entry.id}_${itemIdx}_${dayKey}_${hour}_${minute}`,
                    type: 'missing_media',
                    severity: 'warning',
                    timestamp: slotDateTime.toISOString(),
                    timeLabel,
                    slotId,
                    dayKey,
                    hour,
                    minute,
                    announcementId: s.id,
                    announcementName: s.name,
                    announcementType: s.type,
                    fileName: bUrl,
                    fileStatus: bStatus,
                    description: `Missing Backup Audio: "${bStatus.filename || bUrl}" attached to script was not found.`,
                    suggestedAction: 'Upload the backup audio track or clear backup URL if not needed.'
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Sort flat list chronologically
  issues.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    scopeStartDate: scopeStartIso,
    scopeEndDate: scopeEndIso,
    evaluatedAt: new Date().toISOString(),
    issues,
    issuesBySlotId,
    issuesByDayKey,
    issuesByHourKey,
    summary
  };
}
