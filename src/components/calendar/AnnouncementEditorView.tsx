import React from 'react';
import {
  FileText,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  AlertCircle,
  Square,
  Play,
  Edit3,
  Eye,
  FolderOpen,
  Check,
  X,
  Clock,
  XCircle,
  RefreshCw,
  CheckCircle,
  ChevronRight,
  Archive,
} from 'lucide-react';
import { Announcement, AnnouncementType, TimeGatedMediaItem, TimeGatedMp3, LogEntry } from '../../types';
import {
  cn,
  getFilenameFromUrlOrPath,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getDatePart,
  getTimePart,
  sortMp3sByStartDate,
  validateTimeGatedMp3s,
  formatDatetime12,
  formatHour12,
  isAudioFile,
  isScriptFile,
  getGateMediaItems,
  isGateExpiredOrInactivated,
  isAnnouncementRuleMatch,
} from '../../lib/utils';
import { availableFilesCache } from '../../lib/audioCache';
import {
  calculateGatedTrackAudit,
  calculateGateSlotAssessment,
  formatSlotAssessmentTooltip,
} from '../../lib/temporalReconciliation';
import { normalizeReadTimeDisplay } from '../../lib/liveReadFormatting';
import { MilitaryTimeInput } from '../MilitaryTimeInput';
import {
  formatMetadataDate,
  PreviewScriptOriginState,
  CopyEditorModalOpenState,
} from './calendarHelpers';

export interface AnnouncementEditorViewProps {
  editingId: string;
  isNew: boolean;
  formData: Partial<Announcement>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Announcement>>>;
  isDraggingClock: boolean;
  setIsDraggingClock: (val: boolean) => void;
  handleClockInteraction: (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => void;
  handleAddMp3: () => void;
  onReuseGate?: (gate: TimeGatedMp3) => void;
  logs: LogEntry[];
  pickerDurations: Record<string, string>;
  metadataCache: Record<string, { title?: string; artist?: string; album?: string }>;
  previewUrl: string | null;
  togglePreview: (url: string | undefined, e?: React.MouseEvent) => void;
  setCopyEditorState: React.Dispatch<React.SetStateAction<CopyEditorModalOpenState>>;
  setPreviewScriptBackupUrl: (url: string | undefined) => void;
  setPreviewScriptOrigin: (origin: PreviewScriptOriginState | null) => void;
  setPreviewScriptFromPicker: (val: boolean) => void;
  setPreviewScriptFile: (file: string | null) => void;
  setPickerTarget: (target: 'main' | 'backup' | 'timeGated' | 'newTimeGated' | 'addGateFile') => void;
  setPickerMp3Id: (id: string | null) => void;
  setPickerItemIndex: (idx: number | null) => void;
  setSearchQuery: (q: string) => void;
  setIsPickerOpen: (val: boolean) => void;
  toggleColumn: (day: number) => void;
  toggleRow: (hour: number) => void;
  toggleGridCell: (day: number, hour: number) => void;
  isSavingAnnouncement: boolean;
  setDeleteConfirmId: (id: string | null) => void;
  handleCancelEdit: () => void;
  saveEdit: (overrideEndDate?: string) => void;
  isFormValid: boolean;
}

export function AnnouncementEditorView({
  editingId,
  isNew,
  formData,
  setFormData,
  isDraggingClock,
  setIsDraggingClock,
  handleClockInteraction,
  handleAddMp3,
  onReuseGate,
  logs,
  pickerDurations,
  metadataCache,
  previewUrl,
  togglePreview,
  setCopyEditorState,
  setPreviewScriptBackupUrl,
  setPreviewScriptOrigin,
  setPreviewScriptFromPicker,
  setPreviewScriptFile,
  setPickerTarget,
  setPickerMp3Id,
  setPickerItemIndex,
  setSearchQuery,
  setIsPickerOpen,
  toggleColumn,
  toggleRow,
  toggleGridCell,
  isSavingAnnouncement,
  setDeleteConfirmId,
  handleCancelEdit,
  saveEdit,
  isFormValid,
}: AnnouncementEditorViewProps) {
  const [showArchivedGates, setShowArchivedGates] = React.useState(false);
  const [reactivatePromptState, setReactivatePromptState] = React.useState<{
    gate: TimeGatedMp3;
    missedCount: number;
  } | null>(null);
  const [gateDeleteConfirmState, setGateDeleteConfirmState] = React.useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Track gate IDs that were active when the editor opened (or added/reactivated during this edit session)
  // so changing an active gate's End date into the past does not abruptly drop it into Past / Inactivated Gates mid-edit (#71).
  const [sessionActiveGateIds, setSessionActiveGateIds] = React.useState<Set<string>>(() => {
    const initialNow = getCurrentDatetimeLocal();
    const initialList = formData.timeGatedMp3s || [];
    return new Set(
      initialList
        .filter(g => !isGateExpiredOrInactivated(g, initialNow))
        .map(g => g.id)
    );
  });
  const knownGateIdsRef = React.useRef<Set<string>>(
    new Set((formData.timeGatedMp3s || []).map(g => g.id))
  );

  React.useEffect(() => {
    const initialNow = getCurrentDatetimeLocal();
    const initialList = formData.timeGatedMp3s || [];
    knownGateIdsRef.current = new Set(initialList.map(g => g.id));
    setSessionActiveGateIds(
      new Set(
        initialList
          .filter(g => !isGateExpiredOrInactivated(g, initialNow))
          .map(g => g.id)
      )
    );
  }, [editingId]);

  React.useEffect(() => {
    const currentList = formData.timeGatedMp3s || [];
    const newlyAddedActiveIds: string[] = [];
    for (const g of currentList) {
      if (!knownGateIdsRef.current.has(g.id)) {
        knownGateIdsRef.current.add(g.id);
        if (!g.inactivated) {
          newlyAddedActiveIds.push(g.id);
        }
      }
    }
    if (newlyAddedActiveIds.length > 0) {
      setSessionActiveGateIds(prev => {
        const next = new Set(prev);
        newlyAddedActiveIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [formData.timeGatedMp3s]);

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-slate-300 flex flex-col h-full overflow-hidden shadow-md transition-all duration-300',
        !formData.enabled &&
          'bg-orange-50/40 border-orange-500 border-2 shadow-[0_0_12px_rgba(249,115,22,0.15)] ring-1 ring-orange-500'
      )}
    >
      {/* Fixed Top Bar */}
      <div className="p-4 pb-2.5 border-b border-slate-300 shrink-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded shrink-0 flex items-center justify-center w-8 h-8">
            <FileText className="w-4 h-4 text-white" />
          </div>

          <div className="flex flex-col gap-0.5 shrink-0">
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest select-none leading-none">
              Editor
            </span>
            <p className="text-xs text-slate-400 font-black truncate leading-none mt-1 font-sans">
              {editingId === 'new' ? 'New Profile' : `${formData.id}`}
            </p>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-stretch w-full shadow-xs rounded-lg overflow-hidden border border-slate-350 focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 bg-white">
              <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-wider px-2.5 py-0.5 flex flex-col justify-center items-center leading-tight select-none shrink-0 text-center">
                <span>Announcement</span>
                <span>Name</span>
              </div>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Name is required"
                className={cn(
                  'w-full px-2.5 py-1 text-xs font-black text-slate-800 bg-white outline-none placeholder:text-red-500 placeholder:font-bold',
                  !formData.name && editingId ? 'bg-red-50/50' : ''
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5 shrink-0">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block select-none leading-none">
              Status
            </label>
            <div className="flex items-center">
              <div className="flex items-center -space-x-px shrink-0">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, enabled: true })}
                  className={cn(
                    'px-2 py-0.5 text-xs font-black uppercase transition-all select-none cursor-pointer rounded-l rounded-r-none h-6 flex items-center justify-center leading-none border',
                    formData.enabled
                      ? 'bg-emerald-700 border-emerald-700 text-white shadow-xs z-10'
                      : 'bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, enabled: false })}
                  className={cn(
                    'px-2 py-0.5 text-xs font-black uppercase transition-all select-none cursor-pointer rounded-r rounded-l-none h-6 flex items-center justify-center leading-none border',
                    !formData.enabled
                      ? 'bg-orange-600 border-orange-600 text-white shadow-xs z-10'
                      : 'bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  )}
                >
                  Suspended
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Middle */}
      <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
        <div className="grid grid-cols-1 min-[1500px]:grid-cols-[1fr_650px] gap-4 items-start">
          {/* Left Column: Basic Info */}
          <div className="@container space-y-2.5 min-w-0">
            <div className="flex flex-col justify-start gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1 min-w-[140px] flex-1">
                  <label className="text-xs/none font-black text-slate-400 uppercase tracking-widest block select-none">
                    Type
                  </label>
                  {!isNew ? (
                    <div className="px-3 py-1.5 rounded-lg border border-slate-350 bg-slate-50 text-xs font-bold text-slate-700 w-full select-none h-10 flex items-center shadow-xs">
                      {formData.type === AnnouncementType.ONE_TIME && 'One-Time Play'}
                      {formData.type === AnnouncementType.BASIC_HOURLY && 'Repeating Hourly'}
                      {formData.type === AnnouncementType.ADVANCED && 'Advanced Calendar'}
                    </div>
                  ) : (
                    <select
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value as AnnouncementType })}
                      className="px-3 py-1.5 rounded-lg border text-xs font-black outline-none transition-all w-full bg-white border-slate-350 text-slate-700 hover:border-blue-400 cursor-pointer h-10 shadow-xs"
                    >
                      <option value={AnnouncementType.ONE_TIME}>One-Time Play</option>
                      <option value={AnnouncementType.BASIC_HOURLY}>Repeating Hourly</option>
                      <option value={AnnouncementType.ADVANCED}>Advanced Calendar</option>
                    </select>
                  )}
                </div>

                <div className="flex items-end gap-1.5 shrink-0">
                  <div className="space-y-1 flex-1 min-w-0">
                    <label className="text-xs/none font-black text-slate-400 uppercase tracking-widest block select-none">
                      Play Time
                    </label>
                    <div className="flex items-center gap-1">
                      <div className="relative w-14 shrink-0">
                        <input
                          type="text"
                          value={`:${(formData.minute || 0).toString().padStart(2, '0')}`}
                          onChange={e => {
                            const clean = e.target.value.replace(/\D/g, '');
                            const parsed = parseInt(clean, 10);
                            const val = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
                            setFormData({ ...formData, minute: val });
                          }}
                          className="w-full text-center text-blue-600 bg-white pl-1 pr-4 py-1.5 border border-slate-350 rounded-lg font-black outline-none focus:ring-1 focus:ring-blue-500 text-xs h-10 shadow-xs"
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none select-none">
                          m
                        </span>
                      </div>

                      <div className="flex flex-col -space-y-px shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const val = ((formData.minute || 0) + 1) % 60;
                            const wrapped = val >= 60 ? 0 : val;
                            setFormData({ ...formData, minute: wrapped });
                          }}
                          className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-t rounded-b-none text-slate-700 h-5 w-6 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                          title="Increase Minute"
                        >
                          <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const val = ((formData.minute || 0) - 1 + 60) % 60;
                            setFormData({ ...formData, minute: val });
                          }}
                          className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-b rounded-t-none text-slate-700 h-5 w-6 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                          title="Decrease Minute"
                        >
                          <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center select-none shrink-0">
                    <div className="flex flex-col items-center justify-center p-[2px] bg-slate-50 border border-slate-200/80 rounded-lg shadow-xs hover:bg-slate-100/50 transition-colors w-[54px] h-[54px] shrink-0">
                      <svg
                        width="50"
                        height="50"
                        viewBox="0 0 80 80"
                        className="cursor-pointer select-none active:brightness-95 transition-all w-[50px] h-[50px]"
                        onMouseDown={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onMouseMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onMouseUp={() => setIsDraggingClock(false)}
                        onMouseLeave={() => setIsDraggingClock(false)}
                        onTouchStart={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onTouchMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onTouchEnd={() => setIsDraggingClock(false)}
                      >
                        <circle
                          cx="40"
                          cy="40"
                          r="38"
                          className={cn(
                            'fill-white stroke-slate-200 stroke-[2]',
                            isDraggingClock && 'stroke-blue-500 stroke-[2.5]'
                          )}
                        />
                        <text
                          x="40"
                          y="18"
                          textAnchor="middle"
                          className={cn(
                            'text-xs font-black fill-slate-400 select-none',
                            isDraggingClock && 'fill-slate-600'
                          )}
                        >
                          0
                        </text>
                        <text x="67" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">
                          15
                        </text>
                        <text x="40" y="71" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">
                          30
                        </text>
                        <text x="13" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">
                          45
                        </text>
                        {Array.from({ length: 12 }).map((_, idx) => {
                          const angle = idx * 30;
                          if (idx % 3 === 0) return null;
                          return (
                            <line
                              key={idx}
                              x1="40"
                              y1="5"
                              x2="40"
                              y2="8"
                              transform={`rotate(${angle}, 40, 40)`}
                              className={cn(
                                'stroke-slate-300 stroke-[2]',
                                isDraggingClock && 'stroke-slate-400'
                              )}
                            />
                          );
                        })}
                        <line
                          x1="40"
                          y1="40"
                          x2="40"
                          y2="10"
                          transform={`rotate(${(formData.minute || 0) * 6}, 40, 40)`}
                          stroke={isDraggingClock ? '#1e3a8a' : '#2563eb'}
                          strokeWidth={isDraggingClock ? 5 : 3.5}
                          strokeLinecap="round"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r="4.5"
                          className={cn('fill-slate-800', isDraggingClock && 'fill-slate-950')}
                        />
                        <circle cx="40" cy="40" r="1.5" className="fill-white" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Whole-Announcement Start & End Row */}
              <div className="px-2.5 py-1 bg-slate-100/80 border border-slate-300 rounded-lg flex flex-col @[640px]:flex-row @[640px]:items-center gap-y-1 gap-x-3">
                <div className="text-xs font-black text-slate-600 uppercase tracking-wider @[640px]:w-[126px] shrink-0 select-none">
                  Announcement
                </div>
                <div className="flex flex-col @[490px]:flex-row @[490px]:items-center gap-y-1 gap-x-4 flex-1 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none"
                      title="Effective Start"
                    >
                      Start
                    </label>
                    <div className="flex items-center gap-px">
                      <input
                        type="date"
                        value={getDatePart(formData.startDate)}
                        onChange={e => {
                          const d = e.target.value;
                          const t = getTimePart(formData.startDate) || '00:00';
                          const newVal = d ? `${d}T${t}` : '';
                          const prevStart = formData.startDate;
                          const currentMp3s = formData.timeGatedMp3s || [];
                          const nowIso = getCurrentDatetimeLocal();
                          const updatedMp3s =
                            currentMp3s.length === 1 &&
                            (!currentMp3s[0].startDate ||
                              currentMp3s[0].startDate === prevStart ||
                              (isNew && formatToDatetimeLocal(currentMp3s[0].startDate) < nowIso))
                              ? [{ ...currentMp3s[0], startDate: newVal }]
                              : currentMp3s;
                          setFormData({ ...formData, startDate: newVal, timeGatedMp3s: updatedMp3s });
                        }}
                        className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-sans tabular-nums outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                      />
                      <div className="shrink-0">
                        <MilitaryTimeInput
                          value={getTimePart(formData.startDate)}
                          onChange={t => {
                            let d = getDatePart(formData.startDate);
                            if (!d && t) {
                              d = getCurrentDatetimeLocal().split('T')[0];
                            }
                            const newVal = d ? `${d}T${t || '00:00'}` : '';
                            const prevStart = formData.startDate;
                            const currentMp3s = formData.timeGatedMp3s || [];
                            const nowIso = getCurrentDatetimeLocal();
                            const updatedMp3s =
                              currentMp3s.length === 1 &&
                              (!currentMp3s[0].startDate ||
                                currentMp3s[0].startDate === prevStart ||
                                (isNew && formatToDatetimeLocal(currentMp3s[0].startDate) < nowIso))
                                ? [{ ...currentMp3s[0], startDate: newVal }]
                                : currentMp3s;
                            setFormData({ ...formData, startDate: newVal, timeGatedMp3s: updatedMp3s });
                          }}
                          className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5"
                          placeholder="hh:mm AM"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label
                      className="text-xs font-black text-slate-600 uppercase tracking-wider w-9 shrink-0 select-none"
                      title="Expiration Date"
                    >
                      End
                    </label>
                    <div className="flex items-center gap-px">
                      <input
                        type="date"
                        value={getDatePart(formData.endDate)}
                        onChange={e => {
                          const d = e.target.value;
                          const prevEnd = formData.endDate;
                          const currentMp3s = formData.timeGatedMp3s || [];
                          if (!d) {
                            const updatedMp3s =
                              currentMp3s.length === 1 && currentMp3s[0].endDate === prevEnd
                                ? [{ ...currentMp3s[0], endDate: undefined }]
                                : currentMp3s;
                            setFormData({ ...formData, endDate: undefined, timeGatedMp3s: updatedMp3s });
                            return;
                          }
                          const t = getTimePart(formData.endDate) || '23:59';
                          const newVal = `${d}T${t}`;
                          const nowIso = getCurrentDatetimeLocal();
                          const updatedMp3s =
                            currentMp3s.length === 1 &&
                            (currentMp3s[0].endDate === prevEnd ||
                              (isNew &&
                                currentMp3s[0].endDate &&
                                formatToDatetimeLocal(currentMp3s[0].endDate) < nowIso))
                              ? [{ ...currentMp3s[0], endDate: newVal }]
                              : currentMp3s;
                          setFormData({ ...formData, endDate: newVal, timeGatedMp3s: updatedMp3s });
                        }}
                        className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-sans tabular-nums outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                      />
                      <div className="shrink-0">
                        <MilitaryTimeInput
                          value={getTimePart(formData.endDate)}
                          onChange={t => {
                            let d = getDatePart(formData.endDate);
                            if (!d && t) {
                              d = getDatePart(formData.startDate) || getCurrentDatetimeLocal().split('T')[0];
                            }
                            const prevEnd = formData.endDate;
                            const newVal = d ? `${d}T${t || '23:59'}` : undefined;
                            const currentMp3s = formData.timeGatedMp3s || [];
                            const nowIso = getCurrentDatetimeLocal();
                            const updatedMp3s =
                              currentMp3s.length === 1 &&
                              (currentMp3s[0].endDate === prevEnd ||
                                (isNew &&
                                  currentMp3s[0].endDate &&
                                  formatToDatetimeLocal(currentMp3s[0].endDate) < nowIso))
                                ? [{ ...currentMp3s[0], endDate: newVal }]
                                : currentMp3s;
                            setFormData({ ...formData, endDate: newVal, timeGatedMp3s: updatedMp3s });
                          }}
                          className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5"
                          placeholder="hh:mm AM"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Time-Gated Announcements Group */}
            <div className="space-y-0 mt-0">
              <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-t-lg select-none flex items-center justify-between gap-2 flex-wrap">
                <span>ANNOUNCEMENT GATES</span>
              </div>

              <div className="bg-white border-x border-b border-slate-350 rounded-b-lg overflow-hidden shadow-xs divide-y divide-slate-350">
                {(() => {
                  const currentMp3s = formData.timeGatedMp3s || [];
                  const validation = validateTimeGatedMp3s(
                    currentMp3s,
                    undefined,
                    formData.endDate,
                    formData.startDate
                  );

                  if (currentMp3s.length === 0) {
                    return (
                      <div className="p-2 space-y-1.5">
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-center space-y-1">
                          <p className="text-xs font-bold text-amber-700 uppercase">
                            No announcement attachments added.
                          </p>
                          <p className="text-xs text-slate-600">
                            Click <span className="font-bold text-emerald-700">&apos;Add Announcement&apos;</span> below to
                            attach an audio file.
                          </p>
                        </div>
                        <div className="pt-0.5 flex justify-start">
                          <button
                            type="button"
                            onClick={handleAddMp3}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs select-none"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            Add Announcement
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const nowIso = getCurrentDatetimeLocal();

                  const getOneMinuteBeforeIso = (isoStr: string): string => {
                    const formatted = formatToDatetimeLocal(isoStr);
                    const dPart = getDatePart(formatted);
                    const tPart = getTimePart(formatted) || '00:00';
                    const [y, m, d] = dPart.split('-').map(Number);
                    const [hh, mm] = tPart.split(':').map(Number);
                    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && !isNaN(hh) && !isNaN(mm)) {
                      const dt = new Date(y, m - 1, d, hh, mm - 1);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                    }
                    return formatted;
                  };

                  const getGateAssessment = (gate: TimeGatedMp3) =>
                    calculateGateSlotAssessment(formData, gate, logs);

                   const handleInactivateGate = (gate: TimeGatedMp3) => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const updated = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      return {
                        ...m,
                        inactivated: true,
                        inactivatedAt: currentNowIso,
                      };
                    });
                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.delete(gate.id);
                      return next;
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                  };

                  const countMissedSlotsDuringInactivation = (gate: TimeGatedMp3): number => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const inactIso =
                      gate.inactivatedAt && gate.inactivatedAt.trim()
                        ? formatToDatetimeLocal(gate.inactivatedAt)
                        : '';
                    if (!inactIso || inactIso >= currentNowIso) return 0;

                    const gStart =
                      gate.startDate && gate.startDate.trim()
                        ? formatToDatetimeLocal(gate.startDate)
                        : inactIso;
                    const windowStartIso = gStart > inactIso ? gStart : inactIso;
                    const gEnd =
                      gate.endDate && gate.endDate.trim()
                        ? formatToDatetimeLocal(gate.endDate)
                        : currentNowIso;
                    const windowEndIso = gEnd < currentNowIso ? gEnd : currentNowIso;
                    if (windowStartIso > windowEndIso) return 0;

                    const startMs = new Date(windowStartIso).getTime();
                    const endMs = new Date(windowEndIso).getTime();
                    if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) return 0;

                    const annMinute = Number(formData.minute) || 0;
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const cursor = new Date(startMs);
                    cursor.setMinutes(annMinute, 0, 0);
                    if (cursor.getTime() < startMs) {
                      cursor.setHours(cursor.getHours() + 1);
                    }

                    let missed = 0;
                    let safety = 0;
                    while (cursor.getTime() <= endMs && safety < 2500) {
                      safety++;
                      const y = cursor.getFullYear();
                      const m = cursor.getMonth() + 1;
                      const d = cursor.getDate();
                      const h = cursor.getHours();
                      const localDateStr = `${y}-${pad(m)}-${pad(d)}`;
                      const slotIso = `${localDateStr}T${pad(h)}:${pad(annMinute)}`;
                      const dayOfWeek = cursor.getDay();

                      const matchesRule = isAnnouncementRuleMatch(
                        formData as Announcement,
                        dayOfWeek,
                        h,
                        annMinute,
                        localDateStr
                      );

                      if (matchesRule) {
                        const hasLogInHour =
                          Boolean(formData.id) &&
                          Array.isArray(logs) &&
                          logs.some(l => {
                            if (String(l.announcementId || '') !== String(formData.id)) return false;
                            const rawTs =
                              l.scheduledFor || l.executedAt || l.announcementTime || l.timestamp || '';
                            if (!rawTs) return false;
                            const logIso = formatToDatetimeLocal(String(rawTs));
                            return logIso.slice(0, 13) === slotIso.slice(0, 13);
                          });
                        if (!hasLogInHour) {
                          missed++;
                        }
                      }

                      cursor.setHours(cursor.getHours() + 1);
                    }

                    return missed;
                  };

                  const applyReactivateInPlace = (gate: TimeGatedMp3) => {
                    const updated = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      const next = { ...m };
                      delete next.inactivated;
                      delete next.inactivatedAt;
                      return next;
                    });
                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.add(gate.id);
                      return next;
                    });
                    setFormData({
                      ...formData,
                      timeGatedMp3s: updated,
                    });
                    setReactivatePromptState(null);
                  };

                  const applyReactivateSplitToNewGate = (gate: TimeGatedMp3) => {
                    const currentNowIso = getCurrentDatetimeLocal();
                    const closedEndIso =
                      gate.inactivatedAt && gate.inactivatedAt.trim()
                        ? formatToDatetimeLocal(gate.inactivatedAt)
                        : getOneMinuteBeforeIso(currentNowIso);
                    const gStart = gate.startDate ? formatToDatetimeLocal(gate.startDate) : '';

                    const updatedExisting = currentMp3s.map(m => {
                      if (m.id !== gate.id) return m;
                      const next: TimeGatedMp3 = {
                        ...m,
                        startDate: gStart && gStart > closedEndIso ? closedEndIso : m.startDate,
                        endDate: closedEndIso,
                      };
                      delete next.inactivated;
                      delete next.inactivatedAt;
                      return next;
                    });

                    const newActiveGate: TimeGatedMp3 = {
                      id: `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      startDate: currentNowIso,
                      endDate: gate.endDate,
                      mediaItems: getGateMediaItems(gate).map(mi => ({ ...mi })),
                    };

                    setSessionActiveGateIds(prev => {
                      const next = new Set(prev);
                      next.delete(gate.id);
                      next.add(newActiveGate.id);
                      return next;
                    });

                    const nextSorted = sortMp3sByStartDate([...updatedExisting, newActiveGate]);
                    setFormData({
                      ...formData,
                      timeGatedMp3s: nextSorted,
                    });
                    setReactivatePromptState(null);
                  };

                  const handleReactivateGateClick = (gate: TimeGatedMp3) => {
                    const missedCount = countMissedSlotsDuringInactivation(gate);
                    if (missedCount <= 0) {
                      applyReactivateInPlace(gate);
                    } else {
                      setReactivatePromptState({ gate, missedCount });
                    }
                  };

                  const handleReuseGate = (gate: TimeGatedMp3) => {
                    if (onReuseGate) {
                      onReuseGate(gate);
                      return;
                    }
                    const clonedGate: TimeGatedMp3 = {
                      id: `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                      startDate: getCurrentDatetimeLocal(),
                      endDate: undefined,
                      mediaItems: getGateMediaItems(gate).map(mi => ({ ...mi })),
                    };

                    const nextSorted = sortMp3sByStartDate([...currentMp3s, clonedGate]);
                    setFormData({
                      ...formData,
                      timeGatedMp3s: nextSorted,
                    });
                  };

                  const indexedGates = currentMp3s.map((item, idx) => {
                    const rawExpired = isGateExpiredOrInactivated(item, nowIso);
                    // Keep gates that were active in this editing session in Active Gates until saved or explicitly inactivated (#71)
                    const isKeptInActiveDuringSession =
                      !item.inactivated && sessionActiveGateIds.has(item.id);
                    const isItemExpired = rawExpired && !isKeptInActiveDuringSession;
                    return { item, idx, isItemExpired };
                  });

                  const activeIndexedGates = indexedGates.filter(g => !g.isItemExpired);
                  const archivedIndexedGates = indexedGates.filter(g => g.isItemExpired);

                  const renderGateCard = (item: TimeGatedMp3, idx: number, isItemExpired: boolean) => {
                    const itemErrors = validation.errors[item.id] || [];
                    const itemWarnings = validation.warnings[item.id] || [];
                    const hasStartGap = validation.gapStartIds?.has(item.id);
                    const hasEndGap = validation.gapEndIds?.has(item.id);
                    const hasStartOverlap = validation.overlapStartIds?.has(item.id);
                    const hasEndOverlap = validation.overlapEndIds?.has(item.id);
                    const hasMissingStart =
                      validation.missingStartIds?.has(item.id) || !item.startDate || item.startDate.trim() === '';
                    const gateMediaItems = getGateMediaItems(item);
                    const gateAssessment = getGateAssessment(item);
                    const gatePlayCount = gateAssessment.gateScore.played;
                    const isManuallyInactivated = Boolean(item.inactivated);
                    const isDateExpired = Boolean(
                      item.endDate && item.endDate.trim() && formatToDatetimeLocal(item.endDate) < nowIso
                    );
                    const isPendingArchiveOnSave = !isItemExpired && isDateExpired;
                    const canReactivateGate = isManuallyInactivated && !isDateExpired;

                    const promptDeleteGate = () => {
                      setGateDeleteConfirmState({
                        title: `Delete Gate #${idx + 1}`,
                        message: `Are you sure you want to delete Gate #${idx + 1}? This unused gate has 0 logged plays and will be removed from this announcement.`,
                        confirmLabel: 'Delete Gate',
                        onConfirm: () => {
                          const remaining = currentMp3s.filter(m => m.id !== item.id);
                          setFormData({
                            ...formData,
                            timeGatedMp3s: remaining,
                          });
                          setGateDeleteConfirmState(null);
                        },
                      });
                    };

                    const updateGateStartDate = (newVal: string) => {
                      if (isItemExpired) return;
                      const prevGateStart = item.startDate;
                      const updated = currentMp3s.map(m => (m.id === item.id ? { ...m, startDate: newVal } : m));
                      let nextProfileStart = formData.startDate;
                      if (
                        idx === 0 &&
                        newVal &&
                        (!formData.startDate ||
                          formData.startDate === prevGateStart ||
                          (isNew && (!prevGateStart || formatToDatetimeLocal(prevGateStart) < nowIso)))
                      ) {
                        nextProfileStart = newVal;
                      }
                      setFormData({
                        ...formData,
                        startDate: nextProfileStart,
                        timeGatedMp3s: updated,
                      });
                    };

                    const updateGateEndDate = (newVal: string | undefined) => {
                      if (isItemExpired) return;
                      const prevGateEnd = item.endDate;
                      const updated = currentMp3s.map(m => (m.id === item.id ? { ...m, endDate: newVal } : m));
                      let nextProfileEnd = formData.endDate;
                      if (
                        idx === currentMp3s.length - 1 &&
                        (formData.endDate === prevGateEnd ||
                          (formData.endDate &&
                            newVal &&
                            formatToDatetimeLocal(formData.endDate) < formatToDatetimeLocal(newVal)))
                      ) {
                        nextProfileEnd = newVal;
                      }
                      setFormData({
                        ...formData,
                        endDate: nextProfileEnd,
                        timeGatedMp3s: updated,
                      });
                    };

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'transition-all',
                          isItemExpired
                            ? 'bg-slate-50/90'
                            : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-100/70',
                          itemErrors.length > 0 && 'bg-red-50/20'
                        )}
                      >
                        <div
                          className={cn(
                            'px-2.5 py-1 flex flex-col @[640px]:flex-row @[640px]:items-center gap-y-1 gap-x-3',
                            isItemExpired
                              ? 'bg-slate-200/80 border-b border-slate-300'
                              : idx % 2 === 0
                                ? 'bg-blue-100/80 border-b border-blue-200'
                                : 'bg-blue-200/80 border-b border-blue-300'
                          )}
                        >
                          <div
                            className={cn(
                              'text-xs font-black uppercase tracking-wider @[640px]:w-[140px] shrink-0 select-none flex items-center gap-1.5',
                              isItemExpired ? 'text-slate-700' : 'text-blue-950'
                            )}
                          >
                            <span>Gate #{idx + 1}</span>
                            {isManuallyInactivated ? (
                              <span
                                className="text-[10px] font-bold px-1.5 py-px rounded bg-amber-200/80 text-amber-900 border border-amber-300"
                                title={
                                  item.inactivatedAt
                                    ? `Inactivated at ${formatDatetime12(formatToDatetimeLocal(item.inactivatedAt))} (Original End date preserved)`
                                    : 'Manually inactivated (Original End date preserved)'
                                }
                              >
                                Inactivated
                              </span>
                            ) : isItemExpired ? (
                              <span
                                className="text-[10px] font-bold px-1.5 py-px rounded bg-slate-300/80 text-slate-700"
                                title="Archived past gate (Read-only — click Reuse to schedule again)"
                              >
                                Past (Locked)
                              </span>
                            ) : isPendingArchiveOnSave ? (
                              <span
                                className="text-[10px] font-bold px-1.5 py-px rounded bg-amber-200/90 text-amber-950 border border-amber-300"
                                title="End date is in the past — this gate will move to Past / Inactivated Gates when saved"
                              >
                                Ends in Past
                              </span>
                            ) : null}
                          </div>

                          <div className="flex flex-col @[490px]:flex-row @[490px]:items-center gap-y-1 gap-x-4 flex-1 min-w-0 justify-between">
                            <div className="flex flex-col @[490px]:flex-row @[490px]:items-center gap-y-1 gap-x-4 flex-wrap">
                              <div className="flex items-center gap-1 shrink-0">
                                <label
                                  className={cn(
                                    'text-xs font-black uppercase tracking-wider w-11 shrink-0 select-none',
                                    hasStartOverlap
                                      ? 'text-red-700 font-black'
                                      : hasMissingStart
                                        ? 'text-amber-700 font-black'
                                        : hasStartGap
                                          ? 'text-amber-700 font-black'
                                          : isItemExpired
                                            ? 'text-slate-600'
                                            : 'text-blue-950'
                                  )}
                                >
                                  Start
                                </label>
                                <div className="flex items-center gap-px">
                                  <input
                                    type="date"
                                    disabled={isItemExpired}
                                    value={getDatePart(item.startDate)}
                                    onChange={e => {
                                      const d = e.target.value;
                                      const t = getTimePart(item.startDate) || '00:00';
                                      const newVal = d ? `${d}T${t}` : '';
                                      updateGateStartDate(newVal);
                                    }}
                                    className={cn(
                                      'w-[110px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                      isItemExpired
                                        ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed [&::-webkit-calendar-picker-indicator]:hidden'
                                        : '[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0',
                                      !isItemExpired &&
                                        (hasStartOverlap
                                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                          : hasMissingStart
                                            ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-bold'
                                            : hasStartGap
                                              ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                              : 'border-blue-300 bg-white text-slate-800')
                                    )}
                                  />
                                  <div className={cn('shrink-0', isItemExpired && 'pointer-events-none opacity-75')}>
                                    <MilitaryTimeInput
                                      value={getTimePart(item.startDate)}
                                      onChange={t => {
                                        if (isItemExpired) return;
                                        let d = getDatePart(item.startDate);
                                        if (!d && t) {
                                          d = getCurrentDatetimeLocal().split('T')[0];
                                        }
                                        const newVal = d ? `${d}T${t || '00:00'}` : '';
                                        updateGateStartDate(newVal);
                                      }}
                                      className={cn(
                                        'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                        isItemExpired
                                          ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                          : hasStartOverlap
                                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                            : hasMissingStart
                                              ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-bold'
                                              : hasStartGap
                                                ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                                : 'border-blue-300 bg-white text-slate-800'
                                      )}
                                      placeholder="hh:mm AM"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <label
                                  className={cn(
                                    'text-xs font-black uppercase tracking-wider w-9 shrink-0 select-none',
                                    hasEndOverlap
                                      ? 'text-red-700 font-black'
                                      : hasEndGap
                                        ? 'text-amber-700 font-black'
                                        : isItemExpired
                                          ? 'text-slate-600'
                                          : 'text-blue-950'
                                  )}
                                >
                                  End
                                </label>
                                <div className="flex items-center gap-px">
                                  <input
                                    type="date"
                                    disabled={isItemExpired}
                                    value={getDatePart(item.endDate)}
                                    onChange={e => {
                                      const d = e.target.value;
                                      if (!d) {
                                        updateGateEndDate(undefined);
                                        return;
                                      }
                                      const t = getTimePart(item.endDate) || '23:59';
                                      updateGateEndDate(`${d}T${t}`);
                                    }}
                                    className={cn(
                                      'w-[110px] p-0.5 border-0 border-b rounded-none text-xs font-bold font-sans tabular-nums outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                      isItemExpired
                                        ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed [&::-webkit-calendar-picker-indicator]:hidden'
                                        : '[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0',
                                      !isItemExpired &&
                                        (hasEndOverlap
                                          ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                          : hasEndGap
                                            ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                            : 'border-blue-300 bg-white text-slate-800')
                                    )}
                                  />
                                  <div className={cn('shrink-0', isItemExpired && 'pointer-events-none opacity-75')}>
                                    <MilitaryTimeInput
                                      value={getTimePart(item.endDate)}
                                      onChange={t => {
                                        if (isItemExpired) return;
                                        let d = getDatePart(item.endDate);
                                        if (!d && t) {
                                          d = getDatePart(item.startDate) || getCurrentDatetimeLocal().split('T')[0];
                                        }
                                        const newVal = d ? `${d}T${t || '23:59'}` : undefined;
                                        updateGateEndDate(newVal);
                                      }}
                                      className={cn(
                                        'p-0.5 border-0 border-b rounded-none text-xs font-bold outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-600 h-6.5',
                                        isItemExpired
                                          ? 'border-slate-300 bg-slate-100 text-slate-600 cursor-not-allowed'
                                          : hasEndOverlap
                                            ? 'border-red-500 bg-red-50 text-red-900 font-bold'
                                            : hasEndGap
                                              ? 'border-amber-400 bg-amber-50/40 text-amber-900 font-bold'
                                              : 'border-blue-300 bg-white text-slate-800'
                                      )}
                                      placeholder="hh:mm AM"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Context-Aware Gate Lifecycle Actions */}
                            <div className="flex items-center gap-1.5 shrink-0 self-end @[490px]:self-center">
                              {isItemExpired ? (
                                <>
                                  {gatePlayCount > 0 && (
                                    <span
                                      className="text-[10px] font-sans font-bold tabular-nums px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300 select-none"
                                      title={formatSlotAssessmentTooltip(gateAssessment.gateScore, {
                                        scopeTitle: `Gate #${idx + 1} Assessment (Protected History)`,
                                      })}
                                    >
                                      Protected ({gatePlayCount} {gatePlayCount === 1 ? 'play' : 'plays'})
                                    </span>
                                  )}
                                  {canReactivateGate && (
                                    <button
                                      type="button"
                                      onClick={() => handleReactivateGateClick(item)}
                                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                      title="Restore this inactivated gate to active status with its original End date"
                                    >
                                      <CheckCircle className="w-3 h-3" />
                                      Reactivate
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleReuseGate(item)}
                                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                    title="Clone this gate's media items into a new gate and choose its Start and End schedule"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    Reuse
                                  </button>
                                  {gatePlayCount === 0 && (
                                    <button
                                      type="button"
                                      onClick={promptDeleteGate}
                                      className="px-2 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                      title="Delete this unused gate (0 logged plays)"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500" />
                                      Delete
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleInactivateGate(item)}
                                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                    title="Inactivate this gate without losing its original End date (moves to Past / Inactivated Gates)"
                                  >
                                    <Archive className="w-3 h-3 text-amber-700" />
                                    Inactivate
                                  </button>
                                  {gatePlayCount === 0 && (
                                    <button
                                      type="button"
                                      onClick={promptDeleteGate}
                                      className="px-2 py-0.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                      title="Delete this unused gate (0 logged plays)"
                                    >
                                      <Trash2 className="w-3 h-3 text-red-500" />
                                      Delete
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {isPendingArchiveOnSave && (
                          <div className="px-2.5 py-1 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>
                              End date ({formatDatetime12(formatToDatetimeLocal(item.endDate!))}) is in the past — this gate will move to Past / Inactivated Gates when saved.
                            </span>
                          </div>
                        )}

                        <div
                          className={cn(
                            'px-2.5 py-0.5 text-[11px] font-bold text-slate-600 border-b border-slate-200 select-none flex items-center justify-between',
                            idx % 2 === 0 ? 'bg-slate-50' : 'bg-slate-100'
                          )}
                        >
                          <span>Media (Multiple files will be auto rotated)</span>
                          {isItemExpired && (
                            <span className="text-[10px] font-semibold text-slate-500 italic">
                              Read-only — click Reuse to schedule a new gate with this media
                            </span>
                          )}
                        </div>

                        <div className="p-2 space-y-1.5">
                          <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-2xs">
                            {(gateMediaItems.length > 0
                              ? gateMediaItems
                              : [{ mp3Url: '' } as TimeGatedMediaItem]
                            ).map((mItem, mIdx) => {
                              const hasMissingItemFile = !mItem.mp3Url || mItem.mp3Url.trim() === '';
                              const url = (mItem.mp3Url || '').toLowerCase();
                              const isItemAudio = isAudioFile(url);
                              const isItemScriptExt = isScriptFile(url);
                              const totalInGate = gateMediaItems.length;
                              const itemTrackAudit =
                                gateAssessment.itemAudits[mIdx] ||
                                calculateGatedTrackAudit(
                                  formData.id || '',
                                  mItem.mp3Url || '',
                                  logs,
                                  {
                                    gate: item,
                                    announcement: formData,
                                    itemIndex: mIdx,
                                  }
                                );

                              return (
                                <div
                                  key={`${item.id}-${mIdx}`}
                                  className={cn(
                                    'px-2 py-1.5 space-y-1 border-l-4 transition-colors',
                                    mIdx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                                    hasMissingItemFile
                                      ? 'border-l-amber-500 bg-amber-50/30'
                                      : isItemAudio
                                        ? 'border-l-purple-500'
                                        : 'border-l-blue-500'
                                  )}
                                >
                                  <div className="@container flex items-center justify-between gap-1.5 flex-nowrap min-w-0">
                                    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                                      {!isItemExpired && totalInGate > 1 && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                          <button
                                            type="button"
                                            disabled={mIdx === 0}
                                            onClick={() => {
                                              const nextItems = [...gateMediaItems];
                                              const tmp = nextItems[mIdx - 1];
                                              nextItems[mIdx - 1] = nextItems[mIdx];
                                              nextItems[mIdx] = tmp;
                                              const updated = currentMp3s.map(m =>
                                                m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                              );
                                              setFormData({ ...formData, timeGatedMp3s: updated });
                                            }}
                                            className="p-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                            title="Move file earlier in rotation"
                                          >
                                            <ChevronUp className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={mIdx === totalInGate - 1}
                                            onClick={() => {
                                              const nextItems = [...gateMediaItems];
                                              const tmp = nextItems[mIdx + 1];
                                              nextItems[mIdx + 1] = nextItems[mIdx];
                                              nextItems[mIdx] = tmp;
                                              const updated = currentMp3s.map(m =>
                                                m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                              );
                                              setFormData({ ...formData, timeGatedMp3s: updated });
                                            }}
                                            className="p-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                                            title="Move file later in rotation"
                                          >
                                            <ChevronDown className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                      <span
                                        className={cn(
                                          'text-xs font-sans font-bold truncate min-w-0',
                                          hasMissingItemFile ? 'text-amber-900 font-semibold' : 'text-slate-800'
                                        )}
                                        title={
                                          mItem.mp3Url ? getFilenameFromUrlOrPath(mItem.mp3Url) : 'No file selected'
                                        }
                                      >
                                        {totalInGate > 1 ? `(${mIdx + 1}/${totalInGate}) ` : ''}
                                        {mItem.mp3Url ? (
                                          getFilenameFromUrlOrPath(mItem.mp3Url)
                                        ) : (
                                          <span className="italic text-amber-700 font-sans font-bold">
                                            No file selected (Required)
                                          </span>
                                        )}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {(() => {
                                        if (itemTrackAudit.totalPlays === 0) return null;
                                        const firstUsedFormatted = itemTrackAudit.firstUsedAt
                                          ? formatDatetime12(formatToDatetimeLocal(itemTrackAudit.firstUsedAt))
                                          : '—';
                                        const lastUsedFormatted = itemTrackAudit.lastUsedAt
                                          ? formatDatetime12(formatToDatetimeLocal(itemTrackAudit.lastUsedAt))
                                          : '—';
                                        const trackFileName = mItem.mp3Url
                                          ? getFilenameFromUrlOrPath(mItem.mp3Url)
                                          : 'Track';
                                        return (
                                          <span
                                            className="text-[10px] font-sans font-bold tabular-nums bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded select-none shrink-0"
                                            title={formatSlotAssessmentTooltip(itemTrackAudit, {
                                              scopeTitle: `${trackFileName} (Gate #${idx + 1})`,
                                              firstUsedFormatted,
                                              lastUsedFormatted,
                                            })}
                                          >
                                            {itemTrackAudit.totalPlays}{' '}
                                            {itemTrackAudit.totalPlays === 1 ? 'play' : 'plays'}
                                          </span>
                                        );
                                      })()}

                                      {(() => {
                                        if (isItemAudio) {
                                          const filename = mItem.mp3Url ? getFilenameFromUrlOrPath(mItem.mp3Url) : '';
                                          const dispDur =
                                            mItem.duration ||
                                            pickerDurations[filename] ||
                                            (filename ? availableFilesCache.get(filename)?.duration : '') ||
                                            '';
                                          return (
                                            <span
                                              className={cn(
                                                'w-[64px] h-6 px-1.5 py-0.5 rounded border text-xs font-sans font-bold tabular-nums text-center inline-flex items-center justify-center select-none shrink-0',
                                                dispDur
                                                  ? 'text-slate-700 bg-slate-100 border-slate-300'
                                                  : 'text-slate-400 bg-slate-50 border-slate-200'
                                              )}
                                            >
                                              {dispDur || '--:--'}
                                            </span>
                                          );
                                        } else {
                                          const rawReadVal = (mItem.approximateReadTime || '').replace(/^~\s*/, '');
                                          const displayReadVal = /^\d+\s*min\s*\d+\s*sec$/i.test(rawReadVal.trim())
                                            ? normalizeReadTimeDisplay(rawReadVal)
                                            : rawReadVal;
                                          return (
                                            <div className="flex items-center gap-0.5 shrink-0">
                                              <input
                                                type="text"
                                                disabled={isItemExpired}
                                                placeholder="0m30s"
                                                value={displayReadVal}
                                                onChange={e => {
                                                  if (isItemExpired) return;
                                                  const val = e.target.value;
                                                  const nextApprox = val
                                                    ? val.startsWith('~')
                                                      ? val
                                                      : `~${val}`
                                                    : undefined;
                                                  const updated = currentMp3s.map(m =>
                                                    m.id === item.id
                                                      ? {
                                                          ...m,
                                                          mediaItems: getGateMediaItems(m).map((mi, iIdx) =>
                                                            iIdx === mIdx
                                                              ? { ...mi, approximateReadTime: nextApprox }
                                                              : mi
                                                          ),
                                                        }
                                                      : m
                                                  );
                                                  setFormData({
                                                    ...formData,
                                                    timeGatedMp3s: updated,
                                                  });
                                                }}
                                                onBlur={e => {
                                                  if (isItemExpired) return;
                                                  const val = e.target.value.trim();
                                                  const normalized = val ? normalizeReadTimeDisplay(val) : '';
                                                  const nextApprox = normalized
                                                    ? normalized.startsWith('~')
                                                      ? normalized
                                                      : `~${normalized}`
                                                    : undefined;
                                                  const updated = currentMp3s.map(m =>
                                                    m.id === item.id
                                                      ? {
                                                          ...m,
                                                          mediaItems: getGateMediaItems(m).map((mi, iIdx) =>
                                                            iIdx === mIdx
                                                              ? { ...mi, approximateReadTime: nextApprox }
                                                              : mi
                                                          ),
                                                        }
                                                      : m
                                                  );
                                                  setFormData({
                                                    ...formData,
                                                    timeGatedMp3s: updated,
                                                  });
                                                }}
                                                className={cn(
                                                  'w-[64px] h-6 px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-xs font-sans font-bold tabular-nums text-slate-700 text-center outline-none shrink-0',
                                                  isItemExpired
                                                    ? 'cursor-not-allowed opacity-75'
                                                    : 'focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                                                )}
                                                title="Approximate Read Time (0m30s, 0:30, or 30s)"
                                              />
                                            </div>
                                          );
                                        }
                                      })()}

                                      <div className="flex items-center gap-0 shrink-0">
                                        {mItem.mp3Url &&
                                          (isItemAudio ? (
                                            <button
                                              type="button"
                                              onClick={() => togglePreview(mItem.mp3Url)}
                                              className={cn(
                                                'flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 min-w-[26px]',
                                                isItemExpired
                                                  ? 'rounded'
                                                  : 'rounded-l rounded-r-none border-r-0',
                                                previewUrl === mItem.mp3Url
                                                  ? 'bg-slate-900 text-white border-slate-900'
                                                  : 'bg-white text-blue-600 border-slate-300 hover:bg-slate-50'
                                              )}
                                              title={previewUrl === mItem.mp3Url ? 'Stop preview' : 'Preview audio'}
                                            >
                                              {previewUrl === mItem.mp3Url ? (
                                                <Square className="w-3.5 h-3.5 fill-current" />
                                              ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                              )}
                                              <span className="mp3-btn-text">
                                                {previewUrl === mItem.mp3Url ? 'Stop' : 'Preview'}
                                              </span>
                                            </button>
                                          ) : (
                                            <>
                                              {!isItemExpired && /\.(txt|md)$/i.test(mItem.mp3Url) && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setCopyEditorState({
                                                      isOpen: true,
                                                      initialFileName: getFilenameFromUrlOrPath(mItem.mp3Url),
                                                      initialReadTime: mItem.approximateReadTime,
                                                      targetGateId: item.id,
                                                      targetGateIndex: idx,
                                                      targetItemIndex: mIdx,
                                                      targetAnnouncementId: editingId || formData.id || null,
                                                      fromPicker: false,
                                                    });
                                                  }}
                                                  className="flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 rounded-l rounded-r-none border-r-0 min-w-[26px] bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                                  title="Edit .txt copy"
                                                >
                                                  <Edit3 className="w-3.5 h-3.5" />
                                                  <span className="mp3-btn-text">Edit</span>
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPreviewScriptBackupUrl(mItem.backupMp3Url);
                                                  setPreviewScriptOrigin({
                                                    announcementId: editingId || formData.id || null,
                                                    gateId: item.id,
                                                    gateIndex: idx,
                                                    itemIndex: mIdx,
                                                    fromPicker: false,
                                                  });
                                                  setPreviewScriptFromPicker(false);
                                                  setPreviewScriptFile(mItem.mp3Url);
                                                }}
                                                className={cn(
                                                  'flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 min-w-[26px] bg-white text-blue-600 border-slate-300 hover:bg-slate-50',
                                                  isItemExpired
                                                    ? 'rounded'
                                                    : /\.(txt|md)$/i.test(mItem.mp3Url)
                                                      ? 'rounded-none border-r-0'
                                                      : 'rounded-l rounded-r-none border-r-0'
                                                )}
                                                title="Preview file"
                                              >
                                                <Eye className="w-3.5 h-3.5 fill-none" />
                                                <span className="mp3-btn-text">Preview</span>
                                              </button>
                                            </>
                                          ))}

                                        {!isItemExpired && !mItem.mp3Url && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCopyEditorState({
                                                isOpen: true,
                                                initialFileName: undefined,
                                                sourceFileToCopy: undefined,
                                                initialReadTime: mItem.approximateReadTime,
                                                targetGateId: item.id,
                                                targetGateIndex: idx,
                                                targetItemIndex: mIdx,
                                                targetAnnouncementId: editingId || formData.id || null,
                                                fromPicker: false,
                                              });
                                            }}
                                            className="px-1.5 py-px text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none border min-w-[26px] bg-blue-600 hover:bg-blue-700 text-white border-blue-700 rounded-l rounded-r-none border-r-0"
                                            title="Create new .txt live read"
                                          >
                                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                            <span className="mp3-btn-text">Create Live Read</span>
                                          </button>
                                        )}

                                        {!isItemExpired &&
                                          (() => {
                                            const hasAttachedFile = Boolean(mItem.mp3Url && mItem.mp3Url.trim());
                                            const canDeleteThisRow =
                                              itemTrackAudit.totalPlays === 0 &&
                                              (totalInGate > 1 || hasAttachedFile);
                                            const showRowInactivate = itemTrackAudit.totalPlays > 0;
                                            const hasTrailingActionButton = canDeleteThisRow || showRowInactivate;

                                            return (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setPickerTarget('timeGated');
                                                    setPickerMp3Id(item.id);
                                                    setPickerItemIndex(mIdx);
                                                    setIsPickerOpen(true);
                                                  }}
                                                  className={cn(
                                                    'px-1.5 py-px text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none border min-w-[26px]',
                                                    hasMissingItemFile
                                                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
                                                      : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900',
                                                    hasTrailingActionButton
                                                      ? hasMissingItemFile
                                                        ? 'rounded-none border-r-amber-700'
                                                        : 'rounded-none border-r-slate-700'
                                                      : 'rounded-r rounded-l-none'
                                                  )}
                                                  title="Choose file"
                                                >
                                                  <FolderOpen className="w-3.5 h-3.5" />
                                                  <span className="mp3-btn-text">Choose</span>
                                                </button>

                                                {showRowInactivate && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleInactivateGate(item)}
                                                    className="px-1.5 py-px bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-r rounded-l-none text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none min-w-[26px]"
                                                    title="Inactivate this gate now and move it to Past / Inactivated Gates (preserves broadcast history)"
                                                  >
                                                    <Archive className="w-3.5 h-3.5 text-amber-700" />
                                                    <span className="mp3-btn-text">Inactivate</span>
                                                  </button>
                                                )}

                                                {canDeleteThisRow && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const fileNameLabel = mItem.mp3Url
                                                        ? getFilenameFromUrlOrPath(mItem.mp3Url)
                                                        : 'this empty media slot';
                                                      setGateDeleteConfirmState({
                                                        title:
                                                          totalInGate > 1
                                                            ? `Remove Media Row (${mIdx + 1}/${totalInGate})`
                                                            : `Clear Media Slot in Gate #${idx + 1}`,
                                                        message:
                                                          totalInGate > 1
                                                            ? `Are you sure you want to remove "${fileNameLabel}" from Gate #${idx + 1}'s rotation?`
                                                            : `Are you sure you want to remove "${fileNameLabel}" from Gate #${idx + 1}? Gate #${idx + 1} will remain in the schedule with an empty media slot.`,
                                                        confirmLabel: totalInGate > 1 ? 'Remove File' : 'Clear Media',
                                                        onConfirm: () => {
                                                          if (totalInGate > 1) {
                                                            const nextItems = gateMediaItems.filter(
                                                              (_, iIdx) => iIdx !== mIdx
                                                            );
                                                            const updated = currentMp3s.map(m =>
                                                              m.id === item.id ? { ...m, mediaItems: nextItems } : m
                                                            );
                                                            setFormData({
                                                              ...formData,
                                                              timeGatedMp3s: updated,
                                                            });
                                                          } else {
                                                            const updated = currentMp3s.map(m =>
                                                              m.id === item.id
                                                                ? { ...m, mediaItems: [{ mp3Url: '' }] }
                                                                : m
                                                            );
                                                            setFormData({
                                                              ...formData,
                                                              timeGatedMp3s: updated,
                                                            });
                                                          }
                                                          setGateDeleteConfirmState(null);
                                                        },
                                                      });
                                                    }}
                                                    className="px-1.5 py-px bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-r rounded-l-none text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none min-w-[26px]"
                                                    title={
                                                      totalInGate > 1
                                                        ? 'Remove this unplayed file from rotation'
                                                        : 'Clear this unplayed file from the gate (keeps gate intact)'
                                                    }
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                    <span className="mp3-btn-text">Delete</span>
                                                  </button>
                                                )}
                                              </>
                                            );
                                          })()}
                                      </div>
                                    </div>
                                  </div>

                                  {(() => {
                                    const filename = mItem.mp3Url ? getFilenameFromUrlOrPath(mItem.mp3Url) : '';
                                    const meta = filename ? metadataCache[filename] : undefined;
                                    const hasMeta = meta && (meta.title || meta.artist || meta.album);

                                    if (!hasMeta) return null;

                                    return (
                                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs pt-0.5">
                                        <div className="text-slate-600 font-bold italic select-none truncate">
                                          Metadata:{' '}
                                          <span className="text-slate-800 font-semibold">
                                            {[meta.title, meta.artist, meta.album].filter(Boolean).join(', ')}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {(() => {
                                    const showBackup = (mItem.assetType === 'script' && !isItemAudio) || isItemScriptExt;
                                    if (!showBackup) return null;

                                    return (
                                      <div className="@container flex items-center justify-between gap-1.5 flex-nowrap pt-0.5 min-w-0">
                                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                                          <span
                                            className="text-xs font-sans font-bold text-slate-800 truncate min-w-0"
                                            title={
                                              mItem.backupMp3Url
                                                ? getFilenameFromUrlOrPath(mItem.backupMp3Url)
                                                : 'No backup audio selected'
                                            }
                                          >
                                            <span className="font-black text-slate-700 select-none">Backup: </span>
                                            {mItem.backupMp3Url ? (
                                              getFilenameFromUrlOrPath(mItem.backupMp3Url)
                                            ) : (
                                              <span className="italic text-slate-400 font-sans font-normal">
                                                No backup audio selected (optional)
                                              </span>
                                            )}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {(() => {
                                            if (mItem.backupMp3Url) {
                                              const bFilename = getFilenameFromUrlOrPath(mItem.backupMp3Url);
                                              const bDur =
                                                pickerDurations[bFilename] ||
                                                (bFilename ? availableFilesCache.get(bFilename)?.duration : '') ||
                                                '';
                                              return (
                                                <span
                                                  className={cn(
                                                    'w-[64px] h-6 px-1.5 py-0.5 rounded border text-xs font-sans font-bold tabular-nums text-center inline-flex items-center justify-center select-none shrink-0',
                                                    bDur
                                                      ? 'text-slate-700 bg-slate-100 border-slate-300'
                                                      : 'text-slate-400 bg-slate-50 border-slate-200'
                                                  )}
                                                >
                                                  {bDur || '--:--'}
                                                </span>
                                              );
                                            }
                                            return null;
                                          })()}

                                          <div className="flex items-center gap-0 shrink-0">
                                            {mItem.backupMp3Url && (
                                              <button
                                                type="button"
                                                onClick={() => togglePreview(mItem.backupMp3Url!)}
                                                className={cn(
                                                  'flex items-center justify-center gap-0.5 text-[11px] font-black uppercase px-1.5 py-px border shadow-xs transition-all cursor-pointer select-none h-6 min-w-[26px]',
                                                  isItemExpired
                                                    ? 'rounded'
                                                    : 'rounded-l rounded-r-none border-r-0',
                                                  previewUrl === mItem.backupMp3Url
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-white text-blue-600 border-slate-300 hover:bg-slate-50'
                                                )}
                                                title={
                                                  previewUrl === mItem.backupMp3Url
                                                    ? 'Stop preview'
                                                    : 'Preview backup audio'
                                                }
                                              >
                                                {previewUrl === mItem.backupMp3Url ? (
                                                  <Square className="w-3.5 h-3.5 fill-current" />
                                                ) : (
                                                  <Play className="w-3.5 h-3.5 fill-current" />
                                                )}
                                                <span className="mp3-btn-text">
                                                  {previewUrl === mItem.backupMp3Url ? 'Stop' : 'Preview'}
                                                </span>
                                              </button>
                                            )}

                                            {!isItemExpired && (
                                              <>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setPickerTarget('backup');
                                                    setPickerMp3Id(item.id);
                                                    setPickerItemIndex(mIdx);
                                                    setSearchQuery('');
                                                    setIsPickerOpen(true);
                                                  }}
                                                  className={cn(
                                                    'px-1.5 py-px bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none border border-slate-900 min-w-[26px]',
                                                    mItem.backupMp3Url
                                                      ? 'rounded-none border-r-slate-700'
                                                      : 'rounded-r rounded-l'
                                                  )}
                                                  title="Choose backup audio file from disk"
                                                >
                                                  <FolderOpen className="w-3.5 h-3.5" />
                                                  <span className="mp3-btn-text">Choose</span>
                                                </button>

                                                {mItem.backupMp3Url && (
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      const backupName = getFilenameFromUrlOrPath(mItem.backupMp3Url!);
                                                      setGateDeleteConfirmState({
                                                        title: `Remove Backup Audio`,
                                                        message: `Are you sure you want to remove backup audio "${backupName}" from Gate #${idx + 1}?`,
                                                        confirmLabel: 'Remove Backup',
                                                        onConfirm: () => {
                                                          const updated = currentMp3s.map(m =>
                                                            m.id === item.id
                                                              ? {
                                                                  ...m,
                                                                  mediaItems: getGateMediaItems(m).map((mi, iIdx) =>
                                                                    iIdx === mIdx ? { ...mi, backupMp3Url: undefined } : mi
                                                                  ),
                                                                }
                                                              : m
                                                          );
                                                          setFormData({
                                                            ...formData,
                                                            timeGatedMp3s: updated,
                                                          });
                                                          setGateDeleteConfirmState(null);
                                                        },
                                                      });
                                                    }}
                                                    className="px-1.5 py-px bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 rounded-r rounded-l-none text-[11px] font-black uppercase flex items-center justify-center gap-0.5 transition-all shadow-xs cursor-pointer h-6 select-none min-w-[26px]"
                                                    title="Delete backup audio"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                    <span className="mp3-btn-text">Delete</span>
                                                  </button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>

                          {!isItemExpired && (
                            <div className="pt-0.5 flex items-center justify-start">
                              <button
                                type="button"
                                onClick={() => {
                                  setPickerTarget('addGateFile');
                                  setPickerMp3Id(item.id);
                                  setPickerItemIndex(null);
                                  setSearchQuery('');
                                  setIsPickerOpen(true);
                                }}
                                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-2xs select-none"
                                title="Add another file to auto-rotate in this time gate"
                              >
                                <Plus className="w-3 h-3 stroke-[3]" />
                                Add File
                              </button>
                            </div>
                          )}

                          {(() => {
                            const bottomWarnings = itemWarnings;

                            if (itemErrors.length === 0 && bottomWarnings.length === 0) return null;

                            return (
                              <div className="space-y-0.5 pt-0.5 border-t border-slate-100">
                                {itemErrors.map((err, errIdx) => (
                                  <div
                                    key={errIdx}
                                    className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                                    <span>{err}</span>
                                  </div>
                                ))}
                                {bottomWarnings.map((warn, warnIdx) => (
                                  <div
                                    key={warnIdx}
                                    className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                                    <span>{warn}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <>
                      {activeIndexedGates.length > 0 ? (
                        activeIndexedGates.map(({ item, idx }) => renderGateCard(item, idx, false))
                      ) : (
                        <div className="p-2.5 bg-amber-50/70 text-xs font-bold text-amber-800 flex items-center justify-between gap-2">
                          <span>
                            No active or upcoming gates scheduled. Expand Past / Archived Gates below to reuse a prior gate, or click &apos;Add Announcement&apos;.
                          </span>
                        </div>
                      )}

                      <div className="p-1.5 bg-slate-50 flex justify-start">
                        <button
                          type="button"
                          onClick={handleAddMp3}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs select-none"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          Add Announcement
                        </button>
                      </div>

                       {archivedIndexedGates.length > 0 && (
                        <div className="border-t border-slate-300 bg-slate-100/80">
                          <button
                            type="button"
                            onClick={() => setShowArchivedGates(prev => !prev)}
                            className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer select-none"
                          >
                            <span className="flex items-center gap-1.5">
                              {showArchivedGates ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <Archive className="w-3.5 h-3.5 text-slate-500" />
                              <span>Past / Inactivated Gates ({archivedIndexedGates.length})</span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                              {showArchivedGates
                                ? 'Hide past & inactivated gates'
                                : 'Show past & inactivated gates (Reactivate / Reuse)'}
                            </span>
                          </button>

                          {showArchivedGates && (
                            <div className="divide-y divide-slate-300 border-t border-slate-300">
                              {archivedIndexedGates.map(({ item, idx }) => renderGateCard(item, idx, true))}
                            </div>
                          )}
                        </div>
                      )}

                      {gateDeleteConfirmState && (
                        <div
                          className="fixed inset-0 z-[175] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setGateDeleteConfirmState(null)}
                        >
                          <div
                            className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-3.5 px-4 bg-red-50 border-b border-red-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-red-600 p-1.5 rounded text-white shrink-0">
                                  <Trash2 className="w-4 h-4" />
                                </div>
                                <h4 className="text-xs font-black text-red-950 uppercase tracking-widest leading-none truncate">
                                  {gateDeleteConfirmState.title}
                                </h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => setGateDeleteConfirmState(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Cancel"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                            <div className="p-4 text-xs font-bold text-slate-700 leading-relaxed">
                              {gateDeleteConfirmState.message}
                            </div>
                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setGateDeleteConfirmState(null)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={gateDeleteConfirmState.onConfirm}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border border-red-700 rounded text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {gateDeleteConfirmState.confirmLabel || 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {reactivatePromptState && (
                        <div
                          className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-slate-950/60"
                          onClick={() => setReactivatePromptState(null)}
                        >
                          <div
                            className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-3.5 px-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="bg-amber-600 p-1.5 rounded text-white shrink-0">
                                  <AlertCircle className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                                    Reactivate Inactivated Gate
                                  </h4>
                                  <p className="text-xs font-bold text-slate-500 truncate mt-1">
                                    {reactivatePromptState.missedCount} scheduled{' '}
                                    {reactivatePromptState.missedCount === 1 ? 'slot was' : 'slots were'} missed while
                                    inactivated
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReactivatePromptState(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Cancel"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="p-4 space-y-3 text-xs text-slate-700 leading-relaxed">
                              <p className="font-bold text-slate-800">
                                While this gate was inactivated,{' '}
                                <span className="text-amber-700 font-black">
                                  {reactivatePromptState.missedCount} scheduled{' '}
                                  {reactivatePromptState.missedCount === 1 ? 'occurrence' : 'occurrences'}
                                </span>{' '}
                                passed without playing. How would you like to reactivate it?
                              </p>

                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => applyReactivateInPlace(reactivatePromptState.gate)}
                                  className="w-full text-left p-2.5 rounded-lg border border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 transition-colors cursor-pointer space-y-0.5"
                                >
                                  <div className="font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                                    <span>1. Reactivate With Gaps</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                      Keep Single Gate
                                    </span>
                                  </div>
                                  <p className="text-slate-600 font-medium">
                                    Restores the gate in-place across its original Start and End dates. The{' '}
                                    {reactivatePromptState.missedCount} missed{' '}
                                    {reactivatePromptState.missedCount === 1 ? 'slot' : 'slots'} during the inactivated
                                    window will appear as unplayed gaps.
                                  </p>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => applyReactivateSplitToNewGate(reactivatePromptState.gate)}
                                  className="w-full text-left p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/30 hover:border-emerald-500 hover:bg-emerald-50/70 transition-colors cursor-pointer space-y-0.5"
                                >
                                  <div className="font-black text-emerald-950 uppercase tracking-wider flex items-center justify-between">
                                    <span>2. Split to New Gate</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                                      Clean History
                                    </span>
                                  </div>
                                  <p className="text-slate-600 font-medium">
                                    Closes the historical gate at the time it was inactivated and creates a new active
                                    gate from now until the original End date.
                                  </p>
                                </button>
                              </div>
                            </div>

                            <div className="p-3 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => setReactivatePromptState(null)}
                                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-bold uppercase cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right Column: Date/Advanced Rules */}
          <div className="space-y-4 w-full max-w-[650px] min-[1500px]:sticky min-[1500px]:top-0 min-[1500px]:self-start">
            {formData.type === AnnouncementType.ONE_TIME && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-4">
                <h4 className="text-xs font-black text-purple-700 uppercase tracking-widest">Static Play Logic</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-400 uppercase">Target Date</label>
                    <input
                      type="date"
                      value={formData.date || ''}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                      className={cn(
                        'w-full px-2 py-1.5 border rounded text-xs font-bold text-slate-850 outline-none [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer',
                        !formData.date && editingId ? 'border-red-300 bg-red-50' : 'border-purple-200'
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-purple-400 uppercase">Target Hour</label>
                    <select
                      value={formData.time || ''}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                      className={cn(
                        'w-full px-2 py-1.5 border rounded text-xs outline-none bg-white font-bold',
                        !formData.time && editingId ? 'border-red-300 bg-red-50' : 'border-purple-200'
                      )}
                    >
                      <option value="">Select Hour</option>
                      {Array.from({ length: 24 }).map((_, i) => {
                        const val = i.toString().padStart(2, '0');
                        return (
                          <option key={val} value={val}>
                            {formatHour12(i, false)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {formData.type === AnnouncementType.ADVANCED && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">Weekly Announcement</h4>
                  <div className="flex gap-2 text-xs font-black uppercase text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400 stroke-[3.5] grid-weekly-check-icon" />{' '}
                      Active
                    </span>
                    <span className="flex items-center gap-1.5">
                      <X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" />{' '}
                      Inactive
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-blue-200/80 dark:border-slate-700/60 rounded-lg bg-white dark:bg-slate-900 shadow-xs grid-weekly-table-container">
                  <table className="w-full border-collapse table-fixed grid-weekly-table">
                    <thead>
                      <tr className="bg-blue-50/60 dark:bg-slate-800/60 border-b border-blue-200/80 dark:border-slate-700/60">
                        <th className="p-1 w-20 text-center border-r border-blue-200/80 dark:border-slate-700/60">
                          <button
                            onClick={() => {
                              const currentRules = formData.gridRules || [];
                              const allKeys = Array.from({ length: 7 }, (_, d) =>
                                Array.from({ length: 24 }, (_, h) => `${d}-${h}`)
                              ).flat();

                              if (currentRules.length === allKeys.length) {
                                setFormData({ ...formData, gridRules: [] });
                              } else {
                                setFormData({ ...formData, gridRules: allKeys });
                              }
                            }}
                            className="px-1.5 py-0.5 rounded bg-blue-600 text-xs font-black text-white hover:bg-blue-700 transition-colors uppercase cursor-pointer"
                          >
                            All
                          </button>
                        </th>
                        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, i) => (
                          <th
                            key={i}
                            onClick={() => toggleColumn(i)}
                            className="p-1 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase text-center border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0"
                          >
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 24 }).map((_, h) => (
                        <tr key={h} className="hover:bg-blue-100/30 dark:hover:bg-slate-800/40 transition-colors">
                          <td
                            onClick={() => toggleRow(h)}
                            className="p-0 text-xs font-black text-slate-500 dark:text-slate-400 pr-1.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-r border-b border-blue-200/80 dark:border-slate-700/60 text-right leading-none h-4 font-sans tabular-nums select-none"
                          >
                            {formatHour12(h, false)}
                          </td>
                          {Array.from({ length: 7 }).map((_, d) => {
                            const active = formData.gridRules?.includes(`${d}-${h}`);
                            return (
                              <td
                                key={d}
                                className="p-0 border-b border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0"
                              >
                                <button
                                  onClick={() => toggleGridCell(d, h)}
                                  className={cn(
                                    'w-full h-4 flex items-center justify-center transition-all cursor-pointer',
                                    active
                                      ? 'grid-weekly-cell-active bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-800 dark:hover:bg-emerald-700 shadow-xs'
                                      : 'grid-weekly-cell-inactive bg-slate-100 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50'
                                  )}
                                >
                                  {active ? (
                                    <Check className="w-3 h-3 text-white stroke-[3.5] grid-weekly-check-icon" />
                                  ) : (
                                    <X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-400 italic font-medium pt-2 border-t border-blue-100/50">
                  * Headers are clickable to toggle entire columns or rows.
                </p>
              </div>
            )}

            {formData.type === AnnouncementType.BASIC_HOURLY && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center space-y-2 min-h-[100px]">
                <div className="flex flex-col items-center justify-center opacity-80">
                  <Clock className="w-6 h-6 text-blue-500 mb-1" />
                  <p className="text-xs text-blue-700 font-medium">
                    Auto-repeat hourly trigger enabled at minute :
                    {formData.minute?.toString().padStart(2, '0') || '00'}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="p-4 py-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-4 z-10">
        <button
          type="button"
          disabled={isSavingAnnouncement}
          onClick={() => setDeleteConfirmId(editingId!)}
          className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded text-xs font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-red-50 bg-white disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
          Delete
        </button>

        {formData.metadata && (
          <div className="text-xs font-sans tabular-nums text-slate-400 text-center leading-tight">
            <div>Created {formatMetadataDate(formData.metadata.createdDate)}</div>
            <div>Modified {formatMetadataDate(formData.metadata.lastModifiedDate)}</div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isSavingAnnouncement}
            onClick={handleCancelEdit}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </button>

          <button
            type="button"
            onClick={() => saveEdit()}
            disabled={!isFormValid || isSavingAnnouncement}
            className={cn(
              'flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-blue-100 cursor-pointer hover:bg-blue-700',
              (!isFormValid || isSavingAnnouncement) &&
                'opacity-50 cursor-not-allowed hover:bg-blue-600 shadow-none'
            )}
          >
            {isSavingAnnouncement ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5" />
            )}
            <span>{isSavingAnnouncement ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
