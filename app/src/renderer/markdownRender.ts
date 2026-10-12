import MarkdownIt from 'markdown-it';
import { preprocessForPreview } from '../shared/markdown/previewRules';

/**
 * 安全链接白名单：markdown-it 默认把 file:/data: 当坏协议屏蔽，导致本地图片不渲染；
 * 这里只挡 vbscript/javascript，data: 仅放行图片。
 */
function safeLink(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (/^(vbscript|javascript):/.test(u)) return false;
  if (u.startsWith('data:')) return /^data:image\//.test(u);
  return true;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true, // 单回车即换行
});
// validateLink 是运行时原型方法，@types/markdown-it 未声明，显式挂载
(md as unknown as { validateLink: (url: string) => boolean }).validateLink = safeLink;

/** 预览统一入口：行级规则 + markdown 渲染（测试与 PreviewPane 共用） */
export function renderPreviewHtml(content: string): string {
  return md.render(preprocessForPreview(content));
}
