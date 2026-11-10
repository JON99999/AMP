import React from 'react';
import {
  AMP_TXT_FORMAT_COMMENT,
  stripHtmlComments,
  hasInlineFormattingMarkers,
  serializeTxtScriptContent,
  stripFormattingMarkers,
  parseReadTimeToSeconds,
  formatSecondsToMinSec,
  normalizeReadTimeDisplay,
  calculateLiveReadWordStats,
  markdownTxtToEditableHtml,
  editableHtmlToMarkdownTxt,
  sanitizeClipboardToEditableHtml,
  markdownTxtToRichClipboardHtml,
  markdownTxtToRtf
} from './liveReadTextUtils';

export {
  AMP_TXT_FORMAT_COMMENT,
  stripHtmlComments,
  hasInlineFormattingMarkers,
  serializeTxtScriptContent,
  stripFormattingMarkers,
  parseReadTimeToSeconds,
  formatSecondsToMinSec,
  normalizeReadTimeDisplay,
  calculateLiveReadWordStats,
  markdownTxtToEditableHtml,
  editableHtmlToMarkdownTxt,
  sanitizeClipboardToEditableHtml,
  markdownTxtToRichClipboardHtml,
  markdownTxtToRtf
};

/**
 * Parses a single string with restricted inline formatting (***bold+italic***, **bold**, __underline__, <u>underline</u>, *italic*)
 * into React nodes while preserving all whitespace and line breaks.
 */
export function parseRestrictedInlineFormatting(text: string, keyPrefix: string = 'fmt'): React.ReactNode[] {
  if (!text) return [];
  const tokenRegex = /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|<u>[\s\S]+?<\/u>|\*[^*\n]+\*)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      const inner = token.slice(3, -3);
      parts.push(
        <strong key={key} className="font-black text-slate-950 dark:text-white">
          <em className="italic">{parseRestrictedInlineFormatting(inner, `${key}-bi`)}</em>
        </strong>
      );
    } else if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      parts.push(
        <strong key={key} className="font-black text-slate-950 dark:text-white">
          {parseRestrictedInlineFormatting(inner, `${key}-b`)}
        </strong>
      );
    } else if (token.startsWith('__') && token.endsWith('__') && token.length > 4) {
      const inner = token.slice(2, -2);
      parts.push(
        <u key={key} className="underline decoration-2 underline-offset-4">
          {parseRestrictedInlineFormatting(inner, `${key}-u`)}
        </u>
      );
    } else if (/^<u>[\s\S]+<\/u>$/i.test(token)) {
      const inner = token.slice(3, -4);
      parts.push(
        <u key={key} className="underline decoration-2 underline-offset-4">
          {parseRestrictedInlineFormatting(inner, `${key}-u2`)}
        </u>
      );
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      const inner = token.slice(1, -1);
      parts.push(
        <em key={key} className="italic">
          {parseRestrictedInlineFormatting(inner, `${key}-i`)}
        </em>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Renders a .txt script with HTML comments stripped, exact line breaks preserved (whitespace-pre-wrap),
 * and Bold (**text**), Italic (*text*), Bold+Italic (***text***), and Underline (__text__ / <u>text</u>) applied.
 */
export function renderFormattedTxtContent(rawText: string): React.ReactNode {
  const cleaned = stripHtmlComments(rawText || '');
  if (!cleaned.trim()) {
    return (
      <p className="text-slate-400 italic font-medium text-center py-20">
        Script content is empty.
      </p>
    );
  }
  return parseRestrictedInlineFormatting(cleaned, 'txt');
}
