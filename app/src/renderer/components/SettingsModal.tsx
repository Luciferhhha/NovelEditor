import React, { useEffect, useState } from 'react';
import { App, AutoComplete, Button, Form, Input, InputNumber, Modal, Segmented, Space, Tabs, Typography } from 'antd';
import { PictureOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { AppSettings, CheckParams, Persona } from '../../shared/types';
import { DEFAULT_CHECK_PARAMS } from '../../shared/types';
import { api } from '../api';
import { useT, useLocale } from '../i18n';
import { useThemeStore } from '../store/themeStore';
import { useBgStore, READER_COLORS } from '../store/bgStore';

interface Props {
  open: boolean;
  onClose: () => void;
  params: CheckParams | null;
  onSaveParams: (params: CheckParams) => Promise<void>;
  initialTab?: 'ai' | 'appearance' | 'check';
}

function newPersona(name: string): Persona {
  return { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, prompt: '' };
}

/** 设置收纳：AI 助手（API/模型/形象提示词）、外观（语言/主题/背景）、查重参数 */
export default function SettingsModal({ open, onClose, params, onSaveParams, initialTab }: Props) {
  const t = useT();
  const locale = useLocale(s => s.locale);
  const setLocale = useLocale(s => s.setLocale);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const bg = useBgStore(s => s.bg);
  const setBg = useBgStore(s => s.setBg);
  const { message } = App.useApp();

  const [tab, setTab] = useState<string>('ai');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [checkForm] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [modelOptions, setModelOptions] = useState<{ value: string }[]>([]);
  const [fetching, setFetching] = useState(false);

  /** 傻瓜式一键拉取：用当前填写的 API 地址 + 密钥请求 /models，成功后可直接下拉选择 */
  const fetchModels = async () => {
    if (!settings) return;
    const baseUrl = settings.aiBaseUrl.trim();
    const apiKey = settings.aiApiKey.trim();
    if (!baseUrl || !apiKey) { message.warning(t('set.needApi')); return; }
    setFetching(true);
    try {
      const r = await api.listModels(baseUrl, apiKey);
      setModelOptions(r.models.map(m => ({ value: m })));
      if (r.models.length === 0) message.info(t('set.fetchNone'));
      else message.success(t('set.fetched', { n: r.models.length }));
    } catch (e) {
      message.error(t('set.fetchFail') + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? 'ai');
    setSettings(null);
    setModelOptions([]);
    checkForm.setFieldsValue(params ?? DEFAULT_CHECK_PARAMS);
    void api.getSettings().then(setSettings).catch(e => message.error(String(e)));
  }, [open]);

  const pickBgImage = () => {
    void (async () => {
      try {
        const r = await api.selectImage();
        if (r.canceled || !r.filePath) return;
        setBg({ type: 'image', value: 'file:///' + encodeURI(r.filePath.replace(/\\/g, '/')) });
      } catch {
        message.error(t('ed.imgFail'));
      }
    })();
  };

  const patchSettings = (patch: Partial<AppSettings>) => setSettings(s => (s ? { ...s, ...patch } : s));

  const save = async () => {
    setBusy(true);
    try {
      if (tab === 'check') {
        const v = await checkForm.validateFields();
        await onSaveParams(v as CheckParams);
      } else if (tab === 'ai' && settings) {
        if (settings.personas.length === 0) { message.warning(t('set.notLast')); return; }
        await api.setSettings({
          aiBaseUrl: settings.aiBaseUrl.trim(),
          aiApiKey: settings.aiApiKey.trim(),
          aiModel: settings.aiModel.trim(),
          personas: settings.personas,
          activePersonaId: settings.activePersonaId,
        });
        message.success(t('set.saved'));
      } else {
        message.success(t('set.saved'));
      }
      onClose();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // 表单校验错误静默
      message.error(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const aiTab = !settings ? <Spin /> : (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('set.aiHint')}</Typography.Text>
      <Form layout="vertical" size="small">
        <Form.Item label={t('set.aiBase')}>
          <Input
            value={settings.aiBaseUrl}
            placeholder={t('set.aiBasePh')}
            onChange={e => patchSettings({ aiBaseUrl: e.target.value })}
          />
        </Form.Item>
        <Form.Item label={t('set.aiKey')}>
          <Input.Password
            value={settings.aiApiKey}
            placeholder={t('set.aiKeyPh')}
            onChange={e => patchSettings({ aiApiKey: e.target.value })}
          />
        </Form.Item>
        <Form.Item label={t('set.aiModel')}>
          <Space.Compact style={{ width: '100%' }}>
            <AutoComplete
              style={{ width: 'calc(100% - 118px)' }}
              value={settings.aiModel}
              placeholder={t('set.aiModelPh')}
              options={modelOptions}
              onChange={v => patchSettings({ aiModel: String(v) })}
              allowClear
            />
            <Button loading={fetching} onClick={() => void fetchModels()}>
              {t('set.fetchModels')}
            </Button>
          </Space.Compact>
        </Form.Item>
      </Form>

      <Space.Compact style={{ width: '100%' }}>
        <Typography.Text strong style={{ fontSize: 12 }}>{t('set.persona')}</Typography.Text>
      </Space.Compact>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('set.personaHint')}</Typography.Text>

      <div className="persona-list">
        {settings.personas.map(p => {
          const active = p.id === settings.activePersonaId;
          return (
            <div key={p.id} className={'persona-card' + (active ? ' active' : '')}>
              <div className="persona-row">
                <Input
                  size="small"
                  value={p.name}
                  onChange={e => patchSettings({
                    personas: settings.personas.map(x => x.id === p.id ? { ...x, name: e.target.value } : x),
                  })}
                  style={{ width: 160 }}
                />
                <Space size={6}>
                  <Button
                    size="small"
                    type={active ? 'primary' : 'default'}
                    onClick={() => patchSettings({ activePersonaId: p.id })}
                  >
                    {active ? t('set.activePersona') : t('set.usePersona')}
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={settings.personas.length <= 1}
                    title={settings.personas.length <= 1 ? t('set.notLast') : t('set.delPersona')}
                    onClick={() => {
                      Modal.confirm({
                        title: t('set.delPersonaConfirm', { name: p.name }),
                        onOk: () => {
                          const rest = settings.personas.filter(x => x.id !== p.id);
                          patchSettings({
                            personas: rest,
                            activePersonaId: active ? rest[0].id : settings.activePersonaId,
                          });
                        },
                      });
                    }}
                  />
                </Space>
              </div>
              <Input.TextArea
                value={p.prompt}
                rows={3}
                placeholder={t('set.personaPrompt')}
                onChange={e => patchSettings({
                  personas: settings.personas.map(x => x.id === p.id ? { ...x, prompt: e.target.value } : x),
                })}
              />
            </div>
          );
        })}
      </div>
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={() => patchSettings({
          personas: [...settings.personas, newPersona(t('set.addPersona'))],
        })}
      >
        {t('set.addPersona')}
      </Button>
    </Space>
  );

  const appearanceTab = (
    <Space direction="vertical" style={{ width: '100%' }} size={14}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('set.appearanceHint')}</Typography.Text>
      <div>
        <Typography.Text style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{t('set.langLabel')}</Typography.Text>
        <Segmented
          value={locale}
          onChange={v => setLocale(v as 'zh' | 'en')}
          options={[
            { label: t('set.langZh'), value: 'zh' },
            { label: t('set.langEn'), value: 'en' },
          ]}
        />
      </div>
      <div>
        <Typography.Text style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{t('set.themeLabel')}</Typography.Text>
        <Segmented
          value={theme}
          onChange={v => setTheme(v as 'light' | 'dark')}
          options={[
            { label: t('lib.themeLight'), value: 'light' },
            { label: t('lib.themeDark'), value: 'dark' },
          ]}
        />
      </div>
      <div>
        <Typography.Text style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{t('set.bgLabel')}</Typography.Text>
        <div className="bg-pop">
          {READER_COLORS.map(c => (
            <button
              key={c.key}
              type="button"
              className={'bg-swatch' + (bg.type === 'color' && bg.value === c.color ? ' active' : '')}
              style={{ background: c.color }}
              title={t(c.key)}
              onClick={() => setBg({ type: 'color', value: c.color })}
            />
          ))}
          <Button size="small" onClick={() => setBg({ type: 'none' })}>{t('top.bgDefault')}</Button>
          <Button size="small" icon={<PictureOutlined />} onClick={pickBgImage}>{t('top.bgCustom')}</Button>
          {bg.type !== 'none' && (
            <Button size="small" onClick={() => setBg({ type: 'none' })}>{t('top.bgReset')}</Button>
          )}
        </div>
      </div>
    </Space>
  );

  const checkTab = (
    <Form form={checkForm} layout="vertical" size="small">
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('set.hint')}</Typography.Text>
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
  );

  return (
    <Modal
      open={open}
      title={t('top.settings')}
      onCancel={onClose}
      width={640}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>{t('common.cancel')}</Button>,
        <Button key="ok" type="primary" loading={busy} onClick={() => void save()}>{t('common.save')}</Button>,
      ]}
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'ai', label: t('set.tabAi'), children: aiTab },
          { key: 'appearance', label: t('set.tabAppearance'), children: appearanceTab },
          { key: 'check', label: t('set.tabCheck'), children: checkTab },
        ]}
      />
    </Modal>
  );
}

function Spin() {
  return <div style={{ padding: '30px 0', textAlign: 'center' }}>…</div>;
}
