/**
 * 预览渲染前的行级处理：
 * 1) 保留行首空格（小说行首缩进），转成 &nbsp;，避免被 markdown 吞掉或被浏览器折叠；
 * 2) 不破坏围栏代码块（```/~~~）与列表、引用、标题等依赖缩进/前缀的块级结构。
 * 配合 markdown-it { breaks: true } 实现“单回车即换行”。
 */
export function preprocessForPreview(md: string): string {
  const lines = md.split('\n');
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const m = /^( +)(.*)$/.exec(line);
      if (!m) return line;
      // 块级结构保留原样（嵌套列表依赖缩进）
      if (/^\s*([-*+]\s|#|>\s?|\d+[.)]\s|\|)/.test(line)) return line;
      const n = Math.min(m[1].length, 12);
      return '&nbsp;'.repeat(n) + m[2];
    })
    .join('\n');
}
