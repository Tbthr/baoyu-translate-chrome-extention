# Feature Specification: Baoyu Translate Chrome Extension

**Feature Branch**: `001-baoyu-translate-ext`

**Created**: 2026-05-24

**Status**: Draft

**Input**: User description: "基于 baoyu-translate skill 的思想创建一个浏览器插件，支持三种翻译模式（快翻/普通/精翻），支持自定义 AI Provider，双语对照显示，Anthropic 简约风格 UI，使用 chrome-devtools-mcp 进行测试验收"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 快速翻译网页文章 (Priority: P1)

用户在浏览英文文章/博客时，点击插件图标，选择"快翻"模式和 AI 服务，点击翻译按钮。页面中每个原文段落下立刻出现中文翻译，译文继承原文样式，左侧以灰色竖线标识。翻译完成后页面右下角悬浮指示器消失，工具栏图标 Badge 显示"完成"。

**Why this priority**: 最核心的翻译功能，是插件存在的基本价值。Quick 模式是最低门槛的使用方式，让用户最快体验到翻译效果。

**Independent Test**: 打开任意英文文章页面，配置 AI Provider 后选择快翻模式点击翻译，验证译文注入到页面、双语对照显示正确。

**Acceptance Scenarios**:

1. **Given** 用户在英文文章页面且已配置 AI Provider，**When** 点击插件图标 → 选择"快翻" → 点击"翻译"，**Then** 页面原文段落下方逐批出现中文译文，译文左侧有灰色竖线
2. **Given** 翻译正在进行中，**When** 用户关闭 Popup，**Then** 翻译继续执行，页面右下角显示悬浮进度指示器，工具栏 Badge 显示状态
3. **Given** 翻译已完成，**When** 用户重新打开 Popup，**Then** 翻译按钮显示"重新翻译"（灰色提示），用户需确认才能重新翻译

---

### User Story 2 - 普通翻译（分析 + 翻译） (Priority: P2)

用户选择"普通"模式翻译文章。插件先在后台分析整篇文章（领域、术语、翻译难点），然后基于分析结果分批翻译。悬浮指示器依次显示"正在分析..."→"正在翻译 1/N 批..."→"完成"。译文质量高于快翻，术语翻译更一致。

**Why this priority**: 普通模式是大多数场景的推荐模式，分析步骤显著提升翻译质量（信达雅），是区别于简单翻译工具的核心竞争力。

**Independent Test**: 选择普通模式翻译一篇中等长度的英文技术文章，验证悬浮指示器显示"正在分析"和"正在翻译"两个阶段，最终译文术语一致。

**Acceptance Scenarios**:

1. **Given** 用户选择"普通"模式，**When** 点击翻译，**Then** 悬浮指示器先显示"正在分析..."，完成后显示"正在翻译..."，译文分批注入页面
2. **Given** 普通模式翻译完成，**When** 用户查看译文，**Then** 术语翻译前后一致，翻译质量明显高于快翻模式

---

### User Story 3 - 精翻（四步精修流程） (Priority: P3)

用户选择"精翻"模式翻译重要文档。插件执行完整四步流程：分析 → 翻译（分批） → 全文审校 → 润色。翻译初稿先以半透明样式出现，审校润色完成后变为正常样式。悬浮指示器显示完整流程进度。

**Why this priority**: 精翻是最高质量的翻译模式，适合重要文档场景。相比普通模式增加了审校和润色步骤，但耗时更长。作为第三优先级，先确保基础翻译功能稳定。

**Independent Test**: 选择精翻模式翻译一篇英文文章，验证四个步骤依次执行，初稿以半透明出现，最终译文实化显示。

**Acceptance Scenarios**:

1. **Given** 用户选择"精翻"模式，**When** 点击翻译，**Then** 悬浮指示器依次显示"正在分析..."→"正在翻译..."→"正在审校..."→"正在润色..."
2. **Given** 翻译初稿完成，**When** 初稿注入页面，**Then** 译文以半透明样式显示
3. **Given** 润色步骤完成，**When** 最终译文替换初稿，**Then** 译文变为正常样式，不造成页面布局跳动

---

### User Story 4 - 配置 AI Provider (Priority: P1)

用户首次使用时需要配置 AI 服务。Popup 中通过下拉选择内置 Provider（OpenAI/DeepSeek/Moonshot/Anthropic），选择后自动填充 Base URL 和默认 Model。如需自定义，选择"自定义"选项后展开更多设置手动填写 Base URL、API Key、Model。API Key 输入框有小眼睛图标切换明文/密文显示。

**Why this priority**: 没有有效的 AI Provider 配置，翻译功能无法使用。与 P1 翻译功能同等重要。

**Independent Test**: 打开 Popup，切换不同 Provider，验证 Base URL 和 Model 自动填充，验证 API Key 明文/密文切换。

**Acceptance Scenarios**:

1. **Given** 用户打开 Popup，**When** 在下拉中选择"DeepSeek"，**Then** Base URL 自动填充为 DeepSeek 地址，Model 自动设为 deepseek-chat
2. **Given** 更多设置已展开，**When** 点击 API Key 旁的小眼睛图标，**Then** API Key 在明文和密文之间切换
3. **Given** 用户配置了 Provider 设置，**When** 关闭并重新打开 Popup，**Then** 所有设置已持久化（通过浏览器账号同步）

---

### Edge Cases

- 用户在非文章页面（如搜索引擎首页、纯代码页面）点击翻译时，提取不到正文内容，应提示"无法识别页面正文内容"
- 用户在翻译进行中再次点击翻译按钮时，应提示翻译正在进行
- 网页包含大量代码块时，代码块应完整保留不翻译，仅翻译正文段落
- 翻译过程中网络中断或 API 返回错误时，自动重试后仍失败则暂停并展示错误原因，由用户选择后续操作
- 长文章（超过 4000 词）触发分批翻译时，每批携带共享分析上下文确保术语一致性
- 用户访问已翻译过的页面（24h 内缓存有效），直接展示缓存结果
- 翻译缓存超过 20 条时，淘汰最早的缓存
- Service Worker 在翻译过程中被系统终止时，能从断点恢复继续翻译

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 插件 MUST 提供三种翻译模式：快翻（直接翻译）、普通（分析→翻译）、精翻（分析→翻译→审校→润色）
- **FR-002**: 插件 MUST 智能提取网页正文内容，排除导航、广告、侧边栏等非正文元素
- **FR-003**: 插件 MUST 将翻译结果注入到原文段落下方，译文继承原文样式，左侧以灰色竖线标识区分
- **FR-004**: 插件 MUST 支持用户自定义 AI Provider，包括 Base URL、API Key、Model 三个配置项
- **FR-005**: 插件 MUST 内置至少 4 个预设 Provider，选择后自动填充 Base URL 和默认 Model
- **FR-006**: 插件 MUST 将用户设置持久化到浏览器同步存储，支持跨设备同步
- **FR-007**: 翻译过程中 MUST 在页面右下角显示悬浮指示器，展示当前步骤和进度
- **FR-008**: 翻译过程中 MUST 在工具栏插件图标上显示 Badge 文字状态
- **FR-009**: 插件 MUST 对长文章进行分批翻译，每批携带全文分析上下文确保术语一致性
- **FR-010**: 精翻模式 MUST 对全文进行统一审校和润色，不分批处理
- **FR-011**: 精翻模式 MUST 先以半透明样式展示初稿，审校润色完成后变为正常样式
- **FR-012**: 翻译过程 MUST 通过 keep-alive 机制维持后台服务存活，并通过状态持久化支持断点续传
- **FR-013**: 插件 MUST 对翻译失败进行自动重试（快翻/普通 2 次，精翻 3 次递增间隔），重试耗尽后暂停并展示错误原因，由用户选择后续操作（重试/切换模式/取消）
- **FR-014**: 插件 MUST 保留代码块（含注释）原样不翻译，翻译正文段落、标题、列表项、引用块、表格内容、链接文本
- **FR-015**: 插件 MUST 按页面 URL 缓存翻译结果，24h 过期，最多 20 条，超过时淘汰最早的
- **FR-016**: 页面已翻译时，Popup MUST 显示"已翻译"状态，用户需确认"重新翻译"才能重新执行
- **FR-017**: Popup 翻译模式按钮 MUST 在悬浮时显示 Tooltip，说明该模式的处理流程和适用场景
- **FR-018**: API Key 输入框 MUST 提供明文/密文切换功能

### Key Entities

- **ProviderConfig**: AI 服务配置，包含 Base URL、API Key、Model；支持预设 Provider 和自定义配置
- **TranslationTask**: 一次翻译任务，包含源页面 URL、内容、翻译模式、当前步骤、中间结果
- **TranslationCache**: 翻译缓存条目，以页面 URL 为 key，包含翻译结果、时间戳、使用的模式和 Provider
- **TranslationProgress**: 翻译进度状态，包含当前步骤（分析/翻译/审校/润色）、批次进度、错误信息

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户能顺利完成 AI Provider 配置并启动首次翻译
- **SC-002**: 快翻模式翻译完成后，译文准确出现在页面原文段落下方
- **SC-003**: 普通模式和精翻模式的术语翻译前后一致性达到 95% 以上
- **SC-004**: 译文注入后不破坏原页面布局，不出现内容重叠或样式错乱
- **SC-005**: 翻译过程中关闭 Popup 后，翻译继续执行并完成，不影响最终结果
- **SC-006**: 翻译缓存命中时，已翻译页面直接展示译文，无需重新调用 API
- **SC-007**: 三种模式的翻译质量呈阶梯式提升，用户能感知到明显差异
- **SC-008**: 代码块在翻译前后完全一致，无任何字符变化

## Clarifications

### Session 2026-05-24

- Q: 成功标准是否应设置时间限制？ → A: 不设时间限制，翻译质量（信达雅）为首要标准，移除 SC-001/002/006 中的时间约束
- Q: 如何进行端到端验收测试？ → A: 使用 chrome-devtools-mcp@chrome-devtools-plugins 在 Chrome 浏览器中验证全部功能，新增 Testing & Verification 章节
- Q: 验收测试使用哪个 AI Provider？ → A: 使用项目根目录下的 `ai-provider-test.txt` 文件中预配置的测试 Provider（已加入 .gitignore，不提交到版本控制）

## Assumptions

- 用户使用 Chrome 浏览器，不兼容其他浏览器
- 目标语言固定为中文，不支持其他目标语言
- AI Provider 使用 OpenAI 兼容的 Chat Completions API 格式
- 翻译质量（信达雅）优先于翻译速度，验收不设时间限制
- 用户已有至少一个 AI Provider 的 API Key
- 翻译的源语言由 AI 自动检测
- 用户具有稳定的网络连接

## Testing & Verification

使用 chrome-devtools-mcp@chrome-devtools-plugins 在 Chrome 浏览器中进行端到端验收测试：

### 测试环境配置

验收测试使用项目根目录下的 `ai-provider-test.txt` 文件中预配置的 AI Provider（已加入 `.gitignore`，不提交到版本控制）。该文件包含 base-url、key、model 三个字段，开发时用于快速配置测试环境。

### 验收测试流程

1. **扩展加载**：在 Chrome 中加载未打包的扩展，验证扩展图标出现在工具栏
2. **Popup UI 交互**：
   - 验证三种翻译模式的 Segmented Control 切换
   - 悬浮模式按钮时验证 Tooltip 显示处理流程和适用场景
   - 验证 Provider 下拉选择和自动填充
   - 验证更多设置折叠/展开
   - 验证 API Key 明文/密文切换
3. **三种模式端到端翻译**：
   - 快翻模式：验证译文注入页面，双语对照显示正确
   - 普通模式：验证分析→翻译两步流程，悬浮指示器状态正确
   - 精翻模式：验证分析→翻译→审校→润色四步流程，初稿半透明→最终实化
4. **双语对照效果**：验证译文在原文下方、继承样式、左侧灰色竖线、代码块保留原样
5. **状态展示**：验证悬浮指示器进度和工具栏 Badge 状态变化
6. **错误处理**：模拟 API 错误，验证重试机制和用户选择（重试/切换模式/取消）
7. **缓存验证**：翻译同一页面后刷新，验证缓存命中直接展示
8. **重复翻译**：已翻译页面重新打开 Popup，验证"重新翻译"确认流程

### 验收重点

- 翻译质量（信达雅）为首要评判标准，不设时间限制
- 术语翻译一致性（同一术语全文使用相同中文翻译）
- 页面布局不被译文注入破坏
- 代码块在翻译前后完全一致
