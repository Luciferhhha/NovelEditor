import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Empty, Input, Modal, Spin, Tag, Tooltip, message } from 'antd';
import { PlusOutlined, MoreOutlined, BookOutlined, FileTextOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { useBookStore } from '../store/bookStore';
import { api, type LibraryEntry } from '../api';
import { useThemeStore } from '../store/themeStore';
import { useT, useLocale } from '../i18n';

interface Props {
  onOpen: (id: string) => void;
}

interface Stats { chapterCount: number; volumeCount: number; wordTotal: number; }

export default function LibraryPage({ onOpen }: Props) {
  const t = useT();
  const locale = useLocale(s => s.locale);
  const setLocale = useLocale(s => s.setLocale);
  const { library, loadLibrary, createBook, deleteBook } = useBookStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadLibrary();
      setLoading(false);
    })();
  }, []);

  // 拉取各书统计（书少，直接并发）
  useEffect(() => {
    void (async () => {
      const entries = await Promise.all(
        library.map(async e => {
          try { return [e.id, await api.bookStats(e.id)] as const; }
          catch { return null; }
        }),
      );
      const map: Record<string, Stats> = {};
      for (const item of entries) if (item) map[item[0]] = item[1];
      setStatsMap(map);
    })();
  }, [library.length]);

  const submitCreate = async () => {
    if (!title.trim()) { message.warning(t('lib.errNoTitle')); return; }
    setBusy(true);
    try {
      await createBook(title.trim(), author.trim() || t('lib.anon'), desc.trim());
      setCreateOpen(false);
      setTitle(''); setAuthor(''); setDesc('');
      message.success(t('lib.created'));
    } finally { setBusy(false); }
  };

  const handleDelete = (entry: LibraryEntry) => {
    Modal.confirm({
      title: t('lib.deleteTitle', { title: entry.title }),
      content: t('lib.deleteContent'),
      okButtonProps: { danger: true },
      onOk: async () => { await deleteBook(entry.id); message.success(t('lib.deleted')); },
    });
  };

  const themeMode = useThemeStore(st => st.theme);
  const toggleTheme = useThemeStore(st => st.toggle);
  const sorted = useMemo(() => [...library].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt), [library]);

  return (
    <div className="library-page">
      <div className="library-header">
        <h1>📚 NovelEditor <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 400 }}>{t('lib.tagline')}</span></h1>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Tooltip title={locale === 'zh' ? t('top.lang') : t('top.langBack')}><Button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>{t('lib.lang')}</Button></Tooltip>
          <Button onClick={toggleTheme}>{themeMode === 'dark' ? t('lib.themeLight') : t('lib.themeDark')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('lib.newBook')}</Button>
        </span>
      </div>

      {loading && <Spin />}
      {!loading && sorted.length === 0 && (
        <Empty description={t('lib.empty')}>
          <Button type="primary" onClick={() => setCreateOpen(true)}>{t('lib.newBook')}</Button>
        </Empty>
      )}

      <div className="book-grid">
        {sorted.map(entry => {
          const st = statsMap[entry.id];
          return (
            <div key={entry.id} className="book-card" onClick={() => onOpen(entry.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <h3><BookOutlined style={{ color: '#b48a2f', marginRight: 6 }} />{entry.title}</h3>
                  <div className="author">{entry.author}</div>
                </div>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'open', label: t('common.open') },
                      { key: 'delete', label: t('common.delete'), danger: true },
                    ],
                    onClick: ({ key, domEvent }) => {
                      domEvent.stopPropagation();
                      if (key === 'open') onOpen(entry.id);
                      else handleDelete(entry);
                    },
                  }}
                >
                  <Button size="small" type="text" icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
                </Dropdown>
              </div>
              {entry.description && <div className="desc">{entry.description}</div>}
              <div className="meta">
                <span><FileTextOutlined /> {st ? t('lib.unitChapters', { n: st.chapterCount }) : '—'}</span>
                <span>{st ? (locale === 'zh'
                      ? t('lib.unitWan', { n: (st.wordTotal / 10000).toFixed(1) })
                      : t('lib.unitK', { n: (st.wordTotal / 1000).toFixed(1) })) : '—'}</span>
                <span><FieldTimeOutlined /> {new Date(entry.updatedAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
              </div>
              {entry.lastOpenedAt > 0 && <Tag style={{ position: 'absolute', right: 12, bottom: 12 }} color="blue">
                {t('lib.daysAgo', { n: Math.max(1, Math.round((Date.now() - entry.lastOpenedAt) / 86400000)) })}
              </Tag>}
            </div>
          );
        })}
      </div>

      <Modal
        open={createOpen}
        title={t('lib.newBook')}
        onOk={submitCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={busy}
        width={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder={t('lib.titlePh')} value={title} onChange={e => setTitle(e.target.value)} onPressEnter={submitCreate} autoFocus />
          <Input placeholder={t('lib.authorPh')} value={author} onChange={e => setAuthor(e.target.value)} />
          <Input.TextArea placeholder={t('lib.descPh')} rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}