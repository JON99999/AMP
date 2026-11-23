import express from 'express';
import fs from 'fs';
import path from 'path';
import { Announcement, Show, LogEntry } from '../../types';
import {
  CURRENT_APP_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_MIN_APP_VERSION,
  DEFAULT_SCHEDULE_WINDOW_CONFIG,
  compareSemver,
  resolveHighestAppVersion,
  seedLogEntrySiblings,
  migrateAnnouncementsPayload,
  migrateShowsPayload,
  migrateLogsPayload
} from '../../lib/compatibility';
import {
  currentSettings,
  getAmpSettingsDir,
  getAmpLogsDir,
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
  readJsonFileWithCloudCatchUp,
  isPathWithinAnyDir
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
  const resolveShowsMetadataWithSidecarFallback = (parsed: any, sidecar: any) => {
    const isObj = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    const embeddedMeta = Array.isArray(parsed?.data)
      ? parsed.data.find((it: any) => it && typeof it._stationMeta === 'object')?._stationMeta
      : undefined;
    const stationTimezone =
      (isObj && (parsed.stationTimezone || parsed._meta?.stationTimezone)) ||
      embeddedMeta?.stationTimezone ||
      sidecar?.stationTimezone;
    const adminContactInfo =
      isObj && parsed.adminContactInfo !== undefined
        ? parsed.adminContactInfo
        : isObj && parsed._meta?.adminContactInfo !== undefined
          ? parsed._meta.adminContactInfo
          : embeddedMeta?.adminContactInfo !== undefined
            ? embeddedMeta.adminContactInfo
            : sidecar?.adminContactInfo;
    const upNextPromo =
      (isObj && (parsed.upNextPromo || parsed._meta?.upNextPromo)) ||
      embeddedMeta?.upNextPromo ||
      sidecar?.upNextPromo;
    const scheduleWindow =
      (isObj && (parsed.scheduleWindow || parsed._meta?.scheduleWindow)) ||
      embeddedMeta?.scheduleWindow ||
      sidecar?.scheduleWindow;
    const adminMessages =
      isObj && Array.isArray(parsed.adminMessages)
        ? parsed.adminMessages
        : isObj && Array.isArray(parsed._meta?.adminMessages)
          ? parsed._meta.adminMessages
          : Array.isArray(embeddedMeta?.adminMessages)
            ? embeddedMeta.adminMessages
            : sidecar?.adminMessages;
    return {
      embeddedMeta,
      stationTimezone,
      adminContactInfo,
      upNextPromo,
      scheduleWindow,
      adminMessages
    };
  };

  const resolveAnnScheduleWindowWithSidecarFallback = (parsed: any, sidecar: any) => {
    const isObj = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
    const embeddedAnnMeta = Array.isArray(parsed?.data)
      ? parsed.data.find((it: any) => it && typeof it._stationMeta === 'object')?._stationMeta
      : undefined;
    return (
      (isObj && (parsed._meta?.scheduleWindow || parsed.scheduleWindow)) ||
      embeddedAnnMeta?.scheduleWindow ||
      sidecar?.scheduleWindow
    );
  };

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
      const resolvedAnnWindow = resolveAnnScheduleWindowWithSidecarFallback(parsed, sidecar);
      const migrated = migrateAnnouncementsPayload(
        parsed,
        lastMod,
        0,
        rawLogs,
        resolveLocalAnnouncementScriptText,
        resolvedAnnWindow
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
      const backupPath = !isServerDriveStorageRequest(req) ? getCalendarBackupPath() : null;
      res.status(500).json({
        error: e?.message || 'Failed to read schedules',
        backupAvailable: Boolean(backupPath && fs.existsSync(backupPath))
      });
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
      if (sidecar && updatedObj.data.length > 0 && updatedObj.data[0] && typeof updatedObj.data[0] === 'object') {
        updatedObj.data[0]._stationMeta = {
          ...(updatedObj.data[0]._stationMeta || {}),
          ...(sidecar.stationTimezone ? { stationTimezone: sidecar.stationTimezone } : {}),
          ...(sidecar.adminContactInfo !== undefined ? { adminContactInfo: sidecar.adminContactInfo } : {}),
          ...(sidecar.upNextPromo ? { upNextPromo: sidecar.upNextPromo } : {}),
          ...(effectiveScheduleWindow ? { scheduleWindow: effectiveScheduleWindow } : sidecar.scheduleWindow ? { scheduleWindow: sidecar.scheduleWindow } : {}),
          ...(Array.isArray(sidecar.adminMessages) ? { adminMessages: sidecar.adminMessages } : {}),
          ...(updatedObj._meta?.highestAppVersion ? { highestAppVersion: updatedObj._meta.highestAppVersion } : {})
        };
      }
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
            scheduleWindow: { ...DEFAULT_SCHEDULE_WINDOW_CONFIG },
            adminMessages: [],
            ShowsBackupCounter: 0,
            data: []
          });
        }
        return res.json([]);
      }
      const sidecar = readStationSettingsSidecar();
      const resolvedShowsMeta = resolveShowsMetadataWithSidecarFallback(parsed, sidecar);
      const embeddedMeta = resolvedShowsMeta.embeddedMeta;
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
        resolvedShowsMeta.stationTimezone,
        resolvedShowsMeta.adminContactInfo,
        resolvedShowsMeta.upNextPromo,
        resolvedShowsMeta.scheduleWindow,
        resolvedShowsMeta.adminMessages
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
          scheduleWindow: seededResult.envelope.scheduleWindow || seededResult.envelope._meta?.scheduleWindow || { ...DEFAULT_SCHEDULE_WINDOW_CONFIG },
          adminMessages: Array.isArray(seededResult.envelope.adminMessages) ? seededResult.envelope.adminMessages : [],
          ShowsBackupCounter: parsed?.ShowsBackupCounter || 0,
          data: seeded
        });
      }
      res.json(seeded);
    } catch (e: any) {
      console.error('Failed to read shows:', e);
      const backupPath = !isServerDriveStorageRequest(req) ? getShowsBackupPath() : null;
      res.status(500).json({
        error: e?.message || 'Failed to read shows',
        backupAvailable: Boolean(backupPath && fs.existsSync(backupPath))
      });
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
      const explicitAdminMessages =
        !Array.isArray(rawPayload) && rawPayload && typeof rawPayload === 'object'
          ? (Array.isArray(rawPayload.adminMessages)
              ? rawPayload.adminMessages
              : Array.isArray(rawPayload._meta?.adminMessages)
                ? rawPayload._meta.adminMessages
                : undefined)
          : undefined;
      let counter = 0;
      let existingMeta: any = null;
      let existingParsed: any = null;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            existingParsed = parsed;
            counter = parsed.ShowsBackupCounter || 0;
            existingMeta = parsed._meta || null;
          }
        } catch (pe) {}
      }
      const sidecar = readStationSettingsSidecar();
      const existingResolved = resolveShowsMetadataWithSidecarFallback(existingParsed, sidecar);
      const migrated = migrateShowsPayload(
        {
          _meta: rawPayload?._meta || existingMeta,
          ShowsBackupCounter: counter,
          data: shows,
          ...(existingResolved.adminContactInfo !== undefined ? { adminContactInfo: existingResolved.adminContactInfo } : {}),
          ...(existingResolved.upNextPromo !== undefined ? { upNextPromo: existingResolved.upNextPromo } : {}),
          ...(existingResolved.scheduleWindow !== undefined ? { scheduleWindow: existingResolved.scheduleWindow } : {}),
          ...(existingResolved.adminMessages !== undefined ? { adminMessages: existingResolved.adminMessages } : {})
        },
        CURRENT_APP_VERSION,
        counter,
        explicitTz ?? existingResolved.stationTimezone,
        explicitAdminContact,
        explicitUpNextPromo,
        explicitScheduleWindow,
        explicitAdminMessages
      );
      const updatedObj = migrated.envelope;
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));
      writeStationSettingsSidecar({
        stationTimezone: updatedObj.stationTimezone,
        adminContactInfo: updatedObj.adminContactInfo ?? '',
        upNextPromo: updatedObj.upNextPromo,
        scheduleWindow: updatedObj.scheduleWindow,
        adminMessages: updatedObj.adminMessages ?? []
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
                scheduleWindow: updatedObj.scheduleWindow,
                adminMessages: updatedObj.adminMessages ?? [],
                ...(updatedObj._meta?.highestAppVersion ? { highestAppVersion: updatedObj._meta.highestAppVersion } : {})
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

      const ensureFirstTouchPreUpgradeBackup = (storeName: 'announcements' | 'shows' | 'logs', sourceFilePath: string) => {
        try {
          const settingsDir = getAmpSettingsDir(currentSettings);
          if (!settingsDir || !sourceFilePath || !fs.existsSync(sourceFilePath)) return;
          const backupsDir = path.join(settingsDir, 'backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }
          const prefix = `${storeName}.backup-pre-upgrade-`;
          const alreadyHasPreUpgrade = fs.readdirSync(backupsDir).some((f) => f.toLowerCase().startsWith(prefix));
          if (!alreadyHasPreUpgrade) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(sourceFilePath, path.join(backupsDir, `${prefix}${ts}.json`));
          }
        } catch (_) {}
      };

      let activeSidecar = readStationSettingsSidecar();
      if (showsPath && fs.existsSync(showsPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(showsPath, 'utf-8') || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
            const resolvedInspectMeta = resolveShowsMetadataWithSidecarFallback(parsed, activeSidecar);
            if (!parsed._meta) {
              ensureFirstTouchPreUpgradeBackup('shows', showsPath);
              const counter = typeof parsed.ShowsBackupCounter === 'number' ? Math.max(0, parsed.ShowsBackupCounter - 1) : 0;
              const seeded = migrateShowsPayload(
                parsed,
                CURRENT_APP_VERSION,
                counter,
                resolvedInspectMeta.stationTimezone,
                resolvedInspectMeta.adminContactInfo,
                resolvedInspectMeta.upNextPromo,
                resolvedInspectMeta.scheduleWindow,
                resolvedInspectMeta.adminMessages
              );
              atomicWriteFileSync(showsPath, JSON.stringify(seeded.envelope, null, 2));
              showsMeta = seeded.envelope._meta;
              writeStationSettingsSidecar({
                stationTimezone: seeded.envelope.stationTimezone,
                adminContactInfo: seeded.envelope.adminContactInfo ?? '',
                upNextPromo: seeded.envelope.upNextPromo,
                scheduleWindow: seeded.envelope.scheduleWindow,
                adminMessages: seeded.envelope.adminMessages ?? []
              });
              activeSidecar = readStationSettingsSidecar();
            } else {
              const seeded = migrateShowsPayload(
                parsed,
                parsed._meta?.lastModifiedBy || CURRENT_APP_VERSION,
                0,
                resolvedInspectMeta.stationTimezone,
                resolvedInspectMeta.adminContactInfo,
                resolvedInspectMeta.upNextPromo,
                resolvedInspectMeta.scheduleWindow,
                resolvedInspectMeta.adminMessages
              );
              const recordedHighest = resolveHighestAppVersion(
                parsed._meta?.highestAppVersion,
                parsed._meta?.lastModifiedBy
              );
              const isCompatibleShowsMeta =
                (parsed._meta?.schemaVersion ?? 0) >= CURRENT_SCHEMA_VERSION &&
                compareSemver(parsed._meta?.minAppVersion || '0.0.0', CURRENT_APP_VERSION) <= 0;
              if (
                isCompatibleShowsMeta &&
                (!parsed._meta?.highestAppVersion ||
                  compareSemver(CURRENT_APP_VERSION, recordedHighest) > 0)
              ) {
                parsed._meta.highestAppVersion = resolveHighestAppVersion(
                  recordedHighest,
                  CURRENT_APP_VERSION
                );
                try {
                  atomicWriteFileSync(showsPath, JSON.stringify(parsed, null, 2));
                } catch (_) {}
              }
              showsMeta = parsed._meta;
              writeStationSettingsSidecar({
                stationTimezone: seeded.envelope.stationTimezone,
                adminContactInfo: seeded.envelope.adminContactInfo ?? '',
                upNextPromo: seeded.envelope.upNextPromo,
                scheduleWindow: seeded.envelope.scheduleWindow,
                adminMessages: seeded.envelope.adminMessages ?? []
              });
              activeSidecar = readStationSettingsSidecar();
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
            const resolvedAnnWindow = resolveAnnScheduleWindowWithSidecarFallback(parsed, activeSidecar);
            if (!parsed._meta || hasUnseededReadTime) {
              if (!parsed._meta) {
                ensureFirstTouchPreUpgradeBackup('announcements', calPath);
              }
              const counter = typeof parsed.AnnouncementsBackupCounter === 'number' ? Math.max(0, parsed.AnnouncementsBackupCounter - 1) : 0;
              const seeded = migrateAnnouncementsPayload(
                parsed,
                parsed._meta?.lastModifiedBy || CURRENT_APP_VERSION,
                counter,
                parsedLogsForBackfill,
                resolveLocalAnnouncementScriptText,
                resolvedAnnWindow
              );
              if (activeSidecar && seeded.envelope.data.length > 0 && seeded.envelope.data[0] && typeof seeded.envelope.data[0] === 'object') {
                seeded.envelope.data[0]._stationMeta = {
                  ...(seeded.envelope.data[0]._stationMeta || {}),
                  ...(activeSidecar.stationTimezone ? { stationTimezone: activeSidecar.stationTimezone } : {}),
                  ...(activeSidecar.adminContactInfo !== undefined ? { adminContactInfo: activeSidecar.adminContactInfo } : {}),
                  ...(activeSidecar.upNextPromo ? { upNextPromo: activeSidecar.upNextPromo } : {}),
                  ...(resolvedAnnWindow ? { scheduleWindow: resolvedAnnWindow } : activeSidecar.scheduleWindow ? { scheduleWindow: activeSidecar.scheduleWindow } : {}),
                  ...(Array.isArray(activeSidecar.adminMessages) ? { adminMessages: activeSidecar.adminMessages } : {}),
                  ...(seeded.envelope._meta?.highestAppVersion ? { highestAppVersion: seeded.envelope._meta.highestAppVersion } : {})
                };
              }
              atomicWriteFileSync(calPath, JSON.stringify(seeded.envelope, null, 2));
              announcementsMeta = seeded.envelope._meta;
            } else {
              if (resolvedAnnWindow) {
                parsed._meta.scheduleWindow = resolvedAnnWindow;
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
            ensureFirstTouchPreUpgradeBackup('logs', logPath);
            const counter = typeof parsed.LogsBackupCounter === 'number' ? Math.max(0, parsed.LogsBackupCounter - 1) : 0;
            const seeded = migrateLogsPayload(parsed, CURRENT_APP_VERSION, counter);
            atomicWriteFileSync(logPath, JSON.stringify(seeded.envelope, null, 2));
          }
        } catch (_) {}
      }

      const logsMeta =
        parsedLogsForBackfill &&
        typeof parsedLogsForBackfill === 'object' &&
        !Array.isArray(parsedLogsForBackfill)
          ? parsedLogsForBackfill._meta
          : null;
      const baseMeta = announcementsMeta || showsMeta || {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        minAppVersion: CURRENT_MIN_APP_VERSION,
        lastModifiedBy: CURRENT_APP_VERSION
      };
      const highestAppVersion = resolveHighestAppVersion(
        announcementsMeta?.highestAppVersion,
        announcementsMeta?.lastModifiedBy,
        showsMeta?.highestAppVersion,
        showsMeta?.lastModifiedBy,
        logsMeta?.highestAppVersion,
        logsMeta?.lastModifiedBy,
        CURRENT_APP_VERSION
      );
      const activeMeta = {
        ...baseMeta,
        highestAppVersion
      };
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
          const resolvedUpgradeShows = resolveShowsMetadataWithSidecarFallback(parsed, upgradeSidecar);
          showsMigrationResult = migrateShowsPayload(
            parsed,
            CURRENT_APP_VERSION,
            0,
            resolvedUpgradeShows.stationTimezone,
            resolvedUpgradeShows.adminContactInfo,
            resolvedUpgradeShows.upNextPromo,
            resolvedUpgradeShows.scheduleWindow,
            resolvedUpgradeShows.adminMessages
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
          const resolvedUpgradeAnnWindow =
            showsMigrationResult?.envelope?.scheduleWindow ||
            resolveAnnScheduleWindowWithSidecarFallback(parsed, upgradeSidecar);
          annMigrationResult = migrateAnnouncementsPayload(
            parsed,
            CURRENT_APP_VERSION,
            0,
            rawLogsParsed,
            resolveLocalAnnouncementScriptText,
            resolvedUpgradeAnnWindow
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
          writeStationSettingsSidecar({
            stationTimezone: showsMigrationResult.envelope.stationTimezone,
            adminContactInfo: showsMigrationResult.envelope.adminContactInfo ?? '',
            upNextPromo: showsMigrationResult.envelope.upNextPromo,
            scheduleWindow: showsMigrationResult.envelope.scheduleWindow,
            adminMessages: showsMigrationResult.envelope.adminMessages ?? []
          });
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
        highestAppVersion: resolveHighestAppVersion(
          annMigrationResult?.envelope?._meta?.highestAppVersion,
          showsMigrationResult?.envelope?._meta?.highestAppVersion,
          logsMigrationResult?.envelope?._meta?.highestAppVersion,
          CURRENT_APP_VERSION
        ),
        lastModifiedAt: isoNow
      };

      res.json({
        success: true,
        meta: upgradedMeta,
        announcements: annMigrationResult ? annMigrationResult.data : [],
        shows: showsMigrationResult ? showsMigrationResult.data : [],
        logs: logsMigrationResult ? logsMigrationResult.data : undefined,
        ...(showsMigrationResult ? {
          stationTimezone: showsMigrationResult.envelope.stationTimezone,
          adminContactInfo: showsMigrationResult.envelope.adminContactInfo ?? '',
          upNextPromo: showsMigrationResult.envelope.upNextPromo,
          scheduleWindow: showsMigrationResult.envelope.scheduleWindow,
          adminMessages: Array.isArray(showsMigrationResult.envelope.adminMessages) ? showsMigrationResult.envelope.adminMessages : []
        } : {}),
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
      const backupPath = !isServerDriveStorageRequest(req) ? getLogBackupPath() : null;
      res.status(500).json({
        error: e?.message || 'Failed to read logs',
        backupAvailable: Boolean(backupPath && fs.existsSync(backupPath))
      });
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
      let existingMeta: any = null;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        if (!data || !data.trim()) {
          return res.status(500).json({
            error: 'Existing logs.json is empty and cannot be appended safely.'
          });
        }
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch (pe: any) {
          console.error('Refusing to append to malformed logs.json:', pe);
          return res.status(500).json({
            error: `Existing logs.json is malformed and cannot be appended safely: ${pe?.message || 'parse failed'}`
          });
        }
        if (Array.isArray(parsed)) {
          logs = parsed;
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
          logs = parsed.data;
          counter = parsed.LogsBackupCounter || 0;
          existingMeta = parsed._meta || null;
        } else {
          return res.status(500).json({
            error: 'Existing logs.json has an invalid data structure and cannot be appended safely.'
          });
        }
      }
      logs = logs.map((item: any) => seedLogEntrySiblings(item));
      logs.push(entry);

      const migratedLogs = migrateLogsPayload(
        { _meta: existingMeta, LogsBackupCounter: counter, data: logs },
        CURRENT_APP_VERSION,
        counter
      );
      const updatedObj = migratedLogs.envelope;
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
      const failedStores: string[] = [];

      const parseExistingStoreOrRecordFailure = (storeName: string, targetPath: string): any | null => {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        if (!raw || !raw.trim()) {
          console.error(`Skipping backup for empty ${storeName}.json to prevent data wipe.`);
          failedStores.push(`${storeName}.json`);
          return null;
        }
        try {
          const parsed = JSON.parse(raw);
          const hasValidArray =
            Array.isArray(parsed) ||
            (parsed && typeof parsed === 'object' && Array.isArray(parsed.data));
          if (!hasValidArray) {
            console.error(`Skipping backup for structurally invalid ${storeName}.json to prevent data wipe.`);
            failedStores.push(`${storeName}.json`);
            return null;
          }
          return parsed;
        } catch (pe) {
          console.error(`Skipping backup for malformed ${storeName}.json to prevent data wipe:`, pe);
          failedStores.push(`${storeName}.json`);
          return null;
        }
      };

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
          const parsed = parseExistingStoreOrRecordFailure('announcements', calendarPath);
          if (parsed !== null) {
            const existingCounter = Array.isArray(parsed) ? 0 : (parsed.AnnouncementsBackupCounter || 0);
            const resolvedAnnWindow = resolveAnnScheduleWindowWithSidecarFallback(parsed, backupSidecar);
            const migratedAnn = migrateAnnouncementsPayload(
              parsed,
              parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
              existingCounter,
              undefined,
              resolveLocalAnnouncementScriptText,
              resolvedAnnWindow
            );
            if (backupSidecar && migratedAnn.envelope.data.length > 0 && migratedAnn.envelope.data[0] && typeof migratedAnn.envelope.data[0] === 'object') {
              migratedAnn.envelope.data[0]._stationMeta = {
                ...(migratedAnn.envelope.data[0]._stationMeta || {}),
                ...(backupSidecar.stationTimezone ? { stationTimezone: backupSidecar.stationTimezone } : {}),
                ...(backupSidecar.adminContactInfo !== undefined ? { adminContactInfo: backupSidecar.adminContactInfo } : {}),
                ...(backupSidecar.upNextPromo ? { upNextPromo: backupSidecar.upNextPromo } : {}),
                ...(resolvedAnnWindow ? { scheduleWindow: resolvedAnnWindow } : backupSidecar.scheduleWindow ? { scheduleWindow: backupSidecar.scheduleWindow } : {}),
                ...(Array.isArray(backupSidecar.adminMessages) ? { adminMessages: backupSidecar.adminMessages } : {}),
                ...(migratedAnn.envelope._meta?.highestAppVersion ? { highestAppVersion: migratedAnn.envelope._meta.highestAppVersion } : {})
              };
            }
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
      }

      // Backup logs (preserving _meta and seeding sibling fields)
      if (logPath) {
        if (!fs.existsSync(logPath)) {
          const initialLogs = migrateLogsPayload({ LogsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
          atomicWriteFileSync(logPath, JSON.stringify(initialLogs.envelope, null, 2));
        }

        if (fs.existsSync(logPath)) {
          const parsed = parseExistingStoreOrRecordFailure('logs', logPath);
          if (parsed !== null) {
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
      }

      // Backup shows (preserving _meta and sibling fields)
      if (showsPath) {
        if (!fs.existsSync(showsPath)) {
          const initialShows = migrateShowsPayload({ ShowsBackupCounter: 0, data: [] }, CURRENT_APP_VERSION, -1);
          atomicWriteFileSync(showsPath, JSON.stringify(initialShows.envelope, null, 2));
        }

        if (fs.existsSync(showsPath)) {
          const parsed = parseExistingStoreOrRecordFailure('shows', showsPath);
          if (parsed !== null) {
            const existingCounter = Array.isArray(parsed) ? 0 : (parsed.ShowsBackupCounter || 0);
            const resolvedBackupShows = resolveShowsMetadataWithSidecarFallback(parsed, backupSidecar);
            const migratedShows = migrateShowsPayload(
              parsed,
              parsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
              existingCounter,
              resolvedBackupShows.stationTimezone,
              resolvedBackupShows.adminContactInfo,
              resolvedBackupShows.upNextPromo,
              resolvedBackupShows.scheduleWindow,
              resolvedBackupShows.adminMessages
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
      }

      if (failedStores.length > 0) {
        return res.status(500).json({
          success: false,
          error: `Backup skipped for malformed file(s): ${failedStores.join(', ')}`,
          failedStores
        });
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Local backup trigger failed:', e);
      res.status(500).json({ error: 'Archiving failed: ' + e.message });
    }
  });

  // ============================================================================
  // Local Data Health Diagnosis & Admin Backup Recovery
  // ============================================================================
  type BackupTargetKey = 'announcements' | 'shows' | 'logs';

  const validateParsedDataPayload = (
    target: BackupTargetKey,
    rawText: string
  ): { valid: boolean; recordCount: number; error?: string } => {
    if (!rawText || !rawText.trim()) {
      return { valid: false, recordCount: 0, error: 'File is empty' };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch (err: any) {
      return { valid: false, recordCount: 0, error: `Invalid JSON: ${err?.message || 'parse failed'}` };
    }
    let records: any[] | null = null;
    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
      records = parsed.data;
    }
    if (!records) {
      return { valid: false, recordCount: 0, error: 'Missing expected data array structure' };
    }
    for (const item of records) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { valid: false, recordCount: 0, error: `Invalid entry inside ${target} data array` };
      }
    }
    return { valid: true, recordCount: records.length };
  };

  const matchesBackupTargetFilename = (target: BackupTargetKey, fileName: string): boolean => {
    const lower = fileName.toLowerCase();
    if (!lower.endsWith('.json')) return false;
    if (target === 'announcements') {
      return (
        lower === 'announcements_backup.json' ||
        lower === 'schedules_backup.json' ||
        lower.startsWith('announcements_') ||
        lower.startsWith('announcements.backup') ||
        lower.startsWith('schedules_') ||
        lower.startsWith('schedules.backup')
      );
    }
    if (target === 'shows') {
      return (
        lower === 'shows_backup.json' ||
        lower.startsWith('shows_') ||
        lower.startsWith('shows.backup')
      );
    }
    return (
      lower === 'logs_backup.json' ||
      lower.startsWith('logs_') ||
      lower.startsWith('logs.backup')
    );
  };

  const getBackupSearchDirsForTarget = (
    target: BackupTargetKey
  ): Array<{ dir: string; sourceDir: 'settings/backups' | 'logs/backups' }> => {
    const dirs: Array<{ dir: string; sourceDir: 'settings/backups' | 'logs/backups' }> = [];
    const settingsDir = getAmpSettingsDir();
    const logsDir = getAmpLogsDir();
    if (target === 'logs') {
      if (logsDir) dirs.push({ dir: path.join(logsDir, 'backups'), sourceDir: 'logs/backups' });
      if (settingsDir) dirs.push({ dir: path.join(settingsDir, 'backups'), sourceDir: 'settings/backups' });
    } else if (settingsDir) {
      dirs.push({ dir: path.join(settingsDir, 'backups'), sourceDir: 'settings/backups' });
    }
    return dirs;
  };

  const listAndValidateBackupCandidates = (target: BackupTargetKey) => {
    const searchDirs = getBackupSearchDirsForTarget(target);
    const seenKeys = new Set<string>();
    const candidates: Array<{
      fileName: string;
      sourceDir: 'settings/backups' | 'logs/backups';
      mtimeMs: number;
      modifiedIso: string;
      sizeBytes: number;
      valid: boolean;
      recordCount: number;
      validationError?: string;
    }> = [];

    for (const { dir, sourceDir } of searchDirs) {
      if (!dir || !fs.existsSync(dir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!matchesBackupTargetFilename(target, entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (!isPathWithinAnyDir(fullPath, [dir])) continue;
        const dedupeKey = `${sourceDir}:${entry.name.toLowerCase()}`;
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        let mtimeMs = 0;
        let sizeBytes = 0;
        try {
          const st = fs.statSync(fullPath);
          mtimeMs = st.mtimeMs;
          sizeBytes = st.size;
        } catch (_) {
          continue;
        }

        let valid = false;
        let recordCount = 0;
        let validationError: string | undefined;
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const check = validateParsedDataPayload(target, raw);
          valid = check.valid;
          recordCount = check.recordCount;
          validationError = check.error;
        } catch (readErr: any) {
          valid = false;
          validationError = readErr?.message || 'Unable to read backup file';
        }

        candidates.push({
          fileName: entry.name,
          sourceDir,
          mtimeMs,
          modifiedIso: new Date(mtimeMs || Date.now()).toISOString(),
          sizeBytes,
          valid,
          recordCount,
          ...(validationError ? { validationError } : {})
        });
      }
    }

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates;
  };

  const inspectTargetHealth = (target: BackupTargetKey) => {
    const label =
      target === 'announcements' ? 'Announcements (announcements.json)' :
      target === 'shows' ? 'Shows (shows.json)' :
      'Play Logs (logs.json)';

    const baseDir = target === 'logs' ? getAmpLogsDir() : getAmpSettingsDir();
    const primaryPath =
      target === 'announcements' ? getCalendarFilePath() :
      target === 'shows' ? getShowsFilePath() :
      getLogFilePath();

    if (!baseDir || !primaryPath) {
      return {
        key: target,
        label,
        primaryName: `${target}.json`,
        status: 'error' as const,
        cause: 'connection_lost' as const,
        error: 'Configured folder path is missing or offline.',
        backupCount: 0
      };
    }

    try {
      if (!fs.existsSync(baseDir)) {
        return {
          key: target,
          label,
          primaryName: path.basename(primaryPath),
          status: 'error' as const,
          cause: 'connection_lost' as const,
          error: 'Target folder cannot be reached on disk.',
          backupCount: 0
        };
      }
      fs.accessSync(baseDir, fs.constants.R_OK);
    } catch (accessErr: any) {
      return {
        key: target,
        label,
        primaryName: path.basename(primaryPath),
        status: 'error' as const,
        cause: 'connection_lost' as const,
        error: accessErr?.message || 'Folder is not readable.',
        backupCount: 0
      };
    }

    const backups = listAndValidateBackupCandidates(target);
    const backupCount = backups.length;

    if (!fs.existsSync(primaryPath)) {
      if (backupCount > 0) {
        return {
          key: target,
          label,
          primaryName: path.basename(primaryPath),
          status: 'error' as const,
          cause: 'missing_file' as const,
          error: `${path.basename(primaryPath)} is missing, but ${backupCount} backup file${backupCount === 1 ? '' : 's'} exist.`,
          backupCount
        };
      }
      return {
        key: target,
        label,
        primaryName: path.basename(primaryPath),
        status: 'ok' as const,
        cause: 'ok' as const,
        backupCount: 0
      };
    }

    try {
      const raw = fs.readFileSync(primaryPath, 'utf-8');
      const check = validateParsedDataPayload(target, raw);
      if (!check.valid) {
        return {
          key: target,
          label,
          primaryName: path.basename(primaryPath),
          status: 'error' as const,
          cause: 'malformed_file' as const,
          error: check.error || 'File is malformed or corrupted.',
          backupCount
        };
      }
      return {
        key: target,
        label,
        primaryName: path.basename(primaryPath),
        status: 'ok' as const,
        cause: 'ok' as const,
        backupCount
      };
    } catch (readErr: any) {
      const code = String(readErr?.code || '').toUpperCase();
      const isConnErr = code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ENOTCONN' || code === 'EIO';
      return {
        key: target,
        label,
        primaryName: path.basename(primaryPath),
        status: 'error' as const,
        cause: (isConnErr ? 'connection_lost' : 'malformed_file') as 'connection_lost' | 'malformed_file',
        error: readErr?.message || 'Unable to read data file.',
        backupCount
      };
    }
  };

  app.get('/api/backups/diagnose', (_req, res) => {
    try {
      const targets: BackupTargetKey[] = ['announcements', 'shows', 'logs'];
      const files = targets.map((t) => inspectTargetHealth(t));

      let overallCause: 'ok' | 'connection_lost' | 'malformed_file' | 'missing_file' = 'ok';
      if (files.some((f) => f.cause === 'connection_lost')) {
        overallCause = 'connection_lost';
      } else if (files.some((f) => f.cause === 'malformed_file')) {
        overallCause = 'malformed_file';
      } else if (files.some((f) => f.cause === 'missing_file')) {
        overallCause = 'missing_file';
      }

      res.json({
        overallCause,
        files
      });
    } catch (e: any) {
      res.status(500).json({
        overallCause: 'connection_lost',
        error: e?.message || 'Failed to diagnose station data files',
        files: []
      });
    }
  });

  app.get('/api/backups/candidates', (req, res) => {
    try {
      const rawTarget = String(req.query.target || '').trim().toLowerCase();
      if (rawTarget !== 'announcements' && rawTarget !== 'shows' && rawTarget !== 'logs') {
        return res.status(400).json({ error: 'Invalid backup target. Expected announcements, shows, or logs.' });
      }
      const target = rawTarget as BackupTargetKey;
      const health = inspectTargetHealth(target);
      const candidates = health.cause === 'connection_lost' ? [] : listAndValidateBackupCandidates(target);
      res.json({
        target,
        health,
        candidates
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to inspect backups', candidates: [] });
    }
  });

  app.post('/api/backups/restore', (req, res) => {
    try {
      const rawTarget = String(req.body?.target || '').trim().toLowerCase();
      const rawFileName = String(req.body?.fileName || '').trim();
      const rawSourceDir = String(req.body?.sourceDir || '').trim();

      if (rawTarget !== 'announcements' && rawTarget !== 'shows' && rawTarget !== 'logs') {
        return res.status(400).json({ error: 'Invalid backup target' });
      }
      const target = rawTarget as BackupTargetKey;
      const cleanName = path.basename(rawFileName);
      if (!cleanName || cleanName !== rawFileName || !matchesBackupTargetFilename(target, cleanName)) {
        return res.status(400).json({ error: 'Invalid backup filename' });
      }

      const searchDirs = getBackupSearchDirsForTarget(target);
      const preferredDirs = rawSourceDir
        ? searchDirs.filter((d) => d.sourceDir === rawSourceDir)
        : searchDirs;

      let resolvedBackupPath: string | null = null;
      for (const { dir } of preferredDirs.length > 0 ? preferredDirs : searchDirs) {
        if (!dir || !fs.existsSync(dir)) continue;
        const candidate = path.join(dir, cleanName);
        if (isPathWithinAnyDir(candidate, [dir]) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          resolvedBackupPath = candidate;
          break;
        }
      }

      if (!resolvedBackupPath) {
        return res.status(404).json({ error: `Backup file "${cleanName}" was not found.` });
      }

      const rawBackupText = fs.readFileSync(resolvedBackupPath, 'utf-8');
      const validation = validateParsedDataPayload(target, rawBackupText);
      if (!validation.valid) {
        return res.status(400).json({
          error: `Backup file "${cleanName}" failed validation: ${validation.error || 'Malformed JSON'}`
        });
      }

      const primaryPath =
        target === 'announcements' ? getCalendarFilePath() :
        target === 'shows' ? getShowsFilePath() :
        getLogFilePath();

      if (!primaryPath) {
        return res.status(400).json({ error: 'Primary destination folder is not configured or offline.' });
      }

      const parentDir = path.dirname(primaryPath);
      if (!fs.existsSync(parentDir)) {
        return res.status(400).json({ error: 'Primary destination folder is offline.' });
      }

      atomicWriteFileSync(primaryPath, rawBackupText);

      if (target === 'shows') {
        try {
          const restoredParsed = JSON.parse(rawBackupText);
          const restoredMigrated = migrateShowsPayload(
            restoredParsed,
            restoredParsed?._meta?.lastModifiedBy || CURRENT_APP_VERSION,
            0
          );
          writeStationSettingsSidecar({
            stationTimezone: restoredMigrated.envelope.stationTimezone,
            adminContactInfo: restoredMigrated.envelope.adminContactInfo ?? '',
            upNextPromo: restoredMigrated.envelope.upNextPromo,
            scheduleWindow: restoredMigrated.envelope.scheduleWindow,
            adminMessages: restoredMigrated.envelope.adminMessages ?? []
          });
        } catch (syncErr) {
          console.error('Failed to re-sync station_settings.json after shows backup restore:', syncErr);
        }
      }

      res.json({
        success: true,
        target,
        restoredFrom: cleanName,
        recordCount: validation.recordCount
      });
    } catch (e: any) {
      console.error('Failed to restore backup:', e);
      res.status(500).json({ error: e?.message || 'Failed to restore backup file' });
    }
  });
}
