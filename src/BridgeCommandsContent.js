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

    var markdown = result.markdown;
    if (mergedPrefs.includeBacklinks) {
      var backlinks = ["", "## MarginNote Links", ""];
      selection.flatCards.forEach(function (card) {
        var note = card.note;
        var title = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeText(note ? note.noteTitle : "") || "Untitled Card";
        backlinks.push("- [" + title + "](marginnote4app://note/" + card.noteId + ")");
      });
      backlinks.push("");
      markdown += backlinks.join("\n");
    }

    return {
      markdown: markdown,
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

    const prefs = __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon.loadPrefs();
    return {
      format,
      cards,
      ...previewSelectedMarkdown(context, prefs),
    };
  }

  return { previewSelectedMarkdown, previewSelectedCanvas, fetchCards };
})();
