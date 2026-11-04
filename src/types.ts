/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum AnnouncementType {
  ONE_TIME = 'one-time',
  BASIC_HOURLY = 'basic-hourly',
  ADVANCED = 'advanced',
}

export interface TimeGatedMediaItem {
  mp3Url: string;
  assetType?: 'audio' | 'script';
  duration?: string;
  fileSize?: string;
  backupMp3Url?: string;
  approximateReadTime?: string;
}

export interface TimeGatedMp3 {
  id: string;
  startDate: string;
  endDate?: string;
  inactivated?: boolean;
  inactivatedAt?: string;
  mediaItems?: TimeGatedMediaItem[];
  // Legacy flat fields accepted on read/input and migrated into mediaItems[0]
  mp3Url?: string;
  assetType?: 'audio' | 'script';
  duration?: string;
  fileSize?: string;
  backupMp3Url?: string;
  approximateReadTime?: string;
}

export interface ResolvedTimeGatedMp3 extends TimeGatedMediaItem {
  id: string;
  gateId?: string;
  startDate: string;
  endDate?: string;
  mediaItems?: TimeGatedMediaItem[];
  rotationIndex?: number;
  rotationTotal?: number;
}

export interface AnnouncementMetadata {
  createdBy: string;
  createdDate: string;
  lastModifiedBy: string;
  lastModifiedDate: string;
}

export interface AnnouncementRevision {
  name: string;
  type: AnnouncementType;
  enabled: boolean;
  minute: number;
  date?: string;
  time?: string;
  days?: number[];
  hours?: number[];
  gridRules?: string[];
  startDate?: string;
  endDate?: string;
  timeGatedMp3s?: TimeGatedMp3[];
  validFrom: string;
  validTo: string;
}

export interface Announcement {
  id: string;
  name: string;
  type: AnnouncementType;
  enabled: boolean;
  minute: number; // 0-59
  // For ONE_TIME
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm (24h)
  // For ADVANCED
  days?: number[]; // 0-6 (Sunday-Saturday)
  hours?: number[]; // 0-23
  gridRules?: string[]; // Array of "day-hour" strings, e.g., ["1-10", "1-11"] for Monday 10am and 11am
  // General restrictions
  startDate?: string;
  endDate?: string;
  timeGatedMp3s?: TimeGatedMp3[];
  metadata: AnnouncementMetadata;
  // Temporal Revision & Soft Delete
  validFrom?: string;
  validTo?: string | null;
  isDeleted?: boolean;
  revisions?: AnnouncementRevision[];
  // Virtual Up Next Promo fields
  isUpNextPromo?: boolean;
  upNextShowId?: string;
}

export interface UpNextPromoConfig {
  enabled: boolean;
  minutesBefore: number;
}

export interface LogEntry {
  timestamp: string;
  announcementTime?: string;
  mp3Name: string;
  announcementName: string;
  announcementId: string;
  status: 'played' | 'skipped' | 'failed' | 'backup play';
  playMode?: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
  logTimeStamp?: string;
  assetType?: 'audio' | 'script';
  showId?: string;
  showName?: string;
  hostName?: string;
  showDateTime?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  // Dual-Timestamp Temporal Reconciliation Fields
  executedAt?: string;
  scheduledFor?: string | null;
}

export interface ShowPlaylistLogTrackItem {
  id: string;
  fileName: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  playedAt: string;
  isAnnouncement?: boolean;
}

export interface ShowPlaylistLog {
  showId: string;
  showName: string;
  hostName: string;
  showDateTime: string;
  logFileName: string;
  selectedFolderPath?: string;
  isExternalFolder?: boolean;
  externalAbsolutePath?: string | null;
  playedTracks: ShowPlaylistLogTrackItem[];
  cancelledTrackIds: string[];
  unplayedTrackIds: string[];
  breakPositions?: Record<string, number>;
  breakOrder?: string[];
  trackMetadata?: Record<string, {
    id: string;
    fileName: string;
    title?: string;
    durationSeconds?: number;
    artist?: string;
    album?: string;
  }>;
}

export interface DiscoveredFolderItem {
  id: string;
  name: string;
  relPath: string;
  fileCount: number;
  isRoot: boolean;
  hasM3u: boolean;
  itemType?: 'folder' | 'playlist';
  playlistFileName?: string;
  missingCount?: number;
  totalTracks?: number;
  depth?: number;
}

export interface DiscoverFoldersResponse {
  success: boolean;
  hasMultipleFolders: boolean;
  totalFiles: number;
  folderCount: number;
  folders: DiscoveredFolderItem[];
  defaultFolderName?: string;
  defaultFolderPath?: string;
  error?: string;
}

export interface ShowRevision {
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
  nameShort: string;
  host: string;
  description: string;
  active: boolean;
  includeInUpNext?: boolean;
  validFrom: string;
  validTo: string;
}

export interface Show {
  id: string;
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
  nameShort: string;
  host: string;
  description: string;
  active: boolean;
  includeInUpNext?: boolean;
  // Temporal Revision & Soft Delete
  validFrom?: string;
  validTo?: string | null;
  isDeleted?: boolean;
  revisions?: ShowRevision[];
}

export type ScheduleIssueType = 'missing_media' | 'overlap' | 'gap';
export type ScheduleIssueSeverity = 'critical' | 'warning' | 'info';

export interface ScheduleIssue {
  id: string;
  type: ScheduleIssueType;
  severity: ScheduleIssueSeverity;
  timestamp: string;
  timeLabel: string;
  slotId: string;
  dayKey: string;
  hour: number;
  minute: number;
  announcementId: string;
  announcementName: string;
  announcementType: AnnouncementType;
  fileName?: string;
  fileStatus?: { exists: boolean; valid: boolean; filename: string };
  durationSeconds?: number;
  offsetSeconds?: number;
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
  scopeStartDate: string;
  scopeEndDate: string;
  evaluatedAt: string;
  issues: ScheduleIssue[];
  issuesBySlotId: Record<string, ScheduleIssue[]>;
  issuesByDayKey: Record<string, ScheduleIssue[]>;
  issuesByHourKey: Record<string, ScheduleIssue[]>;
  summary: ScheduleDiagnosticsSummary;
}

export interface LocationPathsOverride {
  logs?: string | null;
  loghistory?: string | null;
  settings?: string | null;
  media_announcements?: string | null;
  media_evergreens?: string | null;
  media_shows?: string | null;
  logsFile?: string | null;
  announcementsFile?: string | null;
  showsFile?: string | null;
}

export interface GoogleAuthProfile {
  email: string;
  displayName: string;
}

export interface GoogleAuthConfig {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
  userProfile?: GoogleAuthProfile | null;
}

export interface LocationSettings {
  mode: 'Local' | 'Drive' | 'Demo';
  localPathAmp: string;
  driveFolderAmp?: string;
  paths?: LocationPathsOverride;
  localPathMP3s: string;
  localPathMediaAnnouncements?: string;
  localPathMediaEvergreens?: string;
  localPathMediaShows?: string;
  localPathLogs: string;
  localPathCalendar: string;
  driveFolderLogs: string;
  driveFolderMP3s: string;
  driveFolderPreferences: string;
  driveFolderAnnouncements?: string;
  driveFolderEvergreens?: string;
  driveFolderShows?: string;
  googleAuth?: GoogleAuthConfig | null;
}

export interface MediaAssetFile {
  name: string;
  path: string;
  size?: string | number;
  duration?: string;
  approximateReadTime?: string;
  assetType?: 'audio' | 'script';
  mtimeMs?: number;
  modifiedTime?: string;
  id?: string;
  webContentLink?: string;
  mimeType?: string;
}

export interface LiveReadPayload {
  name?: string;
  fileName?: string;
  announcementId?: string;
  scheduleId?: string;
  announcementName?: string;
  scheduleName?: string;
  announcementTime?: string;
  scheduledTime?: string;
  initialLoggedTime?: string;
  scriptUrl?: string;
  scriptText?: string;
  content?: string;
  backupMp3Url?: string;
  approximateReadTime?: string;
  scheduledFor?: string;
  slotTime?: string;
  playMode?: LogEntry['playMode'];
  showId?: string;
  showName?: string;
  hostName?: string;
  showDateTime?: string;
  isPreview?: boolean;
  isTestPopup?: boolean;
  isReadOnly?: boolean;
  rotationIndex?: number;
  rotationTotal?: number;
  [key: string]: unknown;
}

export interface ElectronFolderDialogResult {
  success: boolean;
  path?: string;
  cancelled?: boolean;
  error?: string;
}

export interface ElectronAPI {
  spawnLiveRead?: (data: LiveReadPayload) => Promise<unknown>;
  getLiveReadData?: () => Promise<LiveReadPayload | null>;
  logLiveReadCommit?: (logEntry: LogEntry) => Promise<unknown>;
  onLiveReadLogged?: (callback: (logEntry: LogEntry) => void) => () => void;
  onLiveReadOpened?: (callback: (data: LiveReadPayload) => void) => () => void;
  onLiveReadClosed?: (callback: () => void) => () => void;
  focusLiveReadWindow?: () => Promise<unknown>;
  closeLiveReadWindow?: () => Promise<unknown>;
  onNavigate?: (callback: (data: { tab: string; subTab?: string }) => void) => () => void;
  setActiveTabMenu?: (tab: string, subTab?: string) => void;
  setLiveReadActive?: (active: boolean) => void;
  selectFolder?: (defaultPath?: string) => Promise<ElectronFolderDialogResult>;
  browseFolder?: (defaultPath?: string) => Promise<ElectronFolderDialogResult>;
  openPath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
}

