import type {
  IpcInvokeMap, InvokeChannel, IpcEventMap, EventChannel, BookSnapshot,
} from '../shared/ipc-contract';
import type {
  LibraryEntry, Volume, ChapterMeta, Chapter, CheckHit, CheckParams, CheckProgress,
  ChapterFlagInfo, SearchHit, ExportRequest, ExportResult, BackupInfo,
  ExportFormat, ExportScope,
} from '../shared/types';

interface NovelEditorApi {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, cb: (payload: unknown) => void): () => void;
}

const raw = (window as unknown as { novelEditor?: NovelEditorApi }).novelEditor;

/** Electron 未就绪时给出清晰报错（浏览器直开 vite 时可见） */
function call<C extends InvokeChannel>(
  channel: C,
  ...args: IpcInvokeMap[C]['req'] extends void ? [] : [IpcInvokeMap[C]['req']]
): Promise<IpcInvokeMap[C]['res']> {
  if (!raw) return Promise.reject(new Error('NovelEditor 运行时未就绪（需在 Electron 中运行）'));
  return raw.invoke(channel, ...args) as Promise<IpcInvokeMap[C]['res']>;
}

export const api = {
  listLibrary: () => call('library:list'),
  createBook: (title: string, author: string, description?: string) =>
    call('library:create', { title, author, description }),
  deleteBook: (id: string) => call('library:delete', { id }),
  touchBook: (id: string) => call('library:touch', { id }),
  openBook: (id: string): Promise<BookSnapshot> => call('book:open', { id }),
  bookStats: (id: string) => call('book:stats', { id }),

  createVolume: (bookId: string, title: string) => call('volume:create', { bookId, title }),
  renameVolume: (bookId: string, volumeId: string, title: string) =>
    call('volume:rename', { bookId, volumeId, title }),
  deleteVolume: (bookId: string, volumeId: string) => call('volume:delete', { bookId, volumeId }),

  createChapter: (bookId: string, volumeId: string, title: string) =>
    call('chapter:create', { bookId, volumeId, title }),
  getChapter: (bookId: string, chapterId: string): Promise<Chapter> =>
    call('chapter:get', { bookId, chapterId }),
  saveChapter: (bookId: string, chapterId: string, contentMd: string, version: number, title?: string) =>
    call('chapter:save', { bookId, chapterId, contentMd, version, title }),
  deleteChapter: (bookId: string, chapterId: string) => call('chapter:delete', { bookId, chapterId }),
  moveChapter: (bookId: string, chapterId: string, volumeId: string, index: number) =>
    call('chapter:move', { bookId, chapterId, volumeId, index }),

  runCheck: (bookId: string, full: boolean, chapterId?: string) =>
    call('check:run', { bookId, full, chapterId }),
  cancelCheck: (bookId: string) => call('check:cancel', { bookId }),
  checkResults: (bookId: string): Promise<{ hits: CheckHit[]; flags: Record<string, ChapterFlagInfo | null> }> =>
    call('check:results', { bookId }),
  getCheckParams: (bookId: string): Promise<CheckParams> => call('check:params', { bookId }),
  setCheckParams: (bookId: string, params: CheckParams) => call('check:setParams', { bookId, params }),
  ignoreHit: (bookId: string, hitId: number, ignored: boolean) =>
    call('check:ignore', { bookId, hitId, ignored }),

  search: (bookId: string, query: string): Promise<SearchHit[]> => call('search:run', { bookId, query }),
  runExport: (bookId: string, request: ExportRequest): Promise<ExportResult> =>
    call('export:run', { bookId, request }),

  createBackup: (bookId: string): Promise<BackupInfo[]> => call('backup:create', { bookId }),
  listBackups: (bookId: string): Promise<BackupInfo[]> => call('backup:list', { bookId }),
  restoreBackup: (bookId: string, name: string) => call('backup:restore', { bookId, name }),

  selectDirectory: (): Promise<string | null> => call('dialog:selectDirectory'),
  selectImage: (): Promise<{ canceled: boolean; filePath: string | null }> => call('dialog:selectImage'),
  on: <C extends EventChannel>(channel: C, cb: (payload: IpcEventMap[C]) => void) => {
    if (!raw) return () => {};
    return raw.on(channel, cb as (payload: unknown) => void);
  },
};

export type {
  LibraryEntry, Volume, ChapterMeta, Chapter, CheckHit, CheckParams, CheckProgress,
  ChapterFlagInfo, SearchHit, ExportRequest, ExportResult, BackupInfo, ExportFormat, ExportScope,
};