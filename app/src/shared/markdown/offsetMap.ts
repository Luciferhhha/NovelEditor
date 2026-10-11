import type { PlainSegment } from '../types';
import { mdToPlainText, type DerivedText } from './mdToPlainText';

export { mdToPlainText };

/** text offset -> src offset（落在被丢弃区间时吸附到最近保留位置） */
export function textToSrc(segments: PlainSegment[], textOffset: number): number {
  if (segments.length === 0) return 0;
  for (const [ts, ss, len] of segments) {
    if (textOffset >= ts && textOffset < ts + len) return ss + (textOffset - ts);
  }
  // 末尾或间隙：取前一段的结束位置
  let best = segments[0][1];
  for (const [ts, ss, len] of segments) {
    if (ts + len <= textOffset) best = ss + len;
    else break;
  }
  return best;
}

/** text 区间 -> src 区间，保证至少覆盖到一个保留字符 */
export function textRangeToSrc(segments: PlainSegment[], start: number, end: number): { srcStart: number; srcEnd: number } {
  const srcStart = textToSrc(segments, start);
  const srcEnd = end - 1 <= start ? srcStart : textToSrc(segments, end - 1) + 1;
  return { srcStart, srcEnd: Math.max(srcStart, srcEnd) };
}

/** src offset -> text offset（不在保留区间时返回 null） */
export function srcToText(segments: PlainSegment[], srcOffset: number): number | null {
  for (const [ts, ss, len] of segments) {
    if (srcOffset >= ss && srcOffset < ss + len) return ts + (srcOffset - ss);
  }
  return null;
}

export function parsePlainMap(json: string | null | undefined): PlainSegment[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((t: number[]) => [t[0], t[1], t[2]] as PlainSegment);
  } catch {
    return [];
  }
}

export function serializePlainMap(segments: PlainSegment[]): string {
  return JSON.stringify(segments);
}

export type { DerivedText };
