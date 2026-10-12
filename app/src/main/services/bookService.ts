import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BookSnapshot } from '../../shared/ipc-contract';
import type { LibraryEntry } from '../../shared/types';
import { BookDatabase } from '../db/database';
import * as bookRepo from '../db/repositories/bookRepo';
import * as volumeRepo from '../db/repositories/volumeRepo';
import * as chapterRepo from '../db/repositories/chapterRepo';
import * as checkRepo from '../db/repositories/checkRepo';

/**
 * 数据根目录：默认 H:\NovelEditor工程\data（交付机器），
 * H 盘不可用时回退到 Electron userData。
 */
export function resolveDataDir(): string {
  const env = process.env.NOVELEDITOR_DATA_DIR;
  if (env) { try { fs.mkdirSync(env, { recursive: true }); return env; } catch { /* fallthrough */ } }
  const preferred = 'H:\\NovelEditor工程\\data';
  try { fs.mkdirSync(preferred, { recursive: true }); return preferred; } catch { /* fallthrough */ }
  const fallback = path.join(process.cwd(), 'data');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const dataDir = resolveDataDir();
const libraryFile = path.join(dataDir, 'library.json');
const booksDir = path.join(dataDir, 'books');

const openDbs = new Map<string, BookDatabase>();

function libraryPath(entry: LibraryEntry): string {
  return entry.path;
}

export function readLibrary(): LibraryEntry[] {
  try {
    const raw = fs.readFileSync(libraryFile, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLibrary(entries: LibraryEntry[]): void {
  fs.mkdirSync(path.dirname(libraryFile), { recursive: true });
  const tmp = libraryFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmp, libraryFile);
}

export function getDb(bookId: string): BookDatabase {
  const cached = openDbs.get(bookId);
  if (cached) return cached;
  const entry = readLibrary().find(e => e.id === bookId);
  if (!entry) throw new Error('book not found: ' + bookId);
  const db = new BookDatabase(path.join(libraryPath(entry), 'book.db'));
  db.open();
  openDbs.set(bookId, db);
  return db;
}

export function createBook(title: string, author: string, description = ''): LibraryEntry {
  const id = crypto.randomUUID();
  const now = Date.now();
  const dir = path.join(booksDir, id);
  fs.mkdirSync(path.join(dir, 'backup'), { recursive: true });
  const entry: LibraryEntry = { id, title, author, description, createdAt: now, updatedAt: now, lastOpenedAt: now, path: dir };
  const db = new BookDatabase(path.join(dir, 'book.db'));
  db.open();
  openDbs.set(id, db);
  bookRepo.syncBook(db.conn, { id, title, author, description, created_at: now, updated_at: now });
  const vol = volumeRepo.createVolume(db.conn, id, '第一卷');
  chapterRepo.createChapter(db.conn, id, vol.id, '第一章');
  const entries = readLibrary();
  entries.unshift(entry);
  writeLibrary(entries);
  return entry;
}

export function deleteBook(bookId: string): void {
  const db = openDbs.get(bookId);
  if (db) { db.close(); openDbs.delete(bookId); }
  const entries = readLibrary();
  const entry = entries.find(e => e.id === bookId);
  writeLibrary(entries.filter(e => e.id !== bookId));
  if (entry) {
    try { fs.rmSync(entry.path, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

export function touchBook(bookId: string): void {
  const entries = readLibrary();
  const entry = entries.find(e => e.id === bookId);
  if (!entry) return;
  entry.lastOpenedAt = Date.now();
  entry.updatedAt = Date.now();
  writeLibrary(entries);
  const db = openDbs.get(bookId);
  if (db) {
    bookRepo.syncBook(db.conn, {
      id: entry.id, title: entry.title, author: entry.author, description: entry.description,
      created_at: entry.createdAt, updated_at: entry.updatedAt,
    });
  }
}

export function updateBookMeta(bookId: string, patch: Partial<Pick<LibraryEntry, 'title' | 'author' | 'description'>>): LibraryEntry {
  const entries = readLibrary();
  const entry = entries.find(e => e.id === bookId);
  if (!entry) throw new Error('book not found: ' + bookId);
  Object.assign(entry, patch, { updatedAt: Date.now() });
  writeLibrary(entries);
  const db = openDbs.get(bookId);
  if (db) {
    bookRepo.syncBook(db.conn, {
      id: entry.id, title: entry.title, author: entry.author, description: entry.description,
      created_at: entry.createdAt, updated_at: entry.updatedAt,
    });
  }
  return entry;
}

export function openBook(bookId: string): BookSnapshot {
  const entry = readLibrary().find(e => e.id === bookId);
  if (!entry) throw new Error('book not found: ' + bookId);
  touchBook(bookId);
  const db = getDb(bookId);
  return {
    entry,
    volumes: volumeRepo.listVolumes(db.conn, bookId),
    chapters: chapterRepo.listChapterMeta(db.conn, bookId),
    params: checkRepo.getParams(db.conn),
    outline: bookRepo.getMeta(db.conn, 'outline_md') ?? '',
  };
}

export function bookStats(bookId: string): { chapterCount: number; volumeCount: number; wordTotal: number } {
  const db = getDb(bookId);
  const chapterCount = (db.conn.prepare('SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?').get(bookId) as { c: number }).c;
  const volumeCount = (db.conn.prepare('SELECT COUNT(*) AS c FROM volumes WHERE book_id = ?').get(bookId) as { c: number }).c;
  return { chapterCount, volumeCount, wordTotal: chapterRepo.wordTotal(db.conn, bookId) };
}

export function closeAllDbs(): void {
  for (const db of openDbs.values()) db.close();
  openDbs.clear();
}

export function dataDirPath(): string { return dataDir; }
