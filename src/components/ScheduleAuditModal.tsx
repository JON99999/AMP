import React, { useState, useMemo } from 'react';
import {
  ListChecks,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  FileQuestion,
  Clock,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  FileText,
  Eye
} from 'lucide-react';
import { Announcement, Show, ScheduleDiagnosticsResult, ScheduleIssue, ScheduleIssueType, ScheduleIssueSeverity } from '../types';
import { cn } from '../lib/utils';
import { evaluateScheduleDiagnostics } from '../lib/scheduleDiagnostics';
import { CalendarDateInput } from './CalendarDateInput';

interface ScheduleAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: Announcement[];
  shows?: Show[];
  now?: Date;
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  diagnostics?: ScheduleDiagnosticsResult;
  onLocateInCalendar: (issue: ScheduleIssue) => void;
}

function formatDateToYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ScheduleAuditModal({
  isOpen,
  onClose,
  announcements,
  shows = [],
  now = new Date(),
  defaultStartDate,
  defaultEndDate,
  onLocateInCalendar
}: ScheduleAuditModalProps) {
  const initialStartDate = useMemo(() => formatDateToYmd(defaultStartDate || now), [defaultStartDate, now]);
  const initialEndDate = useMemo(() => {
    if (defaultEndDate) return formatDateToYmd(defaultEndDate);
    const d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return formatDateToYmd(d);
  }, [defaultEndDate, now]);

  const [startDateInput, setStartDateInput] = useState<string>(initialStartDate);
  const [endDateInput, setEndDateInput] = useState<string>(initialEndDate);

  React.useEffect(() => {
    if (isOpen) {
      if (defaultStartDate) {
        setStartDateInput(formatDateToYmd(defaultStartDate));
      }
      if (defaultEndDate) {
        setEndDateInput(formatDateToYmd(defaultEndDate));
      }
    }
  }, [isOpen, defaultStartDate, defaultEndDate]);

  const [selectedFilter, setSelectedFilter] = useState<'all' | ScheduleIssueType>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | ScheduleIssueSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPhrases, setExpandedPhrases] = useState<Set<string>>(new Set());
  const [isCurrentFutureExpanded, setIsCurrentFutureExpanded] = useState<boolean>(true);
  const [isHistoricalPastExpanded, setIsHistoricalPastExpanded] = useState<boolean>(false);

  const togglePhraseExpanded = (phraseKey: string) => {
    setExpandedPhrases(prev => {
      const next = new Set(prev);
      if (next.has(phraseKey)) next.delete(phraseKey);
      else next.add(phraseKey);
      return next;
    });
  };

  const computedDiagnostics = useMemo(() => {
    const sDate = startDateInput ? new Date(`${startDateInput}T00:00:00`) : now;
    const eDate = endDateInput ? new Date(`${endDateInput}T23:59:59`) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return evaluateScheduleDiagnostics({
      announcements,
      shows,
      now,
      startDate: sDate,
      endDate: eDate,
      includePastHours: true
    });
  }, [announcements, shows, now, startDateInput, endDateInput]);

  const { issues, summary, scopeStartDate, scopeEndDate } = computedDiagnostics;

  const nowHourStartMs = useMemo(() => {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0).getTime();
  }, [now]);

  const formatDateRange = (startIso: string, endIso: string) => {
    try {
      const s = new Date(startIso);
      const e = new Date(endIso);
      const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      return `${s.toLocaleDateString(undefined, options)} – ${e.toLocaleDateString(undefined, options)}`;
    } catch {
      return 'Selected Range';
    }
  };

  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      if (selectedFilter !== 'all' && issue.type !== selectedFilter) return false;
      if (selectedSeverity !== 'all' && issue.severity !== selectedSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = issue.announcementName.toLowerCase().includes(q);
        const matchDesc = issue.description.toLowerCase().includes(q);
        const matchFile = issue.fileName ? issue.fileName.toLowerCase().includes(q) : false;
        const matchTime = issue.timeLabel.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchFile && !matchTime) return false;
      }
      return true;
    });
  }, [issues, selectedFilter, selectedSeverity, searchQuery]);

  type IssueGroup = {
    key: string;
    description: string;
    representative: ScheduleIssue;
    issues: ScheduleIssue[];
    dateSummary: string;
  };

  const buildGroupedIssues = (list: ScheduleIssue[], keyPrefix: string): IssueGroup[] => {
    const groupsMap = new Map<string, IssueGroup>();

    for (const issue of list) {
      const key = `${keyPrefix}:${issue.description}`;
      const existing = groupsMap.get(key);
      if (existing) {
        existing.issues.push(issue);
      } else {
        groupsMap.set(key, {
          key,
          description: issue.description,
          representative: issue,
          issues: [issue],
          dateSummary: issue.timeLabel
        });
      }
    }

    const shortDateFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    for (const group of groupsMap.values()) {
      if (group.issues.length === 1) {
        group.dateSummary = group.issues[0].timeLabel;
      } else {
        const sorted = [...group.issues].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const firstDate = new Date(sorted[0].timestamp);
        const lastDate = new Date(sorted[sorted.length - 1].timestamp);
        const uniqueDays = new Set(sorted.map(i => i.dayKey || formatDateToYmd(new Date(i.timestamp)))).size;
        const firstStr = firstDate.toLocaleDateString(undefined, shortDateFmt);
        const lastStr = lastDate.toLocaleDateString(undefined, shortDateFmt);
        if (firstStr === lastStr) {
          group.dateSummary = `${firstStr} (${group.issues.length} slots)`;
        } else {
          group.dateSummary = `${firstStr} – ${lastStr} (${uniqueDays} ${uniqueDays === 1 ? 'day' : 'days'})`;
        }
      }
    }

    return Array.from(groupsMap.values());
  };

  const { currentFutureIssues, historicalPastIssues, currentFutureGroups, historicalPastGroups } = useMemo(() => {
    const futureList: ScheduleIssue[] = [];
    const pastList: ScheduleIssue[] = [];
    for (const issue of filteredIssues) {
      const tsMs = new Date(issue.timestamp).getTime();
      if (!isNaN(tsMs) && tsMs < nowHourStartMs) {
        pastList.push(issue);
      } else {
        futureList.push(issue);
      }
    }
    return {
      currentFutureIssues: futureList,
      historicalPastIssues: pastList,
      currentFutureGroups: buildGroupedIssues(futureList, 'future'),
      historicalPastGroups: buildGroupedIssues(pastList, 'past')
    };
  }, [filteredIssues, nowHourStartMs]);

  // Auto-set collapsible state based on what exists in the date range's scope:
  // If both exist, expand Current/Future and collapse Historical/Past.
  // If only one exists in scope, expand that one and collapse the other.
  React.useEffect(() => {
    if (!isOpen) return;
    const scopeStartMs = startDateInput ? new Date(`${startDateInput}T00:00:00`).getTime() : nowHourStartMs;
    const scopeEndMs = endDateInput ? new Date(`${endDateInput}T23:59:59`).getTime() : nowHourStartMs + 14 * 86400000;
    const hasFutureInScope = scopeEndMs >= nowHourStartMs || currentFutureIssues.length > 0;
    const hasPastInScope = scopeStartMs < nowHourStartMs || historicalPastIssues.length > 0;

    if (hasFutureInScope && hasPastInScope) {
      if (currentFutureIssues.length === 0 && historicalPastIssues.length > 0) {
        setIsCurrentFutureExpanded(false);
        setIsHistoricalPastExpanded(true);
      } else {
        setIsCurrentFutureExpanded(true);
        setIsHistoricalPastExpanded(false);
      }
    } else if (hasFutureInScope) {
      setIsCurrentFutureExpanded(true);
      setIsHistoricalPastExpanded(false);
    } else if (hasPastInScope) {
      setIsCurrentFutureExpanded(false);
      setIsHistoricalPastExpanded(true);
    }
  }, [isOpen, startDateInput, endDateInput, nowHourStartMs, currentFutureIssues.length, historicalPastIssues.length]);

  if (!isOpen) return null;

  const getSeverityBadge = (severity: ScheduleIssueSeverity, isHistorical = false) => {
    if (isHistorical) {
      const label = severity === 'critical' ? 'Critical' : severity === 'warning' ? 'Warning' : 'Info';
      const IconComp = severity === 'critical' ? AlertOctagon : severity === 'warning' ? AlertTriangle : Info;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-slate-200/80 text-slate-600 border border-slate-300 shrink-0">
          <IconComp className="w-3 h-3 text-slate-500 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-red-100 text-red-800 border border-red-200 shrink-0">
            <AlertOctagon className="w-3 h-3 text-red-600 shrink-0" />
            <span>Critical</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Warning</span>
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
            <Info className="w-3 h-3 text-blue-600 shrink-0" />
            <span>Info</span>
          </span>
        );
    }
  };

  const getTypeBadge = (type: ScheduleIssueType, isHistorical = false) => {
    if (isHistorical) {
      const label =
        type === 'missing_media'
          ? 'Missing Media'
          : type === 'overlap'
            ? 'Dual Media Collision'
            : 'Schedule Gap';
      const IconComp = type === 'missing_media' ? FileQuestion : type === 'overlap' ? Layers : Clock;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-slate-200/70 text-slate-600 border border-slate-300 shrink-0">
          <IconComp className="w-3 h-3 text-slate-500 shrink-0" />
          <span>{label}</span>
        </span>
      );
    }
    switch (type) {
      case 'missing_media':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-slate-100 text-slate-700 border border-slate-250 shrink-0">
            <FileQuestion className="w-3 h-3 text-slate-500 shrink-0" />
            <span>Missing Media</span>
          </span>
        );
      case 'overlap':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-orange-100 text-orange-800 border border-orange-250 shrink-0">
            <Layers className="w-3 h-3 text-orange-600 shrink-0" />
            <span>Dual Media Collision</span>
          </span>
        );
      case 'gap':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight bg-purple-100 text-purple-800 border border-purple-250 shrink-0">
            <Clock className="w-3 h-3 text-purple-600 shrink-0" />
            <span>Schedule Gap</span>
          </span>
        );
    }
  };

  const renderIssueGroupRows = (groups: IssueGroup[], emptyText: string, isHistorical = false) => {
    if (groups.length === 0) {
      return (
        <div
          className={cn(
            'px-3 py-4 text-xs font-semibold text-slate-500 italic text-center',
            isHistorical ? 'bg-slate-100/80' : 'bg-white'
          )}
        >
          {emptyText}
        </div>
      );
    }

    return (
      <div className={cn('divide-y divide-grid-active', isHistorical ? 'bg-slate-100/70' : 'bg-white')}>
        {groups.map((group, idx) => {
          const issue = group.representative;
          const isExpanded = expandedPhrases.has(group.key);
          const hasMultiple = group.issues.length > 1;
          return (
            <div
              key={group.key}
              className={cn(
                'px-2.5 py-2 transition-colors flex flex-col gap-1 min-w-0 w-full border-l-4',
                isHistorical
                  ? cn(
                      'border-l-slate-400 hover:bg-slate-200/60',
                      idx % 2 === 0 ? 'bg-slate-100/70' : 'bg-slate-200/40'
                    )
                  : cn(
                      'hover:bg-slate-50',
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-205',
                      issue.severity === 'critical'
                        ? 'border-l-red-500'
                        : issue.severity === 'warning'
                          ? 'border-l-amber-500'
                          : 'border-l-blue-500'
                    )
              )}
            >
              {/* Top row: Severity, Type, Count, Date Summary badges + Edit/View Announcement Button */}
              <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {getSeverityBadge(issue.severity, isHistorical)}
                  {getTypeBadge(issue.type, isHistorical)}
                  <span
                    className={cn(
                      'text-xs font-extrabold px-2 py-0.5 rounded border shrink-0',
                      isHistorical
                        ? 'text-slate-600 bg-slate-200/70 border-slate-300'
                        : 'text-slate-800 bg-slate-200/80 border-slate-300'
                    )}
                  >
                    {group.issues.length} {group.issues.length === 1 ? 'incident' : 'incidents'}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-mono font-bold px-2 py-0.5 rounded border',
                      isHistorical
                        ? 'text-slate-500 bg-slate-200/50 border-slate-300'
                        : 'text-slate-600 bg-slate-100 border-slate-200'
                    )}
                  >
                    {group.dateSummary}
                  </span>
                  {hasMultiple && (
                    <button
                      type="button"
                      onClick={() => togglePhraseExpanded(group.key)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border cursor-pointer transition-colors shrink-0',
                        isHistorical
                          ? 'text-slate-600 bg-slate-200/70 hover:bg-slate-300/70 border-slate-300'
                          : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200'
                      )}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <span>{isExpanded ? 'Hide dates' : `Show dates (${group.issues.length})`}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onLocateInCalendar(issue)}
                  className={cn(
                    'px-2 py-0.5 rounded border text-xs font-black uppercase tracking-tight flex items-center gap-1 cursor-pointer transition-colors shadow-2xs shrink-0 h-6',
                    isHistorical
                      ? 'bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 border-slate-300'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                  )}
                  title={isHistorical ? 'View this announcement' : 'Edit this announcement'}
                >
                  {isHistorical ? <Eye className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>{isHistorical ? 'View Announcement' : 'Edit Announcement'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Announcement Name & Description on compact gate-media-style rows */}
              <div
                className={cn(
                  'flex items-center gap-1.5 text-xs font-extrabold truncate',
                  isHistorical ? 'text-slate-600' : 'text-slate-900'
                )}
              >
                <span className="truncate">{issue.announcementName}</span>
                {issue.fileName && (
                  <span className="font-mono text-slate-500 font-normal truncate">
                    ({issue.fileName})
                  </span>
                )}
              </div>

              <p className={cn('text-xs font-medium leading-relaxed', isHistorical ? 'text-slate-500' : 'text-slate-600')}>
                {group.description}
              </p>

              {/* Collapsible sub-records for each date/time instance */}
              {hasMultiple && isExpanded && (
                <div className="mt-1 pt-1.5 border-t border-slate-200/80 flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {group.issues.map((subIssue) => (
                    <div
                      key={subIssue.id}
                      className={cn(
                        'flex items-center justify-between gap-2 px-2.5 py-1 rounded text-xs border',
                        isHistorical
                          ? 'bg-slate-200/50 hover:bg-slate-200/80 border-slate-300/70'
                          : 'bg-slate-100/80 hover:bg-slate-200/60 border-slate-200/70'
                      )}
                    >
                      <span className={cn('font-mono font-bold', isHistorical ? 'text-slate-600' : 'text-slate-700')}>
                        {subIssue.timeLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => onLocateInCalendar(subIssue)}
                        className={cn(
                          'text-xs font-bold hover:underline flex items-center gap-1 cursor-pointer shrink-0',
                          isHistorical ? 'text-slate-600' : 'text-blue-700'
                        )}
                      >
                        <span>Open at slot</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const totalGroupCount = currentFutureGroups.length + historicalPastGroups.length;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-[100] animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg border shrink-0",
              summary.total > 0
                ? (summary.criticalCount > 0 ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200")
                : "bg-emerald-50 text-emerald-600 border-emerald-200"
            )}>
              {summary.total > 0 ? (
                <ListChecks className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Issues Audit
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {formatDateRange(scopeStartDate, scopeEndDate)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Check for unassigned media, schedule gaps, and schedule overlaps.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            title="Close Audit"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Filter Toolbar */}
        <div className="p-3 sm:px-5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-tight">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Date Range:</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <CalendarDateInput
                value={startDateInput}
                onChange={d => setStartDateInput(d)}
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs h-6.5"
              />
              <span className="text-slate-400 font-normal">to</span>
              <CalendarDateInput
                value={endDateInput}
                onChange={d => setEndDateInput(d)}
                className="px-2 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs h-6.5"
              />
            </div>
          </div>
        </div>

        {/* Filter Toolbar & Summary Bar */}
        <div className="p-3 sm:px-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Categorical Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-tight mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border",
                selectedFilter === 'all'
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
              )}
            >
              All ({summary.total})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('missing_media')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'missing_media'
                  ? "bg-red-600 text-white border-red-600 shadow-xs"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              <span>Missing Media</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.missingMediaCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('overlap')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'overlap'
                  ? "bg-orange-600 text-white border-orange-600 shadow-xs"
                  : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
              )}
            >
              <span>Dual Media Collisions</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.overlapCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('gap')}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-tight transition-all cursor-pointer border flex items-center gap-1",
                selectedFilter === 'gap'
                  ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                  : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
              )}
            >
              <span>Gaps</span>
              <span className="px-1 py-0.2 rounded-full bg-white/20 text-[10px]">
                {summary.gapCount}
              </span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative shrink-0 sm:w-56">
            <input
              type="text"
              placeholder="Search diagnosed issues..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1 bg-slate-50 border border-slate-250 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 font-sans text-slate-800 placeholder-slate-400 h-8"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Audit Content Area: Split into Collapsible Current/Future and Historical/Past Sections */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar min-h-0 bg-slate-50/40 space-y-2.5">
          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="p-4 rounded-full bg-emerald-100 text-emerald-600 mb-3 border border-emerald-200">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {issues.length === 0 ? "No Schedule Anomalies Detected" : "No Matching Issues Found"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mt-1 font-medium leading-relaxed">
                {issues.length === 0
                  ? "All announcements have assigned media, no gaps, and no overlaps."
                  : "No issues match your current filter and search criteria. Try clearing the filter or adjusting search terms."}
              </p>
              {issues.length > 0 && selectedFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilter('all');
                    setSelectedSeverity('all');
                    setSearchQuery('');
                  }}
                  className="mt-4 px-3.5 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Reset Filters ({issues.length} total issues)
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 1. Collapsible Current / Future Section */}
              <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                <button
                  type="button"
                  onClick={() => setIsCurrentFutureExpanded(prev => !prev)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wider bg-blue-100/80 text-blue-950 hover:bg-blue-200/70 transition-colors cursor-pointer select-none"
                >
                  <span className="flex items-center gap-1.5">
                    {isCurrentFutureExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-blue-700" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-blue-700" />
                    )}
                    <Calendar className="w-3.5 h-3.5 text-blue-700" />
                    <span>
                      Current / Future ({currentFutureGroups.length} {currentFutureGroups.length === 1 ? 'group' : 'groups'} • {currentFutureIssues.length} {currentFutureIssues.length === 1 ? 'incident' : 'incidents'})
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-blue-800 normal-case tracking-normal">
                    {isCurrentFutureExpanded ? 'Hide current/future' : 'Show current/future'}
                  </span>
                </button>
                {isCurrentFutureExpanded && (
                  <div className="border-t border-slate-300">
                    {renderIssueGroupRows(
                      currentFutureGroups,
                      'No current or future issues in the selected date range.',
                      false
                    )}
                  </div>
                )}
              </div>

              {/* 2. Collapsible Historical / Past Section */}
              <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100/80 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setIsHistoricalPastExpanded(prev => !prev)}
                  className="w-full px-2.5 py-1.5 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer select-none"
                >
                  <span className="flex items-center gap-1.5">
                    {isHistoricalPastExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      Historical / Past ({historicalPastGroups.length} {historicalPastGroups.length === 1 ? 'group' : 'groups'} • {historicalPastIssues.length} {historicalPastIssues.length === 1 ? 'incident' : 'incidents'})
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 normal-case tracking-normal">
                    {isHistoricalPastExpanded ? 'Hide historical/past' : 'Show historical/past'}
                  </span>
                </button>
                {isHistoricalPastExpanded && (
                  <div className="border-t border-slate-300">
                    {renderIssueGroupRows(
                      historicalPastGroups,
                      'No historical or past issues in the selected date range.',
                      true
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs font-bold text-slate-500">
            Showing {totalGroupCount} summary {totalGroupCount === 1 ? 'group' : 'groups'} ({filteredIssues.length} of {issues.length} diagnosed {issues.length === 1 ? 'incident' : 'incidents'})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black uppercase tracking-tight cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
