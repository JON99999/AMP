/**
 * AMP Data Schema & Version Compatibility Governance Engine
 */

export const CURRENT_SCHEMA_VERSION = 1;
export const CURRENT_MIN_APP_VERSION = "0.16.0";
export const CURRENT_APP_VERSION = "0.19.4";

export const DEFAULT_STATION_TIMEZONE = 'America/Chicago';

export interface StationTimezoneOption {
  value: string;
  offsetLabel: string;
  label: string;
}

export const STATION_TIMEZONE_OPTIONS: StationTimezoneOption[] = [
  { value: 'Etc/GMT+12', offsetLabel: 'UTC-12', label: 'UTC-12 — Baker Island Time' },
  { value: 'Pacific/Pago_Pago', offsetLabel: 'UTC-11', label: 'UTC-11 — Samoa Time (Pago Pago)' },
  { value: 'Pacific/Honolulu', offsetLabel: 'UTC-10', label: 'UTC-10 — Hawaii Time (Honolulu)' },
  { value: 'America/Anchorage', offsetLabel: 'UTC-9', label: 'UTC-9 — Alaska Time (Anchorage)' },
  { value: 'America/Los_Angeles', offsetLabel: 'UTC-8', label: 'UTC-8 — Pacific Time (Los Angeles)' },
  { value: 'America/Denver', offsetLabel: 'UTC-7', label: 'UTC-7 — Mountain Time (Denver)' },
  { value: 'America/Chicago', offsetLabel: 'UTC-6', label: 'UTC-6 — Central Time (Chicago)' },
  { value: 'America/New_York', offsetLabel: 'UTC-5', label: 'UTC-5 — Eastern Time (New York)' },
  { value: 'America/Halifax', offsetLabel: 'UTC-4', label: 'UTC-4 — Atlantic Time (Halifax)' },
  { value: 'America/Argentina/Buenos_Aires', offsetLabel: 'UTC-3', label: 'UTC-3 — South America East (Buenos Aires)' },
  { value: 'America/Noronha', offsetLabel: 'UTC-2', label: 'UTC-2 — Mid-Atlantic Time' },
  { value: 'Atlantic/Azores', offsetLabel: 'UTC-1', label: 'UTC-1 — Azores Time' },
  { value: 'UTC', offsetLabel: 'UTC+0', label: 'UTC+0 — Coordinated Universal Time (UTC / London)' },
  { value: 'Europe/London', offsetLabel: 'UTC+0/BST', label: 'UTC+0 — UK / British Time (London)' },
  { value: 'Europe/Paris', offsetLabel: 'UTC+1', label: 'UTC+1 — Central European Time (Paris / Berlin)' },
  { value: 'Europe/Athens', offsetLabel: 'UTC+2', label: 'UTC+2 — Eastern European Time (Athens / Cairo)' },
  { value: 'Europe/Istanbul', offsetLabel: 'UTC+3', label: 'UTC+3 — East Africa / Arabia Time (Nairobi / Riyadh)' },
  { value: 'Asia/Dubai', offsetLabel: 'UTC+4', label: 'UTC+4 — Gulf Time (Dubai)' },
  { value: 'Asia/Karachi', offsetLabel: 'UTC+5', label: 'UTC+5 — West Asia Time (Karachi)' },
  { value: 'Asia/Dhaka', offsetLabel: 'UTC+6', label: 'UTC+6 — Central Asia Time (Dhaka)' },
  { value: 'Asia/Bangkok', offsetLabel: 'UTC+7', label: 'UTC+7 — Indochina Time (Bangkok)' },
  { value: 'Asia/Singapore', offsetLabel: 'UTC+8', label: 'UTC+8 — Singapore / AWST (Singapore / Perth)' },
  { value: 'Asia/Tokyo', offsetLabel: 'UTC+9', label: 'UTC+9 — Japan / Korea Time (Tokyo / Seoul)' },
  { value: 'Australia/Sydney', offsetLabel: 'UTC+10', label: 'UTC+10 — Australian Eastern Time (Sydney)' },
  { value: 'Pacific/Guadalcanal', offsetLabel: 'UTC+11', label: 'UTC+11 — Solomon Islands Time' },
  { value: 'Pacific/Auckland', offsetLabel: 'UTC+12', label: 'UTC+12 — New Zealand Time (Auckland)' }
];

export function detectSystemStationTimezone(): string {
  try {
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (sysTz && typeof sysTz === 'string' && sysTz.trim()) {
      const cleanTz = sysTz.trim();
      if (cleanTz === 'UTC' || cleanTz === 'Etc/UTC' || cleanTz === 'Etc/GMT' || cleanTz === 'GMT') {
        return DEFAULT_STATION_TIMEZONE;
      }
      const exact = STATION_TIMEZONE_OPTIONS.find(o => o.value.toLowerCase() === cleanTz.toLowerCase());
      if (exact) return exact.value;
      Intl.DateTimeFormat('en-US', { timeZone: cleanTz });
      return cleanTz;
    }
  } catch (_) {}
  return DEFAULT_STATION_TIMEZONE;
}

export function getStationTimezoneOption(tz: string = getStationTimezone()): StationTimezoneOption {
  const exact = STATION_TIMEZONE_OPTIONS.find(o => o.value.toLowerCase() === (tz || '').toLowerCase());
  if (exact) return exact;
  return {
    value: tz || DEFAULT_STATION_TIMEZONE,
    offsetLabel: tz || DEFAULT_STATION_TIMEZONE,
    label: `${tz || DEFAULT_STATION_TIMEZONE}`
  };
}

let _activeStationTimezone: string = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('amp_station_timezone');
      if (saved && saved.trim()) return saved.trim();
    }
  } catch (_) {}
  return detectSystemStationTimezone();
})();

export function getStationTimezone(): string {
  return _activeStationTimezone || detectSystemStationTimezone();
}

export function setStationTimezone(tz?: string | null): string {
  const candidate = (tz || '').trim() || detectSystemStationTimezone();
  try {
    // Verify valid IANA timezone
    Intl.DateTimeFormat('en-US', { timeZone: candidate });
    _activeStationTimezone = candidate;
  } catch (_) {
    _activeStationTimezone = DEFAULT_STATION_TIMEZONE;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('amp_station_timezone', _activeStationTimezone);
    }
  } catch (_) {}
  return _activeStationTimezone;
}

let _activeAdminContactInfo: string = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('amp_admin_contact_info');
      if (saved !== null) return saved;
    }
  } catch (_) {}
  return '';
})();

export function getAdminContactInfo(): string {
  return _activeAdminContactInfo;
}

export function setAdminContactInfo(contact?: string | null): string {
  if (contact !== undefined && contact !== null) {
    _activeAdminContactInfo = String(contact).trim();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('amp_admin_contact_info', _activeAdminContactInfo);
      }
    } catch (_) {}
  }
  return _activeAdminContactInfo;
}

export interface UpNextPromoSettings {
  enabled: boolean;
  minutesBefore: number;
}

export const DEFAULT_UP_NEXT_PROMO_CONFIG: UpNextPromoSettings = {
  enabled: true,
  minutesBefore: 20
};

let _activeUpNextPromoConfig: UpNextPromoSettings = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('amp_up_next_promo_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
            minutesBefore:
              typeof parsed.minutesBefore === 'number' && !isNaN(parsed.minutesBefore)
                ? Math.max(1, Math.min(120, Math.round(parsed.minutesBefore)))
                : 20
          };
        }
      }
    }
  } catch (_) {}
  return { ...DEFAULT_UP_NEXT_PROMO_CONFIG };
})();

export function getUpNextPromoConfig(): UpNextPromoSettings {
  return { ..._activeUpNextPromoConfig };
}

export function setUpNextPromoConfig(cfg?: Partial<UpNextPromoSettings> | null): UpNextPromoSettings {
  if (cfg && typeof cfg === 'object') {
    _activeUpNextPromoConfig = {
      enabled: typeof cfg.enabled === 'boolean' ? cfg.enabled : _activeUpNextPromoConfig.enabled,
      minutesBefore:
        typeof cfg.minutesBefore === 'number' && !isNaN(cfg.minutesBefore)
          ? Math.max(1, Math.min(120, Math.round(cfg.minutesBefore)))
          : _activeUpNextPromoConfig.minutesBefore
    };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('amp_up_next_promo_config', JSON.stringify(_activeUpNextPromoConfig));
      }
    } catch (_) {}
  }
  return { ..._activeUpNextPromoConfig };
}

export const DEFAULT_SCHEDULE_WINDOW_CONFIG: ScheduleWindowConfig = {
  windowBeforeMinutes: 5,
  windowAfterMinutes: 5,
  showLookaroundHours: 1
};

let _activeScheduleWindowConfig: ScheduleWindowConfig = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('amp_schedule_window_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            windowBeforeMinutes:
              typeof parsed.windowBeforeMinutes === 'number' && !isNaN(parsed.windowBeforeMinutes)
                ? Math.max(1, Math.min(60, Math.round(parsed.windowBeforeMinutes)))
                : 5,
            windowAfterMinutes:
              typeof parsed.windowAfterMinutes === 'number' && !isNaN(parsed.windowAfterMinutes)
                ? Math.max(1, Math.min(60, Math.round(parsed.windowAfterMinutes)))
                : 5,
            showLookaroundHours:
              typeof parsed.showLookaroundHours === 'number' && !isNaN(parsed.showLookaroundHours)
                ? Math.max(0, Math.min(6, Math.round(parsed.showLookaroundHours)))
                : 1
          };
        }
      }
    }
  } catch (_) {}
  return { ...DEFAULT_SCHEDULE_WINDOW_CONFIG };
})();

export function getScheduleWindowConfig(): ScheduleWindowConfig {
  return { ..._activeScheduleWindowConfig };
}

export function setScheduleWindowConfig(cfg?: Partial<ScheduleWindowConfig> | null): ScheduleWindowConfig {
  if (cfg && typeof cfg === 'object') {
    _activeScheduleWindowConfig = {
      windowBeforeMinutes:
        typeof cfg.windowBeforeMinutes === 'number' && !isNaN(cfg.windowBeforeMinutes)
          ? Math.max(1, Math.min(60, Math.round(cfg.windowBeforeMinutes)))
          : _activeScheduleWindowConfig.windowBeforeMinutes,
      windowAfterMinutes:
        typeof cfg.windowAfterMinutes === 'number' && !isNaN(cfg.windowAfterMinutes)
          ? Math.max(1, Math.min(60, Math.round(cfg.windowAfterMinutes)))
          : _activeScheduleWindowConfig.windowAfterMinutes,
      showLookaroundHours:
        typeof cfg.showLookaroundHours === 'number' && !isNaN(cfg.showLookaroundHours)
          ? Math.max(0, Math.min(6, Math.round(cfg.showLookaroundHours)))
          : _activeScheduleWindowConfig.showLookaroundHours
    };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('amp_schedule_window_config', JSON.stringify(_activeScheduleWindowConfig));
      }
    } catch (_) {}
  }
  return { ..._activeScheduleWindowConfig };
}

const _dtfCache = new Map<string, Intl.DateTimeFormat>();
function getStationFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = _dtfCache.get(tz);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    } catch (_) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: DEFAULT_STATION_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      });
    }
    _dtfCache.set(tz, fmt);
  }
  return fmt;
}

export interface StationDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateStr: string;
  dayOfWeek: number;
}

const _partsCache = new Map<string, StationDateParts | null>();

/**
 * Converts a Date or UTC ISO string into exact wall-clock components in the station's timezone.
 * Memoizes string inputs for O(1) lookup across large calendar/audit log scans.
 */
export function toStationDateParts(
  input: Date | string | number,
  tz: string = getStationTimezone()
): StationDateParts | null {
  const cacheKey = typeof input === 'string' ? `${tz}|${input}` : null;
  if (cacheKey !== null && _partsCache.has(cacheKey)) {
    return _partsCache.get(cacheKey)!;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) {
    if (cacheKey !== null) _partsCache.set(cacheKey, null);
    return null;
  }
  const parts = getStationFormatter(tz).formatToParts(d);
  let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0;
  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    else if (p.type === 'month') month = parseInt(p.value, 10);
    else if (p.type === 'day') day = parseInt(p.value, 10);
    else if (p.type === 'hour') hour = parseInt(p.value, 10) % 24;
    else if (p.type === 'minute') minute = parseInt(p.value, 10);
    else if (p.type === 'second') second = parseInt(p.value, 10);
  }
  const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  const result: StationDateParts = { year, month, day, hour, minute, second, dateStr, dayOfWeek };
  if (cacheKey !== null) {
    if (_partsCache.size > 15000) _partsCache.clear();
    _partsCache.set(cacheKey, result);
  }
  return result;
}

/**
 * Determines whether a log entry was recorded in Prerecord or Export mode rather than Live/Playlist.
 * Never misclassifies a Live play as Prerecord merely because executedAt is a few seconds after scheduledFor.
 */
export function isLogPrerecordOrExport(
  log?: {
    playMode?: string;
  } | null
): boolean {
  if (!log) return false;
  return log.playMode === 'Prerecord' || log.playMode === 'Export';
}

/**
 * Returns a Date object whose local getters (.getFullYear(), .getHours(), etc.)
 * match the current wall-clock time in the station's timezone.
 */
export function getStationNow(
  referenceInstant: Date = new Date(),
  tz: string = getStationTimezone()
): Date {
  const parts = toStationDateParts(referenceInstant, tz);
  if (!parts) return new Date(referenceInstant);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    referenceInstant.getMilliseconds()
  );
}

/**
 * Converts a station wall-clock date/time string ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm")
 * into its true UTC ISO string ("...Z") on that target date, accounting for DST on that date.
 */
export function stationLocalToUtcIso(
  localStr: string,
  tz: string = getStationTimezone(),
  endOfDayIfDateOnly = false
): string {
  if (!localStr || typeof localStr !== 'string') return '';
  const trimmed = localStr.trim();
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) {
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? '' : fallback.toISOString();
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? parseInt(match[4], 10) : (endOfDayIfDateOnly ? 23 : 0);
  const minute = hasTime ? parseInt(match[5], 10) : (endOfDayIfDateOnly ? 59 : 0);
  const second = match[6] !== undefined ? parseInt(match[6], 10) : (endOfDayIfDateOnly && !hasTime ? 59 : 0);

  // Two-pass offset convergence for exact DST handling on target date
  const targetAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let guessMs = targetAsUtcMs;
  for (let i = 0; i < 2; i++) {
    const p = toStationDateParts(new Date(guessMs), tz);
    if (!p) break;
    const observedAsUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diffMs = targetAsUtcMs - observedAsUtcMs;
    guessMs += diffMs;
    if (diffMs === 0) break;
  }
  return new Date(guessMs).toISOString();
}

/**
 * Converts a Date object whose local getters (.getFullYear(), .getHours(), etc.)
 * represent a station wall-clock slot into its true UTC ISO string ("...Z") on that target date.
 */
export function stationSlotDateToUtcIso(
  slotDate: Date,
  tz: string = getStationTimezone()
): string {
  if (!(slotDate instanceof Date) || isNaN(slotDate.getTime())) return '';
  const y = slotDate.getFullYear();
  const m = String(slotDate.getMonth() + 1).padStart(2, '0');
  const d = String(slotDate.getDate()).padStart(2, '0');
  const hh = String(slotDate.getHours()).padStart(2, '0');
  const mm = String(slotDate.getMinutes()).padStart(2, '0');
  const ss = String(slotDate.getSeconds()).padStart(2, '0');
  return stationLocalToUtcIso(`${y}-${m}-${d}T${hh}:${mm}:${ss}`, tz);
}

/**
 * Checks whether a log entry matches a station wall-clock slot Date (down to year/month/day/hour/minute)
 * in the station's timezone, regardless of the host computer's local timezone or when a prerecord was logged.
 */
export function isLogForStationSlot(
  log: { timestamp?: string; announcementTime?: string; scheduledFor?: string | null },
  slot: Date,
  tz: string = getStationTimezone()
): boolean {
  if (!log || !(slot instanceof Date) || isNaN(slot.getTime())) return false;
  const slotIso = stationSlotDateToUtcIso(slot, tz);
  if (
    (slotIso && (log.announcementTime === slotIso || log.scheduledFor === slotIso || log.timestamp === slotIso)) ||
    log.announcementTime === slot.toISOString()
  ) {
    return true;
  }
  const slotY = slot.getFullYear();
  const slotM = slot.getMonth() + 1;
  const slotD = slot.getDate();
  const slotH = slot.getHours();
  const slotMin = slot.getMinutes();
  const candidates = [log.scheduledFor, log.announcementTime, log.timestamp].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );
  for (const c of candidates) {
    const parts = toStationDateParts(c, tz);
    if (
      parts &&
      parts.year === slotY &&
      parts.month === slotM &&
      parts.day === slotD &&
      parts.hour === slotH &&
      parts.minute === slotMin
    ) {
      return true;
    }
  }
  return false;
}

export interface ScheduleWindowConfig {
  windowBeforeMinutes: number; // -x: default 5 minutes
  windowAfterMinutes: number;  // +y: default 5 minutes
  showLookaroundHours: number; // default 1 hour
}

export interface DataMetaHeader {
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
  stationTimezone?: string;
  adminContactInfo?: string;
  upNextPromo?: UpNextPromoSettings;
  scheduleWindow?: ScheduleWindowConfig;
}

export interface DataEnvelope<T> {
  _meta?: DataMetaHeader;
  stationTimezone?: string;
  adminContactInfo?: string;
  upNextPromo?: UpNextPromoSettings;
  scheduleWindow?: ScheduleWindowConfig;
  AnnouncementsBackupCounter?: number;
  ShowsBackupCounter?: number;
  LogsBackupCounter?: number;
  data: T;
}

export type CompatibilityStatus = 'COMPATIBLE' | 'OLDER_VERSION_DETECTED' | 'NEWER_VERSION_DETECTED';

export interface CompatibilityReport {
  status: CompatibilityStatus;
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  reason?: string;
}

/**
 * Clean comparison of SemVer versions (e.g., "0.16.3" vs "0.16.0")
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

/**
 * Creates a standard metadata envelope header for saved JSON stores
 */
export function createDataMetaHeader(customWindow?: ScheduleWindowConfig, stationTimezone?: string): DataMetaHeader {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    minAppVersion: CURRENT_MIN_APP_VERSION,
    lastModifiedBy: CURRENT_APP_VERSION,
    lastModifiedAt: new Date().toISOString(),
    ...(stationTimezone ? { stationTimezone } : {}),
    scheduleWindow: {
      windowBeforeMinutes: customWindow?.windowBeforeMinutes ?? 5,
      windowAfterMinutes: customWindow?.windowAfterMinutes ?? 5,
      showLookaroundHours: customWindow?.showLookaroundHours ?? 1
    }
  };
}

/**
 * Resolves validFrom so legacy items and previously backfilled '2026-08-01' items with no revisions
 * use epoch ('1970-01-01T00:00:00.000Z') and remain visible across all historical dates.
 */
function resolveSeededValidFrom(validFrom?: string, revisions?: any[]): string {
  const hasRevisions = Array.isArray(revisions) && revisions.length > 0;
  if (!validFrom || (validFrom === '2026-08-01T00:00:00.000Z' && !hasRevisions)) {
    return '1970-01-01T00:00:00.000Z';
  }
  return validFrom;
}

const _backfillCache = new WeakMap<object, Map<string, any>>();

/**
 * Automatically synthesizes historical revisions for legacy 0.15.4 announcements when:
 * 1) An announcement has enabled=false, empty revisions=[], and a past endDate (e.g. ended 0.15.4 campaign), OR
 * 2) Logs show the announcement was previously scheduled at a different minute prior to an in-place 0.15.4 edit.
 */
export function backfillLegacyAnnouncementRevisions(
  cleanItem: any,
  rawLogs?: any[],
  tz: string = getStationTimezone()
): any {
  if (!cleanItem || typeof cleanItem !== 'object') return cleanItem;
  const existingRevs = Array.isArray(cleanItem.revisions) ? [...cleanItem.revisions] : [];
  if (existingRevs.length > 0) return cleanItem;

  const logsArray = Array.isArray(rawLogs)
    ? rawLogs
    : (rawLogs && typeof rawLogs === 'object' && Array.isArray((rawLogs as any).data) ? (rawLogs as any).data : []);

  const cacheKey = `${tz}|${logsArray.length}`;
  let itemCache = _backfillCache.get(cleanItem);
  if (itemCache && itemCache.has(cacheKey)) {
    return itemCache.get(cacheKey);
  }

  let headValidFrom = resolveSeededValidFrom(cleanItem.validFrom, existingRevs);
  const synthesizedRevs: any[] = [];

  const createSnapshot = (overrides: Record<string, any>, validFrom: string, validTo: string) => ({
    name: cleanItem.name,
    type: cleanItem.type,
    enabled: cleanItem.enabled,
    minute: cleanItem.minute,
    ...(cleanItem.date ? { date: cleanItem.date } : {}),
    ...(cleanItem.time ? { time: cleanItem.time } : {}),
    days: cleanItem.days,
    hours: cleanItem.hours,
    gridRules: cleanItem.gridRules,
    startDate: cleanItem.startDate,
    endDate: cleanItem.endDate,
    timeGatedMp3s: cleanItem.timeGatedMp3s,
    ...overrides,
    validFrom,
    validTo
  });

  // Case 1: Disabled 0.15.4 campaign that has an explicit endDate (e.g. Vehicle Donation 1 & 2)
  if (cleanItem.enabled === false && cleanItem.endDate) {
    const endUtcIso = stationLocalToUtcIso(cleanItem.endDate, tz, true);
    if (endUtcIso) {
      synthesizedRevs.push(
        createSnapshot({ enabled: true }, '1970-01-01T00:00:00.000Z', endUtcIso)
      );
      headValidFrom = endUtcIso;
    }
  }

  // Case 2: In-place 0.15.4 minute change detectable from logs.json (e.g. Music & More :30 -> :40)
  if (logsArray.length > 0 && synthesizedRevs.length === 0) {
    const itemLogs = logsArray
      .filter((l: any) => l && (l.announcementId === cleanItem.id || (l.announcementName && cleanItem.name && String(l.announcementName).toLowerCase() === String(cleanItem.name).toLowerCase())))
      .map((l: any) => {
        const schedIso = l.scheduledFor || l.announcementTime || l.timestamp || '';
        const parts = toStationDateParts(schedIso, tz);
        return { schedIso, minute: parts ? parts.minute : null };
      })
      .filter((x: any) => x.schedIso && x.minute !== null)
      .sort((a: any, b: any) => a.schedIso.localeCompare(b.schedIso));

    if (itemLogs.length > 0) {
      const firstCurrentMinLog = itemLogs.find((x: any) => x.minute === cleanItem.minute);
      const priorDiffMinLogs = firstCurrentMinLog
        ? itemLogs.filter((x: any) => x.schedIso < firstCurrentMinLog.schedIso && x.minute !== cleanItem.minute)
        : itemLogs.filter((x: any) => x.minute !== cleanItem.minute);

      if (priorDiffMinLogs.length > 0) {
        const priorMinute = priorDiffMinLogs[priorDiffMinLogs.length - 1].minute!;
        const lastPriorIso = priorDiffMinLogs[priorDiffMinLogs.length - 1].schedIso;
        const transitionIso = firstCurrentMinLog ? firstCurrentMinLog.schedIso : (cleanItem.metadata?.lastModifiedDate || lastPriorIso);
        synthesizedRevs.push(
          createSnapshot({ enabled: true, minute: priorMinute }, '1970-01-01T00:00:00.000Z', transitionIso)
        );
        headValidFrom = transitionIso;
      }
    }
  }

  const finalItem = synthesizedRevs.length > 0
    ? {
        ...cleanItem,
        validFrom: headValidFrom,
        revisions: synthesizedRevs
      }
    : cleanItem;

  if (!itemCache) {
    itemCache = new Map<string, any>();
    _backfillCache.set(cleanItem, itemCache);
  }
  itemCache.set(cacheKey, finalItem);
  return finalItem;
}

export type ScriptTextResolver =
  | ((mp3Url: string, item?: any, slot?: any) => string | null | undefined)
  | Record<string, string>;

/**
 * Computes ~150 WPM (2.5 words/sec) approximate read time ("0m30s", rounded up to nearest 5s, min 5s)
 * from raw script text after stripping HTML comments and inline Markdown formatting markers.
 */
export function estimateWpmReadTimeFromText(rawText?: string | null): string {
  if (!rawText || typeof rawText !== 'string') return '';
  const withoutComments = rawText
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->\r?\n?/g, '');
  const plain = withoutComments
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/<u>([\s\S]+?)<\/u>/gi, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .trim();
  if (!plain) return '';
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const rawSeconds = Math.ceil(words.length / 2.5);
  const estimatedSeconds = Math.max(5, Math.ceil(rawSeconds / 5) * 5);
  const mins = Math.floor(estimatedSeconds / 60);
  const secs = estimatedSeconds % 60;
  return `${mins}m${String(secs).padStart(2, '0')}s`;
}

export function isMissingApproxReadTime(val: any): boolean {
  if (val === null || val === undefined) return true;
  const cleaned = String(val).replace(/^~\s*/, '').trim().toLowerCase();
  if (
    !cleaned ||
    cleaned === '—' ||
    cleaned === '-' ||
    cleaned === 'null' ||
    cleaned === 'undefined' ||
    cleaned === '0' ||
    cleaned === '0s' ||
    cleaned === '0:00' ||
    cleaned === '00:00' ||
    cleaned === '0m00s' ||
    cleaned === '0m0s'
  ) {
    return true;
  }
  return false;
}

function isReadableTextScriptTarget(mp3Url?: string | null, assetType?: string | null): boolean {
  const url = String(mp3Url || '').trim();
  if (url.startsWith('__up_next_promo__:')) return true;
  const cleanPath = url.split('?')[0].toLowerCase();
  if (cleanPath.endsWith('.txt') || cleanPath.endsWith('.md')) return true;
  if (
    cleanPath.endsWith('.pdf') ||
    cleanPath.endsWith('.png') ||
    cleanPath.endsWith('.jpg') ||
    cleanPath.endsWith('.jpeg') ||
    cleanPath.endsWith('.webp') ||
    cleanPath.endsWith('.mp3') ||
    cleanPath.endsWith('.wav') ||
    cleanPath.endsWith('.flac') ||
    cleanPath.endsWith('.ogg') ||
    cleanPath.endsWith('.m4a') ||
    cleanPath.endsWith('.aac')
  ) {
    return false;
  }
  return assetType === 'script';
}

function resolveReadableTextForScriptSlot(
  mp3Url: string,
  slot?: any,
  parentItem?: any,
  scriptTextResolver?: ScriptTextResolver
): string {
  const trimmedUrl = String(mp3Url || '').trim();
  if (trimmedUrl.startsWith('__up_next_promo__:')) {
    const rawEncoded = trimmedUrl.slice('__up_next_promo__:'.length).replace(/\.txt$/i, '');
    try {
      return decodeURIComponent(rawEncoded);
    } catch (_) {
      return rawEncoded;
    }
  }

  const inlineCandidates = [
    slot?.text,
    slot?.content,
    slot?.scriptText,
    slot?.liveReadText,
    parentItem?.text,
    parentItem?.content,
    parentItem?.scriptText,
    parentItem?.liveReadText
  ];
  for (const candidate of inlineCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  if (scriptTextResolver && trimmedUrl) {
    try {
      if (typeof scriptTextResolver === 'function') {
        const resolved = scriptTextResolver(trimmedUrl, parentItem, slot);
        if (typeof resolved === 'string' && resolved.trim().length > 0) {
          return resolved;
        }
      } else if (typeof scriptTextResolver === 'object') {
        if (typeof scriptTextResolver[trimmedUrl] === 'string' && scriptTextResolver[trimmedUrl].trim()) {
          return scriptTextResolver[trimmedUrl];
        }
        const baseName = trimmedUrl.split('?')[0].split(/[/\\]/).pop() || trimmedUrl;
        if (typeof scriptTextResolver[baseName] === 'string' && scriptTextResolver[baseName].trim()) {
          return scriptTextResolver[baseName];
        }
        const baseLower = baseName.toLowerCase();
        for (const [k, v] of Object.entries(scriptTextResolver)) {
          const kBase = k.split('?')[0].split(/[/\\]/).pop()?.toLowerCase() || k.toLowerCase();
          if (kBase === baseLower && typeof v === 'string' && v.trim()) {
            return v;
          }
        }
      }
    } catch (_) {}
  }

  return '';
}

/**
 * Deterministically normalizes and migrates a raw Announcements JSON payload into canonical Schema v1 format
 * while preserving v0.15.4/0.15.5 fields alongside v0.19.x sibling fields and backfilling WPM read-time
 * estimates (#28) onto legacy script cards where approximateReadTime is null or missing.
 */
export function migrateAnnouncementsPayload(
  rawInput: any,
  lastModifiedBy = CURRENT_APP_VERSION,
  existingCounter = 0,
  rawLogs?: any,
  scriptTextResolver?: ScriptTextResolver
): { envelope: DataEnvelope<any[]>; data: any[] } {
  let rawList: any[] = [];
  let counter = existingCounter;
  let existingWindow: ScheduleWindowConfig | undefined;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    rawList = Array.isArray(rawInput.data) ? rawInput.data : [];
    if (typeof rawInput.AnnouncementsBackupCounter === 'number') {
      counter = rawInput.AnnouncementsBackupCounter;
    }
    if (rawInput._meta?.scheduleWindow) {
      existingWindow = setScheduleWindowConfig(rawInput._meta.scheduleWindow);
    }
  } else if (Array.isArray(rawInput)) {
    rawList = rawInput;
  }

  const isoNow = new Date().toISOString();
  const tz = getStationTimezone();
  const persistedRawList = rawList.filter(
    (item: any) => item && item.isUpNextPromo !== true && !String(item.id || '').startsWith('up-next-promo-')
  );

  const normalizeMediaItemInSlot = (mItem: any, gateItem: any, parentItem: any) => {
    const rawUrl = mItem?.mp3Url ?? gateItem?.mp3Url ?? '';
    const isScriptExt = typeof rawUrl === 'string' && /\.(txt|pdf|docx?|rtf|png|jpg|jpeg|webp|md)$/i.test(rawUrl);
    const hasInlineText = Boolean(
      (typeof mItem?.text === 'string' && mItem.text.trim()) ||
      (typeof mItem?.content === 'string' && mItem.text?.trim?.()) ||
      (typeof mItem?.content === 'string' && mItem.content.trim()) ||
      (typeof mItem?.scriptText === 'string' && mItem.scriptText.trim()) ||
      (typeof mItem?.liveReadText === 'string' && mItem.liveReadText.trim()) ||
      (typeof gateItem?.text === 'string' && gateItem.text.trim()) ||
      (typeof gateItem?.content === 'string' && gateItem.content.trim()) ||
      (typeof gateItem?.scriptText === 'string' && gateItem.scriptText.trim()) ||
      (typeof gateItem?.liveReadText === 'string' && gateItem.liveReadText.trim()) ||
      (typeof parentItem?.text === 'string' && parentItem.text.trim()) ||
      (typeof parentItem?.content === 'string' && parentItem.content.trim()) ||
      (typeof parentItem?.scriptText === 'string' && parentItem.scriptText.trim()) ||
      (typeof parentItem?.liveReadText === 'string' && parentItem.liveReadText.trim())
    );
    const resolvedAssetType = mItem?.assetType || gateItem?.assetType || ((isScriptExt || hasInlineText) ? 'script' : 'audio');

    const rawApprox =
      mItem?.approximateReadTime ??
      mItem?.approxReadTime ??
      gateItem?.approximateReadTime ??
      gateItem?.approxReadTime ??
      parentItem?.approximateReadTime ??
      parentItem?.approxReadTime ??
      '';

    let finalApproxReadTime = isMissingApproxReadTime(rawApprox) ? '' : String(rawApprox).trim();

    if (
      resolvedAssetType === 'script' &&
      !finalApproxReadTime &&
      (isReadableTextScriptTarget(rawUrl, resolvedAssetType) || hasInlineText)
    ) {
      const readableText = resolveReadableTextForScriptSlot(rawUrl, mItem || gateItem, parentItem, scriptTextResolver);
      const estimated = estimateWpmReadTimeFromText(readableText);
      if (estimated) {
        finalApproxReadTime = estimated;
      }
    }

    return {
      mp3Url: rawUrl,
      assetType: resolvedAssetType,
      backupMp3Url: mItem?.backupMp3Url ?? gateItem?.backupMp3Url ?? '',
      approximateReadTime: finalApproxReadTime,
      duration: mItem?.duration ?? gateItem?.duration ?? '',
      fileSize: mItem?.fileSize ?? gateItem?.fileSize ?? ''
    };
  };

  const normalizeScriptOrAudioSlot = (tItem: any, parentItem: any, idx: number, mIdx: number) => {
    const gateId = (typeof tItem?.id === 'string' && tItem.id.trim()) ? tItem.id : `mp3-${Date.now()}-${idx}-${mIdx}`;
    const rawMediaItems = Array.isArray(tItem?.mediaItems) && tItem.mediaItems.length > 0
      ? tItem.mediaItems
      : [tItem];
    const mediaItems = rawMediaItems.map((mItem: any) =>
      normalizeMediaItemInSlot(mItem, tItem, parentItem)
    );

    return {
      id: gateId,
      startDate: tItem?.startDate || '',
      endDate: tItem?.endDate || '',
      mediaItems
    };
  };

  const migrated = persistedRawList.map((item: any, idx: number) => {
    const timeGatedMp3s = Array.isArray(item.timeGatedMp3s) ? [...item.timeGatedMp3s] : [];
    const hasTopInlineText = Boolean(
      (typeof item?.text === 'string' && item.text.trim()) ||
      (typeof item?.content === 'string' && item.content.trim()) ||
      (typeof item?.scriptText === 'string' && item.scriptText.trim()) ||
      (typeof item?.liveReadText === 'string' && item.liveReadText.trim())
    );
    if (timeGatedMp3s.length === 0 && (item.mp3Url || hasTopInlineText)) {
      const isScript =
        (typeof item.mp3Url === 'string' && /\.(txt|pdf|docx?|rtf|png|jpg|jpeg|webp|md)$/i.test(item.mp3Url)) ||
        item.assetType === 'script' ||
        hasTopInlineText;
      timeGatedMp3s.push({
        id: `mp3-${Date.now()}-${idx}`,
        mp3Url: item.mp3Url || '',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        assetType: isScript ? 'script' : 'audio',
        backupMp3Url: item.backupMp3Url || '',
        approximateReadTime: item.approximateReadTime ?? item.approxReadTime ?? '',
        duration: item.duration || '',
        fileSize: ''
      });
    }

    const normalizedTimeGated = timeGatedMp3s.map((tItem: any, mIdx: number) =>
      normalizeScriptOrAudioSlot(tItem, item, idx, mIdx)
    );

    const meta = item.metadata || {};
    const rawRevisions = Array.isArray(item.revisions) ? item.revisions : [];
    const revisions = rawRevisions.map((rev: any, rIdx: number) => {
      if (!rev || typeof rev !== 'object') return rev;
      if (!Array.isArray(rev.timeGatedMp3s)) return rev;
      return {
        ...rev,
        timeGatedMp3s: rev.timeGatedMp3s.map((rSlot: any, rmIdx: number) =>
          normalizeScriptOrAudioSlot(rSlot, rev, idx * 1000 + rIdx, rmIdx)
        )
      };
    });

    const cleanItem: any = {
      id: item.id || `ann-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: item.name || 'Untitled Announcement',
      type: item.type || 'basic-hourly',
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      minute: typeof item.minute === 'number' ? item.minute : 0,
      days: Array.isArray(item.days) ? item.days : [0, 1, 2, 3, 4, 5, 6],
      hours: Array.isArray(item.hours) ? item.hours : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      gridRules: Array.isArray(item.gridRules) ? item.gridRules : [],
      startDate: item.startDate || '',
      endDate: item.endDate || '',
      timeGatedMp3s: normalizedTimeGated,
      validFrom: resolveSeededValidFrom(item.validFrom, revisions),
      validTo: item.validTo !== undefined ? item.validTo : null,
      isDeleted: typeof item.isDeleted === 'boolean' ? item.isDeleted : false,
      revisions,
      metadata: {
        createdBy: meta.createdBy || 'Admin',
        createdDate: meta.createdDate || isoNow,
        lastModifiedBy: meta.lastModifiedBy || lastModifiedBy,
        lastModifiedDate: meta.lastModifiedDate || isoNow
      }
    };
    if (item.date) cleanItem.date = item.date;
    if (item.time) cleanItem.time = item.time;
    return backfillLegacyAnnouncementRevisions(cleanItem, rawLogs, tz);
  });

  counter += 1;
  const envelope: DataEnvelope<any[]> = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: lastModifiedBy,
      lastModifiedAt: isoNow,
      ...(existingWindow ? { scheduleWindow: existingWindow } : {})
    },
    AnnouncementsBackupCounter: counter,
    data: migrated
  };

  return { envelope, data: migrated };
}

/**
 * Deterministically normalizes and migrates a raw Shows JSON payload into canonical Schema v1 format
 * while preserving v0.15.4/0.15.5 fields alongside v0.19.0 sibling fields.
 */
export function migrateShowsPayload(
  rawInput: any,
  lastModifiedBy = CURRENT_APP_VERSION,
  existingCounter = 0,
  explicitStationTimezone?: string,
  explicitAdminContactInfo?: string,
  explicitUpNextPromo?: Partial<UpNextPromoSettings>,
  explicitScheduleWindow?: Partial<ScheduleWindowConfig>
): { envelope: DataEnvelope<any[]>; data: any[] } {
  let rawList: any[] = [];
  let counter = existingCounter;
  let resolvedScheduleWindow: Partial<ScheduleWindowConfig> | undefined = explicitScheduleWindow;
  let resolvedTimezone: string | undefined = explicitStationTimezone;
  let resolvedAdminContact: string | undefined = explicitAdminContactInfo;
  let resolvedUpNextPromo: Partial<UpNextPromoSettings> | undefined = explicitUpNextPromo;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    rawList = Array.isArray(rawInput.data) ? rawInput.data : [];
    if (typeof rawInput.ShowsBackupCounter === 'number') {
      counter = rawInput.ShowsBackupCounter;
    }
    if (!resolvedScheduleWindow) {
      resolvedScheduleWindow = rawInput.scheduleWindow || rawInput._meta?.scheduleWindow;
    }
    if (!resolvedTimezone) {
      resolvedTimezone = rawInput._meta?.stationTimezone || rawInput.stationTimezone;
    }
    if (resolvedAdminContact === undefined) {
      resolvedAdminContact =
        rawInput.adminContactInfo !== undefined
          ? rawInput.adminContactInfo
          : rawInput._meta?.adminContactInfo;
    }
    if (!resolvedUpNextPromo) {
      resolvedUpNextPromo = rawInput.upNextPromo || rawInput._meta?.upNextPromo;
    }
  } else if (Array.isArray(rawInput)) {
    rawList = rawInput;
  }

  const finalTimezone = setStationTimezone(resolvedTimezone || getStationTimezone());
  const finalAdminContact =
    resolvedAdminContact !== undefined ? setAdminContactInfo(resolvedAdminContact) : getAdminContactInfo();
  const finalUpNextPromo =
    resolvedUpNextPromo !== undefined ? setUpNextPromoConfig(resolvedUpNextPromo) : getUpNextPromoConfig();
  const finalScheduleWindow =
    resolvedScheduleWindow !== undefined ? setScheduleWindowConfig(resolvedScheduleWindow) : getScheduleWindowConfig();

  const isoNow = new Date().toISOString();
  const migrated = rawList.map((item: any, idx: number) => {
    const rawName = item.name || `Show ${idx + 1}`;
    const cleanShort = item.nameShort || rawName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16) || `Show_${idx + 1}`;
    const rawRevisions = Array.isArray(item.revisions) ? item.revisions : [];
    const revisions = rawRevisions.map((rev: any) => ({
      ...rev,
      includeInUpNext: typeof rev?.includeInUpNext === 'boolean' ? rev.includeInUpNext : true
    }));
    return {
      id: item.id || `show-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      name: rawName,
      nameShort: cleanShort,
      day: item.day || 'Monday',
      startHour: typeof item.startHour === 'number' ? item.startHour : 9,
      startMinute: typeof item.startMinute === 'number' ? item.startMinute : 0,
      durationHours: typeof item.durationHours === 'number' ? item.durationHours : 1,
      durationMinutes: typeof item.durationMinutes === 'number' ? item.durationMinutes : 0,
      host: item.host || '',
      description: item.description || '',
      active: typeof item.active === 'boolean' ? item.active : true,
      includeInUpNext: typeof item.includeInUpNext === 'boolean' ? item.includeInUpNext : true,
      validFrom: resolveSeededValidFrom(item.validFrom, revisions),
      validTo: item.validTo !== undefined ? item.validTo : null,
      isDeleted: typeof item.isDeleted === 'boolean' ? item.isDeleted : false,
      revisions
    };
  });

  counter += 1;
  const envelope: DataEnvelope<any[]> = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: lastModifiedBy,
      lastModifiedAt: isoNow,
      stationTimezone: finalTimezone,
      ...(finalAdminContact ? { adminContactInfo: finalAdminContact } : {}),
      upNextPromo: finalUpNextPromo,
      scheduleWindow: finalScheduleWindow
    },
    stationTimezone: finalTimezone,
    ...(finalAdminContact ? { adminContactInfo: finalAdminContact } : {}),
    upNextPromo: finalUpNextPromo,
    scheduleWindow: finalScheduleWindow,
    ShowsBackupCounter: counter,
    data: migrated
  };

  return { envelope, data: migrated };
}

/**
 * Dual-Value Sibling Data Bridge for LogEntry:
 * Ensures both v0.15.4/0.15.5 fields (timestamp, announcementTime, logTimeStamp)
 * and v0.18.x/0.19.0 sibling fields (scheduledFor, executedAt) are populated.
 */
export function seedLogEntrySiblings(entry: any): any {
  if (!entry || typeof entry !== 'object') return entry;
  const fallbackNow = new Date().toISOString();
  const executedIso = entry.executedAt || entry.logTimeStamp || entry.timestamp || entry.announcementTime || entry.scheduledFor || fallbackNow;
  const scheduledIso = entry.announcementTime || entry.scheduledFor || entry.timestamp || executedIso;
  const timestampIso = entry.timestamp || scheduledIso;
  const fn = String(entry.mp3Name || '').toLowerCase();
  const derivedAssetType = entry.assetType || ((fn.endsWith('.txt') || fn.endsWith('.pdf') || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.webp') || fn.endsWith('.md')) ? 'script' : 'audio');

  return {
    ...entry,
    timestamp: timestampIso,
    announcementTime: entry.announcementTime || scheduledIso,
    logTimeStamp: entry.logTimeStamp || executedIso,
    scheduledFor: entry.announcementTime || entry.scheduledFor || scheduledIso,
    executedAt: entry.executedAt || executedIso,
    status: entry.status || 'played',
    assetType: derivedAssetType
  };
}

/**
 * Deterministically normalizes and migrates a raw Logs JSON payload,
 * seeding dual-value sibling fields across all entries for v0.15.4/5 <-> v0.19.0 coexistence.
 */
export function migrateLogsPayload(
  rawInput: any,
  lastModifiedBy = CURRENT_APP_VERSION,
  existingCounter = 0
): { envelope: DataEnvelope<any[]>; data: any[] } {
  let rawList: any[] = [];
  let counter = existingCounter;
  if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    rawList = Array.isArray(rawInput.data) ? rawInput.data : [];
    if (typeof rawInput.LogsBackupCounter === 'number') {
      counter = rawInput.LogsBackupCounter;
    }
  } else if (Array.isArray(rawInput)) {
    rawList = rawInput;
  }

  const isoNow = new Date().toISOString();
  const migrated = rawList.map(item => seedLogEntrySiblings(item));
  counter += 1;

  const envelope: DataEnvelope<any[]> = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: lastModifiedBy,
      lastModifiedAt: isoNow
    },
    LogsBackupCounter: counter,
    data: migrated
  };

  return { envelope, data: migrated };
}

/**
 * Evaluates compatibility of a loaded JSON payload against the current AMP executable
 */
export function assessDataCompatibility(meta?: Partial<DataMetaHeader> | null): CompatibilityReport {
  const schemaVersion = meta?.schemaVersion !== undefined ? meta.schemaVersion : 0;
  const minAppVersion = meta?.minAppVersion || "0.16.0";
  const lastModifiedBy = meta?.lastModifiedBy || "0.15.0";

  // Check 1: Forward Incompatibility (File was written by a newer version requiring newer minimum app)
  if (meta?.minAppVersion && compareSemver(meta.minAppVersion, CURRENT_APP_VERSION) > 0) {
    return {
      status: 'NEWER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data requires minimum AMP version v${minAppVersion}, but current application is v${CURRENT_APP_VERSION}.`
    };
  }

  // Check 2: Backward Incompatibility (File has legacy or older schema version)
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    return {
      status: 'OLDER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data schema (v${schemaVersion}) is older than current AMP native schema (v${CURRENT_SCHEMA_VERSION}).`
    };
  }

  return {
    status: 'COMPATIBLE',
    schemaVersion,
    minAppVersion,
    lastModifiedBy
  };
}
