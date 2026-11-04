import { useState, useRef, useEffect, useCallback } from 'react';
import { getPlayableUrl, cacheMP3, getAccessToken, mp3BlobCache, availableFilesCache } from '../lib/driveService';

export interface PlayingState {
  currentTime: number;
  duration: number;
}

export interface UseAudioEngineResult {
  playingStates: Record<string, PlayingState>;
  playAudio: (
    key: string,
    url: string,
    onEnded?: () => void,
    onError?: (err: any) => void
  ) => Promise<HTMLAudioElement | null>;
  stopAudio: (key: string) => void;
  stopAllAudios: () => void;
  isAudioPlaying: (key?: string) => boolean;
  getAudioElement: (key: string) => HTMLAudioElement | undefined;
}

export function useAudioEngine(): UseAudioEngineResult {
  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingStates, setPlayingStates] = useState<Record<string, PlayingState>>({});

  const stopAudio = useCallback((key: string) => {
    const audio = playingAudiosRef.current.get(key);
    playingAudiosRef.current.delete(key);
    setPlayingStates(prev => {
      if (!(key in prev)) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    if (audio) {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    }
  }, []);

  const stopAllAudios = useCallback(() => {
    const audios: HTMLAudioElement[] = Array.from(playingAudiosRef.current.values());
    playingAudiosRef.current.clear();
    setPlayingStates({});
    for (const audio of audios) {
      try {
        audio.pause();
        audio.src = '';
      } catch (e) {
        console.warn('Error stopping audio:', e);
      }
    }
  }, []);

  const playAudio = useCallback(async (
    key: string,
    url: string,
    onEnded?: () => void,
    onError?: (err: any) => void
  ): Promise<HTMLAudioElement | null> => {
    // If already playing this key, stop it first
    if (playingAudiosRef.current.has(key)) {
      stopAudio(key);
    }

    let playableUrl = getPlayableUrl(url);
    if (!playableUrl) {
      if (onError) onError(new Error('Invalid or unplayable URL'));
      return null;
    }

    // If a Google Drive URL is not yet in mp3BlobCache, fetch and cache it first for reliable HTMLAudioElement playback
    const fileInCache = availableFilesCache.get(url);
    const resolvedPath = fileInCache ? fileInCache.path : url;
    if (
      playableUrl.includes('googleapis.com') &&
      !playableUrl.startsWith('blob:') &&
      !mp3BlobCache.has(url) &&
      !mp3BlobCache.has(resolvedPath)
    ) {
      try {
        const cachedBlobUrl = await cacheMP3(url, getAccessToken() || '');
        if (cachedBlobUrl) {
          playableUrl = cachedBlobUrl;
        }
      } catch (_) {}
    }

    const audio = new Audio(playableUrl);

    const updateProgress = () => {
      if (audio.ended || audio.paused || playingAudiosRef.current.get(key) !== audio) {
        return;
      }
      setPlayingStates(prev => ({
        ...prev,
        [key]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));
    };

    const cleanupListeners = () => {
      audio.removeEventListener('loadedmetadata', updateProgress);
      audio.removeEventListener('timeupdate', updateProgress);
    };

    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('ended', () => {
      cleanupListeners();
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onEnded) onEnded();
    }, { once: true });

    audio.addEventListener('error', (err) => {
      cleanupListeners();
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onError) onError(err);
    }, { once: true });

    try {
      playingAudiosRef.current.set(key, audio);
      await audio.play();
      if (!audio.ended && playingAudiosRef.current.get(key) === audio) {
        setPlayingStates(prev => ({
          ...prev,
          [key]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
        }));
      }
      return audio;
    } catch (err) {
      cleanupListeners();
      playingAudiosRef.current.delete(key);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      if (onError) onError(err);
      throw err;
    }
  }, [stopAudio]);

  const isAudioPlaying = useCallback((key?: string): boolean => {
    if (key) {
      const audio = playingAudiosRef.current.get(key);
      return !!(audio && !audio.paused);
    }
    return playingAudiosRef.current.size > 0;
  }, []);

  const getAudioElement = useCallback((key: string) => {
    return playingAudiosRef.current.get(key);
  }, []);

  // Global window listeners for electron/navigation safety
  useEffect(() => {
    (window as any).ampIsAudioPlaying = () => isAudioPlaying();
    (window as any).ampStopAllAudio = () => stopAllAudios();

    return () => {
      delete (window as any).ampIsAudioPlaying;
      delete (window as any).ampStopAllAudio;
    };
  }, [isAudioPlaying, stopAllAudios]);

  // Clean up all audios on component unmount
  useEffect(() => {
    return () => {
      stopAllAudios();
    };
  }, [stopAllAudios]);

  return {
    playingStates,
    playAudio,
    stopAudio,
    stopAllAudios,
    isAudioPlaying,
    getAudioElement,
  };
}
