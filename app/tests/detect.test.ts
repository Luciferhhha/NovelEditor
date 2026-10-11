import { describe, it, expect } from 'vitest';
import { prepare, detectAll, diceBigrams } from '../src/shared/checker-core/detect';
import { DEFAULT_CHECK_PARAMS, type CheckParams } from '../src/shared/types';

const P: CheckParams = { ...DEFAULT_CHECK_PARAMS };

/** 约 150 字的叙事段（归一化后长度远超 minFragLen=30） */
const PARA = (() => {
  const s = '夜色如墨，风声掠过古老的城墙。少年握紧了手中的剑，踏上了未知的旅途。';
  return s + s + s; // 78*3 = 234 字
})();

describe('查重黄金用例 detect', () => {
  it('1. 章节完全重复 → 命中 kind=exact、similarity=1', () => {
    const chapters = [
      { id: 'A', text: '# 第一章\n\n' + PARA },
      { id: 'B', text: '# 第二章\n\n' + PARA },
    ];
    const hits = detectAll(prepare(chapters, P), P);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const h = hits[0];
    expect(h.kind).toBe('exact');
    expect(h.similarity).toBe(1);
    expect(h.aIdx).toBe(0);
    expect(h.bIdx).toBe(1);
  });

  it('2. 命中区间在两章中截取的文本完全相同', () => {
    const a = '开端。' + PARA + '结尾甲。';
    const b = '引子。' + PARA + '结尾乙。';
    const chapters = [{ id: 'A', text: a }, { id: 'B', text: b }];
    const hits = detectAll(prepare(chapters, P), P);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const h = hits[0];
    const sliceA = a.slice(h.startA, h.endA);
    const sliceB = b.slice(h.startB, h.endB);
    expect(sliceA.length).toBeGreaterThanOrEqual(P.minFragLen);
    expect(sliceA).toBe(sliceB);
  });

  it('3. 内容不同的两章 → 无命中', () => {
    const chapters = [
      { id: 'A', text: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。' },
      { id: 'B', text: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。' },
    ];
    expect(detectAll(prepare(chapters, P), P)).toHaveLength(0);
  });

  it('4. 短于 minFragLen(30字) 的重复片段不报', () => {
    const short = '这一句只有二十来个字的重复。'; // < 30 字
    const chapters = [
      { id: 'A', text: short + '甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸。' },
      { id: 'B', text: short + '子丑寅卯辰巳午未申酉戌亥子丑寅卯辰巳午未。' },
    ];
    expect(detectAll(prepare(chapters, P), P)).toHaveLength(0);
  });

  it('5. 近似重复（每20字改1字）→ kind=near 且相似度≥nearThreshold', () => {
    // 每 20 个字符替换 1 个，保证公共片段 < 30 且整体相似
    let out = '';
    for (let i = 0; i < PARA.length; i++) {
      out += (i % 20 === 10) ? '〇' : PARA[i];
    }
    const chapters = [{ id: 'A', text: PARA }, { id: 'B', text: out }];
    const hits = detectAll(prepare(chapters, P), P);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const h = hits[0];
    expect(h.kind).toBe('near');
    expect(h.similarity).toBeGreaterThanOrEqual(P.nearThreshold);
  });

  it('6. 归一化差异（全角/大小写/空白）不影响命中', () => {
    const base = 'ABCDEFGHIJ'.repeat(12); // 120 字母
    const chapters = [
      { id: 'A', text: base },
      { id: 'B', text: ('ａｂｃｄｅｆｇｈｉｊ').repeat(12).replace(/(.{10})/g, '$1 ') },
    ];
    const hits = detectAll(prepare(chapters, P), P);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].kind).toBe('exact');
  });

  it('7. 同一重复出现在三章 → 产生多对命中', () => {
    const chapters = [
      { id: 'A', text: PARA },
      { id: 'B', text: '前言。' + PARA },
      { id: 'C', text: '序章。' + PARA },
    ];
    const hits = detectAll(prepare(chapters, P), P);
    const pairs = new Set(hits.map(h => h.aIdx + '-' + h.bIdx));
    expect(pairs.size).toBeGreaterThanOrEqual(2);
    expect(pairs.has('0-1')).toBe(true);
    expect(pairs.has('0-2')).toBe(true);
  });

  it('8. 进度回调被调用', () => {
    const chapters = [{ id: 'A', text: PARA }, { id: 'B', text: PARA }];
    let calls = 0;
    detectAll(prepare(chapters, P), P, () => { calls++; });
    expect(calls).toBeGreaterThan(0);
  });

  it('9. diceBigrams：相同为1、无交集为0', () => {
    expect(diceBigrams('abcdefgh', 'abcdefgh')).toBeCloseTo(1, 5);
    expect(diceBigrams('abcdefgh', 'zyxwvuts')).toBe(0);
  });

  it('10. 忽略空白差异：重复文本插空格仍命中 exact', () => {
    const chapters = [
      { id: 'A', text: PARA },
      { id: 'B', text: PARA.replace(/，/g, '， ') },
    ];
    const hits = detectAll(prepare(chapters, P), P);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].kind).toBe('exact');
  });
});
