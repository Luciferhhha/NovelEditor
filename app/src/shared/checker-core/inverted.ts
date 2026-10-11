import { winnow } from './fingerprint';

/** 打包布局：高 26 位 = 章节下标，低 26 位 = 归一化坐标 */
const POS_BITS = 26;
const POS_MASK = (1 << POS_BITS) - 1;

/**
 * 倒排索引：hash -> [packed(chIdx, pos)...]
 * detect.ts 通过 map 直接迭代 postings（iterateValues），
 * 因此保持 map 字段可被同目录模块读取。
 */
export class InvertedIndex {
  private map = new Map<number, number[]>();

  /** 对一章做 winnowing 后写入索引 */
  addChapter(chIdx: number, hashes: Int32Array, w: number): void {
    if (chIdx > POS_MASK) throw new Error('chapter index overflow');
    const selected = winnow(hashes, w);
    for (const fp of selected) {
      const packed = chIdx * (POS_MASK + 1) + fp.pos;
      const arr = this.map.get(fp.hash);
      if (arr) arr.push(packed);
      else this.map.set(fp.hash, [packed]);
    }
  }

  get(hash: number): number[] | undefined {
    return this.map.get(hash);
  }

  get size(): number {
    return this.map.size;
  }
}

export const PACK_POS_MASK = POS_MASK;
