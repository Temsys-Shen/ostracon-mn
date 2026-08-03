var __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon = (function () {
  function previewSelectedMarkdown(context, payload) {
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCards(context);
    const prefs = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadPrefs();
    const mergedPrefs = { ...prefs, ...(payload || {}) };
    const result = __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, mergedPrefs);

    if (context.addon) {
      context.addon._ostraconPreviewSnapshot = {
        result,
        prefs: mergedPrefs,
      };
    }

    return {
      markdown: result.markdown,
      noteCount: result.noteCount,
      fileBaseName: result.fileBaseName,
      warnings: result.warnings,
    };
  }

  function previewSelectedCanvas(context, payload) {
    var selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCards(context);
    var result = __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, payload || {});
    return {
      canvas: result.canvas,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      fileBaseName: result.fileBaseName,
    };
  }

  function normalizeScopeType(payload) {
    const scope = payload && payload.scope ? String(payload.scope) : "selection";
    if (scope === "notebook" || scope === "mindmap" || scope === "card-tree") return scope;
    return "selection";
  }

  function previewScopeMarkdown(context, payload) {
    const scope = normalizeScopeType(payload);
    const scopeResult = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getScopeSelection(context, scope, payload || {});
    const prefs = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadPrefs();
    const mergedPrefs = { ...prefs, ...(payload && payload.options ? payload.options : payload || {}) };
    mergedPrefs.cardTitlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(mergedPrefs.cardTitlePolicy);
    const result = __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(scopeResult.selection, mergedPrefs);
    return {
      scope,
      scopeId: scopeResult.id,
      scopeTitle: scopeResult.title,
      markdown: result.markdown,
      noteCount: result.noteCount,
      fileBaseName: result.fileBaseName,
      warnings: result.warnings,
    };
  }

  function previewScopeCanvas(context, payload) {
    const scope = normalizeScopeType(payload);
    const scopeResult = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getScopeSelection(context, scope, payload || {});
    const options = { ...(payload && payload.options ? payload.options : {}), ...(payload || {}) };
    options.cardTitlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(options.cardTitlePolicy);
    const result = __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(scopeResult.selection, options);
    return {
      scope,
      scopeId: scopeResult.id,
      scopeTitle: scopeResult.title,
      canvas: result.canvas,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      fileBaseName: result.fileBaseName,
    };
  }

  function listScopeCards(context, payload) {
    const scope = normalizeScopeType(payload);
    const scopeResult = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getScopeSelection(context, scope, payload || {});
    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    return {
      scope,
      scopeId: scopeResult.id,
      scopeTitle: scopeResult.title,
      cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listScopeCards(context, scope, { ...(payload || {}), cardTitlePolicy: titlePolicy }),
    };
  }

  function fetchCards(context, payload) {
    const cardIds = payload && Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : [];
    if (cardIds.length === 0) {
      throw new Error("缺少要拉取的卡片");
    }

    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getCardsByIds(cardIds);
    const cards = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCardsByIds(context, cardIds, titlePolicy);
    const format = payload && payload.format === "canvas" ? "canvas" : "markdown";
    if (format === "canvas") {
      const canvas = __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, { cardTitlePolicy: titlePolicy });
      return {
        format,
        canvas: canvas.canvas,
        noteCount: canvas.nodeCount,
        fileBaseName: canvas.fileBaseName,
        cards,
      };
    }

    const prefs = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadPrefs();
    const options = {
      ...prefs,
      cardTemplate: payload && payload.cardTemplate,
      cardTitlePolicy: titlePolicy,
      includeBacklinks: payload && payload.includeBacklinks,
    };
    const result = __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, options);
    return {
      format,
      cards,
      markdown: result.markdown,
      noteCount: result.noteCount,
      fileBaseName: result.fileBaseName,
      warnings: result.warnings,
    };
  }

  function fetchCardBlocks(context, payload) {
    const cardIds = payload && Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : [];
    if (cardIds.length === 0) {
      throw new Error("缺少要拉取的卡片");
    }
    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getCardsByIds(cardIds);
    const flatCards = selection && selection.flatCards ? selection.flatCards : [];
    const note = flatCards.length > 0 && flatCards[0].note ? flatCards[0].note : null;
    if (!note) throw new Error("未找到卡片");
    return __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.buildCardBlocks(note, titlePolicy);
  }

  return { previewSelectedMarkdown, previewSelectedCanvas, previewScopeMarkdown, previewScopeCanvas, listScopeCards, fetchCards, fetchCardBlocks };
})();
