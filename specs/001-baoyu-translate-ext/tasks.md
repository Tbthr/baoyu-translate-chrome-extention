# Tasks: Baoyu Translate Chrome Extension

**Input**: Design documents from `/specs/001-baoyu-translate-ext/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/message-protocol.md

**Tests**: 验收测试通过 chrome-devtools-mcp 端到端执行，不包含单元测试任务

**Organization**: Tasks grouped by user story (US4 配置 → US1 快翻 → US2 普通 → US3 精翻)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Project Initialization)

**Purpose**: 创建项目基础结构和构建配置

- [X] T001 Create project scaffolding: package.json, tsconfig.json, vite.config.ts (multi-entry build for popup/content/background), and directory structure per plan.md
- [X] T002 Create Chrome Extension manifest.json (MV3) in src/manifest.json with permissions (activeTab, storage, scripting), content_scripts registration, service_worker entry, and action default_popup
- [X] T003 [P] Create icon assets in src/assets/ (icon-16.png, icon-48.png, icon-128.png) — placeholder icons for development
- [X] T004 [P] Create .gitignore (node_modules, dist, ai-provider-test.txt) at project root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有 user story 共享的核心基础设施，MUST 完成后才能开始任何 user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create shared TypeScript types in src/shared/types.ts — ProviderConfig, TranslationMode, TranslationTask, TaskStatus, TranslationStep, AnalysisResult, GlossaryEntry, CulturalNote, ParagraphTranslation, TranslationCache, ErrorInfo per data-model.md
- [X] T006 [P] Create message type constants in src/shared/messages.ts — all message types from contracts/message-protocol.md (START_TRANSLATION, GET_TASK_STATUS, CONTENT_READY, TRANSLATION_PROGRESS, INJECT_TRANSLATION, etc.)
- [X] T007 [P] Create preset provider constants in src/shared/constants.ts — PRESET_PROVIDERS array (OpenAI, DeepSeek, Moonshot, Anthropic, custom) with id, name, baseUrl, model, color per data-model.md
- [X] T008 [P] Create chrome.storage wrapper in src/shared/storage.ts — get/set for sync (provider_config, last_mode, more_settings_open) and local (task_*, cache_*) storage with type-safe accessors
- [X] T009 Create AI adapter in src/background/ai-adapter.ts — OpenAI-compatible Chat Completions API client (POST {baseUrl}/chat/completions), implementing AIAdapter interface from contracts, with request/response types
- [X] T010 Create content extractor in src/content/extractor.ts — integrate Readability.js, clone document DOM, parse article, extract text paragraphs with DOM position mapping, skip code blocks
- [X] T011 Create translation injector in src/content/injector.ts — inject translated sibling elements below originals with inherited styling and left gray border, handle code block preservation
- [X] T012 [P] Create Service Worker keepalive in src/background/keepalive.ts — port-based keep-alive via chrome.runtime.onConnect, periodic Chrome API call (~25s) fallback per research.md R-001
- [X] T013 [P] Create translation cache manager in src/background/cache.ts — cache CRUD by URL hash, 24h TTL check, 20-entry max with oldest eviction, keyed by normalized page URL per data-model.md

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 4 - 配置 AI Provider (Priority: P1)

**Goal**: 用户能配置 AI Provider（选择预设或自定义），设置持久化到 chrome.storage.sync，API Key 支持明文/密文切换

**Independent Test**: 打开 Popup，切换不同预设 Provider 验证自动填充，输入 API Key，关闭重开 Popup 验证持久化，验证密文/明文切换

### Implementation for User Story 4

- [X] T014 [US4] Create Popup HTML structure in src/popup/popup.html — translation mode segmented control (快翻/普通/精翻), Provider dropdown with presets, collapsible "更多设置" section with Base URL / API Key / Model inputs, API Key eye toggle icon, translate button
- [X] T015 [P] [US4] Create Popup CSS in src/popup/popup.css — Anthropic minimal style per design-preview.html, 320px width, segmented control, dropdown, input fields, collapsible section transitions, tooltip styles
- [X] T016 [US4] Implement Popup TypeScript logic in src/popup/popup.ts — provider dropdown change handler (auto-fill baseUrl/model), API Key visibility toggle, save/load config via SW messages, remember last mode and settings-open state
- [X] T017 [US4] Implement Service Worker config message handlers in src/background/service-worker.ts — handle GET_PROVIDER_CONFIG, SAVE_PROVIDER_CONFIG, GET_LAST_MODE messages using storage.ts

**Checkpoint**: AI Provider 配置完成，用户可选择预设或自定义 Provider，设置跨设备同步

---

## Phase 4: User Story 1 - 快速翻译网页文章 (Priority: P1) 🎯 MVP

**Goal**: 用户点击翻译按钮后，页面原文段落下方出现中文译文，双语对照显示，悬浮指示器和 Badge 展示进度

**Independent Test**: 打开英文文章页面，配置 AI Provider，选择快翻模式点击翻译，验证译文注入页面、双语对照显示正确、悬浮指示器和 Badge 状态变化

### Implementation for User Story 1

- [X] T018 [US1] Implement Quick mode translation in src/background/translator.ts — single-pass translation using Quick Mode prompt from contracts, split long articles (>4000 words) into batches, return structured ParagraphTranslation[] results
- [X] T019 [US1] Implement content script main entry in src/content/content.ts — CONTENT_READY notification to SW, listen for INJECT_TRANSLATION messages, call extractor.ts then injector.ts, maintain port connection for keep-alive
- [X] T020 [US1] Implement SW Quick mode orchestration in src/background/service-worker.ts — handle START_TRANSLATION: create TranslationTask, extract content via content script, batch-translate via translator.ts, send INJECT_TRANSLATION to content script per batch, update task state to storage
- [X] T021 [US1] Implement floating progress indicator on page in src/content/injector.ts — inject fixed-position indicator (bottom-right) showing current step and batch progress, auto-dismiss on completion
- [X] T022 [US1] Implement toolbar Badge status updates in src/background/service-worker.ts — chrome.action.setBadgeText for status: "翻译中" during translation, "完成" on completion, clear on error
- [X] T023 [US1] Connect Popup translate button to translation flow in src/popup/popup.ts — send START_TRANSLATION to SW, show "翻译中" state, handle "已翻译" / "重新翻译" confirmation flow, query GET_TASK_STATUS for active tasks

**Checkpoint**: MVP 完成 — 快翻模式完整可用，用户能翻译英文文章并看到双语对照结果

---

## Phase 5: User Story 2 - 普通翻译（分析 + 翻译） (Priority: P2)

**Goal**: 普通模式先分析文章（领域、术语、难点），再基于分析结果分批翻译，译文术语一致

**Independent Test**: 选择普通模式翻译英文技术文章，验证悬浮指示器显示"正在分析"和"正在翻译"两个阶段，最终译文术语前后一致

### Implementation for User Story 2

- [X] T024 [US2] Implement analysis prompt and result parsing in src/background/translator.ts — Normal Mode Analysis Prompt from contracts, parse JSON response into AnalysisResult (domain, glossary, culturalNotes, difficulties, summary)
- [X] T025 [US2] Implement Normal mode batch translation with context in src/background/translator.ts — Translation Prompt with injected analysis context (domain, glossary, culturalNotes, difficulties) from contracts, structured paragraph batch processing
- [X] T026 [US2] Implement SW Normal mode orchestration in src/background/service-worker.ts — task state: pending → analyzing → translating → completed, show "正在分析..." then "正在翻译 1/N 批..." on floating indicator, pass analysis result to translation batches

**Checkpoint**: 普通模式可用 — 分析→翻译两步流程完成，术语翻译一致性提升

---

## Phase 6: User Story 3 - 精翻（四步精修流程） (Priority: P3)

**Goal**: 精翻模式执行完整四步流程（分析→翻译→审校→润色），初稿半透明显示，最终译文实化

**Independent Test**: 选择精翻模式翻译英文文章，验证四个步骤依次执行，初稿以半透明出现，最终译文变为正常样式

### Implementation for User Story 3

- [X] T027 [US3] Implement review prompt in src/background/translator.ts — Refined Mode Review Prompt from contracts, accept original+translated pairs, return reviewed translations as JSON array; estimate total token count before sending, if exceeds model context limit (default 8K output tokens) split into batches of ~50 paragraphs per review call while maintaining cross-batch glossary context
- [X] T028 [US3] Implement polish prompt in src/background/translator.ts — Refined Mode Polish Prompt from contracts, accept reviewed translations, return polished final translations as JSON array; apply same token-limit batching strategy as T027 for long articles
- [X] T029 [US3] Implement SW Refined mode orchestration in src/background/service-worker.ts — full 4-step flow: pending → analyzing → translating → reviewing → polishing → completed, send REVIEW_UPDATE to content script after review/polish, update floating indicator for all four phases
- [X] T030 [US3] Implement semi-transparent draft injection in src/content/injector.ts — initial translation drafts rendered with opacity: 0.6, replaced with full-opacity final translations after review/polish without layout shift

**Checkpoint**: 精翻模式可用 — 四步流程完整执行，初稿→最终译文平滑过渡

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨 user story 的健壮性、边界情况和体验优化

- [X] T031 Implement retry mechanism with mode-specific limits in src/background/translator.ts — Quick/Normal: 2 retries, Refined: 3 retries, exponential backoff, on final failure pause task and inject error banner
- [X] T032 [P] Implement error banner injection on page in src/content/injector.ts — inject error banner with action buttons (重试 / 切换模式 / 取消) that communicate user choice back to SW via RETRY_TRANSLATION / CANCEL_TRANSLATION messages from contracts
- [X] T033 Implement SW CANCEL_TRANSLATION and RETRY_TRANSLATION message handlers in src/background/service-worker.ts — CANCEL clears task state and stops translation, RETRY resumes from last checkpoint using persisted TranslationTask state; wire up with error banner actions from T032
- [X] T034 [P] Implement non-article page detection in src/content/extractor.ts — detect when Readability fails to extract content, show "无法识别页面正文内容" message, disable translate button via Popup state query
- [X] T035 Implement re-translate confirmation flow in src/popup/popup.html and src/popup/popup.ts — detect cached/active translation via GET_TASK_STATUS, show "已翻译" state with grayed "重新翻译" button requiring confirmation click
- [X] T036 Implement Service Worker crash recovery in src/background/service-worker.ts — persist TranslationTask state to chrome.storage.local after each batch, on SW restart detect unfinished tasks and offer resume via port reconnection
- [X] T037 [P] Add mode tooltip descriptions in src/popup/popup.html and src/popup/popup.css — hover tooltips on segmented control explaining each mode's workflow and use case per spec FR-017
- [X] T038 Validate cache TTL and eviction in src/background/cache.ts — verify 24h expiry (86400000ms), enforce 20-entry max with timestamp-based eviction, handle cache hit on page load in content script

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US4 配置 (Phase 3)**: Depends on Foundational — must complete before US1 (translation needs provider config)
- **US1 快翻 (Phase 4)**: Depends on US4 — needs configured provider to translate
- **US2 普通 (Phase 5)**: Depends on US1 — extends Quick mode with analysis step
- **US3 精翻 (Phase 6)**: Depends on US2 — extends Normal mode with review/polish
- **Polish (Phase 7)**: Can start after US1, continues through US2/US3

### User Story Dependencies

- **US4 (P1)**: No story dependencies — can start after Foundational
- **US1 (P1)**: Depends on US4 (needs provider config to function)
- **US2 (P2)**: Depends on US1 (extends translator.ts Quick mode)
- **US3 (P3)**: Depends on US2 (extends translator.ts Normal mode)

### Within Each User Story

- Models/types before services
- Services before UI/orchestration
- Core implementation before integration
- Story complete and testable before moving to next

### Parallel Opportunities

- T003, T004 can run in parallel (assets, gitignore)
- T006, T007, T008 can run in parallel (messages, constants, storage)
- T012, T013 can run in parallel (keepalive, cache)
- T014, T015 can start in parallel (Popup HTML and CSS)
- T032, T034, T037 can run in parallel (error banner, detection, tooltips)
- US2 and US3 implementation cannot parallelize (sequential extensions)

---

## Parallel Example: Phase 2 Foundational

```bash
# After T005 (types), launch these together:
Task: "T006 Create message types in src/shared/messages.ts"
Task: "T007 Create preset provider constants in src/shared/constants.ts"
Task: "T008 Create storage wrapper in src/shared/storage.ts"

# Then launch these together:
Task: "T012 Create keepalive in src/background/keepalive.ts"
Task: "T013 Create cache manager in src/background/cache.ts"
```

## Parallel Example: Phase 7 Polish

```bash
# These can all run in parallel:
Task: "T032 Error banner injection in src/content/injector.ts"
Task: "T034 Non-article page detection in src/content/extractor.ts"
Task: "T037 Mode tooltip descriptions in src/popup/popup.html"
```

---

## Implementation Strategy

### MVP First (US4 + US1)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational (T005–T013)
3. Complete Phase 3: US4 配置 (T014–T017)
4. Complete Phase 4: US1 快翻 (T018–T023)
5. **STOP and VALIDATE**: 端到端测试快翻模式（chrome-devtools-mcp）
6. 可以发布 MVP 版本

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. + US4 配置 → Provider 配置可用
3. + US1 快翻 → MVP! 翻译功能完整
4. + US2 普通 → 分析增强翻译质量
5. + US3 精翻 → 四步精修最高质量
6. + Polish → 健壮性和边界情况处理

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4 (配置) 和 US1 (快翻) 都是 P1，但 US4 必须先完成（翻译依赖配置）
- translator.ts 和 service-worker.ts 随 user story 递增扩展
- 验收测试使用 chrome-devtools-mcp，参考 spec.md Testing & Verification 章节
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
