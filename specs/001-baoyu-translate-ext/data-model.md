# Data Model: Baoyu Translate Chrome Extension

**Branch**: `001-baoyu-translate-ext` | **Date**: 2026-05-24

## Entities

### ProviderConfig

AI 服务提供者配置，存储于 `chrome.storage.sync`。

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| id | string | yes | - | 预设 ID 或 "custom" |
| name | string | yes | - | 显示名称（如 "OpenAI", "DeepSeek"） |
| baseUrl | string | yes | - | OpenAI 兼容 API 地址（如 `https://api.openai.com/v1`） |
| apiKey | string | yes | - | API 密钥 |
| model | string | yes | - | 模型名称（如 `gpt-4o`） |
| color | string | no | "#aaa" | 显示色标（用于 UI 标识点） |

**Preset Providers**:

| id | name | baseUrl | model | color |
|----|------|---------|-------|-------|
| openai | OpenAI | https://api.openai.com/v1 | gpt-4o | #10a37f |
| deepseek | DeepSeek | https://api.deepseek.com/v1 | deepseek-chat | #4d6bfe |
| moonshot | Moonshot | https://api.moonshot.cn/v1 | moonshot-v1-8k | #6c5ce7 |
| anthropic | Anthropic | https://api.anthropic.com/v1 | claude-sonnet-4-6 | #d4a574 |
| custom | 自定义 | (user input) | (user input) | #aaa |

**Storage key**: `provider_config`

**Validation**:
- `baseUrl`: must be non-empty, start with `https://`
- `apiKey`: must be non-empty
- `model`: must be non-empty

---

### TranslationMode

枚举类型，表示翻译模式。

| Value | Label | Steps | Retry Limit |
|-------|-------|-------|-------------|
| quick | 快翻 | 翻译 | 2 |
| normal | 普通 | 分析 → 翻译 | 2 |
| refined | 精翻 | 分析 → 翻译 → 审校 → 润色 | 3 |

**Storage key**: `last_mode` (string, 存于 `chrome.storage.sync`)

---

### TranslationTask

一次翻译任务的完整状态，运行时存在于 Service Worker 内存，每批次持久化到 `chrome.storage.local`。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | UUID v4 |
| url | string | yes | 源页面 URL |
| mode | TranslationMode | yes | 翻译模式 |
| status | TaskStatus | yes | 当前状态 |
| currentStep | TranslationStep | no | 当前步骤 |
| totalBatches | number | no | 总批次数 |
| currentBatch | number | no | 当前批次（1-based） |
| analysis | AnalysisResult | no | 分析结果（普通/精翻模式） |
| translations | ParagraphTranslation[] | no | 已完成的翻译段落 |
| error | ErrorInfo | no | 错误信息（仅失败时） |
| createdAt | number | yes | 创建时间戳 (ms) |
| updatedAt | number | yes | 最后更新时间戳 (ms) |

**TaskStatus 枚举**:

| Value | Description |
|-------|-------------|
| pending | 任务已创建，等待开始 |
| analyzing | 正在分析文章 |
| translating | 正在翻译 |
| reviewing | 正在审校（精翻） |
| polishing | 正在润色（精翻） |
| completed | 翻译完成 |
| failed | 翻译失败（重试耗尽） |
| paused | 用户暂停 / 等待用户操作 |

**TranslationStep 枚举**: `analyze`, `translate`, `review`, `polish`

**Storage key**: `task_{url_hash}` (存于 `chrome.storage.local`)

**State Transitions**:

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

---

### AnalysisResult

文章分析结果，由普通/精翻模式的分析步骤产生。

| Field | Type | Description |
|-------|------|-------------|
| domain | string | 文章领域（如 "前端开发", "人工智能"） |
| glossary | GlossaryEntry[] | 术语表 |
| culturalNotes | CulturalNote[] | 文化注释表（外国品牌/平台/机构等需加注解释） |
| difficulties | string[] | 翻译难点列表 |
| summary | string | 文章摘要 |

**GlossaryEntry**:

| Field | Type | Description |
|-------|------|-------------|
| term | string | 原文术语 |
| translation | string | 推荐中文翻译 |
| note | string | 使用说明 |

**CulturalNote**:

| Field | Type | Description |
|-------|------|-------------|
| term | string | 原文术语/品牌名 |
| explanation | string | 对中文读者的简要解释（如 "英国外卖平台"） |

翻译时首次出现格式：`{term}（{explanation}）`，例如 `Deliveroo（英国外卖平台）`

---

### ParagraphTranslation

单个段落的翻译结果。

| Field | Type | Description |
|-------|------|-------------|
| index | number | 段落在原文中的顺序 |
| originalSelector | string | 原文元素的 CSS 选择器或唯一标识 |
| originalText | string | 原文文本 |
| translatedText | string | 译文文本 |
| isCodeBlock | boolean | 是否为代码块（代码块不翻译） |
| batchIndex | number | 所属批次 |

---

### TranslationCache

翻译缓存条目，存储于 `chrome.storage.local`。

| Field | Type | Description |
|-------|------|-------------|
| url | string | 页面 URL（缓存 key） |
| translations | ParagraphTranslation[] | 翻译结果 |
| mode | TranslationMode | 使用的翻译模式 |
| providerId | string | 使用的 Provider ID |
| timestamp | number | 缓存时间戳 (ms) |

**Cache Rules**:
- Key: 页面 URL（规范化后）
- TTL: 24 小时（86400000 ms）
- Max entries: 20
- Eviction: 淘汰最早的条目（按 timestamp 排序）

**Storage key**: `cache_{url_hash}`

---

### ErrorInfo

翻译错误信息。

| Field | Type | Description |
|-------|------|-------------|
| step | TranslationStep | 发生错误的步骤 |
| batchIndex | number | 发生错误的批次 |
| message | string | 错误消息 |
| retryCount | number | 已重试次数 |
| maxRetries | number | 最大重试次数 |

---

## Entity Relationships

```
ProviderConfig (1) ──used by──→ TranslationTask
TranslationTask (1) ──contains──→ (0..n) ParagraphTranslation
TranslationTask (0..1) ──has──→ AnalysisResult
TranslationTask (0..1) ──has──→ ErrorInfo
TranslationCache (1) ──contains──→ (0..n) ParagraphTranslation
AnalysisResult (1) ──contains──→ (0..n) GlossaryEntry
```

## Storage Layout

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
