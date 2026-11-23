/**
 * Canonical Schema Upgrade & Compatibility Verification Suite
 * 
 * Directly tests the production migration engine (src/lib/compatibility.ts)
 * against legacy v0 payloads to verify that:
 * 1. Shows schema integrity is 100% preserved (day, startHour, durationHours, durationMinutes, host, description, active).
 * 2. No spurious Announcement multi-day scheduling arrays (days, endHour, endMinute) are injected into Show objects.
 * 3. Legacy single-mp3 and un-typed scripts in Announcements are cleanly synthesized into normalized timeGatedMp3s with assetType.
 * 4. Two-phase commit transactional atomicity and rollback safety are verified on disk.
 * 
 * Usage:
 *   npx tsx scripts/test-schema-upgrade.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';
import {
  migrateAnnouncementsPayload,
  migrateShowsPayload,
  migrateLogsPayload,
  seedLogEntrySiblings,
  assessDataCompatibility,
  CURRENT_SCHEMA_VERSION,
  CURRENT_MIN_APP_VERSION,
  CURRENT_APP_VERSION,
  stationSlotDateToUtcIso,
  stationLocalToUtcIso,
  isLogForStationSlot,
  isLogPrerecordOrExport,
  setStationTimezone,
  DEFAULT_STATION_TIMEZONE,
  DEFAULT_SCHEDULE_WINDOW_CONFIG,
  resolveHighestAppVersion
} from '../src/lib/compatibility';
import {
  normalizeAdminMessages,
  getAdminMessagesForShowOccurrence,
  getBuiltInSystemMessages,
  getPendingStartupMessages,
  SYSTEM_MSG_VERSION_UPDATE_ID,
  SYSTEM_MSG_REQUIRED_UPGRADE_ID
} from '../src/lib/adminMessages';
import {
  reconcileScheduleAndLogs,
  calculateGateSlotAssessment,
  computePlayedGateBoundsMap,
  resolveAnnouncementsForDate,
} from '../src/lib/temporalReconciliation';
import {
  normalizeAnnouncements,
  normalizeAnnouncement,
  getActiveMp3ForSlot,
  formatRotatedAnnouncementName,
  formatRotatedFileName,
  isAnnouncementScheduledAtSlot,
  isAnnouncementActiveInHour,
  getAnnouncementsForSlot,
  getMatchingMp3sForSlot,
  isContiguousMidnightTransition,
  buildUpNextPromoAnnouncements,
  computeFileScheduleUsageMap,
  isTimeInShow,
  getShowsForSlot,
  validateTimeGatedMp3s,
  isGateExpiredOrInactivated,
} from '../src/lib/scheduleEngine';
import {
  mediaCatalogStore,
  upsertMediaCatalogFile,
  syncMediaCatalogFiles,
  availableFilesCache,
  driveFileNameCache,
} from '../src/lib/audioCache';
import { resolveEffectiveLocalPaths } from '../src/lib/driveService';
import { AdminMessage, Announcement, AnnouncementType, LogEntry, Show } from '../src/types';

export function runComprehensiveSchemaUpgradeTests() {
  console.log('🧪 Starting Canonical Schema Upgrade Verification (Importing SUT from src/lib/compatibility)...');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-canonical-schema-test-'));
  const settingsDir = path.join(tempDir, 'settings');
  const backupsDir = path.join(settingsDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const announcementsPath = path.join(settingsDir, 'announcements.json');
  const showsPath = path.join(settingsDir, 'shows.json');
  const logsPath = path.join(settingsDir, 'logs.json');

  // 1. Authentic Legacy v0 Announcement Fixture
  const legacyAnnouncements = [
    {
      id: '100000',
      name: 'Test Legacy Basic Hourly',
      type: 'basic-hourly',
      enabled: true,
      minute: 15,
      days: [1, 2, 3],
      hours: [9, 10, 11],
      gridRules: [],
      startDate: '2026-01-01',
      endDate: '',
      mp3Url: 'LegacySingleTrack.mp3'
    },
    {
      id: '100001',
      name: 'Test Legacy Script Readout',
      type: 'advanced',
      enabled: false,
      minute: 45,
      days: [0, 6],
      hours: [14, 15],
      gridRules: ['0-14', '6-15'],
      timeGatedMp3s: [
        {
          id: 'mp3-legacy-script',
          mp3Url: 'CarDonationLiveRead.txt',
          startDate: '2026-05-01T00:00',
          endDate: '2026-06-01T00:00'
        }
      ]
    }
  ];

  // 2. Authentic Legacy v0 Show Fixture
  const legacyShows = [
    {
      id: '1',
      name: 'The Graveyard Shift with Kopper',
      nameShort: 'Graveyard_Shift',
      day: 'Monday',
      startHour: 1,
      startMinute: 0,
      durationHours: 2,
      durationMinutes: 0,
      host: 'Kopper',
      description: 'Late night rock and roll',
      active: true
    },
    {
      id: '2',
      name: 'Positively Everything with Moe Fuz',
      nameShort: 'Positively_Every',
      day: 'Sunday',
      startHour: 8,
      startMinute: 30,
      durationHours: 1,
      durationMinutes: 30,
      host: 'Moe Fuz',
      description: 'Sunday morning variety',
      active: false
    }
  ];

  // 3. Authentic v0.15.4 / v0.15.5 Logs Fixture (missing scheduledFor / executedAt siblings)
  const legacyLogs = {
    LogsBackupCounter: 4,
    data: [
      {
        timestamp: '2026-10-18T16:15:00.000Z',
        announcementTime: '2026-10-18T16:15:00.000Z',
        logTimeStamp: '2026-10-18T16:15:02.000Z',
        mp3Name: 'LegacySingleTrack.mp3',
        announcementName: 'Test Legacy Basic Hourly',
        announcementId: '100000',
        status: 'played',
        playMode: 'Live'
      }
    ]
  };

  fs.writeFileSync(announcementsPath, JSON.stringify(legacyAnnouncements, null, 2));
  fs.writeFileSync(showsPath, JSON.stringify(legacyShows, null, 2));
  fs.writeFileSync(logsPath, JSON.stringify(legacyLogs, null, 2));

  console.log('✓ Stage 1: Legacy v0 and v0.15.4/5 fixture files generated on disk.');

  // Pre-Migration Compatibility Check: Must report OLDER_VERSION_DETECTED
  const preCheckAnn = assessDataCompatibility(null);
  assert.strictEqual(preCheckAnn.status, 'OLDER_VERSION_DETECTED', 'Un-enveloped v0 data must trigger OLDER_VERSION_DETECTED');

  // 4. Execute Production Migration Engine (Two-Phase Simulation)
  const rawAnnText = fs.readFileSync(announcementsPath, 'utf-8');
  const rawShowsText = fs.readFileSync(showsPath, 'utf-8');
  const rawLogsText = fs.readFileSync(logsPath, 'utf-8');

  // Phase 1: In-memory transformation via production SUT
  const annMigration = migrateAnnouncementsPayload(JSON.parse(rawAnnText), CURRENT_APP_VERSION, 0);
  const showsMigration = migrateShowsPayload(JSON.parse(rawShowsText), CURRENT_APP_VERSION, 0);
  const logsMigration = migrateLogsPayload(JSON.parse(rawLogsText), CURRENT_APP_VERSION, 0);

  // Phase 2: Transactional staging (.upgrade.tmp) & atomic swap
  const annTmp = `${announcementsPath}.upgrade.tmp`;
  const showsTmp = `${showsPath}.upgrade.tmp`;
  const logsTmp = `${logsPath}.upgrade.tmp`;

  fs.writeFileSync(annTmp, JSON.stringify(annMigration.envelope, null, 2));
  fs.writeFileSync(showsTmp, JSON.stringify(showsMigration.envelope, null, 2));
  fs.writeFileSync(logsTmp, JSON.stringify(logsMigration.envelope, null, 2));

  fs.renameSync(annTmp, announcementsPath);
  fs.renameSync(showsTmp, showsPath);
  fs.renameSync(logsTmp, logsPath);

  console.log('✓ Stage 2: Executed two-phase atomic migration via src/lib/compatibility.');

  // 5. Assertions & Verification
  const postAnnObj = JSON.parse(fs.readFileSync(announcementsPath, 'utf-8'));
  const postShowsObj = JSON.parse(fs.readFileSync(showsPath, 'utf-8'));
  const postLogsObj = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));

  // Post-Migration Compatibility Check: Must report COMPATIBLE
  const postCheckAnn = assessDataCompatibility(postAnnObj._meta);
  assert.strictEqual(postCheckAnn.status, 'COMPATIBLE', 'Migrated announcements must assess as COMPATIBLE');
  assert.strictEqual(postAnnObj._meta.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(postAnnObj._meta.minAppVersion, CURRENT_MIN_APP_VERSION);
  assert.strictEqual(postAnnObj._meta.lastModifiedBy, CURRENT_APP_VERSION);
  assert.strictEqual(postAnnObj.AnnouncementsBackupCounter, 1);

  // Announcement Items Verification
  assert.strictEqual(postAnnObj.data.length, 2);
  const a1 = postAnnObj.data[0];
  assert.strictEqual(a1.timeGatedMp3s.length, 1);
  assert.strictEqual(
    a1.timeGatedMp3s[0].mp3Url,
    'LegacySingleTrack.mp3',
    'Gate must dual-write flat mp3Url sibling from mediaItems[0] for v0.15.4/0.15.5 overlap compatibility'
  );
  assert.strictEqual(Array.isArray(a1.timeGatedMp3s[0].mediaItems), true, 'Gate must contain mediaItems array');
  assert.strictEqual(a1.timeGatedMp3s[0].mediaItems[0].assetType, 'audio', 'Audio file extension must map to assetType audio');
  assert.strictEqual(a1.timeGatedMp3s[0].assetType, 'audio', 'Gate must dual-write flat assetType sibling from mediaItems[0]');
  assert.strictEqual(a1.validFrom, '1970-01-01T00:00:00.000Z', 'Seeded validFrom must use epoch 1970-01-01');
  assert.strictEqual(a1.metadata.lastModifiedBy, CURRENT_APP_VERSION);

  const a2 = postAnnObj.data[1];
  assert.strictEqual(a2.timeGatedMp3s[0].mediaItems[0].assetType, 'script', 'Text file extension must map to assetType script');

  // Shows Items Verification (Zero Conflation Assertions)
  assert.strictEqual(postShowsObj._meta.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(postShowsObj.ShowsBackupCounter, 1);
  assert.strictEqual(postShowsObj.data.length, 2);

  const s1 = postShowsObj.data[0];
  assert.strictEqual(s1.name, 'The Graveyard Shift with Kopper');
  assert.strictEqual(s1.day, 'Monday', 'Show day must remain "Monday"');
  assert.strictEqual(s1.startHour, 1, 'Show startHour must remain 1');
  assert.strictEqual(s1.startMinute, 0, 'Show startMinute must remain 0');
  assert.strictEqual(s1.durationHours, 2, 'Show durationHours must remain 2');
  assert.strictEqual(s1.durationMinutes, 0, 'Show durationMinutes must remain 0');
  assert.strictEqual(s1.host, 'Kopper', 'Show host must remain "Kopper"');
  assert.strictEqual(s1.description, 'Late night rock and roll');
  assert.strictEqual(s1.active, true);
  assert.strictEqual(s1.validFrom, '1970-01-01T00:00:00.000Z', 'Show validFrom must use epoch 1970-01-01');

  // Boundary checks: Absolute absence of Announcement attributes
  assert.strictEqual(s1.days, undefined, 'CRITICAL: Show must NOT have Announcement days array');
  assert.strictEqual(s1.endHour, undefined, 'CRITICAL: Show must NOT have Announcement endHour');
  assert.strictEqual(s1.endMinute, undefined, 'CRITICAL: Show must NOT have Announcement endMinute');
  assert.strictEqual(s1.timeGatedMp3s, undefined, 'CRITICAL: Show must NOT have timeGatedMp3s');

  const s2 = postShowsObj.data[1];
  assert.strictEqual(s2.day, 'Sunday');
  assert.strictEqual(s2.startHour, 8);
  assert.strictEqual(s2.startMinute, 30);
  assert.strictEqual(s2.durationHours, 1);
  assert.strictEqual(s2.durationMinutes, 30);
  assert.strictEqual(s2.host, 'Moe Fuz');
  assert.strictEqual(s2.active, false);

  // Dual-Value Sibling Log Bridge Verification (v0.15.4/5 <-> v0.19.0)
  assert.strictEqual(postLogsObj.LogsBackupCounter, 5);
  assert.strictEqual(postLogsObj.data.length, 1);
  const l1 = postLogsObj.data[0];
  assert.strictEqual(l1.timestamp, '2026-10-18T16:15:00.000Z');
  assert.strictEqual(l1.announcementTime, '2026-10-18T16:15:00.000Z', 'v0.15.4/5 announcementTime must be preserved');
  assert.strictEqual(l1.scheduledFor, '2026-10-18T16:15:00.000Z', 'v0.19.0 scheduledFor sibling must be seeded from announcementTime');
  assert.strictEqual(l1.executedAt, '2026-10-18T16:15:02.000Z', 'v0.19.0 executedAt sibling must be seeded from logTimeStamp');

  // ---------------------------------------------------------------------------
  // 6. PART 1: Automated Cross-Version Ping-Pong Suite (v0.15.5 <-> v0.19.0)
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 3: Running Cross-Version Ping-Pong Coexistence Suite (v0.15.5 <-> v0.19.0)...');

  // Target test date: Monday 2026-10-19 (dayOfWeek = 1)
  // Announcement '100000' runs on days [1, 2, 3] at hours [9, 10, 11], minute 15 in station timezone.
  const localSlot0915Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 9, 15, 0, 0));
  const localExec0915Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 9, 15, 3, 0));

  // Phase A: v0.15.5 writes object-enveloped files (no _meta, no scheduledFor/executedAt, no validFrom)
  const v0155AnnouncementsDisk = {
    AnnouncementsBackupCounter: 10,
    data: [
      {
        id: '100000',
        name: 'Test Legacy Basic Hourly',
        type: 'basic-hourly',
        enabled: true,
        minute: 15,
        days: [1, 2, 3],
        hours: [9, 10, 11],
        gridRules: [],
        startDate: '2026-01-01',
        endDate: '',
        timeGatedMp3s: [
          {
            id: 'mp3-100000',
            mp3Url: 'LegacySingleTrack.mp3',
            startDate: '2026-01-01T00:00',
            endDate: '',
            days: [1, 2, 3]
          }
        ],
        metadata: {
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-10-18T12:00:00.000Z',
          lastModifiedBy: '0.15.5'
        }
      }
    ]
  };

  const v0155LogsDisk = {
    LogsBackupCounter: 10,
    data: [
      {
        // v0.15.5 log entry for 09:15 local time (stored as UTC ISO string, no scheduledFor / executedAt)
        timestamp: localSlot0915Iso,
        announcementTime: localSlot0915Iso,
        logTimeStamp: localExec0915Iso,
        mp3Name: 'LegacySingleTrack.mp3',
        announcementName: 'Test Legacy Basic Hourly',
        announcementId: '100000',
        status: 'played',
        playMode: 'Live'
      }
    ]
  };

  // v0.19.0 reads and normalizes the v0.15.5 payloads
  const v19ReadAnn = migrateAnnouncementsPayload(v0155AnnouncementsDisk, CURRENT_APP_VERSION, 0);
  const v19ReadLogs = migrateLogsPayload(v0155LogsDisk, CURRENT_APP_VERSION, 0);
  const clientNormalizedAnns = normalizeAnnouncements(v19ReadAnn.envelope.data);

  assert.strictEqual(assessDataCompatibility(v19ReadAnn.envelope._meta).status, 'COMPATIBLE');
  assert.strictEqual(clientNormalizedAnns[0].validFrom, '1970-01-01T00:00:00.000Z', 'Phase A: validFrom must be seeded to 1970-01-01 epoch');
  assert.strictEqual(v19ReadLogs.envelope.data[0].scheduledFor, localSlot0915Iso, 'Phase A: scheduledFor must be seeded from announcementTime');
  assert.strictEqual(v19ReadLogs.envelope.data[0].executedAt, localExec0915Iso, 'Phase A: executedAt must be seeded from logTimeStamp');

  // Reconcile Monday 2026-10-19 at 10:30 local time (09:15 played, 10:15 missed, 11:15 still in future)
  const referenceNow1030 = new Date(2026, 9, 19, 10, 30, 0, 0);
  const summaryAt1030 = reconcileScheduleAndLogs(
    '2026-10-19',
    clientNormalizedAnns,
    [],
    v19ReadLogs.envelope.data,
    referenceNow1030
  );

  assert.strictEqual(summaryAt1030.totalPlanned, 3, 'Phase A: 3 slots planned on Monday 2026-10-19');
  assert.strictEqual(summaryAt1030.totalPlayed, 1, 'Phase A: 09:15 slot logged by v0.15.5 must count as PLAYED');
  assert.strictEqual(summaryAt1030.totalMissed, 1, 'Phase A: Only past unplayed 10:15 slot (not future 11:15) must count as MISSED');

  const slot0915 = summaryAt1030.slots.find(s => s.hour === 9 && s.minute === 15);
  const slot1015 = summaryAt1030.slots.find(s => s.hour === 10 && s.minute === 15);
  const slot1115 = summaryAt1030.slots.find(s => s.hour === 11 && s.minute === 15);

  assert.ok(slot0915 && slot0915.status === 'PLAYED', 'Phase A: 09:15 slot logged by v0.15.5 must reconcile as PLAYED');
  assert.ok(slot1015 && slot1015.status === 'MISSED', 'Phase A: unplayed past 10:15 slot at 10:30 must reconcile as MISSED');
  assert.strictEqual(slot1115, undefined, 'Phase A: unplayed future 11:15 slot at 10:30 today must NOT be flagged as MISSED');

  // Phase B: v0.19.0 logs a play for 10:15, then v0.15.5 reads & re-saves (stripping _meta and logging 11:15)
  const localSlot1015Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 10, 15, 0, 0));
  const localExec1015Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 10, 15, 4, 0));

  const v19Logged1015 = seedLogEntrySiblings({
    scheduledFor: localSlot1015Iso,
    executedAt: localExec1015Iso,
    mp3Name: 'LegacySingleTrack.mp3',
    announcementName: 'Test Legacy Basic Hourly',
    announcementId: '100000',
    status: 'played',
    playMode: 'Live'
  });

  // Verify v0.15.5 required fields exist on the v0.19.0 log entry
  assert.strictEqual(v19Logged1015.timestamp, localSlot1015Iso, 'Phase B: v0.19.0 log entry must populate timestamp for v0.15.5');
  assert.strictEqual(v19Logged1015.announcementTime, localSlot1015Iso, 'Phase B: v0.19.0 log entry must populate announcementTime for v0.15.5');
  assert.strictEqual(v19Logged1015.logTimeStamp, localExec1015Iso, 'Phase B: v0.19.0 log entry must populate logTimeStamp for v0.15.5');

  // Simulate v0.15.5 opening the shared files, stripping _meta on save, and adding an 11:15 play in v0.15.5 format
  const localSlot1115Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 11, 15, 0, 0));
  const localExec1115Iso = stationSlotDateToUtcIso(new Date(2026, 9, 19, 11, 15, 1, 0));

  const v0155ResavedLogsDisk = {
    // Note: _meta stripped by v0.15.5 save
    LogsBackupCounter: v19ReadLogs.envelope.LogsBackupCounter! + 1,
    data: [
      ...v19ReadLogs.envelope.data,
      v19Logged1015,
      {
        timestamp: localSlot1115Iso,
        announcementTime: localSlot1115Iso,
        logTimeStamp: localExec1115Iso,
        mp3Name: 'LegacySingleTrack.mp3',
        announcementName: 'Test Legacy Basic Hourly',
        announcementId: '100000',
        status: 'played',
        playMode: 'Live'
      }
    ]
  };

  // v0.19.0 re-opens the v0.15.5-saved file
  const v19ReopenedLogs = migrateLogsPayload(v0155ResavedLogsDisk, CURRENT_APP_VERSION, 0);
  assert.strictEqual(v19ReopenedLogs.envelope._meta.schemaVersion, CURRENT_SCHEMA_VERSION, 'Phase B: v0.19.0 must restore _meta after v0.15.5 save');
  assert.strictEqual(v19ReopenedLogs.envelope.data.length, 3);
  assert.strictEqual(v19ReopenedLogs.envelope.data[2].scheduledFor, localSlot1115Iso, 'Phase B: 11:15 v0.15.5 log must be seeded with scheduledFor');

  // Reconcile at 12:00 local time after all 3 slots (09:15, 10:15, 11:15) have been played across both versions
  const referenceNow1200 = new Date(2026, 9, 19, 12, 0, 0, 0);
  const summaryAt1200 = reconcileScheduleAndLogs(
    '2026-10-19',
    clientNormalizedAnns,
    [],
    v19ReopenedLogs.envelope.data,
    referenceNow1200
  );

  assert.strictEqual(summaryAt1200.totalPlanned, 3, 'Phase B: All 3 scheduled slots must be evaluated');
  assert.strictEqual(summaryAt1200.totalPlayed, 3, 'Phase B: All 3 slots (logged across v0.15.5 and v0.19.0) must count as PLAYED');
  assert.strictEqual(summaryAt1200.totalMissed, 0, 'Phase B: 0 missed slots when all 3 slots were played across v0.15.5 and v0.19.0');
  assert.ok(
    summaryAt1200.slots.every(slot => slot.status === 'PLAYED'),
    'Phase B: Every slot in summaryAt1200.slots must have status PLAYED'
  );

  console.log('✓ Stage 3: Cross-Version Ping-Pong Coexistence Suite (Phase A & Phase B) verified.');

  // ---------------------------------------------------------------------------
  // 7. Stage 4: Station Timezone, 0.15.4 Revision Backfill & Cross-DST Prerecord
  // ---------------------------------------------------------------------------
  assert.strictEqual(postShowsObj.stationTimezone, DEFAULT_STATION_TIMEZONE, 'shows.json envelope must persist default stationTimezone (America/Chicago)');
  assert.strictEqual(postShowsObj._meta.stationTimezone, DEFAULT_STATION_TIMEZONE, 'shows.json _meta must persist default stationTimezone');

  // Verify 0.15.4 backfill for minute-changed campaign (:30 in Sept -> :40 in Oct)
  const legacyMutatedAnnPayload = {
    AnnouncementsBackupCounter: 5,
    data: [
      {
        id: '100008',
        name: 'Music & More Donations',
        type: 'basic-hourly',
        enabled: true,
        minute: 40,
        days: [0, 1, 2, 3, 4, 5, 6],
        hours: [19],
        startDate: '2026-09-01',
        endDate: '2026-11-30',
        timeGatedMp3s: [{ id: 'm1', mp3Url: 'MusicMore.txt', startDate: '2026-09-01' }]
      }
    ]
  };
  const legacyMutatedLogs = [
    {
      announcementId: '100008',
      announcementName: 'Music & More Donations',
      timestamp: stationLocalToUtcIso('2026-09-15T19:30:00'),
      announcementTime: stationLocalToUtcIso('2026-09-15T19:30:00'),
      status: 'played' as const
    },
    {
      announcementId: '100008',
      announcementName: 'Music & More Donations',
      timestamp: stationLocalToUtcIso('2026-10-05T19:40:00'),
      announcementTime: stationLocalToUtcIso('2026-10-05T19:40:00'),
      status: 'played' as const
    }
  ];
  const backfilledAnnRes = migrateAnnouncementsPayload(legacyMutatedAnnPayload, CURRENT_APP_VERSION, 5, legacyMutatedLogs);
  const backfilledAnn = backfilledAnnRes.data[0];
  assert.strictEqual(backfilledAnn.revisions.length, 1, '0.15.4 minute-mutated announcement must synthesize 1 prior revision');
  assert.strictEqual(backfilledAnn.revisions[0].minute, 30, 'Synthesized prior revision must preserve historical :30 minute');

  const septReconcile = reconcileScheduleAndLogs('2026-09-15', [backfilledAnn], [], legacyMutatedLogs, new Date(2026, 9, 20, 12, 0));
  assert.strictEqual(septReconcile.totalPlayed, 1, 'September 15 :30 log must reconcile as PLAYED via synthesized revision');
  assert.strictEqual(septReconcile.totalExtra, 0, 'September 15 :30 log must not be flagged as EXTRA');

  // Verify Cross-DST Prerecord / Export (logged in Oct CDT for Nov 4 CST after Nov 1 DST transition)
  const nov4SlotWallClock = new Date(2026, 10, 4, 19, 40, 0, 0); // Nov 4, 2026 19:40 CST
  const nov4SlotUtcIso = stationSlotDateToUtcIso(nov4SlotWallClock);
  assert.strictEqual(nov4SlotUtcIso, '2026-11-05T01:40:00.000Z', 'Nov 4 19:40 America/Chicago must resolve to CST (UTC-6 = 01:40Z next day) even when prerecorded in October');
  const prerecordLogEntry = seedLogEntrySiblings({
    timestamp: '2026-10-28T15:00:00.000Z', // Executed a week early during CDT
    announcementTime: nov4SlotUtcIso,
    mp3Name: 'MusicMore.txt',
    announcementName: 'Music & More Donations',
    announcementId: '100008',
    status: 'played',
    playMode: 'Prerecord'
  });
  assert.strictEqual(isLogForStationSlot(prerecordLogEntry, nov4SlotWallClock), true, 'isLogForStationSlot must match cross-DST prerecorded slot');
  assert.strictEqual(isLogPrerecordOrExport(prerecordLogEntry), true, 'Prerecord log must be classified as prerecord/export');

  // Verify Live Read log (where executedAt is a few seconds after scheduledFor) is NOT marked as Prerecord
  const liveReadLogEntry = seedLogEntrySiblings({
    timestamp: '2026-10-18T16:15:14.231Z',
    announcementTime: '2026-10-18T16:15:00.000Z',
    logTimeStamp: '2026-10-18T16:15:14.231Z',
    mp3Name: 'StationID.txt',
    announcementName: 'Top of Hour Live Read',
    announcementId: '100001',
    status: 'played',
    playMode: 'Live'
  });
  assert.strictEqual(isLogPrerecordOrExport(liveReadLogEntry), false, 'Live read log must NOT be classified as prerecord');

  console.log('✓ Stage 4: Station Timezone, 0.15.4 Revision Backfill & Cross-DST Prerecord verified.');

  // ---------------------------------------------------------------------------
  // 8. Stage 5: Legacy Live Read WPM Estimate Backfill (#28 / #5b)
  // ---------------------------------------------------------------------------
  const mediaAnnouncementsDir = path.join(tempDir, 'media_announcements');
  fs.mkdirSync(mediaAnnouncementsDir, { recursive: true });

  // 38 words -> ceil(38 / 2.5) = 16s -> rounded to nearest 5s = 20s ("0m20s")
  const sample38WordScript =
    '<!-- Format comment -->\n' +
    'Support **community radio** today by donating your old vehicle! ' +
    'Call *1-800-555-0199* or visit our website right now. ' +
    'Every car, truck, or boat helps keep local music and independent public affairs on the air all year long. Thank you!';
  fs.writeFileSync(path.join(mediaAnnouncementsDir, 'CarDonationLiveRead.txt'), sample38WordScript, 'utf-8');

  // 75 words -> ceil(75 / 2.5) = 30s -> "0m30s"
  const sample75WordInline = Array.from({ length: 75 }, (_, i) => `word${i + 1}`).join(' ');

  const legacyReadCardsPayload = {
    AnnouncementsBackupCounter: 7,
    data: [
      {
        id: 'legacy-read-disk-txt',
        name: 'Vehicle Donation Live Read',
        type: 'basic-hourly',
        enabled: false,
        minute: 20,
        days: [1, 2, 3, 4, 5],
        hours: [9, 12, 15],
        startDate: '2026-05-01',
        endDate: '2026-08-15',
        timeGatedMp3s: [
          {
            id: 'slot-disk-txt',
            mp3Url: 'CarDonationLiveRead.txt',
            startDate: '2026-05-01T00:00',
            endDate: '2026-08-15T23:59',
            approximateReadTime: null
          }
        ]
      },
      {
        id: 'legacy-read-inline-text',
        name: 'Inline Script Card',
        type: 'basic-hourly',
        enabled: true,
        minute: 50,
        days: [0, 6],
        hours: [10],
        mp3Url: 'InlineCommunityNotice.txt',
        text: sample75WordInline
      },
      {
        id: 'legacy-read-existing-estimate',
        name: 'Existing Estimate Preserved',
        type: 'basic-hourly',
        enabled: true,
        minute: 10,
        days: [1],
        hours: [8],
        timeGatedMp3s: [
          {
            id: 'slot-existing-est',
            mp3Url: 'CarDonationLiveRead.txt',
            startDate: '2026-01-01T00:00',
            approximateReadTime: '0m45s'
          }
        ]
      },
      {
        id: 'legacy-read-pdf-no-text',
        name: 'PDF Underwriting Sheet',
        type: 'basic-hourly',
        enabled: true,
        minute: 25,
        days: [2],
        hours: [11],
        timeGatedMp3s: [
          {
            id: 'slot-pdf',
            mp3Url: 'SponsorSheet.pdf',
            startDate: '2026-01-01T00:00'
          }
        ]
      }
    ]
  };

  const wpmBackfillRes = migrateAnnouncementsPayload(
    legacyReadCardsPayload,
    CURRENT_APP_VERSION,
    7,
    [],
    (mp3Url: string) => {
      const candidate = path.join(mediaAnnouncementsDir, path.basename(mp3Url));
      return fs.existsSync(candidate) ? fs.readFileSync(candidate, 'utf-8') : null;
    }
  );

  const migratedDiskTxtCard = wpmBackfillRes.data[0];
  assert.strictEqual(
    migratedDiskTxtCard.timeGatedMp3s[0].mp3Url,
    'CarDonationLiveRead.txt',
    'Flat mp3Url sibling must be mirrored on migrated TimeGatedMp3 gate for v0.15.4/0.15.5 overlap compatibility'
  );
  assert.strictEqual(
    migratedDiskTxtCard.timeGatedMp3s[0].mediaItems[0].approximateReadTime,
    '0m20s',
    'Legacy .txt read card with null approximateReadTime must be backfilled with ~150 WPM estimate (0m20s)'
  );
  assert.strictEqual(
    migratedDiskTxtCard.revisions.length,
    1,
    'Disabled legacy read card with endDate must also synthesize historical revision'
  );
  assert.strictEqual(
    migratedDiskTxtCard.revisions[0].timeGatedMp3s[0].mediaItems[0].approximateReadTime,
    '0m20s',
    'Synthesized historical revision must also carry the backfilled 0m20s WPM estimate'
  );

  const migratedInlineCard = wpmBackfillRes.data[1];
  assert.strictEqual(
    migratedInlineCard.timeGatedMp3s[0].mediaItems[0].approximateReadTime,
    '0m30s',
    'Legacy read card with 75-word inline text must be backfilled with 0m30s WPM estimate'
  );

  const migratedExistingEstCard = wpmBackfillRes.data[2];
  assert.strictEqual(
    migratedExistingEstCard.timeGatedMp3s[0].mediaItems[0].approximateReadTime,
    '0m45s',
    'Legacy read card that already has approximateReadTime must preserve its existing value'
  );

  const migratedPdfCard = wpmBackfillRes.data[3];
  assert.strictEqual(
    migratedPdfCard.timeGatedMp3s[0].mediaItems[0].approximateReadTime,
    '',
    'Non-text PDF script card without readable text must remain empty string'
  );

  console.log('✓ Stage 5: Legacy Live Read WPM Estimate Backfill (#28) verified.');

  // ---------------------------------------------------------------------------
  // 9. PART 4: Multi-Item Time-Gate Rotation (#25) & CARtober Consolidation
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 6: Verifying Multi-Item Time-Gate Rotation (#25) & CARtober Consolidation...');

  // 9a. Consolidate the 4 CARtober schedules (100021, 100022, 100023, 100024) into 1 schedule with 4 rotating files
  const all168GridRules = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => `${d}-${h}`)
  ).flat();

  const consolidatedCartober: Announcement = normalizeAnnouncement({
    id: '100021',
    name: 'CARtober',
    type: AnnouncementType.ADVANCED,
    enabled: true,
    minute: 40,
    gridRules: all168GridRules,
    startDate: '2026-10-01T00:00',
    endDate: '2026-11-01T00:00',
    timeGatedMp3s: [
      {
        id: 'gate-cartober-oct',
        startDate: '2026-10-01T00:00',
        endDate: '2026-11-01T00:00',
        mediaItems: [
          { mp3Url: 'Promo-Live-General CARtober 1.txt', assetType: 'script', approximateReadTime: '~0m20s' },
          { mp3Url: 'Promo-Live-General CARtober 2.txt', assetType: 'script', approximateReadTime: '~0m20s' },
          { mp3Url: 'Promo-Live-General CARtober 3.txt', assetType: 'script', approximateReadTime: '~0m20s' },
          { mp3Url: 'Promo-Live-General CARtober 4.txt', assetType: 'script', approximateReadTime: '~0m20s' }
        ]
      }
    ],
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-10-01T00:00:00.000Z',
      lastModifiedBy: 'Admin',
      lastModifiedDate: '2026-10-01T00:00:00.000Z'
    }
  });

  // Verify mediaItems elements do not carry synthetic sub-item IDs (#31 Option C)
  for (const mItem of consolidatedCartober.timeGatedMp3s![0].mediaItems!) {
    assert.strictEqual(
      (mItem as any).id,
      undefined,
      'Normalized TimeGatedMediaItem must not carry a synthetic sub-item id'
    );
  }

  // Verify cycling across 6 consecutive hours starting at 2026-10-01 00:40 (1, 2, 3, 4, 1, 2)
  const expectedRotation = [
    { hour: 0, idx: 1, file: 'Promo-Live-General CARtober 1.txt' },
    { hour: 1, idx: 2, file: 'Promo-Live-General CARtober 2.txt' },
    { hour: 2, idx: 3, file: 'Promo-Live-General CARtober 3.txt' },
    { hour: 3, idx: 4, file: 'Promo-Live-General CARtober 4.txt' },
    { hour: 4, idx: 1, file: 'Promo-Live-General CARtober 1.txt' },
    { hour: 5, idx: 2, file: 'Promo-Live-General CARtober 2.txt' }
  ];

  for (const step of expectedRotation) {
    const slotDt = new Date(2026, 9, 1, step.hour, 40, 0, 0);
    const resolved = getActiveMp3ForSlot(consolidatedCartober, slotDt);
    assert(resolved, `Must resolve active item for hour ${step.hour}`);
    assert.strictEqual(resolved.id, 'gate-cartober-oct', 'Resolved slot id must preserve parent gate.id');
    assert.strictEqual(resolved.mp3Url, step.file, `Hour ${step.hour} must select ${step.file}`);
    assert.strictEqual(resolved.rotationIndex, step.idx, `Hour ${step.hour} must have rotationIndex ${step.idx}`);
    assert.strictEqual(resolved.rotationTotal, 4, 'Rotation total must be 4');
    assert.strictEqual(
      formatRotatedAnnouncementName(consolidatedCartober.name, resolved),
      `CARtober (${step.idx}/4)`,
      'Rotated announcement name must append (idx/4)'
    );
    assert.strictEqual(
      formatRotatedFileName(resolved.mp3Url, resolved),
      `(${step.idx}/4) ${step.file}`,
      'Rotated filename must prepend (idx/4)'
    );
  }

  // 9b. Verify ONE_TIME announcement with multiple items always uses the first item
  const oneTimeMulti: Announcement = normalizeAnnouncement({
    id: 'onetime-multi',
    name: 'Special Event',
    type: AnnouncementType.ONE_TIME,
    enabled: true,
    date: '2026-10-15',
    time: '14',
    minute: 0,
    timeGatedMp3s: [
      {
        id: 'gate-onetime',
        startDate: '2026-10-01T00:00',
        mediaItems: [
          { mp3Url: 'EventFirst.mp3', assetType: 'audio' },
          { mp3Url: 'EventSecond.mp3', assetType: 'audio' }
        ]
      }
    ],
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-10-01T00:00:00.000Z',
      lastModifiedBy: 'Admin',
      lastModifiedDate: '2026-10-01T00:00:00.000Z'
    }
  });
  const oneTimeResolved = getActiveMp3ForSlot(oneTimeMulti, new Date(2026, 9, 15, 14, 0, 0));
  assert(oneTimeResolved, 'One-Time announcement must resolve active item');
  assert.strictEqual(oneTimeResolved.mp3Url, 'EventFirst.mp3', 'One-Time announcement must always select the 1st item');
  assert.strictEqual(oneTimeResolved.rotationIndex, 1, 'One-Time announcement rotationIndex must be 1');

  console.log('✓ Stage 6: Multi-Item Time-Gate Rotation (#25) & CARtober 4-into-1 consolidation verified.');

  // ---------------------------------------------------------------------------
  // 10. Stage 7: Unified ScheduleEngine Domain Verification (#35)
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 7: Verifying Unified ScheduleEngine (#35) Slot, Gate, Rotation & Promo Domain...');

  // 10a. Verify Advanced announcement with legacy `days` + `hours` (empty `gridRules`) matches in both 1-min slot and hour cell
  const legacyAdvancedAnn: Announcement = normalizeAnnouncement({
    id: 'legacy-adv-1',
    name: 'Legacy Days/Hours Advanced',
    type: AnnouncementType.ADVANCED,
    enabled: true,
    minute: 15,
    days: [1, 3], // Monday, Wednesday
    hours: [9, 14],
    gridRules: [],
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    timeGatedMp3s: [
      {
        id: 'gate-legacy-adv',
        startDate: '2026-10-01T00:00',
        endDate: '2026-10-31T23:59',
        mediaItems: [
          { mp3Url: 'AdvTrack1.mp3', assetType: 'audio' },
          { mp3Url: 'AdvTrack2.mp3', assetType: 'audio' },
          { mp3Url: 'AdvTrack3.mp3', assetType: 'audio' },
        ],
      },
    ],
  });

  // 2026-10-05 is a Monday
  const mon915 = new Date(2026, 9, 5, 9, 15, 0, 0);
  const mon916 = new Date(2026, 9, 5, 9, 16, 0, 0);
  const tue915 = new Date(2026, 9, 6, 9, 15, 0, 0);

  assert.strictEqual(
    isAnnouncementScheduledAtSlot(legacyAdvancedAnn, mon915),
    true,
    'Legacy days/hours ADVANCED announcement must match Monday 09:15 slot'
  );
  assert.strictEqual(
    isAnnouncementScheduledAtSlot(legacyAdvancedAnn, mon916),
    false,
    'Legacy days/hours ADVANCED announcement must not match Monday 09:16 slot'
  );
  assert.strictEqual(
    isAnnouncementScheduledAtSlot(legacyAdvancedAnn, tue915),
    false,
    'Legacy days/hours ADVANCED announcement must not match Tuesday 09:15 slot'
  );
  assert.strictEqual(
    isAnnouncementActiveInHour(legacyAdvancedAnn, mon915, 9, '2026-10-05', 1),
    true,
    'isAnnouncementActiveInHour must support legacy days/hours fallback'
  );
  assert.strictEqual(
    getAnnouncementsForSlot([legacyAdvancedAnn, consolidatedCartober], mon915).length,
    1,
    'getAnnouncementsForSlot must filter matching announcements at 09:15'
  );

  // 10b. Verify O(1) multi-week rotation across legacy days/hours (4 slots/week: Mon 9, Mon 14, Wed 9, Wed 14)
  // Effective start: Thu Oct 1, 2026 00:00 ->
  // Occurrence 0: Mon Oct 5 09:15 -> item 1
  // Occurrence 1: Mon Oct 5 14:15 -> item 2
  // Occurrence 2: Wed Oct 7 09:15 -> item 3
  // Occurrence 3: Wed Oct 7 14:15 -> item 1
  const wed1415 = new Date(2026, 9, 7, 14, 15, 0, 0);
  const resolvedMon915 = getActiveMp3ForSlot(legacyAdvancedAnn, mon915);
  const resolvedWed1415 = getActiveMp3ForSlot(legacyAdvancedAnn, wed1415);
  assert.strictEqual(resolvedMon915?.rotationIndex, 1, 'Mon Oct 5 09:15 (occurrence 0) must resolve to rotationIndex 1');
  assert.strictEqual(resolvedWed1415?.rotationIndex, 1, 'Wed Oct 7 14:15 (occurrence 3, 3 % 3 === 0) must wrap to rotationIndex 1');

  // 10c. Verify strict getMatchingMp3sForSlot vs. preview fallback getActiveMp3ForSlot
  const futureGateAnn: Announcement = normalizeAnnouncement({
    id: 'future-gate-1',
    name: 'Future Gate Only',
    type: AnnouncementType.BASIC_HOURLY,
    enabled: true,
    minute: 0,
    startDate: '2026-10-01T00:00',
    timeGatedMp3s: [
      {
        id: 'gate-future',
        startDate: '2026-10-10T00:00',
        mediaItems: [{ mp3Url: 'FutureSpot.mp3', assetType: 'audio' }],
      },
    ],
  });
  const oct5NoonMs = new Date(2026, 9, 5, 12, 0, 0, 0).getTime();
  assert.strictEqual(
    getMatchingMp3sForSlot(futureGateAnn, oct5NoonMs).length,
    0,
    'Strict getMatchingMp3sForSlot must return 0 items during a leading gap before gate startDate'
  );
  assert.strictEqual(
    getActiveMp3ForSlot(futureGateAnn, oct5NoonMs),
    null,
    'getActiveMp3ForSlot must strictly return null during a leading gap (no future-gate fallback)'
  );

  // 10d. Verify contiguous midnight transition & overnight show wrapping
  assert.strictEqual(
    isContiguousMidnightTransition('2026-10-10T23:59', '2026-10-11T00:00'),
    true,
    '23:59 to next-day 00:00 must be recognized as contiguous midnight coverage'
  );
  const saturdayNightShow: Show = {
    id: 'show-sat-night',
    name: 'Show Spacer 1',
    host: 'Host 1',
    day: 'Saturday',
    startHour: 22,
    startMinute: 0,
    durationHours: 4,
    durationMinutes: 0,
    active: true,
  };
  assert.strictEqual(
    isTimeInShow(saturdayNightShow, 'Sunday', 1, 30),
    true,
    'Overnight Saturday 10 PM (4 hr) show must wrap into Sunday 1:30 AM'
  );
  assert.strictEqual(
    getShowsForSlot([saturdayNightShow], new Date(2026, 9, 4, 1, 30, 0)).length,
    1,
    'getShowsForSlot must resolve wrapped Sunday 1:30 AM show'
  );

  // 10e. Verify Virtual Up Next Promo Synthesis & File Schedule Usage Map
  const promos = buildUpNextPromoAnnouncements([saturdayNightShow], { enabled: true, minutesBefore: 20 });
  assert.strictEqual(promos.length, 1, 'buildUpNextPromoAnnouncements must synthesize 1 promo');
  assert.strictEqual(promos[0].minute, 40, '20 minutes before 22:00 must schedule promo at :40');
  assert.deepStrictEqual(promos[0].gridRules, ['6-21'], 'Saturday 22:00 minus 20m must target Saturday (6) hour 21');

  const usageMap = computeFileScheduleUsageMap([legacyAdvancedAnn]);
  assert.strictEqual(usageMap.get('advtrack1.mp3')?.isUsed, true, 'computeFileScheduleUsageMap must index rotating media items');
  assert.strictEqual(usageMap.get('advtrack3.mp3')?.isUsed, true, 'computeFileScheduleUsageMap must index all rotating media items');

  console.log('✓ Stage 7: Unified ScheduleEngine (#35) Domain Verification passed.');

  // ---------------------------------------------------------------------------
  // 11. Stage 8: Domain Hygiene, TimeGatedMp3 Overlap Bridge, MediaCatalogStore & Local Path Resolution (#36)
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 8: Verifying #36 TimeGatedMp3 v0.15.4/5 Overlap Bridge, mediaCatalogStore & resolveEffectiveLocalPaths...');

  // 11a. TimeGatedMp3 v0.19.5 -> v0.15.5 -> v0.19.5 Ping-Pong Overlap Bridge
  // Step 1: v0.19.5 saves an announcement with mediaItems[]
  const v19SavedGate = normalizeAnnouncement({
    id: 'overlap-gate-1',
    name: 'Overlap Spot',
    type: AnnouncementType.BASIC_HOURLY,
    enabled: true,
    minute: 20,
    timeGatedMp3s: [
      {
        id: 'gate-overlap-1',
        startDate: '2026-10-01T00:00',
        mediaItems: [
          {
            mp3Url: 'SpotV19.mp3',
            assetType: 'audio',
            duration: '30',
            fileSize: 123456,
          },
        ],
      },
    ],
  });
  assert.strictEqual(
    v19SavedGate.timeGatedMp3s![0].mp3Url,
    'SpotV19.mp3',
    'v0.19.5 normalized gate must mirror mediaItems[0].mp3Url onto flat gate.mp3Url for v0.15.4/5'
  );
  assert.strictEqual(
    v19SavedGate.timeGatedMp3s![0].duration,
    '30',
    'v0.19.5 normalized gate must mirror mediaItems[0].duration onto flat gate.duration for v0.15.4/5'
  );

  // Step 2: Simulate v0.15.5 workstation editing the flat gate fields without updating mediaItems[0]
  const v15EditedRaw = {
    ...v19SavedGate,
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-10-01T00:00:00.000Z',
      lastModifiedBy: '0.15.5',
      lastModifiedDate: '2026-10-02T00:00:00.000Z',
    },
    timeGatedMp3s: [
      {
        ...v19SavedGate.timeGatedMp3s![0],
        mp3Url: 'SpotEditedByV15.txt',
        assetType: 'script' as const,
        approximateReadTime: '~0m15s',
        backupMp3Url: 'BackupV15.mp3',
        duration: undefined,
      },
    ],
  };

  // Step 3: Verify both normalizeAnnouncement (client) and migrateAnnouncementsPayload (server) reconcile v0.15.5 edit into mediaItems[0]
  const reconciledClient = normalizeAnnouncement(v15EditedRaw);
  assert.strictEqual(
    reconciledClient.timeGatedMp3s![0].mediaItems![0].mp3Url,
    'SpotEditedByV15.txt',
    'Client normalizeAnnouncement must reconcile v0.15.5 flat gate.mp3Url edit into mediaItems[0].mp3Url'
  );
  assert.strictEqual(
    reconciledClient.timeGatedMp3s![0].mediaItems![0].assetType,
    'script',
    'Client normalizeAnnouncement must reconcile v0.15.5 flat gate.assetType edit into mediaItems[0].assetType'
  );
  assert.strictEqual(
    reconciledClient.timeGatedMp3s![0].mediaItems![0].backupMp3Url,
    'BackupV15.mp3',
    'Client normalizeAnnouncement must reconcile v0.15.5 flat gate.backupMp3Url edit into mediaItems[0].backupMp3Url'
  );

  const reconciledServer = migrateAnnouncementsPayload([v15EditedRaw], CURRENT_APP_VERSION, 1).envelope.data[0];
  assert.strictEqual(
    reconciledServer.timeGatedMp3s![0].mediaItems![0].mp3Url,
    'SpotEditedByV15.txt',
    'Server migrateAnnouncementsPayload must reconcile v0.15.5 flat gate.mp3Url edit into mediaItems[0].mp3Url'
  );
  assert.strictEqual(
    reconciledServer.timeGatedMp3s![0].mp3Url,
    'SpotEditedByV15.txt',
    'Server migrateAnnouncementsPayload must keep flat gate.mp3Url sibling aligned'
  );

  // 11b. Verify mediaCatalogStore (upsertMediaCatalogFile & syncMediaCatalogFiles)
  syncMediaCatalogFiles(
    [
      { name: 'CatalogTrack1.mp3', path: '/media/CatalogTrack1.mp3', size: 2048, duration: '15' },
      { name: 'CatalogScript1.txt', path: 'drive-id-999', size: 512, approximateReadTime: '~0m10s' },
    ],
    { clearExisting: true }
  );
  assert.strictEqual(availableFilesCache.size, 2, 'syncMediaCatalogFiles with clearExisting must populate 2 entries');
  assert.strictEqual(
    mediaCatalogStore.getFile('CatalogTrack1.mp3')?.duration,
    '15',
    'mediaCatalogStore.getFile must return cached duration'
  );
  assert.strictEqual(
    driveFileNameCache.get('drive-id-999'),
    'CatalogScript1.txt',
    'syncMediaCatalogFiles must index path -> name in driveFileNameCache'
  );
  // Upsert without duration should preserve prior cached duration
  upsertMediaCatalogFile({ name: 'CatalogTrack1.mp3', path: '/media/CatalogTrack1.mp3', size: 4096 });
  assert.strictEqual(
    mediaCatalogStore.getFile('CatalogTrack1.mp3')?.duration,
    '15',
    'upsertMediaCatalogFile must preserve existing non-empty duration when new duration is omitted'
  );
  assert.strictEqual(
    mediaCatalogStore.getFile('CatalogTrack1.mp3')?.size,
    4096,
    'upsertMediaCatalogFile must update file size'
  );

  // 11c. Verify resolveEffectiveLocalPaths across unified localPathAmp and legacy 3-folder overrides
  const unifiedResolved = resolveEffectiveLocalPaths({
    mode: 'Local',
    localPathAmp: '/Users/station/AMP',
  });
  assert.strictEqual(unifiedResolved.hasValidLocalConfig, true, 'localPathAmp alone must satisfy hasValidLocalConfig');
  assert.strictEqual(unifiedResolved.localPathAmp, '/Users/station/AMP');

  const legacyThreeFolderResolved = resolveEffectiveLocalPaths({
    mode: 'Local',
    localPathAmp: '',
    localPathMP3s: '/legacy/mp3s',
    localPathCalendar: '/legacy/settings',
    localPathLogs: '/legacy/logs',
  });
  assert.strictEqual(
    legacyThreeFolderResolved.hasValidLocalConfig,
    true,
    'Legacy 3-folder config (localPathMP3s + localPathCalendar + localPathLogs) must satisfy hasValidLocalConfig'
  );
  assert.strictEqual(legacyThreeFolderResolved.mediaAnnouncements, '/legacy/mp3s');
  assert.strictEqual(legacyThreeFolderResolved.settingsDir, '/legacy/settings');
  assert.strictEqual(legacyThreeFolderResolved.logsDir, '/legacy/logs');

  const incompleteLocalResolved = resolveEffectiveLocalPaths({
    mode: 'Local',
    localPathAmp: '',
    localPathMP3s: '/legacy/mp3s',
  });
  assert.strictEqual(
    incompleteLocalResolved.hasValidLocalConfig,
    false,
    'Partial legacy config without localPathAmp must report hasValidLocalConfig: false'
  );

  console.log('✓ Stage 8: #36 TimeGatedMp3 Overlap Bridge, mediaCatalogStore & resolveEffectiveLocalPaths verified.');

  // ---------------------------------------------------------------------------
  // 12. Stage 9: #43 & #113 Schema Lineage & Gate Guard Verification (LIN-1..LIN-6)
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 9: Verifying #43/#113 Lineage Metadata, Gate-First Attribution, Played Bounds & Revision Snapshots...');

  // 12a. LIN-1: seedLogEntrySiblings preserves optional gateId, rotationIndex, rotationTotal with v0.15.4 coexistence
  const seededLineageLog = seedLogEntrySiblings({
    timestamp: '2026-11-18T22:00:05.000Z',
    announcementTime: '2026-11-18T22:00:00.000Z',
    mp3Name: 'SponsorSpotA.mp3',
    announcementName: 'Lineage Test (1/2)',
    announcementId: 'lin-ann-1',
    status: 'played',
    playMode: 'Live',
    assetType: 'audio',
    gateId: 'gate-lin-1',
    rotationIndex: 1,
    rotationTotal: 2,
  });
  assert.strictEqual(seededLineageLog.gateId, 'gate-lin-1', 'LIN-1: seedLogEntrySiblings must preserve gateId');
  assert.strictEqual(seededLineageLog.rotationIndex, 1, 'LIN-1: seedLogEntrySiblings must preserve rotationIndex');
  assert.strictEqual(seededLineageLog.rotationTotal, 2, 'LIN-1: seedLogEntrySiblings must preserve rotationTotal');
  assert.strictEqual(seededLineageLog.scheduledFor, '2026-11-18T22:00:00.000Z', 'LIN-1: v0.15.4/5 sibling fields must remain populated');

  // 12b. LIN-2: gateId-first attribution prevents filename reuse from stealing logs across gates; legacy fallback still works
  const linAnn: Announcement = normalizeAnnouncement({
    id: 'lin-ann-1',
    name: 'Lineage Test',
    type: AnnouncementType.BASIC_HOURLY,
    enabled: true,
    minute: 0,
    startDate: '2026-11-10T00:00',
    endDate: '2026-11-30T23:59',
    timeGatedMp3s: [
      {
        id: 'gate-lin-1',
        startDate: '2026-11-10T00:00',
        endDate: '2026-11-25T23:59',
        mediaItems: [{ mp3Url: 'SponsorSpotA.mp3', assetType: 'audio' }],
      },
      {
        id: 'gate-lin-2',
        startDate: '2026-11-10T00:00',
        endDate: '2026-11-30T23:59',
        mediaItems: [{ mp3Url: 'SponsorSpotA.mp3', assetType: 'audio' }],
      },
    ],
  });
  const linLogs = [
    {
      timestamp: stationLocalToUtcIso('2026-11-18T14:00:05', DEFAULT_STATION_TIMEZONE),
      announcementTime: stationLocalToUtcIso('2026-11-18T14:00:00', DEFAULT_STATION_TIMEZONE),
      mp3Name: 'SponsorSpotA.mp3',
      announcementName: 'Lineage Test',
      announcementId: 'lin-ann-1',
      status: 'played' as const,
      playMode: 'Live' as const,
      gateId: 'gate-lin-1',
      rotationIndex: 1,
      rotationTotal: 1,
    },
    {
      // Legacy log without gateId — should match via legacy window + filename fallback
      timestamp: stationLocalToUtcIso('2026-11-17T10:00:05', DEFAULT_STATION_TIMEZONE),
      announcementTime: stationLocalToUtcIso('2026-11-17T10:00:00', DEFAULT_STATION_TIMEZONE),
      mp3Name: 'SponsorSpotA.mp3',
      announcementName: 'Lineage Test',
      announcementId: 'lin-ann-1',
      status: 'played' as const,
      playMode: 'Live' as const,
    },
  ];
  const linRefNow = new Date(2026, 10, 20, 12, 0, 0); // 2026-11-20T12:00
  const gate1Eval = calculateGateSlotAssessment(linAnn, linAnn.timeGatedMp3s![0], linLogs, linRefNow);
  const gate2Eval = calculateGateSlotAssessment(linAnn, linAnn.timeGatedMp3s![1], linLogs, linRefNow);
  assert.strictEqual(gate1Eval.gateScore.played, 2, 'LIN-2: Gate #1 must receive both its gateId-matched log and legacy fallback log');
  assert.strictEqual(gate2Eval.gateScore.played, 1, 'LIN-2: Gate #2 must NOT steal Gate #1 gateId-tagged log despite identical filename');
  assert.strictEqual(gate1Eval.firstPlayedLocalIso, '2026-11-17T10:00', 'LIN-2: firstPlayedLocalIso must match earliest played slot');
  assert.strictEqual(gate1Eval.lastPlayedLocalIso, '2026-11-18T14:00', 'LIN-2: lastPlayedLocalIso must match latest played slot');

  // 12c. LIN-3 & LIN-4: Moving a played gate's End date into the past BEFORE lastPlayedLocalIso MUST hard-block (never skipped as expired)
  const savedGatesForLin = [linAnn.timeGatedMp3s![0]];
  const shortenedDraftGate = {
    ...linAnn.timeGatedMp3s![0],
    endDate: '2026-11-18T12:00', // Past (< 2026-11-20T12:00) AND before last play (2026-11-18T14:00)
  };
  const linBounds = computePlayedGateBoundsMap(linAnn, [shortenedDraftGate], linLogs, savedGatesForLin, linRefNow);
  assert.strictEqual(linBounds['gate-lin-1'].playCount, 2, 'LIN-3: computePlayedGateBoundsMap must union saved + draft plays');
  const shortenedValidation = validateTimeGatedMp3s(
    [shortenedDraftGate],
    '2026-11-20T12:00',
    '2026-11-30T23:59',
    '2026-11-10T00:00',
    linBounds,
    new Set<string>()
  );
  assert.strictEqual(
    shortenedValidation.hasBlockingErrors,
    true,
    'LIN-3: Shortening a played gate End below lastPlayedLocalIso (even into the past) MUST hard-block'
  );
  assert(
    shortenedValidation.blockingErrors.some(e => e.includes('END cannot be moved before its last logged play')),
    'LIN-3: blockingErrors must explicitly cite last logged play bound'
  );
  assert(
    shortenedValidation.blockingErrors.every(e => !e.startsWith('Gate #1: Gate #')),
    'LIN-4: blockingErrors must never double-prefix Gate #'
  );

  // 12d. LIN-3: Moving Parent Announcement End before last play or Start after first play MUST hard-block
  const parentShortenedValidation = validateTimeGatedMp3s(
    savedGatesForLin,
    '2026-11-20T12:00',
    '2026-11-18T10:00', // Parent End before last play 2026-11-18T14:00
    '2026-11-17T12:00', // Parent Start after first play 2026-11-17T10:00
    linBounds,
    new Set<string>()
  );
  assert.strictEqual(parentShortenedValidation.hasBlockingErrors, true, 'LIN-3: Parent Start/End violating played bounds MUST hard-block');
  assert.strictEqual(parentShortenedValidation.parentBlockingErrors.length, 2, 'LIN-3: Both Parent Start and Parent End played violations must be reported');

  // 12e. LIN-3/LIN-4: Active gate edited to inverted Start > End with past End MUST hard-block; pre-existing expired gate skipped
  const invertedPastDraft = {
    id: 'gate-inv-1',
    startDate: '2026-11-21T00:00',
    endDate: '2026-11-19T23:59', // Past (< now), yet Start > End
    mediaItems: [{ mp3Url: 'Spot.mp3', assetType: 'audio' as const }],
  };
  const invValidation = validateTimeGatedMp3s([invertedPastDraft], '2026-11-20T12:00', undefined, undefined, undefined, new Set<string>());
  assert.strictEqual(invValidation.hasBlockingErrors, true, 'LIN-4: Inverted Start > End with past End must hard-block');
  const preExistingSkipped = validateTimeGatedMp3s(
    [invertedPastDraft],
    '2026-11-20T12:00',
    undefined,
    undefined,
    undefined,
    new Set<string>(['gate-inv-1'])
  );
  assert.strictEqual(preExistingSkipped.hasBlockingErrors, false, 'LIN-4: Pre-existing expired gates in preExistingExpiredIds must not trap unrelated edits');

  // 12f. LIN-4: Overlap is hard-blocking (deduplicated once); schedule gap is soft warning only
  const overlapValidation = validateTimeGatedMp3s(
    [
      { id: 'g-a', startDate: '2026-11-20T00:00', endDate: '2026-11-25T23:59', mediaItems: [{ mp3Url: 'A.mp3', assetType: 'audio' }] },
      { id: 'g-b', startDate: '2026-11-23T00:00', endDate: '2026-11-28T23:59', mediaItems: [{ mp3Url: 'B.mp3', assetType: 'audio' }] },
    ],
    '2026-11-20T12:00'
  );
  assert.strictEqual(overlapValidation.hasBlockingErrors, true, 'LIN-4: Overlapping active gates must hard-block');
  assert.strictEqual(
    overlapValidation.blockingErrors.filter(e => e.includes('overlaps with')).length,
    1,
    'LIN-4: Pairwise overlap must be deduplicated to 1 entry in blockingErrors'
  );

  const gapOnlyValidation = validateTimeGatedMp3s(
    [
      { id: 'g-1', startDate: '2026-11-20T00:00', endDate: '2026-11-22T23:59', mediaItems: [{ mp3Url: 'A.mp3', assetType: 'audio' }] },
      { id: 'g-2', startDate: '2026-11-25T00:00', endDate: '2026-11-28T23:59', mediaItems: [{ mp3Url: 'B.mp3', assetType: 'audio' }] },
    ],
    '2026-11-20T12:00',
    '2026-11-28T23:59',
    '2026-11-20T00:00'
  );
  assert.strictEqual(gapOnlyValidation.hasBlockingErrors, false, 'LIN-4: Intentional schedule gap must NOT hard-block');
  assert.strictEqual(gapOnlyValidation.hasSoftWarnings, true, 'LIN-4: Intentional schedule gap must emit softWarning');

  // 12g. LIN-6: resolveAnnouncementsForDate preserves historical revision gate snapshot
  const revSnapAnn: Announcement = normalizeAnnouncement({
    id: 'rev-snap-1',
    name: 'Revision Snapshot Ann',
    type: AnnouncementType.BASIC_HOURLY,
    enabled: true,
    minute: 0,
    startDate: '2026-11-01T00:00',
    validFrom: '2026-11-15T00:00:00.000Z',
    validTo: null,
    timeGatedMp3s: [
      { id: 'head-gate', startDate: '2026-11-15T00:00', mediaItems: [{ mp3Url: 'HeadSpot.mp3', assetType: 'audio' }] },
    ],
    revisions: [
      {
        name: 'Revision Snapshot Ann',
        type: AnnouncementType.BASIC_HOURLY,
        enabled: true,
        minute: 0,
        startDate: '2026-11-01T00:00',
        validFrom: '2026-11-01T00:00:00.000Z',
        validTo: '2026-11-15T00:00:00.000Z',
        timeGatedMp3s: [
          { id: 'old-rev-gate', startDate: '2026-11-01T00:00', endDate: '2026-11-14T23:59', mediaItems: [{ mp3Url: 'OldSpot.mp3', assetType: 'audio' }] },
        ],
      },
    ],
  });
  const pastResolved = resolveAnnouncementsForDate('2026-11-10', [revSnapAnn]);
  assert.strictEqual(pastResolved.length, 1, 'LIN-6: Past date must resolve historical revision');
  assert.strictEqual(
    pastResolved[0].timeGatedMp3s?.[0]?.id,
    'old-rev-gate',
    'LIN-6: resolveAnnouncementsForDate must preserve historical rev.timeGatedMp3s snapshot'
  );

  // 12h. Reactivated previously-inactivated gate MUST be fully validated (never skipped by preExistingExpiredIds)
  const savedInactivatedGate = {
    ...linAnn.timeGatedMp3s![0],
    inactivated: true,
    inactivatedAt: '2026-11-19T12:00',
  };
  const preExistingFromInactivated = new Set<string>(
    [savedInactivatedGate]
      .filter(g => !g.inactivated && isGateExpiredOrInactivated(g, '2026-11-20T12:00'))
      .map(g => g.id)
  );
  assert.strictEqual(
    preExistingFromInactivated.has(savedInactivatedGate.id),
    false,
    'Inactivated saved gates must NOT enter preExistingExpiredIds'
  );
  const reactivatedBrokenGate = {
    ...linAnn.timeGatedMp3s![0],
    endDate: '2026-11-18T12:00', // Shortened below last play (14:00) after reactivating
  };
  const reactivatedValidation = validateTimeGatedMp3s(
    [reactivatedBrokenGate],
    '2026-11-20T12:00',
    '2026-11-30T23:59',
    '2026-11-10T00:00',
    linBounds,
    preExistingFromInactivated
  );
  assert.strictEqual(
    reactivatedValidation.hasBlockingErrors,
    true,
    'Reactivated gate shortened before lastPlayedLocalIso MUST hard-block'
  );

  // 12i. LIN-4: Stubbed gate with valid Start/End and missing file attachment is a SOFT warning only (Save Anyway allowed)
  const stubbedGateValidation = validateTimeGatedMp3s(
    [
      {
        id: 'gate-stub-1',
        startDate: '2026-11-20T00:00',
        endDate: '2026-11-28T23:59',
        mediaItems: [{ mp3Url: '' }],
      },
    ],
    '2026-11-20T12:00',
    '2026-11-28T23:59',
    '2026-11-20T00:00'
  );
  assert.strictEqual(
    stubbedGateValidation.hasBlockingErrors,
    false,
    'LIN-4: Missing file attachment on a stubbed gate must NOT hard-block save'
  );
  assert.strictEqual(
    stubbedGateValidation.hasSoftWarnings,
    true,
    'LIN-4: Missing file attachment on a stubbed gate must emit a softWarning'
  );
  assert(
    stubbedGateValidation.softWarnings.some(w => w.includes('File attachment selection is missing.')),
    'LIN-4: softWarnings must explicitly report missing file attachment'
  );

  console.log('✓ Stage 9: #43/#113 Lineage Metadata, Gate-First Attribution, Played Bounds & Revision Snapshots verified.');

  // ---------------------------------------------------------------------------
  // 13. Stage 10: v0.20.8 Schema & Coexistence Verification (#1, #2, #3, #10, #110, #116)
  // ---------------------------------------------------------------------------
  console.log('🔄 Stage 10: Verifying v0.20.8 Admin Messages, Font Defaults, Cross-Folder Isolation, Monotonic highestAppVersion, Message Log Exclusion & Revision/Inactivation Persistence...');

  // 10a. adminMessages[] normalization, v0.15.4/5 envelope-strip survival via data[0]._stationMeta & sidecar fallback, plus show targeting/acknowledgement
  const sampleAdminMessages: AdminMessage[] = normalizeAdminMessages([
    {
      id: 'msg-show-1',
      title: 'Studio Mic Reminder',
      body: 'Use **Mic 2** for guest interviews.',
      severity: 'alert',
      enabled: true,
      targetScope: 'single_show',
      targetShowIds: ['show-v208-1'],
      startDate: '2026-11-01T00:00',
      endDate: '2026-11-30T23:59',
      clearMode: 'once_acknowledged',
      acknowledgedByShows: [],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'msg-startup-1',
      title: 'Holiday Hours',
      body: 'Station office closed Thursday.',
      severity: 'info',
      enabled: true,
      targetScope: 'app_startup',
      startupCondition: 'all_users',
      startDate: '2026-11-01T00:00',
      endDate: '2026-11-30T23:59',
      clearMode: 'once_acknowledged',
      acknowledgedByShows: [],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ]);
  const v208ShowFixture: Show = {
    id: 'show-v208-1',
    name: 'Show Spacer 1',
    nameShort: 'Show_Spacer_1',
    day: 'Wednesday',
    startHour: 10,
    startMinute: 0,
    durationHours: 2,
    durationMinutes: 0,
    host: 'Host 1',
    description: '',
    active: true,
    includeInUpNext: true,
  };
  const v208ShowsSaved = migrateShowsPayload(
    { ShowsBackupCounter: 4, data: [v208ShowFixture] },
    CURRENT_APP_VERSION,
    4,
    'America/New_York',
    'ops@station.org',
    { enabled: true, minutesBefore: 15 },
    { windowBeforeMinutes: 6, windowAfterMinutes: 4, showLookaroundHours: 2, showLookaroundMinutes: 120, liveReadWpm: 165, defaultLiveReadFontSize: 24, defaultLiveReadFontFamily: 'verdana' },
    sampleAdminMessages
  );
  assert.strictEqual(v208ShowsSaved.envelope.adminMessages?.length, 2, '10a: shows envelope must persist adminMessages');
  assert.strictEqual(v208ShowsSaved.envelope._meta?.adminMessages?.length, 2, '10a: shows _meta must mirror adminMessages');
  assert.strictEqual(v208ShowsSaved.envelope.data[0]._stationMeta?.adminMessages?.length, 2, '10a: data[0]._stationMeta must mirror adminMessages');

  // Simulate v0.15.4/5 stripping top-level _meta and adminMessages (leaving only ShowsBackupCounter + data[] with _stationMeta)
  const v15StrippedShowsPayload = {
    ShowsBackupCounter: 5,
    data: v208ShowsSaved.envelope.data,
  };
  const recoveredFromItemMeta = migrateShowsPayload(v15StrippedShowsPayload, CURRENT_APP_VERSION, 5);
  assert.strictEqual(
    recoveredFromItemMeta.envelope.adminMessages?.length,
    2,
    '10a: adminMessages must survive v0.15.4/5 envelope strip via data[0]._stationMeta'
  );
  assert.strictEqual(
    recoveredFromItemMeta.envelope.adminMessages?.[0]?.id,
    'msg-show-1',
    '10a: recovered adminMessage ID must match original'
  );

  // Simulate v0.15.4/5 stripping envelope on empty data[] — explicit sidecar fallback must restore adminMessages
  const recoveredFromSidecar = migrateShowsPayload(
    { ShowsBackupCounter: 6, data: [] },
    CURRENT_APP_VERSION,
    6,
    undefined,
    undefined,
    undefined,
    undefined,
    sampleAdminMessages
  );
  assert.strictEqual(
    recoveredFromSidecar.envelope.adminMessages?.length,
    2,
    '10a: explicit sidecar fallback must restore adminMessages when shows data[] is empty'
  );

  // Show message targeting & log-based acknowledgement
  const msgTargetDate = new Date(2026, 10, 18, 10, 0, 0); // Wed Nov 18 2026 10:00
  const targetedBeforeAck = getAdminMessagesForShowOccurrence(sampleAdminMessages, v208ShowFixture, msgTargetDate, []);
  assert.strictEqual(targetedBeforeAck.length, 1, '10a: getAdminMessagesForShowOccurrence must match single_show message');
  assert.strictEqual(targetedBeforeAck[0].acknowledged, false, '10a: unacknowledged message must report acknowledged=false');
  const ackLogEntry: LogEntry = seedLogEntrySiblings({
    timestamp: stationLocalToUtcIso('2026-11-18T10:01:00', DEFAULT_STATION_TIMEZONE),
    announcementTime: stationLocalToUtcIso('2026-11-18T10:00:00', DEFAULT_STATION_TIMEZONE),
    mp3Name: '',
    announcementName: 'Studio Mic Reminder',
    announcementId: 'msg-show-1',
    status: 'acknowledged',
    playMode: 'Live',
    assetType: 'message',
    showId: 'show-v208-1',
    showName: 'Show Spacer 1',
  });
  const targetedAfterAck = getAdminMessagesForShowOccurrence(sampleAdminMessages, v208ShowFixture, msgTargetDate, [ackLogEntry]);
  assert.strictEqual(targetedAfterAck[0].acknowledged, true, '10a: message acknowledged via LogEntry must report acknowledged=true');

  // 10b. defaultLiveReadFontSize (clamped 14-40, default 20) & defaultLiveReadFontFamily (valid enum, default 'sans')
  assert.strictEqual(
    v208ShowsSaved.envelope.scheduleWindow?.defaultLiveReadFontSize,
    24,
    '10b: valid defaultLiveReadFontSize must persist'
  );
  assert.strictEqual(
    v208ShowsSaved.envelope.scheduleWindow?.defaultLiveReadFontFamily,
    'verdana',
    '10b: valid defaultLiveReadFontFamily must persist'
  );
  const clampedFontShows = migrateShowsPayload(
    { ShowsBackupCounter: 1, data: [v208ShowFixture] },
    CURRENT_APP_VERSION,
    1,
    undefined,
    undefined,
    undefined,
    { defaultLiveReadFontSize: 99, defaultLiveReadFontFamily: 'comic-sans' as any }
  );
  assert.strictEqual(
    clampedFontShows.envelope.scheduleWindow?.defaultLiveReadFontSize,
    40,
    '10b: oversized defaultLiveReadFontSize must clamp to 40'
  );
  assert.strictEqual(
    clampedFontShows.envelope.scheduleWindow?.defaultLiveReadFontFamily,
    'sans',
    '10b: invalid defaultLiveReadFontFamily must fall back to sans'
  );
  const minClampedFontShows = migrateShowsPayload(
    { ShowsBackupCounter: 1, data: [v208ShowFixture] },
    CURRENT_APP_VERSION,
    1,
    undefined,
    undefined,
    undefined,
    { defaultLiveReadFontSize: 4, defaultLiveReadFontFamily: 'serif' }
  );
  assert.strictEqual(
    minClampedFontShows.envelope.scheduleWindow?.defaultLiveReadFontSize,
    14,
    '10b: undersized defaultLiveReadFontSize must clamp to 14'
  );
  assert.strictEqual(
    minClampedFontShows.envelope.scheduleWindow?.defaultLiveReadFontFamily,
    'serif',
    '10b: valid serif font family must persist'
  );

  // 10c. Server-runtime cross-folder isolation (#2): Folder A custom settings MUST NOT leak into Folder B bare legacy payload
  const folderAResult = migrateShowsPayload(
    { ShowsBackupCounter: 1, data: [v208ShowFixture] },
    CURRENT_APP_VERSION,
    1,
    'America/Chicago',
    'folder-a@station.org',
    { enabled: false, minutesBefore: 35 },
    { windowBeforeMinutes: 12, windowAfterMinutes: 8, showLookaroundHours: 3, showLookaroundMinutes: 180, liveReadWpm: 180, defaultLiveReadFontSize: 28, defaultLiveReadFontFamily: 'mono' },
    sampleAdminMessages
  );
  assert.strictEqual(folderAResult.envelope.stationTimezone, 'America/Chicago', '10c: Folder A custom timezone set');
  const folderBBareResult = migrateShowsPayload({ ShowsBackupCounter: 1, data: [] }, CURRENT_APP_VERSION, 1);
  assert.strictEqual(
    folderBBareResult.envelope.stationTimezone,
    DEFAULT_STATION_TIMEZONE,
    '10c: Folder B bare legacy payload must NOT inherit Folder A timezone'
  );
  assert.strictEqual(
    folderBBareResult.envelope.adminContactInfo || '',
    '',
    '10c: Folder B bare legacy payload must NOT inherit Folder A adminContactInfo'
  );
  assert.strictEqual(
    folderBBareResult.envelope.scheduleWindow?.windowBeforeMinutes,
    DEFAULT_SCHEDULE_WINDOW_CONFIG.windowBeforeMinutes,
    '10c: Folder B bare legacy payload must NOT inherit Folder A scheduleWindow'
  );
  assert.strictEqual(
    folderBBareResult.envelope.scheduleWindow?.defaultLiveReadFontSize,
    DEFAULT_SCHEDULE_WINDOW_CONFIG.defaultLiveReadFontSize,
    '10c: Folder B bare legacy payload must use defaultLiveReadFontSize=20'
  );
  assert.strictEqual(
    folderBBareResult.envelope.scheduleWindow?.defaultLiveReadFontFamily,
    DEFAULT_SCHEDULE_WINDOW_CONFIG.defaultLiveReadFontFamily,
    '10c: Folder B bare legacy payload must use defaultLiveReadFontFamily=sans'
  );
  assert.strictEqual(
    folderBBareResult.envelope.adminMessages?.length,
    0,
    '10c: Folder B bare legacy payload must NOT inherit Folder A adminMessages'
  );

  // 10d. Monotonic highestAppVersion across shows.json, announcements.json, and logs.json + Built-In Version Notices
  const futureVersion = '0.21.0';
  const showsWithFutureHighest = migrateShowsPayload(
    { _meta: { schemaVersion: 1, minAppVersion: '0.14.0', lastModifiedBy: futureVersion, highestAppVersion: futureVersion }, ShowsBackupCounter: 1, data: [v208ShowFixture] },
    CURRENT_APP_VERSION,
    1
  );
  assert.strictEqual(
    showsWithFutureHighest.envelope._meta?.highestAppVersion,
    futureVersion,
    '10d: shows.json must monotonically preserve higher future highestAppVersion'
  );
  assert.strictEqual(
    showsWithFutureHighest.envelope.data[0]._stationMeta?.highestAppVersion,
    futureVersion,
    '10d: shows.json data[0]._stationMeta must mirror highestAppVersion'
  );
  const annWithFutureHighest = migrateAnnouncementsPayload(
    { _meta: { schemaVersion: 1, minAppVersion: '0.14.0', lastModifiedBy: futureVersion, highestAppVersion: futureVersion }, AnnouncementsBackupCounter: 1, data: [linAnn] },
    CURRENT_APP_VERSION,
    1
  );
  assert.strictEqual(
    annWithFutureHighest.envelope._meta?.highestAppVersion,
    futureVersion,
    '10d: announcements.json must monotonically preserve higher future highestAppVersion'
  );
  assert.strictEqual(
    annWithFutureHighest.envelope.data[0]._stationMeta?.highestAppVersion,
    futureVersion,
    '10d: announcements.json data[0]._stationMeta must mirror highestAppVersion'
  );
  const logsWithFutureHighest = migrateLogsPayload(
    { _meta: { schemaVersion: 1, minAppVersion: '0.14.0', lastModifiedBy: futureVersion, highestAppVersion: futureVersion }, LogsBackupCounter: 1, data: [ackLogEntry] },
    CURRENT_APP_VERSION,
    1
  );
  assert.strictEqual(
    logsWithFutureHighest.envelope._meta?.highestAppVersion,
    futureVersion,
    '10d: logs.json must monotonically preserve higher future highestAppVersion'
  );

  // Built-in system notices: old_version (compatible schema, newer app seen) vs old_version_schema (schema/minAppVersion upgrade required)
  const compatReportNewerSeen = assessDataCompatibility({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    minAppVersion: CURRENT_MIN_APP_VERSION,
    lastModifiedBy: CURRENT_APP_VERSION,
    highestAppVersion: futureVersion,
  });
  const builtInsUpdateOnly = getBuiltInSystemMessages([], CURRENT_APP_VERSION, compatReportNewerSeen);
  const updateDesc = builtInsUpdateOnly.find((b) => b.id === SYSTEM_MSG_VERSION_UPDATE_ID);
  const requiredDesc = builtInsUpdateOnly.find((b) => b.id === SYSTEM_MSG_REQUIRED_UPGRADE_ID);
  assert.strictEqual(updateDesc?.wouldTriggerNow, true, '10d: old_version built-in notice must trigger when highestAppVersion > current');
  assert.strictEqual(requiredDesc?.wouldTriggerNow, false, '10d: old_version_schema notice must NOT trigger when schema is compatible');

  const compatReportBreaking = assessDataCompatibility({
    schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    minAppVersion: futureVersion,
    lastModifiedBy: futureVersion,
    highestAppVersion: futureVersion,
  });
  const pendingBreakingStartup = getPendingStartupMessages(sampleAdminMessages, CURRENT_APP_VERSION, compatReportBreaking, msgTargetDate);
  assert(
    pendingBreakingStartup.some((m) => m.id === SYSTEM_MSG_REQUIRED_UPGRADE_ID),
    '10d: getPendingStartupMessages must include Required Upgrade notice on schema/minAppVersion mismatch'
  );
  assert(
    !pendingBreakingStartup.some((m) => m.id === SYSTEM_MSG_VERSION_UPDATE_ID),
    '10d: softer version-update notice must be suppressed when Required Upgrade notice triggers'
  );
  assert(
    pendingBreakingStartup.some((m) => m.id === 'msg-startup-1'),
    '10d: active custom app_startup admin message must be included in getPendingStartupMessages'
  );
  assert.strictEqual(resolveHighestAppVersion('0.20.8', '0.21.0', '0.20.7'), '0.21.0', '10d: resolveHighestAppVersion must return max semver');

  // 10e. LogEntry status:'acknowledged' / assetType:'message' sibling preservation & exclusion from play/miss/extra reconciliation
  assert.strictEqual(ackLogEntry.status, 'acknowledged', '10e: seedLogEntrySiblings must preserve status=acknowledged');
  assert.strictEqual(ackLogEntry.assetType, 'message', '10e: seedLogEntrySiblings must preserve assetType=message');
  const reconWithMessageLog = reconcileScheduleAndLogs(
    '2026-11-18',
    [linAnn],
    [v208ShowFixture],
    [ackLogEntry],
    new Date(2026, 10, 18, 12, 0, 0)
  );
  assert.strictEqual(
    reconWithMessageLog.totalPlayed,
    0,
    '10e: status=acknowledged / assetType=message logs must NEVER count as played announcements in reconcileScheduleAndLogs'
  );
  assert.strictEqual(
    reconWithMessageLog.totalExtra,
    0,
    '10e: status=acknowledged / assetType=message logs must NEVER count as extra plays in reconcileScheduleAndLogs'
  );

  // 10f. AnnouncementRevision.timeGatedMp3s & TimeGatedMediaItem.inactivated/inactivatedAt survival across normalizeAnnouncement & migrateAnnouncementsPayload
  const annWithRevAndInactivatedItem: Announcement = normalizeAnnouncement({
    id: 'rev-inact-ann-1',
    name: 'Revision & Inactivated Item Spot',
    type: AnnouncementType.BASIC_HOURLY,
    enabled: true,
    minute: 30,
    startDate: '2026-11-01T00:00',
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-11-01T00:00:00.000Z',
      lastModifiedBy: CURRENT_APP_VERSION,
      lastModifiedDate: '2026-11-10T18:00:00.000Z',
    },
    timeGatedMp3s: [
      {
        id: 'gate-rev-1',
        startDate: '2026-11-01T00:00',
        endDate: '2026-11-30T23:59',
        mediaItems: [
          { mp3Url: 'RetiredTrack.mp3', assetType: 'audio', inactivated: true, inactivatedAt: '2026-11-10T18:00:00.000Z' },
          { mp3Url: 'ActiveTrack.mp3', assetType: 'audio' },
        ],
      },
    ],
    revisions: [
      {
        name: 'Revision & Inactivated Item Spot',
        type: AnnouncementType.BASIC_HOURLY,
        enabled: true,
        minute: 30,
        startDate: '2026-11-01T00:00',
        validFrom: '2026-11-01T00:00:00.000Z',
        validTo: '2026-11-10T18:00:00.000Z',
        timeGatedMp3s: [
          {
            id: 'gate-rev-old',
            startDate: '2026-11-01T00:00',
            endDate: '2026-11-10T17:59',
            mediaItems: [{ mp3Url: 'OriginalSpot.mp3', assetType: 'audio' }],
          },
        ],
      },
    ],
  });
  assert.strictEqual(
    annWithRevAndInactivatedItem.timeGatedMp3s?.[0]?.mediaItems?.[0]?.inactivated,
    true,
    '10f: normalizeAnnouncement must preserve per-media-item inactivated flag'
  );
  assert.strictEqual(
    annWithRevAndInactivatedItem.timeGatedMp3s?.[0]?.mp3Url,
    'ActiveTrack.mp3',
    '10f: normalizeAnnouncement must mirror first active mediaItem onto flat sibling mp3Url'
  );
  const migratedRevAnn = migrateAnnouncementsPayload(
    { AnnouncementsBackupCounter: 1, data: [annWithRevAndInactivatedItem] },
    CURRENT_APP_VERSION,
    1
  );
  assert.strictEqual(
    migratedRevAnn.envelope.data[0].timeGatedMp3s?.[0]?.mediaItems?.[0]?.inactivated,
    true,
    '10f: migrateAnnouncementsPayload must preserve per-media-item inactivated flag'
  );
  assert.strictEqual(
    migratedRevAnn.envelope.data[0].revisions?.[0]?.timeGatedMp3s?.[0]?.mediaItems?.[0]?.mp3Url,
    'OriginalSpot.mp3',
    '10f: migrateAnnouncementsPayload must preserve AnnouncementRevision.timeGatedMp3s snapshots'
  );

  // 10g. v0.15.4 envelope-strip ping-pong MUST NOT overwrite inactivated mediaItems[0] when flat mp3Url mirrors active mediaItems[1]
  const stripped0154AnnPayload = {
    AnnouncementsBackupCounter: 2,
    data: migratedRevAnn.envelope.data,
  };
  const reloadedAfter0154Strip = migrateAnnouncementsPayload(stripped0154AnnPayload, CURRENT_APP_VERSION, 2);
  const reloadedGateItems = reloadedAfter0154Strip.envelope.data[0].timeGatedMp3s?.[0]?.mediaItems || [];
  assert.strictEqual(
    reloadedGateItems[0]?.mp3Url,
    'RetiredTrack.mp3',
    '10g: v0.15.4 envelope strip must NOT overwrite inactivated mediaItems[0].mp3Url with active sibling'
  );
  assert.strictEqual(
    reloadedGateItems[0]?.inactivated,
    true,
    '10g: inactivated flag on mediaItems[0] must survive v0.15.4 envelope strip'
  );
  assert.strictEqual(
    reloadedGateItems[1]?.mp3Url,
    'ActiveTrack.mp3',
    '10g: active mediaItems[1].mp3Url must remain intact after v0.15.4 envelope strip'
  );

  // 10h. Client normalizeAnnouncement MUST preserve inactivated mediaItems[0] under v0.15.4 metadata & target first active index on flat edit
  const v15ClientReconcileSame = normalizeAnnouncement({
    ...migratedRevAnn.envelope.data[0],
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-11-01T00:00:00.000Z',
      lastModifiedBy: '0.15.4',
      lastModifiedDate: '2026-11-11T00:00:00.000Z',
    },
  });
  assert.strictEqual(
    v15ClientReconcileSame.timeGatedMp3s?.[0]?.mediaItems?.[0]?.mp3Url,
    'RetiredTrack.mp3',
    '10h: client normalizeAnnouncement must NOT overwrite inactivated mediaItems[0] when flat mp3Url matches active mediaItems[1]'
  );
  assert.strictEqual(
    v15ClientReconcileSame.timeGatedMp3s?.[0]?.mediaItems?.[0]?.inactivated,
    true,
    '10h: client normalizeAnnouncement must preserve inactivated flag on mediaItems[0]'
  );

  const v15ClientReconcileEdited = normalizeAnnouncement({
    ...migratedRevAnn.envelope.data[0],
    metadata: {
      createdBy: 'Admin',
      createdDate: '2026-11-01T00:00:00.000Z',
      lastModifiedBy: '0.15.4',
      lastModifiedDate: '2026-11-11T00:00:00.000Z',
    },
    timeGatedMp3s: [
      {
        ...migratedRevAnn.envelope.data[0].timeGatedMp3s![0],
        mp3Url: 'V15EditedActive.mp3',
      },
    ],
  });
  assert.strictEqual(
    v15ClientReconcileEdited.timeGatedMp3s?.[0]?.mediaItems?.[0]?.mp3Url,
    'RetiredTrack.mp3',
    '10h: v0.15.4 flat gate edit must keep inactivated mediaItems[0] untouched'
  );
  assert.strictEqual(
    v15ClientReconcileEdited.timeGatedMp3s?.[0]?.mediaItems?.[1]?.mp3Url,
    'V15EditedActive.mp3',
    '10h: v0.15.4 flat gate edit must reconcile into the first active mediaItem index'
  );

  // Also verify shows.json envelope settings take precedence over stale sidecar values while falling back when stripped
  const showsWithFreshSettings = {
    _meta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      minAppVersion: CURRENT_MIN_APP_VERSION,
      lastModifiedBy: CURRENT_APP_VERSION,
      stationTimezone: 'America/New_York',
      adminContactInfo: 'fresh-admin@station.org',
      scheduleWindow: {
        ...DEFAULT_SCHEDULE_WINDOW_CONFIG,
        defaultLiveReadFontFamily: 'serif' as const,
        defaultLiveReadFontSize: 24,
      },
    },
    stationTimezone: 'America/New_York',
    adminContactInfo: 'fresh-admin@station.org',
    scheduleWindow: {
      ...DEFAULT_SCHEDULE_WINDOW_CONFIG,
      defaultLiveReadFontFamily: 'serif' as const,
      defaultLiveReadFontSize: 24,
    },
    ShowsBackupCounter: 5,
    data: [v208ShowFixture],
  };
  const staleSidecar = {
    stationTimezone: 'America/Los_Angeles',
    adminContactInfo: 'stale-admin@station.org',
    scheduleWindow: {
      ...DEFAULT_SCHEDULE_WINDOW_CONFIG,
      defaultLiveReadFontFamily: 'mono' as const,
      defaultLiveReadFontSize: 16,
    },
  };
  const resolvedTz = showsWithFreshSettings.stationTimezone || showsWithFreshSettings._meta?.stationTimezone || staleSidecar.stationTimezone;
  const resolvedContact =
    showsWithFreshSettings.adminContactInfo !== undefined
      ? showsWithFreshSettings.adminContactInfo
      : staleSidecar.adminContactInfo;
  const resolvedWindow =
    showsWithFreshSettings.scheduleWindow || showsWithFreshSettings._meta?.scheduleWindow || staleSidecar.scheduleWindow;
  const showsPrecedenceResult = migrateShowsPayload(
    showsWithFreshSettings,
    CURRENT_APP_VERSION,
    5,
    resolvedTz,
    resolvedContact,
    undefined,
    resolvedWindow
  );
  assert.strictEqual(
    showsPrecedenceResult.envelope.stationTimezone,
    'America/New_York',
    '10h: shows.json stationTimezone must take precedence over stale sidecar'
  );
  assert.strictEqual(
    showsPrecedenceResult.envelope.adminContactInfo,
    'fresh-admin@station.org',
    '10h: shows.json adminContactInfo must take precedence over stale sidecar'
  );
  assert.strictEqual(
    showsPrecedenceResult.envelope.scheduleWindow?.defaultLiveReadFontFamily,
    'serif',
    '10h: shows.json scheduleWindow must take precedence over stale sidecar'
  );

  console.log('✓ Stage 10: v0.20.8 Admin Messages, Font Defaults, Cross-Folder Isolation, Monotonic highestAppVersion, Message Log Exclusion & Revision/Inactivation Persistence verified.');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ ALL PRODUCTION SCHEMA UPGRADE, SIBLING BRIDGE, SCHEDULE ENGINE, LINEAGE & v0.20.8 TESTS PASSED WITH 100% INTEGRITY.');
}

runComprehensiveSchemaUpgradeTests();


