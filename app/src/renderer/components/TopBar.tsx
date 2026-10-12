import React from 'react';
import { Button, Segmented, Space, Tag, Tooltip, Progress } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, SearchOutlined, FileSearchOutlined,
  DownloadOutlined, DatabaseOutlined, SettingOutlined, PartitionOutlined,
} from '@ant-design/icons';
import type { CheckProgress } from '../../shared/types';
import { useT } from '../i18n';

export type SplitMode = 'split' | 'edit' | 'preview';

interface Props {
  bookTitle: string;
  dirty: boolean;
  saving: boolean;
  splitMode: SplitMode;
  onSplitMode: (m: SplitMode) => void;
  onSave: () => void;
  onSearch: () => void;
  onRunCheck: () => void;
  onToggleReport: () => void;
  onExport: () => void;
  onBackup: () => void;
  onSettings: () => void;
  onBack: () => void;
  checking: boolean;
  progress: CheckProgress | null;
  reportVisible: boolean;
}

/** 顶栏：分屏模式 + 文档操作。背景/语言/主题与查重参数已统一收纳进「设置」弹窗。 */
export default function TopBar(p: Props) {
  const t = useT();
  return (
    <div className="top-bar">
      <Space size={12}>
        <Button size="small" icon={<ArrowLeftOutlined />} onClick={p.onBack}>{t('top.back')}</Button>
        <b style={{ fontSize: 15 }}>{p.bookTitle}</b>
        {p.dirty ? <Tag color="orange">{t('top.unsaved')}</Tag> : <Tag color="green">{t('top.saved')}</Tag>}
        {p.checking && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
            {t('top.checking')}
            {p.progress && p.progress.total > 0 && (
              <Progress size="small" percent={Math.round((p.progress.done / p.progress.total) * 100)} style={{ width: 90, margin: 0 }} />
            )}
          </span>
        )}
      </Space>
      <Space size={6} wrap>
        <Segmented
          size="small"
          value={p.splitMode}
          onChange={v => p.onSplitMode(v as SplitMode)}
          options={[
            { label: <Tooltip title={t('top.editOnly')}><span><PartitionOutlined rotate={-90} /></span></Tooltip>, value: 'edit' },
            { label: t('top.split'), value: 'split' },
            { label: t('top.preview'), value: 'preview' },
          ]}
        />
        <Button size="small" icon={<SaveOutlined />} onClick={p.onSave} disabled={p.saving}>{t('top.save')}</Button>
        <Button size="small" icon={<SearchOutlined />} onClick={p.onSearch}>{t('top.search')}</Button>
        <Button size="small" type="primary" icon={<FileSearchOutlined />} loading={p.checking} onClick={p.onRunCheck}>{t('top.check')}</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={p.onExport}>{t('top.export')}</Button>
        <Button size="small" icon={<DatabaseOutlined />} onClick={p.onBackup}>{t('top.backup')}</Button>
        <Tooltip title={t('top.settings')}>
          <Button size="small" icon={<SettingOutlined />} onClick={p.onSettings}>{t('top.settings')}</Button>
        </Tooltip>
        <Button size="small" onClick={p.onToggleReport} type={p.reportVisible ? 'default' : 'dashed'}>{t('top.report')}</Button>
      </Space>
    </div>
  );
}
