# NovelEditor 计划书 v2.0

> 变更说明（相对 v1.0）：
> 1. 编辑器由 Tiptap 富文本改为 **Markdown 源码 + 实时预览**（纯文本为唯一数据源，查重/搜索/导出全部同源，消除文档模型转换损耗）
> 2. 导出格式增加 **DOCX**（TXT / Markdown / DOCX 三种）
> 3. 数据模型、查重定位映射、里程碑随之调整优化

---

## 一、可行性结论：✅ 可行

| 维度 | 评估 |
|------|------|
| 技术风险 | 低。Electron + React + TS 成熟组合；编辑器（CodeMirror 6）、渲染（markdown-it）、SQLite（better-sqlite3）、DOCX（docx 库）均久经验证 |
| 查重可行性 | **高**。字面查重 = n-gram 指纹 + winnowing + 倒排索引，纯本地算法无需 AI 模型；单本 ≤100 万字全量查重预估 < 2 秒 |
| Markdown 方案优势 | 源码即纯文本 → 查重偏移定位天然准确；导出 DOCX/TXT 结构还原简单；无富文本序列化风险 |
| 数据安全 | 本地 SQLite + 自动备份，完全离线 |

---

## 二、需求清单

### 2.1 核心功能

1. **Markdown 编辑**：源码编辑（语法高亮、快捷键工具条）+ 右侧实时预览（同步滚动、分屏可切换）
2. **保存机制**：
   - 自动保存（防崩溃丢失，间隔 30s + 失焦触发）
   - 手动保存（Ctrl+S，单章节粒度）
   - 保存状态指示（已保存 / 保存中 / 未保存）
3. **书籍组织**：书库 → 书 → **卷** → **章** 三级结构，章节可跨卷拖拽移动、重排
4. **查重审查**（核心）：
   - 章节间字面重复检测（粘贴复用、段落照搬、微调改写）
   - 重复报告面板：重复对并排对照 + 相似度 + 位置
   - **章节标注**：命中章节打黄/红徽章，卷章树与书库页均可见
   - 源码编辑器与预览中高亮重复片段，点击报告跳转定位
   - 章节保存后增量重查该章
5. **导出**：TXT / Markdown / **DOCX**（单章 / 卷 / 整书三级粒度；DOCX 按层级生成标题样式）

### 2.2 辅助功能

- 字数统计（章 / 卷 / 书三级）
- 书内全文搜索
- 深色模式
- 备份与恢复（数据库快照）
- 查重参数设置

---

## 三、技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 桌面壳 | Electron 33+ | `contextIsolation: true` + preload 白名单，安全默认 |
| 前端 | React 18 + TypeScript 5 + Vite + electron-builder | 快、打包成熟 |
| **源码编辑器** | **CodeMirror 6**（`@codemirror/lang-markdown`） | 比 Monaco 轻量，专为长文本/写作优化；Decoration API 支持查重高亮；搜索/光标 API 完善 |
| **预览渲染** | **markdown-it**（GFM 扩展：表格/删除线/任务列表）+ 自定义高亮插件 | 快、插件生态；渲染后 DOM 文本可叠加查重高亮 |
| 状态管理 | Zustand | 轻量够用 |
| 数据库 | better-sqlite3（主进程） | 同步 API、极快、单文件 |
| 查重引擎 | 自研 TS 纯函数模块 + Worker 线程 | 可单测、不卡 UI |
| DOCX 导出 | **`docx`** 库（主进程） | 纯 JS、支持标题层级/样式，无需外部软件 |
| UI 组件 | Ant Design 5 | 工具型界面效率高，中文生态好 |
| 测试 | Vitest（查重算法黄金用例 + 导出结构断言）+ Playwright E2E | 算法与导出必须可回归 |

---

## 四、架构设计

### 4.1 进程模型

```
┌──────────────────────── Electron Main ────────────────────────┐
│ BookService / ExportService(TXT·MD·DOCX) / Autosave / Backup  │
│ CheckWorkerHost ←─ MessagePort ─→ 查重 Worker                 │
└──────────────┬────────────────────────────────────────────────┘
               │ IPC（preload 白名单，类型共享 ipc-contract）
┌──────────────▼───────────── Renderer ─────────────────────────┐
│ 书库页 │ 卷章树侧栏 │ CodeMirror 源码编辑 │ 预览 │ 查重报告   │
│ Zustand: books / chapters / editor / checker                  │
└───────────────────────────────────────────────────────────────┘
```

要点：
- 渲染进程**零 Node 权限**，所有读写经 `preload.ts` 暴露的窄接口
- 查重在 Worker 中执行，进度事件回传，可取消
- 章节唯一数据源为 Markdown 源码，纯文本列为派生列（查重/搜索用）

### 4.2 模块目录

```
src/
├── main/                        # Electron 主进程
│   ├── index.ts                 # 窗口/生命周期
│   ├── ipc.ts                   # IPC 路由注册
│   ├── db/
│   │   ├── database.ts          # 连接、PRAGMA、迁移
│   │   ├── schema.sql
│   │   └── repositories/        # bookRepo / volumeRepo / chapterRepo / checkRepo
│   ├── services/
│   │   ├── bookService.ts       # 新建/打开/保存书籍
│   │   ├── autosave.ts
│   │   ├── exportService.ts     # TXT / Markdown / DOCX 统一入口
│   │   │   ├── exportTxt.ts
│   │   │   ├── exportMd.ts
│   │   │   └── exportDocx.ts
│   │   └── backupService.ts
│   └── checker/
│       ├── workerHost.ts        # worker 生命周期、消息协议
│       └── worker.ts            # 查重入口
├── preload/
│   └── index.ts                 # contextBridge API 白名单
├── shared/
│   ├── types.ts                 # Book/Volume/Chapter/CheckResult 等
│   ├── ipc-contract.ts          # 两端共用接口定义（类型安全关键）
│   ├── markdown/
│   │   ├── mdToPlainText.ts     # Markdown → 纯文本（去语法）
│   │   ├── offsetMap.ts         # 纯文本偏移 → 源码偏移映射
│   │   └── outline.ts           # 标题层级提取（导出/大纲用）
│   └── checker-core/            # 纯函数查重算法（可单测）
│       ├── normalize.ts         # 文本归一化
│       ├── segment.ts           # 分句/分段
│       ├── fingerprint.ts       # n-gram + winnowing 指纹
│       ├── index.ts             # 倒排索引构建/增量更新
│       ├── detect.ts            # 重复片段检测与扩展
│       └── score.ts             # 相似度评分/分级
├── renderer/
│   ├── app/                     # 路由、布局、主题
│   ├── pages/                   # LibraryPage / EditorPage / ReportPage
│   ├── features/
│   │   ├── outline/             # 卷章树（拖拽排序、徽章）
│   │   ├── editor/              # CodeMirror 封装、工具栏、自动保存
│   │   ├── preview/             # markdown-it 渲染、同步滚动、高亮叠加
│   │   └── checker/             # 报告面板、章节徽章、片段高亮跳转
│   └── stores/                  # zustand
└── tests/
    ├── checker-core/            # 算法黄金用例
    ├── markdown/                # 映射/纯文本派生用例
    └── export/                  # 导出结构断言
```

---

## 五、数据模型

### 5.1 文件布局

- 书库索引：`%APPDATA%/NovelEditor/library.json`（书列表：id、名称、路径、最近打开）
- 每本书独立存储：`.../books/<bookId>/book.db`（SQLite）+ `backup/` 目录（保留最近 5 份快照）
- **多本书分别管理**：打开哪本书才加载哪本书的数据与查重索引
- 写入原子性：SQLite 事务 + WAL 模式；备份前 `VACUUM INTO`

### 5.2 Schema（核心表）

```sql
books      (id, title, author, description, created_at, updated_at)
volumes    (id, book_id, title, sort_order, created_at)
chapters   (id, book_id, volume_id, title, sort_order,
            content_md,        -- ★ 源码，唯一数据源
            content_text,      -- 派生纯文本（去 Markdown 语法），供查重/搜索
            plain_map_json,    -- 派生：content_text 偏移 → content_md 偏移（定位高亮用）
            word_count, status, updated_at)
            -- status: draft | revised | flagged(查重命中)
chapter_flags (id, chapter_id,        -- warn | bad
               level, dup_count, dup_ratio, created_at)

-- 查重结果（一次全量/增量扫描为一个 run）
check_runs  (id, book_id, scope, params_json, started_at, finished_at)
check_hits  (id, run_id,
             chapter_a, start_a, end_a,      -- 偏移均指 content_text
             chapter_b, start_b, end_b,
             similarity, kind, ignored)      -- kind: exact | near
meta        (key, value)                     -- schema 版本、查重参数
```

索引：`chapters(book_id, volume_id, sort_order)`、`check_hits(run_id, chapter_a)`。

> 派生规则：保存章节时同步重算 `content_text` 与 `plain_map_json`（单遍扫描 O(n)），保证三者一致。

---

## 六、查重引擎详细设计（核心）

### 6.1 流水线

```
content_text
  → [1] 归一化：全角→半角、大小写统一、去多余空白、统一标点
  → [2] 分段/分句：\n\n 分段；。！？；… 分句
  → [3] 指纹化：字符级 n-gram（n=10）→ winnowing（窗口 w=4）选指纹
  → [4] 倒排索引：fingerprint → [(chapterId, offset), ...]
  → [5] 候选对：共享指纹 ≥ k 的章节对/区间对（种子命中）
  → [6] 扩展验证：从种子向两侧贪心扩展为最大公共片段
  → [7] 过滤：片段长度 < 30 字丢弃（避免"他深吸一口气"类套话误报）
  → [8] 评分分级 → 写 check_hits + 更新 chapter_flags
```

### 6.2 关键参数（设置页可调）

| 参数 | 默认 | 说明 |
|------|------|------|
| `n` | 10 | n-gram 长度；中文按字符，10 字窗口避开常用短语误报 |
| `w` | 4 | winnowing 窗口，位置敏感且指纹量约降 4 倍 |
| `MIN_FRAG_LEN` | 30 字 | 最小报告片段长度 |
| `NEAR_THRESHOLD` | 0.85 | near 级相似度阈值（字符级 n-gram Dice/Jaccard） |
| `flag_bad` | ≥100 字近似重复 或 重复占比 ≥5% | 红章 |
| `flag_warn` | ≥2 处短命中 或 占比 1%~5% | 黄章 |

分级规则：
- **bad（红）**：与他章存在 ≥100 字近似重复，或本书重复占比 ≥ 5%
- **warn（黄）**：命中 2 处以上但均较短，或重复占比 1%~5%
- 无命中：不标记，`status` 回到 draft

### 6.3 精确与近似两档

- **exact**：归一化后完全相同的片段（≥ MIN_FRAG_LEN）→ 哈希桶直接命中，零误报
- **near**：exact 未命中但 n-gram 重叠 ≥ 阈值 → 扩展后计算相似度，报告为"疑似改写/微调"

### 6.4 定位与高亮（Markdown 方案关键设计）

1. 查重命中区间记录在 `content_text` 上
2. 经 `plain_map_json` 映射 → `content_md` 源码区间 → CodeMirror Decoration 高亮 + 光标跳转
3. 预览高亮：markdown-it 渲染后对文本节点做区间包裹（`<mark>`）；M4 先实现源码高亮，预览叠加为 M5 可选项

### 6.5 增量与性能

- 保存章节时：删除该章旧指纹 → 重建 → 只重查"该章 vs 其他章"（毫秒级）
- 全书首查/手动"全书查重"：Worker 全量执行，`check:progress` 进度事件，可取消
- 规模预估（单书 ≤ 100 万字）：指纹 30~80 万条，倒排索引 < 100MB 内存，全量 < 2s ✅
- 多书不共享索引，打开哪本书才加载哪本书的索引

### 6.6 结果呈现

1. **卷章树徽章**：章节标题右侧黄/红徽章 + 命中数；书库页同步显示
2. **报告面板**：按重复对分组，A 章片段 ↔ B 章片段并排对照，显示相似度、字数
3. **编辑器高亮**：当前章内重复片段高亮，点击报告项跳转到片段位置
4. **一键处理**：单条命中支持"保留此处 / 标记为引用 / 忽略本条"，忽略项不重复报

---

## 七、导出设计

| 格式 | 实现 | 说明 |
|------|------|------|
| TXT | 主进程字符串拼接 | 去 Markdown 语法，卷/章分隔线 |
| Markdown | 按目录结构拼接 | 保持源码原样；单章导出为 `.md` |
| **DOCX** | 主进程 `docx` 库 | 整书：书名 Title 样式 → 卷 Heading1 → 章 Heading2 → 正文按 `#` 层级递进；粗体/斜体/引用/列表/分隔线按 Markdown AST 映射；支持单章/卷/整书导出 |

统一入口：`exportService.export(bookId, { format, scope: chapter | volume | book })` → 系统保存对话框。

DOCX 支持子集明确为：标题层级 / 粗体 / 斜体 / 引用 / 列表 / 表格 / 分隔线，其余降级为纯文本。

---

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| 短套话误报（"他深吸一口气"等） | `MIN_FRAG_LEN=30` 硬过滤 + 常用短语停用表 |
| 纯文本↔源码偏移映射漂移 | `plain_map_json` 与 `content_text` 同步生成；映射单测覆盖各类 Markdown 语法 |
| Markdown 语法错误导致预览异常 | markdown-it 容错渲染；预览异常不阻断源码编辑与保存 |
| 自动保存与手动保存冲突 | 单写队列 + 版本号乐观锁，冲突时提示恢复 |
| DB 损坏 | WAL 模式 + 定时 `VACUUM INTO` 快照 + 启动校验 |
| 查重卡 UI | 独立 Worker + 可取消 + 增量更新 |
| docx 库对复杂 Markdown 支持有限 | 明确支持子集，其余降级纯文本 |
| Electron 体积 | electron-builder 按需裁剪，asar 开启 |

---

## 九、开发里程碑

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| **M1** 骨架 | Electron + Vite + React 工程、IPC 契约、书库页、新建/打开书 | 能创建书并落库 |
| **M2** 编辑与保存 | CodeMirror 源码编辑 + markdown-it 预览、卷章树 CRUD/拖拽排序、单章保存 + 自动保存 + 状态指示 | 崩溃不丢稿（≤30s）；预览正确渲染 |
| **M3** 查重核心 | `checker-core` 全模块 + 单测（黄金用例 ≥20 条）、`plain_map` 映射、Worker 接入 | 样例书准确报出 exact/near 片段；映射单测通过 |
| **M4** 审查 UI | 徽章、报告面板、源码高亮跳转、忽略/分级、参数设置 | 完整审查闭环 |
| **M5** 导出与打磨 | **TXT / MD / DOCX 导出**、全文搜索、字数统计、备份恢复、深色模式、预览高亮叠加（可选） | 三级导出可用，DOCX 层级正确 |
| **M6** 发布 | electron-builder 打安装包、E2E 冒烟 | 发布 0.1.0 |

---

## 十、关键决策记录

| 决策点 | 结论 |
|--------|------|
| 产品形态 | Electron 桌面应用（本地存储、离线可用） |
| 查重深度 | 字面重复（n-gram + winnowing），语义改写查重留待后续版本 |
| 数据组织 | 多本书分别管理，每本书独立 SQLite 文件与查重索引 |
| 编辑方式 | Markdown 源码 + 实时预览（源码为唯一数据源） |
| 导出格式 | TXT / Markdown / DOCX |
