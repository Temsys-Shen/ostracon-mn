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
    if (cardIds.length > 0) {
      return {
        notebookId: notebookId || "card-ids",
        cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCardsByIds(context, cardIds),
      };
    }
    if (!notebookId) {
      throw new Error("缺少 notebookId");
    }
    if (notebookId === "current-selection") {
      return {
        notebookId,
        cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCurrentCards(context),
      };
    }
    return {
      notebookId,
      cards: __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listAllCards(context, notebookId),
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

  return { getWsSettings, setWsSettings, getMarkdownPreferences, setMarkdownPreferences, getSelectedCardsInfo, listNotebooks, listCards, getClientId, setClientId };
})();
