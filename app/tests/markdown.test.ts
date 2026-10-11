import { describe, it, expect } from 'vitest';
import { mdToPlainText } from '../src/shared/markdown/mdToPlainText';
import { textToSrc, textRangeToSrc, srcToText, serializePlainMap, parsePlainMap } from '../src/shared/markdown/offsetMap';
import { extractOutline } from '../src/shared/markdown/outline';

/** 段级 1:1 约束：text[ts..ts+len] 必须等于 src[ss..ss+len] */
function assertBijective(md: string) {
  const { text, segments } = mdToPlainText(md);
  for (const [ts, ss, len] of segments) {
    expect(text.slice(ts, ts + len)).toBe(md.slice(ss, ss + len));
  }
}

const FENCE = "```";

describe('mdToPlainText（纯文本派生与偏移映射）', () => {
  it('标题行去掉 # 前缀', () => {
    const { text } = mdToPlainText('# 第一章 风起\n正文内容');
    expect(text).not.toContain('#');
    expect(text).toContain('第一章 风起');
    expect(text).toContain('正文内容');
  });

  it('段级 text/src 段 1:1 双射（复杂文档）', () => {
    const md = [
      '# 第一章',
      '',
      '这是**加粗**和*斜体*的段落，还有 [链接](https://a.b) 与 ![图](x.png)。',
      '',
      '> 引用一行',
      '- 列表项甲',
      '- 列表项乙',
      '',
      FENCE + 'js',
      'const a = 1;',
      FENCE,
      '',
      '---',
      '',
      '最后一段，全角标点：你好，世界。',
    ].join('\n');
    assertBijective(md);
  });

  it('强调标记不进入纯文本', () => {
    const { text } = mdToPlainText('这是**重点**内容');
    expect(text).toBe('这是重点内容');
  });

  it('链接保留显示文字、丢弃 URL', () => {
    const { text } = mdToPlainText('见 [官网](https://example.com) 说明');
    expect(text).toContain('官网');
    expect(text).not.toContain('https://example.com');
  });

  it('引用与列表前缀被剥离', () => {
    const { text } = mdToPlainText('> 引用内容\n- 列表内容');
    expect(text).not.toContain('>');
    expect(text).toContain('引用内容');
    expect(text).toContain('列表内容');
  });

  it('表格行的竖线不进入纯文本', () => {
    const { text } = mdToPlainText('| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |');
    expect(text).not.toContain('|');
  });

  it('空文档安全', () => {
    const { text, segments } = mdToPlainText('');
    expect(text).toBe('');
    expect(segments).toEqual([]);
  });
});

describe('offsetMap（纯文本偏移 ↔ 源码偏移）', () => {
  it('textRangeToSrc 定位到含强调标记的源码区间', () => {
    const doc = '# 标题\n\n第一段**加粗**文字。\n\n第二段文字。';
    const { text, segments } = mdToPlainText(doc);
    const idx = text.indexOf('加粗');
    expect(idx).toBeGreaterThanOrEqual(0);
    const { srcStart, srcEnd } = textRangeToSrc(segments, idx, idx + 2);
    expect(doc.slice(srcStart, srcEnd)).toBe('加粗');
    expect(doc.slice(srcStart - 2, srcEnd + 2)).toBe('**加粗**'); // 强调符在映射区间外但紧邻
  });

  it('srcToText 与 textToSrc 互为逆映射（落在段内时）', () => {
    const doc = '普通段落文字';
    const { segments } = mdToPlainText(doc);
    for (const [ts, ss, len] of segments) {
      expect(textToSrc(segments, ts)).toBe(ss);
      expect(srcToText(segments, ss)).toBe(ts);
      expect(srcToText(segments, ss + len - 1)).toBe(ts + len - 1);
    }
  });

  it('plain_map 序列化往返', () => {
    const segs: [number, number, number][] = [[0, 0, 3], [3, 8, 2]];
    expect(parsePlainMap(serializePlainMap(segs))).toEqual(segs);
    expect(parsePlainMap(null)).toEqual([]);
    expect(parsePlainMap('not json')).toEqual([]);
  });
});

describe('extractOutline（大纲）', () => {
  it('识别多级标题并给出源码区间', () => {
    const doc = '# 卷一\n正文\n## 第一章\n正文\n## 第二章\n正文\n# 卷二\n正文';
    const items = extractOutline(doc);
    expect(items.map(i => i.level)).toEqual([1, 2, 2, 1]);
    expect(items.map(i => i.title)).toEqual(['卷一', '第一章', '第二章', '卷二']);
    expect(doc.slice(items[1].start, items[1].end)).toContain('第一章');
  });

  it('围栏内的 # 不算标题', () => {
    const doc = '# 真标题\n' + FENCE + '\n# 假标题\n' + FENCE;
    const items = extractOutline(doc);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('真标题');
  });
});
