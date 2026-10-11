import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars,
  Decoration, type DecorationSet, WidgetType,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { HighlightStyle } from '@codemirror/language';

export interface SrcRange { from: number; to: number; level?: 'warn' | 'bad' | null; }

export interface MarkdownEditorHandle {
  insertText: (text: string) => void;
  wrapSelection: (before: string, after: string) => void;
  focusAt: (srcOffset: number) => void;
  getScrollRatio: () => number;
  setScrollRatio: (r: number) => void;
  undo: () => void;
  redo: () => void;
}

const setRanges = StateEffect.define<SrcRange[]>();

const markClass = Decoration.mark({ class: 'hit-mark' });
const markClassBad = Decoration.mark({ class: 'hit-mark bad' });

const rangeField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setRanges)) continue;
      const ranges = e.value
        .map((r): { from: number; to: number; deco: Decoration } | null => {
          const from = Math.max(0, Math.min(r.from, tr.state.doc.length));
          const to = Math.max(from, Math.min(r.to, tr.state.doc.length));
          if (to <= from) return null;
          return { from, to, deco: r.level === 'bad' ? markClassBad : markClass };
        })
        .filter((x): x is { from: number; to: number; deco: Decoration } => x !== null);
      return Decoration.set(ranges.map(r => r.deco.range(r.from, r.to)), true);
    }
    if (!tr.docChanged) return deco;
    return deco.map(tr.changes);
  },
});

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: '#1d3f73', fontWeight: '700' },
  { tag: tags.heading2, color: '#2b5aa3', fontWeight: '700' },
  { tag: tags.heading3, color: '#3b6fc4', fontWeight: '600' },
  { tag: tags.heading4, color: '#4a7ed0' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: '#2563eb', textDecoration: 'underline' },
  { tag: tags.url, color: '#9ca3af' },
  { tag: tags.quote, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.monospace, background: '#f3f4f6', borderRadius: 3, padding: '0 3px' },
  { tag: tags.comment, color: '#9ca3af' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  ranges: SrcRange[];
  onScroll?: (ratio: number) => void;
  scrollTo?: { from: number; token: number } | null;
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(function MarkdownEditor(
  { value, onChange, ranges, onScroll, scrollTo }, ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          syntaxHighlighting(mdHighlight),
          rangeField,
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => true },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of(u => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
            if (u.viewportChanged || u.geometryChanged || u.docChanged) {
              const el = u.view.scrollDOM;
              const max = el.scrollHeight - el.clientHeight;
              if (max > 0 && onScrollRef.current) onScrollRef.current(el.scrollTop / max);
            }
          }),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // 仅初始化一次；value 变化通过下面 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 变化（切换章节 / 冲突恢复）时同步
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  // 高亮区间
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setRanges.of(ranges) });
  }, [ranges]);

  // 定位滚动
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scrollTo) return;
    const pos = Math.max(0, Math.min(scrollTo.from, view.state.doc.length));
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }, [scrollTo]);

  useImperativeHandle(ref, () => ({
    insertText(text) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      view.focus();
    },
    wrapSelection(before, after) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const sel = view.state.sliceDoc(from, to);
      const insert = before + sel + after;
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + before.length, head: from + before.length + sel.length },
      });
      view.focus();
    },
    focusAt(srcOffset) {
      const view = viewRef.current;
      if (!view) return;
      const pos = Math.max(0, Math.min(srcOffset, view.state.doc.length));
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
    getScrollRatio() {
      const view = viewRef.current;
      if (!view) return 0;
      const el = view.scrollDOM;
      const max = el.scrollHeight - el.clientHeight;
      return max > 0 ? el.scrollTop / max : 0;
    },
    setScrollRatio(r) {
      const view = viewRef.current;
      if (!view) return;
      const el = view.scrollDOM;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(1, r)) * max;
    },
    undo() {
      const view = viewRef.current;
      if (!view) return;
      undo(view);
      view.focus();
    },
    redo() {
      const view = viewRef.current;
      if (!view) return;
      redo(view);
      view.focus();
    },
  }));

  return <div className="cm-host" ref={hostRef} />;
});

export default MarkdownEditor;
