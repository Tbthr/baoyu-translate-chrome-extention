# Known Limitations

## Content Extraction

使用 [defuddle](https://github.com/kepano/defuddle) 解析网页正文内容。以下类型的网站暂不支持：

### 不支持的网站结构

| 类型 | 示例 | 原因 |
|------|------|------|
| 老式 HTML（`<br>` + `<font>` 排版） | paulgraham.com | 整篇文章在一个 `<td>` 内，无 `<p>` 等段落元素，defuddle 无法拆分为独立段落 |
| 重度 JS 渲染的 SPA | 部分 React/Vue SPA | defuddle 依赖 DOM 结构，JS 未执行完时可能提取不到内容 |
| 付费墙内容 | astralcodexten.com（付费文章） | 内容被 JS 动态隐藏，DOM 中无完整文本 |
| 交互式/多媒体为主 | YouTube、Twitter | 非文章类页面，无正文可提取 |

### 后续优化方向

- [ ] 对 `<br>` 分隔的文本，在 DOM 中重构为 `<p>` 元素后再提取
- [ ] 支持自定义内容选择器（用户手动指定正文区域）
- [ ] 增加对 Wikipedia 等结构化百科页面的专项优化（过滤导航/侧边栏）
