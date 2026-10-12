import type { AppSettings } from '../../shared/types';
import { readSettings } from './settingsService';

/**
 * 根据用户填的 API 地址生成候选请求地址（OpenAI 兼容 /chat/completions）。
 * 兼容三类写法：完整地址（已含 /chat/completions）、以 /v1 结尾的 base、裸域名。
 * 404 时按候选顺序回退，因此 DeepSeek/OpenAI/Kimi/通义/Ollama 等都可直接填。
 */
export function chatUrlCandidates(baseUrl: string): string[] {
  const u = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!u) return [];
  if (/\/chat\/completions$/.test(u)) return [u];
  if (/\/v\d+$/.test(u)) return [u + '/chat/completions'];
  const a = u + '/chat/completions';
  const b = u + '/v1/chat/completions';
  return a === b ? [a] : [a, b];
}

export interface ChatRequest {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
}

export function buildChatBody(model: string, system: string, prompt: string): ChatRequest {
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  };
}

const TIMEOUT_MS = 120_000;

async function postJson(url: string, key: string, body: ChatRequest): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractText(json: any): string {
  const c = json?.choices;
  const first = Array.isArray(c) ? c[0] : undefined;
  const msg = first?.message?.content ?? first?.text;
  if (typeof msg === 'string' && msg.length > 0) return msg;
  throw new Error('AI_EMPTY_RESPONSE');
}

/**
 * 调用 OpenAI 兼容接口。错误统一为可本地化的前缀码：
 * AI_NOT_CONFIGURED / AI_EMPTY_RESPONSE / AI_HTTP_<status> / AI_NETWORK
 */
export async function chat(system: string, prompt: string): Promise<string> {
  const s: AppSettings = readSettings();
  const urls = chatUrlCandidates(s.aiBaseUrl);
  if (urls.length === 0 || !s.aiApiKey) throw new Error('AI_NOT_CONFIGURED');
  if (!s.aiModel) throw new Error('AI_NOT_CONFIGURED');
  const body = buildChatBody(s.aiModel, system, prompt);
  let lastErr: unknown = null;
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await postJson(urls[i], s.aiApiKey, body);
      if (res.ok) {
        const json = await res.json();
        return extractText(json);
      }
      // 404 时尝试下一个候选地址；其余状态直接报错
      if (res.status !== 404 || i === urls.length - 1) {
        const detail = await res.text().catch(() => '');
        throw new Error('AI_HTTP_' + res.status + (detail ? ': ' + detail.slice(0, 300) : ''));
      }
      lastErr = new Error('AI_HTTP_404');
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('AI_HTTP_') && !msg.endsWith('404')) throw e;
      if (!msg.startsWith('AI_')) {
        // 网络/超时等
        if (i === urls.length - 1) throw new Error('AI_NETWORK: ' + msg);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI_NETWORK');
}
