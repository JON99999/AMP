import React from "react";
import {
  AlertCircle,
  RefreshCw,
  HardDriveDownload,
  RotateCcw,
  HelpCircle,
  Moon,
  AlarmClock,
  Zap,
  Square,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Show, UpNextPromoConfig } from "../../types";
import LocalHelpModal from "../LocalHelpModal";
import { SaveRecoveryModal, SaveRecoveryInfo } from "../SaveRecoveryModal";
import { PlaylistSelectModal } from "../PlaylistSelectModal";
import { PrerecordModal } from "../PrerecordModal";
import { LocationsModal } from "../LocationsModal";
import { ExportModal } from "../ExportModal";
import { DataUpgradeRequiredModal } from "../DataUpgradeRequiredModal";
import { NewerVersionDetectedModal } from "../NewerVersionDetectedModal";
import { CompatibilityReport, ScheduleWindowConfig } from "../../lib/compatibility";
import { cn, extractFolderId, getSortedShows, getShowShade } from "../../lib/utils";
import { CachingProgressReport } from "../../lib/audioCache";

export interface OptimizationConfig {
  cssAnimations: boolean;
  blinkOnlyUrgency: boolean;
  hoverTransitions: boolean;
  hoverTransforms: boolean;
  hoverShadowsFilters: boolean;
  backdropBlurs: boolean;
  webWorkers: boolean;
  pointerEventsNeutralization: boolean;
  gpuCompositingLayering: boolean;
}

export interface AppOverlaysProps {
  // Prerecord Modal
  showPrerecordModal: boolean;
  setShowPrerecordModal: React.Dispatch<React.SetStateAction<boolean>>;
  prerecordModalTarget: "Prerecord";
  prerecordSelectorMode: "show-list" | "manual";
  setPrerecordSelectorMode: React.Dispatch<
    React.SetStateAction<"show-list" | "manual">
  >;
  showPrerecordConfirmStep: boolean;
  setShowPrerecordConfirmStep: React.Dispatch<React.SetStateAction<boolean>>;
  prerecordConfirmDetails: { startDate: Date; totalMinutes: number } | null;
  setPrerecordConfirmDetails: React.Dispatch<
    React.SetStateAction<{ startDate: Date; totalMinutes: number } | null>
  >;
  shows: Show[];
  showFilterText: string;
  setShowFilterText: React.Dispatch<React.SetStateAction<string>>;
  selectedPrerecordShowId: string;
  setSelectedPrerecordShowId: React.Dispatch<React.SetStateAction<string>>;
  prerecordDateInput: string;
  setPrerecordDateInput: React.Dispatch<React.SetStateAction<string>>;
  prerecordTimeInput: string;
  setPrerecordTimeInput: React.Dispatch<React.SetStateAction<string>>;
  handleTimeInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  prerecordHoursInput: string;
  setPrerecordHoursInput: React.Dispatch<React.SetStateAction<string>>;
  prerecordMinutesInput: string;
  setPrerecordMinutesInput: React.Dispatch<React.SetStateAction<string>>;
  prerecordError: string | null;
  handleSelectPrerecordShow: (showId: string) => void;
  handleActivatePrerecord: (e: React.FormEvent) => void;
  handleFinalConfirmPrerecord: () => Promise<void>;
  getFutureDatesForShow: (
    showDay: string,
    startHour?: number,
    startMinute?: number,
  ) => Date[];
  formatVerifyAirDate: (dateStr: string) => string;
  getPrerecord12HrDisplay: (timeStr: string) => string;

  // Playlist Select Modal
  showPlaylistModal: boolean;
  setShowPlaylistModal: React.Dispatch<React.SetStateAction<boolean>>;
  playlistModalLoading: boolean;
  playlistShowOptions: any;
  playlistModalNow: Date;
  syncTime: Date;
  chosenPlaylistShowId: string;
  handleSelectAndConfirmShow: (targetShow: Show) => void;

  // Locations Modal
  showLocationsModal: boolean;
  setShowLocationsModal: React.Dispatch<React.SetStateAction<boolean>>;
  locationMode: "Local" | "Drive" | "Demo";
  setLocationMode: React.Dispatch<
    React.SetStateAction<"Local" | "Drive" | "Demo">
  >;
  isAiStudio: boolean;
  windowSize: { width: number; height: number };
  draftLocalPathAmp: string;
  setDraftLocalPathAmp: React.Dispatch<React.SetStateAction<string>>;
  draftLocalPathCalendar: string;
  setDraftLocalPathCalendar: React.Dispatch<React.SetStateAction<string>>;
  draftLocalPathMP3s: string;
  setDraftLocalPathMP3s: React.Dispatch<React.SetStateAction<string>>;
  draftLocalPathMediaAnnouncements: string;
  setDraftLocalPathMediaAnnouncements: React.Dispatch<
    React.SetStateAction<string>
  >;
  draftLocalPathMediaEvergreens: string;
  setDraftLocalPathMediaEvergreens: React.Dispatch<
    React.SetStateAction<string>
  >;
  draftLocalPathMediaShows: string;
  setDraftLocalPathMediaShows: React.Dispatch<React.SetStateAction<string>>;
  draftLocalPathLogs: string;
  setDraftLocalPathLogs: React.Dispatch<React.SetStateAction<string>>;
  handleBrowseNative: (
    targetField:
      | "amp"
      | "calendar"
      | "mp3s"
      | "announcements"
      | "evergreens"
      | "shows"
      | "logs",
  ) => Promise<string | null>;
  handleOpenLocalPath: (dirPath: string) => Promise<void>;
  announcementsReadOnlyError: string | null;
  localPathsUnavailable: boolean;
  draftDriveFolderAmp: string;
  setDraftDriveFolderAmp: React.Dispatch<React.SetStateAction<string>>;
  draftDriveFolderPreferences: string;
  setDraftDriveFolderPreferences: React.Dispatch<React.SetStateAction<string>>;
  draftDriveFolderMP3s: string;
  setDraftDriveFolderMP3s: React.Dispatch<React.SetStateAction<string>>;
  draftDriveFolderAnnouncements: string;
  setDraftDriveFolderAnnouncements: React.Dispatch<
    React.SetStateAction<string>
  >;
  draftDriveFolderEvergreens: string;
  setDraftDriveFolderEvergreens: React.Dispatch<React.SetStateAction<string>>;
  draftDriveFolderShows: string;
  setDraftDriveFolderShows: React.Dispatch<React.SetStateAction<string>>;
  draftDriveFolderLogs: string;
  setDraftDriveFolderLogs: React.Dispatch<React.SetStateAction<string>>;
  driveFolderDescMap: Record<string, string>;
  setDriveFolderDescMap: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  handleOpenDriveFolder: (folderId: string) => Promise<void>;
  fetchDriveFolderDescriptor: (
    folderId: string,
    currentToken: string | null,
  ) => Promise<string>;
  editingDriveField:
    | "amp"
    | "preferences"
    | "mp3s"
    | "announcements"
    | "evergreens"
    | "shows"
    | "logs"
    | null;
  setEditingDriveField: React.Dispatch<
    React.SetStateAction<
      | "amp"
      | "preferences"
      | "mp3s"
      | "announcements"
      | "evergreens"
      | "shows"
      | "logs"
      | null
    >
  >;
  tempPasteLink: string;
  setTempPasteLink: React.Dispatch<React.SetStateAction<string>>;
  user: any;
  token: string | null;
  setToken: React.Dispatch<React.SetStateAction<string | null>>;
  setUser: React.Dispatch<React.SetStateAction<any>>;
  googleClientId: string;
  setGoogleClientId: React.Dispatch<React.SetStateAction<string>>;
  isPollingExternal: boolean;
  setIsPollingExternal: React.Dispatch<React.SetStateAction<boolean>>;
  isValidatingDrive: boolean;
  setIsValidatingDrive: React.Dispatch<React.SetStateAction<boolean>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  driveValidationError: string | null;
  setDriveValidationError: React.Dispatch<React.SetStateAction<string | null>>;
  validateGoogleDriveAccess: (customSettings?: any) => Promise<boolean>;
  fetchDataForMode: (settings?: any) => Promise<void>;
  handleAuthSignOut: () => Promise<void>;
  setOverrideAccessToken: (token: string | null) => void;
  locationsError: string | null;
  locationsSuccess: string | null;
  handleSaveLocations: (
    e?: React.FormEvent,
    options?: { createMissing?: boolean },
  ) => Promise<void>;
  showLocalHelp: boolean;
  setShowLocalHelp: React.Dispatch<React.SetStateAction<boolean>>;
  animationsDisabled: boolean;
  setAnimationsDisabled: React.Dispatch<React.SetStateAction<boolean>>;
  toggleAnimations: () => void;
  showPixelRuler: boolean;
  togglePixelRuler: () => void;
  isSyncing: boolean;

  // Local Help Modal
  isAdmin: boolean;
  stationTimezone: string;
  saveStationTimezone: (newTimezone: string) => Promise<boolean>;
  adminContactInfo?: string;
  saveAdminContactInfo: (newContact: string) => Promise<boolean>;
  upNextPromoConfig?: UpNextPromoConfig;
  saveUpNextPromoConfig: (newConfig: UpNextPromoConfig) => Promise<boolean>;
  scheduleWindowConfig?: ScheduleWindowConfig;
  saveScheduleWindowConfig: (
    newConfig: ScheduleWindowConfig,
  ) => Promise<boolean>;

  // Admin Contact Popup
  showAdminContactPopup: boolean;
  setShowAdminContactPopup: React.Dispatch<React.SetStateAction<boolean>>;
  resolvedAdminContact: string;

  // Export Modal
  showExportModal: boolean;
  handleCloseExportModal: () => void;
  exportState: "idle" | "configuring" | "exporting" | "success" | "error";
  exportDestinationInput: string;
  setExportDestinationInput: React.Dispatch<React.SetStateAction<string>>;
  exportFolderPrefixInput: string;
  setExportFolderPrefixInput: React.Dispatch<React.SetStateAction<string>>;
  setExportTextPrefixInput: React.Dispatch<React.SetStateAction<string>>;
  setExportPlaylistPrefixInput: React.Dispatch<React.SetStateAction<string>>;
  exportError: string | null;
  exportResult: any;
  handleBrowseExportDestination: () => Promise<void>;
  runExportPrerecord: (
    overwriteMode?: "normal" | "overwrite" | "clean",
  ) => Promise<void>;
  handleOpenExportFolder: (folderPath: string) => Promise<void>;
  getDynamicNames: () => {
    folderName: string;
    textFilename: string;
    playlistFilename: string;
    firstTrackFilename: string;
  };
  prerecordDate: Date | null;
  prerecordLengthMinutes: number;

  // Compatibility Modals
  showUpgradeModal: boolean;
  handleConfirmUpgrade: () => Promise<void>;
  handleCancelOrChangeFolder: () => void;
  localPathAmp: string;
  localPathCalendar: string;
  driveFolderAmp: string;
  compatibilityReport: CompatibilityReport | null;
  showNewerVersionModal: boolean;
  handleAcknowledgeNewerVersion: () => void;

  // Optimization Modal
  isOptimizationConfigOpen: boolean;
  setIsOptimizationConfigOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tempOptimizations: OptimizationConfig;
  setTempOptimizations: React.Dispatch<
    React.SetStateAction<OptimizationConfig>
  >;
  setActiveOptimizations: React.Dispatch<
    React.SetStateAction<OptimizationConfig>
  >;

  // Caching Progress Modal
  showCachingModal: boolean;
  setShowCachingModal: React.Dispatch<React.SetStateAction<boolean>>;
  cachingTargetMode: "Live" | "Prerecord" | "Playlist" | null;
  cachingProgress: CachingProgressReport;
  triggerCachingForMode: (
    targetMode: "Live" | "Prerecord" | "Playlist",
    additionalUrls?: string[],
  ) => Promise<void>;

  // Navigation Guard Modals
  showUnsavedChangesNavModal: boolean;
  setShowUnsavedChangesNavModal: React.Dispatch<React.SetStateAction<boolean>>;
  showAudioPlayingNavModal: boolean;
  setShowAudioPlayingNavModal: React.Dispatch<React.SetStateAction<boolean>>;
  pendingNavActionRef: React.MutableRefObject<(() => void) | null>;

  // Sleep Overlay & Save Indicators
  isAsleep: boolean;
  handleWakeUp: () => void;
  isSaving: boolean;
  savingLabel: string | null;
  saveRecoveryModal: SaveRecoveryInfo | null;
  setSaveRecoveryModal: React.Dispatch<
    React.SetStateAction<SaveRecoveryInfo | null>
  >;
}

export const AppOverlays: React.FC<AppOverlaysProps> = ({
  showPrerecordModal,
  setShowPrerecordModal,
  prerecordModalTarget,
  prerecordSelectorMode,
  setPrerecordSelectorMode,
  showPrerecordConfirmStep,
  setShowPrerecordConfirmStep,
  prerecordConfirmDetails,
  setPrerecordConfirmDetails,
  shows,
  showFilterText,
  setShowFilterText,
  selectedPrerecordShowId,
  setSelectedPrerecordShowId,
  prerecordDateInput,
  setPrerecordDateInput,
  prerecordTimeInput,
  setPrerecordTimeInput,
  handleTimeInputChange,
  prerecordHoursInput,
  setPrerecordHoursInput,
  prerecordMinutesInput,
  setPrerecordMinutesInput,
  prerecordError,
  handleSelectPrerecordShow,
  handleActivatePrerecord,
  handleFinalConfirmPrerecord,
  getFutureDatesForShow,
  formatVerifyAirDate,
  getPrerecord12HrDisplay,
  showPlaylistModal,
  setShowPlaylistModal,
  playlistModalLoading,
  playlistShowOptions,
  playlistModalNow,
  syncTime,
  chosenPlaylistShowId,
  handleSelectAndConfirmShow,
  showLocationsModal,
  setShowLocationsModal,
  locationMode,
  setLocationMode,
  isAiStudio,
  windowSize,
  draftLocalPathAmp,
  setDraftLocalPathAmp,
  draftLocalPathCalendar,
  setDraftLocalPathCalendar,
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
  handleBrowseNative,
  handleOpenLocalPath,
  announcementsReadOnlyError,
  localPathsUnavailable,
  draftDriveFolderAmp,
  setDraftDriveFolderAmp,
  draftDriveFolderPreferences,
  setDraftDriveFolderPreferences,
  draftDriveFolderMP3s,
  setDraftDriveFolderMP3s,
  draftDriveFolderAnnouncements,
  setDraftDriveFolderAnnouncements,
  draftDriveFolderEvergreens,
  setDraftDriveFolderEvergreens,
  draftDriveFolderShows,
  setDraftDriveFolderShows,
  draftDriveFolderLogs,
  setDraftDriveFolderLogs,
  driveFolderDescMap,
  setDriveFolderDescMap,
  handleOpenDriveFolder,
  fetchDriveFolderDescriptor,
  editingDriveField,
  setEditingDriveField,
  tempPasteLink,
  setTempPasteLink,
  user,
  token,
  setToken,
  setUser,
  googleClientId,
  setGoogleClientId,
  isPollingExternal,
  setIsPollingExternal,
  isValidatingDrive,
  setIsValidatingDrive,
  setLoading,
  driveValidationError,
  setDriveValidationError,
  validateGoogleDriveAccess,
  fetchDataForMode,
  handleAuthSignOut,
  setOverrideAccessToken,
  locationsError,
  locationsSuccess,
  handleSaveLocations,
  showLocalHelp,
  setShowLocalHelp,
  animationsDisabled,
  setAnimationsDisabled,
  toggleAnimations,
  showPixelRuler,
  togglePixelRuler,
  isSyncing,
  isAdmin,
  stationTimezone,
  saveStationTimezone,
  adminContactInfo,
  saveAdminContactInfo,
  upNextPromoConfig,
  saveUpNextPromoConfig,
  scheduleWindowConfig,
  saveScheduleWindowConfig,
  showAdminContactPopup,
  setShowAdminContactPopup,
  resolvedAdminContact,
  showExportModal,
  handleCloseExportModal,
  exportState,
  exportDestinationInput,
  setExportDestinationInput,
  exportFolderPrefixInput,
  setExportFolderPrefixInput,
  setExportTextPrefixInput,
  setExportPlaylistPrefixInput,
  exportError,
  exportResult,
  handleBrowseExportDestination,
  runExportPrerecord,
  handleOpenExportFolder,
  getDynamicNames,
  prerecordDate,
  prerecordLengthMinutes,
  showUpgradeModal,
  handleConfirmUpgrade,
  handleCancelOrChangeFolder,
  localPathAmp,
  localPathCalendar,
  driveFolderAmp,
  compatibilityReport,
  showNewerVersionModal,
  handleAcknowledgeNewerVersion,
  isOptimizationConfigOpen,
  setIsOptimizationConfigOpen,
  tempOptimizations,
  setTempOptimizations,
  setActiveOptimizations,
  showCachingModal,
  setShowCachingModal,
  cachingTargetMode,
  cachingProgress,
  triggerCachingForMode,
  showUnsavedChangesNavModal,
  setShowUnsavedChangesNavModal,
  showAudioPlayingNavModal,
  setShowAudioPlayingNavModal,
  pendingNavActionRef,
  isAsleep,
  handleWakeUp,
  isSaving,
  savingLabel,
  saveRecoveryModal,
  setSaveRecoveryModal,
}) => {
  return (
    <>
      {/* Prerecord Activation Modal */}
      <PrerecordModal
        isOpen={showPrerecordModal}
        onClose={() => setShowPrerecordModal(false)}
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
        onSelectPrerecordShow={handleSelectPrerecordShow}
        onActivatePrerecord={handleActivatePrerecord}
        onFinalConfirmPrerecord={handleFinalConfirmPrerecord}
        getSortedShows={getSortedShows}
        getShowShade={getShowShade}
        getFutureDatesForShow={getFutureDatesForShow}
        formatVerifyAirDate={formatVerifyAirDate}
        getPrerecord12HrDisplay={getPrerecord12HrDisplay}
      />

      {/* Playlist Mode Selection Modal */}
      <PlaylistSelectModal
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        loading={playlistModalLoading}
        playlistShowOptions={playlistShowOptions}
        playlistModalNow={playlistModalNow}
        syncTime={syncTime}
        chosenPlaylistShowId={chosenPlaylistShowId}
        onSelectAndConfirmShow={handleSelectAndConfirmShow}
      />

      <LocationsModal
        isOpen={showLocationsModal}
        onClose={() => setShowLocationsModal(false)}
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
        setDraftLocalPathMediaAnnouncements={
          setDraftLocalPathMediaAnnouncements
        }
        draftLocalPathMediaEvergreens={draftLocalPathMediaEvergreens}
        setDraftLocalPathMediaEvergreens={setDraftLocalPathMediaEvergreens}
        draftLocalPathMediaShows={draftLocalPathMediaShows}
        setDraftLocalPathMediaShows={setDraftLocalPathMediaShows}
        draftLocalPathLogs={draftLocalPathLogs}
        setDraftLocalPathLogs={setDraftLocalPathLogs}
        onBrowseNative={handleBrowseNative}
        onOpenLocalPath={handleOpenLocalPath}
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
        onOpenDriveFolder={handleOpenDriveFolder}
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
        onSaveLocations={handleSaveLocations}
        onShowLocalHelp={() => setShowLocalHelp(true)}
        animationsDisabled={animationsDisabled}
        toggleAnimations={toggleAnimations}
        showPixelRuler={showPixelRuler}
        togglePixelRuler={togglePixelRuler}
        isSyncing={isSyncing}
      />
      <LocalHelpModal
        isOpen={showLocalHelp}
        onClose={() => setShowLocalHelp(false)}
        isAdmin={isAdmin || isAiStudio}
        stationTimezone={stationTimezone}
        onSaveStationTimezone={saveStationTimezone}
        adminContactInfo={adminContactInfo}
        onSaveAdminContactInfo={saveAdminContactInfo}
        upNextPromoConfig={upNextPromoConfig}
        onSaveUpNextPromoConfig={saveUpNextPromoConfig}
        scheduleWindowConfig={scheduleWindowConfig}
        onSaveScheduleWindowConfig={saveScheduleWindowConfig}
      />
      {showAdminContactPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3"
          onClick={() => setShowAdminContactPopup(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-[260px] p-3.5 text-left space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <HelpCircle className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 truncate">
                  Admin Contact
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminContactPopup(false)}
                className="text-slate-400 hover:text-slate-800 p-0.5 rounded cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-xs font-bold text-slate-800 whitespace-pre-wrap break-words leading-snug">
                {resolvedAdminContact}
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowAdminContactPopup(false)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ExportModal
        isOpen={showExportModal}
        onClose={handleCloseExportModal}
        exportState={exportState}
        windowSize={windowSize}
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
      />

      {/* Schema Version Compatibility Modals */}
      <DataUpgradeRequiredModal
        isOpen={showUpgradeModal}
        onConfirmUpgrade={handleConfirmUpgrade}
        onCancelOrChangeFolder={handleCancelOrChangeFolder}
        folderPath={
          locationMode === "Local"
            ? localPathAmp || localPathCalendar || ""
            : driveFolderDescMap[driveFolderAmp || ""] || driveFolderAmp || ""
        }
        folderName={
          locationMode === "Local"
            ? (localPathAmp || localPathCalendar || "")
                .split(/[/\\]/)
                .filter(Boolean)
                .pop() ||
              localPathAmp ||
              localPathCalendar ||
              "your chosen folder"
            : driveFolderDescMap[driveFolderAmp || ""] ||
              driveFolderAmp ||
              "your chosen folder"
        }
        onOpenFolder={(path) => {
          if (locationMode === "Local") {
            handleOpenExportFolder(path || localPathAmp || localPathCalendar);
          } else if (driveFolderAmp) {
            const folderId = extractFolderId(driveFolderAmp);
            if (folderId) {
              window.open(
                `https://drive.google.com/drive/folders/${folderId}`,
                "_blank",
              );
            }
          }
        }}
        onBrowseFolder={handleCancelOrChangeFolder}
        schemaVersion={compatibilityReport?.schemaVersion || 0}
      />
      <NewerVersionDetectedModal
        isOpen={showNewerVersionModal}
        minVersion={compatibilityReport?.minAppVersion || "0.16.0"}
        onAcknowledge={handleAcknowledgeNewerVersion}
      />

      {/* Performance & CPU Overrides Configuration Modal */}
      <AnimatePresence>
        {isOptimizationConfigOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-yellow-400">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">
                    Performance Overrides
                  </h3>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  Choose which performance optimizations and CPU overrides to
                  apply. These features are surgically designed for radio
                  broadcast hardware to maintain low overhead.
                </p>

                <div className="space-y-2.5">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest leading-none">
                    Select Optimizations to Turn Off/Disable:
                  </p>

                  <div className="space-y-2">
                    {/* CSS Animations */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.cssAnimations}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            cssAnimations: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Strict CSS Keyframes & Animations
                        </p>
                        <p className="text-xs text-slate-400">
                          Stops continuous animate-pulse, animate-spin, and
                          dynamic background animations.
                        </p>
                      </div>
                    </label>

                    {/* Step-Blink Urgency Alerts (0.5s On/Off vs. Smooth Pulse) */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.blinkOnlyUrgency}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            blinkOnlyUrgency: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Step-Blink Urgency Alerts (0.5s On/Off vs. Smooth
                          Pulse)
                        </p>
                        <p className="text-xs text-slate-400">
                          Replaces smooth color-interpolated urgency pulsing
                          with a 0.5s on / 0.5s off step blink (`steps(1, end)`)
                          to eliminate per-frame color transition calculations.
                        </p>
                      </div>
                    </label>

                    {/* CSS Hover Transitions */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverTransitions}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            hoverTransitions: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Purge Hover Transitions
                        </p>
                        <p className="text-xs text-slate-400">
                          Instantly applies colors and layouts upon hover
                          instead of using heavy transition effects.
                        </p>
                      </div>
                    </label>

                    {/* Hover Transforms */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverTransforms}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            hoverTransforms: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Throttle Hover Transforms
                        </p>
                        <p className="text-xs text-slate-400">
                          Suppresses scaling and moving on cursor roll-over to
                          stop continuous layout recalculations.
                        </p>
                      </div>
                    </label>

                    {/* Hover Shadows & Filters */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverShadowsFilters}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            hoverShadowsFilters: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Remove Hover Shadows & Filters
                        </p>
                        <p className="text-xs text-slate-400">
                          Avoids expensive shadow casting and
                          brightness/hue-rotation on list cards.
                        </p>
                      </div>
                    </label>

                    {/* Backdrop Blurs */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.backdropBlurs}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            backdropBlurs: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Disable Backdrop Blurs
                        </p>
                        <p className="text-xs text-slate-400">
                          Forces flat, opaque backgrounds on modals to avoid
                          costly GPU pixel shader blurring.
                        </p>
                      </div>
                    </label>

                    {/* Web Workers */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.webWorkers}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            webWorkers: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Isolate Processing into Web Workers
                        </p>
                        <p className="text-xs text-slate-400">
                          Offloads periodic clock ticks, date calculations, and
                          scheduling timeouts to background threads.
                        </p>
                      </div>
                    </label>

                    {/* Option A: Pointer Events Neutralization */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.pointerEventsNeutralization}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            pointerEventsNeutralization: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Option A: Pointer Events Neutralization
                        </p>
                        <p className="text-xs text-slate-400">
                          Neutralizes pointer-events on background areas to
                          prevent heavy browser mouse movement hit-testing
                          traversal.
                        </p>
                      </div>
                    </label>

                    {/* Option B: GPU Compositing Layering */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.gpuCompositingLayering}
                        onChange={(e) =>
                          setTempOptimizations((prev) => ({
                            ...prev,
                            gpuCompositingLayering: e.target.checked,
                          }))
                        }
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">
                          Option B: GPU Compositing Layering
                        </p>
                        <p className="text-xs text-slate-400">
                          Forces separate GPU compositor layers for lists and
                          buttons to completely isolate repaint boundaries.
                        </p>
                      </div>
                    </label>

                    {/* Note about unutilized options */}
                    <div className="p-3 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-300 space-y-1.5">
                      <p className="text-xs font-bold text-slate-200">
                        ⚠️ Note on CPU Optimizations (Options 1-3)
                      </p>
                      <p className="text-xs leading-relaxed text-slate-400">
                        Intel Mac desktop optimizations (Option 1: Modern
                        Electron runtime, Option 2: Disable Hardware
                        Acceleration, and Option 3: Disable Window Shadows)
                        exist as configurable definitions inside the Electron
                        main process layer (
                        <code className="text-blue-400 font-mono text-xs">
                          electron-main.cjs
                        </code>
                        ). They are currently not active. To experiment with or
                        enable them, you must configure their active flags
                        directly in the source file.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Current State:</span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded font-bold uppercase",
                      animationsDisabled
                        ? "bg-red-950/30 text-red-400 border border-red-500/20"
                        : "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20",
                    )}
                  >
                    {animationsDisabled
                      ? "Optimizations Active (Flat State)"
                      : "Optimizations Inactive (Normal)"}
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOptimizationConfigOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                >
                  Cancel
                </button>
                {animationsDisabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnimationsDisabled(false);
                      localStorage.setItem(
                        "debug_animations_disabled",
                        "false",
                      );
                      setIsOptimizationConfigOpen(false);
                    }}
                    className="px-3.5 py-1.5 bg-red-950/40 text-red-400 hover:bg-red-900/30 text-xs font-bold uppercase rounded border border-red-500/20 transition cursor-pointer active:translate-y-px"
                  >
                    Restore Normal Playback
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveOptimizations(tempOptimizations);
                    localStorage.setItem(
                      "debug_active_optimizations",
                      JSON.stringify(tempOptimizations),
                    );
                    setAnimationsDisabled(true);
                    localStorage.setItem("debug_animations_disabled", "true");
                    setIsOptimizationConfigOpen(false);
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow-md transition cursor-pointer active:translate-y-px"
                >
                  Apply Selected Overrides
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Caching Progress Modal */}
      <AnimatePresence>
        {showCachingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2 text-purple-400">
                  <HardDriveDownload
                    className={`w-5 h-5 ${!cachingProgress.isComplete ? "animate-bounce text-purple-400" : "text-purple-400"}`}
                  />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Caching {cachingTargetMode} Audio Assets
                  </h3>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">
                      {cachingProgress.isComplete
                        ? cachingProgress.failed > 0
                          ? "Caching Completed with Errors"
                          : "Caching Complete!"
                        : cachingProgress.total > 0
                          ? `Caching audio files (${cachingProgress.completed + cachingProgress.failed} / ${cachingProgress.total})`
                          : "Loading & verifying audio assets..."}
                    </span>
                    <span className="text-purple-400 font-mono">
                      {cachingProgress.total > 0
                        ? `${Math.round(((cachingProgress.completed + cachingProgress.failed) / cachingProgress.total) * 100)}%`
                        : "..."}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-200 ${cachingProgress.failed > 0 ? "bg-amber-500" : "bg-purple-500"} ${cachingProgress.total === 0 ? "animate-pulse" : ""}`}
                      style={{
                        width:
                          cachingProgress.total > 0
                            ? `${Math.round(((cachingProgress.completed + cachingProgress.failed) / cachingProgress.total) * 100)}%`
                            : "100%",
                      }}
                    />
                  </div>
                </div>

                {/* 2.b. Errors List if any */}
                {cachingProgress.errors.length > 0 && (
                  <div className="space-y-2 bg-red-950/40 border border-red-800/60 rounded-lg p-3 max-h-36 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {cachingProgress.errors.length} Caching Error
                        {cachingProgress.errors.length > 1 ? "s" : ""} Detected
                      </span>
                    </div>
                    <ul className="space-y-1 text-xs text-red-300/90 font-mono">
                      {cachingProgress.errors.map((err, idx) => (
                        <li
                          key={idx}
                          className="flex flex-col border-b border-red-900/30 pb-1 last:border-b-0"
                        >
                          <span className="font-semibold text-slate-200">
                            {err.fileName}
                          </span>
                          <span className="text-[10px] text-red-400">
                            {err.error}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2">
                {!cachingProgress.isComplete ? (
                  /* 2.a. Allow user to click "View while Caching" to close the in progress view */
                  <button
                    type="button"
                    onClick={() => setShowCachingModal(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    View while Caching
                  </button>
                ) : cachingProgress.failed > 0 ? (
                  /* 2.d. If errors still exist: "View as-is" or "Try Again" */
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCachingModal(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                    >
                      View as-is
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (cachingTargetMode) {
                          triggerCachingForMode(cachingTargetMode);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase rounded shadow transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCachingModal(false)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase rounded shadow transition cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unsaved Changes Navigation Confirmation Modal */}
      <AnimatePresence>
        {showUnsavedChangesNavModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Unsaved Changes
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white leading-snug">
                  Are you sure?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  All unsaved changes will be lost.
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedChangesNavModal(false);
                    pendingNavActionRef.current = null;
                  }}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Return to Editing
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (typeof window.ampDiscardEdits === "function") {
                      window.ampDiscardEdits();
                    }
                    setShowUnsavedChangesNavModal(false);
                    const nextAction = pendingNavActionRef.current;
                    pendingNavActionRef.current = null;
                    if (nextAction) {
                      if (
                        typeof window.ampIsAudioPlaying === "function" &&
                        window.ampIsAudioPlaying()
                      ) {
                        pendingNavActionRef.current = nextAction;
                        setShowAudioPlayingNavModal(true);
                      } else {
                        nextAction();
                      }
                    }
                  }}
                  className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider rounded-xl border border-amber-500 shadow-md transition cursor-pointer"
                >
                  Go Ahead Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audio Playing Navigation Confirmation Modal */}
      <AnimatePresence>
        {showAudioPlayingNavModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-400">
                <Square className="w-4 h-4 fill-current" />
                <span className="text-xs font-black uppercase tracking-wider text-purple-300">
                  Stop?
                </span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Audio is currently playing. Do you want to stop playback
                  before switching views, or leave it playing?
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window.ampStopAllAudio === "function") {
                      window.ampStopAllAudio();
                    }
                    setShowAudioPlayingNavModal(false);
                    if (pendingNavActionRef.current) {
                      pendingNavActionRef.current();
                      pendingNavActionRef.current = null;
                    }
                  }}
                  className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-xl border border-purple-500 shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop and Switch</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAudioPlayingNavModal(false);
                    pendingNavActionRef.current = null;
                  }}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Stay and Play
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sleep Mode Overlay Modal */}
      <AnimatePresence>
        {isAsleep && (
          <div
            onClick={handleWakeUp}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Moon className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-sans font-medium">
                Shhh... AMP is sleeping.
              </p>
              <button
                type="button"
                onClick={handleWakeUp}
                className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider rounded-xl border border-blue-500 shadow-md transition cursor-pointer flex items-center justify-center gap-2 "
              >
                <AlarmClock className="w-4 h-4 shrink-0" />
                <span>Wakey Wakey!</span>
                <AlarmClock className="w-4 h-4 shrink-0" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global In-Flight Save Indicator / Guard (Hybrid Approach) */}
      <AnimatePresence>
        {isSaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-950/40 select-none",
              !animationsDisabled && "backdrop-blur-[2px]",
            )}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="flex items-center gap-3.5 px-6 py-4 bg-slate-900/95 text-white rounded-xl shadow-2xl border border-slate-700/80"
            >
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  {savingLabel || "Saving..."}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Writing and syncing data...
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Recovery Modal */}
      <SaveRecoveryModal
        recoveryInfo={saveRecoveryModal}
        onClose={() => setSaveRecoveryModal(null)}
      />
    </>
  );
};
