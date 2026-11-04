import React, { useState, useEffect, useRef } from 'react';
import {
  RadioTower,
  Clock,
  Play,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Square,
  Volume2,
  FileText,
  X,
  Plus,
  Minus,
  Sliders,
  Folder,
  Sun,
  Moon,
  Laptop,
  HelpCircle,
  Trash2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { WaveformVisualizer } from './WaveformVisualizer';
import { mp3WaveformCache } from '../lib/driveService';
import LiveReadPopout from './LiveReadPopout';

// Seed realistic broadcast audio cart waveform peaks (60-point normalized audio profiles)
const REALISTIC_BROADCAST_WAVEFORMS: Record<string, number[]> = {
  'mock-live-mp3-played': [
    0.35, 0.42, 0.78, 0.65, 0.92, 0.85, 0.40, 0.22, 0.55, 0.88,
    0.95, 0.70, 0.45, 0.30, 0.68, 0.90, 0.82, 0.75, 0.50, 0.20,
    0.62, 0.84, 0.91, 0.78, 0.60, 0.35, 0.72, 0.96, 0.88, 0.65,
    0.40, 0.25, 0.58, 0.85, 0.92, 0.74, 0.50, 0.32, 0.65, 0.89,
    0.94, 0.80, 0.55, 0.28, 0.70, 0.92, 0.86, 0.68, 0.42, 0.20,
    0.50, 0.75, 0.82, 0.65, 0.48, 0.35, 0.25, 0.18, 0.15, 0.15
  ],
  'mock-live-mp3-due-now': [
    0.20, 0.55, 0.82, 0.90, 0.65, 0.38, 0.22, 0.60, 0.88, 0.95,
    0.72, 0.45, 0.25, 0.68, 0.92, 0.85, 0.58, 0.30, 0.74, 0.98,
    0.86, 0.62, 0.40, 0.20, 0.52, 0.80, 0.92, 0.75, 0.48, 0.28,
    0.65, 0.90, 0.84, 0.60, 0.35, 0.70, 0.95, 0.88, 0.65, 0.42,
    0.22, 0.58, 0.85, 0.92, 0.70, 0.45, 0.28, 0.62, 0.88, 0.80,
    0.55, 0.32, 0.50, 0.72, 0.60, 0.42, 0.28, 0.20, 0.16, 0.15
  ],
  'mock-live-mp3-playing': [
    0.28, 0.62, 0.88, 0.95, 0.72, 0.45, 0.30, 0.70, 0.94, 0.86,
    0.60, 0.38, 0.25, 0.65, 0.90, 0.98, 0.75, 0.50, 0.32, 0.72,
    0.92, 0.84, 0.62, 0.40, 0.22, 0.58, 0.86, 0.94, 0.78, 0.52,
    0.35, 0.68, 0.92, 0.85, 0.60, 0.42, 0.25, 0.60, 0.88, 0.96,
    0.80, 0.55, 0.38, 0.20, 0.54, 0.82, 0.90, 0.72, 0.48, 0.30,
    0.64, 0.85, 0.78, 0.58, 0.40, 0.28, 0.22, 0.18, 0.15, 0.15
  ],
  'mock-live-mp3-upcoming-next': [
    0.18, 0.45, 0.75, 0.88, 0.62, 0.35, 0.20, 0.58, 0.85, 0.92,
    0.70, 0.42, 0.28, 0.65, 0.90, 0.82, 0.55, 0.32, 0.68, 0.94,
    0.85, 0.60, 0.38, 0.22, 0.50, 0.78, 0.90, 0.72, 0.45, 0.25,
    0.62, 0.88, 0.82, 0.58, 0.35, 0.68, 0.92, 0.85, 0.62, 0.40,
    0.20, 0.55, 0.82, 0.90, 0.68, 0.42, 0.25, 0.60, 0.85, 0.78,
    0.52, 0.30, 0.48, 0.70, 0.58, 0.38, 0.25, 0.18, 0.15, 0.15
  ],
  'mock-live-mp3-future': [
    0.22, 0.50, 0.80, 0.92, 0.68, 0.40, 0.25, 0.62, 0.88, 0.96,
    0.74, 0.48, 0.30, 0.70, 0.94, 0.86, 0.60, 0.35, 0.72, 0.96,
    0.88, 0.64, 0.42, 0.24, 0.54, 0.82, 0.92, 0.75, 0.48, 0.28,
    0.65, 0.90, 0.84, 0.60, 0.38, 0.70, 0.94, 0.86, 0.64, 0.42,
    0.22, 0.58, 0.85, 0.92, 0.70, 0.45, 0.28, 0.62, 0.88, 0.80,
    0.55, 0.32, 0.50, 0.72, 0.60, 0.42, 0.28, 0.20, 0.16, 0.15
  ],
  'mock-live-time-gated-active': [
    0.30, 0.65, 0.90, 0.98, 0.75, 0.48, 0.32, 0.72, 0.95, 0.88,
    0.62, 0.40, 0.26, 0.68, 0.92, 0.98, 0.78, 0.52, 0.35, 0.75,
    0.95, 0.86, 0.65, 0.42, 0.25, 0.60, 0.88, 0.96, 0.80, 0.55,
    0.38, 0.70, 0.94, 0.88, 0.62, 0.45, 0.28, 0.64, 0.90, 0.98,
    0.82, 0.58, 0.40, 0.22, 0.56, 0.84, 0.92, 0.75, 0.50, 0.32,
    0.66, 0.88, 0.80, 0.60, 0.42, 0.30, 0.24, 0.18, 0.15, 0.15
  ],
  'mock-live-mp3-missed-expired': [
    0.15, 0.40, 0.70, 0.82, 0.58, 0.32, 0.18, 0.52, 0.80, 0.88,
    0.65, 0.38, 0.24, 0.60, 0.85, 0.78, 0.50, 0.28, 0.62, 0.88,
    0.80, 0.55, 0.35, 0.20, 0.46, 0.72, 0.85, 0.68, 0.40, 0.22,
    0.58, 0.82, 0.78, 0.54, 0.32, 0.62, 0.86, 0.80, 0.58, 0.36,
    0.18, 0.50, 0.78, 0.85, 0.62, 0.38, 0.22, 0.55, 0.80, 0.72,
    0.48, 0.28, 0.44, 0.65, 0.52, 0.35, 0.22, 0.16, 0.15, 0.15
  ]
};

// Seed realistic waveform cache on module load
Object.entries(REALISTIC_BROADCAST_WAVEFORMS).forEach(([url, peaks]) => {
  mp3WaveformCache.set(url, peaks);
});

export interface MockLiveItem {
  id: string;
  type: 'live_read' | 'mp3' | 'time_gated' | 'invalid_file' | 'invalid_script';
  name: string;
  dateLabel: string;
  timeLabel: string;
  slotIso: string;
  status: 'due_now' | 'upcoming_next' | 'future' | 'playing' | 'read' | 'played' | 'missed_recent' | 'missed_expired' | 'read_now' | 'play_now' | 'missed' | 'next';
  durationLabel: string;
  category: string;
  scriptContent?: string;
  showName?: string;
  errorMessage?: string;
  isPlayed?: boolean;
  playedTime?: string;
  isPlaying?: boolean;
  isUpcoming?: boolean;
  isPresent?: boolean;
  isMissedRecent?: boolean;
  isMissedOld?: boolean;
  isVerified?: boolean;
  isScript?: boolean;
}

// Complete mock dataset matching exact live operational states
const EXACT_LIVE_MOCK_DATASET: MockLiveItem[] = [
  // 1. Missed Live Read (Scheduled 9:50 AM, missed > 5m grace window)
  {
    id: 'lr-missed-recent',
    type: 'live_read',
    name: 'LR Missed Example',
    dateLabel: 'OCT 07',
    timeLabel: '9:50 AM',
    slotIso: '2026-10-07T09:50:00.000Z',
    status: 'missed_recent',
    durationLabel: '~0:30',
    category: 'Live Read Script',
    isMissedRecent: true,
    isVerified: true,
    isScript: true,
    scriptContent: 'This is the script for LR Missed Example. Scheduled more than 5 minutes ago.',
    showName: 'Show Spacer 1'
  },
  // 2. Missed MP3 Audio (Scheduled 9:45 AM, missed > 5m grace window)
  {
    id: 'mp3-missed-recent',
    type: 'mp3',
    name: 'MP3 Audio Missed Example',
    dateLabel: 'OCT 07',
    timeLabel: '9:45 AM',
    slotIso: '2026-10-07T09:45:00.000Z',
    status: 'missed_recent',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isMissedRecent: true,
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 3. Read / Logged Live Read
  {
    id: 'lr-read',
    type: 'live_read',
    name: 'LR Read Example',
    dateLabel: 'OCT 07',
    timeLabel: '9:40 AM',
    slotIso: '2026-10-07T09:40:00.000Z',
    status: 'read',
    durationLabel: '~0:30',
    category: 'Live Read Script',
    isPlayed: true,
    playedTime: '9:41 AM',
    isVerified: true,
    isScript: true,
    scriptContent: 'This is the script for LR Read Example. Has already been read on air and logged.',
    showName: 'Show Spacer 1'
  },
  // 4. Played MP3 Track
  {
    id: 'mp3-played',
    type: 'mp3',
    name: 'MP3 Audio Played Example',
    dateLabel: 'OCT 07',
    timeLabel: '9:30 AM',
    slotIso: '2026-10-07T09:30:00.000Z',
    status: 'played',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isPlayed: true,
    playedTime: '9:31 AM',
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 5. Live Read - In Read Now Window (9:57 AM, within -5m window)
  {
    id: 'lr-read-now',
    type: 'live_read',
    name: 'LR Read Now Example',
    dateLabel: 'OCT 07',
    timeLabel: '9:57 AM',
    slotIso: '2026-10-07T09:57:00.000Z',
    status: 'due_now',
    durationLabel: '~0:30',
    category: 'Live Read Script',
    isPresent: true,
    isVerified: true,
    isScript: true,
    scriptContent: 'This is the script for LR Read Now Example. Scheduled at 9:57 AM within the active on-air window.',
    showName: 'Show Spacer 1'
  },
  // 6. MP3 Audio - Due Now (10:00 AM)
  {
    id: 'mp3-due-now',
    type: 'mp3',
    name: 'MP3 Audio Play Now Example 1',
    dateLabel: 'OCT 07',
    timeLabel: '10:00 AM',
    slotIso: '2026-10-07T10:00:00.000Z',
    status: 'due_now',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isPresent: true,
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 7. MP3 Audio - Active Playing (10:00 AM)
  {
    id: 'mp3-playing',
    type: 'mp3',
    name: 'MP3 Audio Playing Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:00 AM',
    slotIso: '2026-10-07T10:00:00.000Z',
    status: 'playing',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isPlaying: true,
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 8. MP3 Audio - In Play Now Window (10:03 AM, within +5m window)
  {
    id: 'mp3-play-now-window',
    type: 'mp3',
    name: 'MP3 Audio Play Now Example 2',
    dateLabel: 'OCT 07',
    timeLabel: '10:03 AM',
    slotIso: '2026-10-07T10:03:00.000Z',
    status: 'due_now',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isPresent: true,
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 9. Live Read - Next (10:15 AM, beyond +5m window)
  {
    id: 'lr-next',
    type: 'live_read',
    name: 'LR Next Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:15 AM',
    slotIso: '2026-10-07T10:15:00.000Z',
    status: 'future',
    durationLabel: '~0:45',
    category: 'Live Read Script',
    isVerified: true,
    isScript: true,
    scriptContent: 'This is the script for LR Next Example. Scheduled at 10:15 AM.',
    showName: 'Show Spacer 1'
  },
  // 10. MP3 Audio - Next (10:30 AM, beyond +5m window)
  {
    id: 'mp3-next',
    type: 'mp3',
    name: 'MP3 Audio Next Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:30 AM',
    slotIso: '2026-10-07T10:30:00.000Z',
    status: 'future',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 11. Time-Gated MP3 Next (10:45 AM, beyond +5m window)
  {
    id: 'time-gated-next',
    type: 'time_gated',
    name: 'Time-Gated MP3 Next Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:45 AM',
    slotIso: '2026-10-07T10:45:00.000Z',
    status: 'future',
    durationLabel: '0:30',
    category: 'Time-Gated Audio Cart',
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 12. Next Show Starting Items within Lookaround Hour (Show Spacer 2 - 11:15 AM)
  {
    id: 'err-file-missing',
    type: 'invalid_file',
    name: 'Missing MP3 File Error Example (File Not Found On Disk)',
    dateLabel: 'OCT 07',
    timeLabel: '11:15 AM',
    slotIso: '2026-10-07T11:15:00.000Z',
    status: 'future',
    durationLabel: '--:--',
    category: 'Audio Cart (Missing)',
    isVerified: false,
    isScript: false,
    errorMessage: 'File not found.',
    showName: 'Show Spacer 2'
  },
  // 13. Next Show Invalid Script within Lookaround Hour (Show Spacer 2 - 11:20 AM)
  {
    id: 'err-script-invalid',
    type: 'invalid_script',
    name: 'Invalid Script Error Example (Invalid Script Path / Format)',
    dateLabel: 'OCT 07',
    timeLabel: '11:20 AM',
    slotIso: '2026-10-07T11:20:00.000Z',
    status: 'future',
    durationLabel: '-:--',
    category: 'Live Read Script (Invalid)',
    isVerified: false,
    isScript: true,
    errorMessage: 'Invalid script file.',
    showName: 'Show Spacer 2'
  }
];

export interface MockShowSpacer {
  id: string;
  name: string;
  time: string;
  enabled: boolean;
  shadeBg: string;
  shadeBorder: string;
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([aApP][mM]))?/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  } else if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }
  return hours * 60 + minutes;
}

const DEFAULT_SHOW_SPACERS: MockShowSpacer[] = [
  {
    id: 'show-1',
    name: 'Show Spacer 1',
    time: '9:00 AM',
    enabled: true,
    shadeBg: 'var(--show-shade-odd-bg)',
    shadeBorder: 'var(--show-shade-odd-border)',
  },
  {
    id: 'show-2',
    name: 'Show Spacer 2 - Long Structural Title Example For Testing Multi-Row Truncation And Overflow Display',
    time: '11:00 AM',
    enabled: true,
    shadeBg: 'var(--show-shade-even-bg)',
    shadeBorder: 'var(--show-shade-even-border)',
  },
  {
    id: 'show-3',
    name: 'Show Spacer 3',
    time: '1:00 PM',
    enabled: false,
    shadeBg: 'var(--show-shade-odd-bg)',
    shadeBorder: 'var(--show-shade-odd-border)',
  },
  {
    id: 'show-4',
    name: 'Show Spacer 4 - Community Afternoon Broadcast Special',
    time: '3:00 PM',
    enabled: false,
    shadeBg: 'var(--show-shade-even-bg)',
    shadeBorder: 'var(--show-shade-even-border)',
  },
];

export default function LiveDevTab() {
  const [activeViewMode, setActiveViewMode] = useState<'current' | 'to_be'>('to_be');
  const [items, setItems] = useState<MockLiveItem[]>(EXACT_LIVE_MOCK_DATASET);
  const [selectedScript, setSelectedScript] = useState<MockLiveItem | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Dynamic Time Window Configuration States (Defaults: -5m, +5m, 1h lookaround)
  const [windowBeforeMinutes, setWindowBeforeMinutes] = useState<number>(5);
  const [windowAfterMinutes, setWindowAfterMinutes] = useState<number>(5);
  const [showLookaroundHours, setShowLookaroundHours] = useState<number>(1);
  const [centerSimulatedCount, setCenterSimulatedCount] = useState<'auto' | '1' | '2' | '4'>('auto');

  // Mock Window Height State (Default: 960px representing authentic 1920x1080 macOS Display WorkArea)
  const DEFAULT_MOCK_WINDOW_HEIGHT = 960;
  const [mockWindowHeight, setMockWindowHeight] = useState<number>(DEFAULT_MOCK_WINDOW_HEIGHT);

  // Enabled / Visible Cards for To-Be view (All checked by default)
  const [enabledCardIds, setEnabledCardIds] = useState<string[]>(() =>
    EXACT_LIVE_MOCK_DATASET.map((i) => i.id)
  );

  // Show Spacers State & Position Tracking for Option 2 Concept Sticky System
  const [showSpacers, setShowSpacers] = useState<MockShowSpacer[]>(DEFAULT_SHOW_SPACERS);
  const [topPinnedSpacer, setTopPinnedSpacer] = useState<MockShowSpacer | null>(null);
  const [bottomPinnedSpacer, setBottomPinnedSpacer] = useState<MockShowSpacer | null>(null);
  const [redrawKey, setRedrawKey] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nowSectionRef = useRef<HTMLDivElement>(null);

  const handleScrollContainer = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;

    const enabledSpacers = showSpacers.filter((s) => s.enabled);
    if (enabledSpacers.length === 0) {
      setTopPinnedSpacer(null);
      setBottomPinnedSpacer(null);
      return;
    }

    interface SpacerMeasure {
      spacer: MockShowSpacer;
      timeMinutes: number;
      offsetTop: number;
      offsetHeight: number;
      top: number;       // relative to container viewport: offsetTop - scrollTop
      bottom: number;    // relative to container viewport: top + offsetHeight
      isFullyVisible: boolean;
      isOffScreenTop: boolean;
      isOffScreenBottom: boolean;
    }

    const measures: SpacerMeasure[] = [];

    for (const spacer of enabledSpacers) {
      const el = container.querySelector(`[data-spacer-id="${spacer.id}"]`) as HTMLElement | null;
      if (el) {
        const offsetTop = el.offsetTop;
        const offsetHeight = el.offsetHeight || 36;
        const top = offsetTop - scrollTop;
        const bottom = top + offsetHeight;

        // Card is fully visible if its top >= -2 and its bottom <= clientHeight + 2
        const isFullyVisible = top >= -2 && bottom <= clientHeight + 2;
        const isOffScreenTop = top < -2;
        const isOffScreenBottom = bottom > clientHeight + 2;

        measures.push({
          spacer,
          timeMinutes: parseTimeToMinutes(spacer.time),
          offsetTop,
          offsetHeight,
          top,
          bottom,
          isFullyVisible,
          isOffScreenTop,
          isOffScreenBottom,
        });
      }
    }

    if (measures.length === 0) return;

    // Sort by timeline vertical order (offsetTop)
    measures.sort((a, b) => a.offsetTop - b.offsetTop);

    // 1. Top Pinned Spacer:
    // Any spacer whose in-flow card has scrolled off the top (isOffScreenTop).
    // The active pinned one is the latest one (closest to current viewport).
    const offTopSpacers = measures.filter((m) => m.isOffScreenTop);
    let newTopSpacer: MockShowSpacer | null = null;
    if (offTopSpacers.length > 0) {
      newTopSpacer = offTopSpacers[offTopSpacers.length - 1].spacer;
    }

    // 2. Bottom Pinned Spacer:
    // Any upcoming spacer whose in-flow card is off-screen below the bottom (isOffScreenBottom).
    // The active pinned one is the earliest upcoming one that isn't already the top pinned spacer.
    const offBottomSpacers = measures.filter((m) => m.isOffScreenBottom);
    let newBottomSpacer: MockShowSpacer | null = null;
    if (offBottomSpacers.length > 0) {
      const candidate = offBottomSpacers.find((m) => !newTopSpacer || m.spacer.id !== newTopSpacer.id);
      if (candidate) {
        newBottomSpacer = candidate.spacer;
      }
    }

    setTopPinnedSpacer(newTopSpacer);
    setBottomPinnedSpacer(newBottomSpacer);
  };

  const scrollToSpacer = (spacerId: string) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const el = container.querySelector(`[data-spacer-id="${spacerId}"]`) as HTMLElement | null;
    if (!el) return;
    const targetScrollTop = Math.max(0, el.offsetTop - 8);
    container.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  };

  const handleMockNowClick = () => {
    setIsRefreshing(true);
    setRedrawKey((prev) => prev + 1);
    setTimeout(() => {
      scrollToNow();
      handleScrollContainer();
      setIsRefreshing(false);
    }, 150);
  };

  // Option 2 Pinned Show Spacer Concept (Full-width banner spanning edges with 0 whitespace gap)
  const renderOption2Banner = (spacer: MockShowSpacer, position: 'top' | 'bottom') => {
    return (
      <div 
        key={`pinned-banner-${position}-${spacer.id}`}
        className={cn(
          "flex items-stretch w-full relative min-h-[2rem] select-none cursor-pointer transition-colors shrink-0 z-30 rounded-none",
          position === 'top' ? "border-b shadow-sm" : "border-t shadow-[0_-2px_6px_rgba(0,0,0,0.06)]"
        )}
        style={{ 
          backgroundColor: spacer.shadeBg, 
          borderColor: spacer.shadeBorder 
        }}
        onClick={() => scrollToSpacer(spacer.id)}
        title={`${spacer.time} ${spacer.name} (${position === 'top' ? 'Current Show Pinned' : 'Next Show Pinned'} - Click to scroll to card)`}
      >
        {/* Solid Left Color Accent Stripe */}
        <div 
          className="w-1.5 shrink-0"
          style={{ backgroundColor: spacer.shadeBorder }} 
          title={`Active during show: ${spacer.name}`}
        />
        
        {/* Banner Content */}
        <div className="px-2.5 py-1 flex items-center justify-between gap-1.5 flex-1 min-w-0 uppercase">
          <div 
            className="line-clamp-2 font-sans text-xs leading-tight break-words flex-1 min-w-0"
            title={`${spacer.time} ${spacer.name}`}
          >
            <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5 shrink-0">
              {spacer.time}
            </span>
            <span className="font-black text-slate-800">
              {spacer.name}
            </span>
          </div>
          <span className={cn(
            "text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 tabular-nums border",
            position === 'top' 
              ? "bg-slate-900/10 text-slate-700 border-slate-900/15" 
              : "bg-purple-600/10 text-purple-800 border-purple-500/20"
          )}>
            {position === 'top' ? 'Current' : 'Next'}
          </span>
        </div>
      </div>
    );
  };

  // Natural Timeline In-Flow Show Spacer Card
  const renderInFlowSpacerCard = (spacer: MockShowSpacer) => {
    return (
      <div 
        key={`in-flow-spacer-${spacer.id}`}
        data-spacer-id={spacer.id}
        className="w-[200px] mx-auto flex items-stretch relative min-h-[2.25rem] select-none shrink-0 my-1 rounded border shadow-2xs overflow-hidden"
        style={{ 
          backgroundColor: spacer.shadeBg, 
          borderColor: spacer.shadeBorder 
        }}
      >
        <div 
          className="w-1.5 shrink-0"
          style={{ backgroundColor: spacer.shadeBorder }} 
          title={`Active during show: ${spacer.name}`}
        />
        <div className="p-1 px-2.5 flex flex-col justify-center flex-1 overflow-hidden uppercase">
          <div 
            className="line-clamp-2 font-sans text-xs leading-tight break-words"
            title={`${spacer.time} ${spacer.name}`}
          >
            <span className="text-slate-500 font-bold font-sans tabular-nums mr-1.5">
              {spacer.time}
            </span>
            <span className="font-black text-slate-800">
              {spacer.name}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const scrollToNow = () => {
    if (!scrollContainerRef.current || !nowSectionRef.current) return;
    const container = scrollContainerRef.current;
    const nowEl = nowSectionRef.current;

    const containerHeight = container.clientHeight;
    const nowHeight = nowEl.offsetHeight;
    const nowTop = nowEl.offsetTop;

    if (nowHeight >= containerHeight) {
      // Overriding rule: if Now section height >= viewable window height, position Now header and section at the top of the viewable area.
      container.scrollTo({
        top: Math.max(0, nowTop - 8),
        behavior: 'smooth'
      });
    } else {
      // Centering rule: place the center of Now section as the vertical center of the scrollable area.
      const targetScrollTop = nowTop + (nowHeight / 2) - (containerHeight / 2);
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (activeViewMode === 'to_be') {
      const timer = setTimeout(() => {
        scrollToNow();
        handleScrollContainer();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeViewMode, centerSimulatedCount, enabledCardIds, mockWindowHeight, showLookaroundHours, showSpacers, redrawKey, showSettingsModal]);

  const toggleCardVisibility = (id: string) => {
    setEnabledCardIds((prev) =>
      prev.includes(id) ? prev.filter((cardId) => cardId !== id) : [...prev, id]
    );
  };

  const handleSelectAllCards = () => {
    setEnabledCardIds(EXACT_LIVE_MOCK_DATASET.map((i) => i.id));
  };

  const handleDeselectAllCards = () => {
    setEnabledCardIds([]);
  };

  const handleTogglePlay = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.isPlaying) {
            return {
              ...item,
              isPlaying: false,
              status: 'played',
              isPlayed: true,
              playedTime: '10:01 AM',
              isUpcoming: false,
              isPresent: false
            };
          } else {
            return {
              ...item,
              isPlaying: true,
              status: 'playing',
              isPlayed: false,
              isUpcoming: false,
              isPresent: false
            };
          }
        }
        return item;
      })
    );
  };

  const handleMarkAsRead = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            status: 'read',
            isPlayed: true,
            playedTime: '10:01 AM',
            isUpcoming: false,
            isPresent: false
          };
        }
        return item;
      })
    );
    setSelectedScript(null);
  };

  const handleAddShowSpacer = () => {
    const nextIndex = showSpacers.length + 1;
    const isOdd = nextIndex % 2 === 1;
    const newSpacer: MockShowSpacer = {
      id: `show-${Date.now()}`,
      name: `Show Spacer ${nextIndex}`,
      time: '5:00 PM',
      enabled: true,
      shadeBg: isOdd ? 'var(--show-shade-odd-bg)' : 'var(--show-shade-even-bg)',
      shadeBorder: isOdd ? 'var(--show-shade-odd-border)' : 'var(--show-shade-even-border)',
    };
    setShowSpacers((prev) => [...prev, newSpacer]);
  };

  const handleRemoveShowSpacer = (id: string) => {
    setShowSpacers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleReset = () => {
    setItems(EXACT_LIVE_MOCK_DATASET);
    setSelectedScript(null);
    setWindowBeforeMinutes(5);
    setWindowAfterMinutes(5);
    setShowLookaroundHours(1);
    setCenterSimulatedCount('auto');
    setMockWindowHeight(DEFAULT_MOCK_WINDOW_HEIGHT);
    setEnabledCardIds(EXACT_LIVE_MOCK_DATASET.map((i) => i.id));
    setShowSpacers(DEFAULT_SHOW_SPACERS);
    setTopPinnedSpacer(null);
    setBottomPinnedSpacer(null);
    setRedrawKey((prev) => prev + 1);
    setTimeout(() => {
      scrollToNow();
      handleScrollContainer();
    }, 50);
  };

  /**
   * CURRENT VIEW CARD RENDERER:
   * Preserved exact production implementation from PlayerTab.tsx.
   */
  const renderCurrentCard = (item: MockLiveItem) => {
    const isScript = item.isScript;
    const isVerified = item.isVerified !== false;
    const isCurrentlyPlaying = !!item.isPlaying;
    const isUpcoming = !!item.isUpcoming;
    const isPresent = !!item.isPresent;
    const played = !!item.isPlayed;
    const exported = false;
    const isPast = item.status === 'read' || item.status === 'played' || item.status === 'missed_recent' || item.status === 'missed_expired';
    const isMissedRecent = !!item.isMissedRecent;
    const isMissedOld = !!item.isMissedOld;
    const isPre = false;
    const activeShow = true;

    // EXACT LIVE BORDER CLASS (PlayerTab.tsx)
    const cardBorderClass = !isVerified
      ? "border-red-500"
      : isCurrentlyPlaying || isUpcoming
        ? (isPre ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-purple-600 ring-1 ring-purple-600/30")
        : exported
          ? "border-emerald-600"
          : (isMissedRecent || isMissedOld)
            ? "border-amber-600"
            : played
              ? "border-emerald-600"
              : "border-slate-500";

    // EXACT LIVE BACKGROUND CLASS (PlayerTab.tsx)
    const cardBgClass = !isVerified
      ? "bg-[#fef2f2]"
      : isCurrentlyPlaying
        ? "bg-white"
        : isUpcoming
          ? (isPre ? "bg-[#f0fdf4]" : "bg-[#faf5ff]")
          : exported
            ? "bg-[#f0fdf4]"
            : (isMissedRecent || isMissedOld)
              ? "bg-[#fffbeb]"
              : played
                ? "bg-white"
                : (isPresent && !played && !exported)
                  ? (isPre ? "bg-[#f0fdf4]" : "bg-[#faf5ff]")
                  : "bg-white";

    // EXACT LIVE OPACITY CLASS (PlayerTab.tsx)
    const cardOpacityClass = (isPast && (played || exported) && !isCurrentlyPlaying)
      ? "opacity-75"
      : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
        ? "opacity-95"
        : "opacity-100";

    return (
      <div key={`current-card-${item.id}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[4.5rem]">
        {/* Left show border shade indicator */}
        <div 
          className="absolute left-0 top-[-6px] bottom-[-6px] w-1 z-10"
          style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}
          title={`Active during show: ${item.showName || 'Show Spacer 1'}`}
        />

        <div 
          onClick={() => {
            if (!isVerified) return;
            if (isScript) {
              setSelectedScript(item);
            } else {
              handleTogglePlay(item.id);
            }
          }}
          style={{
            borderLeftColor: !isVerified
              ? '#f43f5e'
              : isScript
                ? '#3b82f6'
                : '#a855f7'
          }}
          className={cn(
            "flex-1 min-w-0 rounded border shadow-sm p-2 transition-colors flex flex-col gap-1.5 select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left",
            activeShow ? "ml-1" : "", "border-l-[4px] rounded-l-none",
            !isScript && isVerified ? "pb-[1px]" : "",
            cardBorderClass,
            cardBgClass,
            cardOpacityClass
          )}
        >
          {/* Header: Date & Time */}
          <div className="flex justify-between items-center bg-slate-50 -mx-2 -mt-2 px-2 py-1 rounded-t">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                {item.dateLabel}
              </span>
              <span className={cn(
                "text-xs font-sans font-black tabular-nums",
                isMissedRecent && !isCurrentlyPlaying ? "text-amber-800" : (isPre ? "text-emerald-600" : "text-purple-600")
              )}>
                {item.timeLabel}
              </span>
            </div>
            {isCurrentlyPlaying ? (
              <div className={cn(
                "flex items-center gap-1 text-xs font-black uppercase",
                isPre ? "text-emerald-600" : "text-purple-600"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", isPre ? "bg-emerald-600" : "bg-purple-600")}></div>
                {isPre ? "Prerecord" : "Live"}
              </div>
            ) : (isPresent && !played && !exported) ? (
              <span className={cn("text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none", isPre ? "bg-emerald-600" : "bg-purple-600")}>Next</span>
            ) : isUpcoming ? (
              <span className={cn("text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm animate-pulse", isPre ? "bg-emerald-500 shadow-emerald-200" : "bg-purple-500 shadow-purple-200")}>Next</span>
            ) : null}
          </div>

          {/* Track Row: Title + Action Icon */}
          <div className="flex items-center justify-between gap-2">
            <div className={cn(
              "text-xs font-bold leading-tight break-words line-clamp-2 flex-1",
              isCurrentlyPlaying ? (isPre ? "text-emerald-700" : "text-purple-700") : "text-slate-800"
            )}>
              {item.name}
            </div>
            
            {isScript ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isVerified) setSelectedScript(item);
                }}
                className={cn(
                  "shrink-0 p-1 rounded-full transition-colors shadow-sm cursor-pointer",
                  !isVerified ? "bg-red-50 text-red-300" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white" :
                  (played || exported) ? "bg-slate-100 text-slate-500" :
                  isMissedRecent ? "bg-slate-500 text-white" :
                  isPresent || isUpcoming ? (isPre ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-purple-600 text-white shadow-md shadow-purple-200") :
                  "bg-slate-700 text-white"
                )}
                title={!isVerified ? "Invalid or missing file" : isCurrentlyPlaying ? "Stop Audio" : (played || exported) ? "Read Again" : "Display Script"}
              >
                {!isVerified ? (
                  <X className="w-2.5 h-2.5" />
                ) : isCurrentlyPlaying ? (
                  <Square className="w-2.5 h-2.5 fill-current" />
                ) : (played || exported) ? (
                  <RefreshCw className="w-2.5 h-2.5" />
                ) : (
                  <FileText className="w-2.5 h-2.5" />
                )}
              </button>
            ) : (
              <div 
                className={cn(
                  "shrink-0 p-1 rounded-full transition-colors shadow-sm",
                  !isVerified ? "bg-red-50 text-red-300" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white" :
                  (played || exported) ? "bg-slate-100 text-slate-500" :
                  isMissedRecent ? "bg-slate-500 text-white" :
                  isPresent || isUpcoming ? (isPre ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-purple-600 text-white shadow-md shadow-purple-200") :
                  "bg-slate-700 text-white"
                )}
                title={!isVerified ? "Invalid or missing file" : (played || exported) ? "Play Again" : undefined}
              >
                {!isVerified ? (
                  <X className="w-2.5 h-2.5" />
                ) : isCurrentlyPlaying ? (
                  <Square className="w-2.5 h-2.5 fill-current" />
                ) : (played || exported) ? (
                  <RefreshCw className="w-2.5 h-2.5" />
                ) : (
                  <Play className="w-2.5 h-2.5 fill-current" />
                )}
              </div>
            )}
          </div>

          {/* Status & Details */}
          <div className="flex flex-col gap-[1px]">
            <div className="flex items-center justify-between">
              {isVerified ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    {isCurrentlyPlaying ? (
                      <>
                        <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">
                          Playing
                        </span>
                      </>
                    ) : played ? (
                      <>
                        <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                        <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">
                          {isScript ? 'Read' : 'Played'} {item.playedTime || '10:01 AM'}
                        </span>
                      </>
                    ) : isMissedRecent || isMissedOld ? (
                      <>
                        <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                        <span className="text-xs font-bold text-amber-700 uppercase tracking-tighter">Missed</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-2.5 h-2.5 text-slate-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{isScript ? "To be read" : "To be played"}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                  <span className="text-xs font-bold text-red-600 uppercase tracking-tighter">
                    {item.errorMessage || "File not found."}
                  </span>
                </div>
              )}
              
              {isCurrentlyPlaying ? (
                <div className="flex items-center gap-1 text-xs font-sans font-bold tabular-nums leading-none text-purple-600">
                  <span>0:14</span>
                  <span className="opacity-30">/</span>
                  <span>0:30</span>
                </div>
              ) : isVerified ? (
                <span className="text-xs font-sans font-bold tabular-nums text-slate-500 leading-none">
                  {item.durationLabel}
                </span>
              ) : null}
            </div>

            {!isScript && isVerified && (
              <WaveformVisualizer 
                url={`mock-live-${item.id}`}
                currentTime={isCurrentlyPlaying ? 14 : 0}
                duration={30}
                isPlaying={isCurrentlyPlaying}
                isPlayed={played}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Helper to format time remaining until a future slot in "in h:mm" format.
   * Uses reference broadcast time 10:00:00 AM.
   */
  const formatTimeUntil = (slotIso: string): string => {
    try {
      const slotTime = new Date(slotIso).getTime();
      const refTime = new Date('2026-10-07T10:00:00.000Z').getTime();
      const diffMs = slotTime - refTime;
      if (diffMs <= 0) return 'in 0:00';
      const totalMinutes = Math.round(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `in ${hours}:${minutes.toString().padStart(2, '0')}`;
    } catch {
      return 'in 0:00';
    }
  };

  /**
   * TO-BE VIEW CARD RENDERER:
   * Implements the dynamic temporal window model:
   * - Inside [-x, +y] window: "Read Now" (scripts) or "Play Now" (audio).
   * - Older than -x: "Missed" (if unplayed/unread) or "Read"/"Played" (if completed).
   * - Newer than +y: "Next".
   */
  const renderToBeCard = (
    item: MockLiveItem, 
    assignedStatus?: 'read_now' | 'play_now' | 'missed' | 'next' | 'playing' | 'read' | 'played',
    isExpanded: boolean = false
  ) => {
    const isScript = item.isScript;
    const isVerified = item.isVerified !== false;
    const isCurrentlyPlaying = !!item.isPlaying;
    const played = !!item.isPlayed;
    const activeShow = true;

    // Determine effective To-Be state
    const effectiveStatus = isCurrentlyPlaying
      ? 'playing'
      : played
        ? (isScript ? 'read' : 'played')
        : (assignedStatus || (isScript ? 'read_now' : 'play_now'));

    const isReadNow = effectiveStatus === 'read_now';
    const isPlayNow = effectiveStatus === 'play_now';
    const isMissed = effectiveStatus === 'missed';
    const isNext = effectiveStatus === 'next';

    const isNow = isExpanded || isReadNow || isPlayNow || isCurrentlyPlaying;
    const isMutedGray = !isNow && !isMissed;

    // TO-BE BORDER CLASS
    const cardBorderClass = !isVerified
      ? "border-rose-500"
      : isCurrentlyPlaying
        ? "border-purple-600 ring-1 ring-purple-600/40"
        : (isReadNow || isPlayNow)
          ? (isScript ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-purple-600 ring-1 ring-purple-600/30")
          : isMissed
            ? "border-rose-500"
            : "border-slate-300";

    // TO-BE BACKGROUND CLASS
    const cardBgClass = !isVerified
      ? "bg-[#fff1f2]"
      : isCurrentlyPlaying
        ? "bg-white"
        : isReadNow
          ? "bg-[#f0fdf4]"
          : isPlayNow
            ? "bg-[#faf5ff]"
            : isMissed
              ? "bg-[#fff1f2]"
              : "bg-white";

    // TO-BE OPACITY CLASS (Muted gray model applied to all non-Now cards except missed)
    const cardOpacityClass = isMutedGray
      ? "opacity-75"
      : isMissed
        ? "opacity-95"
        : "opacity-100";

    return (
      <div 
        key={`tobe-card-${item.id}`} 
        className={cn(
          "flex items-stretch gap-2 w-full relative shrink-0",
          isExpanded ? "min-h-[5.5rem] pr-0 pl-0" : "min-h-[4.5rem] pr-1"
        )}
      >
        {/* Left show border shade indicator */}
        <div 
          className={cn(
            "absolute left-0 z-10",
            isExpanded ? "w-1.5 top-0 bottom-0" : "w-1 top-[-4px] bottom-[-4px]"
          )}
          style={{ backgroundColor: item.showName === 'Show Spacer 2' ? 'var(--show-shade-even-bg)' : 'var(--show-shade-odd-bg)' }}
          title={`Active during show: ${item.showName || 'Show Spacer 1'}`}
        />

        <div 
          onClick={() => {
            if (!isVerified) return;
            if (isScript) {
              setSelectedScript(item);
            } else {
              handleTogglePlay(item.id);
            }
          }}
          style={{
            borderLeftColor: !isVerified
              ? '#f43f5e'
              : isScript
                ? '#3b82f6'
                : '#a855f7'
          }}
          className={cn(
            "flex-1 min-w-0 rounded border shadow-sm transition-colors flex flex-col justify-between select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left overflow-hidden",
            isExpanded ? "p-2 gap-0.5 ml-1.5" : "p-1.5 gap-0.5 ml-1",
            "border-l-[4px] rounded-l-none",
            !isScript && isVerified ? "pb-[1px]" : "",
            cardBorderClass,
            cardBgClass,
            cardOpacityClass
          )}
        >
          {/* Header: Date & Time + Status Pill */}
          <div className={cn(
            "flex justify-between items-center bg-slate-50 rounded-t shrink-0 border-b border-slate-200/80",
            isExpanded ? "-mx-2 -mt-2 px-2 pt-1 pb-[2px]" : "-mx-1.5 -mt-1.5 px-1.5 py-0.5"
          )}>
            <div className="flex items-center gap-1.5 leading-none">
              <span className={cn(
                "uppercase font-black tracking-tighter text-xs", 
                isExpanded ? "text-slate-700" : isMutedGray ? "text-slate-500" : "text-slate-600"
              )}>
                {item.dateLabel}
              </span>
              <span className={cn(
                "font-sans font-black tabular-nums text-xs",
                isMissed ? "text-rose-700" : (isReadNow ? "text-emerald-700" : isPlayNow ? "text-purple-700" : isMutedGray ? "text-slate-600" : "text-slate-700")
              )}>
                {item.timeLabel}
              </span>
            </div>

            {/* To-Be Status Badges */}
            {isCurrentlyPlaying ? (
              <span className={cn("bg-purple-600 text-white rounded font-black uppercase leading-none animate-pulse", isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1")}>
                Playing
              </span>
            ) : (isReadNow || isPlayNow) ? (
              /* User directive: Remove Next tag next to Now descriptor / in Now cards */
              null
            ) : isMissed ? (
              <span className={cn("bg-rose-600 text-white rounded font-black uppercase leading-none", isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1")}>
                Missed
              </span>
            ) : isNext ? (
              <span className={cn("bg-slate-200 text-slate-700 rounded font-bold tabular-nums leading-none", isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1")}>
                {formatTimeUntil(item.slotIso)}
              </span>
            ) : (played || effectiveStatus === 'read' || effectiveStatus === 'played') ? (
              <span className={cn("bg-slate-200 text-slate-700 rounded font-bold uppercase leading-none", isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1")}>
                {isScript ? 'Read' : 'Played'}
              </span>
            ) : null}
          </div>

          {/* Track Row: Title + Action Icon */}
          <div className={cn(
            "flex justify-between gap-1.5",
            isExpanded ? "flex-1 items-stretch mt-[2px] mb-0.5" : "items-center shrink-0"
          )}>
            <div className={cn(
              "leading-tight break-words flex-1 flex flex-col justify-center",
              isExpanded ? "text-sm font-black line-clamp-2" : "text-xs font-bold line-clamp-1",
              isCurrentlyPlaying ? "text-purple-700" : isReadNow ? "text-emerald-800 font-black" : isMutedGray ? "text-slate-600" : "text-slate-800"
            )}>
              {item.name}
            </div>
            
            {isScript ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isVerified) setSelectedScript(item);
                }}
                className={cn(
                  "shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border",
                  isExpanded ? "self-stretch px-3 my-[1px] rounded-lg" : "rounded-full p-1",
                  !isVerified ? "bg-red-50 text-red-300 border-red-200" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white border-slate-700" :
                  isMissed ? "bg-rose-600 text-white hover:bg-rose-700 border-rose-700" :
                  isReadNow ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700 border-emerald-500" :
                  "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300"
                )}
                title={!isVerified ? "Invalid or missing file" : isCurrentlyPlaying ? "Stop Audio" : played ? "Read Again" : isReadNow ? "Read Now" : "Display Script"}
              >
                {!isVerified ? (
                  <X className={isExpanded ? "w-5 h-5" : "w-2.5 h-2.5"} />
                ) : isCurrentlyPlaying ? (
                  <Square className={cn(isExpanded ? "w-5 h-5" : "w-2.5 h-2.5", "fill-current")} />
                ) : played ? (
                  <RefreshCw className={isExpanded ? "w-5 h-5" : "w-2.5 h-2.5"} />
                ) : (
                  <FileText className={isExpanded ? "w-5 h-5" : "w-2.5 h-2.5"} />
                )}
              </button>
            ) : (
              <div 
                className={cn(
                  "shrink-0 transition-colors shadow-sm flex items-center justify-center border",
                  isExpanded ? "self-stretch px-3 my-[1px] rounded-lg" : "rounded-full p-1",
                  !isVerified ? "bg-red-50 text-red-300 border-red-200" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white border-slate-700" :
                  isMissed ? "bg-rose-600 text-white border-rose-700" :
                  isPlayNow ? "bg-purple-600 text-white shadow-md border-purple-500" :
                  "bg-slate-100 text-slate-500 border-slate-300"
                )}
                title={!isVerified ? "Invalid or missing file" : played ? "Play Again" : undefined}
              >
                {!isVerified ? (
                  <X className={isExpanded ? "w-5 h-5" : "w-2.5 h-2.5"} />
                ) : isCurrentlyPlaying ? (
                  <Square className={cn(isExpanded ? "w-5 h-5" : "w-2.5 h-2.5", "fill-current")} />
                ) : played ? (
                  <RefreshCw className={isExpanded ? "w-5 h-5" : "w-2.5 h-2.5"} />
                ) : (
                  <Play className={cn(isExpanded ? "w-5 h-5" : "w-2.5 h-2.5", "fill-current")} />
                )}
              </div>
            )}
          </div>

          {/* Status & Details */}
          <div className="flex flex-col gap-[1px] shrink-0">
            <div className="flex items-center justify-between">
              {isVerified ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    {isCurrentlyPlaying ? (
                      <>
                        <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                        <span className="font-bold text-purple-600 uppercase tracking-tighter text-xs">
                          Playing
                        </span>
                      </>
                    ) : isMissed ? (
                      <>
                        <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                        <span className="font-bold text-rose-700 uppercase tracking-tighter text-xs">
                          Missed
                        </span>
                      </>
                    ) : isReadNow ? (
                      <>
                        <Clock className="w-2.5 h-2.5 text-emerald-600" />
                        <span className="font-black text-emerald-700 uppercase tracking-tighter text-xs">
                          Read Now
                        </span>
                      </>
                    ) : isPlayNow ? (
                      <>
                        <Clock className="w-2.5 h-2.5 text-purple-600" />
                        <span className="font-black text-purple-700 uppercase tracking-tighter text-xs">
                          Play Now
                        </span>
                      </>
                    ) : isMutedGray ? (
                      <>
                        {played ? (
                          <>
                            <CheckCircle className="w-2.5 h-2.5 text-slate-400" />
                            <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                              {isScript ? 'Read' : 'Played'} {item.playedTime || '10:01 AM'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                              {isScript ? 'To Be Read' : 'To Be Played'}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <Clock className="w-2.5 h-2.5 text-slate-500" />
                        <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs">
                          {isScript ? 'To Be Read' : 'To Be Played'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                  <span className="font-bold text-red-600 uppercase tracking-tighter text-xs">
                    {item.errorMessage || "File not found."}
                  </span>
                </div>
              )}
              
              {isCurrentlyPlaying ? (
                <div className="flex items-center gap-1 font-sans font-bold tabular-nums leading-none text-purple-600 text-xs">
                  <span>0:14</span>
                  <span className="opacity-30">/</span>
                  <span>0:30</span>
                </div>
              ) : isVerified ? (
                <span className="font-sans font-bold tabular-nums text-slate-500 leading-none text-xs">
                  {item.durationLabel}
                </span>
              ) : null}
            </div>

            {!isScript && isVerified && (
              <WaveformVisualizer 
                url={`mock-live-${item.id}`}
                currentTime={isCurrentlyPlaying ? 14 : 0}
                duration={30}
                isPlaying={isCurrentlyPlaying}
                isPlayed={played}
                className={isExpanded ? "h-[12px]" : "h-[9px]"}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* 0. View Toggle Bar (Current vs To-Be) */}
      <div className="flex items-center justify-between bg-slate-100 border-b border-slate-300 px-2 py-1 shrink-0 mb-1.5 max-w-[340px] w-full mx-auto rounded">
        <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded border border-slate-300">
          <button
            type="button"
            onClick={() => setActiveViewMode('current')}
            className={cn(
              "px-2.5 py-0.5 text-xs font-bold rounded uppercase transition-colors cursor-pointer",
              activeViewMode === 'current'
                ? "bg-white text-slate-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('to_be')}
            className={cn(
              "px-2.5 py-0.5 text-xs font-bold rounded uppercase transition-colors cursor-pointer",
              activeViewMode === 'to_be'
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            To-Be (Dynamic Windows)
          </button>
        </div>

        {activeViewMode === 'to_be' ? (
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-900 rounded border border-purple-300 transition-colors cursor-pointer shadow-2xs"
            title="Open time window and reset settings pop-up"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-700" />
            <span>Settings</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer font-medium"
            title="Reset sandbox mock data to defaults"
          >
            Reset
          </button>
        )}
      </div>

      {/* Viewport Frame (250px Outer Live Window Width, dynamic height with 960px default) */}
      <div 
        className="w-[250px] mx-auto flex flex-col bg-slate-50 border-2 border-slate-500 shadow-2xl relative shrink-0 rounded-t-lg overflow-hidden transition-[height] duration-150"
        style={{ height: `${mockWindowHeight}px`, minHeight: `${mockWindowHeight}px` }}
      >
        {/* Explicit left and right vertical border lines representing Live app 250px window boundaries */}
        <div 
          className="absolute -left-[2px] top-0 bottom-0 w-[2px] bg-slate-700 z-30 pointer-events-none" 
          title="Live App Left Window Border (250px)" 
        />
        <div 
          className="absolute -right-[2px] top-0 bottom-0 w-[2px] bg-slate-700 z-30 pointer-events-none" 
          title="Live App Right Window Border (250px)" 
        />

        {/* Mock macOS Window Title Bar */}
        <div className="bg-slate-200 border-b border-slate-300 px-2 py-1 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80 border border-rose-600/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80 border border-amber-600/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 border border-emerald-600/60" />
          </div>
          <span className="text-[10px] font-bold text-slate-600 tracking-tight">AMP Live</span>
          <div className="w-8" />
        </div>

        {/* Mock AMP Top Header (Branding & Nav) */}
        <div className="bg-[#0F172A] px-2.5 py-1.5 shrink-0 z-20 border-b border-slate-800">
          <div className="flex items-center justify-between gap-1 w-full">
            <div className="flex items-center gap-1.5 text-white shrink-0 min-w-max">
              <div className="w-5 h-5 rounded bg-purple-600 flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-xs tracking-tight shrink-0 select-none">
                AMP
              </span>
            </div>
            <div className="flex gap-1 items-center">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600 text-white font-bold text-xs uppercase tracking-tighter shadow-xs">
                <Play className="w-3 h-3" />
                <span>Player</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mock Time & Control Strip */}
        <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-xs z-10">
          <div className="w-[200px] mx-auto flex items-center justify-between gap-2">
            <div className="flex flex-col py-0.5">
              <p className="text-[10px] uppercase text-purple-600 font-black tracking-widest leading-none flex items-center gap-1 mb-0.5">
                <RadioTower className="w-3 h-3 animate-pulse" />
                Live Broadcast
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-[10px] uppercase text-slate-400 font-black tracking-tighter leading-none">
                  Time
                </p>
                <p className="text-xs font-sans font-black text-slate-900 tabular-nums leading-none">
                  10:00:00 AM
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-sans">
              <div className="flex items-center gap-1">
                <p className="text-[10px] uppercase text-purple-600 font-black tracking-tight leading-none whitespace-nowrap">
                  30s
                </p>
                <button
                  type="button"
                  onClick={handleMockNowClick}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-purple-100 active:bg-purple-200 text-slate-700 hover:text-purple-700 rounded border border-slate-300 hover:border-purple-300 select-none transition-all cursor-pointer shadow-2xs group"
                  title="Click to mock sync / full redraw and recenter to NOW"
                >
                  <RefreshCw className={cn("w-2.5 h-2.5 font-bold transition-transform duration-500", isRefreshing && "animate-spin text-purple-600")} />
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    Now
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {activeViewMode === 'current' ? (
          /* ==================== CURRENT VIEW (Preserved exact live structure) ==================== */
          <div className="w-[200px] max-w-[200px] mx-auto px-1 flex-1 min-h-0 flex flex-col bg-transparent">
            {/* 1. Persistent Top Show Header */}
            <div 
              className="flex items-stretch gap-2 w-full relative min-h-[2.5rem] h-[2.5rem] z-10 shrink-0 mb-0 font-sans"
              style={{ paddingRight: '4px' }}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 w-1 z-10"
                style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}
                title="Active during show: Show Spacer 1"
              />
              <div 
                className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                style={{ 
                  backgroundColor: 'var(--show-shade-odd-bg)', 
                  borderColor: 'var(--show-shade-odd-border)' 
                }}
              >
                <div className="line-clamp-2 font-sans flex items-center justify-between gap-1">
                  <span className="truncate">Show Spacer 1</span>
                  <span className="text-[10px] text-slate-500 font-sans font-bold tabular-nums lowercase shrink-0">9:00 am</span>
                </div>
              </div>
            </div>

            {/* 2. Scroll Container */}
            <div className="flex-1 overflow-y-auto pb-4 relative">
              {/* Slot: Past Items (< 10:00 AM) */}
              <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}>
                {renderCurrentCard(items.find((i) => i.id === 'lr-missed-recent')!)}
                {renderCurrentCard(items.find((i) => i.id === 'lr-read')!)}
                {renderCurrentCard(items.find((i) => i.id === 'mp3-played')!)}
              </div>

              {/* Slot: NOW Indicator & Due Items (10:00 AM) */}
              <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}>
                <div className="relative w-full pr-1">
                  <div 
                    className="absolute left-0 top-[-2px] bottom-[-2px] w-1 z-10"
                    style={{ backgroundColor: 'var(--show-shade-odd-bg)' }} 
                    title="Active during show: Show Spacer 1"
                  />
                  <div 
                    className="h-6 flex items-center justify-between px-3 rounded shadow-sm border ml-2 bg-blue-600 border-blue-500"
                    id="now-indicator"
                  >
                    <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
                      <RadioTower className="w-3.5 h-3.5 text-white/90 shrink-0" />
                      now
                    </span>
                  </div>
                </div>

                {renderCurrentCard(items.find((i) => i.id === 'lr-read-now')!)}
                {renderCurrentCard(items.find((i) => i.id === 'mp3-due-now')!)}
                {renderCurrentCard(items.find((i) => i.id === 'mp3-playing')!)}
              </div>

              {/* Slot: Upcoming Next Items */}
              <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}>
                {renderCurrentCard(items.find((i) => i.id === 'mp3-play-now-window')!)}
              </div>

              {/* Slot: Future Items */}
              <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}>
                {renderCurrentCard(items.find((i) => i.id === 'lr-next')!)}
                {renderCurrentCard(items.find((i) => i.id === 'mp3-next')!)}
                {renderCurrentCard(items.find((i) => i.id === 'time-gated-next')!)}
              </div>

              {/* Show Transition: Starting Show Banner */}
              <div className="flex items-stretch gap-2 w-full pr-1 relative min-h-[1.75rem] -mb-2 mt-2 z-10">
                <div 
                  className="absolute left-0 top-[-6px] bottom-[-6px] w-1 z-10"
                  style={{ backgroundColor: 'var(--show-shade-even-bg)' }} 
                  title="Active during show: Show Spacer 2"
                />
                <div 
                  className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                  style={{ 
                    backgroundColor: 'var(--show-shade-even-bg)', 
                    borderColor: 'var(--show-shade-even-border)' 
                  }}
                >
                  <div className="line-clamp-2 font-sans flex items-center justify-between gap-1">
                    <span className="truncate">Show Spacer 2</span>
                    <span className="text-[10px] text-slate-500 font-sans font-bold tabular-nums lowercase shrink-0">11:00 am</span>
                  </div>
                </div>
              </div>

              {/* Slot: New Show Starting Items & Error Cases */}
              <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-even-bg)' }}>
                {renderCurrentCard(items.find((i) => i.id === 'err-file-missing')!)}
                {renderCurrentCard(items.find((i) => i.id === 'err-script-invalid')!)}
              </div>
            </div>
          </div>
        ) : (() => {
          // Candidate items partitioned for the 3 sections in To-Be view
          const allPastItems = items.filter((item) =>
            ['lr-missed-recent', 'mp3-missed-recent', 'lr-read', 'mp3-played'].includes(item.id)
          );

          const allNowItems = items.filter((item) =>
            ['lr-read-now', 'mp3-due-now', 'mp3-playing', 'mp3-play-now-window'].includes(item.id)
          );

          const allFutureItems = items.filter((item) =>
            ['lr-next', 'mp3-next', 'time-gated-next'].includes(item.id)
          );

          const allLookaroundFutureItems = items.filter((item) =>
            ['err-file-missing', 'err-script-invalid'].includes(item.id)
          );

          // Apply card enabled/checked filtering
          const visiblePastItems = allPastItems.filter((i) => enabledCardIds.includes(i.id));
          const visibleNowItemsRaw = allNowItems.filter((i) => enabledCardIds.includes(i.id));
          const visibleFutureItems = allFutureItems.filter((i) => enabledCardIds.includes(i.id));
          const visibleLookaroundFutureItems = allLookaroundFutureItems.filter((i) => enabledCardIds.includes(i.id));

          // Effective Now Items (controlled by window, enabled cards, and optional simulation count)
          const effectiveNowItems = centerSimulatedCount === '1'
            ? visibleNowItemsRaw.slice(0, 1)
            : centerSimulatedCount === '2'
              ? visibleNowItemsRaw.slice(0, 2)
              : visibleNowItemsRaw;

          const effectivePastItems = visiblePastItems;
          const totalFutureCount = visibleFutureItems.length + (showLookaroundHours > 0 ? visibleLookaroundFutureItems.length : 0);

          // Partition show spacers into Past (< 10:00 AM) and Future (>= 10:00 AM)
          const enabledSpacers = showSpacers.filter((s) => s.enabled);
          const pastSpacers = enabledSpacers.filter((s) => parseTimeToMinutes(s.time) < 600);
          const futureSpacers = enabledSpacers.filter((s) => parseTimeToMinutes(s.time) >= 600);

          type TimelineEntry = 
            | { type: 'item'; item: MockLiveItem; minutes: number }
            | { type: 'spacer'; spacer: MockShowSpacer; minutes: number };

          const pastTimelineEntries: TimelineEntry[] = [
            ...effectivePastItems.map((item) => ({ type: 'item' as const, item, minutes: parseTimeToMinutes(item.timeLabel) })),
            ...pastSpacers.map((spacer) => ({ type: 'spacer' as const, spacer, minutes: parseTimeToMinutes(spacer.time) })),
          ].sort((a, b) => (a.minutes !== b.minutes ? a.minutes - b.minutes : a.type === 'spacer' ? -1 : 1));

          const futureCardItems = [
            ...visibleFutureItems,
            ...(showLookaroundHours > 0 ? visibleLookaroundFutureItems : []),
          ];

          const futureTimelineEntries: TimelineEntry[] = [
            ...futureCardItems.map((item) => ({ type: 'item' as const, item, minutes: parseTimeToMinutes(item.timeLabel) })),
            ...futureSpacers.map((spacer) => ({ type: 'spacer' as const, spacer, minutes: parseTimeToMinutes(spacer.time) })),
          ].sort((a, b) => (a.minutes !== b.minutes ? a.minutes - b.minutes : a.type === 'spacer' ? -1 : 1));

          return (
            /* ==================== TO-BE VIEW (1 Single Scroll Section with Option 2 Pinned Show Spacers) ==================== */
            <div 
              key={`to-be-container-${redrawKey}`}
              className="w-full flex-1 min-h-0 flex flex-col relative overflow-hidden bg-slate-100/60"
            >
              {/* Option 2 Pinned Top Show Spacer (Spans entire width, no gap with left/right/top) */}
              {topPinnedSpacer && renderOption2Banner(topPinnedSpacer, 'top')}

              {/* Scroll Container */}
              <div 
                ref={scrollContainerRef}
                onScroll={handleScrollContainer}
                className="w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
              >
                <div className="py-2 px-0.5 space-y-2">
                  {/* PAST Section Header Block */}
                  <div className="w-[200px] mx-auto shrink-0 font-sans select-none mb-1">
                    <div 
                      className="flex items-center justify-between px-2.5 py-1 rounded border shadow-2xs"
                      style={{ 
                        backgroundColor: 'var(--show-shade-odd-bg)', 
                        borderColor: 'var(--show-shade-odd-border)' 
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
                          Past
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Past Cards & Past In-Flow Spacers */}
                  <div className="w-[200px] mx-auto space-y-1.5">
                    {pastTimelineEntries.length === 0 ? (
                      <div className="text-center py-2 text-[11px] text-slate-400 font-medium italic">
                        No past cards selected
                      </div>
                    ) : (
                      pastTimelineEntries.map((entry) => {
                        if (entry.type === 'spacer') {
                          return renderInFlowSpacerCard(entry.spacer);
                        }
                        const item = entry.item;
                        return renderToBeCard(
                          item,
                          item.status === 'played' ? 'played' : item.status === 'read' ? 'read' : 'missed',
                          false
                        );
                      })
                    )}
                  </div>

                  {/* NOW Section Wrapper - "Super Card" enclosing all NOW cards */}
                  <div 
                    ref={nowSectionRef}
                    onClick={scrollToNow}
                    className="w-[222px] max-w-[calc(100%-4px)] mx-auto shrink-0 font-sans cursor-pointer group select-none rounded-lg border-x-[3px] border-b-[3px] border-t-2 border-emerald-600 bg-white shadow-sm overflow-hidden my-2"
                    title="Click to center NOW section"
                  >
                    {/* NOW Super Card Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-600 text-white border-b border-emerald-500">
                      <div className="flex items-center gap-2 min-w-0">
                        <RadioTower className="w-4 h-4 text-white animate-pulse shrink-0" />
                        <span className="text-sm font-black uppercase tracking-widest text-white truncate">
                          Now
                        </span>
                      </div>
                    </div>

                    {/* NOW Super Card Body: Flush left against yellow band, narrow right border, closing bottom border */}
                    <div className="pl-0 pr-1 py-1.5 space-y-1.5 bg-emerald-50/10">
                      {effectiveNowItems.length === 0 ? (
                        <div className="flex items-center justify-center py-3.5 px-3 rounded border border-slate-300 bg-white shadow-2xs text-center mx-1 my-0.5">
                          <span className="text-xs font-sans font-bold text-slate-600 tabular-nums">
                            Next announcement at {(visibleFutureItems[0] || allFutureItems[0])?.timeLabel || '10:15 AM'}
                          </span>
                        </div>
                      ) : (
                        effectiveNowItems.map((item) =>
                          renderToBeCard(
                            item,
                            item.status === 'playing' ? 'playing' : item.isScript ? 'read_now' : 'play_now',
                            true
                          )
                        )
                      )}
                    </div>
                  </div>

                  {/* FUTURE Section Header Block */}
                  <div className="w-[200px] mx-auto shrink-0 font-sans select-none my-1">
                    <div 
                      className="flex items-center justify-between px-2.5 py-1 rounded border shadow-2xs"
                      style={{ 
                        backgroundColor: 'var(--show-shade-odd-bg)', 
                        borderColor: 'var(--show-shade-odd-border)' 
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
                          Future
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Future Cards & Future In-Flow Spacers */}
                  <div className="w-[200px] mx-auto space-y-1.5">
                    {futureTimelineEntries.length === 0 ? (
                      <div className="text-center py-2 text-[11px] text-slate-400 font-medium italic">
                        No future cards selected
                      </div>
                    ) : (
                      futureTimelineEntries.map((entry) => {
                        if (entry.type === 'spacer') {
                          return renderInFlowSpacerCard(entry.spacer);
                        }
                        return renderToBeCard(entry.item, 'next', false);
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Option 2 Pinned Bottom Show Spacer (Spans entire width, no gap with left/right/bottom) */}
              {bottomPinnedSpacer && renderOption2Banner(bottomPinnedSpacer, 'bottom')}
            </div>
          );
        })()}

        {/* Mock Bottom Footer - Authentic Storage Folders & Mode Indicator */}
        <div className="bg-slate-900 border-t border-slate-800 text-slate-100 px-2 py-1.5 shrink-0 z-20">
          <div className="flex justify-between items-center gap-1.5 w-full">
            <div className="flex items-center shrink-0 gap-1.5">
              <div className="bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex items-center">
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700 shadow-xs text-[10px] font-black uppercase tracking-wider select-none"
                  title="Storage Folders"
                >
                  <Folder className="w-3 h-3 shrink-0" />
                  <span>Folders</span>
                </div>
              </div>

              {/* Theme Pill Group */}
              <div className="bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex items-center gap-0.5">
                <div className="px-1 py-0.5 rounded border border-slate-700 bg-slate-800 text-white flex items-center justify-center relative">
                  <Sun className="w-2.5 h-2.5 shrink-0" />
                  <span className="w-1 h-1 rounded-full absolute -top-0.5 -right-0.5 bg-red-500 shadow-[0_0_6px_#EF4444]" />
                </div>
                <div className="px-1 py-0.5 rounded border border-transparent text-slate-500 flex items-center justify-center">
                  <Moon className="w-2.5 h-2.5 shrink-0" />
                </div>
              </div>
            </div>

            <div className="flex items-center shrink-0 ml-auto">
              <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center">
                <div className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border border-t-purple-400 border-b-purple-800 bg-gradient-to-b from-purple-500 to-purple-600 text-white flex items-center gap-1 select-none">
                  <RadioTower className="w-3 h-3 text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)] shrink-0" />
                  <span>Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real LiveReadPopout Overlay */}
      {selectedScript && (
        <LiveReadPopout
          initialAnnouncementName={selectedScript.name}
          initialFileName={`${selectedScript.id}.txt`}
          initialAnnouncementTime={selectedScript.slotIso}
          initialShowName={selectedScript.showName || 'Show Spacer 1'}
          initialHostName="Host 1"
          isOverlay={true}
          onClose={() => setSelectedScript(null)}
          onLogCommit={() => handleMarkAsRead(selectedScript.id)}
        />
      )}

      {/* 3. To-Be Settings Pop-up Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden flex flex-col p-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm text-purple-950 uppercase tracking-tight">
                <Sliders className="w-4 h-4 text-purple-600" />
                <span>To-Be Layout &amp; Window Settings</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setRedrawKey((prev) => prev + 1);
                  setTimeout(() => {
                    scrollToNow();
                    handleScrollContainer();
                  }, 50);
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close settings and apply redraw"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-3 text-left">
              <p className="text-xs text-slate-600 leading-relaxed">
                Configure mock window display height, toggle visible cards, and tune temporal window offsets stored in schedule metadata (<code className="font-sans text-purple-700 bg-purple-50 px-1 py-0.5 rounded">_meta.scheduleWindow</code>).
              </p>

              {/* 1. Mock Window Height Setting */}
              <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Mock Window Height:</span>
                    <span className="text-[10px] text-slate-500">
                      Simulated display workarea height (Default: {DEFAULT_MOCK_WINDOW_HEIGHT}px)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-sans font-black text-xs text-purple-900 bg-white px-2 py-0.5 rounded border border-purple-200 shadow-2xs tabular-nums">
                      {mockWindowHeight}px
                    </span>
                    {mockWindowHeight !== DEFAULT_MOCK_WINDOW_HEIGHT && (
                      <button
                        type="button"
                        onClick={() => setMockWindowHeight(DEFAULT_MOCK_WINDOW_HEIGHT)}
                        className="px-2 py-0.5 text-[10px] font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded border border-purple-300 transition-colors cursor-pointer"
                        title={`Reset height to default (${DEFAULT_MOCK_WINDOW_HEIGHT}px)`}
                      >
                        Reset ({DEFAULT_MOCK_WINDOW_HEIGHT}px)
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min={400}
                    max={1200}
                    step={10}
                    value={mockWindowHeight}
                    onChange={(e) => setMockWindowHeight(Number(e.target.value))}
                    className="flex-1 accent-purple-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setMockWindowHeight((h) => Math.max(400, h - 50))}
                      className="w-7 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold text-xs text-slate-800 cursor-pointer"
                      title="-50px"
                    >
                      -50
                    </button>
                    <button
                      type="button"
                      onClick={() => setMockWindowHeight((h) => Math.min(1200, h + 50))}
                      className="w-7 h-6 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center font-bold text-xs text-slate-800 cursor-pointer"
                      title="+50px"
                    >
                      +50
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. To-Be Cards Visibility Checklist */}
              <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">To-Be Cards Visibility:</span>
                    <span className="text-[10px] text-slate-500">
                      Check or uncheck cards to customize layout ({enabledCardIds.length}/{items.length} visible)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllCards}
                      className="px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                      title="Check all cards"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllCards}
                      className="px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                      title="Uncheck all cards"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Grouped scrollable card toggle list */}
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 border border-slate-200 rounded bg-white p-2 text-xs">
                  {/* Past Group */}
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider pb-1 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span>Past Cards (&lt; 9:55 AM)</span>
                      <span className="font-sans text-slate-400 tabular-nums font-bold">
                        {items.filter((i) => ['lr-missed-recent', 'mp3-missed-recent', 'lr-read', 'mp3-played'].includes(i.id) && enabledCardIds.includes(i.id)).length}/4
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => ['lr-missed-recent', 'mp3-missed-recent', 'lr-read', 'mp3-played'].includes(i.id))
                        .map((item) => (
                          <label
                            key={`toggle-${item.id}`}
                            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-50 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={enabledCardIds.includes(item.id)}
                                onChange={() => toggleCardVisibility(item.id)}
                                className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer shrink-0"
                              />
                              <span className="font-sans text-[10px] font-bold text-slate-500 shrink-0 tabular-nums">
                                {item.timeLabel}
                              </span>
                              <span className="truncate text-slate-800 text-xs font-medium">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                              {item.isScript ? 'Script' : 'Audio'}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>

                  {/* Now Group */}
                  <div className="pt-1">
                    <div className="text-[10px] font-black uppercase text-emerald-700 tracking-wider pb-1 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span>Now Cards (9:55 AM – 10:05 AM)</span>
                      <span className="font-sans text-emerald-600 tabular-nums font-bold">
                        {items.filter((i) => ['lr-read-now', 'mp3-due-now', 'mp3-playing', 'mp3-play-now-window'].includes(i.id) && enabledCardIds.includes(i.id)).length}/4
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => ['lr-read-now', 'mp3-due-now', 'mp3-playing', 'mp3-play-now-window'].includes(i.id))
                        .map((item) => (
                          <label
                            key={`toggle-${item.id}`}
                            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-emerald-50/50 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={enabledCardIds.includes(item.id)}
                                onChange={() => toggleCardVisibility(item.id)}
                                className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer shrink-0"
                              />
                              <span className="font-sans text-[10px] font-bold text-emerald-700 shrink-0 tabular-nums">
                                {item.timeLabel}
                              </span>
                              <span className="truncate text-slate-800 text-xs font-medium">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                              {item.isScript ? 'Script' : 'Audio'}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>

                  {/* Future Group */}
                  <div className="pt-1">
                    <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider pb-1 border-b border-slate-100 mb-1 flex items-center justify-between">
                      <span>Future Cards (&gt; 10:05 AM)</span>
                      <span className="font-sans text-slate-400 tabular-nums font-bold">
                        {items.filter((i) => ['lr-next', 'mp3-next', 'time-gated-next', 'err-file-missing', 'err-script-invalid'].includes(i.id) && enabledCardIds.includes(i.id)).length}/5
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => ['lr-next', 'mp3-next', 'time-gated-next', 'err-file-missing', 'err-script-invalid'].includes(i.id))
                        .map((item) => (
                          <label
                            key={`toggle-${item.id}`}
                            className="flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-50 cursor-pointer select-none transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={enabledCardIds.includes(item.id)}
                                onChange={() => toggleCardVisibility(item.id)}
                                className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer shrink-0"
                              />
                              <span className="font-sans text-[10px] font-bold text-slate-500 shrink-0 tabular-nums">
                                {item.timeLabel}
                              </span>
                              <span className="truncate text-slate-800 text-xs font-medium">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                              {!item.isVerified ? 'Error' : item.isScript ? 'Script' : 'Audio'}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Show Spacers Configuration */}
              <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Show Spacers (Option 2 Concept Sticky System):</span>
                    <span className="text-[10px] text-slate-500">
                      Toggle show start cards in/out of existence and adjust start times ({showSpacers.filter((s) => s.enabled).length}/{showSpacers.length} active)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRedrawKey((prev) => prev + 1);
                        setTimeout(() => {
                          scrollToNow();
                          handleScrollContainer();
                        }, 50);
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                      title="Redraw timeline and re-center to NOW"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Redraw</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSpacers(DEFAULT_SHOW_SPACERS)}
                      className="px-2 py-0.5 text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 rounded border border-purple-200 transition-colors cursor-pointer"
                      title="Reset show spacers to default"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleAddShowSpacer}
                      className="px-2 py-0.5 text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 rounded border border-purple-700 transition-colors cursor-pointer flex items-center gap-1"
                      title="Add a new example show spacer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Spacer</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {showSpacers.map((spacer) => (
                    <div 
                      key={spacer.id} 
                      className="flex flex-col gap-1.5 p-2 rounded bg-white border border-slate-200 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            id={`spacer-toggle-${spacer.id}`}
                            checked={spacer.enabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setShowSpacers((prev) =>
                                prev.map((s) => (s.id === spacer.id ? { ...s, enabled: checked } : s))
                              );
                            }}
                            className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer shrink-0"
                          />
                          <label 
                            htmlFor={`spacer-toggle-${spacer.id}`}
                            className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none"
                          >
                            <span className="text-xs font-bold text-slate-800 truncate" title={spacer.name}>
                              {spacer.name}
                            </span>
                          </label>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Time:</span>
                          <input
                            type="text"
                            value={spacer.time}
                            onChange={(e) => {
                              const newTime = e.target.value;
                              setShowSpacers((prev) =>
                                prev.map((s) => (s.id === spacer.id ? { ...s, time: newTime } : s))
                              );
                            }}
                            className="w-20 px-1.5 py-0.5 text-xs font-bold font-sans tabular-nums text-slate-800 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-center"
                          />
                          {spacer.id !== 'show-1' && spacer.id !== 'show-2' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveShowSpacer(spacer.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete this show spacer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pl-5.5 text-[10px] text-slate-400">
                        <span>
                          {spacer.id === 'show-1' 
                            ? 'Current Show (Pins to Top)' 
                            : spacer.id === 'show-2' 
                              ? 'Next Show (Pins to Bottom / Natural Flow / Pins to Top)' 
                              : 'Subsequent Show (In natural timeline position)'}
                        </span>
                        <span className={cn(
                          "px-1.5 py-0.2 rounded font-bold uppercase text-[9px]",
                          spacer.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        )}>
                          {spacer.enabled ? 'In Existence (Visible)' : 'Out of Existence (Hidden)'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Temporal Window Sliders */}
              <div className="flex flex-col gap-2.5 bg-purple-50/60 p-3 rounded-lg border border-purple-200">
                {/* -x Window Setting */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Before (-x grace window):</span>
                    <span className="text-[10px] text-slate-500">Grace period before unplayed items mark Missed</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setWindowBeforeMinutes((p) => Math.max(0, p - 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-sans font-black text-xs text-purple-950 px-2 min-w-[2.5rem] text-center tabular-nums">{windowBeforeMinutes}m</span>
                    <button
                      type="button"
                      onClick={() => setWindowBeforeMinutes((p) => Math.min(30, p + 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* +y Window Setting */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">After (+y lookahead window):</span>
                    <span className="text-[10px] text-slate-500">Advance window for promoting items into Read Now</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setWindowAfterMinutes((p) => Math.max(0, p - 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-sans font-black text-xs text-purple-950 px-2 min-w-[2.5rem] text-center tabular-nums">{windowAfterMinutes}m</span>
                    <button
                      type="button"
                      onClick={() => setWindowAfterMinutes((p) => Math.min(30, p + 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Lookaround Hours Setting */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Show Lookaround:</span>
                    <span className="text-[10px] text-slate-500">Margin for showing items from adjacent shows</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setShowLookaroundHours((p) => Math.max(0, p - 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-sans font-black text-xs text-purple-950 px-2 min-w-[2.5rem] text-center tabular-nums">{showLookaroundHours}h</span>
                    <button
                      type="button"
                      onClick={() => setShowLookaroundHours((p) => Math.min(3, p + 1))}
                      className="w-5 h-5 rounded bg-purple-100 hover:bg-purple-200 flex items-center justify-center font-bold text-purple-900 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Center Read Cards Simulation */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Center Read Preset:</span>
                    <span className="text-[10px] text-slate-500">Fast simulation of cards in NOW</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded border border-purple-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCenterSimulatedCount('auto')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                        centerSimulatedCount === 'auto'
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                      title="Auto (uses all checked cards in Now)"
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterSimulatedCount('1')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                        centerSimulatedCount === '1'
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                      title="1 Card in center"
                    >
                      1 Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterSimulatedCount('2')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                        centerSimulatedCount === '2'
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                      title="2 Cards in center"
                    >
                      2 Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setCenterSimulatedCount('4')}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer",
                        centerSimulatedCount === '4'
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                      title="4 Cards in center"
                    >
                      4 Cards
                    </button>
                  </div>
                </div>
              </div>

              {/* Timebox Partition Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs font-sans tabular-nums space-y-1">
                <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">Active Partition Boundaries:</div>
                <div className="flex justify-between text-slate-700">
                  <span>Past (&lt; -{windowBeforeMinutes}m):</span>
                  <span className="font-bold">&lt; 9:55 AM</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Read Now (±{windowBeforeMinutes}m):</span>
                  <span>9:55 AM – 10:05 AM</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Next (&gt; +{windowAfterMinutes}m):</span>
                  <span className="font-bold">&gt; 10:05 AM</span>
                </div>
              </div>
            </div>

            {/* Modal Fixed Footer */}
            <div className="border-t border-slate-200 pt-2.5 mt-2 flex flex-col gap-2 shrink-0">
              <div className="text-[11px] text-slate-500 leading-snug">
                <span className="font-bold text-slate-700">Reset:</span> Restores mock window height ({DEFAULT_MOCK_WINDOW_HEIGHT}px), re-checks all cards, resets timing windows (5m / 5m / 1h), and clears played states.
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors cursor-pointer"
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setRedrawKey((prev) => prev + 1);
                    setTimeout(() => {
                      scrollToNow();
                      handleScrollContainer();
                    }, 50);
                  }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  Done & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
