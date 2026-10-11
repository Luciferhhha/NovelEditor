/** 字符级 n-gram 指纹 + winnowing 选择 */

export function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Fingerprint {
  hash: number;
  /** 起始位置（归一化坐标） */
  pos: number;
}

/** 计算每个位置的 n-gram 哈希（滚动） */
export function gramHashes(norm: string, n: number): Int32Array {
  const len = norm.length;
  if (len < n) return new Int32Array(0);
  const out = new Int32Array(len - n + 1);
  let h = 0x811c9dc5;
  let base = 1;
  for (let i = 0; i < n; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    if (i > 0) base = Math.imul(base, 0x01000193) >>> 0;
  }
  out[0] = h;
  for (let i = 1; i <= len - n; i++) {
    // 重新计算（避免滚动减法的碰撞问题，文本规模下足够快）
    h = 0x811c9dc5;
    for (let j = i; j < i + n; j++) {
      h ^= norm.charCodeAt(j);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out[i] = h;
  }
  return out;
}

/** winnowing：窗口 w 内取最小哈希（并列取最右），位置敏感 */
export function winnow(hashes: Int32Array, w: number): Fingerprint[] {
  const out: Fingerprint[] = [];
  if (hashes.length === 0) return out;
  if (hashes.length <= w) {
    let min = 0;
    for (let i = 1; i < hashes.length; i++) if (hashes[i] < hashes[min]) min = i;
    out.push({ hash: hashes[min], pos: min });
    return out;
  }
  let last = -1;
  for (let start = 0; start + w <= hashes.length; start++) {
    let min = start;
    for (let i = start + 1; i < start + w; i++) {
      if (hashes[i] <= hashes[min]) min = i;
    }
    if (min !== last) {
      out.push({ hash: hashes[min], pos: min });
      last = min;
    }
  }
  return out;
}
