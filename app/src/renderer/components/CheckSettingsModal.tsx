import React, { useEffect, useState } from 'react';
import { Modal, Form, InputNumber, Button, Typography, Space } from 'antd';
import type { CheckParams } from '../../shared/types';
import { DEFAULT_CHECK_PARAMS } from '../../shared/types';
import { useT } from '../i18n';

interface Props {
  open: boolean;
  params: CheckParams | null;
  onClose: () => void;
  onSave: (params: CheckParams) => Promise<void>;
}

export default function CheckSettingsModal({ open, params, onClose, onSave }: Props) {
  const t = useT();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) form.setFieldsValue(params ?? DEFAULT_CHECK_PARAMS);
  }, [open, params]);

  const submit = async () => {
    const v = await form.validateFields();
    setBusy(true);
    try { await onSave(v as CheckParams); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={t('set.title')}
      onCancel={onClose}
      width={440}
      footer={[
        <Button key="cancel" onClick={onClose}>{t('common.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={submit}>{t('common.save')}</Button>,
      ]}
    >
      <Form form={form} layout="vertical" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('set.hint')}
          </Typography.Text>
          <Form.Item name="n" label={t('set.n')} rules={[{ required: true }]}>
            <InputNumber min={5} max={24} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="w" label={t('set.w')} rules={[{ required: true }]}>
            <InputNumber min={2} max={16} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minFragLen" label={t('set.minFragLen')} rules={[{ required: true }]}>
            <InputNumber min={10} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="nearThreshold" label={t('set.nearThreshold')} rules={[{ required: true }]}>
            <InputNumber min={0.5} max={1} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="flagBadRatio" label={t('set.flagBadRatio')} rules={[{ required: true }]}>
            <InputNumber min={0.01} max={0.5} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="flagWarnRatio" label={t('set.flagWarnRatio')} rules={[{ required: true }]}>
            <InputNumber min={0.001} max={0.2} step={0.005} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}