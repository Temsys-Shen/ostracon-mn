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

  // merge 后刷新链路：标脏 + 保存 + 发通知。
  // 注意 RefreshAfterDBChange 的 object 必须是当前 mindmapView——ForumMindMapController
  // 以 self.mindmapView 注册观察，object=null 时收不到（此前刷新无效的原因）。
  // ReloadDigestNotes 用于刷新摘录/卡片列表与 PDF 高亮层。
  function refreshMindMapAfterMerge(context, primaryNote, notebookId) {
    try {
      const db = Database.sharedInstance();
      if (typeof db.setNotebookSyncDirty === "function") db.setNotebookSyncDirty(notebookId);
      if (typeof db.savedb === "function") db.savedb();
      const study = studyControllerForFocus(context);
      const notebookController = study ? study.notebookController : null;
      const mindmapView = notebookController ? notebookController.mindmapView : null;
      console.log("[OstraconContinuous] 刷新窗口检查: topic="
        + (notebookController ? notebookController.notebookId : "nil")
        + " expected=" + notebookId
        + " focus=" + (notebookController && notebookController.focusNote ? notebookController.focusNote.noteId : "nil"));
      const center = NSNotificationCenter.defaultCenter();
      if (center && typeof center.postNotificationNameObjectUserInfo === "function") {
        center.postNotificationNameObjectUserInfo("RefreshAfterDBChange", mindmapView, {
          topicid: notebookId,
          note: primaryNote,
        });
        center.postNotificationNameObjectUserInfo("ReloadDigestNotes", null, {
          note: primaryNote,
          command: "modify",
        });
      }
    } catch (error) {
      console.log("[OstraconContinuous] 脑图刷新失败（忽略）: " + String(error && error.message ? error.message : error));
    }
  }

  function studyControllerForFocus(context) {
    const targetWindow = context && context.addon && context.addon.window
      ? context.addon.window
      : (context && context.controller && context.controller.addonWindow) ? context.controller.addonWindow : null;
    return targetWindow ? Application.sharedInstance().studyController(targetWindow) : null;
  }

  function focusPrimaryInViews(context, primaryNoteId) {
    try {
      const study = studyControllerForFocus(context);
      if (!study) return;
      if (typeof study.focusNoteInMindMapById === "function") study.focusNoteInMindMapById(String(primaryNoteId));
      if (typeof study.focusNoteInDocumentById === "function") study.focusNoteInDocumentById(String(primaryNoteId));
    } catch (error) {
      console.log("[OstraconContinuous] 定位合并主卡失败（忽略）: " + String(error && error.message ? error.message : error));
    }
  }

  function mindmapViewForContext(context) {
    const study = studyControllerForFocus(context);
    return study && study.notebookController ? study.notebookController.mindmapView : null;
  }

  // 读取当前脑图可见节点 id 列表；拿不到视图或节点时返回 []（调用方不阻塞流程）。
  function collectMindMapNoteIds(context) {
    try {
      const mindmapView = mindmapViewForContext(context);
      if (!mindmapView || !mindmapView.mindmapNodes) return [];
      const nodes = mindmapView.mindmapNodes || [];
      const ids = [];
      for (var index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node && node.note && node.note.noteId) ids.push(String(node.note.noteId));
      }
      return ids;
    } catch (error) {
      return [];
    }
  }

  // 脑图是否还显示着任意一个应被合并隐藏的子卡（拿不到节点列表时按已隐藏处理，不阻塞）。
  function stillHasSubCards(context, subNoteIds) {
    const ids = collectMindMapNoteIds(context);
    if (ids.length === 0) return false;
    for (var index = 0; index < subNoteIds.length; index++) {
      if (ids.indexOf(String(subNoteIds[index])) !== -1) return true;
    }
    return false;
  }

  // merge 后按用户节奏推进：merge → 等数据写入（0.6s）→ 发通知刷新 → 再等（0.6s）→
  // 复查并再刷一轮 → 定位主卡（脑图 + 文档）。
  // 纯 JS 侧不能直接调 refreshFromDB（JSBMindMapView 未导出，responds=false），
  // 只能靠 RefreshAfterDBChange（object=当前 mindmapView）+ ReloadDigestNotes 通知。
  function scheduleMindMapRefresh(context, primaryNote, subNoteIds, notebookId, primaryNoteId) {
    try {
      NSTimer.scheduledTimerWithTimeInterval(0.6, false, function () {
        try {
          const nodeIds = collectMindMapNoteIds(context);
          console.log("[OstraconContinuous] 首次检查 nodes=" + nodeIds.join(",")
            + " 含子卡=" + stillHasSubCards(context, subNoteIds)
            + " 含主卡=" + (nodeIds.indexOf(String(primaryNote.noteId)) !== -1));
        } catch (error) {
          console.log("[OstraconContinuous] 首次检查失败（忽略）: " + String(error && error.message ? error.message : error));
        }
        refreshMindMapAfterMerge(context, primaryNote, notebookId);
        NSTimer.scheduledTimerWithTimeInterval(0.6, false, function () {
          try {
            const nodeIds = collectMindMapNoteIds(context);
            console.log("[OstraconContinuous] 复查 nodes=" + nodeIds.join(",")
              + " 仍含子卡=" + stillHasSubCards(context, subNoteIds)
              + " 含主卡=" + (nodeIds.indexOf(String(primaryNote.noteId)) !== -1));
          } catch (error) {
            console.log("[OstraconContinuous] 复查失败（忽略）: " + String(error && error.message ? error.message : error));
          }
          refreshMindMapAfterMerge(context, primaryNote, notebookId);
          focusPrimaryInViews(context, primaryNoteId);
        });
      });
    } catch (error) {
      console.log("[OstraconContinuous] 延迟刷新脑图失败（忽略）: " + String(error && error.message ? error.message : error));
    }
  }

  // 把卡片解析到当前脑图所在学习集的实体：同一摘录在文档笔记本与学习集的
  // noteId 可能不同（realGroupNoteIdForTopicId 映射），脑图显示的是学习集实体，
  // merge 必须作用在该实体上，否则脑图里的独立卡片不会消失。
  function resolveNoteForTopic(note, topicId) {
    if (!note) return null;
    try {
      if (typeof note.realGroupNoteIdForTopicId === "function") {
        const realId = note.realGroupNoteIdForTopicId(String(topicId));
        if (realId && String(realId) !== String(note.noteId || "")) {
          const real = Database.sharedInstance().getNoteById(realId);
          if (real) return real;
        }
      }
    } catch (error) {
      console.log("[OstraconContinuous] 解析学习集实体失败（忽略）: " + String(error && error.message ? error.message : error));
    }
    return note;
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
    // 渲染成功后才收尾：merge 设置子卡 groupnoteid + 主卡 LinkNote（MN 内部模型），
    // 子卡会被脑图按 groupnoteid 过滤隐藏。绝不能删除子卡——删除会使 LinkNote 引用失效，
    // 聚合内容与图片（media hash 回查）全部丢失。
    // 渲染成功后才收尾：merge 前先把卡片解析到当前脑图所在学习集的实体
    // （文档笔记本与学习集的 noteId 不同），确保脑图里的独立卡片被合并隐藏。
    const primaryForView = resolveNoteForTopic(primary, state.notebookId);
    const notesForView = notesToMerge.map(function (note) {
      return resolveNoteForTopic(note, state.notebookId);
    });
    const viewSubNoteIds = notesForView.map(function (note) { return String(note.noteId || ""); });
    UndoManager.sharedInstance().undoGrouping("合并连续摘录", state.notebookId, function () {
      for (var index = 0; index < notesForView.length; index++) {
        primaryForView.merge(notesForView[index]);
      }
    });
    for (var debugIndex = 0; debugIndex < notesToMerge.length; debugIndex++) {
      console.log("[OstraconContinuous] 子卡[" + notesToMerge[debugIndex].noteId
        + "] notebookId=" + notesToMerge[debugIndex].notebookId
        + " groupNoteId=" + notesToMerge[debugIndex].groupNoteId
        + " 学习集实体=" + (notesForView[debugIndex] ? notesForView[debugIndex].noteId : "nil"));
    }
    console.log("[OstraconContinuous] 会话notebookId=" + state.notebookId
      + " 主卡id=" + primary.noteId + " 主卡notebookId=" + primary.notebookId
      + " 主卡学习集实体=" + (primaryForView ? primaryForView.noteId : "nil"));
    try {
      if (typeof db.setNotebookSyncDirty === "function") db.setNotebookSyncDirty(state.notebookId);
      if (typeof db.savedb === "function") db.savedb();
    } catch (error) {
      console.log("[OstraconContinuous] 标记脏/保存失败（忽略）: " + String(error && error.message ? error.message : error));
    }
    try {
      Application.sharedInstance().refreshAfterDBChanged(state.notebookId);
    } catch (error) {
      console.log("[OstraconContinuous] refreshAfterDBChanged 失败（忽略）: " + String(error && error.message ? error.message : error));
    }
    scheduleMindMapRefresh(context, primaryForView, viewSubNoteIds, state.notebookId,
      primaryForView ? primaryForView.noteId : state.primaryNoteId);
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
