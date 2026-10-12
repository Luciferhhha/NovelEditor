import { describe, expect, it } from 'vitest';
import { renderPreviewHtml } from '../src/renderer/markdownRender';

/** 第二轮反馈 #4：插入的图片要真渲染（file: 协议 + "] (" 空格容错） */
describe('图片/链接渲染', () => {
  it('file:/// 协议图片渲染为 <img', () => {
    const html = renderPreviewHtml('![photo](file:///C:/Pictures/Camera%20Roll/a.jpeg)');
    expect(html).toContain('<img');
    expect(html).toContain('file:///C:/Pictures/Camera%20Roll/a.jpeg');
  });

  it('"] (" 带空格的图片语法归一化后可渲染', () => {
    const html = renderPreviewHtml('![photo] (file:///C:/a.jpeg)');
    expect(html).toContain('<img');
  });

  it('"] (" 带空格的链接语法可渲染为 <a', () => {
    const html = renderPreviewHtml('[站点] (https://example.com/page)');
    expect(html).toContain('<a href="https://example.com/page"');
  });

  it('javascript: 链接不生成可点 href', () => {
    const html = renderPreviewHtml('[x](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
  });

  it('data:text/html 等非图片 data 协议不生成 href', () => {
    const html = renderPreviewHtml('[x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html).not.toContain('href="data:text/html');
  });

  it('data:image 可作为图片渲染', () => {
    const html = renderPreviewHtml('![px](data:image/png;base64,iVBORw0KGgo=)');
    expect(html).toContain('<img');
  });

  it('行首空格保留（不被预处理破坏图片语法）', () => {
    const html = renderPreviewHtml('  ![p](file:///C:/a.png)');
    expect(html).toContain('<img');
  });

  it('单回车即换行（breaks: true）', () => {
    const html = renderPreviewHtml('第一行\n第二行');
    expect(html).toContain('<br');
  });
});
