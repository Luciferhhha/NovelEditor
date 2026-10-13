import React, { forwardRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { EditOutlined, EyeOutlined, MinusOutlined } from '@ant-design/icons';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import { renderPreviewHtml } from '../markdownRender';
import { useT } from '../i18n';

interface Props {
  content: string;
  onChange: (value: string) => void;
  onFocusPane: () => void;
  saving: boolean;
  /** 收起整个板块（由父级隐藏并提供窄条恢复入口） */
  onCollapse?: () => void;
}

/**
 * 大纲计划书板块：独立于章节内容的全书大纲/创作计划（Markdown）。
 * 编辑态为 CodeMirror 源码视图；预览态直接渲染 Markdown（含图片），
 * 便于插入含大纲内容的图片后立即查看。编辑器常驻挂载（预览时仅隐藏），
 * 以保证顶部工具栏 / AI 助手的 planRef 始终可用。
 */
const PlanPanel = forwardRef<MarkdownEditorHandle, Props>(function PlanPanel(
  { content, onChange, onFocusPane, saving, onCollapse }, ref,
) {
  const t = useT();
  const [preview, setPreview] = useState(false);
  return (
    <div className="plan-panel">
      <div className="head" title={t('plan.tip')}>
        <span>{t('plan.title')}</span>
        <span className="head-actions">
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {saving ? t('plan.saving') : ''}
          </Typography.Text>
          <Button
            size="small"
            type="text"
            title={preview ? t('plan.backToEdit') : t('plan.preview')}
            aria-label={preview ? t('plan.backToEdit') : t('plan.preview')}
            icon={preview ? <EditOutlined /> : <EyeOutlined />}
            onClick={() => setPreview(v => !v)}
          />
          {onCollapse && (
            <Button
              size="small"
              type="text"
              title={t('plan.collapse')}
              aria-label={t('plan.collapse')}
              icon={<MinusOutlined />}
              onClick={onCollapse}
            />
          )}
        </span>
      </div>
      {preview && (
        <div
          className="plan-preview markdown-body"
          onDoubleClick={() => setPreview(false)}
          dangerouslySetInnerHTML={{ __html: renderPreviewHtml(content) }}
        />
      )}
      <div style={{ display: preview ? 'none' : 'contents' }}>
        <MarkdownEditor
          ref={ref}
          value={content}
          onChange={onChange}
          ranges={[]}
          onFocusPane={onFocusPane}
        />
      </div>
    </div>
  );
});

export default PlanPanel;
