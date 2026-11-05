/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  List,
  Settings,
  Play,
  Check,
  AlertCircle,
  RefreshCw,
  Save,
  History,
  Folder,
  HardDriveDownload,
  RotateCcw,
  HelpCircle,
  Sun,
  Moon,
  Laptop,
  RadioTower,
  CassetteTape,
  ListOrdered,
  ListMusic,
  AlarmClock,
  NotebookPen,
  Zap,
  Square,
  X,
  Download,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  format,
  addMinutes,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns";
import { Announcement, AnnouncementType, LiveReadPayload, LogEntry, MediaAssetFile, Show } from "./types";
import PlayerTab from "./components/PlayerTab";
import CalendarTab from "./components/CalendarTab";
import LogTab from "./components/LogTab";
import LiveDevTab from "./components/LiveDevTab";
import LiveReadPopout from "./components/LiveReadPopout";
import { ReadOnlyCompatibilityBanner } from "./components/ReadOnlyCompatibilityBanner";
import { AppOverlays, OptimizationConfig } from "./components/app/AppOverlays";
import { assessDataCompatibility, CompatibilityReport, getStationNow, getAdminContactInfo } from "./lib/compatibility";
import { getInitialTheme, applyTheme, ThemeId } from "./lib/theme";
import { cn, getSortedShows, getShowShade, isTimeInShow, normalizeAnnouncements, getActiveMp3ForSlot, formatExportTimeAmPm, buildUpNextPromoAnnouncements, getAnnouncementsForSlot } from "./lib/utils";
import {
  initAuth,
  googleSignIn,
  handleLogout,
  getAccessToken,
  setOverrideAccessToken,
  getStorageApiHeaders,
  prepareShowContext,
  clearShowContext,
  DRIVE_FOLDERS,
  validateGoogleDriveAccess,
  getSavedSettings,
  DEFAULT_SETTINGS,
  resolveEffectiveLocalPaths,
} from "./lib/driveService";
import {
  syncMediaCatalogFiles,
} from "./lib/audioCache";
import { useStartupGate } from "./hooks/useStartupGate";
import { useAppClock } from "./hooks/useAppClock";
import { useScheduleManager } from "./hooks/useScheduleManager";
import { useAudioCacheController } from "./hooks/useAudioCacheController";
import { useLocationsController } from "./hooks/useLocationsController";

const getFutureDatesForShow = (
  showDay: string,
  startHour?: number,
  startMinute?: number
): Date[] => {
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  const targetDayIndex = daysOfWeek.indexOf(showDay);
  if (targetDayIndex === -1) return [];

  const occurrences: Date[] = [];
  const now = getStationNow();
  const start = getStationNow();
  for (let i = 0; i < 62; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (d.getDay() === targetDayIndex) {
      if (i === 0 && startHour !== undefined && startMinute !== undefined) {
        const showStart = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          startHour,
          startMinute,
          0,
          0
        );
        if (showStart <= now) {
          continue;
        }
      }
      occurrences.push(d);
    }
  }
  return occurrences;
};

export default function App() {
  const isPopout = typeof window !== "undefined" && window.location.search.includes("popout=true");

  if (isPopout) {
    return <LiveReadPopout />;
  }

  const isElectron = typeof window !== "undefined" && (!!window.electronAPI || (navigator && navigator.userAgent && navigator.userAgent.includes("Electron")));
  const isAiStudio = !isElectron;

  const appModeEnv = import.meta.env?.VITE_APP_MODE || "Admin";
  const isLiveApp = appModeEnv === "Live";
  const isStudioApp = appModeEnv === "Studio";
  const isAdminApp = appModeEnv === "Admin" || (!isLiveApp && !isStudioApp);
  const isPlayerMode = !isAdminApp;

  // Custom fetch override to support local environment ports transparently
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/")) {
      const isCustomProtocol =
        typeof window !== "undefined" &&
        !window.location.protocol.startsWith("http");
      const baseUrl = isCustomProtocol ? "http://127.0.0.1:3000" : "";
      url = `${baseUrl}${url}`;
    }
    return window.fetch(url, init);
  };

  const [activeTab, setActiveTab] = useState<"player" | "calendar" | "log" | "live_dev">(
    "player",
  );
  const [calendarSubTab, setCalendarSubTab] = useState<"calendar" | "list" | "shows">(
    "calendar",
  );

  const [appFlavorIconUrl, setAppFlavorIconUrl] = useState<string | null>(null);
  const [appFlavorIconError, setAppFlavorIconError] = useState(false);

  useEffect(() => {
    fetch('/api/app-flavor')
      .then(res => res.json())
      .then(data => {
        if (data?.iconUrl) {
          setAppFlavorIconUrl(data.iconUrl);
        }
      })
      .catch(() => {
        // Fallback gracefully
        const modeKey = (appModeEnv || 'Admin').toLowerCase();
        setAppFlavorIconUrl(`https://raw.githubusercontent.com/JON99999/AMP/assets/src/assets/images/${modeKey}/icon.png`);
      });
  }, [appModeEnv]);

  const {
    startupStatus,
    isStartupReady,
    startupMessage,
    missingDefinitions,
    missingFolders,
    verifyStartup,
  } = useStartupGate();

  const [isLiveReadActive, setIsLiveReadActive] = useState(false);
  const isLiveReadActiveRef = useRef(false);
  isLiveReadActiveRef.current = isLiveReadActive;

  useEffect(() => {
    const handleOpened = () => {
      setIsLiveReadActive(true);
      if (window.electronAPI?.setLiveReadActive) {
        window.electronAPI.setLiveReadActive(true);
      }
    };
    const handleClosed = () => {
      setIsLiveReadActive(false);
      if (window.electronAPI?.setLiveReadActive) {
        window.electronAPI.setLiveReadActive(false);
      }
      triggerFocusRefresh("live-read-closed");
    };
    window.addEventListener('live-read-opened', handleOpened);
    window.addEventListener('live-read-closed', handleClosed);
    window.addEventListener('live-read-logged', handleClosed);
    return () => {
      window.removeEventListener('live-read-opened', handleOpened);
      window.removeEventListener('live-read-closed', handleClosed);
      window.removeEventListener('live-read-logged', handleClosed);
    };
  }, []);

  useEffect(() => {
    if (window.electronAPI?.setActiveTabMenu) {
      window.electronAPI.setActiveTabMenu(activeTab, calendarSubTab);
    }
    triggerFocusRefresh("tab-switch");
  }, [activeTab, calendarSubTab]);
  const [durationUpdates, setDurationUpdates] = useState(0);

  // Archiving/backup implementation
  const runArchiving = async (mode: "Local" | "Drive" | "Demo") => {
    if (hasBackedUpThisSessionRef.current) {
      console.log(
        "Archiving already completed for this session of the folder. Skipping.",
      );
      return;
    }
    const workstationMode = isLiveApp ? "LIVE" : isStudioApp ? "STUDIO" : "ADMIN";
    try {
      const headers = await getStorageApiHeaders();
      const res = await fetch("/api/trigger-backup", {
        method: "POST",
        headers,
        body: JSON.stringify({ workstationMode }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Archiving failed");
      }
      console.log("Archiving of announcements and logs completed successfully");
      hasBackedUpThisSessionRef.current = true;
    } catch (err: any) {
      console.error("Archiving sequence failed: ", err);
      setIsDriveValidated(false);
      if (mode === "Local") {
        setLocalPathsUnavailable(true);
      } else {
        setDriveValidationError(
          err.message ||
            "Archiving failed: Google Drive connection is inaccessible or blocked.",
        );
      }
      setShowLocationsModal(true);
    }
  };

  useEffect(() => {
    const handler = () => setDurationUpdates((prev) => prev + 1);
    window.addEventListener("mp3-duration-cached", handler);
    return () => window.removeEventListener("mp3-duration-cached", handler);
  }, []);

  useEffect(() => {
    const handleTokenRefreshed = (e: Event) => {
      const customEvt = e as CustomEvent<{ token?: string }>;
      if (customEvt.detail?.token) {
        setToken(customEvt.detail.token);
      }
    };
    window.addEventListener("amp-token-refreshed", handleTokenRefreshed);
    return () => window.removeEventListener("amp-token-refreshed", handleTokenRefreshed);
  }, []);

  useEffect(() => {
    document.title = isLiveApp
      ? "AMP Live"
      : isStudioApp
        ? "AMP Studio"
        : "AMP Admin";
  }, [isLiveApp, isStudioApp]);
  const [isAdmin, setIsAdmin] = useState(false);

  // === DEBUG ANIMATION SWITCH START ===
  const DEFAULT_OPTIMIZATIONS: OptimizationConfig = {
    cssAnimations: true,
    blinkOnlyUrgency: false,
    hoverTransitions: false,
    hoverTransforms: false,
    hoverShadowsFilters: false,
    backdropBlurs: false,
    webWorkers: false,
    pointerEventsNeutralization: false,
    gpuCompositingLayering: true,
  };

  const [animationsDisabled, setAnimationsDisabled] = useState(() => {
    return localStorage.getItem("debug_animations_disabled") === "true";
  });

  const [showPixelRuler, setShowPixelRuler] = useState(false);

  const [activeOptimizations, setActiveOptimizations] = useState<OptimizationConfig>(() => {
    try {
      const stored = localStorage.getItem("debug_active_optimizations");
      if (stored) {
        return { ...DEFAULT_OPTIMIZATIONS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to parse active optimizations", e);
    }
    return DEFAULT_OPTIMIZATIONS;
  });

  const [isOptimizationConfigOpen, setIsOptimizationConfigOpen] = useState(false);
  const [tempOptimizations, setTempOptimizations] = useState<OptimizationConfig>(DEFAULT_OPTIMIZATIONS);

  useEffect(() => {
    if (isOptimizationConfigOpen) {
      setTempOptimizations(activeOptimizations);
    }
  }, [isOptimizationConfigOpen, activeOptimizations]);

  const toggleAnimations = () => {
    if (animationsDisabled) {
      // If active (red), click turns optimizations OFF completely (animations ON)
      setAnimationsDisabled(false);
      localStorage.setItem("debug_animations_disabled", "false");
    } else {
      // If inactive (yellow), click opens the configuration modal to configure and turn optimizations ON
      setIsOptimizationConfigOpen(true);
    }
  };
  // === DEBUG ANIMATION SWITCH END ===

  const togglePixelRuler = () => {
    setShowPixelRuler(prev => {
      const next = !prev;
      localStorage.setItem("show_pixel_ruler", String(next));
      return next;
    });
  };

  // Audio playing & unsaved changes navigation guards
  const [showAudioPlayingNavModal, setShowAudioPlayingNavModal] = useState(false);
  const [showUnsavedChangesNavModal, setShowUnsavedChangesNavModal] = useState(false);
  const pendingNavActionRef = useRef<(() => void) | null>(null);

  const confirmNavAction = (action: () => void) => {
    if (isLiveReadActiveRef.current) return;

    // 1. Check if there are active editing windows / unsaved changes
    if (
      typeof window.ampHasUnsavedChanges === "function" &&
      window.ampHasUnsavedChanges()
    ) {
      pendingNavActionRef.current = action;
      setShowUnsavedChangesNavModal(true);
      return;
    }

    // 2. Check if audio is currently playing
    if (
      typeof window.ampIsAudioPlaying === "function" &&
      window.ampIsAudioPlaying()
    ) {
      pendingNavActionRef.current = action;
      setShowAudioPlayingNavModal(true);
      return;
    }

    // 3. Otherwise execute immediately
    action();
  };

  const confirmNavActionRef = useRef<(action: () => void) => void>(confirmNavAction);
  confirmNavActionRef.current = confirmNavAction;

  const [isWindowFocused, setIsWindowFocused] = useState(true);

  // Fresh views on focus helper
  const triggerFocusRefresh = (reason?: string) => {
    // 1. Never overwrite active editing sessions or unsaved modifications
    if (
      typeof window.ampHasUnsavedChanges === "function" &&
      window.ampHasUnsavedChanges()
    ) {
      return;
    }
    // 2. Refresh application data from disk / active storage
    const settings = getSavedSettings();
    fetchDataForMode(settings).catch(() => {});
  };

  useEffect(() => {
    window.ampTriggerFocusRefresh = (reason?: string) => {
      triggerFocusRefresh(reason);
    };
    return () => {
      window.ampTriggerFocusRefresh = undefined;
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      setIsWindowFocused(true);
      triggerFocusRefresh("window-focus");
    };
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    if (typeof document !== "undefined" && document.hasFocus) {
      setIsWindowFocused(document.hasFocus());
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);
  const [syncTime, setSyncTime] = useState(new Date());
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [loading, setLoading] = useState(true);

  // Prerecord & Playlist States
  const [playMode, setPlayMode] = useState<"Live" | "Prerecord" | "Playlist">(
    isStudioApp ? "Prerecord" : "Live",
  );
  const [selectedPlaylistShow, setSelectedPlaylistShow] = useState<Show | null>(null);
  const [selectedPrerecordShowId, setSelectedPrerecordShowId] = useState<string>("");

  // Schema Version Compatibility State
  const [compatibilityReport, setCompatibilityReport] = useState<CompatibilityReport | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showNewerVersionModal, setShowNewerVersionModal] = useState(false);
  const isReadOnlyCompatibility = compatibilityReport?.status === 'NEWER_VERSION_DETECTED' || (!isAdminApp && compatibilityReport?.status === 'OLDER_VERSION_DETECTED');

  // Google Drive & Auth States
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isDriveActive, setIsDriveActive] = useState(false);
  const [isDriveValidated, setIsDriveValidated] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isValidatingDrive, setIsValidatingDrive] = useState(false);
  const [driveValidationError, setDriveValidationError] = useState<
    string | null
  >(null);
  const [googleClientId, setGoogleClientId] = useState(
    () =>
      localStorage.getItem("amp_google_client_id") ||
      "776109899422-4ui9sqip5tvjarmcmrmnb4p3pdni0b2n.apps.googleusercontent.com",
  );
  const [isPollingExternal, setIsPollingExternal] = useState(false);
  const [driveMP3s, setDriveMP3s] = useState<MediaAssetFile[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchInProgressRef = useRef(false);
  const hasBackedUpThisSessionRef = useRef(false);
  const [showLocalHelp, setShowLocalHelp] = useState(false);
  const openLocationsModalRef = useRef<() => void>(() => {});

  const {
    announcements,
    setAnnouncements,
    shows,
    setShows,
    logs,
    setLogs,
    isSaving,
    savingLabel,
    saveRecoveryModal,
    setSaveRecoveryModal,
    loadShows,
    saveShows,
    stationTimezone,
    saveStationTimezone,
    adminContactInfo,
    hasSavedAdminContact,
    saveAdminContactInfo,
    upNextPromoConfig,
    saveUpNextPromoConfig,
    scheduleWindowConfig,
    saveScheduleWindowConfig,
    saveAnnouncements,
    addLog,
  } = useScheduleManager({
    token: null, // Initialized with token dynamically updated via ref/effect
    now: getStationNow(),
    playMode,
    selectedPrerecordShowId,
    selectedPlaylistShow,
    onShowLocationsModal: () => openLocationsModalRef.current(),
    isReadOnly: isReadOnlyCompatibility,
  });

  const {
    showLocationsModal,
    setShowLocationsModal,
    locationMode,
    setLocationMode,
    localPathAmp,
    setLocalPathAmp,
    localPathMP3s,
    setLocalPathMP3s,
    localPathMediaAnnouncements,
    setLocalPathMediaAnnouncements,
    localPathMediaEvergreens,
    setLocalPathMediaEvergreens,
    localPathMediaShows,
    setLocalPathMediaShows,
    localPathLogs,
    setLocalPathLogs,
    localPathCalendar,
    setLocalPathCalendar,
    driveFolderAmp,
    setDriveFolderAmp,
    driveFolderLogs,
    setDriveFolderLogs,
    driveFolderMP3s,
    setDriveFolderMP3s,
    driveFolderAnnouncements,
    setDriveFolderAnnouncements,
    driveFolderEvergreens,
    setDriveFolderEvergreens,
    driveFolderShows,
    setDriveFolderShows,
    driveFolderPreferences,
    setDriveFolderPreferences,
    draftLocalPathAmp,
    setDraftLocalPathAmp,
    draftLocalPathMP3s,
    setDraftLocalPathMP3s,
    draftLocalPathMediaAnnouncements,
    setDraftLocalPathMediaAnnouncements,
    draftLocalPathMediaEvergreens,
    setDraftLocalPathMediaEvergreens,
    draftLocalPathMediaShows,
    setDraftLocalPathMediaShows,
    draftLocalPathLogs,
    setDraftLocalPathLogs,
    draftLocalPathCalendar,
    setDraftLocalPathCalendar,
    draftDriveFolderAmp,
    setDraftDriveFolderAmp,
    draftDriveFolderLogs,
    setDraftDriveFolderLogs,
    draftDriveFolderMP3s,
    setDraftDriveFolderMP3s,
    draftDriveFolderAnnouncements,
    setDraftDriveFolderAnnouncements,
    draftDriveFolderEvergreens,
    setDraftDriveFolderEvergreens,
    draftDriveFolderShows,
    setDraftDriveFolderShows,
    draftDriveFolderPreferences,
    setDraftDriveFolderPreferences,
    localPathsUnavailable,
    setLocalPathsUnavailable,
    announcementsReadOnlyError,
    setAnnouncementsReadOnlyError,
    locationsError,
    locationsSuccess,
    driveFolderDescMap,
    setDriveFolderDescMap,
    editingDriveField,
    setEditingDriveField,
    tempPasteLink,
    setTempPasteLink,
    fetchDriveFolderDescriptor,
    handleBrowseNative,
    handleOpenLocalPath,
    handleOpenDriveFolder,
    handleSaveLocations,
    handleSelectMode,
  } = useLocationsController({
    token,
    shows,
    verifyStartup,
    fetchDataForMode: (s) => fetchDataForMode(s),
    setIsDriveActive,
    setIsDriveValidated,
    setIsValidatingDrive,
    setDriveValidationError,
    hasBackedUpThisSessionRef,
    customFetch: fetch,
  });
  openLocationsModalRef.current = () => setShowLocationsModal(true);

  const {
    showCachingModal,
    setShowCachingModal,
    cachingTargetMode,
    setCachingTargetMode,
    cachingProgress,
    setCachingProgress,
    triggerCachingForMode,
  } = useAudioCacheController({
    announcements,
    driveMP3s,
    token,
    isDriveValidated,
    localPathsUnavailable,
    locationMode,
    isStartupReady,
    activeTab,
    playMode,
    setScrollTrigger,
  });

  const effectiveAnnouncements = React.useMemo(
    () => [...announcements, ...buildUpNextPromoAnnouncements(shows, upNextPromoConfig)],
    [announcements, shows, upNextPromoConfig]
  );
  const [showAdminContactPopup, setShowAdminContactPopup] = useState(false);
  const resolvedAdminContact =
    (adminContactInfo !== undefined ? adminContactInfo : getAdminContactInfo()).trim() ||
    "No admin contact info configured yet (set in Admin Mode > Folders > Help).";
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [isFolderChooserOpen, setIsFolderChooserOpen] = useState(false);
  const [isPrerecordExportOpen, setIsPrerecordExportOpen] = useState(false);
  const [prerecordHasPlaylistItems, setPrerecordHasPlaylistItems] = useState(false);
  const [playlistModalLoading, setPlaylistModalLoading] = useState(false);
  const [playlistModalNow, setPlaylistModalNow] = useState<Date>(new Date());
  const [playlistShowOptions, setPlaylistShowOptions] = useState<{
    currentShow: Show | null;
    nextShow: Show | null;
    defaultShowId: string;
    currentShowFileCount: number;
    nextShowFileCount: number;
    elapsedMinutes: number;
    is15MinsOrMore: boolean;
  } | null>(null);
  const playlistShowOptionsRef = useRef<typeof playlistShowOptions>(null);
  playlistShowOptionsRef.current = playlistShowOptions;
  const [chosenPlaylistShowId, setChosenPlaylistShowId] = useState<string>("");
  const [prerecordModalTarget, setPrerecordModalTarget] = useState<"Prerecord">("Prerecord");
  const [prerecordDate, setPrerecordDate] = useState<Date | null>(null);
  const [showPrerecordModal, setShowPrerecordModal] = useState(false);
  const [prerecordDateInput, setPrerecordDateInput] = useState("");
  const [prerecordTimeInput, setPrerecordTimeInput] = useState("");
  const [prerecordHoursInput, setPrerecordHoursInput] = useState("2");
  const [prerecordMinutesInput, setPrerecordMinutesInput] = useState("0");
  const [prerecordLengthMinutes, setPrerecordLengthMinutes] = useState(120);
  const [prerecordError, setPrerecordError] = useState<string | null>(null);
  const [prerecordSelectorMode, setPrerecordSelectorMode] = useState<"show-list" | "manual">("show-list");
  const [showFilterText, setShowFilterText] = useState("");
  const dateSelectRef = useRef<HTMLSelectElement>(null);

  const handleConfirmUpgrade = async () => {
    try {
      const headers = await getStorageApiHeaders();
      const resp = await fetch("/api/compatibility/upgrade", {
        method: "POST",
        headers,
      });
      const resData = await resp.json();
      if (resData && resData.success) {
        if (Array.isArray(resData.announcements)) {
          setAnnouncements(normalizeAnnouncements(resData.announcements));
        }
        if (Array.isArray(resData.shows)) {
          setShows(resData.shows);
        }
        if (Array.isArray(resData.logs)) {
          setLogs(resData.logs);
        }
        setCompatibilityReport(assessDataCompatibility(resData.meta));
      } else {
        throw new Error(resData?.error || "Upgrade endpoint returned unsuccessful status");
      }
      setShowUpgradeModal(false);
    } catch (e) {
      console.error("Failed to upgrade data schema:", e);
    }
  };

  const handleCancelOrChangeFolder = () => {
    setShowUpgradeModal(false);
    setShowLocationsModal(true);
  };

  const handleAcknowledgeNewerVersion = () => {
    setShowNewerVersionModal(false);
  };

  const isPre = playMode === "Prerecord";

  // Export Prerecord states
  const [showExportModal, setShowExportModal] = useState(false);
  const [pendingExportItems, setPendingExportItems] = useState<any[] | null>(null);
  const [exportState, setExportState] = useState<
    "idle" | "configuring" | "exporting" | "success" | "error"
  >("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{
    exportFolder: string;
    copiedCount: number;
    missingCount: number;
    totalCount: number;
    baseFilename?: string;
    txtFilename?: string;
    m3uFilename?: string;
  } | null>(null);

  // Export configuration draft states
  const [exportDestinationInput, setExportDestinationInput] = useState("");
  const [exportFolderPrefixInput, setExportFolderPrefixInput] =
    useState("Show");
  const [exportTextPrefixInput, setExportTextPrefixInput] =
    useState("Show");
  const [exportPlaylistPrefixInput, setExportPlaylistPrefixInput] = useState(
    "Show",
  );

  const formatVerifyAirDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Trigger focus refresh when overlay modals close returning focus to view below
  const prevAnyModalOpenRef = useRef(false);
  useEffect(() => {
    const isAnyModalOpen =
      showLocationsModal ||
      showLocalHelp ||
      showAudioPlayingNavModal ||
      showUnsavedChangesNavModal ||
      showPlaylistModal ||
      showPrerecordModal ||
      showExportModal ||
      showCachingModal ||
      saveRecoveryModal !== null;

    if (prevAnyModalOpenRef.current && !isAnyModalOpen) {
      triggerFocusRefresh("modal-closed");
    }
    prevAnyModalOpenRef.current = isAnyModalOpen;
  }, [
    showLocationsModal,
    showLocalHelp,
    showAudioPlayingNavModal,
    showUnsavedChangesNavModal,
    showPlaylistModal,
    showPrerecordModal,
    showExportModal,
    showCachingModal,
    saveRecoveryModal,
  ]);

  // Prerecord Confirmation states
  const [showPrerecordConfirmStep, setShowPrerecordConfirmStep] =
    useState(false);
  const [prerecordConfirmDetails, setPrerecordConfirmDetails] = useState<{
    startDate: Date;
    totalMinutes: number;
  } | null>(null);

  // Application Theme State
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => getInitialTheme());
  const [mobileThemeExpanded, setMobileThemeExpanded] = useState(false);
  const [mobileModeExpanded, setMobileModeExpanded] = useState(false);

  const getModeTextHideClass = (mode: "Live" | "Prerecord" | "Playlist") => {
    const defaultOrder: ("Live" | "Prerecord" | "Playlist")[] = ["Playlist", "Prerecord", "Live"];
    if (playMode === mode) {
      return "hide-mode-text-tier-4";
    }
    const unselected = defaultOrder.filter((m) => m !== playMode);
    const index = unselected.indexOf(mode);
    if (index === 0) return "hide-mode-text-tier-1";
    if (index === 1) return "hide-mode-text-tier-2";
    return "hide-mode-text-tier-3";
  };

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (newTheme: ThemeId) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
  };

  // Fancy Browser folder modal states
  const [showFancyBrowser, setShowFancyBrowser] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // Google Auth initialization with Validation
  useEffect(() => {
    const initSettings = async () => {
      let settings = getSavedSettings();
      let serverFetched = false;
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const serverSettings = await res.json();
          if (serverSettings) {
            // In Electron/Desktop mode, server disk settings file is the single source of truth
            if (isElectron) {
              settings = {
                ...DEFAULT_SETTINGS,
                ...serverSettings,
                mode: "Local",
              };
            } else if (serverSettings.localPathAmp || serverSettings.localPathMP3s || serverSettings.localPathLogs || serverSettings.localPathCalendar || (serverSettings.mode && serverSettings.mode !== "Demo")) {
              settings = { ...settings, ...serverSettings };
            }
            serverFetched = true;
          }
        }
      } catch (e) {}

      if (isElectron) {
        settings.mode = "Local";
      } else {
        if (settings.mode === "Demo" || settings.mode === "Local") {
          settings.mode = "Drive";
        }
      }

      localStorage.setItem(
        "amp_location_settings",
        JSON.stringify(settings),
      );

      const effectiveLocal = resolveEffectiveLocalPaths(settings);
      setLocationMode(settings.mode);
      setLocalPathAmp(effectiveLocal.localPathAmp);
      setLocalPathMP3s(effectiveLocal.mediaAnnouncements);
      setLocalPathMediaAnnouncements(effectiveLocal.mediaAnnouncements);
      setLocalPathMediaEvergreens(effectiveLocal.mediaEvergreens);
      setLocalPathMediaShows(effectiveLocal.mediaShows);
      setLocalPathLogs(effectiveLocal.logsDir);
      setLocalPathCalendar(effectiveLocal.settingsDir);
      setDriveFolderAmp(settings.driveFolderAmp || "");
      setDriveFolderLogs(settings.driveFolderLogs || "");
      const driveAnnouncements = settings.driveFolderAnnouncements || settings.driveFolderMP3s || "";
      setDriveFolderMP3s(driveAnnouncements);
      setDriveFolderAnnouncements(driveAnnouncements);
      setDriveFolderEvergreens(settings.driveFolderEvergreens || "");
      setDriveFolderShows(settings.driveFolderShows || "");
      setDriveFolderPreferences(settings.driveFolderPreferences || "");

      // Notify backend if we adjusted any defaults
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }).catch(() => {});

      if (isElectron || settings.mode === "Local") {
        const hasValidLocalConfig = effectiveLocal.hasValidLocalConfig;
        if (!hasValidLocalConfig) {
          setIsDriveActive(false);
          setIsDriveValidated(false);
          setLocalPathsUnavailable(true);
          setLoading(false);
          setShowLocationsModal(true);
        } else {
          verifyStartup(settings)
            .then((gateResult) => {
              setIsDriveActive(false);
              if (gateResult.ready) {
                setIsDriveValidated(true);
                setLocalPathsUnavailable(false);
                fetchDataForMode(settings);
              } else {
                setIsDriveValidated(false);
                setLocalPathsUnavailable(true);
                setLoading(false);
                setShowLocationsModal(true);
              }
            })
            .catch(() => {
              setIsDriveActive(false);
              setIsDriveValidated(false);
              setLocalPathsUnavailable(true);
              setLoading(false);
              setShowLocationsModal(true);
            });
        }
      }
    };

    initSettings();

    if (!isElectron) {
      const unsubscribe = initAuth(
        async (currentUser, tokenStr) => {
          const uSettings = getSavedSettings();
          setUser(currentUser);
          setToken(tokenStr);

          if (uSettings.mode === "Drive" || uSettings.mode === "Demo") {
            setIsDriveActive(true);
            setIsValidatingDrive(true);
            setDriveValidationError(null);
            try {
              const success = await validateGoogleDriveAccess();
              if (success) {
                setIsDriveValidated(true);
                setDriveValidationError(null);
                fetchDataForMode(uSettings);
              } else {
                setIsDriveValidated(false);
                setDriveValidationError(
                  "Connected Google account lacks read/write access to one or more configured shared directories.",
                );
                setLoading(false);
                setShowLocationsModal(true);
              }
            } catch (err: any) {
              setIsDriveValidated(false);
              setDriveValidationError(
                err.message || "Error occurred while validating folders.",
              );
              setLoading(false);
              setShowLocationsModal(true);
            } finally {
              setIsValidatingDrive(false);
            }
          } else {
            setIsDriveActive(false);
            setIsDriveValidated(true);
            fetchDataForMode(uSettings);
          }
        },
        () => {
          const uSettings = getSavedSettings();
          setUser(null);
          setToken(null);
          if (uSettings.mode === "Drive" || uSettings.mode === "Demo") {
            setIsDriveActive(false);
            setIsDriveValidated(false);
            setDriveMP3s([]);
            setLoading(false);
            setShowLocationsModal(true);
          } else {
            setLoading(false);
          }
        },
      );
      return () => unsubscribe();
    }
  }, []);

  const fetchDataForMode = async (settings = getSavedSettings()) => {
    if (fetchInProgressRef.current) {
      console.log(
        "fetchDataForMode already inside concurrent cycle. De-duplicating sequence.",
      );
      return;
    }
    const hasValidLocalConfig = resolveEffectiveLocalPaths(settings).hasValidLocalConfig;
    if (settings.mode === "Local" && !hasValidLocalConfig) {
      setLoading(false);
      setIsSyncing(false);
      return;
    }
    fetchInProgressRef.current = true;
    setIsSyncing(true);
    try {
      if (settings.mode === "Local") {
        try {
          const [localAnnouncements, localLogs, localMP3s] = await Promise.all([
            fetch("/api/announcements").then((r) => {
              if (!r.ok) throw new Error("Local announcements failed");
              return r.json();
            }),
            fetch("/api/logs").then((r) => {
              if (!r.ok) throw new Error("Local logs failed");
              return r.json();
            }),
            fetch("/api/local-mp3s").then((r) => {
              if (!r.ok) throw new Error("Local MP3s failed");
              return r.json();
            }),
          ]);
          setAnnouncements(normalizeAnnouncements(localAnnouncements || []));
          setLogs(localLogs || []);

          const mappedMP3s: MediaAssetFile[] = (localMP3s || []).map((file: MediaAssetFile) => ({
            name: file.name,
            size: file.size,
            duration: file.duration || "",
            path: file.path,
            approximateReadTime: file.approximateReadTime,
            assetType: file.assetType,
            mtimeMs: file.mtimeMs,
            modifiedTime: file.modifiedTime,
          }));
          syncMediaCatalogFiles(mappedMP3s, { clearExisting: true });
          setDriveMP3s(mappedMP3s);
          setSyncTime(new Date());
          setScrollTrigger((prev) => prev + 1);
          setIsDriveActive(false);
          setIsDriveValidated(true);
          setConnectionError(null);

          fetch("/api/shows/verify-evergreens", { method: "POST" })
            .then((r) => r.json())
            .then((resData) => {
              if (resData && resData.announcementsReadonlyError) {
                setAnnouncementsReadOnlyError(resData.announcementsReadonlyMessage);
              } else {
                setAnnouncementsReadOnlyError(null);
              }
            })
            .catch((e) => console.error("Verify folders check failed:", e));

          fetch("/api/compatibility/inspect")
            .then((r) => r.json())
            .then((resData) => {
              if (resData && resData.success && resData.meta) {
                const report = assessDataCompatibility(resData.meta);
                setCompatibilityReport(report);
                if (report.status === 'OLDER_VERSION_DETECTED') {
                  if (isAdminApp) {
                    setShowUpgradeModal(true);
                  }
                } else if (report.status === 'NEWER_VERSION_DETECTED') {
                  setShowNewerVersionModal(true);
                }
              }
            })
            .catch((e) => console.error("Compatibility inspect check failed:", e));
        } catch (e) {
          console.error("Local mode fetch details failed:", e);
          setIsDriveValidated(false);
          setConnectionError(
            "Failed to reach local server endpoints. Prior configuration remains active.",
          );
        }
      } else {
        // 'Drive' or 'Demo' mode: both pull from Google Drive
        const hasToken = !!(getAccessToken() || token);
        if (!hasToken) {
          setIsDriveValidated(false);
          setConnectionError(
            "Missing authentication token. Please reconnect your account.",
          );
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        // Validate Google Drive (or Demo mode virtual folders) prior to any file read
        const isValid = await validateGoogleDriveAccess(settings);
        if (!isValid) {
          setIsDriveValidated(false);
          setConnectionError(
            "Unable to access specified folders. Prior configuration remains active. Please check folder configuration or reconnect.",
          );
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        setIsDriveValidated(true);

        const headers = await getStorageApiHeaders();
        const hasPreferencesFolder = !!(settings.driveFolderPreferences || settings.driveFolderAmp || DRIVE_FOLDERS.preferences || DRIVE_FOLDERS.amp);
        const hasLogsFolder = !!(settings.driveFolderLogs || settings.driveFolderAmp || DRIVE_FOLDERS.logs || DRIVE_FOLDERS.amp);
        const hasMP3Folder = !!(settings.driveFolderAnnouncements || settings.driveFolderMP3s || settings.driveFolderAmp || DRIVE_FOLDERS.announcements || DRIVE_FOLDERS.mp3s || DRIVE_FOLDERS.amp);

        let driveAnnouncements: Announcement[] | null = null;
        let driveLogsStr: LogEntry[] | null = null;
        let mp3Files: MediaAssetFile[] | null = null;

        let hasFetchError = false;

        if (hasPreferencesFolder) {
          try {
            const res = await fetch("/api/announcements?withEnvelope=true", { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
            driveAnnouncements = normalizeAnnouncements(items);
          } catch (e) {
            console.warn("Announcements Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }
        if (hasLogsFolder) {
          try {
            const res = await fetch("/api/logs", { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            driveLogsStr = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
          } catch (e) {
            console.warn("Logs Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }
        if (hasMP3Folder) {
          try {
            const res = await fetch("/api/local-mp3s", { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json();
            mp3Files = Array.isArray(payload) ? payload : [];
          } catch (e) {
            console.warn("MP3s Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }

        if (hasFetchError) {
          setConnectionError(
            "Failed to read files from folders. Prior configuration remains active.",
          );
        } else {
          setConnectionError(null);
        }

        if (driveAnnouncements !== null) {
          setAnnouncements(driveAnnouncements || []);
        }
        if (driveLogsStr !== null) {
          setLogs(driveLogsStr || []);
        }

        if (mp3Files !== null) {
          syncMediaCatalogFiles(mp3Files || [], { clearExisting: true });
          setDriveMP3s(mp3Files || []);
        }

        fetch("/api/compatibility/inspect", { headers })
          .then((r) => r.json())
          .then((resData) => {
            if (resData && resData.success && resData.meta) {
              const report = assessDataCompatibility(resData.meta);
              setCompatibilityReport(report);
              if (report.status === 'OLDER_VERSION_DETECTED') {
                if (isAdminApp) {
                  setShowUpgradeModal(true);
                }
              } else if (report.status === 'NEWER_VERSION_DETECTED') {
                setShowNewerVersionModal(true);
              }
            }
          })
          .catch((e) => console.error("Compatibility inspect check failed:", e));

        setSyncTime(new Date());
        setScrollTrigger((prev) => prev + 1);
        setIsDriveActive(true);
      }
      // Load shows list
      await loadShows().catch(() => {});
      // Trigger background archiving invisibly on successful fetch
      await runArchiving(settings.mode).catch(() => {});
    } catch (error) {
      console.error("Failed to fetch data for mode " + settings.mode, error);
      setConnectionError(
        "An unexpected synchronization error occurred. Prior configuration remains active.",
      );
    } finally {
      setIsSyncing(false);
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  };

  const fetchData = async () => {
    const settings = getSavedSettings();
    await fetchDataForMode(settings);
  };

  const {
    now,
    setNow,
    isAsleep,
    setIsAsleep,
    wakeUp,
    countdown,
    setCountdown,
    formatCountdown,
  } = useAppClock({
    animationsDisabled,
    useWebWorkers: activeOptimizations.webWorkers,
    playMode,
    isDriveValidated,
    localPathsUnavailable,
    locationMode,
    isStartupReady,
    onCountdownExpired: () => {
      if (
        typeof window.ampHasUnsavedChanges === "function" &&
        window.ampHasUnsavedChanges()
      ) {
        return;
      }
      fetchData();
    },
    token,
  });

  const handleRefresh = async () => {
    await fetchData();
    setCountdown(300);
  };

  const handleWakeUp = () => {
    wakeUp();
    handleRefresh();
  };

  useEffect(() => {
    if (!token || isValidatingDrive || fetchInProgressRef.current) return;
    const settings = getSavedSettings();
    if (settings.mode === "Drive" || settings.mode === "Demo") {
      fetchData();
    }
  }, [token]);

  // Intercept and prevent F11 / Full Screen keyboard triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11" || e.keyCode === 122) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, []);

  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  useEffect(() => {
    if (window.electronAPI) {
      if (window.electronAPI.onLiveReadLogged) {
        window.electronAPI.onLiveReadLogged((logEntry: LogEntry) => {
          if (addLogRef.current) {
            addLogRef.current(logEntry);
          }
          window.dispatchEvent(new CustomEvent('live-read-logged', { detail: logEntry }));
        });
      }
      if (window.electronAPI.onLiveReadOpened) {
        window.electronAPI.onLiveReadOpened((payload: LiveReadPayload) => {
          window.dispatchEvent(new CustomEvent('live-read-opened', { detail: payload }));
        });
      }
      if (window.electronAPI.onLiveReadClosed) {
        window.electronAPI.onLiveReadClosed(() => {
          window.dispatchEvent(new CustomEvent('live-read-closed'));
        });
      }
      if (window.electronAPI.onNavigate) {
        window.electronAPI.onNavigate(({ tab, subTab }: { tab: string; subTab?: string }) => {
          if (isLiveReadActiveRef.current) return;
          if (tab === "folders") {
            setShowLocationsModal(true);
          } else if (tab === "help") {
            setShowLocalHelp(true);
          } else if (tab === "player" || tab === "calendar" || tab === "log") {
            confirmNavActionRef.current(() => {
              setActiveTab(tab as "player" | "calendar" | "log");
              if (tab === "calendar" && subTab) {
                setCalendarSubTab(subTab as "calendar" | "list" | "shows");
              }
            });
          }
        });
      }
    }
  }, []);

  const handleSelectPrerecordShow = (showId: string) => {
    const show = shows.find((s) => s.id === showId);
    setSelectedPrerecordShowId(showId);
    if (show) {
      const dates = getFutureDatesForShow(show.day, show.startHour, show.startMinute);
      if (dates.length > 0) {
        setPrerecordDateInput(format(dates[0], "yyyy-MM-dd"));
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPrerecordDateInput(format(tomorrow, "yyyy-MM-dd"));
      }
      setPrerecordTimeInput(
        `${show.startHour.toString().padStart(2, "0")}:${show.startMinute.toString().padStart(2, "0")}`
      );
      setPrerecordHoursInput(show.durationHours.toString());
      setPrerecordMinutesInput(show.durationMinutes.toString());
    }
  };

  const handleToggleMode = () => {
    if (playMode === "Live") {
      setSelectedPrerecordShowId("");
      setShowFilterText("");
      setPrerecordSelectorMode("show-list");
      setPrerecordError(null);
      setShowPrerecordConfirmStep(false);
      setPrerecordConfirmDetails(null);
      setShowPrerecordModal(true);
    } else {
      clearShowContext();
      setPlayMode("Live");
      setPrerecordDate(null);
      setCountdown(300);
      setNow(new Date());
    }
  };

  const initialStudioPromptRef = useRef(false);

  const handleOpenTimeframeModal = (target: "Prerecord" = "Prerecord", showList: Show[] = shows) => {
    setPrerecordModalTarget(target);
    setSelectedPrerecordShowId("");
    setShowFilterText("");
    setPrerecordSelectorMode("show-list");
    setPrerecordError(null);
    setShowPrerecordConfirmStep(false);
    setPrerecordConfirmDetails(null);
    setShowPrerecordModal(true);
  };

  // On Studio version of the app, prompt user with the prerecord show selector when opened
  useEffect(() => {
    if (isStudioApp && !loading && !initialStudioPromptRef.current) {
      initialStudioPromptRef.current = true;
      handleOpenTimeframeModal("Prerecord", shows);
    }
  }, [isStudioApp, loading, shows]);

  const updatePlaylistModalData = async (isInitial: boolean = false, overrideTime?: Date) => {
    if (isInitial) {
      setPlaylistModalLoading(true);
    }

    const sorted = getSortedShows(shows);
    if (!sorted || sorted.length === 0) {
      const emptyOpts = {
        currentShow: null,
        nextShow: null,
        defaultShowId: "",
        currentShowFileCount: 0,
        nextShowFileCount: 0,
        elapsedMinutes: 0,
        is15MinsOrMore: false
      };
      setPlaylistShowOptions(emptyOpts);
      playlistShowOptionsRef.current = emptyOpts;
      if (isInitial) setPlaylistModalLoading(false);
      return;
    }

    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const nowObj = overrideTime || syncTime || new Date();
    const currentDayName = daysOrder[nowObj.getDay()];
    const currentHour = nowObj.getHours();
    const currentMin = nowObj.getMinutes();
    const currentWeekMin = nowObj.getDay() * 1440 + currentHour * 60 + currentMin;

    const currentShow = (sorted.find(s => isTimeInShow(s, currentDayName, currentHour, currentMin)) as Show) || null;

    let nextShow: Show | null = null;
    let elapsedMinutes = 0;

    if (currentShow) {
      const currIdx = sorted.findIndex(s => s.id === currentShow.id);
      nextShow = (sorted[(currIdx + 1) % sorted.length] as Show) || null;

      const showStartWeekMin = daysOrder.indexOf(currentShow.day) * 1440 + currentShow.startHour * 60 + currentShow.startMinute;
      elapsedMinutes = (currentWeekMin - showStartWeekMin + 10080) % 10080;
    } else {
      const upcoming = sorted.find(s => {
        const startMin = daysOrder.indexOf(s.day) * 1440 + s.startHour * 60 + s.startMinute;
        return startMin > currentWeekMin;
      });
      nextShow = (upcoming || sorted[0]) as Show;
    }

    const is15MinsOrMore = currentShow ? elapsedMinutes >= 15 : true;
    const defaultShow = (is15MinsOrMore && nextShow) ? nextShow : (currentShow || nextShow);
    const defaultShowId = defaultShow ? defaultShow.id : "";

    const prevCurrentShowId = playlistShowOptionsRef.current?.currentShow?.id;
    const prevNextShowId = playlistShowOptionsRef.current?.nextShow?.id;
    const showsChanged = isInitial || prevCurrentShowId !== currentShow?.id || prevNextShowId !== nextShow?.id;

    if (isInitial || showsChanged) {
      setChosenPlaylistShowId((prevId) => {
        if (!isInitial && prevId && ((currentShow && prevId === currentShow.id) || (nextShow && prevId === nextShow.id))) {
          return prevId;
        }
        return defaultShowId;
      });
    }

    let currentShowFileCount = playlistShowOptionsRef.current?.currentShowFileCount || 0;
    let currentShowFolderCount = (playlistShowOptionsRef.current as any)?.currentShowFolderCount || 0;
    let nextShowFileCount = playlistShowOptionsRef.current?.nextShowFileCount || 0;
    let nextShowFolderCount = (playlistShowOptionsRef.current as any)?.nextShowFolderCount || 0;

    try {
      const headers = await getStorageApiHeaders();
      const resp = await fetch("/api/shows/playlist/check-show-files", {
        method: "POST",
        headers,
        body: JSON.stringify({
          currentShowNameShort: currentShow?.nameShort || "",
          currentShowName: currentShow?.name || "",
          nextShowNameShort: nextShow?.nameShort || "",
          nextShowName: nextShow?.name || ""
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        currentShowFileCount = data.currentShowFileCount || 0;
        currentShowFolderCount = data.currentShowFolderCount || 0;
        nextShowFileCount = data.nextShowFileCount || 0;
        nextShowFolderCount = data.nextShowFolderCount || 0;
      }
    } catch (e) {
      console.error("Failed to check playlist show files:", e);
    }

    const newOptions = {
      currentShow,
      nextShow,
      defaultShowId,
      currentShowFileCount,
      currentShowFolderCount,
      nextShowFileCount,
      nextShowFolderCount,
      elapsedMinutes,
      is15MinsOrMore
    };

    playlistShowOptionsRef.current = newOptions;
    setPlaylistShowOptions(newOptions);
    if (isInitial) setPlaylistModalLoading(false);
  };

  const handleOpenPlaylistModal = async () => {
    setShowPlaylistModal(true);
    setPlaylistModalNow(new Date());
    await updatePlaylistModalData(true);
  };

  useEffect(() => {
    if (!showPlaylistModal) return;

    const timer = setInterval(() => {
      const currentNow = new Date();
      setPlaylistModalNow(currentNow);
      updatePlaylistModalData(false, currentNow);
    }, 5000);

    return () => clearInterval(timer);
  }, [showPlaylistModal, shows]);

  const handleConfirmPlaylistShow = () => {
    let targetShow: Show | null = null;
    if (playlistShowOptions) {
      if (chosenPlaylistShowId === playlistShowOptions.currentShow?.id) {
        targetShow = playlistShowOptions.currentShow;
      } else if (chosenPlaylistShowId === playlistShowOptions.nextShow?.id) {
        targetShow = playlistShowOptions.nextShow;
      }
    }
    if (!targetShow && chosenPlaylistShowId && shows && shows.length > 0) {
      targetShow = shows.find((s) => s.id === chosenPlaylistShowId) || null;
    }
    if (!targetShow && playlistShowOptions) {
      targetShow = playlistShowOptions.currentShow || playlistShowOptions.nextShow || null;
    }
    if (targetShow) {
      setSelectedPlaylistShow(targetShow);
      prepareShowContext({
        showId: targetShow.id,
        showName: targetShow.name,
        showNameShort: targetShow.nameShort || targetShow.name,
        context: 'Playlist'
      }).catch(e => console.warn('Playlist context prep note:', e));
    }
    setPlayMode("Playlist");
    setShowPlaylistModal(false);
  };

  const handleSelectAndConfirmShow = (targetShow: Show) => {
    setSelectedPlaylistShow(targetShow);
    prepareShowContext({
      showId: targetShow.id,
      showName: targetShow.name,
      showNameShort: targetShow.nameShort || targetShow.name,
      context: 'Playlist'
    }).catch(e => console.warn('Playlist context prep note:', e));
    setPlayMode("Playlist");
    setShowPlaylistModal(false);
  };

  const handleEditTimeframeModal = () => {
    handleOpenTimeframeModal("Prerecord");
  };

  const getPrerecord12HrDisplay = (timeStr: string) => {
    if (!timeStr) return "--:-- --";
    const parts = timeStr.split(":");
    const hStr = parts[0] || "";
    const mStr = parts[1] || "";

    const h = parseInt(hStr, 10);
    if (isNaN(h) || h < 0 || h > 23) return "--:-- --";

    const m = mStr ? parseInt(mStr, 10) : 0;
    if (isNaN(m) || m < 0 || m > 59) return "--:-- --";

    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mPad = mStr.length === 1 ? `${mStr}0` : m.toString().padStart(2, "0");
    return `${h12.toString().padStart(2, "0")}:${mPad} ${ampm}`;
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    let val = rawVal.replace(/[^0-9]/g, "");

    if (val.length > 4) {
      val = val.substring(0, 4);
    }

    if (val.length > 2) {
      val = `${val.substring(0, 2)}:${val.substring(2)}`;
    }

    setPrerecordTimeInput(val);
  };

  const handleActivatePrerecord = (e: React.FormEvent) => {
    e.preventDefault();
    setPrerecordError(null);

    if (!prerecordDateInput || !prerecordTimeInput) {
      setPrerecordError("Both date and time inputs are required.");
      return;
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(prerecordTimeInput)) {
      setPrerecordError(
        "Please enter a valid time (e.g. 2:30 PM or 14:30).",
      );
      return;
    }

    const hours = parseInt(prerecordHoursInput, 10);
    const mins = parseInt(prerecordMinutesInput, 10);

    if (
      isNaN(hours) ||
      isNaN(mins) ||
      hours < 0 ||
      mins < 0 ||
      (hours === 0 && mins === 0)
    ) {
      setPrerecordError(
        "Please enter a valid show length greater than 0 minutes.",
      );
      return;
    }

    try {
      const dateStr = `${prerecordDateInput}T${prerecordTimeInput}:00`;
      const parsedDate = parseISO(dateStr);

      if (isNaN(parsedDate.getTime())) {
        setPrerecordError("Please enter a valid format for date and time.");
        return;
      }

      if (isBefore(parsedDate, new Date())) {
        setPrerecordError("The prerecord start time must be in the future.");
        return;
      }

      const totalMinutes = hours * 60 + mins;
      setPrerecordLengthMinutes(totalMinutes);
      setPrerecordDate(parsedDate);

      // Set selectedPlaylistShow if a show was selected or matched
      if (selectedPrerecordShowId) {
        const matchedShow = shows.find((s) => s.id === selectedPrerecordShowId);
        if (matchedShow) {
          setSelectedPlaylistShow(matchedShow);
        }
      } else if (shows && shows.length > 0) {
        const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const dayName = daysOrder[parsedDate.getDay()];
        const hour = parsedDate.getHours();
        const minute = parsedDate.getMinutes();
        const matchedShow = shows.find((s) => isTimeInShow(s, dayName, hour, minute));
        if (matchedShow) {
          setSelectedPlaylistShow(matchedShow);
        } else {
          setSelectedPlaylistShow(null);
        }
      }

      setPlayMode(prerecordModalTarget);
      setShowPrerecordConfirmStep(false);
      setShowPrerecordModal(false);
      setPrerecordConfirmDetails(null);
      void triggerCachingForMode(
        prerecordModalTarget,
        prerecordModalTarget === "Prerecord" ? [] : undefined,
      );
      handleRefresh();
    } catch (err: any) {
      setPrerecordError(
        err.message || "Error occurred while validating date and time.",
      );
    }
  };

  const handleFinalConfirmPrerecord = async () => {
    if (prerecordConfirmDetails) {
      const show = selectedPrerecordShowId ? shows.find(s => s.id === selectedPrerecordShowId) : null;
      const targetMode = prerecordModalTarget;

      setShowCachingModal(true);
      setCachingTargetMode(targetMode);
      setCachingProgress({
        total: 0,
        completed: 0,
        failed: 0,
        errors: [],
        isComplete: false,
      });

      if (show) {
        try {
          const prep = await prepareShowContext({
            showId: show.id,
            showName: show.name,
            showNameShort: show.nameShort || show.name,
            context: targetMode,
          });
          if (prep && prep.context) {
            setCachingProgress({
              total: prep.totalTracks || prep.context.totalTracks || 0,
              completed: prep.totalTracks || prep.context.totalTracks || 0,
              failed: 0,
              errors: [],
              isComplete: true,
            });
          }
        } catch (e: any) {
          console.warn('On-demand show preparation note:', e);
        }
      }

      setPrerecordLengthMinutes(prerecordConfirmDetails.totalMinutes);
      setPrerecordDate(prerecordConfirmDetails.startDate);
      setPlayMode(targetMode);
      setShowPrerecordConfirmStep(false);
      setShowPrerecordModal(false);
      setPrerecordConfirmDetails(null);
      void triggerCachingForMode(
        targetMode,
        targetMode === "Prerecord" ? [] : undefined,
      );
      handleRefresh();
    }
  };

  const getDynamicNames = () => {
    if (!prerecordDate) {
      return {
        folderName: "Show - Export - [Date] at [Time] - [Duration]",
        textFilename: "Show - Plan - [Date] at [Time] - [Duration].txt",
        playlistFilename: "Show - Playlist - [Date] at [Time] - [Duration].m3u",
        firstTrackFilename: "Show 01 Break at 12-00 AM - Hourly Announcement.mp3"
      };
    }
    const parsedDate = new Date(prerecordDate);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const hours = parsedDate.getHours();
    const minutes = parsedDate.getMinutes();

    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthShort = monthShorts[parsedDate.getMonth()] || 'JUN';

    const dateStr = `${year}-${month}(${monthShort})-${day}`;
    const timeStr = formatExportTimeAmPm(hours, minutes);

    const h = Math.floor(prerecordLengthMinutes / 60);
    const m = prerecordLengthMinutes % 60;
    const durationStr = m === 0 ? `${h} Hrs` : `${h} Hrs ${m} Min`;

    const fPrefix = (exportFolderPrefixInput && exportFolderPrefixInput.trim()) || (selectedPlaylistShow?.nameShort || selectedPlaylistShow?.name || 'Show');
    const tPrefix = (exportTextPrefixInput && exportTextPrefixInput.trim()) || (selectedPlaylistShow?.nameShort || selectedPlaylistShow?.name || 'Show');
    const pPrefix = (exportPlaylistPrefixInput && exportPlaylistPrefixInput.trim()) || (selectedPlaylistShow?.nameShort || selectedPlaylistShow?.name || 'Show');
    const showPrefix = (selectedPlaylistShow?.nameShort || selectedPlaylistShow?.name || fPrefix || 'Show').trim();

    const folderName = `${fPrefix} - Export - ${dateStr} at ${timeStr} - ${durationStr}`;
    const textFilename = `${tPrefix} - Plan - ${dateStr} at ${timeStr} - ${durationStr}.txt`;
    const playlistFilename = `${pPrefix} - Playlist - ${dateStr} at ${timeStr} - ${durationStr}.m3u`;

    const activeSpecials = effectiveAnnouncements.filter(s => s.enabled);
    const firstScheduleName = activeSpecials.length > 0 ? activeSpecials[0].name : "Hourly Announcement";
    const safeScheduleName = firstScheduleName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
    const safeSlotTime = formatExportTimeAmPm(hours, 0);
    const firstTrackFilename = `${showPrefix} 01 Break at ${safeSlotTime} - ${safeScheduleName}.mp3`;

    return {
      folderName,
      textFilename,
      playlistFilename,
      firstTrackFilename
    };
  };

  const handleExportPrerecord = async (items?: any[]) => {
    if (!prerecordDate) return;
    if (items && Array.isArray(items) && items.length > 0) {
      setPendingExportItems(items);
    } else {
      setPendingExportItems(null);
    }

    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const dayName = daysOrder[prerecordDate.getDay()];
    const hour = prerecordDate.getHours();
    const minute = prerecordDate.getMinutes();
    const activeShow = shows.find((s) => isTimeInShow(s, dayName, hour, minute));

    const initialPrefix = activeShow?.nameShort?.trim() 
      || (items && items.length > 0 && items[0]?.showNameShort?.trim())
      || activeShow?.name?.trim() 
      || (items && items.length > 0 && items[0]?.showName?.trim())
      || "Show";

    setExportFolderPrefixInput(initialPrefix);
    setExportTextPrefixInput(initialPrefix);
    setExportPlaylistPrefixInput(initialPrefix);
    setExportState("configuring");
    setExportError(null);
    setExportResult(null);
    setShowExportModal(true);

    try {
      const res = await fetch("/api/downloads-path");
      const data = await res.json();
      if (data.success && data.path) {
        setExportDestinationInput(data.path);
      } else {
        setExportDestinationInput(localPathMP3s || "");
      }
    } catch (e) {
      setExportDestinationInput(localPathMP3s || "");
    }
  };

  const handleCloseExportModal = () => {
    setShowExportModal(false);
    clearShowContext();
    setTimeout(() => {
      setExportState("configuring");
      setExportError(null);
      setExportResult(null);
      setPendingExportItems(null);
    }, 200);
  };

  const handleBrowseExportDestination = async () => {
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.success && data.path) {
        setExportDestinationInput(data.path);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message || "Failed to open folder selection window.");
    }
  };

  const runExportPrerecord = async (overwriteMode: 'normal' | 'overwrite' | 'clean' = 'normal') => {
    if (!prerecordDate) return;

    setExportState("exporting");
    setExportError(null);
    setExportResult(null);

    try {
      let itemsToExport: any[] = pendingExportItems || [];

      if (itemsToExport.length === 0) {
        // Fallback slot reconstruction if items were not pre-calculated
        const slots = [];
        let current = new Date(prerecordDate);
        current.setSeconds(0, 0);

        const end = new Date(
          current.getTime() + prerecordLengthMinutes * 60 * 1000,
        );

        while (current.getTime() < end.getTime()) {
          slots.push(new Date(current));
          current = new Date(current.getTime() + 60 * 1000);
        }

        slots.forEach((slot) => {
          const activeAnnouncements = getAnnouncementsForSlot(
            effectiveAnnouncements,
            slot,
          );

          activeAnnouncements.forEach((s) => {
            const activeMp3 = getActiveMp3ForSlot(s, slot);
            const resolvedFilename = activeMp3?.mp3Url || '';
            const isUpNextItem = Boolean(s.isUpNextPromo) || resolvedFilename.startsWith('__up_next_promo__:');
            const cleanUpNextShowName = (s.name || '').replace(/^Up Next:\s*/i, '').trim() || 'Upcoming Show';
            itemsToExport.push({
              slotTime: format(slot, "HH:mm"),
              fileName: isUpNextItem ? `Up Next - ${cleanUpNextShowName}.txt` : resolvedFilename,
              rawMp3Url: resolvedFilename,
              isUpNextPromo: isUpNextItem,
              upNextScriptText: (s as any).upNextScriptText,
              announcementName: s.name,
              announcementId: s.id,
              minute: s.minute,
              assetType: isUpNextItem ? 'script' : activeMp3?.assetType,
              isEvergreen: false,
            });
          });
        });
      }

      if (itemsToExport.length === 0) {
        setExportState("error");
        setExportError(
          "No active scheduled items or breaks found in this timeframe.",
        );
        return;
      }

      // Make post request to endpoint
      const response = await fetch("/api/export-prerecord", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prerecordDate: prerecordDate.toISOString(),
          lengthMinutes: prerecordLengthMinutes,
          items: itemsToExport,
          exportDestination: exportDestinationInput,
          folderPrefix: exportFolderPrefixInput,
          textPrefix: exportTextPrefixInput,
          playlistPrefix: exportPlaylistPrefixInput,
          overwriteMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server reported failure");
      }

      const data = await response.json();
      if (data.success) {
        setExportState("success");
        setExportResult({
          exportFolder: data.exportFolderPath,
          copiedCount: data.copiedCount,
          missingCount: data.missingCount,
          totalCount: data.totalCount,
          txtFilename: data.txtFilename,
          m3uFilename: data.m3uFilename,
          baseFilename: data.exportFolderName,
        });
      } else {
        throw new Error(data.error || "Export files operation failed");
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setExportState("error");
      setExportError(
        err.message || "An unexpected error occurred during export.",
      );
    }
  };

  const handleOpenExportFolder = async (folderPath: string) => {
    try {
      if (window.electronAPI && window.electronAPI.openPath) {
        const res = await window.electronAPI.openPath(folderPath);
        if (res && res.success) return;
      }
      await fetch("/api/open-local-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: folderPath }),
      });
    } catch (e) {
      console.error("Error opening folder:", e);
    }
  };

  const handleAuthSignIn = async () => {
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsDriveActive(true);

        // Immediate Validation after login
        const success = await validateGoogleDriveAccess();
        if (success) {
          setIsDriveValidated(true);
          setDriveValidationError(null);
          const currentSettings = getSavedSettings();
          await fetchDataForMode(currentSettings);
        } else {
          setIsDriveValidated(false);
          setDriveValidationError(
            "Connected Google account lacks read/write access to one or more configured shared directories.",
          );
        }
      }
    } catch (e: any) {
      console.error("Sign-in failed:", e);
      setDriveValidationError(
        e.message || "Verification of Google login failed.",
      );
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleManualTokenOverride = async (inputToken: string) => {
    if (!inputToken.trim()) return;
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);

      // Inject token
      setOverrideAccessToken(inputToken.trim());
      setToken(inputToken.trim());
      setUser({
        email: "manual-developer@amp.local",
        displayName: "Developer Override Session",
      } as any);
      setIsDriveActive(true);

      // Verify Google Drive directories using the token
      const success = await validateGoogleDriveAccess();
      if (success) {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        const currentSettings = getSavedSettings();
        await fetchDataForMode(currentSettings);
      } else {
        setIsDriveValidated(false);
        setDriveValidationError(
          "The manually provided token succeeded validation in Firebase, but Google API rejected access. Check if the token is active, expired, or has correct drive permissions.",
        );
      }
    } catch (e: any) {
      console.error("Manual drive token injection failed:", e);
      setDriveValidationError(
        e.message || "Verification of manual token override failed.",
      );
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleExternalBrowserSignIn = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError(
        "Google OAuth Client ID is required for Method B External Browser login.",
      );
      return;
    }

    // Save Client ID for convenience
    localStorage.setItem(
      "amp_google_client_id",
      googleClientId.trim(),
    );

    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      setIsPollingExternal(true);

      const redirectUri = `http://127.0.0.1:${window.location.port || "3000"}/api/oauth-callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=https://www.googleapis.com/auth/drive`;

      console.log(
        "Launching external browser for Google OAuth Method B:",
        authUrl,
      );
      window.open(authUrl, "_blank");

      // Start Polling for Registered Token
      let pollCount = 0;
      const intervalId = setInterval(async () => {
        pollCount++;
        // Timeout after 5 minutes
        if (pollCount > 300) {
          clearInterval(intervalId);
          setIsPollingExternal(false);
          setIsValidatingDrive(false);
          setLoading(false);
          setDriveValidationError(
            "Method B browser authentication timed out. Please try again.",
          );
          return;
        }

        try {
          const isCustomProtocol =
            typeof window !== "undefined" &&
            !window.location.protocol.startsWith("http");
          const baseUrl = isCustomProtocol ? "http://127.0.0.1:3000" : "";
          const res = await fetch(`${baseUrl}/api/check-registered-token`);
          if (!res.ok) throw new Error("Failed to query local loopback status");
          const data = await res.json();
          if (data.token) {
            clearInterval(intervalId);
            setIsPollingExternal(false);

            // Set token and authenticate session
            setOverrideAccessToken(data.token);
            setToken(data.token);
            setUser({
              email: "authorized-device@amp.local",
              displayName: "Loopback Verified Session",
            } as any);
            setIsDriveActive(true);

            // Validate Google Drive access
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              const currentSettings = getSavedSettings();
              await fetchDataForMode(currentSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError(
                "OAuth Token verified by loopback, but Google API rejected access to the specified folders. Ensure folders are shared/accessible.",
              );
            }
            setIsValidatingDrive(false);
            setLoading(false);
          }
        } catch (err: any) {
          console.warn("Error polling loopback token:", err);
        }
      }, 1000);
    } catch (e: any) {
      console.error("Method B OAuth launch failed:", e);
      setDriveValidationError(
        e.message || "Failed to initialize external browser flow.",
      );
      setIsValidatingDrive(false);
      setIsPollingExternal(false);
      setLoading(false);
    }
  };

  const handleAuthSignOut = async () => {
    try {
      setLoading(true);
      await handleLogout();
      setUser(null);
      setToken(null);
      setIsDriveActive(false);
      setIsDriveValidated(false);
      setDriveValidationError(null);
      setAnnouncements([]);
      setLogs([]);
      setDriveMP3s([]);
    } catch (e) {
      console.error("Sign-out failed:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <RefreshCw
          className={cn(
            "w-8 h-8 animate-spin",
            isPre ? "text-purple-600" : "text-blue-500",
          )}
        />
        <p className="text-xs font-bold text-slate-500 tracking-wider animate-pulse select-none">
          Connecting to Google Drive (Check for pop-up window)
        </p>
      </div>
    );
  }

  // Strict CSS animations is permanently adopted as default in ON position (under disable-animations and opt-css-animations)
  // when starting and when yellow (!animationsDisabled). Other overrides are only applied in red state or asleep/unfocused.
  const showCssAnimOverride = isAsleep || !isWindowFocused || !animationsDisabled || (animationsDisabled && activeOptimizations.cssAnimations);
  const showHoverTransOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverTransitions);
  const showHoverTransfOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverTransforms);
  const showHoverShadowOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverShadowsFilters);
  const showBackdropOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.backdropBlurs);
  const showPointerEventsOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.pointerEventsNeutralization);
  const showGpuLayeringOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.gpuCompositingLayering);
  const showBlinkOnlyOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.blinkOnlyUrgency);
  
  const anyOverrideActive = showCssAnimOverride || showBlinkOnlyOverride || showHoverTransOverride || showHoverTransfOverride || showHoverShadowOverride || showBackdropOverride || showPointerEventsOverride || showGpuLayeringOverride;

  return (
    <div className={cn(
      "flex flex-col h-screen bg-[#F8FAFC] font-sans overflow-hidden layout-wrapper",
      anyOverrideActive && "disable-animations",
      showBlinkOnlyOverride && "amp-blink-only-mode",
      showCssAnimOverride && "opt-css-animations",
      showHoverTransOverride && "opt-hover-transitions",
      showHoverTransfOverride && "opt-hover-transforms",
      showHoverShadowOverride && "opt-hover-shadows-filters",
      showBackdropOverride && "opt-backdrop-blurs",
      showPointerEventsOverride && "opt-pointer-events-neutralization",
      showGpuLayeringOverride && "opt-gpu-compositing-layering"
    )}>
      {/* Top Header - Branding & Nav */}
      <header className="bg-[#0F172A] px-3 py-2 shrink-0 z-20">
        <div className="flex items-center justify-between gap-3 w-full mx-auto">
          <div className="flex items-center gap-2 text-white shrink-0 min-w-max">
            {appFlavorIconUrl && !appFlavorIconError ? (
              <img
                src={appFlavorIconUrl}
                alt="AMP Logo"
                onError={() => setAppFlavorIconError(true)}
                className="w-6 h-6 object-contain shrink-0 select-none pointer-events-none"
              />
            ) : (
              <div
                className={cn(
                  "w-6 h-6 rounded flex items-center justify-center shrink-0",
                  playMode === "Live"
                    ? "bg-purple-600"
                    : playMode === "Prerecord"
                      ? "bg-emerald-600"
                      : "bg-blue-600",
                )}
              >
                <Clock className="w-4 h-4" />
              </div>
            )}
            <span className="font-bold text-xs tracking-tight shrink-0 select-none">
              AMP
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => confirmNavAction(() => setActiveTab("player"))}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                activeTab === "player"
                  ? playMode === "Live"
                    ? "bg-purple-600 text-white"
                    : playMode === "Prerecord"
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-tighter hide-player-name">
                Player
              </span>
            </button>
            {!isPlayerMode && (
              <button
                disabled={isLiveReadActive}
                onClick={() => confirmNavAction(() => setActiveTab("calendar"))}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                  activeTab === "calendar"
                    ? playMode === "Live"
                      ? "bg-purple-600 text-white"
                      : playMode === "Prerecord"
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white",
                  isLiveReadActive && "opacity-40 cursor-not-allowed pointer-events-none"
                )}
                title={isLiveReadActive ? "Disabled while Live Read is open" : undefined}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-xs font-bold uppercase tracking-tighter hide-calendar-name">
                  Calendar
                </span>
              </button>
            )}
            <button
              disabled={isLiveReadActive}
              onClick={() => confirmNavAction(() => setActiveTab("log"))}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                activeTab === "log"
                  ? playMode === "Live"
                    ? "bg-purple-600 text-white"
                    : playMode === "Prerecord"
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white",
                isLiveReadActive && "opacity-40 cursor-not-allowed pointer-events-none"
              )}
              title={isLiveReadActive ? "Disabled while Live Read is open" : undefined}
            >
              <History className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-tighter hide-log-name">
                Log
              </span>
            </button>
            {isAiStudio && (
              <button
                disabled={isLiveReadActive}
                onClick={() => confirmNavAction(() => setActiveTab("live_dev"))}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                  activeTab === "live_dev"
                    ? "bg-purple-600 text-white"
                    : "text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-500/30",
                  isLiveReadActive && "opacity-40 cursor-not-allowed pointer-events-none"
                )}
                title="Live_Dev Sandbox (AI Studio Preview Only)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-tighter">
                  Live_Dev
                </span>
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Read-Only Compatibility Mode Banner */}
      <ReadOnlyCompatibilityBanner isVisible={isReadOnlyCompatibility} />

      {/* Control Strip - Time & Refresh (Collapsed) */}
      {activeTab === "player" && (
        <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-sm z-10">
          <div className="max-w-[400px] mx-auto flex items-center justify-between gap-2">
            {isPre ? (
              <div className="flex flex-col py-0.5 min-w-0">
                <p className="text-xs uppercase text-emerald-600 font-black tracking-widest leading-none flex items-center gap-1.5 mb-1">
                  <CassetteTape className="w-3.5 h-3.5 shrink-0" />
                  Prerecord
                </p>
                {prerecordDate ? (
                  <div className="text-xs font-sans font-black text-slate-900 tabular-nums mt-0.5 leading-tight">
                    <div>{format(prerecordDate, "MM/dd/yyyy")}</div>
                    <div>
                      {format(prerecordDate, "h:mm a")} to{" "}
                      {format(
                        addMinutes(prerecordDate, prerecordLengthMinutes),
                        "h:mm a",
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : playMode === "Playlist" ? (
              <div className="flex flex-col py-0.5">
                <p className="text-xs uppercase text-purple-600 font-black tracking-widest leading-none flex items-center gap-1.5 mb-1">
                  <RadioTower className="w-3.5 h-3.5 animate-pulse" />
                  Live With Playlist
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs uppercase text-slate-400 font-black tracking-tighter leading-none">
                    Time
                  </p>
                  <p className="text-xs font-sans font-black text-slate-900 tabular-nums leading-none">
                    {format(now, "h:mm:ss a")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col py-0.5">
                <p className="text-xs uppercase text-purple-600 font-black tracking-widest leading-none flex items-center gap-1.5 mb-1">
                  <RadioTower className="w-3.5 h-3.5 animate-pulse" />
                  Live Broadcast
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs uppercase text-slate-400 font-black tracking-tighter leading-none">
                    Time
                  </p>
                  <p className="text-xs font-sans font-black text-slate-900 tabular-nums leading-none">
                    {format(now, "h:mm:ss a")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 font-sans shrink-0">
              {playMode === "Live" && (
                <div className="flex items-center gap-2 live-refresh-container">
                  <p className="text-xs uppercase text-purple-600 font-black tracking-tight leading-none whitespace-nowrap">
                    Refresh: {formatCountdown(countdown)}
                  </p>
                  <button
                    onClick={() => confirmNavAction(() => handleRefresh())}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group cursor-pointer"
                    title="Reload Status"
                  >
                    <RefreshCw className="w-3 h-3 font-bold transition-transform duration-500 group-hover:rotate-180" />
                    <span className="text-xs font-black uppercase tracking-tighter">
                      Now
                    </span>
                  </button>
                </div>
              )}

              {isPre && (
                <div className="flex flex-col items-stretch gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => confirmNavAction(() => handleEditTimeframeModal())}
                    className="flex items-center justify-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer shrink-0 text-center"
                    title="Choose Show"
                  >
                    <NotebookPen className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-tighter leading-tight flex flex-col text-center items-center">
                      <span>Choose</span>
                      <span>Show</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrerecordExportOpen((prev) => !prev)}
                    className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-700 border-b-2 border-b-blue-800 transition-colors cursor-pointer shrink-0 text-center shadow-2xs"
                    title="Open Export Show pop-up"
                  >
                    <Download className="w-3 h-3 font-bold shrink-0 text-white" />
                    <span className="text-xs font-black uppercase tracking-tighter leading-none">
                      Export
                    </span>
                  </button>
                  {prerecordHasPlaylistItems && (
                    <button
                      type="button"
                      onClick={() => confirmNavAction(() => setIsFolderChooserOpen(true))}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer shrink-0 text-center"
                      title="Playlist"
                    >
                      <ListMusic className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                      <span className="text-xs font-black uppercase tracking-tighter leading-none">
                        Playlist
                      </span>
                    </button>
                  )}
                </div>
              )}

              {playMode === "Playlist" && (
                <div className="flex flex-col min-[520px]:flex-row items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => confirmNavAction(() => setIsFolderChooserOpen(true))}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group cursor-pointer active:translate-y-px shrink-0 text-center"
                    title="Pick Playlist"
                  >
                    <ListMusic className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-tighter leading-tight flex flex-col min-[380px]:flex-row min-[380px]:gap-0.5 text-center items-center">
                      <span>Pick</span>
                      <span>Playlist</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmNavAction(() => handleOpenPlaylistModal())}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group cursor-pointer active:translate-y-px shrink-0 text-center"
                    title="Pick Show"
                  >
                    <NotebookPen className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-tighter leading-tight flex flex-col min-[380px]:flex-row min-[380px]:gap-0.5 text-center items-center">
                      <span>Pick</span>
                      <span>Show</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 bg-[#F8FAFC] flex flex-col min-h-0",
          activeTab === "player" ? "overflow-hidden pb-0" : "overflow-hidden pb-2",
        )}
      >
        {/* Connection Error Warning Banner */}
        {connectionError && (
          <div
            className={cn(
              "mx-auto px-4 mt-3 transition-all shrink-0",
              activeTab === "player"
                ? "max-w-[400px]"
                : "max-w-full md:px-6 lg:px-8",
            )}
          >
            <div className="bg-red-950/60 border border-red-500/40 text-red-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                Connection Warning
              </div>
              <p className="text-xs font-bold leading-relaxed text-red-100">
                Can't access folders. Please retry.
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setShowLocationsModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded border border-red-500 transition cursor-pointer active:translate-y-px"
                >
                  <Folder className="w-3 h-3 shrink-0" />
                  <span>Configure folders</span>
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-black text-xs uppercase tracking-wider rounded border border-slate-700 transition cursor-pointer active:translate-y-px shadow-sm"
                >
                  <RefreshCw className="w-3 h-3 shrink-0 text-slate-100" />
                  <span>Retry Sync</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Read-Only Announcements Folder Warning Banner */}
        {announcementsReadOnlyError && !connectionError && (
          <div
            className={cn(
              "mx-auto px-4 mt-3 transition-all shrink-0",
              activeTab === "player"
                ? "max-w-[400px]"
                : "max-w-full md:px-6 lg:px-8",
            )}
          >
            <div className="bg-amber-950/70 border border-amber-500/50 text-amber-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                Read-Only Folder Warning — Administrator Help Needed
              </div>
              <p className="text-xs font-bold leading-relaxed text-amber-100">
                {announcementsReadOnlyError}
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setShowLocationsModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded border border-amber-400 transition cursor-pointer active:translate-y-px"
                >
                  <Folder className="w-3 h-3 shrink-0" />
                  <span>Configure folders</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Missing Files Warning Banner */}
        {(() => {
          if (connectionError) return null;

          const isMissingAnnouncements = announcements.length === 0;
          const isMissingMP3s = driveMP3s.length === 0;
          const isMissingLogs = logs.length === 0;

          if (isMissingAnnouncements || isMissingMP3s || isMissingLogs) {
            const missingItems: string[] = [];
            if (isMissingAnnouncements) missingItems.push("Announcements.json");
            if (isMissingMP3s) missingItems.push("mp3's");
            if (isMissingLogs) missingItems.push("Logs.json");

            let missingText = "";
            if (missingItems.length === 1) {
              missingText = `Can't find ${missingItems[0]}.`;
            } else if (missingItems.length === 2) {
              const item1 = missingItems[0] === "Announcements.json" ? "announcements.json" : missingItems[0];
              const item2 = missingItems[1] === "Announcements.json" ? "announcements.json" : missingItems[1];
              missingText = `Can't find ${item1} or ${item2}.`;
            } else {
              missingText = "Can't find announcements.json, mp3's, or Logs.json.";
            }

            missingText += " (May not exist on first run.)";

            return (
              <div
                className={cn(
                  "mx-auto px-4 mt-3 transition-all shrink-0",
                  activeTab === "player"
                    ? "max-w-[400px]"
                    : "max-w-full md:px-6 lg:px-8",
                )}
              >
                <div className="bg-amber-950/60 border border-amber-500/40 text-amber-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    Resource Warning
                  </div>
                  <p className="text-xs font-bold leading-relaxed text-amber-100">
                    {missingText}
                  </p>
                  <div className="mt-1">
                    <button
                      onClick={() => setShowLocationsModal(true)}
                      className="flex items-center gap-1.5 py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded border border-amber-400 transition cursor-pointer active:translate-y-px"
                    >
                      <Folder className="w-3 h-3 shrink-0" />
                      <span>Configure folders</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {(!isDriveValidated || localPathsUnavailable || (locationMode === "Local" && !isStartupReady)) ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col items-center gap-3">
              <Folder className="w-10 h-10 text-amber-400" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">
                Storage Folders Required
              </h2>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                {startupMessage || "Please define and verify your storage folders before loading schedule data or player views."}
              </p>
              {missingDefinitions.length > 0 && (
                <div className="text-left w-full bg-slate-950/60 rounded-lg p-3 border border-slate-800 text-[11px] text-amber-300/90 flex flex-col gap-1">
                  <span className="font-semibold text-slate-300">Unconfigured Paths:</span>
                  {missingDefinitions.map((def) => (
                    <span key={def}>• {def}</span>
                  ))}
                </div>
              )}
              {missingFolders.length > 0 && (
                <div className="text-left w-full bg-slate-950/60 rounded-lg p-3 border border-slate-800 text-[11px] text-red-300/90 flex flex-col gap-1">
                  <span className="font-semibold text-slate-300">Inaccessible Directories:</span>
                  {missingFolders.map((dir) => (
                    <span key={dir} className="font-mono break-all">• {dir}</span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowLocationsModal(true)}
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg border border-amber-400 transition cursor-pointer"
              >
                <Folder className="w-4 h-4" />
                <span>Configure Storage Folders</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "w-full mx-auto h-full transition-all flex flex-col min-h-0",
              activeTab === "player"
                ? "max-w-[250px] flex-1 overflow-hidden"
                : activeTab === "live_dev"
                ? "max-w-full px-4 md:px-6 lg:px-8 pt-3 pb-1 flex-1 overflow-y-auto"
                : "max-w-full px-4 md:px-6 lg:px-8 pt-3 pb-1 flex-1",
            )}
          >
            <AnimatePresence mode="wait">
              {activeTab === "player" ? (
                <motion.div
                  key="player"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col min-h-0 w-full"
                >
                  <PlayerTab
                    announcements={effectiveAnnouncements}
                    logs={logs}
                    onLog={addLog}
                    now={now}
                    syncTime={syncTime}
                    scrollTrigger={scrollTrigger}
                    playMode={playMode}
                    playlistShow={selectedPlaylistShow}
                    prerecordDate={prerecordDate}
                    prerecordLengthMinutes={prerecordLengthMinutes}
                    onConfigureTimeframe={() =>
                      handleOpenTimeframeModal("Prerecord")
                    }
                    onExecuteExport={handleExportPrerecord}
                    isAdmin={isAdmin}
                    onRefresh={handleRefresh}
                    shows={shows}
                    onTriggerCaching={(mode, urls) => triggerCachingForMode(mode, urls)}
                    isFolderChooserOpen={isFolderChooserOpen}
                    onCloseFolderChooser={() => setIsFolderChooserOpen(false)}
                    onOpenFolderChooser={() => setIsFolderChooserOpen(true)}
                    isExportPopupOpen={isPrerecordExportOpen}
                    onCloseExportPopup={() => setIsPrerecordExportOpen(false)}
                    onPrerecordPlaylistAvailableChange={setPrerecordHasPlaylistItems}
                    scheduleWindowConfig={scheduleWindowConfig}
                    isReadOnly={isReadOnlyCompatibility}
                    adminContactInfo={adminContactInfo}
                  />
                </motion.div>
              ) : activeTab === "live_dev" ? (
                <motion.div
                  key="live_dev"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col min-h-0 flex-1"
                >
                  <LiveDevTab />
                </motion.div>
              ) : activeTab === "calendar" ? (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col min-h-0 flex-1"
                >
                  <CalendarTab
                    announcements={announcements}
                    onSave={saveAnnouncements}
                    shows={shows}
                    onSaveShows={saveShows}
                    stationTimezone={stationTimezone}
                    onSaveStationTimezone={saveStationTimezone}
                    adminContactInfo={adminContactInfo}
                    hasSavedAdminContact={hasSavedAdminContact}
                    onSaveAdminContactInfo={saveAdminContactInfo}
                    upNextPromoConfig={upNextPromoConfig}
                    logs={logs}
                    isAdmin={isAdmin}
                    onAdminToggle={setIsAdmin}
                    now={now}
                    driveMP3s={driveMP3s}
                    isDriveActive={isDriveActive && locationMode !== "Local"}
                    onRefresh={handleRefresh}
                    currentViewMode={calendarSubTab}
                    onViewModeChange={(mode) => setCalendarSubTab(mode)}
                    showPixelRuler={showPixelRuler}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="log"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="h-full flex flex-col min-h-0 flex-1"
                >
                  <LogTab 
                    logs={logs} 
                    announcements={effectiveAnnouncements}
                    shows={shows}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Bottom Footer - Default Locations Menu */}
      <footer
        className={cn(
          "px-4 py-2 shrink-0 border-t transition-all",
          locationMode === "Demo"
            ? "bg-amber-950/20 border-amber-900/40 text-amber-100"
            : "bg-slate-900 border-slate-800 text-slate-100",
        )}
      >
        <div className="flex justify-between items-center gap-2 w-full mx-auto min-h-[32px]">
          <div className="flex items-center shrink-0 gap-2">
            <div className="bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex items-center">
              <button
                type="button"
                disabled={isLiveReadActive}
                onClick={() => setShowLocationsModal(true)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all cursor-pointer shadow-sm text-xs font-black uppercase tracking-wider",
                  isLiveReadActive && "opacity-40 cursor-not-allowed pointer-events-none"
                )}
                title={isLiveReadActive ? "Disabled while Live Read is open" : "Manage Storage Folders"}
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="hide-folders-text">Folders</span>
              </button>
            </div>

            {/* Light/Dark/System Theme Selector Pill Group next to standard Folders icon */}
            {/* Expanded view for wide screens */}
            <div className="hidden sm:flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                title="Light Mode"
                aria-label="Light Mode"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "light"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Sun className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "light"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                title="Dark Mode"
                aria-label="Dark Mode"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "dark"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Moon className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "dark"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                title="System Theme"
                aria-label="System Theme"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "system"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Laptop className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "system"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
            </div>

            {/* Collapsed view for smaller screens: active theme control itself expands vertically into choices on hover or click */}
            <div
              className="sm:hidden interactive-item relative group shrink-0"
              onMouseEnter={() => setMobileThemeExpanded(true)}
              onMouseLeave={() => setMobileThemeExpanded(false)}
            >
              {/* Expanding control container overlaying the reserved button slot */}
              <div
                className={cn(
                  "interactive-item absolute bottom-0 right-0 bg-slate-950 p-0.5 rounded border border-slate-900 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex flex-col items-center gap-0.5 transition-all duration-150 z-50",
                  mobileThemeExpanded ? "shadow-2xl ring-1 ring-slate-800" : ""
                )}
              >
                {[
                  { id: "light" as const, label: "Light Mode", Icon: Sun },
                  { id: "dark" as const, label: "Dark Mode", Icon: Moon },
                  { id: "system" as const, label: "System Theme", Icon: Laptop },
                ].map((item) => {
                  const isActive = currentTheme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        handleThemeChange(item.id);
                        (e.currentTarget as HTMLElement).blur();
                      }}
                      title={item.label}
                      aria-label={item.label}
                      className={cn(
                        "px-2 py-1 rounded transition-all cursor-pointer border flex items-center justify-center relative shrink-0 w-full",
                        !isActive && !mobileThemeExpanded && "hidden group-hover:flex",
                        isActive
                          ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                          : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                      )}
                    >
                      <item.Icon className="w-3.5 h-3.5 shrink-0" />
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                          isActive
                            ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                            : "bg-slate-800 opacity-0"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              {/* Dummy spacer to maintain exact header element footprint */}
              <div className="w-[31px] h-[30px] pointer-events-none" />
            </div>

            {/* Admin Contact Info Question Mark Icon */}
            <div className="bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex items-center">
              <button
                type="button"
                onClick={() => setShowAdminContactPopup(true)}
                title={`ADMIN CONTACT: ${resolvedAdminContact}`}
                aria-label="Admin Contact Info"
                className="px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border bg-slate-950/40 border-slate-900/40 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700 flex items-center justify-center"
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            {/* DEMO Indicator displayed only in Demo storage Mode - aligned next to the Folders button */}
            {locationMode === "Demo" && (
              <span className="text-xs font-black tracking-widest text-[#F59E0B] animate-pulse bg-amber-950/40 px-2.5 py-1 rounded border border-amber-500/20 leading-none">
                DEMO
              </span>
            )}
          </div>

          <div className="flex items-center shrink-0 ml-auto">
            {/* Mode Controls - only shown on Player tab */}
            {activeTab === "player" && (
              <>
                {/* Horizontal Mode Pill Group (Wide / Medium screens) */}
                <div className="mode-horizontal-group flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
                  {!isStudioApp && (
                    <button
                      type="button"
                      onClick={() => {
                        confirmNavAction(() => {
                          if (playMode !== "Live") {
                            setShowCachingModal(true);
                            setCachingTargetMode("Live");
                            setCachingProgress({ total: 0, completed: 0, failed: 0, errors: [], isComplete: false });
                            setPlayMode("Live");
                            setPrerecordDate(null);
                            handleRefresh();
                            triggerCachingForMode("Live");
                          }
                        });
                      }}
                      title="Live Mode"
                      aria-label="Live Mode"
                      className={cn(
                        "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                        playMode === "Live"
                          ? "bg-gradient-to-b from-purple-500 to-purple-600 border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]"
                          : "bg-purple-950/30 border-purple-900/30 text-purple-500/60 hover:text-purple-400/80 hover:bg-purple-950/45",
                      )}
                    >
                      <RadioTower
                        className={cn(
                          "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                          playMode === "Live"
                            ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                            : "text-slate-500",
                        )}
                      />
                      <span className={getModeTextHideClass("Live")}>Live</span>
                    </button>
                  )}
                  {!isLiveApp && (
                    <button
                      type="button"
                      onClick={() => {
                        confirmNavAction(() => {
                          handleOpenTimeframeModal("Prerecord");
                        });
                      }}
                      title="Prerecord Mode"
                      aria-label="Prerecord Mode"
                      className={cn(
                        "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                        playMode === "Prerecord"
                          ? "bg-gradient-to-b from-emerald-500 to-emerald-600 border-t-emerald-400 border-b-emerald-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]"
                          : "bg-emerald-950/30 border-emerald-900/30 text-emerald-500/60 hover:text-emerald-400/80 hover:bg-emerald-950/45",
                      )}
                    >
                      <CassetteTape
                        className={cn(
                          "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                          playMode === "Prerecord"
                            ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                            : "text-slate-500",
                        )}
                      />
                      <span className={getModeTextHideClass("Prerecord")}>Prerecord</span>
                    </button>
                  )}
                  {!isStudioApp && !isLiveApp && (
                    <button
                      type="button"
                      onClick={() => {
                        confirmNavAction(() => {
                          handleOpenPlaylistModal();
                        });
                      }}
                      title="Playlist Mode"
                      aria-label="Playlist Mode"
                      className={cn(
                        "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                        playMode === "Playlist"
                          ? "bg-gradient-to-b from-purple-600 to-purple-700 border-t-purple-400 border-b-purple-900 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]"
                          : "bg-purple-950/30 border-purple-900/30 text-purple-400/70 hover:text-purple-300 hover:bg-purple-950/45",
                      )}
                    >
                      <ListMusic
                        className={cn(
                          "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                          playMode === "Playlist"
                            ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                            : "text-slate-500",
                        )}
                      />
                      <span className={getModeTextHideClass("Playlist")}>Playlist</span>
                    </button>
                  )}
                </div>

                {/* Collapsed view for smaller screens: active mode control itself expands vertically into choices on hover or click */}
                <div
                  className={cn(
                    "mode-vertical-group interactive-item relative group shrink-0 items-center",
                    mobileModeExpanded && "is-expanded"
                  )}
                  onMouseEnter={() => setMobileModeExpanded(true)}
                  onMouseLeave={() => setMobileModeExpanded(false)}
                >
                  <span className="text-xs font-bold text-slate-400 mr-1.5 select-none leading-none">
                    Mode:
                  </span>
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        "interactive-item absolute bottom-0 right-0 flex flex-col bg-slate-950 p-0.5 rounded border border-slate-900 z-50 gap-0.5 transition-all duration-200 shadow-xl w-max",
                        mobileModeExpanded ? "shadow-2xl ring-1 ring-slate-800" : ""
                      )}
                    >
                      {[
                        ...(!isStudioApp
                          ? [
                              {
                                id: "Live" as const,
                                label: "Live Mode",
                                Icon: RadioTower,
                                onClick: () => {
                                  confirmNavAction(() => {
                                    if (playMode !== "Live") {
                                      setShowCachingModal(true);
                                      setCachingTargetMode("Live");
                                      setCachingProgress({ total: 0, completed: 0, failed: 0, errors: [], isComplete: false });
                                      setPlayMode("Live");
                                      setPrerecordDate(null);
                                      setIsPrerecordExportOpen(false);
                                      handleRefresh();
                                      triggerCachingForMode("Live");
                                    }
                                  });
                                },
                                activeClass: "bg-gradient-to-b from-purple-500 to-purple-600 border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]",
                                inactiveClass: "bg-purple-950/30 border-purple-900/30 text-purple-500/60 hover:text-purple-400/80 hover:bg-purple-950/45",
                              },
                            ]
                          : []),
                        ...(!isLiveApp
                          ? [
                              {
                                id: "Prerecord" as const,
                                label: "Prerecord Mode",
                                Icon: CassetteTape,
                                onClick: () => {
                                  confirmNavAction(() => {
                                    handleOpenTimeframeModal("Prerecord");
                                  });
                                },
                                activeClass: "bg-gradient-to-b from-emerald-500 to-emerald-600 border-t-emerald-400 border-b-emerald-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]",
                                inactiveClass: "bg-emerald-950/30 border-emerald-900/30 text-emerald-500/60 hover:text-emerald-400/80 hover:bg-emerald-950/45",
                              },
                            ]
                          : []),
                        ...(!isStudioApp && !isLiveApp
                          ? [
                              {
                                id: "Playlist" as const,
                                label: "Playlist Mode",
                                Icon: ListMusic,
                                onClick: () => {
                                  confirmNavAction(() => {
                                    handleOpenPlaylistModal();
                                  });
                                },
                                activeClass: "bg-gradient-to-b from-purple-600 to-purple-700 border-t-purple-400 border-b-purple-900 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]",
                                inactiveClass: "bg-purple-950/30 border-purple-900/30 text-purple-400/70 hover:text-purple-300 hover:bg-purple-950/45",
                              },
                            ]
                          : []),
                      ].map((item) => {
                        const isActive = playMode === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={(e) => {
                              item.onClick();
                              (e.currentTarget as HTMLElement).blur();
                              setMobileModeExpanded(false);
                            }}
                            title={item.label}
                            aria-label={item.label}
                            className={cn(
                              "px-2 py-1 rounded transition-all cursor-pointer border flex items-center justify-start relative shrink-0 w-full gap-1.5",
                              !isActive && !mobileModeExpanded && "hidden group-hover:flex",
                              isActive ? item.activeClass : item.inactiveClass
                            )}
                          >
                            <item.Icon
                              className={cn(
                                "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                                isActive
                                  ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                                  : "text-slate-500"
                              )}
                            />
                            <span className="mode-vertical-text text-xs font-black uppercase tracking-wider whitespace-nowrap">
                              {item.id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Dummy spacer to maintain exact element footprint */}
                    <div className="mode-vertical-spacer h-[30px] pointer-events-none" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </footer>

      <AppOverlays
        showPrerecordModal={showPrerecordModal}
        setShowPrerecordModal={setShowPrerecordModal}
        prerecordModalTarget={prerecordModalTarget}
        prerecordSelectorMode={prerecordSelectorMode}
        setPrerecordSelectorMode={setPrerecordSelectorMode}
        showPrerecordConfirmStep={showPrerecordConfirmStep}
        setShowPrerecordConfirmStep={setShowPrerecordConfirmStep}
        prerecordConfirmDetails={prerecordConfirmDetails}
        setPrerecordConfirmDetails={setPrerecordConfirmDetails}
        shows={shows}
        showFilterText={showFilterText}
        setShowFilterText={setShowFilterText}
        selectedPrerecordShowId={selectedPrerecordShowId}
        setSelectedPrerecordShowId={setSelectedPrerecordShowId}
        prerecordDateInput={prerecordDateInput}
        setPrerecordDateInput={setPrerecordDateInput}
        prerecordTimeInput={prerecordTimeInput}
        setPrerecordTimeInput={setPrerecordTimeInput}
        handleTimeInputChange={handleTimeInputChange}
        prerecordHoursInput={prerecordHoursInput}
        setPrerecordHoursInput={setPrerecordHoursInput}
        prerecordMinutesInput={prerecordMinutesInput}
        setPrerecordMinutesInput={setPrerecordMinutesInput}
        prerecordError={prerecordError}
        handleSelectPrerecordShow={handleSelectPrerecordShow}
        handleActivatePrerecord={handleActivatePrerecord}
        handleFinalConfirmPrerecord={handleFinalConfirmPrerecord}
        getFutureDatesForShow={getFutureDatesForShow}
        formatVerifyAirDate={formatVerifyAirDate}
        getPrerecord12HrDisplay={getPrerecord12HrDisplay}
        showPlaylistModal={showPlaylistModal}
        setShowPlaylistModal={setShowPlaylistModal}
        playlistModalLoading={playlistModalLoading}
        playlistShowOptions={playlistShowOptions}
        playlistModalNow={playlistModalNow}
        syncTime={syncTime}
        chosenPlaylistShowId={chosenPlaylistShowId}
        handleSelectAndConfirmShow={handleSelectAndConfirmShow}
        showLocationsModal={showLocationsModal}
        setShowLocationsModal={setShowLocationsModal}
        locationMode={locationMode}
        setLocationMode={setLocationMode}
        isAiStudio={isAiStudio}
        windowSize={windowSize}
        draftLocalPathAmp={draftLocalPathAmp}
        setDraftLocalPathAmp={setDraftLocalPathAmp}
        draftLocalPathCalendar={draftLocalPathCalendar}
        setDraftLocalPathCalendar={setDraftLocalPathCalendar}
        draftLocalPathMP3s={draftLocalPathMP3s}
        setDraftLocalPathMP3s={setDraftLocalPathMP3s}
        draftLocalPathMediaAnnouncements={draftLocalPathMediaAnnouncements}
        setDraftLocalPathMediaAnnouncements={setDraftLocalPathMediaAnnouncements}
        draftLocalPathMediaEvergreens={draftLocalPathMediaEvergreens}
        setDraftLocalPathMediaEvergreens={setDraftLocalPathMediaEvergreens}
        draftLocalPathMediaShows={draftLocalPathMediaShows}
        setDraftLocalPathMediaShows={setDraftLocalPathMediaShows}
        draftLocalPathLogs={draftLocalPathLogs}
        setDraftLocalPathLogs={setDraftLocalPathLogs}
        handleBrowseNative={handleBrowseNative}
        handleOpenLocalPath={handleOpenLocalPath}
        announcementsReadOnlyError={announcementsReadOnlyError}
        localPathsUnavailable={localPathsUnavailable}
        draftDriveFolderAmp={draftDriveFolderAmp}
        setDraftDriveFolderAmp={setDraftDriveFolderAmp}
        draftDriveFolderPreferences={draftDriveFolderPreferences}
        setDraftDriveFolderPreferences={setDraftDriveFolderPreferences}
        draftDriveFolderMP3s={draftDriveFolderMP3s}
        setDraftDriveFolderMP3s={setDraftDriveFolderMP3s}
        draftDriveFolderAnnouncements={draftDriveFolderAnnouncements}
        setDraftDriveFolderAnnouncements={setDraftDriveFolderAnnouncements}
        draftDriveFolderEvergreens={draftDriveFolderEvergreens}
        setDraftDriveFolderEvergreens={setDraftDriveFolderEvergreens}
        draftDriveFolderShows={draftDriveFolderShows}
        setDraftDriveFolderShows={setDraftDriveFolderShows}
        draftDriveFolderLogs={draftDriveFolderLogs}
        setDraftDriveFolderLogs={setDraftDriveFolderLogs}
        driveFolderDescMap={driveFolderDescMap}
        setDriveFolderDescMap={setDriveFolderDescMap}
        handleOpenDriveFolder={handleOpenDriveFolder}
        fetchDriveFolderDescriptor={fetchDriveFolderDescriptor}
        editingDriveField={editingDriveField}
        setEditingDriveField={setEditingDriveField}
        tempPasteLink={tempPasteLink}
        setTempPasteLink={setTempPasteLink}
        user={user}
        token={token}
        setToken={setToken}
        setUser={setUser}
        googleClientId={googleClientId}
        setGoogleClientId={setGoogleClientId}
        isPollingExternal={isPollingExternal}
        setIsPollingExternal={setIsPollingExternal}
        isValidatingDrive={isValidatingDrive}
        setIsValidatingDrive={setIsValidatingDrive}
        setLoading={setLoading}
        driveValidationError={driveValidationError}
        setDriveValidationError={setDriveValidationError}
        validateGoogleDriveAccess={validateGoogleDriveAccess}
        fetchDataForMode={fetchDataForMode}
        handleAuthSignOut={handleAuthSignOut}
        setOverrideAccessToken={setOverrideAccessToken}
        locationsError={locationsError}
        locationsSuccess={locationsSuccess}
        handleSaveLocations={handleSaveLocations}
        showLocalHelp={showLocalHelp}
        setShowLocalHelp={setShowLocalHelp}
        animationsDisabled={animationsDisabled}
        setAnimationsDisabled={setAnimationsDisabled}
        toggleAnimations={toggleAnimations}
        showPixelRuler={showPixelRuler}
        togglePixelRuler={togglePixelRuler}
        isSyncing={isSyncing}
        isAdminApp={isAdminApp}
        isAdmin={isAdmin}
        onAdminToggle={setIsAdmin}
        hasSavedAdminContact={hasSavedAdminContact}
        stationTimezone={stationTimezone}
        saveStationTimezone={saveStationTimezone}
        adminContactInfo={adminContactInfo}
        saveAdminContactInfo={saveAdminContactInfo}
        upNextPromoConfig={upNextPromoConfig}
        saveUpNextPromoConfig={saveUpNextPromoConfig}
        scheduleWindowConfig={scheduleWindowConfig}
        saveScheduleWindowConfig={saveScheduleWindowConfig}
        showAdminContactPopup={showAdminContactPopup}
        setShowAdminContactPopup={setShowAdminContactPopup}
        resolvedAdminContact={resolvedAdminContact}
        showExportModal={showExportModal}
        handleCloseExportModal={handleCloseExportModal}
        exportState={exportState}
        exportDestinationInput={exportDestinationInput}
        setExportDestinationInput={setExportDestinationInput}
        exportFolderPrefixInput={exportFolderPrefixInput}
        setExportFolderPrefixInput={setExportFolderPrefixInput}
        setExportTextPrefixInput={setExportTextPrefixInput}
        setExportPlaylistPrefixInput={setExportPlaylistPrefixInput}
        exportError={exportError}
        exportResult={exportResult}
        handleBrowseExportDestination={handleBrowseExportDestination}
        runExportPrerecord={runExportPrerecord}
        handleOpenExportFolder={handleOpenExportFolder}
        getDynamicNames={getDynamicNames}
        prerecordDate={prerecordDate}
        prerecordLengthMinutes={prerecordLengthMinutes}
        showUpgradeModal={showUpgradeModal}
        handleConfirmUpgrade={handleConfirmUpgrade}
        handleCancelOrChangeFolder={handleCancelOrChangeFolder}
        localPathAmp={localPathAmp}
        localPathCalendar={localPathCalendar}
        driveFolderAmp={driveFolderAmp}
        compatibilityReport={compatibilityReport}
        showNewerVersionModal={showNewerVersionModal}
        handleAcknowledgeNewerVersion={handleAcknowledgeNewerVersion}
        isOptimizationConfigOpen={isOptimizationConfigOpen}
        setIsOptimizationConfigOpen={setIsOptimizationConfigOpen}
        tempOptimizations={tempOptimizations}
        setTempOptimizations={setTempOptimizations}
        setActiveOptimizations={setActiveOptimizations}
        showCachingModal={showCachingModal}
        setShowCachingModal={setShowCachingModal}
        cachingTargetMode={cachingTargetMode}
        cachingProgress={cachingProgress}
        triggerCachingForMode={triggerCachingForMode}
        showUnsavedChangesNavModal={showUnsavedChangesNavModal}
        setShowUnsavedChangesNavModal={setShowUnsavedChangesNavModal}
        showAudioPlayingNavModal={showAudioPlayingNavModal}
        setShowAudioPlayingNavModal={setShowAudioPlayingNavModal}
        pendingNavActionRef={pendingNavActionRef}
        isAsleep={isAsleep}
        handleWakeUp={handleWakeUp}
        isSaving={isSaving}
        savingLabel={savingLabel}
        saveRecoveryModal={saveRecoveryModal}
        setSaveRecoveryModal={setSaveRecoveryModal}
      />
    </div>
  );
}
