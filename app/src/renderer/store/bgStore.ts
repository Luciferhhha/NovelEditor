import { create } from 'zustand';

/** 阅读/写作背景：默认 | 单色（内置常用色）| 自定义图片（file:/// URL） */
export interface ReaderBg {
  type: 'none' | 'color' | 'image';
  /** color 时为 CSS 颜色；image 时为 file:/// URL */
  value?: string;
}

/** 网上小说阅读常用背景（单色） */
export const READER_COLORS: { key: 'top.bgEye' | 'top.bgRice' | 'top.bgParchment' | 'top.bgGray'; color: string }[] = [
  { key: 'top.bgEye', color: '#C7EDCC' },       // 护眼绿（豆沙绿）
  { key: 'top.bgRice', color: '#F5ECD7' },      // 米黄
  { key: 'top.bgParchment', color: '#EFE3C8' }, // 羊皮纸
  { key: 'top.bgGray', color: '#ECEDEF' },      // 浅灰
];

const KEY = 'novelEditor.readerBg';

function load(): ReaderBg {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as ReaderBg;
      if (v && (v.type === 'none' || v.type === 'color' || v.type === 'image')) return v;
    }
  } catch { /* 忽略损坏数据 */ }
  return { type: 'none' };
}

/** 把背景写到 <html> 的 CSS 变量上（styles.css 消费） */
export function applyReaderBg(bg: ReaderBg): void {
  const root = document.documentElement;
  const s = root.style;
  if (bg.type === 'none') {
    root.removeAttribute('data-reader');
    s.removeProperty('--reader-bg-color');
    s.removeProperty('--reader-bg-image');
    s.removeProperty('--reader-bg-size');
    s.removeProperty('--reader-bg-repeat');
    s.removeProperty('--reader-wash');
    return;
  }
  root.setAttribute('data-reader', bg.type);
  if (bg.type === 'color') {
    s.setProperty('--reader-bg-color', bg.value || '#ffffff');
    s.removeProperty('--reader-bg-image');
    s.removeProperty('--reader-bg-size');
    s.removeProperty('--reader-bg-repeat');
    s.removeProperty('--reader-wash');
  } else {
    // 图片背景：浅色基底 + 白色蒙版保证正文可读；显示区域独占、文字不环绕
    const url = (bg.value || '').replace(/"/g, '%22');
    s.setProperty('--reader-bg-color', '#F7F4EC');
    s.setProperty('--reader-bg-image', 'url("' + url + '")');
    s.setProperty('--reader-bg-size', 'cover');
    s.setProperty('--reader-bg-repeat', 'no-repeat');
    s.setProperty('--reader-wash', 'linear-gradient(rgba(255,255,255,0.68), rgba(255,255,255,0.68))');
  }
}

interface BgState {
  bg: ReaderBg;
  setBg: (bg: ReaderBg) => void;
}

export const useBgStore = create<BgState>(set => ({
  bg: load(),
  setBg: bg => {
    try { localStorage.setItem(KEY, JSON.stringify(bg)); } catch { /* 存储不可用时忽略 */ }
    applyReaderBg(bg);
    set({ bg });
  },
}));

// 启动时应用一次
applyReaderBg(load());
