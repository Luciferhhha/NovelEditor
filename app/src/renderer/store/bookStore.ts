import { create } from 'zustand';
import { api, type LibraryEntry, type ChapterMeta, type Volume, type CheckParams } from '../api';
import type { BookSnapshot } from '../../shared/ipc-contract';

interface BookState {
  library: LibraryEntry[];
  snapshot: BookSnapshot | null;
  currentBookId: string | null;
  loading: boolean;
  loadLibrary: () => Promise<void>;
  createBook: (title: string, author: string, description?: string) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  openBook: (id: string) => Promise<void>;
  closeBook: () => void;
  refreshSnapshot: () => Promise<void>;
}

export const useBookStore = create<BookState>((set, get) => ({
  library: [],
  snapshot: null,
  currentBookId: null,
  loading: false,

  loadLibrary: async () => {
    set({ library: await api.listLibrary() });
  },

  createBook: async (title, author, description) => {
    await api.createBook(title, author, description);
    await get().loadLibrary();
  },

  deleteBook: async (id) => {
    await api.deleteBook(id);
    await get().loadLibrary();
  },

  openBook: async (id) => {
    set({ loading: true });
    try {
      const snapshot = await api.openBook(id);
      set({ snapshot, currentBookId: id });
    } finally {
      set({ loading: false });
    }
  },

  closeBook: () => set({ snapshot: null, currentBookId: null }),

  refreshSnapshot: async () => {
    const { currentBookId } = get();
    if (!currentBookId) return;
    const snapshot = await api.openBook(currentBookId);
    set({ snapshot });
  },
}));

export const selectVolumes = (snap: BookSnapshot | null): Volume[] => snap?.volumes ?? [];
export const selectChapters = (snap: BookSnapshot | null): ChapterMeta[] => snap?.chapters ?? [];
export const selectParams = (snap: BookSnapshot | null): CheckParams | null => snap?.params ?? null;
