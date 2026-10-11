/** 字数统计：中日韩字符逐字计数，拉丁/数字按单词计数 */
export function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g);
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
  return (cjk ? cjk.length : 0) + (latin ? latin.length : 0);
}
