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
    if (selectionItem.noteId || selectionItem.comments || selectionItem.excerptText) {
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

  function indexSelectedNodes(items) {
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
    if (orderedNodes.length === 0) {
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

  function getSelectedCards(context) {
    const items = arrayFromNSArray(getSelectedViews(context));
    const indexed = indexSelectedNodes(items);
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

  function getSelectedCardsInfo(context) {
    const items = arrayFromNSArray(getSelectedViews(context));
    const indexed = indexSelectedNodes(items);
    const firstCard = indexed.orderedNodes[0];
    const note = firstCard ? firstCard.note : null;

    let totalComments = 0;
    let totalImages = 0;
    indexed.orderedNodes.forEach(function (node) {
      const comments = node.note ? arrayFromNSArray(node.note.comments) : [];
      totalComments += comments.length;
      comments.forEach(function (comment) {
        if (comment && comment.type === "PaintNote") {
          totalImages += 1;
        }
      });
    });

    return {
      noteCount: indexed.orderedNodes.length,
      imageCount: totalImages,
      commentCount: totalComments,
      sourceTitle: note && note.noteTitle ? String(note.noteTitle) : "",
      noteIds: indexed.orderedNodes.map(function (node) { return node.noteId; }),
    };
  }

  function summarizeNote(node) {
    const note = node.note;
    const comments = arrayFromNSArray(note.comments);
    let firstTextComment = "";
    let hasImage = false;
    const _normalizeText = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeText;
    comments.forEach(function (comment) {
      if (!comment || !comment.type) return;
      if (!firstTextComment && comment.type === "TextNote") firstTextComment = _normalizeText(comment.text);
      if (comment.type === "PaintNote") hasImage = true;
    });

    return {
      id: node.noteId,
      title: _normalizeText(note.noteTitle) || "未命名卡片",
      excerpt: _normalizeText(note.excerptText),
      comment: firstTextComment,
      sourceAnchor: "marginnote4app://note/" + node.noteId,
      selected: true,
      hasImage: hasImage,
      hasHandwriting: hasImage,
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
    var firstTextComment = "";
    var hasImage = false;
    var _normalizeText = __MN_OSTRACON_UTILS_MNOstraconAddon.normalizeText;
    try {
      var comments = arrayFromNSArray(note.comments);
      for (var i = 0; i < comments.length; i++) {
        var comment = comments[i];
        if (!comment || !comment.type) continue;
        if (!firstTextComment && comment.type === "TextNote") firstTextComment = _normalizeText(comment.text);
        if (comment.type === "PaintNote") hasImage = true;
      }
    } catch (_) {}

    return {
      id: String(note.noteId || ""),
      title: _normalizeText(note.noteTitle) || "未命名卡片",
      excerpt: _normalizeText(note.excerptText),
      comment: firstTextComment,
      sourceAnchor: "marginnote4app://note/" + String(note.noteId || ""),
      selected: false,
      hasImage: hasImage,
      hasHandwriting: hasImage,
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

  return {
    getSelectedCards,
    getSelectedCardsInfo,
    getCurrentNotebookInfo,
    listCurrentCards,
    listAllNotebooks,
    listAllCards,
    listCardsByIds,
    arrayFromNSArray,
  };
})();
