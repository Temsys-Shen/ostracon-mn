var __MN_CARD_SELECTION_SERVICE_MNOstraconAddon = (function () {
  function getStudyController(context) {
    if (!context || !context.addon || !context.addon.window) {
      throw new Error("Addon window not available");
    }

    const studyController = Application.sharedInstance().studyController(context.addon.window);
    if (!studyController) {
      throw new Error("studyController not found");
    }

    return studyController;
  }

  function getSelectedViews(context) {
    const studyController = getStudyController(context);
    const notebookController = studyController.notebookController;
    if (!notebookController) {
      throw new Error("notebookController not found");
    }

    const mindmapView = notebookController.mindmapView;
    if (!mindmapView) {
      throw new Error("mindmapView not found");
    }

    return mindmapView.selViewLst || [];
  }

  function getNotebookController(context) {
    const studyController = getStudyController(context);
    const notebookController = studyController.notebookController;
    if (!notebookController) {
      throw new Error("notebookController not found");
    }
    return notebookController;
  }

  function arrayFromNSArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    const count = typeof value.count === "function" ? Number(value.count()) : Number(value.length || 0);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      if (typeof value.objectAtIndex === "function") {
        result.push(value.objectAtIndex(index));
      } else {
        result.push(value[index]);
      }
    }
    return result;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function getFrameValue(frame, key) {
    if (!frame) return 0;
    return numberOrZero(frame[key]);
  }

  function resolveNode(selectionItem) {
    if (!selectionItem) return null;
    if (selectionItem.note && selectionItem.note.note) return selectionItem.note;
    if (selectionItem.note && selectionItem.note.noteId) return selectionItem;
    if (selectionItem.noteId || selectionItem.comments) {
      return {
        note: selectionItem,
        parentNode: selectionItem.parentNode,
        childNodes: selectionItem.childNodes,
        frame: selectionItem.frame || { x: 0, y: 0 },
      };
    }
    return selectionItem.note || selectionItem;
  }

  function getVisualOrderKey(node) {
    return [node.y, node.x, node.selectionIndex];
  }

  function compareByVisualOrder(left, right) {
    const leftKey = getVisualOrderKey(left);
    const rightKey = getVisualOrderKey(right);
    for (let index = 0; index < leftKey.length; index += 1) {
      if (leftKey[index] !== rightKey[index]) {
        return leftKey[index] - rightKey[index];
      }
    }
    return 0;
  }

  function buildSelectedNode(node, selectionIndex) {
    const note = node && node.note ? node.note : null;
    if (!note || !note.noteId) return null;

    const frame = node.frame || {};
    const parentNode = node.parentNode || null;
    const childNodes = arrayFromNSArray(node.childNodes);

    return {
      note,
      noteId: note.noteId,
      selectionIndex,
      x: getFrameValue(frame, "x"),
      y: getFrameValue(frame, "y"),
      parentNoteId: parentNode && parentNode.note ? parentNode.note.noteId : null,
      childNoteIds: childNodes.map(function (childNode) {
        return childNode && childNode.note ? childNode.note.noteId : null;
      }).filter(Boolean),
    };
  }

  function indexSelectedNodes(items, allowEmpty) {
    const selectedById = {};
    const orderedNodes = [];

    items.forEach(function (item, selectionIndex) {
      const node = resolveNode(item);
      const selectedNode = buildSelectedNode(node, selectionIndex);
      if (!selectedNode) return;
      if (selectedById[selectedNode.noteId]) return;

      selectedById[selectedNode.noteId] = selectedNode;
      orderedNodes.push(selectedNode);
    });

    orderedNodes.sort(compareByVisualOrder);
    if (orderedNodes.length === 0 && allowEmpty !== true) {
      throw new Error("未选中卡片");
    }

    return {
      orderedNodes,
      selectedById,
    };
  }

  function buildTreeChildren(parentNode, selectedById) {
    return parentNode.childNoteIds.map(function (childNoteId) {
      return selectedById[childNoteId] || null;
    }).filter(Boolean).sort(compareByVisualOrder).map(function (childNode) {
      return buildTreeNode(childNode, selectedById);
    });
  }

  function buildTreeNode(node, selectedById) {
    return {
      note: node.note,
      noteId: node.noteId,
      selectionIndex: node.selectionIndex,
      x: node.x,
      y: node.y,
      depth: 0,
      children: buildTreeChildren(node, selectedById),
    };
  }

  function assignDepth(node, depth) {
    node.depth = depth;
    node.children.forEach(function (child) {
      assignDepth(child, depth + 1);
    });
  }

  function getTreeRoots(orderedNodes, selectedById) {
    const roots = orderedNodes.filter(function (node) {
      return !node.parentNoteId || !selectedById[node.parentNoteId];
    }).map(function (node) {
      return buildTreeNode(node, selectedById);
    });

    roots.forEach(function (root) {
      assignDepth(root, 0);
    });

    return roots;
  }

  function flattenTreeNodes(roots) {
    const result = [];

    function visit(node) {
      result.push(node);
      node.children.forEach(visit);
    }

    roots.forEach(visit);
    return result;
  }

  function selectionFromRootNotes(notes) {
    const notesById = {};
    const orderedIds = [];
    notes.forEach(function (note) {
      const noteId = String(note && note.noteId || "");
      if (!noteId) throw new Error("学习集卡片缺少noteId");
      if (notesById[noteId]) return;
      notesById[noteId] = note;
      orderedIds.push(noteId);
    });

    const childIdsByParent = {};
    const referencedChildIds = {};
    const parentByChildId = {};
    orderedIds.forEach(function (noteId) {
      const uniqueChildIds = {};
      childIdsByParent[noteId] = arrayFromNSArray(notesById[noteId].childNotes).map(function (childNote) {
        const childId = String(childNote && childNote.noteId || "");
        if (!childId) throw new Error("学习集子卡片缺少noteId: parent=" + noteId);
        if (!notesById[childId]) throw new Error("学习集子卡片不在卡片集合中: " + childId);
        if (uniqueChildIds[childId]) return null;
        if (parentByChildId[childId] && parentByChildId[childId] !== noteId) {
          throw new Error("学习集卡片存在多个上级: " + childId);
        }
        uniqueChildIds[childId] = true;
        parentByChildId[childId] = noteId;
        referencedChildIds[childId] = true;
        return childId;
      }).filter(Boolean);
    });

    const visitState = {};
    function buildTree(noteId, selectionIndex, depth) {
      if (visitState[noteId] === 1) throw new Error("学习集卡片层级存在循环: " + noteId);
      if (visitState[noteId] === 2) return null;
      visitState[noteId] = 1;
      const children = childIdsByParent[noteId].map(function (childId, childIndex) {
        return buildTree(childId, selectionIndex + "-" + childIndex, depth + 1);
      }).filter(Boolean);
      visitState[noteId] = 2;
      return {
        note: notesById[noteId], noteId, selectionIndex,
        x: 0, y: Number(String(selectionIndex).split("-")[0]) || 0, depth, children,
      };
    }

    const rootIds = orderedIds.filter(function (noteId) { return !referencedChildIds[noteId]; });
    if (orderedIds.length > 0 && rootIds.length === 0) {
      buildTree(orderedIds[0], 0, 0);
      throw new Error("学习集卡片层级不存在根节点");
    }
    const treeRoots = rootIds.map(function (noteId, index) { return buildTree(noteId, index, 0); }).filter(Boolean);
    orderedIds.forEach(function (noteId, index) {
      if (!visitState[noteId]) {
        const extraRoot = buildTree(noteId, treeRoots.length + index, 0);
        if (extraRoot) treeRoots.push(extraRoot);
      }
    });
    const treeCards = flattenTreeNodes(treeRoots);
    const flatCards = treeCards.map(function (card, index) {
      return {
        note: card.note,
        noteId: card.noteId,
        selectionIndex: index,
        x: 0,
        y: index,
        depth: 0,
        children: [],
      };
    });
    return { flatCards, treeRoots, treeCards };
  }

  function selectionFromMindmapNodes(nodes) {
    const indexed = indexSelectedNodes(nodes);
    const roots = getTreeRoots(indexed.orderedNodes, indexed.selectedById);
    const flatCards = indexed.orderedNodes.map(function (node) {
      return {
        note: node.note,
        noteId: node.noteId,
        selectionIndex: node.selectionIndex,
        x: node.x,
        y: node.y,
        depth: 0,
        children: [],
      };
    });
    return {
      flatCards,
      treeRoots: roots,
      treeCards: flattenTreeNodes(roots),
    };
  }

  function getSelectedCardsInternal(context, allowEmpty) {
    const items = arrayFromNSArray(getSelectedViews(context));
    const indexed = indexSelectedNodes(items, allowEmpty);
    const roots = getTreeRoots(indexed.orderedNodes, indexed.selectedById);
    const flatCards = indexed.orderedNodes.map(function (node) {
      return {
        note: node.note,
        noteId: node.noteId,
        selectionIndex: node.selectionIndex,
        x: node.x,
        y: node.y,
        depth: 0,
        children: [],
      };
    });

    return {
      flatCards,
      treeRoots: roots,
      treeCards: flattenTreeNodes(roots),
    };
  }

  function getSelectedCards(context) {
    return getSelectedCardsInternal(context, false);
  }

  function getSelectedCardsOrEmpty(context) {
    return getSelectedCardsInternal(context, true);
  }

  function getSelectedCardsInfo(context) {
    const items = arrayFromNSArray(getSelectedViews(context));
    const indexed = indexSelectedNodes(items);
    const firstCard = indexed.orderedNodes[0];
    const note = firstCard ? firstCard.note : null;
    let totalComments = 0;
    let totalImages = 0;
    indexed.orderedNodes.forEach(function (node) {
      const content = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(node.note);
      totalComments += content.commentCount;
      totalImages += content.imageCount;
    });

    return {
      noteCount: indexed.orderedNodes.length,
      imageCount: totalImages,
      commentCount: totalComments,
      sourceTitle: note ? __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note).title : "",
      noteIds: indexed.orderedNodes.map(function (node) { return node.noteId; }),
    };
  }

  function summarizeNote(node) {
    const note = node.note;
    const content = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);

    return {
      id: node.noteId,
      title: content.title,
      comment: content.commentText,
      sourceAnchor: "marginnote4app://note/" + node.noteId,
      selected: true,
      hasImage: content.hasImage,
      hasHandwriting: content.hasHandwriting,
    };
  }

  function getCurrentNotebookInfo(context) {
    const info = getSelectedCardsInfo(context);
    return [{
      id: "current-selection",
      title: info.sourceTitle || "当前选中卡片",
      source: "current-selection",
      selected: true,
      cardCount: info.noteCount,
    }];
  }

  function listCurrentCards(context) {
    const selection = getSelectedCards(context);
    return selection.flatCards.map(summarizeNote);
  }

  function getNotebookScopeById(notebookId) {
    var db = Database.sharedInstance();
    if (!notebookId) throw new Error("缺少当前学习集ID");
    var notebook = db.getNotebookById(notebookId);
    if (!notebook) throw new Error("未找到笔记本: " + notebookId);
    return {
      id: notebookId,
      title: String(notebook.title || "当前学习集"),
      selection: selectionFromRootNotes(arrayFromNSArray(notebook.notes)),
    };
  }

  function getCurrentNotebookScope(context) {
    var notebookController = getNotebookController(context);
    var notebookId = notebookController.notebookId ? String(notebookController.notebookId) : "";
    return getNotebookScopeById(notebookId);
  }

  function getCurrentMindmapScope(context) {
    var notebookController = getNotebookController(context);
    var mindmapView = notebookController.mindmapView;
    if (!mindmapView) throw new Error("mindmapView not found");
    var nodes = arrayFromNSArray(mindmapView.mindmapNodes);
    return {
      id: "current-mindmap",
      title: "当前脑图",
      selection: selectionFromMindmapNodes(nodes),
    };
  }

  function getScopeSelection(context, scopeType, options) {
    if (scopeType === "notebook") {
      var notebookId = options && options.notebookId ? String(options.notebookId) : "";
      return notebookId ? getNotebookScopeById(notebookId) : getCurrentNotebookScope(context);
    }
    if (scopeType === "mindmap") return getCurrentMindmapScope(context);
    return {
      id: "selection",
      title: "选中卡片",
      selection: getSelectedCards(context),
    };
  }

  function listScopeCards(context, scopeType, options) {
    return getScopeSelection(context, scopeType, options).selection.flatCards.map(summarizeNote);
  }

  function countAllNotes(notes) {
    var count = 0;
    for (var i = 0; i < notes.length; i++) {
      count++;
      var children = arrayFromNSArray(notes[i].childNotes);
      count += countAllNotes(children);
    }
    return count;
  }

  function collectAllNotes(notes) {
    var result = [];
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      result.push(note);
      var children = arrayFromNSArray(note.childNotes);
      if (children.length > 0) {
        result = result.concat(collectAllNotes(children));
      }
    }
    return result;
  }

  function summarizeDbNote(note) {
    var content = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);

    return {
      id: String(note.noteId || ""),
      title: content.title,
      comment: content.commentText,
      sourceAnchor: "marginnote4app://note/" + String(note.noteId || ""),
      selected: false,
      hasImage: content.hasImage,
      hasHandwriting: content.hasHandwriting,
      colorIndex: typeof note.colorIndex === "number" ? Number(note.colorIndex) : undefined,
    };
  }

  function listAllNotebooks(context) {
    var db = Database.sharedInstance();
    var allTopics = arrayFromNSArray(db.allNotebooks());

    var currentNbId = "";
    try {
      var sc = getStudyController(context);
      var nc = sc.notebookController;
      if (nc && nc.notebookId) currentNbId = String(nc.notebookId);
    } catch (_) {}

    return allTopics.map(function (topic) {
      var notes = arrayFromNSArray(topic.notes);
      return {
        id: String(topic.topicId || ""),
        title: String(topic.title || ""),
        source: String(topic.source || ""),
        selected: String(topic.topicId) === currentNbId,
        cardCount: countAllNotes(notes),
      };
    });
  }

  function listAllCards(context, notebookId) {
    var db = Database.sharedInstance();
    var notebook = db.getNotebookById(notebookId);
    if (!notebook) throw new Error("未找到笔记本: " + notebookId);

    var rootNotes = arrayFromNSArray(notebook.notes);
    var allDbNotes = collectAllNotes(rootNotes);

    return allDbNotes.map(summarizeDbNote);
  }

  function listCardsByIds(context, cardIds) {
    var db = Database.sharedInstance();
    return cardIds.map(function (noteId) {
      var note = db.getNoteById(String(noteId));
      if (!note) throw new Error("MN中未找到此卡片: " + noteId);
      return summarizeDbNote(note);
    });
  }

  function getCardsByIds(cardIds) {
    var db = Database.sharedInstance();
    var cards = cardIds.map(function (noteId, index) {
      var id = String(noteId);
      var note = db.getNoteById(id);
      if (!note) throw new Error("MN中未找到此卡片: " + id);
      return {
        note: note,
        noteId: String(note.noteId || id),
        selectionIndex: index,
        x: 0,
        y: index,
        depth: 0,
        children: [],
      };
    });

    return {
      flatCards: cards,
      treeRoots: cards,
      treeCards: cards,
    };
  }

  return {
    getSelectedCards,
    getSelectedCardsOrEmpty,
    getSelectedCardsInfo,
    getCurrentNotebookInfo,
    listCurrentCards,
    getScopeSelection,
    listScopeCards,
    listAllNotebooks,
    listAllCards,
    listCardsByIds,
    getCardsByIds,
    arrayFromNSArray,
  };
})();
