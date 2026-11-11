import express from 'express';
import fs from 'fs';
import path from 'path';
import { Announcement, Show, LogEntry } from '../../types';
import {
  CURRENT_APP_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_MIN_APP_VERSION,
  seedLogEntrySiblings,
  migrateAnnouncementsPayload,
  migrateShowsPayload,
  migrateLogsPayload
} from '../../lib/compatibility';
import {
  currentSettings,
  getAmpSettingsDir,
  getCalendarFilePath,
  getCalendarBackupPath,
  getShowsFilePath,
  getShowsBackupPath,
  getLogFilePath,
  getLogBackupPath,
  generateBackupFilename,
  atomicWriteFileSync,
  resolveLocalAnnouncementScriptText,
  readStationSettingsSidecar,
  writeStationSettingsSidecar,
  readJsonFileWithCloudCatchUp
} from '../state';
import {
  isServerDriveStorageRequest,
  readDriveAnnouncements,
  writeDriveAnnouncements,
  readDriveShows,
  writeDriveShows,
  readDriveLogs,
  appendDriveLog,
  inspectServerDriveCompatibility,
  upgradeServerDriveSchema,
  triggerServerDriveBackup
} from '../storage/driveProvider';

export function registerScheduleRoutes(app: express.Express): void {
  // API - Announcements (Unified Local + Google Drive Provider)
  app.get('/api/announcements', async (req, res) => {
    try {
      const withEnvelope = req.query.withEnvelope === 'true';
      if (isServerDriveStorageRequest(req)) {
        const result = await readDriveAnnouncements(req, withEnvelope);
        return res.json(result);
      }

      const filePath = getCalendarFilePath();
      const backupPath = getCalendarBackupPath();
      const { parsed, fileExists } = await readJsonFileWithCloudCatchUp(filePath, backupPath);
      if (!fileExists) {
        if (withEnvelope) {
          return res.json({
            _meta: null,
            AnnouncementsBackupCounter: 0,
            data: []
          });
        }
        return res.json([]);
      }
      let rawLogs: any = undefined;
      try {
        const logPath = getLogFilePath();
        if (logPath && fs.existsSync(logPath)) {
          rawLogs = JSON.parse(fs.readFileSync(logPath, 'utf-8') || '[]');
        }
      } catch (_) {}
      const sidecar = readStationSettingsSidecar();
      const lastMod = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._meta?.lastModifiedBy)
        ? parsed._meta.lastModifiedBy
        : CURRENT_APP_VERSION;
      const migrated = migrateAnnouncementsPayload(
        parsed,
        lastMod,
        0,
        rawLogs,
        resolveLocalAnnouncementScriptText,
        sidecar?.scheduleWindow
      );
      const seeded = migrated.data;
      if (withEnvelope) {
        return res.json({
          _meta: migrated.envelope._meta || parsed?._meta || null,
          AnnouncementsBackupCounter: parsed?.AnnouncementsBackupCounter || 0,
          data: seeded
        });
      }
      res.json(seeded);
    } catch (e: any) {
      console.error('Failed to read schedules:', e);
      res.status(500).json(isServerDriveStorageRequest(req) ? { error: e?.message || 'Failed to read schedules' } : []);
    }
  });

  app.post('/api/announcements', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await writeDriveAnnouncements(req, req.body);
        return res.json(result);
      }

      const filePath = getCalendarFilePath();
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Calendar directory is not configured' });
      }
      const rawPayload = req.body;
      const schedules: Announcement[] = Array.isArray(rawPayload) ? rawPayload : (Array.isArray(rawPayload?.data) ? rawPayload.data : []);
      let counter = 0;
      let existingMeta: any = null;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.AnnouncementsBackupCounter || 0;
            existingMeta = parsed._meta || null;
          }
        } catch (pe) {}
      }
      const sidecar = readStationSettingsSidecar();
      const explicitAnnWindow = rawPayload?._meta?.scheduleWindow || rawPayload?.scheduleWindow;
      const effectiveScheduleWindow = explicitAnnWindow || sidecar?.scheduleWindow || existingMeta?.scheduleWindow;
      const mergedAnnMeta = {
        ...(existingMeta || {}),
        ...(rawPayload?._meta || {}),
        ...(effectiveScheduleWindow ? { scheduleWindow: effectiveScheduleWindow } : {})
      };
      const migrated = migrateAnnouncementsPayload(
        { _meta: mergedAnnMeta, AnnouncementsBackupCounter: counter, data: schedules },
        CURRENT_APP_VERSION,
        counter,
        undefined,
        resolveLocalAnnouncementScriptText,
        effectiveScheduleWindow
      );
      const updatedObj = migrated.envelope;
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));
      if (updatedObj._meta?.scheduleWindow) {
        writeStationSettingsSidecar({ scheduleWindow: updatedObj._meta.scheduleWindow });
      }

      // Backup copy for schedules
      try {
        const backupPath = getCalendarBackupPath();
        if (backupPath) {
          atomicWriteFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Schedules backup copy failed:', e);
      }

      res.json({ success: true, _meta: updatedObj._meta });
    } catch (e: any) {
      console.error('Failed to save schedules:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write schedules data: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: getCalendarFilePath()
      });
    }
  });

  // API - Shows (Unified Local + Google Drive Provider)
  app.get('/api/shows', async (req, res) => {
    try {
      const withEnvelope = req.query.withEnvelope === 'true';
      if (isServerDriveStorageRequest(req)) {
        const result = await readDriveShows(req, withEnvelope);
        return res.json(result);
      }

      const filePath = getShowsFilePath();
      const backupPath = getShowsBackupPath();
      const { parsed, fileExists } = await readJsonFileWithCloudCatchUp(filePath, backupPath);
      if (!fileExists) {
        if (withEnvelope) {
          return res.json({
            _meta: null,
            stationTimezone: undefined,
            hasSavedTimezone: false,
            adminContactInfo: '',
            hasSavedAdminContact: false,
            upNextPromo: { enabled: true, minutesBefore: 20 },
            scheduleWindow: { windowBeforeMinutes: 5, windowAfterMinutes: 5, showLookaroundHours: 1 },
            ShowsBackupCounter: 0,
            data: []
          });
        }
        return res.json([]);
      }
      const sidecar = readStationSettingsSidecar();
      const embeddedMeta = Array.isArray(parsed?.data)
        ? parsed.data.find((it: any) => it && typeof it._stationMeta === 'object')?._stationMeta
        : undefined;
      const hasSavedTimezone = Boolean(
        (parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          (parsed.stationTimezone || parsed._meta?.stationTimezone)) ||
        embeddedMeta?.stationTimezone ||
        sidecar?.stationTimezone
      );
      const hasSavedAdminContact = Boolean(
        (parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          (parsed.adminContactInfo !== undefined || parsed._meta?.adminContactInfo !== undefined)) ||
        embeddedMeta?.adminContactInfo !== undefined ||
        sidecar?.adminContactInfo !== undefined
      );
      const lastMod = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed._meta?.lastModifiedBy)
        ? parsed._meta.lastModifiedBy
        : CURRENT_APP_VERSION;
      const seededResult = migrateShowsPayload(
        parsed,
        lastMod,
        0,
        sidecar?.stationTimezone,
        sidecar?.adminContactInfo,
        sidecar?.upNextPromo,
        sidecar?.scheduleWindow
      );
      const seeded = seededResult.data;
      if (withEnvelope) {
        return res.json({
          _meta: seededResult.envelope._meta || parsed?._meta || null,
          stationTimezone: seededResult.envelope.stationTimezone,
          hasSavedTimezone,
          adminContactInfo: seededResult.envelope.adminContactInfo || '',
          hasSavedAdminContact,
          upNextPromo: seededResult.envelope.upNextPromo || { enabled: true, minutesBefore: 20 },
          scheduleWindow: seededResult.envelope.scheduleWindow || seededResult.envelope._meta?.scheduleWindow || { windowBeforeMinutes: 5, windowAfterMinutes: 5, showLookaroundHours: 1, showLookaroundMinutes: 60 },
          ShowsBackupCounter: parsed?.ShowsBackupCounter || 0,
          data: seeded
        });
      }
      res.json(seeded);
    } catch (e: any) {
      console.error('Failed to read shows:', e);
      res.status(500).json(isServerDriveStorageRequest(req) ? { error: e?.message || 'Failed to read shows' } : []);
    }
  });

  app.post('/api/shows', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await writeDriveShows(req, req.body);
        return res.json(result);
      }

      const filePath = getShowsFilePath();
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Calendar directory is not configured for shows' });
      }
      const rawPayload = req.body;
      const shows: Show[] = Array.isArray(rawPayload) ? rawPayload : (Array.isArray(rawPayload?.data) ? rawPayload.data : []);
      const explicitTz: string | undefined = (!Array.isArray(rawPayload) && (rawPayload?.stationTimezone || rawPayload?._meta?.stationTimezone)) || undefined;
      const explicitAdminContact: string | undefined =
        !Array.isArray(rawPayload) && rawPayload && typeof rawPayload === 'object'
          ? (rawPayload.adminContactInfo !== undefined ? rawPayload.adminContactInfo : rawPayload._meta?.adminContactInfo)
          : undefined;
      const explicitUpNextPromo =
        !Array.isArray(rawPayload) && rawPayload && typeof rawPayload === 'object'
          ? (rawPayload.upNextPromo || rawPayload._meta?.upNextPromo)
          : undefined;
      const explicitScheduleWindow =
        !Array.isArray(rawPayload) && rawPayload && typeof rawPayload === 'object'
          ? (rawPayload.scheduleWindow || rawPayload._meta?.scheduleWindow)
          : undefined;
      let counter = 0;
      let existingMeta: any = null;
      let existingAdminContact: string | undefined = undefined;
      let existingUpNextPromo: any = undefined;
      let existingScheduleWindow: any = undefined;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.ShowsBackupCounter || 0;
            existingMeta = parsed._meta || null;
            existingAdminContact = parsed.adminContactInfo !== undefined ? parsed.adminContactInfo : parsed._meta?.adminContactInfo;
            existingUpNextPromo = parsed.upNextPromo || parsed._meta?.upNextPromo;
            existingScheduleWindow = parsed.scheduleWindow || parsed._meta?.scheduleWindow;
          }
        } catch (pe) {}
      }
      const sidecar = readStationSettingsSidecar();
      const migrated = migrateShowsPayload(
        {
          _meta: rawPayload?._meta || existingMeta,
          ShowsBackupCounter: counter,
          data: shows,
          ...((existingAdminContact ?? sidecar?.adminContactInfo) !== undefined ? { adminContactInfo: existingAdminContact ?? sidecar?.adminContactInfo } : {}),
          ...((existingUpNextPromo ?? sidecar?.upNextPromo) !== undefined ? { upNextPromo: existingUpNextPromo ?? sidecar?.upNextPromo } : {}),
          ...((existingScheduleWindow ?? sidecar?.scheduleWindow) !== undefined ? { scheduleWindow: existingScheduleWindow ?? sidecar?.scheduleWindow } : {})
        },
        CURRENT_APP_VERSION,
        counter,
        explicitTz ?? sidecar?.stationTimezone,
        explicitAdminContact,
        explicitUpNextPromo,
        explicitScheduleWindow
      );
      const updatedObj = migrated.envelope;
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));
      writeStationSettingsSidecar({
        stationTimezone: updatedObj.stationTimezone,
        adminContactInfo: updatedObj.adminContactInfo ?? '',
        upNextPromo: updatedObj.upNextPromo,
        scheduleWindow: updatedObj.scheduleWindow
      });

      // Keep announcements.json _meta.scheduleWindow, data[0]._stationMeta, and Auto Live Read WPM estimates synchronized with station settings (#77)
      let updatedAnnouncements: Announcement[] | undefined = undefined;
      try {
        const calPath = getCalendarFilePath();
        if (calPath && fs.existsSync(calPath)) {
          const calParsed = JSON.parse(fs.readFileSync(calPath, 'utf-8') || '{}');
          if (calParsed && typeof calParsed === 'object' && !Array.isArray(calParsed) && Array.isArray(calParsed.data)) {
            const calCounter =
              typeof calParsed.AnnouncementsBackupCounter === 'number'
                ? Math.max(0, calParsed.AnnouncementsBackupCounter - 1)
                : 0;
            const migratedCal = migrateAnnouncementsPayload(
              calParsed,
              calParsed._meta?.lastModifiedBy || CURRENT_APP_VERSION,
              calCounter,
              undefined,
              resolveLocalAnnouncementScriptText,
              updatedObj.scheduleWindow
            );
            if (migratedCal.envelope.data.length > 0 && migratedCal.envelope.data[0] && typeof migratedCal.envelope.data[0] === 'object') {
              migratedCal.envelope.data[0]._stationMeta = {
                ...(migratedCal.envelope.data[0]._stationMeta || {}),
                stationTimezone: updatedObj.stationTimezone,
                adminContactInfo: updatedObj.adminContactInfo ?? '',
                upNextPromo: updatedObj.upNextPromo,
                scheduleWindow: updatedObj.scheduleWindow
              };
            }
            atomicWriteFileSync(calPath, JSON.stringify(migratedCal.envelope, null, 2));
            updatedAnnouncements = migratedCal.data;
          }
        }
      } catch (_) {}

      // Backup copy for shows
      try {
        const backupPath = getShowsBackupPath();
        if (backupPath) {
          atomicWriteFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Shows backup copy failed:', e);
      }

      res.json({
        success: true,
        _meta: updatedObj._meta,
        ...(updatedAnnouncements ? { announcements: updatedAnnouncements } : {})
      });
    } catch (e: any) {
      console.error('Failed to save shows:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write shows data: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: getShowsFilePath()
      });
    }
  });

  // API - Compatibility Inspection and Pre-Upgrade Backup Snapshot & Migration (Unified Local + Google Drive)
  app.get('/api/compatibility/inspect', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await inspectServerDriveCompatibility(req);
        return res.json(result);
      }

      const calPath = getCalendarFilePath();
      const showsPath = getShowsFilePath();
      const logPath = getLogFilePath();
      let announcementsMeta: any = null;
      let showsMeta: any = null;

      let parsedLogsForBackfill: any = undefined;
      if (logPath && fs.existsSync(logPath)) {
        try {
          parsedLogsForBackfill = JSON.parse(fs.readFileSync(logPath, 'utf-8') || '{}');
        } catch (_) {}
      }

      const sidecar = readStationSettingsSidecar();
      if (showsPath && fs.existsSync(showsPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(showsPath, 'utf-8') || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
            if (!parsed._meta) {
              const counter = typeof parsed.ShowsBackupCounter === 'number' ? Math.max(0, parsed.ShowsBackupCounter - 1) : 0;
              const seeded = migrateShowsPayload(
                parsed,
                CURRENT_APP_VERSION,
                counter,
                sidecar?.stationTimezone,
                sidecar?.adminContactInfo,
                sidecar?.upNextPromo,
                sidecar?.scheduleWindow
              );
              atomicWriteFileSync(showsPath, JSON.stringify(seeded.envelope, null, 2));
              showsMeta = seeded.envelope._meta;
              writeStationSettingsSidecar({
                stationTimezone: seeded.envelope.stationTimezone,
                adminContactInfo: seeded.envelope.adminContactInfo ?? '',
                upNextPromo: seeded.envelope.upNextPromo,
                scheduleWindow: seeded.envelope.scheduleWindow
              });
            } else {
              const seeded = migrateShowsPayload(
                parsed,
                parsed._meta?.lastModifiedBy || CURRENT_APP_VERSION,
                0,
                sidecar?.stationTimezone,
                sidecar?.adminContactInfo,
                sidecar?.upNextPromo,
                sidecar?.scheduleWindow
              );
              showsMeta = parsed._meta;
              writeStationSettingsSidecar({
                stationTimezone: seeded.envelope.stationTimezone,
                adminContactInfo: seeded.envelope.adminContactInfo ?? '',
                upNextPromo: seeded.envelope.upNextPromo,
                scheduleWindow: seeded.envelope.scheduleWindow
              });
            }
          } else {
            showsMeta = { schemaVersion: 0, minAppVersion: '0.15.0', lastModifiedBy: '0.15.0' };
          }
        } catch (_) {}
      }

      if (calPath && fs.existsSync(calPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(calPath, 'utf-8') || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
            const hasUnseededReadTime = parsed.data.some((ann: any) =>
              Array.isArray(ann?.timeGatedMp3s) &&
              ann.timeGatedMp3s.some((slot: any) => {
                if (slot && !Array.isArray(slot.mediaItems) && slot.mp3Url !== undefined) {
                  return true;
                }
                const items: any[] = Array.isArray(slot?.mediaItems) && slot.mediaItems.length > 0 ? slot.mediaItems : [slot];
                return items.some(
                  (mItem: any) =>
                    (mItem?.assetType === 'script' || /\.(txt|md)$/i.test(String(mItem?.mp3Url || ''))) &&
                    !mItem?.approximateReadTime &&
                    Boolean(resolveLocalAnnouncementScriptText(String(mItem?.mp3Url || ''))?.trim())
                );
              })
            );
            if (!parsed._meta || hasUnseededReadTime) {
              const counter = typeof parsed.AnnouncementsBackupCounter === 'number' ? Math.max(0, parsed.AnnouncementsBackupCounter - 1) : 0;
              const seeded = migrateAnnouncementsPayload(
                parsed,
                parsed._meta?.lastModifiedBy || CURRENT_APP_VERSION,
                counter,
                parsedLogsForBackfill,
                resolveLocalAnnouncementScriptText,
                sidecar?.scheduleWindow
              );
              atomicWriteFileSync(calPath, JSON.stringify(seeded.envelope, null, 2));
              announcementsMeta = seeded.envelope._meta;
            } else {
              if (sidecar?.scheduleWindow) {
                parsed._meta.scheduleWindow = sidecar.scheduleWindow;
              }
              announcementsMeta = parsed._meta;
            }
          } else {
            announcementsMeta = { schemaVersion: 0, minAppVersion: '0.15.0', lastModifiedBy: '0.15.0' };
          }
        } catch (_) {}
      }

      if (logPath && fs.existsSync(logPath)) {
        try {
          const parsed = parsedLogsForBackfill || JSON.parse(fs.readFileSync(logPath, 'utf-8') || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data) && !parsed._meta) {
            const counter = typeof parsed.LogsBackupCounter === 'number' ? Math.max(0, parsed.LogsBackupCounter - 1) : 0;
            const seeded = migrateLogsPayload(parsed, CURRENT_APP_VERSION, counter);
            atomicWriteFileSync(logPath, JSON.stringify(seeded.envelope, null, 2));
          }
        } catch (_) {}
      }

      const activeMeta = announcementsMeta || showsMeta || { schemaVersion: CURRENT_SCHEMA_VERSION, minAppVersion: CURRENT_MIN_APP_VERSION, lastModifiedBy: CURRENT_APP_VERSION };
      res.json({ success: true, meta: activeMeta, announcementsMeta, showsMeta });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/compatibility/pre-upgrade-backup', (req, res) => {
    try {
      const calPath = getCalendarFilePath();
      const showsPath = getShowsFilePath();
      const logPath = getLogFilePath();
      const settingsDir = getAmpSettingsDir(currentSettings);
      const backupsDir = path.join(settingsDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      const backupsCreated: string[] = [];

      if (calPath && fs.existsSync(calPath)) {
        const backupTarget = path.join(backupsDir, `announcements.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(calPath, backupTarget);
        backupsCreated.push(backupTarget);
      }

      if (showsPath && fs.existsSync(showsPath)) {
        const backupTarget = path.join(backupsDir, `shows.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(showsPath, backupTarget);
        backupsCreated.push(backupTarget);
      }

      if (logPath && fs.existsSync(logPath)) {
        const backupTarget = path.join(backupsDir, `logs.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(logPath, backupTarget);
        backupsCreated.push(backupTarget);
      }

      res.json({ success: true, backupsCreated });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/compatibility/upgrade', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await upgradeServerDriveSchema(req);
        return res.json(result);
      }

      const calPath = getCalendarFilePath();
      const showsPath = getShowsFilePath();
      const logPath = getLogFilePath();
      const settingsDir = getAmpSettingsDir(currentSettings);
      const backupsDir = path.join(settingsDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      const backupsCreated: string[] = [];

      // 1. Take snapshot backup
      if (calPath && fs.existsSync(calPath)) {
        const backupTarget = path.join(backupsDir, `announcements.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(calPath, backupTarget);
        backupsCreated.push(backupTarget);
      }
      if (showsPath && fs.existsSync(showsPath)) {
        const backupTarget = path.join(backupsDir, `shows.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(showsPath, backupTarget);
        backupsCreated.push(backupTarget);
      }
      if (logPath && fs.existsSync(logPath)) {
        const backupTarget = path.join(backupsDir, `logs.backup-pre-upgrade-${timestamp}.json`);
        fs.copyFileSync(logPath, backupTarget);
        backupsCreated.push(backupTarget);
      }

      const isoNow = now.toISOString();

      const upgradeSidecar = readStationSettingsSidecar();
      // 2. Transactional Phase 1: Transform in-memory using canonical compatibility engine
      let showsMigrationResult: { envelope: any; data: any[] } | null = null;
      if (showsPath && fs.existsSync(showsPath)) {
        try {
          const rawShows = fs.readFileSync(showsPath, 'utf-8');
          const parsed = JSON.parse(rawShows || '[]');
          showsMigrationResult = migrateShowsPayload(
            parsed,
            CURRENT_APP_VERSION,
            0,
            upgradeSidecar?.stationTimezone,
            upgradeSidecar?.adminContactInfo,
            upgradeSidecar?.upNextPromo,
            upgradeSidecar?.scheduleWindow
          );
        } catch (err: any) {
          console.error('Error parsing shows during upgrade:', err);
          throw new Error(`Failed to parse shows.json: ${err.message}`);
        }
      }

      let logsMigrationResult: { envelope: any; data: any[] } | null = null;
      let rawLogsParsed: any = undefined;
      if (logPath && fs.existsSync(logPath)) {
        try {
          const rawLogs = fs.readFileSync(logPath, 'utf-8');
          rawLogsParsed = JSON.parse(rawLogs || '[]');
          logsMigrationResult = migrateLogsPayload(rawLogsParsed, CURRENT_APP_VERSION);
        } catch (err: any) {
          console.error('Error parsing logs during upgrade:', err);
          throw new Error(`Failed to parse logs.json: ${err.message}`);
        }
      }

      let annMigrationResult: { envelope: any; data: any[] } | null = null;
      if (calPath && fs.existsSync(calPath)) {
        try {
          const rawCal = fs.readFileSync(calPath, 'utf-8');
          const parsed = JSON.parse(rawCal || '[]');
          annMigrationResult = migrateAnnouncementsPayload(
            parsed,
            CURRENT_APP_VERSION,
            0,
            rawLogsParsed,
            resolveLocalAnnouncementScriptText,
            upgradeSidecar?.scheduleWindow
          );
        } catch (err: any) {
          console.error('Error parsing announcements during upgrade:', err);
          throw new Error(`Failed to parse announcements.json: ${err.message}`);
        }
      }

      // 3. Transactional Phase 2: Stage writes to temporary files (.upgrade.tmp)
      const calTmp = (calPath && annMigrationResult) ? `${calPath}.upgrade.tmp` : null;
      const showsTmp = (showsPath && showsMigrationResult) ? `${showsPath}.upgrade.tmp` : null;
      const logsTmp = (logPath && logsMigrationResult) ? `${logPath}.upgrade.tmp` : null;

      try {
        if (calTmp && annMigrationResult) {
          fs.writeFileSync(calTmp, JSON.stringify(annMigrationResult.envelope, null, 2), 'utf-8');
        }
        if (showsTmp && showsMigrationResult) {
          fs.writeFileSync(showsTmp, JSON.stringify(showsMigrationResult.envelope, null, 2), 'utf-8');
        }
        if (logsTmp && logsMigrationResult) {
          fs.writeFileSync(logsTmp, JSON.stringify(logsMigrationResult.envelope, null, 2), 'utf-8');
        }

        // 4. Transactional Commit: Atomically swap staged files into place
        if (calTmp && calPath && annMigrationResult) {
          fs.renameSync(calTmp, calPath);
          const calBackup = getCalendarBackupPath();
          if (calBackup) {
            try { atomicWriteFileSync(calBackup, JSON.stringify(annMigrationResult.envelope, null, 2)); } catch (_) {}
          }
        }
        if (showsTmp && showsPath && showsMigrationResult) {
          fs.renameSync(showsTmp, showsPath);
          const showsBackup = getShowsBackupPath();
          if (showsBackup) {
            try { atomicWriteFileSync(showsBackup, JSON.stringify(showsMigrationResult.envelope, null, 2)); } catch (_) {}
          }
        }
        if (logsTmp && logPath && logsMigrationResult) {
          fs.renameSync(logsTmp, logPath);
          const logBackup = getLogBackupPath();
          if (logBackup) {
            try { atomicWriteFileSync(logBackup, JSON.stringify(logsMigrationResult.envelope, null, 2)); } catch (_) {}
          }
        }
      } catch (writeErr: any) {
        if (calTmp && fs.existsSync(calTmp)) try { fs.unlinkSync(calTmp); } catch (_) {}
        if (showsTmp && fs.existsSync(showsTmp)) try { fs.unlinkSync(showsTmp); } catch (_) {}
        if (logsTmp && fs.existsSync(logsTmp)) try { fs.unlinkSync(logsTmp); } catch (_) {}
        console.error('Transactional write failure during schema upgrade, rolled back temporary files:', writeErr);
        throw writeErr;
      }

      const upgradedMeta = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        minAppVersion: CURRENT_MIN_APP_VERSION,
        lastModifiedBy: CURRENT_APP_VERSION,
        lastModifiedAt: isoNow
      };

      res.json({
        success: true,
        meta: upgradedMeta,
        announcements: annMigrationResult ? annMigrationResult.data : [],
        shows: showsMigrationResult ? showsMigrationResult.data : [],
        logs: logsMigrationResult ? logsMigrationResult.data : undefined,
        backupsCreated
      });
    } catch (e: any) {
      console.error('Failed to run schema upgrade:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // API - Logs (Unified Local + Google Drive Provider)
  app.get('/api/logs', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const logs = await readDriveLogs(req);
        return res.json(logs);
      }

      const filePath = getLogFilePath();
      const backupPath = getLogBackupPath();
      const { parsed, fileExists } = await readJsonFileWithCloudCatchUp(filePath, backupPath);
      if (!fileExists) {
        return res.json([]);
      }
      const rawLogs = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? (Array.isArray(parsed.data) ? parsed.data : [])
        : (Array.isArray(parsed) ? parsed : []);
      res.json(rawLogs.map((entry: any) => seedLogEntrySiblings(entry)));
    } catch (e: any) {
      console.error('Failed to read logs from endpoint:', e);
      res.status(500).json(isServerDriveStorageRequest(req) ? { error: e?.message || 'Failed to read logs' } : []);
    }
  });

  app.post('/api/logs', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const updatedLogs = await appendDriveLog(req, req.body);
        return res.json({ success: true, logs: updatedLogs });
      }

      const entry: LogEntry = seedLogEntrySiblings(req.body);
      const filePath = getLogFilePath();
      if (!filePath) {
        return res.status(400).json({ error: 'Logs directory is not configured' });
      }
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      let logs = [];
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '[]');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            logs = Array.isArray(parsed.data) ? parsed.data : [];
            counter = parsed.LogsBackupCounter || 0;
          } else {
            logs = Array.isArray(parsed) ? parsed : [];
          }
        } catch (pe) {
          logs = [];
        }
      }
      logs = logs.map((item: any) => seedLogEntrySiblings(item));
      logs.push(entry);

      counter += 1; // Increment on every backup / save operation
      const updatedObj = {
        _meta: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          minAppVersion: CURRENT_MIN_APP_VERSION,
          lastModifiedBy: CURRENT_APP_VERSION,
          lastModifiedAt: new Date().toISOString()
        },
        LogsBackupCounter: counter,
        data: logs
      };
      // Save main log as object structure atomically
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Simple backup mechanism
      try {
        const backupPath = getLogBackupPath();
        if (backupPath) {
          atomicWriteFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Backup failed:', e);
      }

      res.json({ success: true, logs });
    } catch (e: any) {
      console.error('Failed to save log to endpoint:', e);
      res.status(500).json({ error: 'Failed to save log: ' + e.message });
    }
  });

  // API - Trigger schedules, shows, and logs archiving/backup (Unified Local + Google Drive)
  app.post('/api/trigger-backup', async (req, res) => {
    try {
      if (isServerDriveStorageRequest(req)) {
        const result = await triggerServerDriveBackup(req, req.body?.workstationMode);
        return res.json(result);
      }

      const calendarPath = getCalendarFilePath();
      const logPath = getLogFilePath();
      const showsPath = getShowsFilePath();

      // If folders are not configured, skip local backup without touching disk or creating files
      if (!calendarPath && !logPath && !showsPath) {
        return res.json({ success: true, skipped: true, reason: 'Folders not configured' });
      }

      const backupSidecar = readStationSettingsSidecar();

      // Backup schedules (preserving _meta and sibling fields)
      if (calendarPath) {
        if (!fs.existsSync(calendarPath)) {
          const initialAnn = migrateAnnouncementsPayload(
            { AnnouncementsBackupCounter: 0, data: [] },
            CURRENT_APP_VERSION,
            -1,
            undefined,
            undefined,
            backupSidecar?.scheduleWindow
          );
          atomicWriteFileSync(calendarPath, JSON.stringify(initialAnn.envelope, null, 2));
        }

        if (fs.existsSync(calendarPath)) {
          const data = fs.readFileSync(calendarPath, 'utf-8');
          let parsed: any;
          try {
            parsed = JSON.parse(data || '[]');
          } catch {
            parsed = [];
          }

          const existingCounter = Array.isArray(parsed) ? 0 : (parsed.AnnouncementsBackupCounter || 0);
          const migratedAnn = migrateAnnouncementsPayload(
            parsed,
            parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
            existingCounter,
            undefined,
            resolveLocalAnnouncementScriptText,
            backupSidecar?.scheduleWindow
          );
          const updatedStr = JSON.stringify(migratedAnn.envelope, null, 2);
          atomicWriteFileSync(calendarPath, updatedStr);

          const backupFileName = generateBackupFilename('announcements', req.body?.workstationMode);

          const calendarDir = path.dirname(calendarPath);
          const calendarBackupDir = path.join(calendarDir, 'backups');
          atomicWriteFileSync(path.join(calendarBackupDir, backupFileName), updatedStr);

          // Also save to schedules_backup.json
          try {
            const backupPath = getCalendarBackupPath();
            if (backupPath) {
              atomicWriteFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Schedules trigger backup failed to copy:', e);
          }
        }
      }

      // Backup logs (preserving _meta and seeding sibling fields)
      if (logPath) {
        if (!fs.existsSync(logPath)) {
          const initialLogs = migrateLogsPayload({ LogsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
          atomicWriteFileSync(logPath, JSON.stringify(initialLogs.envelope, null, 2));
        }

        if (fs.existsSync(logPath)) {
          const data = fs.readFileSync(logPath, 'utf-8');
          let parsed: any;
          try {
            parsed = JSON.parse(data || '[]');
          } catch (pe) {
            parsed = [];
          }

          const existingCounter = Array.isArray(parsed) ? 0 : (parsed.LogsBackupCounter || 0);
          const migratedLogs = migrateLogsPayload(parsed, parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION, existingCounter);
          const updatedStr = JSON.stringify(migratedLogs.envelope, null, 2);
          atomicWriteFileSync(logPath, updatedStr);

          const backupFileName = generateBackupFilename('logs', req.body?.workstationMode);

          const logDir = path.dirname(logPath);
          const logBackupDir = path.join(logDir, 'backups');
          atomicWriteFileSync(path.join(logBackupDir, backupFileName), updatedStr);

          // Also save to logs_backup.json
          try {
            const backupPath = getLogBackupPath();
            if (backupPath) {
              atomicWriteFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Logs trigger backup failed to copy:', e);
          }
        }
      }

      // Backup shows (preserving _meta and sibling fields)
      if (showsPath) {
        if (!fs.existsSync(showsPath)) {
          const initialShows = migrateShowsPayload({ ShowsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
          atomicWriteFileSync(showsPath, JSON.stringify(initialShows.envelope, null, 2));
        }

        if (fs.existsSync(showsPath)) {
          const data = fs.readFileSync(showsPath, 'utf-8');
          let parsed: any;
          try {
            parsed = JSON.parse(data || '[]');
          } catch (pe) {
            parsed = [];
          }

          const existingCounter = Array.isArray(parsed) ? 0 : (parsed.ShowsBackupCounter || 0);
          const migratedShows = migrateShowsPayload(
            parsed,
            parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
            existingCounter,
            backupSidecar?.stationTimezone,
            backupSidecar?.adminContactInfo,
            backupSidecar?.upNextPromo,
            backupSidecar?.scheduleWindow
          );
          const updatedStr = JSON.stringify(migratedShows.envelope, null, 2);
          atomicWriteFileSync(showsPath, updatedStr);

          const backupFileName = generateBackupFilename('shows', req.body?.workstationMode);

          const showsDir = path.dirname(showsPath);
          const showsBackupDir = path.join(showsDir, 'backups');
          atomicWriteFileSync(path.join(showsBackupDir, backupFileName), updatedStr);

          // Also save to shows_backup.json
          try {
            const backupPath = getShowsBackupPath();
            if (backupPath) {
              atomicWriteFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Shows trigger backup failed to copy:', e);
          }
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Local backup trigger failed:', e);
      res.status(500).json({ error: 'Archiving failed: ' + e.message });
    }
  });
}
