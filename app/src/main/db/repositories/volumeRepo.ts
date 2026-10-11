import type Database from 'better-sqlite3';
import type { Volume } from '../../../shared/types';

interface Row { id: string; book_id: string; title: string; sort_order: number; created_at: number; }

const toVolume = (r: Row): Volume => ({ id: r.id, bookId: r.book_id, title: r.title, sortOrder: r.sort_order, createdAt: r.created_at });

export function listVolumes(conn: Database.Database, bookId: string): Volume[] {
  const rows = conn.prepare('SELECT * FROM volumes WHERE book_id = ? ORDER BY sort_order').all(bookId) as Row[];
  return rows.map(toVolume);
}

export function createVolume(conn: Database.Database, bookId: string, title: string): Volume {
  const max = (conn.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM volumes WHERE book_id = ?').get(bookId) as { m: number }).m;
  const v: Volume = { id: crypto.randomUUID(), bookId, title, sortOrder: max + 1, createdAt: Date.now() };
  conn.prepare('INSERT INTO volumes (id, book_id, title, sort_order, created_at) VALUES (@id, @bookId, @title, @sortOrder, @createdAt)')
    .run(v);
  return v;
}

export function renameVolume(conn: Database.Database, volumeId: string, title: string): void {
  conn.prepare('UPDATE volumes SET title = ? WHERE id = ?').run(title, volumeId);
}

export function deleteVolume(conn: Database.Database, volumeId: string): void {
  conn.prepare('DELETE FROM chapters WHERE volume_id = ?').run(volumeId);
  conn.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId);
}
