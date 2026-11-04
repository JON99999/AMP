import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  FolderOpen,
  HelpCircle,
  Info,
  Play,
  Plus,
  Search,
  Trash2,
  Edit3,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Columns,
  X,
  XCircle,
  Volume2,
  Download,
  Megaphone,
  BookOpen,
  RefreshCw,
  AlertCircle,
  Folder,
  FolderCheck,
  CassetteTape,
  NotebookPen,
  History,
  Link2,
  Unlink2,
  ListChecks,
  Rows3,
  Bold,
  Italic,
  Underline,
  Upload,
} from 'lucide-react';
import { cn } from '../lib/utils';

type MockupSectionId = 'all' | '37' | '38' | '39' | '40';
type CompareMode = 'split' | 'stacked' | 'before' | 'after';

const RULER_TICKS = [
  320, 360, 390, 420, 450, 460, 480, 520, 540, 630, 640, 690, 760, 780, 800, 840, 900, 920, 980,
  1040, 1130, 1180, 1300, 1360, 1600, 1920,
];

const QUICK_WIDTH_PRESETS: Array<{ label: string; value: number | null; note: string }> = [
  { label: '250px', value: 250, note: 'Player Compact' },
  { label: '320px', value: 320, note: 'Folder Minimal' },
  { label: '360px', value: 360, note: 'Ultra Narrow' },
  { label: '420px', value: 420, note: 'Card / Btn Collapse' },
  { label: '480px', value: 480, note: 'Hide Summary / Week Stack' },
  { label: '520px', value: 520, note: 'Mode Icons Only' },
  { label: '640px', value: 640, note: 'Header Stacked' },
  { label: '760px', value: 760, note: 'Media Table Icons' },
  { label: '780px', value: 780, note: 'Hide Tab Icons' },
  { label: '900px', value: 900, note: 'Prev/Next Short' },
  { label: '1040px', value: 1040, note: '+ ADD Short' },
  { label: '1130px', value: 1130, note: 'Filter/Mode Split' },
  { label: '1360px', value: 1360, note: 'Show Issues Full' },
  { label: 'Auto (Full AMP Width)', value: null, note: 'Fill Available Width' },
];

export interface ProposalItem {
  num: number;
  roadmapId: '#37' | '#38' | '#39' | '#40';
  status?: 'APPROVED' | 'REJECTED' | 'MODIFIED' | 'PENDING';
  target: string;
  summary: string;
  detail: string;
}

export const ENUMERATED_PROPOSALS: ProposalItem[] = [
  // #37 CalendarTab, WeeklyCalendarGrid, AnnouncementsListView, ShowsManagerView
  {
    num: 1,
    roadmapId: '#37',
    status: 'APPROVED',
    target: 'CalendarHeaderBar — Timezone Pill',
    summary: '[APPROVED] 1.a. Shorten inline timezone label to "PT (GMT-7)" ("PT" <520px); 1.b. Full string in tooltip',
    detail:
      '1.a. [APPROVED] Replaces "(GMT-07:00) Pacific Time (US & Canada)" inline text with compact "PT (GMT-7)". 1.b. [APPROVED] Keeps full timezone string on hover.',
  },
  {
    num: 2,
    roadmapId: '#37',
    status: 'REJECTED',
    target: 'CalendarHeaderBar — Calendar Mode Search',
    summary: '[REJECTED — Keep Separate] Keep "Filter announcements..." and "Filter shows..." separate in Calendar view',
    detail:
      '2.a. [REJECTED] Do not merge the two filter inputs in Calendar grid sub-mode; keep both separate inputs as in current code.',
  },
  {
    num: 3,
    roadmapId: '#37',
    status: 'MODIFIED',
    target: 'CalendarHeaderBar — Tab Icon & Contextual Add Button',
    summary:
      '[MODIFIED] 3.a. Swap Speaker (Volume2) + Document (FileText) on Announcements tab; 3.b. Contextual "+ ADD ANNOUNCEMENT" / "+ ADD SHOW" -> "+ ADD" -> "+"',
    detail:
      '3.a. [MODIFIED] Keep Document (FileText) icon and swap playing Speaker (Volume2) in place of Megaphone on Announcements tab. 3.b. [MODIFIED] Use contextual "+ ADD ANNOUNCEMENT" and "+ ADD SHOW" when width allows, collapsing to "+ ADD" and "+".',
  },
  {
    num: 4,
    roadmapId: '#37',
    status: 'MODIFIED',
    target: 'WeeklyCalendarGrid — 3-Cell Controls Bar',
    summary:
      '[MODIFIED] 4.a. Keep "PREV WEEK"/"NEXT WEEK" & 4.b. "Filter:"/"Mode:" labels at wide widths, but drop them earlier (<1220px / <1260px) to stay on 1 row longer; 4.c. [APPROVED] "All (24 Hours)" -> "24 Hours"',
    detail:
      '4.a. [MODIFIED] Keep "← PREV WEEK" / "NEXT WEEK →" when wide, dropping "WEEK" earlier (<1220px). 4.b. [MODIFIED] Keep "Filter:" and "Mode:" labels when wide, dropping them earlier (<1260px) to maintain a single row of controls longer. 4.c. [APPROVED] Shorten "All (24 Hours)" to "24 Hours".',
  },
  {
    num: 5,
    roadmapId: '#37',
    status: 'MODIFIED',
    target: 'AnnouncementsListView — Active Cards ("Edit", "Details" Switch & Summary Text)',
    summary:
      '[APPROVED / MODIFIED] 5.a. [APPROVED] "View/Edit" -> "Edit"; 5.b. [MODIFIED] Collapsible chevron switch labeled "Details"; 5.c. [APPROVED] Clean schedule summary ("Mon–Fri · 6 AM–7 PM")',
    detail:
      '5.a. [APPROVED] Shorten "View/Edit" to "Edit". 5.b. [MODIFIED] Use a reveal/hide chevron switch labeled "Details" (similar to a folder browser/collapsible icon) to show/hide Gate & Modified dates. 5.c. [APPROVED] Clean up top-right schedule summary text ("Mon–Fri · 6 AM–7 PM", "14 weekly slots").',
  },
  {
    num: 6,
    roadmapId: '#37',
    status: 'MODIFIED',
    target: 'AnnouncementsListView — Inactive Announcements Section & Card Details',
    summary:
      '[APPROVED / MODIFIED] 6.a. [APPROVED] Collapsible "Inactive Announcements" section; 6.b. [MODIFIED] Keep full card format, clock & action buttons + use "Details" switch from 5.b. for dates/gates',
    detail:
      '6.a. [APPROVED] Make Inactive Announcements a collapsible section header. 6.b. [MODIFIED] Preserve the full inactive card layout, 64px clock, Activate / Edit / Delete / Preview buttons, and incorporate the "Details" reveal/hide chevron switch from 5.b. to show/hide Created, Modified, Inactivated, and Gate info.',
  },
  {
    num: 7,
    roadmapId: '#37',
    status: 'MODIFIED',
    target: 'ShowsManagerView — Show Cards, Check Folders Button & Show Gap Row',
    summary:
      '[REJECTED / MODIFIED / APPROVED] 7.a. [REJECTED] Keep ID & Code line on card; 7.b. [MODIFIED] Shorten Check Folders button only when narrowing requires it; 7.c. [APPROVED] Compact "Show Gap:" row',
    detail:
      '7.a. [REJECTED] Keep "ID: show-1 • Code: Show_Spacer_1" line on show cards. 7.b. [MODIFIED] Keep "CHECK EVERGREEN & PLAYLIST FOLDERS" at wide widths and only collapse when window narrowing requires it. 7.c. [APPROVED] Adopt compact non-italic single-line row while keeping "Show Gap:" as the header label.',
  },

  // #38 AnnouncementEditorView & ShowEditorForm
  {
    num: 8,
    roadmapId: '#38',
    target: 'AnnouncementEditorView — Top Header Bar',
    summary: 'Remove static "EDITOR" title + "ID:" sub-line (move ID to icon tooltip) and shorten "Announcement Name" to "Name"',
    detail:
      'Streamlines the top bar so the Name input gets maximum horizontal room without wrapping against the Active/Suspended status toggle.',
  },
  {
    num: 9,
    roadmapId: '#38',
    target: 'AnnouncementEditorView — Gates Bar, Auto-Rotate Caption & Past Gates Archive',
    summary: 'Move "(Multiple files will be auto rotated)" into a "?" tooltip, remove grey Media sub-bar, remove "Purge All Expired", and collapse past/inactive gates into an archive drawer',
    detail:
      'Eliminates the secondary grey "Media (Multiple files will be auto rotated) | Actions" bar inside each gate, removes destructive Purge buttons, and hides expired/inactivated gates inside a collapsible "Past / Archived Gates" drawer so historical calendar views stay intact.',
  },
  {
    num: 10,
    roadmapId: '#38',
    target: 'AnnouncementEditorView — Gate Media Row & Backup MP3',
    summary: 'Fold the 2nd-line "Backup MP3" sub-row into an inline pill on the media row and make Delete icon-only',
    detail:
      'Reduces each rotating media item from a 2-row card to a single compact row with an inline "+ Backup" / "Backup Set" pill and icon-only Trash button.',
  },
  {
    num: 11,
    roadmapId: '#38',
    target: 'AnnouncementEditorView — Footer Audit Box',
    summary: 'Condense the bordered Created + Modified footer box into a compact "Modified [Date]" label with Created in tooltip',
    detail:
      'Replaces the multi-part bordered timestamp container in the editor footer with a single-line "Modified Oct 29, 2026" info item (showing Created timestamp on hover).',
  },
  {
    num: 12,
    roadmapId: '#38',
    target: 'ShowEditorForm — Prose Descriptions & Toggles',
    summary: 'Move helper prose under Short Name, Broadcast Status, Up Next, and Folder Overrides into "?" tooltips and combine Status + Up Next on one row',
    detail:
      'Replaces 4 multi-sentence helper paragraphs with hover "?" icons and merges Show Broadcast Status + Include in "Up Next" Promos into a single compact control card.',
  },

  // #39 LocationsModal, LocalHelpModal, CopyEditorModal, MediaPickerModal
  {
    num: 13,
    roadmapId: '#39',
    target: 'LocationsModal — AMP Folder & macOS .noindex Tip',
    summary: 'Put Browse + Open inline with the AMP Folder input and condense the 4-line macOS .noindex tip box into a 1-line collapsible/tooltip note',
    detail:
      'Places [Browse] and [Open] on the same row as the AMP Folder path input (when >=360px) and condenses the large blue macOS .noindex box into a compact single-line tip bar.',
  },
  {
    num: 14,
    roadmapId: '#39',
    target: 'LocationsModal — Advanced - Folder Overrides',
    summary: 'Display compact 1-line subfolder rows (settings, media_announcements, media_evergreens, media_shows, logs) inside the collapsible overrides drawer',
    detail:
      'Keeps the existing <details> "Advanced - Folder Overrides" collapsible drawer closed by default and formats the 5 real default subfolders ([AMP]/settings, [AMP]/media_announcements, [AMP]/media_evergreens, [AMP]/media_shows, [AMP]/logs) as compact 1-line rows.',
  },
  {
    num: 15,
    roadmapId: '#39',
    target: 'LocalHelpModal — Split Tabs (Station Settings vs. Setup Guide)',
    summary: 'Split LocalHelpModal into two top tabs: "Station Settings" (default) and "Setup Guide"',
    detail:
      'Surfaces live Admin controls (Station Timezone, Admin Contact, Up Next Promo, Schedule Window, Reset & Defaults) immediately on tab 1 without scrolling past 4 documentation chapters.',
  },
  {
    num: 16,
    roadmapId: '#39',
    target: 'CopyEditorModal — Header Subtitle & Top Metadata Grid',
    summary: 'Remove static subtitle ("Format and edit live read text directly below") and combine Filename + Approx. Read Time on one compact bar',
    detail:
      'Reclaims vertical height for the live read rich-text editor box while keeping word count, duration input, Auto (150 wpm) checkbox, and Backup Audio drawer intact.',
  },
  {
    num: 17,
    roadmapId: '#39',
    target: 'MediaPickerModal — Filter Toolbar',
    summary: 'Condense the Type radio group ("All / Audio / LiveRead") into a compact segmented pill toggle on the search row',
    detail:
      'Keeps Search, [+ Create Live Read], [+ Upload File], segmented [All | Audio | LiveRead], Unused First, and Count on a cleaner single toolbar.',
  },

  // #40 250px Player Chrome, PrerecordModal, PrerecordExportPopup
  {
    num: 18,
    roadmapId: '#40',
    target: 'PlayerTab (250px Chrome) — Prerecord Top Control Strip',
    summary: 'Combine Prerecord mode label + date/time into a tighter 2-line left block with single-line "Show" & "Export" buttons',
    detail:
      'Replaces the two-line "Choose / Show" button stack in the 250px Prerecord strip with side-by-side or compact single-line [Show] and [Export] buttons to save vertical timeline space.',
  },
  {
    num: 19,
    roadmapId: '#40',
    target: 'PrerecordModal — 3-Step Flow Consolidation',
    summary: 'Combine "1. Choose Show" + "2. Choose Air Date" into one view and remove the 3rd "Verify Air Date (Is this ok?)" confirmation screen',
    detail:
      'Lets the user pick the show and air date in a single step and click "Load Show" directly, eliminating two intermediate modal transitions.',
  },
  {
    num: 20,
    roadmapId: '#40',
    target: 'PrerecordExportPopup — Action & Preview Header',
    summary: 'Place [Export Files...] and [Log Exports] inline with the header/subheader to maximize preview height',
    detail:
      'Keep [Plan | .m3u LIST | Live Reads] and [Copy] intact while tightening the top header and export action buttons.',
  },
];

function ProposalBadge({ num, title }: { num: number; title?: string }) {
  return (
    <span
      title={title || `Proposed Change #${num}`}
      className="inline-flex items-center justify-center px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 border border-amber-600 font-mono font-black text-[10px] leading-tight shadow-2xs shrink-0 select-none"
    >
      #{num}
    </span>
  );
}

interface DebugPixelRulerProps {
  sectionNumber: string;
  sectionLabel: string;
  measuredWidth: number;
  simulatedWidth: number | null;
  onChangeSimulatedWidth: (val: number | null) => void;
  isCalendarSubMode?: boolean;
}

function DebugPixelRuler({
  sectionNumber,
  sectionLabel,
  measuredWidth,
  simulatedWidth,
  onChangeSimulatedWidth,
  isCalendarSubMode = true,
}: DebugPixelRulerProps) {
  const effectiveWidth = measuredWidth || simulatedWidth || 1200;
  const isUltraNarrowHeader = effectiveWidth > 0 && effectiveWidth < 360;
  const isFullStacked = effectiveWidth > 0 && effectiveWidth < 390;
  const isHeaderStacked =
    effectiveWidth > 0 && effectiveWidth < (isCalendarSubMode ? 640 : 540);
  const isCell3Below = effectiveWidth > 0 && effectiveWidth < 630;
  const isFilterModeStacked = effectiveWidth > 0 && effectiveWidth < 1130;

  return (
    <div className="w-full bg-slate-900 text-white rounded-lg border border-slate-700 overflow-hidden shadow-xs select-none">
      {/* Top Interactive Width Control Strip */}
      <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold text-[10px] uppercase">
            #{sectionNumber} Viewport Width
          </span>
          <span className="font-bold text-slate-300">{sectionLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="range"
            min={250}
            max={2400}
            step={5}
            value={simulatedWidth ?? Math.min(2400, Math.max(250, effectiveWidth))}
            onChange={(e) => onChangeSimulatedWidth(parseInt(e.target.value, 10))}
            className="w-36 sm:w-56 accent-cyan-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title="Drag to dynamically resize this mockup section (250px – 2400px)"
          />
          <span className="font-mono font-black text-cyan-400 text-xs min-w-[96px] text-right">
            {simulatedWidth === null ? `Auto (${effectiveWidth}px)` : `${simulatedWidth}px`}
          </span>
        </div>
      </div>

      {/* Quick Breakpoint Presets */}
      <div className="px-2.5 py-1 bg-slate-900/90 border-b border-slate-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-mono text-slate-400 uppercase mr-1 shrink-0">
          Snap:
        </span>
        {QUICK_WIDTH_PRESETS.map((preset) => {
          const isActive = simulatedWidth === preset.value;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChangeSimulatedWidth(preset.value)}
              title={`${preset.label} — ${preset.note}`}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer shrink-0 border',
                isActive
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-2xs'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* User's Exact DEBUG PIXEL RULER Component from CalendarHeaderBar.tsx */}
      <div className="w-full bg-slate-900 text-white text-[9px] font-mono relative h-10 select-none overflow-hidden flex flex-col justify-between">
        <div className="flex items-center justify-between px-2 pt-0.5 z-10 bg-slate-900/90 backdrop-blur-[1px]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400 uppercase tracking-wider">
              DEBUG PIXEL RULER
            </span>
            <span className="px-1.5 py-0 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {isUltraNarrowHeader
                ? 'Ultra Narrow <360'
                : isFullStacked
                  ? 'Full Stacked <390'
                  : isHeaderStacked
                    ? 'Header Stacked <640/540'
                    : isCell3Below
                      ? 'Cell 3 Below <630'
                      : isFilterModeStacked
                        ? 'Filter/Mode Split <1130'
                        : 'Full Width >=1130'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-cyan-400 font-bold text-[10px]">
              Trigger Value: {effectiveWidth}px
            </span>
          </div>
        </div>

        <div className="relative w-full h-5 border-t border-slate-800">
          {Array.from({ length: 48 }).map((_, i) => {
            const px = (i + 1) * 50;
            const isMajor = px % 100 === 0;
            return (
              <div
                key={px}
                className="absolute bottom-0 flex flex-col items-start pointer-events-none"
                style={{ left: `${px}px` }}
              >
                {isMajor && (
                  <span className="text-[8px] text-slate-400 pl-0.5 leading-none mb-0.5">
                    {px}
                  </span>
                )}
                <div
                  className={cn(
                    'w-px',
                    isMajor ? 'h-2.5 bg-slate-500' : 'h-1.5 bg-slate-700'
                  )}
                />
              </div>
            );
          })}

          {RULER_TICKS.map((bp) => (
            <div
              key={`bp-${bp}`}
              className="absolute top-0 bottom-0 flex flex-col justify-start pointer-events-none z-10"
              style={{ left: `${bp}px` }}
            >
              <div className="w-px h-full bg-amber-400/80" />
              <span className="text-[8px] text-amber-300 font-bold bg-slate-950/90 px-0.5 leading-none border-r border-b border-amber-500/40 rounded-br">
                {bp}
              </span>
            </div>
          ))}

          {/* Live Cursor Indicator */}
          {effectiveWidth > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-20 pointer-events-none"
              style={{ left: `${Math.max(0, effectiveWidth - 2)}px` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Exact 64px SVG Analog Clock from AnnouncementsListView.tsx
 */
function AnnouncementCardClockSvg({ minute, isAudio = false }: { minute: number; isAudio?: boolean }) {
  const angleDeg = minute * 6;
  return (
    <div className="flex flex-col items-center justify-center shrink-0 w-[64px]">
      <div className="relative w-[64px] h-[64px] flex items-center justify-center shrink-0">
        <svg viewBox="0 0 68 68" className="w-full h-full overflow-visible">
          <circle
            cx="34"
            cy="34"
            r="28"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          {Array.from({ length: 12 }).map((_, i) => {
            const deg = i * 30;
            const rad = ((deg - 90) * Math.PI) / 180;
            const isQuarter = i % 3 === 0;
            const rInner = isQuarter ? 23.5 : 25;
            const rOuter = 28;
            const x1 = 34 + rInner * Math.cos(rad);
            const y1 = 34 + rInner * Math.sin(rad);
            const x2 = 34 + rOuter * Math.cos(rad);
            const y2 = 34 + rOuter * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isQuarter ? '#64748b' : '#94a3b8'}
                strokeWidth={isQuarter ? '1.5' : '1'}
              />
            );
          })}
          <text
            x="34"
            y="13.5"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[7.5px] font-sans font-extrabold fill-slate-500 select-none"
          >
            0
          </text>
          <text
            x="54.5"
            y="34.5"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[7.5px] font-sans font-extrabold fill-slate-500 select-none"
          >
            15
          </text>
          <text
            x="34"
            y="55"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[7.5px] font-sans font-extrabold fill-slate-500 select-none"
          >
            30
          </text>
          <text
            x="13.5"
            y="34.5"
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[7.5px] font-sans font-extrabold fill-slate-500 select-none"
          >
            45
          </text>
          <line
            x1="34"
            y1="34"
            x2={34 + 19 * Math.cos(((angleDeg - 90) * Math.PI) / 180)}
            y2={34 + 19 * Math.sin(((angleDeg - 90) * Math.PI) / 180)}
            stroke={isAudio ? '#9333ea' : '#2563eb'}
            strokeWidth="2.25"
            strokeLinecap="round"
          />
          <circle cx="34" cy="34" r="2.5" fill={isAudio ? '#7e22ce' : '#1d4ed8'} />
        </svg>
      </div>
    </div>
  );
}

/**
 * Exact 50x50 SVG Clock from AnnouncementEditorView.tsx
 */
function EditorClockSvg({ minute }: { minute: number }) {
  const angleDeg = (minute % 60) * 6;
  return (
    <div className="relative w-[50px] h-[50px] flex items-center justify-center shrink-0 select-none">
      <svg viewBox="0 0 68 68" className="w-full h-full overflow-visible">
        <circle
          cx="34"
          cy="34"
          r="28"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {Array.from({ length: 12 }).map((_, i) => {
          const deg = i * 30;
          const rad = ((deg - 90) * Math.PI) / 180;
          const isQuarter = i % 3 === 0;
          const rInner = isQuarter ? 23.5 : 25;
          const rOuter = 28;
          return (
            <line
              key={i}
              x1={34 + rInner * Math.cos(rad)}
              y1={34 + rInner * Math.sin(rad)}
              x2={34 + rOuter * Math.cos(rad)}
              y2={34 + rOuter * Math.sin(rad)}
              stroke={isQuarter ? '#64748b' : '#94a3b8'}
              strokeWidth={isQuarter ? '1.5' : '1'}
            />
          );
        })}
        <text x="34" y="13.5" textAnchor="middle" dominantBaseline="central" className="text-[7.5px] font-sans font-extrabold fill-slate-500">0</text>
        <text x="54.5" y="34.5" textAnchor="middle" dominantBaseline="central" className="text-[7.5px] font-sans font-extrabold fill-slate-500">15</text>
        <text x="34" y="55" textAnchor="middle" dominantBaseline="central" className="text-[7.5px] font-sans font-extrabold fill-slate-500">30</text>
        <text x="13.5" y="34.5" textAnchor="middle" dominantBaseline="central" className="text-[7.5px] font-sans font-extrabold fill-slate-500">45</text>
        <line
          x1="34"
          y1="34"
          x2={34 + 19 * Math.cos(((angleDeg - 90) * Math.PI) / 180)}
          y2={34 + 19 * Math.sin(((angleDeg - 90) * Math.PI) / 180)}
          stroke="#2563eb"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="34" cy="34" r="2.5" fill="#1d4ed8" />
      </svg>
    </div>
  );
}

/**
 * Custom hook to measure a DOM element's live width via ResizeObserver
 */
function useMeasuredWidth(depKey?: any): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(1200);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setWidth(Math.round(rect.width));
      }
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [depKey]);

  return [ref, width];
}

export function UiDeclutterMockups() {
  const [activeSection, setActiveSection] = useState<MockupSectionId>('all');
  const [compareMode, setCompareMode] = useState<CompareMode>('split');
  const [showProposalDirectory, setShowProposalDirectory] = useState<boolean>(true);

  // Synchronized vs Independent Width Mode
  const [syncWidths, setSyncWidths] = useState<boolean>(false);
  const [masterWidth, setMasterWidth] = useState<number | null>(null);

  const [width37, setWidth37] = useState<number | null>(null);
  const [width38, setWidth38] = useState<number | null>(null);
  const [width39, setWidth39] = useState<number | null>(null);
  const [width40, setWidth40] = useState<number | null>(250);

  // Sub-view states for each section
  const [subMode37, setSubMode37] = useState<'calendar' | 'announcements' | 'shows'>('announcements');
  const [subMode38, setSubMode38] = useState<'announcement_editor' | 'show_editor'>('announcement_editor');
  const [subMode39, setSubMode39] = useState<'locations' | 'help' | 'copy_media'>('locations');
  const [subMode40, setSubMode40] = useState<'player_chrome' | 'prerecord_modal' | 'export_popup'>('player_chrome');

  // Interactive demo states inside mockups
  const [showCardAuditPopover, setShowCardAuditPopover] = useState<boolean>(true);
  const [showInactiveDrawerAfter, setShowInactiveDrawerAfter] = useState<boolean>(true);
  const [showInactiveCardDetailsAfter, setShowInactiveCardDetailsAfter] = useState<boolean>(true);
  const [showTooltipPreview38, setShowTooltipPreview38] = useState<boolean>(true);
  const [showArchivedGatesAfter38, setShowArchivedGatesAfter38] = useState<boolean>(false);
  const [helpModalAfterTab, setHelpModalAfterTab] = useState<'settings' | 'guide'>('settings');
  const [showAdvancedFoldersBefore, setShowAdvancedFoldersBefore] = useState<boolean>(true);
  const [showAdvancedFoldersAfter, setShowAdvancedFoldersAfter] = useState<boolean>(false);
  const [prerecordModalStep40, setPrerecordModalStep40] = useState<'list' | 'selected' | 'verify'>('list');

  // Live ResizeObserver hooks for each section's active viewport
  const [ref37Before, measured37Before] = useMeasuredWidth(`${activeSection}-${compareMode}-${width37}-${masterWidth}-${syncWidths}`);
  const [ref37After, measured37After] = useMeasuredWidth(`${activeSection}-${compareMode}-${width37}-${masterWidth}-${syncWidths}`);
  const [ref38Before, measured38Before] = useMeasuredWidth(`${activeSection}-${compareMode}-${width38}-${masterWidth}-${syncWidths}`);
  const [ref38After, measured38After] = useMeasuredWidth(`${activeSection}-${compareMode}-${width38}-${masterWidth}-${syncWidths}`);
  const [ref39Before, measured39Before] = useMeasuredWidth(`${activeSection}-${compareMode}-${width39}-${masterWidth}-${syncWidths}`);
  const [ref39After, measured39After] = useMeasuredWidth(`${activeSection}-${compareMode}-${width39}-${masterWidth}-${syncWidths}`);
  const [ref40Before, measured40Before] = useMeasuredWidth(`${activeSection}-${compareMode}-${width40}-${masterWidth}-${syncWidths}`);
  const [ref40After, measured40After] = useMeasuredWidth(`${activeSection}-${compareMode}-${width40}-${masterWidth}-${syncWidths}`);

  const getEffectiveSimWidth = (sectionWidth: number | null) =>
    syncWidths ? masterWidth : sectionWidth;

  const handleSetSectionWidth = (
    setter: React.Dispatch<React.SetStateAction<number | null>>,
    val: number | null
  ) => {
    if (syncWidths) {
      setMasterWidth(val);
    } else {
      setter(val);
    }
  };

  const shouldRenderSection = (id: '37' | '38' | '39' | '40') =>
    activeSection === 'all' || activeSection === id;

  const showBefore = compareMode === 'split' || compareMode === 'stacked' || compareMode === 'before';
  const showAfter = compareMode === 'split' || compareMode === 'stacked' || compareMode === 'after';

  // ============================================================================
  // #37 Responsive Threshold Calculations (Exact CalendarTab.tsx + WeeklyCalendarGrid.tsx logic)
  // ============================================================================
  const compute37Flags = (w: number, mode: 'calendar' | 'announcements' | 'shows') => {
    const isCalendar = mode === 'calendar';
    return {
      width: w,
      hideCalendarIcon: w > 0 && w < 780,
      hideAnnouncementsIcons: w > 0 && w < 780,
      hideShowsIcon: w > 0 && w < 780,
      addTextShort: w > 0 && w < (isCalendar ? 1040 : 900) && w >= (isCalendar ? 920 : 800),
      addTextIconOnly: w > 0 && w < (isCalendar ? 920 : 800),
      halfFilter: w > 0 && w < (isCalendar ? 980 : 840),
      modeIconsOnly: w > 0 && w < 520,
      isHeaderStacked: w > 0 && w < (isCalendar ? 640 : 540),
      isUltraNarrowHeader: w > 0 && w < 360,
      isFullStacked: w > 0 && w < 390,
      isFilterModeStacked: w > 0 && w < 1130,
      isCell3Below: w > 0 && w < 630,
      // WeeklyCalendarGrid.tsx exact flags:
      dropShowIssuesText: w > 0 && w < 1360,
      dropAuditWord: w > 0 && w < 1300,
      controlsNavShort: w > 0 && w < 900 && w >= 690,
      controlsNavIconOnly: w > 0 && w < 690,
      isNavStacked: w > 0 && w < 840,
      isWeekDayStacked: w > 0 && w < 480,
      // #4 After earlier-collapse flags to stay on 1 row longer:
      controlsNavShortEarly: w > 0 && w < 1220 && w >= 690,
      dropFilterModeLabelsEarly: w > 0 && w < 1260,
      isFilterModeStackedAfter: w > 0 && w < 980,
      // AnnouncementsListView & ShowsManagerView exact flags:
      listCardCollapsePreviewText: w > 0 && w < 520,
      listCardCollapseCopyText: w > 0 && w < 460,
      listCardCollapseDetailsText: w > 0 && w < 440,
      listCardCollapseViewEditText: w > 0 && w < 420,
      listCardHideSummaryTag: w > 0 && w < 480,
      listCardHideTypeTag: w > 0 && w < 420,
      showsCardsCollapse: w > 0 && w < 450,
      showsFolderCheckShort: w > 0 && w < 420 && w >= 320,
      showsFolderCheckMinimal: w > 0 && w < 320,
      purgeTextMinimal: w > 0 && w < 480,
      purgeTextShort: w > 0 && w < 680 && w >= 480,
      checkMissingShort: w > 0 && w < 560,
    };
  };

  const simWidth37 = getEffectiveSimWidth(width37);
  const simWidth38 = getEffectiveSimWidth(width38);
  const simWidth39 = getEffectiveSimWidth(width39);
  const simWidth40 = getEffectiveSimWidth(width40);

  const w37B = simWidth37 ?? measured37Before;
  const w37A = simWidth37 ?? measured37After;
  const flags37Before = compute37Flags(w37B, subMode37);
  const flags37After = compute37Flags(w37A, subMode37);

  const w38B = simWidth38 ?? measured38Before;
  const w38A = simWidth38 ?? measured38After;
  const w39B = simWidth39 ?? measured39Before;
  const w39A = simWidth39 ?? measured39After;
  const w40B = simWidth40 ?? measured40Before;
  const w40A = simWidth40 ?? measured40After;

  return (
    <div className="w-full max-w-full flex flex-col gap-5 text-slate-900">
      {/* Top Mockup Control Bar */}
      <div className="w-full rounded-xl border-2 border-purple-300 bg-white p-3.5 shadow-xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-xs font-black uppercase tracking-wider">
                #37–#40 Full-Width Visual-Parity Workbench
              </span>
              <h2 className="text-base font-black tracking-tight text-slate-900">
                Production Replica &amp; Enumerated Declutter Proposals (#1–#20)
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Expanded to the full width of AMP. Every proposed change is tagged with its badge (
              <ProposalBadge num={1} /> – <ProposalBadge num={20} />) so you can approve, reject, or modify items individually.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Enumerated Proposal Directory */}
            <button
              type="button"
              onClick={() => setShowProposalDirectory((p) => !p)}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors',
                showProposalDirectory
                  ? 'bg-amber-100 text-amber-950 border-amber-400'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              )}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>{showProposalDirectory ? 'Hide #1–#20 Index' : 'Show #1–#20 Index'}</span>
            </button>

            {/* Synchronized vs Independent Width Toggle */}
            <button
              type="button"
              onClick={() => {
                setSyncWidths((prev) => {
                  const next = !prev;
                  if (next && masterWidth === null) {
                    setMasterWidth(width37 ?? null);
                  }
                  return next;
                });
              }}
              className={cn(
                'px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors',
                syncWidths
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-600 shadow-2xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              )}
              title="Link all 4 sections to a single master pixel width or resize each section independently"
            >
              {syncWidths ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
              <span>{syncWidths ? 'Widths Synced' : 'Independent Widths'}</span>
            </button>

            {/* Compare Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300 gap-1">
              <button
                type="button"
                onClick={() => setCompareMode('split')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors',
                  compareMode === 'split'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200'
                )}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('stacked')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors',
                  compareMode === 'stacked'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200'
                )}
                title="Stack Before and After vertically so both span 100% of AMP's full width"
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span>Stacked (100% Width)</span>
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('before')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                  compareMode === 'before'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200'
                )}
              >
                Before Only
              </button>
              <button
                type="button"
                onClick={() => setCompareMode('after')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                  compareMode === 'after'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200'
                )}
              >
                After Only
              </button>
            </div>
          </div>
        </div>

        {/* Section Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 mr-1">
            Focus Area:
          </span>
          {[
            { id: 'all' as const, label: 'All (#37–#40)' },
            { id: '37' as const, label: '#37 Calendar, Announcements & Shows (#1–#7)' },
            { id: '38' as const, label: '#38 Announcement & Show Editors (#8–#12)' },
            { id: '39' as const, label: '#39 Folders, Help & Asset Modals (#13–#17)' },
            { id: '40' as const, label: '#40 250px Player Chrome & Pop-Ups (#18–#20)' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors',
                activeSection === item.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Enumerated Proposal Directory (#1 – #20) */}
        {showProposalDirectory && (
          <div className="pt-2 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {(['#37', '#38', '#39', '#40'] as const).map((rId) => (
                <div
                  key={rId}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 flex flex-col gap-1.5"
                >
                  <div className="text-xs font-black uppercase text-slate-800 border-b border-slate-200 pb-1 flex items-center justify-between">
                    <span>Roadmap {rId} Proposals</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {ENUMERATED_PROPOSALS.filter((p) => p.roadmapId === rId).length} items
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {ENUMERATED_PROPOSALS.filter((p) => p.roadmapId === rId).map((p) => (
                      <div key={p.num} className="text-xs leading-snug flex items-start gap-1.5">
                        <ProposalBadge num={p.num} title={p.detail} />
                        <div className="min-w-0">
                          {p.status && (
                            <span
                              className={cn(
                                'inline-block px-1 py-0 rounded text-[9px] font-black uppercase mr-1 border',
                                p.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : p.status === 'REJECTED'
                                    ? 'bg-rose-100 text-rose-800 border-rose-300 line-through'
                                    : p.status === 'MODIFIED'
                                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                                      : 'bg-slate-100 text-slate-600 border-slate-300'
                              )}
                            >
                              {p.status}
                            </span>
                          )}
                          <span className="font-bold text-slate-900">{p.target}: </span>
                          <span
                            className={cn(
                              'text-slate-600',
                              p.status === 'REJECTED' && 'line-through text-slate-400'
                            )}
                          >
                            {p.summary}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          SECTION #37: CalendarTab Header, Sub-Controls, Announcements & Shows
          ===================================================================== */}
      {shouldRenderSection('37') && (
        <section className="w-full rounded-xl border-2 border-slate-300 bg-slate-50/70 p-3.5 flex flex-col gap-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black uppercase">
                  Roadmap #37 (Proposals #1–#7)
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  `CalendarHeaderBar`, `WeeklyCalendarGrid`, `AnnouncementsListView` &amp; `ShowsManagerView`
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Switch sub-views (`Calendar Grid`, `Announcements List`, `Shows List`) or drag the pixel ruler to test all responsive thresholds.
              </p>
            </div>

            {/* Sub-View Switcher for #37 */}
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg border border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-600 px-1.5">
                Sub-View:
              </span>
              {(
                [
                  { id: 'calendar', label: 'Calendar Grid (#1–#4)' },
                  { id: 'announcements', label: 'Announcements List (#5–#6)' },
                  { id: 'shows', label: 'Shows List (#7)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubMode37(tab.id)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                    subMode37 === tab.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-300/60'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exact DEBUG PIXEL RULER for #37 */}
          <DebugPixelRuler
            sectionNumber="37"
            sectionLabel={`CalendarHeaderBar + ${
              subMode37 === 'calendar'
                ? 'WeeklyCalendarGrid 3-Cell Controls'
                : subMode37 === 'announcements'
                  ? 'AnnouncementsListView Cards'
                  : 'ShowsManagerView Cards'
            }`}
            measuredWidth={w37B}
            simulatedWidth={simWidth37}
            onChangeSimulatedWidth={(val) => handleSetSectionWidth(setWidth37, val)}
            isCalendarSubMode={subMode37 === 'calendar'}
          />

          <div
            className={cn(
              'grid gap-4 items-start overflow-x-auto pb-1',
              compareMode === 'split' && simWidth37 === null
                ? 'grid-cols-1 2xl:grid-cols-2'
                : 'grid-cols-1'
            )}
          >
            {/* #37 BEFORE (EXACT PRODUCTION REPLICA) */}
            {showBefore && (
              <div
                ref={ref37Before}
                style={
                  simWidth37 !== null
                    ? { width: `${simWidth37}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-rose-300 bg-[#F8FAFC] overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-900">
                    Before (Current Production Code — {w37B}px)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-rose-700">
                    {flags37Before.isHeaderStacked
                      ? 'Stacked Header'
                      : flags37Before.modeIconsOnly
                        ? 'Icons-Only Mode'
                        : flags37Before.addTextIconOnly
                          ? '+ Icon Only'
                          : flags37Before.addTextShort
                            ? '+ ADD Short'
                            : 'Full Header'}
                  </span>
                </div>

                <div className="p-2.5 space-y-2.5">
                  {/* Exact CalendarHeaderBar.tsx */}
                  <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0 overflow-hidden">
                    <div
                      className={cn(
                        'p-2',
                        flags37Before.isUltraNarrowHeader
                          ? 'flex flex-col items-stretch gap-2'
                          : flags37Before.isHeaderStacked
                            ? 'grid grid-cols-[1fr_auto] items-center gap-2'
                            : 'flex flex-nowrap items-center justify-between gap-2'
                      )}
                    >
                      {/* Mode Switcher Group */}
                      <div
                        className={cn(
                          'flex items-center gap-2 min-w-0',
                          flags37Before.isUltraNarrowHeader
                            ? 'w-full justify-start'
                            : flags37Before.isHeaderStacked
                              ? 'col-start-1 row-start-1 justify-self-start'
                              : 'shrink-0'
                        )}
                      >
                        <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-900 gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSubMode37('calendar')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37Before.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'calendar'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'calendar'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37Before.hideCalendarIcon || flags37Before.modeIconsOnly) && (
                              <Calendar className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                            )}
                            {!flags37Before.modeIconsOnly && <span>Calendar</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSubMode37('announcements')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37Before.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'announcements'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'announcements'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37Before.hideAnnouncementsIcons ||
                              flags37Before.modeIconsOnly) && (
                              <span className="inline-flex items-center gap-0.5 shrink-0">
                                <Megaphone className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                                <FileText className="w-3 h-3 text-slate-200 shrink-0" />
                              </span>
                            )}
                            {!flags37Before.modeIconsOnly && <span>Announcements</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSubMode37('shows')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37Before.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'shows'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'shows'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37Before.hideShowsIcon || flags37Before.modeIconsOnly) && (
                              <BookOpen className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                            )}
                            {!flags37Before.modeIconsOnly && <span>Shows</span>}
                          </button>
                        </div>

                        {/* Station Timezone Indicator Pill */}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-250 text-[11px] font-bold tracking-tight transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                          title="Station Timezone: (GMT-07:00) Pacific Time (US & Canada)"
                        >
                          <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>
                            {flags37Before.modeIconsOnly
                              ? 'GMT-07:00'
                              : '(GMT-07:00) Pacific Time (US & Canada)'}
                          </span>
                        </button>
                      </div>

                      {/* Filter Input(s) */}
                      <div
                        className={cn(
                          'flex items-center gap-1.5 min-w-0',
                          flags37Before.isUltraNarrowHeader
                            ? 'w-full'
                            : flags37Before.isHeaderStacked
                              ? 'col-span-2 row-start-2 w-full'
                              : 'flex-1 justify-end'
                        )}
                      >
                        {subMode37 === 'calendar' ? (
                          <div
                            className={cn(
                              'flex items-center gap-1.5',
                              flags37Before.isHeaderStacked ? 'w-full' : 'justify-end w-full'
                            )}
                          >
                            <div
                              className={cn(
                                'relative min-w-0',
                                flags37Before.isHeaderStacked
                                  ? 'flex-1'
                                  : flags37Before.halfFilter
                                    ? 'w-28'
                                    : 'w-44'
                              )}
                            >
                              <input
                                type="text"
                                readOnly
                                placeholder="Filter announcements..."
                                className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                              />
                            </div>
                            <div
                              className={cn(
                                'relative min-w-0',
                                flags37Before.isHeaderStacked
                                  ? 'flex-1'
                                  : flags37Before.halfFilter
                                    ? 'w-28'
                                    : 'w-44'
                              )}
                            >
                              <input
                                type="text"
                                readOnly
                                placeholder="Filter shows..."
                                className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'relative min-w-0',
                              flags37Before.isHeaderStacked
                                ? 'w-full'
                                : flags37Before.halfFilter
                                  ? 'w-32'
                                  : 'w-56'
                            )}
                          >
                            <input
                              type="text"
                              readOnly
                              placeholder={
                                subMode37 === 'announcements'
                                  ? 'Filter announcements...'
                                  : 'Filter shows...'
                              }
                              className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                            />
                          </div>
                        )}
                      </div>

                      {/* + ADD Button */}
                      <div
                        className={cn(
                          'flex items-center shrink-0',
                          flags37Before.isUltraNarrowHeader
                            ? 'w-full justify-start'
                            : flags37Before.isHeaderStacked
                              ? 'col-start-2 row-start-1 justify-self-end'
                              : ''
                        )}
                      >
                        <button
                          type="button"
                          className="p-1.5 px-3 bg-blue-600 text-white rounded border border-blue-700 text-xs font-black tracking-tighter shadow-xs hover:bg-blue-700 uppercase cursor-pointer h-7 flex items-center justify-center shrink-0 whitespace-nowrap"
                        >
                          {flags37Before.addTextIconOnly
                            ? '+'
                            : flags37Before.addTextShort
                              ? '+ ADD'
                              : subMode37 === 'shows'
                                ? '+ ADD SHOW'
                                : '+ ADD NEW'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SUB-VIEW 1: ANNOUNCEMENTS LIST (Exact AnnouncementsListView.tsx) */}
                  {subMode37 === 'announcements' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        {[
                          {
                            id: 'ann-1',
                            name: 'Live Read Future Example',
                            minute: 20,
                            isScript: true,
                            typeTag: 'Hourly',
                            summary: 'Every hour (Mon–Fri, 6:00 AM–7:00 PM)',
                            files: ['live_read_future_1.txt', 'live_read_future_2.txt'],
                          },
                          {
                            id: 'ann-2',
                            name: 'MP3 Audio Played Example',
                            minute: 40,
                            isScript: false,
                            typeTag: 'Advanced',
                            summary: 'Custom Weekly Grid (14 slots)',
                            files: ['station_id_legal_top.mp3'],
                          },
                        ].map((s, idx) => (
                          <div
                            key={s.id}
                            className={cn(
                              'py-1.5 px-3 rounded-lg border border-slate-300 border-l-4 shadow-2xs flex items-center gap-3',
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                              s.isScript ? 'border-l-blue-500' : 'border-l-purple-500'
                            )}
                          >
                            <AnnouncementCardClockSvg minute={s.minute} isAudio={!s.isScript} />

                            <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                              {/* Top Row */}
                              <div className="flex items-baseline justify-between gap-2 w-full min-w-0">
                                <span className="text-base font-black text-slate-900 truncate min-w-0">
                                  {s.name}
                                </span>
                                {!flags37Before.listCardHideTypeTag && (
                                  <span className="text-xs text-slate-500 font-medium truncate shrink-0 max-w-[55%] text-right">
                                    <span className="text-slate-700 font-bold">{s.typeTag}</span>
                                    {!flags37Before.listCardHideSummaryTag && (
                                      <span className="text-slate-600"> • {s.summary}</span>
                                    )}
                                  </span>
                                )}
                              </div>

                              {/* Bottom Row */}
                              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-base font-sans font-black tabular-nums leading-none text-slate-900">
                                    :{s.minute.toString().padStart(2, '0')}m
                                  </span>

                                  <button
                                    type="button"
                                    className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all border bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 shrink-0 h-6"
                                  >
                                    <Edit3 className="w-3 h-3 shrink-0" />
                                    {!flags37Before.listCardCollapseViewEditText && (
                                      <span>View/Edit</span>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all border bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 shrink-0 h-6"
                                  >
                                    <Copy className="w-3 h-3 shrink-0" />
                                    {!flags37Before.listCardCollapseCopyText && <span>Copy</span>}
                                  </button>
                                </div>

                                <div className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    className={cn(
                                      'px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 h-6',
                                      s.isScript
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : 'bg-purple-50 text-purple-700 border-purple-200'
                                    )}
                                  >
                                    {s.isScript ? (
                                      <FileText className="w-3 h-3 shrink-0" />
                                    ) : (
                                      <Play className="w-3 h-3 shrink-0 fill-current" />
                                    )}
                                    {!flags37Before.listCardCollapsePreviewText && (
                                      <span>Preview</span>
                                    )}
                                  </button>

                                  {s.files.length > 1 ? (
                                    <select className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-700 font-medium min-w-0 flex-1 max-w-[200px] truncate h-6">
                                      {s.files.map((f) => (
                                        <option key={f}>{f}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-100 text-slate-700 font-medium truncate min-w-0 flex-1 max-w-[200px] h-6 flex items-center">
                                      {s.files[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Exact Inactive Announcements Section (lines 710-820 of AnnouncementsListView.tsx) */}
                      <div className="pt-2 border-t border-slate-200">
                        <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5 px-1">
                          Inactive Announcements
                        </h3>

                        <div className="py-1.5 px-3 rounded-lg border border-slate-200 border-l-4 border-l-slate-400 bg-white opacity-75 flex items-center gap-3">
                          <AnnouncementCardClockSvg minute={50} />
                          <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-base font-black text-slate-700 truncate">
                                Expired Sponsor Read Example
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold uppercase">
                                  Activate
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold uppercase">
                                  View/Edit
                                </span>
                                <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 text-xs font-bold uppercase">
                                  Delete
                                </span>
                              </div>
                            </div>
                            {/* Verbose 3-timestamp row */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                              <span>
                                <strong className="font-semibold text-slate-500">Created:</strong>{' '}
                                Sep 01, 2026 9:00 AM
                              </span>
                              <span>
                                <strong className="font-semibold text-slate-500">Modified:</strong>{' '}
                                Oct 12, 2026 2:15 PM
                              </span>
                              <span>
                                <strong className="font-semibold text-slate-500">
                                  Inactivated:
                                </strong>{' '}
                                Oct 31, 2026 11:59 PM
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-VIEW 2: SHOWS LIST (Exact ShowsManagerView.tsx) */}
                  {subMode37 === 'shows' && (
                    <div className="space-y-2.5">
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2 px-3 text-amber-800 text-xs italic flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
                        <div>
                          <span className="font-semibold not-italic text-amber-900">
                            Show Gap:{' '}
                          </span>
                          Wednesday 11:00 AM – 12:00 PM (1h unscheduled gap)
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <div className="bg-slate-100 border-b border-slate-250 pl-[17px] pr-3 py-1.5 flex items-center gap-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                          <div className="w-[85px] shrink-0">Day &amp; Time</div>
                          <div className="flex-1 min-w-0">Show Details</div>
                          {!flags37Before.showsCardsCollapse && (
                            <div className="w-[70px] shrink-0" />
                          )}
                        </div>

                        <div className="divide-y divide-slate-150">
                          {[
                            {
                              id: 'show-1',
                              day: 'Wednesday',
                              time: '9:00 AM',
                              dur: '2h 0m',
                              name: 'Show Spacer 1',
                              host: 'Host 1',
                              code: 'Show_Spacer_1',
                              desc: 'Two-hour live studio broadcast block with scheduled breaks.',
                              bg: '#f0f9ff',
                              border: '#0284c7',
                            },
                            {
                              id: 'show-2',
                              day: 'Wednesday',
                              time: '12:00 PM',
                              dur: '2h 0m',
                              name: 'Show Spacer 2',
                              host: 'Host 2',
                              code: 'Show_Spacer_2',
                              desc: 'Midday music and community announcement program.',
                              bg: '#f5f3ff',
                              border: '#7c3aed',
                            },
                          ].map((show) => (
                            <div
                              key={show.id}
                              className="flex items-stretch p-3 gap-4 relative"
                              style={{
                                backgroundColor: show.bg,
                                borderLeft: `5px solid ${show.border}`,
                              }}
                            >
                              <div className="flex flex-col gap-1 justify-center w-[85px] shrink-0">
                                <span className="px-1 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[11px] font-black uppercase tracking-wide text-center leading-none">
                                  {show.day}
                                </span>
                                <span className="flex items-center justify-center gap-0.5 text-[11px] font-sans font-bold tabular-nums text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 leading-none">
                                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{show.time}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-sans font-bold tabular-nums uppercase text-center leading-none">
                                  {show.dur}
                                </span>

                                {flags37Before.showsCardsCollapse && (
                                  <div className="flex flex-col items-center gap-1 mt-1 pt-1 border-t border-slate-200/80">
                                    <button
                                      type="button"
                                      className="flex items-center gap-1 py-0.5 px-1.5 bg-white border border-blue-300 rounded text-blue-700"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span className="text-[10px] font-black uppercase">Edit</span>
                                    </button>
                                    <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                      Active
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight mb-0.5">
                                  {show.name} by {show.host}
                                </h3>
                                <p className="text-xs text-slate-500 leading-normal font-medium line-clamp-1">
                                  {show.desc}
                                </p>
                                <div className="text-[10px] text-slate-400 font-sans font-bold uppercase mt-1 leading-none">
                                  ID: {show.id} • Code: {show.code}
                                </div>
                              </div>

                              {!flags37Before.showsCardsCollapse && (
                                <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 w-[70px]">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 py-1 px-2 bg-white border border-blue-300 rounded text-blue-700 shadow-2xs"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span className="text-xs font-black uppercase">Edit</span>
                                  </button>
                                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Active
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-start pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          className="p-1.5 px-3 bg-slate-600 text-white rounded border border-slate-700 text-xs font-black tracking-tighter uppercase h-8 flex items-center gap-1.5"
                        >
                          <FolderCheck className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                          <span>
                            {flags37Before.showsFolderCheckMinimal
                              ? 'CHECK FOLDERS'
                              : flags37Before.showsFolderCheckShort
                                ? 'CHECK EVERGREEN FOLDERS'
                                : 'CHECK EVERGREEN & PLAYLIST FOLDERS'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-VIEW 3: CALENDAR SUB-CONTROLS (Exact WeeklyCalendarGrid.tsx 3-Cell Bar) */}
                  {subMode37 === 'calendar' && (
                    <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2.5 shadow-2xs">
                      <div
                        className={cn(
                          'pb-2 border-b border-slate-200 gap-2',
                          flags37Before.isFullStacked
                            ? 'flex flex-col items-stretch'
                            : flags37Before.isCell3Below
                              ? 'grid grid-cols-1 gap-2'
                              : 'flex flex-wrap items-center justify-between'
                        )}
                      >
                        {/* CELL 1: Week/Day Toggle + Prev/Today/Next */}
                        <div
                          className={cn(
                            'flex items-center gap-1.5',
                            flags37Before.isNavStacked && 'flex-wrap'
                          )}
                        >
                          <div
                            className={cn(
                              'flex bg-slate-100 p-0.5 rounded border border-slate-200 shrink-0',
                              flags37Before.isWeekDayStacked && 'flex-col'
                            )}
                          >
                            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-600 text-white text-center">
                              Week
                            </span>
                            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded text-slate-600 text-center">
                              Day
                            </span>
                          </div>

                          <div className="flex items-center bg-slate-100 rounded border border-slate-200 p-0.5 gap-0.5 shrink-0">
                            <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-700">
                              {flags37Before.controlsNavIconOnly
                                ? '←'
                                : flags37Before.controlsNavShort
                                  ? '← PREV'
                                  : '← PREV WEEK'}
                            </span>
                            <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-xs font-black uppercase">
                              TODAY
                            </span>
                            <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-700">
                              {flags37Before.controlsNavIconOnly
                                ? '→'
                                : flags37Before.controlsNavShort
                                  ? 'NEXT →'
                                  : 'NEXT WEEK →'}
                            </span>
                          </div>
                        </div>

                        {/* CELL 2: Show Issues + Audit (0) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer bg-slate-100 px-2 py-1 rounded border border-slate-200 h-7">
                            <input type="checkbox" checked readOnly className="w-3.5 h-3.5 accent-amber-500" />
                            <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">
                              {flags37Before.dropShowIssuesText ? 'Issues' : 'Show Issues'}
                            </span>
                          </label>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-xs font-bold uppercase flex items-center gap-1 h-7 bg-slate-100 text-slate-700 border-slate-200"
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            {!flags37Before.dropAuditWord && <span>Audit</span>}
                            <span className="px-1 py-0 rounded text-[10px] bg-slate-200 text-slate-700">
                              0
                            </span>
                          </button>
                        </div>

                        {/* CELL 3: Filter: Month / Year / Hours + Mode: Full / Compact + Inactive */}
                        <div
                          className={cn(
                            'flex items-center gap-2',
                            flags37Before.isFilterModeStacked && 'flex-wrap w-full justify-between pt-1 border-t border-slate-100'
                          )}
                        >
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-bold text-slate-400 uppercase mr-0.5">
                              Filter:
                            </span>
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>November</option>
                            </select>
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>2026</option>
                            </select>
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>All (24 Hours)</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-400 uppercase">
                              Mode:
                            </span>
                            <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                              <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-600 text-white">
                                Full
                              </span>
                              <span className="px-2 py-0.5 text-xs font-bold uppercase rounded text-slate-600">
                                Compact
                              </span>
                            </div>
                            <label className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200 h-7">
                              <input type="checkbox" readOnly className="w-3.5 h-3.5" />
                              <span className="text-xs font-bold text-slate-600 uppercase">
                                Inactive
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Sample Weekly Grid Slice */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                        <div className="grid grid-cols-8 bg-slate-100 border-b border-slate-200 font-black text-slate-600 uppercase text-center py-1">
                          <div>Hour</div>
                          <div>Sun 11/1</div>
                          <div>Mon 11/2</div>
                          <div>Tue 11/3</div>
                          <div className="bg-blue-50 text-blue-700">Wed 11/4</div>
                          <div>Thu 11/5</div>
                          <div>Fri 11/6</div>
                          <div>Sat 11/7</div>
                        </div>
                        <div className="grid grid-cols-8 divide-x divide-slate-200 bg-white text-[11px]">
                          <div className="p-1.5 font-mono font-bold text-slate-500 text-center bg-slate-50">
                            9:00 AM
                          </div>
                          {Array.from({ length: 7 }).map((_, dIdx) => (
                            <div
                              key={dIdx}
                              className={cn('p-1 space-y-1', dIdx === 3 && 'bg-sky-50/60')}
                            >
                              {dIdx === 3 && (
                                <div className="px-1 py-0.5 rounded bg-sky-100 border-l-2 border-sky-600 text-[10px] font-black text-sky-900 truncate">
                                  Show Spacer 1
                                </div>
                              )}
                              <div className="px-1 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-800 truncate">
                                :20 Live Read
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* #37 AFTER (UPDATED WITH USER DECISIONS FOR #1–#7) */}
            {showAfter && (
              <div
                ref={ref37After}
                style={
                  simWidth37 !== null
                    ? { width: `${simWidth37}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-emerald-400 bg-[#F8FAFC] overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
                    After (Refined #37 Decisions #1–#7 — {w37A}px)
                  </span>
                  <div className="flex items-center gap-1">
                    <ProposalBadge num={1} title="#1 Approved: PT (GMT-7)" />
                    <ProposalBadge num={3} title="#3 Modified: Volume2+FileText & Contextual + ADD" />
                    {subMode37 === 'calendar' && (
                      <ProposalBadge num={4} title="#4 Modified: Earlier collapse for PREV/NEXT & Filter/Mode labels + 24 Hours" />
                    )}
                    {subMode37 === 'announcements' && (
                      <>
                        <ProposalBadge num={5} title="#5 Approved/Modified: Edit, Details chevron switch, cleaned summary" />
                        <ProposalBadge num={6} title="#6 Approved/Modified: Collapsible Inactive section with full cards + Details switch" />
                      </>
                    )}
                    {subMode37 === 'shows' && (
                      <ProposalBadge num={7} title="#7 Modified: Show Gap row + responsive Check Folders" />
                    )}
                  </div>
                </div>

                <div className="p-2.5 space-y-2.5">
                  {/* Refined CalendarHeaderBar (#1 Approved, #2 Rejected/Kept Separate, #3.a & #3.b Modified) */}
                  <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0 overflow-hidden">
                    <div
                      className={cn(
                        'p-2',
                        flags37After.isUltraNarrowHeader
                          ? 'flex flex-col items-stretch gap-2'
                          : flags37After.isHeaderStacked
                            ? 'grid grid-cols-[1fr_auto] items-center gap-2'
                            : 'flex flex-nowrap items-center justify-between gap-2'
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-1.5 min-w-0',
                          flags37After.isUltraNarrowHeader
                            ? 'w-full justify-start'
                            : flags37After.isHeaderStacked
                              ? 'col-start-1 row-start-1 justify-self-start'
                              : 'shrink-0'
                        )}
                      >
                        <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-900 gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSubMode37('calendar')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37After.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'calendar'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'calendar'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37After.hideCalendarIcon || flags37After.modeIconsOnly) && (
                              <Calendar className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                            )}
                            {!flags37After.modeIconsOnly && <span>Calendar</span>}
                          </button>

                          {/* #3.a Modified: Keep Document (FileText) icon, swap Playing Speaker (Volume2) in place of Megaphone */}
                          <button
                            type="button"
                            onClick={() => setSubMode37('announcements')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37After.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'announcements'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                            title="#3.a: Playing Speaker (Volume2) + Document (FileText) icons"
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'announcements'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37After.hideAnnouncementsIcons ||
                              flags37After.modeIconsOnly) && (
                              <span className="inline-flex items-center gap-0.5 shrink-0">
                                <Volume2 className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                                <FileText className="w-3 h-3 text-slate-200 shrink-0" />
                              </span>
                            )}
                            {!flags37After.modeIconsOnly && <span>Announcements</span>}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSubMode37('shows')}
                            className={cn(
                              'py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                              flags37After.modeIconsOnly ? 'px-2' : 'px-2.5',
                              subMode37 === 'shows'
                                ? 'bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]'
                                : 'bg-blue-950/30 border-blue-900/30 text-blue-400/70 hover:text-blue-300'
                            )}
                          >
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                subMode37 === 'shows'
                                  ? 'bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]'
                                  : 'bg-slate-700/70'
                              )}
                            />
                            {(!flags37After.hideShowsIcon || flags37After.modeIconsOnly) && (
                              <BookOpen className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                            )}
                            {!flags37After.modeIconsOnly && <span>Shows</span>}
                          </button>
                        </div>

                        {/* #1 Approved: Compact Timezone Badge (Full label in tooltip) */}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-250 text-[11px] font-bold tracking-tight transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                          title="Station Timezone: (GMT-07:00) Pacific Time (US & Canada)"
                        >
                          <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>{flags37After.modeIconsOnly ? 'PT' : 'PT (GMT-7)'}</span>
                          <ProposalBadge num={1} />
                        </button>
                      </div>

                      {/* #2 Rejected: Keep separate filter inputs in Calendar mode */}
                      <div
                        className={cn(
                          'flex items-center gap-1.5 min-w-0',
                          flags37After.isUltraNarrowHeader
                            ? 'w-full'
                            : flags37After.isHeaderStacked
                              ? 'col-span-2 row-start-2 w-full'
                              : 'flex-1 justify-end'
                        )}
                      >
                        {subMode37 === 'calendar' ? (
                          <div
                            className={cn(
                              'flex items-center gap-1.5',
                              flags37After.isHeaderStacked ? 'w-full' : 'justify-end w-full'
                            )}
                          >
                            <div
                              className={cn(
                                'relative min-w-0',
                                flags37After.isHeaderStacked
                                  ? 'flex-1'
                                  : flags37After.halfFilter
                                    ? 'w-28'
                                    : 'w-44'
                              )}
                            >
                              <input
                                type="text"
                                readOnly
                                placeholder="Filter announcements..."
                                className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                              />
                            </div>
                            <div
                              className={cn(
                                'relative min-w-0',
                                flags37After.isHeaderStacked
                                  ? 'flex-1'
                                  : flags37After.halfFilter
                                    ? 'w-28'
                                    : 'w-44'
                              )}
                            >
                              <input
                                type="text"
                                readOnly
                                placeholder="Filter shows..."
                                className="px-2 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'relative min-w-0',
                              flags37After.isHeaderStacked
                                ? 'w-full'
                                : flags37After.halfFilter
                                  ? 'w-32'
                                  : 'w-56'
                            )}
                          >
                            <input
                              type="text"
                              readOnly
                              placeholder={
                                subMode37 === 'announcements'
                                  ? 'Filter announcements...'
                                  : 'Filter shows...'
                              }
                              className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-medium text-slate-800 placeholder:text-slate-400 w-full h-7"
                            />
                          </div>
                        )}
                      </div>

                      {/* #3.b Modified: Contextual "+ ADD ANNOUNCEMENT" / "+ ADD SHOW" -> "+ ADD" -> "+" */}
                      <div
                        className={cn(
                          'flex items-center gap-1 shrink-0',
                          flags37After.isUltraNarrowHeader
                            ? 'w-full justify-start'
                            : flags37After.isHeaderStacked
                              ? 'col-start-2 row-start-1 justify-self-end'
                              : ''
                        )}
                      >
                        <button
                          type="button"
                          className="p-1.5 px-3 bg-blue-600 text-white rounded border border-blue-700 text-xs font-black tracking-tighter shadow-xs hover:bg-blue-700 uppercase cursor-pointer h-7 flex items-center gap-1 justify-center shrink-0 whitespace-nowrap"
                          title="#3.b: Contextual '+ ADD ANNOUNCEMENT' / '+ ADD SHOW' collapsing to '+ ADD' and '+'"
                        >
                          <span>
                            {flags37After.addTextIconOnly
                              ? '+'
                              : flags37After.addTextShort
                                ? '+ ADD'
                                : subMode37 === 'shows'
                                  ? '+ ADD SHOW'
                                  : '+ ADD ANNOUNCEMENT'}
                          </span>
                          <ProposalBadge num={3} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AFTER SUB-VIEW 1: ANNOUNCEMENTS LIST (#5 & #6) */}
                  {subMode37 === 'announcements' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        {[
                          {
                            id: 'ann-1',
                            name: 'Live Read Future Example',
                            minute: 20,
                            isScript: true,
                            typeTag: 'Hourly',
                            summary: 'Mon–Fri · 6 AM–7 PM',
                            files: ['live_read_future_1.txt', 'live_read_future_2.txt'],
                          },
                          {
                            id: 'ann-2',
                            name: 'MP3 Audio Played Example',
                            minute: 40,
                            isScript: false,
                            typeTag: 'Advanced',
                            summary: '14 weekly slots',
                            files: ['station_id_legal_top.mp3'],
                          },
                        ].map((s, idx) => (
                          <div
                            key={s.id}
                            className={cn(
                              'py-1.5 px-3 rounded-lg border border-slate-300 border-l-4 shadow-2xs flex flex-col gap-1.5',
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                              s.isScript ? 'border-l-blue-500' : 'border-l-purple-500'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <AnnouncementCardClockSvg minute={s.minute} isAudio={!s.isScript} />

                              <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 w-full min-w-0">
                                  <span className="text-base font-black text-slate-900 truncate min-w-0">
                                    {s.name}
                                  </span>
                                  {!flags37After.listCardHideTypeTag && (
                                    <span className="text-xs text-slate-500 font-medium truncate shrink-0 max-w-[55%] text-right inline-flex items-center gap-1">
                                      <span className="text-slate-700 font-bold">{s.typeTag}</span>
                                      {!flags37After.listCardHideSummaryTag && (
                                        <span className="text-slate-600">• {s.summary}</span>
                                      )}
                                      {idx === 0 && !flags37After.listCardHideSummaryTag && (
                                        <ProposalBadge num={5} title="#5.c Approved: Cleaned schedule summary text" />
                                      )}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-base font-sans font-black tabular-nums leading-none text-slate-900">
                                      :{s.minute.toString().padStart(2, '0')}m
                                    </span>

                                    {/* #5.a Approved: Shorten View/Edit to Edit */}
                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all border bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 shrink-0 h-6"
                                      title="Edit Announcement (#5.a)"
                                    >
                                      <Edit3 className="w-3 h-3 shrink-0" />
                                      {!flags37After.listCardCollapseViewEditText && (
                                        <span>Edit</span>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all border bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 shrink-0 h-6"
                                      title="Duplicate Announcement"
                                    >
                                      <Copy className="w-3 h-3 shrink-0" />
                                      {!flags37After.listCardCollapseCopyText && <span>Copy</span>}
                                    </button>

                                    {/* #5.b Modified: Reveal/Hide Chevron Switch labeled "Details" */}
                                    <button
                                      type="button"
                                      onClick={() => setShowCardAuditPopover((p) => !p)}
                                      className={cn(
                                        'px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 h-6 cursor-pointer transition-colors',
                                        idx === 0 && showCardAuditPopover
                                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                      )}
                                      title="Reveal / Hide Created, Modified & Gate Details (#5.b)"
                                    >
                                      {idx === 0 && showCardAuditPopover ? (
                                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                      {!flags37After.listCardCollapseDetailsText && (
                                        <span>Details</span>
                                      )}
                                      {idx === 0 && <ProposalBadge num={5} />}
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
                                    <button
                                      type="button"
                                      className={cn(
                                        'px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 h-6',
                                        s.isScript
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-purple-50 text-purple-700 border-purple-200'
                                      )}
                                    >
                                      {s.isScript ? (
                                        <FileText className="w-3 h-3 shrink-0" />
                                      ) : (
                                        <Play className="w-3 h-3 shrink-0 fill-current" />
                                      )}
                                      {!flags37After.listCardCollapsePreviewText && (
                                        <span>Preview</span>
                                      )}
                                    </button>

                                    {s.files.length > 1 ? (
                                      <select className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-700 font-medium min-w-0 flex-1 max-w-[200px] truncate h-6">
                                        {s.files.map((f) => (
                                          <option key={f}>{f}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-100 text-slate-700 font-medium truncate min-w-0 flex-1 max-w-[200px] h-6 flex items-center">
                                        {s.files[0]}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {idx === 0 && showCardAuditPopover && (
                              <div className="ml-[76px] rounded bg-slate-50 border border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                <span>
                                  <strong className="font-semibold text-slate-700">Gate #1:</strong>{' '}
                                  Oct 01, 2026 – Nov 30, 2026 (2 files)
                                </span>
                                <span>
                                  <strong className="font-semibold text-slate-700">Created:</strong>{' '}
                                  Sep 01, 2026 9:00 AM
                                </span>
                                <span>
                                  <strong className="font-semibold text-slate-700">Modified:</strong>{' '}
                                  Oct 29, 2026 4:40 PM
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* #6.a & #6.b: Collapsible Inactive Announcements Section preserving full card format, clock, icons/actions & "Details" switch */}
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between px-1 mb-1.5">
                          <button
                            type="button"
                            onClick={() => setShowInactiveDrawerAfter((p) => !p)}
                            className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500 hover:text-slate-800 tracking-wider cursor-pointer"
                          >
                            {showInactiveDrawerAfter ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <span>Inactive Announcements (1)</span>
                            <ProposalBadge num={6} />
                          </button>
                        </div>

                        {showInactiveDrawerAfter && (
                          <div className="py-1.5 px-3 rounded-lg border border-slate-200 border-l-4 border-l-slate-400 bg-white opacity-80 flex flex-col gap-1.5">
                            <div className="flex items-center gap-3">
                              <AnnouncementCardClockSvg minute={50} />

                              <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
                                {/* Top Row: Name + Type/Summary */}
                                <div className="flex items-baseline justify-between gap-2 w-full min-w-0">
                                  <span className="text-base font-black text-slate-700 truncate min-w-0">
                                    Expired Sponsor Read Example
                                  </span>
                                  {!flags37After.listCardHideTypeTag && (
                                    <span className="text-xs text-slate-500 font-medium truncate shrink-0 max-w-[55%] text-right">
                                      <span className="text-slate-700 font-bold">Hourly</span>
                                      {!flags37After.listCardHideSummaryTag && (
                                        <span className="text-slate-500"> • Mon–Fri · 9 AM–5 PM</span>
                                      )}
                                    </span>
                                  )}
                                </div>

                                {/* Bottom Row: :50m + Activate / Edit / Delete / Details + Preview & File */}
                                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                    <span className="text-base font-sans font-black tabular-nums leading-none text-slate-700">
                                      :50m
                                    </span>

                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 shrink-0 h-6"
                                    >
                                      <span>Activate</span>
                                    </button>

                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-slate-100 text-slate-700 border-slate-300 flex items-center gap-1 shrink-0 h-6"
                                    >
                                      <Edit3 className="w-3 h-3 shrink-0" />
                                      {!flags37After.listCardCollapseViewEditText && (
                                        <span>Edit</span>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-red-50 text-red-600 border-red-200 flex items-center gap-1 shrink-0 h-6"
                                    >
                                      <Trash2 className="w-3 h-3 shrink-0" />
                                      {!flags37After.listCardCollapseCopyText && (
                                        <span>Delete</span>
                                      )}
                                    </button>

                                    {/* #6.b Modified: "Details" reveal/hide chevron switch on Inactive card */}
                                    <button
                                      type="button"
                                      onClick={() => setShowInactiveCardDetailsAfter((p) => !p)}
                                      className={cn(
                                        'px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border flex items-center gap-1 shrink-0 h-6 cursor-pointer transition-colors',
                                        showInactiveCardDetailsAfter
                                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                      )}
                                      title="Reveal / Hide Created, Modified, Inactivated & Gate Details (#6.b)"
                                    >
                                      {showInactiveCardDetailsAfter ? (
                                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                                      )}
                                      {!flags37After.listCardCollapseDetailsText && (
                                        <span>Details</span>
                                      )}
                                      <ProposalBadge num={6} />
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
                                    <button
                                      type="button"
                                      className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 shrink-0 h-6"
                                    >
                                      <FileText className="w-3 h-3 shrink-0" />
                                      {!flags37After.listCardCollapsePreviewText && (
                                        <span>Preview</span>
                                      )}
                                    </button>
                                    <span className="text-xs border border-slate-200 rounded px-2 py-0.5 bg-slate-100 text-slate-600 font-medium truncate min-w-0 flex-1 max-w-[180px] h-6 flex items-center">
                                      expired_sponsor_oct.txt
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {showInactiveCardDetailsAfter && (
                              <div className="ml-[76px] rounded bg-slate-50 border border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                                <span>
                                  <strong className="font-semibold text-slate-700">Gate #1:</strong>{' '}
                                  Sep 01, 2026 – Oct 31, 2026 (1 file)
                                </span>
                                <span>
                                  <strong className="font-semibold text-slate-700">Created:</strong>{' '}
                                  Sep 01, 2026 9:00 AM
                                </span>
                                <span>
                                  <strong className="font-semibold text-slate-700">Modified:</strong>{' '}
                                  Oct 12, 2026 2:15 PM
                                </span>
                                <span>
                                  <strong className="font-semibold text-slate-700">
                                    Inactivated:
                                  </strong>{' '}
                                  Oct 31, 2026 11:59 PM
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* AFTER SUB-VIEW 2: SHOWS LIST (#7.a Rejected, #7.b Responsive Only, #7.c Show Gap Adopted) */}
                  {subMode37 === 'shows' && (
                    <div className="space-y-2.5">
                      {/* #7.c Approved: Cleaner non-italic Show Gap row keeping "Show Gap:" header label */}
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2 px-3 text-amber-800 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            <strong className="text-amber-900">Show Gap:</strong> Wed 11:00 AM–12:00 PM (1h)
                          </span>
                        </div>
                        <ProposalBadge num={7} title="#7.c Approved: Compact Show Gap row keeping 'Show Gap:' header" />
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        <div className="bg-slate-100 border-b border-slate-250 pl-[17px] pr-3 py-1.5 flex items-center gap-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                          <div className="w-[85px] shrink-0">Day &amp; Time</div>
                          <div className="flex-1 min-w-0">Show Details</div>
                          {!flags37After.showsCardsCollapse && (
                            <div className="w-[70px] shrink-0" />
                          )}
                        </div>

                        <div className="divide-y divide-slate-150">
                          {[
                            {
                              id: 'show-1',
                              day: 'Wednesday',
                              time: '9:00 AM',
                              dur: '2h 0m',
                              name: 'Show Spacer 1',
                              host: 'Host 1',
                              code: 'Show_Spacer_1',
                              desc: 'Two-hour live studio broadcast block with scheduled breaks.',
                              bg: '#f0f9ff',
                              border: '#0284c7',
                            },
                            {
                              id: 'show-2',
                              day: 'Wednesday',
                              time: '12:00 PM',
                              dur: '2h 0m',
                              name: 'Show Spacer 2',
                              host: 'Host 2',
                              code: 'Show_Spacer_2',
                              desc: 'Midday music and community announcement program.',
                              bg: '#f5f3ff',
                              border: '#7c3aed',
                            },
                          ].map((show) => (
                            <div
                              key={show.id}
                              className="flex items-stretch p-3 gap-4 relative"
                              style={{
                                backgroundColor: show.bg,
                                borderLeft: `5px solid ${show.border}`,
                              }}
                            >
                              <div className="flex flex-col gap-1 justify-center w-[85px] shrink-0">
                                <span className="px-1 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[11px] font-black uppercase tracking-wide text-center leading-none">
                                  {show.day}
                                </span>
                                <span className="flex items-center justify-center gap-0.5 text-[11px] font-sans font-bold tabular-nums text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 leading-none">
                                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{show.time}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-sans font-bold tabular-nums uppercase text-center leading-none">
                                  {show.dur}
                                </span>

                                {flags37After.showsCardsCollapse && (
                                  <div className="flex flex-col items-center gap-1 mt-1 pt-1 border-t border-slate-200/80">
                                    <button
                                      type="button"
                                      className="flex items-center gap-1 py-0.5 px-1.5 bg-white border border-blue-300 rounded text-blue-700"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span className="text-[10px] font-black uppercase">Edit</span>
                                    </button>
                                    <span className="text-[9px] font-black uppercase px-1 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                      Active
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* #7.a Rejected: Keep full "by Host" title and bottom "ID: ... • Code: ..." metadata line */}
                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight mb-0.5">
                                  {show.name} by {show.host}
                                </h3>
                                <p className="text-xs text-slate-500 leading-normal font-medium line-clamp-1">
                                  {show.desc}
                                </p>
                                <div className="text-[10px] text-slate-400 font-sans font-bold uppercase mt-1 leading-none">
                                  ID: {show.id} • Code: {show.code}
                                </div>
                              </div>

                              {!flags37After.showsCardsCollapse && (
                                <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 w-[70px]">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 py-1 px-2 bg-white border border-blue-300 rounded text-blue-700 shadow-2xs"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span className="text-xs font-black uppercase">Edit</span>
                                  </button>
                                  <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                    Active
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* #7.b Modified: Keep full label at wide widths; only shorten when narrowing requires it */}
                      <div className="flex justify-start pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          className="p-1.5 px-3 bg-slate-600 text-white rounded border border-slate-700 text-xs font-black tracking-tighter uppercase h-8 flex items-center gap-1.5"
                          title="#7.b: Shortens only when window narrowing requires it (<420px / <320px)"
                        >
                          <FolderCheck className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                          <span>
                            {flags37After.showsFolderCheckMinimal
                              ? 'CHECK FOLDERS'
                              : flags37After.showsFolderCheckShort
                                ? 'CHECK EVERGREEN FOLDERS'
                                : 'CHECK EVERGREEN & PLAYLIST FOLDERS'}
                          </span>
                          <ProposalBadge num={7} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AFTER SUB-VIEW 3: CALENDAR SUB-CONTROLS (#4.a, #4.b, #4.c) */}
                  {subMode37 === 'calendar' && (
                    <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2.5 shadow-2xs">
                      <div
                        className={cn(
                          'pb-2 border-b border-slate-200 gap-2',
                          flags37After.isFullStacked
                            ? 'flex flex-col items-stretch'
                            : flags37After.isCell3Below
                              ? 'grid grid-cols-1 gap-2'
                              : 'flex flex-wrap items-center justify-between'
                        )}
                      >
                        {/* CELL 1: Keep "PREV WEEK" / "NEXT WEEK" when wide (>=1220px), drop "WEEK" earlier (<1220px) to stay on 1 row longer (#4.a) */}
                        <div
                          className={cn(
                            'flex items-center gap-1.5',
                            flags37After.isNavStacked && 'flex-wrap'
                          )}
                        >
                          <div
                            className={cn(
                              'flex bg-slate-100 p-0.5 rounded border border-slate-200 shrink-0',
                              flags37After.isWeekDayStacked && 'flex-col'
                            )}
                          >
                            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-600 text-white text-center">
                              Week
                            </span>
                            <span className="px-2 py-0.5 text-xs font-bold uppercase rounded text-slate-600 text-center">
                              Day
                            </span>
                          </div>

                          <div className="flex items-center bg-slate-100 rounded border border-slate-200 p-0.5 gap-0.5 shrink-0">
                            <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-700">
                              {flags37After.controlsNavIconOnly
                                ? '←'
                                : flags37After.controlsNavShortEarly
                                  ? '← PREV'
                                  : '← PREV WEEK'}
                            </span>
                            <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-xs font-black uppercase">
                              TODAY
                            </span>
                            <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-700">
                              {flags37After.controlsNavIconOnly
                                ? '→'
                                : flags37After.controlsNavShortEarly
                                  ? 'NEXT →'
                                  : 'NEXT WEEK →'}
                            </span>
                          </div>
                          <ProposalBadge num={4} />
                        </div>

                        {/* CELL 2: Show Issues + Audit (0) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer bg-slate-100 px-2 py-1 rounded border border-slate-200 h-7">
                            <input type="checkbox" checked readOnly className="w-3.5 h-3.5 accent-amber-500" />
                            <span className="text-xs font-bold text-slate-700 uppercase whitespace-nowrap">
                              {flags37After.dropShowIssuesText ? 'Issues' : 'Show Issues'}
                            </span>
                          </label>
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-xs font-bold uppercase flex items-center gap-1 h-7 bg-slate-100 text-slate-700 border-slate-200"
                          >
                            <ListChecks className="w-3.5 h-3.5" />
                            {!flags37After.dropAuditWord && <span>Audit</span>}
                            <span className="px-1 py-0 rounded text-[10px] bg-slate-200 text-slate-700">
                              0
                            </span>
                          </button>
                        </div>

                        {/* CELL 3: Keep "Filter:" & "Mode:" labels when >=1260px, drop earlier (<1260px), and use "24 Hours" (#4.b & #4.c) */}
                        <div
                          className={cn(
                            'flex items-center gap-2',
                            flags37After.isFilterModeStackedAfter &&
                              'flex-wrap w-full justify-between pt-1 border-t border-slate-100'
                          )}
                        >
                          <div className="flex items-center gap-1 flex-wrap">
                            {!flags37After.dropFilterModeLabelsEarly && (
                              <span className="text-xs font-bold text-slate-400 uppercase mr-0.5">
                                Filter:
                              </span>
                            )}
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>November</option>
                            </select>
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>2026</option>
                            </select>
                            <select className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-700 h-7">
                              <option>24 Hours</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!flags37After.dropFilterModeLabelsEarly && (
                              <span className="text-xs font-bold text-slate-400 uppercase">
                                Mode:
                              </span>
                            )}
                            <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
                              <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-blue-600 text-white">
                                Full
                              </span>
                              <span className="px-2 py-0.5 text-xs font-bold uppercase rounded text-slate-600">
                                Compact
                              </span>
                            </div>
                            <label className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200 h-7">
                              <input type="checkbox" readOnly className="w-3.5 h-3.5" />
                              <span className="text-xs font-bold text-slate-600 uppercase">
                                Inactive
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Sample Weekly Grid Slice */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                        <div className="grid grid-cols-8 bg-slate-100 border-b border-slate-200 font-black text-slate-600 uppercase text-center py-1">
                          <div>Hour</div>
                          <div>Sun 11/1</div>
                          <div>Mon 11/2</div>
                          <div>Tue 11/3</div>
                          <div className="bg-blue-50 text-blue-700">Wed 11/4</div>
                          <div>Thu 11/5</div>
                          <div>Fri 11/6</div>
                          <div>Sat 11/7</div>
                        </div>
                        <div className="grid grid-cols-8 divide-x divide-slate-200 bg-white text-[11px]">
                          <div className="p-1.5 font-mono font-bold text-slate-500 text-center bg-slate-50">
                            9:00 AM
                          </div>
                          {Array.from({ length: 7 }).map((_, dIdx) => (
                            <div
                              key={dIdx}
                              className={cn('p-1 space-y-1', dIdx === 3 && 'bg-sky-50/60')}
                            >
                              {dIdx === 3 && (
                                <div className="px-1 py-0.5 rounded bg-sky-100 border-l-2 border-sky-600 text-[10px] font-black text-sky-900 truncate">
                                  Show Spacer 1
                                </div>
                              )}
                              <div className="px-1 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-800 truncate">
                                :20 Live Read
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION #38: AnnouncementEditorView & ShowEditorForm
          ===================================================================== */}
      {shouldRenderSection('38') && (
        <section className="w-full rounded-xl border-2 border-slate-300 bg-slate-50/70 p-3.5 flex flex-col gap-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black uppercase">
                  Roadmap #38 (Proposals #8–#12)
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  `AnnouncementEditorView` &amp; `ShowEditorForm` Visual-Parity Comparison
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Simulates the real Editor top bar, `@container` left column (`@[640px]` / `@[490px]`), `ANNOUNCEMENT GATES` rows, and `ShowEditorForm`.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg border border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-600 px-1.5">
                Editor:
              </span>
              <button
                type="button"
                onClick={() => setSubMode38('announcement_editor')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                  subMode38 === 'announcement_editor'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-300/60'
                )}
              >
                Announcement Editor (#8–#11)
              </button>
              <button
                type="button"
                onClick={() => setSubMode38('show_editor')}
                className={cn(
                  'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                  subMode38 === 'show_editor'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-300/60'
                )}
              >
                Show Editor (#12)
              </button>
            </div>
          </div>

          {/* Exact DEBUG PIXEL RULER for #38 */}
          <DebugPixelRuler
            sectionNumber="38"
            sectionLabel={
              subMode38 === 'announcement_editor'
                ? 'AnnouncementEditorView (@container + Gate Rows)'
                : 'ShowEditorForm (ShowsManagerView)'
            }
            measuredWidth={w38B}
            simulatedWidth={simWidth38}
            onChangeSimulatedWidth={(val) => handleSetSectionWidth(setWidth38, val)}
          />

          <div
            className={cn(
              'grid gap-4 items-start overflow-x-auto pb-1',
              compareMode === 'split' && simWidth38 === null
                ? 'grid-cols-1 2xl:grid-cols-2'
                : 'grid-cols-1'
            )}
          >
            {/* #38 BEFORE (EXACT PRODUCTION REPLICA) */}
            {showBefore && (
              <div
                ref={ref38Before}
                style={
                  simWidth38 !== null
                    ? { width: `${simWidth38}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-rose-300 bg-white overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-900">
                    Before (Current Editor Code — {w38B}px)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-rose-700">
                    {w38B < 490
                      ? '@container <490px Stacked'
                      : w38B < 640
                        ? '@container <640px Split'
                        : 'Full @container'}
                  </span>
                </div>

                {subMode38 === 'announcement_editor' ? (
                  <div className="flex flex-col">
                    {/* Fixed Top Header Bar from AnnouncementEditorView.tsx */}
                    <div className="py-2.5 px-3 bg-slate-50 border-b border-slate-250 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="bg-blue-600 p-1.5 rounded text-white">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight leading-none">
                              Editor
                            </h2>
                            <span className="text-[10px] font-sans text-slate-400 font-bold uppercase">
                              ID: ann-201
                            </span>
                          </div>
                        </div>

                        <div className="flex items-stretch bg-white border border-blue-600 rounded overflow-hidden shadow-2xs flex-1 min-w-[160px] h-7">
                          <div className="bg-blue-600 px-2 flex items-center shrink-0">
                            <span className="text-xs font-black text-white uppercase tracking-wider whitespace-nowrap">
                              {w38B < 520 ? 'Name' : 'Announcement Name'}
                            </span>
                          </div>
                          <input
                            type="text"
                            readOnly
                            value="Live Read Future Example"
                            className="px-2 py-0.5 text-xs font-bold text-slate-900 bg-transparent outline-none flex-1 min-w-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded border border-slate-200 shrink-0 h-7">
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                          Status:
                        </span>
                        <div className="flex items-center -space-x-px">
                          <span className="px-2 py-0.5 text-xs font-black uppercase rounded-l border bg-emerald-600 text-white border-emerald-600">
                            Active
                          </span>
                          <span className="px-2 py-0.5 text-xs font-black uppercase rounded-r border bg-white text-slate-400 border-slate-250">
                            Suspended
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* @container Body from AnnouncementEditorView.tsx */}
                    <div className="@container p-3 space-y-3 bg-white">
                      {/* Row 1: Type + Play Time + 50x50 SVG Clock */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs font-black text-slate-700 uppercase">
                            Type
                          </label>
                          <select className="p-1 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7">
                            <option>Advanced (Weekly Grid)</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-black text-slate-700 uppercase">
                            Play Time
                          </label>
                          <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded px-2 py-0.5">
                            <span className="text-sm font-black tabular-nums text-slate-800">
                              :20m
                            </span>
                            <div className="flex flex-col -space-y-0.5">
                              <ChevronUp className="w-3 h-3 text-slate-600" />
                              <ChevronDown className="w-3 h-3 text-slate-600" />
                            </div>
                          </div>
                          <EditorClockSvg minute={20} />
                        </div>
                      </div>

                      {/* Row 2: Announcement Start / End Date & Time */}
                      <div className="pb-2.5 border-b border-slate-200">
                        <div className="flex flex-col @[640px]:flex-row @[640px]:items-center gap-2">
                          <div className="flex flex-col @[490px]:flex-row @[490px]:items-center gap-1.5 flex-1">
                            <label className="text-xs font-black text-slate-700 uppercase whitespace-nowrap">
                              Announcement Start
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                readOnly
                                value="10/01/2026"
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7 w-24"
                              />
                              <input
                                type="text"
                                readOnly
                                value="12:00 AM"
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7 w-20"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col @[490px]:flex-row @[490px]:items-center gap-1.5 flex-1">
                            <label className="text-xs font-black text-slate-700 uppercase whitespace-nowrap">
                              End
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                readOnly
                                value="11/30/2026"
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7 w-24"
                              />
                              <input
                                type="text"
                                readOnly
                                value="11:59 PM"
                                className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7 w-20"
                              />
                              <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-black uppercase text-slate-600 h-7 flex items-center">
                                Clear End
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Blue ANNOUNCEMENT GATES Header + Gate #1 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-blue-600 px-3 py-1.5 rounded text-white">
                          <span className="text-xs font-black uppercase tracking-wider">
                            Announcement Gates
                          </span>
                          <span className="px-2 py-0.5 bg-amber-600 border border-amber-700 rounded text-[11px] font-black uppercase flex items-center gap-1">
                            <Trash2 className="w-3 h-3" />
                            <span>
                              {w38B < 520 ? 'Purge' : 'Purge All Expired Announcements'}
                            </span>
                          </span>
                        </div>

                        {/* Gate #1 Box */}
                        <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                          <div className="p-2 bg-blue-100/80 border-b border-blue-200 flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-black text-slate-800 uppercase">
                                Gate #1 Start
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                                10/01/2026
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                                12:00 AM
                              </span>
                              <span className="font-black text-slate-800 uppercase ml-1">
                                End
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                                11/30/2026
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                                11:59 PM
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-black uppercase text-slate-600">
                              Clear End
                            </span>
                          </div>

                          {/* Media Sub-Header Bar */}
                          <div className="bg-slate-200 px-2.5 py-1 border-b border-slate-300 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-black text-slate-700 uppercase">Media</span>{' '}
                              <span className="text-slate-600 font-normal">
                                (Multiple files will be auto rotated)
                              </span>
                            </div>
                            <span className="font-black text-slate-700 uppercase">Actions</span>
                          </div>

                          {/* Rotating Media Rows */}
                          <div className="p-2 space-y-2">
                            {[
                              {
                                idx: 1,
                                file: 'live_read_future_1.txt',
                                plays: '4 plays',
                                dur: '0:20',
                                backup: 'backup_sponsor_1.mp3',
                              },
                              {
                                idx: 2,
                                file: 'live_read_future_2.txt',
                                plays: '3 plays',
                                dur: '0:25',
                                backup: '',
                              },
                            ].map((m) => (
                              <div
                                key={m.idx}
                                className="bg-slate-50 p-1.5 rounded border border-slate-200 flex flex-col gap-1.5"
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <div className="flex flex-col -space-y-1 shrink-0">
                                      <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                    </div>
                                    <input
                                      type="text"
                                      readOnly
                                      value={m.file}
                                      className="p-1 bg-white border border-slate-300 rounded text-xs font-medium text-slate-800 flex-1 min-w-0 h-7"
                                    />
                                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold shrink-0">
                                      {m.plays}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="w-[56px] py-1 rounded text-xs font-sans font-bold tabular-nums border bg-blue-50/60 text-blue-700 border-blue-200 flex items-center justify-center gap-0.5 h-7">
                                      <FileText className="w-3 h-3 shrink-0" />
                                      <span>{m.dur}</span>
                                    </div>

                                    {/* Joined Action Group */}
                                    <div className="flex items-center -space-x-px">
                                      <span className="p-1 px-1.5 rounded-l text-xs font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 h-7">
                                        <Edit3 className="w-3 h-3" />
                                        {w38B >= 560 && <span>Edit</span>}
                                      </span>
                                      <span className="p-1 px-1.5 text-xs font-black uppercase border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 h-7">
                                        <FileText className="w-3 h-3" />
                                        {w38B >= 560 && <span>Preview</span>}
                                      </span>
                                      <span className="p-1 px-1.5 text-xs font-black uppercase border bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1 h-7">
                                        <FolderOpen className="w-3 h-3" />
                                        {w38B >= 560 && <span>Choose</span>}
                                      </span>
                                      <span className="p-1 px-1.5 rounded-r text-xs font-black uppercase border bg-red-50 text-red-600 border-red-200 flex items-center gap-1 h-7">
                                        <Trash2 className="w-3 h-3" />
                                        {w38B >= 640 && <span>Delete</span>}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Backup MP3 Sub-Row */}
                                <div className="pl-5 pt-1 border-t border-slate-200/80 flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <Volume2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                    <span className="font-bold text-slate-600 shrink-0">
                                      Backup MP3:
                                    </span>
                                    <span className="font-mono text-slate-800 truncate">
                                      {m.backup || 'None selected (optional)'}
                                    </span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[11px] shrink-0">
                                    {m.backup ? 'Change Backup MP3' : '+ Select Backup MP3'}
                                  </span>
                                </div>
                              </div>
                            ))}

                            <div className="flex items-center justify-between pt-1">
                              <span className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-black uppercase">
                                + Add File
                              </span>
                              <span className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-black uppercase">
                                + Add Gate
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer Metadata + Save/Cancel Bar */}
                      <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 px-2.5 py-1 bg-slate-50 rounded border border-slate-200 text-xs text-slate-400">
                          <span>
                            <strong className="text-slate-500">Created:</strong> Sep 01, 2026
                          </span>
                          <span>
                            <strong className="text-slate-500">Modified:</strong> Oct 29, 2026
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-3 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-black uppercase">
                            Delete
                          </span>
                          <span className="px-3 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-black uppercase">
                            Cancel
                          </span>
                          <span className="px-3 py-1 bg-blue-600 text-white border border-blue-700 rounded text-xs font-black uppercase">
                            Save
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ShowEditorForm Before (Exact ShowsManagerView.tsx lines 440-750) */
                  <div className="p-4 space-y-4 bg-white">
                    <div className="py-2.5 px-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-1.5 rounded text-white">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-black text-slate-800 uppercase">
                          Edit Show Settings
                        </h2>
                      </div>
                      <span className="text-[11px] bg-slate-100 border border-slate-200 text-slate-500 font-bold px-2 py-0.5 rounded uppercase">
                        ID: show-1
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase block">
                          Show Name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="Show Spacer 1"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase block">
                          Short Name (for filenames)
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                        />
                        <p className="text-xs text-slate-400">
                          Max 24 characters. Alphanumeric and underscores only.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-black text-slate-700 uppercase block">
                          Show Broadcast Status
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Define whether this show&apos;s profile is currently active in the weekly schedule listings.
                        </p>
                      </div>
                      <div className="flex items-center -space-x-px shrink-0">
                        <span className="px-3 py-1 text-xs font-black uppercase rounded-l border bg-emerald-600 text-white border-emerald-600">
                          Active
                        </span>
                        <span className="px-3 py-1 text-xs font-black uppercase rounded-r border bg-white text-slate-400 border-slate-250">
                          Inactive
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-black text-slate-700 uppercase block">
                          Include in &ldquo;Up Next&rdquo; Promo Cards
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Automatically seeds an &ldquo;Up Next: [Show Name]&rdquo; Live Read card before this show begins when Up Next promos are enabled.
                        </p>
                      </div>
                      <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase block">
                          Evergreen Audio Folder
                        </label>
                        <input
                          type="text"
                          readOnly
                          placeholder="Default: [AMP]/media_evergreens/Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
                        />
                        <p className="text-xs text-slate-400">
                          Leave blank to use default subfolder inside media_evergreens.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase block">
                          Playlist Audio Folder
                        </label>
                        <input
                          type="text"
                          readOnly
                          placeholder="Default: [AMP]/media_shows/Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
                        />
                        <p className="text-xs text-slate-400">
                          Leave blank to use default subfolder inside media_shows.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* #38 AFTER (DE-CLUTTERED REPLICA WITH SAME VISUAL DNA) */}
            {showAfter && (
              <div
                ref={ref38After}
                style={
                  simWidth38 !== null
                    ? { width: `${simWidth38}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-emerald-400 bg-white overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
                    After (Proposed Declutter #8–#12 — {w38A}px)
                  </span>
                  <div className="flex items-center gap-1">
                    {subMode38 === 'announcement_editor' ? (
                      <>
                        <ProposalBadge num={8} />
                        <ProposalBadge num={9} />
                        <ProposalBadge num={10} />
                        <ProposalBadge num={11} />
                      </>
                    ) : (
                      <ProposalBadge num={12} />
                    )}
                  </div>
                </div>

                {subMode38 === 'announcement_editor' ? (
                  <div className="flex flex-col">
                    {/* #8 Top Header Bar */}
                    <div className="py-2 px-3 bg-slate-50 border-b border-slate-250 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="bg-blue-600 p-1.5 rounded text-white shrink-0" title="ID: ann-201">
                          <FileText className="w-4 h-4" />
                        </div>

                        <div className="flex items-stretch bg-white border border-blue-600 rounded overflow-hidden shadow-2xs flex-1 min-w-[150px] h-7">
                          <div className="bg-blue-600 px-2 flex items-center gap-1 shrink-0">
                            <span className="text-xs font-black text-white uppercase tracking-wider">
                              Name
                            </span>
                            <ProposalBadge num={8} />
                          </div>
                          <input
                            type="text"
                            readOnly
                            value="Live Read Future Example"
                            className="px-2 py-0.5 text-xs font-bold text-slate-900 bg-transparent outline-none flex-1 min-w-0"
                          />
                        </div>
                      </div>

                      <div className="flex items-center -space-x-px shrink-0">
                        <span className="px-2.5 py-1 text-xs font-black uppercase rounded-l border bg-emerald-600 text-white border-emerald-600">
                          Active
                        </span>
                        <span className="px-2.5 py-1 text-xs font-black uppercase rounded-r border bg-white text-slate-400 border-slate-250">
                          Suspended
                        </span>
                      </div>
                    </div>

                    {/* @container Body */}
                    <div className="@container p-3 space-y-2.5 bg-white">
                      {/* Combined Compact Row: Type + Play Time + Clock + Overall Window */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <label className="text-xs font-black text-slate-700 uppercase">
                              Type
                            </label>
                            <select className="p-1 bg-slate-100 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7">
                              <option>Advanced Grid</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <label className="text-xs font-black text-slate-700 uppercase">
                              Slot
                            </label>
                            <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 rounded px-2 py-0.5 h-7">
                              <span className="text-sm font-black tabular-nums text-slate-800">
                                :20m
                              </span>
                            </div>
                            <EditorClockSvg minute={20} />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 text-xs">
                          <span className="font-black text-slate-600 uppercase">Window:</span>
                          <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                            10/01/26 12:00 AM
                          </span>
                          <span className="text-slate-400 font-bold">→</span>
                          <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-bold text-slate-800">
                            11/30/26 11:59 PM
                          </span>
                        </div>
                      </div>

                      {/* #9 Blue ANNOUNCEMENT GATES Header with ? Tooltip */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-blue-600 px-3 py-1.5 rounded text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black uppercase tracking-wider">
                              Announcement Gates (Auto-Rotated)
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowTooltipPreview38((p) => !p)}
                              className="text-blue-100 hover:text-white cursor-pointer"
                              title="Click to preview tooltip"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                            <ProposalBadge num={9} />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-blue-700 hover:bg-blue-800 border border-blue-400 rounded text-[11px] font-black uppercase">
                              + Add Gate
                            </span>
                          </div>
                        </div>

                        {showTooltipPreview38 && (
                          <div className="rounded bg-slate-800 text-white px-2.5 py-1 text-xs flex items-center justify-between">
                            <span>
                              <strong>? Tooltip:</strong> Multiple files inside a gate rotate 1, 2, 3 across matching broadcast slots.
                            </span>
                            <span className="text-[10px] text-slate-300">(Hover only)</span>
                          </div>
                        )}

                        {/* Single-Header Gate #1 Box */}
                        <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                          <div className="px-2.5 py-1.5 bg-blue-100/80 border-b border-blue-200 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-black text-slate-800 uppercase">Gate #1</span>
                              <span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-bold text-slate-800">
                                10/01/2026 12:00 AM
                              </span>
                              <span className="text-slate-500 font-bold">→</span>
                              <span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-bold text-slate-800">
                                11/30/2026 11:59 PM
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-black uppercase">
                                + Add File
                              </span>
                              <span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-600">
                                Clear End
                              </span>
                              <span
                                className="px-1.5 py-0.5 bg-amber-50 border border-amber-300 rounded text-[11px] font-bold text-amber-800"
                                title="Ends & archives this gate when broadcast logs exist; deletes immediately if unused/future"
                              >
                                Inactivate
                              </span>
                            </div>
                          </div>

                          {/* #10 Compact Single-Line Media Rows (Backup MP3 integrated inline as pill) */}
                          <div className="p-2 space-y-1.5">
                            {[
                              {
                                idx: 1,
                                file: 'live_read_future_1.txt',
                                plays: '4x',
                                dur: '0:20',
                                backup: 'backup_sponsor_1.mp3',
                              },
                              {
                                idx: 2,
                                file: 'live_read_future_2.txt',
                                plays: '3x',
                                dur: '0:25',
                                backup: '',
                              },
                            ].map((m) => (
                              <div
                                key={m.idx}
                                className="bg-white p-1.5 rounded border border-slate-200 flex items-center justify-between gap-1.5"
                              >
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <div className="flex flex-col -space-y-1 shrink-0">
                                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {m.file}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-bold shrink-0">
                                    {m.plays}
                                  </span>
                                  <span
                                    className={cn(
                                      'px-1.5 py-0.5 rounded text-[11px] font-bold border shrink-0 flex items-center gap-1',
                                      m.backup
                                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200'
                                    )}
                                    title={
                                      m.backup
                                        ? `Backup MP3: ${m.backup}`
                                        : 'Click to attach optional Backup MP3'
                                    }
                                  >
                                    <Volume2 className="w-3 h-3" />
                                    {w38A >= 520 && (
                                      <span>{m.backup ? 'Backup Set' : '+ Backup'}</span>
                                    )}
                                  </span>
                                  {m.idx === 1 && <ProposalBadge num={10} />}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="px-1.5 py-1 rounded text-xs font-sans font-bold tabular-nums border bg-blue-50/60 text-blue-700 border-blue-200 flex items-center gap-0.5 h-7">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span>{m.dur}</span>
                                  </div>

                                  <div className="flex items-center -space-x-px">
                                    <span className="p-1 px-1.5 rounded-l text-xs font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 h-7">
                                      <Edit3 className="w-3 h-3" />
                                      {w38A >= 560 && <span>Edit</span>}
                                    </span>
                                    <span className="p-1 px-1.5 text-xs font-black uppercase border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 h-7">
                                      <FileText className="w-3 h-3" />
                                      {w38A >= 560 && <span>Preview</span>}
                                    </span>
                                    <span className="p-1 px-1.5 text-xs font-black uppercase border bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1 h-7">
                                      <FolderOpen className="w-3 h-3" />
                                      {w38A >= 560 && <span>Choose</span>}
                                    </span>
                                    <span className="p-1 px-1.5 rounded-r text-xs font-black uppercase border bg-red-50 text-red-600 border-red-200 flex items-center gap-1 h-7">
                                      <Trash2 className="w-3 h-3" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Collapsible Past / Archived Gates Drawer (Replaces Destructive Purge) */}
                        <div className="border border-slate-200 rounded-lg bg-slate-50/80 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setShowArchivedGatesAfter38((p) => !p)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              {showArchivedGatesAfter38 ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                              <span>Past / Archived Gates (1)</span>
                              <ProposalBadge num={9} />
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 normal-case">
                              Preserved for historical calendar &amp; log views
                            </span>
                          </button>

                          {showArchivedGatesAfter38 && (
                            <div className="p-2 border-t border-slate-200 bg-white/80 opacity-80 space-y-1.5 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-black text-slate-600 uppercase">
                                    Archived Gate
                                  </span>
                                  <span className="font-mono text-slate-600">
                                    09/01/2026 12:00 AM → 09/30/2026 11:59 PM
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold text-[10px]">
                                    live_read_sep.txt (12 plays)
                                  </span>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold uppercase text-[10px]">
                                  Activate / Reuse
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* #11 Compact Footer */}
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                        <span
                          className="text-xs text-slate-400 font-medium flex items-center gap-1.5"
                          title="Created: Sep 01, 2026 9:00 AM"
                        >
                          <Info className="w-3.5 h-3.5" />
                          <span>Modified Oct 29, 2026</span>
                          <ProposalBadge num={11} />
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs font-black uppercase">
                            Delete
                          </span>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-black uppercase">
                            Cancel
                          </span>
                          <span className="px-3 py-1 bg-blue-600 text-white border border-blue-700 rounded text-xs font-black uppercase">
                            Save
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ShowEditorForm After (De-Cluttered #12) */
                  <div className="p-4 space-y-3.5 bg-white">
                    <div className="py-2 px-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-600 p-1.5 rounded text-white">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <h2 className="text-sm font-black text-slate-800 uppercase">
                          Edit Show
                        </h2>
                        <ProposalBadge num={12} />
                      </div>
                      <span className="text-[11px] bg-slate-100 border border-slate-200 text-slate-500 font-bold px-2 py-0.5 rounded uppercase">
                        ID: show-1
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase block">
                          Show Name
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="Show Spacer 1"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase flex items-center gap-1">
                          <span>Short Name</span>
                          <span title="Max 24 chars, alphanumeric & underscores (used for filenames)">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Combined Single-Row Status & Up Next Toggles with ? Tooltips (#12) */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-700 uppercase">
                          Status:
                        </span>
                        <div className="flex items-center -space-x-px">
                          <span className="px-2.5 py-1 text-xs font-black uppercase rounded-l border bg-emerald-600 text-white border-emerald-600">
                            Active
                          </span>
                          <span className="px-2.5 py-1 text-xs font-black uppercase rounded-r border bg-white text-slate-400 border-slate-250">
                            Inactive
                          </span>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked readOnly className="w-4 h-4 accent-blue-600" />
                        <span className="text-xs font-black text-slate-700 uppercase">
                          Include in &ldquo;Up Next&rdquo; Promos
                        </span>
                        <span title="Seeds an automatic Up Next Live Read card before this show starts">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase flex items-center gap-1">
                          <span>Evergreen Audio Folder</span>
                          <span title="Leave blank to use default subfolder inside media_evergreens.">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        </label>
                        <input
                          type="text"
                          readOnly
                          placeholder="Default: [AMP]/media_evergreens/Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-700 uppercase flex items-center gap-1">
                          <span>Playlist Audio Folder</span>
                          <span title="Leave blank to use default subfolder inside media_shows.">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                          </span>
                        </label>
                        <input
                          type="text"
                          readOnly
                          placeholder="Default: [AMP]/media_shows/Show_Spacer_1"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION #39: LocationsModal, LocalHelpModal & Copy/Media Modals
          ===================================================================== */}
      {shouldRenderSection('39') && (
        <section className="w-full rounded-xl border-2 border-slate-300 bg-slate-50/70 p-3.5 flex flex-col gap-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black uppercase">
                  Roadmap #39 (Proposals #13–#17)
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  `LocationsModal`, `LocalHelpModal`, `CopyEditorModal` &amp; `MediaPickerModal`
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Verified against current production code (`settings`, `media_announcements`, `media_evergreens`, `media_shows`, `logs`).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg border border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-600 px-1.5">
                Modal:
              </span>
              {(
                [
                  { id: 'locations', label: 'LocationsModal (#13–#14)' },
                  { id: 'help', label: 'LocalHelpModal (#15)' },
                  { id: 'copy_media', label: 'CopyEditor & MediaPicker (#16–#17)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSubMode39(m.id)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                    subMode39 === m.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-300/60'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exact DEBUG PIXEL RULER for #39 */}
          <DebugPixelRuler
            sectionNumber="39"
            sectionLabel={
              subMode39 === 'locations'
                ? 'LocationsModal (isNarrow <360px + Advanced - Folder Overrides)'
                : subMode39 === 'help'
                  ? 'LocalHelpModal (Sync Folder & Setup Guide + Admin Settings)'
                  : 'CopyEditorModal & MediaPickerModal (tableCollapseIcons <760px)'
            }
            measuredWidth={w39B}
            simulatedWidth={simWidth39}
            onChangeSimulatedWidth={(val) => handleSetSectionWidth(setWidth39, val)}
          />

          <div
            className={cn(
              'grid gap-4 items-start overflow-x-auto pb-1',
              compareMode === 'split' && simWidth39 === null
                ? 'grid-cols-1 2xl:grid-cols-2'
                : 'grid-cols-1'
            )}
          >
            {/* #39 BEFORE (EXACT PRODUCTION REPLICA) */}
            {showBefore && (
              <div
                ref={ref39Before}
                style={
                  simWidth39 !== null
                    ? { width: `${simWidth39}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-rose-300 bg-white overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-900">
                    Before (Current Production Code — {w39B}px)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-rose-700">
                    {w39B < 360
                      ? 'isNarrow (<360px Stacked)'
                      : w39B < 760 && subMode39 === 'copy_media'
                        ? 'tableCollapseIcons (<760px)'
                        : 'Standard Modal'}
                  </span>
                </div>

                {subMode39 === 'locations' && (
                  /* Exact LocationsModal.tsx lines 397-652 */
                  <div className="flex flex-col bg-white">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Folder className="w-5 h-5" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                          Settings &amp; Storage Folders
                        </h3>
                      </div>
                      <X className="w-4 h-4 text-slate-400" />
                    </div>

                    <div className="p-3.5 space-y-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-black uppercase text-slate-600 tracking-widest leading-none">
                          Select Mode
                        </p>
                        <div className="p-1 bg-slate-100 border border-slate-200 rounded-lg flex gap-1 items-center shadow-inner">
                          <button
                            type="button"
                            className="flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border bg-gradient-to-b from-purple-500 to-purple-600 border-[#8B5CF6] text-white shadow-2xs flex items-center justify-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]" />
                            <span>Local Folder</span>
                          </button>
                          <button
                            type="button"
                            className="flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border bg-white border-slate-200 text-slate-500 flex items-center justify-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            <span>Google Drive</span>
                          </button>
                        </div>
                      </div>

                      {/* Exact AMP FOLDER Section */}
                      <div>
                        <div
                          className={cn(
                            'mb-1',
                            w39B < 360
                              ? 'flex flex-col items-start gap-1'
                              : 'flex justify-between items-center'
                          )}
                        >
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            AMP FOLDER
                          </label>
                          <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                            Configured
                          </span>
                        </div>
                        <input
                          type="text"
                          readOnly
                          value="/Users/studio/AMP"
                          placeholder="e.g. /Users/name/AMP or C:\AMP"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono text-slate-800 mb-1.5"
                        />
                        <div className="flex gap-1.5 mb-1">
                          <span className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-bold">
                            Browse
                          </span>
                          <span className="px-2.5 py-1 bg-slate-200 text-slate-800 rounded text-xs font-bold">
                            Open
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Root directory that stores logs, settings, and media.
                        </p>
                        <div className="mt-1.5 p-2 rounded bg-blue-50/70 border border-blue-200/80 text-xs text-slate-600 leading-relaxed">
                          <span className="font-bold text-blue-800">Tip (macOS):</span> To keep settings and logs out of Finder <span className="font-semibold">Recents</span>, add <code className="font-mono font-bold text-blue-900 bg-blue-100/80 px-1 py-0.5 rounded">.noindex</code> to the folder name (e.g., <code className="font-mono text-slate-800">AMP.noindex</code>) before selecting it here.{' '}
                          <span className="font-bold text-blue-600 underline">Learn more</span>
                        </div>
                      </div>

                      {/* Exact <details> Advanced - Folder Overrides from LocationsModal.tsx line 480 */}
                      <div className="text-xs border border-slate-200 rounded p-2 bg-slate-50/50">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedFoldersBefore((p) => !p)}
                          className="font-bold text-slate-600 cursor-pointer select-none flex items-center gap-1 w-full text-left"
                        >
                          {showAdvancedFoldersBefore ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>Advanced - Folder Overrides</span>
                        </button>

                        {showAdvancedFoldersBefore && (
                          <div className="mt-2.5 space-y-2.5 pt-2 border-t border-slate-200/60">
                            <p className="text-xs text-slate-400">
                              Optional. Leave blank to use default subfolders inside the AMP folder.
                            </p>
                            {[
                              {
                                label: 'Settings Folder',
                                placeholder: 'Default: [AMP]/settings',
                              },
                              {
                                label: 'Media_Announcements Folder',
                                placeholder: 'Default: [AMP]/media_announcements',
                              },
                              {
                                label: 'Media_Evergreens Folder',
                                placeholder: 'Default: [AMP]/media_evergreens',
                              },
                              {
                                label: 'Media_Shows Folder',
                                placeholder: 'Default: [AMP]/media_shows',
                              },
                              {
                                label: 'Logs Folder',
                                placeholder: 'Default: [AMP]/logs',
                              },
                            ].map((item) => (
                              <div key={item.label}>
                                <div
                                  className={cn(
                                    'mb-0.5',
                                    w39B < 360
                                      ? 'flex flex-col items-start gap-1'
                                      : 'flex justify-between items-center'
                                  )}
                                >
                                  <label className="text-xs font-bold uppercase text-slate-500">
                                    {item.label}
                                  </label>
                                  <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                                    Configured
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  readOnly
                                  placeholder={item.placeholder}
                                  className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 mb-1"
                                />
                                <div className="flex gap-1.5">
                                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold">
                                    Browse
                                  </span>
                                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-bold">
                                    Open
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {subMode39 === 'help' && (
                  /* Exact LocalHelpModal.tsx */
                  <div className="flex flex-col bg-white">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-purple-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                          Sync Folder &amp; Setup Guide
                        </h2>
                      </div>
                      <X className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="p-4 space-y-3 text-xs text-slate-700">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <span className="text-sm font-bold text-slate-900 block">
                          How Collaborative Sync Works
                        </span>
                        <p className="text-slate-600">
                          This app keeps your team in sync by sharing broadcast calendars and logs through a shared folder on cloud storage or a local office network.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                          {[
                            'Folder settings',
                            'Cloud Services',
                            'Office / PC',
                            'macOS .noindex',
                            'Reset & Defaults',
                          ].map((btn) => (
                            <span
                              key={btn}
                              className="px-2 py-1.5 bg-slate-100 text-purple-700 border border-slate-300 rounded text-xs font-bold text-center"
                            >
                              {btn}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 border border-slate-200 rounded-lg p-3">
                        <div className="font-bold text-slate-900 uppercase">
                          1. Recommended Folder Structure
                        </div>
                        <ul className="space-y-1 text-slate-600 pl-3 list-disc">
                          <li>
                            <code className="font-mono font-bold text-slate-900">settings</code>: Holds announcements and show configurations.
                          </li>
                          <li>
                            <code className="font-mono font-bold text-slate-900">media_announcements</code>: Holds MP3 audio and TXT live-read scripts.
                          </li>
                          <li>
                            <code className="font-mono font-bold text-slate-900">media_evergreens</code>: Holds fallback evergreen audio shows (`[Show_Short_Name]`).
                          </li>
                          <li>
                            <code className="font-mono font-bold text-slate-900">media_shows</code>: Holds scheduled playlist audio (`[Show_Short_Name]`).
                          </li>
                          <li>
                            <code className="font-mono font-bold text-slate-900">logs</code>: Holds broadcast playback history and compliance logs.
                          </li>
                        </ul>
                      </div>

                      <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
                        Chapters 2–4 (Cloud Services, Office/PC, macOS .noindex) follow above the live Admin Settings cards (Station Timezone, Admin Contact, Up Next Promo, Schedule Window, Reset &amp; Defaults) at the bottom.
                      </div>
                    </div>
                  </div>
                )}

                {subMode39 === 'copy_media' && (
                  /* Exact CopyEditorModal.tsx + MediaPickerModal.tsx */
                  <div className="p-3 space-y-3 bg-white">
                    {/* Exact CopyEditorModal */}
                    <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded bg-blue-600 text-white">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-black uppercase text-slate-900">
                              Edit Live Read (.txt)
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Format and edit live read text directly below
                            </div>
                          </div>
                        </div>
                        <XCircle className="w-4 h-4 text-slate-400" />
                      </div>

                      <div className="p-3 space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-7 space-y-1">
                            <label className="text-xs font-black uppercase text-slate-600 block">
                              Filename (.txt)
                            </label>
                            <input
                              type="text"
                              readOnly
                              value="live_read_future_1.txt"
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7"
                            />
                          </div>
                          <div className="sm:col-span-5 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-black uppercase text-slate-600">
                                Approx. Read Time
                              </span>
                              <span className="font-bold text-slate-400">48 words</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs font-bold text-blue-900 flex-1 h-7">
                                <Clock className="w-3 h-3 text-blue-600" />
                                <span>0m20s</span>
                              </div>
                              <label className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-600 h-7">
                                <input type="checkbox" checked readOnly className="w-3 h-3 accent-blue-600" />
                                <span>Auto</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded border border-slate-200 text-xs">
                          <span className="font-black uppercase text-slate-400 px-1">Style:</span>
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Bold className="w-3 h-3" /> Bold
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Italic className="w-3 h-3" /> Italic
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Underline className="w-3 h-3" /> Underline
                          </span>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold ml-auto">
                            Insert Pronunciation Block
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Exact MediaPickerModal */}
                    <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded bg-blue-600 text-white">
                            <FolderOpen className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-black uppercase text-slate-900">
                            Select Media File (media_announcements)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Refresh
                          </span>
                          <XCircle className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <div className="relative flex-1 min-w-[120px]">
                            <input
                              type="text"
                              readOnly
                              placeholder="Search files..."
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs h-7"
                            />
                          </div>
                          <span className="px-2 py-1 bg-emerald-600 text-white rounded font-black uppercase text-[11px] h-7 flex items-center">
                            + Create Live Read
                          </span>
                          <span className="px-2 py-1 bg-purple-600 text-white rounded font-black uppercase text-[11px] h-7 flex items-center gap-1">
                            <Upload className="w-3 h-3" /> + Upload File
                          </span>
                          <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded border border-slate-200 h-7">
                            <span className="font-black uppercase text-slate-500">Type:</span>
                            <label className="flex items-center gap-0.5 font-bold">
                              <input type="radio" checked readOnly /> All
                            </label>
                            <label className="flex items-center gap-0.5 font-bold">
                              <input type="radio" readOnly /> Audio
                            </label>
                            <label className="flex items-center gap-0.5 font-bold">
                              <input type="radio" readOnly /> LiveRead
                            </label>
                          </div>
                        </div>

                        <div className="border border-slate-200 rounded overflow-hidden text-xs">
                          <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 px-2 py-1 font-black uppercase text-slate-600 text-[10px]">
                            <div className="col-span-5">Name</div>
                            <div className="col-span-2">Type</div>
                            <div className="col-span-2">Last Used</div>
                            <div className="col-span-3 text-right">Actions</div>
                          </div>
                          <div className="grid grid-cols-12 items-center px-2 py-1.5 bg-white text-xs">
                            <div className="col-span-5 font-bold text-slate-800 truncate">
                              live_read_future_1.txt
                            </div>
                            <div className="col-span-2">
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                LiveRead
                              </span>
                            </div>
                            <div className="col-span-2 text-slate-500 text-[11px]">Nov 03</div>
                            <div className="col-span-3 flex justify-end gap-1">
                              <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
                                {w39B < 760 ? '✓' : 'Select'}
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-bold">
                                {w39B < 760 ? '👁' : 'Preview'}
                              </span>
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                {w39B < 760 ? '✎' : 'Edit'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* #39 AFTER */}
            {showAfter && (
              <div
                ref={ref39After}
                style={
                  simWidth39 !== null
                    ? { width: `${simWidth39}px`, maxWidth: '100%' }
                    : undefined
                }
                className="w-full rounded-xl border-2 border-emerald-400 bg-white overflow-hidden shadow-xs flex flex-col shrink-0"
              >
                <div className="bg-emerald-50 border-b border-emerald-200 px-3 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
                    After (Proposed Declutter #13–#17 — {w39A}px)
                  </span>
                  <div className="flex items-center gap-1">
                    {subMode39 === 'locations' && (
                      <>
                        <ProposalBadge num={13} />
                        <ProposalBadge num={14} />
                      </>
                    )}
                    {subMode39 === 'help' && <ProposalBadge num={15} />}
                    {subMode39 === 'copy_media' && (
                      <>
                        <ProposalBadge num={16} />
                        <ProposalBadge num={17} />
                      </>
                    )}
                  </div>
                </div>

                {subMode39 === 'locations' && (
                  <div className="flex flex-col bg-white">
                    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Folder className="w-5 h-5" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                          Settings &amp; Storage Folders
                        </h3>
                      </div>
                      <X className="w-4 h-4 text-slate-400" />
                    </div>

                    <div className="p-3.5 space-y-3">
                      <div className="p-1 bg-slate-100 border border-slate-200 rounded-lg flex gap-1 items-center shadow-inner">
                        <button
                          type="button"
                          className="flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border bg-gradient-to-b from-purple-500 to-purple-600 border-[#8B5CF6] text-white shadow-2xs flex items-center justify-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]" />
                          <span>Local Folder</span>
                        </button>
                        <button
                          type="button"
                          className="flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border bg-white border-slate-200 text-slate-500 flex items-center justify-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          <span>Google Drive</span>
                        </button>
                      </div>

                      {/* #13 Primary AMP FOLDER with Inline Browse/Open & Compact 1-Line .noindex Tip */}
                      <div>
                        <div
                          className={cn(
                            'mb-1',
                            w39A < 360
                              ? 'flex flex-col items-start gap-1'
                              : 'flex justify-between items-center'
                          )}
                        >
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider flex items-center gap-1.5">
                            <span>AMP FOLDER</span>
                            <ProposalBadge num={13} />
                          </label>
                          <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                            Configured
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            readOnly
                            value="/Users/studio/AMP"
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-mono text-slate-800 min-w-[160px]"
                          />
                          <span className="px-2.5 py-1.5 bg-blue-600 text-white border border-blue-700 rounded text-xs font-black uppercase shrink-0">
                            Browse
                          </span>
                          <span className="px-2.5 py-1.5 bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase shrink-0">
                            Open
                          </span>
                        </div>
                        <div className="mt-1.5 px-2 py-1 rounded bg-blue-50/70 border border-blue-200/80 text-xs text-slate-600 flex items-center justify-between gap-2">
                          <span>
                            <strong className="text-blue-800">macOS Tip:</strong> Rename to{' '}
                            <code className="font-mono font-bold text-blue-900">AMP.noindex</code> to hide from Finder Recents.
                          </span>
                          <span className="font-bold text-blue-600 underline shrink-0">Guide</span>
                        </div>
                      </div>

                      {/* #14 Compact 1-Line Subfolder Rows inside Advanced - Folder Overrides */}
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedFoldersAfter((p) => !p)}
                          className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-black uppercase text-slate-700 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            {showAdvancedFoldersAfter ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <span>Advanced - Folder Overrides (5)</span>
                            <ProposalBadge num={14} />
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            Default Subfolders Active
                          </span>
                        </button>

                        {showAdvancedFoldersAfter && (
                          <div className="p-2.5 space-y-1.5 bg-white border-t border-slate-200">
                            {[
                              { label: 'Settings', path: 'Default: [AMP]/settings' },
                              {
                                label: 'Media_Announcements',
                                path: 'Default: [AMP]/media_announcements',
                              },
                              {
                                label: 'Media_Evergreens',
                                path: 'Default: [AMP]/media_evergreens',
                              },
                              { label: 'Media_Shows', path: 'Default: [AMP]/media_shows' },
                              { label: 'Logs', path: 'Default: [AMP]/logs' },
                            ].map((sub) => (
                              <div key={sub.label} className="flex items-center gap-1.5 text-xs">
                                <span className="w-36 font-bold text-slate-600 truncate shrink-0">
                                  {sub.label}:
                                </span>
                                <input
                                  type="text"
                                  readOnly
                                  placeholder={sub.path}
                                  className="flex-1 px-2 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-700 min-w-0"
                                />
                                <span className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[11px] font-bold shrink-0">
                                  Browse
                                </span>
                                <span className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[11px] font-bold shrink-0">
                                  Open
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {subMode39 === 'help' && (
                  /* #15 Split LocalHelpModal into Station Settings vs Setup Guide tabs */
                  <div className="flex flex-col bg-white">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setHelpModalAfterTab('settings')}
                            className={cn(
                              'px-2.5 py-1 rounded text-xs font-black uppercase cursor-pointer',
                              helpModalAfterTab === 'settings'
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-700'
                            )}
                          >
                            Station Settings
                          </button>
                          <button
                            type="button"
                            onClick={() => setHelpModalAfterTab('guide')}
                            className={cn(
                              'px-2.5 py-1 rounded text-xs font-black uppercase cursor-pointer',
                              helpModalAfterTab === 'guide'
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-700'
                            )}
                          >
                            Setup Guide
                          </button>
                        </div>
                        <ProposalBadge num={15} />
                      </div>
                      <X className="w-4 h-4 text-slate-500" />
                    </div>

                    {helpModalAfterTab === 'settings' ? (
                      <div className="p-3.5 space-y-2 text-xs">
                        {[
                          {
                            title: 'Station Timezone',
                            val: '(GMT-07:00) Pacific Time (US & Canada)',
                            action: 'Unlock',
                          },
                          {
                            title: 'Admin Contact (Get Help)',
                            val: 'Station Engineer · ext. 104',
                            action: 'Edit',
                          },
                          {
                            title: 'Up Next Promo Cards',
                            val: 'Enabled · 20 mins before show (:40)',
                            action: 'Edit',
                          },
                          {
                            title: 'Live Schedule Window',
                            val: '5m Before · 5m After · 1h Lookaround',
                            action: 'Edit',
                          },
                          {
                            title: 'Reset & Sample Data',
                            val: 'Restore default shows & announcements or clear local cache',
                            action: 'Manage',
                          },
                        ].map((row) => (
                          <div
                            key={row.title}
                            className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="font-black text-slate-800 uppercase">{row.title}</div>
                              <div className="font-medium text-slate-600 mt-0.5">{row.val}</div>
                            </div>
                            <span className="px-2.5 py-1 rounded bg-white border border-slate-300 font-bold text-slate-700">
                              {row.action}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-xs text-slate-600 space-y-2">
                        <div className="font-black text-slate-900 uppercase">
                          Collaborative Folder &amp; Cloud Setup Reference
                        </div>
                        <p>
                          Contains the 4 reference chapters (`settings / media_announcements / media_evergreens / media_shows / logs` structure, Cloud Services, Office/PC, and macOS <code className="font-mono">.noindex</code>).
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {subMode39 === 'copy_media' && (
                  /* #16 CopyEditorModal & #17 MediaPickerModal */
                  <div className="p-3 space-y-3 bg-white">
                    {/* #16 CopyEditorModal */}
                    <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-blue-600 text-white">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-black uppercase text-slate-900">
                            Edit Live Read (.txt)
                          </span>
                          <ProposalBadge num={16} />
                        </div>
                        <XCircle className="w-4 h-4 text-slate-400" />
                      </div>

                      <div className="p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                            <span className="font-black uppercase text-slate-600 shrink-0">
                              File:
                            </span>
                            <input
                              type="text"
                              readOnly
                              value="live_read_future_1.txt"
                              className="flex-1 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800 h-7"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-slate-400 font-bold">48 words</span>
                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded font-bold text-blue-900 h-7">
                              <Clock className="w-3 h-3 text-blue-600" />
                              <span>0m20s</span>
                            </div>
                            <label className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded font-bold text-slate-600 h-7">
                              <input type="checkbox" checked readOnly className="w-3 h-3 accent-blue-600" />
                              <span>Auto</span>
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded border border-slate-200 text-xs">
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Bold className="w-3 h-3" /> Bold
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Italic className="w-3 h-3" /> Italic
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold flex items-center gap-1">
                            <Underline className="w-3 h-3" /> Underline
                          </span>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold ml-auto">
                            + Pronunciation
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* #17 MediaPickerModal */}
                    <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                      <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded bg-blue-600 text-white">
                            <FolderOpen className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-black uppercase text-slate-900">
                            Select Media File (media_announcements)
                          </span>
                          <ProposalBadge num={17} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-bold flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                          </span>
                          <XCircle className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <input
                            type="text"
                            readOnly
                            placeholder="Search files..."
                            className="flex-1 min-w-[120px] px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs h-7"
                          />
                          <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200 h-7 items-center">
                            <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[11px]">
                              All
                            </span>
                            <span className="px-2 py-0.5 rounded text-slate-600 font-bold text-[11px]">
                              Audio
                            </span>
                            <span className="px-2 py-0.5 rounded text-slate-600 font-bold text-[11px]">
                              LiveRead
                            </span>
                          </div>
                          <span className="px-2 py-1 bg-emerald-600 text-white rounded font-black uppercase text-[11px] h-7 flex items-center">
                            + Live Read
                          </span>
                          <span className="px-2 py-1 bg-purple-600 text-white rounded font-black uppercase text-[11px] h-7 flex items-center gap-1">
                            <Upload className="w-3 h-3" /> Upload
                          </span>
                        </div>

                        <div className="border border-slate-200 rounded overflow-hidden text-xs">
                          <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 px-2 py-1 font-black uppercase text-slate-600 text-[10px]">
                            <div className="col-span-5">Name</div>
                            <div className="col-span-2">Type</div>
                            <div className="col-span-2">Last Used</div>
                            <div className="col-span-3 text-right">Actions</div>
                          </div>
                          <div className="grid grid-cols-12 items-center px-2 py-1.5 bg-white text-xs">
                            <div className="col-span-5 font-bold text-slate-800 truncate">
                              live_read_future_1.txt
                            </div>
                            <div className="col-span-2">
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                                LiveRead
                              </span>
                            </div>
                            <div className="col-span-2 text-slate-500 text-[11px]">Nov 03</div>
                            <div className="col-span-3 flex justify-end gap-1">
                              <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">
                                {w39A < 760 ? '✓' : 'Select'}
                              </span>
                              <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-bold">
                                {w39A < 760 ? '👁' : 'Preview'}
                              </span>
                              <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                {w39A < 760 ? '✎' : 'Edit'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION #40: 250px Player Chrome, PrerecordModal & PrerecordExportPopup
          ===================================================================== */}
      {shouldRenderSection('40') && (
        <section className="w-full rounded-xl border-2 border-slate-300 bg-slate-50/70 p-3.5 flex flex-col gap-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black uppercase">
                  Roadmap #40 (Proposals #18–#20)
                </span>
                <h3 className="text-sm font-black text-slate-900">
                  `250px` Player Mode Chrome, `PrerecordModal` &amp; `PrerecordExportPopup`
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Defaults to `250px` (like the `Live_Dev` 250px timeline sandbox) and can be dynamically resized via the pixel ruler above.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg border border-slate-300">
              <span className="text-[10px] font-black uppercase text-slate-600 px-1.5">
                View:
              </span>
              {(
                [
                  { id: 'player_chrome', label: '250px Player Chrome (#18)' },
                  { id: 'prerecord_modal', label: 'PrerecordModal (#19)' },
                  { id: 'export_popup', label: 'PrerecordExportPopup (#20)' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSubMode40(v.id)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors',
                    subMode40 === v.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-700 hover:bg-slate-300/60'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exact DEBUG PIXEL RULER for #40 */}
          <DebugPixelRuler
            sectionNumber="40"
            sectionLabel="250px Player Window Chrome + PrerecordModal + PrerecordExportPopup"
            measuredWidth={w40B}
            simulatedWidth={simWidth40}
            onChangeSimulatedWidth={(val) => handleSetSectionWidth(setWidth40, val)}
          />

          <div className="flex flex-wrap items-start justify-center gap-6 overflow-x-auto py-2">
            {/* #40 BEFORE (EXACT 250px PRODUCTION REPLICA) */}
            {showBefore && (
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black uppercase tracking-wider">
                  Before (Current {w40B}px Code)
                </div>

                <div
                  ref={ref40Before}
                  style={{
                    width: simWidth40 !== null ? `${simWidth40}px` : '250px',
                    maxWidth: '100%',
                  }}
                  className="rounded-xl border-2 border-slate-400 bg-[#F8FAFC] shadow-md overflow-hidden flex flex-col font-sans"
                >
                  {/* Exact App.tsx Top Nav Header */}
                  <header className="bg-[#0F172A] px-2.5 py-2 flex items-center justify-between gap-2 text-white">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs tracking-tight">AMP</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold uppercase">
                        <Play className="w-3 h-3" />
                        {w40B >= 320 && <span>Player</span>}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 text-xs font-bold uppercase">
                        <Calendar className="w-3 h-3" />
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 text-xs font-bold uppercase">
                        <History className="w-3 h-3" />
                      </span>
                    </div>
                  </header>

                  {subMode40 === 'player_chrome' && (
                    <>
                      {/* Exact App.tsx Control Strip (lines 2280-2392) */}
                      <div className="bg-white border-b border-slate-200 py-1.5 px-2 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col py-0.5 min-w-0">
                            <p className="text-xs uppercase text-emerald-600 font-black tracking-widest leading-none flex items-center gap-1.5 mb-1">
                              <CassetteTape className="w-3.5 h-3.5 shrink-0" />
                              <span>Prerecord</span>
                            </p>
                            <div className="text-xs font-sans font-black text-slate-900 tabular-nums mt-0.5 leading-tight">
                              <div>11/04/2026</div>
                              <div>9:00 AM to 11:00 AM</div>
                            </div>
                          </div>

                          <div className="flex flex-col items-stretch gap-1 shrink-0">
                            <button
                              type="button"
                              className="flex items-center justify-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded border border-slate-200 text-center"
                            >
                              <NotebookPen className="w-3 h-3 shrink-0 text-slate-500" />
                              <span className="text-xs font-black uppercase tracking-tighter leading-tight flex flex-col text-center items-center">
                                <span>Choose</span>
                                <span>Show</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 text-white rounded border border-blue-700 border-b-2 border-b-blue-800 text-center shadow-2xs"
                            >
                              <Download className="w-3 h-3 shrink-0 text-white" />
                              <span className="text-xs font-black uppercase tracking-tighter leading-none">
                                Export
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Exact PersistentModeShowHeader from PlayerShowSpacer.tsx */}
                      <div
                        className="flex items-stretch w-full min-h-[2rem] border-b shadow-2xs"
                        style={{ backgroundColor: '#f0f9ff', borderColor: '#0284c7' }}
                      >
                        <div className="w-1.5 shrink-0" style={{ backgroundColor: '#0284c7' }} />
                        <div className="px-2.5 py-1 flex items-center justify-between gap-1.5 flex-1 min-w-0 uppercase">
                          <div className="line-clamp-2 font-sans text-xs leading-tight break-words flex-1 min-w-0">
                            <span className="text-slate-500 font-bold tabular-nums mr-1.5">
                              9:00 AM
                            </span>
                            <span className="font-black text-slate-800">Show Spacer 1</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Body */}
                      <div className="p-2 space-y-2 bg-slate-100/80 min-h-[160px]">
                        <div className="rounded-lg border border-slate-300 border-l-4 border-l-blue-500 bg-white p-2 shadow-2xs space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-slate-900">9:20 AM</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                              ~0:20
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-800 truncate">
                            Live Read Future Example
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {subMode40 === 'prerecord_modal' && (
                    /* Exact PrerecordModal.tsx (lines 120-470) */
                    <div className="p-2 bg-slate-900/20">
                      <div className="bg-white border border-emerald-300 rounded-xl shadow-lg flex flex-col overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                          <div className="flex items-center gap-1.5">
                            <CassetteTape className="w-4 h-4 text-emerald-700" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-emerald-700">
                              {prerecordModalStep40 === 'verify'
                                ? 'Verify Air Date'
                                : prerecordModalStep40 === 'selected'
                                  ? 'Choose Air Date'
                                  : 'Choose Show to prerecord'}
                            </h3>
                          </div>
                        </div>

                        <div className="p-2.5 space-y-2.5">
                          {/* Step switcher for testing all 3 states of PrerecordModal */}
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-bold">
                            {(
                              [
                                { id: 'list', label: '1. Show List' },
                                { id: 'selected', label: '2. Air Date' },
                                { id: 'verify', label: '3. Verify' },
                              ] as const
                            ).map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => setPrerecordModalStep40(st.id)}
                                className={cn(
                                  'flex-1 py-0.5 rounded cursor-pointer',
                                  prerecordModalStep40 === st.id
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-600'
                                )}
                              >
                                {st.label}
                              </button>
                            ))}
                          </div>

                          {prerecordModalStep40 === 'list' && (
                            <>
                              <input
                                type="text"
                                readOnly
                                placeholder="Filter shows..."
                                className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                              />
                              <div className="border border-slate-300 rounded-lg divide-y divide-slate-200 overflow-hidden">
                                {[
                                  {
                                    day: 'Wednesday',
                                    time: '9:00 AM (2h)',
                                    name: 'Show Spacer 1',
                                    bg: '#f0f9ff',
                                    border: '#0284c7',
                                  },
                                  {
                                    day: 'Wednesday',
                                    time: '12:00 PM (2h)',
                                    name: 'Show Spacer 2',
                                    bg: '#f5f3ff',
                                    border: '#7c3aed',
                                  },
                                ].map((s) => (
                                  <div
                                    key={s.name}
                                    style={{
                                      backgroundColor: s.bg,
                                      borderLeft: `3px solid ${s.border}`,
                                    }}
                                    className="flex flex-col gap-0.5 px-2 py-1.5 text-xs"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[9px] font-black uppercase">
                                        {s.day}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold text-slate-700">
                                        {s.time}
                                      </span>
                                    </div>
                                    <div className="font-bold text-slate-900 text-[11px]">
                                      {s.name}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                                <NotebookPen className="w-3 h-3 text-slate-500" />
                                <span>Set manually</span>
                              </div>
                            </>
                          )}

                          {prerecordModalStep40 === 'selected' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-black uppercase text-slate-600">
                                  Selected Show
                                </span>
                                <span className="font-bold text-blue-600">Change show</span>
                              </div>
                              <div
                                style={{
                                  backgroundColor: '#f0f9ff',
                                  borderLeft: '3px solid #0284c7',
                                }}
                                className="px-2 py-1.5 rounded-r border border-slate-300 text-xs"
                              >
                                <div className="text-[10px] font-mono font-bold text-slate-700">
                                  Wednesday · 9:00 AM (2h)
                                </div>
                                <div className="font-bold text-slate-900 text-[11px]">
                                  Show Spacer 1
                                </div>
                              </div>
                              <label className="text-[11px] font-black uppercase text-slate-700 block">
                                Choose Air Date
                              </label>
                              <select className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold">
                                <option>Wednesday, Nov 4, 2026 (Next)</option>
                              </select>
                            </div>
                          )}

                          {prerecordModalStep40 === 'verify' && (
                            <div className="space-y-2 text-xs">
                              <p className="text-slate-600 font-medium">Is this ok?</p>
                              <div className="flex items-center justify-between">
                                <span className="font-black uppercase text-slate-500">
                                  Air Date
                                </span>
                                <span className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold">
                                  Wed, Nov 04, 2026
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="font-black uppercase text-slate-500">
                                  Start Time
                                </span>
                                <span className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-emerald-700">
                                  9:00 AM
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {subMode40 === 'export_popup' && (
                    /* Exact PrerecordExportPopup.tsx (lines 200-450) */
                    <div className="p-2.5 bg-white space-y-2">
                      <div className="border-b border-slate-200 pb-1.5 flex items-start justify-between gap-1">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-900 flex items-center gap-1">
                            <Download className="w-3.5 h-3.5 text-blue-600" />
                            <span>Export Show</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Show Spacer 1 · Wed, Nov 04 (9:00 AM–11:00 AM)
                          </div>
                        </div>
                        <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="flex-1 py-1 px-2 bg-blue-600 text-white rounded text-[10px] font-black uppercase text-center">
                          Export Files...
                        </span>
                        <span className="flex-1 py-1 px-2 bg-blue-800 text-white rounded text-[10px] font-black uppercase text-center">
                          Log Exports
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-black uppercase">
                        <span className="flex-1 py-0.5 rounded bg-white text-slate-900 text-center shadow-2xs">
                          Plan
                        </span>
                        <span className="flex-1 py-0.5 text-slate-600 text-center">.m3u LIST</span>
                        <span className="flex-1 py-0.5 text-slate-600 text-center">Live Reads</span>
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">
                          Copy
                        </span>
                      </div>
                      <pre className="p-2 rounded bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto leading-relaxed">
                        {`Show Spacer 1 — Broadcast Plan\nWed, Nov 04, 2026 · 9:00 AM – 11:00 AM\n--------------------------------------------\n9:20 AM [READ] Live Read Future Example (~0:20)\n9:40 AM [MP3] MP3 Audio Played Example (0:30)`}
                      </pre>
                    </div>
                  )}

                  {/* Exact App.tsx Footer Bar */}
                  <footer className="bg-slate-900 px-2.5 py-1.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-bold">
                        Folders
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-bold">
                        ?
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-400">Mode:</span>
                      <span className="px-2 py-0.5 rounded bg-gradient-to-b from-emerald-500 to-emerald-600 text-white text-[11px] font-black uppercase flex items-center gap-1">
                        <CassetteTape className="w-3 h-3 text-red-400" />
                        <span>Prerecord</span>
                      </span>
                    </div>
                  </footer>
                </div>
              </div>
            )}

            {/* #40 AFTER (DE-CLUTTERED 250px REPLICA WITH SAME VISUAL DNA) */}
            {showAfter && (
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <span>After (Proposed Declutter — {w40A}px)</span>
                  {subMode40 === 'player_chrome' && <ProposalBadge num={18} />}
                  {subMode40 === 'prerecord_modal' && <ProposalBadge num={19} />}
                  {subMode40 === 'export_popup' && <ProposalBadge num={20} />}
                </div>

                <div
                  ref={ref40After}
                  style={{
                    width: simWidth40 !== null ? `${simWidth40}px` : '250px',
                    maxWidth: '100%',
                  }}
                  className="rounded-xl border-2 border-emerald-500 bg-[#F8FAFC] shadow-md overflow-hidden flex flex-col font-sans"
                >
                  {/* Exact App.tsx Top Nav Header */}
                  <header className="bg-[#0F172A] px-2.5 py-2 flex items-center justify-between gap-2 text-white">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs tracking-tight">AMP</span>
                    </div>
                    <div className="flex gap-1">
                      <span className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold uppercase">
                        <Play className="w-3 h-3" />
                        {w40A >= 320 && <span>Player</span>}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 text-xs font-bold uppercase">
                        <Calendar className="w-3 h-3" />
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 text-xs font-bold uppercase">
                        <History className="w-3 h-3" />
                      </span>
                    </div>
                  </header>

                  {subMode40 === 'player_chrome' && (
                    <>
                      {/* #18 Compact Single-Block Control Strip */}
                      <div className="bg-white border-b border-slate-200 py-1.5 px-2 shadow-2xs">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase text-emerald-600 font-black tracking-wider leading-none flex items-center gap-1">
                              <CassetteTape className="w-3 h-3 shrink-0" />
                              <span>Wed 11/04</span>
                              <ProposalBadge num={18} />
                            </p>
                            <div className="text-xs font-sans font-black text-slate-900 tabular-nums mt-0.5 leading-tight truncate">
                              9:00 – 11:00 AM
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300 text-xs font-black uppercase flex items-center gap-1"
                              title="Change Prerecord Show or Date"
                            >
                              <NotebookPen className="w-3 h-3 text-slate-500" />
                              <span>Show</span>
                            </button>
                            <button
                              type="button"
                              className="px-2 py-1 bg-blue-600 text-white rounded border border-blue-700 border-b-2 border-b-blue-800 text-xs font-black uppercase flex items-center gap-1 shadow-2xs"
                            >
                              <Download className="w-3 h-3 text-white" />
                              <span>Export</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* PersistentModeShowHeader */}
                      <div
                        className="flex items-stretch w-full min-h-[2rem] border-b shadow-2xs"
                        style={{ backgroundColor: '#f0f9ff', borderColor: '#0284c7' }}
                      >
                        <div className="w-1.5 shrink-0" style={{ backgroundColor: '#0284c7' }} />
                        <div className="px-2.5 py-1 flex items-center justify-between gap-1.5 flex-1 min-w-0 uppercase">
                          <div className="truncate font-sans text-xs leading-tight flex-1 min-w-0">
                            <span className="text-slate-500 font-bold tabular-nums mr-1.5">
                              9:00 AM
                            </span>
                            <span className="font-black text-slate-800">Show Spacer 1</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Body */}
                      <div className="p-2 space-y-2 bg-slate-100/80 min-h-[160px]">
                        <div className="rounded-lg border border-slate-300 border-l-4 border-l-blue-500 bg-white p-2 shadow-2xs space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-slate-900">9:20 AM</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                              ~0:20
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-800 truncate">
                            Live Read Future Example
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {subMode40 === 'prerecord_modal' && (
                    /* #19 De-cluttered PrerecordModal: Single-step Show + Air Date without extra "Verify Air Date / Is this ok?" confirmation screen */
                    <div className="p-2 bg-slate-900/20">
                      <div className="bg-white border border-emerald-400 rounded-xl shadow-lg flex flex-col overflow-hidden">
                        <div className="px-3 py-1.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                          <div className="flex items-center gap-1.5">
                            <CassetteTape className="w-4 h-4 text-emerald-700" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-emerald-700">
                              Prerecord Show
                            </h3>
                            <ProposalBadge num={19} />
                          </div>
                          <span className="text-[11px] font-bold text-blue-600 cursor-pointer">
                            Manual
                          </span>
                        </div>

                        <div className="p-2.5 space-y-2">
                          <input
                            type="text"
                            readOnly
                            placeholder="Filter shows..."
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                          />
                          <div className="border border-slate-300 rounded-lg divide-y divide-slate-200 overflow-hidden">
                            {[
                              {
                                day: 'Wed',
                                time: '9:00 AM (2h)',
                                name: 'Show Spacer 1',
                                bg: '#f0f9ff',
                                border: '#0284c7',
                                selected: true,
                              },
                              {
                                day: 'Wed',
                                time: '12:00 PM (2h)',
                                name: 'Show Spacer 2',
                                bg: '#f5f3ff',
                                border: '#7c3aed',
                                selected: false,
                              },
                            ].map((s) => (
                              <div
                                key={s.name}
                                style={{
                                  backgroundColor: s.bg,
                                  borderLeft: `3px solid ${s.border}`,
                                }}
                                className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 text-[11px] truncate">
                                    {s.name}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-600">
                                    {s.day} · {s.time}
                                  </div>
                                </div>
                                {s.selected && (
                                  <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Inline Air Date Picker right inside the same view */}
                          <div className="pt-1 border-t border-slate-200 space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-600 block">
                              Air Date (Wed 9:00 AM · 2h)
                            </label>
                            <select className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold">
                              <option>Wed, Nov 04, 2026 (Next)</option>
                            </select>
                          </div>

                          <div className="flex justify-end gap-1.5 pt-1">
                            <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700">
                              Cancel
                            </span>
                            <span className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-black uppercase">
                              Load Show
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {subMode40 === 'export_popup' && (
                    /* #20 De-cluttered PrerecordExportPopup */
                    <div className="p-2.5 bg-white space-y-2">
                      <div className="border-b border-slate-200 pb-1.5 flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <div className="text-xs font-black uppercase text-slate-900 truncate flex items-center gap-1">
                            <span>Show Spacer 1</span>
                            <ProposalBadge num={20} />
                          </div>
                          <div className="text-[10px] font-mono font-bold text-slate-500">
                            Wed Nov 04 · 9:00–11:00 AM
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-black uppercase">
                            Export
                          </span>
                          <span className="px-1.5 py-0.5 bg-blue-800 text-white rounded text-[10px] font-black uppercase">
                            Log
                          </span>
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-black uppercase">
                        <span className="flex-1 py-0.5 rounded bg-white text-slate-900 text-center shadow-2xs">
                          Plan
                        </span>
                        <span className="flex-1 py-0.5 text-slate-600 text-center">.m3u</span>
                        <span className="flex-1 py-0.5 text-slate-600 text-center">Reads</span>
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded">
                          Copy
                        </span>
                      </div>
                      <pre className="p-2 rounded bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto leading-snug">
                        {`9:20 AM [READ] Live Read Future (~0:20)\n9:40 AM [MP3] MP3 Audio Played (0:30)`}
                      </pre>
                    </div>
                  )}

                  {/* Footer Bar */}
                  <footer className="bg-slate-900 px-2.5 py-1.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-bold">
                        Folders
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-bold">
                        ?
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-gradient-to-b from-emerald-500 to-emerald-600 text-white text-[11px] font-black uppercase flex items-center gap-1">
                      <CassetteTape className="w-3 h-3 text-red-400" />
                      <span>Prerecord</span>
                    </span>
                  </footer>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
export default UiDeclutterMockups;
