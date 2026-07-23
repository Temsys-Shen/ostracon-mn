// 命令名常量。与 src/WebBridgeCommands.js 的注册表逐字对齐，防止前端改名漂移。
// 分两组：MN_* 走 MNBridge.send 调 MarginNote 原生；OB_* 走 ostraconWsClient.sendObsidianCommand 调 Obsidian。

export const MN_CMD = {
  // 连接 / 设置
  GET_WS_SETTINGS: "getWsSettings",
  SET_WS_SETTINGS: "setWsSettings",
  GET_CLIENT_ID: "getClientId",
  SET_CLIENT_ID: "setClientId",
  GET_MARKDOWN_PREFERENCES: "getMarkdownPreferences",
  SET_MARKDOWN_PREFERENCES: "setMarkdownPreferences",

  // 卡片选择 / 范围
  GET_SELECTED_CARDS_INFO: "getSelectedCardsInfo",
  PREVIEW_SCOPE_CANVAS: "previewScopeCanvas",
  PREVIEW_SCOPE_MARKDOWN: "previewScopeMarkdown",
  LIST_SCOPE_CARDS: "listScopeCards",

  // 笔记本 / 卡片列表
  LIST_NOTEBOOKS: "listNotebooks",
  LIST_CARDS: "listCards",
  FETCH_CARDS: "fetchCards",
  OPEN_MARGIN_NOTE_URL: "openMarginNoteUrl",

  // 引文
  GET_QUOTE_SELECTION: "getQuoteSelection",
  GET_QUOTE_SELECTION_PREVIEW: "getQuoteSelectionPreview",
  GET_QUOTE_ROOT_STATE: "getQuoteRootState",
  SELECT_QUOTE_ROOT: "selectQuoteRootFromCurrentSelection",
  CLEAR_QUOTE_ROOT: "clearQuoteRoot",

  // Obsidian 文档导入（markdown/html）
  GET_OBSIDIAN_INSERT_CONTEXT: "getObsidianInsertContext",
  CREATE_IMPORT_SESSION: "createObsidianImportSession",
  APPEND_IMPORT_CHUNK: "appendObsidianImportChunk",
  FINALIZE_IMPORT: "finalizeObsidianImport",
  ABORT_IMPORT: "abortObsidianImport",

  // Obsidian PDF 导入
  CREATE_PDF_IMPORT_SESSION: "createObsidianPdfImportSession",
  APPEND_PDF_IMPORT_CHUNK: "appendObsidianPdfImportChunk",
  FINALIZE_PDF_IMPORT: "finalizeObsidianPdfImport",
  ABORT_PDF_IMPORT: "abortObsidianPdfImport",
};

export const OB_CMD = {
  // 引文
  GET_QUOTE_CONTEXT: "getQuoteContext",
  INSERT_QUOTE: "insertQuote",

  // Vault 浏览
  GET_VAULT_BROWSER_STATE: "getVaultBrowserState",
  LIST_VAULT_FOLDER: "listVaultFolder",
  LIST_VAULT_TAGS: "listVaultTags",
  LIST_VAULT_DOCUMENTS: "listVaultDocuments",
  SEARCH_VAULT_DOCUMENTS: "searchVaultDocuments",
  GET_VAULT_DOCUMENT: "getVaultDocument",
  GET_VAULT_ASSET: "getVaultAsset",
  CREATE_VAULT_DOCUMENT_PDF_EXPORT: "createVaultDocumentPdfExport",
  READ_VAULT_DOCUMENT_PDF_CHUNK: "readVaultDocumentPdfChunk",
  RELEASE_VAULT_DOCUMENT_PDF_EXPORT: "releaseVaultDocumentPdfExport",
};
