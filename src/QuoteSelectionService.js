var __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon = (function () {
  // 事件名常量。与 web/src/lib/events.js 保持一致（人工同步，src/ 端不是 ES module 无法 import）。
  const SELECTION_NOTIFICATION = "SelectionChanged";
  const EVT_SELECTION_CHANGED = "ostracon:selection-changed";
  const EVT_QUOTE_ROOT_CLEARED = "ostracon:quote-root-cleared";

  function studyController(context) {
    const targetWindow = context.addon && context.addon.window
      ? context.addon.window
      : context.controller.addonWindow;
    const controller = Application.sharedInstance().studyController(targetWindow);
    if (!controller || !controller.notebookController || !controller.readerController) {
      throw new Error("当前未打开学习集或文档");
    }
    return controller;
  }

  function documentController(context) {
    const controller = studyController(context).readerController.currentDocumentController;
    if (!controller) throw new Error("当前未打开文档");
    return controller;
  }

  function currentNotebookId(context) {
    const notebookId = String(studyController(context).notebookController.notebookId || "");
    if (!notebookId) throw new Error("当前学习集缺少notebookId");
    return notebookId;
  }

  function captureSelection(context) {
    const controller = documentController(context);
    const imageData = controller.imageFromSelection();
    if (imageData === undefined) return null;

    if (controller.isSelectionText === true) {
      return {
        kind: "text",
        text: String(controller.selectionText || ""),
        image: null,
        noteId: null,
        link: null,
      };
    }

    const base64 = imageData.base64Encoding();
    if (!base64 || typeof base64 !== "string") throw new Error("图片选区编码失败");
    return {
      kind: "image",
      text: null,
      image: { mime: "image/png", base64: base64 },
      noteId: null,
      link: null,
    };
  }

  function createOrLocateCard(context, selection) {
    const notebookId = currentNotebookId(context);
    const state = context.addon._ostraconQuoteRoot || null;
    let root = null;
    if (state) {
      if (state.notebookId !== notebookId) throw new Error("卡片根节点不属于当前学习集");
      root = Database.sharedInstance().getNoteById(state.noteId);
      if (!root) throw new Error("设置的卡片根节点已不存在: " + state.noteId);
    }

    const note = documentController(context).highlightFromSelection();
    if (!note || !note.noteId) throw new Error("MN未能从当前选区创建卡片");

    if (root) {
      UndoManager.sharedInstance().undoGrouping("设置引文卡片根节点", notebookId, function () {
        root.addChild(note);
      });
      Application.sharedInstance().refreshAfterDBChanged(notebookId);
    }

    selection.noteId = String(note.noteId);
    selection.link = "marginnote4app://note/" + selection.noteId;
    return selection;
  }

  function getQuoteSelection(context, payload) {
    const selection = captureSelection(context);
    if (!selection) return null;
    return payload && payload.createCard === true
      ? createOrLocateCard(context, selection)
      : selection;
  }

  function getQuoteSelectionPreview(context) {
    return captureSelection(context);
  }

  function getQuoteRootState(context) {
    return context.addon._ostraconQuoteRoot || null;
  }

  function selectQuoteRootFromCurrentSelection(context) {
    const selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCardsOrEmpty(context);
    const cards = selection.flatCards || [];
    if (cards.length !== 1) return { selected: false, selectedCount: cards.length };

    const note = cards[0].note;
    if (!note || !note.noteId) throw new Error("选中的卡片缺少noteId");
    const root = {
      notebookId: currentNotebookId(context),
      noteId: String(note.noteId),
      title: __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note).title,
    };
    context.addon._ostraconQuoteRoot = root;
    return { selected: true, root: root };
  }

  function clearQuoteRoot(context) {
    context.addon._ostraconQuoteRoot = null;
    return { cleared: true };
  }

  function pushWebEvent(context, eventName) {
    if (!context.webController || !context.webController.webView) {
      console.log("[OstraconQuote] webView unavailable for " + eventName);
      return;
    }
    const script = "window.dispatchEvent(new CustomEvent(" + JSON.stringify(eventName) + "))";
    context.webController.webView.evaluateJavaScript(script, function () {});
  }

  function install(context) {
    const center = NSNotificationCenter.defaultCenter();
    center.removeObserverName(context, SELECTION_NOTIFICATION);
    center.addObserverSelectorName(context, "onOstraconSelectionChanged:", SELECTION_NOTIFICATION);
    console.log("[OstraconQuote] installed SelectionChanged");
  }

  function remove(context) {
    NSNotificationCenter.defaultCenter().removeObserverName(context, SELECTION_NOTIFICATION);
  }

  function handleSelectionChanged(context) {
    pushWebEvent(context, EVT_SELECTION_CHANGED);
  }

  function handleNotebookClose(context) {
    context._ostraconQuoteRoot = null;
    pushWebEvent(context, EVT_QUOTE_ROOT_CLEARED);
  }

  return {
    install,
    remove,
    handleSelectionChanged,
    handleNotebookClose,
    getQuoteSelection,
    getQuoteSelectionPreview,
    getQuoteRootState,
    selectQuoteRootFromCurrentSelection,
    clearQuoteRoot,
  };
})();
