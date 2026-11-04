import React from 'react';

export const AMP_TXT_FORMAT_COMMENT =
  '<!-- Note: This is formatted as a .md markdown file, but is saved as a .txt text file. Bold is shown by **text**. Italic is shown by *text*, and Underline is shown by __text__. -->';

/**
 * Strips HTML/Markdown comments (<!-- ... -->) from script text for display and word counting.
 */
export function stripHtmlComments(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->\r?\n?/g, '');
}

/**
 * Checks whether the script body uses inline Bold (**text**), Italic (*text*), Bold+Italic (***text***), or Underline (__text__ / <u>text</u>).
 */
export function hasInlineFormattingMarkers(text: string): boolean {
  if (!text) return false;
  const cleaned = stripHtmlComments(text);
  return /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|<u>[\s\S]+?<\/u>|(?<!\*)\*[^*\n]+\*(?!\*))/.test(cleaned);
}

/**
 * Serializes script body for saving as a .txt file.
 * If inline Bold, Italic, or Underline markers are present, prepends the explanatory HTML comment
 * so anyone opening the .txt file in Notepad/TextEdit understands the symbols while AMP hides it.
 */
export function serializeTxtScriptContent(bodyText: string): string {
  const cleanBody = stripHtmlComments(bodyText || '');
  if (hasInlineFormattingMarkers(cleanBody)) {
    return `${AMP_TXT_FORMAT_COMMENT}\n${cleanBody}`;
  }
  return cleanBody;
}

/**
 * Strips inline formatting markers for plain word-count calculation.
 */
export function stripFormattingMarkers(text: string): string {
  const withoutComments = stripHtmlComments(text || '');
  return withoutComments
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/<u>([\s\S]+?)<\/u>/gi, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
}

/**
 * Parses a read time string (e.g., "0m30s", "0:30", "30s", "00 min 30 sec", "~0:45", "45") into total seconds.
 */
export function parseReadTimeToSeconds(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/^~\s*/, '').trim();
  if (!cleaned) return 0;

  const minSecMatch = cleaned.match(/^(\d+)\s*m(?:in(?:ute)?s?)?\s*(\d+)\s*s(?:ec(?:ond)?s?)?$/i);
  if (minSecMatch) {
    const mins = parseInt(minSecMatch[1], 10) || 0;
    const secs = parseInt(minSecMatch[2], 10) || 0;
    return mins * 60 + secs;
  }

  const colonMatch = cleaned.match(/^(\d*):(\d{1,2})$/);
  if (colonMatch) {
    const mins = colonMatch[1] ? parseInt(colonMatch[1], 10) || 0 : 0;
    const secs = parseInt(colonMatch[2], 10) || 0;
    return mins * 60 + secs;
  }

  const onlyMinMatch = cleaned.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/i);
  if (onlyMinMatch) {
    return (parseInt(onlyMinMatch[1], 10) || 0) * 60;
  }

  const onlySecMatch = cleaned.match(/^(\d+)\s*s(?:ec(?:ond)?s?)?$/i);
  if (onlySecMatch) {
    return parseInt(onlySecMatch[1], 10) || 0;
  }

  return 0;
}

/**
 * Formats a total number of seconds into "0m30s" format.
 */
export function formatSecondsToMinSec(totalSeconds: number): string {
  const safeSecs = Math.max(0, Math.round(totalSeconds || 0));
  const mins = Math.floor(safeSecs / 60);
  const secs = safeSecs % 60;
  return `${mins}m${String(secs).padStart(2, '0')}s`;
}

/**
 * Normalizes any stored or user-entered read-time string (e.g., "0m30s", "0:30", "30s", "~0:30", "00 min 30 sec") into "0m30s" display format.
 */
export function normalizeReadTimeDisplay(raw: string | undefined | null): string {
  if (!raw) return '';
  const cleaned = String(raw).replace(/^~\s*/, '').trim();
  if (!cleaned) return '';
  if (
    /^\d+\s*m(?:in(?:ute)?s?)?\s*\d+\s*s(?:ec(?:ond)?s?)?$/i.test(cleaned) ||
    /^\d*:\d{1,2}$/.test(cleaned) ||
    /^\d+\s*s(?:ec(?:ond)?s?)?$/i.test(cleaned) ||
    /^\d+\s*m(?:in(?:ute)?s?)?$/i.test(cleaned)
  ) {
    const secs = parseReadTimeToSeconds(cleaned);
    return formatSecondsToMinSec(secs);
  }
  return cleaned;
}

/**
 * Computes live word count and ~150 WPM approximate read time ("0m30s").
 */
export function calculateLiveReadWordStats(text: string): {
  wordCount: number;
  estimatedSeconds: number;
  formattedReadTime: string;
} {
  const plain = stripFormattingMarkers(text).trim();
  if (!plain) {
    return { wordCount: 0, estimatedSeconds: 0, formattedReadTime: '0m00s' };
  }
  const words = plain.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  // ~150 words per minute (2.5 words per second), rounded to nearest 5 seconds (minimum 5s if non-empty)
  const rawSeconds = Math.ceil(wordCount / 2.5);
  const estimatedSeconds = Math.max(5, Math.ceil(rawSeconds / 5) * 5);
  return {
    wordCount,
    estimatedSeconds,
    formattedReadTime: formatSecondsToMinSec(estimatedSeconds)
  };
}

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

function escapeHtmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseInlineMarkdownToHtml(text: string): string {
  if (!text) return '';
  const tokenRegex = /(\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|<u>[\s\S]+?<\/u>|\*[^*\n]+\*)/gi;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtmlEntities(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***') && token.length > 6) {
      const inner = token.slice(3, -3);
      result += `<strong><em>${parseInlineMarkdownToHtml(inner)}</em></strong>`;
    } else if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      result += `<strong>${parseInlineMarkdownToHtml(inner)}</strong>`;
    } else if (token.startsWith('__') && token.endsWith('__') && token.length > 4) {
      const inner = token.slice(2, -2);
      result += `<u>${parseInlineMarkdownToHtml(inner)}</u>`;
    } else if (/^<u>[\s\S]+<\/u>$/i.test(token)) {
      const inner = token.slice(3, -4);
      result += `<u>${parseInlineMarkdownToHtml(inner)}</u>`;
    } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      const inner = token.slice(1, -1);
      result += `<em>${parseInlineMarkdownToHtml(inner)}</em>`;
    } else {
      result += escapeHtmlEntities(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    result += escapeHtmlEntities(text.substring(lastIndex));
  }
  return result;
}

/**
 * Converts a stored Markdown-in-.txt string into sanitized HTML for the WYSIWYG contentEditable editor.
 */
export function markdownTxtToEditableHtml(rawText: string): string {
  const cleaned = stripHtmlComments(rawText || '').replace(/\r\n/g, '\n');
  if (!cleaned) return '';
  const lines = cleaned.split('\n');
  return lines.map(line => parseInlineMarkdownToHtml(line)).join('<br>');
}

interface StyleFlags {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface StyledSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  isLineBreak?: boolean;
}

function wrapSegmentWithMarkers(text: string, bold: boolean, italic: boolean, underline: boolean): string {
  if (!text) return '';
  if (!bold && !italic && !underline) return text;

  const leadMatch = text.match(/^[ \t]+/);
  const trailMatch = text.match(/[ \t]+$/);
  const lead = leadMatch ? leadMatch[0] : '';
  const trail = trailMatch && trailMatch[0].length < text.length ? trailMatch[0] : '';
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core) return text;

  let wrapped = core;
  if (bold && italic) {
    wrapped = `***${wrapped}***`;
  } else if (bold) {
    wrapped = `**${wrapped}**`;
  } else if (italic) {
    wrapped = `*${wrapped}*`;
  }
  if (underline) {
    wrapped = `__${wrapped}__`;
  }

  return `${lead}${wrapped}${trail}`;
}

/**
 * Converts the DOM contents of the direct rich-text contentEditable editor back into clean Markdown-in-.txt body text.
 */
export function editableHtmlToMarkdownTxt(root: HTMLElement): string {
  const segments: StyledSegment[] = [];

  const pushLineBreak = () => {
    segments.push({ text: '\n', bold: false, italic: false, underline: false, isLineBreak: true });
  };

  const walk = (node: Node, flags: StyleFlags) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = (node.nodeValue || '').replace(/\u00A0/g, ' ');
      if (!val) return;
      const parts = val.split('\n');
      parts.forEach((part, idx) => {
        if (idx > 0) pushLineBreak();
        if (part) {
          segments.push({
            text: part,
            bold: flags.bold,
            italic: flags.italic,
            underline: flags.underline
          });
        }
      });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR') {
      pushLineBreak();
      return;
    }

    const isBlock = tag === 'DIV' || tag === 'P' || tag === 'LI' || tag === 'SECTION' || tag === 'ARTICLE';
    if (isBlock && segments.length > 0 && !segments[segments.length - 1].isLineBreak) {
      pushLineBreak();
    }

    const styleAttr = (el.getAttribute('style') || '').toLowerCase();
    const nextFlags: StyleFlags = {
      bold:
        flags.bold ||
        tag === 'B' ||
        tag === 'STRONG' ||
        /font-weight\s*:\s*(bold|[6-9]00)/.test(styleAttr),
      italic:
        flags.italic ||
        tag === 'I' ||
        tag === 'EM' ||
        /font-style\s*:\s*italic/.test(styleAttr),
      underline:
        flags.underline ||
        tag === 'U' ||
        /text-decoration[^;]*underline/.test(styleAttr)
    };

    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      walk(children[i], nextFlags);
    }
  };

  walk(root, { bold: false, italic: false, underline: false });

  // Coalesce adjacent text segments that share identical style flags on the same line
  const merged: StyledSegment[] = [];
  for (const seg of segments) {
    if (seg.isLineBreak) {
      merged.push(seg);
      continue;
    }
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !prev.isLineBreak &&
      prev.bold === seg.bold &&
      prev.italic === seg.italic &&
      prev.underline === seg.underline
    ) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  let out = '';
  for (const seg of merged) {
    if (seg.isLineBreak) {
      out += '\n';
    } else {
      out += wrapSegmentWithMarkers(seg.text, seg.bold, seg.italic, seg.underline);
    }
  }

  return out.replace(/\n{4,}/g, '\n\n\n').replace(/\n$/, '');
}
