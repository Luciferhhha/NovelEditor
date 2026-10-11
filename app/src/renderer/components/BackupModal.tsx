import React, { useEffect, useState } from 'react';
import { Modal, Button, List, Popconfirm, Empty, Tag, Typography, Space, message } from 'antd';
import { InboxOutlined, UndoOutlined } from '@ant-design/icons';
import type { BackupInfo } from '../api';
import { api } from '../api';

interface Props {
  open: boolean;
  bookId: string;
  onClose: () => void;
  onChanged: () => void;
}

function fmtSize(n: number): string {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

export default function BackupModal({ open, bookId, onClose, onChanged }: Props) {
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setList(await api.listBackups(bookId));
  useEffect(() => { if (open) void refresh(); }, [open, bookId]);

  const create = async () => {
    setBusy(true);
    try {
      setList(await api.createBackup(bookId));
      message.success('备份已创建（保留最近 5 份）');
    } finally { setBusy(false); }
  };

  const restore = async (name: string) => {
    await api.restoreBackup(bookId, name);
    message.success('已恢复，正在重新加载…');
    onChanged();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="备份与恢复"
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
      width={560}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Button type="primary" icon={<InboxOutlined />} loading={busy} onClick={create}>立即备份</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          备份使用 SQLite VACUUM INTO 生成一致性快照，保存在该书目录的 backup/ 下，自动保留最近 5 份。
        </Typography.Text>
        {list.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无备份" />
          : (
            <List
              size="small"
              dataSource={list}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="restore"
                      title="恢复此备份？"
                      description="当前书内容将被覆盖（建议先手动备份）。"
                      onConfirm={() => restore(item.name)}
                    >
                      <Button size="small" icon={<UndoOutlined />}>恢复</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={<span style={{ fontSize: 13 }}>{item.name} <Tag>{fmtSize(item.size)}</Tag></span>}
                    description={<span style={{ fontSize: 12 }}>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>}
                  />
                </List.Item>
              )}
            />
          )}
      </Space>
    </Modal>
  );
}
