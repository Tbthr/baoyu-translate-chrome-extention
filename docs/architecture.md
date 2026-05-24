# 技术设计文档: Baoyu Translate Chrome Extension

## 1. 架构概览

Chrome Extension MV3 三层架构，按职责分为四个模块：

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Popup UI   │────▶│ Service Worker  │────▶│ Content Script   │
│  (popup/)    │     │ (background/)   │     │   (content/)     │
│              │     │                 │     │                  │
│ 模式选择     │     │ 翻译编排        │     │ 文章提取(defuddle)│
│ Provider配置 │     │ AI API 调用     │     │ 双语注入          │
│ 翻译触发     │     │ 缓存管理        │     │ 状态展示          │
│              │     │ 保活机制        │     │                  │
└─────────────┘     └─────────────────┘     └──────────────────┘
                            │                        │
                            └────────┬───────────────┘
                                     ▼
                              ┌─────────────┐
                              │   shared/   │
                              │ 类型定义     │
                              │ 消息常量     │
                              │ 预设Provider │
                              │ Storage封装  │
                              └─────────────┘
```

- **popup/**: 用户界面，320px 宽，原生 TS + CSS（Anthropic 简约风格）
- **content/**: 注入网页的脚本，负责文章提取和双语注入
- **background/**: Service Worker，翻译流程的核心编排者
- **shared/**: 跨模块共享的类型、常量和工具函数

## 2. 核心设计决策

### R-001: Service Worker 保活策略

**Decision**: Content Script 通过 `chrome.runtime.onConnect` 建立长连接保持 SW 活跃，翻译状态每批次持久化到 `chrome.storage.local` 实现崩溃恢复。

**Rationale**: MV3 Service Worker 有约 5 分钟硬超时。活跃翻译期间 content script 维持 port 连接保活，API 调用间隙以 25 秒为周期调用 Chrome API 作为后备方案。

**Alternatives**: `chrome.alarms`（最短 1 分钟间隔，粒度太粗）、周期性 `getPlatformInfo()`（hacky）、Offscreen documents（过重）。

### R-002: 内容提取策略

**Decision**: 使用 defuddle 进行文章提取。克隆 document DOM 传给解析器，提取段落同时保留原始 DOM 位置用于翻译注入。

**Rationale**: defuddle 是现代的网页内容提取工具。克隆 DOM 避免分析过程中修改页面，然后将提取的段落映射回原始 DOM 节点进行翻译注入。

**Alternatives**: 自定义 DOM 遍历（脆弱）、Readability.js（更成熟但在某些现代网页上表现不如 defuddle）、Chrome Reader Mode API（扩展无编程接口）。

### R-003: 项目结构与构建

**Decision**: TypeScript + Vite 手动搭建 MV3 项目结构。Popup 不用框架，原生 TypeScript + CSS 实现 Anthropic 简约设计。

**Rationale**: Popup 仅是 320px 宽的面板（分段控件、下拉框、输入框），React/Vue 会增加打包体积和复杂度。Vite 提供快速构建和原生 TypeScript 支持。

**Alternatives**: CRXJS Vite 插件（抽象层可能冲突）、Plasmo/Extension.js（过重）、Webpack（更慢）。

### R-004: API 通信格式

**Decision**: 所有 Provider 统一使用 OpenAI 兼容 Chat Completions API（`POST /v1/chat/completions`）。单一适配器覆盖全部 Provider。

**Rationale**: 简化代码为单一 API 适配器。大多数 AI 服务商现在提供 OpenAI 兼容端点，包括 Anthropic。

**Alternatives**: 多格式适配器（增加复杂度）、通用 LLM SDK（过重依赖）。

### R-005: 翻译注入与双语显示

**Decision**: Content script 识别含文本的 DOM 元素（p, h1-h6, li, blockquote, td 等），翻译后在原文下方注入兄弟元素，继承原文字体/大小/颜色样式并加左侧灰色竖线。跳过代码块。

**Rationale**: 在原文下方注入保留页面布局，双语阅读自然。灰色竖线区分译文而不干扰阅读。

**Alternatives**: 左右对照（破坏响应式）、Tooltip/覆盖层（长译文可读性差）、替换原文（无法对照）。

### R-006: 翻译 Prompt 工程

**Decision**: 三种模式各有独立系统 prompt 和结构化输出格式。分析阶段提取的上下文（术语表）注入每批翻译请求。

- **快翻**: 单次翻译 prompt，整篇文章作为一个请求（超过 4000 词分批）
- **普通**: 分析 prompt → 提取领域/术语 → 带上下文翻译 prompt
- **精翻**: 分析 → 带上下文翻译 → 审校 prompt → 润色 prompt

**Rationale**: 三模式渐进质量提升是 baoyu-translate skill 的核心理念。结构化 prompt 配合 JSON 数组输出格式保证解析可靠。

**Alternatives**: 流式翻译（增加复杂度）、单 prompt 加模式参数（降低各模式质量）、外部术语服务（不必要）。

### R-007: 存储与缓存策略

**Decision**: `chrome.storage.sync` 存用户设置（Provider 配置、上次模式），自动跨设备同步。`chrome.storage.local` 存翻译缓存（最多 20 条，24h TTL，按 URL 键值）。

**Rationale**: sync 自动跨设备同步（符合 FR-06 要求）。local 容量更大（10MB vs sync 的 100KB）适合缓存。按时间戳 FIFO 淘汰简单有效。

**Alternatives**: IndexedDB（API 复杂）、`chrome.storage.session`（关闭浏览器即清空）、`localStorage`（SW 不可访问）。

### R-008: 错误处理与重试策略

**Decision**: 指数退避重试，按模式设置不同上限（快翻/普通 2 次，精翻 3 次）。最终失败时暂停翻译，在页面注入错误横幅，提供操作按钮（重试 / 切换模式 / 取消）。

**Rationale**: 网络错误和 API 限流是暂时的，重试能处理大部分失败。精翻投入更多精力值得更多重试次数。用户可见的错误恢复将控制权交还用户。

**Alternatives**: 静默重试（长时间失败时用户体验差）、自动降级到简单模式（质量不可预期）、统一重试次数（不考虑模式差异）。

## 3. 数据模型

### 核心实体

**ProviderConfig** — AI 服务配置，存于 `chrome.storage.sync`

| Field | Type | Description |
|-------|------|-------------|
| id | string | 预设 ID 或 "custom" |
| name | string | 显示名称 |
| baseUrl | string | OpenAI 兼容 API 地址 |
| apiKey | string | API 密钥 |
| model | string | 模型名称 |
| color | string | UI 标识色 |

预设 Providers：OpenAI (`gpt-4o`), DeepSeek (`deepseek-chat`), Moonshot (`moonshot-v1-8k`), Anthropic (`claude-sonnet-4-6`), 自定义。

**TranslationTask** — 翻译任务完整状态

| Field | Type | Description |
|-------|------|-------------|
| id | string | UUID v4 |
| url | string | 源页面 URL |
| mode | TranslationMode | 翻译模式 |
| status | TaskStatus | 当前状态 |
| currentBatch/totalBatches | number | 批次进度 |
| analysis | AnalysisResult | 分析结果（普通/精翻） |
| translations | ParagraphTranslation[] | 已完成翻译段落 |

**AnalysisResult** — 文章分析结果

| Field | Type | Description |
|-------|------|-------------|
| domain | string | 文章领域 |
| glossary | GlossaryEntry[] | 术语表 |
| culturalNotes | CulturalNote[] | 文化注释 |
| difficulties | string[] | 翻译难点 |
| summary | string | 文章摘要 |

### 状态机

```
pending → analyzing (normal/refined)
pending → translating (quick)
analyzing → translating
translating → reviewing (refined only)
translating → completed (quick/normal)
translating → failed
reviewing → polishing (refined)
polishing → completed (refined)
polishing → failed
* → paused (on error, user intervention)
paused → translating (retry from checkpoint)
paused → failed (user cancel)
```

### 实体关系

```
ProviderConfig (1) ──used by──→ TranslationTask
TranslationTask (1) ──contains──→ (0..n) ParagraphTranslation
TranslationTask (0..1) ──has──→ AnalysisResult
TranslationTask (0..1) ──has──→ ErrorInfo
TranslationCache (1) ──contains──→ (0..n) ParagraphTranslation
AnalysisResult (1) ──contains──→ (0..n) GlossaryEntry
```

### Storage Layout

```
chrome.storage.sync:
├── provider_config    → ProviderConfig (当前选中的配置)
├── last_mode          → TranslationMode (上次使用的模式)
└── more_settings_open → boolean (更多设置是否展开)

chrome.storage.local:
├── task_{hash}        → TranslationTask (进行中的任务状态)
├── cache_{hash}       → TranslationCache (翻译缓存)
└── task_active_{hash} → boolean (是否有活跃翻译任务标记)
```

### 缓存规则

- Key: 页面 URL（规范化后）
- TTL: 24 小时
- 最大条数: 20
- 淘汰策略: FIFO（按 timestamp 排序淘汰最早的）

## 4. 消息协议

所有消息格式：`{ type: string, payload?: unknown }`

### Popup → Service Worker

| Type | Payload | Description |
|------|---------|-------------|
| `START_TRANSLATION` | `{ mode }` | 启动翻译任务 |
| `GET_TASK_STATUS` | `{ url }` | 查询翻译状态 |
| `CANCEL_TRANSLATION` | `{ taskId }` | 取消翻译 |
| `RETRY_TRANSLATION` | `{ taskId }` | 从断点重试 |
| `GET_PROVIDER_CONFIG` | - | 获取 Provider 配置 |
| `SAVE_PROVIDER_CONFIG` | ProviderConfig | 保存 Provider 配置 |
| `GET_LAST_MODE` | - | 获取上次使用的模式 |

### Content Script → Service Worker

| Type | Payload | Description |
|------|---------|-------------|
| `CONTENT_READY` | `{ url }` | 内容脚本就绪通知 |
| `REQUEST_TRANSLATION` | `{ mode }` | 请求翻译当前页面 |

### Service Worker → Content Script (via Port)

| Type | Payload | Description |
|------|---------|-------------|
| `TRANSLATION_PROGRESS` | TranslationTask | 翻译进度更新 |
| `INJECT_TRANSLATION` | `{ translations, batchIndex, totalBatches }` | 注入一批翻译结果 |
| `TRANSLATION_COMPLETE` | `{ translations }` | 翻译完成 |
| `TRANSLATION_ERROR` | ErrorInfo | 翻译错误 |
| `REVIEW_UPDATE` | `{ translations }` | 审校/润色更新 |
| `SHOW_FLOATING_INDICATOR` | `{ step, progress? }` | 显示悬浮指示器 |

### AIAdapter 接口

```typescript
interface AIAdapter {
  chat(params: ChatParams): Promise<ChatResult>;
}

interface ChatParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResult {
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
}
```

## 5. 翻译 Prompt 设计

### 所有模式共有要求

1. **重写而非翻译**：用自然流畅的中文重写，仿佛优秀的中文母语写作者从零撰写
2. **准确性优先**：事实、数据和逻辑与原文完全一致
3. **文化注释**：对中文读者不熟悉的外国品牌、平台、机构、文化概念，首次出现时用括号加注解释。例如：`Deliveroo（英国外卖平台）`
4. **术语一致**：关键术语全文统一翻译，首次出现时括号标注原文
5. **保留格式**：保留所有 markdown 格式
6. **口语化表达**：优先使用生动的中文口语，保留原文幽默感和自嘲语气

### 快翻 — 翻译 Prompt

直接翻译，整篇文章作为一次请求（超过 4000 词分批）。

### 普通 — 分析 Prompt

返回 JSON：`{ domain, glossary[], culturalNotes[], difficulties[], summary }`

### 普通/精翻 — 翻译 Prompt（带上下文）

基于分析上下文翻译：注入领域、术语表、文化注释、翻译难点。返回 JSON 数组。

### 精翻 — 审校 Prompt

审校中英对照翻译，检查：准确性、术语一致性、文化注释完整性、翻译腔、语句通顺度。返回审校后最终译文。

### 精翻 — 润色 Prompt

最终润色：消除翻译腔、检查文化注释、提升文学性和可读性、确保术语准确一致、保留幽默感。

## 6. MV3 平台约束

| 约束 | 限制 | 应对策略 |
|------|------|---------|
| Service Worker 超时 | ~5 分钟硬超时 | port 长连接保活 + 25 秒周期 Chrome API 调用 |
| chrome.storage.sync | 100KB 上限 | 仅存 Provider 配置和用户偏好 |
| chrome.storage.local | 10MB 上限 | 翻译缓存（20 条 × 24h TTL）和任务状态 |
| localStorage | SW 不可访问 | 统一使用 chrome.storage API |
