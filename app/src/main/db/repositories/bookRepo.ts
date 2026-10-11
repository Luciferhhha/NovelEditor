import type Database from 'better-sqlite3';

export interface BookRow {
  id: string; title: string; author: string; description: string;
  created_at: number; updated_at: number;
}

export function syncBook(conn: Database.Database, row: BookRow): void {
  conn.prepare(`
    INSERT INTO books (id, title, author, description, created_at, updated_at)
    VALUES (@id, @title, @author, @description, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET title=@title, author=@author, description=@description, updated_at=@updated_at
  `).run(row);
}

export function getMeta(conn: Database.Database, key: string): string | null {
  const r = conn.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? r.value : null;
}

export function setMeta(conn: Database.Database, key: string, value: string): void {
  conn.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
