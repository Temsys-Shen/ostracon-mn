var __MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon = (function () {
  function arrayFromNSArray(value) {
    return __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(value);
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function imageDataURI(paintHash) {
    try {
      var data = Database.sharedInstance().getMediaByHash(paintHash);
      if (!data) return null;
      var b64 = data.base64Encoding();
      if (b64 && typeof b64 === "string") return "data:image/png;base64," + b64;
      console.log("[Ostracon] canvas imageDataURI failed:", typeof b64);
    } catch (e) {
      console.log("[Ostracon] canvas imageDataURI error:", String(e));
    }
    return null;
  }

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

  var NODE_WIDTH = 380;
  var NODE_GAP_X = 120;
  var NODE_GAP_Y = 80;
  var BASE_X = 100;
  var BASE_Y = 100;

  function assignCanvasPositions(nodes, roots, includeImages) {
    var layerHeights = {};
    var childCounts = {};

    function countDescendants(node) {
      var count = 0;
      node.children.forEach(function (child) {
        count += 1 + countDescendants(child);
      });
      return count;
    }

    roots.forEach(function (root) {
      childCounts[root.noteId] = countDescendants(root);
    });

    function heightFor(card) {
      return estimateHeight(nodeText(card.note, includeImages));
    }

    function positionNode(node, x, y) {
      var idx = nodes.findIndex(function (n) { return n.id === node.noteId; });
      if (idx >= 0) {
        nodes[idx].canvasX = Math.round(x);
        nodes[idx].canvasY = Math.round(y);
      }

      if (node.children.length === 0) return;

      var children = node.children;
      var totalChildWidth = 0;
      children.forEach(function (child) {
        var childHeight = heightFor(child);
        var descendants = countDescendants(child);
        var width = (descendants > 0 ? descendants * (NODE_WIDTH + NODE_GAP_X) : NODE_WIDTH);
        totalChildWidth += width;
      });

      var startX = x - Math.floor(totalChildWidth / 2) + Math.floor(NODE_WIDTH / 2);
      var currentX = startX;

      children.forEach(function (child) {
        var descendants = countDescendants(child);
        var blockWidth = (descendants > 0 ? descendants * (NODE_WIDTH + NODE_GAP_X) : NODE_WIDTH);
        var childX = currentX + Math.floor(blockWidth / 2) - Math.floor(NODE_WIDTH / 2);
        positionNode(child, childX, y + NODE_GAP_Y + heightFor(child));
        currentX += blockWidth;
      });
    }

    var rootY = BASE_Y;
    roots.forEach(function (root) {
      positionNode(root, BASE_X + Math.floor(NODE_WIDTH / 2), rootY);
      rootY += NODE_GAP_Y + heightFor(root);
    });
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
        width: NODE_WIDTH,
        height: estimateHeight(nodeText(card.note, includeImages)),
        text: nodeText(card.note, includeImages),
      };
    });

    assignCanvasPositions(nodes, treeRoots, includeImages);

    nodes.forEach(function (node) {
      node.x = node.canvasX || BASE_X;
      node.y = node.canvasY || BASE_Y;
      delete node.canvasX;
      delete node.canvasY;
    });

    var edges = [];
    function walkTree(node) {
      node.children.forEach(function (child) {
        if (!node.noteId || !child.noteId) return;
        edges.push({
          id: createId(),
          fromNode: node.noteId,
          fromSide: "bottom",
          toNode: child.noteId,
          toSide: "top",
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

  return { buildCanvas: buildCanvas };
})();
