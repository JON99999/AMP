import React, { useState, useEffect } from "react";
import { Announcement } from "../types";
import { getAllRequiredMp3Urls } from "../lib/utils";
import {
  getAccessToken,
  updateAudioCache,
  updateAudioCacheWithProgress,
  getPlayableUrl,
} from "../lib/driveService";
import {
  CachingProgressReport,
  mp3BlobCache,
  availableFilesCache,
} from "../lib/audioCache";

export interface UseAudioCacheControllerOptions {
  announcements: Announcement[];
  driveMP3s: any[];
  token: string | null;
  isDriveValidated: boolean;
  localPathsUnavailable: boolean;
  locationMode: "Local" | "Drive" | "Demo";
  isStartupReady: boolean;
  activeTab: "player" | "calendar" | "log" | "live_dev";
  playMode: "Live" | "Prerecord" | "Playlist";
  setScrollTrigger: React.Dispatch<React.SetStateAction<number>>;
}

export function useAudioCacheController({
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
}: UseAudioCacheControllerOptions) {
  const [showCachingModal, setShowCachingModal] = useState(false);
  const [cachingTargetMode, setCachingTargetMode] = useState<
    "Live" | "Prerecord" | "Playlist" | null
  >(null);
  const [currentPlaylistTrackUrls, setCurrentPlaylistTrackUrls] = useState<
    string[]
  >([]);
  const [cachingProgress, setCachingProgress] = useState<CachingProgressReport>({
    total: 0,
    completed: 0,
    failed: 0,
    errors: [],
    isComplete: false,
  });

  const triggerCachingForMode = async (
    targetMode: "Live" | "Prerecord" | "Playlist",
    additionalUrls?: string[],
  ) => {
    if (additionalUrls) {
      setCurrentPlaylistTrackUrls(additionalUrls);
    }

    const announcementUrls = getAllRequiredMp3Urls(announcements);

    const playlistUrls =
      additionalUrls !== undefined ? additionalUrls : currentPlaylistTrackUrls;

    let activeUrls: string[] = [];
    if (
      targetMode === "Playlist" ||
      targetMode === "Prerecord" ||
      (playlistUrls && playlistUrls.length > 0)
    ) {
      activeUrls = Array.from(new Set([...announcementUrls, ...playlistUrls]));
    } else {
      activeUrls = Array.from(new Set(announcementUrls));
    }

    activeUrls = activeUrls.filter(Boolean);

    setCachingTargetMode(targetMode);

    // If additionalUrls has not been supplied yet for dynamic modes ("Playlist", "Prerecord"),
    // PlayerTab is still fetching tracks asynchronously from Drive. Keep modal open & background blurred.
    if (
      additionalUrls === undefined &&
      (targetMode === "Playlist" || targetMode === "Prerecord")
    ) {
      setShowCachingModal(true);
      setCachingProgress({
        total: 0,
        completed: 0,
        failed: 0,
        errors: [],
        isComplete: false,
      });
      return;
    }

    // Check which active URLs are not cached yet
    const uncachedUrls = activeUrls.filter((url) => {
      const fileInCache = availableFilesCache.get(url);
      const resolvedUrl = fileInCache ? fileInCache.path : url;
      return (
        !mp3BlobCache.has(resolvedUrl) &&
        !mp3BlobCache.has(url) &&
        !getPlayableUrl(url).startsWith("blob:")
      );
    });

    if (uncachedUrls.length === 0) {
      // If no caching is needed, close the modal ASAP
      setShowCachingModal(false);
      return;
    }

    // Uncached files exist -> show caching modal with background blurred immediately
    setShowCachingModal(true);
    setCachingProgress({
      total: activeUrls.length,
      completed: activeUrls.length - uncachedUrls.length,
      failed: 0,
      errors: [],
      isComplete: false,
    });

    const report = await updateAudioCacheWithProgress(
      activeUrls,
      getAccessToken() || token,
      (currentReport) => {
        setCachingProgress(currentReport);
      },
    );

    if (report.isComplete) {
      if (report.failed === 0) {
        // Close card ASAP (no delay)
        setShowCachingModal(false);
      }
    }
  };

  // Pre-render Cache Synchronization Logic (8.c: All caching happens before rendering Player view unless user clicks "View while Caching")
  useEffect(() => {
    const syncCache = async () => {
      if (
        !isDriveValidated ||
        localPathsUnavailable ||
        (locationMode === "Local" && !isStartupReady)
      ) {
        return;
      }
      // Find all MP3 files used in active announcements and loaded playlist tracks
      const announcementUrls = getAllRequiredMp3Urls(announcements);

      const activeUrls = Array.from(
        new Set([...announcementUrls, ...currentPlaylistTrackUrls]),
      ).filter(Boolean);
      const uncachedUrls = activeUrls.filter((url) => {
        const fileInCache = availableFilesCache.get(url);
        const resolvedUrl = fileInCache ? fileInCache.path : url;
        return (
          !mp3BlobCache.has(resolvedUrl) &&
          !mp3BlobCache.has(url) &&
          !getPlayableUrl(url).startsWith("blob:")
        );
      });

      if (uncachedUrls.length === 0) {
        if (showCachingModal && cachingTargetMode === "Prerecord") {
          setShowCachingModal(false);
        }
        return;
      }

      if (activeTab === "player") {
        await triggerCachingForMode(playMode, currentPlaylistTrackUrls);
        setScrollTrigger((prev) => prev + 1);
        return;
      }

      try {
        await updateAudioCache(activeUrls, getAccessToken() || token);
        // Force-refresh status representation to trigger card border transitions
        setScrollTrigger((prev) => prev + 1);
      } catch (err) {
        console.error("Failed to sync audio cache:", err);
      }
    };

    if (announcements.length > 0 || currentPlaylistTrackUrls.length > 0) {
      syncCache();
    }
  }, [
    announcements,
    driveMP3s,
    currentPlaylistTrackUrls,
    token,
    isDriveValidated,
    localPathsUnavailable,
    isStartupReady,
    activeTab,
  ]);

  return {
    showCachingModal,
    setShowCachingModal,
    cachingTargetMode,
    setCachingTargetMode,
    currentPlaylistTrackUrls,
    setCurrentPlaylistTrackUrls,
    cachingProgress,
    setCachingProgress,
    triggerCachingForMode,
  };
}
