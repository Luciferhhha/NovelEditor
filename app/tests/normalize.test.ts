import { describe, it, expect } from 'vitest';
import { normalize, normRangeToOrig } from '../src/shared/checker-core/normalize';

describe('归一化 normalize', () => {
  it('全角字母数字转半角并小写', () => {
    expect(normalize('ＡＢＣ１２３').norm).toBe('abc123');
  });

  it('英文统一小写', () => {
    expect(normalize('Hello World').norm).toBe('helloworld');
  });

  it('去除所有空白且映射指回原文', () => {
    const n = normalize('a b\nc\td');
    expect(n.norm).toBe('abcd');
    expect(n.map[1]).toBe(2);
    expect('a b\nc\td'[n.map[3]]).toBe('d');
  });

  it('中文标点统一为 ASCII', () => {
    expect(normalize('你，好。').norm).toBe('你,好.');
    expect(normalize('《书名》').norm).toBe('<书名>');
  });

  it('全角空格与零宽字符被剔除', () => {
    expect(normalize('甲　乙\u200b丙').norm).toBe('甲乙丙');
  });

  it('normRangeToOrig 将归一化区间映射回原文（跳过空白）', () => {
    const src = '夜色  如墨，风声';
    const n = normalize(src);
    const r = normRangeToOrig(n, 0, 4);
    expect(src.slice(r.start, r.end).replace(/\s/g, '')).toBe('夜色如墨');
    expect(r.start).toBe(0);
  });

  it('空串安全', () => {
    const n = normalize('');
    expect(n.norm).toBe('');
    expect(n.origLen).toBe(0);
  });
});
