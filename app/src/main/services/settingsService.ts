import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppSettings, Persona } from '../../shared/types';
import { resolveDataDir } from './bookService';

/** 内置形象提示词：所有模型调用都按当前选中形象拟化（system prompt） */
export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'novelist',
    name: '小说作家',
    prompt:
      '你是一位十分优秀的小说作家，善于构建引人入胜的情节、塑造立体鲜活的人物、营造沉浸式氛围；' +
      '精通开篇钩子、节奏控制、视角切换与伏笔回收，熟悉网络文学与经典文学的叙事手法。' +
      '写作时严格尊重用户给定的世界观、设定、人物关系与风格要求，输出自然流畅、富有画面感的中文；' +
      '除非用户要求，否则只输出正文内容，不作任何解释。',
  },
  {
    id: 'polisher',
    name: '文字润色',
    prompt:
      '你是一位资深文字编辑，善于在不改变原意、篇幅、叙事视角与人称的前提下润色文字：' +
      '消除生硬与重复，提升画面感与节奏感，保留作者原有文风。只输出修改后的文字，不要解释。',
  },
  {
    id: 'planner',
    name: '大纲策划',
    prompt:
      '你是一位资深故事策划，善于设计三幕式结构、章节大纲、冲突升级链与钩子（章末悬念）；' +
      '输出清晰的层级大纲（卷/章/要点），并标注每章的目标、冲突与转折。只输出结果，不要多余解释。',
  },
  {
    id: 'dialogue',
    name: '对白教练',
    prompt:
      '你是一位擅长对白的写作教练：让每个角色的语言带有可辨识的个性与潜台词，' +
      '推动情节与揭示人物并重，避免"说明文式对白"。只输出结果，不要解释。',
  },
];

export function defaultSettings(): AppSettings {
  return {
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
    personas: DEFAULT_PERSONAS.map(p => ({ ...p })),
    activePersonaId: DEFAULT_PERSONAS[0].id,
  };
}

function settingsPath(): string {
  return path.join(resolveDataDir(), 'settings.json');
}

/** 读取设置：缺失字段用默认值兜底，activePersonaId 必须指向存在的形象 */
export function readSettings(): AppSettings {
  const def = defaultSettings();
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const v = JSON.parse(raw) as Partial<AppSettings>;
    const personas = Array.isArray(v.personas) && v.personas.length > 0
      ? v.personas.filter(p => p && typeof p.id === 'string' && typeof p.prompt === 'string')
          .map(p => ({ id: String(p.id), name: String(p.name ?? ''), prompt: String(p.prompt) }))
      : def.personas;
    const active = typeof v.activePersonaId === 'string' && personas.some(p => p.id === v.activePersonaId)
      ? v.activePersonaId
      : personas[0].id;
    return {
      aiBaseUrl: typeof v.aiBaseUrl === 'string' ? v.aiBaseUrl : def.aiBaseUrl,
      aiApiKey: typeof v.aiApiKey === 'string' ? v.aiApiKey : def.aiApiKey,
      aiModel: typeof v.aiModel === 'string' ? v.aiModel : def.aiModel,
      personas,
      activePersonaId: active,
    };
  } catch {
    return def;
  }
}

/** 局部更新并持久化（原子写：tmp + rename） */
export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...readSettings(), ...patch };
  if (!Array.isArray(next.personas) || next.personas.length === 0) {
    next.personas = defaultSettings().personas;
  }
  if (!next.personas.some(p => p.id === next.activePersonaId)) {
    next.activePersonaId = next.personas[0].id;
  }
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return next;
}
