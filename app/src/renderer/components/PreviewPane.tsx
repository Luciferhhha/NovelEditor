import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { renderPreviewHtml } from '../markdownRender';

export interface PreviewHandle {
  setScrollRatio: (r: number) => void;
}

interface Props {
  content: string;
  onScroll?: (ratio: number) => void;
}

const PreviewPane = forwardRef<PreviewHandle, Props>(function PreviewPane({ content, onScroll }, ref) {
  const refBox = useRef<HTMLDivElement | null>(null);
  const html = renderPreviewHtml(content);

  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  useEffect(() => {
    const el = refBox.current;
    if (!el) return;
    const handler = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0 && onScrollRef.current) onScrollRef.current(el.scrollTop / max);
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []);

  useImperativeHandle(ref, () => ({
    setScrollRatio(r) {
      const el = refBox.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.max(0, Math.min(1, r)) * max;
    },
  }));

  return (
    <div className="preview-pane" ref={refBox}>
      <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

export default PreviewPane;