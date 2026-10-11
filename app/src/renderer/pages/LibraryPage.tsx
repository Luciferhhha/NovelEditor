import React, { useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Empty, Input, Modal, Spin, Tag, message } from 'antd';
import { PlusOutlined, MoreOutlined, BookOutlined, FileTextOutlined, FieldTimeOutlined } from '@ant-design/icons';
import { useBookStore } from '../store/bookStore';
import { api, type LibraryEntry } from '../api';

interface Props {
  onOpen: (id: string) => void;
}

interface Stats { chapterCount: number; volumeCount: number; wordTotal: number; }

export default function LibraryPage({ onOpen }: Props) {
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
    if (!title.trim()) { message.warning('请输入书名'); return; }
    setBusy(true);
    try {
      await createBook(title.trim(), author.trim() || '佚名', desc.trim());
      setCreateOpen(false);
      setTitle(''); setAuthor(''); setDesc('');
      message.success('已创建');
    } finally { setBusy(false); }
  };

  const handleDelete = (entry: LibraryEntry) => {
    Modal.confirm({
      title: `删除《${entry.title}》？`,
      content: '书籍的全部章节与备份将从磁盘删除，此操作不可撤销。',
      okButtonProps: { danger: true },
      onOk: async () => { await deleteBook(entry.id); message.success('已删除'); },
    });
  };

  const sorted = useMemo(() => [...library].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt), [library]);

  return (
    <div className="library-page">
      <div className="library-header">
        <h1>📚 NovelEditor <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 400 }}>本地小说写作工作台</span></h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建书籍</Button>
      </div>

      {loading && <Spin />}
      {!loading && sorted.length === 0 && (
        <Empty description="还没有书，点击「新建书籍」开始写作">
          <Button type="primary" onClick={() => setCreateOpen(true)}>新建书籍</Button>
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
                      { key: 'open', label: '打开' },
                      { key: 'delete', label: '删除', danger: true },
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
                <span><FileTextOutlined /> {st ? st.chapterCount : '—'} 章</span>
                <span>{st ? (st.wordTotal / 10000).toFixed(1) + ' 万字' : '—'}</span>
                <span><FieldTimeOutlined /> {new Date(entry.updatedAt).toLocaleDateString('zh-CN')}</span>
              </div>
              {entry.lastOpenedAt > 0 && <Tag style={{ position: 'absolute', right: 12, bottom: 12 }} color="blue">
                {Math.max(1, Math.round((Date.now() - entry.lastOpenedAt) / 86400000))} 天前打开
              </Tag>}
            </div>
          );
        })}
      </div>

      <Modal
        open={createOpen}
        title="新建书籍"
        onOk={submitCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={busy}
        width={440}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder="书名（必填）" value={title} onChange={e => setTitle(e.target.value)} onPressEnter={submitCreate} autoFocus />
          <Input placeholder="作者（默认：佚名）" value={author} onChange={e => setAuthor(e.target.value)} />
          <Input.TextArea placeholder="简介（可选）" rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
