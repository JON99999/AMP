import React, { useState, useEffect } from "react";
import { Show } from "../types";
import {
  getAccessToken,
  getStorageApiHeaders,
  verifyGoogleDriveDetails,
  getSavedSettings,
  saveSettings,
} from "../lib/driveService";

export interface UseLocationsControllerOptions {
  token: string | null;
  shows: Show[];
  verifyStartup: (settings?: any) => Promise<{ ready: boolean }>;
  fetchDataForMode: (settings?: any, options?: { force?: boolean }) => Promise<void>;
  setIsDriveActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDriveValidated: React.Dispatch<React.SetStateAction<boolean>>;
  setIsValidatingDrive: React.Dispatch<React.SetStateAction<boolean>>;
  setDriveValidationError: React.Dispatch<React.SetStateAction<string | null>>;
  hasBackedUpThisSessionRef: React.MutableRefObject<boolean>;
  customFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export function useLocationsController({
  token,
  shows,
  verifyStartup,
  fetchDataForMode,
  setIsDriveActive,
  setIsDriveValidated,
  setIsValidatingDrive,
  setDriveValidationError,
  hasBackedUpThisSessionRef,
  customFetch: fetch,
}: UseLocationsControllerOptions) {
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [locationMode, setLocationMode] = useState<"Local" | "Drive" | "Demo">(
    "Demo",
  );

  const [localPathAmp, setLocalPathAmp] = useState("");
  const [localPathMP3s, setLocalPathMP3s] = useState("");
  const [localPathMediaAnnouncements, setLocalPathMediaAnnouncements] =
    useState("");
  const [localPathMediaEvergreens, setLocalPathMediaEvergreens] = useState("");
  const [localPathMediaShows, setLocalPathMediaShows] = useState("");
  const [localPathLogs, setLocalPathLogs] = useState("");
  const [localPathCalendar, setLocalPathCalendar] = useState("");

  const [driveFolderAmp, setDriveFolderAmp] = useState("");
  const [driveFolderLogs, setDriveFolderLogs] = useState("");
  const [driveFolderMP3s, setDriveFolderMP3s] = useState("");
  const [driveFolderAnnouncements, setDriveFolderAnnouncements] = useState("");
  const [driveFolderEvergreens, setDriveFolderEvergreens] = useState("");
  const [driveFolderShows, setDriveFolderShows] = useState("");
  const [driveFolderPreferences, setDriveFolderPreferences] = useState("");

  // Draft States for Folder Configuration Form inputs
  const [draftLocalPathAmp, setDraftLocalPathAmp] = useState("");
  const [draftLocalPathMP3s, setDraftLocalPathMP3s] = useState("");
  const [
    draftLocalPathMediaAnnouncements,
    setDraftLocalPathMediaAnnouncements,
  ] = useState("");
  const [draftLocalPathMediaEvergreens, setDraftLocalPathMediaEvergreens] =
    useState("");
  const [draftLocalPathMediaShows, setDraftLocalPathMediaShows] = useState("");
  const [draftLocalPathLogs, setDraftLocalPathLogs] = useState("");
  const [draftLocalPathCalendar, setDraftLocalPathCalendar] = useState("");

  const [draftDriveFolderAmp, setDraftDriveFolderAmp] = useState("");
  const [draftDriveFolderLogs, setDraftDriveFolderLogs] = useState("");
  const [draftDriveFolderMP3s, setDraftDriveFolderMP3s] = useState("");
  const [draftDriveFolderAnnouncements, setDraftDriveFolderAnnouncements] =
    useState("");
  const [draftDriveFolderEvergreens, setDraftDriveFolderEvergreens] =
    useState("");
  const [draftDriveFolderShows, setDraftDriveFolderShows] = useState("");
  const [draftDriveFolderPreferences, setDraftDriveFolderPreferences] =
    useState("");

  const [localPathsUnavailable, setLocalPathsUnavailable] = useState(false);
  const [announcementsReadOnlyError, setAnnouncementsReadOnlyError] = useState<
    string | null
  >(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationsSuccess, setLocationsSuccess] = useState<string | null>(null);
  const [isSavingAndVerifying, setIsSavingAndVerifying] = useState(false);

  // Google Drive folder descriptors and edit fields
  const [driveFolderDescMap, setDriveFolderDescMap] = useState<
    Record<string, string>
  >({
    "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED": "calendar",
    "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch": "medialibrary",
    "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx": "logs",
  });
  const [editingDriveField, setEditingDriveField] = useState<
    | "amp"
    | "preferences"
    | "mp3s"
    | "announcements"
    | "evergreens"
    | "shows"
    | "logs"
    | null
  >(null);
  const [tempPasteLink, setTempPasteLink] = useState("");

  // Fetch folder name/descriptor helper
  const fetchDriveFolderDescriptor = async (
    folderId: string,
    currentToken: string | null,
  ): Promise<string> => {
    if (!folderId) return "Not Configured";
    let defaultName = "";
    if (folderId === "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED")
      defaultName = "calendar";
    else if (folderId === "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch")
      defaultName = "medialibrary";
    else if (folderId === "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx")
      defaultName = "logs";

    if (!currentToken)
      return (
        defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`
      );
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,owners(displayName,emailAddress)&supportsAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        const folderName = data.name || defaultName || "Unnamed Folder";
        const ownerName = data.owners?.[0]?.displayName || "";
        const ownerEmail = data.owners?.[0]?.emailAddress || "";
        const ownerStr =
          ownerName && ownerEmail
            ? ` (${ownerName}, ${ownerEmail})`
            : ownerName
              ? ` (${ownerName})`
              : ownerEmail
                ? ` (${ownerEmail})`
                : "";
        return `${folderName}${ownerStr}`;
      }
    } catch (e) {
      console.warn("Failed to fetch name for drive folder ID:", folderId, e);
    }
    return (
      defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`
    );
  };

  // Sync map descriptors for drive folders when authenticated
  useEffect(() => {
    const fetchNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        driveFolderAmp,
        driveFolderPreferences,
        driveFolderMP3s,
        driveFolderAnnouncements,
        driveFolderEvergreens,
        driveFolderShows,
        driveFolderLogs,
        ...(locationMode === "Demo"
          ? [
              "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED",
              "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch",
              "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx",
            ]
          : []),
      ].filter(
        (id) =>
          id &&
          (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes("(")),
      );

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchNames();
  }, [
    token,
    driveFolderAmp,
    driveFolderPreferences,
    driveFolderMP3s,
    driveFolderAnnouncements,
    driveFolderEvergreens,
    driveFolderShows,
    driveFolderLogs,
  ]);

  // Sync map descriptors for draft states as well
  useEffect(() => {
    const fetchDraftNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        draftDriveFolderAmp,
        draftDriveFolderPreferences,
        draftDriveFolderMP3s,
        draftDriveFolderAnnouncements,
        draftDriveFolderEvergreens,
        draftDriveFolderShows,
        draftDriveFolderLogs,
        ...(locationMode === "Demo"
          ? [
              "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED",
              "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch",
              "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx",
            ]
          : []),
      ].filter(
        (id) =>
          id &&
          (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes("(")),
      );

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchDraftNames();
  }, [
    token,
    draftDriveFolderAmp,
    draftDriveFolderPreferences,
    draftDriveFolderMP3s,
    draftDriveFolderAnnouncements,
    draftDriveFolderEvergreens,
    draftDriveFolderShows,
    draftDriveFolderLogs,
  ]);

  const checkLocalPathsSafely = async (
    amp: string,
    mp3s: string,
    logs: string,
    calendar: string,
    createMissing: boolean = false,
  ): Promise<boolean> => {
    try {
      const gate = await verifyStartup({
        localPathAmp: amp,
        localPathMP3s: mp3s,
        localPathLogs: logs,
        localPathCalendar: calendar,
        localPathMediaAnnouncements: draftLocalPathMediaAnnouncements,
        localPathMediaEvergreens: draftLocalPathMediaEvergreens,
        localPathMediaShows: draftLocalPathMediaShows,
        createMissing,
        mode: "Local",
      });
      return !!gate.ready;
    } catch {
      return false;
    }
  };

  // Synchronization hook to update editable drafts when location settings modal opens
  useEffect(() => {
    if (showLocationsModal) {
      setDraftLocalPathAmp(localPathAmp || "");
      setDraftLocalPathMP3s(localPathMP3s || localPathMediaAnnouncements || "");
      setDraftLocalPathMediaAnnouncements(
        localPathMediaAnnouncements || localPathMP3s || "",
      );
      setDraftLocalPathMediaEvergreens(localPathMediaEvergreens || "");
      setDraftLocalPathMediaShows(localPathMediaShows || "");
      setDraftLocalPathLogs(localPathLogs || "");
      setDraftLocalPathCalendar(localPathCalendar || "");
      setDraftDriveFolderAmp(driveFolderAmp || "");
      setDraftDriveFolderLogs(driveFolderLogs || "");
      setDraftDriveFolderMP3s(
        driveFolderMP3s || driveFolderAnnouncements || "",
      );
      setDraftDriveFolderAnnouncements(
        driveFolderAnnouncements || driveFolderMP3s || "",
      );
      setDraftDriveFolderEvergreens(driveFolderEvergreens || "");
      setDraftDriveFolderShows(driveFolderShows || "");
      setDraftDriveFolderPreferences(driveFolderPreferences || "");
    }
  }, [
    showLocationsModal,
    localPathAmp,
    localPathMP3s,
    localPathMediaAnnouncements,
    localPathMediaEvergreens,
    localPathMediaShows,
    localPathLogs,
    localPathCalendar,
    driveFolderAmp,
    driveFolderLogs,
    driveFolderMP3s,
    driveFolderAnnouncements,
    driveFolderEvergreens,
    driveFolderShows,
    driveFolderPreferences,
  ]);

  const handleBrowseNative = async (
    targetField:
      | "amp"
      | "calendar"
      | "mp3s"
      | "announcements"
      | "evergreens"
      | "shows"
      | "logs",
  ): Promise<string | null> => {
    try {
      let defaultPath: string | undefined;
      if (targetField === "amp")
        defaultPath = draftLocalPathAmp || localPathAmp;
      else if (targetField === "calendar")
        defaultPath = draftLocalPathCalendar || localPathCalendar;
      else if (targetField === "mp3s" || targetField === "announcements")
        defaultPath =
          draftLocalPathMediaAnnouncements ||
          draftLocalPathMP3s ||
          localPathMediaAnnouncements ||
          localPathMP3s;
      else if (targetField === "evergreens")
        defaultPath = draftLocalPathMediaEvergreens || localPathMediaEvergreens;
      else if (targetField === "shows")
        defaultPath = draftLocalPathMediaShows || localPathMediaShows;
      else if (targetField === "logs")
        defaultPath = draftLocalPathLogs || localPathLogs;

      // Primary desktop IPC bridge path (asynchronous & non-blocking)
      if (
        window.electronAPI &&
        window.electronAPI.browseFolder
      ) {
        const data = await window.electronAPI.browseFolder(
          defaultPath,
        );
        if (data && data.success && data.path) {
          if (targetField === "amp") setDraftLocalPathAmp(data.path);
          else if (targetField === "calendar")
            setDraftLocalPathCalendar(data.path);
          else if (targetField === "mp3s" || targetField === "announcements") {
            setDraftLocalPathMediaAnnouncements(data.path);
            setDraftLocalPathMP3s(data.path);
          } else if (targetField === "evergreens")
            setDraftLocalPathMediaEvergreens(data.path);
          else if (targetField === "shows")
            setDraftLocalPathMediaShows(data.path);
          else if (targetField === "logs") setDraftLocalPathLogs(data.path);
          return data.path;
        } else if (data && data.cancelled) {
          return null;
        } else if (data && data.error) {
          alert(data.error);
          return null;
        }
      }

      // Backend HTTP fallback
      const res = await fetch("/api/browse-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultPath }),
      });
      const data = await res.json();
      if (data.success && data.path) {
        if (targetField === "amp") setDraftLocalPathAmp(data.path);
        else if (targetField === "calendar")
          setDraftLocalPathCalendar(data.path);
        else if (targetField === "mp3s" || targetField === "announcements") {
          setDraftLocalPathMediaAnnouncements(data.path);
          setDraftLocalPathMP3s(data.path);
        } else if (targetField === "evergreens")
          setDraftLocalPathMediaEvergreens(data.path);
        else if (targetField === "shows")
          setDraftLocalPathMediaShows(data.path);
        else if (targetField === "logs") setDraftLocalPathLogs(data.path);
        return data.path;
      } else if (data.error) {
        alert(data.error);
        return null;
      }
      return null;
    } catch (err: any) {
      alert(err.message || "Failed to open folder selection window.");
      return null;
    }
  };

  const handleOpenLocalPath = async (dirPath: string) => {
    if (!dirPath) return;

    try {
      // Primary desktop IPC bridge path
      if (window.electronAPI && window.electronAPI.openPath) {
        const ipcRes = await window.electronAPI.openPath(dirPath);
        if (ipcRes && ipcRes.success) return;
      }

      // Backend HTTP fallback
      const res = await fetch("/api/open-local-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn(
          "Could not open folder natively:",
          err.error || "Server error",
        );
      }
    } catch (e) {
      console.warn("Network error opening local folder:", e);
    }
  };

  const handleOpenDriveFolder = async (folderId: string) => {
    if (!folderId) return;
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(url, "_blank");
  };

  const handleSaveLocations = async (
    e?: React.FormEvent,
    options?: { createMissing?: boolean },
  ) => {
    if (e && e.preventDefault) e.preventDefault();
    setLocationsError(null);
    setLocationsSuccess(null);
    setIsSavingAndVerifying(true);
    try {
      const current = getSavedSettings();
      let updatedSettings = { ...current, mode: locationMode };

      if (locationMode === "Local") {
        const announcementsPath =
          draftLocalPathMediaAnnouncements || draftLocalPathMP3s;
        updatedSettings = {
          ...updatedSettings,
          localPathAmp: draftLocalPathAmp,
          localPathMP3s: announcementsPath,
          localPathLogs: draftLocalPathLogs,
          localPathCalendar: draftLocalPathCalendar,
          paths: {
            settings: draftLocalPathCalendar || null,
            media_announcements: announcementsPath || null,
            media_evergreens: draftLocalPathMediaEvergreens || null,
            media_shows: draftLocalPathMediaShows || null,
            logs: draftLocalPathLogs || null,
          },
        };
      } else if (locationMode === "Drive") {
        const announcementsFolder =
          draftDriveFolderAnnouncements || draftDriveFolderMP3s;
        updatedSettings = {
          ...updatedSettings,
          driveFolderAmp: draftDriveFolderAmp,
          driveFolderLogs: draftDriveFolderLogs,
          driveFolderMP3s: announcementsFolder,
          driveFolderAnnouncements: announcementsFolder,
          driveFolderEvergreens: draftDriveFolderEvergreens,
          driveFolderShows: draftDriveFolderShows,
          driveFolderPreferences: draftDriveFolderPreferences,
        };
      }

      // Detect mode or log/schedule folder mapping changes to reset backup flag
      const modeChanged = current.mode !== updatedSettings.mode;
      const announcementsChanged =
        updatedSettings.mode === "Local"
          ? current.localPathAmp !== updatedSettings.localPathAmp ||
            current.localPathCalendar !== updatedSettings.localPathCalendar
          : updatedSettings.mode === "Drive"
            ? current.driveFolderAmp !== updatedSettings.driveFolderAmp ||
              current.driveFolderPreferences !==
                updatedSettings.driveFolderPreferences
            : false;
      const logsChanged =
        updatedSettings.mode === "Local"
          ? current.localPathAmp !== updatedSettings.localPathAmp ||
            current.localPathLogs !== updatedSettings.localPathLogs
          : updatedSettings.mode === "Drive"
            ? current.driveFolderAmp !== updatedSettings.driveFolderAmp ||
              current.driveFolderLogs !== updatedSettings.driveFolderLogs
            : false;

      if (modeChanged || announcementsChanged || logsChanged) {
        console.log(
          "Resetting backup flag due to updated folder mode or mapping",
        );
        hasBackedUpThisSessionRef.current = false;
      }

      // Save locally (localStorage)
      saveSettings(updatedSettings);

      // Save variables to main state
      if (locationMode === "Local") {
        const announcementsPath =
          draftLocalPathMediaAnnouncements || draftLocalPathMP3s;
        setLocalPathAmp(draftLocalPathAmp);
        setLocalPathMP3s(announcementsPath);
        setLocalPathMediaAnnouncements(announcementsPath);
        setLocalPathMediaEvergreens(draftLocalPathMediaEvergreens);
        setLocalPathMediaShows(draftLocalPathMediaShows);
        setLocalPathLogs(draftLocalPathLogs);
        setLocalPathCalendar(draftLocalPathCalendar);
      } else if (locationMode === "Drive") {
        setDriveFolderAmp(draftDriveFolderAmp);
        setDriveFolderLogs(draftDriveFolderLogs);
        const announcementsFolder =
          draftDriveFolderAnnouncements || draftDriveFolderMP3s;
        setDriveFolderMP3s(announcementsFolder);
        setDriveFolderAnnouncements(announcementsFolder);
        setDriveFolderEvergreens(draftDriveFolderEvergreens);
        setDriveFolderShows(draftDriveFolderShows);
        setDriveFolderPreferences(draftDriveFolderPreferences);
      }

      // Notify server
      const settingsRes = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updatedSettings,
          createMissing: options?.createMissing === true,
        }),
      }).catch(() => null);
      if (settingsRes && !settingsRes.ok) {
        const errData = await settingsRes.json().catch(() => ({}));
        console.warn("Settings write warning:", errData);
      }

      // For Local mode, run the verify API on back-end
      if (locationMode === "Local") {
        const createMissing = options?.createMissing === true;
        const exists = await checkLocalPathsSafely(
          draftLocalPathAmp,
          draftLocalPathMediaAnnouncements || draftLocalPathMP3s,
          draftLocalPathLogs,
          draftLocalPathCalendar,
          createMissing,
        );

        setIsDriveActive(false);
        setIsDriveValidated(exists);
        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings, { force: true });
        if (typeof window !== "undefined") {
          (window as any).__ampLastLocationsSaveAt = Date.now();
        }
        setLocationsSuccess("Local storage configurations updated.");
      } else if (locationMode === "Drive") {
        setIsValidatingDrive(true);
        // Is there any folder setting change?
        const hasFolderChanges =
          draftDriveFolderAmp !== driveFolderAmp ||
          draftDriveFolderLogs !== driveFolderLogs ||
          draftDriveFolderMP3s !== driveFolderMP3s ||
          draftDriveFolderAnnouncements !== driveFolderAnnouncements ||
          draftDriveFolderEvergreens !== driveFolderEvergreens ||
          draftDriveFolderShows !== driveFolderShows ||
          draftDriveFolderPreferences !== driveFolderPreferences;

        let success = true;
        if (hasFolderChanges) {
          const currentToken = getAccessToken() || token;
          if (!currentToken) {
            success = false;
            setLocationsError(
              "Authentication is required when changing Google Drive folder settings. Please connect your Google account below.",
            );
          }
        }

        if (success) {
          const currentToken = getAccessToken() || token;
          if (options?.createMissing === true) {
            try {
              const createHeaders = await getStorageApiHeaders();
              await fetch("/api/shows/verify-evergreens", {
                method: "POST",
                headers: createHeaders,
                body: JSON.stringify({ shows }),
              });
            } catch (createErr) {
              console.warn("Drive folder auto-creation warning:", createErr);
            }
          }
          const validationResult = await verifyGoogleDriveDetails(
            updatedSettings,
            currentToken,
          );
          if (validationResult.valid) {
            setIsDriveValidated(true);
            setDriveValidationError(null);
            await fetchDataForMode(updatedSettings, { force: true });
            if (typeof window !== "undefined") {
              (window as any).__ampLastLocationsSaveAt = Date.now();
            }
            setLocationsSuccess(
              "Google Drive directory IDs updated and validated.",
            );
          } else {
            setIsDriveValidated(false);
            const err =
              validationResult.errorMessage ||
              "Associated account does not have authorization/access on newly specified directory folder IDs.";
            setDriveValidationError(err);
            setLocationsError(err);
          }
        }
        setIsValidatingDrive(false);
      } else if (locationMode === "Demo") {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings, { force: true });
        if (typeof window !== "undefined") {
          (window as any).__ampLastLocationsSaveAt = Date.now();
        }
        setLocationsSuccess("Workspace mode switched to Demo.");
      }

      setTimeout(() => {
        setLocationsSuccess(null);
        setShowLocationsModal(false);
        setIsSavingAndVerifying(false);
      }, 1500);
    } catch (err: any) {
      setLocationsError(err.message || "Failed to save configure locations.");
      setIsSavingAndVerifying(false);
    }
  };

  const handleSelectMode = async (mode: "Local" | "Drive" | "Demo") => {
    try {
      const current = getSavedSettings();
      if (current.mode !== mode) {
        console.log(`Resetting backup flag: Mode changed to ${mode}`);
        hasBackedUpThisSessionRef.current = false;
      }
      const updatedSettings = {
        ...current,
        mode,
      };
      saveSettings(updatedSettings);
      setLocationMode(mode);

      // Notify backend
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      }).catch(() => {});

      if (mode === "Local") {
        const exists = await checkLocalPathsSafely(
          updatedSettings.localPathAmp || "",
          updatedSettings.localPathMP3s || "",
          updatedSettings.localPathLogs || "",
          updatedSettings.localPathCalendar || "",
        );

        setIsDriveActive(false);
        setIsDriveValidated(exists);
        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings, { force: true });

        // Open location selector for Local Mode
        setShowLocationsModal(true);
      } else if (mode === "Drive") {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings, { force: true });

        // Open location selector for Drive Mode
        setShowLocationsModal(true);
      } else if (mode === "Demo") {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings, { force: true });
      }
    } catch (err) {
      console.error("Failed to select mode:", err);
    }
  };

  return {
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
    setLocationsError,
    locationsSuccess,
    setLocationsSuccess,
    isSavingAndVerifying,
    setIsSavingAndVerifying,
    driveFolderDescMap,
    setDriveFolderDescMap,
    editingDriveField,
    setEditingDriveField,
    tempPasteLink,
    setTempPasteLink,
    fetchDriveFolderDescriptor,
    checkLocalPathsSafely,
    handleBrowseNative,
    handleOpenLocalPath,
    handleOpenDriveFolder,
    handleSaveLocations,
    handleSelectMode,
  };
}
