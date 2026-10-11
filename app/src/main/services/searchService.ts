import { getDb } from './bookService';
import * as chapterRepo from '../db/repositories/chapterRepo';
import type { SearchHit } from '../../shared/types';

export function searchBook(bookId: string, query: string): SearchHit[] {
  if (!query) return [];
  const db = getDb(bookId);
  const chapters = chapterRepo.listChapterMeta(db.conn, bookId);
  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  for (const meta of chapters) {
    const ch = chapterRepo.getChapter(db.conn, meta.id);
    const text = ch.contentText.toLowerCase();
    let from = 0;
    while (hits.length < 200) {
      const idx = text.indexOf(needle, from);
      if (idx < 0) break;
      const start = Math.max(0, idx - 30);
      const end = Math.min(ch.contentText.length, idx + needle.length + 30);
      hits.push({
        chapterId: meta.id, title: meta.title, volumeId: meta.volumeId,
        start: idx, end: idx + needle.length,
        excerpt: (start > 0 ? '…' : '') + ch.contentText.slice(start, end) + (end < ch.contentText.length ? '…' : ''),
      });
      from = idx + needle.length;
      if (hits.length >= 200) break;
    }
    if (hits.length >= 200) break;
  }
  return hits;
}
