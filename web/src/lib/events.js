// 全局事件名常量。集中定义，避免 src/ 与 web/src/ 双端硬编码漂移。
// src/ 端（QuoteSelectionService.js）因不是 ES module 无法 import，保留字符串字面量并加注释指向本文件。

// MN 端 SelectionChanged（NSNotification）→ WebView 的 CustomEvent
// 由 src/QuoteSelectionService.js handleSelectionChanged 派发
export const EVT_SELECTION_CHANGED = "ostracon:selection-changed";

// MN 端学习集关闭时清空引文根节点 → WebView 的 CustomEvent
// 由 src/QuoteSelectionService.js handleNotebookClose 派发
export const EVT_QUOTE_ROOT_CLEARED = "ostracon:quote-root-cleared";

// OB 端 active-leaf-change / file-open → WS event → MN 端 ostraconWsClient 转发为 window.CustomEvent
// 由 ostracon-ob/src/main.ts broadcastEvent 派发
export const EVT_QUOTE_CONTEXT_CHANGED = "ostracon:quote-context-changed";

// OB 端 vault 索引变化 → WS event（已存在，保留兼容）
export const EVT_VAULT_INDEX_CHANGED = "vaultIndexChanged";
