# Automated Testing Guide

## MCP 配置

测试使用 `chrome-devtools-mcp`，配置在 `.mcp.json` 中。**必须使用 Chrome for Testing 149+**，因为只有 149+ 版本才支持 extension 相关的 tools（`install_extension`、`trigger_extension_action` 等）。

安装 Chrome for Testing：

```bash
npx @puppeteer/browsers install chrome@stable
```

二进制安装到 `chrome/` 目录（已 gitignore）。`.mcp.json` 中 `--executablePath` 指向该路径，`--categoryExtensions` 启用扩展相关工具。

## Rules

### 必须遵守

- 代码变更后必须 `npm run build` 再测试，MCP 操作的是 `dist/` 产物
- 用 `take_snapshot`（a11y 树）获取元素 uid，不要猜测 uid
- 页面内容变更后必须重新 `take_snapshot`，旧 uid 失效
- 操作 popup 前先 `resize_page: width=320, height=500` 模拟真实尺寸
- 等待翻译完成用 `wait_for`，不要用固定 `setTimeout`

### 禁止

- 不要用 `take_screenshot` 替代 `take_snapshot` 做元素定位（截图无 uid）
- 不要在未 `select_page` 的情况下跨页面操作
- 不要手动启动 Chrome 实例或通过 Bash 执行 `--remote-debugging-port`（由 MCP 管理）
- 不要直接读 `.heapsnapshot` 文件（过大），用 `memlab` 处理

## 扩展生命周期

### 安装

```
install_extension: path=$(pwd)/dist  →  获取 extension-id
list_extensions                       →  确认 "Baoyu Translate" Enabled
```

### 热重载（代码更新后）

```
npm run build
reload_extension: id=<extension-id>
```

### 清理

```
uninstall_extension: id=<extension-id>
```

## 交互测试流程

### 打开 Popup

用 `trigger_extension_action: id=<ext-id>` 打开 popup，它会自动注册为独立页面。

不要用 `new_page` + `navigate_page` 直接打开 `chrome-extension://.../popup.html`——这种方式 `chrome.tabs.query` 返回的是 popup 自身标签页而非目标文章页。

### 页面操作顺序

```
navigate_page / new_page    →  到达目标页面
wait_for                    →  确认内容加载
take_snapshot               →  获取 uid
click / fill / hover        →  通过 uid 交互
```

### 切换页面

```
list_pages    →  查看所有页面（含 Extension Pages 和 Service Workers）
select_page   →  切换到目标页面
```

### 翻译结果验证

```
# DOM 结构
take_snapshot

# 翻译文本（含中文验证）
evaluate_script: Array.from(document.querySelectorAll('.baoyu-translation')).map(el => el.textContent.trim())

# 网络请求（验证 API 调用正确性）
list_network_requests

# 控制台错误
list_console_messages
```

## Troubleshooting

MCP 工具调用失败时（`list_pages`、`new_page`、`navigate_page` 报错）：

1. 检查 `.mcp.json` 配置中 `--executablePath` 指向的 Chrome for Testing 二进制是否存在
2. 检查 `--categoryExtensions` 参数是否在 args 中
3. 杀掉残留 Chrome 进程后 `/mcp` 重连：`pkill -f "chrome-devtools-mcp"`
