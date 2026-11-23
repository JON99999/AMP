import {
  AdminMessage,
  AdminMessageAckRecord,
  AdminMessageClearMode,
  AdminMessageSeverity,
  AdminMessageStartupCondition,
  AdminMessageTargetScope,
  LogEntry,
  Show,
} from '../types';
import {
  CURRENT_APP_VERSION,
  CURRENT_MIN_APP_VERSION,
  CURRENT_SCHEMA_VERSION,
  CompatibilityReport,
  compareSemver,
  resolveHighestAppVersion,
  toStationDateParts,
  getStationTimezone,
  getAdminContactInfo,
} from './compatibility';
import { stripFormattingMarkers } from './liveReadTextUtils';
import { formatDatetime12 } from './utils';

const STARTUP_ACK_STORAGE_KEY = 'amp_acknowledged_startup_msgs_v1';

export const SYSTEM_MSG_VERSION_UPDATE_ID = 'system-version-update-notice';
export const SYSTEM_MSG_REQUIRED_UPGRADE_ID = 'system-schema-upgrade-required';

export const SYSTEM_BUILTIN_MESSAGE_IDS = new Set<string>([
  SYSTEM_MSG_VERSION_UPDATE_ID,
  SYSTEM_MSG_REQUIRED_UPGRADE_ID,
]);

export function isSystemBuiltInMessage(msgOrId?: AdminMessage | string | null): boolean {
  if (!msgOrId) return false;
  if (typeof msgOrId === 'string') return SYSTEM_BUILTIN_MESSAGE_IDS.has(msgOrId);
  return Boolean(msgOrId.isSystemBuiltIn || SYSTEM_BUILTIN_MESSAGE_IDS.has(msgOrId.id));
}

const VALID_SCOPES: AdminMessageTargetScope[] = [
  'single_show',
  'selected_shows',
  'all_shows',
  'time_window',
  'app_startup',
];

const VALID_STARTUP_CONDITIONS: AdminMessageStartupCondition[] = [
  'all_users',
  'old_version',
  'old_version_schema',
];

export function normalizeAdminMessage(raw: any, index = 0): AdminMessage {
  const nowIso = new Date().toISOString();
  const id =
    typeof raw?.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `msg-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`;
  const isSystemBuiltIn = Boolean(raw?.isSystemBuiltIn || SYSTEM_BUILTIN_MESSAGE_IDS.has(id));
  const severity: AdminMessageSeverity = raw?.severity === 'alert' ? 'alert' : 'info';
  const targetScope: AdminMessageTargetScope = isSystemBuiltIn
    ? 'app_startup'
    : VALID_SCOPES.includes(raw?.targetScope)
      ? raw.targetScope
      : 'single_show';
  const startupCondition: AdminMessageStartupCondition | undefined =
    targetScope === 'app_startup'
      ? VALID_STARTUP_CONDITIONS.includes(raw?.startupCondition)
        ? raw.startupCondition
        : 'all_users'
      : undefined;
  const clearMode: AdminMessageClearMode =
    raw?.clearMode === 'date_range' ? 'date_range' : 'once_acknowledged';

  const targetShowIds: string[] = Array.isArray(raw?.targetShowIds)
    ? Array.from(
        new Set<string>(
          raw.targetShowIds
            .map((sid: any) => String(sid || '').trim())
            .filter((sid: string): sid is string => Boolean(sid))
        )
      )
    : [];

  const acknowledgedByShows: AdminMessageAckRecord[] = Array.isArray(raw?.acknowledgedByShows)
    ? raw.acknowledgedByShows
        .filter((rec: any) => rec && typeof rec === 'object' && rec.showId)
        .map((rec: any) => ({
          showId: String(rec.showId),
          ...(rec.showName ? { showName: String(rec.showName) } : {}),
          acknowledgedAt: String(rec.acknowledgedAt || nowIso),
          ...(rec.airDate ? { airDate: String(rec.airDate) } : {}),
          ...(rec.playMode ? { playMode: String(rec.playMode) } : {}),
          ...(rec.appVersion ? { appVersion: String(rec.appVersion) } : {}),
          ...(rec.machineId ? { machineId: String(rec.machineId) } : {}),
          ...(rec.personaName ? { personaName: String(rec.personaName) } : {}),
          ...(rec.personaType === 'shared' || rec.personaType === 'personal'
            ? { personaType: rec.personaType }
            : {}),
          ...(rec.pcUseType === 'live_studio' ||
          rec.pcUseType === 'prerecord_studio' ||
          rec.pcUseType === 'admin_workstation'
            ? { pcUseType: rec.pcUseType }
            : {}),
          ...(rec.appEdition ? { appEdition: String(rec.appEdition) } : {}),
          ...(rec.platform ? { platform: String(rec.platform) } : {}),
        }))
    : [];

  const enabled = typeof raw?.enabled === 'boolean' ? raw.enabled : true;
  const archived = isSystemBuiltIn
    ? false
    : typeof raw?.archived === 'boolean'
      ? raw.archived
      : !enabled;

  return {
    id,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Show Note',
    body: typeof raw?.body === 'string' ? raw.body : '',
    severity,
    enabled: archived ? false : enabled,
    ...(archived ? { archived: true } : {}),
    ...(archived && typeof raw?.archivedAt === 'string' && raw.archivedAt
      ? { archivedAt: raw.archivedAt }
      : {}),
    ...(isSystemBuiltIn ? { isSystemBuiltIn: true } : {}),
    targetScope,
    ...(targetScope === 'single_show' || targetScope === 'selected_shows'
      ? { targetShowIds }
      : {}),
    ...(targetScope === 'app_startup' && startupCondition ? { startupCondition } : {}),
    ...(targetScope === 'app_startup' &&
    typeof raw?.targetAppVersion === 'string' &&
    raw.targetAppVersion.trim()
      ? { targetAppVersion: raw.targetAppVersion.trim() }
      : {}),
    ...(typeof raw?.startDate === 'string' && raw.startDate.trim()
      ? { startDate: raw.startDate.trim() }
      : {}),
    ...(typeof raw?.endDate === 'string' && raw.endDate.trim()
      ? { endDate: raw.endDate.trim() }
      : {}),
    clearMode,
    acknowledgedByShows,
    createdAt: typeof raw?.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowIso,
    updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowIso,
    ...(typeof raw?.createdBy === 'string' && raw.createdBy.trim()
      ? { createdBy: raw.createdBy.trim() }
      : {}),
  };
}

export function normalizeAdminMessages(rawList?: any): AdminMessage[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => normalizeAdminMessage(item, idx));
}

function toStationLocalDateTimeKey(date: Date): string {
  const parts = toStationDateParts(date, getStationTimezone());
  if (!parts) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
  }
  return `${parts.dateStr}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function getStationAirDateStr(date: Date): string {
  const parts = toStationDateParts(date, getStationTimezone());
  if (parts) return parts.dateStr;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeBoundKey(raw: string | undefined, isEnd: boolean): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) return null;
  const datePart = match[1];
  const timePart = match[2] || (isEnd ? '23:59' : '00:00');
  return `${datePart}T${timePart}`;
}

export function isAdminMessageExpired(msg: AdminMessage, referenceDate: Date = new Date()): boolean {
  if (!msg || !msg.endDate) return false;
  const endKey = normalizeBoundKey(msg.endDate, true);
  if (!endKey) return false;
  const refKey = toStationLocalDateTimeKey(referenceDate);
  return refKey > endKey;
}

export function isAdminMessageArchived(msg: AdminMessage, referenceDate: Date = new Date()): boolean {
  if (!msg || isSystemBuiltInMessage(msg)) return false;
  return Boolean(msg.archived || !msg.enabled || isAdminMessageExpired(msg, referenceDate));
}

export function isAdminMessageActiveAtDate(msg: AdminMessage, targetDate: Date): boolean {
  if (!msg || !msg.enabled || msg.archived) return false;
  const targetKey = toStationLocalDateTimeKey(targetDate);
  const startKey = normalizeBoundKey(msg.startDate, false);
  const endKey = normalizeBoundKey(msg.endDate, true);
  if (startKey && targetKey < startKey) return false;
  if (endKey && targetKey > endKey) return false;
  return true;
}

export function doesAdminMessageTargetShow(
  msg: AdminMessage,
  show: Show | null,
  targetDate: Date
): boolean {
  if (!msg || !msg.enabled || msg.archived || !show) return false;
  if (isSystemBuiltInMessage(msg)) return false;
  if (show.active === false) return false;
  if (msg.targetScope === 'app_startup') return false;
  if (!isAdminMessageActiveAtDate(msg, targetDate)) return false;

  if (msg.targetScope === 'all_shows' || msg.targetScope === 'time_window') {
    return true;
  }

  if (msg.targetScope === 'single_show' || msg.targetScope === 'selected_shows') {
    const ids = Array.isArray(msg.targetShowIds) ? msg.targetShowIds : [];
    return ids.includes(show.id);
  }

  return false;
}

/**
 * Checks whether a Show Message applies to a given show regardless of whether
 * the message is currently active, archived, disabled, or expired (used for
 * the per-show Messages Shortlist modal showing both current and historical messages).
 */
export function doesAdminMessageApplyToShowAnytime(
  msg: AdminMessage | null | undefined,
  show: Show | null | undefined
): boolean {
  if (!msg || !show) return false;
  if (isSystemBuiltInMessage(msg)) return false;
  if (msg.targetScope === 'app_startup') return false;

  if (msg.targetScope === 'all_shows' || msg.targetScope === 'time_window') {
    return true;
  }

  if (msg.targetScope === 'single_show' || msg.targetScope === 'selected_shows') {
    const ids = Array.isArray(msg.targetShowIds) ? msg.targetShowIds : [];
    return ids.includes(show.id);
  }

  return false;
}

export function getShowMessagesShortlist(
  messages: AdminMessage[],
  show: Show | null | undefined,
  referenceDate: Date = new Date()
): { active: AdminMessage[]; historical: AdminMessage[] } {
  if (!show || !Array.isArray(messages)) return { active: [], historical: [] };
  const matching = messages.filter((msg) => doesAdminMessageApplyToShowAnytime(msg, show));
  const active = matching
    .filter((msg) => !isAdminMessageArchived(msg, referenceDate))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const historical = matching
    .filter((msg) => isAdminMessageArchived(msg, referenceDate))
    .sort((a, b) =>
      (b.archivedAt || b.updatedAt || '').localeCompare(a.archivedAt || a.updatedAt || '')
    );
  return { active, historical };
}

export function isAdminMessageAcknowledgedForShow(
  msg: AdminMessage,
  showId: string,
  airDateStr: string,
  logs?: LogEntry[]
): { acknowledged: boolean; ackRecord?: AdminMessageAckRecord } {
  const ackList = Array.isArray(msg.acknowledgedByShows) ? msg.acknowledgedByShows : [];

  if (msg.clearMode === 'once_acknowledged') {
    const matched = ackList.find((rec) => rec.showId === showId);
    if (matched) return { acknowledged: true, ackRecord: matched };
  } else {
    const matched = ackList.find(
      (rec) => rec.showId === showId && rec.airDate === airDateStr
    );
    if (matched) return { acknowledged: true, ackRecord: matched };
  }

  if (Array.isArray(logs) && logs.length > 0) {
    const matchedLog = logs.find((l) => {
      if (!l) return false;
      if (l.status !== 'acknowledged' && l.assetType !== 'message') return false;
      if (l.announcementId !== msg.id) return false;
      if (l.showId && l.showId !== showId) return false;
      if (msg.clearMode === 'date_range') {
        const logParts = toStationDateParts(
          l.announcementTime || l.scheduledFor || l.timestamp,
          getStationTimezone()
        );
        if (logParts && logParts.dateStr !== airDateStr) return false;
      }
      return true;
    });
    if (matchedLog) {
      return {
        acknowledged: true,
        ackRecord: {
          showId,
          showName: matchedLog.showName,
          acknowledgedAt: matchedLog.logTimeStamp || matchedLog.executedAt || matchedLog.timestamp,
          airDate: airDateStr,
          playMode: matchedLog.playMode,
        },
      };
    }
  }

  return { acknowledged: false };
}

export interface ResolvedShowAdminMessage {
  message: AdminMessage;
  acknowledged: boolean;
  ackRecord?: AdminMessageAckRecord;
  airDateStr: string;
}

export function getAdminMessagesForShowOccurrence(
  messages: AdminMessage[],
  show: Show | null,
  targetDate: Date,
  logs?: LogEntry[]
): ResolvedShowAdminMessage[] {
  if (!show || !Array.isArray(messages) || messages.length === 0) return [];
  const airDateStr = getStationAirDateStr(targetDate);

  return messages
    .filter((msg) => doesAdminMessageTargetShow(msg, show, targetDate))
    .map((msg) => {
      const { acknowledged, ackRecord } = isAdminMessageAcknowledgedForShow(
        msg,
        show.id,
        airDateStr,
        logs
      );
      return {
        message: msg,
        acknowledged,
        ackRecord,
        airDateStr,
      };
    })
    .sort((a, b) => {
      if (a.message.severity !== b.message.severity) {
        return a.message.severity === 'alert' ? -1 : 1;
      }
      return (b.message.updatedAt || '').localeCompare(a.message.updatedAt || '');
    });
}

function getStartupAckMap(): Record<string, string> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STARTUP_ACK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
  } catch (_) {}
  return {};
}

export function isStartupMessageAcknowledgedLocal(
  messageId: string,
  updatedAt?: string,
  appVersion: string = CURRENT_APP_VERSION
): boolean {
  const map = getStartupAckMap();
  const key = `${messageId}::${appVersion}`;
  const storedMarker = map[key];
  if (!storedMarker) return false;
  if (updatedAt && storedMarker !== updatedAt) return false;
  return true;
}

export function markStartupMessageAcknowledgedLocal(
  messageId: string,
  updatedAt?: string,
  appVersion: string = CURRENT_APP_VERSION
): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const map = getStartupAckMap();
      const key = `${messageId}::${appVersion}`;
      map[key] = updatedAt || new Date().toISOString();
      window.localStorage.setItem(STARTUP_ACK_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (_) {}
}

export interface BuiltInSystemMessageDescriptor {
  id: string;
  message: AdminMessage;
  enabled: boolean;
  triggerDescription: string;
  currentSchemaNote: string;
  wouldTriggerNow: boolean;
}

/**
 * Builds the 2 standard built-in auto-triggered AMP version/schema startup notices,
 * populated dynamically from station schema metadata and user app context.
 */
export function getBuiltInSystemMessages(
  storedMessages: AdminMessage[] = [],
  currentAppVersion: string = CURRENT_APP_VERSION,
  compatibilityReport?: CompatibilityReport | null
): BuiltInSystemMessageDescriptor[] {
  const storedUpdate = storedMessages.find((m) => m.id === SYSTEM_MSG_VERSION_UPDATE_ID);
  const storedRequired = storedMessages.find((m) => m.id === SYSTEM_MSG_REQUIRED_UPGRADE_ID);

  const updateEnabled = storedUpdate ? storedUpdate.enabled !== false : true;
  const requiredEnabled = storedRequired ? storedRequired.enabled !== false : true;

  const latestVersion = resolveHighestAppVersion(
    compatibilityReport?.highestAppVersion,
    compatibilityReport?.lastModifiedBy,
    currentAppVersion
  );
  const minVersion = compatibilityReport?.minAppVersion || CURRENT_MIN_APP_VERSION;
  const schemaVersion = compatibilityReport?.schemaVersion ?? CURRENT_SCHEMA_VERSION;

  const isUpgradeRequired = Boolean(
    compatibilityReport?.status === 'NEWER_VERSION_DETECTED' ||
      compareSemver(minVersion, currentAppVersion) > 0 ||
      schemaVersion > CURRENT_SCHEMA_VERSION
  );
  const isNewerVersionSeen = compareSemver(latestVersion, currentAppVersion) > 0;

  const adminContact = (getAdminContactInfo() || '').trim();
  const contactBlock = adminContact ? `\n\n**Admin Contact:**\n${adminContact}` : '';

  const updateMessage: AdminMessage = {
    id: SYSTEM_MSG_VERSION_UPDATE_ID,
    title: 'AMP Version Update Available',
    body: `Current version is v${latestVersion}. You are using v${currentAppVersion}. Please see admin to upgrade.${contactBlock}`,
    severity: 'info',
    enabled: updateEnabled,
    isSystemBuiltIn: true,
    targetScope: 'app_startup',
    startupCondition: 'old_version',
    targetAppVersion: latestVersion,
    clearMode: 'once_acknowledged',
    acknowledgedByShows: storedUpdate?.acknowledgedByShows || [],
    createdAt: storedUpdate?.createdAt || '1970-01-01T00:00:00.000Z',
    // Key updatedAt to latestVersion so local ack resets automatically whenever a newer version is seen
    updatedAt: `system-version-${latestVersion}`,
    createdBy: 'System',
  };

  const requiredMessage: AdminMessage = {
    id: SYSTEM_MSG_REQUIRED_UPGRADE_ID,
    title: 'Required AMP Upgrade (Schema Change)',
    body: `Current version is v${latestVersion}. You are using v${currentAppVersion}. The minimum version is v${minVersion}. **YOU MUST UPGRADE.** See admin to upgrade.${contactBlock}`,
    severity: 'alert',
    enabled: requiredEnabled,
    isSystemBuiltIn: true,
    targetScope: 'app_startup',
    startupCondition: 'old_version_schema',
    targetAppVersion: minVersion,
    clearMode: 'date_range',
    acknowledgedByShows: storedRequired?.acknowledgedByShows || [],
    createdAt: storedRequired?.createdAt || '1970-01-01T00:00:00.000Z',
    updatedAt: `system-schema-${minVersion}-${schemaVersion}`,
    createdBy: 'System',
  };

  return [
    {
      id: SYSTEM_MSG_REQUIRED_UPGRADE_ID,
      message: requiredMessage,
      enabled: requiredEnabled,
      triggerDescription:
        'Auto-triggers on AMP Launch when a schema change requires a newer minimum version.',
      currentSchemaNote: `Highest seen: v${latestVersion} · Min required: v${minVersion}`,
      wouldTriggerNow: requiredEnabled && isUpgradeRequired,
    },
    {
      id: SYSTEM_MSG_VERSION_UPDATE_ID,
      message: updateMessage,
      enabled: updateEnabled,
      triggerDescription:
        'Auto-triggers on AMP Launch when a higher AMP version has been used on this station.',
      currentSchemaNote: `Highest seen: v${latestVersion} · This app: v${currentAppVersion}`,
      wouldTriggerNow: updateEnabled && isNewerVersionSeen && !isUpgradeRequired,
    },
  ];
}

export function getPendingStartupMessages(
  messages: AdminMessage[],
  currentAppVersion: string = CURRENT_APP_VERSION,
  compatibilityReport?: CompatibilityReport | null,
  referenceDate: Date = new Date()
): AdminMessage[] {
  const safeMessages = Array.isArray(messages) ? messages : [];

  // 1. Evaluate built-in auto-triggered schema/version notices
  const builtIns = getBuiltInSystemMessages(safeMessages, currentAppVersion, compatibilityReport);
  const pendingBuiltIns = builtIns
    .filter((b) => {
      if (!b.wouldTriggerNow) return false;
      if (
        b.message.clearMode !== 'date_range' &&
        isStartupMessageAcknowledgedLocal(b.message.id, b.message.updatedAt, currentAppVersion)
      ) {
        return false;
      }
      return true;
    })
    .map((b) => b.message);

  // 2. Evaluate custom admin-created AMP Launch messages
  const pendingCustom = safeMessages
    .filter((msg) => {
      if (!msg || isSystemBuiltInMessage(msg)) return false;
      if (!msg.enabled || msg.archived || msg.targetScope !== 'app_startup') return false;
      if (!isAdminMessageActiveAtDate(msg, referenceDate)) return false;
      if (
        msg.clearMode !== 'date_range' &&
        isStartupMessageAcknowledgedLocal(msg.id, msg.updatedAt, currentAppVersion)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'alert' ? -1 : 1;
      }
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

  return [...pendingBuiltIns, ...pendingCustom];
}

export function formatShowMessagesForExportPlan(messages: AdminMessage[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lines: string[] = [
    '========================================================================',
    '        [OFF-AIR SHOW MESSAGE — DO NOT READ ON AIR]',
    '========================================================================',
  ];

  messages.forEach((msg, idx) => {
    const badge = msg.severity === 'alert' ? '[!]' : '[i]';
    const plainBody = stripFormattingMarkers(msg.body || '').trim();
    lines.push(`${badge} ${msg.title || 'Show Message'}`);
    if (plainBody) {
      lines.push(plainBody);
    }
    if (idx < messages.length - 1) {
      lines.push('------------------------------------------------------------------------');
    }
  });

  lines.push('========================================================================');
  lines.push('');
  return lines.join('\n');
}

export function getAdminMessageTargetSummary(msg: AdminMessage, shows: Show[]): string {
  if (msg.id === SYSTEM_MSG_REQUIRED_UPGRADE_ID) {
    return 'Built-In · Schema Upgrade Required (!)';
  }
  if (msg.id === SYSTEM_MSG_VERSION_UPDATE_ID) {
    return 'Built-In · Newer Version Notice (i)';
  }
  if (msg.targetScope === 'app_startup') {
    return 'All Users';
  }
  if (msg.targetScope === 'all_shows') {
    return 'All Active Shows';
  }
  if (msg.targetScope === 'time_window') {
    const startLabel = msg.startDate ? formatDatetime12(msg.startDate) : 'Now';
    const endLabel = msg.endDate ? formatDatetime12(msg.endDate) : 'Ongoing';
    return `Any Show in Period (${startLabel} to ${endLabel})`;
  }
  const ids = Array.isArray(msg.targetShowIds) ? msg.targetShowIds : [];
  if (ids.length === 0) return 'No Show Selected';
  const names = ids.map((id) => {
    const found = shows.find((s) => s.id === id);
    return found ? found.name : id;
  });
  if (names.length === 1) return `Show: ${names[0]}`;
  if (names.length <= 3) return `Shows (${names.length}): ${names.join(', ')}`;
  return `Shows (${names.length}): ${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}
