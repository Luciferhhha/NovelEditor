import React, { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import LibraryPage from './pages/LibraryPage';
import EditorPage from './pages/EditorPage';
import { useBookStore } from './store/bookStore';
import { useEditorStore } from './store/editorStore';
import { useCheckStore } from './store/checkStore';
import { api } from './api';

export default function App() {
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const openBook = useBookStore(s => s.openBook);
  const refreshSnapshot = useBookStore(s => s.refreshSnapshot);

  // ---------- 全局事件接线（仅订阅一次） ----------
  useEffect(() => {
    const unsubs = [
      api.on('book:changed', () => {
        void refreshSnapshot();
        // 章节元数据（字数/标记）变化时，若未在编辑中则刷新当前章视图
        const ed = useEditorStore.getState();
        if (!ed.dirty && ed.chapterId) {
          void useBookStore.getState().refreshSnapshot();
        }
      }),
      api.on('check:progress', p => {
        const check = useCheckStore.getState();
        check.setProgress(p);
        check.setRunning(true);
      }),
      api.on('check:done', () => {
        const check = useCheckStore.getState();
        check.setRunning(false);
        check.setProgress(null);
        const bookId = useBookStore.getState().currentBookId;
        if (bookId) void check.loadResults(bookId);
      }),
      api.on('check:error', payload => {
        const check = useCheckStore.getState();
        check.setRunning(false);
        check.setError(payload.message);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const handleOpen = async (id: string) => {
    await openBook(id);
    setCurrentBookId(id);
  };

  const handleExit = () => {
    useEditorStore.getState().reset();
    setCurrentBookId(null);
    void useBookStore.getState().loadLibrary();
  };

  return (
    <AntApp style={{ height: '100%' }}>
      {currentBookId ? (
        <EditorPage bookId={currentBookId} onExit={handleExit} />
      ) : (
        <LibraryPage onOpen={id => void handleOpen(id)} />
      )}
    </AntApp>
  );
}
