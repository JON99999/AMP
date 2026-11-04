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
  Trash2,
  Download,
  Copy,
  ListOrdered,
  Check,
  CassetteTape,
  ListMusic,
  NotebookPen
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getAdminContactInfo } from '../lib/compatibility';
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
  type: 'live_read' | 'up_next_promo' | 'mp3' | 'time_gated' | 'invalid_file' | 'invalid_script';
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
  isUpNextPromo?: boolean;
  targetShowId?: string;
  targetShowName?: string;
  targetShowTime?: string;
  targetHostName?: string;
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
  // 9. Live Read - Next (10:07 AM, enters NOW at 10:02 AM during 10-min live scenario)
  {
    id: 'lr-next',
    type: 'live_read',
    name: 'LR Next Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:07 AM',
    slotIso: '2026-10-07T10:07:00.000Z',
    status: 'future',
    durationLabel: '~0:45',
    category: 'Live Read Script',
    isVerified: true,
    isScript: true,
    scriptContent: 'This is the script for LR Next Example. Scheduled at 10:07 AM (enters NOW at 10:02 AM).',
    showName: 'Show Spacer 1'
  },
  // 10. MP3 Audio - Next (10:11 AM, enters NOW at 10:06 AM during 10-min live scenario)
  {
    id: 'mp3-next',
    type: 'mp3',
    name: 'MP3 Audio Next Example',
    dateLabel: 'OCT 07',
    timeLabel: '10:11 AM',
    slotIso: '2026-10-07T10:11:00.000Z',
    status: 'future',
    durationLabel: '0:30',
    category: 'Audio Cart',
    isVerified: true,
    isScript: false,
    showName: 'Show Spacer 1'
  },
  // 11. Auto-Seeded "Up Next: [Show Name]" Live Read Promo (10:40 AM — 20m before 11:00 AM Show Spacer 2)
  {
    id: 'lr-up-next-promo',
    type: 'up_next_promo',
    name: 'Up Next: Show Spacer 2',
    dateLabel: 'OCT 07',
    timeLabel: '10:40 AM',
    slotIso: '2026-10-07T10:40:00.000Z',
    status: 'future',
    durationLabel: '~0:20',
    category: 'Up Next Show Promo',
    isVerified: true,
    isScript: true,
    isUpNextPromo: true,
    targetShowId: 'show-2',
    targetShowName: 'Show Spacer 2',
    targetShowTime: '11:00 AM',
    targetHostName: 'Host 2',
    scriptContent:
      "Up Next is Show Spacer 2 with Host 2 from 11:00 AM to 1:00 PM every Wednesday.\n\nStructural two-hour broadcast block featuring station programming, community updates, and scheduled announcements.\n\nThat's Show Spacer 2 at 11:00 AM.",
    showName: 'Show Spacer 1'
  },
  // 12. Time-Gated MP3 Next (10:45 AM, beyond +5m window)
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
  // 13. Next Show Starting Items within Lookaround Hour (Show Spacer 2 - 11:15 AM)
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
  // 14. Next Show Invalid Script within Lookaround Hour (Show Spacer 2 - 11:20 AM)
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
  shortName?: string;
  time: string;
  enabled: boolean;
  includeInUpNext?: boolean;
  host?: string;
  description?: string;
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

export function formatMinutesToTimeLabel(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
}

export function formatSecondsToClockLabel(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const totalMinutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  const normalizedMin = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalizedMin / 60);
  const minutes = normalizedMin % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${meridiem}`;
}

const DEFAULT_SHOW_SPACERS: MockShowSpacer[] = [
  {
    id: 'show-1',
    name: 'Show Spacer 1',
    shortName: 'Show Spacer 1',
    time: '9:00 AM',
    enabled: true,
    includeInUpNext: true,
    host: 'Host 1',
    description:
      'Structural morning broadcast block featuring scheduled station announcements and live read copy.',
    shadeBg: 'var(--show-shade-odd-bg)',
    shadeBorder: 'var(--show-shade-odd-border)',
  },
  {
    id: 'show-2',
    name: 'Show Spacer 2 - Long Structural Title Example For Testing Multi-Row Truncation And Overflow Display',
    shortName: 'Show Spacer 2',
    time: '11:00 AM',
    enabled: true,
    includeInUpNext: true,
    host: 'Host 2',
    description:
      'Structural two-hour broadcast block featuring station programming, community updates, and scheduled announcements.',
    shadeBg: 'var(--show-shade-even-bg)',
    shadeBorder: 'var(--show-shade-even-border)',
  },
  {
    id: 'show-3',
    name: 'Show Spacer 3',
    shortName: 'Show Spacer 3',
    time: '1:00 PM',
    enabled: false,
    includeInUpNext: true,
    host: 'Host 3',
    description:
      'Structural midday broadcast block with scheduled station announcements and live reads.',
    shadeBg: 'var(--show-shade-odd-bg)',
    shadeBorder: 'var(--show-shade-odd-border)',
  },
  {
    id: 'show-4',
    name: 'Show Spacer 4 - Community Afternoon Broadcast Special',
    shortName: 'Show Spacer 4',
    time: '3:00 PM',
    enabled: false,
    includeInUpNext: true,
    host: 'Host 4',
    description:
      'Community afternoon broadcast special with scheduled announcements and station updates.',
    shadeBg: 'var(--show-shade-even-bg)',
    shadeBorder: 'var(--show-shade-even-border)',
  },
];

// Reference 10:00:00 AM in seconds (10 * 3600 = 36000) and 10:10:00 AM (36600)
const SIM_START_SECONDS = 10 * 3600;
const SIM_END_SECONDS = 10 * 3600 + 10 * 60;

export type ScenarioSetId = 'live_demo' | 'set_1' | 'set_2' | 'set_3' | 'set_4' | 'set_5';

export interface ScenarioAutoEvent {
  atSeconds: number;
  itemId: string;
  action: 'start_play' | 'complete_play' | 'mark_read';
  playedTimeLabel: string;
}

export interface DemoScenarioPreset {
  id: ScenarioSetId;
  label: string;
  summary: string;
  startSeconds: number;
  endSeconds: number;
  jumpIdleGaps: boolean;
  items: MockLiveItem[];
  autoEvents: ScenarioAutoEvent[];
  markers: { label: string; seconds: number }[];
}

export interface ScenarioEventWindow {
  id: string;
  start: number;
  eventSec: number;
  end: number;
  badgeLabel: string;
  badgeTone: 'sky' | 'purple' | 'amber' | 'rose' | 'emerald';
  title: string;
  subtitle: string;
  description: string;
}

// ============================================================================
// :00, :20, :40 SCENARIO SETS (3 ITEMS PER HOUR) + STORED "LIVE DEMO"
// ============================================================================
const SCENARIO_PRESETS: Record<ScenarioSetId, DemoScenarioPreset> = {
  live_demo: {
    id: 'live_demo',
    label: 'Live Demo',
    summary: 'Original 10-min dense test scenario (10:00 AM – 10:10 AM)',
    startSeconds: SIM_START_SECONDS,
    endSeconds: SIM_END_SECONDS,
    jumpIdleGaps: false,
    items: EXACT_LIVE_MOCK_DATASET,
    autoEvents: [
      {
        atSeconds: SIM_START_SECONDS,
        itemId: 'mp3-playing',
        action: 'start_play',
        playedTimeLabel: '10:00 AM',
      },
      {
        atSeconds: SIM_START_SECONDS + 30,
        itemId: 'mp3-playing',
        action: 'complete_play',
        playedTimeLabel: '10:00 AM',
      },
    ],
    markers: [
      { label: '10:00 AM (Start)', seconds: 10 * 3600 },
      { label: '10:01 (Leaving)', seconds: 10 * 3600 + 60 },
      { label: '10:02 (Added+Missed)', seconds: 10 * 3600 + 120 },
      { label: '10:04 (Leaving)', seconds: 10 * 3600 + 240 },
      { label: '10:06 (Added)', seconds: 10 * 3600 + 360 },
      { label: '10:10 AM (End)', seconds: 10 * 3600 + 600 },
    ],
  },
  set_1: {
    id: 'set_1',
    label: 'Set 1',
    summary: ':00 MP3 Missed · :20 Live Read Read · :40 MP3 Played (±10s Event Windows)',
    startSeconds: 9 * 3600 + 55 * 60 - 10, // 9:54:50 AM (10s before 9:55 Added)
    endSeconds: 10 * 3600 + 40 * 60 + 43, // 10:40:43 AM (10s after :40 MP3 finishes playing)
    jumpIdleGaps: true,
    items: [
      {
        id: 'set1-lr-0920',
        type: 'live_read',
        name: 'LR Read Example (9:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:20 AM',
        slotIso: '2026-10-07T09:20:00.000Z',
        status: 'read',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isPlayed: true,
        playedTime: '9:21 AM',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 9:20 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set1-mp3-0940',
        type: 'mp3',
        name: 'MP3 Audio Played Example (9:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:40 AM',
        slotIso: '2026-10-07T09:40:00.000Z',
        status: 'played',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isPlayed: true,
        playedTime: '9:41 AM',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set1-mp3-1000',
        type: 'mp3',
        name: 'MP3 Audio Unplayed Missed (:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:00 AM',
        slotIso: '2026-10-07T10:00:00.000Z',
        status: 'due_now',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set1-lr-1020',
        type: 'live_read',
        name: 'Live Read On-Time Read (:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:20 AM',
        slotIso: '2026-10-07T10:20:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:20 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set1-mp3-1040',
        type: 'mp3',
        name: 'MP3 Audio On-Time Played (:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:40 AM',
        slotIso: '2026-10-07T10:40:00.000Z',
        status: 'future',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set1-lr-1100',
        type: 'live_read',
        name: 'Live Read Future Example (11:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '11:00 AM',
        slotIso: '2026-10-07T11:00:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 11:00 AM Live Read Future Example.',
        showName: 'Show Spacer 2',
      },
    ],
    autoEvents: [
      {
        atSeconds: 10 * 3600 + 20 * 60 + 4,
        itemId: 'set1-lr-1020',
        action: 'mark_read',
        playedTimeLabel: '10:20 AM',
      },
      {
        atSeconds: 10 * 3600 + 40 * 60 + 3,
        itemId: 'set1-mp3-1040',
        action: 'start_play',
        playedTimeLabel: '10:40 AM',
      },
      {
        atSeconds: 10 * 3600 + 40 * 60 + 33,
        itemId: 'set1-mp3-1040',
        action: 'complete_play',
        playedTimeLabel: '10:41 AM',
      },
    ],
    markers: [
      { label: '9:55 (:00 Added)', seconds: 9 * 3600 + 55 * 60 - 10 },
      { label: '10:05 (:00 Missed)', seconds: 10 * 3600 + 5 * 60 - 10 },
      { label: '10:15 (:20 Added)', seconds: 10 * 3600 + 15 * 60 - 10 },
      { label: '10:20 (:20 Read)', seconds: 10 * 3600 + 20 * 60 - 10 },
      { label: '10:35 (:40 Added)', seconds: 10 * 3600 + 35 * 60 - 10 },
      { label: '10:40 (:40 Played)', seconds: 10 * 3600 + 40 * 60 - 10 },
    ],
  },
  set_2: {
    id: 'set_2',
    label: 'Set 2',
    summary: ':00 Live Read Missed · :20 MP3 Missed · :40 Live Read Read (±10s Event Windows)',
    startSeconds: 9 * 3600 + 55 * 60 - 10, // 9:54:50 AM
    endSeconds: 10 * 3600 + 40 * 60 + 14, // 10:40:14 AM (10s after :40 Read)
    jumpIdleGaps: true,
    items: [
      {
        id: 'set2-mp3-0920',
        type: 'mp3',
        name: 'MP3 Audio Played Example (9:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:20 AM',
        slotIso: '2026-10-07T09:20:00.000Z',
        status: 'played',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isPlayed: true,
        playedTime: '9:21 AM',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set2-lr-0940',
        type: 'live_read',
        name: 'LR Read Example (9:40 Slot)',
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
        scriptContent: 'Script for 9:40 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set2-lr-1000',
        type: 'live_read',
        name: 'Live Read Unread Missed (:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:00 AM',
        slotIso: '2026-10-07T10:00:00.000Z',
        status: 'due_now',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:00 AM Live Read Example (Unread Missed).',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set2-mp3-1020',
        type: 'mp3',
        name: 'MP3 Audio Unplayed Missed (:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:20 AM',
        slotIso: '2026-10-07T10:20:00.000Z',
        status: 'future',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set2-lr-1040',
        type: 'live_read',
        name: 'Live Read On-Time Read (:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:40 AM',
        slotIso: '2026-10-07T10:40:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:40 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set2-mp3-1100',
        type: 'mp3',
        name: 'MP3 Audio Future Example (11:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '11:00 AM',
        slotIso: '2026-10-07T11:00:00.000Z',
        status: 'future',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 2',
      },
    ],
    autoEvents: [
      {
        atSeconds: 10 * 3600 + 40 * 60 + 4,
        itemId: 'set2-lr-1040',
        action: 'mark_read',
        playedTimeLabel: '10:40 AM',
      },
    ],
    markers: [
      { label: '9:55 (:00 Added)', seconds: 9 * 3600 + 55 * 60 - 10 },
      { label: '10:05 (:00 LR Missed)', seconds: 10 * 3600 + 5 * 60 - 10 },
      { label: '10:15 (:20 Added)', seconds: 10 * 3600 + 15 * 60 - 10 },
      { label: '10:25 (:20 MP3 Missed)', seconds: 10 * 3600 + 25 * 60 - 10 },
      { label: '10:35 (:40 Added)', seconds: 10 * 3600 + 35 * 60 - 10 },
      { label: '10:40 (:40 LR Read)', seconds: 10 * 3600 + 40 * 60 - 10 },
    ],
  },
  set_3: {
    id: 'set_3',
    label: 'Set 3',
    summary: 'Make-Good Play of Missed :00 MP3 + :20 LR Read + :40 MP3 Missed (±10s Windows)',
    startSeconds: 10 * 3600 + 15 * 60 - 10, // 10:14:50 AM (10s before 10:15 Added)
    endSeconds: 10 * 3600 + 45 * 60 + 10, // 10:45:10 AM (10s after 10:45 Missed)
    jumpIdleGaps: true,
    items: [
      {
        id: 'set3-lr-0940',
        type: 'live_read',
        name: 'LR Read Example (9:40 Slot)',
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
        scriptContent: 'Script for 9:40 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set3-mp3-1000',
        type: 'mp3',
        name: 'MP3 Audio Missed Make-Good (:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:00 AM',
        slotIso: '2026-10-07T10:00:00.000Z',
        status: 'missed_recent',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isMissedRecent: true,
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set3-lr-1020',
        type: 'live_read',
        name: 'Live Read On-Time Read (:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:20 AM',
        slotIso: '2026-10-07T10:20:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:20 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set3-mp3-1040',
        type: 'mp3',
        name: 'MP3 Audio Unplayed Missed (:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:40 AM',
        slotIso: '2026-10-07T10:40:00.000Z',
        status: 'future',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set3-lr-1100',
        type: 'live_read',
        name: 'Live Read Future Example (11:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '11:00 AM',
        slotIso: '2026-10-07T11:00:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 11:00 AM Live Read Future Example.',
        showName: 'Show Spacer 2',
      },
    ],
    autoEvents: [
      {
        atSeconds: 10 * 3600 + 16 * 60,
        itemId: 'set3-mp3-1000',
        action: 'start_play',
        playedTimeLabel: '10:16 AM',
      },
      {
        atSeconds: 10 * 3600 + 16 * 60 + 30,
        itemId: 'set3-mp3-1000',
        action: 'complete_play',
        playedTimeLabel: '10:16 AM',
      },
      {
        atSeconds: 10 * 3600 + 20 * 60 + 4,
        itemId: 'set3-lr-1020',
        action: 'mark_read',
        playedTimeLabel: '10:20 AM',
      },
    ],
    markers: [
      { label: '10:15 (:20 Added)', seconds: 10 * 3600 + 15 * 60 - 10 },
      { label: '10:16 (Make-Good :00)', seconds: 10 * 3600 + 16 * 60 - 10 },
      { label: '10:20 (:20 Read)', seconds: 10 * 3600 + 20 * 60 - 10 },
      { label: '10:35 (:40 Added)', seconds: 10 * 3600 + 35 * 60 - 10 },
      { label: '10:44 (:40 Leaving)', seconds: 10 * 3600 + 44 * 60 - 10 },
      { label: '10:45 (:40 Missed)', seconds: 10 * 3600 + 45 * 60 - 10 },
    ],
  },
  set_4: {
    id: 'set_4',
    label: 'Set 4',
    summary: ':00 MP3 Played · :20 LR Read · :40 MP3 Played Late in Amber Grace (±10s Windows)',
    startSeconds: 9 * 3600 + 55 * 60 - 10, // 9:54:50 AM
    endSeconds: 10 * 3600 + 42 * 60 + 44, // 10:42:44 AM (10s after late :40 MP3 finishes)
    jumpIdleGaps: true,
    items: [
      {
        id: 'set4-lr-0920',
        type: 'live_read',
        name: 'LR Missed Example (9:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:20 AM',
        slotIso: '2026-10-07T09:20:00.000Z',
        status: 'missed_recent',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isMissedRecent: true,
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 9:20 AM Missed Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set4-mp3-0940',
        type: 'mp3',
        name: 'MP3 Audio Missed Example (9:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:40 AM',
        slotIso: '2026-10-07T09:40:00.000Z',
        status: 'missed_recent',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isMissedRecent: true,
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set4-mp3-1000',
        type: 'mp3',
        name: 'MP3 Audio On-Time Played (:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:00 AM',
        slotIso: '2026-10-07T10:00:00.000Z',
        status: 'due_now',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set4-lr-1020',
        type: 'live_read',
        name: 'Live Read On-Time Read (:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:20 AM',
        slotIso: '2026-10-07T10:20:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:20 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set4-mp3-1040',
        type: 'mp3',
        name: 'MP3 Audio Overdue Amber Played (:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:40 AM',
        slotIso: '2026-10-07T10:40:00.000Z',
        status: 'future',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
    ],
    autoEvents: [
      {
        atSeconds: 10 * 3600 + 0 * 60 + 3,
        itemId: 'set4-mp3-1000',
        action: 'start_play',
        playedTimeLabel: '10:00 AM',
      },
      {
        atSeconds: 10 * 3600 + 0 * 60 + 33,
        itemId: 'set4-mp3-1000',
        action: 'complete_play',
        playedTimeLabel: '10:01 AM',
      },
      {
        atSeconds: 10 * 3600 + 20 * 60 + 4,
        itemId: 'set4-lr-1020',
        action: 'mark_read',
        playedTimeLabel: '10:20 AM',
      },
      {
        atSeconds: 10 * 3600 + 42 * 60 + 4,
        itemId: 'set4-mp3-1040',
        action: 'start_play',
        playedTimeLabel: '10:42 AM',
      },
      {
        atSeconds: 10 * 3600 + 42 * 60 + 34,
        itemId: 'set4-mp3-1040',
        action: 'complete_play',
        playedTimeLabel: '10:43 AM',
      },
    ],
    markers: [
      { label: '9:55 (:00 Added)', seconds: 9 * 3600 + 55 * 60 - 10 },
      { label: '10:00 (:00 Played)', seconds: 10 * 3600 - 10 },
      { label: '10:15 (:20 Added)', seconds: 10 * 3600 + 15 * 60 - 10 },
      { label: '10:20 (:20 Read)', seconds: 10 * 3600 + 20 * 60 - 10 },
      { label: '10:35 (:40 Added)', seconds: 10 * 3600 + 35 * 60 - 10 },
      { label: '10:42 (:40 Amber Play)', seconds: 10 * 3600 + 42 * 60 - 10 },
    ],
  },
  set_5: {
    id: 'set_5',
    label: 'Set 5',
    summary: ':00 MP3 Played · :20 LR Read · :40 Auto-Seeded "Up Next: Show Spacer 2" Promo Read',
    startSeconds: 9 * 3600 + 55 * 60 - 10, // 9:54:50 AM
    endSeconds: 10 * 3600 + 42 * 60 + 18, // 10:42:18 AM (10s after 10:40 Up Next Promo is marked Read)
    jumpIdleGaps: true,
    items: [
      {
        id: 'set5-upnext-0840',
        type: 'up_next_promo',
        name: 'Up Next: Show Spacer 1',
        dateLabel: 'OCT 07',
        timeLabel: '8:40 AM',
        slotIso: '2026-10-07T08:40:00.000Z',
        status: 'read',
        durationLabel: '~0:20',
        category: 'Up Next Show Promo',
        isPlayed: true,
        playedTime: '8:41 AM',
        isVerified: true,
        isScript: true,
        isUpNextPromo: true,
        targetShowId: 'show-1',
        targetShowName: 'Show Spacer 1',
        targetShowTime: '9:00 AM',
        targetHostName: 'Host 1',
        scriptContent:
          "Up Next is Show Spacer 1 with Host 1 from 9:00 AM to 11:00 AM every Wednesday.\n\nStructural morning broadcast block featuring scheduled station announcements and live read copy.\n\nThat's Show Spacer 1 at 9:00 AM.",
        showName: 'Show Spacer 1',
      },
      {
        id: 'set5-mp3-0940',
        type: 'mp3',
        name: 'MP3 Audio Played Example (9:40 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '9:40 AM',
        slotIso: '2026-10-07T09:40:00.000Z',
        status: 'played',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isPlayed: true,
        playedTime: '9:41 AM',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set5-mp3-1000',
        type: 'mp3',
        name: 'MP3 Audio On-Time Played (:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:00 AM',
        slotIso: '2026-10-07T10:00:00.000Z',
        status: 'due_now',
        durationLabel: '0:30',
        category: 'Audio Cart',
        isVerified: true,
        isScript: false,
        showName: 'Show Spacer 1',
      },
      {
        id: 'set5-lr-1020',
        type: 'live_read',
        name: 'Live Read On-Time Read (:20 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '10:20 AM',
        slotIso: '2026-10-07T10:20:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 10:20 AM Live Read Example.',
        showName: 'Show Spacer 1',
      },
      {
        id: 'set5-upnext-1040',
        type: 'up_next_promo',
        name: 'Up Next: Show Spacer 2',
        dateLabel: 'OCT 07',
        timeLabel: '10:40 AM',
        slotIso: '2026-10-07T10:40:00.000Z',
        status: 'future',
        durationLabel: '~0:20',
        category: 'Up Next Show Promo',
        isVerified: true,
        isScript: true,
        isUpNextPromo: true,
        targetShowId: 'show-2',
        targetShowName: 'Show Spacer 2',
        targetShowTime: '11:00 AM',
        targetHostName: 'Host 2',
        scriptContent:
          "Up Next is Show Spacer 2 with Host 2 from 11:00 AM to 1:00 PM every Wednesday.\n\nStructural two-hour broadcast block featuring station programming, community updates, and scheduled announcements.\n\nThat's Show Spacer 2 at 11:00 AM.",
        showName: 'Show Spacer 1',
      },
      {
        id: 'set5-lr-1100',
        type: 'live_read',
        name: 'Live Read Future Example (11:00 Slot)',
        dateLabel: 'OCT 07',
        timeLabel: '11:00 AM',
        slotIso: '2026-10-07T11:00:00.000Z',
        status: 'future',
        durationLabel: '~0:30',
        category: 'Live Read Script',
        isVerified: true,
        isScript: true,
        scriptContent: 'Script for 11:00 AM Live Read Future Example.',
        showName: 'Show Spacer 2',
      },
    ],
    autoEvents: [
      {
        atSeconds: 10 * 3600 + 0 * 60 + 3,
        itemId: 'set5-mp3-1000',
        action: 'start_play',
        playedTimeLabel: '10:00 AM',
      },
      {
        atSeconds: 10 * 3600 + 0 * 60 + 33,
        itemId: 'set5-mp3-1000',
        action: 'complete_play',
        playedTimeLabel: '10:01 AM',
      },
      {
        atSeconds: 10 * 3600 + 20 * 60 + 4,
        itemId: 'set5-lr-1020',
        action: 'mark_read',
        playedTimeLabel: '10:20 AM',
      },
      {
        atSeconds: 10 * 3600 + 42 * 60 + 8,
        itemId: 'set5-upnext-1040',
        action: 'mark_read',
        playedTimeLabel: '10:42 AM',
      },
    ],
    markers: [
      { label: '9:55 (:00 Added)', seconds: 9 * 3600 + 55 * 60 - 10 },
      { label: '10:00 (:00 Played)', seconds: 10 * 3600 - 10 },
      { label: '10:15 (:20 Added)', seconds: 10 * 3600 + 15 * 60 - 10 },
      { label: '10:20 (:20 Read)', seconds: 10 * 3600 + 20 * 60 - 10 },
      { label: '10:35 (Up Next Added)', seconds: 10 * 3600 + 35 * 60 - 10 },
      { label: '10:40 (Up Next Due)', seconds: 10 * 3600 + 40 * 60 - 10 },
      { label: '10:42 (Up Next Read)', seconds: 10 * 3600 + 42 * 60 - 10 },
    ],
  },
};

function buildScenarioEventWindows(
  scenario: DemoScenarioPreset,
  windowBeforeMinutes: number,
  windowAfterMinutes: number
): ScenarioEventWindow[] {
  const windows: ScenarioEventWindow[] = [];
  const lookaheadSec = windowAfterMinutes * 60;
  const graceSec = windowBeforeMinutes * 60;

  if (scenario.id === 'live_demo') {
    return [
      {
        id: 'ld-start',
        start: 10 * 3600,
        eventSec: 10 * 3600,
        end: 10 * 3600 + 40,
        badgeLabel: 'PLAYING TO PAST',
        badgeTone: 'purple',
        title: '10:00 AM — Active MP3 Plays & Moves to Past',
        subtitle: 'MP3 Audio Playing Example (10:00 AM)',
        description:
          'Simulates active 0:30 audio playback with live waveform progress and countdown clock, then moves the completed card from NOW to Past at 10:00:30 AM.',
      },
      {
        id: 'ld-957-leaving',
        start: 10 * 3600 + 50,
        eventSec: 10 * 3600 + 60,
        end: 10 * 3600 + 115,
        badgeLabel: 'STAGE 4 LEAVING',
        badgeTone: 'rose',
        title: '10:01 AM — 9:57 AM Live Read Enters Final Minute',
        subtitle: 'LR Read Now Example (9:57 AM)',
        description:
          '9:57 AM Live Read enters its final 60 seconds before expiration (by 10:02). Whole NOW section flashes rose (#2) and card enters Stage 4 Rose urgency.',
      },
      {
        id: 'ld-1002-added-missed',
        start: 10 * 3600 + 115,
        eventSec: 10 * 3600 + 120,
        end: 10 * 3600 + 170,
        badgeLabel: 'ADDED + MISSED',
        badgeTone: 'sky',
        title: '10:02 AM — 9:57 AM Expires to Missed & 10:07 AM Added',
        subtitle: 'LR Read Now Example & LR Next Example',
        description:
          '9:57 AM Live Read crosses its 5m grace boundary and pins at the bottom of Past as Missed (1m ago), while 10:07 AM Live Read enters NOW with an Added flash.',
      },
      {
        id: 'ld-1004-leaving',
        start: 10 * 3600 + 230,
        eventSec: 10 * 3600 + 240,
        end: 10 * 3600 + 315,
        badgeLabel: 'LEAVING TO MISSED',
        badgeTone: 'rose',
        title: '10:04–10:05 AM — 10:00 AM MP3 Leaving & Missed',
        subtitle: 'MP3 Audio Play Now Example 1 (10:00 AM)',
        description:
          'Unplayed 10:00 AM MP3 triggers Stage 4 Leaving strobe at 10:04 AM and moves to Past as Missed at 10:05 AM.',
      },
      {
        id: 'ld-1006-added',
        start: 10 * 3600 + 350,
        eventSec: 10 * 3600 + 360,
        end: 10 * 3600 + 600,
        badgeLabel: 'ADDED TO NOW',
        badgeTone: 'sky',
        title: '10:06–10:10 AM — 10:11 AM MP3 Enters NOW & 10:03 AM Expires',
        subtitle: 'MP3 Audio Next Example (10:11 AM)',
        description:
          '10:11 AM MP3 enters the +5m NOW lookahead window at 10:06 AM while remaining unplayed cards escalate through Stage 3 and Stage 4.',
      },
    ];
  }

  for (const item of scenario.items) {
    const slotSec = parseTimeToMinutes(item.timeLabel) * 60;
    const itemAutoEvents = scenario.autoEvents.filter((e) => e.itemId === item.id);
    const startPlayEv = itemAutoEvents.find((e) => e.action === 'start_play');
    const completePlayEv = itemAutoEvents.find((e) => e.action === 'complete_play');
    const markReadEv = itemAutoEvents.find((e) => e.action === 'mark_read');

    // Case: Make-good play of an item already in Past as Missed (e.g. Set 3 10:00 AM MP3 played at 10:16 AM)
    if (slotSec < scenario.startSeconds && startPlayEv && completePlayEv) {
      windows.push({
        id: `${scenario.id}-${item.id}-makegood`,
        start: startPlayEv.atSeconds - 10,
        eventSec: startPlayEv.atSeconds,
        end: completePlayEv.atSeconds + 10,
        badgeLabel: 'MAKE-GOOD PLAY',
        badgeTone: 'emerald',
        title: `${formatMinutesToTimeLabel(Math.floor(startPlayEv.atSeconds / 60))} — Make-Good Play of Missed ${item.timeLabel} MP3`,
        subtitle: item.name,
        description:
          'DJ clicks Play on the Missed card pinned just above the NOW bar. Waveform and countdown clock run through the 0:30 track, converting the card from Missed to Played in Past.',
      });
      continue;
    }

    if (slotSec < scenario.startSeconds || slotSec > scenario.endSeconds + 60) {
      continue;
    }

    const entrySec = slotSec - lookaheadSec;
    const itemTypeLabel = item.isUpNextPromo
      ? 'Up Next Promo'
      : item.isScript
        ? 'Live Read'
        : 'MP3';

    // 1. Entry into NOW window (±10s around entrySec)
    if (entrySec >= scenario.startSeconds) {
      windows.push({
        id: `${scenario.id}-${item.id}-added`,
        start: entrySec - 10,
        eventSec: entrySec,
        end: entrySec + 10,
        badgeLabel: 'ADDED TO NOW',
        badgeTone: 'sky',
        title: `${formatMinutesToTimeLabel(entrySec / 60)} — ${item.timeLabel} ${itemTypeLabel} Enters NOW`,
        subtitle: item.name,
        description: item.isUpNextPromo
          ? `Auto-seeded "${item.name}" card (20m before ${item.targetShowTime || '11:00 AM'} ${item.targetShowName || 'Show Spacer 2'}) crosses the +${windowAfterMinutes}m lookahead boundary into NOW with stored show description copy.`
          : `Card crosses the +${windowAfterMinutes}m lookahead boundary into NOW. Whole NOW section flashes sky-blue (#1) and card border pulses for Stage 1 entry (10s before to 10s after).`,
      });
    }

    // 2. On-time Live Read (mark_read within 30s of slotSec)
    if (markReadEv && Math.abs(markReadEv.atSeconds - slotSec) <= 30) {
      windows.push({
        id: `${scenario.id}-${item.id}-read`,
        start: slotSec - 10,
        eventSec: markReadEv.atSeconds,
        end: markReadEv.atSeconds + 10,
        badgeLabel: 'READ TO PAST',
        badgeTone: 'emerald',
        title: `${item.timeLabel} — ${itemTypeLabel} Due & Marked Read`,
        subtitle: item.name,
        description: `Reaches ${item.timeLabel} slot (Stage 2 Due border pulse), DJ marks script Read at ${formatSecondsToClockLabel(markReadEv.atSeconds)}, and card immediately moves out of NOW into the Past section.`,
      });
      continue;
    }

    // 3. On-time MP3 Playback (start_play within 30s of slotSec)
    if (startPlayEv && completePlayEv && Math.abs(startPlayEv.atSeconds - slotSec) <= 30) {
      windows.push({
        id: `${scenario.id}-${item.id}-played`,
        start: slotSec - 10,
        eventSec: startPlayEv.atSeconds,
        end: completePlayEv.atSeconds + 10,
        badgeLabel: 'PLAYING TO PAST',
        badgeTone: 'purple',
        title: `${item.timeLabel} — MP3 Plays Track & Moves to Past`,
        subtitle: item.name,
        description: `Reaches ${item.timeLabel} slot, plays 0:30 audio track with live waveform movement and countdown clock, then moves out of NOW into the Past section upon completion.`,
      });
      continue;
    }

    // 4. Late / Overdue Amber MP3 Playback or Up Next Promo Read (e.g. Set 4 & Set 5 :40 slot at 10:42 AM)
    const stage3Sec = slotSec + Math.max(1, windowBeforeMinutes * 0.4) * 60;
    if (startPlayEv && completePlayEv && startPlayEv.atSeconds >= stage3Sec - 15) {
      windows.push({
        id: `${scenario.id}-${item.id}-due-unplayed`,
        start: slotSec - 10,
        eventSec: slotSec,
        end: slotSec + 10,
        badgeLabel: 'STAGE 2 DUE',
        badgeTone: 'purple',
        title: `${item.timeLabel} — Reaches Scheduled Time (Unplayed)`,
        subtitle: item.name,
        description: `Reaches scheduled ${item.timeLabel} broadcast time without being played yet. Card border begins Stage 2 Due pulsing while card interior remains unchanged.`,
      });

      windows.push({
        id: `${scenario.id}-${item.id}-amber-play`,
        start: stage3Sec - 10,
        eventSec: startPlayEv.atSeconds,
        end: completePlayEv.atSeconds + 10,
        badgeLabel: 'AMBER PLAY TO PAST',
        badgeTone: 'amber',
        title: `${formatMinutesToTimeLabel(stage3Sec / 60)} — Stage 3 Amber Alert & Late Play Recovery`,
        subtitle: item.name,
        description: `Card escalates to Stage 3 Overdue (Amber border pulse) at ${formatMinutesToTimeLabel(stage3Sec / 60)}. DJ starts playback at ${formatSecondsToClockLabel(startPlayEv.atSeconds)}, waveform and countdown finish the 0:30 track, and card moves to Past.`,
      });
      continue;
    }

    if (markReadEv && markReadEv.atSeconds >= stage3Sec - 15) {
      windows.push({
        id: `${scenario.id}-${item.id}-due-unread`,
        start: slotSec - 10,
        eventSec: slotSec,
        end: slotSec + 10,
        badgeLabel: 'STAGE 2 DUE',
        badgeTone: 'purple',
        title: `${item.timeLabel} — ${itemTypeLabel} Reaches Scheduled Slot (Unread)`,
        subtitle: item.name,
        description: item.isUpNextPromo
          ? `Auto-seeded "${item.name}" card reaches its 10:40 AM slot (20m before ${item.targetShowTime || '11:00 AM'} ${item.targetShowName || 'Show Spacer 2'}). Stage 2 Due border pulse activates while displaying "Read Now · Up Next".`
          : `Reaches scheduled ${item.timeLabel} broadcast time without being read yet. Card border begins Stage 2 Due pulsing while card interior remains unchanged.`,
      });

      windows.push({
        id: `${scenario.id}-${item.id}-amber-read`,
        start: stage3Sec - 10,
        eventSec: markReadEv.atSeconds,
        end: markReadEv.atSeconds + 10,
        badgeLabel: 'AMBER READ TO PAST',
        badgeTone: 'amber',
        title: `${formatMinutesToTimeLabel(stage3Sec / 60)} — Stage 3 Amber & ${itemTypeLabel} Logged Read`,
        subtitle: item.name,
        description: item.isUpNextPromo
          ? `"${item.name}" enters Stage 3 Amber border pulse at ${formatMinutesToTimeLabel(stage3Sec / 60)}. DJ opens the auto-seeded Show Description copy, marks it Read at ${formatSecondsToClockLabel(markReadEv.atSeconds)}, and the promo card logs and moves to Past.`
          : `Card escalates to Stage 3 Overdue (Amber border pulse) at ${formatMinutesToTimeLabel(stage3Sec / 60)}. DJ marks script Read at ${formatSecondsToClockLabel(markReadEv.atSeconds)} and card moves to Past.`,
      });
      continue;
    }

    // 5. Unplayed Item Escalating Through All 4 Stages to Missed in Past (each window strictly ±10s)
    const stage4Sec = slotSec + Math.max(2, windowBeforeMinutes * 0.8) * 60;
    const exitSec = slotSec + graceSec;

    windows.push({
      id: `${scenario.id}-${item.id}-stage2`,
      start: slotSec - 10,
      eventSec: slotSec,
      end: slotSec + 10,
      badgeLabel: 'STAGE 2 DUE',
      badgeTone: 'purple',
      title: `${item.timeLabel} — Reaches Scheduled Slot (Stage 2 Due)`,
      subtitle: item.name,
      description: `Item reaches its scheduled ${item.timeLabel} slot without being ${item.isScript ? 'read' : 'played'}. Border-only Stage 2 Due pulse activates (±10s window).`,
    });

    windows.push({
      id: `${scenario.id}-${item.id}-stage3`,
      start: stage3Sec - 10,
      eventSec: stage3Sec,
      end: stage3Sec + 10,
      badgeLabel: 'STAGE 3 AMBER',
      badgeTone: 'amber',
      title: `${formatMinutesToTimeLabel(stage3Sec / 60)} — Stage 3 Overdue Amber Border Pulse`,
      subtitle: item.name,
      description: `40% of grace window elapsed (${formatMinutesToTimeLabel(stage3Sec / 60)}). Card border shifts to Stage 3 Amber pulse while interior remains clean (±10s window).`,
    });

    windows.push({
      id: `${scenario.id}-${item.id}-stage4`,
      start: stage4Sec - 10,
      eventSec: stage4Sec,
      end: stage4Sec + 10,
      badgeLabel: 'STAGE 4 LEAVING',
      badgeTone: 'rose',
      title: `${formatMinutesToTimeLabel(stage4Sec / 60)} — Final Minute Stage 4 Leaving Strobe`,
      subtitle: item.name,
      description: `Final 60s before grace expiration (${formatMinutesToTimeLabel(stage4Sec / 60)}). Whole NOW section flashes rose (#2 Leaving Alert) and card enters Stage 4 Rose urgency (±10s window).`,
    });

    windows.push({
      id: `${scenario.id}-${item.id}-missed`,
      start: exitSec - 10,
      eventSec: exitSec,
      end: exitSec + 10,
      badgeLabel: 'MISSED TO PAST',
      badgeTone: 'rose',
      title: `${formatMinutesToTimeLabel(exitSec / 60)} — Grace Expires & Moves to Past as Missed`,
      subtitle: item.name,
      description: `Crosses the by ${formatMinutesToTimeLabel(exitSec / 60).replace(/\s*[AP]M$/i, '')} deadline. Card leaves NOW and sorts to the bottom of Past (just above NOW) with a two-row Missed / 1m ago badge (±10s window).`,
    });
  }

  windows.sort((a, b) => a.start - b.start);
  return windows;
}

// Seed waveform peaks for all MP3 items across all Scenario Sets
const DEFAULT_WAVEFORM_PEAKS = REALISTIC_BROADCAST_WAVEFORMS['mock-live-mp3-due-now'];
Object.values(SCENARIO_PRESETS).forEach((preset) => {
  preset.items.forEach((item) => {
    if (!item.isScript) {
      const key = `mock-live-${item.id}`;
      if (!mp3WaveformCache.has(key)) {
        mp3WaveformCache.set(key, DEFAULT_WAVEFORM_PEAKS);
      }
    }
  });
});

interface DemoPauseState {
  type: 'gap_jump' | 'set_transition';
  title: string;
  subtitle: string;
  description: string;
  fromTimeLabel?: string;
  toTimeLabel?: string;
  targetSeconds: number;
  targetScenarioId?: ScenarioSetId;
  remainingMs: number;
  totalMs: number;
  nextEventTitle?: string;
}

const DEMO_SEQUENCE_ORDER: ScenarioSetId[] = ['set_1', 'set_2', 'set_3', 'set_4', 'set_5'];

export default function LiveDevTab() {
  const [activeViewMode, setActiveViewMode] = useState<'current' | 'to_be' | 'to_be_merged'>('to_be_merged');
  const [showMergedExportPopup, setShowMergedExportPopup] = useState<boolean>(false);
  const [mergedPreviewMode, setMergedPreviewMode] = useState<'plan' | 'playlist' | 'live_reads'>('plan');
  const [mergedHasPlaylistItems, setMergedHasPlaylistItems] = useState<boolean>(true);
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioSetId>('live_demo');
  const activeScenario = SCENARIO_PRESETS[activeScenarioId];

  const [items, setItems] = useState<MockLiveItem[]>(EXACT_LIVE_MOCK_DATASET);
  const [selectedScript, setSelectedScript] = useState<MockLiveItem | null>(null);
  const [scriptZoomPx, setScriptZoomPx] = useState<number>(18);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [helpPopupCard, setHelpPopupCard] = useState<MockLiveItem | null>(null);
  const resolvedAdminContact =
    getAdminContactInfo().trim() ||
    'Admin: Configure contact details in Admin Mode > Folders > Help.';

  // Dynamic Time Window Configuration States (Defaults: -5m, +5m, 1h lookaround)
  const [windowBeforeMinutes, setWindowBeforeMinutes] = useState<number>(5);
  const [windowAfterMinutes, setWindowAfterMinutes] = useState<number>(5);
  const [showLookaroundHours, setShowLookaroundHours] = useState<number>(1);
  const [centerSimulatedCount, setCenterSimulatedCount] = useState<'auto' | '1' | '2' | '4'>('auto');

  // Roadmap #12: Auto-Seeded "Up Next: [Show Name]" Promo Configuration States
  const [enableUpNextPromos, setEnableUpNextPromos] = useState<boolean>(true);
  const [upNextMinutesBefore, setUpNextMinutesBefore] = useState<number>(20);

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

  // =========================================================================
  // ROADMAP #17: DJ ATTENTION FLASH & ESCALATING URGENCY SIMULATION STATES
  // =========================================================================
  const [simClockSeconds, setSimClockSeconds] = useState<number>(SIM_START_SECONDS);
  const [isSimRunning, setIsSimRunning] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 3 | 5 | 10 | 30>(1);
  const [lastJumpNotice, setLastJumpNotice] = useState<string | null>(null);
  const [isPlayingAllSets, setIsPlayingAllSets] = useState<boolean>(false);
  const [demoPauseState, setDemoPauseState] = useState<DemoPauseState | null>(null);
  const [manualPlayElapsedMap, setManualPlayElapsedMap] = useState<Record<string, number>>({});

  // 1-4. Enable/Disable Checkboxes
  const [enableAddedFlash, setEnableAddedFlash] = useState<boolean>(true);
  const [enableLeavingFlash, setEnableLeavingFlash] = useState<boolean>(true);
  const [enableCardUrgency, setEnableCardUrgency] = useState<boolean>(true);
  const [enableBlinkOnly, setEnableBlinkOnly] = useState<boolean>(false);

  // #2 Leaving Flash Pause-Gap Controls (Default: 3s flash, 10s gap, highlight 'on' during gap)
  const [leavingFlashDurationSec, setLeavingFlashDurationSec] = useState<number>(3);
  const [leavingGapDurationSec, setLeavingGapDurationSec] = useState<number>(10);
  const [leavingGapHighlightMode, setLeavingGapHighlightMode] = useState<'on' | 'off'>('on');
  const [leavingCycleElapsedSec, setLeavingCycleElapsedSec] = useState<number>(0);

  // On-Demand Manual Trigger States
  const [manualNowFlash, setManualNowFlash] = useState<'none' | 'added' | 'leaving'>('none');
  const [forcedCardStage, setForcedCardStage] = useState<'auto' | 1 | 2 | 3 | 4>('auto');
  const manualFlashTimerRef = useRef<number | null>(null);

  const handleSelectScenarioSet = (scenarioId: ScenarioSetId) => {
    const preset = SCENARIO_PRESETS[scenarioId];
    setIsSimRunning(false);
    setIsPlayingAllSets(false);
    setDemoPauseState(null);
    setManualPlayElapsedMap({});
    setActiveScenarioId(scenarioId);
    setItems(preset.items);
    setEnabledCardIds(preset.items.map((i) => i.id));
    setSimClockSeconds(preset.startSeconds);
    setManualNowFlash('none');
    setForcedCardStage('auto');
    setLastJumpNotice(null);
    setRedrawKey((prev) => prev + 1);
    setTimeout(() => {
      scrollToNow();
      handleScrollContainer();
    }, 50);
  };

  const handleStartPlayAllSets = () => {
    if (isPlayingAllSets) {
      setIsPlayingAllSets(false);
      setIsSimRunning(false);
      setDemoPauseState(null);
      return;
    }
    const firstSet = SCENARIO_PRESETS.set_1;
    setActiveScenarioId('set_1');
    setItems(firstSet.items);
    setEnabledCardIds(firstSet.items.map((i) => i.id));
    setSimClockSeconds(firstSet.startSeconds);
    setManualPlayElapsedMap({});
    setManualNowFlash('none');
    setForcedCardStage('auto');
    setLastJumpNotice(null);
    setIsPlayingAllSets(true);
    setIsSimRunning(true);
    setDemoPauseState({
      type: 'set_transition',
      title: 'Demo Video Mode — Up Next: Set 1 of 5',
      subtitle: firstSet.summary,
      description:
        'Demo reset to 9:54:50 AM. Set 1 demonstrates an unplayed :00 MP3 escalating through all 4 stages to Missed, an on-time :20 Live Read moving to Past, and an on-time :40 MP3 playing its waveform and moving to Past.',
      targetSeconds: firstSet.startSeconds,
      targetScenarioId: 'set_1',
      remainingMs: 3200,
      totalMs: 3200,
    });
    setRedrawKey((prev) => prev + 1);
    setTimeout(() => {
      scrollToNow();
      handleScrollContainer();
    }, 50);
  };

  const triggerManualNowFlash = (mode: 'added' | 'leaving') => {
    if (manualFlashTimerRef.current) {
      window.clearTimeout(manualFlashTimerRef.current);
      manualFlashTimerRef.current = null;
    }
    if (manualNowFlash === mode) {
      setManualNowFlash('none');
      return;
    }
    setLeavingCycleElapsedSec(0);
    setManualNowFlash(mode);
    const totalDurationMs =
      mode === 'leaving'
        ? Math.max(16500, (leavingFlashDurationSec * 2 + leavingGapDurationSec + 0.5) * 1000)
        : 4500;
    manualFlashTimerRef.current = window.setTimeout(() => {
      setManualNowFlash('none');
      manualFlashTimerRef.current = null;
    }, totalDurationMs);
  };

  useEffect(() => {
    return () => {
      if (manualFlashTimerRef.current) {
        window.clearTimeout(manualFlashTimerRef.current);
      }
    };
  }, []);

  // Real-time ticker for #2 Leaving Flash pause-gap cycle (e.g. 3s flash -> 10s gap -> 3s flash)
  useEffect(() => {
    if (manualNowFlash !== 'leaving' && !isSimRunning) {
      setLeavingCycleElapsedSec(0);
      return;
    }
    const tickMs = 200;
    const interval = window.setInterval(() => {
      setLeavingCycleElapsedSec((prev) => prev + tickMs / 1000);
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [manualNowFlash, isSimRunning]);

  // Real-time / simulated waveform & countdown progression for any manually playing item
  useEffect(() => {
    const manualPlayingItems = items.filter((item) => {
      if (!item.isPlaying) return false;
      const hasAutoPlay = activeScenario.autoEvents.some(
        (ev) => ev.itemId === item.id && ev.action === 'start_play'
      );
      return !hasAutoPlay || !isSimRunning;
    });
    if (manualPlayingItems.length === 0) return;

    const tickMs = 200;
    const interval = window.setInterval(() => {
      const stepSec = ((isSimRunning ? simSpeed : 1) * tickMs) / 1000;
      const completedIds: string[] = [];

      setManualPlayElapsedMap((prev) => {
        const next = { ...prev };
        for (const item of manualPlayingItems) {
          const currentElapsed = next[item.id] ?? 0;
          const nextElapsed = currentElapsed + stepSec;
          if (nextElapsed >= 30) {
            delete next[item.id];
            completedIds.push(item.id);
          } else {
            next[item.id] = nextElapsed;
          }
        }
        return next;
      });

      if (completedIds.length > 0) {
        const stampedTime = formatMinutesToTimeLabel(Math.floor(simClockSeconds / 60));
        setItems((prevItems) =>
          prevItems.map((it) =>
            completedIds.includes(it.id)
              ? {
                  ...it,
                  isPlaying: false,
                  isPlayed: true,
                  status: 'played',
                  playedTime: stampedTime,
                  isUpcoming: false,
                  isPresent: false,
                }
              : it
          )
        );
      }
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [items, activeScenario, isSimRunning, simSpeed, simClockSeconds]);

  // Apply scenario autoEvents (Played / Read actions) when simulated clock crosses their timestamp
  useEffect(() => {
    if (activeScenario.autoEvents.length === 0) return;
    setItems((prevItems) => {
      let changed = false;
      const updated = prevItems.map((item) => {
        const matchingEvents = activeScenario.autoEvents.filter((ev) => ev.itemId === item.id);
        if (matchingEvents.length === 0) return item;

        const passedEvents = matchingEvents.filter((ev) => simClockSeconds >= ev.atSeconds);
        if (passedEvents.length === 0) {
          // If scrubbed backward before auto-event, restore initial state from preset
          const initialItem = activeScenario.items.find((init) => init.id === item.id);
          if (
            initialItem &&
            (item.isPlaying !== initialItem.isPlaying ||
              item.isPlayed !== initialItem.isPlayed ||
              item.status !== initialItem.status)
          ) {
            changed = true;
            return { ...initialItem };
          }
          return item;
        }

        const latestEvent = passedEvents[passedEvents.length - 1];
        if (latestEvent.action === 'start_play' && !item.isPlaying) {
          changed = true;
          return {
            ...item,
            isPlaying: true,
            isPlayed: false,
            status: 'playing',
          };
        }
        if (latestEvent.action === 'complete_play' && (!item.isPlayed || item.isPlaying)) {
          changed = true;
          return {
            ...item,
            isPlaying: false,
            isPlayed: true,
            status: 'played',
            playedTime: latestEvent.playedTimeLabel,
          };
        }
        if (latestEvent.action === 'mark_read' && !item.isPlayed) {
          changed = true;
          return {
            ...item,
            isPlaying: false,
            isPlayed: true,
            status: 'read',
            playedTime: latestEvent.playedTimeLabel,
          };
        }
        return item;
      });
      return changed ? updated : prevItems;
    });
  }, [simClockSeconds, activeScenario]);

  // Countdown timer for intermediate pause cards (gap_jump and set_transition)
  useEffect(() => {
    if (!isSimRunning || !demoPauseState) return;
    const tickMs = 100;
    const interval = window.setInterval(() => {
      setDemoPauseState((prev) => {
        if (!prev) return null;
        const nextRemaining = prev.remainingMs - tickMs;
        if (nextRemaining <= 0) {
          setSimClockSeconds(prev.targetSeconds);
          return null;
        }
        return { ...prev, remainingMs: nextRemaining };
      });
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [isSimRunning, demoPauseState]);

  // Live scenario interval timer with ±10s Event Windows, Intermediate Gap Pause Cards, and 5-Set Sequencer
  useEffect(() => {
    if (!isSimRunning || demoPauseState) return;
    const tickMs = 250;
    const interval = window.setInterval(() => {
      const eventWindows = buildScenarioEventWindows(
        activeScenario,
        windowBeforeMinutes,
        windowAfterMinutes
      );

      // Merge overlapping event windows
      const merged: ScenarioEventWindow[] = [];
      for (const w of eventWindows) {
        if (merged.length === 0) {
          merged.push({ ...w });
        } else {
          const last = merged[merged.length - 1];
          if (w.start <= last.end + 2) {
            last.end = Math.max(last.end, w.end);
          } else {
            merged.push({ ...w });
          }
        }
      }

      const rawNext = simClockSeconds + (simSpeed * tickMs) / 1000;

      // Check if current scenario has reached its end
      if (rawNext >= activeScenario.endSeconds) {
        if (isPlayingAllSets) {
          const currentIndex = DEMO_SEQUENCE_ORDER.indexOf(activeScenarioId);
          if (currentIndex >= 0 && currentIndex < DEMO_SEQUENCE_ORDER.length - 1) {
            const nextScenarioId = DEMO_SEQUENCE_ORDER[currentIndex + 1];
            const nextPreset = SCENARIO_PRESETS[nextScenarioId];
            const nextSetNumber = currentIndex + 2;

            setActiveScenarioId(nextScenarioId);
            setItems(nextPreset.items);
            setEnabledCardIds(nextPreset.items.map((i) => i.id));
            setSimClockSeconds(nextPreset.startSeconds);
            setManualPlayElapsedMap({});
            setManualNowFlash('none');
            setForcedCardStage('auto');
            setLastJumpNotice(`Demo Reset: Loaded ${nextPreset.label} (${nextSetNumber} of 5)`);
            setDemoPauseState({
              type: 'set_transition',
              title: `Demo Reset — Up Next: ${nextPreset.label} (${nextSetNumber} of 5)`,
              subtitle: nextPreset.summary,
              description:
                nextScenarioId === 'set_2'
                  ? 'Resetting demo clock to 9:54:50 AM. Set 2 demonstrates an unread :00 Live Read and unplayed :20 MP3 both escalating to Missed in Past, followed by an on-time :40 Live Read.'
                  : nextScenarioId === 'set_3'
                    ? 'Resetting demo clock to 10:14:50 AM. Set 3 demonstrates a DJ Make-Good recovery play on a Missed :00 MP3 in Past, an on-time :20 Live Read, and an unplayed :40 MP3.'
                    : nextScenarioId === 'set_4'
                      ? 'Resetting demo clock to 9:54:50 AM. Set 4 demonstrates an on-time :00 MP3 play, an on-time :20 Live Read, and a late :40 MP3 played during its Stage 3 Overdue Amber grace window.'
                      : 'Resetting demo clock to 9:54:50 AM. Set 5 demonstrates the new auto-seeded "Up Next: Show Spacer 2" Live Read promo card at 10:40 AM (20m before the 11:00 AM show).',
              targetSeconds: nextPreset.startSeconds,
              targetScenarioId: nextScenarioId,
              remainingMs: 4500,
              totalMs: 4500,
            });
            setRedrawKey((prev) => prev + 1);
            setTimeout(() => {
              scrollToNow();
              handleScrollContainer();
            }, 50);
            return;
          }
        }

        setSimClockSeconds(activeScenario.endSeconds);
        setIsSimRunning(false);
        setIsPlayingAllSets(false);
        return;
      }

      if (!activeScenario.jumpIdleGaps) {
        setSimClockSeconds(rawNext);
        return;
      }

      // Check if rawNext is inside an active ±10s event window
      const insideWindow = merged.find((m) => rawNext >= m.start && rawNext <= m.end);
      if (insideWindow) {
        setSimClockSeconds(rawNext);
        return;
      }

      // Otherwise find the next upcoming event window after rawNext
      const nextWindow = merged.find((m) => m.start > rawNext);
      if (nextWindow && nextWindow.start < activeScenario.endSeconds) {
        const fromLabel = formatSecondsToClockLabel(simClockSeconds);
        const toLabel = formatSecondsToClockLabel(nextWindow.start);
        const skippedSec = Math.max(1, Math.round(nextWindow.start - simClockSeconds));
        const skippedMin = Math.floor(skippedSec / 60);
        const skippedRemSec = skippedSec % 60;
        const skippedDurationStr =
          skippedMin > 0 ? `+${skippedMin}m ${skippedRemSec}s` : `+${skippedRemSec}s`;

        setLastJumpNotice(`Fast-forwarding gap (${fromLabel} to ${toLabel})`);
        setDemoPauseState({
          type: 'gap_jump',
          title: 'Fast-Forwarding Quiet Broadcast Gap',
          subtitle: `${fromLabel} to ${toLabel} (${skippedDurationStr})`,
          description: `No card changes or alert transitions occur during this quiet interval. Advancing clock to 10 seconds before the next event.`,
          fromTimeLabel: fromLabel,
          toTimeLabel: toLabel,
          targetSeconds: nextWindow.start,
          remainingMs: 2800,
          totalMs: 2800,
          nextEventTitle: nextWindow.title,
        });
        return;
      }

      setSimClockSeconds(rawNext);
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [
    isSimRunning,
    demoPauseState,
    simClockSeconds,
    simSpeed,
    activeScenario,
    activeScenarioId,
    isPlayingAllSets,
    windowBeforeMinutes,
    windowAfterMinutes,
  ]);

  // Lock all CSS keyframe pulses to the exact same global timeline beat (startTime = 0)
  useEffect(() => {
    if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return;
    const animations = document.getAnimations();
    for (const anim of animations) {
      if (anim.startTime !== 0) {
        try {
          anim.startTime = 0;
        } catch {
          // Ignore read-only timeline animations if any
        }
      }
    }
  }, [
    simClockSeconds,
    manualNowFlash,
    leavingCycleElapsedSec,
    forcedCardStage,
    enableAddedFlash,
    enableLeavingFlash,
    enableCardUrgency,
    enableBlinkOnly,
    items,
    activeViewMode,
  ]);

  const currentClockMinutes = simClockSeconds / 60;

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

    const containerRect = container.getBoundingClientRect();

    for (const spacer of enabledSpacers) {
      const el = container.querySelector(`[data-spacer-id="${spacer.id}"]`) as HTMLElement | null;
      if (el) {
        const elRect = el.getBoundingClientRect();
        const top = elRect.top - containerRect.top;
        const offsetHeight = elRect.height || el.offsetHeight || 36;
        const bottom = top + offsetHeight;
        const offsetTop = top + scrollTop;

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
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const elOffsetTop = elRect.top - containerRect.top + container.scrollTop;
    const targetScrollTop = Math.max(0, elOffsetTop - 8);
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
              ? "bg-slate-900/10 text-slate-700 border-slate-900/15 rec-pinned-current-badge"
              : "bg-purple-100 text-purple-700 border-purple-300 rec-pinned-next-badge"
          )}>
            {position === 'top' ? 'Current' : 'Next'}
          </span>
        </div>
      </div>
    );
  };

  // Natural Timeline In-Flow Show Spacer Card
  const renderInFlowSpacerCard = (spacer: MockShowSpacer, isExpanded: boolean = false) => {
    return (
      <div
        key={`in-flow-spacer-${spacer.id}`}
        data-spacer-id={spacer.id}
        className="w-full py-1 pr-1 relative shrink-0 select-none"
        style={{ backgroundColor: spacer.shadeBg }}
      >
        <div 
          className={cn(
            "absolute left-0 top-0 bottom-0 z-10",
            isExpanded ? "w-1.5" : "w-1"
          )}
          style={{ backgroundColor: spacer.shadeBg }} 
          title={`Active during show: ${spacer.name}`}
        />
        <div
          className={cn(
            "flex items-stretch relative border overflow-hidden rounded-none shadow-sm",
            isExpanded
              ? "ml-1.5 min-h-[2.25rem]"
              : "ml-1 min-h-[2rem]"
          )}
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
      </div>
    );
  };

  const getActiveSpacerForMinutes = (cardMinutes: number): MockShowSpacer => {
    const enabledSorted = showSpacers
      .filter((s) => s.enabled)
      .map((s) => ({ spacer: s, minutes: parseTimeToMinutes(s.time) }))
      .sort((a, b) => a.minutes - b.minutes);
    if (enabledSorted.length === 0) {
      return DEFAULT_SHOW_SPACERS[0];
    }
    let active = enabledSorted[0].spacer;
    for (const entry of enabledSorted) {
      if (entry.minutes <= cardMinutes) {
        active = entry.spacer;
      } else {
        break;
      }
    }
    return active;
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
  }, [activeViewMode, centerSimulatedCount, enabledCardIds, mockWindowHeight, windowBeforeMinutes, windowAfterMinutes, showLookaroundHours, showSpacers, redrawKey, showSettingsModal]);

  const toggleCardVisibility = (id: string) => {
    setEnabledCardIds((prev) =>
      prev.includes(id) ? prev.filter((cardId) => cardId !== id) : [...prev, id]
    );
  };

  const handleSelectAllCards = () => {
    setEnabledCardIds(items.map((i) => i.id));
  };

  const handleDeselectAllCards = () => {
    setEnabledCardIds([]);
  };

  const handleTogglePlay = (id: string) => {
    const stampedTime = formatMinutesToTimeLabel(Math.floor(simClockSeconds / 60));
    setManualPlayElapsedMap((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) {
        delete next[id];
      } else {
        next[id] = 0;
      }
      return next;
    });
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.isPlaying) {
            return {
              ...item,
              isPlaying: false,
              status: 'played',
              isPlayed: true,
              playedTime: stampedTime,
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
    const stampedTime = formatMinutesToTimeLabel(Math.floor(simClockSeconds / 60));
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            status: 'read',
            isPlayed: true,
            playedTime: stampedTime,
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
      name: `Show Spacer ${nextIndex} (5:00 PM)`,
      shortName: `Show Spacer ${nextIndex}`,
      time: '5:00 PM',
      enabled: true,
      includeInUpNext: true,
      host: `Host ${nextIndex}`,
      description: `You are listening to Show Spacer ${nextIndex} with Host ${nextIndex}. Coming up this hour: station updates, community calendar highlights, and featured selections.`,
      shadeBg: isOdd ? 'var(--show-shade-odd-bg)' : 'var(--show-shade-even-bg)',
      shadeBorder: isOdd ? 'var(--show-shade-odd-border)' : 'var(--show-shade-even-border)',
    };
    setShowSpacers((prev) => [...prev, newSpacer]);
  };

  const handleRemoveShowSpacer = (id: string) => {
    setShowSpacers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleReset = () => {
    const preset = SCENARIO_PRESETS[activeScenarioId];
    setItems(preset.items);
    setSelectedScript(null);
    setWindowBeforeMinutes(5);
    setWindowAfterMinutes(5);
    setShowLookaroundHours(1);
    setEnableUpNextPromos(true);
    setUpNextMinutesBefore(20);
    setCenterSimulatedCount('auto');
    setMockWindowHeight(DEFAULT_MOCK_WINDOW_HEIGHT);
    setEnabledCardIds(preset.items.map((i) => i.id));
    setShowSpacers(DEFAULT_SHOW_SPACERS);
    setTopPinnedSpacer(null);
    setBottomPinnedSpacer(null);
    setIsSimRunning(false);
    setIsPlayingAllSets(false);
    setDemoPauseState(null);
    setManualPlayElapsedMap({});
    setSimClockSeconds(preset.startSeconds);
    setManualNowFlash('none');
    setForcedCardStage('auto');
    setLastJumpNotice(null);
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
  const renderCurrentCard = (item: MockLiveItem, isPreMode: boolean = false) => {
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
    const isPre = isPreMode;
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
          title={!isVerified ? `${item.errorMessage || "File not found."} — Admin Contact: ${resolvedAdminContact}` : undefined}
          style={{
            borderLeftColor: !isVerified
              ? '#f43f5e'
              : item.isUpNextPromo
                ? '#0d9488'
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
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <div className="flex items-center gap-1 min-w-0">
                    <AlertCircle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                    <span className="text-xs font-bold text-red-600 uppercase tracking-tighter truncate">
                      {item.errorMessage || "File not found."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHelpPopupCard(item);
                    }}
                    title={`Admin Contact: ${resolvedAdminContact}`}
                    className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-tight flex items-center gap-0.5 cursor-pointer"
                  >
                    <HelpCircle className="w-2.5 h-2.5 shrink-0" />
                    <span>Get Help</span>
                  </button>
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
   * Uses current simulated broadcast clock (default 10:00:00 AM).
   */
  const formatTimeUntil = (slotIso: string, timeLabel?: string): string => {
    try {
      if (timeLabel) {
        const slotMins = parseTimeToMinutes(timeLabel);
        const diffMins = Math.max(0, Math.ceil(slotMins - currentClockMinutes));
        const hours = Math.floor(diffMins / 60);
        const minutes = diffMins % 60;
        return `in ${hours}:${minutes.toString().padStart(2, '0')}`;
      }
      const slotTime = new Date(slotIso).getTime();
      const refTime = new Date('2026-10-07T10:00:00.000Z').getTime() + (simClockSeconds - SIM_START_SECONDS) * 1000;
      const diffMs = slotTime - refTime;
      if (diffMs <= 0) return 'in 0:00';
      const totalMinutes = Math.ceil(diffMs / 60000);
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
    const isCurrentlyPlaying = !!item.isPlaying && assignedStatus !== 'played';
    const played = !!item.isPlayed || assignedStatus === 'played' || assignedStatus === 'read';

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
    const isMutedGray = !isNow && !isMissed && isVerified;

    // =======================================================================
    // ROADMAP #17: PER-CARD ESCALATING URGENCY CALCULATION (IN NOW SECTION)
    // =======================================================================
    const cardMinutes = parseTimeToMinutes(item.timeLabel);
    const isUnplayedNowCard = isNow && isVerified && !isCurrentlyPlaying && !played && (isReadNow || isPlayNow);
    const minutesSinceSlot = currentClockMinutes - cardMinutes;
    const minutesSinceEntry = currentClockMinutes - (cardMinutes - windowAfterMinutes);

    const isCardNewlyAdded =
      isUnplayedNowCard &&
      (manualNowFlash === 'added' ||
        forcedCardStage === 1 ||
        (simClockSeconds > activeScenario.startSeconds && minutesSinceEntry >= 0 && minutesSinceEntry <= 0.45));

    let cardUrgencyStage: 0 | 1 | 2 | 3 | 4 = 0;

    if (enableCardUrgency && isUnplayedNowCard) {
      if (forcedCardStage !== 'auto') {
        cardUrgencyStage = forcedCardStage;
      } else {
        // Option 3A: Stepped 4-Stage Highlights
        // Stage 1: Early in NOW (+5m to 0m before slot)
        // Stage 2 (Due): 0m to 2m past slot (first 40% of grace window)
        // Stage 3 (Overdue / Amber): 2m to 4m past slot (40% to 80% of grace window)
        // Stage 4 (Leaving / Rose): 4m to 5m past slot (final 20% / last 60s before Missed)
        if (minutesSinceSlot < 0) {
          cardUrgencyStage = 1;
        } else if (minutesSinceSlot < Math.max(1, windowBeforeMinutes * 0.4)) {
          cardUrgencyStage = 2;
        } else if (minutesSinceSlot < Math.max(2, windowBeforeMinutes * 0.8)) {
          cardUrgencyStage = 3;
        } else {
          cardUrgencyStage = 4;
        }
      }
    }

    // Stage 2 (Due) and Stage 3 (Amber) only flash borders; only Stage 4 recolors the card interior
    const cardUrgencySurfaceClass =
      cardUrgencyStage === 4 ? 'tobe-card-urgency-4' : '';

    const cardUrgencyAnimClass = !enableCardUrgency || !isUnplayedNowCard
      ? ''
      : cardUrgencyStage === 4
        ? 'amp-card-stage4-strobe'
        : cardUrgencyStage === 3
          ? 'amp-card-stage3-pulse'
          : cardUrgencyStage === 2
            ? 'amp-card-stage2-pulse'
            : isCardNewlyAdded
              ? 'amp-card-entry-pulse'
              : '';

    // TO-BE BORDER CLASS (Semantic Split: Missed = Rose/Red alert; !isVerified = Amber/Orange warning)
    const cardBorderClass = !isVerified
      ? "border-amber-500"
      : isCurrentlyPlaying
        ? "border-purple-600 ring-1 ring-purple-600/40"
        : (isReadNow || isPlayNow)
          ? (isScript ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-purple-600 ring-1 ring-purple-600/30")
          : isMissed
            ? "border-rose-500"
            : "border-slate-300";

    // TO-BE BACKGROUND CLASS
    const cardBgClass = !isVerified
      ? "bg-[#fffbeb]"
      : isCurrentlyPlaying
        ? "bg-white"
        : isReadNow
          ? "bg-[#f0fdf4]"
          : isPlayNow
            ? "bg-[#faf5ff]"
            : isMissed
              ? "bg-[#fff1f2]"
              : "bg-white";

    // TO-BE OPACITY CLASS (Muted gray model applied to all non-Now verified cards except missed)
    const cardOpacityClass = isMutedGray
      ? "opacity-75"
      : (isMissed || !isVerified)
        ? "opacity-95"
        : "opacity-100";

    const activeSpacer = getActiveSpacerForMinutes(cardMinutes);

    // Group A (NOW cards): "by 10:05" (12-hour time with AM/PM hidden so header stays on 1 row)
    const playByTimeStr = formatMinutesToTimeLabel(cardMinutes + windowBeforeMinutes).replace(/\s*[AP]M$/i, '');
    const playByBadgeLabel = `by ${playByTimeStr}`;

    // Group B (MISSED cards): "3m ago" calculated from the missed buffer border (cardMinutes + windowBeforeMinutes)
    const missedBufferBorderMinutes = cardMinutes + windowBeforeMinutes;
    const missedMinutesAgo = Math.max(1, Math.floor(currentClockMinutes - missedBufferBorderMinutes));
    const missedAgoLabel = `${missedMinutesAgo}m ago`;

    // Simulated playback progress (0s -> 30s) for both auto-events and manual play
    const startPlayEvt = activeScenario.autoEvents.find(
      (ev) => ev.itemId === item.id && ev.action === 'start_play'
    );
    const completePlayEvt = activeScenario.autoEvents.find(
      (ev) => ev.itemId === item.id && ev.action === 'complete_play'
    );
    const isWithinAutoPlaySpan =
      !!startPlayEvt &&
      simClockSeconds >= startPlayEvt.atSeconds &&
      (!completePlayEvt || simClockSeconds <= completePlayEvt.atSeconds);

    const rawPlayingElapsedSec = !isCurrentlyPlaying
      ? 0
      : manualPlayElapsedMap[item.id] !== undefined
        ? manualPlayElapsedMap[item.id]
        : isWithinAutoPlaySpan && startPlayEvt
          ? simClockSeconds - startPlayEvt.atSeconds
          : item.id === 'mp3-playing'
            ? 14 + Math.max(0, simClockSeconds - activeScenario.startSeconds)
            : 0;

    const playingElapsedSec = Math.max(0, Math.min(30, rawPlayingElapsedSec));
    const playingElapsedWholeSec = Math.floor(playingElapsedSec);
    const playingRemainingWholeSec = Math.max(0, 30 - playingElapsedWholeSec);
    const playingElapsedLabel = `0:${playingElapsedWholeSec.toString().padStart(2, '0')}`;
    const playingCountdownLabel = `-0:${playingRemainingWholeSec.toString().padStart(2, '0')}`;

    return (
      <div 
        key={`tobe-card-${item.id}`} 
        className={cn(
          "flex items-stretch gap-2 w-full relative shrink-0 py-1 pr-1",
          isExpanded ? "min-h-[5.5rem]" : isMissed ? "min-h-[5.25rem]" : "min-h-[4.5rem]"
        )}
        style={{ backgroundColor: activeSpacer.shadeBg }}
      >
        {/* Left show border shade indicator */}
        <div 
          className={cn(
            "absolute left-0 top-0 bottom-0 z-10",
            isExpanded ? "w-1.5" : "w-1"
          )}
          style={{ backgroundColor: activeSpacer.shadeBg }}
          title={`Active during show: ${activeSpacer.name}`}
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
          title={!isVerified ? `${item.errorMessage || "File not found."} — Admin Contact: ${resolvedAdminContact}` : undefined}
          style={{
            borderLeftColor: !isVerified
              ? '#f59e0b'
              : cardUrgencyStage === 4
                ? '#e11d48'
                : cardUrgencyStage === 3
                  ? '#f59e0b'
                  : item.isUpNextPromo
                    ? '#0d9488'
                    : isScript
                      ? '#3b82f6'
                      : '#a855f7',
          }}
          className={cn(
            "flex-1 min-w-0 rounded border shadow-sm transition-colors flex flex-col justify-between select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left overflow-hidden",
            isExpanded ? "p-2 gap-0.5 ml-1.5" : "p-1.5 gap-0.5 ml-1",
            "border-l-[4px] rounded-l-none",
            !isScript && isVerified ? "pb-[1px]" : "",
            !isVerified ? "tobe-missed-amber-card" : isMissed ? "tobe-alert-card" : "",
            cardBorderClass,
            cardBgClass,
            cardOpacityClass,
            cardUrgencySurfaceClass,
            cardUrgencyAnimClass
          )}
        >
          {/* Header: Date & Time + Status Pill */}
          <div className={cn(
            "flex justify-between items-center gap-1 bg-slate-50 rounded-t shrink-0 border-b border-slate-200/80 whitespace-nowrap",
            isExpanded ? "-mx-2 -mt-2 px-2 pt-1 pb-[2px]" : "-mx-1.5 -mt-1.5 px-1.5 py-0.5"
          )}>
            <div className="flex items-center gap-1 leading-none whitespace-nowrap shrink-0">
              <span className={cn(
                "uppercase font-black tracking-tighter text-xs", 
                isExpanded ? "text-slate-700" : isMutedGray ? "text-slate-500" : "text-slate-600"
              )}>
                {item.dateLabel}
              </span>
              <span className={cn(
                "font-sans font-black tabular-nums text-xs",
                !isVerified
                  ? "text-amber-800"
                  : isMissed || cardUrgencyStage === 4
                    ? "text-rose-700"
                    : (isReadNow ? "text-emerald-700" : isPlayNow ? "text-purple-700" : isMutedGray ? "text-slate-600" : "text-slate-700")
              )}>
                {item.timeLabel}
              </span>
            </div>

            {/* To-Be Status Badges */}
            {isCurrentlyPlaying ? (
              <span className={cn("bg-purple-600 text-white rounded font-black uppercase leading-none animate-pulse shrink-0", isExpanded ? "text-xs px-2 py-0.5" : "text-xs px-1.5 py-0.5")}>
                Playing
              </span>
            ) : (isReadNow || isPlayNow) ? (
              <span className={cn(
                cardUrgencyStage === 4
                  ? "bg-rose-600 text-white font-black"
                  : "bg-slate-200 text-slate-700 font-bold rec-distinct-header-pill",
                "rounded tabular-nums leading-none whitespace-nowrap shrink-0",
                isExpanded ? "text-xs px-1.5 py-0.5" : "text-xs px-1.5 py-0.5"
              )}>
                {playByBadgeLabel}
              </span>
            ) : isMissed ? (
              <span className={cn(
                "bg-rose-600 text-white rounded flex flex-col items-center justify-center leading-none",
                isExpanded ? "px-2.5 py-1 gap-0.5" : "px-2 py-0.5 gap-0.5"
              )}>
                <span className="text-xs font-black uppercase leading-none">Missed</span>
                <span className="text-[10px] font-bold tabular-nums leading-none">
                  {missedAgoLabel}
                </span>
              </span>
            ) : isNext ? (
              <span className={cn(
                "bg-slate-200 text-slate-700 rounded font-bold tabular-nums leading-none rec-distinct-header-pill",
                isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1"
              )}>
                {formatTimeUntil(item.slotIso, item.timeLabel)}
              </span>
            ) : (played || effectiveStatus === 'read' || effectiveStatus === 'played') ? (
              <span className={cn(
                "bg-slate-200 text-slate-700 rounded font-bold uppercase leading-none rec-distinct-header-pill",
                isExpanded ? "text-xs px-2.5 py-1" : "text-xs px-2 py-1"
              )}>
                {isScript ? 'Read' : 'Played'}
              </span>
            ) : null}
          </div>

          {/* Track Row: Title + Action Icon */}
          <div className={cn(
            "flex justify-between gap-1.5",
            isExpanded || isMissed ? "flex-1 items-stretch mt-[2px] mb-0.5" : "items-center shrink-0"
          )}>
            <div className={cn(
              "leading-tight break-words flex-1 flex flex-col justify-center",
              isExpanded ? "text-sm font-black line-clamp-2" : isMissed ? "text-xs font-bold line-clamp-2" : "text-xs font-bold line-clamp-1",
              isCurrentlyPlaying
                ? "text-purple-700"
                : cardUrgencyStage === 4
                  ? "text-rose-900 font-black"
                  : isReadNow
                    ? "text-emerald-800 font-black"
                    : isMutedGray
                      ? "text-slate-600"
                      : "text-slate-800"
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
                  isExpanded
                    ? "self-stretch px-3 my-[1px] rounded-lg"
                    : isMissed
                      ? "self-stretch px-2.5 my-[1px] rounded-md"
                      : "rounded-full p-1",
                  !isVerified ? "bg-amber-50 text-amber-600 border-amber-300" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white border-slate-700" :
                  isMissed || cardUrgencyStage === 4 ? "bg-rose-600 text-white hover:bg-rose-700 border-rose-500 shadow-md" :
                  isReadNow ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700 border-emerald-500" :
                  "bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn"
                )}
                title={!isVerified ? "Invalid or missing file" : isCurrentlyPlaying ? "Stop Audio" : played ? "Read Again" : isReadNow ? "Read Now" : "Display Script"}
              >
                {!isVerified ? (
                  <X className={isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5"} />
                ) : isCurrentlyPlaying ? (
                  <Square className={cn(isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5", "fill-current")} />
                ) : played ? (
                  <RefreshCw className={isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5"} />
                ) : (
                  <FileText className={isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5"} />
                )}
              </button>
            ) : (
              <div 
                className={cn(
                  "shrink-0 transition-colors shadow-sm flex items-center justify-center border",
                  isExpanded
                    ? "self-stretch px-3 my-[1px] rounded-lg"
                    : isMissed
                      ? "self-stretch px-2.5 my-[1px] rounded-md"
                      : "rounded-full p-1",
                  !isVerified ? "bg-amber-50 text-amber-600 border-amber-300" :
                  isCurrentlyPlaying ? "bg-slate-900 text-white border-slate-700" :
                  isMissed || cardUrgencyStage === 4 ? "bg-rose-600 text-white border-rose-500 shadow-md" :
                  isPlayNow ? "bg-purple-600 text-white shadow-md border-purple-500" :
                  "bg-slate-100 text-slate-500 border-slate-300 rec-muted-action-btn"
                )}
                title={!isVerified ? "Invalid or missing file" : played ? "Play Again" : undefined}
              >
                {!isVerified ? (
                  <X className={isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5"} />
                ) : isCurrentlyPlaying ? (
                  <Square className={cn(isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5", "fill-current")} />
                ) : played ? (
                  <RefreshCw className={isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5"} />
                ) : (
                  <Play className={cn(isExpanded ? "w-5 h-5" : isMissed ? "w-4 h-4" : "w-2.5 h-2.5", "fill-current")} />
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
                        <span className="font-bold uppercase tracking-tighter text-xs text-rose-700">
                          Missed
                        </span>
                      </>
                    ) : isReadNow ? (
                      <>
                        <Clock className={cn(
                          "w-2.5 h-2.5",
                          cardUrgencyStage === 4 ? "text-rose-600" : "text-emerald-600"
                        )} />
                        <span className={cn(
                          "font-black uppercase tracking-tighter text-xs",
                          cardUrgencyStage === 4 ? "text-rose-700" : "text-emerald-700"
                        )}>
                          Read Now
                        </span>
                      </>
                    ) : isPlayNow ? (
                      <>
                        <Clock className={cn(
                          "w-2.5 h-2.5",
                          cardUrgencyStage === 4 ? "text-rose-600" : "text-purple-600"
                        )} />
                        <span className={cn(
                          "font-black uppercase tracking-tighter text-xs",
                          cardUrgencyStage === 4 ? "text-rose-700" : "text-purple-700"
                        )}>
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
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <div className="flex items-center gap-1 min-w-0">
                    <AlertCircle className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                    <span className="font-bold uppercase tracking-tighter text-xs truncate text-amber-700">
                      {item.errorMessage || "File not found."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHelpPopupCard(item);
                    }}
                    title={`Admin Contact: ${resolvedAdminContact}`}
                    className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-tight flex items-center gap-0.5 cursor-pointer"
                  >
                    <HelpCircle className="w-2.5 h-2.5 shrink-0" />
                    <span>Get Help</span>
                  </button>
                </div>
              )}
              
              {isCurrentlyPlaying ? (
                <div className="flex items-center gap-1 font-sans font-bold tabular-nums leading-none text-purple-600 text-xs">
                  <span>{playingElapsedLabel}</span>
                  <span className="opacity-30">/</span>
                  <span>{playingCountdownLabel}</span>
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
                currentTime={isCurrentlyPlaying ? playingElapsedSec : 0}
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
    <div className="flex flex-col h-full relative overflow-y-auto pb-8">
      {/* 0. View Toggle Bar (Current vs To-Be vs To-Be Merged) */}
      <div className="flex items-center justify-between bg-slate-100 border-b border-slate-300 px-2 py-1 shrink-0 mb-1.5 max-w-[520px] w-full mx-auto rounded gap-1.5">
        <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded border border-slate-300">
          <button
            type="button"
            onClick={() => setActiveViewMode('current')}
            className={cn(
              "px-2 py-0.5 text-xs font-bold rounded uppercase transition-colors cursor-pointer",
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
              "px-2 py-0.5 text-xs font-bold rounded uppercase transition-colors cursor-pointer",
              activeViewMode === 'to_be'
                ? "bg-purple-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            To-Be
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('to_be_merged')}
            className={cn(
              "px-2 py-0.5 text-xs font-bold rounded uppercase transition-colors cursor-pointer",
              activeViewMode === 'to_be_merged'
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            To-Be Merged
          </button>
        </div>

        {activeViewMode === 'to_be' ? (
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-purple-100 hover:bg-purple-200 text-purple-900 rounded border border-purple-300 transition-colors cursor-pointer shadow-2xs shrink-0"
            title="Open time window and reset settings pop-up"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-700" />
            <span>Settings</span>
          </button>
        ) : activeViewMode === 'to_be_merged' ? (
          <button
            type="button"
            onClick={() => setShowMergedExportPopup((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-900 rounded border border-blue-300 transition-colors cursor-pointer shadow-2xs shrink-0"
            title="Toggle the mock Export pop-up inside the 250px Prerecord window"
          >
            <Download className="w-3.5 h-3.5 text-blue-700" />
            <span>{showMergedExportPopup ? 'Hide Pop-Up' : 'Show Pop-Up'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-200 transition-colors cursor-pointer font-medium shrink-0"
            title="Reset sandbox mock data to defaults"
          >
            Reset
          </button>
        )}
      </div>

      {/* Viewport Frame Wrapper: Left-Justified Demo Narrator & Right-Justified AMP Live Window */}
      <div className="w-full flex flex-row items-start justify-between gap-3 shrink-0">
        {activeViewMode === 'to_be_merged' && (
          <div className="flex-1 min-w-[260px] z-20 font-sans text-left select-none">
            <div
              style={{ height: `${mockWindowHeight}px`, minHeight: `${mockWindowHeight}px` }}
              className="rounded-xl border-2 border-slate-300 bg-white p-3 shadow-lg flex flex-col gap-2.5 overflow-y-auto"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      #21 To-Be Merged (250px Mockup)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      250px Export Pop-Up (left) &amp; 250px Main Prerecord Window (right)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setMergedHasPlaylistItems((prev) => !prev)}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] font-black uppercase border cursor-pointer shrink-0",
                      mergedHasPlaylistItems
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-slate-100 text-slate-600 border-slate-300"
                    )}
                    title="Simulate whether playlist items exist for the selected show"
                  >
                    {mergedHasPlaylistItems ? 'Playlist Items: Yes' : 'Playlist Items: None'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMergedExportPopup((prev) => !prev)}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] font-black uppercase border cursor-pointer shrink-0",
                      showMergedExportPopup
                        ? "bg-slate-800 text-white border-slate-900"
                        : "bg-blue-600 text-white border-blue-700"
                    )}
                  >
                    {showMergedExportPopup ? 'Hide Overlay on Right' : 'Overlay on Right'}
                  </button>
                </div>
              </div>

              {/* True 250px Full-Height Pop-Up Preview Side-by-Side with the 250px Main Prerecord Window */}
              <div className="flex-1 min-h-0 flex flex-col items-center justify-start">
                <div className="w-[250px] max-w-[250px] flex-1 min-h-0 flex flex-col border-2 border-slate-400 rounded-xl bg-white shadow-md overflow-hidden">
                  {/* Modal Header */}
                  <div className="bg-slate-900 text-white px-2 py-1.5 flex items-center justify-between gap-1 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Download className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="text-[11px] font-black uppercase tracking-wider truncate">
                        Export Show
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      250px Pop-Up
                    </span>
                  </div>

                  {/* Show Subheader (No Item / Copy Counts) */}
                  <div className="px-2 py-1 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 shrink-0 truncate">
                    Show Spacer 1 · Wed, Oct 07 (9:00–11:00 AM)
                  </div>

                  {/* Top Stacked Action Controls */}
                  <div className="p-2 space-y-1.5 border-b border-slate-200 bg-slate-50 shrink-0">
                    {/* 1. Export Files */}
                    <button
                      type="button"
                      className="w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded border-b-[3px] border-blue-800 font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Export Files...</span>
                    </button>

                    {/* 2. Mark All as Logged (Darker Blue Variant — No Count) */}
                    <button
                      type="button"
                      className="w-full py-1.5 px-2 bg-blue-800 hover:bg-blue-700 text-white rounded border-b-[3px] border-blue-950 font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Mark All as Logged</span>
                    </button>
                  </div>

                  {/* Bottom Section: 3-Button Radio Selector (Plan / Playlist / Live Reads) + Copy + Internal Scrollbar */}
                  <div className="flex-1 min-h-0 flex flex-col bg-white">
                    <div className="px-1 py-1 bg-slate-100 border-b border-slate-200 flex items-center justify-start gap-1 shrink-0">
                      {/* 3-Button Segmented Radio Selector (No Dots, Explicit Visual Spacers) */}
                      <div
                        className="inline-flex items-stretch rounded border border-slate-300 bg-white overflow-hidden shrink-0"
                        role="radiogroup"
                        aria-label="Preview selector"
                      >
                        {(
                          [
                            { id: 'plan', label: 'Plan' },
                            { id: 'playlist', label: '.m3u LIST' },
                            { id: 'live_reads', label: 'Live Reads' },
                          ] as const
                        ).map((opt, idx) => {
                          const isSelected = mergedPreviewMode === opt.id;
                          return (
                            <React.Fragment key={opt.id}>
                              {idx > 0 && (
                                <span
                                  className="w-px self-stretch bg-slate-300 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              <button
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => setMergedPreviewMode(opt.id)}
                                className={cn(
                                  "px-1.5 py-1 text-[10px] font-black tracking-tighter leading-none whitespace-nowrap cursor-pointer transition-colors",
                                  opt.id !== 'playlist' && "uppercase",
                                  isSelected
                                    ? "bg-blue-600 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                {opt.label}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Single "Copy" Button */}
                      <button
                        type="button"
                        className="px-1.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-tighter leading-none flex items-center gap-0.5 cursor-pointer shrink-0 shadow-2xs"
                        title={`Copy ${mergedPreviewMode === 'plan' ? 'Plan' : mergedPreviewMode === 'playlist' ? '.m3u LIST' : 'Live Reads'}`}
                      >
                        <Copy className="w-2.5 h-2.5 shrink-0" />
                        <span>Copy</span>
                      </button>
                    </div>

                    {/* Internal Scrollable Preview Body */}
                    <div className="p-1.5 overflow-y-auto flex-1 min-h-0 text-left">
                      {mergedPreviewMode === 'plan' && (
                        <div className="space-y-1 font-mono text-[10px] text-slate-700 leading-snug">
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-sans">
                            <div className="font-black text-slate-900 text-[10px] uppercase">
                              Show Spacer 1 — Broadcast Plan
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Wed, Oct 07, 2026 · 9:00 AM – 11:00 AM
                            </div>
                          </div>
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 space-y-1">
                            <div>
                              <span className="font-bold text-slate-900">9:39 AM</span> [MP3] MP3 Audio Played Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">9:40 AM</span> [READ] LR Read Example (0:25)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">9:57 AM</span> [READ] LR Read Now Example (0:20)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:00 AM</span> [MP3] MP3 Due Now Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:15 AM</span> [READ] Live Read Future Example (0:15)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:20 AM</span> [MP3] MP3 Future Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:40 AM</span> [PROMO] Up Next: Show Spacer 2 (0:15)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">11:00 AM</span> [MP3] Time Gated Future Example (0:30)
                            </div>
                          </div>
                        </div>
                      )}

                      {mergedPreviewMode === 'playlist' && (
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700 space-y-1.5 leading-snug">
                          <div className="font-bold text-slate-500">#EXTM3U</div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,9:39 AM - MP3 Audio Played Example</div>
                            <div className="font-bold text-slate-900 break-all">01_0939_MP3_Audio_Played_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,10:00 AM - MP3 Due Now Example</div>
                            <div className="font-bold text-slate-900 break-all">02_1000_MP3_Due_Now_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,10:20 AM - MP3 Future Example</div>
                            <div className="font-bold text-slate-900 break-all">03_1020_MP3_Future_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,11:00 AM - Time Gated Future Example</div>
                            <div className="font-bold text-slate-900 break-all">04_1100_Time_Gated_Future_Example.mp3</div>
                          </div>
                        </div>
                      )}

                      {mergedPreviewMode === 'live_reads' && (
                        <div className="space-y-1.5">
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-500 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              9:40 AM · LR Read Example
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              This is the script for LR Read Example. Has already been read on air and logged.
                            </p>
                          </div>

                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-500 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              9:57 AM · LR Read Now Example
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              This is the script for LR Read Now Example. Scheduled at 9:57 AM within the active on-air window.
                            </p>
                          </div>

                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-400 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              10:40 AM · Up Next: Show Spacer 2
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              Up Next is Show Spacer 2 with Host 2 from 11:00 AM to 1:00 PM every Wednesday.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeViewMode === 'to_be' && (() => {
          const scenarioEventWindows = buildScenarioEventWindows(
            activeScenario,
            windowBeforeMinutes,
            windowAfterMinutes
          );
          const currentEventWindow = scenarioEventWindows.find(
            (w) => simClockSeconds >= w.start && simClockSeconds <= w.end
          );
          const upcomingEventWindow = scenarioEventWindows.find(
            (w) => w.start > simClockSeconds
          );
          const activeFocusWindow =
            currentEventWindow || upcomingEventWindow || scenarioEventWindows[scenarioEventWindows.length - 1];

          const badgeToneClasses: Record<ScenarioEventWindow['badgeTone'], string> = {
            sky: 'bg-sky-100 text-sky-900 border-sky-300',
            purple: 'bg-purple-100 text-purple-900 border-purple-300',
            emerald: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            amber: 'bg-amber-100 text-amber-900 border-amber-300',
            rose: 'bg-rose-100 text-rose-900 border-rose-300',
          };

          const activeRowToneClasses: Record<ScenarioEventWindow['badgeTone'], string> = {
            sky: 'bg-sky-50 border-sky-500 text-sky-950 ring-2 ring-sky-400/50 shadow-sm',
            purple: 'bg-purple-50 border-purple-500 text-purple-950 ring-2 ring-purple-400/50 shadow-sm',
            emerald: 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-400/50 shadow-sm',
            amber: 'bg-amber-50 border-amber-500 text-amber-950 ring-2 ring-amber-400/50 shadow-sm',
            rose: 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-400/50 shadow-sm',
          };

          const activeStagePillClasses: Record<ScenarioEventWindow['badgeTone'], string> = {
            sky: 'bg-sky-600 text-white border-sky-700',
            purple: 'bg-purple-600 text-white border-purple-700',
            emerald: 'bg-emerald-600 text-white border-emerald-700',
            amber: 'bg-amber-500 text-slate-950 border-amber-600',
            rose: 'bg-rose-600 text-white border-rose-700',
          };

          const setOrderIndex = DEMO_SEQUENCE_ORDER.indexOf(activeScenarioId);

          const isSetTransition = demoPauseState?.type === 'set_transition';
          const isGapJump = demoPauseState?.type === 'gap_jump';

          const slotGroups: Array<{
            slotDescriptor: string;
            windows: Array<{ win: ScenarioEventWindow; globalIdx: number }>;
          }> = [];
          const slotGroupMap = new Map<
            string,
            {
              slotDescriptor: string;
              windows: Array<{ win: ScenarioEventWindow; globalIdx: number }>;
            }
          >();
          scenarioEventWindows.forEach((win, globalIdx) => {
            const key = win.subtitle;
            let group = slotGroupMap.get(key);
            if (!group) {
              group = { slotDescriptor: key, windows: [] };
              slotGroupMap.set(key, group);
              slotGroups.push(group);
            }
            group.windows.push({ win, globalIdx });
          });

          return (
            <div className="flex-1 min-w-[260px] z-20 font-sans text-left select-none">
              <div
                style={{ height: `${mockWindowHeight}px`, minHeight: `${mockWindowHeight}px` }}
                className={cn(
                  "rounded-xl border-2 p-3 shadow-lg flex flex-col gap-2.5 transition-colors duration-1000 ease-in-out overflow-hidden",
                  isSetTransition
                    ? "bg-purple-950 text-white border-purple-400"
                    : "bg-white text-slate-800 border-slate-300"
                )}
              >
                {/* Top Header Bar: Fixed Height (28px) */}
                <div className="h-[28px] min-h-[28px] max-h-[28px] flex items-center justify-between gap-2 border-b border-current/15 pb-1.5 shrink-0 transition-colors duration-1000 ease-in-out">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <RadioTower
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 transition-colors duration-1000",
                        isSetTransition
                          ? "text-purple-300 animate-pulse"
                          : isSimRunning
                            ? "text-purple-600 animate-pulse"
                            : "text-slate-500"
                      )}
                    />
                    <span className="text-[11px] font-black uppercase tracking-wider">
                      {isSetTransition ? 'Demo Narrator' : `${activeScenario.label} Focus`}
                    </span>
                  </div>
                  {isPlayingAllSets ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-emerald-500 text-slate-950 shrink-0">
                      Set {setOrderIndex >= 0 ? setOrderIndex + 1 : 1} of {DEMO_SEQUENCE_ORDER.length}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums shrink-0 transition-colors duration-1000",
                        isSetTransition
                          ? "bg-white/15 text-white"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      )}
                    >
                      {formatSecondsToClockLabel(simClockSeconds)}
                    </span>
                  )}
                </div>

                {/* BODY: Taller Fixed Height (180px) so Event Windows list below never jumps when text changes */}
                <div className="h-[180px] min-h-[180px] max-h-[180px] shrink-0 rounded-lg p-3 border border-current/10 bg-slate-50/60 overflow-hidden flex flex-col justify-start transition-colors duration-1000 ease-in-out">
                  {isSetTransition && demoPauseState ? (
                    <div className="h-full flex flex-col justify-start gap-1.5 transition-opacity duration-1000 ease-in-out">
                      <div className="h-[22px] shrink-0 flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-purple-800 text-purple-100 border-purple-500">
                          Next Scenario Reset
                        </span>
                        <span className="text-xs font-black tabular-nums">
                          {(demoPauseState.remainingMs / 1000).toFixed(1)}s
                        </span>
                      </div>

                      <div className="text-sm font-black leading-snug shrink-0">
                        {demoPauseState.title}
                      </div>
                      <div className="text-xs font-bold opacity-90 tabular-nums shrink-0">
                        {demoPauseState.subtitle}
                      </div>
                      <p className="text-xs leading-relaxed opacity-85 flex-1 overflow-hidden">
                        {demoPauseState.description}
                      </p>
                    </div>
                  ) : isGapJump && demoPauseState ? (
                    <div className="h-full flex flex-col justify-start gap-1.5 transition-opacity duration-1000 ease-in-out">
                      <div className="h-[22px] shrink-0 flex items-center gap-2 text-slate-700">
                        <RefreshCw className="w-4 h-4 text-slate-500 animate-spin shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                          Advancing Clock Across Quiet Gap
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-900 leading-snug shrink-0">
                        {demoPauseState.title}
                      </div>
                      <div className="text-xs font-bold text-slate-800 tabular-nums shrink-0">
                        {demoPauseState.subtitle}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed flex-1 overflow-hidden">
                        {demoPauseState.description}
                      </p>
                    </div>
                  ) : manualNowFlash !== 'none' || forcedCardStage !== 'auto' ? (
                    <div className="h-full flex flex-col justify-start gap-1.5 transition-opacity duration-1000 ease-in-out">
                      <div className="h-[22px] shrink-0 flex items-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-purple-100 text-purple-900 border-purple-300">
                          Manual Trigger Active
                        </span>
                      </div>
                      <div className="text-sm font-black text-slate-900 leading-snug shrink-0">
                        {manualNowFlash === 'added'
                          ? 'NOW Section Flash: Item Added'
                          : manualNowFlash === 'leaving'
                            ? 'NOW Section Flash: Item Leaving'
                            : `Forced Card Urgency: Stage ${forcedCardStage}`}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed flex-1 overflow-hidden">
                        {manualNowFlash === 'added'
                          ? 'Previewing the merged Option 1A + 1B sky-blue attention pulse on the whole NOW container when a new unplayed item enters.'
                          : manualNowFlash === 'leaving'
                            ? `Previewing Option 2A rose alert flash (${leavingFlashDurationSec}s flash followed by ${leavingGapDurationSec}s ${leavingGapHighlightMode.toUpperCase()} hold) before an item becomes Missed.`
                            : `Previewing per-card urgency Stage ${forcedCardStage} across all unplayed cards currently inside the NOW section.`}
                      </p>
                    </div>
                  ) : activeFocusWindow ? (
                    <div className="h-full flex flex-col justify-start gap-1.5 transition-colors duration-1000 ease-in-out">
                      <div className="h-[22px] shrink-0 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border transition-colors duration-700",
                            currentEventWindow
                              ? activeStagePillClasses[activeFocusWindow.badgeTone]
                              : badgeToneClasses[activeFocusWindow.badgeTone]
                          )}
                        >
                          {activeFocusWindow.badgeLabel}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                          {formatSecondsToClockLabel(activeFocusWindow.start)} – {formatSecondsToClockLabel(activeFocusWindow.end)}
                        </span>
                      </div>

                      <div className="text-sm font-black text-slate-900 leading-snug shrink-0">
                        {activeFocusWindow.title}
                      </div>
                      <div className="text-xs font-bold text-purple-700 tabular-nums shrink-0">
                        {activeFocusWindow.subtitle}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed flex-1 overflow-hidden">
                        {activeFocusWindow.description}
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Tightened ±10s Event Windows Schedule List Grouped by Announcement Slot Descriptor */}
                <div className="pt-2 border-t border-current/15 flex-1 min-h-0 flex flex-col gap-1.5">
                  <div className="h-[18px] min-h-[18px] max-h-[18px] flex items-center justify-between text-[10px] font-black uppercase tracking-wider opacity-75 shrink-0">
                    <span>{activeScenario.label} Event Windows (±10s)</span>
                    <span>
                      {slotGroups.length} {slotGroups.length === 1 ? 'slot' : 'slots'} · {scenarioEventWindows.length} stages
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
                    {slotGroups.map((group) => {
                      const hasCurrentStageInGroup = group.windows.some(
                        ({ win }) =>
                          !demoPauseState &&
                          simClockSeconds >= win.start &&
                          simClockSeconds <= win.end
                      );
                      return (
                        <div
                          key={group.slotDescriptor}
                          className={cn(
                            "rounded-lg border overflow-hidden transition-colors duration-700 shrink-0",
                            isSetTransition
                              ? "border-white/20 bg-white/5"
                              : hasCurrentStageInGroup
                                ? "border-purple-400 bg-white shadow-xs"
                                : "border-slate-300 bg-white"
                          )}
                        >
                          {/* Parent Card Header: Announcement Slot Descriptor */}
                          <div
                            className={cn(
                              "px-2.5 py-1.5 border-b text-[11px] font-black tracking-tight flex items-center justify-between gap-2 transition-colors duration-700",
                              isSetTransition
                                ? "bg-white/10 border-white/15 text-purple-100"
                                : hasCurrentStageInGroup
                                  ? "bg-purple-50 border-purple-200 text-purple-950"
                                  : "bg-slate-100 border-slate-200 text-slate-800"
                            )}
                          >
                            <span>{group.slotDescriptor}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 shrink-0">
                              {group.windows.length} {group.windows.length === 1 ? 'stage' : 'stages'}
                            </span>
                          </div>

                          {/* Nested Stage Cards with Zero Whitespace Between Them */}
                          <div
                            className={cn(
                              "flex flex-col divide-y",
                              isSetTransition ? "divide-white/15" : "divide-slate-200"
                            )}
                          >
                            {group.windows.map(({ win, globalIdx }) => {
                              const isCurrent =
                                !demoPauseState &&
                                simClockSeconds >= win.start &&
                                simClockSeconds <= win.end;
                              const isPastWin = !demoPauseState && simClockSeconds > win.end;
                              return (
                                <button
                                  key={win.id}
                                  type="button"
                                  onClick={() => {
                                    setDemoPauseState(null);
                                    setForcedCardStage('auto');
                                    setManualNowFlash('none');
                                    setSimClockSeconds(win.start);
                                  }}
                                  className={cn(
                                    "w-full h-[50px] min-h-[50px] max-h-[50px] shrink-0 overflow-hidden text-left px-2.5 py-1.5 rounded-none text-[11px] transition-colors duration-700 ease-in-out cursor-pointer flex flex-col justify-between",
                                    isSetTransition
                                      ? "bg-white/5 text-white/80 hover:bg-white/15"
                                      : isCurrent
                                        ? activeRowToneClasses[win.badgeTone]
                                        : isPastWin
                                          ? "bg-slate-50 text-slate-400 opacity-75 hover:opacity-100"
                                          : "bg-white text-slate-700 hover:bg-slate-50"
                                  )}
                                  title={`Jump to ${formatSecondsToClockLabel(win.start)}`}
                                >
                                  {/* Row 1: Stage Blob (Left) · Occurring Slot (Centered) · Time Window (Right) */}
                                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 shrink-0 w-full">
                                    <div className="justify-self-start flex items-center">
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-colors duration-700 shrink-0",
                                          isCurrent
                                            ? activeStagePillClasses[win.badgeTone]
                                            : badgeToneClasses[win.badgeTone]
                                        )}
                                      >
                                        {win.badgeLabel}
                                      </span>
                                    </div>
                                    <div className="justify-self-center flex items-center justify-center min-w-[68px] h-[18px]">
                                      {isCurrent && (
                                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider shrink-0">
                                          Occurring
                                        </span>
                                      )}
                                    </div>
                                    <div className="justify-self-end flex items-center">
                                      <span className="text-[10px] font-bold tabular-nums opacity-80 shrink-0">
                                        {formatSecondsToClockLabel(win.start)} – {formatSecondsToClockLabel(win.end)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Row 2: Stage Number & Action Title */}
                                  <div className="flex items-center justify-between gap-2 shrink-0">
                                    <span className={cn("leading-tight", isCurrent ? "font-black" : "font-bold")}>
                                      {globalIdx + 1}. {win.title}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Viewport Frame (250px Outer Live Window Width, right-justified, dynamic height with 960px default) */}
        <div 
          className="w-[250px] ml-auto flex flex-col bg-slate-50 border-2 border-slate-500 shadow-2xl relative shrink-0 rounded-t-lg overflow-hidden transition-[height] duration-150"
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
              <div
                className={cn(
                  "w-5 h-5 rounded flex items-center justify-center shrink-0",
                  activeViewMode === 'to_be_merged' ? "bg-emerald-600" : "bg-purple-600"
                )}
              >
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-xs tracking-tight shrink-0 select-none">
                AMP
              </span>
            </div>
            <div className="flex gap-1 items-center">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-white font-bold text-xs uppercase tracking-tighter shadow-xs",
                  activeViewMode === 'to_be_merged' ? "bg-emerald-600" : "bg-purple-600"
                )}
              >
                <Play className="w-3 h-3" />
                <span>Player</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mock Time & Control Strip */}
        {activeViewMode === 'to_be_merged' ? (
          <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-xs z-10">
            <div className="w-full flex items-center justify-between gap-1.5">
              <div className="flex flex-col py-0.5 min-w-0 flex-1">
                <p className="text-xs uppercase text-emerald-600 font-black tracking-widest leading-tight flex items-center gap-1">
                  <CassetteTape className="w-3.5 h-3.5 shrink-0" />
                  <span>Prerecord time and date</span>
                </p>
                <p className="text-xs font-sans font-black text-slate-900 tabular-nums mt-1 leading-tight">
                  10/07/2026 9:00 AM to 11:00 AM
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-1 shrink-0">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer shrink-0 text-center"
                  title="Choose Show"
                >
                  <NotebookPen className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                  <span className="text-[11px] font-black uppercase tracking-tighter leading-tight flex flex-col text-center items-center">
                    <span>Choose</span>
                    <span>Show</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMergedExportPopup(true)}
                  className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-700 border-b-2 border-b-blue-800 transition-colors cursor-pointer shrink-0 text-center shadow-2xs"
                  title="Open Export Show pop-up"
                >
                  <Download className="w-3 h-3 font-bold shrink-0 text-white" />
                  <span className="text-[11px] font-black uppercase tracking-tighter leading-none">
                    Export
                  </span>
                </button>
                {mergedHasPlaylistItems && (
                  <button
                    type="button"
                    className="flex items-center justify-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer shrink-0 text-center"
                    title="Playlist (Only shown when playlist items are available)"
                  >
                    <ListMusic className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                    <span className="text-[11px] font-black uppercase tracking-tighter leading-none">
                      Playlist
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
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
                    {activeViewMode === 'to_be' ? formatSecondsToClockLabel(simClockSeconds) : '10:00:00 AM'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 font-sans">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] uppercase text-purple-600 font-black tracking-tight leading-none whitespace-nowrap">
                    {isSimRunning ? `${simSpeed}x` : '30s'}
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
        )}

        {activeViewMode === 'to_be_merged' ? (
          /* ==================== TO-BE MERGED VIEW (Current Prerecord Formatting + Blue Export Button in Header + 250px Full-Height Pop-Up) ==================== */
          <div className="w-full flex-1 min-h-0 flex flex-col bg-transparent relative overflow-hidden">

            {/* Preserved Current Prerecord Layout */}
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
                  <div className="line-clamp-2 font-sans">
                    <span>Show Spacer 1</span>
                  </div>
                </div>
              </div>

              {/* 2. Scroll Container (Exact Prerecord Formatting) */}
              <div className="flex-1 overflow-y-auto pb-4 relative">
                {/* Slot 0: Emerald ANNOUNCEMENTS Indicator & First Slot Items */}
                <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}>
                  <div className="relative w-full pr-1">
                    <div
                      className="absolute left-0 top-[-2px] bottom-[-2px] w-1 z-10"
                      style={{ backgroundColor: 'var(--show-shade-odd-bg)' }}
                      title="Active during show: Show Spacer 1"
                    />
                    <div
                      className="bg-emerald-600 h-6 flex items-center justify-between pl-1 pr-3 rounded shadow-sm border border-emerald-500 ml-2"
                      id="prerecord-start-indicator"
                    >
                      <span className="text-xs font-black uppercase text-white tracking-normal font-sans flex items-center gap-1.5">
                        <CassetteTape className="w-3.5 h-3.5 text-white/90 shrink-0" />
                        ANNOUNCEMENTS
                      </span>
                    </div>
                  </div>

                  {renderCurrentCard(items.find((i) => i.id === 'lr-read')!, true)}
                  {renderCurrentCard(items.find((i) => i.id === 'mp3-played')!, true)}
                  {renderCurrentCard(items.find((i) => i.id === 'lr-read-now')!, true)}
                  {renderCurrentCard(items.find((i) => i.id === 'mp3-due-now')!, true)}
                  {renderCurrentCard(items.find((i) => i.id === 'lr-next')!, true)}
                  {renderCurrentCard(items.find((i) => i.id === 'mp3-next')!, true)}
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
                    <div className="line-clamp-2 font-sans">
                      Show Spacer 2
                    </div>
                  </div>
                </div>

                {/* Slot: Next Show Items */}
                <div className="space-y-2 py-1" style={{ backgroundColor: 'var(--show-shade-even-bg)' }}>
                  {renderCurrentCard(items.find((i) => i.id === 'time-gated-next')!, true)}
                </div>
              </div>
            </div>

            {/* 250px Full-Height In-Window Export Pop-Up Modal Overlay */}
            {showMergedExportPopup && (
              <div className="absolute inset-0 z-30 bg-slate-950/60 backdrop-blur-[1px] flex flex-col p-1">
                <div className="w-full flex-1 min-h-0 bg-white border-2 border-slate-400 rounded-xl shadow-2xl overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="bg-slate-900 text-white px-2 py-1.5 flex items-center justify-between gap-1 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Download className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="text-[11px] font-black uppercase tracking-wider truncate">
                        Export Show
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMergedExportPopup(false)}
                      className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
                      title="Close Export pop-up"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Show Subheader (No Counts) */}
                  <div className="px-2 py-1 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-700 shrink-0 truncate">
                    Show Spacer 1 · Wed, Oct 07 (9:00–11:00 AM)
                  </div>

                  {/* Stacked Action Buttons */}
                  <div className="p-2 space-y-1.5 border-b border-slate-200 bg-slate-50 shrink-0">
                    {/* 1. Export Files */}
                    <button
                      type="button"
                      className="w-full py-1.5 px-2 bg-blue-600 hover:bg-blue-500 text-white rounded border-b-[3px] border-blue-800 font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Export Files...</span>
                    </button>

                    {/* 2. Mark All as Logged (Darker Blue Variant — No Count) */}
                    <button
                      type="button"
                      className="w-full py-1.5 px-2 bg-blue-800 hover:bg-blue-700 text-white rounded border-b-[3px] border-blue-950 font-black uppercase text-xs tracking-tight flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Mark All as Logged</span>
                    </button>
                  </div>

                  {/* Bottom Section: 3-Button Radio Selector (Plan / Playlist / Live Reads) + Copy + Internal Scrollbar */}
                  <div className="flex-1 min-h-0 flex flex-col bg-white">
                    <div className="px-1 py-1 bg-slate-100 border-b border-slate-200 flex items-center justify-start gap-1 shrink-0">
                      {/* 3-Button Segmented Radio Selector (No Dots, Explicit Visual Spacers) */}
                      <div
                        className="inline-flex items-stretch rounded border border-slate-300 bg-white overflow-hidden shrink-0"
                        role="radiogroup"
                        aria-label="Preview selector"
                      >
                        {(
                          [
                            { id: 'plan', label: 'Plan' },
                            { id: 'playlist', label: '.m3u LIST' },
                            { id: 'live_reads', label: 'Live Reads' },
                          ] as const
                        ).map((opt, idx) => {
                          const isSelected = mergedPreviewMode === opt.id;
                          return (
                            <React.Fragment key={opt.id}>
                              {idx > 0 && (
                                <span
                                  className="w-px self-stretch bg-slate-300 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              <button
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => setMergedPreviewMode(opt.id)}
                                className={cn(
                                  "px-1.5 py-1 text-[10px] font-black tracking-tighter leading-none whitespace-nowrap cursor-pointer transition-colors",
                                  opt.id !== 'playlist' && "uppercase",
                                  isSelected
                                    ? "bg-blue-600 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                {opt.label}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Single "Copy" Button */}
                      <button
                        type="button"
                        className="px-1.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-tighter leading-none flex items-center gap-0.5 cursor-pointer shrink-0 shadow-2xs"
                        title={`Copy ${mergedPreviewMode === 'plan' ? 'Plan' : mergedPreviewMode === 'playlist' ? '.m3u LIST' : 'Live Reads'}`}
                      >
                        <Copy className="w-2.5 h-2.5 shrink-0" />
                        <span>Copy</span>
                      </button>
                    </div>

                    {/* Internal Scrollable Preview Body */}
                    <div className="p-1.5 overflow-y-auto flex-1 min-h-0 text-left">
                      {mergedPreviewMode === 'plan' && (
                        <div className="space-y-1 font-mono text-[10px] text-slate-700 leading-snug">
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-sans">
                            <div className="font-black text-slate-900 text-[10px] uppercase">
                              Show Spacer 1 — Broadcast Plan
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Wed, Oct 07, 2026 · 9:00 AM – 11:00 AM
                            </div>
                          </div>
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 space-y-1">
                            <div>
                              <span className="font-bold text-slate-900">9:39 AM</span> [MP3] MP3 Audio Played Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">9:40 AM</span> [READ] LR Read Example (0:25)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">9:57 AM</span> [READ] LR Read Now Example (0:20)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:00 AM</span> [MP3] MP3 Due Now Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:15 AM</span> [READ] Live Read Future Example (0:15)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:20 AM</span> [MP3] MP3 Future Example (0:30)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">10:40 AM</span> [PROMO] Up Next: Show Spacer 2 (0:15)
                            </div>
                            <div>
                              <span className="font-bold text-slate-900">11:00 AM</span> [MP3] Time Gated Future Example (0:30)
                            </div>
                          </div>
                        </div>
                      )}

                      {mergedPreviewMode === 'playlist' && (
                        <div className="p-1.5 rounded bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700 space-y-1.5 leading-snug">
                          <div className="font-bold text-slate-500">#EXTM3U</div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,9:39 AM - MP3 Audio Played Example</div>
                            <div className="font-bold text-slate-900 break-all">01_0939_MP3_Audio_Played_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,10:00 AM - MP3 Due Now Example</div>
                            <div className="font-bold text-slate-900 break-all">02_1000_MP3_Due_Now_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,10:20 AM - MP3 Future Example</div>
                            <div className="font-bold text-slate-900 break-all">03_1020_MP3_Future_Example.mp3</div>
                          </div>
                          <div>
                            <div className="text-slate-500">#EXTINF:30,11:00 AM - Time Gated Future Example</div>
                            <div className="font-bold text-slate-900 break-all">04_1100_Time_Gated_Future_Example.mp3</div>
                          </div>
                        </div>
                      )}

                      {mergedPreviewMode === 'live_reads' && (
                        <div className="space-y-1.5">
                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-500 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              9:40 AM · LR Read Example
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              This is the script for LR Read Example. Has already been read on air and logged.
                            </p>
                          </div>

                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-500 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              9:57 AM · LR Read Now Example
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              This is the script for LR Read Now Example. Scheduled at 9:57 AM within the active on-air window.
                            </p>
                          </div>

                          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 border-l-2 border-l-blue-400 space-y-0.5">
                            <div className="text-[10px] font-black text-slate-800 truncate">
                              10:40 AM · Up Next: Show Spacer 2
                            </div>
                            <p className="text-[11px] text-slate-600 leading-snug">
                              Up Next is Show Spacer 2 with Host 2 from 11:00 AM to 1:00 PM every Wednesday.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeViewMode === 'current' ? (
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
          // Dynamic To-Be Partitioning based on currentClockMinutes (simClockSeconds / 60)
          const nowStartMinutes = currentClockMinutes - windowBeforeMinutes;
          const nowEndMinutes = currentClockMinutes + windowAfterMinutes;

          // Dynamically resolve Up Next Promo items from upcoming Show Spacers & settings
          const resolvedTimelineItems = items
            .map((item) => {
              if (!item.isUpNextPromo) return item;
              const targetSpacer =
                showSpacers.find((s) => s.id === (item.targetShowId || 'show-2')) ||
                showSpacers[1] ||
                DEFAULT_SHOW_SPACERS[1];
              const showStartMinutes = parseTimeToMinutes(targetSpacer.time);
              const promoMinutes = Math.max(0, showStartMinutes - upNextMinutesBefore);
              const promoTimeLabel = formatMinutesToTimeLabel(promoMinutes);
              const shortShowTitle =
                targetSpacer.shortName || targetSpacer.name.replace(/\s*\([^)]*\)\s*$/, '');
              const endTimeLabel = formatMinutesToTimeLabel(showStartMinutes + 120);
              const hostClause = targetSpacer.host?.trim() ? ` with ${targetSpacer.host.trim()}` : '';
              const descBlock = targetSpacer.description?.trim() ? `\n\n${targetSpacer.description.trim()}` : '';
              const resolvedCopy = `Up Next is ${shortShowTitle}${hostClause} from ${targetSpacer.time} to ${endTimeLabel} every Wednesday.${descBlock}\n\nThat's ${shortShowTitle} at ${targetSpacer.time}.`;
              return {
                ...item,
                name: `Up Next: ${shortShowTitle}`,
                timeLabel: promoTimeLabel,
                targetShowName: shortShowTitle,
                targetShowTime: targetSpacer.time,
                targetHostName: targetSpacer.host || 'Host 2',
                scriptContent: resolvedCopy,
              };
            })
            .filter((item) => {
              if (!item.isUpNextPromo) return true;
              if (!enableUpNextPromos) return false;
              const targetSpacer = showSpacers.find((s) => s.id === (item.targetShowId || 'show-2'));
              if (targetSpacer && (!targetSpacer.enabled || targetSpacer.includeInUpNext === false)) {
                return false;
              }
              return true;
            });

          const allLookaroundFutureItems = resolvedTimelineItems.filter((item) =>
            ['err-file-missing', 'err-script-invalid'].includes(item.id)
          );
          const mainTimelineItems = resolvedTimelineItems.filter(
            (item) => !['err-file-missing', 'err-script-invalid'].includes(item.id)
          );

          const isCompletedItem = (item: MockLiveItem) =>
            !item.isPlaying && (!!item.isPlayed || item.status === 'played' || item.status === 'read');

          const allPastItems = mainTimelineItems.filter(
            (item) => parseTimeToMinutes(item.timeLabel) < nowStartMinutes || isCompletedItem(item)
          );
          const allNowItems = mainTimelineItems.filter((item) => {
            if (isCompletedItem(item)) return false;
            const mins = parseTimeToMinutes(item.timeLabel);
            return mins >= nowStartMinutes && mins <= nowEndMinutes;
          });
          const allFutureItems = mainTimelineItems.filter((item) => {
            if (isCompletedItem(item)) return false;
            return parseTimeToMinutes(item.timeLabel) > nowEndMinutes;
          });

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

          // ===================================================================
          // ROADMAP #17: WHOLE "NOW" SECTION FLASH DETECTION (ADDED / LEAVING)
          // ===================================================================
          const unplayedNowItems = effectiveNowItems.filter(
            (i) => !i.isPlayed && !i.isPlaying && i.isVerified !== false
          );

          const autoAddedNowItem =
            simClockSeconds > activeScenario.startSeconds
              ? unplayedNowItems.find((i) => {
                  const entryMin = parseTimeToMinutes(i.timeLabel) - windowAfterMinutes;
                  const elapsedSinceEntry = currentClockMinutes - entryMin;
                  return elapsedSinceEntry >= 0 && elapsedSinceEntry <= 0.42;
                })
              : undefined;

          const autoLeavingNowItem =
            simClockSeconds > activeScenario.startSeconds
              ? unplayedNowItems.find((i) => {
                  const exitMin = parseTimeToMinutes(i.timeLabel) + windowBeforeMinutes;
                  const remainingUntilExit = exitMin - currentClockMinutes;
                  return remainingUntilExit >= 0 && remainingUntilExit <= 1.0;
                }) ||
                effectivePastItems.find((i) => {
                  if (i.isPlayed || i.isPlaying || i.isVerified === false) return false;
                  const exitMin = parseTimeToMinutes(i.timeLabel) + windowBeforeMinutes;
                  const elapsedSinceExit = currentClockMinutes - exitMin;
                  return elapsedSinceExit >= 0 && elapsedSinceExit <= 0.25;
                })
              : undefined;

          const activeNowFlashMode: 'none' | 'added' | 'leaving' =
            manualNowFlash === 'added' && enableAddedFlash
              ? 'added'
              : manualNowFlash === 'leaving' && enableLeavingFlash
                ? 'leaving'
                : enableAddedFlash && autoAddedNowItem
                  ? 'added'
                  : enableLeavingFlash && autoLeavingNowItem
                    ? 'leaving'
                    : 'none';

          const leavingFlashDur = Math.max(0.5, leavingFlashDurationSec);
          const leavingGapDur = Math.max(0, leavingGapDurationSec);
          const leavingCycleTotal = leavingFlashDur + leavingGapDur;
          const isLeavingInFlashPhase =
            leavingGapDur <= 0 || (leavingCycleElapsedSec % leavingCycleTotal) < leavingFlashDur;

          const nowSectionFlashClass =
            activeNowFlashMode === 'added'
              ? 'amp-now-flash-added-merged'
              : activeNowFlashMode === 'leaving'
                ? isLeavingInFlashPhase
                  ? 'amp-now-flash-leaving-2a'
                  : leavingGapHighlightMode === 'on'
                    ? 'amp-now-static-leaving-2a'
                    : ''
                : '';

          // Partition show spacers into Past (< nowStartMinutes), Now ([nowStartMinutes, nowEndMinutes]), and Future (> nowEndMinutes)
          const enabledSpacers = showSpacers.filter((s) => s.enabled);
          const pastSpacers = enabledSpacers.filter((s) => parseTimeToMinutes(s.time) < nowStartMinutes);
          const nowSpacers = enabledSpacers.filter((s) => {
            const mins = parseTimeToMinutes(s.time);
            return mins >= nowStartMinutes && mins <= nowEndMinutes;
          });
          const futureSpacers = enabledSpacers.filter((s) => parseTimeToMinutes(s.time) > nowEndMinutes);

          type TimelineEntry = 
            | { type: 'item'; item: MockLiveItem; minutes: number }
            | { type: 'spacer'; spacer: MockShowSpacer; minutes: number };

          const isPastItemMissed = (item: MockLiveItem) =>
            !(item.isPlayed || item.isPlaying || item.status === 'played' || item.status === 'read');

          // Preferentially sort Missed cards to the bottom of Past (just above the NOW bar)
          const pastTimelineEntries: TimelineEntry[] = [
            ...effectivePastItems.map((item) => ({ type: 'item' as const, item, minutes: parseTimeToMinutes(item.timeLabel) })),
            ...pastSpacers.map((spacer) => ({ type: 'spacer' as const, spacer, minutes: parseTimeToMinutes(spacer.time) })),
          ].sort((a, b) => {
            const aMissed = a.type === 'item' && isPastItemMissed(a.item);
            const bMissed = b.type === 'item' && isPastItemMissed(b.item);
            if (aMissed !== bMissed) return aMissed ? 1 : -1;
            return a.minutes !== b.minutes ? a.minutes - b.minutes : a.type === 'spacer' ? -1 : 1;
          });

          const nowTimelineEntries: TimelineEntry[] = [
            ...effectiveNowItems.map((item) => ({ type: 'item' as const, item, minutes: parseTimeToMinutes(item.timeLabel) })),
            ...nowSpacers.map((spacer) => ({ type: 'spacer' as const, spacer, minutes: parseTimeToMinutes(spacer.time) })),
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
              key={`to-be-container-${redrawKey}-${activeViewMode}`}
              className={cn(
                "w-full flex-1 min-h-0 flex flex-col relative overflow-hidden bg-slate-100/60 tobe-timeline-canvas rec-dark-safe-pills rec-warm-dark-shades",
                enableBlinkOnly && "amp-blink-only-mode"
              )}
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
                    <div className="flex items-center justify-between px-2.5 py-1 rounded border border-slate-300 bg-slate-200 shadow-2xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
                          Past
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Past Cards & Past In-Flow Spacers */}
                  <div className="w-[200px] mx-auto flex flex-col">
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
                        const resolvedPastStatus =
                          item.isPlayed || item.isPlaying || item.status === 'played' || item.status === 'read'
                            ? item.isScript
                              ? 'read'
                              : 'played'
                            : 'missed';
                        return renderToBeCard(item, resolvedPastStatus, false);
                      })
                    )}
                  </div>

                  {/* NOW Section Wrapper - "Super Card" enclosing all NOW cards */}
                  <div 
                    ref={nowSectionRef}
                    className={cn(
                      "w-[222px] max-w-[calc(100%-4px)] mx-auto shrink-0 font-sans select-none rounded-lg border-x-[3px] border-b-[3px] border-t-2 border-emerald-600 bg-white tobe-now-segment shadow-sm overflow-hidden my-2",
                      nowSectionFlashClass
                    )}
                  >
                    {/* NOW Super Card Header - Tooltip & click-to-center strictly scoped to banner */}
                    <div
                      onClick={scrollToNow}
                      title="Click to center NOW section"
                      className="amp-now-header flex items-center justify-between px-3 py-1.5 bg-emerald-600 text-white border-b border-emerald-500 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <RadioTower className="w-4 h-4 text-white animate-pulse shrink-0" />
                        <span className="text-sm font-black uppercase tracking-widest text-white truncate">
                          Now
                        </span>
                        <span className="text-xs font-bold tabular-nums text-emerald-50 tracking-normal shrink-0">
                          {formatSecondsToClockLabel(simClockSeconds)}
                        </span>
                      </div>
                    </div>

                    {/* NOW Super Card Body: Shaded with active show background color matching Player > Live */}
                    <div className="amp-now-body flex flex-col">
                      {effectiveNowItems.length === 0 ? (
                        <>
                          {nowSpacers.map((spacer) => renderInFlowSpacerCard(spacer, true))}
                          <div
                            className="py-1.5 pr-1 pl-1.5 relative"
                            style={{ backgroundColor: getActiveSpacerForMinutes(currentClockMinutes).shadeBg }}
                          >
                            <div className="flex items-center justify-center py-3.5 px-3 rounded border border-slate-300 bg-white shadow-2xs text-center">
                              <span className="text-xs font-sans font-bold text-slate-600 tabular-nums">
                                Next announcement at {(visibleFutureItems[0] || allFutureItems[0])?.timeLabel || '10:45 AM'}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        nowTimelineEntries.map((entry) => {
                          if (entry.type === 'spacer') {
                            return renderInFlowSpacerCard(entry.spacer, true);
                          }
                          const item = entry.item;
                          const resolvedNowStatus = item.isPlaying
                            ? 'playing'
                            : item.isPlayed
                              ? item.isScript
                                ? 'read'
                                : 'played'
                              : item.isScript
                                ? 'read_now'
                                : 'play_now';
                          return renderToBeCard(item, resolvedNowStatus, true);
                        })
                      )}
                    </div>
                  </div>

                  {/* FUTURE Section Header Block */}
                  <div className="w-[200px] mx-auto shrink-0 font-sans select-none my-1">
                    <div className="flex items-center justify-between px-2.5 py-1 rounded border border-slate-300 bg-slate-200 shadow-2xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">
                          Future
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Future Cards & Future In-Flow Spacers */}
                  <div className="w-[200px] mx-auto flex flex-col">
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
                {activeViewMode === 'to_be_merged' ? (
                  <div className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border border-t-emerald-400 border-b-emerald-800 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white flex items-center gap-1 select-none">
                    <CassetteTape className="w-3 h-3 text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)] shrink-0" />
                    <span>Prerecord</span>
                  </div>
                ) : (
                  <div className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border border-t-purple-400 border-b-purple-800 bg-gradient-to-b from-purple-500 to-purple-600 text-white flex items-center gap-1 select-none">
                    <RadioTower className="w-3 h-3 text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)] shrink-0" />
                    <span>Live</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* =========================================================================
       * ROADMAP #17: DJ FLASH & ESCALATING URGENCY SELECTOR MATRIX (BELOW PRETEND WINDOW)
       * ========================================================================= */}
      {activeViewMode === 'to_be' && (
        <div className="max-w-[540px] w-full mx-auto mt-3 p-3 rounded-xl border border-slate-300 bg-white shadow-md space-y-3 text-left font-sans shrink-0">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-purple-950">
                #17 DJ Attention Flash &amp; Urgency Testing Matrix
              </h3>
              <p className="text-[11px] text-slate-500">
                1. Trigger on demand · 2. Enable/disable &amp; choose visual options · 3. Run ±10s event windows or all 4 sets
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 cursor-pointer shrink-0"
              title="Reset clock to scenario start and restore all cards"
            >
              Reset Scenario
            </button>
          </div>

          {/* SECTION A: SCENARIO SETS (LIVE DEMO, SET 1–4) & FALSE-CLOCK RUNNER */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            {/* Scenario Set Selector Pills */}
            <div className="space-y-1.5 border-b border-slate-200 pb-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-tight text-slate-700">
                  Scenario Set (:00 / :20 / :40):
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {(['live_demo', 'set_1', 'set_2', 'set_3', 'set_4', 'set_5'] as const).map((setId) => {
                    const preset = SCENARIO_PRESETS[setId];
                    const isSelected = activeScenarioId === setId;
                    return (
                      <button
                        key={setId}
                        type="button"
                        onClick={() => handleSelectScenarioSet(setId)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-black border cursor-pointer",
                          isSelected
                            ? "bg-purple-600 text-white border-purple-500 shadow-2xs"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                        )}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Play All 5 Sets (Demo Video Mode) Bar */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isPlayingAllSets) {
                      setIsPlayingAllSets(false);
                      setIsSimRunning(false);
                      setDemoPauseState(null);
                    } else {
                      handleStartPlayAllSets();
                    }
                  }}
                  className={cn(
                    "px-3 py-1 rounded-lg font-black text-xs uppercase tracking-wide flex items-center gap-1.5 cursor-pointer shadow-xs border",
                    isPlayingAllSets
                      ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-500"
                      : "bg-purple-700 hover:bg-purple-800 text-white border-purple-600"
                  )}
                  title="Sequentially run Set 1, Set 2, Set 3, Set 4, and Set 5 with narrator cards for recording a demo video"
                >
                  {isPlayingAllSets ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop 5-Set Demo Video</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play All 5 Sets (Demo Video)</span>
                    </>
                  )}
                </button>
                <span className="text-[10px] font-semibold text-slate-500">
                  Tightened to ±10s around each event with narrator pauses
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                <span className="font-semibold">{activeScenario.summary}</span>
                {lastJumpNotice && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] shrink-0">
                    {lastJumpNotice}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (simClockSeconds >= activeScenario.endSeconds) {
                      setSimClockSeconds(activeScenario.startSeconds);
                      setItems(activeScenario.items);
                      setLastJumpNotice(null);
                    }
                    setDemoPauseState(null);
                    setForcedCardStage('auto');
                    setManualNowFlash('none');
                    setIsSimRunning((prev) => !prev);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-black text-xs uppercase tracking-wide flex items-center gap-1.5 cursor-pointer shadow-xs border",
                    isSimRunning
                      ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-500"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500"
                  )}
                >
                  {isSimRunning ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Pause {activeScenario.label}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run {activeScenario.label}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSimRunning(false);
                    setIsPlayingAllSets(false);
                    setDemoPauseState(null);
                    setManualPlayElapsedMap({});
                    setSimClockSeconds(activeScenario.startSeconds);
                    setItems(activeScenario.items);
                    setManualNowFlash('none');
                    setForcedCardStage('auto');
                    setLastJumpNotice(null);
                  }}
                  className="px-2 py-1.5 rounded-lg font-bold text-xs text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 cursor-pointer tabular-nums"
                  title="Rewind clock to scenario start"
                >
                  {formatSecondsToClockLabel(activeScenario.startSeconds)}
                </button>
              </div>

              {/* Speed Selector Pills (1x, 2x, 3x, 5x, 10x, 30x) */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Speed:</span>
                {([1, 2, 3, 5, 10, 30] as const).map((spd) => (
                  <button
                    key={`speed-${spd}`}
                    type="button"
                    onClick={() => setSimSpeed(spd)}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-black tabular-nums border cursor-pointer",
                      simSpeed === spd
                        ? "bg-purple-600 text-white border-purple-500 shadow-2xs"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                    )}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Scrubber & Clock Readout */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">
                  Simulated Clock:{' '}
                  <span className="font-black text-purple-700 tabular-nums">
                    {formatSecondsToClockLabel(simClockSeconds)}
                  </span>
                </span>
                <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                  NOW Window: {formatMinutesToTimeLabel(currentClockMinutes - windowBeforeMinutes)} –{' '}
                  {formatMinutesToTimeLabel(currentClockMinutes + windowAfterMinutes)}
                </span>
              </div>
              <input
                type="range"
                min={activeScenario.startSeconds}
                max={activeScenario.endSeconds}
                step={5}
                value={simClockSeconds}
                onChange={(e) => {
                  setDemoPauseState(null);
                  setForcedCardStage('auto');
                  setLastJumpNotice(null);
                  setSimClockSeconds(Number(e.target.value));
                }}
                className="w-full accent-purple-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
              <div className="flex justify-between text-[10px] font-semibold text-slate-500 tabular-nums">
                {activeScenario.markers.map((m, idx) => (
                  <button
                    key={`marker-${idx}`}
                    type="button"
                    onClick={() => {
                      setDemoPauseState(null);
                      setForcedCardStage('auto');
                      setSimClockSeconds(m.seconds);
                    }}
                    className="hover:text-purple-700 cursor-pointer"
                    title={`Jump to ${formatSecondsToClockLabel(m.seconds)}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION B: 1. TRIGGER ON DEMAND (MANUAL TEST BUTTONS) */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-black uppercase tracking-tight text-slate-700">
              1. Trigger Flash / Stage On Demand
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => triggerManualNowFlash('added')}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-bold border cursor-pointer",
                  manualNowFlash === 'added'
                    ? "bg-sky-600 text-white border-sky-500 shadow-xs"
                    : "bg-white text-sky-800 border-sky-300 hover:bg-sky-50"
                )}
              >
                {manualNowFlash === 'added' ? 'Stop Added Flash' : 'Flash NOW: Item Added'}
              </button>

              <button
                type="button"
                onClick={() => triggerManualNowFlash('leaving')}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-bold border cursor-pointer",
                  manualNowFlash === 'leaving'
                    ? "bg-rose-600 text-white border-rose-500 shadow-xs"
                    : "bg-white text-rose-800 border-rose-300 hover:bg-rose-50"
                )}
              >
                {manualNowFlash === 'leaving' ? 'Stop Leaving Flash' : 'Flash NOW: Item Leaving'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <span className="text-[11px] font-bold text-slate-600 mr-1">
                Force Unplayed Card Stage:
              </span>
              {(
                [
                  { id: 'auto', label: 'Auto (Clock)' },
                  { id: 1, label: 'Stage 1 (Added)' },
                  { id: 2, label: 'Stage 2 (Due)' },
                  { id: 3, label: 'Stage 3 (Overdue)' },
                  { id: 4, label: 'Stage 4 (Leaving)' },
                ] as const
              ).map((st) => (
                <button
                  key={`stage-btn-${st.id}`}
                  type="button"
                  onClick={() => setForcedCardStage(st.id)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold border cursor-pointer",
                    forcedCardStage === st.id
                      ? "bg-purple-600 text-white border-purple-500 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION C: 2. ENABLE / DISABLE MATRIX */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-black uppercase tracking-tight text-slate-700">
              2. Enable / Disable Alert Indicators
            </div>

            {/* #1: Added Flash Toggle (Merged 1A + 1B) */}
            <div className="p-2 rounded bg-white border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableAddedFlash}
                  onChange={(e) => setEnableAddedFlash(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  #1. Flash Whole NOW Section When Unplayed Item Added
                </span>
              </label>
            </div>

            {/* #2: Leaving Flash Toggle (Option 2A with Editable Flash + Gap Timing & Gap Highlight Mode) */}
            <div className="p-2 rounded bg-white border border-slate-200 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableLeavingFlash}
                  onChange={(e) => setEnableLeavingFlash(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  #2. Flash Whole NOW Section When Unplayed Item Leaving
                </span>
              </label>

              {enableLeavingFlash && (
                <div className="pl-5 pt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">Flash (s):</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={leavingFlashDurationSec}
                      onChange={(e) => {
                        setLeavingCycleElapsedSec(0);
                        setLeavingFlashDurationSec(Math.max(1, Number(e.target.value) || 1));
                      }}
                      className="w-14 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-xs font-bold tabular-nums text-slate-800"
                    />
                  </label>

                  <label className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">Pause Gap (s):</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      value={leavingGapDurationSec}
                      onChange={(e) => {
                        setLeavingCycleElapsedSec(0);
                        setLeavingGapDurationSec(Math.max(0, Number(e.target.value) || 0));
                      }}
                      className="w-14 px-1.5 py-0.5 rounded border border-slate-300 bg-white text-xs font-bold tabular-nums text-slate-800"
                    />
                  </label>

                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-600">During Gap:</span>
                    <button
                      type="button"
                      onClick={() => setLeavingGapHighlightMode('on')}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold border cursor-pointer",
                        leavingGapHighlightMode === 'on'
                          ? "bg-rose-600 text-white border-rose-500"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      )}
                    >
                      Highlight &apos;On&apos;
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeavingGapHighlightMode('off')}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold border cursor-pointer",
                        leavingGapHighlightMode === 'off'
                          ? "bg-slate-700 text-white border-slate-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      )}
                    >
                      Highlight &apos;Off&apos;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* #3: Per-Card Escalating Urgency Toggle (Option 3A Border-Only for Due & Amber) */}
            <div className="p-2 rounded bg-white border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableCardUrgency}
                  onChange={(e) => setEnableCardUrgency(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  #3. Per-Card Escalating Urgency (Unplayed/Unread Addition &rarr; Leaving)
                </span>
              </label>
            </div>

            {/* #4: Blink-Only Mode Toggle (0.5s Full On / 0.5s Full Off — No Transition Color Calculations) */}
            <div className="p-2 rounded bg-white border border-slate-200">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableBlinkOnly}
                  onChange={(e) => setEnableBlinkOnly(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">
                  #4. Blink Only (0.5s Full On / 0.5s Full Off — No Transition Color Calculations)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* In-Sandbox Live Read Script Reader Modal (Supports standard scripts + auto-seeded Up Next Show Promos) */}
      {selectedScript && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Reader Header */}
            <div className={cn(
              "px-4 py-3 border-b flex items-center justify-between shrink-0",
              selectedScript.isUpNextPromo
                ? "bg-teal-900 text-white border-teal-800"
                : "bg-slate-900 text-white border-slate-800"
            )}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  "p-1.5 rounded-lg shrink-0",
                  selectedScript.isUpNextPromo ? "bg-teal-700 text-teal-100" : "bg-blue-600 text-white"
                )}>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black tracking-tight truncate">
                      {selectedScript.name}
                    </span>
                    {selectedScript.isUpNextPromo && (
                      <span className="px-1.5 py-0.5 rounded bg-teal-200 text-teal-950 text-[10px] font-black uppercase tracking-wider shrink-0">
                        Auto-Seeded Up Next Promo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-300 font-medium flex items-center gap-2 flex-wrap">
                    <span>Scheduled: {selectedScript.timeLabel}</span>
                    <span>•</span>
                    <span>Current Show: {selectedScript.showName || 'Show Spacer 1'}</span>
                    {selectedScript.isUpNextPromo && selectedScript.targetShowName && (
                      <>
                        <span>•</span>
                        <span className="text-teal-200 font-bold">
                          Promoting: {selectedScript.targetShowName} ({selectedScript.targetShowTime || '11:00 AM'})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setScriptZoomPx((z) => Math.max(14, z - 2))}
                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                  title="Decrease script text size"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setScriptZoomPx((z) => Math.min(32, z + 2))}
                  className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                  title="Increase script text size"
                >
                  A+
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedScript(null)}
                  className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
                  title="Close without marking read"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Auto-Seeded Source Metadata Banner for Up Next Promo */}
            {selectedScript.isUpNextPromo && (
              <div className="px-4 py-2 bg-teal-50 border-b border-teal-200 flex items-center justify-between gap-2 text-xs text-teal-900">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>
                    Copy dynamically pulled from upcoming show description (<span className="font-bold">{selectedScript.targetShowName || 'Show Spacer 2'}</span>, {upNextMinutesBefore}m before start).
                  </span>
                </div>
                <span className="font-sans text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white border border-teal-300 text-teal-800 shrink-0">
                  Logged on Read
                </span>
              </div>
            )}

            {/* Script Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              <div
                style={{ fontSize: `${scriptZoomPx}px`, lineHeight: 1.6 }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs font-sans text-slate-900 whitespace-pre-wrap"
              >
                {selectedScript.scriptContent || 'Live Read script copy not configured.'}
              </div>
            </div>

            {/* Reader Footer Actions */}
            <div className="px-4 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedScript(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
              >
                Close - Not Read
              </button>
              <button
                type="button"
                onClick={() => handleMarkAsRead(selectedScript.id)}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Mark as Read &amp; Log</span>
              </button>
            </div>
          </div>
        </div>
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
                      <span>Past Cards (&lt; {formatMinutesToTimeLabel(currentClockMinutes - windowBeforeMinutes)} or Read/Played)</span>
                      <span className="font-sans text-slate-400 tabular-nums font-bold">
                        {items.filter((i) => (parseTimeToMinutes(i.timeLabel) < currentClockMinutes - windowBeforeMinutes || (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read'))) && enabledCardIds.includes(i.id)).length}/
                        {items.filter((i) => parseTimeToMinutes(i.timeLabel) < currentClockMinutes - windowBeforeMinutes || (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read'))).length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => parseTimeToMinutes(i.timeLabel) < currentClockMinutes - windowBeforeMinutes || (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')))
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
                      <span>Now Cards ({formatMinutesToTimeLabel(currentClockMinutes - windowBeforeMinutes)} – {formatMinutesToTimeLabel(currentClockMinutes + windowAfterMinutes)})</span>
                      <span className="font-sans text-emerald-600 tabular-nums font-bold">
                        {items.filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          const m = parseTimeToMinutes(i.timeLabel);
                          return m >= currentClockMinutes - windowBeforeMinutes && m <= currentClockMinutes + windowAfterMinutes && enabledCardIds.includes(i.id);
                        }).length}/
                        {items.filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          const m = parseTimeToMinutes(i.timeLabel);
                          return m >= currentClockMinutes - windowBeforeMinutes && m <= currentClockMinutes + windowAfterMinutes;
                        }).length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          const m = parseTimeToMinutes(i.timeLabel);
                          return m >= currentClockMinutes - windowBeforeMinutes && m <= currentClockMinutes + windowAfterMinutes;
                        })
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
                      <span>Future Cards (&gt; {formatMinutesToTimeLabel(currentClockMinutes + windowAfterMinutes)})</span>
                      <span className="font-sans text-slate-400 tabular-nums font-bold">
                        {items.filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          return parseTimeToMinutes(i.timeLabel) > currentClockMinutes + windowAfterMinutes && enabledCardIds.includes(i.id);
                        }).length}/
                        {items.filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          return parseTimeToMinutes(i.timeLabel) > currentClockMinutes + windowAfterMinutes;
                        }).length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items
                        .filter((i) => {
                          if (!i.isPlaying && (!!i.isPlayed || i.status === 'played' || i.status === 'read')) return false;
                          return parseTimeToMinutes(i.timeLabel) > currentClockMinutes + windowAfterMinutes;
                        })
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
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-[10px] font-bold text-teal-800 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={spacer.includeInUpNext !== false}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setShowSpacers((prev) =>
                                  prev.map((s) => (s.id === spacer.id ? { ...s, includeInUpNext: checked } : s))
                                );
                              }}
                              className="w-3 h-3 rounded accent-teal-600 cursor-pointer"
                            />
                            <span>Include in "Up Next"</span>
                          </label>
                          <span className={cn(
                            "px-1.5 py-0.2 rounded font-bold uppercase text-[9px]",
                            spacer.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          )}>
                            {spacer.enabled ? 'In Existence (Visible)' : 'Out of Existence (Hidden)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2b. "Up Next" Auto-Seeded Show Promo Settings (Roadmap #12) */}
              <div className="flex flex-col gap-2.5 bg-teal-50/70 p-3 rounded-lg border border-teal-200">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-teal-950 block">"Up Next" Auto-Seeded Show Promo Cards:</span>
                    <span className="text-[10px] text-teal-800">
                      Automatically inserts a Live Read card reading the upcoming show description
                    </span>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-teal-950 cursor-pointer select-none bg-white px-2.5 py-1 rounded border border-teal-300 shadow-2xs">
                    <input
                      type="checkbox"
                      checked={enableUpNextPromos}
                      onChange={(e) => setEnableUpNextPromos(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-teal-600 cursor-pointer"
                    />
                    <span>Enabled</span>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-teal-200/60">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Minutes Before Next Show:</span>
                    <span className="text-[10px] text-slate-500">
                      Default 20m before show start (e.g., :40 for shows starting at :00)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-teal-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setUpNextMinutesBefore((m) => Math.max(5, m - 5))}
                      className="w-5 h-5 rounded bg-teal-100 hover:bg-teal-200 flex items-center justify-center font-bold text-teal-900 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-sans font-black text-xs text-teal-950 px-2 min-w-[2.5rem] text-center tabular-nums">
                      {upNextMinutesBefore}m
                    </span>
                    <button
                      type="button"
                      onClick={() => setUpNextMinutesBefore((m) => Math.min(55, m + 5))}
                      className="w-5 h-5 rounded bg-teal-100 hover:bg-teal-200 flex items-center justify-center font-bold text-teal-900 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
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
                  <span className="font-bold">&lt; {formatMinutesToTimeLabel(600 - windowBeforeMinutes)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>
                    Read Now ({windowBeforeMinutes === windowAfterMinutes ? `±${windowBeforeMinutes}m` : `-${windowBeforeMinutes}m / +${windowAfterMinutes}m`}):
                  </span>
                  <span>{formatMinutesToTimeLabel(600 - windowBeforeMinutes)} – {formatMinutesToTimeLabel(600 + windowAfterMinutes)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Next (&gt; +{windowAfterMinutes}m):</span>
                  <span className="font-bold">&gt; {formatMinutesToTimeLabel(600 + windowAfterMinutes)}</span>
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

      {/* Small Pop-Up Modal for "Get Help" on Missing/Invalid File Cards */}
      {helpPopupCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3"
          onClick={() => setHelpPopupCard(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-[260px] p-3.5 text-left space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <HelpCircle className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 truncate">
                  Get Help — Media Issue
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHelpPopupCard(null)}
                className="text-slate-400 hover:text-slate-800 p-0.5 rounded cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-bold text-slate-800 break-words">{helpPopupCard.name}</div>
              <div className="text-slate-500 font-semibold">
                {helpPopupCard.dateLabel} · {helpPopupCard.timeLabel}
              </div>
              <div className="text-amber-700 font-bold uppercase tracking-tight">
                {helpPopupCard.errorMessage || 'File not found.'}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Admin Contact
              </span>
              <p className="text-xs font-bold text-slate-800 whitespace-pre-wrap break-words leading-snug">
                {resolvedAdminContact}
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setHelpPopupCard(null)}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
