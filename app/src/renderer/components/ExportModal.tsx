import React, { useState } from 'react';
import { Modal, Radio, Select, Button, Typography, Space, Alert } from 'antd';
import type { ExportFormat, ExportScope } from '../../shared/types';
import { useT } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (scope: ExportScope, targetId: string | undefined, format: ExportFormat) => Promise<void>;
  volumes: { id: string; title: string }[];
  chapters: { id: string; title: string; volumeId: string }[];
}

export default function ExportModal({ open, onClose, onRun, volumes, chapters }: Props) {
  const t = useT();
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [scope, setScope] = useState<ExportScope>('book');
  const [targetId, setTargetId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      await onRun(scope, scope === 'book' ? undefined : targetId, format);
      setResult({ ok: true, msg: t('exp.done') });
    } catch (e) {
      setResult({ ok: false, msg: t('exp.fail') + (e instanceof Error ? e.message : String(e)) });
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
      title={t('exp.title')}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>{t('common.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={submit}
          disabled={scope !== 'book' && !targetId}>{t('exp.run')}</Button>,
      ]}
      width={460}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Typography.Text strong>{t('exp.scope')}</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <Radio.Group
              value={scope}
              onChange={e => { setScope(e.target.value); setTargetId(undefined); }}
              options={[
                { label: t('exp.book'), value: 'book' },
                { label: t('exp.volume'), value: 'volume' },
                { label: t('exp.chapter'), value: 'chapter' },
              ]}
              optionType="button"
              block
            />
          </div>
        </div>
        {scope !== 'book' && (
          <div>
            <Typography.Text strong>{scope === 'volume' ? t('exp.pickVolume') : t('exp.pickChapter')}</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 6 }}
              placeholder={scope === 'volume' ? t('exp.pickVolume') : t('exp.pickChapter')}
              value={targetId}
              onChange={setTargetId}
              options={targetOptions}
              showSearch
            />
          </div>
        )}
        <div>
          <Typography.Text strong>{t('exp.format')}</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <Radio.Group
              value={format}
              onChange={e => setFormat(e.target.value)}
              options={[
                { label: t('exp.fTxt'), value: 'txt' },
                { label: t('exp.fMd'), value: 'md' },
                { label: t('exp.fDocx'), value: 'docx' },
              ]}
              optionType="button"
              block
            />
          </div>
        </div>
        {result && <Alert type={result.ok ? 'success' : 'warning'} message={result.msg} showIcon />}
      </Space>
    </Modal>
  );
}