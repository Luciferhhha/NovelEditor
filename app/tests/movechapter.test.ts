import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BookDatabase } from '../src/main/db/database';
import { syncBook } from '../src/main/db/repositories/bookRepo';
import { createVolume, listVolumes } from '../src/main/db/repositories/volumeRepo';
import { createChapter, listChapterMeta, moveChapter } from '../src/main/db/repositories/chapterRepo';

const TMP = path.join('H:\\NovelEditor工程', 'data-test-move');
const BID = 'test-book-move';

describe('chapterRepo.moveChapter（拖拽排序的落库语义）', () => {
  let db: BookDatabase;
  let v1: string;
  let v2: string;

  beforeAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
    db = new BookDatabase(path.join(TMP, 'book.db'));
    syncBook(db.conn, {
      id: BID, title: '移动测试书', author: 'tester', description: '',
      created_at: Date.now(), updated_at: Date.now(),
    });
    v1 = createVolume(db.conn, BID, '第一卷').id;
    v2 = createVolume(db.conn, BID, '第二卷').id;
    createChapter(db.conn, BID, v1, '第一章');
    createChapter(db.conn, BID, v1, '第二章');
    createChapter(db.conn, BID, v1, '第三章');
  });

  afterAll(() => {
    db.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('默认创建的三章按顺序排列', () => {
    const metas = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v1);
    expect(metas.map(c => c.title)).toEqual(['第一章', '第二章', '第三章']);
  });

  it('卷内拖到首位：重编号且顺序更新', () => {
    const metas = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v1);
    const third = metas[2];
    moveChapter(db.conn, third.id, v1, 0);
    const after = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v1);
    expect(after.map(c => c.title)).toEqual(['第三章', '第一章', '第二章']);
    expect(after.map(c => c.sortOrder)).toEqual([0, 1, 2]);
  });

  it('跨卷移动：目标卷追加、原卷收敛重编号', () => {
    const first = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v1)[0];
    const targetCount = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v2).length;
    moveChapter(db.conn, first.id, v2, targetCount);
    const v1After = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v1);
    const v2After = listChapterMeta(db.conn, BID).filter(c => c.volumeId === v2);
    expect(v1After.map(c => c.title)).toEqual(['第一章', '第二章']);
    expect(v2After.map(c => c.title)).toEqual(['第三章']);
    expect(v1After.map(c => c.sortOrder)).toEqual([0, 1]);
    expect(v2After[0].sortOrder).toBe(0);
  });

  it('列表不漏章、volumeId 归属正确', () => {
    const all = listChapterMeta(db.conn, BID);
    expect(all).toHaveLength(3);
    expect(new Set(all.map(c => c.volumeId))).toEqual(new Set([v1, v2]));
    expect(listVolumes(db.conn, BID)).toHaveLength(2);
  });
});
