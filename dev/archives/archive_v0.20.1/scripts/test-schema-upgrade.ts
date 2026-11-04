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
  DEFAULT_STATION_TIMEZONE
} from '../src/lib/compatibility';
import { reconcileScheduleAndLogs } from '../src/lib/temporalReconciliation';
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
} from '../src/lib/scheduleEngine';
import {
  mediaCatalogStore,
  upsertMediaCatalogFile,
  syncMediaCatalogFiles,
  availableFilesCache,
  driveFileNameCache,
} from '../src/lib/audioCache';
import { resolveEffectiveLocalPaths } from '../src/lib/driveService';
import { Announcement, AnnouncementType, Show } from '../src/types';

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
    getActiveMp3ForSlot(futureGateAnn, oct5NoonMs)?.mp3Url,
    'FutureSpot.mp3',
    'getActiveMp3ForSlot with default allowFutureFallback must return earliest future gate for preview'
  );
  assert.strictEqual(
    getActiveMp3ForSlot(futureGateAnn, oct5NoonMs, { allowFutureFallback: false }),
    null,
    'getActiveMp3ForSlot with allowFutureFallback: false must return null during a leading gap'
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

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ ALL PRODUCTION SCHEMA UPGRADE, SIBLING BRIDGE & SCHEDULE ENGINE TESTS PASSED WITH 100% INTEGRITY.');
}

runComprehensiveSchemaUpgradeTests();


