export interface OutlineItem {
  level: number;
  title: string;
  /** 标题行在源码中的起止偏移 */
  start: number;
  end: number;
}

/** 提取 ATX 标题大纲 */
export function extractOutline(md: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let pos = 0;
  let inFence = false;
  for (const line of md.split('\n')) {
    const trimmed = line.trimStart();
    if (/^```|^~~~/.test(trimmed)) inFence = !inFence;
    if (!inFence) {
      const m = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (m) {
        const indent = line.length - trimmed.length;
        const start = pos + indent;
        items.push({
          level: m[1].length,
          title: m[2].replace(/\s+#+\s*$/, '').trim(),
          start,
          end: pos + line.length,
        });
      }
    }
    pos += line.length + 1;
  }
  return items;
}
