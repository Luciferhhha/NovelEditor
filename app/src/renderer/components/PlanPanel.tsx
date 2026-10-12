import React, { forwardRef } from 'react';
import { Typography } from 'antd';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import { useT } from '../i18n';

interface Props {
  content: string;
  onChange: (value: string) => void;
  onFocusPane: () => void;
  saving: boolean;
}

/**
 * 大纲计划书板块：独立于章节内容的全书大纲/创作计划（Markdown），
 * 与正文编辑器同款 CodeMirror 编辑能力（顶部工具栏统一作用于当前聚焦版块）。
 */
const PlanPanel = forwardRef<MarkdownEditorHandle, Props>(function PlanPanel(
  { content, onChange, onFocusPane, saving }, ref,
) {
  const t = useT();
  return (
    <div className="plan-panel">
      <div className="head" title={t('plan.tip')}>
        <span>{t('plan.title')}</span>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {saving ? t('plan.saving') : ''}
        </Typography.Text>
      </div>
      <MarkdownEditor
        ref={ref}
        value={content}
        onChange={onChange}
        ranges={[]}
        onFocusPane={onFocusPane}
      />
    </div>
  );
});

export default PlanPanel;
