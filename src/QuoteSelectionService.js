var __MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon = (function () {
  // 事件名常量。与 web/src/lib/events.js 保持一致（人工同步，src/ 端不是 ES module 无法 import）。
  const SELECTION_NOTIFICATION = "SelectionChanged";
  const EVT_SELECTION_CHANGED = "ostracon:selection-changed";
  const EVT_QUOTE_ROOT_CLEARED = "ostracon:quote-root-cleared";
  // 选中卡片事件防抖：框选大量卡片时 SelectionChanged 会高频触发，静默 200ms 后才派发一次。
  const SELECTION_EVENT_DEBOUNCE_SECONDS = 0.2;

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

  // ── BibTeX 引用：文档信息 / 页码探测 / citekey 注入 ──────────────
  // MN JS bridge 的字段名与官方 ObjC 头文件可能不一致，这里用候选列表探测，
  // 首个非空字段生效；最终语义以 inspectCurrentDocument 实测输出为准。
  function readFirstField(object, keys) {
    if (!object) return undefined;
    for (var index = 0; index < keys.length; index++) {
      var value = object[keys[index]];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  function currentDocumentInfo(context) {
    const controller = documentController(context);
    const document = readFirstField(controller, ["document", "doc"]) || null;
    const docMd5 = readFirstField(controller, ["docMd5", "documentId", "docHash"]);
    const docTitle = readFirstField(document, ["docTitle", "title"]) || readFirstField(controller, ["docTitle", "documentTitle"]);
    return {
      controller: controller,
      document: document,
      docMd5: docMd5 === undefined ? "" : String(docMd5),
      docTitle: docTitle === undefined ? "" : String(docTitle),
    };
  }

  // 选区/当前页探测：MN 实测只有 currPageNo（1起）可靠；0 起字段（currPageIndex 等）不做页码用，
  // 避免字段缺失时误选导致页码差 1。
  function selectionPageRange(controller) {
    const raw = readFirstField(controller, ["currPageNo", "currentPageNo", "pageNo"]);
    if (raw === undefined) return null;
    const page = Number(raw);
    if (!isFinite(page) || page < 0) return null;
    return { start: page, end: page };
  }

  // 卡片/摘录页码：MbBookNote.startPage / endPage（官方字段，1起）
  function notePageRange(note) {
    if (!note) return null;
    const start = readFirstField(note, ["startPage", "pageStart"]);
    if (start === undefined) return null;
    const s = Number(start);
    if (!isFinite(s) || s < 0) return null;
    const rawEnd = readFirstField(note, ["endPage", "pageEnd"]);
    const e = rawEnd === undefined ? s : Number(rawEnd);
    return { start: s, end: isFinite(e) ? e : s };
  }

  function formatPageNumber(start, end, offset) {
    const s = start + offset;
    const e = end + offset;
    if (e > s) return String(s) + "-" + String(e);
    return String(s);
  }

  // 给 selection（拉模式）或 quote（连续摘录推模式）注入 citekey + 页码。
  // note 传卡片对象时用卡片页码，否则用选区/当前页。任何异常都降级为 null，不影响主流程。
  function attachCitation(context, target, note) {
    try {
      const info = currentDocumentInfo(context);
      const mapping = info.docMd5 ? __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getCiteKeyMappingForDoc(info.docMd5) : null;
      if (!mapping || !mapping.citekey) {
        target.citekey = null;
        target.page = null;
        return target;
      }
      const offset = Number(mapping.pageOffset) || 0;
      const range = note ? notePageRange(note) : selectionPageRange(info.controller);
      target.citekey = String(mapping.citekey);
      target.page = range ? formatPageNumber(range.start, range.end, offset) : null;
    } catch (error) {
      target.citekey = null;
      target.page = null;
    }
    return target;
  }

  function getCurrentDocumentInfo(context) {
    const info = currentDocumentInfo(context);
    const mapping = info.docMd5 ? __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon.getCiteKeyMappingForDoc(info.docMd5) : null;
    return {
      docMd5: info.docMd5,
      docTitle: info.docTitle,
      citekey: mapping && mapping.citekey ? mapping.citekey : null,
      pageOffset: mapping ? mapping.pageOffset : 0,
    };
  }

  // 调试探测：输出当前文档控制器与关键字段的原始值，用于联调确认页码/文档ID 字段名与语义。
  function inspectCurrentDocument(context) {
    const info = currentDocumentInfo(context);
    const controller = info.controller;
    const probe = {};
    ["docMd5", "documentId", "docHash", "currPageNo", "currentPageNo", "pageNo", "currPageIndex", "pageIndex", "selectionPageIndex", "selectionPageNumber", "selectionPageNo", "pageCount"].forEach(function (key) {
      probe[key] = controller[key] === undefined ? undefined : controller[key];
    });
    const documentProbe = {};
    ["docTitle", "title", "docMd5", "pageCount"].forEach(function (key) {
      documentProbe[key] = info.document ? info.document[key] : undefined;
    });
    return {
      docMd5: info.docMd5,
      docTitle: info.docTitle,
      controllerKeys: Object.keys(controller).sort().slice(0, 80),
      probe: probe,
      documentKeys: info.document ? Object.keys(info.document).sort().slice(0, 80) : [],
      documentProbe: documentProbe,
    };
  }

  function captureSelection(context) {
    const controller = documentController(context);
    const imageData = controller.imageFromSelection();
    if (imageData === undefined) return null;

    if (controller.isSelectionText === true) {
      const selection = {
        kind: "text",
        text: String(controller.selectionText || ""),
        image: null,
        noteId: null,
        link: null,
      };
      return attachCitation(context, selection);
    }

    const base64 = imageData.base64Encoding();
    if (!base64 || typeof base64 !== "string") throw new Error("图片选区编码失败");
    const selection = {
      kind: "image",
      text: null,
      image: { mime: "image/png", base64: base64 },
      noteId: null,
      link: null,
    };
    return attachCitation(context, selection);
  }

  // 把摘录卡解析到当前学习集的实体：highlightFromSelection 返回的是文档笔记本的卡，
  // 脑图显示的是学习集映射卡（不同 noteId）。noteId/link 应指向学习集实体，
  // 否则发送到 OB 的回链会定位到文档而非脑图里的卡片。
  function resolveNoteToView(note, notebookId) {
    if (!note) return null;
    try {
      if (typeof note.realGroupNoteIdForTopicId === "function") {
        const realId = note.realGroupNoteIdForTopicId(String(notebookId));
        if (realId && String(realId) !== String(note.noteId || "")) {
          const real = Database.sharedInstance().getNoteById(realId);
          if (real) return real;
        }
      }
    } catch (error) {
      console.log("[OstraconQuote] 解析学习集实体失败（忽略）: " + String(error && error.message ? error.message : error));
    }
    return note;
  }

  function createOrLocateCard(context, selection) {
    const notebookId = currentNotebookId(context);
    const state = context.addon._ostraconQuoteRoot || null;
    let root = null;
    if (state) {
      if (state.notebookId !== notebookId) throw new Error("同级节点不属于当前学习集");
      root = Database.sharedInstance().getNoteById(state.noteId);
      if (!root) throw new Error("设置的同级节点已不存在: " + state.noteId);
    }

    const note = documentController(context).highlightFromSelection();
    if (!note || !note.noteId) throw new Error("MN未能从当前选区创建卡片");
    const viewNote = resolveNoteToView(note, notebookId);

    if (root) {
      UndoManager.sharedInstance().undoGrouping("设置引文同级节点", notebookId, function () {
        root.addChild(viewNote);
      });
      Application.sharedInstance().refreshAfterDBChanged(notebookId);
    }

    selection.noteId = String(viewNote.noteId);
    selection.link = "marginnote4app://note/" + selection.noteId;
    return selection;
  }

  function createCardFromCurrentSelection(context) {
    const selection = captureSelection(context);
    if (!selection) throw new Error("请先选择要加入连续摘录的内容");
    const notebookId = currentNotebookId(context);
    const note = documentController(context).highlightFromSelection();
    if (!note || !note.noteId) throw new Error("MN未能从当前选区创建卡片");
    const viewNote = resolveNoteToView(note, notebookId);
    selection.noteId = String(viewNote.noteId);
    selection.link = "marginnote4app://note/" + selection.noteId;
    return {
      notebookId: notebookId,
      note: viewNote,
      selection: selection,
    };
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

  // 对 SelectionChanged 做尾部防抖：事件风暴期间只重置定时器，静默 200ms 后派发一次最终事件。
  // 定时器挂在 context 上（与 _ostraconQuoteRoot 同模式），避免多窗口共享模块时互相覆盖。
  function scheduleSelectionPush(context) {
    const pending = context._ostraconSelectionTimer;
    if (pending) pending.invalidate();
    context._ostraconSelectionTimer = NSTimer.scheduledTimerWithTimeInterval(
      SELECTION_EVENT_DEBOUNCE_SECONDS, false,
      function () {
        context._ostraconSelectionTimer = null;
        pushWebEvent(context, EVT_SELECTION_CHANGED);
      }
    );
  }

  function install(context) {
    const center = NSNotificationCenter.defaultCenter();
    center.removeObserverName(context, SELECTION_NOTIFICATION);
    center.addObserverSelectorName(context, "onOstraconSelectionChanged:", SELECTION_NOTIFICATION);
    console.log("[OstraconQuote] installed SelectionChanged");
  }

  function remove(context) {
    const pending = context._ostraconSelectionTimer;
    if (pending) {
      pending.invalidate();
      context._ostraconSelectionTimer = null;
    }
    NSNotificationCenter.defaultCenter().removeObserverName(context, SELECTION_NOTIFICATION);
  }

  function handleSelectionChanged(context) {
    scheduleSelectionPush(context);
  }

  function handleNotebookClose(context) {
    const addon = context && context.addon ? context.addon : context;
    if (!addon || !addon.window) throw new Error("关闭学习集时缺少插件上下文");
    addon._ostraconQuoteRoot = null;
    __MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon.clearSession(addon);
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
    currentNotebookId,
    createCardFromCurrentSelection,
    selectQuoteRootFromCurrentSelection,
    clearQuoteRoot,
    attachCitation,
    getCurrentDocumentInfo,
    inspectCurrentDocument,
  };
})();
