import React, { useMemo, useState } from 'react';
import { Tree, Button, Dropdown, Modal, Input, Popconfirm, Empty, Tag, Tooltip } from 'antd';
import { PlusOutlined, MoreOutlined, BookOutlined, FileTextOutlined, MinusOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { Volume, ChapterMeta, ChapterFlagInfo } from '../api';
import { api } from '../api';
import { useT } from '../i18n';
type TFunc = ReturnType<typeof useT>;

interface Props {
  bookId: string;
  volumes: Volume[];
  chapters: ChapterMeta[];
  currentChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onChanged: () => void;
  /** 收起整个章节板块（由父级隐藏并提供窄条恢复入口） */
  onCollapse?: () => void;
}

function flagTag(flag: ChapterFlagInfo | null, t: TFunc): React.ReactNode {
  if (!flag) return null;
  const tip = t('out.flagTip', { ratio: (flag.dupRatio * 100).toFixed(1), count: flag.dupCount });
  if (flag.level === 'bad') return <Tooltip title={tip}><Tag color="red" className="chapter-flag">{t('out.tagDup')}</Tag></Tooltip>;
  return <Tooltip title={tip}><Tag color="orange" className="chapter-flag">{t('out.tagSuspect')}</Tag></Tooltip>;
}

export default function OutlinePanel({ bookId, volumes, chapters, currentChapterId, onSelectChapter, onChanged, onCollapse }: Props) {
  const t = useT();
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
              { key: 'add', label: t('out.addChapter') },
              { key: 'rename', label: t('out.renameVolume') },
              { key: 'delete', label: t('out.deleteVolume'), danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'add') { setText(t('out.newChapter')); setModal({ kind: 'chapter', volumeId: v.id }); }
              if (key === 'rename') { setText(v.title); setModal({ kind: 'volume', editingVolumeId: v.id }); }
              if (key === 'delete') {
                Modal.confirm({
                  title: t('out.delVolumeTitle', { title: v.title }),
                  content: t('out.delVolumeContent'),
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
          {flagTag(ch.flag, t)}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'rename', label: t('out.rename') },
                { key: 'delete', label: t('out.deleteChapter'), danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'rename') { setText(ch.title); setModal({ kind: 'chapter', editingChapterId: ch.id }); }
                if (key === 'delete') {
                  Modal.confirm({
                    title: t('out.delChapterTitle', { title: ch.title }),
                    content: t('out.delChapterContent'),
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
  })), [volumes, chapters, currentChapterId, bookId, t]);

  /** 拖拽排序：章节可拖到任意卷的任意位置（卷本身不可拖） */
  const onDrop = async (info: { dragNode?: DataNode; node: DataNode; dropPosition: number }) => {
    const dragKey = String(info.dragNode?.key ?? '');
    const dropKey = String(info.node.key);
    if (!dragKey.startsWith('c:')) return; // 仅章可拖
    const chapterId = dragKey.slice(2);
    let targetVolumeId: string;
    let index: number;
    if (dropKey.startsWith('v:')) {
      // 拖到卷上 → 追加为该卷末章
      targetVolumeId = dropKey.slice(2);
      index = chapters.filter(c => c.volumeId === targetVolumeId).length;
    } else {
      const dropCh = chapters.find(c => c.id === dropKey.slice(2));
      if (!dropCh) return;
      targetVolumeId = dropCh.volumeId;
      const list = chapters.filter(c => c.volumeId === targetVolumeId);
      let idx = list.findIndex(c => c.id === dropCh.id);
      if (idx < 0) return;
      if (info.dropPosition !== -1) idx += 1; // 落在目标之后/内部
      const dragIdx = list.findIndex(c => c.id === chapterId);
      if (dragIdx >= 0 && dragIdx < idx) idx -= 1; // 同卷前移时坐标系剔除拖动章
      index = Math.max(0, idx);
    }
    try {
      await api.moveChapter(bookId, chapterId, targetVolumeId, index);
      onChanged();
    } catch { /* 忽略：并发修改冲突 */ }
  };

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
        <span>{t('out.title')}</span>
        <span>
          <Button size="small" type="text" icon={<PlusOutlined />} title={t('out.addVolume')}
            onClick={() => { setText(t('out.newVolume')); setModal({ kind: 'volume' }); }} />
          {onCollapse && (
            <Button size="small" type="text" icon={<MinusOutlined />} title={t('out.collapse')}
              aria-label={t('out.collapse')} onClick={onCollapse} />
          )}
        </span>
      </div>
      <div className="outline-tree">
        {nodes.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('out.empty')} />
          : (
            <Tree
              treeData={nodes}
              selectedKeys={currentChapterId ? ['c:' + currentChapterId] : []}
              defaultExpandAll
              draggable={{ nodeDraggable: node => String(node.key).startsWith('c:') }}
              onDrop={onDrop}
              onSelect={keys => {
                const k = String(keys[0] ?? '');
                if (k.startsWith('c:')) onSelectChapter(k.slice(2));
              }}
            />
          )}
      </div>
      <Modal
        open={!!modal}
        title={modal?.editingVolumeId || modal?.editingChapterId ? t('out.rename') : modal?.kind === 'volume' ? t('out.newVolume') : t('out.addChapter')}
        onOk={submit}
        onCancel={() => setModal(null)}
        width={380}
      >
        <Input value={text} onChange={e => setText(e.target.value)} onPressEnter={submit} autoFocus placeholder={t('out.inputName')} />
      </Modal>
    </div>
  );
}