## Agent skills

### Issue tracker

Issues tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role label vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.

## Rules: Baoyu Translate Chrome Extension

### Build & Test

- 代码变更后测试前必须 `npm run build`，MCP 操作的是 `dist/` 产物
- 详见 `docs/testing.md` 了解自动化测试完整规范

### MV3 硬约束（不可违反）

- Service Worker ~5 分钟硬超时 —— 必须使用 port 保活 + 25 秒周期 Chrome API 调用
- `chrome.storage.sync` 上限 100KB —— 仅存用户配置，禁止存翻译数据
- `chrome.storage.local` 上限 10MB —— 翻译缓存和任务状态
- 不使用 `localStorage`（Service Worker 不可访问）

### 测试规则

- 用 `take_snapshot`（a11y 树）获取元素 uid，禁止猜测 uid
- 操作 popup 前必须 `resize_page: width=320, height=500`
- 等待翻译完成用 `wait_for`，禁止固定 `setTimeout`
- 禁止用 `take_screenshot` 替代 `take_snapshot` 做元素定位

### 代码规范

- TypeScript strict mode，无 any
- Popup 使用原生 TS + CSS，禁止引入前端框架
- 翻译注入使用兄弟元素方式（原文下方），保留原始页面布局
- AI API 统一使用 OpenAI 兼容 Chat Completions 格式，单一适配器

### 参考资料

- 技术设计与架构决策: `docs/architecture.md`
- 自动化测试指南: `docs/testing.md`
- 已知限制: `docs/known-limitations.md`
