import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, App, Spin, Tooltip, Typography } from 'antd';
import {
  BoldOutlined, ItalicOutlined, FontSizeOutlined, OrderedListOutlined, UnorderedListOutlined,
  MutedOutlined, LinkOutlined, PictureOutlined, MinusCircleOutlined, UndoOutlined, RedoOutlined,
} from '@ant-design/icons';
import TopBar, { type SplitMode } from '../components/TopBar';
import OutlinePanel from '../components/OutlinePanel';
import MarkdownEditor, { type MarkdownEditorHandle, type SrcRange } from '../components/MarkdownEditor';
import PreviewPane, { type PreviewHandle } from '../components/PreviewPane';
import ReportPanel from '../components/ReportPanel';
import SearchModal from '../components/SearchModal';
import ExportModal from '../components/ExportModal';
import BackupModal from '../components/BackupModal';
import CheckSettingsModal from '../components/CheckSettingsModal';
import { useBookStore } from '../store/bookStore';
import { useEditorStore } from '../store/editorStore';
import { useCheckStore, mergeRanges } from '../store/checkStore';
import { textRangeToSrc } from '../../shared/markdown/offsetMap';
import type { CheckHit, ExportFormat, ExportScope } from '../api';

interface Props {
  bookId: string;
  onExit: () => void;
}

export default function EditorPage({ bookId, onExit }: Props) {
  const { message, modal } = App.useApp();
  const snapshot = useBookStore(s => s.snapshot);
  const refreshSnapshot = useBookStore(s => s.refreshSnapshot);
  const ed = useEditorStore();
  const check = useCheckStore();

  const [splitMode, setSplitMode] = useState<SplitMode>('split');
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [scrollTo, setScrollTo] = useState<{ from: number; token: number } | null>(null);

  // ---------- 面板宽度（拖拽调整，localStorage 持久化） ----------
  const [sizes, setSizes] = useState<LayoutSizes>(() => loadLayout());
  useEffect(() => { saveLayout(sizes); }, [sizes]);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  /** 通用横向拖拽：按下后监听 mousemove，松开清理 */
  const startResize = (onMove: (e: MouseEvent) => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => onMove(ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    document.body.style.userSelect = 'none';
  };
  const resizeOutline = startResize(e => {
    setSizes(v => ({ ...v, outline: clamp(e.clientX - 3, 160, 480) }));
  });
  const resizeReport = startResize(e => {
    setSizes(v => ({ ...v, report: clamp(document.documentElement.clientWidth - e.clientX - 3, 300, 660) }));
  });
  const resizeSplit = startResize(e => {
    const el = bodyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSizes(v => ({ ...v, split: clamp(pct, 15, 85) }));
  });

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const previewRef = useRef<PreviewHandle | null>(null);
  const scrollLock = useRef(0);
  const savingRef = useRef(false);

  const volumes = snapshot?.volumes ?? [];
  const chapters = snapshot?.chapters ?? [];
  const currentChapterId = ed.chapterId;
  const chapter = ed.chapter;

  // ---------- 首次进入自动选中第一章 ----------
  useEffect(() => {
    if (!snapshot || ed.chapterId) return;
    const first = chapters[0];
    if (first) void ed.loadChapter(bookId, first.id);
  }, [snapshot, chapters.length, ed.chapterId]);

  // ---------- 初始加载结果与参数 ----------
  useEffect(() => {
    void check.loadResults(bookId);
    void check.loadParams(bookId);
  }, [bookId]);

  // ---------- 自动保存（30s 轮询 + Ctrl/Cmd+S + 切章） ----------
  const doSave = useCallback(async (silent = false): Promise<boolean> => {
    if (savingRef.current) return false;
    if (!useEditorStore.getState().dirty) return false;
    savingRef.current = true;
    try {
      const res = await ed.save(bookId);
      if (res === 'ok' && !silent) message.success('已保存');
      return res === 'ok';
    } catch (e) {
      if (!silent) message.error('保存失败：' + (e instanceof Error ? e.message : String(e)));
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [bookId]);

  useEffect(() => {
    const t = setInterval(() => { void doSave(true); }, 30_000);
    return () => clearInterval(t);
  }, [doSave]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSave]);

  // 窗口关闭前尽力保存
  useEffect(() => {
    const handler = () => { void doSave(true); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [doSave]);

  // ---------- 版本冲突处理 ----------
  useEffect(() => {
    if (!ed.conflict) return;
    modal.confirm({
      title: '章节已被其他位置修改',
      content: '本地内容与磁盘上的最新版本不一致（乐观锁冲突）。选择处理方式：',
      okText: '用本地内容覆盖',
      cancelText: '放弃本地，加载最新',
      closable: false,
      maskClosable: false,
      onOk: () => ed.resolveConflictOverwrite(bookId),
      onCancel: () => ed.resolveConflictDiscard(bookId),
    });
  }, [ed.conflict]);

  // ---------- 切章：先保存再加载 ----------
  const selectChapter = async (chapterId: string) => {
    if (chapterId === ed.chapterId) return;
    await doSave(true);
    await ed.loadChapter(bookId, chapterId);
    previewRef.current?.setScrollRatio(0);
    editorRef.current?.setScrollRatio(0);
  };

  // ---------- 高亮区间（text 偏移 → 源码偏移） ----------
  const srcRanges: SrcRange[] = useMemo(() => {
    if (!chapter || check.hits.length === 0) return [];
    const plainMap = chapter.plainMap;
    const ranges: { from: number; to: number; level: 'warn' | 'bad' | null }[] = [];
    for (const h of check.hits) {
      if (h.ignored) continue;
      let start: number, end: number;
      if (h.chapterA === chapter.id) { start = h.startA; end = h.endA; }
      else if (h.chapterB === chapter.id) { start = h.startB; end = h.endB; }
      else continue;
      const src = textRangeToSrc(plainMap, start, end);
      ranges.push({ from: src.srcStart, to: src.srcEnd, level: h.kind === 'exact' || h.similarity >= 1 ? 'bad' : 'warn' });
    }
    return ranges;
  }, [chapter, check.hits]);

  // ---------- 同步滚动 ----------
  const editorScroll = (ratio: number) => {
    if (Date.now() < scrollLock.current) return;
    scrollLock.current = Date.now() + 80;
    previewRef.current?.setScrollRatio(ratio);
  };
  const previewScroll = (ratio: number) => {
    if (Date.now() < scrollLock.current) return;
    scrollLock.current = Date.now() + 80;
    editorRef.current?.setScrollRatio(ratio);
  };

  // ---------- 跳转 ----------
  const jumpToTextOffset = async (targetChapterId: string, textStart: number) => {
    if (targetChapterId !== ed.chapterId) {
      await selectChapter(targetChapterId);
    }
    const ch = useEditorStore.getState().chapter;
    if (!ch) return;
    const src = textRangeToSrc(ch.plainMap, textStart, textStart + 1);
    setScrollTo({ from: src.srcStart, token: Date.now() });
    setSplitMode(m => (m === 'preview' ? 'split' : m));
  };

  const jumpHit = async (hit: CheckHit, side: 'a' | 'b') => {
    const targetChapterId = side === 'a' ? hit.chapterA : hit.chapterB;
    const textStart = side === 'a' ? hit.startA : hit.startB;
    await jumpToTextOffset(targetChapterId, textStart);
  };

  // ---------- 查重 ----------
  const runCheck = async (full: boolean) => {
    try {
      setReportVisibleSafe(true);
      await check.run(bookId, full, full ? undefined : ed.chapterId ?? undefined);
      message.success('查重完成');
    } catch (e) {
      message.error('查重失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };
  const setReportVisibleSafe = (v: boolean) => check.setReportVisible(v);

  // ---------- 工具栏 ----------
  const wrapSel = (before: string, after: string) => editorRef.current?.wrapSelection(before, after);
  const insertLine = (prefix: string) => editorRef.current?.insertText(prefix);

  const toggleIgnore = async (hit: CheckHit) => {
    await check.toggleIgnore(bookId, hit);
  };

  const wordTotal = useMemo(() => chapters.reduce((s, c) => s + c.wordCount, 0), [chapters]);

  if (!snapshot) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>;
  }

  const showEditor = splitMode !== 'preview';
  const showPreview = splitMode !== 'edit';

  return (
    <div className="app-shell">
      <TopBar
        bookTitle={snapshot.entry.title}
        dirty={ed.dirty}
        saving={ed.saving}
        splitMode={splitMode}
        onSplitMode={setSplitMode}
        onSave={() => void doSave(false)}
        onSearch={() => setSearchOpen(true)}
        onRunCheck={() => void runCheck(true)}
        onToggleReport={() => check.setReportVisible(!check.reportVisible)}
        onExport={() => setExportOpen(true)}
        onBackup={() => setBackupOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onBack={async () => { await doSave(true); onExit(); }}
        checking={check.running}
        progress={check.progress}
        reportVisible={check.reportVisible}
      />

      <div
        className="editor-layout"
        style={{ '--outline-w': sizes.outline + 'px', '--report-w': sizes.report + 'px' } as React.CSSProperties}
      >
        <OutlinePanel
          bookId={bookId}
          volumes={volumes}
          chapters={chapters}
          currentChapterId={currentChapterId}
          onSelectChapter={id => void selectChapter(id)}
          onChanged={() => void refreshSnapshot()}
        />
        <div
          className="panel-resizer"
          title="拖动调整大纲宽度，双击复位；聚焦后 ←/→ 每次 16px"
          role="separator"
          aria-label="调整大纲宽度"
          tabIndex={0}
          onMouseDown={resizeOutline}
          onDoubleClick={() => setSizes(v => ({ ...v, outline: 260 }))}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 48 : 16);
              setSizes(v => ({ ...v, outline: clamp(v.outline + d, 160, 480) }));
            } else if (e.key === 'Home') setSizes(v => ({ ...v, outline: 260 }));
          }}
        />

        <div className="center-pane">
          <div className="editor-toolbar">
            <Tooltip title="标题"><Button size="small" type="text" icon={<FontSizeOutlined />} onClick={() => insertLine('## ')} /></Tooltip>
            <Tooltip title="加粗"><Button size="small" type="text" icon={<BoldOutlined />} onClick={() => wrapSel('**', '**')} /></Tooltip>
            <Tooltip title="斜体"><Button size="small" type="text" icon={<ItalicOutlined />} onClick={() => wrapSel('*', '*')} /></Tooltip>
            <span className="sep" />
            <Tooltip title="引用"><Button size="small" type="text" icon={<MutedOutlined />} onClick={() => insertLine('> ')} /></Tooltip>
            <Tooltip title="有序列表"><Button size="small" type="text" icon={<OrderedListOutlined />} onClick={() => insertLine('1. ')} /></Tooltip>
            <Tooltip title="无序列表"><Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => insertLine('- ')} /></Tooltip>
            <span className="sep" />
            <Tooltip title="链接"><Button size="small" type="text" icon={<LinkOutlined />} onClick={() => wrapSel('[', '](url)')} /></Tooltip>
            <Tooltip title="图片"><Button size="small" type="text" icon={<PictureOutlined />} onClick={() => wrapSel('![', '](img.png)')} /></Tooltip>
            <Tooltip title="分隔线"><Button size="small" type="text" icon={<MinusCircleOutlined />} onClick={() => insertLine('\n---\n')} /></Tooltip>
            <span className="sep" />
            <Tooltip title="撤销"><Button size="small" type="text" icon={<UndoOutlined />} onClick={() => editorRef.current?.undo()} /></Tooltip>
            <Tooltip title="重做"><Button size="small" type="text" icon={<RedoOutlined />} onClick={() => editorRef.current?.redo()} /></Tooltip>
            <span style={{ flex: 1 }} />
            {chapter && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {chapter.title} · {chapter.wordCount} 字
                {chapter.flag && (
                  <Tooltip title="本章存在重复内容，点击「报告」查看详情">
                    <span style={{ marginLeft: 8, cursor: 'pointer', color: chapter.flag.level === 'bad' ? '#dc2626' : '#d97706' }}>
                      {chapter.flag.level === 'bad' ? '⚠ 重复' : '⚠ 疑似'}
                    </span>
                  </Tooltip>
                )}
              </Typography.Text>
            )}
          </div>

          <div className="editor-body" ref={bodyRef}>
            {showEditor && (
              <div
                className="editor-pane"
                style={splitMode === 'split' ? { flex: `${sizes.split} 1 0%` } : { flex: 'none', width: '100%' }}
              >
                <MarkdownEditor
                  ref={editorRef}
                  value={ed.content}
                  onChange={ed.setContent}
                  ranges={srcRanges}
                  onScroll={editorScroll}
                  scrollTo={scrollTo}
                />
              </div>
            )}
            {splitMode === 'split' && (
              <div
                className="split-divider"
                title="拖动调整编辑/预览宽度，双击五五开"
                onMouseDown={resizeSplit}
                onDoubleClick={() => setSizes(v => ({ ...v, split: 50 }))}
              />
            )}
            {showPreview && (
              <div
                style={splitMode === 'split'
                  ? { flex: `${100 - sizes.split} 1 0%`, display: 'flex', minHeight: 0 }
                  : { flex: 'none', width: '100%', display: 'flex', minHeight: 0 }}
              >
                <PreviewPane ref={previewRef} content={ed.content} onScroll={previewScroll} />
              </div>
            )}
          </div>

          <div className="status-bar">
            <span>章 {chapters.length}</span>
            <span>卷 {volumes.length}</span>
            <span>全书 {(wordTotal / 10000).toFixed(2)} 万字</span>
            <span>{ed.saving ? '保存中…' : ed.dirty ? '未保存更改' : '已同步'}</span>
            <span style={{ marginLeft: 'auto' }}>
              {check.running ? '查重进行中…' : `命中 ${check.hits.filter(h => !h.ignored).length} 处`}
            </span>
            <Button size="small" type={check.reportVisible ? 'primary' : 'default'} onClick={() => check.setReportVisible(!check.reportVisible)}>
              报告
            </Button>
          </div>
        </div>

        {check.reportVisible && (
          <div
            className="panel-resizer"
            title="拖动调整报告宽度，双击复位"
            role="separator"
            aria-label="调整报告宽度"
            tabIndex={0}
            onMouseDown={resizeReport}
            onDoubleClick={() => setSizes(v => ({ ...v, report: 360 }))}
            onKeyDown={e => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const d = (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 48 : 16);
                setSizes(v => ({ ...v, report: clamp(v.report + d, 300, 660) }));
              } else if (e.key === 'Home') setSizes(v => ({ ...v, report: 360 }));
            }}
          />
        )}
        {check.reportVisible && (
          <ReportPanel
            running={check.running}
            hits={check.hits}
            chapters={chapters}
            currentChapterId={currentChapterId}
            error={check.error}
            showIgnored={showIgnored}
            onShowIgnored={setShowIgnored}
            onClose={() => check.setReportVisible(false)}
            onJump={(hit, side) => void jumpHit(hit, side)}
            onToggleIgnore={hit => void toggleIgnore(hit)}
          />
        )}
      </div>

      <SearchModal
        open={searchOpen}
        bookId={bookId}
        onClose={() => setSearchOpen(false)}
        onJump={(chapterId, textStart) => void jumpToTextOffset(chapterId, textStart)}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        volumes={volumes}
        chapters={chapters}
        onRun={async (scope: ExportScope, targetId, format: ExportFormat) => {
          const res = await api_runExport(bookId, scope, targetId, format);
          if (res.canceled) return;
          message.success('已导出：' + (res.filePath ?? ''));
        }}
      />

      <BackupModal
        open={backupOpen}
        bookId={bookId}
        onClose={() => setBackupOpen(false)}
        onChanged={() => { void refreshSnapshot(); void ed.loadChapter(bookId, ed.chapterId ?? ''); }}
      />

      <CheckSettingsModal
        open={settingsOpen}
        params={check.params}
        onClose={() => setSettingsOpen(false)}
        onSave={async params => { await check.saveParams(bookId, params); message.success('参数已保存，下次查重生效'); }}
      />
    </div>
  );
}

// ---------- 布局尺寸：读写 localStorage ----------
interface LayoutSizes { outline: number; report: number; split: number }
const LAYOUT_KEY = 'novelEditor.layout.v1';
const DEFAULT_LAYOUT: LayoutSizes = { outline: 260, report: 360, split: 50 };
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function loadLayout(): LayoutSizes {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<LayoutSizes>;
      return {
        outline: typeof o.outline === 'number' ? clamp(o.outline, 160, 480) : DEFAULT_LAYOUT.outline,
        report: typeof o.report === 'number' ? clamp(o.report, 300, 660) : DEFAULT_LAYOUT.report,
        split: typeof o.split === 'number' ? clamp(o.split, 15, 85) : DEFAULT_LAYOUT.split,
      };
    }
  } catch { /* 忽略损坏数据 */ }
  return { ...DEFAULT_LAYOUT };
}
function saveLayout(v: LayoutSizes) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)); } catch { /* 存储不可用时忽略 */ }
}

// 独立导入避免循环依赖提示
import { api as fullApi } from '../api';
async function api_runExport(bookId: string, scope: ExportScope, targetId: string | undefined, format: ExportFormat) {
  return fullApi.runExport(bookId, { scope, targetId, format });
}