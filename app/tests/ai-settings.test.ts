import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';

/** 设置持久化与 AI 地址推导（不发起真实网络请求） */
const DATA = 'H:\\NovelEditor工程\\data-test-settings';
process.env.NOVELEDITOR_DATA_DIR = DATA;

let settingsService: typeof import('../src/main/services/settingsService');
let aiService: typeof import('../src/main/services/aiService');

beforeAll(async () => {
  settingsService = await import('../src/main/services/settingsService');
  aiService = await import('../src/main/services/aiService');
});

afterAll(() => {
  fs.rmSync(DATA, { recursive: true, force: true });
});

describe('settingsService', () => {
  it('默认设置含内置形象且当前形象有效', () => {
    const s = settingsService.defaultSettings();
    expect(s.personas.length).toBeGreaterThanOrEqual(4);
    expect(s.personas.some(p => p.id === s.activePersonaId)).toBe(true);
    expect(s.personas[0].name).toBe('小说作家');
    expect(s.personas[0].prompt).toContain('小说作家');
  });

  it('全新目录读取返回默认设置（不写文件）', () => {
    const s = settingsService.readSettings();
    expect(s.aiBaseUrl).toBe('');
    expect(s.personas.length).toBeGreaterThanOrEqual(4);
  });

  it('局部写入保留其余字段', () => {
    const before = settingsService.readSettings();
    settingsService.writeSettings({ aiModel: 'm1' });
    const after = settingsService.readSettings();
    expect(after.aiModel).toBe('m1');
    expect(after.personas).toEqual(before.personas);
    expect(after.aiBaseUrl).toBe(before.aiBaseUrl);
  });

  it('形象列表增删改持久化', () => {
    const before = settingsService.readSettings();
    const custom = { id: 'x1', name: '测试形象', prompt: '你是一个测试角色' };
    settingsService.writeSettings({ personas: [...before.personas, custom] });
    expect(settingsService.readSettings().personas.some(p => p.id === 'x1')).toBe(true);
    const rest = settingsService.readSettings().personas.filter(p => p.id !== 'x1');
    settingsService.writeSettings({ personas: rest, activePersonaId: rest[0].id });
    const fin = settingsService.readSettings();
    expect(fin.personas.some(p => p.id === 'x1')).toBe(false);
    expect(fin.activePersonaId).toBe(rest[0].id);
  });

  it('activePersonaId 指向不存在形象时被钳制回有效值', () => {
    settingsService.writeSettings({ activePersonaId: 'ghost' });
    const s = settingsService.readSettings();
    expect(s.personas.some(p => p.id === s.activePersonaId)).toBe(true);
  });

  it('清空形象列表回退到内置默认', () => {
    settingsService.writeSettings({ personas: [] });
    const s = settingsService.readSettings();
    expect(s.personas.length).toBeGreaterThanOrEqual(4);
  });
});

describe('aiService chatUrlCandidates', () => {
  it('空地址返回空候选', () => {
    expect(aiService.chatUrlCandidates('')).toEqual([]);
    expect(aiService.chatUrlCandidates('   ')).toEqual([]);
  });

  it('完整地址原样使用', () => {
    expect(aiService.chatUrlCandidates('https://host/v1/chat/completions'))
      .toEqual(['https://host/v1/chat/completions']);
  });

  it('/v1 结尾只追加 /chat/completions', () => {
    expect(aiService.chatUrlCandidates('https://api.deepseek.com/v1/'))
      .toEqual(['https://api.deepseek.com/v1/chat/completions']);
    expect(aiService.chatUrlCandidates('https://x.com/v2'))
      .toEqual(['https://x.com/v2/chat/completions']);
  });

  it('裸域名给出两个候选并按顺序回退', () => {
    expect(aiService.chatUrlCandidates('https://api.openai.com')).toEqual([
      'https://api.openai.com/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
    expect(aiService.chatUrlCandidates('http://localhost:11434/')).toHaveLength(2);
  });

  it('buildChatBody: system 在前、user 在后，带模型名', () => {
    const b = aiService.buildChatBody('m1', '你是小说作家', '润色：xxx');
    expect(b.model).toBe('m1');
    expect(b.messages).toHaveLength(2);
    expect(b.messages[0]).toEqual({ role: 'system', content: '你是小说作家' });
    expect(b.messages[1].role).toBe('user');
    expect(b.messages[1].content).toContain('润色');
  });
});

describe('aiService 模型列表拉取（#4 一键拉取）', () => {
  it('modelsUrlCandidates: 空地址返回空', () => {
    expect(aiService.modelsUrlCandidates('')).toEqual([]);
  });

  it('modelsUrlCandidates: 完整 chat/completions 地址先去掉尾部，落 /v1 规则出单候选', () => {
    expect(aiService.modelsUrlCandidates('https://host/v1/chat/completions'))
      .toEqual(['https://host/v1/models']);
    expect(aiService.modelsUrlCandidates('https://host/chat/completions'))
      .toEqual(['https://host/models', 'https://host/v1/models']);
  });

  it('modelsUrlCandidates: /v1 结尾只出一个 /v1/models', () => {
    expect(aiService.modelsUrlCandidates('https://api.deepseek.com/v1'))
      .toEqual(['https://api.deepseek.com/v1/models']);
  });

  it('modelsUrlCandidates: 裸域名给两个候选', () => {
    expect(aiService.modelsUrlCandidates('https://api.openai.com')).toEqual([
      'https://api.openai.com/models',
      'https://api.openai.com/v1/models',
    ]);
  });

  it('extractModels: OpenAI 风格 data[].id', () => {
    expect(aiService.extractModels({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('extractModels: Ollama 风格 models[].name 与字符串项', () => {
    expect(aiService.extractModels({ models: [{ name: 'llama3' }, 'qwen'] }))
      .toEqual(['llama3', 'qwen']);
  });

  it('extractModels: 去重且异常返回空数组', () => {
    expect(aiService.extractModels({ data: [{ id: 'x' }, { id: 'x' }] })).toEqual(['x']);
    expect(aiService.extractModels(null)).toEqual([]);
    expect(aiService.extractModels({})).toEqual([]);
  });
});
