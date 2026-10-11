import type {
  LibraryEntry, Volume, ChapterMeta, Chapter, CheckHit, CheckParams,
  CheckProgress, SearchHit, BackupInfo, ExportRequest, ExportResult, ChapterFlagInfo,
} from './types';

/** IPC 请求契约：channel -> { req, res }。preload 与 main 都据此校验白名单 */
export interface IpcInvokeMap {
  'library:list': { req: void; res: LibraryEntry[] };
  'library:create': { req: { title: string; author: string; description?: string }; res: LibraryEntry };
  'library:delete': { req: { id: string }; res: void };
  'library:touch': { req: { id: string }; res: void };

  'book:open': { req: { id: string }; res: BookSnapshot };
  'book:stats': { req: { id: string }; res: { chapterCount: number; volumeCount: number; wordTotal: number } };

  'volume:create': { req: { bookId: string; title: string }; res: Volume };
  'volume:rename': { req: { bookId: string; volumeId: string; title: string }; res: void };
  'volume:delete': { req: { bookId: string; volumeId: string }; res: void };

  'chapter:create': { req: { bookId: string; volumeId: string; title: string }; res: ChapterMeta };
  'chapter:get': { req: { bookId: string; chapterId: string }; res: Chapter };
  'chapter:save': { req: { bookId: string; chapterId: string; title?: string; contentMd: string; version: number }; res: { version: number; updatedAt: number } };
  'chapter:delete': { req: { bookId: string; chapterId: string }; res: void };
  'chapter:move': { req: { bookId: string; chapterId: string; volumeId: string; index: number }; res: ChapterMeta[] };

  'check:run': { req: { bookId: string; full: boolean; chapterId?: string }; res: { hitCount: number } };
  'check:cancel': { req: { bookId: string }; res: void };
  'check:results': { req: { bookId: string }; res: { hits: CheckHit[]; flags: Record<string, ChapterFlagInfo | null> } };
  'check:params': { req: { bookId: string }; res: CheckParams };
  'check:setParams': { req: { bookId: string; params: CheckParams }; res: void };
  'check:ignore': { req: { bookId: string; hitId: number; ignored: boolean }; res: void };

  'search:run': { req: { bookId: string; query: string }; res: SearchHit[] };

  'export:run': { req: { bookId: string; request: ExportRequest }; res: ExportResult };

  'backup:create': { req: { bookId: string }; res: BackupInfo[] };
  'backup:list': { req: { bookId: string }; res: BackupInfo[] };
  'backup:restore': { req: { bookId: string; name: string }; res: void };

  'dialog:selectDirectory': { req: void; res: string | null };
}

export interface BookSnapshot {
  entry: LibraryEntry;
  volumes: Volume[];
  chapters: ChapterMeta[];
  params: CheckParams;
}

/** main -> renderer 事件 */
export interface IpcEventMap {
  'check:progress': CheckProgress;
  'check:done': { hitCount: number };
  'check:error': { message: string };
  'book:changed': { bookId: string };
}

export const INVOKE_CHANNELS = [
  'library:list', 'library:create', 'library:delete', 'library:touch',
  'book:open', 'book:stats',
  'volume:create', 'volume:rename', 'volume:delete',
  'chapter:create', 'chapter:get', 'chapter:save', 'chapter:delete', 'chapter:move',
  'check:run', 'check:cancel', 'check:results', 'check:params', 'check:setParams', 'check:ignore',
  'search:run', 'export:run',
  'backup:create', 'backup:list', 'backup:restore',
  'dialog:selectDirectory',
] as const;

export const EVENT_CHANNELS = ['check:progress', 'check:done', 'check:error', 'book:changed'] as const;

export type InvokeChannel = keyof IpcInvokeMap;
export type EventChannel = keyof IpcEventMap;
