/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Calendar, XCircle, Plus, ArrowDown } from 'lucide-react';
import {
  cn,
  computeBackfilledEndTime,
  getNextGapAutoFillStart,
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
    adjacentGateUpdate?: {
      gateId: string;
      startDate?: string;
      startTime?: string;
      endDate?: string;
      endTime?: string;
    };
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
  const selectedPreset = placementModal.presets.find(
    p => p.id === placementModal.selectedPresetId
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

  const applyNewGateEndPreset = (mode: 'open' | 'week' | 'month' | 'setEnd') => {
    if (mode === 'open') {
      onUpdateDates({ endDate: '', endTime: '' });
      return;
    }
    if (mode === 'setEnd') {
      if (!formattedParentEnd) return;
      onUpdateDates({
        endDate: getDatePart(formattedParentEnd),
        endTime: getTimePart(formattedParentEnd) || '23:59',
      });
      return;
    }
    const baseStart = placementModal.startDate || getDatePart(getCurrentDatetimeLocal());
    const [sy, sm, sd] = baseStart.split('-').map(Number);
    if (isNaN(sy) || isNaN(sm) || isNaN(sd)) return;
    const targetNext =
      mode === 'week'
        ? new Date(sy, sm - 1, sd + 7)
        : new Date(sy, sm, sd);
    const pad = (n: number) => String(n).padStart(2, '0');
    const nextStartIso = `${targetNext.getFullYear()}-${pad(targetNext.getMonth() + 1)}-${pad(targetNext.getDate())}T00:00`;
    const backfillIso = computeBackfilledEndTime(nextStartIso);
    onUpdateDates({
      endDate: getDatePart(backfillIso),
      endTime: getTimePart(backfillIso) || '23:59',
    });
  };

  // Identify adjacent / touching gates relative to the new gate's Start & End
  const activeGates = placementModal.activeGates || [];
  const newStartIso = placementModal.startDate
    ? `${placementModal.startDate}T${placementModal.startTime || '00:00'}`
    : '';
  const newEndIso = placementModal.endDate
    ? `${placementModal.endDate}T${placementModal.endTime || '23:59'}`
    : '';

  const isCustomMode = placementModal.selectedPresetId === 'custom';

  const precedingGate = (() => {
    if (activeGates.length === 0) return null;
    if (!newStartIso) return activeGates[activeGates.length - 1];
    let candidate = null;
    for (const g of activeGates) {
      const gStart = g.startDate ? `${g.startDate}T${g.startTime || '00:00'}` : '';
      if (!gStart || gStart <= newStartIso) {
        candidate = g;
      }
    }
    return candidate;
  })();

  const followingGate = (() => {
    if (activeGates.length === 0 || !newStartIso) return null;
    for (const g of activeGates) {
      const gStart = g.startDate ? `${g.startDate}T${g.startTime || '00:00'}` : '';
      if (gStart && gStart > newStartIso) {
        return g;
      }
    }
    return null;
  })();

  const precedingOverlapsNew = (() => {
    if (!precedingGate || !newStartIso) return false;
    const pEnd = precedingGate.endDate
      ? `${precedingGate.endDate}T${precedingGate.endTime || '23:59'}`
      : '';
    return !pEnd || pEnd > newStartIso;
  })();

  const followingOverlapsNew = (() => {
    if (!followingGate || !newStartIso) return false;
    const fStart = followingGate.startDate
      ? `${followingGate.startDate}T${followingGate.startTime || '00:00'}`
      : '';
    if (!fStart) return false;
    return !newEndIso || newEndIso > fStart;
  })();

  // End-gapping presets appear only when the new gate is the last item and the future gap is not predefined (#95)
  const isLastItemWithUndefinedFuture =
    !followingGate &&
    Boolean(selectedPreset?.isLastItemUnboundedFuture || (!formattedParentEnd && isCustomMode));

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
                Position item into an available gap or edit touching gate bounds
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
          {/* Overall Parent Announcement Schedule Window Banner (#80 / #95 renamed to "Current") */}
          <div className="p-2.5 rounded-lg bg-slate-100/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 select-none">
              Current
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
                const showNestedTransitionBox =
                  isSelected && Boolean(preset.transitionMp3Id && placementModal.transitionMp3Id);

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
                    <div
                      onClick={() => {
                        if (!isSelected) {
                          onSelectPreset(preset);
                        }
                      }}
                      className={cn(
                        'w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 shadow-xs',
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
                      {(preset.displayStartDate || preset.startDate) && !isCustom ? (
                        <div className="space-y-0.5 mt-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-slate-500 font-bold uppercase text-[10px] w-11 shrink-0 select-none">
                              Start:
                            </span>
                            <span
                              className={cn(
                                isSelected
                                  ? 'text-blue-800 font-bold'
                                  : 'text-slate-700 font-medium'
                              )}
                            >
                              {isSelected && placementModal.startDate
                                ? `${placementModal.startDate} @ ${formatTime12(placementModal.startTime || '00:00')}`
                                : `${preset.displayStartDate || preset.startDate} @ ${formatTime12(
                                    (preset.displayStartTime !== undefined
                                      ? preset.displayStartTime
                                      : preset.startTime) || '00:00'
                                  )}`}
                              {preset.isLeadingGap && (
                                <span className="ml-1 text-[10px] text-blue-600 font-bold">
                                  (now)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            <span className="text-slate-500 font-bold uppercase text-[10px] w-11 shrink-0 select-none">
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
                                {formatTime12(
                                  (preset.displayEndTime !== undefined
                                    ? preset.displayEndTime
                                    : preset.endTime) || '00:00'
                                )}
                              </span>
                            ) : preset.transitionMp3Id ? (
                              <span className="text-amber-800 font-bold text-[11px]">
                                {(() => {
                                  if (isSelected && placementModal.previousGateEndDate) {
                                    const pTime = placementModal.previousGateEndTime || '23:59';
                                    return `Gate #${preset.transitionMp3Index || 1} ends ${placementModal.previousGateEndDate} @ ${formatTime12(pTime)} → New Gate Open-Ended`;
                                  }
                                  return '* Gate is open-ended — set transition below';
                                })()}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">
                                Open-Ended (No end limit)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : isCustom ? (
                        <p className="text-[11px] font-medium text-slate-500 leading-snug">
                          Manually edit Start and End times for this gate and any adjacent touching gates below.
                        </p>
                      ) : null}

                      {/* Nested Open-Ended Previous Gate End Prompt Inside Selected Gap (#95) */}
                      {showNestedTransitionBox && (
                        <div
                          onClick={e => e.stopPropagation()}
                          className="mt-1 bg-amber-50/95 p-2.5 rounded-lg border border-amber-300 space-y-2 cursor-default"
                        >
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
                              {formattedParentEnd && (
                                <button
                                  type="button"
                                  onClick={() => applyPreviousGateEndOffset('announcementEnd')}
                                  className="px-1.5 py-0.5 rounded bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                                  title={`Set previous gate End to Announcement End (${formatWindowBound(formattedParentEnd, '23:59')})`}
                                >
                                  Set End
                                </button>
                              )}
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
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Schedule Chain / Touching Gate Range Editor (#95) */}
          <div className="space-y-2">
            {/* Preceding Touching Gate (shown in Custom mode or when overlapping) */}
            {(isCustomMode || precedingOverlapsNew) && precedingGate && !placementModal.transitionMp3Id && (
              <div
                className={cn(
                  'p-2.5 rounded-lg border space-y-1.5',
                  precedingOverlapsNew
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-1">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                    Prior Touching Gate #{precedingGate.gateNumber} ({precedingGate.title})
                  </span>
                  {precedingOverlapsNew && newStartIso && (
                    <button
                      type="button"
                      onClick={() => {
                        const backfillIso = computeBackfilledEndTime(newStartIso);
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: precedingGate.id,
                            endDate: getDatePart(backfillIso),
                            endTime: getTimePart(backfillIso) || '23:59',
                          },
                        });
                      }}
                      className="px-1.5 py-0.5 rounded bg-amber-200/90 hover:bg-amber-300 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                      title="Close overlap by ending this prior gate 1 minute before the new gate starts"
                    >
                      End Before New
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-px">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                    Start:
                  </label>
                  <div className="flex items-center gap-px">
                    <input
                      type="date"
                      value={precedingGate.startDate}
                      onChange={e =>
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: precedingGate.id,
                            startDate: e.target.value,
                          },
                        })
                      }
                      className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={precedingGate.startTime}
                        onChange={t =>
                          onUpdateDates({
                            adjacentGateUpdate: {
                              gateId: precedingGate.id,
                              startTime: t,
                            },
                          })
                        }
                        className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 h-6.5"
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-px">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                    End:
                  </label>
                  <div className="flex items-center gap-px">
                    <input
                      type="date"
                      value={precedingGate.endDate}
                      onChange={e =>
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: precedingGate.id,
                            endDate: e.target.value,
                          },
                        })
                      }
                      className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={precedingGate.endTime}
                        onChange={t =>
                          onUpdateDates({
                            adjacentGateUpdate: {
                              gateId: precedingGate.id,
                              endTime: t,
                            },
                          })
                        }
                        className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 h-6.5"
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(isCustomMode || precedingOverlapsNew) && precedingGate && !placementModal.transitionMp3Id && (
              <div className="flex justify-center text-slate-400">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
            )}

            {/* New Gate Schedule Range (Editable) */}
            <div className="bg-blue-50/40 p-3 rounded-lg border border-blue-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-blue-200/80 pb-1">
                <label className="text-[11px] font-black text-blue-950 uppercase tracking-wider block select-none">
                  New Gate Schedule Range (Editable)
                </label>
                {isLastItemWithUndefinedFuture && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyNewGateEndPreset('open')}
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors border',
                        !placementModal.endDate
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      )}
                      title="Leave new gate open-ended (no end date)"
                    >
                      Open-Ended
                    </button>
                    <button
                      type="button"
                      onClick={() => applyNewGateEndPreset('week')}
                      className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                      title="Set new gate End to +1 week from Start"
                    >
                      +1 Week
                    </button>
                    <button
                      type="button"
                      onClick={() => applyNewGateEndPreset('month')}
                      className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                      title="Set new gate End to +1 month from Start"
                    >
                      +1 Month
                    </button>
                    {formattedParentEnd && (
                      <button
                        type="button"
                        onClick={() => applyNewGateEndPreset('setEnd')}
                        className="px-1.5 py-0.5 rounded bg-white hover:bg-blue-100 text-blue-900 border border-blue-200 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                        title={`Set new gate End to Announcement End (${formatWindowBound(formattedParentEnd, '23:59')})`}
                      >
                        Set End
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Start Row */}
              <div className="flex items-center gap-px">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                  Start:
                </label>
                <div className="flex items-center gap-px flex-wrap">
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
                  {precedingGate && precedingGate.endDate && (
                    <button
                      type="button"
                      onClick={() => {
                        const pEndIso = `${precedingGate.endDate}T${precedingGate.endTime || '23:59'}`;
                        const autoStart = getNextGapAutoFillStart(pEndIso);
                        onUpdateDates({
                          startDate: autoStart.startDate,
                          startTime: autoStart.startTime,
                        });
                      }}
                      className="ml-1.5 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer shrink-0 select-none"
                      title={`Set Start to 1 minute after Gate #${precedingGate.gateNumber} ends`}
                    >
                      Set to prior
                    </button>
                  )}
                </div>
              </div>

              {/* End Row */}
              <div className="flex items-center gap-px">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                  End:
                </label>
                <div className="flex items-center gap-px flex-wrap">
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
                  {followingGate && followingGate.startDate && (
                    <button
                      type="button"
                      onClick={() => {
                        const fStartIso = `${followingGate.startDate}T${followingGate.startTime || '00:00'}`;
                        const backfillIso = computeBackfilledEndTime(fStartIso);
                        onUpdateDates({
                          endDate: getDatePart(backfillIso),
                          endTime: getTimePart(backfillIso) || '23:59',
                        });
                      }}
                      className="ml-1.5 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer shrink-0 select-none"
                      title={`Extend End to 1 minute before Gate #${followingGate.gateNumber} starts`}
                    >
                      Extend to next
                    </button>
                  )}
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

            {(isCustomMode || followingOverlapsNew) && followingGate && (
              <div className="flex justify-center text-slate-400">
                <ArrowDown className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Following Touching Gate (shown in Custom mode or when overlapping) */}
            {(isCustomMode || followingOverlapsNew) && followingGate && (
              <div
                className={cn(
                  'p-2.5 rounded-lg border space-y-1.5',
                  followingOverlapsNew
                    ? 'bg-amber-50/80 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-1">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                    Next Touching Gate #{followingGate.gateNumber} ({followingGate.title})
                  </span>
                  {followingOverlapsNew && newEndIso && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextStart = getNextGapAutoFillStart(newEndIso);
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: followingGate.id,
                            startDate: nextStart.startDate,
                            startTime: nextStart.startTime,
                          },
                        });
                      }}
                      className="px-1.5 py-0.5 rounded bg-amber-200/90 hover:bg-amber-300 text-amber-950 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                      title="Close overlap by starting this next gate 1 minute after the new gate ends"
                    >
                      Start After New
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-px">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                    Start:
                  </label>
                  <div className="flex items-center gap-px">
                    <input
                      type="date"
                      value={followingGate.startDate}
                      onChange={e =>
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: followingGate.id,
                            startDate: e.target.value,
                          },
                        })
                      }
                      className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={followingGate.startTime}
                        onChange={t =>
                          onUpdateDates({
                            adjacentGateUpdate: {
                              gateId: followingGate.id,
                              startTime: t,
                            },
                          })
                        }
                        className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 h-6.5"
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-px">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider w-11 shrink-0 select-none">
                    End:
                  </label>
                  <div className="flex items-center gap-px">
                    <input
                      type="date"
                      value={followingGate.endDate}
                      onChange={e =>
                        onUpdateDates({
                          adjacentGateUpdate: {
                            gateId: followingGate.id,
                            endDate: e.target.value,
                          },
                        })
                      }
                      className="w-[110px] p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold font-mono outline-none bg-white text-slate-800 h-6.5 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:p-0"
                    />
                    <div className="shrink-0">
                      <MilitaryTimeInput
                        value={followingGate.endTime}
                        onChange={t =>
                          onUpdateDates({
                            adjacentGateUpdate: {
                              gateId: followingGate.id,
                              endTime: t,
                            },
                          })
                        }
                        className="p-0.5 border-0 border-b border-slate-350 rounded-none text-xs font-bold outline-none bg-white text-slate-800 h-6.5"
                        placeholder="hh:mm AM"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
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
