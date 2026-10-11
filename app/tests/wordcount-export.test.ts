import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { countWords } from '../src/shared/wordCount';

describe('字数统计 countWords', () => {
  it('中日韩字符逐字计数', () => {
    expect(countWords('夜色如墨')).toBe(4);
    expect(countWords('你好，世界')).toBe(4); // 中文逗号不计词
  });

  it('拉丁与数字按单词计数', () => {
    expect(countWords('hello world 123')).toBe(3);
    expect(countWords("don't stop")).toBe(2);
  });

  it('中英混排', () => {
    expect(countWords('第一章 Introduction 2024')).toBe(5); // 3 汉字 + Introduction + 2024
  });

  it('空串为 0', () => {
    expect(countWords('')).toBe(0);
  });
});

// ---------- 导出端到端（TXT / MD / DOCX） ----------
describe('导出 exportService', () => {
  const dataDir = path.join('H:\\NovelEditor工程', 'data-test-export');
  let exportService: typeof import('../src/main/services/exportService');
  let bookService: typeof import('../src/main/services/bookService');
  let chapterRepo: typeof import('../src/main/db/repositories/chapterRepo');
  let bookId = '';

  beforeAll(async () => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.env.NOVELEDITOR_DATA_DIR = dataDir;
    bookService = await import('../src/main/services/bookService');
    exportService = await import('../src/main/services/exportService');
    chapterRepo = await import('../src/main/db/repositories/chapterRepo');
    const created = bookService.createBook('导出测试书', '测试作者', '');
    bookId = (created as { entry?: { id: string } }).entry?.id ?? (created as { id: string }).id;
    const snap = bookService.openBook(bookId);
    const db = bookService.getDb(bookId);
    const first = snap.chapters[0];
    chapterRepo.saveChapter(db.conn, {
      chapterId: first.id,
      contentMd: '# 开篇\n\n这是导出测试的第一段内容，验证纯文本与 Markdown 输出。',
      version: first.version,
    });
    const ch2 = chapterRepo.createChapter(db.conn, bookId, snap.volumes[0].id, '第二章');
    chapterRepo.saveChapter(db.conn, {
      chapterId: ch2.id,
      contentMd: '# 第二章\n\n第二段内容，用于多章节导出。',
      version: ch2.version,
    });
  });

  afterAll(() => {
    bookService.closeAllDbs();
    delete process.env.NOVELEDITOR_DATA_DIR;
  });

  it('TXT 导出包含书名、卷名与正文', async () => {
    const out = path.join(dataDir, 'out.txt');
    const r = await exportService.runExport(bookId, { scope: 'book', format: 'txt' }, out);
    expect(r.canceled).toBe(false);
    const txt = fs.readFileSync(out, 'utf8');
    expect(txt).toContain('导出测试书');
    expect(txt).toContain('第一卷');
    expect(txt).toContain('这是导出测试的第一段内容');
    expect(txt).toContain('第二段内容');
  });

  it('MD 导出带标题层级标记', async () => {
    const out = path.join(dataDir, 'out.md');
    await exportService.runExport(bookId, { scope: 'book', format: 'md' }, out);
    const md = fs.readFileSync(out, 'utf8');
    expect(md.startsWith('# 导出测试书')).toBe(true);
    expect(md).toContain('## ');
    expect(md).toContain('### ');
    expect(md).toContain('第二段内容');
  });

  it('DOCX 导出为有效 zip（PK 魔数）且非空', async () => {
    const out = path.join(dataDir, 'out.docx');
    const r = await exportService.runExport(bookId, { scope: 'book', format: 'docx' }, out);
    expect(r.canceled).toBe(false);
    const buf = fs.readFileSync(out);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('单章导出只含该章', async () => {
    const snap = bookService.openBook(bookId);
    const ch2 = snap.chapters[1];
    const out = path.join(dataDir, 'chapter.txt');
    await exportService.runExport(bookId, { scope: 'chapter', targetId: ch2.id, format: 'txt' }, out);
    const txt = fs.readFileSync(out, 'utf8');
    expect(txt).toContain('第二段内容');
    expect(txt).not.toContain('第一段内容');
  });

  it('用户取消（无保存路径）→ canceled', async () => {
    const r = await exportService.runExport(bookId, { scope: 'book', format: 'txt' }, undefined);
    expect(r.canceled).toBe(true);
  });
});
