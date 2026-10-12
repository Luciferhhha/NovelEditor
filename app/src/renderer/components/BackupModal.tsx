import React, { useEffect, useState } from 'react';
import { Modal, Button, List, Popconfirm, Empty, Tag, Typography, Space, message } from 'antd';
import { InboxOutlined, UndoOutlined } from '@ant-design/icons';
import type { BackupInfo } from '../api';
import { api } from '../api';
import { useT, useLocale } from '../i18n';

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
  const t = useT();
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const locale = useLocale(s => s.locale);

  const refresh = async () => setList(await api.listBackups(bookId));
  useEffect(() => { if (open) void refresh(); }, [open, bookId]);

  const create = async () => {
    setBusy(true);
    try {
      setList(await api.createBackup(bookId));
      message.success(t('bak.created'));
    } finally { setBusy(false); }
  };

  const restore = async (name: string) => {
    await api.restoreBackup(bookId, name);
    message.success(t('bak.restored'));
    onChanged();
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('bak.title')}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
      width={560}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Button type="primary" icon={<InboxOutlined />} loading={busy} onClick={create}>{t('bak.now')}</Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('bak.hint')}
        </Typography.Text>
        {list.length === 0
          ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('bak.none')} />
          : (
            <List
              size="small"
              dataSource={list}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="restore"
                      title={t('bak.restoreConfirm')}
                      description={t('bak.restoreDesc')}
                      onConfirm={() => restore(item.name)}
                    >
                      <Button size="small" icon={<UndoOutlined />}>{t('bak.restore')}</Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={<span style={{ fontSize: 13 }}>{item.name} <Tag>{fmtSize(item.size)}</Tag></span>}
                    description={<span style={{ fontSize: 12 }}>{new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>}
                  />
                </List.Item>
              )}
            />
          )}
      </Space>
    </Modal>
  );
}