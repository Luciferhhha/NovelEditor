import React, { useMemo } from 'react';
import { Button, Empty, Spin, Tag, Popconfirm, Typography, Progress, Alert, Switch } from 'antd';
import { CloseOutlined, AimOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import type { CheckHit, ChapterMeta } from '../api';
import { countWords } from '../../shared/wordCount';
import { useT } from '../i18n';

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
  const t = useT();
  const titleOf = useMemo(() => {
    const m = new Map(chapters.map(ch => [ch.id, ch]));
    return (id: string) => m.get(id)?.title ?? t('rep.deletedChapter');
  }, [chapters, t]);

  const visible = hits.filter(h => showIgnored || !h.ignored);
  const active = visible.filter(h => !h.ignored);
  const badCount = active.filter(h => h.kind === 'exact' || h.similarity >= 1).length;

  return (
    <div className="report-panel">
      <div className="head">
        <span>{t('rep.title')}</span>
        <Spaceless>
          <Switch size="small" checked={showIgnored} onChange={onShowIgnored} checkedChildren={t('rep.ignoredSwitch')} unCheckedChildren={t('rep.ignoredSwitch')} />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Spaceless>
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', alignItems: 'center' }}>
          <span>{t('rep.hits')} <b style={{ color: '#111' }}>{active.length}</b></span>
          <span>{t('rep.bad')} <b style={{ color: '#dc2626' }}>{badCount}</b></span>
          <span>{t('rep.ignored')} <b>{hits.filter(h => h.ignored).length}</b></span>
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
        {error && <Alert type="error" showIcon message={t('rep.fail')} description={error} style={{ marginBottom: 10 }} />}
        {running && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
        {!running && visible.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hits.length === 0 ? t('rep.empty') : t('rep.allIgnored')} />
        )}
        {visible.map(h => {
          const isA = h.chapterA === currentChapterId;
          const side: 'a' | 'b' = isA ? 'a' : 'b';
          const titleA = titleOf(h.chapterA);
          const titleB = titleOf(h.chapterB);
          const isBad = h.kind === 'exact' || h.similarity >= 1;
          const pct = Math.round(h.similarity * 100);
          const excerptA = (h.textA || '').trim();
          const excerptB = (h.textB || '').trim();
          // 字数口径与状态栏一致：countWords（CJK 逐字 + 拉丁按词，不含空白/标点）
          const chars = h.textA ? Math.max(1, countWords(h.textA)) : h.endA - h.startA;
          return (
            <div key={h.id} className={'hit-item' + (h.ignored ? ' ignored' : '')}>
              <div className="row">
                <span className="pair-title">
                  {titleA} <span className="vs">{t('rep.and')}</span> {titleB} {t('rep.pair')}
                </span>
                <Popconfirm
                  title={h.ignored ? t('rep.restoreHit') : t('rep.ignoreHit')}
                  onConfirm={() => onToggleIgnore(h)}
                >
                  <Button size="small" type="text" icon={h.ignored ? <EyeOutlined /> : <EyeInvisibleOutlined />} />
                </Popconfirm>
              </div>
              <div style={{ marginTop: 4 }}>
                <Spaceless>
                  {isBad
                    ? <Tag color="red">{t('rep.badChars', { n: chars })}</Tag>
                    : <Tag color="orange">{t('rep.nearPct', { pct })}</Tag>}
                  {h.ignored && <Tag>{t('rep.ignoredTag')}</Tag>}
                </Spaceless>
              </div>
              <div className="repeat-label">{isBad ? t('rep.repeatIs') : t('rep.nearCompare')}</div>
              {isBad ? (
                <div
                  className="repeat-excerpt bad"
                  title={t('rep.jumpHere')}
                  onClick={() => onJump(h, side)}
                >
                  {excerptA || excerptB || `${t('rep.origRange', { a: isA ? h.startA : h.startB, b: isA ? h.endA : h.endB })}`}
                </div>
              ) : (
                <>
                  <div className="repeat-excerpt side-a" title={t('rep.jumpHere')} onClick={() => onJump(h, 'a')}>
                    <b className="side-tag">{titleA}</b>{excerptA || t('rep.noText')}
                  </div>
                  <div className="repeat-excerpt side-b" title={t('rep.jumpOther')} onClick={() => onJump(h, 'b')}>
                    <b className="side-tag">{titleB}</b>{excerptB || t('rep.noText')}
                  </div>
                </>
              )}
              <div className="hit-actions">
                <Button size="small" className="loc" onClick={() => onJump(h, 'a')}>
                  📍 {titleA} · {h.startA}–{h.endA}
                </Button>
                <Button size="small" className="loc" onClick={() => onJump(h, 'b')}>
                  ↔ {titleB} · {h.startB}–{h.endB}
                </Button>
              </div>
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