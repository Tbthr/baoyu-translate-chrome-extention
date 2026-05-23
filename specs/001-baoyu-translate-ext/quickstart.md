# Quickstart: Baoyu Translate Chrome Extension

## Prerequisites

- Node.js 18+
- Chrome 浏览器（最新版本）
- 一个有效的 AI Provider API Key

## 开发环境搭建

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化，自动构建）
npm run dev

# 生产构建
npm run build
```

## 加载扩展到 Chrome

1. 运行 `npm run build` 生成 `dist/` 目录
2. 打开 Chrome → `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist/` 目录

## 项目结构

```
src/
├── manifest.json          # Chrome Extension 清单文件
├── popup/                 # Popup 页面
│   ├── popup.html
│   ├── popup.ts           # Popup 逻辑
│   └── popup.css          # Popup 样式（Anthropic 简约风格）
├── content/               # Content Script
│   ├── content.ts         # 内容提取 & 翻译注入
│   ├── extractor.ts       # Readability.js 文章提取
│   └── injector.ts        # 双语对照注入
├── background/            # Service Worker
│   ├── service-worker.ts  # 主入口
│   ├── translator.ts      # 翻译引擎（三模式）
│   ├── ai-adapter.ts      # OpenAI 兼容 API 适配器
│   ├── cache.ts           # 翻译缓存管理
│   └── keepalive.ts       # Service Worker 保活
├── shared/                # 共享模块
│   ├── types.ts           # TypeScript 类型定义
│   ├── messages.ts        # 消息类型定义
│   ├── constants.ts       # 常量（预设 Provider 等）
│   └── storage.ts         # Storage 封装
├── assets/                # 静态资源
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── lib/                   # 第三方库
    └── readability.js     # Mozilla Readability（打包内联）
```

## 配置测试 Provider

项目根目录下的 `ai-provider-test.txt` 包含预配置的测试 Provider 信息（已加入 `.gitignore`）。

格式：
```
base-url=https://api.xxx.com/v1
key=sk-xxxx
model=xxx-model
```

## 验收测试

使用 chrome-devtools-mcp 在 Chrome 浏览器中进行端到端测试。详见 spec.md 的 Testing & Verification 章节。
