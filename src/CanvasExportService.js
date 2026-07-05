var __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var normalizeText = _utils.normalizeText;
  var imageDataURI = _utils.imageDataURI;
  var arrayFromNSArray = _utils.arrayFromNSArray;

  function nodeText(note, includeImages) {
    var lines = [];
    var title = normalizeText(note.noteTitle) || "Untitled Card";
    var excerpt = normalizeText(note.excerptText);

    lines.push("## " + title);
    lines.push("");

    if (excerpt) {
      lines.push("> " + excerpt);
      lines.push("");
    }

    arrayFromNSArray(note.comments).forEach(function (comment) {
      if (!comment || !comment.type) return;
      if (comment.type === "TextNote") {
        var text = normalizeText(comment.text);
        if (text) { lines.push(text); lines.push(""); }
      } else if (comment.type === "PaintNote" && includeImages) {
        var uri = imageDataURI(comment.paint);
        if (uri) { lines.push("![](" + uri + ")"); lines.push(""); }
      }
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function renderNodeTextForSync(note, rawOptions) {
    if (!note) throw new Error("缺少要渲染的卡片");
    var options = rawOptions || {};
    var includeImages = options.includeImages !== false;
    return {
      noteId: String(note.noteId || ""),
      title: normalizeText(note.noteTitle) || "Untitled Card",
      canvasText: nodeText(note, includeImages),
    };
  }

  function createId() {
    function hex(len) {
      var s = "";
      for (var i = 0; i < len; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
      return s;
    }
    return hex(8) + "-" + hex(4) + "-4" + hex(3) + "-" + hex(4) + "-" + hex(12);
  }

  function estimateHeight(text) {
    var lineCount = text.split("\n").length;
    return Math.max(140, 60 + lineCount * 18);
  }

  var LAYOUT_CONFIG = {
    horizontalGap: 100,
    verticalGap: 24,
    nodeWidth: 380,
    baseX: 100,
    baseY: 100,
  };

  function contourLayout(roots, config, nodesById) {
    var positions = {};
    var cursorY = config.baseY;

    for (var ri = 0; ri < roots.length; ri++) {
      var root = roots[ri];
      var rootId = root.noteId;
      var rootH = nodesById[rootId].height;

      var rootX = config.baseX;
      var rootY = cursorY;
      positions[rootId] = { x: rootX, y: rootY };

      var childrenPositions = {};
      layoutGroup(root, root.children, "right", rootX, rootY, config, nodesById, childrenPositions);

      for (var id in childrenPositions) {
        positions[id] = childrenPositions[id];
      }

      var maxY = rootY + rootH;
      for (var id in childrenPositions) {
        var node = nodesById[id];
        if (positions[id].y + node.height > maxY) maxY = positions[id].y + node.height;
      }
      cursorY = maxY + config.verticalGap * 3;
    }

    return positions;
  }

  function layoutGroup(parentNode, children, direction, parentX, parentY, config, nodesById, allPositions) {
    if (children.length === 0) return;

    var parentH = nodesById[parentNode.noteId].height;
    var parentW = nodesById[parentNode.noteId].width;
    var parentCenterY = parentY + parentH / 2;

    var subtrees = [];
    for (var ci = 0; ci < children.length; ci++) {
      var child = children[ci];
      var childInfo = nodesById[child.noteId];
      var childW = childInfo.width;
      var childX = direction === "right"
        ? parentX + parentW + config.horizontalGap
        : parentX - childW - config.horizontalGap;

      var tempPositions = {};
      var contour = layoutSubtree(child, childX, 0, 0, direction, config, nodesById, tempPositions);
      subtrees.push({ positions: tempPositions, contour: contour });
    }

    var packResult = packSubtrees(subtrees, config.verticalGap);
    var yOffsets = packResult.yOffsets;

    var lastIdx = children.length - 1;
    var lastChildH = nodesById[children[lastIdx].noteId].height;
    var blockTop = yOffsets[0];
    var blockBottom = yOffsets[lastIdx] + lastChildH;
    var globalShift = parentCenterY - (blockTop + blockBottom) / 2;

    for (var si = 0; si < subtrees.length; si++) {
      var yShift = yOffsets[si] + globalShift;
      for (var id in subtrees[si].positions) {
        allPositions[id] = { x: subtrees[si].positions[id].x, y: subtrees[si].positions[id].y + yShift };
      }
    }
  }

  function layoutSubtree(node, nodeX, nodeY, depth, direction, config, nodesById, positions) {
    var nodeInfo = nodesById[node.noteId];
    var nodeH = nodeInfo.height;
    var nodeW = nodeInfo.width;

    positions[node.noteId] = { x: nodeX, y: nodeY };

    var contour = [];
    contour[depth] = { top: nodeY, bottom: nodeY + nodeH };

    if (node.children.length === 0) return contour;

    var childSubtrees = [];
    for (var ci = 0; ci < node.children.length; ci++) {
      var child = node.children[ci];
      var childInfo = nodesById[child.noteId];
      var childW = childInfo.width;
      var childX = direction === "right"
        ? nodeX + nodeW + config.horizontalGap
        : nodeX - childW - config.horizontalGap;

      var tempPositions = {};
      var childContour = layoutSubtree(child, childX, 0, depth + 1, direction, config, nodesById, tempPositions);
      childSubtrees.push({ positions: tempPositions, contour: childContour });
    }

    var packResult = packSubtrees(childSubtrees, config.verticalGap);
    var yOffsets = packResult.yOffsets;
    var combinedContour = packResult.combinedContour;

    var lastIdx = node.children.length - 1;
    var lastChildH = nodesById[node.children[lastIdx].noteId].height;
    var blockTop = yOffsets[0];
    var blockBottom = yOffsets[lastIdx] + lastChildH;
    var centerShift = (nodeY + nodeH / 2) - (blockTop + blockBottom) / 2;

    for (var si = 0; si < childSubtrees.length; si++) {
      var yShift = yOffsets[si] + centerShift;
      for (var id in childSubtrees[si].positions) {
        positions[id] = { x: childSubtrees[si].positions[id].x, y: childSubtrees[si].positions[id].y + yShift };
      }
    }

    for (var d = 0; d < combinedContour.length; d++) {
      if (combinedContour[d] !== undefined) {
        var shifted = { top: combinedContour[d].top + centerShift, bottom: combinedContour[d].bottom + centerShift };
        var existing = contour[d];
        if (existing !== undefined) {
          if (shifted.top < existing.top) existing.top = shifted.top;
          if (shifted.bottom > existing.bottom) existing.bottom = shifted.bottom;
        } else {
          contour[d] = { top: shifted.top, bottom: shifted.bottom };
        }
      }
    }

    return contour;
  }

  function packSubtrees(subtrees, verticalGap) {
    if (subtrees.length === 0) {
      return { yOffsets: [], combinedContour: [] };
    }

    var yOffsets = [0];
    var combinedContour = [];

    for (var d = 0; d < subtrees[0].contour.length; d++) {
      var ext = subtrees[0].contour[d];
      if (ext !== undefined) {
        combinedContour[d] = { top: ext.top, bottom: ext.bottom };
      }
    }

    for (var si = 1; si < subtrees.length; si++) {
      var contour = subtrees[si].contour;
      var shift = 0;

      for (var d = 0; d < contour.length; d++) {
        var ext = contour[d];
        if (ext !== undefined) {
          var prev = combinedContour[d];
          if (prev !== undefined) {
            var needed = prev.bottom + verticalGap - ext.top;
            if (needed > shift) shift = needed;
          }
        }
      }

      yOffsets.push(shift);

      for (var d = 0; d < contour.length; d++) {
        var ext = contour[d];
        if (ext !== undefined) {
          var shifted = { top: ext.top + shift, bottom: ext.bottom + shift };
          var existing = combinedContour[d];
          if (existing !== undefined) {
            if (shifted.top < existing.top) existing.top = shifted.top;
            if (shifted.bottom > existing.bottom) existing.bottom = shifted.bottom;
          } else {
            combinedContour[d] = { top: shifted.top, bottom: shifted.bottom };
          }
        }
      }
    }

    return { yOffsets: yOffsets, combinedContour: combinedContour };
  }

  function computeEdgeSide(fromNode, toNode) {
    var fromCx = fromNode.x + fromNode.width / 2;
    var toCx = toNode.x + toNode.width / 2;
    if (toCx >= fromCx) {
      return { fromSide: "right", toSide: "left" };
    } else {
      return { fromSide: "left", toSide: "right" };
    }
  }

  function buildCanvas(selectionResult, rawOptions) {
    var options = rawOptions || {};
    var includeImages = options.includeImages !== false;
    var flatCards = selectionResult.flatCards;
    var treeRoots = selectionResult.treeRoots;

    var nodes = flatCards.map(function (card) {
      return {
        id: card.noteId,
        type: "text",
        x: 0,
        y: 0,
        width: LAYOUT_CONFIG.nodeWidth,
        height: estimateHeight(nodeText(card.note, includeImages)),
        text: nodeText(card.note, includeImages),
      };
    });

    var nodesById = {};
    nodes.forEach(function (node) {
      nodesById[node.id] = node;
    });

    var positions = contourLayout(treeRoots, LAYOUT_CONFIG, nodesById);

    nodes.forEach(function (node) {
      if (positions[node.id]) {
        node.x = Math.round(positions[node.id].x);
        node.y = Math.round(positions[node.id].y);
      } else {
        node.x = LAYOUT_CONFIG.baseX;
        node.y = LAYOUT_CONFIG.baseY;
      }
    });

    var edges = [];
    function walkTree(node) {
      node.children.forEach(function (child) {
        if (!node.noteId || !child.noteId) return;
        var fromNode = nodesById[node.noteId];
        var toNode = nodesById[child.noteId];
        var side = computeEdgeSide(fromNode, toNode);
        edges.push({
          id: createId(),
          fromNode: node.noteId,
          fromSide: side.fromSide,
          toNode: child.noteId,
          toSide: side.toSide,
        });
        walkTree(child);
      });
    }
    treeRoots.forEach(walkTree);

    var canvasObj = { nodes: nodes, edges: edges };
    return {
      canvas: JSON.stringify(canvasObj, null, 2),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  }

  return { buildCanvas: buildCanvas, renderNodeTextForSync: renderNodeTextForSync };
})();
