import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HardDriveDownload,
  Loader2,
  XCircle,
  X,
} from 'lucide-react';
import { formatDatetime12 } from '../lib/utils';

export type BackupTargetKey = 'announcements' | 'shows' | 'logs';

interface BackupCandidate {
  fileName: string;
  sourceDir: 'settings/backups' | 'logs/backups';
  mtimeMs: number;
  modifiedIso: string;
  sizeBytes: number;
  valid: boolean;
  recordCount: number;
  validationError?: string;
}

interface TargetHealth {
  key: BackupTargetKey;
  label: string;
  primaryName: string;
  status: 'ok' | 'error';
  cause: 'ok' | 'connection_lost' | 'malformed_file' | 'missing_file';
  error?: string;
  backupCount: number;
}

interface BackupRecoverySectionProps {
  autoOpenTarget?: BackupTargetKey | null;
  onAutoOpenHandled?: () => void;
  onBackupRestored?: () => Promise<void> | void;
}

const TARGET_LABELS: Record<BackupTargetKey, string> = {
  announcements: 'Announcements (announcements.json)',
  shows: 'Shows (shows.json)',
  logs: 'Play Logs (logs.json)',
};

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupRecoverySection: React.FC<BackupRecoverySectionProps> = ({
  autoOpenTarget = null,
  onAutoOpenHandled,
  onBackupRestored,
}) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<BackupTargetKey>(
    autoOpenTarget || 'announcements'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [targetHealth, setTargetHealth] = useState<TargetHealth | null>(null);
  const [candidates, setCandidates] = useState<BackupCandidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [skippedMalformed, setSkippedMalformed] = useState<BackupCandidate[]>([]);
  const [exhaustedOlder, setExhaustedOlder] = useState(false);

  const findNextValidFrom = (
    list: BackupCandidate[],
    startIdx: number,
    prevSkipped: BackupCandidate[]
  ): { foundIndex: number; skipped: BackupCandidate[] } => {
    const skipped = [...prevSkipped];
    for (let i = startIdx; i < list.length; i++) {
      if (list[i].valid) {
        return { foundIndex: i, skipped };
      }
      skipped.push(list[i]);
    }
    return { foundIndex: -1, skipped };
  };

  const inspectTarget = useCallback(async (target: BackupTargetKey) => {
    setSelectedTarget(target);
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setExhaustedOlder(false);
    setCandidates([]);
    setCurrentIndex(-1);
    setSkippedMalformed([]);

    try {
      const res = await fetch(
        `/api/backups/candidates?target=${encodeURIComponent(target)}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to inspect local backups.');
      }
      const health: TargetHealth | null = data.health || null;
      const list: BackupCandidate[] = Array.isArray(data.candidates)
        ? data.candidates
        : [];
      setTargetHealth(health);
      setCandidates(list);

      if (health?.cause === 'connection_lost') {
        setErrorMsg(
          'Folder connection is lost or unreadable. Fix the folder connection before trying backup recovery.'
        );
        return;
      }

      const { foundIndex, skipped } = findNextValidFrom(list, 0, []);
      setCurrentIndex(foundIndex);
      setSkippedMalformed(skipped);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to scan backup files.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoOpenTarget) {
      setIsPopupOpen(true);
      inspectTarget(autoOpenTarget);
      onAutoOpenHandled?.();
    }
  }, [autoOpenTarget, inspectTarget, onAutoOpenHandled]);

  const handleOpenRecovery = () => {
    const initialTarget = selectedTarget || 'announcements';
    setIsPopupOpen(true);
    inspectTarget(initialTarget);
  };

  const handleTryOlder = () => {
    if (currentIndex < 0) return;
    const { foundIndex, skipped } = findNextValidFrom(
      candidates,
      currentIndex + 1,
      skippedMalformed
    );
    setSkippedMalformed(skipped);
    if (foundIndex === -1) {
      setCurrentIndex(-1);
      setExhaustedOlder(true);
    } else {
      setCurrentIndex(foundIndex);
      setExhaustedOlder(false);
    }
  };

  const handleUseCurrentBackup = async () => {
    if (currentIndex < 0 || !candidates[currentIndex]) return;
    const chosen = candidates[currentIndex];
    setIsRestoring(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: selectedTarget,
          fileName: chosen.fileName,
          sourceDir: chosen.sourceDir,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to restore backup file.');
      }
      setSuccessMsg(
        `Restored ${TARGET_LABELS[selectedTarget]} from ${chosen.fileName} (${chosen.recordCount} entries).`
      );
      setTargetHealth((prev) =>
        prev
          ? {
              ...prev,
              status: 'ok',
              cause: 'ok',
              error: undefined,
            }
          : prev
      );
      if (onBackupRestored) {
        await Promise.resolve(onBackupRestored());
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const currentCandidate =
    currentIndex >= 0 && currentIndex < candidates.length
      ? candidates[currentIndex]
      : null;

  const hasMoreAfterCurrent =
    currentIndex >= 0 && currentIndex + 1 < candidates.length;

  return (
    <div
      id="backup-recovery"
      className="pt-4 mt-2 border-t border-slate-200/80 space-y-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <HardDriveDownload className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Admin Backup Recovery
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
            For malformed or missing station data files only. Validates the most recent backup first and skips damaged backups automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenRecovery}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-bold uppercase tracking-wider shrink-0 cursor-pointer transition-colors"
        >
          Try a Backup
        </button>
      </div>

      {isPopupOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs">
          <div
            className="bg-white border border-slate-300 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-900 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDriveDownload className="w-4 h-4 text-blue-600 shrink-0" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  Admin Backup Recovery
                </h3>
              </div>
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setIsPopupOpen(false)}
                className="text-slate-500 hover:text-slate-900 p-0.5 rounded cursor-pointer disabled:opacity-50"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-left text-xs">
              {/* Target File Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Station Data File
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['announcements', 'shows', 'logs'] as BackupTargetKey[]).map(
                    (key) => (
                      <button
                        key={key}
                        type="button"
                        disabled={isLoading || isRestoring}
                        onClick={() => inspectTarget(key)}
                        className={`px-2 py-1.5 rounded border text-xs font-bold uppercase cursor-pointer transition-colors ${
                          selectedTarget === key
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {key}
                      </button>
                    )
                  )}
                </div>
              </div>

              {targetHealth && (
                <div className="p-2.5 rounded border border-slate-200 bg-slate-50 space-y-0.5">
                  <div className="font-bold text-slate-800">
                    Current File: {targetHealth.primaryName}
                  </div>
                  <div className="text-slate-600">
                    {targetHealth.cause === 'ok'
                      ? 'Current file is readable and valid.'
                      : targetHealth.cause === 'missing_file'
                        ? targetHealth.error || 'Current file is missing.'
                        : targetHealth.cause === 'malformed_file'
                          ? `Current file is malformed (${targetHealth.error || 'invalid JSON'}).`
                          : 'Folder connection lost.'}
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="py-5 flex items-center justify-center gap-2 text-slate-600 font-semibold">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Checking and validating backups...</span>
                </div>
              )}

              {!isLoading && errorMsg && (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-red-800 flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMsg}</span>
                </div>
              )}

              {!isLoading && successMsg && (
                <div className="p-3 rounded border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-semibold">{successMsg}</span>
                </div>
              )}

              {!isLoading && skippedMalformed.length > 0 && (
                <div className="p-2.5 rounded border border-amber-200 bg-amber-50 text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      Skipped {skippedMalformed.length} malformed or empty backup
                      {skippedMalformed.length === 1 ? '' : 's'}:
                    </span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
                    {skippedMalformed.slice(0, 4).map((bad) => (
                      <li key={`${bad.sourceDir}:${bad.fileName}`} className="break-all">
                        <span className="font-mono">{bad.fileName}</span>
                        {bad.validationError ? ` — ${bad.validationError}` : ''}
                      </li>
                    ))}
                    {skippedMalformed.length > 4 && (
                      <li>...and {skippedMalformed.length - 4} more</li>
                    )}
                  </ul>
                </div>
              )}

              {!isLoading && !errorMsg && currentCandidate && (
                <div className="p-3 rounded border border-emerald-300 bg-emerald-50/70 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Valid Backup Found</span>
                  </div>
                  <div className="space-y-0.5 text-slate-800">
                    <div className="font-mono font-bold break-all">
                      {currentCandidate.fileName}
                    </div>
                    <div className="text-slate-600">
                      Saved: {formatDatetime12(currentCandidate.modifiedIso)}
                    </div>
                    <div className="text-slate-600">
                      Records: {currentCandidate.recordCount} ({formatFileSize(currentCandidate.sizeBytes)})
                    </div>
                  </div>
                  <p className="text-slate-700 pt-1">
                    Use this backup to replace {TARGET_LABELS[selectedTarget]}, or try an older backup?
                  </p>
                </div>
              )}

              {!isLoading && !errorMsg && !currentCandidate && !successMsg && (
                <div className="p-3 rounded border border-slate-200 bg-slate-50 text-slate-700 leading-relaxed">
                  {exhaustedOlder
                    ? 'No older valid backup files remain for this data file.'
                    : candidates.length === 0
                      ? 'No backup files were found for this data file.'
                      : 'All available backup files for this data file failed validation.'}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setIsPopupOpen(false)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
              >
                {successMsg ? 'Close' : 'Cancel'}
              </button>

              {!isLoading && !errorMsg && currentCandidate && !successMsg && (
                <>
                  {hasMoreAfterCurrent && (
                    <button
                      type="button"
                      disabled={isRestoring}
                      onClick={handleTryOlder}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
                    >
                      Try Older Backup
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isRestoring}
                    onClick={handleUseCurrentBackup}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Restoring...</span>
                      </>
                    ) : (
                      <span>Use This Backup</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
