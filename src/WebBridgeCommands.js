var __MN_WEB_BRIDGE_COMMANDS_MNOstraconAddon = (function () {
  const PREFS_KEY = "mn_ostracon_markdown_prefs";

  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function loadPrefs() {
    const stored = NSUserDefaults.standardUserDefaults().objectForKey(PREFS_KEY);
    if (stored && typeof stored === "object") {
      return {
        mode: stored.mode === "tree" ? "tree" : "flat",
        excerptStyle: stored.excerptStyle === "plain" ? "plain" : "quote",
        includeImages: stored.includeImages !== false,
      };
    }
    return { mode: "flat", excerptStyle: "quote", includeImages: true };
  }

  function savePrefs(prefs) {
    const merged = { ...loadPrefs(), ...prefs };
    NSUserDefaults.standardUserDefaults().setObjectForKey(merged, PREFS_KEY);
    return merged;
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
    context.closePanel(context.controller);
    return { closed: true, payload: toBridgePayload(payload) };
  }

  function getMarkdownPreferences() {
    return loadPrefs();
  }

  function setMarkdownPreferences(context, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("偏好设置参数缺失");
    }
    return savePrefs(payload);
  }

  function previewSelectedMarkdown(context, payload) {
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCards(context);
    const prefs = loadPrefs();
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

  function getSelectedCardsInfo(context) {
    return __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCardsInfo(context);
  }

  function previewSelectedCanvas(context, payload) {
    var selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCards(context);
    var result = __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, payload || {});
    return {
      canvas: result.canvas,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
    };
  }

  const commands = {
    ping,
    echo,
    closePanel,
    getMarkdownPreferences,
    setMarkdownPreferences,
    previewSelectedMarkdown,
    previewSelectedCanvas,
    getSelectedCardsInfo,
  };

  return { commands };
})();
