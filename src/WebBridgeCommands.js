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

  const commands = {
    ping,
    echo,
    closePanel,
    discoverServers,
    getMarkdownPreferences: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getMarkdownPreferences,
    setMarkdownPreferences: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setMarkdownPreferences,
    getWsSettings: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getWsSettings,
    setWsSettings: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setWsSettings,
    getClientId: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getClientId,
    setClientId: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.setClientId,
    getSelectedCardsInfo: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getSelectedCardsInfo,
    listNotebooks: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.listNotebooks,
    listCards: __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.listCards,
    getSyncedCards: __MN_BRIDGE_COMMANDS_SYNC_MNOstraconAddon.getSyncedCards,
    setSyncedCards: __MN_BRIDGE_COMMANDS_SYNC_MNOstraconAddon.setSyncedCards,
    syncCard: __MN_BRIDGE_COMMANDS_SYNC_MNOstraconAddon.syncCard,
    renderCardsForSync: __MN_BRIDGE_COMMANDS_SYNC_MNOstraconAddon.renderCardsForSync,
    previewSelectedMarkdown: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewSelectedMarkdown,
    previewSelectedCanvas: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.previewSelectedCanvas,
    fetchCards: __MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon.fetchCards,
  };

  return { commands };
})();
