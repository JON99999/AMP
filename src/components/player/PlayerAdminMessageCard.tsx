import React from 'react';
import { Info, AlertTriangle, Eye, RefreshCw, CheckCircle } from 'lucide-react';
import { AdminMessage, Show } from '../../types';
import { cn } from '../../lib/utils';

export interface PlayerAdminMessageCardProps {
  key?: React.Key;
  message: AdminMessage;
  show?: Show | null;
  acknowledged: boolean;
  acknowledgedAt?: string;
  zone: 'past' | 'now' | 'future' | 'prerecord';
  shadeBg?: string;
  onOpen: (
    message: AdminMessage,
    show: Show | null,
    acknowledged: boolean,
    acknowledgedAt?: string
  ) => void;
}

export function PlayerAdminMessageCard({
  message,
  show = null,
  acknowledged,
  acknowledgedAt,
  zone,
  shadeBg,
  onOpen,
}: PlayerAdminMessageCardProps) {
  const isAlert = message.severity === 'alert';
  const isExpanded = !acknowledged && (zone === 'now' || zone === 'prerecord');
  const isMuted = acknowledged || zone === 'past';

  const handleOpen = () => {
    onOpen(message, show, acknowledged, acknowledgedAt);
  };

  return (
    <div
      className={cn(
        'flex items-stretch gap-2 w-full relative shrink-0 py-1 pr-1',
        isExpanded ? 'min-h-[5.5rem]' : 'min-h-[4.5rem]'
      )}
      style={shadeBg ? { backgroundColor: shadeBg } : undefined}
    >
      {/* Left Show Shade Gutter (Matches LiveToBeCard & PrerecordAnnouncementCard) */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 z-10',
          isExpanded ? 'w-1.5' : 'w-1'
        )}
        style={shadeBg ? { backgroundColor: shadeBg } : undefined}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          }
        }}
        title={`${isAlert ? '[!] ' : '[i] '}Off-Air Message: ${message.title}\nClick to open message`}
        style={{
          borderLeftColor: acknowledged
            ? '#94a3b8'
            : isAlert
              ? '#f59e0b'
              : '#0d9488',
        }}
        className={cn(
          'flex-1 min-w-0 rounded border shadow-sm transition-colors flex flex-col justify-between select-none cursor-pointer hover:shadow active:scale-[99.5%] text-left overflow-hidden border-l-[4px] rounded-l-none',
          isExpanded ? 'p-2 gap-0.5 ml-1.5' : 'p-1.5 gap-0.5 ml-1',
          isMuted
            ? 'bg-white border-slate-300 opacity-75 hover:opacity-100'
            : isAlert
              ? isExpanded
                ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500/30 hover:bg-amber-100/70'
                : 'bg-amber-50/70 border-amber-400 hover:bg-amber-100/70'
              : isExpanded
                ? 'bg-teal-50 border-teal-600 ring-1 ring-teal-600/30 hover:bg-teal-100/70'
                : 'bg-teal-50/70 border-teal-400 hover:bg-teal-100/70'
        )}
      >
        {/* Header Bar (Matches LiveToBeCard & PrerecordAnnouncementCard) */}
        <div
          className={cn(
            'flex justify-between items-center gap-1 bg-slate-50 rounded-t shrink-0 border-b border-slate-200/80 whitespace-nowrap',
            isExpanded
              ? '-mx-2 -mt-2 px-2 pt-1 pb-[2px]'
              : '-mx-1.5 -mt-1.5 px-1.5 py-0.5'
          )}
        >
          <div className="flex items-center gap-1 leading-none whitespace-nowrap min-w-0">
            <span
              className={cn(
                'inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black shrink-0',
                isMuted
                  ? 'bg-slate-400 text-white'
                  : isAlert
                    ? 'bg-amber-600 text-white'
                    : 'bg-teal-700 text-white'
              )}
            >
              {isAlert ? '!' : 'i'}
            </span>
            <span
              className={cn(
                'uppercase font-black tracking-tighter text-xs truncate',
                isMuted
                  ? 'text-slate-600'
                  : isAlert
                    ? 'text-amber-800'
                    : 'text-teal-800'
              )}
            >
              Show Note
            </span>
          </div>

          {acknowledged ? (
            <span className="bg-slate-200 text-slate-700 rounded font-bold uppercase leading-none rec-distinct-header-pill text-xs px-2 py-0.5 shrink-0">
              Read
            </span>
          ) : (
            <span
              className={cn(
                'rounded font-black uppercase leading-none shrink-0 text-xs px-1.5 py-0.5',
                isAlert
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-teal-100 text-teal-900 border border-teal-300'
              )}
            >
              Unread
            </span>
          )}
        </div>

        {/* Main Row: Title Left + Same-Aspect-Ratio Block View Button Right (Matches Live & Prerecord Cards) */}
        <div
          className={cn(
            'flex justify-between gap-1.5',
            isExpanded
              ? 'flex-1 items-stretch min-h-[2.25rem] mt-[2px] mb-0.5'
              : 'items-center shrink-0'
          )}
        >
          <div
            title={message.title}
            className={cn(
              'leading-tight break-words flex-1 min-w-0 flex flex-col justify-center',
              isExpanded
                ? 'text-sm font-black line-clamp-2'
                : 'text-xs font-bold line-clamp-1',
              isMuted
                ? 'text-slate-600'
                : isAlert
                  ? 'text-amber-950'
                  : 'text-teal-950'
            )}
          >
            {message.title}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
            className={cn(
              'shrink-0 transition-colors shadow-sm cursor-pointer flex items-center justify-center border',
              isExpanded
                ? 'self-stretch min-h-[2.25rem] px-3 my-[1px] rounded-lg shadow-md'
                : 'rounded-full p-1',
              acknowledged
                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300 rec-muted-action-btn'
                : isAlert
                  ? 'bg-amber-600 text-white hover:bg-amber-700 border-amber-500'
                  : 'bg-teal-700 text-white hover:bg-teal-800 border-teal-600'
            )}
            title={acknowledged ? 'View Show Note Again' : 'View Show Note'}
          >
            {acknowledged ? (
              <RefreshCw className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
            ) : (
              <Eye className={isExpanded ? 'w-5 h-5' : 'w-2.5 h-2.5'} />
            )}
          </button>
        </div>

        {/* Footer Label Row */}
        <div className="flex items-center justify-between gap-1 shrink-0">
          {acknowledged ? (
            <div className="flex items-center gap-1 min-w-0">
              <CheckCircle className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-500 uppercase tracking-tighter text-xs truncate">
                Read · Off-Air Message
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0 text-red-700">
              {isAlert ? (
                <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
              ) : (
                <Info className="w-3 h-3 text-red-600 shrink-0" />
              )}
              <span className="font-black uppercase tracking-tight text-xs truncate">
                Off-Air Message
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
