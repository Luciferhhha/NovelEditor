import { create } from 'zustand';
import { api, type CheckHit, type CheckParams, type ChapterFlagInfo } from '../api';
import type { CheckProgress } from '../../shared/types';

interface CheckState {
  hits: CheckHit[];
  flags: Record<string, ChapterFlagInfo | null>;
  params: CheckParams | null;
  running: boolean;
  progress: CheckProgress | null;
  reportVisible: boolean;
  error: string | null;
  run: (bookId: string, full: boolean, chapterId?: string) => Promise<void>;
  cancel: (bookId: string) => Promise<void>;
  loadResults: (bookId: string) => Promise<void>;
  loadParams: (bookId: string) => Promise<void>;
  saveParams: (bookId: string, params: CheckParams) => Promise<void>;
  toggleIgnore: (bookId: string, hit: CheckHit) => Promise<void>;
  setReportVisible: (v: boolean) => void;
  setProgress: (p: CheckProgress | null) => void;
  setRunning: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export const useCheckStore = create<CheckState>((set, get) => ({
  hits: [],
  flags: {},
  params: null,
  running: false,
  progress: null,
  reportVisible: false,
  error: null,

  run: async (bookId, full, chapterId) => {
    set({ running: true, error: null, progress: { phase: 'indexing', done: 0, total: 1 } });
    try {
      await api.runCheck(bookId, full, chapterId);
      await get().loadResults(bookId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      set({ running: false, progress: null });
    }
  },

  cancel: async (bookId) => { await api.cancelCheck(bookId); },

  loadResults: async (bookId) => {
    const res = await api.checkResults(bookId);
    set({ hits: res.hits, flags: res.flags });
  },

  loadParams: async (bookId) => set({ params: await api.getCheckParams(bookId) }),

  saveParams: async (bookId, params) => {
    await api.setCheckParams(bookId, params);
    set({ params });
  },

  toggleIgnore: async (bookId, hit) => {
    await api.ignoreHit(bookId, hit.id, !hit.ignored);
    await get().loadResults(bookId);
  },

  setReportVisible: (v) => set({ reportVisible: v }),
  setProgress: (p) => set({ progress: p }),
  setRunning: (v) => set({ running: v }),
  setError: (msg) => set({ error: msg }),
}));

/** 文本区间合并（用于高亮去重） */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else out.push(sorted[i]);
  }
  return out;
}
