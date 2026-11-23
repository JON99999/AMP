import React, { useState, useEffect, useMemo } from 'react';
import { Monitor, User, Check, Sparkles } from 'lucide-react';
import { MachinePcUseType, MachinePersonaType, Show } from '../types';
import { cn } from '../lib/utils';
import {
  getMachinePersona,
  saveMachinePersona,
  getRuntimeAppContext,
  getEffectivePersonaLabel,
  getPcUseTypeLabel,
  PC_USE_TYPE_OPTIONS,
} from '../lib/machinePersona';

export interface MachinePersonaSectionProps {
  shows?: Show[];
  compact?: boolean;
  onSaved?: () => void;
}

export const MachinePersonaSection: React.FC<MachinePersonaSectionProps> = ({
  shows = [],
  compact = false,
  onSaved,
}) => {
  const initial = getMachinePersona();
  const [personaType, setPersonaType] = useState<MachinePersonaType>(initial.personaType);
  const [pcUseType, setPcUseType] = useState<MachinePcUseType>(initial.pcUseType);
  const [personaName, setPersonaName] = useState<string>(initial.personaName);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const runtimeCtx = useMemo(() => getRuntimeAppContext(), []);

  useEffect(() => {
    const syncFromStorage = () => {
      const latest = getMachinePersona();
      setPersonaType(latest.personaType);
      setPcUseType(latest.pcUseType);
      setPersonaName(latest.personaName);
    };
    window.addEventListener('amp-machine-persona-updated', syncFromStorage);
    return () => window.removeEventListener('amp-machine-persona-updated', syncFromStorage);
  }, []);

  const uniqueHostNames = useMemo(() => {
    const set = new Set<string>();
    for (const sh of shows || []) {
      if (sh && sh.active !== false && sh.host && sh.host.trim()) {
        set.add(sh.host.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [shows]);

  const commitPersona = (
    nextType: MachinePersonaType,
    nextUseType: MachinePcUseType,
    nextName: string,
    notifyClose = false
  ) => {
    saveMachinePersona({
      personaType: nextType,
      pcUseType: nextUseType,
      personaName: nextName,
      dismissedFirstLaunch: true,
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
    if (notifyClose) {
      onSaved?.();
    }
  };

  const currentStored = getMachinePersona();
  const hasUnsavedChanges =
    personaType !== currentStored.personaType ||
    pcUseType !== currentStored.pcUseType ||
    personaName.trim() !== (currentStored.personaName || '').trim();

  const renderRadioDot = (checked: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors',
        checked ? 'border-white bg-white/20' : 'border-slate-400 bg-white'
      )}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-slate-50/90 text-left space-y-3',
        compact ? 'p-2.5' : 'p-3.5'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {personaType === 'shared' ? (
            <Monitor className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <User className="w-4 h-4 text-blue-600 shrink-0" />
          )}
          <span className="text-sm font-bold text-slate-900">
            This Computer (Logging Persona)
          </span>
        </div>
        <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-700">
          {runtimeCtx.appEdition} · {runtimeCtx.platform} · v{runtimeCtx.appVersion}
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-snug">
        Optional courtesy label attached when this computer acknowledges notices on the Msgs tab.
      </p>

      {/* Connected Either/Or Radio Set: Shared PC vs Personal PC */}
      <div className="space-y-1">
        <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
          Computer Type:
        </span>
        <div
          role="radiogroup"
          aria-label="Computer Type"
          className="grid grid-cols-2 rounded-lg border border-slate-300 overflow-hidden divide-x divide-slate-300 bg-white shadow-2xs"
        >
          <button
            type="button"
            role="radio"
            aria-checked={personaType === 'shared'}
            onClick={() => setPersonaType('shared')}
            className={cn(
              'px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors',
              personaType === 'shared'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            {renderRadioDot(personaType === 'shared')}
            <Monitor className="w-3.5 h-3.5 shrink-0" />
            <span>Shared PC</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={personaType === 'personal'}
            onClick={() => setPersonaType('personal')}
            className={cn(
              'px-3 py-2 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors',
              personaType === 'personal'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100'
            )}
          >
            {renderRadioDot(personaType === 'personal')}
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Personal PC</span>
          </button>
        </div>
      </div>

      {/* Connected Either/Or Radio Set: PC Use Type (independent from custom text, preselected by app edition) */}
      <div className="space-y-1">
        <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
          PC Use Type:
        </span>
        <div
          role="radiogroup"
          aria-label="PC Use Type"
          className="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-slate-300 overflow-hidden sm:divide-x divide-y sm:divide-y-0 divide-slate-300 bg-white shadow-2xs"
        >
          {PC_USE_TYPE_OPTIONS.map((opt) => {
            const active = pcUseType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPcUseType(opt.id)}
                className={cn(
                  'px-2.5 py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-center',
                  active
                    ? 'bg-blue-600 text-white font-black'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
                )}
              >
                {renderRadioDot(active)}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Personal PC Host Picker (Optional Quick Fill) */}
      {personaType === 'personal' && uniqueHostNames.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 block">
            Pick a Show Host (or type custom name below):
          </label>
          <select
            value={uniqueHostNames.includes(personaName.trim()) ? personaName.trim() : ''}
            onChange={(e) => {
              if (e.target.value) {
                setPersonaName(e.target.value);
              }
            }}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Choose Host Name --</option>
            {uniqueHostNames.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Name Input + Save Button */}
      <div className="space-y-1">
        <label className="text-xs font-black uppercase tracking-wider text-slate-600 block">
          Custom Label / Name (Optional):
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitPersona(personaType, pcUseType, personaName, true);
              }
            }}
            placeholder={
              personaType === 'shared'
                ? 'e.g. Studio A Booth, Backup Mac...'
                : 'e.g. Alex (Home Mac)...'
            }
            className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => commitPersona(personaType, pcUseType, personaName, true)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors shrink-0',
              savedNotice
                ? 'bg-emerald-600 text-white'
                : hasUnsavedChanges || onSaved
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            )}
          >
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500 pt-0.5">
        <span className="truncate">
          Active label:{' '}
          <strong className="text-slate-800">
            {getEffectivePersonaLabel({
              ...currentStored,
              personaType,
              pcUseType,
              personaName,
            })}
          </strong>
          {personaName.trim() ? ` · ${getPcUseTypeLabel(pcUseType)}` : ''}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-slate-400">
          <Sparkles className="w-3 h-3" />
          <span>{currentStored.machineId}</span>
        </span>
      </div>
    </div>
  );
};
