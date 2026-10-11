import React, { useMemo, useState } from 'react';
import { Tree, Button, Dropdown, Modal, Input, Popconfirm, Empty, Tag, Tooltip } from 'antd';
import { PlusOutlined, MoreOutlined, BookOutlined, FileTextOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { Volume, ChapterMeta, ChapterFlagInfo } from '../api';
import { api } from '../api';

interface Props {
  bookId: string;
  volumes: Volume[];
  chapters: ChapterMeta[];
  currentChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onChanged: () => void;
}

function flagTag(flag: ChapterFlagInfo | null): React.ReactNode {
  if (!flag) return null;
  if (flag.level === 'bad') return <Tooltip title={`重复率 ${(flag.dupRatio * 100).toFixed(1)}% · ${flag.dupCount} 处`}><Tag color="red" className="chapter-flag">重</Tag></Tooltip>;
  return <Tooltip title={`重复率 ${(flag.dupRatio * 100).toFixed(1)}% · ${flag.dupCount} 处`}><Tag color="orange" className="chapter-flag">疑</Tag></Tooltip>;
}

export default function OutlinePanel({ bookId, volumes, chapters, currentChapterId, onSelectChapter, onChanged }: Props) {
  const [modal, setModal] = useState<null | { kind: 'volume' | 'chapter'; volumeId?: string; editingVolumeId?: string; editingChapterId?: string; initial?: string }>(null);
  const [text, setText] = useState('');

  const nodes: DataNode[] = useMemo(() => volumes.map(v => ({
    key: 'v:' + v.id,
    title: (
      <span className="outline-item-title">
        <BookOutlined style={{ color: '#b48a2f' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</span>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'add', label: '新建章节' },
              { key: 'rename', label: '重命名卷' },
              { key: 'delete', label: '删除卷', danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'add') { setText('新章节'); setModal({ kind: 'chapter', volumeId: v.id }); }
              if (key === 'rename') { setText(v.title); setModal({ kind: 'volume', editingVolumeId: v.id }); }
              if (key === 'delete') {
                Modal.confirm({
                  title: `删除卷《${v.title}》？`,
                  content: '卷内所有章节将一并删除，此操作不可撤销。',
                  okButtonProps: { danger: true },
                  onOk: async () => { await api.deleteVolume(bookId, v.id); onChanged(); },
                });
              }
            },
          }}
        >
          <Button size="small" type="text" icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
        </Dropdown>
      </span>
    ),
    children: chapters.filter(ch => ch.volumeId === v.id).map(ch => ({
      key: 'c:' + ch.id,
      title: (
        <span className="outline-item-title">
          <FileTextOutlined style={{ color: ch.id === currentChapterId ? '#4a6fa5' : '#9ca3af' }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: ch.id === currentChapterId ? 600 : 400 }}>{ch.title}</span>
          {flagTag(ch.flag)}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'rename', label: '重命名' },
                { key: 'delete', label: '删除章节', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'rename') { setText(ch.title); setModal({ kind: 'chapter', editingChapterId: ch.id }); }
                if (key === 'delete') {
                  Modal.confirm({
                    title: `删除章节《${ch.title}》？`,
                    content: '删除后可通过备份恢复。',
                    okButtonProps: { danger: true },
                    onOk: async () => { await api.deleteChapter(bookId, ch.id); onChanged(); },
                  });
                }
              },
            }}
          >
            <Button size="small" type="text" icon={<MoreOutlined />} onClick={e => e.stopPropagation()} />
          </Dropdown>
        </span>
      ),
    })),
  })), [volumes, chapters, currentChapterId, bookId]);

  const submit = async () => {
    if (!modal || !text.trim()) { setModal(null); return; }
    if (modal.kind === 'volume') {
      if (modal.editingVolumeId) await api.renameVolume(bookId, modal.editingVolumeId, text.trim());
      else await api.createVolume(bookId, text.trim());
    } else {
      if (modal.editingChapterId) {
        // 重命名：读回当前内容后以新标题保存（内容不变）
        try {
          const cur = await api.getChapter(bookId, modal.editingChapterId);
          await api.saveChapter(bookId, cur.id, cur.contentMd, cur.version, text.trim());
        } catch { /* 忽略：已被并发修改 */ }
      } else if (modal.volumeId) {
        const ch = await api.createChapter(bookId, modal.volumeId, text.trim());
        onChanged();
        onSelectChapter(ch.id);
      }
    }
    setModal(null);
    onChanged();
  };

  return (
    <div className="outline-panel">
      <div className="head">
        <span>大纲</span>
        <span>
          <Button size="small" type="text" icon={<PlusOutlined />} title="新建卷"
            onClick={() => { setText('新卷'); setModal({ kind: 'volume' }); }} />
        </span>
      </div>
      <div className="outline-tree">
        {nodes.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚无卷/章" />
          : (
            <Tree
              treeData={nodes}
              selectedKeys={currentChapterId ? ['c:' + currentChapterId] : []}
              defaultExpandAll
              onSelect={keys => {
                const k = String(keys[0] ?? '');
                if (k.startsWith('c:')) onSelectChapter(k.slice(2));
              }}
            />
          )}
      </div>
      <Modal
        open={!!modal}
        title={modal?.editingVolumeId || modal?.editingChapterId ? '重命名' : modal?.kind === 'volume' ? '新建卷' : '新建章节'}
        onOk={submit}
        onCancel={() => setModal(null)}
        width={380}
      >
        <Input value={text} onChange={e => setText(e.target.value)} onPressEnter={submit} autoFocus placeholder="输入名称" />
      </Modal>
    </div>
  );
}
