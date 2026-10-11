/** 归一化：全角→半角、大小写统一、标点统一、去空白；保留 norm[i] -> 原文下标 映射 */

const SKIP = new Set([0x20, 0x09, 0x0a, 0x0d, 0x3000, 0x00a0, 0x200b, 0x200c, 0x200d, 0xfeff]);

/** 标点统一表：中文标点 → ASCII 等价 */
const PUNCT: Record<string, string> = {
  '，': ',', '、': ',', '。': '.', '．': '.', '！': '!', '？': '?',
  '；': ';', '：': ':', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'",
  '（': '(', '）': ')', '〔': '(', '〕': ')', '【': '[', '】': ']',
  '《': '<', '》': '>', '「': '[', '」': ']', '『': '[', '』': ']',
  '—': '-', '–': '-', '―': '-', '～': '~', '·': '.', '•': '.',
  '％': '%', '＃': '#', '＆': '&', '＠': '@',
};

export interface Normalized {
  /** 归一化后的文本（无空白、小写、半角标点） */
  norm: string;
  /** map[i] = norm[i] 在原文中的下标 */
  map: Int32Array;
  /** 原文长度 */
  origLen: number;
}

export function normalize(text: string): Normalized {
  let norm = '';
  const mapArr: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (SKIP.has(code)) continue;
    let ch = text[i];
    // 全角 ASCII（！(0xFF01) ~ ～(0xFF5E)）→ 半角
    if (code >= 0xff01 && code <= 0xff5e) {
      ch = String.fromCharCode(code - 0xfee0);
    }
    if (PUNCT[ch]) ch = PUNCT[ch];
    ch = ch.toLowerCase();
    norm += ch;
    mapArr.push(i);
  }
  return { norm, map: Int32Array.from(mapArr), origLen: text.length };
}

/** 归一化区间 [s,e) → 原文区间（不含尾随被删除字符） */
export function normRangeToOrig(n: Normalized, s: number, e: number): { start: number; end: number } {
  if (n.map.length === 0) return { start: 0, end: 0 };
  const cs = Math.max(0, Math.min(s, n.map.length - 1));
  const ce = Math.max(cs, Math.min(e - 1, n.map.length - 1));
  return { start: n.map[cs], end: n.map[ce] + 1 };
}
