/** 分段 / 分句（供报告摘录与后续扩展使用） */

export function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if ('。！？；…!?;'.includes(ch)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** 取偏移处的上下文摘录 */
export function excerpt(text: string, start: number, end: number, radius = 20): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
}
