var __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon = (function () {
  function owner(context) {
    if (context && context.addon) return context.addon;
    if (context && context.window) return context;
    throw new Error("连续摘录缺少插件上下文");
  }

  function emptyState() {
    return {
      active: false,
      notebookId: "",
      primaryNoteId: null,
      items: [],
    };
  }

  function cloneState(state) {
    if (!state || state.active !== true) return emptyState();
    return {
      active: true,
      notebookId: String(state.notebookId || ""),
      primaryNoteId: state.primaryNoteId ? String(state.primaryNoteId) : null,
      items: Array.isArray(state.items) ? state.items.map(function (item) {
        return {
          noteId: String(item.noteId || ""),
          title: String(item.title || ""),
          kind: item.kind === "image" ? "image" : "text",
        };
      }).filter(function (item) { return Boolean(item.noteId); }) : [],
    };
  }

  function setState(context, state) {
    owner(context)._ostraconContinuousQuote = cloneState(state);
    return getState(context);
  }

  function getState(context) {
    return cloneState(owner(context)._ostraconContinuousQuote);
  }

  function requireActive(context) {
    const state = getState(context);
    if (!state.active) throw new Error("连续摘录尚未开始");
    const notebookId = __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.currentNotebookId(context);
    if (state.notebookId !== notebookId) {
      throw new Error("连续摘录所属学习集已切换");
    }
    return state;
  }

  function startSession(context) {
    const current = getState(context);
    if (current.active) throw new Error("连续摘录已开始");
    return setState(context, {
      active: true,
      notebookId: __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.currentNotebookId(context),
      primaryNoteId: null,
      items: [],
    });
  }

  function summarizeCreatedItem(note, selection) {
    const title = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note).title;
    return {
      noteId: String(note.noteId || ""),
      title: title,
      kind: selection && selection.kind === "image" ? "image" : "text",
    };
  }

  function addSelection(context) {
    const state = requireActive(context);
    const created = __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.createCardFromCurrentSelection(context);
    const item = summarizeCreatedItem(created.note, created.selection);
    if (!item.noteId) throw new Error("连续摘录创建的卡片缺少noteId");
    state.items.push(item);
    if (!state.primaryNoteId) state.primaryNoteId = item.noteId;
    return {
      state: setState(context, state),
      item: item,
    };
  }

  function buildPrimaryQuote(context, primaryNote, payload) {
    const primaryNoteId = String(primaryNote.noteId || "");
    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getCardsByIds([primaryNoteId]);
    const cards = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCardsByIds(context, [primaryNoteId], titlePolicy);
    const options = {
      mode: "flat",
      cardTitlePolicy: titlePolicy,
      includeBacklinks: true,
    };
    const result = __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildQuoteContent(selection, options);
    return {
      quote: {
        content: result.content,
        link: result.link,
        title: result.title,
        heading: result.heading,
      },
      fileBaseName: __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.resolveFileBaseName(primaryNote, titlePolicy),
      noteCount: 1,
      cards: cards,
      warnings: result.warnings,
    };
  }

  function finishSession(context, payload) {
    const state = requireActive(context);
    if (state.items.length === 0 || !state.primaryNoteId) throw new Error("连续摘录没有内容");
    const db = Database.sharedInstance();
    const primary = db.getNoteById(state.primaryNoteId);
    if (!primary) throw new Error("连续摘录主卡不存在: " + state.primaryNoteId);
    const notesToMerge = state.items.slice(1).map(function (item) {
      const note = db.getNoteById(item.noteId);
      if (!note) throw new Error("连续摘录卡片不存在: " + item.noteId);
      return note;
    });
    UndoManager.sharedInstance().undoGrouping("合并连续摘录", state.notebookId, function () {
      for (var index = 0; index < notesToMerge.length; index++) {
        primary.merge(notesToMerge[index]);
        db.deleteBookNoteTree(notesToMerge[index].noteId);
      }
    });
    Application.sharedInstance().refreshAfterDBChanged(state.notebookId);
    const rendered = buildPrimaryQuote(context, primary, payload || {});
    owner(context)._ostraconContinuousQuote = emptyState();
    return {
      noteId: state.primaryNoteId,
      link: "marginnote4app://note/" + state.primaryNoteId,
      quote: rendered.quote,
      fileBaseName: rendered.fileBaseName,
      noteCount: rendered.noteCount,
      cards: rendered.cards,
      warnings: rendered.warnings,
    };
  }

  function cancelSession(context) {
    const state = requireActive(context);
    const db = Database.sharedInstance();
    UndoManager.sharedInstance().undoGrouping("取消连续摘录", state.notebookId, function () {
      for (var index = state.items.length - 1; index >= 0; index--) {
        db.deleteBookNoteTree(state.items[index].noteId);
      }
    });
    Application.sharedInstance().refreshAfterDBChanged(state.notebookId);
    owner(context)._ostraconContinuousQuote = emptyState();
    return { cancelled: true, state: emptyState() };
  }

  function clearSession(context) {
    owner(context)._ostraconContinuousQuote = emptyState();
    return emptyState();
  }

  return {
    getState: getState,
    startSession: startSession,
    addSelection: addSelection,
    finishSession: finishSession,
    cancelSession: cancelSession,
    clearSession: clearSession,
  };
})();
