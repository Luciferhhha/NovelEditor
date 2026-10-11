// 全局共享类型
export type ChapterStatus = 'draft' | 'revised' | 'flagged';
export type FlagLevel = 'warn' | 'bad';
export type CheckKind = 'exact' | 'near';
export type ExportFormat = 'txt' | 'md' | 'docx';
export type ExportScope = 'chapter' | 'volume' | 'book';

/** library.json 中的一条书记录 */
export interface LibraryEntry {
  id: string;
  title: string;
  author: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  /** 书的独立存储目录 */
  path: string;
}

export interface Volume {
  id: string;
  bookId: string;
  title: string;
  sortOrder: number;
  createdAt: number;
}

export interface ChapterFlagInfo {
  level: FlagLevel;
  dupCount: number;
  dupRatio: number;
}

export interface ChapterMeta {
  id: string;
  bookId: string;
  volumeId: string;
  title: string;
  sortOrder: number;
  wordCount: number;
  status: ChapterStatus;
  updatedAt: number;
  /** 乐观锁版本号 */
  version: number;
  flag: ChapterFlagInfo | null;
}

/** 纯文本偏移 → 源码偏移的分段映射：text[ts..ts+len] === src[ss..ss+len] */
export type PlainSegment = [ts: number, ss: number, len: number];

export interface Chapter extends ChapterMeta {
  contentMd: string;
  contentText: string;
  plainMap: PlainSegment[];
}

export interface CheckParams {
  n: number;
  w: number;
  minFragLen: number;
  nearThreshold: number;
  flagBadRatio: number;
  flagWarnRatio: number;
}

export const DEFAULT_CHECK_PARAMS: CheckParams = {
  n: 10,
  w: 4,
  minFragLen: 30,
  nearThreshold: 0.85,
  flagBadRatio: 0.05,
  flagWarnRatio: 0.01,
};

export interface CheckHit {
  id: number;
  chapterA: string;
  startA: number;
  endA: number;
  chapterB: string;
  startB: number;
  endB: number;
  similarity: number;
  kind: CheckKind;
  ignored: boolean;
  /** 内容签名，忽略状态跨次查重继承用 */
  sig: string;
  /** 命中区间在章节 content_text 中的原文（读取结果时附加，供报告展示） */
  textA?: string;
  textB?: string;
}

export interface CheckProgress {
  phase: 'indexing' | 'scoring' | 'writing';
  done: number;
  total: number;
}

export interface SearchHit {
  chapterId: string;
  title: string;
  volumeId: string;
  /** content_text 偏移 */
  start: number;
  end: number;
  excerpt: string;
}

export interface BackupInfo {
  name: string;
  size: number;
  createdAt: number;
}

export interface ExportRequest {
  format: ExportFormat;
  scope: ExportScope;
  targetId?: string;
}

export interface ExportResult {
  canceled: boolean;
  filePath?: string;
}

export interface WordStats {
  chapter: number;
  volume: number;
  book: number;
}
