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

  return {
    getSelectedCards,
    getSelectedCardsInfo,
    arrayFromNSArray,
  };
})();
