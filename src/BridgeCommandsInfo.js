var __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon = (function () {
  const WS_SETTINGS_KEY = "mn_ostracon_ws_settings";

  function getWsSettings() {
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadJsonObject(WS_SETTINGS_KEY, {});
  }

  function setWsSettings(context, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("连接设置参数缺失");
    }
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.saveJsonObject(WS_SETTINGS_KEY, payload);
  }

  function getMarkdownPreferences() {
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadPrefs();
  }

  function setMarkdownPreferences(context, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("偏好设置参数缺失");
    }
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.savePrefs(payload);
  }

  function getSelectedCardsInfo(context) {
    return __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCardsInfo(context);
  }

  function listNotebooks(context) {
    return {
      notebooks: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listAllNotebooks(context),
    };
  }

  function listCards(context, payload) {
    const notebookId = payload && payload.notebookId ? String(payload.notebookId) : "";
    const cardIds = payload && Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : [];
    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    if (cardIds.length > 0) {
      return {
        notebookId: notebookId || "card-ids",
        cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCardsByIds(context, cardIds, titlePolicy),
      };
    }
    if (!notebookId) {
      throw new Error("缺少 notebookId");
    }
    if (notebookId === "current-selection") {
      return {
        notebookId,
        cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCurrentCards(context, titlePolicy),
      };
    }
    return {
      notebookId,
      cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listAllCards(context, notebookId, titlePolicy),
    };
  }

  const CLIENT_ID_KEY = "mn_ostracon_client_id";

  function getClientId() {
    const stored = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.prefsStore().objectForKey(CLIENT_ID_KEY);
    return stored && typeof stored === "string" ? stored : "";
  }

  function setClientId(context, payload) {
    const id = payload && payload.clientId ? String(payload.clientId) : "";
    if (!id) {
      throw new Error("clientId 不能为空");
    }
    __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.prefsStore().setObjectForKey(id, CLIENT_ID_KEY);
    return { clientId: id };
  }

  // ── 文档 citekey 映射（BibTeX 引用）────────────────────────────
  const CITE_KEY_MAPPINGS_KEY = "mn_ostracon_citekeys";

  // 结构: { [docMd5]: { citekey: string, pageOffset: number } }
  function getCiteKeyMappings() {
    const stored = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadJsonObject(CITE_KEY_MAPPINGS_KEY, {});
    return stored && typeof stored === "object" ? stored : {};
  }

  function getCiteKeyMappingForDoc(docMd5) {
    const mappings = getCiteKeyMappings();
    const entry = mappings[String(docMd5 || "")];
    if (!entry || typeof entry !== "object") return null;
    return {
      citekey: typeof entry.citekey === "string" ? entry.citekey : "",
      pageOffset: Number(entry.pageOffset) || 0,
    };
  }

  function getCiteKeyMapping(context, payload) {
    const docMd5 = payload && payload.docMd5 ? String(payload.docMd5) : "";
    if (!docMd5) return null;
    return getCiteKeyMappingForDoc(docMd5);
  }

  function setCiteKeyMapping(context, payload) {
    const docMd5 = payload && payload.docMd5 ? String(payload.docMd5) : "";
    if (!docMd5) throw new Error("缺少文档ID");
    const citekey = payload && payload.citekey ? String(payload.citekey).trim() : "";
    if (!citekey) throw new Error("citekey 不能为空");
    const rawOffset = payload && payload.pageOffset !== undefined ? Number(payload.pageOffset) : 0;
    const pageOffset = isFinite(rawOffset) ? rawOffset : 0;
    const mappings = getCiteKeyMappings();
    mappings[docMd5] = { citekey: citekey, pageOffset: pageOffset };
    __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.saveJsonObject(CITE_KEY_MAPPINGS_KEY, mappings);
    return { docMd5: docMd5, citekey: citekey, pageOffset: pageOffset };
  }

  function getCurrentDocumentInfo(context) {
    return __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.getCurrentDocumentInfo(context);
  }

  function inspectCurrentDocument(context) {
    return __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.inspectCurrentDocument(context);
  }

  return { getWsSettings, setWsSettings, getMarkdownPreferences, setMarkdownPreferences, getSelectedCardsInfo, listNotebooks, listCards, getClientId, setClientId, getCiteKeyMapping, setCiteKeyMapping, getCiteKeyMappingForDoc, getCurrentDocumentInfo, inspectCurrentDocument };
})();
