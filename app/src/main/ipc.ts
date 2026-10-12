import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ExportRequest } from '../shared/types';
import { INVOKE_CHANNELS } from '../shared/ipc-contract';
import * as bookService from './services/bookService';
import * as volumeRepo from './db/repositories/volumeRepo';
import * as chapterRepo from './db/repositories/chapterRepo';
import * as checkRepo from './db/repositories/checkRepo';
import * as bookRepo from './db/repositories/bookRepo';
import { runExport } from './services/exportService';
import * as backupService from './services/backupService';
import { searchBook } from './services/searchService';
import { CheckerHost } from './checker/workerHost';
import * as settingsService from './services/settingsService';
import * as aiService from './services/aiService';

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

/** 保存后延迟触发单章增量查重（合并连续保存） */
let incrementalTimer: NodeJS.Timeout | null = null;
let pendingFocus: { bookId: string; chapterId: string } | null = null;

export function createChecker(checker: CheckerHost): CheckerHost {
  return checker;
}

export function registerIpc(): void {
  const checker = new CheckerHost(broadcast);

  const handle = <C extends (typeof INVOKE_CHANNELS)[number]>(
    channel: C,
    fn: (req: any) => any,
  ) => {
    ipcMain.handle(channel, async (_e, req) => {
      try {
        return await fn(req);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(msg);
      }
    });
  };

  // ---- library ----
  handle('library:list', () => bookService.readLibrary());
  handle('library:create', (req) => bookService.createBook(req.title, req.author, req.description ?? ''));
  handle('library:delete', (req) => { bookService.deleteBook(req.id); });
  handle('library:touch', (req) => { bookService.touchBook(req.id); });

  // ---- book ----
  handle('book:open', (req) => bookService.openBook(req.id));
  handle('book:stats', (req) => bookService.bookStats(req.id));
  handle('book:saveOutline', (req) => {
    const db = bookService.getDb(req.bookId);
    bookRepo.setMeta(db.conn, 'outline_md', String(req.contentMd ?? ''));
  });

  // ---- 应用设置 / AI ----
  handle('settings:get', () => settingsService.readSettings());
  handle('settings:set', (req) => settingsService.writeSettings(req ?? {}));
  handle('ai:chat', async (req) => ({ text: await aiService.chat(String(req.system ?? ''), String(req.prompt ?? '')) }));

  // ---- volume ----
  handle('volume:create', (req) => {
    const db = bookService.getDb(req.bookId);
    const v = volumeRepo.createVolume(db.conn, req.bookId, req.title);
    broadcast('book:changed', { bookId: req.bookId });
    return v;
  });
  handle('volume:rename', (req) => {
    const db = bookService.getDb(req.bookId);
    volumeRepo.renameVolume(db.conn, req.volumeId, req.title);
    broadcast('book:changed', { bookId: req.bookId });
  });
  handle('volume:delete', (req) => {
    const db = bookService.getDb(req.bookId);
    volumeRepo.deleteVolume(db.conn, req.volumeId);
    broadcast('book:changed', { bookId: req.bookId });
  });

  // ---- chapter ----
  handle('chapter:create', (req) => {
    const db = bookService.getDb(req.bookId);
    const meta = chapterRepo.createChapter(db.conn, req.bookId, req.volumeId, req.title);
    broadcast('book:changed', { bookId: req.bookId });
    return meta;
  });
  handle('chapter:get', (req) => {
    const db = bookService.getDb(req.bookId);
    return chapterRepo.getChapter(db.conn, req.chapterId);
  });
  handle('chapter:save', (req) => {
    const db = bookService.getDb(req.bookId);
    const res = chapterRepo.saveChapter(db.conn, {
      chapterId: req.chapterId, title: req.title, contentMd: req.contentMd, version: req.version,
    });
    broadcast('book:changed', { bookId: req.bookId });
    // 保存后增量重查该章
    pendingFocus = { bookId: req.bookId, chapterId: req.chapterId };
    if (incrementalTimer) clearTimeout(incrementalTimer);
    incrementalTimer = setTimeout(() => {
      const focus = pendingFocus;
      pendingFocus = null;
      incrementalTimer = null;
      if (!focus || checker.isBusy(focus.bookId)) return;
      checker.run(focus.bookId, false, focus.chapterId).catch(err => {
        broadcast('check:error', { message: err instanceof Error ? err.message : String(err) });
      });
    }, 1200);
    return res;
  });
  handle('chapter:delete', (req) => {
    const db = bookService.getDb(req.bookId);
    chapterRepo.deleteChapter(db.conn, req.chapterId);
    broadcast('book:changed', { bookId: req.bookId });
  });
  handle('chapter:move', (req) => {
    const db = bookService.getDb(req.bookId);
    const metas = chapterRepo.moveChapter(db.conn, req.chapterId, req.volumeId, req.index);
    broadcast('book:changed', { bookId: req.bookId });
    return metas;
  });

  // ---- check ----
  handle('check:run', async (req) => {
    if (checker.isBusy(req.bookId)) throw new Error('查重正在进行中');
    return checker.run(req.bookId, !!req.full, req.chapterId);
  });
  handle('check:cancel', (req) => { checker.cancel(req.bookId); });
  handle('check:results', (req) => {
    const db = bookService.getDb(req.bookId);
    const hits = checkRepo.getHits(db.conn, req.bookId);
    // 附加命中区间原文，报告面板直接展示"重复内容是：…"
    const textCache = new Map<string, string>();
    const chapterText = (id: string): string => {
      let t = textCache.get(id);
      if (t === undefined) {
        const row = db.conn.prepare('SELECT content_text FROM chapters WHERE id = ?').get(id) as { content_text?: string } | undefined;
        t = row?.content_text ?? '';
        textCache.set(id, t);
      }
      return t;
    };
    const withText = hits.map(h => ({
      ...h,
      textA: chapterText(h.chapterA).slice(h.startA, h.endA),
      textB: chapterText(h.chapterB).slice(h.startB, h.endB),
    }));
    return { hits: withText, flags: checkRepo.getFlags(db.conn) };
  });
  handle('check:params', (req) => checkRepo.getParams(bookService.getDb(req.bookId).conn));
  handle('check:setParams', (req) => { checkRepo.setParams(bookService.getDb(req.bookId).conn, req.params); });
  handle('check:ignore', (req) => {
    checkRepo.setIgnored(bookService.getDb(req.bookId).conn, req.hitId, req.ignored);
  });

  // ---- search ----
  handle('search:run', (req) => searchBook(req.bookId, req.query));

  // ---- export ----
  handle('export:run', async (req) => {
    const request: ExportRequest = req.request;
    const entry = bookService.readLibrary().find(e => e.id === req.bookId);
    const defaultName = `${entry?.title ?? 'book'}.${request.format}`;
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const ret = win
      ? await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: exportFilters(request.format) })
      : await dialog.showSaveDialog({ defaultPath: defaultName, filters: exportFilters(request.format) });
    if (ret.canceled || !ret.filePath) return { canceled: true };
    return runExport(req.bookId, request, ret.filePath);
  });

  // ---- backup ----
  handle('backup:create', (req) => backupService.createBackup(req.bookId));
  handle('backup:list', (req) => backupService.listBackups(req.bookId));
  handle('backup:restore', (req) => {
    backupService.restoreBackup(req.bookId, req.name);
    broadcast('book:changed', { bookId: req.bookId });
  });

  // ---- dialog ----
  handle('dialog:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const ret = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return ret.canceled ? null : (ret.filePaths[0] ?? null);
  });
  handle('dialog:selectImage', async () => {
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    };
    const win = BrowserWindow.getFocusedWindow();
    const ret = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return { canceled: ret.canceled, filePath: ret.canceled ? null : (ret.filePaths[0] ?? null) };
  });
}

function exportFilters(format: string): { name: string; extensions: string[] }[] {
  if (format === 'txt') return [{ name: '纯文本', extensions: ['txt'] }];
  if (format === 'md') return [{ name: 'Markdown', extensions: ['md'] }];
  return [{ name: 'Word 文档', extensions: ['docx'] }];
}