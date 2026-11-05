/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified Schedule, Time-Gate & Rotation Domain Engine (`src/lib/scheduleEngine.ts`)
 *
 * Centralizes all pure schedule rule matching, station-local date boundary checks,
 * time-gated media window resolution, deterministic multi-item rotation (`1, 2, 3`),
 * show-at-slot evaluation, virtual "Up Next" promo synthesis, and file schedule usage metrics.
 */

import {
  Announcement,
  AnnouncementRevision,
  AnnouncementType,
  LogEntry,
  ResolvedTimeGatedMp3,
  Show,
  TimeGatedMediaItem,
  TimeGatedMp3,
  UpNextPromoConfig,
} from '../types';
import {
  getStationTimezone,
  getStationNow,
  toStationDateParts,
  getUpNextPromoConfig,
  isMissingApproxReadTime,
  estimateWpmReadTimeFromText,
} from './compatibility';
import {
  classifyMediaAsset,
  UP_NEXT_PROMO_URL_PREFIX,
  isUpNextPromoUrl,
  decodeUpNextPromoText,
  getFilenameFromUrlOrPath,
  formatTime12,
  formatDatetime12,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getDatePart,
  getTimePart,
} from './utils';

export const DAYS_ORDER = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type DayName = (typeof DAYS_ORDER)[number];

// ============================================================================
// 1. STATION DATE & SLOT NORMALIZATION HELPERS
// ============================================================================

/**
 * Parses a Date or date string safely in local station time when given YYYY-MM-DD.
 */
export function parseLocalTargetDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day, 12, 0, 0, 0);
  }
  return new Date(d);
}

/**
 * Normalizes any Date or ISO string into a canonical YYYY-MM-DD string in station time.
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

/**
 * Normalizes a start or end date string into a comparable YYYY-MM-DDTHH:mm local prefix.
 * When given a date-only YYYY-MM-DD string, expands to 00:00 for start bounds and 23:59 for end bounds.
 */
export function normalizeToLocalDateTimePrefix(dateStr?: string, isEnd = false): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T${isEnd ? '23:59' : '00:00'}`;
  }
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed) &&
    !trimmed.endsWith('Z') &&
    !/[+-]\d{2}:\d{2}$/.test(trimmed)
  ) {
    return trimmed.substring(0, 16);
  }
  const parts = toStationDateParts(trimmed, getStationTimezone());
  if (parts) {
    return `${parts.dateStr}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  }
  return trimmed;
}

/**
 * Extracts normalized station-local calendar components from a slot Date, timestamp, or ISO string.
 */
export function toSlotLocalComponents(slotDate: Date | string | number): {
  dateObj: Date;
  localDateStr: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  slotLocalStr: string;
} {
  const dateObj = slotDate instanceof Date ? slotDate : new Date(slotDate);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;
  const dayOfWeek = dateObj.getDay();
  const hour = dateObj.getHours();
  const minute = dateObj.getMinutes();
  const slotLocalStr = `${localDateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { dateObj, localDateStr, dayOfWeek, hour, minute, slotLocalStr };
}

// ============================================================================
// 2. CANONICAL SLOT & RULE MATCHING (ONE-TIME, BASIC-HOURLY, ADVANCED)
// ============================================================================

/**
 * Evaluates whether an announcement falls within its configured [startDate, endDate] envelope
 * at the given station-local date, hour, and minute.
 */
export function isAnnouncementWithinDateBounds(
  announcement: Announcement,
  localDateStr: string,
  hour: number,
  minute?: number
): boolean {
  const effectiveMin = typeof minute === 'number' ? minute : (Number(announcement.minute) || 0);
  const slotLocal = `${localDateStr}T${String(hour).padStart(2, '0')}:${String(effectiveMin).padStart(2, '0')}`;

  if (announcement.startDate && announcement.startDate.trim()) {
    const startLocal = normalizeToLocalDateTimePrefix(announcement.startDate, false);
    if (startLocal && slotLocal < startLocal) {
      return false;
    }
  }

  if (announcement.endDate && announcement.endDate.trim()) {
    const endLocal = normalizeToLocalDateTimePrefix(announcement.endDate, true);
    if (endLocal && slotLocal > endLocal) {
      return false;
    }
  }

  return true;
}

/**
 * Pure schedule rule matcher for One-Time, Basic-Hourly, and Advanced announcements.
 * Supports both modern `gridRules` ("day-hour") and legacy `days` + `hours` arrays.
 */
export function isAnnouncementRuleMatch(
  announcement: Announcement,
  dayOfWeek: number,
  hour: number,
  minute: number,
  localDateStr: string,
  options?: { ignoreMinute?: boolean }
): boolean {
  const ignoreMinute = Boolean(options?.ignoreMinute);
  const annMinute = Number(announcement.minute) || 0;

  if (!ignoreMinute && annMinute !== minute) {
    return false;
  }

  if (announcement.type === AnnouncementType.ONE_TIME) {
    if (!announcement.date || announcement.time === undefined || announcement.time === '') {
      return false;
    }
    const targetHour = parseInt(String(announcement.time), 10);
    return announcement.date === localDateStr && targetHour === hour;
  }

  if (announcement.type === AnnouncementType.BASIC_HOURLY) {
    const hasDay =
      !Array.isArray(announcement.days) ||
      announcement.days.length === 0 ||
      announcement.days.includes(dayOfWeek);
    const hasHour =
      !Array.isArray(announcement.hours) ||
      announcement.hours.length === 0 ||
      announcement.hours.includes(hour);
    return hasDay && hasHour;
  }

  if (announcement.type === AnnouncementType.ADVANCED) {
    if (Array.isArray(announcement.gridRules) && announcement.gridRules.length > 0) {
      return announcement.gridRules.includes(`${dayOfWeek}-${hour}`);
    }
    const dayMatch = Array.isArray(announcement.days) && announcement.days.includes(dayOfWeek);
    const hourMatch = Array.isArray(announcement.hours) && announcement.hours.includes(hour);
    return Boolean(dayMatch && hourMatch);
  }

  return false;
}

/**
 * Evaluates whether an announcement is active in a given Date and Hour cell
 * (used by Calendar grid cells and Schedule Diagnostics).
 */
export function isAnnouncementActiveInHour(
  s: Announcement,
  _date: Date,
  hour: number,
  localDateStr: string,
  dayOfWeek: number
): boolean {
  if (s.enabled === false && (!s.endDate || !s.endDate.trim())) return false;

  if (!isAnnouncementWithinDateBounds(s, localDateStr, hour, s.minute || 0)) {
    return false;
  }

  return isAnnouncementRuleMatch(s, dayOfWeek, hour, s.minute || 0, localDateStr, {
    ignoreMinute: true,
  });
}

/**
 * Evaluates whether an announcement is scheduled at a specific 1-minute slot.
 */
export function isAnnouncementScheduledAtSlot(
  announcement: Announcement,
  slotDate: Date | string | number,
  options?: { includeInactive?: boolean }
): boolean {
  if (!announcement || announcement.isDeleted) return false;
  if (!options?.includeInactive && !announcement.enabled) return false;

  const { localDateStr, dayOfWeek, hour, minute } = toSlotLocalComponents(slotDate);

  if (announcement.type !== AnnouncementType.ONE_TIME) {
    if (!isAnnouncementWithinDateBounds(announcement, localDateStr, hour, minute)) {
      return false;
    }
  }

  return isAnnouncementRuleMatch(announcement, dayOfWeek, hour, minute, localDateStr, {
    ignoreMinute: false,
  });
}

/**
 * Returns all announcements scheduled at a specific 1-minute slot.
 */
export function getAnnouncementsForSlot(
  announcements: Announcement[],
  slotDate: Date | string | number,
  options?: { includeInactive?: boolean }
): Announcement[] {
  if (!Array.isArray(announcements) || announcements.length === 0) return [];
  return announcements.filter(s => isAnnouncementScheduledAtSlot(s, slotDate, options));
}

// ============================================================================
// 3. TIME-GATE WINDOW RESOLUTION, VALIDATION & MULTI-ITEM ROTATION (1, 2, 3)
// ============================================================================

export function getGateMediaItems(
  gate?: Partial<TimeGatedMp3> | null
): TimeGatedMediaItem[] {
  if (!gate) return [];
  if (Array.isArray(gate.mediaItems) && gate.mediaItems.length > 0) {
    return gate.mediaItems;
  }
  if (
    gate.mp3Url !== undefined ||
    gate.assetType !== undefined ||
    gate.approximateReadTime !== undefined ||
    gate.duration !== undefined
  ) {
    return [
      {
        mp3Url: gate.mp3Url || '',
        assetType: gate.assetType,
        duration: gate.duration,
        fileSize: gate.fileSize,
        backupMp3Url: gate.backupMp3Url,
        approximateReadTime: gate.approximateReadTime,
      },
    ];
  }
  return [];
}

export function formatRotatedAnnouncementName(
  name: string,
  activeMp3?: Partial<ResolvedTimeGatedMp3> | null
): string {
  if (!name) return '';
  const total = activeMp3?.rotationTotal || 0;
  const idx = activeMp3?.rotationIndex || 0;
  if (total > 1 && idx >= 1) {
    const suffix = ` (${idx}/${total})`;
    return name.endsWith(suffix) ? name : `${name}${suffix}`;
  }
  return name;
}

export function formatRotatedFileName(
  fileName: string,
  activeMp3?: Partial<ResolvedTimeGatedMp3> | null
): string {
  if (!fileName) return '';
  const total = activeMp3?.rotationTotal || 0;
  const idx = activeMp3?.rotationIndex || 0;
  if (total > 1 && idx >= 1) {
    const prefix = `(${idx}/${total}) `;
    return fileName.startsWith(prefix) ? fileName : `${prefix}${fileName}`;
  }
  return fileName;
}

export function getGatedAssetType(
  item?: Partial<TimeGatedMp3 | TimeGatedMediaItem> | null
): 'audio' | 'script' {
  if (!item) return 'audio';
  const asGate = item as Partial<TimeGatedMp3>;
  if (Array.isArray(asGate.mediaItems) && asGate.mediaItems.length > 0 && !asGate.mp3Url) {
    const first = asGate.mediaItems[0];
    return classifyMediaAsset(first?.mp3Url, first?.assetType);
  }
  return classifyMediaAsset(item?.mp3Url, item?.assetType);
}

export function getAnnouncementAssetType(
  announcement?: Partial<Announcement> | null,
  slotTime?: Date | string | number
): 'audio' | 'script' {
  if (!announcement) return 'audio';
  const activeMp3 = getActiveMp3ForSlot(announcement as Announcement, slotTime);
  return getGatedAssetType(activeMp3);
}

type LegacyRawAnnouncement = Announcement & {
  mp3Url?: string;
  assetType?: 'audio' | 'script';
  duration?: string;
  fileSize?: string;
  backupMp3Url?: string;
  approximateReadTime?: string;
  approxReadTime?: string;
  text?: string;
  content?: string;
  scriptText?: string;
  liveReadText?: string;
};

type LegacyRawMediaItem = Partial<TimeGatedMediaItem> & {
  approxReadTime?: string;
  text?: string;
  content?: string;
  scriptText?: string;
  liveReadText?: string;
};

type LegacyRawGate = Partial<TimeGatedMp3> & {
  approxReadTime?: string;
  text?: string;
  content?: string;
  scriptText?: string;
  liveReadText?: string;
};

export function normalizeAnnouncement(item: Announcement): Announcement {
  if (!item) return item;

  const anyItem = item as LegacyRawAnnouncement;
  const isLegacy015Item = String(item?.metadata?.lastModifiedBy || '').startsWith('0.15.');
  const rawMp3s: LegacyRawGate[] = Array.isArray(item.timeGatedMp3s)
    ? [...item.timeGatedMp3s]
    : [];
  if (rawMp3s.length === 0 && anyItem.mp3Url) {
    rawMp3s.push({
      id: `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      startDate: item.startDate || '',
      endDate: item.endDate || undefined,
      mediaItems: [
        {
          mp3Url: anyItem.mp3Url,
          assetType: getGatedAssetType({ mp3Url: anyItem.mp3Url, assetType: anyItem.assetType }),
          approximateReadTime: anyItem.approximateReadTime,
          backupMp3Url: anyItem.backupMp3Url,
          duration: anyItem.duration,
        },
      ],
    });
  }

  const normalizeGateEntry = (m: LegacyRawGate): TimeGatedMp3 => {
    const gateId =
      (typeof m.id === 'string' && m.id) ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    let rawItems: LegacyRawMediaItem[] =
      Array.isArray(m.mediaItems) && m.mediaItems.length > 0 ? [...m.mediaItems] : [m];

    if (
      isLegacy015Item &&
      Array.isArray(m.mediaItems) &&
      m.mediaItems.length > 0 &&
      typeof m.mp3Url === 'string' &&
      m.mp3Url !== m.mediaItems[0]?.mp3Url
    ) {
      rawItems[0] = {
        ...rawItems[0],
        mp3Url: m.mp3Url,
        ...(m.assetType !== undefined ? { assetType: m.assetType } : {}),
        ...(m.backupMp3Url !== undefined ? { backupMp3Url: m.backupMp3Url } : {}),
        ...(m.approximateReadTime !== undefined ? { approximateReadTime: m.approximateReadTime } : {}),
        ...(m.duration !== undefined ? { duration: m.duration } : {}),
        ...(m.fileSize !== undefined ? { fileSize: m.fileSize } : {}),
      };
    }

    const normalizedMediaItems: TimeGatedMediaItem[] = rawItems.map(mItem => {
      const mp3Url = String(mItem?.mp3Url ?? m?.mp3Url ?? '');
      const rawAssetType = (mItem?.assetType ?? m?.assetType) as 'audio' | 'script' | undefined;
      const derivedAssetType = classifyMediaAsset(mp3Url, rawAssetType);
      let resolvedApprox =
        derivedAssetType === 'script'
          ? ((mItem?.approximateReadTime ??
            mItem?.approxReadTime ??
            m?.approximateReadTime ??
            m?.approxReadTime ??
            anyItem.approximateReadTime ??
            anyItem.approxReadTime) as string | undefined)
          : undefined;
      if (derivedAssetType === 'script' && isMissingApproxReadTime(resolvedApprox)) {
        const inlineText = String(
          (isUpNextPromoUrl(mp3Url) ? decodeUpNextPromoText(mp3Url) : '') ||
            mItem?.text ||
            mItem?.content ||
            mItem?.scriptText ||
            mItem?.liveReadText ||
            m?.text ||
            m?.content ||
            m?.scriptText ||
            m?.liveReadText ||
            anyItem.text ||
            anyItem.content ||
            anyItem.scriptText ||
            anyItem.liveReadText ||
            ''
        );
        const estimated = estimateWpmReadTimeFromText(inlineText);
        resolvedApprox = estimated || undefined;
      }
      return {
        mp3Url,
        assetType: derivedAssetType,
        approximateReadTime: derivedAssetType === 'script' ? resolvedApprox : undefined,
        backupMp3Url:
          derivedAssetType === 'script'
            ? ((mItem?.backupMp3Url ?? m?.backupMp3Url) as string | undefined)
            : undefined,
        duration:
          derivedAssetType === 'audio' ? ((mItem?.duration ?? m?.duration) as string | undefined) : undefined,
        fileSize: mItem?.fileSize ?? m?.fileSize ?? undefined,
      };
    });

    const primaryItem = normalizedMediaItems[0];

    return {
      id: gateId,
      startDate: m.startDate || '',
      endDate: m.endDate || undefined,
      ...(m.inactivated ? { inactivated: true } : {}),
      ...(m.inactivated && m.inactivatedAt ? { inactivatedAt: m.inactivatedAt } : {}),
      mediaItems: normalizedMediaItems,
      // Temporary Dual-Value Sibling Bridge for v0.15.4/0.15.5 coexistence:
      mp3Url: primaryItem?.mp3Url ?? '',
      assetType: primaryItem?.assetType,
      approximateReadTime: primaryItem?.approximateReadTime,
      backupMp3Url: primaryItem?.backupMp3Url,
      duration: primaryItem?.duration,
      fileSize: primaryItem?.fileSize,
    };
  };

  const normalizedTimeGated: TimeGatedMp3[] = rawMp3s.map(normalizeGateEntry);

  const rawRevisions = Array.isArray(item.revisions) ? item.revisions : [];
  const revisions = rawRevisions.map(rev => {
    if (!rev || typeof rev !== 'object' || !Array.isArray(rev.timeGatedMp3s)) return rev;
    return {
      ...rev,
      timeGatedMp3s: rev.timeGatedMp3s.map(g =>
        normalizeGateEntry(g as LegacyRawGate)
      ),
    };
  });
  const validFrom =
    !item.validFrom || (item.validFrom === '2026-08-01T00:00:00.000Z' && revisions.length === 0)
      ? '1970-01-01T00:00:00.000Z'
      : item.validFrom;

  const base: LegacyRawAnnouncement = {
    ...item,
    enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
    timeGatedMp3s: normalizedTimeGated,
    validFrom,
    validTo: item.validTo !== undefined ? item.validTo : null,
    isDeleted: typeof item.isDeleted === 'boolean' ? item.isDeleted : false,
    revisions,
  };

  delete base.mp3Url;
  delete base.assetType;
  delete base.duration;
  delete base.fileSize;
  delete base.backupMp3Url;
  delete base.approximateReadTime;

  return base;
}

export function normalizeAnnouncements(items: Announcement[]): Announcement[] {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeAnnouncement);
}

/**
 * Computes the 0-based scheduled occurrence count `k` from a gate's effective startDate
 * up to `targetMs`, using pure station calendar hours so DST transitions never skew counts.
 * Uses O(1) full-week (168-hour) cycle math so long-running announcements never iterate unboundedly.
 * Used for deterministic multi-item rotation: index = k % mediaItems.length (1, 2, 3, 1, 2, 3...).
 */
export function computeScheduledOccurrenceCount(
  announcement: Announcement,
  gate: TimeGatedMp3,
  targetMs: number
): number {
  if (announcement.type === AnnouncementType.ONE_TIME) {
    return 0;
  }

  const gateStartLocal = gate.startDate && gate.startDate.trim() ? formatToDatetimeLocal(gate.startDate) : '';
  const annStartLocal =
    announcement.startDate && announcement.startDate.trim() ? formatToDatetimeLocal(announcement.startDate) : '';

  let startLocal = '';
  if (gateStartLocal && annStartLocal) {
    startLocal = gateStartLocal > annStartLocal ? gateStartLocal : annStartLocal;
  } else {
    startLocal = gateStartLocal || annStartLocal;
  }

  if (!startLocal) {
    return 0;
  }

  const targetDt = new Date(targetMs);
  if (isNaN(targetDt.getTime())) return 0;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const targetLocal = `${targetDt.getFullYear()}-${pad2(targetDt.getMonth() + 1)}-${pad2(targetDt.getDate())}T${pad2(targetDt.getHours())}:${pad2(targetDt.getMinutes())}`;

  const parseLocalParts = (isoLocal: string) => {
    const [dPart, tPart] = isoLocal.split('T');
    if (!dPart) return null;
    const [y, m, d] = dPart.split('-').map(Number);
    const [hr, min] = (tPart || '00:00').split(':').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return {
      y,
      m,
      d,
      hr: isNaN(hr) ? 0 : hr,
      min: isNaN(min) ? 0 : min,
      utcHourIndex: Math.floor(Date.UTC(y, m - 1, d, isNaN(hr) ? 0 : hr, 0, 0) / 3600000),
    };
  };

  const sParts = parseLocalParts(startLocal);
  const tParts = parseLocalParts(targetLocal);
  if (!sParts || !tParts) return 0;

  const annMinute = Number(announcement.minute) || 0;
  const firstEligibleHourIndex =
    annMinute < sParts.min ? sParts.utcHourIndex + 1 : sParts.utcHourIndex;

  if (tParts.utcHourIndex <= firstEligibleHourIndex) {
    return 0;
  }

  const totalHoursSpan = tParts.utcHourIndex - firstEligibleHourIndex;

  if (announcement.type === AnnouncementType.BASIC_HOURLY) {
    return totalHoursSpan;
  }

  if (announcement.type === AnnouncementType.ADVANCED) {
    let rules = Array.isArray(announcement.gridRules) ? announcement.gridRules : [];
    if (rules.length === 0 && Array.isArray(announcement.days) && Array.isArray(announcement.hours)) {
      const synthesized: string[] = [];
      for (const d of announcement.days) {
        for (const h of announcement.hours) {
          synthesized.push(`${d}-${h}`);
        }
      }
      rules = synthesized;
    }
    if (rules.length === 0) return 0;
    const ruleSet = new Set(rules);

    const fullWeeks = Math.floor(totalHoursSpan / 168);
    const remHours = totalHoursSpan % 168;
    let count = fullWeeks * ruleSet.size;

    const baseHourIndex = firstEligibleHourIndex + fullWeeks * 168;
    for (let hOffset = 0; hOffset < remHours; hOffset++) {
      const hIdx = baseHourIndex + hOffset;
      const dt = new Date(hIdx * 3600000);
      const dow = dt.getUTCDay();
      const hr = dt.getUTCHours();
      if (ruleSet.has(`${dow}-${hr}`)) {
        count++;
      }
    }
    return count;
  }

  return 0;
}

export function buildResolvedGateMp3(
  announcement: Announcement,
  gate: TimeGatedMp3,
  targetMs: number
): ResolvedTimeGatedMp3 {
  const items = getGateMediaItems(gate);
  const total = items.length;
  if (total === 0) {
    return {
      id: gate.id,
      gateId: gate.id,
      mp3Url: '',
      startDate: gate.startDate || '',
      endDate: gate.endDate,
      mediaItems: [],
      rotationIndex: 1,
      rotationTotal: 1,
    };
  }

  let selectedIdx = 0;
  if (total > 1 && announcement.type !== AnnouncementType.ONE_TIME) {
    const k = computeScheduledOccurrenceCount(announcement, gate, targetMs);
    selectedIdx = ((k % total) + total) % total;
  }

  const chosen = items[selectedIdx] || items[0];
  return {
    id: gate.id,
    gateId: gate.id,
    mp3Url: chosen.mp3Url || '',
    startDate: gate.startDate || '',
    endDate: gate.endDate,
    assetType: chosen.assetType,
    duration: chosen.duration,
    fileSize: chosen.fileSize,
    backupMp3Url: chosen.backupMp3Url,
    approximateReadTime: chosen.approximateReadTime,
    mediaItems: items,
    rotationIndex: selectedIdx + 1,
    rotationTotal: total,
  };
}

export function getGateEffectiveEndIso(gate: TimeGatedMp3): string | undefined {
  const rawEnd = gate.endDate && gate.endDate.trim() ? formatToDatetimeLocal(gate.endDate) : '';
  if (gate.inactivated && gate.inactivatedAt && gate.inactivatedAt.trim()) {
    const inactEnd = formatToDatetimeLocal(gate.inactivatedAt);
    if (rawEnd && rawEnd < inactEnd) {
      return rawEnd;
    }
    return inactEnd || rawEnd || undefined;
  }
  return rawEnd || undefined;
}

export function isGateExpiredOrInactivated(
  gate: TimeGatedMp3,
  nowIso: string = getCurrentDatetimeLocal()
): boolean {
  if (gate.inactivated) return true;
  if (gate.endDate && gate.endDate.trim() && formatToDatetimeLocal(gate.endDate) < nowIso) {
    return true;
  }
  return false;
}

/**
 * Resolves the active (or next upcoming preview) TimeGatedMp3 for an announcement at a slot.
 * Step 1: Checks for a gate window strictly covering `slotTime`.
 * Step 2: When `allowFutureFallback` is true (default), falls back to the earliest future gate window
 * so announcement cards display upcoming media info before the first gate begins.
 */
export function getActiveMp3ForSlot(
  announcement: Announcement | undefined | null,
  slotTime?: Date | string | number,
  options?: { allowFutureFallback?: boolean }
): ResolvedTimeGatedMp3 | null {
  if (!announcement) return null;
  if (
    announcement.enabled === false &&
    (!slotTime || !announcement.endDate || !announcement.endDate.trim())
  ) {
    return null;
  }

  let targetMs: number;
  if (!slotTime) {
    targetMs = Date.now();
  } else if (slotTime instanceof Date) {
    targetMs = slotTime.getTime();
  } else if (typeof slotTime === 'number') {
    targetMs = slotTime;
  } else {
    const parsed = new Date(slotTime).getTime();
    targetMs = isNaN(parsed) ? Date.now() : parsed;
  }

  // Check parent Announcement date envelope
  if (announcement.startDate) {
    const parentStartMs = new Date(formatToDatetimeLocal(announcement.startDate)).getTime();
    if (!isNaN(parentStartMs) && targetMs < parentStartMs) {
      return null;
    }
  }
  if (announcement.endDate) {
    const parentEndMs = new Date(formatToDatetimeLocal(announcement.endDate)).getTime();
    if (!isNaN(parentEndMs) && targetMs > parentEndMs) {
      return null;
    }
  }

  const mp3s = announcement.timeGatedMp3s || [];
  if (mp3s.length === 0) return null;

  const sorted = sortMp3sByStartDate(mp3s);

  // Step 1: Check for currently active window (respecting inactivatedAt cutoff on inactivated gates)
  for (const item of sorted) {
    const startMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : 0;
    const effectiveEndStr = getGateEffectiveEndIso(item);
    const endMs = effectiveEndStr ? new Date(effectiveEndStr).getTime() : Infinity;

    if (!isNaN(startMs) && targetMs >= startMs) {
      if (isNaN(endMs) || targetMs <= endMs) {
        return buildResolvedGateMp3(announcement, item, targetMs);
      }
    }
  }

  // Step 2: Check for earliest forward-looking (future) window (unless disabled or inactivated)
  if (options?.allowFutureFallback !== false) {
    for (const item of sorted) {
      if (item.inactivated) continue;
      const startMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : 0;
      if (!isNaN(startMs) && startMs > targetMs) {
        return buildResolvedGateMp3(announcement, item, startMs);
      }
    }
  }

  // Step 3: All entries are in the past and no future entries exist
  return null;
}

/**
 * Strictly resolves all TimeGatedMp3 entries whose [startDate, effectiveEndDate] cover `slotDateMs`.
 * - 0 entries -> schedule gap / missing media
 * - 1 entry   -> normal valid coverage
 * - >1 entries -> overlapping dual-media collision
 */
export function getMatchingMp3sForSlot(
  announcement: Announcement,
  slotDateMs: number,
  _localIsoStr?: string
): TimeGatedMp3[] {
  const timeGated = announcement.timeGatedMp3s || [];
  if (timeGated.length === 0) {
    return [];
  }

  const matching: TimeGatedMp3[] = [];

  for (const item of timeGated) {
    const itemStartMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : NaN;
    const effectiveEndStr = getGateEffectiveEndIso(item);
    const itemEndMs = effectiveEndStr ? new Date(effectiveEndStr).getTime() : NaN;

    const afterStart = isNaN(itemStartMs) || slotDateMs >= itemStartMs;
    const beforeEnd = isNaN(itemEndMs) || slotDateMs <= itemEndMs;

    if (afterStart && beforeEnd) {
      matching.push(item);
    }
  }

  return matching;
}

export function getAllRequiredMp3Urls(announcements: Announcement[]): string[] {
  if (!Array.isArray(announcements)) return [];
  const urls = new Set<string>();

  announcements.forEach(item => {
    if (!item || !item.enabled || item.isUpNextPromo) return;
    if (Array.isArray(item.timeGatedMp3s)) {
      item.timeGatedMp3s.forEach(m => {
        const mediaItems = getGateMediaItems(m);
        mediaItems.forEach(mi => {
          if (mi.mp3Url && mi.mp3Url.trim() && !isUpNextPromoUrl(mi.mp3Url)) {
            urls.add(mi.mp3Url.trim());
          }
          if (mi.backupMp3Url && mi.backupMp3Url.trim() && !isUpNextPromoUrl(mi.backupMp3Url)) {
            urls.add(mi.backupMp3Url.trim());
          }
        });
      });
    }
  });

  return Array.from(urls);
}

/**
 * Checks if an end datetime (e.g. 2026-08-30T23:59) and a start datetime (e.g. 2026-08-31T00:00)
 * represent a contiguous transition across midnight (Prior Day 23:59 to Next Day 00:00),
 * which is treated as seamless continuous coverage (not a gap).
 */
export function isContiguousMidnightTransition(endStr?: string, startStr?: string): boolean {
  if (!endStr || !startStr) return false;
  const endFormatted = formatToDatetimeLocal(endStr);
  const startFormatted = formatToDatetimeLocal(startStr);
  if (!endFormatted || !startFormatted) return false;

  const endDate = getDatePart(endFormatted);
  const endTime = getTimePart(endFormatted);
  const startDate = getDatePart(startFormatted);
  const startTime = getTimePart(startFormatted);

  if (endTime === '23:59' && startTime === '00:00') {
    const [ey, em, ed] = endDate.split('-').map(Number);
    const [sy, sm, sd] = startDate.split('-').map(Number);
    if (!isNaN(ey) && !isNaN(em) && !isNaN(ed) && !isNaN(sy) && !isNaN(sm) && !isNaN(sd)) {
      const nextDayOfEnd = new Date(ey, em - 1, ed + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const expectedStartDate = `${nextDayOfEnd.getFullYear()}-${pad(nextDayOfEnd.getMonth() + 1)}-${pad(nextDayOfEnd.getDate())}`;
      if (startDate === expectedStartDate) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Given a new start datetime ISO (e.g. 2026-09-08T00:00),
 * computes the backfilled end datetime for a preceding open-ended or abutting slot.
 */
export function computeBackfilledEndTime(newStartIso: string): string {
  if (!newStartIso) return '';
  const timePart = getTimePart(newStartIso) || '00:00';
  if (timePart === '00:00') {
    const datePart = getDatePart(newStartIso);
    const [y, m, d] = datePart.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const prevDate = new Date(y, m - 1, d - 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}T23:59`;
    }
  }
  return newStartIso;
}

/**
 * Given a preceding slot's end datetime ISO or (date, time) pair,
 * computes the starting datetime for the next announcement gap auto-fill.
 */
export function getNextGapAutoFillStart(
  endIsoOrDate: string,
  endTime?: string
): { startDate: string; startTime: string; startIso: string } {
  let eDate = '';
  let eTime = '';
  if (endTime !== undefined) {
    eDate = endIsoOrDate;
    eTime = endTime;
  } else {
    const formatted = formatToDatetimeLocal(endIsoOrDate);
    eDate = getDatePart(formatted);
    eTime = getTimePart(formatted) || '00:00';
  }

  if (eTime === '23:59') {
    const [y, m, d] = eDate.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const nextDay = new Date(y, m - 1, d + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const nextDateStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      return {
        startDate: nextDateStr,
        startTime: '00:00',
        startIso: `${nextDateStr}T00:00`,
      };
    }
  }

  return {
    startDate: eDate,
    startTime: eTime || '00:00',
    startIso: `${eDate}T${eTime || '00:00'}`,
  };
}

export function sortMp3sByStartDate(mp3s: TimeGatedMp3[]): TimeGatedMp3[] {
  if (!Array.isArray(mp3s)) return [];
  return [...mp3s].sort((a, b) => {
    const aStart = formatToDatetimeLocal(a.startDate) || '';
    const bStart = formatToDatetimeLocal(b.startDate) || '';
    if (!aStart && bStart) return 1;
    if (aStart && !bStart) return -1;
    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;
    return 0;
  });
}

export function findFirstGapOrEnd(
  mp3s: TimeGatedMp3[],
  fallbackDate?: string
): { startDate: string; endDate?: string } {
  const sorted = sortMp3sByStartDate(mp3s);

  for (let i = 0; i < sorted.length - 1; i++) {
    const currEnd = sorted[i].endDate ? formatToDatetimeLocal(sorted[i].endDate) : null;
    const nextStart = sorted[i + 1].startDate ? formatToDatetimeLocal(sorted[i + 1].startDate) : null;

    if (
      currEnd &&
      nextStart &&
      currEnd < nextStart &&
      !isContiguousMidnightTransition(currEnd, nextStart)
    ) {
      const autoFillStart = getNextGapAutoFillStart(currEnd);
      const autoFillEnd = computeBackfilledEndTime(nextStart);
      return { startDate: autoFillStart.startIso, endDate: autoFillEnd };
    }
  }

  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (last.endDate) {
      const autoFillStart = getNextGapAutoFillStart(formatToDatetimeLocal(last.endDate));
      return { startDate: autoFillStart.startIso };
    }
  }

  const fallback = fallbackDate ? formatToDatetimeLocal(fallbackDate) : getCurrentDatetimeLocal();
  return { startDate: fallback };
}

export function validateTimeGatedMp3s(
  mp3s: TimeGatedMp3[],
  nowIso?: string,
  parentProfileEndDate?: string,
  parentProfileStartDate?: string
) {
  const sorted = sortMp3sByStartDate(mp3s);
  const errors: { [id: string]: string[] } = {};
  const warnings: { [id: string]: string[] } = {};
  const gapStartIds = new Set<string>();
  const gapEndIds = new Set<string>();
  const overlapStartIds = new Set<string>();
  const overlapEndIds = new Set<string>();
  const missingStartIds = new Set<string>();
  const missingFileIds = new Set<string>();
  const currentNow = nowIso || getCurrentDatetimeLocal();

  sorted.forEach(item => {
    errors[item.id] = [];
    warnings[item.id] = [];
  });

  sorted.forEach(item => {
    const isHistoricalExpired = isGateExpiredOrInactivated(item, currentNow);
    if (!item.startDate || item.startDate.trim() === '') {
      warnings[item.id].push('Start date & time is missing.');
      if (!isHistoricalExpired) {
        missingStartIds.add(item.id);
      }
    }
    const mediaItems = getGateMediaItems(item);
    if (mediaItems.length === 0) {
      warnings[item.id].push('File attachment selection is missing.');
      if (!isHistoricalExpired) {
        missingFileIds.add(item.id);
      }
    } else {
      let gateMissingFile = false;
      mediaItems.forEach(mi => {
        if (!mi.mp3Url || mi.mp3Url.trim() === '') {
          gateMissingFile = true;
        }
      });
      if (gateMissingFile) {
        warnings[item.id].push('File attachment selection is missing.');
        if (!isHistoricalExpired) {
          missingFileIds.add(item.id);
        }
      }
    }
  });

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (isGateExpiredOrInactivated(a, currentNow)) continue;
    const aStart = formatToDatetimeLocal(a.startDate);
    const aEnd = getGateEffectiveEndIso(a) || null;

    if (!aStart) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (isGateExpiredOrInactivated(b, currentNow)) continue;
      const bStart = formatToDatetimeLocal(b.startDate);
      const bEnd = getGateEffectiveEndIso(b) || null;

      if (!bStart) continue;

      let overlap = false;
      if (aEnd === null) {
        if (bStart >= aStart) {
          overlap = true;
        }
      } else {
        if (bEnd === null) {
          if (bStart < aEnd) {
            overlap = true;
          }
        } else {
          if (aStart < bEnd && bStart < aEnd) {
            overlap = true;
          }
        }
      }

      if (overlap) {
        // Ignore overlaps whose intersection window already ended in the past
        const overlapEnd =
          aEnd !== null && bEnd !== null
            ? (aEnd < bEnd ? aEnd : bEnd)
            : (aEnd || bEnd);
        if (overlapEnd && overlapEnd <= currentNow) {
          continue;
        }

        warnings[a.id].push(`Time range overlaps with Announcement #${j + 1}`);
        warnings[b.id].push(`Time range overlaps with Announcement #${i + 1}`);

        if (aStart === bStart) {
          overlapStartIds.add(a.id);
          overlapStartIds.add(b.id);
        } else {
          overlapEndIds.add(a.id);
          overlapStartIds.add(b.id);
        }

        if (aEnd === null) {
          overlapEndIds.add(a.id);
          overlapEndIds.add(b.id);
        } else {
          if (bEnd !== null && bEnd <= aEnd) {
            overlapEndIds.add(b.id);
            overlapEndIds.add(a.id);
          }
        }
      }
    }
  }

  // 1. Check for leading gap from effective schedule start (max of now() and parentProfileStartDate) to first active/upcoming startDate
  const activeSorted = sorted.filter(
    item => !isGateExpiredOrInactivated(item, currentNow)
  );
  const parentStart = parentProfileStartDate ? formatToDatetimeLocal(parentProfileStartDate) : '';
  const effectiveLeadBaseline = parentStart && parentStart > currentNow ? parentStart : currentNow;
  const isBaselineNow = effectiveLeadBaseline === currentNow && (!parentStart || parentStart <= currentNow);
  if (activeSorted.length > 0 && activeSorted[0].startDate) {
    const firstStart = formatToDatetimeLocal(activeSorted[0].startDate);
    if (
      firstStart &&
      firstStart > effectiveLeadBaseline &&
      !isContiguousMidnightTransition(effectiveLeadBaseline, firstStart)
    ) {
      warnings[activeSorted[0].id].push(
        `Gap detected: ${formatDatetime12(effectiveLeadBaseline)}${isBaselineNow ? ' (now)' : ''} to ${formatDatetime12(firstStart)}`
      );
      gapStartIds.add(activeSorted[0].id);
    }
  }

  // 2. Check for subsequent gaps between active/upcoming announcements (ignoring gaps that already ended in the past)
  for (let i = 0; i < activeSorted.length - 1; i++) {
    const a = activeSorted[i];
    const b = activeSorted[i + 1];
    const aEnd = a.endDate ? formatToDatetimeLocal(a.endDate) : null;
    const bStart = b.startDate ? formatToDatetimeLocal(b.startDate) : null;

    if (
      aEnd &&
      bStart &&
      aEnd < bStart &&
      bStart > currentNow &&
      !isContiguousMidnightTransition(aEnd, bStart)
    ) {
      warnings[b.id].push(`Gap detected: ${formatDatetime12(aEnd)} to ${formatDatetime12(bStart)}`);
      gapEndIds.add(a.id);
      gapStartIds.add(b.id);
    }
  }

  // 3. Check for trailing post-expiration gap after the last active/upcoming gated item
  if (activeSorted.length > 0) {
    const lastItem = activeSorted[activeSorted.length - 1];
    if (lastItem.endDate && lastItem.endDate.trim()) {
      const lastEnd = formatToDatetimeLocal(lastItem.endDate);
      const parentEnd = parentProfileEndDate ? formatToDatetimeLocal(parentProfileEndDate) : null;
      if (
        lastEnd > currentNow &&
        (!parentEnd || (parentEnd > lastEnd && !isContiguousMidnightTransition(lastEnd, parentEnd)))
      ) {
        gapEndIds.add(lastItem.id);
        const gapTargetText = parentEnd ? formatDatetime12(parentEnd) : 'the future';
        warnings[lastItem.id].push(`Gap detected: ${formatDatetime12(lastEnd)} to ${gapTargetText}`);
      }
    }
  }

  const hasErrors =
    sorted.length === 0 ||
    missingStartIds.size > 0 ||
    missingFileIds.size > 0 ||
    overlapStartIds.size > 0 ||
    overlapEndIds.size > 0 ||
    gapStartIds.size > 0 ||
    gapEndIds.size > 0 ||
    Object.values(errors).some(arr => arr.length > 0);

  return {
    errors,
    warnings,
    gapStartIds,
    gapEndIds,
    overlapStartIds,
    overlapEndIds,
    missingStartIds,
    missingFileIds,
    hasErrors,
    sorted,
  };
}

// ============================================================================
// 4. SHOW-AT-SLOT RESOLUTION & VIRTUAL "UP NEXT" PROMO SYNTHESIS
// ============================================================================

export interface SimpleShow {
  day: DayName;
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
}

export interface BaseShow {
  id: string;
  day: DayName;
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
}

export function getSortedShows(showsList: BaseShow[]): BaseShow[] {
  return [...showsList].sort((a, b) => {
    const aMin = DAYS_ORDER.indexOf(a.day) * 1440 + a.startHour * 60 + a.startMinute;
    const bMin = DAYS_ORDER.indexOf(b.day) * 1440 + b.startHour * 60 + b.startMinute;
    return aMin - bMin;
  });
}

export function getShowShade(
  show: BaseShow,
  sortedShows: BaseShow[]
): { bg: string; border: string; title: string } {
  const index =
    sortedShows && sortedShows.length > 0
      ? sortedShows.findIndex(s => s.id === show.id)
      : -1;

  if (index !== -1 && index % 2 !== 0) {
    return {
      bg: 'var(--show-shade-odd-bg)',
      border: 'var(--show-shade-odd-border)',
      title: `Active during show: ${show.name}`,
    };
  }

  return {
    bg: 'var(--show-shade-even-bg)',
    border: 'var(--show-shade-even-border)',
    title: `Active during show: ${show.name}`,
  };
}

export function isTimeInShow(
  show: SimpleShow,
  dayName: DayName,
  hour: number,
  minute: number = 0
): boolean {
  const showDayIdx = DAYS_ORDER.indexOf(show.day);
  const targetDayIdx = DAYS_ORDER.indexOf(dayName);

  if (showDayIdx === -1 || targetDayIdx === -1) return false;

  const startMin = showDayIdx * 1440 + show.startHour * 60 + show.startMinute;
  const durationMin = show.durationHours * 60 + show.durationMinutes;
  const endMin = startMin + durationMin;

  const targetMin = targetDayIdx * 1440 + hour * 60 + minute;

  if (endMin <= 10080) {
    return targetMin >= startMin && targetMin < endMin;
  } else {
    return targetMin >= startMin || targetMin < endMin % 10080;
  }
}

/**
 * Returns all shows active at the given slot Date (and optional minute override).
 */
export function getShowsForSlot<T extends SimpleShow>(
  shows: T[],
  slotDate: Date,
  minuteOverride?: number
): T[] {
  if (!Array.isArray(shows) || shows.length === 0) return [];
  const dayName = DAYS_ORDER[slotDate.getDay()];
  const hour = slotDate.getHours();
  const minute = typeof minuteOverride === 'number' ? minuteOverride : slotDate.getMinutes();
  return shows.filter(s => isTimeInShow(s, dayName, hour, minute));
}

export function getActualShowStart(
  show: {
    day?: string;
    startHour: number;
    startMinute: number;
    durationHours: number;
    durationMinutes?: number;
  },
  referenceTime: Date
): Date {
  const durationMin = show.durationHours * 60 + (show.durationMinutes || 0);

  if (show.day && (DAYS_ORDER as readonly string[]).includes(show.day)) {
    const showDayIdx = DAYS_ORDER.indexOf(show.day as DayName);
    const targetDayIdx = referenceTime.getDay();
    const showStartMinInWeek = showDayIdx * 1440 + show.startHour * 60 + show.startMinute;
    const targetMinInWeek =
      targetDayIdx * 1440 + referenceTime.getHours() * 60 + referenceTime.getMinutes();

    const diffMin = (targetMinInWeek - showStartMinInWeek + 10080) % 10080;
    if (diffMin < durationMin) {
      const showStartDate = new Date(
        referenceTime.getTime() -
          diffMin * 60 * 1000 -
          referenceTime.getSeconds() * 1000 -
          referenceTime.getMilliseconds()
      );
      return showStartDate;
    }
  }

  const start = new Date(referenceTime);
  start.setHours(show.startHour, show.startMinute, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  if (referenceTime.getTime() < start.getTime()) {
    const yesterdayStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (
      referenceTime.getTime() >= yesterdayStart.getTime() &&
      referenceTime.getTime() < yesterdayEnd.getTime()
    ) {
      return yesterdayStart;
    }
  }
  return start;
}

/**
 * Formats the standard 3-part Live Read script copy for an "Up Next" show promo card.
 */
export function formatUpNextPromoCopy(show: {
  name: string;
  host?: string;
  day: string;
  startHour: number;
  startMinute?: number;
  durationHours: number;
  durationMinutes?: number;
  description?: string;
}): string {
  const showName = (show.name || 'Upcoming Show').trim();
  const hostName = (show.host || '').trim();
  const startH = Math.max(0, Math.min(23, Number(show.startHour) || 0));
  const startM = Math.max(0, Math.min(59, Number(show.startMinute) || 0));
  const durMin = Math.max(
    1,
    (Number(show.durationHours) || 0) * 60 + (Number(show.durationMinutes) || 0)
  );
  const endTotalMin = (startH * 60 + startM + durMin) % 1440;
  const endH = Math.floor(endTotalMin / 60);
  const endM = endTotalMin % 60;

  const formatUpNextCopyTime = (h: number, m: number): string => {
    if (h === 0 && m === 0) return '12:00AM (midnight)';
    if (h === 12 && m === 0) return '12:00PM (noon)';
    return formatTime12(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, {
      padHour: false,
    });
  };

  const startTime12 = formatUpNextCopyTime(startH, startM);
  const endTime12 = formatUpNextCopyTime(endH, endM);
  const hostClause = hostName ? ` with ${hostName}` : '';
  const line1 = `Up Next is ${showName}${hostClause} from ${startTime12} to ${endTime12} every ${show.day || 'week'}.`;
  const desc = (show.description || '').trim();
  const finalLine = `That's ${showName} at ${startTime12}.`;

  return desc ? `${line1}\n\n${desc}\n\n${finalLine}` : `${line1}\n\n${finalLine}`;
}

/**
 * Dynamically synthesizes virtual "Up Next: [Show Name]" Live Read announcements
 * from the active and historical Show schedule without writing to announcements.json.
 */
export function buildUpNextPromoAnnouncements(
  shows: Show[],
  config: UpNextPromoConfig = getUpNextPromoConfig()
): Announcement[] {
  if (!config || !config.enabled || !Array.isArray(shows) || shows.length === 0) {
    return [];
  }

  const minutesBefore = Math.max(1, Math.min(120, Math.round(Number(config.minutesBefore) || 20)));

  const computePromoSlot = (
    dayName: string,
    startHour: number,
    startMinute: number
  ): { dayIdx: number; hour: number; minute: number } => {
    const showDayIdx = Math.max(0, (DAYS_ORDER as readonly string[]).indexOf(dayName));
    const showStartMinInWeek =
      showDayIdx * 1440 + (Number(startHour) || 0) * 60 + (Number(startMinute) || 0);
    const promoMinInWeek = (showStartMinInWeek - minutesBefore + 10080) % 10080;
    const dayIdx = Math.floor(promoMinInWeek / 1440);
    const remMin = promoMinInWeek % 1440;
    const hour = Math.floor(remMin / 60);
    const minute = remMin % 60;
    return { dayIdx, hour, minute };
  };

  return shows.map((show): Announcement => {
    const slot = computePromoSlot(show.day, show.startHour, show.startMinute || 0);
    const copyText = formatUpNextPromoCopy(show);
    const encodedUrl = `${UP_NEXT_PROMO_URL_PREFIX}${encodeURIComponent(copyText)}.txt`;
    const isEnabled = Boolean(show.active && !show.isDeleted && show.includeInUpNext !== false);

    const mappedRevisions: AnnouncementRevision[] = Array.isArray(show.revisions)
      ? show.revisions.map((rev, rIdx) => {
          const revSlot = computePromoSlot(rev.day, rev.startHour, rev.startMinute || 0);
          const revCopy = formatUpNextPromoCopy(rev);
          const revUrl = `${UP_NEXT_PROMO_URL_PREFIX}${encodeURIComponent(revCopy)}.txt`;
          return {
            name: `Up Next: ${rev.name || show.name}`,
            type: AnnouncementType.ADVANCED,
            enabled: Boolean(rev.active && rev.includeInUpNext !== false),
            minute: revSlot.minute,
            days: [revSlot.dayIdx],
            hours: [revSlot.hour],
            gridRules: [`${revSlot.dayIdx}-${revSlot.hour}`],
            startDate: '',
            endDate: '',
            timeGatedMp3s: [
              {
                id: `up-next-mp3-${show.id}-rev-${rIdx}`,
                startDate: '1970-01-01T00:00',
                mediaItems: [
                  {
                    mp3Url: revUrl,
                    assetType: 'script',
                    approximateReadTime: '00:20',
                  },
                ],
              },
            ],
            validFrom: rev.validFrom || '1970-01-01T00:00:00.000Z',
            validTo: rev.validTo,
          };
        })
      : [];

    return {
      id: `up-next-promo-${show.id}`,
      name: `Up Next: ${show.name}`,
      type: AnnouncementType.ADVANCED,
      enabled: isEnabled,
      minute: slot.minute,
      days: [slot.dayIdx],
      hours: [slot.hour],
      gridRules: [`${slot.dayIdx}-${slot.hour}`],
      startDate: '',
      endDate: '',
      timeGatedMp3s: [
        {
          id: `up-next-mp3-${show.id}`,
          startDate: '1970-01-01T00:00',
          mediaItems: [
            {
              mp3Url: encodedUrl,
              assetType: 'script',
              approximateReadTime: '00:20',
            },
          ],
        },
      ],
      metadata: {
        createdBy: 'Auto-Seeded Show Promo',
        createdDate: show.validFrom || '1970-01-01T00:00:00.000Z',
        lastModifiedBy: 'Auto-Seeded Show Promo',
        lastModifiedDate: show.validFrom || '1970-01-01T00:00:00.000Z',
      },
      validFrom: show.validFrom || '1970-01-01T00:00:00.000Z',
      validTo: show.validTo !== undefined ? show.validTo : null,
      isDeleted: Boolean(show.isDeleted),
      revisions: mappedRevisions,
      isUpNextPromo: true,
      upNextShowId: show.id,
    };
  });
}

// ============================================================================
// 5. FILE SCHEDULE USAGE METRICS
// ============================================================================

export interface FileScheduleUsageEntry {
  announcementId: string;
  announcementName: string;
  minute: number;
  role: 'Primary' | 'Backup Audio';
  status: 'Current' | 'Ended' | 'Inactive';
  startDateFormatted: string;
  endDateFormatted: string;
  lastScheduledMs: number;
  lastScheduledDateLabel: string;
}

export interface FileScheduleUsageSummary {
  fileName: string;
  isUsed: boolean;
  isCurrent: boolean;
  lastUsedLabel: string; // 'Never' | 'Current' | 'M/D/YYYY'
  sortRankMs: number;
  entries: FileScheduleUsageEntry[];
}

export function formatShortDateMDY(raw?: string | number | Date): string {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string') {
    const clean = raw.trim();
    const ymdMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10);
      const d = parseInt(ymdMatch[3], 10);
      return `${m}/${d}/${y}`;
    }
  }
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
}

function formatDateTime12Summary(raw?: string): string {
  if (!raw || !raw.trim()) return '';
  const clean = raw.trim();
  const datePart = formatShortDateMDY(clean);
  if (!clean.includes('T')) return datePart || clean;
  const timePart = clean.split('T')[1]?.slice(0, 5) || '';
  if (!timePart || timePart === '00:00' || timePart === '23:59') {
    return datePart;
  }
  return `${datePart} ${formatTime12(timePart)}`;
}

function parseIsoOrLocalDateToMs(raw?: string): number {
  if (!raw || !raw.trim()) return 0;
  const clean = raw.trim();
  const ymdMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const hh = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 23;
    const mm = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 59;
    return new Date(y, m, d, hh, mm).getTime();
  }
  const parsed = new Date(clean).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export function computeFileScheduleUsageMap(
  announcements: Announcement[] = [],
  currentEditingAnnouncement?: Partial<Announcement> | null
): Map<string, FileScheduleUsageSummary> {
  const map = new Map<string, FileScheduleUsageSummary>();
  const nowIso = getCurrentDatetimeLocal();
  const todayDateStr = nowIso.split('T')[0];

  const combinedAnnouncements: Announcement[] = [...announcements];
  if (currentEditingAnnouncement && currentEditingAnnouncement.id) {
    const existingIdx = combinedAnnouncements.findIndex(
      a => a.id === currentEditingAnnouncement.id
    );
    const merged: Announcement = {
      id: currentEditingAnnouncement.id,
      name: currentEditingAnnouncement.name || 'Current Unsaved Announcement',
      type: currentEditingAnnouncement.type || AnnouncementType.ADVANCED,
      minute: currentEditingAnnouncement.minute ?? 0,
      enabled: currentEditingAnnouncement.enabled ?? true,
      startDate: currentEditingAnnouncement.startDate,
      endDate: currentEditingAnnouncement.endDate,
      date: currentEditingAnnouncement.date,
      time: currentEditingAnnouncement.time,
      gridRules: currentEditingAnnouncement.gridRules,
      timeGatedMp3s: currentEditingAnnouncement.timeGatedMp3s || [],
      metadata: currentEditingAnnouncement.metadata,
    };
    if (existingIdx >= 0) {
      combinedAnnouncements[existingIdx] = merged;
    } else {
      combinedAnnouncements.push(merged);
    }
  }

  const recordUsage = (rawFileRef: string | undefined, entry: FileScheduleUsageEntry) => {
    if (!rawFileRef || !rawFileRef.trim()) return;
    const cleanName = getFilenameFromUrlOrPath(rawFileRef).trim();
    if (!cleanName) return;
    const key = cleanName.toLowerCase();

    let summary = map.get(key);
    if (!summary) {
      summary = {
        fileName: cleanName,
        isUsed: true,
        isCurrent: false,
        lastUsedLabel: 'Never',
        sortRankMs: 0,
        entries: [],
      };
      map.set(key, summary);
    }

    const dup = summary.entries.some(
      e =>
        e.announcementId === entry.announcementId &&
        e.role === entry.role &&
        e.startDateFormatted === entry.startDateFormatted &&
        e.endDateFormatted === entry.endDateFormatted
    );
    if (!dup) {
      summary.entries.push(entry);
    }
  };

  for (const ann of combinedAnnouncements) {
    if (!ann || ann.isDeleted) continue;

    const isAnnEnabled = ann.enabled !== false;
    let isAnnFutureOrCurrent = false;
    if (ann.type === AnnouncementType.ONE_TIME) {
      const oneTimeIso = ann.date
        ? `${ann.date}T${String(ann.time || '23').padStart(2, '0')}:${String(ann.minute || 0).padStart(2, '0')}`
        : '';
      isAnnFutureOrCurrent =
        isAnnEnabled &&
        Boolean(ann.date && (ann.time ? oneTimeIso >= nowIso : ann.date >= todayDateStr));
    } else {
      const annEndLocal = ann.endDate ? formatToDatetimeLocal(ann.endDate) : '';
      isAnnFutureOrCurrent = isAnnEnabled && (!annEndLocal || annEndLocal >= nowIso);
    }

    const legacyMp3Url = (ann as { mp3Url?: string }).mp3Url;
    const legacyBackupMp3Url = (ann as { backupMp3Url?: string }).backupMp3Url;
    const slots =
      ann.timeGatedMp3s && ann.timeGatedMp3s.length > 0
        ? ann.timeGatedMp3s
        : legacyMp3Url || legacyBackupMp3Url
          ? [
              {
                id: `fallback-${ann.id}`,
                mp3Url: legacyMp3Url || '',
                backupMp3Url: legacyBackupMp3Url,
                startDate: ann.startDate || ann.date || '',
                endDate: ann.endDate,
              },
            ]
          : [];

    const annEndLocal = ann.endDate ? formatToDatetimeLocal(ann.endDate) : '';

    for (const slot of slots) {
      const slotStartLocal = slot.startDate
        ? formatToDatetimeLocal(slot.startDate)
        : ann.startDate
          ? formatToDatetimeLocal(ann.startDate)
          : '';
      const slotEndLocal = slot.endDate ? formatToDatetimeLocal(slot.endDate) : '';

      let effectiveEndIso = '';
      if (ann.type === AnnouncementType.ONE_TIME) {
        effectiveEndIso = ann.date
          ? `${ann.date}T${String(ann.time || '23').padStart(2, '0')}:${String(ann.minute || 0).padStart(2, '0')}`
          : slotEndLocal || slotStartLocal;
      } else if (slotEndLocal && annEndLocal) {
        effectiveEndIso = slotEndLocal < annEndLocal ? slotEndLocal : annEndLocal;
      } else {
        effectiveEndIso = slotEndLocal || annEndLocal;
      }

      const isSlotWithinAnnBounds =
        !annEndLocal || !slotStartLocal || slotStartLocal <= annEndLocal;
      const isSlotCurrent =
        isAnnFutureOrCurrent &&
        isSlotWithinAnnBounds &&
        (!effectiveEndIso || effectiveEndIso >= nowIso);

      const status: 'Current' | 'Ended' | 'Inactive' = isSlotCurrent
        ? 'Current'
        : !isAnnEnabled
          ? 'Inactive'
          : 'Ended';

      const refDateRaw =
        effectiveEndIso ||
        slotStartLocal ||
        ann.date ||
        ann.startDate ||
        ann.metadata?.lastModifiedDate ||
        ann.metadata?.createdDate ||
        '';

      const refDateMs = isSlotCurrent
        ? Number.MAX_SAFE_INTEGER
        : Math.max(1, parseIsoOrLocalDateToMs(refDateRaw));

      const refDateLabel = isSlotCurrent
        ? 'Current'
        : formatShortDateMDY(refDateRaw) || 'Past';

      const startFormatted =
        ann.type === AnnouncementType.ONE_TIME
          ? formatShortDateMDY(ann.date) || 'One-Time'
          : formatDateTime12Summary(slotStartLocal) || 'Immediate';

      const endFormatted =
        ann.type === AnnouncementType.ONE_TIME
          ? `${formatShortDateMDY(ann.date)}${
              ann.time !== undefined && ann.time !== ''
                ? ' ' + formatTime12(`${ann.time}:${String(ann.minute || 0).padStart(2, '0')}`)
                : ''
            }`.trim() || 'One-Time'
          : formatDateTime12Summary(effectiveEndIso) || 'Ongoing';

      const slotMediaItems =
        Array.isArray(slot.mediaItems) && slot.mediaItems.length > 0
          ? slot.mediaItems
          : [slot];

      for (const mItem of slotMediaItems) {
        if (mItem.mp3Url) {
          recordUsage(mItem.mp3Url, {
            announcementId: ann.id,
            announcementName: ann.name || `Announcement #${ann.id}`,
            minute: ann.minute || 0,
            role: 'Primary',
            status,
            startDateFormatted: startFormatted,
            endDateFormatted: endFormatted,
            lastScheduledMs: refDateMs,
            lastScheduledDateLabel: refDateLabel,
          });
        }

        if (mItem.backupMp3Url) {
          recordUsage(mItem.backupMp3Url, {
            announcementId: ann.id,
            announcementName: ann.name || `Announcement #${ann.id}`,
            minute: ann.minute || 0,
            role: 'Backup Audio',
            status,
            startDateFormatted: startFormatted,
            endDateFormatted: endFormatted,
            lastScheduledMs: refDateMs,
            lastScheduledDateLabel: refDateLabel,
          });
        }
      }
    }
  }

  for (const summary of map.values()) {
    summary.entries.sort((a, b) => {
      if (a.status === 'Current' && b.status !== 'Current') return -1;
      if (b.status === 'Current' && a.status !== 'Current') return 1;
      return b.lastScheduledMs - a.lastScheduledMs;
    });
    const hasCurrent = summary.entries.some(e => e.status === 'Current');
    summary.isCurrent = hasCurrent;
    if (hasCurrent) {
      summary.lastUsedLabel = 'Current';
      summary.sortRankMs = Number.MAX_SAFE_INTEGER;
    } else if (summary.entries.length > 0) {
      const top = summary.entries[0];
      summary.lastUsedLabel = top.lastScheduledDateLabel || 'Past';
      summary.sortRankMs = top.lastScheduledMs;
    } else {
      summary.lastUsedLabel = 'Never';
      summary.sortRankMs = 0;
    }
  }

  return map;
}
