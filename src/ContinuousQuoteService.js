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

  // 渲染连续摘录引文：主卡 + 所有子卡内容按顺序合并（不依赖 MN 的 merge——其语义只是加链接）。
  // useContentAsTitle 强制关闭：摘录卡无标题时若开启会把摘录文本整段消费为标题，导致内容为空。
  function buildPrimaryQuote(context, primaryNote, extraNotes, payload) {
    const primaryNoteId = String(primaryNote.noteId || "");
    const titlePolicy = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeCardTitlePolicy(payload && payload.cardTitlePolicy);
    const allNoteIds = [primaryNoteId].concat((extraNotes || []).map(function (note) { return String(note.noteId || ""); }));
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getCardsByIds(allNoteIds);
    const cards = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.listCardsByIds(context, allNoteIds, titlePolicy);
    const options = {
      mode: "flat",
      cardTitlePolicy: Object.assign({}, titlePolicy, { useContentAsTitle: false }),
      includeBacklinks: true,
    };
    const result = __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildQuoteContent(selection, options);
    const quote = {
      content: result.content,
      link: result.link,
      title: result.title,
      heading: result.heading,
    };
    // 标题回退：主卡无标题且摘录文本非空时，用摘录首行作标题，避免变成"无标题卡片"
    if (!quote.title || quote.title === options.cardTitlePolicy.untitledTitle) {
      const firstLine = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeText(String(primaryNote.excerptText || "").split("\n")[0]);
      if (firstLine) quote.title = firstLine;
    }
    // BibTeX 引用：注入 citekey + 页码（取自合并后主卡的摘录页码，按 offset 换算）
    __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon.attachCitation(context, quote, primaryNote);
    return {
      quote: quote,
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
    // 先渲染合并内容；渲染失败/内容为空时保留会话状态，允许用户重试或取消，避免 UI 与 MN 状态脱节
    const rendered = buildPrimaryQuote(context, primary, notesToMerge, payload || {});
    if (!rendered.quote.content) throw new Error("连续摘录内容为空");
    // 渲染成功后才收尾：删除子卡（内容已合并进引文），结束会话
    UndoManager.sharedInstance().undoGrouping("合并连续摘录", state.notebookId, function () {
      for (var index = 0; index < notesToMerge.length; index++) {
        db.deleteBookNoteTree(notesToMerge[index].noteId);
      }
    });
    Application.sharedInstance().refreshAfterDBChanged(state.notebookId);
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
