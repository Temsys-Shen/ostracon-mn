var __MN_WEB_BRIDGE_COMMANDS_MNOstraconAddon = (function () {
  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function ping(context, payload) {
    return {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    };
  }

  function echo(context, payload) {
    return { echoed: toBridgePayload(payload) };
  }

  function closePanel(context, payload) {
    context.closePanel();
    return { closed: true, payload: toBridgePayload(payload) };
  }

  function discoverServers(context, payload) {
    // Discovery is now handled in the web layer via lanScan.js (fetch-based)
    return { ok: true, message: "discovery started" };
  }

  function syncNativeMiniState(context, payload) {
    if (payload && payload.connected !== true && context.controller._isMini) {
      context.controller.forceFullModeForDisconnected();
    }
    __MN_NATIVE_MINI_SURFACE_MNOstraconAddon.updateState(context.controller, payload);
    return { synced: true };
  }

  function syncNativeMiniFiles(context, payload) {
    __MN_NATIVE_MINI_SURFACE_MNOstraconAddon.updateFiles(context.controller, payload);
    return { synced: true };
  }

  const commands = {
    ping,
    echo,
    closePanel,
    discoverServers,
    syncNativeMiniState,
    syncNativeMiniFiles,
    openMarginNoteUrl: __MN_MARGIN_NOTE_URL_SERVICE_MNOstraconAddon.open,
    getMarkdownPreferences: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getMarkdownPreferences,
    setMarkdownPreferences: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setMarkdownPreferences,
    getWsSettings: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getWsSettings,
    setWsSettings: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setWsSettings,
    getClientId: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getClientId,
    setClientId: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setClientId,
    getSelectedCardsInfo: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getSelectedCardsInfo,
    listNotebooks: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.listNotebooks,
    listCards: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.listCards,
    previewSelectedMarkdown: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewSelectedMarkdown,
    previewSelectedCanvas: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewSelectedCanvas,
    previewScopeMarkdown: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewScopeMarkdown,
    previewScopeCanvas: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewScopeCanvas,
    listScopeCards: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.listScopeCards,
    fetchCards: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.fetchCards,
    fetchCardBlocks: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.fetchCardBlocks,
    listComments: __MN_COMMENT_UPDATE_SERVICE_MNOstraconAddon.listComments,
    updateComment: __MN_COMMENT_UPDATE_SERVICE_MNOstraconAddon.updateComment,
    appendComment: __MN_COMMENT_UPDATE_SERVICE_MNOstraconAddon.appendComment,
    createChildCard: __MN_COMMENT_UPDATE_SERVICE_MNOstraconAddon.createChildCard,
    getQuoteSelection: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.getQuoteSelection,
    getQuoteSelectionPreview: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.getQuoteSelectionPreview,
    getQuoteRootState: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.getQuoteRootState,
    selectQuoteRootFromCurrentSelection: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.selectQuoteRootFromCurrentSelection,
    clearQuoteRoot: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.clearQuoteRoot,
    startContinuousQuoteSession: __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.startSession,
    addContinuousQuoteSelection: __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.addSelection,
    cancelContinuousQuoteSession: __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.cancelSession,
    finishContinuousQuoteSession: __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.finishSession,
    getContinuousQuoteSessionState: __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.getState,
    getCiteKeyMapping: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getCiteKeyMapping,
    setCiteKeyMapping: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setCiteKeyMapping,
    getCurrentDocumentInfo: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getCurrentDocumentInfo,
    inspectCurrentDocument: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.inspectCurrentDocument,
    getObsidianInsertContext: __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon.getInsertContext,
    createObsidianImportSession: __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon.createSession,
    appendObsidianImportChunk: __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon.appendChunk,
    finalizeObsidianImport: __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon.finalize,
    abortObsidianImport: __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon.abort,
    createObsidianPdfImportSession: __MN_OBSIDIAN_PDF_IMPORT_SERVICE_MNOstraconAddon.createSession,
    appendObsidianPdfImportChunk: __MN_OBSIDIAN_PDF_IMPORT_SERVICE_MNOstraconAddon.appendChunk,
    finalizeObsidianPdfImport: __MN_OBSIDIAN_PDF_IMPORT_SERVICE_MNOstraconAddon.finalize,
    abortObsidianPdfImport: __MN_OBSIDIAN_PDF_IMPORT_SERVICE_MNOstraconAddon.abort,
  };

  return { commands };
})();
