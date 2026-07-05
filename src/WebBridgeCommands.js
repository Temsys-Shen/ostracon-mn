var __MN_WEB_BRIDGE_COMMANDS_MNOstraconAddon = (function () {
  const PREFS_KEY = "mn_ostracon_markdown_prefs";
  const WS_SETTINGS_KEY = "mn_ostracon_ws_settings";
  const CARD_CACHE_KEY = "mn_ostracon_card_cache";
  const SYNCED_CARDS_KEY = "mn_ostracon_synced_cards";

  function prefsStore() {
    return NSUserDefaults.standardUserDefaults();
  }

  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function loadPrefs() {
    const stored = prefsStore().objectForKey(PREFS_KEY);
    if (stored && typeof stored === "object") {
      return {
        mode: stored.mode === "tree" ? "tree" : "flat",
        excerptStyle: stored.excerptStyle === "plain" ? "plain" : "quote",
        includeImages: stored.includeImages !== false,
      };
    }
    return __MN_OSTRACON_UTILS_MNOstraconAddon.DEFAULT_MD_OPTIONS;
  }

  function savePrefs(prefs) {
    const merged = { ...loadPrefs(), ...prefs };
    prefsStore().setObjectForKey(merged, PREFS_KEY);
    return merged;
  }

  function loadJsonObject(key, defaultValue) {
    const stored = prefsStore().objectForKey(key);
    if (!stored) return defaultValue;
    if (typeof stored === "string") {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("持久化数据格式不正确: " + key);
      }
      return parsed;
    }
    if (typeof stored === "object") return stored;
    throw new Error("持久化数据类型不正确: " + key);
  }

  function saveJsonObject(key, value) {
    if (!value || typeof value !== "object") {
      throw new Error("持久化数据必须是对象: " + key);
    }
    prefsStore().setObjectForKey(JSON.stringify(value), key);
    return value;
  }

  function normalizeWsSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      host: String(source.host || "127.0.0.1").trim() || "127.0.0.1",
      port: Number(source.port || 27123),
      token: String(source.token || "").trim(),
      autoReconnect: source.autoReconnect !== false,
      heartbeatIntervalMs: Math.max(5000, Number(source.heartbeatIntervalMs || 30000)),
      reconnectBaseDelayMs: Math.max(250, Number(source.reconnectBaseDelayMs || 1000)),
      reconnectMaxDelayMs: Math.max(1000, Number(source.reconnectMaxDelayMs || 30000)),
    };
  }

  function getWsSettings() {
    return normalizeWsSettings(loadJsonObject(WS_SETTINGS_KEY, {}));
  }

  function setWsSettings(context, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("连接设置参数缺失");
    }
    return saveJsonObject(WS_SETTINGS_KEY, normalizeWsSettings(payload));
  }

  function getSyncedCards() {
    return loadJsonObject(SYNCED_CARDS_KEY, { cards: {} });
  }

  function setSyncedCards(context, payload) {
    if (!payload || typeof payload !== "object") throw new Error("参数错误");
    return saveJsonObject(SYNCED_CARDS_KEY, payload);
  }

  function syncCard(context, payload) {
    if (!payload || !payload.noteId) {
      throw new Error("缺少 noteId");
    }

    const note = Database.sharedInstance().getNoteById(payload.noteId);
    if (!note) {
      throw new Error("MN中未找到此卡片: " + payload.noteId);
    }

    const topicid = note.notebookId;
    UndoManager.sharedInstance().undoGrouping("Ostracon同步", topicid, function () {
      if (payload.title) note.noteTitle = payload.title;
      if (payload.excerpt) note.excerptText = payload.excerpt;
      if (payload.comment) {
        note.appendMarkdownComment(payload.comment);
      }
    });
    Application.sharedInstance().refreshAfterDBChanged(topicid);

    return { ok: true, noteId: payload.noteId, version: payload.version || 0 };
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

  function getCardVersionCache(context, payload) {
    return loadJsonObject(CARD_CACHE_KEY, { cards: {} });
  }

  function setCardVersionCache(context, payload) {
    if (!payload || typeof payload !== "object") throw new Error("参数错误");
    return saveJsonObject(CARD_CACHE_KEY, payload);
  }

  function computeContentHash(parts) {
    var raw = "";
    for (var i = 0; i < parts.length; i++) {
      raw += String(parts[i] || "") + "|";
    }
    var hash = 0;
    for (var i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function listNotebooks(context) {
    return {
      notebooks: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listAllNotebooks(context),
    };
  }

  function listCards(context, payload) {
    const notebookId = payload && payload.notebookId ? String(payload.notebookId) : "";
    if (!notebookId) {
      throw new Error("缺少 notebookId");
    }
    return {
      notebookId,
      cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listAllCards(context, notebookId),
    };
  }

  function fetchCards(context, payload) {
    const cardIds = payload && Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : [];
    if (cardIds.length === 0) {
      throw new Error("缺少要拉取的卡片");
    }

    const selected = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCardsInfo(context);
    const selectedIds = {};
    selected.noteIds.forEach(function (noteId) {
      selectedIds[String(noteId)] = true;
    });

    const missingIds = cardIds.filter(function (noteId) {
      return !selectedIds[noteId];
    });
    if (missingIds.length > 0) {
      throw new Error("只能拉取MN当前选中的卡片，请在MN里重新选择后刷新");
    }

    const cards = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCurrentCards(context).filter(function (card) {
      return selectedIds[String(card.id)];
    });
    const format = payload && payload.format === "canvas" ? "canvas" : "markdown";
    if (format === "canvas") {
      const canvas = previewSelectedCanvas(context, {});
      return {
        format,
        canvas: canvas.canvas,
        noteCount: canvas.nodeCount,
        fileBaseName: "ostracon-canvas",
        cards,
      };
    }

    const prefs = loadPrefs();
    return {
      format,
      cards,
      ...previewSelectedMarkdown(context, prefs),
    };
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
    getWsSettings,
    setWsSettings,
    getSyncedCards,
    setSyncedCards,
    previewSelectedMarkdown,
    previewSelectedCanvas,
    getSelectedCardsInfo,
    listNotebooks,
    listCards,
    fetchCards,
    syncCard,
    getCardVersionCache,
    setCardVersionCache,
  };

  return { commands };
})();
