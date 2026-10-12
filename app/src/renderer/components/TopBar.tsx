import React from 'react';
import { Button, Segmented, Space, Tag, Tooltip, Progress } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, SearchOutlined, FileSearchOutlined,
  DownloadOutlined, DatabaseOutlined, SettingOutlined, PartitionOutlined,
} from '@ant-design/icons';
import type { CheckProgress } from '../../shared/types';
import { useThemeStore } from '../store/themeStore';
import { useT, useLocale } from '../i18n';

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

export default function TopBar(p: Props) {
  const themeMode = useThemeStore(s => s.theme);
  const toggleTheme = useThemeStore(s => s.toggle);
  const t = useT();
  const locale = useLocale(s => s.locale);
  const setLocale = useLocale(s => s.setLocale);
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
        <Button size="small" icon={<SettingOutlined />} onClick={p.onSettings}>{t('top.settings')}</Button>
        <Button size="small" onClick={p.onToggleReport} type={p.reportVisible ? 'default' : 'dashed'}>{t('top.report')}</Button>
        <Tooltip title={locale === 'zh' ? t('top.lang') : t('top.langBack')}>
          <Button size="small" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>{t('lib.lang')}</Button>
        </Tooltip>
        <Tooltip title={themeMode === 'dark' ? t('top.themeLight') : t('top.themeDark')}>
          <Button size="small" onClick={toggleTheme}>{themeMode === 'dark' ? '☀️' : '🌙'}</Button>
        </Tooltip>
      </Space>
    </div>
  );
}