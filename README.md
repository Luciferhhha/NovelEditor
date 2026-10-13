# NovelEditor

> 为网文作者打造的本地小说写作工作台：AI 助手 + 内置查重，全部数据留在你的电脑上。

Windows 桌面应用（Electron + React + TypeScript）。写书、润色、查大纲、防重复，一个软件搞定，**不上传任何内容到云端**——正文永远只存在你自己的硬盘里。

## 为什么选它

- 🤖 **AI 写作助手**：选中一段文字即可一键 **润色 / 扩写 / 精简**，也可以直接输入要求让 AI 按你的指示续写、写对白、补画面。生成结果支持「替换选中」「插入光标处」「复制」三种应用方式。
- 🎭 **形象提示词（Persona）**：内置「小说作家 / 文字润色 / 大纲策划 / 对白教练」四种写作形象，每次调用自动以当前形象的 system prompt 拟化；形象可自由增删改。
- 🔌 **接口随便挑**：兼容任何 OpenAI 风格 API——DeepSeek、Kimi、通义千问、OpenAI，或者**完全离线**的本地模型 Ollama；设置页一键拉取可用模型列表，填地址和密钥即可用。
- 🔍 **本地全文查重**：全本地、离线运行。字符 10-gram + winnowing 指纹算法对全书做重复度检测，命中片段直接映射回 Markdown 源码高亮，章节保存后自动增量复查——不用把稿子交给任何第三方查重网站。
- ✍️ **专注的编辑体验**：Markdown 源码为唯一数据源，CodeMirror 6 编辑 + 实时预览，分屏 / 纯编辑 / 纯预览三模式；大纲树管理卷与章，面板可自由拖动、收起。
- 📦 **导出与备份**：一键导出 TXT / Markdown / DOCX（按章、按卷或全书）；SQLite `VACUUM INTO` 自动快照，保留最近 5 份，随时一键恢复。
- 🌐 **中英双语界面**。

## 快速开始

要求：Windows 10+，[Node.js 22+](https://nodejs.org/) 与 pnpm。无需安装 Visual Studio——`better-sqlite3` 使用自带的 N-API 预编译包。

```bash
git clone https://github.com/Luciferhhha/NovelEditor.git
cd NovelEditor/app
pnpm install        # 安装依赖
npm run dev         # 开发模式（主进程 + 渲染层热更新）
npm run dist        # 打包出 NSIS 安装包（产物在 ../artifacts/release/）
```

首次使用请到 **设置 → AI 助手** 填入 API 地址、密钥与模型名（或一键拉取模型列表选择）；不配置也能正常使用编辑、查重、导出等全部本地功能。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 书架 | 书籍增删、章数/字数/打开时间统计；每本书独立 SQLite 数据库（WAL） |
| 编辑 | CodeMirror 6 + markdown-it 实时预览，30 秒自动保存 + Ctrl+S，版本乐观锁防并发覆盖 |
| AI 助手 | 润色/扩写/精简/指令写作，形象提示词拟化，OpenAI 兼容接口，模型列表拉取 |
| 查重 | 归一化 → 分段 → 10-gram → winnowing(w=4) 倒排索引 → 种子双向扩展，worker_threads 后台运行，评分分级（bad/warn），报告可跳转、可忽略 |
| 搜索 | 全书文本搜索并跳转命中位置 |
| 导出 | TXT / Markdown / DOCX，粒度到章 / 卷 / 全书 |
| 备份 | 自动快照保留最近 5 份，一键恢复 |

## 技术栈

Electron · React 18 · TypeScript · Ant Design 6 · CodeMirror 6 · Zustand · better-sqlite3 · Vite · Vitest

## 目录结构

```
NovelEditor/
├── NovelEditor计划书.md      任务计划书（v2.0）
├── README.md                 本文件
├── app/                      源码工程
│   ├── src/main/             主进程：IPC、SQLite、查重 worker、AI 服务、导出、备份
│   ├── src/preload/          预加载桥（白名单 IPC）
│   ├── src/shared/           共享类型、IPC 契约、查重核心算法
│   ├── src/renderer/         渲染层：书架、编辑器、预览、AI 抽屉、查重报告
│   └── tests/                Vitest 测试（86 例）
└── docs/                     使用与开发文档
```

## 开发

```bash
cd app
npm test             # Vitest 86 例
npm run typecheck    # tsc 双工程类型检查
npm run build        # 编译主进程 + 构建渲染层
```

打包时如遇 GitHub 二进制下载慢，可设置国内镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 文档

- [使用说明](docs/使用说明.md)
- [开发指南](docs/开发指南.md)
