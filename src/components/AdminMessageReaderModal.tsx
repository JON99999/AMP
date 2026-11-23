import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Check, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AdminMessage, Show } from '../types';
import { cn } from '../lib/utils';
import { renderFormattedTxtContent } from '../lib/liveReadFormatting';
import {
  getDefaultLiveReadFontSize,
  getDefaultLiveReadFontFamily,
  getLiveReadFontFamilyCss,
  LiveReadFontFamily,
  toStationDateParts,
  getStationTimezone,
} from '../lib/compatibility';

export interface AdminMessageReaderModalProps {
  isOpen: boolean;
  message: AdminMessage | null;
  show?: Show | null;
  acknowledged?: boolean;
  acknowledgedAt?: string;
  isPreview?: boolean;
  confirmBeforeAck?: boolean;
  queueIndex?: number;
  queueTotal?: number;
  onClose: () => void;
  onAcknowledge?: (message: AdminMessage) => Promise<void> | void;
}

function formatAckTimestamp(iso?: string): string {
  if (!iso) return '';
  const parts = toStationDateParts(iso, getStationTimezone());
  if (!parts) return '';
  const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const ampm = parts.hour >= 12 ? 'PM' : 'AM';
  const min = String(parts.minute).padStart(2, '0');
  return `${parts.month}/${parts.day}/${parts.year} at ${h12}:${min} ${ampm}`;
}

export default function AdminMessageReaderModal({
  isOpen,
  message,
  show,
  acknowledged = false,
  acknowledgedAt,
  isPreview = false,
  confirmBeforeAck = false,
  queueIndex,
  queueTotal,
  onClose,
  onAcknowledge,
}: AdminMessageReaderModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(() => getDefaultLiveReadFontSize());
  const [fontFamily, setFontFamily] = useState<LiveReadFontFamily>(() => getDefaultLiveReadFontFamily());
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [showEarlyConfirm, setShowEarlyConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && message) {
      setZoomLevel(getDefaultLiveReadFontSize());
      setFontFamily(getDefaultLiveReadFontFamily());
      setIsAcknowledging(false);
      setShowEarlyConfirm(false);
    }
  }, [isOpen, message?.id]);

  if (!isOpen || !message) return null;

  const isAlert = message.severity === 'alert';
  const isStartupNotice = message.targetScope === 'app_startup';

  const bannerText = isStartupNotice
    ? isAlert
      ? 'AMP VERSION & SCHEMA NOTICE — DO NOT READ ON AIR'
      : 'AMP APPLICATION NOTICE — DO NOT READ ON AIR'
    : 'OFF-AIR MESSAGE FOR SHOW — DO NOT READ ON AIR';

  const performAcknowledge = async () => {
    if (!onAcknowledge || isPreview) {
      onClose();
      return;
    }
    setShowEarlyConfirm(false);
    setIsAcknowledging(true);
    try {
      await onAcknowledge(message);
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleAcknowledgeClick = async () => {
    if (!onAcknowledge || isPreview) {
      onClose();
      return;
    }
    if (confirmBeforeAck) {
      setShowEarlyConfirm(true);
      return;
    }
    await performAcknowledge();
  };

  const earlyConfirmPromptText = show?.name
    ? show.host && show.host.trim()
      ? `Are you sure? This is for ${show.name} with ${show.host.trim()}.`
      : `Are you sure? This is for ${show.name}.`
    : 'Are you sure? This is for an upcoming show.';

  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 text-left"
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-white rounded-xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden border-[3px]',
          isAlert ? 'border-amber-500' : 'border-teal-600'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Unmistakable Off-Air Banner */}
        <div
          className={cn(
            'px-4 py-2 flex items-center justify-between gap-2 text-white shrink-0',
            isAlert ? 'bg-amber-600' : 'bg-teal-700'
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isAlert ? (
              <AlertTriangle className="w-4 h-4 text-amber-100 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-teal-100 shrink-0" />
            )}
            <span className="text-xs font-black uppercase tracking-wider truncate">
              {bannerText}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof queueIndex === 'number' && typeof queueTotal === 'number' && queueTotal > 1 && (
              <span className="px-2 py-0.5 rounded bg-black/25 text-xs font-black uppercase tracking-wider">
                Notice {queueIndex + 1} of {queueTotal}
              </span>
            )}
            {isPreview && (
              <span className="px-2 py-0.5 rounded bg-black/25 text-xs font-black uppercase tracking-wider">
                Preview
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-black/20 text-white transition-colors cursor-pointer"
              title="Close (Keep Unread)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Title & Font Controls Bar */}
        <div
          className={cn(
            'px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0',
            isAlert ? 'bg-amber-50 border-amber-200' : 'bg-teal-50 border-teal-200'
          )}
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black shrink-0',
                  isAlert
                    ? 'bg-amber-600 text-white'
                    : 'bg-teal-700 text-white'
                )}
              >
                {isAlert ? '!' : 'i'}
              </span>
              <h2 className="text-base font-black text-slate-900 tracking-tight break-words">
                {message.title || 'Show Message'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pl-8">
              {show && (
                <span className="font-bold text-slate-700">
                  Show: {show.name}
                  {show.host ? ` (${show.host})` : ''}
                </span>
              )}
              {isStartupNotice && message.targetAppVersion && (
                <span className="font-bold text-slate-700">
                  Target Version: v{message.targetAppVersion}
                </span>
              )}
              {acknowledged && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Acknowledged{acknowledgedAt ? ` · ${formatAckTimestamp(acknowledgedAt)}` : ''}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Font Zoom Controls (Parity with LiveReadPopout) */}
          <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(14, z - 2))}
              disabled={zoomLevel <= 14}
              className="p-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-30 cursor-pointer"
              title="Decrease text size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(getDefaultLiveReadFontSize())}
              className="px-2 py-1 text-xs font-mono font-bold text-slate-800 border-x border-slate-200 hover:bg-slate-50 cursor-pointer"
              title="Reset to station default font size"
            >
              {zoomLevel}px
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(40, z + 2))}
              disabled={zoomLevel >= 40}
              className="p-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-30 cursor-pointer"
              title="Increase text size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Message Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-white custom-scrollbar">
          <div
            className="text-slate-900 whitespace-pre-wrap break-words leading-relaxed select-text"
            style={{
              fontSize: `${zoomLevel}px`,
              fontFamily: getLiveReadFontFamilyCss(fontFamily),
              lineHeight: 1.6,
            }}
          >
            {message.body && message.body.trim()
              ? renderFormattedTxtContent(message.body)
              : <span className="italic text-slate-400">No message text provided.</span>}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={cn(
            'px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2 shrink-0',
            isAlert ? 'bg-amber-50/70 border-amber-200' : 'bg-teal-50/70 border-teal-200'
          )}
        >
          {isStartupNotice ? (
            <span className="text-xs font-bold text-slate-600">
              Internal AMP notice for operators.
            </span>
          ) : (
            <span className="text-lg sm:text-xl font-black uppercase tracking-wider text-red-700">
              DO NOT READ ON AIR!
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {!acknowledged && !isPreview && (
              <button
                type="button"
                disabled={isAcknowledging}
                onClick={onClose}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-50"
              >
                Read Later (Keep Unread)
              </button>
            )}

            {isPreview || acknowledged ? (
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'px-4 py-2 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs',
                  isAlert
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                )}
              >
                <Check className="w-4 h-4" />
                <span>{isPreview ? 'Close Preview' : 'Close'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isAcknowledging}
                onClick={handleAcknowledgeClick}
                className={cn(
                  'px-4 py-2 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs disabled:opacity-50',
                  isAlert
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                )}
              >
                <Check className="w-4 h-4" />
                <span>
                  {isAcknowledging ? 'Saving...' : 'Acknowledge (Mark as Read)'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showEarlyConfirm && (
        <div
          className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl border-2 border-amber-500 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-2.5 bg-amber-600 text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider">
                Confirm Future Show Message
              </span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm font-bold text-slate-900 leading-snug">
                {earlyConfirmPromptText}
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isAcknowledging}
                  onClick={() => setShowEarlyConfirm(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isAcknowledging}
                  onClick={performAcknowledge}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Yes, Mark as Read</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
