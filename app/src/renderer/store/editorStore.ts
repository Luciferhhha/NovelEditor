import { create } from 'zustand';
import { api, type Chapter, type ChapterMeta } from '../api';
import { extractOutline, type OutlineItem } from '../../shared/markdown/outline';

interface EditorState {
  chapterId: string | null;
  chapter: Chapter | null;
  content: string;
  version: number;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  /** 查重定位：content_text 中的高亮区间（进入该章时由组件写入） */
  highlightRanges: [number, number][];
  loadChapter: (bookId: string, chapterId: string) => Promise<void>;
  setContent: (content: string) => void;
  save: (bookId: string, title?: string) => Promise<'ok' | 'conflict' | 'noop'>;
  resolveConflictOverwrite: (bookId: string) => Promise<void>;
  resolveConflictDiscard: (bookId: string) => Promise<void>;
  /** 清空编辑器状态（返回书架时调用） */
  reset: () => void;
  setHighlightRanges: (ranges: [number, number][]) => void;
  applyChapterMeta: (meta: ChapterMeta) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  chapterId: null,
  chapter: null,
  content: '',
  version: 0,
  dirty: false,
  saving: false,
  conflict: false,
  highlightRanges: [],

  reset: () => set({ chapterId: null, chapter: null, content: '', version: 0, dirty: false, saving: false, conflict: false, highlightRanges: [] }),

  loadChapter: async (bookId, chapterId) => {
    const ch = await api.getChapter(bookId, chapterId);
    set({
      chapterId, chapter: ch, content: ch.contentMd, version: ch.version,
      dirty: false, conflict: false, highlightRanges: [],
    });
  },

  setContent: (content) => set(state => ({
    content,
    // 与章节原文一致（如切章时编辑器回填）不算修改，避免打开即"未保存"的假脏标记
    dirty: state.chapter ? content !== state.chapter.contentMd : state.dirty,
  })),

  save: async (bookId, title) => {
    const { chapterId, content, version, dirty } = get();
    if (!chapterId || !dirty) return 'noop';
    set({ saving: true });
    try {
      const res = await api.saveChapter(bookId, chapterId, content, version, title);
      set({ version: res.version, dirty: false, conflict: false });
      const chapter = get().chapter;
      if (chapter) set({ chapter: { ...chapter, updatedAt: res.updatedAt, version: res.version } });
      return 'ok';
    } catch (err) {
      if (err instanceof Error && err.message.includes('VERSION_CONFLICT')) {
        set({ conflict: true });
        return 'conflict';
      }
      throw err;
    } finally {
      set({ saving: false });
    }
  },

  /** 冲突处理：以本地内容覆盖（采用最新版本号重存） */
  resolveConflictOverwrite: async (bookId) => {
    const { chapterId, content } = get();
    if (!chapterId) return;
    const latest = await api.getChapter(bookId, chapterId);
    set({ saving: true });
    try {
      const res = await api.saveChapter(bookId, chapterId, content, latest.version);
      set({ version: res.version, dirty: false, conflict: false });
    } finally {
      set({ saving: false });
    }
  },

  /** 冲突处理：放弃本地，加载最新 */
  resolveConflictDiscard: async (bookId) => {
    const { chapterId } = get();
    if (!chapterId) return;
    await get().loadChapter(bookId, chapterId);
  },

  setHighlightRanges: (ranges) => set({ highlightRanges: ranges }),

  applyChapterMeta: (meta) => {
    const chapter = get().chapter;
    if (chapter && chapter.id === meta.id) set({ chapter: { ...chapter, ...meta } });
  },
}));

export function computeOutline(content: string): OutlineItem[] {
  return extractOutline(content);
}
