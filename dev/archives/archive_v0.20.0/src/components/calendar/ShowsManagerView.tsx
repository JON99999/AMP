import React from 'react';
import { BookOpen, Trash2, RefreshCw, Save, AlertCircle, Clock, FileText, FolderOpen } from 'lucide-react';
import { Show } from '../../types';
import { cn, getSortedShows, getShowShade, formatTime12 } from '../../lib/utils';
import { cleanNameShort, ShowConflict, ShowGap } from './calendarHelpers';

export interface ShowEditorFormProps {
  editingShowId: string;
  shows: Show[];
  showFormData: Partial<Show>;
  setShowFormData: React.Dispatch<React.SetStateAction<Partial<Show>>>;
  isNameShortManuallyEdited: boolean;
  setIsNameShortManuallyEdited: (val: boolean) => void;
  setEditingShowId: (val: string | null) => void;
  isSavingShow: boolean;
  handleSaveShow: (e: React.FormEvent) => void;
  handleDeleteShow: (id: string) => void;
}

export function ShowEditorForm({
  editingShowId,
  shows,
  showFormData,
  setShowFormData,
  isNameShortManuallyEdited,
  setIsNameShortManuallyEdited,
  setEditingShowId,
  isSavingShow,
  handleSaveShow,
  handleDeleteShow,
}: ShowEditorFormProps) {
  const isNewShow = editingShowId === 'new';
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handleResetForm = () => {
    if (isNewShow) {
      setShowFormData({
        id: showFormData.id,
        day: 'Monday',
        startHour: 9,
        startMinute: 0,
        durationHours: 1,
        durationMinutes: 0,
        name: '',
        nameShort: '',
        host: '',
        description: '',
        active: true,
        includeInUpNext: true,
      });
      setIsNameShortManuallyEdited(false);
    } else {
      const original = shows.find(s => s.id === editingShowId);
      if (original) {
        setShowFormData({ ...original });
        setIsNameShortManuallyEdited(false);
      }
    }
  };

  return (
    <form onSubmit={handleSaveShow} className="flex-1 flex flex-col min-h-0 bg-slate-100 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="py-3.5 px-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-1.5 rounded text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">
                {isNewShow ? 'Create New Show' : 'Edit Show Settings'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-sans bg-slate-100 border border-slate-200 text-slate-500 font-bold px-2 py-0.5 rounded uppercase leading-none">
              ID: {showFormData.id}
            </span>
            <button
              type="button"
              onClick={() => setEditingShowId(null)}
              className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Show Name
              </label>
              <input
                type="text"
                required
                placeholder="Enter Show name"
                value={showFormData.name || ''}
                onChange={e => {
                  const newName = e.target.value;
                  const updates: Partial<Show> = { name: newName };
                  if (!isNameShortManuallyEdited) {
                    updates.nameShort = cleanNameShort(newName);
                  }
                  setShowFormData({ ...showFormData, ...updates });
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Short Name (for filenames)
              </label>
              <input
                type="text"
                required
                placeholder="Enter Short name"
                value={showFormData.nameShort || ''}
                onChange={e => {
                  setIsNameShortManuallyEdited(true);
                  const rawVal = e.target.value;
                  const sanitized = rawVal.replace(/[^a-zA-Z0-9_]/g, '');
                  setShowFormData({ ...showFormData, nameShort: sanitized.slice(0, 24) });
                }}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-sans font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
              />
              <p className="text-xs text-slate-400 font-medium">
                Max 24 characters. Alphanumeric and underscores only.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
              Show Host
            </label>
            <input
              type="text"
              placeholder="Enter Show host"
              value={showFormData.host || ''}
              onChange={e => setShowFormData({ ...showFormData, host: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 h-10"
            />
          </div>

          <div className="flex flex-wrap lg:flex-nowrap gap-4 items-start">
            <div className="space-y-1.5 w-full sm:w-36 shrink-0">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Show Day
              </label>
              <select
                value={showFormData.day || 'Monday'}
                onChange={e => setShowFormData({ ...showFormData, day: e.target.value as any })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 h-10"
              >
                {daysOfWeek.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 flex-1 min-w-[210px]">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block truncate">
                Start Time
              </label>
              <div className="flex items-center gap-1.5 h-10">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={((showFormData.startHour !== undefined ? showFormData.startHour : 9) % 12) || 12}
                    onChange={e => {
                      const h12 = Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 12));
                      const isPM = (showFormData.startHour !== undefined ? showFormData.startHour : 9) >= 12;
                      let h24 = h12 % 12;
                      if (isPM) h24 += 12;
                      setShowFormData({ ...showFormData, startHour: h24 });
                    }}
                    className="w-14 sm:w-16 px-1.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-sans font-bold tabular-nums text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10 shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Hour</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={showFormData.startMinute !== undefined ? showFormData.startMinute : 0}
                    onChange={e =>
                      setShowFormData({
                        ...showFormData,
                        startMinute: Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)),
                      })
                    }
                    className="w-14 sm:w-16 px-1.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-sans font-bold tabular-nums text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10 shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Min</span>
                </div>
                <div className="flex items-center shrink-0">
                  <select
                    value={(showFormData.startHour !== undefined ? showFormData.startHour : 9) >= 12 ? 'PM' : 'AM'}
                    onChange={e => {
                      const isPM = e.target.value === 'PM';
                      const curH = showFormData.startHour !== undefined ? showFormData.startHour : 9;
                      let h24 = curH % 12;
                      if (isPM) h24 += 12;
                      setShowFormData({ ...showFormData, startHour: h24 });
                    }}
                    className="px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-black uppercase text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 h-10 cursor-pointer shadow-xs"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block truncate">
                Duration of Show
              </label>
              <div className="flex items-center gap-1.5 h-10">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={showFormData.durationHours !== undefined ? showFormData.durationHours : 1}
                    onChange={e =>
                      setShowFormData({
                        ...showFormData,
                        durationHours: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-14 sm:w-16 px-1.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-sans font-bold tabular-nums text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10 shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Hours</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={showFormData.durationMinutes !== undefined ? showFormData.durationMinutes : 0}
                    onChange={e =>
                      setShowFormData({
                        ...showFormData,
                        durationMinutes: Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)),
                      })
                    }
                    className="w-14 sm:w-16 px-1.5 py-2 bg-white border border-slate-300 rounded-lg text-sm font-sans font-bold tabular-nums text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10 shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Mins</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
              Show Description
            </label>
            <textarea
              rows={3}
              placeholder="Enter show details and programming details..."
              value={showFormData.description || ''}
              onChange={e => setShowFormData({ ...showFormData, description: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 leading-normal"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <span className="text-xs font-black text-slate-700 uppercase tracking-wide block">
                Show Broadcast Status
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Define whether this show&apos;s profile is currently active in the weekly schedule listings.
              </p>
            </div>
            <div className="flex items-center -space-x-px">
              <button
                type="button"
                onClick={() => setShowFormData({ ...showFormData, active: true })}
                className={cn(
                  'px-4 py-1.5 text-xs font-black uppercase rounded-l border cursor-pointer',
                  showFormData.active
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-400 border-slate-250 hover:bg-slate-50'
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setShowFormData({ ...showFormData, active: false })}
                className={cn(
                  'px-4 py-1.5 text-xs font-black uppercase rounded-r border cursor-pointer',
                  !showFormData.active
                    ? 'bg-slate-600 text-white border-slate-600'
                    : 'bg-white text-slate-400 border-slate-250 hover:bg-slate-50'
                )}
              >
                Inactive
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer select-none">
            <div className="pr-4">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wide block">
                Include in &ldquo;Up Next&rdquo; Promo Cards
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically seeds an &ldquo;Up Next: [Show Name]&rdquo; Live Read card before this show begins when Up Next promos are enabled.
              </p>
            </div>
            <input
              type="checkbox"
              checked={showFormData.includeInUpNext !== false}
              onChange={e => setShowFormData({ ...showFormData, includeInUpNext: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
            />
          </label>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="flex gap-2">
            {!isNewShow && (
              <button
                type="button"
                disabled={isSavingShow}
                onClick={() => handleDeleteShow(showFormData.id!)}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Show</span>
              </button>
            )}
            <button
              type="button"
              disabled={isSavingShow}
              onClick={handleResetForm}
              className="px-4 py-2 bg-slate-105 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              Reset
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSavingShow}
              onClick={() => setEditingShowId(null)}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingShow}
              className={cn(
                'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer',
                isSavingShow && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSavingShow ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSavingShow ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

export interface ShowsManagerListProps {
  shows: Show[];
  showFilterQuery: string;
  showConflicts: ShowConflict[];
  showGaps: ShowGap[];
  showsCardsCollapse: boolean;
  startEditShow: (show: Show) => void;
  handleVerifyEvergreens: () => void;
  isVerifyingEvergreens: boolean;
  showsFolderCheckMinimal: boolean;
  showsFolderCheckShort: boolean;
}

export function ShowsManagerList({
  shows,
  showFilterQuery,
  showConflicts,
  showGaps,
  showsCardsCollapse,
  startEditShow,
  handleVerifyEvergreens,
  isVerifyingEvergreens,
  showsFolderCheckMinimal,
  showsFolderCheckShort,
}: ShowsManagerListProps) {
  const filteredShows = shows.filter(show => {
    if (!showFilterQuery) return true;
    const q = showFilterQuery.toLowerCase();

    const dayLong = show.day.toLowerCase();
    const dayShort = show.day.substring(0, 3).toLowerCase();

    const startHour = show.startHour ?? 0;
    const startMinute = show.startMinute ?? 0;
    const time24 = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;

    const ampm = startHour >= 12 ? 'pm' : 'am';
    const hour12 = startHour % 12 === 0 ? 12 : startHour % 12;
    const time12 = `${hour12}:${startMinute.toString().padStart(2, '0')} ${ampm}`;
    const time12NoSpace = `${hour12}:${startMinute.toString().padStart(2, '0')}${ampm}`;
    const time12HourOnly = `${hour12}${ampm}`;

    return (
      show.name.toLowerCase().includes(q) ||
      show.host.toLowerCase().includes(q) ||
      show.description.toLowerCase().includes(q) ||
      dayLong.includes(q) ||
      dayShort.includes(q) ||
      time24.includes(q) ||
      time12.includes(q) ||
      time12NoSpace.includes(q) ||
      time12HourOnly.includes(q)
    );
  });

  const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const sortedShows = [...filteredShows].sort((a, b) => {
    const dayDiff = daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    const hourDiff = (a.startHour || 0) - (b.startHour || 0);
    if (hourDiff !== 0) return hourDiff;
    return (a.startMinute || 0) - (b.startMinute || 0);
  });

  if (sortedShows.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 pb-1">
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed text-center flex-1">
          <BookOpen className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">No Shows Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {showFilterQuery
              ? 'No shows match your filter criteria.'
              : "There are currently no show profiles stored in shows.json. Click '+ ADD NEW SHOW' to create one."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 pb-1">
      {(showConflicts.length > 0 || showGaps.length > 0) && (
        <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 px-3.5 mb-3 text-amber-800 text-xs italic flex items-start gap-2.5 shadow-2xs shrink-0">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
          <div className="space-y-1">
            {showConflicts.length > 0 && (
              <div>
                <span className="font-semibold not-italic text-amber-900">Show Caution: </span>
                {showConflicts.map(c => c.message).join('; ')}
              </div>
            )}
            {showGaps.length > 0 && (
              <div>
                <span className="font-semibold not-italic text-amber-900">Show Gap: </span>
                {showGaps.map(g => g.message).join('; ')}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col flex-1 min-h-0">
        <div className="bg-slate-100 border-b border-slate-250 pl-[17px] pr-3 py-1.5 flex items-center gap-4 text-[11px] font-black text-slate-500 uppercase tracking-wider shrink-0 select-none sticky top-0 z-20 shadow-sm">
          <div className="w-[85px] shrink-0">Day & Time</div>
          <div className="flex-1 min-w-0">Show Details</div>
          {!showsCardsCollapse && <div className="w-[70px] shrink-0" />}
        </div>

        <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 divide-y divide-slate-150">
          {sortedShows.map(show => {
            const sorted = getSortedShows(shows);
            const shade = getShowShade(show, sorted);
            return (
              <div
                key={show.id}
                className={cn(
                  'transition-all flex items-stretch p-3 gap-4 relative',
                  !show.active && 'opacity-70'
                )}
                style={{
                  backgroundColor: shade.bg,
                  borderLeft: `5px solid ${shade.border}`,
                }}
              >
                <div className="flex flex-col gap-1 justify-center w-[85px] shrink-0">
                  <span className="px-1 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[11px] font-black uppercase tracking-wide text-center leading-none">
                    {show.day}
                  </span>
                  <span className="flex items-center justify-center gap-0.5 text-[11px] font-sans font-bold tabular-nums text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 leading-none">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    {show.startHour !== undefined && show.startMinute !== undefined ? (
                      <span>
                        {formatTime12(
                          `${show.startHour.toString().padStart(2, '0')}:${(show.startMinute || 0)
                            .toString()
                            .padStart(2, '0')}`
                        )}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans font-bold tabular-nums uppercase text-center leading-none">
                    {show.durationHours}h {show.durationMinutes}m
                  </span>

                  {showsCardsCollapse && (
                    <div className="flex flex-col items-center gap-1 mt-1 pt-1 border-t border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => startEditShow(show)}
                        className="flex items-center gap-1 py-0.5 px-1.5 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-2xs group/btn cursor-pointer shrink-0"
                      >
                        <FileText className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-tight">Edit</span>
                      </button>
                      <span
                        className={cn(
                          'text-[9px] font-black uppercase px-1 py-0.5 rounded border leading-none shrink-0 text-center',
                          show.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        )}
                      >
                        {show.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight mb-0.5">
                    {show.name}
                    {show.host ? ` by ${show.host}` : ''}
                  </h3>
                  {show.description && (
                    <p className="text-xs text-slate-500 leading-normal font-medium font-sans line-clamp-1">
                      {show.description}
                    </p>
                  )}
                  <div className="text-[10px] text-slate-400 font-sans font-bold uppercase mt-1 leading-none">
                    ID: {show.id} {show.nameShort && `• Code: ${show.nameShort}`}
                  </div>
                </div>

                {!showsCardsCollapse && (
                  <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 w-[70px]">
                    <button
                      type="button"
                      onClick={() => startEditShow(show)}
                      className="flex items-center gap-1 py-1 px-2 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm group/btn cursor-pointer shrink-0"
                    >
                      <FileText className="w-3 h-3" />
                      <span className="text-xs font-black uppercase tracking-tight">Edit</span>
                    </button>
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-1.5 py-0.5 rounded border leading-none shrink-0 text-center',
                        show.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      )}
                    >
                      {show.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-start pt-3 border-t border-slate-200 mt-2 shrink-0 select-none">
        <button
          type="button"
          onClick={handleVerifyEvergreens}
          disabled={isVerifyingEvergreens}
          className="p-1.5 px-3 bg-slate-600 text-white rounded border border-slate-700 text-xs font-black tracking-tighter shadow-sm hover:bg-slate-700 transition-all uppercase cursor-pointer h-8 disabled:opacity-55 flex items-center gap-1.5 active:translate-y-px max-w-full min-w-0"
          title="Verify or create Evergreen & Playlist folders for all shows"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-200 shrink-0" />
          <span className="truncate">
            {isVerifyingEvergreens
              ? 'CHECKING...'
              : showsFolderCheckMinimal
                ? 'CHECK FOLDERS'
                : showsFolderCheckShort
                  ? 'CHECK EVERGREEN FOLDERS'
                  : 'CHECK EVERGREEN & PLAYLIST FOLDERS'}
          </span>
        </button>
      </div>
    </div>
  );
}
