export type ThemeId = 'light' | 'dark' | 'dark-test' | 'system' | string;

export interface ThemeColors {
  fgPrimary: string;
  fgSecondary: string;
  fgMuted: string;
  fgDim: string;
  fgInverse: string;

  bgApp: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  bgInput: string;
  bgHeader: string;
  bgHover: string;

  borderMain: string;
  borderSubtle: string;
  borderStrong: string;

  showShadeOddBg: string;
  showShadeOddBorder: string;
  showShadeEvenBg: string;
  showShadeEvenBorder: string;

  underglowEmerald: string;
  underglowPurple: string;
  underglowBlue: string;

  playlistCardBg: string;
  playlistCardBorder: string;
  playlistCardHeaderBg: string;
  playlistCardText: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  colors: ThemeColors;
}

export const THEMES: Record<string, ThemeDefinition> = {
  light: {
    id: 'light',
    name: 'Light',
    colors: {
      fgPrimary: '#0f172a',      // slate-900
      fgSecondary: '#475569',    // slate-600
      fgMuted: '#64748b',        // slate-500
      fgDim: '#94a3b8',          // slate-400
      fgInverse: '#ffffff',      // white

      bgApp: '#f1f5f9',          // slate-100
      bgSurface: '#ffffff',      // white
      bgSurfaceElevated: '#f8fafc', // slate-50
      bgInput: '#ffffff',
      bgHeader: '#0f172a',       // slate-900
      bgHover: '#e2e8f0',        // slate-200

      borderMain: '#cbd5e1',     // slate-300
      borderSubtle: '#e2e8f0',   // slate-200
      borderStrong: '#94a3b8',   // slate-400

      showShadeOddBg: '#FFE385',
      showShadeOddBorder: '#D1B443',
      showShadeEvenBg: '#FFF6BC',
      showShadeEvenBorder: '#EADA76',

      underglowEmerald: '#a7f3d0',
      underglowPurple: '#e9d5ff',
      underglowBlue: '#dbeafe',

      playlistCardBg: '#f5f3ff',
      playlistCardBorder: '#c084fc',
      playlistCardHeaderBg: '#f3e8ff',
      playlistCardText: '#581c87',
    },
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    colors: {
      fgPrimary: '#f8fafc',      // slate-50
      fgSecondary: '#cbd5e1',    // slate-300
      fgMuted: '#94a3b8',        // slate-400
      fgDim: '#64748b',          // slate-500
      fgInverse: '#0f172a',      // slate-900

      bgApp: '#020617',          // slate-950 deep canvas background
      bgSurface: '#0f172a',      // slate-900 card surface
      bgSurfaceElevated: '#1e293b', // slate-800 elevated modals/popups
      bgInput: '#0f172a',
      bgHeader: '#020617',       // slate-950
      bgHover: '#1e293b',        // slate-800

      borderMain: '#334155',     // slate-700 crisp card borders
      borderSubtle: '#1e293b',   // slate-800 subtle dividers
      borderStrong: '#475569',   // slate-600 prominent borders

      showShadeOddBg: '#383a56',
      showShadeOddBorder: '#685315',
      showShadeEvenBg: '#222325',
      showShadeEvenBorder: '#524011',

      underglowEmerald: '#064e3b',
      underglowPurple: '#581c87',
      underglowBlue: '#1e3a8a',

      playlistCardBg: '#1e112a',
      playlistCardBorder: '#7e22ce',
      playlistCardHeaderBg: '#2e1045',
      playlistCardText: '#e9d5ff',
    },
  },
  /**
   * ============================================================================
   * DEVELOPMENT ARTIFACT & FUTURE USER THEME SCAFFOLDING (ROADMAP #30)
   * ============================================================================
   * `dark-test` is intentionally preserved in code as a development method
   * artifact while hidden from the production footer selector (which exposes
   * only `light`, `system`, and `dark`).
   *
   * 1. FUTURE DEVELOPER MULTI-THEME DESIGN & TESTING WORKFLOW:
   *    - To test experimental palettes (`dark-test` or additional candidate
   *      themes) without altering production `light` / `dark` defaults:
   *      a. Populate or clone a `ThemeDefinition` entry in `THEMES` below and
   *         mirror any static CSS fallbacks under `[data-theme="<id>"]` in
   *         `src/index.css`.
   *      b. Temporarily bypass the `normalizedId` coercion in `applyTheme()`
   *         and `getResolvedTheme()` (or gate it behind `isAiStudio` / a dev
   *         query flag such as `?themeLab=1`) so `document.documentElement`
   *         receives `data-theme="dark-test"`.
   *      c. Validate readability across all semantic states in `Live_Dev`:
   *         - Active `Now` cards (Stage 1 Sky, Stage 2 Purple/Emerald, Stage 3
   *           Amber `#fffbeb`, Stage 4 Rose `#fff1f2`)
   *         - `Past` Missed cards (`tobe-missed-rose-card`) vs. Missing-Media
   *           warning cards (`tobe-missed-amber-card`)
   *         - Odd/even show-spacer borders (`showShadeOddBg`/`Border` and
   *           `showShadeEvenBg`/`Border`) and `playlistCard*` tokens.
   *
   * 2. SCAFFOLDING NEEDED FOR USER-CUSTOMIZABLE THEME ADJUSTMENTS:
   *    - Base + Token Override Architecture:
   *      ```ts
   *      export interface UserThemeCustomization {
   *        baseTheme: 'light' | 'dark';
   *        overrides: Partial<ThemeColors>; // Only user-modified tokens stored
   *        contrastLocked?: boolean;        // Enforce WCAG AA 4.5:1 text contrast
   *      }
   *      ```
   *    - Resolution Pipeline in `applyTheme()`:
   *      1. Resolve the base theme (`THEMES[baseTheme].colors`).
   *      2. Merge `userCustomization.overrides` on top of base `ThemeColors`.
   *      3. Apply the merged key-value map to `document.documentElement` via
   *         `root.style.setProperty('--' + kebabCase(key), value)`.
   *    - Persistence & Portability:
   *      - Store per-workstation preferences in `localStorage` (`amp_user_theme`)
   *        and optionally persist station-wide presets in `settings/` via atomic
   *        JSON endpoints so operators can reset to station defaults at any time.
   * ============================================================================
   */
  'dark-test': {
    id: 'dark-test',
    name: 'Dark Test',
    colors: {
      fgPrimary: '#f8fafc',      // slate-50
      fgSecondary: '#cbd5e1',    // slate-300
      fgMuted: '#94a3b8',        // slate-400
      fgDim: '#64748b',          // slate-500
      fgInverse: '#0f172a',      // slate-900

      bgApp: '#020617',          // slate-950 deep canvas background
      bgSurface: '#0f172a',      // slate-900 card surface
      bgSurfaceElevated: '#1e293b', // slate-800 elevated modals/popups
      bgInput: '#0f172a',
      bgHeader: '#020617',       // slate-950
      bgHover: '#1e293b',        // slate-800

      borderMain: '#334155',     // slate-700 crisp card borders
      borderSubtle: '#1e293b',   // slate-800 subtle dividers
      borderStrong: '#475569',   // slate-600 prominent borders

      showShadeOddBg: '#2C2C2B',
      showShadeOddBorder: '#404033',
      showShadeEvenBg: '#373B12',
      showShadeEvenBorder: '#52581B',

      underglowEmerald: '#064e3b',
      underglowPurple: '#581c87',
      underglowBlue: '#1e3a8a',

      playlistCardBg: '#241432',
      playlistCardBorder: '#a855f7',
      playlistCardHeaderBg: '#331849',
      playlistCardText: '#f3e8ff',
    },
  },
  system: {
    id: 'system',
    name: 'System',
    colors: {
      fgPrimary: '#0f172a',
      fgSecondary: '#475569',
      fgMuted: '#64748b',
      fgDim: '#94a3b8',
      fgInverse: '#ffffff',
      bgApp: '#f1f5f9',
      bgSurface: '#ffffff',
      bgSurfaceElevated: '#f8fafc',
      bgInput: '#ffffff',
      bgHeader: '#0f172a',
      bgHover: '#e2e8f0',
      borderMain: '#cbd5e1',
      borderSubtle: '#e2e8f0',
      borderStrong: '#94a3b8',
      showShadeOddBg: '#FFE385',
      showShadeOddBorder: '#D1B443',
      showShadeEvenBg: '#FFF6BC',
      showShadeEvenBorder: '#EADA76',
      underglowEmerald: '#a7f3d0',
      underglowPurple: '#e9d5ff',
      underglowBlue: '#dbeafe',

      playlistCardBg: '#f5f3ff',
      playlistCardBorder: '#c084fc',
      playlistCardHeaderBg: '#f3e8ff',
      playlistCardText: '#581c87',
    },
  },
};

/**
 * Resolves effective theme ('light', 'dark', or 'dark-test') based on requested ThemeId and OS preferences
 */
export function getResolvedTheme(themeId: ThemeId): 'light' | 'dark' | 'dark-test' {
  if (themeId === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  if (themeId === 'dark-test') {
    return 'dark';
  }
  return themeId === 'dark' ? 'dark' : 'light';
}

let activeThemeId: ThemeId = 'light';
let mediaQueryListenerAttached = false;

function setupSystemThemeListener() {
  if (typeof window === 'undefined' || !window.matchMedia || mediaQueryListenerAttached) return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (activeThemeId === 'system') {
      applyTheme('system');
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
  } else if ('addListener' in mediaQuery) {
    (mediaQuery as any).addListener(handleChange);
  }

  mediaQueryListenerAttached = true;
}

export function applyTheme(themeId: ThemeId): ThemeDefinition {
  const normalizedId: ThemeId = themeId === 'dark-test' ? 'dark' : themeId;
  activeThemeId = normalizedId;
  setupSystemThemeListener();

  const root = document.documentElement;
  const resolved = getResolvedTheme(normalizedId);
  const theme = THEMES[resolved] || THEMES.dark;

  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-mode', normalizedId);

  if (resolved === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  // Set CSS custom properties dynamically on documentElement
  Object.entries(theme.colors).forEach(([key, val]) => {
    const cssVarName = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVarName, val);
  });

  try {
    localStorage.setItem('amp_theme', normalizedId);
  } catch (e) {
    // Local storage unavailable or restricted
  }

  return THEMES[normalizedId] || theme;
}

export function getInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('amp_theme');
    if (saved === 'dark-test') {
      return 'dark';
    }
    if (saved && (saved === 'system' || THEMES[saved])) {
      return saved as ThemeId;
    }
  } catch (e) {}
  return 'light';
}

