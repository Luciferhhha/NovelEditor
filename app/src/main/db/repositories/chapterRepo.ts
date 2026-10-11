import type Database from 'better-sqlite3';
import type { Chapter, ChapterMeta, ChapterFlagInfo, PlainSegment } from '../../../shared/types';
import { mdToPlainText } from '../../../shared/markdown/mdToPlainText';
import { parsePlainMap, serializePlainMap } from '../../../shared/markdown/offsetMap';
import { countWords } from '../../../shared/wordCount';

interface Row {
  id: string; book_id: string; volume_id: string; title: string; sort_order: number;
  content_md: string; content_text: string; plain_map_json: string;
  word_count: number; status: string; version: number; updated_at: number;
  flag_level?: string | null; flag_dup_count?: number | null; flag_dup_ratio?: number | null;
}

function toFlag(r: Row): ChapterFlagInfo | null {
  if (!r.flag_level) return null;
  return { level: r.flag_level as 'warn' | 'bad', dupCount: r.flag_dup_count ?? 0, dupRatio: r.flag_dup_ratio ?? 0 };
}

function toMeta(r: Row): ChapterMeta {
  return {
    id: r.id, bookId: r.book_id, volumeId: r.volume_id, title: r.title, sortOrder: r.sort_order,
    wordCount: r.word_count, status: r.status as ChapterMeta['status'], updatedAt: r.updated_at,
    version: r.version,
    flag: toFlag(r),
  };
}

const SELECT = `SELECT c.*, f.level AS flag_level, f.dup_count AS flag_dup_count, f.dup_ratio AS flag_dup_ratio
  FROM chapters c LEFT JOIN chapter_flags f ON f.chapter_id = c.id`;

export function listChapterMeta(conn: Database.Database, bookId: string): ChapterMeta[] {
  const rows = conn.prepare(SELECT + ' WHERE c.book_id = ? ORDER BY c.volume_id, c.sort_order').all(bookId) as Row[];
  return rows.map(toMeta);
}

export function getChapter(conn: Database.Database, chapterId: string): Chapter {
  const r = conn.prepare(SELECT + ' WHERE c.id = ?').get(chapterId) as Row;
  if (!r) throw new Error('chapter not found: ' + chapterId);
  return { ...toMeta(r), contentMd: r.content_md, contentText: r.content_text, plainMap: parsePlainMap(r.plain_map_json) };
}

export interface SaveChapterInput {
  chapterId: string;
  title?: string;
  contentMd: string;
  version: number;
}

/** 保存章节：同步重算派生列（content_text / plain_map / word_count），乐观锁版本号 */
export function saveChapter(conn: Database.Database, input: SaveChapterInput): { version: number; updatedAt: number } {
  const row = conn.prepare('SELECT version FROM chapters WHERE id = ?').get(input.chapterId) as { version: number } | undefined;
  if (!row) throw new Error('chapter not found');
  if (row.version !== input.version) throw new Error('VERSION_CONFLICT');
  const derived = mdToPlainText(input.contentMd);
  const wordCount = countWords(derived.text);
  const updatedAt = Date.now();
  conn.prepare(`
    UPDATE chapters SET content_md = ?, content_text = ?, plain_map_json = ?, word_count = ?,
      title = COALESCE(?, title), updated_at = ?, version = version + 1
    WHERE id = ?
  `).run(input.contentMd, derived.text, serializePlainMap(derived.segments), wordCount, input.title ?? null, updatedAt, input.chapterId);
  return { version: row.version + 1, updatedAt };
}

export function createChapter(conn: Database.Database, bookId: string, volumeId: string, title: string): ChapterMeta {
  const max = (conn.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE volume_id = ?').get(volumeId) as { m: number }).m;
  const id = crypto.randomUUID();
  const now = Date.now();
  conn.prepare(`
    INSERT INTO chapters (id, book_id, volume_id, title, sort_order, content_md, content_text, plain_map_json, word_count, status, version, updated_at)
    VALUES (?, ?, ?, ?, ?, '', '', '[]', 0, 'draft', 0, ?)
  `).run(id, bookId, volumeId, title, max + 1, now);
  return getChapterMeta(conn, id);
}

export function getChapterMeta(conn: Database.Database, chapterId: string): ChapterMeta {
  const r = conn.prepare(SELECT + ' WHERE c.id = ?').get(chapterId) as Row;
  if (!r) throw new Error('chapter not found');
  return toMeta(r);
}

export function deleteChapter(conn: Database.Database, chapterId: string): void {
  conn.prepare('DELETE FROM chapters WHERE id = ?').run(chapterId);
  conn.prepare('DELETE FROM chapter_flags WHERE chapter_id = ?').run(chapterId);
}

/** 跨卷移动 / 重排：目标卷内插入到 index 位置，并重排两卷序号 */
export function moveChapter(conn: Database.Database, chapterId: string, targetVolumeId: string, index: number): ChapterMeta[] {
  const chapter = conn.prepare('SELECT volume_id, sort_order FROM chapters WHERE id = ?').get(chapterId) as { volume_id: string; sort_order: number };
  const tx = conn.transaction(() => {
    const pull = (volumeId: string, after: number) => {
      const rows = conn.prepare('SELECT id, sort_order FROM chapters WHERE volume_id = ? ORDER BY sort_order').all(volumeId) as { id: string; sort_order: number }[];
      let order = 0;
      for (const r of rows) {
        if (r.id === chapterId) continue;
        const target = r.sort_order > after ? r.sort_order - 1 : r.sort_order;
        conn.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?').run(target, r.id);
        order++;
      }
      return order;
    };
    pull(chapter.volume_id, chapter.sort_order);
    // 目标卷：先腾位，再插入
    const targetRows = conn.prepare('SELECT id FROM chapters WHERE volume_id = ? AND id <> ? ORDER BY sort_order').all(targetVolumeId, chapterId) as { id: string }[];
    const clamped = Math.max(0, Math.min(index, targetRows.length));
    for (let i = 0; i < targetRows.length; i++) {
      conn.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?').run(i >= clamped ? i + 1 : i, targetRows[i].id);
    }
    conn.prepare('UPDATE chapters SET volume_id = ?, sort_order = ? WHERE id = ?').run(targetVolumeId, clamped, chapterId);
    // 统一重编号，消除空洞
    for (const vol of [chapter.volume_id, targetVolumeId]) {
      const rows = conn.prepare('SELECT id FROM chapters WHERE volume_id = ? ORDER BY sort_order').all(vol) as { id: string }[];
      rows.forEach((r, i) => conn.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?').run(i, r.id));
    }
  });
  tx();
  const bookId = (conn.prepare('SELECT book_id FROM chapters WHERE id = ?').get(chapterId) as { book_id: string }).book_id;
  return listChapterMeta(conn, bookId);
}

/** 检查用：所有章的 id + 纯文本 */
export function listChapterTexts(conn: Database.Database, bookId: string): { id: string; text: string }[] {
  const rows = conn.prepare('SELECT id, content_text FROM chapters WHERE book_id = ?').all(bookId) as { id: string; content_text: string }[];
  return rows.map(r => ({ id: r.id, text: r.content_text }));
}

export function wordTotal(conn: Database.Database, bookId: string): number {
  const r = conn.prepare('SELECT COALESCE(SUM(word_count), 0) AS t FROM chapters WHERE book_id = ?').get(bookId) as { t: number };
  return r.t;
}
