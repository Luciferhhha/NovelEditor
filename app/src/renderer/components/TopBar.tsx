import React from 'react';
import { Button, Segmented, Space, Tag, Tooltip, Progress } from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, SearchOutlined, FileSearchOutlined,
  DownloadOutlined, DatabaseOutlined, SettingOutlined, PartitionOutlined,
} from '@ant-design/icons';
import type { CheckProgress } from '../../shared/types';
import { useThemeStore } from '../store/themeStore';

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
  return (
    <div className="top-bar">
      <Space size={12}>
        <Button size="small" icon={<ArrowLeftOutlined />} onClick={p.onBack}>书架</Button>
        <b style={{ fontSize: 15 }}>{p.bookTitle}</b>
        {p.dirty ? <Tag color="orange">未保存</Tag> : <Tag color="green">已保存</Tag>}
        {p.checking && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
            查重中…
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
            { label: <Tooltip title="仅编辑"><span><PartitionOutlined rotate={-90} /></span></Tooltip>, value: 'edit' },
            { label: '分屏', value: 'split' },
            { label: '预览', value: 'preview' },
          ]}
        />
        <Button size="small" icon={<SaveOutlined />} onClick={p.onSave} disabled={p.saving}>保存</Button>
        <Button size="small" icon={<SearchOutlined />} onClick={p.onSearch}>搜索</Button>
        <Button size="small" type="primary" icon={<FileSearchOutlined />} loading={p.checking} onClick={p.onRunCheck}>查重</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={p.onExport}>导出</Button>
        <Button size="small" icon={<DatabaseOutlined />} onClick={p.onBackup}>备份</Button>
        <Button size="small" icon={<SettingOutlined />} onClick={p.onSettings}>查重设置</Button>
        <Button size="small" onClick={p.onToggleReport} type={p.reportVisible ? 'default' : 'dashed'}>报告</Button>
        <Tooltip title={themeMode === 'dark' ? '切换为浅色模式' : '切换为深色模式'}>
          <Button size="small" onClick={toggleTheme}>{themeMode === 'dark' ? '☀️' : '🌙'}</Button>
        </Tooltip>
      </Space>
    </div>
  );
}