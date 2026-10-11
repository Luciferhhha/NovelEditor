import type { PlainSegment } from '../types';

export interface DerivedText {
  text: string;
  segments: PlainSegment[];
}

/**
 * 单遍扫描 Markdown 源码，派生纯文本 + 分段偏移映射。
 * 规则：丢弃语法字符，保留正文字符（长度 1:1），因此 text[ts..ts+len] === src[ss..ss+len]。
 */
export function mdToPlainText(md: string): DerivedText {
  let text = '';
  const segments: PlainSegment[] = [];
  let textLen = 0;

  const emit = (srcStart: number, len: number) => {
    if (len <= 0) return;
    const last = segments[segments.length - 1];
    if (last && last[1] + last[2] === srcStart) {
      last[2] += len;
    } else {
      segments.push([textLen, srcStart, len]);
    }
    text += md.slice(srcStart, srcStart + len);
    textLen += len;
  };

  let inFence = false;
  const lines = splitLines(md);
  for (const line of lines) {
    const { start, content, end } = line; // end 指向换行符（或文件末尾）
    const trimmed = content.trimStart();
    const indentLen = content.length - trimmed.length;

    if (/^ {0,3}(\`\`\`|~~~)/.test(trimmed)) {
      inFence = !inFence;
      // 围栏标记行本身丢弃，但换行保留（落入下方统一处理）
    } else if (inFence) {
      emit(start, end - start);
    } else if (/^ {0,3}#{1,6}\s+/.test(trimmed)) {
      const m = /^ {0,3}#{1,6}\s+/.exec(trimmed)!;
      const from = start + indentLen + m[0].length;
      emit(from, end - from);
    } else if (/^ {0,3}(-{3,}|\*{3,}|_{3,})[ \t]*$/.test(trimmed)) {
      // 分隔线：整行丢弃
    } else if (/^ {0,3}>[ \t]?/.test(trimmed)) {
      const m = /^ {0,3}>[ \t]?/.exec(trimmed)!;
      const from = start + indentLen + m[0].length;
      emit(from, end - from);
    } else {
      let lineStart = start;
      let lineContent = content;
      let listM: RegExpExecArray | null;
      while ((listM = /^(?:[-*+][ \t]+|\d+[.)][ \t]+|\[[ xX]\][ \t]+)/.exec(lineContent))) {
        lineStart += listM[0].length;
        lineContent = lineContent.slice(listM[0].length);
      }
      if (lineContent.trim().length > 0) {
        if (trimmed.startsWith('|') && trimmed.indexOf('|', 1) !== -1) {
          emitTableRuns(md, lineStart, lineContent.length, emit);
        } else {
          emitInlineRuns(md, lineStart, lineContent.length, emit);
        }
      }
    }
    // 行尾换行符保留（空行也因此保留换行，保证段落分隔）
    if (end < md.length && md[end] === '\n') {
      emit(end, 1);
    }
  }
  return { text, segments };
}

interface LineInfo { start: number; content: string; end: number; }

function splitLines(md: string): LineInfo[] {
  const out: LineInfo[] = [];
  let start = 0;
  for (;;) {
    const nl = md.indexOf('\n', start);
    if (nl === -1) {
      out.push({ start, content: md.slice(start), end: md.length });
      break;
    }
    out.push({ start, content: md.slice(start, nl), end: nl });
    start = nl + 1;
  }
  return out;
}

/** 表格行：竖线丢弃，单元格内容走内联过滤 */
function emitTableRuns(md: string, start: number, len: number, emit: (s: number, n: number) => void) {
  const s = md.slice(start, start + len);
  let i = 0;
  while (i < s.length) {
    if (s[i] === '|') { i++; continue; }
    let j = i;
    while (j < s.length && s[j] !== '|') j++;
    emitInlineRuns(md, start + i, j - i, emit);
    i = j;
  }
}

/** 内联语法过滤：丢弃语法标记，保留正文字符 */
function emitInlineRuns(md: string, start: number, len: number, emit: (s: number, n: number) => void) {
  const s = md.slice(start, start + len);
  let i = 0;
  let runStart = -1;
  const flush = (until: number) => {
    if (runStart >= 0 && until > runStart) emit(start + runStart, until - runStart);
    runStart = -1;
  };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      flush(i);
      emit(start + i + 1, 1);
      i += 2;
      continue;
    }
    if (c === '`') {
      const close = s.indexOf('`', i + 1);
      if (close === -1) { i++; continue; }
      flush(i);
      emit(start + i + 1, close - (i + 1));
      i = close + 1;
      continue;
    }
    if (c === '!' && s[i + 1] === '[') {
      flush(i);
      const closeAlt = s.indexOf(']', i + 2);
      if (closeAlt === -1) { i++; continue; }
      emit(start + i + 2, closeAlt - (i + 2));
      let j = closeAlt + 1;
      if (s[j] === '(') { const p = s.indexOf(')', j); j = p === -1 ? s.length : p + 1; }
      else if (s[j] === '[') { const p = s.indexOf(']', j); j = p === -1 ? s.length : p + 1; }
      i = j;
      continue;
    }
    if (c === '[') {
      flush(i);
      const closeText = s.indexOf(']', i + 1);
      if (closeText === -1) { i++; continue; }
      emitInlineRuns(md, start + i + 1, closeText - (i + 1), emit);
      let j = closeText + 1;
      if (s[j] === '(') { const p = s.indexOf(')', j); j = p === -1 ? s.length : p + 1; }
      else if (s[j] === '[') { const p = s.indexOf(']', j); j = p === -1 ? s.length : p + 1; }
      i = j;
      continue;
    }
    if (c === '<') {
      const gt = s.indexOf('>', i + 1);
      if (gt !== -1) { flush(i); i = gt + 1; continue; }
      i++;
      continue;
    }
    if (c === '*' || c === '_' || c === '~') {
      flush(i);
      i++;
      continue;
    }
    if (runStart < 0) runStart = i;
    i++;
  }
  flush(s.length);
}
