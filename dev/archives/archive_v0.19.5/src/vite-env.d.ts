/// <reference types="vite/client" />

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

import type { ElectronAPI } from './types';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    ampHasUnsavedChanges?: () => boolean;
    ampDiscardEdits?: () => void;
    ampIsAudioPlaying?: () => boolean;
    ampStopAllAudio?: () => void;
    ampTriggerFocusRefresh?: (reason?: string) => void;
    webkitAudioContext?: typeof AudioContext;
  }
}


