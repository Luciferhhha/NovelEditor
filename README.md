# NovelEditor 工程

本地小说写作工作台（Windows 桌面应用），按《NovelEditor计划书.md》v2.0 实现。

## 目录结构

```
H:\\NovelEditor工程\\
├── NovelEditor计划书.md      任务计划书（v2.0）
├── README.md                 本文件
├── app\\                     源码工程（Electron + React + TypeScript）
│   ├── src/main\\            主进程：IPC、SQLite、查重 worker、导出、备份
│   ├── src/preload\\         预加载桥（白名单 IPC）
│   ├── src/shared\\          共享：类型、IPC 契约、markdown 映射、查重核心
│   ├── src/renderer\\        渲染层：书架、编辑器、预览、查重报告（React + Ant Design 6 + CodeMirror 6 + Zustand）
│   └── tests\\               Vitest 测试（48 例）
├── docs\\                    使用与开发文档
├── artifacts\\               打包产物（NSIS 安装包、win-unpacked）
├── data\\                    运行时数据（library.json + books/<id>/book.db，gitignore）
├── .cache\\                  Electron / electron-builder 下载缓存（H 盘）
├── .pnpm-store\\             pnpm 全局存储（H 盘）
```

## 环境要求

- Node.js 22+ / pnpm（依赖安装走 `.pnpm-store`，免装 VS：better-sqlite3 使用自带 N-API prebuild）
- 打包需网络可达 npmmirror（electron / electron-builder 二进制镜像）

## 常用命令（在 app\\ 下执行）

```bash
pnpm install                 # 安装依赖
npm run dev                  # 开发模式（main + renderer 热更新）
npm test                     # Vitest 48 例
npm run typecheck            # tsc 双工程类型检查
npm run build                # 编译主进程 + 构建渲染层
npm run dist                 # electron-builder 打 NSIS 安装包
```

打包环境变量（国内镜像，避免 GitHub 超时）：

```
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
ELECTRON_CACHE=H:\\NovelEditor工程\\.cache\\electron
ELECTRON_BUILDER_CACHE=H:\\NovelEditor工程\\.cache\\electron-builder
```

## 功能概览

- **书架**：书籍增删、统计（章数/字数/打开时间），数据存 `.json` + 每书独立 SQLite（WAL）。
- **编辑**：Markdown 源码为唯一数据源，CodeMirror 6 编辑 + markdown-it 实时预览，分屏/纯编辑/纯预览三模式，大纲树（卷/章管理），30s 自动保存 + Ctrl/Cmd+S，版本乐观锁防覆盖。
- **查重**（全本地、离线）：归一化 → 分段 → 字符 10-gram → winnowing(w=4) 倒排索引 → 种子双向扩展 → ≥30 字过滤 → 评分分级（bad/warn），worker_threads 后台运行，章节保存后增量复查；命中区间经 plain_map 映射回 Markdown 源码高亮，报告面板可跳转/忽略。
- **搜索**：全书文本搜索，跳转命中位置。
- **导出**：TXT / Markdown / DOCX，粒度 章/卷/全书。
- **备份**：`VACUUM INTO` 快照，保留最近 5 份，可一键恢复。

## 文档

- [docs/使用说明.md](docs/使用说明.md)
- [docs/开发指南.md](docs/开发指南.md)
