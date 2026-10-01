import React, { useState } from 'react';
import { ShieldAlert, Database, ArrowRight, FolderOpen, ExternalLink, AlertTriangle, X } from 'lucide-react';

interface DataUpgradeRequiredModalProps {
  isOpen: boolean;
  onConfirmUpgrade: () => void;
  onCancelOrChangeFolder: () => void;
  folderPath?: string;
  folderName?: string;
  onOpenFolder?: (path: string) => void;
  onBrowseFolder?: () => void;
  schemaVersion?: number;
}

export const DataUpgradeRequiredModal: React.FC<DataUpgradeRequiredModalProps> = ({
  isOpen,
  onConfirmUpgrade,
  onCancelOrChangeFolder,
  folderPath = '',
  folderName = '',
  onOpenFolder,
  onBrowseFolder,
  schemaVersion = 0
}) => {
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const displayFolderName = folderName || (folderPath ? (folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath) : 'your chosen folder');

  return (
    <>
      {/* Main Upgrade Required Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="relative w-full max-w-xl bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl shadow-amber-950/40 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-950/80 to-slate-900 border-b border-amber-500/30 px-6 py-5 flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Data Upgrade Required</h2>
              <p className="text-xs font-medium text-amber-400/90 tracking-wide mt-0.5">
                Your data is formatted for an older version of AMP.
              </p>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-5 text-slate-200">
            {/* Active Folder Card with Open / Browse Action */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  Active Station Folder
                </span>
                <div className="flex items-center gap-2">
                  {onOpenFolder && folderPath && (
                    <button
                      type="button"
                      onClick={() => onOpenFolder(folderPath)}
                      title="Open folder in file manager"
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      Open
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onBrowseFolder || onCancelOrChangeFolder}
                    title="Browse or choose a different folder"
                    className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-slate-300" />
                    Browse
                  </button>
                </div>
              </div>
              <div
                className="text-xs font-mono text-slate-200 bg-slate-950/80 border border-slate-700/60 rounded-lg px-3 py-2 truncate select-all"
                title={folderPath || displayFolderName}
              >
                {folderPath || displayFolderName}
              </div>
            </div>

            {/* Explanatory Message */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 text-sm leading-relaxed text-amber-200 font-medium">
              The data in <span className="text-white font-bold underline decoration-amber-400/50 underline-offset-2">{displayFolderName}</span> is for an older version of AMP. If you continue, AMP will update it to the current version. Any OTHER users of this AMP data will need to update to a more modern version. Please see your AMP Admin for additional help.
            </div>

            {/* Pre-Upgrade Backup Card */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-amber-400" />
                Automatic Pre-Upgrade Backup:
              </div>
              <p className="text-slate-400 pl-6">
                A timestamped pre-upgrade backup of all announcements and shows will be generated automatically before updating.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancelOrChangeFolder}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-slate-400" />
              Cancel & Choose Different Folder
            </button>

            <button
              type="button"
              onClick={() => {
                setAcknowledged(false);
                setShowChallengeModal(true);
              }}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>Backup Data & Upgrade</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Challenge Confirmation Pop-up */}
      {showChallengeModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-slate-900 border-2 border-amber-500 rounded-2xl shadow-2xl shadow-amber-950/60 overflow-hidden flex flex-col">
            {/* Challenge Header */}
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white tracking-tight">Confirm Data Upgrade</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowChallengeModal(false);
                  setAcknowledged(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Challenge Body */}
            <div className="p-5 space-y-4 text-slate-200">
              <p className="text-sm text-slate-300 leading-relaxed">
                Please confirm that you want to upgrade the data in{' '}
                <span className="text-white font-semibold">{displayFolderName}</span>. If you continue, AMP will update the station schema to the current version.
              </p>

              {/* Challenge Checkbox */}
              <label className="flex items-start gap-3 p-3.5 bg-slate-800/90 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 bg-slate-700 cursor-pointer"
                />
                <span className="text-xs text-slate-200 font-medium leading-snug">
                  I understand that continuing updates this shared station library to the current AMP version.
                </span>
              </label>
            </div>

            {/* Challenge Footer */}
            <div className="bg-slate-950 border-t border-slate-800 px-5 py-3.5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowChallengeModal(false);
                  setAcknowledged(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!acknowledged}
                onClick={() => {
                  setShowChallengeModal(false);
                  onConfirmUpgrade();
                }}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-md ${
                  acknowledged
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                <span>Upgrade</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
