import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BackupInfo } from '../../shared/types';
import { getDb, readLibrary, closeAllDbs } from './bookService';

const KEEP = 5;

function bookDir(bookId: string): string {
  const entry = readLibrary().find(e => e.id === bookId);
  if (!entry) throw new Error('book not found: ' + bookId);
  return entry.path;
}

export function createBackup(bookId: string): BackupInfo[] {
  const dir = bookDir(bookId);
  const backupDir = path.join(dir, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const db = getDb(bookId);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(backupDir, `book-${stamp}.db`);
  // VACUUM INTO：一致性快照（WAL 安全）
  db.conn.prepare('VACUUM INTO ?').run(target);
  // 只保留最新 KEEP 份
  const list = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort().reverse();
  for (const old of list.slice(KEEP)) {
    try { fs.unlinkSync(path.join(backupDir, old)); } catch { /* ignore */ }
  }
  return listBackups(bookId);
}

export function listBackups(bookId: string): BackupInfo[] {
  const backupDir = path.join(bookDir(bookId), 'backup');
  try {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
    const infos = files.map(f => {
      const st = fs.statSync(path.join(backupDir, f));
      return { name: f, size: st.size, createdAt: st.mtimeMs };
    });
    infos.sort((a, b) => b.createdAt - a.createdAt);
    return infos;
  } catch {
    return [];
  }
}

export function restoreBackup(bookId: string, name: string): void {
  if (name.includes('/') || name.includes('\\') || name.includes('..')) throw new Error('invalid backup name');
  const dir = bookDir(bookId);
  const src = path.join(dir, 'backup', name);
  if (!fs.existsSync(src)) throw new Error('backup not found: ' + name);
  closeAllDbs();
  const dbFile = path.join(dir, 'book.db');
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbFile + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  fs.copyFileSync(src, dbFile);
}
