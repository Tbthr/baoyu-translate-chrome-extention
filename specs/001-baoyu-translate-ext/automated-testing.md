# Automated Testing Guide

## chrome-devtools-mcp 能力矩阵

chrome-devtools-mcp 通过 Chrome DevTools Protocol (CDP) 连接到已运行的 Chrome 浏览器，提供以下能力：

| 工具 | 用途 | 测试场景 |
|------|------|----------|
| `list_pages` | 列出所有标签页 | 查找扩展页面、文章页面 |
| `new_page` | 新建标签页 | 打开文章、打开 Popup |
| `navigate_page` | 导航到 URL | 加载测试文章 |
| `select_page` | 切换标签页 | 在文章页和 Popup 间切换 |
| `close_page` | 关闭标签页 | 清理测试环境 |
| `take_screenshot` | 截图 | 捕获 Popup UI、翻译结果页面 |
| `take_snapshot` | DOM 快照 | 验证翻译注入的 DOM 结构 |
| `click` | 点击元素 | 点击翻译按钮、切换模式 |
| `fill` | 填充输入框 | 填写 API Key、Base URL |
| `fill_form` | 批量填充表单 | 一次性填写所有配置 |
| `hover` | 悬停元素 | 触发 Tooltip 显示 |
| `press_key` | 按键操作 | 模拟键盘交互 |
| `evaluate_script` | 执行 JavaScript | 提取翻译结果、触发操作、重载扩展 |
| `wait_for` | 等待条件 | 等待翻译完成、等待元素出现 |
| `list_console_messages` | 获取控制台日志 | 检查错误日志、调试信息 |
| `get_console_message` | 获取特定日志 | 精确定位错误 |
| `list_network_requests` | 列出网络请求 | 验证 API 调用是否正确 |
| `get_network_request` | 获取请求详情 | 检查 API 请求/响应内容 |
| `resize_page` | 调整视口大小 | 模拟 Popup 尺寸 (320px 宽) |
| `emulate` | 设备模拟 | 测试不同设备下的显示效果 |

---

## 1. 怎么加载插件

chrome-devtools-mcp 连接到已运行的 Chrome 实例，**无法通过 CDP 直接加载未打包的扩展**。加载方式：

### 首次加载（手动）

```bash
# 1. 构建扩展
npm run build

# 2. 在 Chrome 中手动加载
#    chrome://extensions → 开启"开发者模式" → "加载已解压的扩展程序" → 选择 dist/ 目录
```

### 自动化加载（推荐）

启动 Chrome 时通过命令行参数自动加载扩展：

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --load-extension="$(pwd)/dist" \
  --enable-unsafe-extension-debugging
```

`--enable-unsafe-extension-debugging` 允许 CDP 访问扩展的 Service Worker，便于调试。

### 验证加载成功

通过 chrome-devtools-mcp 验证：

```
# 1. 列出所有标签页，检查是否有扩展相关页面
list_pages

# 2. 在任意页面执行脚本，检查扩展是否可用
evaluate_script: chrome.runtime.sendMessage(chrome.runtime.id, {type: 'PING'})
```

---

## 2. 代码更新后怎么更新插件

### 方式一：通过 chrome-devtools-mcp 自动重载

```bash
# 1. 重新构建
npm run build

# 2. 通过 evaluate_script 触发扩展重载
# 在扩展的 Service Worker 上下文中执行：
evaluate_script: chrome.runtime.reload()
```

**注意**：`chrome.runtime.reload()` 需要在扩展上下文中执行。如果当前页面有 content script 注入，可以通过 content script 转发重载请求。

### 方式二：导航到 chrome://extensions 点击重载

```
# 仅当 Chrome 启动时带有 --enable-unsafe-extension-debugging 标志时可用
navigate_page: chrome://extensions
take_snapshot  # 获取页面结构，找到重载按钮
click: [重载按钮选择器]
```

### 方式三：在 Service Worker 中暴露重载端点（推荐用于开发阶段）

在 `service-worker.ts` 中添加：

```typescript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RELOAD_EXTENSION') {
    chrome.runtime.reload();
    sendResponse({ ok: true });
  }
});
```

然后通过 chrome-devtools-mcp：

```
navigate_page: chrome-extension://<extension-id>/popup.html
evaluate_script: chrome.runtime.sendMessage({type: 'RELOAD_EXTENSION'})
```

---

## 3. 怎么自动触发 Popup 并点击翻译按钮

Chrome 扩展的 Popup 无法通过 CDP 的 `browser_action` 协议直接弹出，但可以通过以下方式模拟：

### 方式 A：直接打开 Popup 页面 URL（推荐）

```
# 1. 获取扩展 ID（首次需要手动查看 chrome://extensions）
# 2. 新建标签页并导航到 Popup HTML
new_page
navigate_page: chrome-extension://<extension-id>/popup.html

# 3. 调整为 Popup 尺寸
resize_page: width=320, height=500

# 4. 截图验证 UI
take_screenshot

# 5. 确认已选择正确的翻译模式（如"普通"）
take_snapshot  # 找到模式按钮选择器
click: [普通模式按钮选择器]

# 6. 点击翻译按钮
click: [翻译按钮选择器]
```

**注意**：直接打开 Popup URL 时，`chrome.tabs.query({active: true})` 返回的是 popup 自身的标签页，而非目标文章页面。需要在代码中处理这种情况，或通过 URL 参数传入目标标签页 ID。

### 方式 B：通过 evaluate_script 直接触发翻译

不依赖 Popup UI，直接通过消息触发翻译：

```
# 1. 在目标文章页面注入翻译命令
navigate_page: https://takes.jamesomalley.co.uk/p/this-might-be-oversharing
evaluate_script: chrome.runtime.sendMessage(chrome.runtime.id, {type: 'START_TRANSLATION', payload: {mode: 'normal'}})

# 2. 等待翻译完成
wait_for: [翻译完成指示器选择器]

# 3. 截图验证结果
take_screenshot
```

### 方式 C：完整 Popup UI 交互测试

```
# 1. 打开文章页面
new_page
navigate_page: https://takes.jamesomalley.co.uk/p/this-might-be-oversharing

# 2. 记录文章页面 ID
list_pages  # 记下文章页面的 ID

# 3. 打开 Popup 页面
new_page
navigate_page: chrome-extension://<extension-id>/popup.html?tabId=<文章页面ID>
resize_page: width=320, height=500

# 4. 截图 Popup UI
take_screenshot

# 5. 切换翻译模式
click: [模式按钮]
take_screenshot  # 验证模式切换效果

# 6. 悬停模式按钮验证 Tooltip
hover: [模式按钮]
wait_for: .tooltip  # 等待 Tooltip 出现
take_screenshot  # 捕获 Tooltip

# 7. 点击翻译
click: [翻译按钮]

# 8. 切回文章页面等待翻译结果
select_page: <文章页面ID>
wait_for: .bt-translation  # 等待译文注入
take_screenshot  # 捕获翻译结果
```

---

## 4. 怎么捕获插件 UI 界面以对比设计

### Popup UI 截图对比

```
# 打开 Popup 并设置正确尺寸
navigate_page: chrome-extension://<extension-id>/popup.html
resize_page: width=320, height=500
take_screenshot  # 保存为 popup-default.png

# 测试各状态截图
# 状态1：下拉选择器打开
click: [Provider 选择器]
take_screenshot  # popup-dropdown-open.png

# 状态2：更多设置展开
click: [更多设置按钮]
take_screenshot  # popup-settings-expanded.png

# 状态3：API Key 明文显示
click: [小眼睛按钮]
take_screenshot  # popup-key-visible.png

# 状态4：模式 Tooltip 显示
hover: [快翻按钮]
wait_for: .tooltip
take_screenshot  # popup-tooltip-quick.png
```

### 翻译结果页面截图

```
# 在文章页面等待翻译完成
select_page: <文章页面ID>
wait_for: .bt-translation
take_screenshot  # 翻译结果完整页面

# 可以分段截图验证细节
evaluate_script: window.scrollTo(0, 500)
take_screenshot  # 翻译结果中间段落
```

### DOM 结构验证

```
# 获取翻译注入后的 DOM 快照
take_snapshot

# 提取所有翻译元素验证
evaluate_script: Array.from(document.querySelectorAll('.bt-translation')).map(el => ({
  text: el.textContent,
  style: getComputedStyle(el),
  borderColor: getComputedStyle(el).borderLeftColor,
  fontSize: getComputedStyle(el).fontSize
}))
```

### 视觉回归对比

将截图与 `design-preview.html` 的效果进行人工对比，或使用像素对比工具。

---

## 5. 怎么验证翻译质量

### 5.1 生成参考翻译（Ground Truth）

使用 baoyu-translate skill 的三种模式对测试文章生成参考翻译，保存到 `tests/reference/` 目录：

```
tests/reference/
├── article.md                  # 原始文章文本
├── quick/
│   └── 01-translation.md       # 快翻结果
├── normal/
│   ├── 01-analysis.md          # 分析结果
│   └── 02-translation.md       # 翻译结果
└── refined/
    ├── 01-analysis.md          # 分析结果
    ├── 02-translation.md       # 翻译初稿
    ├── 03-review.md            # 审校结果
    └── 04-polish.md            # 润色结果
```

### 5.2 提取插件翻译结果

```
# 在翻译完成的页面提取译文
evaluate_script: Array.from(document.querySelectorAll('.bt-translation')).map(el => el.textContent.trim()).join('\n\n')
```

### 5.3 术语一致性检查

```
# 提取所有术语的翻译，检查是否一致
evaluate_script: (() => {
  const translations = Array.from(document.querySelectorAll('.bt-translation')).map(el => el.textContent);
  const terms = ['community', 'skeptics', 'cosmopolitan', 'communitarian'];
  return terms.map(term => ({
    term,
    occurrences: translations.filter(t => t.includes(/* 对应的中文 */)).length
  }));
})()
```

### 5.4 代码块完整性验证

```
# 检查页面中的代码块是否未被修改
evaluate_script: (() => {
  const codeBlocks = document.querySelectorAll('pre, code');
  return Array.from(codeBlocks).map(el => ({
    preserved: true,
    text: el.textContent.substring(0, 100)
  }));
})()
```

### 5.5 控制台和网络监控

```
# 监控翻译过程中的网络请求
list_network_requests  # 检查 API 调用是否正确

# 检查控制台错误
list_console_messages  # 确保无 JS 错误
```

---

## 测试流程脚本

完整的自动化测试流程：

```
# === 准备阶段 ===
# 确保 Chrome 已启动并加载扩展
# 确保 ai-provider-test.txt 已配置

# === Step 1: 加载测试文章 ===
new_page
navigate_page: https://takes.jamesomalley.co.uk/p/this-might-be-oversharing
wait_for: article  # 等待文章加载

# === Step 2: 截图原始文章 ===
take_screenshot  # 保存: before-translation.png

# === Step 3: 打开 Popup ===
new_page
navigate_page: chrome-extension://<extension-id>/popup.html
resize_page: width=320, height=500
take_screenshot  # 保存: popup-initial.png

# === Step 4: 配置 Provider ===
click: [Provider 选择器]
click: [测试 Provider 选项]
fill: [API Key 输入框, sk-xxx]
take_screenshot  # 保存: popup-configured.png

# === Step 5: 选择翻译模式并翻译 ===
click: [普通模式按钮]
click: [翻译按钮]

# === Step 6: 切回文章页面等待结果 ===
select_page: <文章页面ID>
wait_for: .bt-translation  # 等待翻译注入
list_console_messages  # 检查无错误

# === Step 7: 截图翻译结果 ===
take_screenshot  # 保存: after-translation.png

# === Step 8: 提取翻译文本 ===
evaluate_script: /* 提取所有译文 */

# === Step 9: 验证 DOM 结构 ===
take_snapshot
evaluate_script: /* 检查样式、代码块完整性 */

# === Step 10: 网络请求检查 ===
list_network_requests  # 验证 API 调用正确
get_network_request: [翻译API请求ID]  # 检查请求体和响应
```
