# Baoyu Translate

> Chrome 浏览器翻译扩展，提供三级渐进式翻译模式

## 功能特性

- **三种翻译模式**：快翻 / 普通 / 精翻（含分析、审校、润色）
- **双语对照**：译文注入原文段落下方，灰色竖线标识
- **多 AI Provider 支持**：OpenAI、DeepSeek、Moonshot、Anthropic 及自定义
- **翻译缓存**：24 小时有效期，跨页面复用

## 翻译模式

| 模式 | 流程 | 适用场景 |
|------|------|---------|
| 快翻 | 翻译 | 日常阅读，快速获取大意 |
| 普通 | 分析 → 翻译 | 需要术语准确的正式文章 |
| 精翻 | 分析 → 翻译 → 审校 → 润色 | 重要文章，追求信达雅 |

## 技术栈

- TypeScript 5.x (strict) + Vite + Chrome Extension MV3
- 内容提取：defuddle
- 无前端框架，Popup 使用原生 TS + CSS（Anthropic 简约风格，320px 宽）

## 快速开始

```bash
node >= 18
npm install
npm run dev     # 开发模式（watch）
npm run build   # 生产构建
```

## 项目结构

```
src/
├── manifest.json            # Chrome Extension MV3 清单
├── popup/
│   ├── popup.html           # Popup 页面结构
│   ├── popup.ts             # Popup 交互逻辑
│   └── popup.css            # Popup 样式
├── content/
│   ├── content.ts           # Content Script 主入口
│   ├── extractor.ts         # 文章提取器
│   └── injector.ts          # 双语对照翻译注入器
├── background/
│   ├── service-worker.ts    # Service Worker 主入口
│   ├── translator.ts        # 三模式翻译引擎
│   ├── ai-adapter.ts        # OpenAI 兼容 API 适配器
│   ├── cache.ts             # 翻译缓存管理
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

## 开发

- 技术设计：[docs/architecture.md](docs/architecture.md)
- 测试指南：[docs/testing.md](docs/testing.md)
- 已知限制：[docs/known-limitations.md](docs/known-limitations.md)
