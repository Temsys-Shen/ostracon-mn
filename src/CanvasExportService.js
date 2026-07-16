var __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var arrayFromNSArray = _utils.arrayFromNSArray;
  var MN_COLORS = _utils.MN_COLORS;
  var _contentService = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon;
  var parseNote = _contentService.parseNote;
  var resolveRootFileBaseName = _contentService.resolveRootFileBaseName;

  function nodeText(note, includeImages, options) {
    var lines = [];
    var content = parseNote(note);

    lines.push("## " + content.title);
    lines.push("");

    content.comments.forEach(function (comment) {
      if (comment.type === "text") {
        lines.push(comment.text);
        lines.push("");
      } else if (comment.type === "image" && includeImages) {
        lines.push("![" + (comment.alt || "") + "](" + comment.dataURI + ")");
        lines.push("");
      }
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
      var text = nodeText(card.note, includeImages, options);
      var node = {
        id: card.noteId,
        type: "text",
        x: 0,
        y: 0,
        width: LAYOUT_CONFIG.nodeWidth,
        height: estimateHeight(text),
        text: text,
      };
      if (card.note.colorIndex >= 0) {
        node.color = MN_COLORS[card.note.colorIndex];
      }
      return node;
    });

    var nodesById = {};
    nodes.forEach(function (node) {
      nodesById[node.id] = node;
    });

    var nodeMap = {};
    flatCards.forEach(function (card) {
      nodeMap[card.noteId] = { isSummary: card.note.summary === true };
    });

    /* ── 从树中剪掉 summary 卡片，记录它们的上级 ── */
    function pruneTree(roots) {
      var removed = {};
      function walk(n, parentId) {
        if (nodeMap[n.noteId] && nodeMap[n.noteId].isSummary) {
          removed[n.noteId] = parentId;
          var promoted = [];
          n.children.forEach(function (c) {
            var r = walk(c, n.noteId);
            if (r) promoted = promoted.concat(r);
          });
          return promoted;
        }
        var kids = [];
        n.children.forEach(function (c) {
          var r = walk(c, n.noteId);
          if (r) kids = kids.concat(r);
        });
        return [{ noteId: n.noteId, children: kids }];
      }
      var out = [];
      roots.forEach(function (r) {
        var r2 = walk(r, null);
        if (r2) out = out.concat(r2);
      });
      return { roots: out, removed: removed };
    }

    var pruned = pruneTree(treeRoots);
    var summaryParents = pruned.removed;

    var positions = contourLayout(pruned.roots, LAYOUT_CONFIG, nodesById);

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
        if (nodeMap[child.noteId] && nodeMap[child.noteId].isSummary) return;
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

    /* ── summary 卡片：放在上级的子树右侧 ── */
    function subtreeRightEdge(parentId, roots) {
      var ids = {};
      function collect(n) {
        ids[n.noteId] = true;
        n.children.forEach(collect);
      }
      function find(ns) {
        for (var i = 0; i < ns.length; i++) {
          if (ns[i].noteId === parentId) { collect(ns[i]); return true; }
          if (find(ns[i].children)) return true;
        }
        return false;
      }
      if (!find(roots)) return null;
      var right;
      nodes.forEach(function (n) {
        if (ids[n.id]) {
          var r = n.x + n.width;
          if (right === undefined || r > right) right = r;
        }
      });
      return right;
    }

    var SUMMARY_GAP = 24;
    var summaryCards = flatCards.filter(function (card) { return card.note.summary === true; });
    summaryCards.forEach(function (card) {
      var summaryId = card.noteId;
      var summaryNode = nodesById[summaryId];
      if (!summaryNode) return;
      var linkIds = arrayFromNSArray(card.note.summaryLinks);

      /* 收集已在画布上的被引用卡片，计算 x/y */
      var refs = [];
      linkIds.forEach(function (uuid) {
        var child = nodesById[uuid];
        if (child) refs.push(child);
      });

      if (refs.length > 0) {
        var maxRight = 0, sumY = 0;
        refs.forEach(function (r) {
          var rEdge = r.x + r.width;
          if (rEdge > maxRight) maxRight = rEdge;
          sumY += r.y;
        });
        summaryNode.x = maxRight + LAYOUT_CONFIG.horizontalGap;
        summaryNode.y = Math.round(sumY / refs.length);
      } else {
        var right = summaryParents[summaryId] ? subtreeRightEdge(summaryParents[summaryId], pruned.roots) : null;
        summaryNode.x = right !== null ? right + LAYOUT_CONFIG.horizontalGap * 2 : LAYOUT_CONFIG.baseX;
        summaryNode.y = LAYOUT_CONFIG.baseY;
      }

      /* 不在画布上的子卡片从 DB 取出，堆在 summary 下方 */
      var cursorY = summaryNode.y + summaryNode.height + SUMMARY_GAP;
      linkIds.forEach(function (uuid) {
        var existing = nodesById[uuid];
        if (!existing) {
          var childNote = Database.sharedInstance().getNoteById(uuid);
          if (!childNote) return;
          var childNode = {
            id: uuid, type: "text",
            x: summaryNode.x, y: cursorY,
            width: LAYOUT_CONFIG.nodeWidth,
            height: estimateHeight(nodeText(childNote, includeImages, options)),
            text: nodeText(childNote, includeImages, options),
          };
          if (childNote.colorIndex >= 0) {
            childNode.color = MN_COLORS[childNote.colorIndex];
          }
          nodes.push(childNode);
          nodesById[uuid] = childNode;
          cursorY = childNode.y + childNode.height + SUMMARY_GAP;
        }
        edges.push({
          id: createId(), fromNode: uuid, fromSide: "right",
          toNode: summaryId, toSide: "left",
        });
      });
    });

    var canvasObj = { nodes: nodes, edges: edges };
    return {
      canvas: JSON.stringify(canvasObj, null, 2),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileBaseName: resolveRootFileBaseName(selectionResult),
    };
  }

  return { buildCanvas: buildCanvas };
})();
