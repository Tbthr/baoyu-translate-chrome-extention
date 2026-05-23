# Implementation Plan: Baoyu Translate Chrome Extension

**Branch**: `001-baoyu-translate-ext` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-baoyu-translate-ext/spec.md`

## Summary

创建一个 Chrome 浏览器翻译扩展插件，基于 baoyu-translate skill 的三种翻译模式（快翻/普通/精翻）。使用 TypeScript + Vite 构建 Manifest V3 扩展，通过 OpenAI 兼容 API 调用 AI 服务，实现双语对照显示（译文注入到原文段落下方）。Content Script 使用 Readability.js 提取文章正文，Service Worker 管理翻译流程和状态，通过长连接保活机制确保翻译任务完成。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)

**Primary Dependencies**: Chrome Extension Manifest V3 APIs, Mozilla Readability.js, Vite (build tool)

**Storage**: `chrome.storage.sync`（用户配置，跨设备同步）、`chrome.storage.local`（翻译缓存和任务状态）

**Testing**: chrome-devtools-mcp 端到端验收测试

**Target Platform**: Chrome 浏览器扩展（Manifest V3）

**Project Type**: Chrome Extension (browser extension)

**Performance Goals**: 翻译质量（信达雅）为首要标准，不设时间限制；术语翻译一致性 95%+

**Constraints**: MV3 Service Worker ~5 分钟超时（需 keep-alive）；`chrome.storage.sync` 100KB 限制；`chrome.storage.local` 10MB 限制

**Scale/Scope**: 单用户浏览器插件，3 个翻译模式，4 个预设 AI Provider

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution 仍为模板状态（未定制），无特定约束需要检查。所有设计决策均基于 spec 要求和最佳实践。

**Status**: PASS — 无违规

## Project Structure

### Documentation (this feature)

```text
specs/001-baoyu-translate-ext/
├── plan.md              # This file
├── research.md          # Phase 0 output — 技术研究决策
├── data-model.md        # Phase 1 output — 数据模型定义
├── quickstart.md        # Phase 1 output — 开发快速开始
├── contracts/
│   └── message-protocol.md  # Phase 1 output — 内部消息协议
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
src/
├── manifest.json            # Chrome Extension MV3 清单
├── popup/
│   ├── popup.html           # Popup 页面结构
│   ├── popup.ts             # Popup 交互逻辑
│   └── popup.css            # Popup 样式（Anthropic 简约风格）
├── content/
│   ├── content.ts           # Content Script 主入口
│   ├── extractor.ts         # Readability.js 文章提取器
│   └── injector.ts          # 双语对照翻译注入器
├── background/
│   ├── service-worker.ts    # Service Worker 主入口
│   ├── translator.ts        # 三模式翻译引擎
│   ├── ai-adapter.ts        # OpenAI 兼容 API 适配器
│   ├── cache.ts             # 翻译缓存管理（24h TTL, 20条上限）
│   └── keepalive.ts         # Service Worker 保活机制
├── shared/
│   ├── types.ts             # TypeScript 类型定义
│   ├── messages.ts          # 消息类型常量
│   ├── constants.ts         # 预设 Provider 等常量
│   └── storage.ts           # chrome.storage 封装
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── lib/
    └── readability.js       # Mozilla Readability（内联打包）

dist/                        # Vite 构建输出（加载到 Chrome）
vite.config.ts               # Vite 配置（多入口构建）
tsconfig.json                # TypeScript 配置
package.json
```

**Structure Decision**: Chrome Extension 标准结构，按职责分为 popup / content / background / shared 四个模块。无框架依赖，Popup 使用原生 TypeScript + CSS 实现 Anthropic 简约风格。

## Complexity Tracking

无 Constitution 违规需要记录。
