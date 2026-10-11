import { fnv1a } from './fingerprint';

export interface ScoreInput {
  id: string;
  textLength: number;
}

export interface HitLike {
  aIdx: number;
  bIdx: number;
  startA: number;
  endA: number;
  startB: number;
  endB: number;
}

export interface ChapterScore {
  level: 'warn' | 'bad' | null;
  dupCount: number;
  dupRatio: number;
  dupChars: number;
}

export interface ScoreRules {
  minFragLen: number;
  badFragLen: number;
  flagBadRatio: number;
  flagWarnRatio: number;
}

/** 章节分级：bad ≥100 字重复或占比 ≥5%；warn ≥2 处或占比 1%~5% */
export function scoreChapters(chapters: ScoreInput[], hits: HitLike[], rules: ScoreRules): ChapterScore[] {
  const per = chapters.map(() => ({ ranges: [] as [number, number][], count: 0 }));
  for (const h of hits) {
    per[h.aIdx].ranges.push([h.startA, h.endA]);
    per[h.aIdx].count++;
    per[h.bIdx].ranges.push([h.startB, h.endB]);
    per[h.bIdx].count++;
  }
  return per.map((p, i) => {
    const merged = mergeRanges(p.ranges);
    const dupChars = merged.reduce((s, [a, b]) => s + (b - a), 0);
    const len = chapters[i].textLength;
    const ratio = len > 0 ? dupChars / len : 0;
    const maxFrag = merged.reduce((m, [a, b]) => Math.max(m, b - a), 0);
    let level: 'warn' | 'bad' | null = null;
    if (p.count > 0) {
      if (maxFrag >= rules.badFragLen || ratio >= rules.flagBadRatio) level = 'bad';
      else if (p.count >= 2 || ratio >= rules.flagWarnRatio) level = 'warn';
      else if (maxFrag >= rules.minFragLen) level = 'warn';
    }
    return { level, dupCount: p.count, dupRatio: ratio, dupChars };
  });
}

export function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else out.push(sorted[i]);
  }
  return out;
}

/** 命中内容签名：跨次查重继承"忽略"状态用 */
export function hitSig(idA: string, textA: string, sA: number, eA: number, idB: string, textB: string, sB: number, eB: number): string {
  const [x, y] = idA <= idB ? [idA, idB] : [idB, idA];
  const [tx, sx, ex] = idA <= idB ? [textA, sA, eA] : [textB, sB, eB];
  const [ty, sy, ey] = idA <= idB ? [textB, sB, eB] : [textA, sA, eA];
  const h1 = fnv1a(tx.slice(sx, ex));
  const h2 = fnv1a(ty.slice(sy, ey));
  return x + '|' + y + '|' + h1.toString(36) + '|' + h2.toString(36);
}
