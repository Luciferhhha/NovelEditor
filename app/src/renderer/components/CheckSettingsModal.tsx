import React, { useEffect, useState } from 'react';
import { Modal, Form, InputNumber, Button, Typography, Space } from 'antd';
import type { CheckParams } from '../../shared/types';
import { DEFAULT_CHECK_PARAMS } from '../../shared/types';

interface Props {
  open: boolean;
  params: CheckParams | null;
  onClose: () => void;
  onSave: (params: CheckParams) => Promise<void>;
}

export default function CheckSettingsModal({ open, params, onClose, onSave }: Props) {
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
      title="查重参数设置"
      onCancel={onClose}
      width={440}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={submit}>保存</Button>,
      ]}
    >
      <Form form={form} layout="vertical" size="small">
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            默认参数适用于中文长篇小说；修改后对下一次查重生效。
          </Typography.Text>
          <Form.Item name="n" label="n-gram 长度（字符）" rules={[{ required: true }]}>
            <InputNumber min={5} max={24} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="w" label="winnowing 窗口" rules={[{ required: true }]}>
            <InputNumber min={2} max={16} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minFragLen" label="最小重复片段（字）" rules={[{ required: true }]}>
            <InputNumber min={10} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="nearThreshold" label="近似重复相似度阈值" rules={[{ required: true }]}>
            <InputNumber min={0.5} max={1} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="flagBadRatio" label="标记为「重」的重复占比" rules={[{ required: true }]}>
            <InputNumber min={0.01} max={0.5} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="flagWarnRatio" label="标记为「疑」的重复占比" rules={[{ required: true }]}>
            <InputNumber min={0.001} max={0.2} step={0.005} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}
