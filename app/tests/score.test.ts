import { describe, it, expect } from 'vitest';
import { scoreChapters, mergeRanges, type HitLike } from '../src/shared/checker-core/score';

const RULES = { minFragLen: 30, badFragLen: 100, flagBadRatio: 0.05, flagWarnRatio: 0.01 };

function hit(aIdx: number, bIdx: number, startA: number, lenA: number, startB: number, lenB: number): HitLike {
  return { aIdx, bIdx, startA, endA: startA + lenA, startB, endB: startB + lenB };
}

describe('章节分级 scoreChapters', () => {
  it('1. 单处 ≥100 字重复 → bad', () => {
    const s = scoreChapters(
      [{ id: 'A', textLength: 5000 }, { id: 'B', textLength: 5000 }],
      [hit(0, 1, 100, 120, 50, 120)], RULES,
    );
    expect(s[0].level).toBe('bad');
    expect(s[1].level).toBe('bad');
    expect(s[0].dupChars).toBe(120);
    expect(s[0].dupCount).toBe(1);
  });

  it('2. 占比 ≥5% → bad（即使单片段 <100 字）', () => {
    const s = scoreChapters(
      [{ id: 'A', textLength: 2000 }, { id: 'B', textLength: 2000 }],
      [hit(0, 1, 0, 60, 0, 60), hit(0, 1, 500, 60, 500, 60), hit(0, 1, 1000, 60, 1000, 60)], RULES,
    );
    expect(s[0].dupChars).toBe(180);
    expect(s[0].dupRatio).toBeGreaterThanOrEqual(0.05);
    expect(s[0].level).toBe('bad');
  });

  it('3. 两处短命中 → warn', () => {
    const s = scoreChapters(
      [{ id: 'A', textLength: 50000 }, { id: 'B', textLength: 50000 }],
      [hit(0, 1, 0, 40, 0, 40), hit(0, 1, 2000, 40, 2000, 40)], RULES,
    );
    expect(s[0].dupCount).toBe(2);
    expect(s[0].level).toBe('warn');
  });

  it('4. 占比 1%~5% → warn', () => {
    const s = scoreChapters(
      [{ id: 'A', textLength: 5000 }, { id: 'B', textLength: 5000 }],
      [hit(0, 1, 0, 80, 0, 80)], RULES, // 80/5000 = 1.6%
    );
    expect(s[0].dupRatio).toBeGreaterThanOrEqual(0.01);
    expect(s[0].dupRatio).toBeLessThan(0.05);
    expect(s[0].level).toBe('warn');
  });

  it('5. 无命中 → level null', () => {
    const s = scoreChapters([{ id: 'A', textLength: 1000 }], [], RULES);
    expect(s[0].level).toBeNull();
    expect(s[0].dupCount).toBe(0);
    expect(s[0].dupRatio).toBe(0);
  });

  it('6. 单处 30~99 字且占比 <1% → 仍为 warn（达到 minFragLen）', () => {
    const s = scoreChapters(
      [{ id: 'A', textLength: 100000 }, { id: 'B', textLength: 100000 }],
      [hit(0, 1, 0, 50, 0, 50)], RULES,
    );
    expect(s[0].level).toBe('warn');
  });

  it('7. 忽略（不进入 hits）后不计入', () => {
    const s = scoreChapters([{ id: 'A', textLength: 5000 }], [], RULES);
    expect(s[0].dupChars).toBe(0);
  });
});

describe('mergeRanges', () => {
  it('合并重叠区间', () => {
    expect(mergeRanges([[0, 10], [5, 20], [30, 40]])).toEqual([[0, 20], [30, 40]]);
  });

  it('空输入', () => {
    expect(mergeRanges([])).toEqual([]);
  });

  it('乱序输入先排序', () => {
    expect(mergeRanges([[50, 60], [0, 10]])).toEqual([[0, 10], [50, 60]]);
  });
});
