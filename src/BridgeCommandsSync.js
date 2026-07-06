var __MN_BRIDGE_COMMANDS_SYNC_MNOstraconAddon = (function () {
  const SYNCED_CARDS_KEY = "mn_ostracon_synced_cards";

  function getSyncedCards() {
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadJsonObject(SYNCED_CARDS_KEY, { cards: {} });
  }

  function setSyncedCards(context, payload) {
    if (!payload || typeof payload !== "object") throw new Error("参数错误");
    return __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.saveJsonObject(SYNCED_CARDS_KEY, payload);
  }

  function syncCard(context, payload) {
    if (!payload || !payload.noteId) {
      throw new Error("缺少 noteId");
    }

    const note = Database.sharedInstance().getNoteById(payload.noteId);
    if (!note) {
      throw new Error("MN中未找到此卡片: " + payload.noteId);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "comment") && String(payload.comment || "").trim()) {
      throw new Error("评论回写需要替换语义，禁止使用追加写入");
    }

    const topicid = note.notebookId;
    UndoManager.sharedInstance().undoGrouping("Ostracon同步", topicid, function () {
      if (Object.prototype.hasOwnProperty.call(payload, "title")) note.noteTitle = String(payload.title || "");
      if (Object.prototype.hasOwnProperty.call(payload, "excerpt")) note.excerptText = String(payload.excerpt || "");
    });
    Application.sharedInstance().refreshAfterDBChanged(topicid);

    return { ok: true, noteId: payload.noteId, version: payload.version || 0 };
  }

  function renderCardsForSync(context, payload) {
    const targets = payload && Array.isArray(payload.targets) ? payload.targets : [];
    if (targets.length === 0) throw new Error("缺少同步目标");

    const db = Database.sharedInstance();
    const rendered = targets.map(function (target) {
      const noteId = String(target && target.noteId ? target.noteId : "");
      if (!noteId) throw new Error("同步目标缺少noteId");
      const note = db.getNoteById(noteId);
      if (!note) throw new Error("MN中未找到此卡片: " + noteId);

      const format = target.format === "canvas" ? "canvas" : "markdown";
      const renderOptions = target.renderOptions && typeof target.renderOptions === "object" ? target.renderOptions : {};
      const flags = getNoteImageFlags(note);
      if (format === "canvas") {
        return {
          ...__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.renderNodeTextForSync(note, renderOptions),
          format,
          filePath: String(target.filePath || ""),
          sourceAnchor: "marginnote4app://note/" + noteId,
          ...flags,
        };
      }

      return {
        ...__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.renderCardForSync(note, renderOptions),
        format,
        filePath: String(target.filePath || ""),
        sourceAnchor: "marginnote4app://note/" + noteId,
        ...flags,
      };
    });

    return { rendered };
  }

  function getNoteImageFlags(note) {
    var hasImage = false;
    var comments = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(note.comments);
    comments.forEach(function (comment) {
      if (comment && comment.type === "PaintNote") hasImage = true;
    });
    return { hasImage: hasImage, hasHandwriting: hasImage };
  }

  return { getSyncedCards, setSyncedCards, syncCard, renderCardsForSync, getNoteImageFlags };
})();
