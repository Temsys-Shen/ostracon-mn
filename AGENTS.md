# MarginNote 插件开发规则（AI 必读）

## 总则

- 本目录是 MarginNote 插件开发项目。除 `web/` 目录外，运行环境与前端 / Node 不同，不要按浏览器假设做实现。
- 保持谨慎：把每次输出当作“尝试”，先验证再扩展；优先小步改动、可回滚。

## 文档优先（强制）

- 若环境提供 mn-docs-mcp（MCP），改动前要用 `mndocs` 的 MCP 检索，并以文档为准；不要凭记忆猜 API 或副作用。如果发现没有该 MCP，可以提示用户安装 MCP，并按当前环境引导启动命令：`npx mn-docs-mcp`。
- MCP 不可用时，一定要阅读在线文档（优先 https://mn-docs.museday.top 站点）；仍不清楚就停止实现，并向用户索取官方文档片段、可运行示例、最小复现与期望行为。
- 开始编码前必须先查两篇：
  - JavaScript 原生环境（理解 JSCore 限制，如无 `fetch`、无 DOM 等）：https://mn-docs.museday.top/reference/js-runtime/
  - 全局与入口对象（Global Variables，理解 `JSB`、`self`、`Application`、`Database`、`Note` 等全局注入对象）：https://mn-docs.museday.top/reference/global/global-variables/

## 运行时与能力差异（不要按前端思维）

- 插件运行在 JavaScriptCore 环境：没有浏览器的 `window`、`document`、`fetch`、`localStorage`、`setTimeout`、`setInterval` 等。
- 网络请求不要用 `fetch`：按文档使用系统导出的网络 API（如 NSURLConnection 相关）与回调，响应体常见为 `NSData`。
- 环境无 Base64 解码等常用工具；涉及 `NSData` 转文本或 JSON 时，严格按文档做，不要自行臆断可用 API。

## 结构与加载规则（强制）

- `main.js` 只做入口与导入：只允许在 `main.js` 调用 `JSB.require(...)`，且只允许使用 `JSB.require(...)`，不得使用 `require` 或 `import`。`JSB.require(...)` 的引入进入全局作用域，作用于所有脚本。
- 不要在 `main.js` 里定义业务函数或方法；所有实现放到独立文件，再由 `main.js` 通过 `JSB.require(...)` 导入。
- 除 `main.js` 外，任何文件禁止调用 `JSB.require(...)`，避免重复或污染全局导入行为。
- 优先用 ES6 语法（除非与运行时不兼容）；保持文件职责单一，不要把 UI、数据、命令处理混在一起。
- MarginNote 插件共享同一全局上下文，所有可能暴露到全局的标识符必须使用插件级前缀，或放入 IIFE 闭包避免泄漏。

## 全局与入口对象要点（先查 Global Variables 页）

- 入口通常是 `JSB.newAddon=function(mainPath){...}`，并返回插件实例。
- `self` 仅在实例方法内可用，代表当前插件实例；不要在模块顶层假设 `self` 存在。
- 常用全局注入对象以文档为准：`JSB`、`Application`、`Database`、`Note`、`UndoManager` 等；不确定就先查文档再用。

## 需求澄清

- 当需求不清晰时先问清：触发入口（菜单、按钮、手势、命令）、作用场景（阅读器、学习界面、笔记）、数据来源（当前选区、当前卡片、数据库查询）与期望输出（UI、笔记、剪贴板、文件）等。
- 何为需求不清晰：
  1. 多解歧义：同一句话至少有 2 种合理实现方式，且会导致不同产物或不同用户体验（例如“导出笔记”为导出文本、Markdown、图片、文件都合理）。
  2. 用户的要求实现起来很有可能有问题
  3. 输入不完整：没给触发入口、作用场景、数据来源、期望输出、目标对象
  4. 查完文档仍然不能理清实现思路时

## 调试与验证

- 日志统一用 `console.log`，不要用 `JSB.log`。
- 构建无语法校验功能；改动后至少做一次人工检查（重新阅读代码）。

## Web 页面

- `web/` 目录下是 React 项目，通过 Vite 构建，作为面板嵌入 MarginNote。
- `web/` 里的代码运行在浏览器 WebView 环境中，可以使用 React、DOM、`window`、`document` 等前端能力；`src/` 里的插件代码运行在 JavaScriptCore 环境中，不要混用两边 API。
- 前端页面与插件层通过 bridge 通信，前端统一从 `web/src/lib/mnBridge.js` 引入 `MNBridge` 并调用 `MNBridge.send(command, payload)`。
- 新增 bridge 命令时：
  - 前端页面只负责按约定发送 `command`
  - 插件侧在 `src/WebBridgeCommands.js` 中添加同名命令函数
- 不要在前端页面里直接假设可以访问 MarginNote 原生对象，如 `Application`、`Database`、`Note`、`JSB`；这类能力只能在 `src/` 里的插件脚本中使用。
- 不要修改 `src/web-dist/`，而应当修改 `web/` 目录下的文件。

## Web 持久化规则（强制）

- WebView 前端不是业务数据真源；用户数据、插件配置、导入导出预设、API Key、任务/收藏/映射关系等持久化数据必须通过 bridge 交给 `src/` 插件层保存。
- 在 MarginNote WebView 中，`localStorage` 不能作为长期存储。它可能在某些加载方式下跨页面保留，但受 origin、文件路径、WebView 生命周期、插件更新或重装影响，不能承担长期可信的数据边界。
- `web/` 中禁止把业务数据写入 `localStorage`、`sessionStorage`、`indexedDB`、`CacheStorage` 或 Service Worker 缓存；这些最多用于可丢失的 UI 状态，如当前 tab、折叠状态、搜索草稿。
- 小型开关、面板显示状态、窗口 frame、最近模式优先用 `NSUserDefaults`，key 必须带插件级前缀。
- 结构化数据、列表、导出预设、用户生成内容优先保存到 `Application.sharedInstance().documentPath + "/<AddonId>/"` 下的 JSON 文件。
- 临时上传、分块传输、中间文件放到 `Application.sharedInstance().tempPath + "/<AddonId>/"`，完成后校验并移动到 `documentPath`。
- JSON 文件读写优先使用 `NSJSONSerialization` + `NSData.writeToFileAtomically(path, true)`；读取时处理空文件、非法 JSON、schema 版本迁移和默认值兜底。
- 写 `NSUserDefaults` 时不要传 `undefined`、`null`、函数、循环对象或未验证的 Native 对象；结构化小对象优先 `JSON.stringify` 后保存字符串，读取时 `JSON.parse` 兜底。
- 新增 Web 持久化需求时，先在 `src/WebBridgeCommands.js` 增加命令，再在插件侧存储模块实现读写，Web 侧只能调用 `MNBridge.send(command, payload)`。
- 如果历史版本已经使用 `localStorage` 保存业务数据，只允许做一次性迁移：读取 allowlist key，发 bridge 写入 Native，成功后清理旧 key；迁移后不得继续双写。
