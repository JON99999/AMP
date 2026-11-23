import { MachinePcUseType, MachinePersonaConfig, MachinePersonaType } from '../types';
import { CURRENT_APP_VERSION } from './compatibility';

const MACHINE_ID_STORAGE_KEY = 'amp_local_machine_id_v1';
const MACHINE_PERSONA_STORAGE_KEY = 'amp_local_machine_persona_v1';

export interface PcUseTypeOption {
  id: MachinePcUseType;
  label: string;
}

export const PC_USE_TYPE_OPTIONS: PcUseTypeOption[] = [
  { id: 'live_studio', label: 'Live Studio PC' },
  { id: 'prerecord_studio', label: 'Prerecord Studio PC' },
  { id: 'admin_workstation', label: 'Admin Workstation' },
];

export interface RuntimeAppContext {
  appEdition: 'AMP Live' | 'AMP Studio' | 'AMP Admin';
  platform: 'macOS' | 'Windows' | 'Web';
  appVersion: string;
}

function generateAnonymousMachineId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `amp-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    }
  } catch (_) {}
  return `amp-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateLocalMachineId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = window.localStorage.getItem(MACHINE_ID_STORAGE_KEY);
      if (existing && existing.trim()) {
        return existing.trim();
      }
      const created = generateAnonymousMachineId();
      window.localStorage.setItem(MACHINE_ID_STORAGE_KEY, created);
      return created;
    }
  } catch (_) {}
  return generateAnonymousMachineId();
}

export function getRuntimeAppContext(): RuntimeAppContext {
  const modeEnv = String((import.meta as any)?.env?.VITE_APP_MODE || 'Admin').toLowerCase();
  const appEdition: RuntimeAppContext['appEdition'] =
    modeEnv === 'live'
      ? 'AMP Live'
      : modeEnv === 'studio' || modeEnv === 'prerecord'
        ? 'AMP Studio'
        : 'AMP Admin';

  let platform: RuntimeAppContext['platform'] = 'Web';
  try {
    if (typeof navigator !== 'undefined') {
      const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
      if (ua.includes('mac')) platform = 'macOS';
      else if (ua.includes('win')) platform = 'Windows';
      else platform = 'Web';
    }
  } catch (_) {}

  return {
    appEdition,
    platform,
    appVersion: CURRENT_APP_VERSION,
  };
}

export function getDefaultPcUseTypeForApp(
  appEdition?: RuntimeAppContext['appEdition']
): MachinePcUseType {
  const edition = appEdition || getRuntimeAppContext().appEdition;
  if (edition === 'AMP Live') return 'live_studio';
  if (edition === 'AMP Studio') return 'prerecord_studio';
  return 'admin_workstation';
}

export function getPcUseTypeLabel(pcUseType?: MachinePcUseType | string): string {
  const found = PC_USE_TYPE_OPTIONS.find((opt) => opt.id === pcUseType);
  return found ? found.label : '';
}

function isValidPcUseType(val: any): val is MachinePcUseType {
  return val === 'live_studio' || val === 'prerecord_studio' || val === 'admin_workstation';
}

export function getMachinePersona(): MachinePersonaConfig {
  const machineId = getOrCreateLocalMachineId();
  const ctx = getRuntimeAppContext();
  const defaultUseType = getDefaultPcUseTypeForApp(ctx.appEdition);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(MACHINE_PERSONA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const personaType: MachinePersonaType =
            parsed.personaType === 'personal' ? 'personal' : 'shared';
          const pcUseType: MachinePcUseType = isValidPcUseType(parsed.pcUseType)
            ? parsed.pcUseType
            : defaultUseType;
          const personaName =
            typeof parsed.personaName === 'string' ? parsed.personaName.trim() : '';
          return {
            machineId:
              typeof parsed.machineId === 'string' && parsed.machineId.trim()
                ? parsed.machineId.trim()
                : machineId,
            personaType,
            pcUseType,
            personaName,
            dismissedFirstLaunch: Boolean(parsed.dismissedFirstLaunch),
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
          };
        }
      }
    }
  } catch (_) {}

  return {
    machineId,
    personaType: ctx.appEdition === 'AMP Studio' ? 'personal' : 'shared',
    pcUseType: defaultUseType,
    personaName: '',
    dismissedFirstLaunch: false,
  };
}

export function saveMachinePersona(updates: {
  personaType?: MachinePersonaType;
  pcUseType?: MachinePcUseType;
  personaName?: string;
  dismissedFirstLaunch?: boolean;
}): MachinePersonaConfig {
  const current = getMachinePersona();
  const next: MachinePersonaConfig = {
    machineId: current.machineId || getOrCreateLocalMachineId(),
    personaType: updates.personaType ?? current.personaType ?? 'shared',
    pcUseType: updates.pcUseType ?? current.pcUseType ?? getDefaultPcUseTypeForApp(),
    personaName:
      updates.personaName !== undefined ? updates.personaName.trim() : current.personaName,
    dismissedFirstLaunch:
      updates.dismissedFirstLaunch !== undefined
        ? updates.dismissedFirstLaunch
        : Boolean(current.dismissedFirstLaunch || (updates.personaName && updates.personaName.trim())),
    updatedAt: new Date().toISOString(),
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(MACHINE_PERSONA_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('amp-machine-persona-updated', { detail: next }));
    }
  } catch (_) {}

  return next;
}

export function shouldPromptForMachinePersona(persona?: MachinePersonaConfig): boolean {
  const current = persona || getMachinePersona();
  return !current.personaName.trim() && !current.dismissedFirstLaunch;
}

export function getEffectivePersonaLabel(persona?: MachinePersonaConfig): string {
  const current = persona || getMachinePersona();
  const useLabel = getPcUseTypeLabel(current.pcUseType);
  if (current.personaName && current.personaName.trim()) {
    return current.personaName.trim();
  }
  if (useLabel) {
    return useLabel;
  }
  const ctx = getRuntimeAppContext();
  return `Unlabeled · ${ctx.appEdition} (${ctx.platform})`;
}
