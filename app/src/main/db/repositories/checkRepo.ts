import type Database from 'better-sqlite3';
import type { CheckHit, CheckParams, ChapterFlagInfo, CheckKind } from '../../../shared/types';
import { DEFAULT_CHECK_PARAMS } from '../../../shared/types';

export function getParams(conn: Database.Database): CheckParams {
  const r = conn.prepare("SELECT value FROM meta WHERE key = 'check_params'").get() as { value: string } | undefined;
  if (!r) return { ...DEFAULT_CHECK_PARAMS };
  try { return { ...DEFAULT_CHECK_PARAMS, ...JSON.parse(r.value) }; } catch { return { ...DEFAULT_CHECK_PARAMS }; }
}

export function setParams(conn: Database.Database, params: CheckParams): void {
  conn.prepare("INSERT INTO meta (key, value) VALUES ('check_params', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(params));
}

export function createRun(conn: Database.Database, bookId: string, scope: string, params: CheckParams): number {
  const info = conn.prepare('INSERT INTO check_runs (book_id, scope, params_json, started_at) VALUES (?, ?, ?, ?)')
    .run(bookId, scope, JSON.stringify(params), Date.now());
  return Number(info.lastInsertRowid);
}

export function finishRun(conn: Database.Database, runId: number): void {
  conn.prepare('UPDATE check_runs SET finished_at = ? WHERE id = ?').run(Date.now(), runId);
}

export interface NewHit {
  chapterA: string; startA: number; endA: number;
  chapterB: string; startB: number; endB: number;
  similarity: number; kind: CheckKind; sig: string;
}

/**
 * 用新结果替换命中：
 * - scope='all' 清空全部；scope='chapter' 只清涉及该章的
 * 忽略状态通过 sig 从旧结果继承。
 */
export function replaceHits(conn: Database.Database, bookId: string, runId: number, scope: 'all' | { chapterId: string }, hits: NewHit[]): void {
  // 从该书【全部历史 run】继承忽略状态（增量替换只删部分命中）
  const carry = new Map<string, boolean>();
  const old = conn.prepare(`SELECT h.sig FROM check_hits h JOIN check_runs r ON r.id = h.run_id
    WHERE r.book_id = ? AND h.ignored = 1`).all(bookId) as { sig: string }[];
  for (const o of old) carry.set(o.sig, true);
  const tx = conn.transaction(() => {
    if (scope === 'all') {
      conn.prepare('DELETE FROM check_hits WHERE run_id IN (SELECT id FROM check_runs WHERE book_id = ?)').run(bookId);
    } else {
      conn.prepare(`DELETE FROM check_hits WHERE run_id IN (SELECT id FROM check_runs WHERE book_id = ?)
        AND (chapter_a = ? OR chapter_b = ?)`).run(bookId, scope.chapterId, scope.chapterId);
    }
    const ins = conn.prepare(`
      INSERT INTO check_hits (run_id, chapter_a, start_a, end_a, chapter_b, start_b, end_b, similarity, kind, ignored, sig)
      VALUES (@runId, @chapterA, @startA, @endA, @chapterB, @startB, @endB, @similarity, @kind, @ignored, @sig)
    `);
    for (const h of hits) {
      ins.run({ runId, ...h, ignored: carry.get(h.sig) ? 1 : 0 });
    }
  });
  tx();
}

export function getHits(conn: Database.Database, bookId: string): CheckHit[] {
  const rows = conn.prepare(`
    SELECT h.* FROM check_hits h
    JOIN check_runs r ON r.id = h.run_id
    WHERE r.book_id = ? AND h.id IN (
      SELECT MAX(id) FROM check_hits GROUP BY sig
    ) ORDER BY h.similarity DESC, h.id
  `).all(bookId) as any[];
  return rows.map(r => ({
    id: r.id, chapterA: r.chapter_a, startA: r.start_a, endA: r.end_a,
    chapterB: r.chapter_b, startB: r.start_b, endB: r.end_b,
    similarity: r.similarity, kind: r.kind as CheckKind, ignored: !!r.ignored, sig: r.sig,
  }));
}

export function setIgnored(conn: Database.Database, hitId: number, ignored: boolean): void {
  const row = conn.prepare('SELECT sig FROM check_hits WHERE id = ?').get(hitId) as { sig: string } | undefined;
  if (!row) return;
  conn.prepare('UPDATE check_hits SET ignored = ? WHERE sig = ?').run(ignored ? 1 : 0, row.sig);
}

export interface FlagRow { chapterId: string; level: 'warn' | 'bad'; dupCount: number; dupRatio: number; }

export function setFlags(conn: Database.Database, flags: FlagRow[]): void {
  const tx = conn.transaction(() => {
    conn.prepare('DELETE FROM chapter_flags').run();
    const ins = conn.prepare('INSERT INTO chapter_flags (chapter_id, level, dup_count, dup_ratio, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const f of flags) ins.run(f.chapterId, f.level, f.dupCount, f.dupRatio, Date.now());
  });
  tx();
}

export function getFlags(conn: Database.Database): Record<string, ChapterFlagInfo | null> {
  const rows = conn.prepare('SELECT chapter_id, level, dup_count, dup_ratio FROM chapter_flags').all() as any[];
  const out: Record<string, ChapterFlagInfo | null> = {};
  for (const r of rows) out[r.chapter_id] = { level: r.level, dupCount: r.dup_count, dupRatio: r.dup_ratio };
  return out;
}
