/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Calendar, XCircle, Plus } from 'lucide-react';
import {
  cn,
  computeBackfilledEndTime,
  getDatePart,
  getTimePart,
  formatDuration,
  formatTime12,
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
} from '../lib/utils';
import {
  SchedulePresetOption,
  AnnouncementPlacementModalState,
} from '../lib/schedulePlacement';
import { MilitaryTimeInput } from './MilitaryTimeInput';

interface PlacementPresetModalProps {
  placementModal: AnnouncementPlacementModalState;
  parentStartDate?: string;
  parentEndDate?: string;
  onSelectPreset: (preset: SchedulePresetOption) => void;
  onUpdateDates: (updates: {
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    previousGateEndDate?: string;
    previousGateEndTime?: string;
  }) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlacementPresetModal({
  placementModal,
  parentStartDate,
  parentEndDate,
  onSelectPreset,
  onUpdateDates,
  onConfirm,
  onCancel,
}: PlacementPresetModalProps) {
  const prevEndDateInputRef = useRef<HTMLInputElement | null>(null);
  const activeTransitionPreset = placementModal.presets.find(
    p => p.transitionMp3Id && p.transitionMp3Id === placementModal.transitionMp3Id
  );

  const formattedParentStart = parentStartDate && parentStartDate.trim()
    ? formatToDatetimeLocal(parentStartDate)
    : '';
  const formattedParentEnd = parentEndDate && parentEndDate.trim()
    ? formatToDatetimeLocal(parentEndDate)
    : '';

  const formatWindowBound = (isoLocal: string, fallbackTime: string) => {
    if (!isoLocal) return '';
    const dPart = getDatePart(isoLocal);
    const tPart = getTimePart(isoLocal) || fallbackTime;
    return `${dPart} @ ${formatTime12(tPart)}`;
  };

  const applyPreviousGateEndOffset = (mode: 'week' | 'month' | 'announcementEnd') => {
    if (mode === 'announcementEnd') {
      if (!formattedParentEnd) return;
      onUpdateDates({
        previousGateEndDate: getDatePart(formattedParentEnd),
        previousGateEndTime: getTimePart(formattedParentEnd) || '23:59',
      });
      return;
    }

    const refStartIso =
      activeTransitionPreset?.referenceStartDate ||
      formattedParentStart ||
      getCurrentDatetimeLocal();
    const refDatePart = getDatePart(refStartIso);
    const [ry, rm, rd] = refDatePart.split('-').map(Number);
    if (isNaN(ry) || isNaN(rm) || isNaN(rd)) return;

    const targetNextStart =
      mode === 'week'
        ? new Date(ry, rm - 1, rd + 7)
        : new Date(ry, rm, rd);
    const pad = (n: number) => String(n).padStart(2, '0');
    const nextStartIso = `${targetNextStart.getFullYear()}-${pad(targetNextStart.getMonth() + 1)}-${pad(targetNextStart.getDate())}T00:00`;
    const backfillIso = computeBackfilledEndTime(nextStartIso);
    onUpdateDates({
      previousGateEndDate: getDatePart(backfillIso),
      previousGateEndTime: getTimePart(backfillIso) || '23:59',
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded shrink-0">
              <Calendar className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest leading-none">
                Schedule Placement Options
              </h3>
              <p className="text-xs font-bold text-blue-700/80 mt-1">
                Set a Start and End time
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-blue-100/50 transition-colors"
            title="Close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs font-bold text-slate-700 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Overall Parent Announcement Schedule Window Banner (#80) */}
          <div className="p-2.5 rounded-lg bg-slate-100/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 select-none">
              Announcement Window:
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-mono">
              <span>
                <span className="text-slate-500 font-bold uppercase text-[10px] mr-1">Start:</span>
                <span className="font-bold text-slate-800">
                  {formattedParentStart ? formatWindowBound(formattedParentStart, '00:00') : 'Immediate'}
                </span>
              </span>
              <span>
                <span className="text-slate-500 font-bold uppercase text-[10px] mr-1">End:</span>
                <span className="font-bold text-slate-800">
                  {formattedParentEnd ? formatWindowBound(formattedParentEnd, '23:59') : 'Open-Ended (No end limit)'}
                </span>
              </span>
            </div>
          </div>

          {/* Available Gaps Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block select-none">
              Available gaps
            </label>
            <div className="grid grid-cols-1 gap-1.5 pl-2.5">
              {placementModal.presets.map((preset) => {
                const isCustom = preset.id === 'custom';
                const isSelected = placementModal.selectedPresetId === preset.id;
                return (
                  <React.Fragment key={preset.id}>
                    {isCustom && (
                      <div className="flex items-center gap-2 py-1 select-none">
                        <div className="h-px bg-slate-200 flex-1" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          - or -
                        </span>
                        <div className="h-px bg-slate-200 flex-1" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectPreset(preset)}
                      className={cn(
                        'w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1 shadow-xs',
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 text-blue-900 ring-1 ring-blue-600 shadow-sm'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-slate-700'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-black uppercase tracking-wide line-clamp-2 break-words leading-snug"
                          title={preset.label}
                        >
                          {preset.label}
                        </span>
                      </div>
                      {preset.displayStartDate || preset.startDate ? (
                        <div className="space-y-0.5 mt-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-slate-500 font-bold uppercase text-[10px] w-9 shrink-0 select-none">
                              Start:
                            </span>
                            <span
                              className={cn(
                                isSelected
                                  ? 'text-blue-800 font-bold'
                                  : 'text-slate-700 font-medium'
                              )}
                            >
                              {preset.displayStartDate || preset.startDate} @{' '}
                              {formatTime12((preset.displayStartTime !== undefined
                                ? preset.displayStartTime
                                : preset.startTime) || '00:00')}
                              {preset.isLeadingGap && (
                                <span className="ml-1 text-[10px] text-blue-600 font-bold">
                                  (now)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-slate-500 font-bold uppercase text-[10px] w-9 shrink-0 select-none">
                              End:
                            </span>
                            {preset.displayEndDate || preset.endDate ? (
                              <span
                                className={cn(
                                  isSelected
                                  ? 'text-blue-800 font-bold'
                                  : 'text-slate-700 font-medium'
                                )}
                              >
                                {preset.displayEndDate || preset.endDate} @{' '}
                                {formatTime12((preset.displayEndTime !== undefined
                                  ? preset.displayEndTime
                                  : preset.endTime) || '00:00')}
                              </span>
                            ) : preset.transitionMp3Id ? (
                              <span className="text-amber-700 font-bold text-[11px]">
                                {(() => {
                                  if (isSelected && placementModal.previousGateEndDate) {
                                    const pTime = placementModal.previousGateEndTime || '23:59';
                                    return `* Will end on ${placementModal.previousGateEndDate} @ ${formatTime12(pTime)}`;
                                  }
                                  if (isSelected && placementModal.startDate) {
                                    const startIso = `${placementModal.startDate}T${placementModal.startTime || '00:00'}`;
                                    const backfillEndIso = computeBackfilledEndTime(startIso);
                                    const bDate = getDatePart(backfillEndIso);
                                    const bTime = getTimePart(backfillEndIso) || '00:00';
                                    return `* Will end on ${bDate} @ ${formatTime12(bTime)}`;
                                  }
                                  return '* Open-ended — choose when this gate should end below';
                                })()}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">
                                (No end limit)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Open-Ended Previous Gate End Prompt */}
          {placementModal.transitionMp3Id && (
            <div className="bg-amber-50/90 p-3 rounded-lg border border-amber-300 space-y-2">
              <div className="flex flex-col gap-1.5 border-b border-amber-200 pb-1.5">
                <label className="text-[11px] font-black text-amber-900 uppercase tracking-wider block select-none">
                  When should Gate #{placementModal.transitionMp3Index || 1}
                  {placementModal.transitionMp3Title || activeTransitionPreset?.transitionMp3Title
                    ? ` (${placementModal.transitionMp3Title || activeTransitionPreset?.transitionMp3Title})`
                    : ''}{' '}
                  end?
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => applyPreviousGateEndOffset('week')}
                    className="px-1.5 py-0.5 rounded bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                    title="End previous gate +1 week from its start (new gate starts 1 minute later)"
                  >
                    +1 Week
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreviousGateEndOffset('month')}
                    className="px-1.5 py-0.5 rounded bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                    title="End previous gate +1 month from its start (new gate starts 1 minute later)"
                  >
                    +1 Month
                  </button>
                  <button
                    type="button"
                    disabled={!formattedParentEnd}
                    onClick={() => applyPreviousGateEndOffset('announcementEnd')}
                    className="px-1.5 py-0.5 rounded bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      formattedParentEnd
                        ? `Set previous gate End to Announcement End (${formatWindowBound(formattedParentEnd, '23:59')})`
                        : 'Parent Announcement has no End date set'
                    }
                  >
                    Announcement End
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      prevEndDateInputRef.current?.focus();
                    }}
                    className="px-1.5 py-0.5 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                    title="Enter a custom End date & time below"
                  >
                    Custom
                  </button>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-amber-800 leading-snug">
                Gate #{placementModal.transitionMp3Index || 1} is currently open-ended. Choose when it should end; the new gate will start 1 minute later.
              </p>
              <div className="flex items-center gap-px">
                <label className="text-xs font-black text-amber-900 uppercase tracking-wider w-11 shrink-0 select-none">
                  End:
                </label>
                <div className="flex items-center gap-px">
                  <input
                    ref={prevEndDateInputRef}
                    type="date"
                    value={placementModal.previousGateEndDate || ''}
                    onChange={(e) =>
                      onUpdateDates({ previousGateEndDate: e.target.value })
                    }
                    className="w-[110px] p-0.5 border-0 border-b border-amber-400 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-amber-600 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                  />
                  <div className="shrink-0">
                    <MilitaryTimeInput
                      value={placementModal.previousGateEndTime || ''}
                      onChange={(t) => onUpdateDates({ previousGateEndTime: t })}
                      className="p-0.5 border-0 border-b border-amber-400 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-amber-600 h-6.5"
                      placeholder="hh:mm AM"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Entry / Range Editor with Editor window styling */}
          <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="border-b border-slate-200 pb-1">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block select-none">
                New Gate Schedule Range (Editable)
              </label>
            </div>

            {/* Start Row */}
            <div className="flex items-center gap-px">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                Start:
              </label>
              <div className="flex items-center gap-px">
                <input
                  type="date"
                  value={placementModal.startDate}
                  onChange={(e) =>
                    onUpdateDates({ startDate: e.target.value })
                  }
                  className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                />
                <div className="shrink-0">
                  <MilitaryTimeInput
                    value={placementModal.startTime}
                    onChange={(t) => onUpdateDates({ startTime: t })}
                    className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5"
                    placeholder="hh:mm AM"
                  />
                </div>
              </div>
            </div>

            {/* End Row */}
            <div className="flex items-center gap-px">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                End:
              </label>
              <div className="flex items-center gap-px">
                <input
                  type="date"
                  value={placementModal.endDate}
                  onChange={(e) => onUpdateDates({ endDate: e.target.value })}
                  className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                />
                <div className="shrink-0">
                  <MilitaryTimeInput
                    value={placementModal.endTime}
                    onChange={(t) => onUpdateDates({ endTime: t })}
                    className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500 h-6.5"
                    placeholder="hh:mm AM"
                  />
                </div>
                {placementModal.endDate ? (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDates({ endDate: '', endTime: '' })
                    }
                    className="ml-2 text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors cursor-pointer select-none"
                    title="Clear End Date"
                  >
                    (optional)
                  </button>
                ) : (
                  <span className="ml-2 text-[11px] font-bold text-slate-400 select-none">
                    (optional)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Target File Info Card at the bottom */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black text-slate-700 select-none">
                File:
              </span>
              <span className="font-mono text-xs font-black text-blue-600 shrink-0">
                New
              </span>
              <span
                className="text-xs font-bold font-mono text-slate-800 truncate"
                title={placementModal.pendingFile?.name}
              >
                {placementModal.pendingFile?.name || 'Selected File'}
              </span>
            </div>
            {placementModal.pendingFile?.duration && (
              <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                {typeof placementModal.pendingFile.duration === 'number'
                  ? formatDuration(placementModal.pendingFile.duration)
                  : placementModal.pendingFile.duration}
              </span>
            )}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded text-xs font-black text-slate-600 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!placementModal.startDate}
            className={cn(
              'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-blue-100 cursor-pointer flex items-center gap-1.5',
              !placementModal.startDate &&
                'opacity-50 cursor-not-allowed hover:bg-blue-600 shadow-none'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Place
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlacementPresetModal;
