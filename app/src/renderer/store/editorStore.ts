import { create } from 'zustand';
import { api, type Chapter, type ChapterMeta } from '../api';
import { extractOutline, type OutlineItem } from '../../shared/markdown/outline';

/** 回退快照：某次保存前的章节内容（会话级，关闭软件即清空） */
export interface StepSnapshot { bookId: string; chapterId: string; content: string; }

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
  /** 清空编辑器状态（返回书架时调用；不清 history——回退范围是整个会话） */
  reset: () => void;
  /** 会话级回退栈（保存前快照，最多 200 条） */
  history: StepSnapshot[];
  popHistory: () => StepSnapshot | null;
  /** 回退保存时置 true，抑制该次保存入栈 */
  suppressPush: boolean;
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
  history: [],
  suppressPush: false,

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
    const before = get().chapter?.contentMd;
    try {
      const res = await api.saveChapter(bookId, chapterId, content, version, title);
      set({ version: res.version, dirty: false, conflict: false });
      // 入栈：保存前的内容（仅在内容实际变化且非回退保存时）
      if (get().suppressPush) {
        set({ suppressPush: false });
      } else if (before !== undefined && before !== content) {
        const h = [...get().history, { bookId, chapterId, content: before }];
        set({ history: h.length > 200 ? h.slice(-200) : h });
      }
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

  popHistory: () => {
    const h = get().history;
    if (h.length === 0) return null;
    const snap = h[h.length - 1];
    set({ history: h.slice(0, -1) });
    return snap;
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