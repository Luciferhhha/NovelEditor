import { normalize, normRangeToOrig, type Normalized } from './normalize';
import { gramHashes } from './fingerprint';
import { InvertedIndex } from './inverted';
import type { CheckParams } from '../types';

export interface ChapterInput {
  id: string;
  text: string;
}

export interface Prepared {
  id: string;
  orig: string;
  norm: Normalized;
  hashes: Int32Array;
}

export interface RawHit {
  aIdx: number;
  bIdx: number;
  /** 原文（content_text）偏移 */
  startA: number;
  endA: number;
  startB: number;
  endB: number;
  similarity: number;
  kind: 'exact' | 'near';
}

const MIN_SHARED = 3;      // 候选对最少共享指纹数
const MAX_POSTINGS = 150;  // 超过此频次的指纹视为通用噪声
const CHAIN_GAP = 15;      // 近似片段串联的最大间隙（归一化坐标）
const MAX_SEEDS = 8000;    // 单对种子上限

export function prepare(chapters: ChapterInput[], params: CheckParams): Prepared[] {
  return chapters.map(c => {
    const norm = normalize(c.text);
    return { id: c.id, orig: c.text, norm, hashes: gramHashes(norm.norm, params.n) };
  });
}

interface Frag { sa: number; ea: number; sb: number; eb: number; }

/** 全量检测：返回原文坐标下的命中列表 */
export function detectAll(
  prepared: Prepared[],
  params: CheckParams,
  onProgress?: (done: number, total: number) => void,
): RawHit[] {
  // 1) 倒排索引
  const index = new InvertedIndex();
  const perChapterHashes: Int32Array[] = [];
  for (let i = 0; i < prepared.length; i++) {
    perChapterHashes.push(prepared[i].hashes);
    index.addChapter(i, prepared[i].hashes, params.w);
    onProgress?.(i + 1, prepared.length);
  }

  // 2) 候选对
  const pairCount = new Map<number, number>();
  for (const postings of iterateValues(index)) {
    if (postings.length < 2 || postings.length > MAX_POSTINGS) continue;
    for (let i = 0; i < postings.length; i++) {
      const pi = postings[i];
      const ci = Math.floor(pi / (1 << 26));
      for (let j = i + 1; j < postings.length; j++) {
        const cj = Math.floor(postings[j] / (1 << 26));
        if (ci === cj) continue;
        const key = ci * 100000 + cj;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  // 3) 逐对扩展验证
  const hits: RawHit[] = [];
  let donePairs = 0;
  for (const [key, count] of pairCount) {
    const a = Math.floor(key / 100000);
    const b = key % 100000;
    if (count >= MIN_SHARED) {
      hits.push(...detectPair(prepared, a, b, params));
    }
    donePairs++;
    if (donePairs % 20 === 0) onProgress?.(prepared.length + donePairs, prepared.length + pairCount.size);
  }
  onProgress?.(1, 1);
  return hits;
}

function* iterateValues(index: InvertedIndex): Generator<number[]> {
  // 通过内部 map 迭代（借助 get 的封装）
  const anyIdx = index as unknown as { map?: Map<number, number[]> };
  const m = anyIdx.map;
  if (!m) return;
  for (const arr of m.values()) yield arr;
}

function detectPair(prepared: Prepared[], a: number, b: number, params: CheckParams): RawHit[] {
  const pa = prepared[a];
  const pb = prepared[b];
  const index = new InvertedIndex();
  // 重建该对的种子：只对 a 的指纹查 b 的位置
  index.addChapter(b, pb.hashes, params.w);

  const frags: Frag[] = [];
  const seen = new Set<number>();
  let seeds = 0;
  for (let i = 0; i < pa.hashes.length && seeds < MAX_SEEDS; i++) {
    const postings = index.get(pa.hashes[i]);
    if (!postings) continue;
    for (const packed of postings) {
      const posB = packed & ((1 << 26) - 1);
      const key = i * 1e9 + posB;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds++;
      const frag = extend(pa.norm.norm, pb.norm.norm, i, posB);
      if (frag) frags.push(frag);
    }
  }
  if (frags.length === 0) return [];

  // 去重：按 A 位置排序，丢弃被包含的片段
  frags.sort((x, y) => x.sa - y.sa || x.sb - y.sb);
  const kept: Frag[] = [];
  for (const f of frags) {
    const inside = kept.some(k => f.sa >= k.sa && f.ea <= k.ea && f.sb >= k.sb && f.eb <= k.eb);
    if (!inside) kept.push(f);
  }

  const out: RawHit[] = [];
  const exactRanges: Frag[] = [];
  const shorts: Frag[] = [];
  for (const f of kept) {
    const len = f.ea - f.sa;
    if (len >= params.minFragLen) { exactRanges.push(f); out.push(makeHit(a, b, f, pa, pb, 1, 'exact')); }
    else shorts.push(f);
  }

  // 近似：短片段按间隙串联，跨度足够且 Dice 达标才报告
  const chains = chainFrags(shorts, CHAIN_GAP);
  for (const chain of chains) {
    if (chain.length === 0) continue;
    const fa = chain[0].sa;
    const ea = Math.max(...chain.map(f => f.ea));
    const fb = chain[0].sb;
    const eb = Math.max(...chain.map(f => f.eb));
    const spanA = ea - fa;
    const spanB = eb - fb;
    if (Math.max(spanA, spanB) < params.minFragLen) continue;
    // 与 exact 命中重叠超过一半则跳过（避免重复报告）
    const overlap = exactRanges.some(r => rangesOverlap(r.sa, r.ea, fa, ea) && rangesOverlap(r.sb, r.eb, fb, eb));
    if (overlap) continue;
    const sim = diceBigrams(pa.norm.norm.slice(fa, ea), pb.norm.norm.slice(fb, eb));
    if (sim >= params.nearThreshold) {
      out.push(makeHit(a, b, { sa: fa, ea, sb: fb, eb }, pa, pb, sim, 'near'));
    }
  }
  return out;
}

function extend(na: string, nb: string, i: number, j: number): Frag | null {
  let sa = i, sb = j;
  while (sa > 0 && sb > 0 && na[sa - 1] === nb[sb - 1]) { sa--; sb--; }
  let ea = i, eb = j;
  const maxA = na.length, maxB = nb.length;
  while (ea < maxA && eb < maxB && na[ea] === nb[eb]) { ea++; eb++; }
  if (ea - sa <= 0) return null;
  return { sa, ea, sb, eb };
}

function chainFrags(frags: Frag[], gap: number): Frag[][] {
  if (frags.length === 0) return [];
  // 按 (sb - sa) 偏移量分桶：同一份拷贝（无论插入到哪里）的片段保持一致偏移，
  // 跨句重复文本（同一书内重复出现的桥段）偏移不同，混链会拉出错误跨度
  const buckets = new Map<number, Frag[]>();
  for (const f of frags) {
    const bucket = Math.round((f.sb - f.sa) / gap);
    const arr = buckets.get(bucket);
    if (arr) arr.push(f); else buckets.set(bucket, [f]);
  }
  const chains: Frag[][] = [];
  for (const arr of buckets.values()) {
    const sorted = [...arr].sort((x, y) => x.sa - y.sa);
    let cur: Frag[] = [sorted[0]];
    let lastA = sorted[0].ea, lastB = sorted[0].eb;
    for (let i = 1; i < sorted.length; i++) {
      const f = sorted[i];
      const gapA = f.sa - lastA;
      const gapB = f.sb - lastB;
      // 允许重叠（gap 为小负值）或小间隙，且两侧位移需基本一致（容忍 ≤4 字漂移）
      if (gapA >= -2 && gapA <= gap && gapB >= -2 && gapB <= gap && Math.abs(gapA - gapB) <= 4) {
        cur.push(f);
        lastA = Math.max(lastA, f.ea);
        lastB = Math.max(lastB, f.eb);
      } else {
        chains.push(cur);
        cur = [f];
        lastA = f.ea;
        lastB = f.eb;
      }
    }
    chains.push(cur);
  }
  return chains;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  const inter = Math.min(a2, b2) - Math.max(a1, b1);
  if (inter <= 0) return false;
  return inter > (a2 - a1) / 2;
}

/** 字符 bigram Dice 相似度 */
export function diceBigrams(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let inter = 0;
  const small = ga.size <= gb.size ? ga : gb;
  const large = ga.size <= gb.size ? gb : ga;
  for (const v of small) if (large.has(v)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s[i] + s[i + 1]);
  return out;
}

function makeHit(a: number, b: number, f: Frag, pa: Prepared, pb: Prepared, sim: number, kind: 'exact' | 'near'): RawHit {
  const ra = normRangeToOrig(pa.norm, f.sa, f.ea);
  const rb = normRangeToOrig(pb.norm, f.sb, f.eb);
  return { aIdx: a, bIdx: b, startA: ra.start, endA: ra.end, startB: rb.start, endB: rb.end, similarity: sim, kind };
}
