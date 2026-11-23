import React from 'react';
import { Monitor, X } from 'lucide-react';
import { Show } from '../types';
import { MachinePersonaSection } from './MachinePersonaSection';
import { saveMachinePersona } from '../lib/machinePersona';

export interface FirstLaunchPersonaModalProps {
  isOpen: boolean;
  shows: Show[];
  onClose: () => void;
}

export const FirstLaunchPersonaModal: React.FC<FirstLaunchPersonaModalProps> = ({
  isOpen,
  shows,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleSkip = () => {
    saveMachinePersona({ dismissedFirstLaunch: true });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[68] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-5 text-left"
      onClick={handleSkip}
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-2xl border-2 border-blue-600 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor className="w-4 h-4 shrink-0" />
            <h2 className="text-sm font-black uppercase tracking-wider truncate">
              Identify This Computer (Optional)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="p-1 rounded hover:bg-black/20 text-white cursor-pointer shrink-0"
            title="Skip for now"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Set a simple label for this computer so station notices can show which workstation or
            host read them. You can edit this anytime under <strong>Folders &gt; Help</strong>.
          </p>

          <MachinePersonaSection shows={shows} onSaved={onClose} />
        </div>

        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            Courtesy label only — no account required.
          </span>
          <button
            type="button"
            onClick={handleSkip}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer shrink-0"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
};
