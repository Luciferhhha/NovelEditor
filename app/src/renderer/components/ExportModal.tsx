import React, { useState } from 'react';
import { Modal, Radio, Select, Button, Typography, Space, Alert } from 'antd';
import type { ExportFormat, ExportScope } from '../../shared/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (scope: ExportScope, targetId: string | undefined, format: ExportFormat) => Promise<void>;
  volumes: { id: string; title: string }[];
  chapters: { id: string; title: string; volumeId: string }[];
}

export default function ExportModal({ open, onClose, onRun, volumes, chapters }: Props) {
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [scope, setScope] = useState<ExportScope>('book');
  const [targetId, setTargetId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      await onRun(scope, scope === 'book' ? undefined : targetId, format);
      setResult('导出完成');
    } catch (e) {
      setResult('导出失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const targetOptions = scope === 'volume'
    ? volumes.map(v => ({ value: v.id, label: v.title }))
    : chapters.map(ch => ({ value: ch.id, label: ch.title }));

  return (
    <Modal
      open={open}
      title="导出"
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={submit}
          disabled={scope !== 'book' && !targetId}>导出…</Button>,
      ]}
      width={460}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Typography.Text strong>范围</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <Radio.Group
              value={scope}
              onChange={e => { setScope(e.target.value); setTargetId(undefined); }}
              options={[
                { label: '全书', value: 'book' },
                { label: '整卷', value: 'volume' },
                { label: '单章', value: 'chapter' },
              ]}
              optionType="button"
              block
            />
          </div>
        </div>
        {scope !== 'book' && (
          <div>
            <Typography.Text strong>{scope === 'volume' ? '选择卷' : '选择章节'}</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              placeholder={scope === 'volume' ? '选择卷' : '选择章节'}
              value={targetId}
              onChange={setTargetId}
              options={targetOptions}
              showSearch
            />
          </div>
        )}
        <div>
          <Typography.Text strong>格式</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <Radio.Group
              value={format}
              onChange={e => setFormat(e.target.value)}
              options={[
                { label: 'TXT 纯文本', value: 'txt' },
                { label: 'Markdown', value: 'md' },
                { label: 'Word (DOCX)', value: 'docx' },
              ]}
              optionType="button"
              block
            />
          </div>
        </div>
        {result && <Alert type={result.startsWith('导出完成') ? 'success' : 'warning'} message={result} showIcon />}
      </Space>
    </Modal>
  );
}
