import React, { useState } from 'react';
import { App, Button, Drawer, FloatButton, Space, Typography } from 'antd';
import { SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useT } from '../i18n';

interface Props {
  /** 当前聚焦版块的选区文本（无选区返回空串） */
  getSelection: () => string;
  /** 用 AI 结果替换当前选区 */
  onReplace: (text: string) => void;
  /** 把 AI 结果插入当前光标处 */
  onInsert: (text: string) => void;
}

type QuickKind = 'polish' | 'expand' | 'condense';

/** AI 悬浮按钮 + 抽屉：一键润色/扩写/精简选中文字，或按用户要求写作 */
export default function AiFab({ getSelection, onReplace, onInsert }: Props) {
  const t = useT();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');

  const localize = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'AI_NOT_CONFIGURED') return t('ai.needConfig');
    if (msg === 'AI_EMPTY_RESPONSE') return t('ai.fail') + msg;
    return t('ai.fail') + msg;
  };

  const ask = async (kind: QuickKind | 'custom') => {
    const sel = getSelection();
    let prompt: string;
    if (kind === 'custom') {
      const inputTrim = input.trim();
      if (!inputTrim) { message.info(t('ai.needInput')); return; }
      prompt = sel ? t('ai.qWriteSel', { sel, input: inputTrim }) : t('ai.qWrite', { input: inputTrim });
    } else {
      if (!sel) { message.info(t('ai.needSelect')); return; }
      prompt = kind === 'polish' ? t('ai.qPolish', { sel })
        : kind === 'expand' ? t('ai.qExpand', { sel })
        : t('ai.qCondense', { sel });
    }
    setBusy(true);
    setResult('');
    try {
      const s = await api.getSettings();
      if (!s.aiBaseUrl || !s.aiApiKey || !s.aiModel) {
        message.warning(t('ai.needConfig'));
        setOpen(true);
        return;
      }
      const persona = s.personas.find(p => p.id === s.activePersonaId) ?? s.personas[0];
      const r = await api.aiChat(persona.prompt, prompt);
      setResult(r.text);
    } catch (e) {
      message.error(localize(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FloatButton
        className="ai-fab"
        icon={<ThunderboltOutlined />}
        tooltip={t('ai.fab')}
        type="primary"
        style={{ insetInlineEnd: 28, insetBlockEnd: 72 }}
        onClick={() => setOpen(true)}
      />
      <Drawer
        className="ai-drawer"
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        width={440}
        title={t('ai.title')}
        mask={false}
        styles={{ wrapper: { boxShadow: '-8px 0 28px rgba(0,0,0,.18)', borderLeft: '1px solid rgba(0,0,0,.08)' } }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('ai.hint')}</Typography.Text>

          <Space wrap>
            <Button size="small" loading={busy} onClick={() => void ask('polish')}>{t('ai.polish')}</Button>
            <Button size="small" loading={busy} onClick={() => void ask('expand')}>{t('ai.expand')}</Button>
            <Button size="small" loading={busy} onClick={() => void ask('condense')}>{t('ai.condense')}</Button>
          </Space>

          <Typography.Text strong style={{ fontSize: 12 }}>{t('ai.title')}</Typography.Text>
          <textarea
            className="ai-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('ai.customPh')}
            rows={4}
          />
          <Button
            type="primary"
            block
            icon={<SendOutlined />}
            loading={busy}
            onClick={() => void ask('custom')}
          >
            {t('ai.send')}
          </Button>

          <div className="ai-result">
            <div className="ai-result-head">
              <Typography.Text strong style={{ fontSize: 12 }}>{t('ai.result')}</Typography.Text>
              <Space size={6}>
                <Button size="small" disabled={!result || busy} onClick={() => { onReplace(result); message.success(t('ai.applied')); }}>
                  {t('ai.replaceSel')}
                </Button>
                <Button size="small" disabled={!result || busy} onClick={() => { onInsert(result); message.success(t('ai.applied')); }}>
                  {t('ai.insertCursor')}
                </Button>
                <Button
                  size="small"
                  disabled={!result}
                  onClick={() => { void navigator.clipboard.writeText(result).then(() => message.success(t('ai.copied'))); }}
                >
                  {t('ai.copy')}
                </Button>
                <Button size="small" disabled={!result} onClick={() => setResult('')}>{t('ai.clear')}</Button>
              </Space>
            </div>
            <div className="ai-result-body">
              {result || (busy ? t('ai.busy') : t('ai.noResult'))}
            </div>
          </div>
        </Space>
      </Drawer>
    </>
  );
}
