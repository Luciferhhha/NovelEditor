import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import { preprocessForPreview } from '../src/shared/markdown/previewRules';

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });
const render = (s: string) => md.render(preprocessForPreview(s));

describe('预览规则：行首空格保留 + 单回车换行', () => {
  it('行首缩进转为 &nbsp;，渲染后保留视觉缩进', () => {
    const out = render('    夜色如墨，风声掠过古老的城墙。');
    // markdown-it 将 &nbsp; 解码为 U+00A0，浏览器中不折叠、保留视觉缩进
    expect(out).toContain('\u00a0');
    expect(out.indexOf('\u00a0')).toBeLessThan(out.indexOf('夜色如墨'));
  });

  it('2 空格缩进同样保留', () => {
    expect(preprocessForPreview('  他不知道前方等待什么。')).toBe('&nbsp;&nbsp;他不知道前方等待什么。');
  });

  it('单回车渲染为 <br>（无需空行分段）', () => {
    const out = render('第一行\n第二行');
    expect(out).toContain('<br');
  });

  it('空行仍分段（产生独立 <p>）', () => {
    const out = render('第一段\n\n第二段');
    expect(out.match(/<p>/g)?.length).toBe(2);
  });

  it('列表缩进不被转换（嵌套列表保持结构）', () => {
    expect(preprocessForPreview('  - 子项')).toBe('  - 子项');
    expect(preprocessForPreview('- 项一')).toBe('- 项一');
  });

  it('围栏代码块内部原样保留', () => {
    const src = '```js\n    const a = 1;\n```';
    expect(preprocessForPreview(src)).toBe(src);
  });

  it('标题/引用/表格前缀行不受影响', () => {
    expect(preprocessForPreview('# 标题')).toBe('# 标题');
    expect(preprocessForPreview('> 引用')).toBe('> 引用');
    expect(preprocessForPreview('| a | b |')).toBe('| a | b |');
  });

  it('混合多行：只有纯文本缩进行被转换', () => {
    const src = '# 第一章\n    缩进行\n正文行\n  - 列表';
    const out = preprocessForPreview(src);
    expect(out.split('\n')).toEqual(['# 第一章', '&nbsp;&nbsp;&nbsp;&nbsp;缩进行', '正文行', '  - 列表']);
  });
});