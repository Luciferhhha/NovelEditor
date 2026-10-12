import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, App, Spin, Tooltip, Typography } from 'antd';
import {
  BoldOutlined, ItalicOutlined, FontSizeOutlined, OrderedListOutlined, UnorderedListOutlined,
  MutedOutlined, LinkOutlined, PictureOutlined, MinusCircleOutlined, ArrowLeftOutlined, UndoOutlined, RedoOutlined,
  SwapOutlined,
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
import { useT } from '../i18n';

interface Props {
  bookId: string;
  onExit: () => void;
}

export default function EditorPage({ bookId, onExit }: Props) {
  const t = useT();
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
    const pct = sizes.splitDir === 'v'
      ? ((e.clientY - rect.top) / rect.height) * 100
      : ((e.clientX - rect.left) / rect.width) * 100;
    setSizes(v => ({ ...v, split: clamp(pct, 15, 85) }));
  });

  /** 对角拖柄：同时调整面板宽与高（起点取手柄当前几何，位置即状态） */
  const startCorner = (side: 'outline' | 'report') => (e: React.MouseEvent) => {
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement;
    const parent = grip.offsetParent as HTMLElement | null;
    if (!parent) return;
    const parentH = parent.offsetHeight;
    const startW = side === 'outline'
      ? grip.offsetLeft + 16
      : parent.offsetWidth - grip.offsetLeft + 16;
    const startH = grip.offsetTop + 16;
    if (parentH <= 0 || startW <= 0 || startH <= 0) return;
    const ratio = startW / startH; // 等比锁定的宽高比
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      let w = side === 'outline' ? startW + dx : startW - dx;
      let h = startH + dy;
      if (ev.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) h = w / ratio;
        else w = h * ratio;
      }
      const wMin = side === 'outline' ? 160 : 300;
      const wMax = side === 'outline' ? 480 : 660;
      w = clamp(w, wMin, wMax);
      const pct = clamp((h / parentH) * 100, 25, 100);
      if (side === 'outline') setSizes(v => ({ ...v, outline: Math.round(w), outlineH: Math.round(pct) }));
      else setSizes(v => ({ ...v, report: Math.round(w), reportH: Math.round(pct) }));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    document.body.style.userSelect = 'none';
  };

  /** 角柄键盘调节：↑↓ 调高（Shift 大步），←→ 调宽，Home 复位 */
  const cornerKey = (side: 'outline' | 'report') => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const d = (e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 12 : 4);
      if (side === 'outline') setSizes(v => ({ ...v, outlineH: clamp(v.outlineH + d, 25, 100) }));
      else setSizes(v => ({ ...v, reportH: clamp(v.reportH + d, 25, 100) }));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 48 : 16;
      if (side === 'outline') {
        const d = (e.key === 'ArrowRight' ? 1 : -1) * step;
        setSizes(v => ({ ...v, outline: clamp(v.outline + d, 160, 480) }));
      } else {
        const d = (e.key === 'ArrowLeft' ? 1 : -1) * step;
        setSizes(v => ({ ...v, report: clamp(v.report + d, 300, 660) }));
      }
    } else if (e.key === 'Home') {
      if (side === 'outline') setSizes(v => ({ ...v, outline: 260, outlineH: 100 }));
      else setSizes(v => ({ ...v, report: 360, reportH: 100 }));
    }
  };

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
      if (res === 'ok' && !silent) message.success(t('ed.saved'));
      return res === 'ok';
    } catch (e) {
      if (!silent) message.error(t('ed.saveFail') + (e instanceof Error ? e.message : String(e)));
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
      title: t('ed.conflictTitle'),
      content: t('ed.conflictContent'),
      okText: t('ed.conflictOverwrite'),
      cancelText: t('ed.conflictDiscard'),
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
      message.success(t('ed.checkDone'));
    } catch (e) {
      message.error(t('ed.checkFail') + (e instanceof Error ? e.message : String(e)));
    }
  };
  const setReportVisibleSafe = (v: boolean) => check.setReportVisible(v);

  // ---------- 工具栏 ----------
  const wrapSel = (before: string, after: string) => editorRef.current?.wrapSelection(before, after);
  const insertLine = (prefix: string) => editorRef.current?.insertText(prefix);
  const insertImage = async () => {
    try {
      const res = await fullApi.selectImage();
      if (res.canceled || !res.filePath) return;
      // file:/// + encodeURI：保留 / : 编码空格与中文
      const url = 'file:///' + encodeURI(res.filePath.replace(/\\/g, '/'));
      const base = (res.filePath.split(/[\\/]/).pop() || 'image').replace(/\.[^.]+$/, '');
      editorRef.current?.insertText(`![${base}](${url})`);
    } catch {
      message.error(t('ed.imgFail'));
    }
  };

  /** 一键回退：恢复到上一次保存前的内容（回退栈随本次启动存在，关闭即清空） */
  const stepBack = async () => {
    // 先冲刷未保存编辑，保证栈顶是“上一步”
    await doSave(true);
    const snap = useEditorStore.getState().popHistory();
    if (!snap) {
      message.info(t('ed.noUndo'));
      return;
    }
    if (snap.bookId !== bookId) {
      message.warning(t('ed.undoOtherBook'));
      return;
    }
    try {
      if (snap.chapterId !== useEditorStore.getState().chapterId) {
        await selectChapter(snap.chapterId);
      }
      useEditorStore.setState({ suppressPush: true });
      ed.setContent(snap.content);
      await doSave(true);
      message.success(t('ed.undoDone'));
    } catch (e) {
      message.error(t('ed.undoFail') + (e instanceof Error ? e.message : String(e)));
    }
  };

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
        style={{
          '--outline-w': sizes.outline + 'px',
          '--report-w': sizes.report + 'px',
          '--outline-h': sizes.outlineH + '%',
          '--report-h': sizes.reportH + '%',
        } as React.CSSProperties}
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
          title={t('ed.rzOutline')}
          role="separator"
          aria-label={t('ed.rzOutlineAria')}
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
            <Tooltip title={t('ed.ttTitle')}><Button size="small" type="text" icon={<FontSizeOutlined />} onClick={() => insertLine('## ')} /></Tooltip>
            <Tooltip title={t('ed.ttBold')}><Button size="small" type="text" icon={<BoldOutlined />} onClick={() => wrapSel('**', '**')} /></Tooltip>
            <Tooltip title={t('ed.ttItalic')}><Button size="small" type="text" icon={<ItalicOutlined />} onClick={() => wrapSel('*', '*')} /></Tooltip>
            <span className="sep" />
            <Tooltip title={t('ed.ttQuote')}><Button size="small" type="text" icon={<MutedOutlined />} onClick={() => insertLine('> ')} /></Tooltip>
            <Tooltip title={t('ed.ttOl')}><Button size="small" type="text" icon={<OrderedListOutlined />} onClick={() => insertLine('1. ')} /></Tooltip>
            <Tooltip title={t('ed.ttUl')}><Button size="small" type="text" icon={<UnorderedListOutlined />} onClick={() => insertLine('- ')} /></Tooltip>
            <span className="sep" />
            <Tooltip title={t('ed.ttLink')}><Button size="small" type="text" icon={<LinkOutlined />} onClick={() => wrapSel('[', '](url)')} /></Tooltip>
            <Tooltip title={t('ed.ttImage')}><Button size="small" type="text" icon={<PictureOutlined />} onClick={() => void insertImage()} /></Tooltip>
            <Tooltip title={t('ed.ttHr')}><Button size="small" type="text" icon={<MinusCircleOutlined />} onClick={() => insertLine('\n---\n')} /></Tooltip>
            <span className="sep" />
            <Tooltip title={t('ed.ttUndo')}><Button size="small" type="text" icon={<UndoOutlined />} onClick={() => editorRef.current?.undo()} /></Tooltip>
            <Tooltip title={t('ed.ttRedo')}><Button size="small" type="text" icon={<RedoOutlined />} onClick={() => editorRef.current?.redo()} /></Tooltip>
            <Tooltip title={t('ed.ttStepBack')}><Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => void stepBack()} /></Tooltip>
            {splitMode === 'split' && (
              <Tooltip title={t('ed.ttDir')}>
                <Button
                  size="small"
                  type="text"
                  icon={<SwapOutlined />}
                  onClick={() => setSizes(v => ({ ...v, splitDir: v.splitDir === 'h' ? 'v' : 'h' }))}
                />
              </Tooltip>
            )}
            <span style={{ flex: 1 }} />
            {chapter && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {chapter.title} · {t('ed.chars', { n: chapter.wordCount })}
                {chapter.flag && (
                  <Tooltip title={t('out.chapterDupTip')}>
                    <span style={{ marginLeft: 8, cursor: 'pointer', color: chapter.flag.level === 'bad' ? '#dc2626' : '#d97706' }}>
                      {chapter.flag.level === 'bad' ? t('ed.flagDup') : t('ed.flagSuspect')}
                    </span>
                  </Tooltip>
                )}
              </Typography.Text>
            )}
          </div>

          <div className={'editor-body' + (splitMode === 'split' && sizes.splitDir === 'v' ? ' split-v' : '')} ref={bodyRef}>
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
                title={sizes.splitDir === 'v' ? t('ed.rzSplitV') : t('ed.rzSplit')}
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
            <span>{t('ed.statChapters', { n: chapters.length })}</span>
            <span>{t('ed.statVolumes', { n: volumes.length })}</span>
            <span>{t('ed.statBook', { n: (wordTotal / 10000).toFixed(2) })}</span>
            <span>{ed.saving ? t('ed.saving') : ed.dirty ? t('ed.unsavedChanges') : t('ed.synced')}</span>
            <span style={{ marginLeft: 'auto' }}>
              {check.running ? t('ed.checkingRun') : t('ed.hitsCount', { n: check.hits.filter(h => !h.ignored).length })}
            </span>
            <Button size="small" type={check.reportVisible ? 'primary' : 'default'} onClick={() => check.setReportVisible(!check.reportVisible)}>
              {t('top.report')}
            </Button>
          </div>
        </div>

        {check.reportVisible && (
          <div
            className="panel-resizer"
            title={t('ed.rzReport')}
            role="separator"
            aria-label={t('ed.rzReportAria')}
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
        {/* 对角拖柄：拖动同时调整面板宽与高（Shift 等比，双击复位） */}
        <div
          className="corner-grip outline-grip"
          title={t('ed.rzCorner')}
          role="separator"
          aria-label={t('ed.rzCornerAria')}
          tabIndex={0}
          onMouseDown={startCorner('outline')}
          onDoubleClick={() => setSizes(v => ({ ...v, outline: 260, outlineH: 100 }))}
          onKeyDown={cornerKey('outline')}
        />
        {check.reportVisible && (
          <div
            className="corner-grip report-grip"
            title={t('ed.rzCorner')}
            role="separator"
            aria-label={t('ed.rzCornerAria')}
            tabIndex={0}
            onMouseDown={startCorner('report')}
            onDoubleClick={() => setSizes(v => ({ ...v, report: 360, reportH: 100 }))}
            onKeyDown={cornerKey('report')}
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
          message.success(t('ed.exported') + (res.filePath ?? ''));
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
        onSave={async params => { await check.saveParams(bookId, params); message.success(t('ed.paramsSaved')); }}
      />
    </div>
  );
}

// ---------- 布局尺寸：读写 localStorage ----------
interface LayoutSizes {
  outline: number; report: number; split: number;
  outlineH: number; reportH: number; // 面板高度（占编辑区的百分比，25~100）
  splitDir: 'h' | 'v';               // 分屏方向：左右 / 上下
}
const LAYOUT_KEY = 'novelEditor.layout.v1';
const DEFAULT_LAYOUT: LayoutSizes = { outline: 260, report: 360, split: 50, outlineH: 100, reportH: 100, splitDir: 'h' };
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
        outlineH: typeof o.outlineH === 'number' ? clamp(o.outlineH, 25, 100) : DEFAULT_LAYOUT.outlineH,
        reportH: typeof o.reportH === 'number' ? clamp(o.reportH, 25, 100) : DEFAULT_LAYOUT.reportH,
        splitDir: o.splitDir === 'v' ? 'v' : 'h',
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