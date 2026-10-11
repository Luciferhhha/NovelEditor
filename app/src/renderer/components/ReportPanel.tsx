import React, { useMemo } from 'react';
import { Button, Empty, Spin, Tag, Popconfirm, Typography, Progress, Alert, Switch } from 'antd';
import { CloseOutlined, AimOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import type { CheckHit, ChapterMeta } from '../api';

interface Props {
  running: boolean;
  hits: CheckHit[];
  chapters: ChapterMeta[];
  currentChapterId: string | null;
  error: string | null;
  showIgnored: boolean;
  onShowIgnored: (v: boolean) => void;
  onClose: () => void;
  onJump: (hit: CheckHit, side: 'a' | 'b') => void;
  onToggleIgnore: (hit: CheckHit) => void;
}

export default function ReportPanel({
  running, hits, chapters, currentChapterId, error, showIgnored, onShowIgnored, onClose, onJump, onToggleIgnore,
}: Props) {
  const titleOf = useMemo(() => {
    const m = new Map(chapters.map(ch => [ch.id, ch]));
    return (id: string) => m.get(id)?.title ?? '(已删除章节)';
  }, [chapters]);

  const visible = hits.filter(h => showIgnored || !h.ignored);
  const active = visible.filter(h => !h.ignored);
  const badCount = active.filter(h => h.kind === 'exact' || h.similarity >= 1).length;

  return (
    <div className="report-panel">
      <div className="head">
        <span>查重报告</span>
        <Spaceless>
          <Switch size="small" checked={showIgnored} onChange={onShowIgnored} checkedChildren="忽略项" unCheckedChildren="忽略项" />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Spaceless>
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', alignItems: 'center' }}>
          <span>命中 <b style={{ color: '#111' }}>{active.length}</b></span>
          <span>完全重复 <b style={{ color: '#dc2626' }}>{badCount}</b></span>
          <span>忽略 <b>{hits.filter(h => h.ignored).length}</b></span>
        </div>
        {active.length > 0 && (
          <Progress
            percent={Math.min(100, Math.round((badCount / Math.max(1, active.length)) * 100))}
            size="small"
            strokeColor="#f59e0b"
            format={() => ''}
            style={{ marginTop: 4 }}
          />
        )}
      </div>
      <div className="report-list">
        {error && <Alert type="error" showIcon message="查重失败" description={error} style={{ marginBottom: 10 }} />}
        {running && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
        {!running && visible.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hits.length === 0 ? '暂无查重结果，点击「查重」开始' : '结果已全部忽略'} />
        )}
        {visible.map(h => {
          const isA = h.chapterA === currentChapterId;
          const side: 'a' | 'b' = isA ? 'a' : 'b';
          const selfId = isA ? h.chapterA : h.chapterB;
          const otherId = isA ? h.chapterB : h.chapterA;
          const selfStart = isA ? h.startA : h.startB;
          const selfEnd = isA ? h.endA : h.endB;
          const otherStart = isA ? h.startB : h.startA;
          const otherEnd = isA ? h.endB : h.endA;
          const pct = Math.round(h.similarity * 100);
          return (
            <div key={h.id} className={'hit-item' + (h.ignored ? ' ignored' : '')}>
              <div className="row">
                <Spaceless>
                  {h.kind === 'exact' || h.similarity >= 1
                    ? <Tag color="red">完全重复 {selfEnd - selfStart}字</Tag>
                    : <Tag color="orange">近似 {pct}%</Tag>}
                </Spaceless>
                <Popconfirm
                  title={h.ignored ? '恢复此命中？' : '忽略此命中？'}
                  onConfirm={() => onToggleIgnore(h)}
                >
                  <Button size="small" type="text" icon={h.ignored ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
                </Popconfirm>
              </div>
              <Typography.Text
                style={{ fontSize: 12, display: 'block', marginTop: 4, cursor: 'pointer' }}
                onClick={() => onJump(h, side)}
              >
                📍 {titleOf(selfId)} · {selfStart}–{selfEnd}
                <AimOutlined style={{ marginLeft: 4 }} />
              </Typography.Text>
              <Typography.Text
                style={{ fontSize: 12, display: 'block', color: '#6b7280', cursor: 'pointer', marginTop: 2 }}
                onClick={() => onJump(h, side === 'a' ? 'b' : 'a')}
              >
                ↔ {titleOf(otherId)} · {otherStart}–{otherEnd}
              </Typography.Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spaceless({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{children}</span>;
}
