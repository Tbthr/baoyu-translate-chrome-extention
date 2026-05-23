# Contract: Internal Message Protocol

Chrome Extension 内部消息协议，定义 Popup、Content Script、Service Worker 之间的通信契约。

## Message Format

所有消息使用 `chrome.runtime.sendMessage` 或 `chrome.runtime.Port` 传递，格式为：

```typescript
interface Message {
  type: string;       // 消息类型
  payload?: unknown;  // 消息负载
}
```

## Popup → Service Worker

| Type | Payload | Response | Description |
|------|---------|----------|-------------|
| `START_TRANSLATION` | `{ mode: TranslationMode }` | `{ taskId: string }` | 启动翻译任务 |
| `GET_TASK_STATUS` | `{ url: string }` | `TranslationTask \| null` | 查询翻译状态 |
| `CANCEL_TRANSLATION` | `{ taskId: string }` | `{ ok: boolean }` | 取消翻译 |
| `RETRY_TRANSLATION` | `{ taskId: string }` | `{ taskId: string }` | 从断点重试 |
| `GET_PROVIDER_CONFIG` | - | `ProviderConfig` | 获取当前 Provider 配置 |
| `SAVE_PROVIDER_CONFIG` | `ProviderConfig` | `{ ok: boolean }` | 保存 Provider 配置 |
| `GET_LAST_MODE` | - | `TranslationMode` | 获取上次使用的模式 |

## Content Script → Service Worker

| Type | Payload | Response | Description |
|------|---------|----------|-------------|
| `CONTENT_READY` | `{ url: string }` | - | 内容脚本就绪通知 |
| `REQUEST_TRANSLATION` | `{ mode: TranslationMode }` | `{ taskId: string }` | 请求翻译当前页面 |
| `INJECT_TRANSLATION` | `{ translations: ParagraphTranslation[], batchIndex: number }` | - | 注入翻译结果指令（SW→CS） |

## Service Worker → Content Script (via Port)

长连接消息，使用 `chrome.tabs.sendMessage` 或 Port 推送：

| Type | Payload | Description |
|------|---------|-------------|
| `TRANSLATION_PROGRESS` | `TranslationTask` | 翻译进度更新 |
| `INJECT_TRANSLATION` | `{ translations: ParagraphTranslation[], batchIndex: number, totalBatches: number }` | 注入一批翻译结果 |
| `TRANSLATION_COMPLETE` | `{ translations: ParagraphTranslation[] }` | 翻译完成 |
| `TRANSLATION_ERROR` | `ErrorInfo` | 翻译错误 |
| `REVIEW_UPDATE` | `{ translations: ParagraphTranslation[] }` | 审校/润色更新（替换初稿） |
| `SHOW_FLOATING_INDICATOR` | `{ step: string, progress?: string }` | 显示悬浮指示器 |

## API Adapter Contract

Service Worker 对外调用 AI API 的统一接口：

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

**Endpoint**: `POST {baseUrl}/chat/completions`

**Request**:
```json
{
  "model": "string",
  "messages": [{ "role": "system|user|assistant", "content": "string" }],
  "temperature": 0.3
}
```

**Response**:
```json
{
  "choices": [{ "message": { "role": "assistant", "content": "string" } }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0 }
}
```

## Translation Prompt Contracts

### Shared Requirements (apply to all modes)

所有 prompt 必须包含以下翻译要求：

1. **重写而非翻译**：用自然流畅的中文重写，仿佛优秀的中文母语写作者从零撰写
2. **准确性优先**：事实、数据和逻辑与原文完全一致
3. **文化注释**：对中文读者不熟悉的外国品牌、平台、机构、文化概念，首次出现时用括号加注解释。例如：`Deliveroo（英国外卖平台）`、`Ocado（英国杂货配送平台）`、`Blue Labour（英国左翼政治派别）`、`Extinction Rebellion（英国环保运动组织）`
4. **术语一致**：关键术语全文统一翻译，首次出现时括号标注原文
5. **保留格式**：保留所有 markdown 格式（标题、加粗、斜体、图片、链接、代码块、脚注）
6. **口语化表达**：优先使用生动的中文口语而非书面语，保留原文的幽默感和自嘲语气

### Quick Mode — Translation Prompt

```
System: 你是一位专业的英中翻译专家。将以下英文文章翻译为中文。

翻译要求：
- 信达雅，译文自然流畅，读起来像中文原创
- 对中文读者不熟悉的外国品牌、平台、机构，首次出现时用括号加注解释（如：Deliveroo（英国外卖平台））
- 关键术语全文统一翻译
- 保留所有 markdown 格式
- 优先使用生动的中文口语，保留原文幽默感

直接输出翻译后的中文文章。

User: [文章文本]
```

### Normal Mode — Analysis Prompt

```
System: 分析以下英文文章，返回 JSON 对象：
{
  "domain": "文章领域",
  "glossary": [{"term": "英文术语", "translation": "中文翻译", "note": "使用说明"}],
  "culturalNotes": [{"term": "英文术语/品牌名", "explanation": "对中文读者的简要解释"}],
  "difficulties": ["翻译难点1", "翻译难点2"],
  "summary": "文章摘要"
}

要求：
1. glossary 包含所有需要统一翻译的关键术语
2. culturalNotes 列出所有中文读者可能不熟悉的外国品牌、平台、机构、文化概念，附简要解释
3. difficulties 列出翻译中的主要挑战

User: [完整文章文本]
```

### Normal/Refined Mode — Translation Prompt (with context)

```
System: 你是一位专业的英中翻译专家。基于以下分析上下文翻译文章。

文章领域：{domain}
术语表：{glossary}
文化注释：{culturalNotes}
翻译难点：{difficulties}

翻译要求：
- 信达雅，译文自然流畅，读起来像中文原创
- 对中文读者不熟悉的外国品牌、平台、机构，按 culturalNotes 中的解释，首次出现时用括号加注
- 术语翻译与术语表一致
- 保留所有 markdown 格式
- 优先使用生动的中文口语，保留原文幽默感

返回 JSON 数组，每个元素为对应段落的中文翻译。

User: [批次段落数组 JSON]
```

### Refined Mode — Review Prompt

```
System: 你是一位资深翻译审校专家。审校以下中英对照翻译，检查：
1. 翻译准确性（有无漏译、误译）
2. 术语一致性
3. 文化注释是否完整（外国品牌/平台/机构首次出现是否都有括号解释）
4. 翻译腔（是否存在欧化句式、不自然的表达）
5. 语句通顺度和幽默感传达

对每段返回审校后的最终译文（JSON 数组）。
如有修改，在译文自然流畅的前提下保留修改。

User: [{ "original": "英文原文", "translated": "中文译文" }, ...]
```

### Refined Mode — Polish Prompt

```
System: 你是一位中文润色专家。对以下译文进行最终润色：
1. 消除翻译腔，确保读起来像中文原创
2. 检查所有外国品牌/平台/机构首次出现时有括号解释
3. 提升文学性和可读性
4. 确保术语准确且一致
5. 保留原文幽默感和自嘲语气

返回润色后的 JSON 数组。

User: [审校后的译文数组]
```
