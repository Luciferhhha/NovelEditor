import React, { useState } from 'react';
import { Modal, Input, List, Tag, Empty, Spin, Typography } from 'antd';
import type { SearchHit } from '../api';
import { api } from '../api';

interface Props {
  open: boolean;
  bookId: string;
  onClose: () => void;
  onJump: (chapterId: string, textStart: number) => void;
}

export default function SearchModal({ open, bookId, onClose, onJump }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) { setHits(null); return; }
    setLoading(true);
    try { setHits(await api.search(bookId, query.trim())); }
    finally { setLoading(false); }
  };

  return (
    <Modal
      open={open}
      title="全文搜索"
      onCancel={() => { setHits(null); setQuery(''); onClose(); }}
      footer={null}
      width={640}
    >
      <Input.Search
        placeholder="输入关键词"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onSearch={doSearch}
        enterButton="搜索"
        loading={loading}
        autoFocus
      />
      <div style={{ marginTop: 14, maxHeight: 420, overflow: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>}
        {!loading && hits && hits.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配结果" />}
        {!loading && hits && hits.length > 0 && (
          <List
            size="small"
            dataSource={hits}
            renderItem={item => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => { onJump(item.chapterId, item.start); onClose(); }}
              >
                <List.Item.Meta
                  title={<Typography.Text style={{ fontSize: 13 }}>{item.title} <Tag style={{ marginLeft: 6 }}>{item.start}</Tag></Typography.Text>}
                  description={<Typography.Text style={{ fontSize: 12, color: '#6b7280' }} ellipsis>{item.excerpt}</Typography.Text>}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  );
}
