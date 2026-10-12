import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
const KEY = 'novelEditor.theme';

function read(): ThemeMode {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

interface ThemeState {
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (t: ThemeMode) => void;
}

/** 全局明/暗主题（影响 antd 算法与 [data-theme] CSS 覆盖），持久化到 localStorage */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: read(),
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setTheme: t => {
    try { localStorage.setItem(KEY, t); } catch { /* 忽略 */ }
    document.documentElement.dataset.theme = t;
    set({ theme: t });
  },
}));

// 首次加载立即应用，避免闪烁
document.documentElement.dataset.theme = read();
