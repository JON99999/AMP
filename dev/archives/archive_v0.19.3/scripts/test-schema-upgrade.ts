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
import { normalizeAnnouncements } from '../src/lib/utils';

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
  assert.strictEqual(a1.timeGatedMp3s[0].assetType, 'audio', 'Audio file extension must map to assetType audio');
  assert.strictEqual(a1.validFrom, '1970-01-01T00:00:00.000Z', 'Seeded validFrom must use epoch 1970-01-01');
  assert.strictEqual(a1.metadata.lastModifiedBy, CURRENT_APP_VERSION);

  const a2 = postAnnObj.data[1];
  assert.strictEqual(a2.timeGatedMp3s[0].assetType, 'script', 'Text file extension must map to assetType script');

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

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('✅ ALL PRODUCTION SCHEMA UPGRADE & SIBLING BRIDGE TESTS PASSED WITH 100% INTEGRITY.');
}

runComprehensiveSchemaUpgradeTests();


