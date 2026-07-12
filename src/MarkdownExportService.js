var __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var normalizeText = _utils.normalizeText;
  var imageDataURI = _utils.imageDataURI;
  var arrayFromNSArray = _utils.arrayFromNSArray;
  var resolveNoteTitle = _utils.resolveNoteTitle;
  var usesExcerptAsTitle = _utils.usesExcerptAsTitle;

  function sanitizeFilePart(value) {
    return normalizeText(value).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  }

  function normalizeOptions(options) {
    const src = options || {};
    return {
      mode: src.mode === "tree" ? "tree" : "flat",
      includeImages: src.includeImages !== false,
      includeBacklinks: src.includeBacklinks !== false,
    };
  }

  function createWarningBag() {
    return { items: [], keys: {} };
  }

  function addWarning(warnings, key, message) {
    if (!warnings) return;
    if (warnings.keys[key]) return;
    warnings.keys[key] = true;
    warnings.items.push(message);
  }

  function headingPrefix(level, warnings) {
    if (level <= 6) return "#".repeat(level);
    addWarning(warnings, "heading-clamped", "存在超过6级的标题层级，已截断");
    return "######";
  }

  function appendBlock(lines, text) {
    const n = normalizeText(text);
    if (!n) return;
    lines.push(n);
    lines.push("");
  }

  function appendTextComment(lines, comment, baseHeadingLevel, warnings) {
    const text = normalizeText(comment.text);
    if (!text) return;
    if (comment.markdown === true) {
      appendBlock(lines, mapMarkdownHeadings(text, baseHeadingLevel, warnings));
      return;
    }
    appendBlock(lines, text);
  }

  function mapMarkdownHeadings(text, baseHeadingLevel, warnings) {
    const normalized = normalizeText(text);
    if (!normalized) return "";
    return normalized.split("\n").map(function (line) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!match) return line;
      const nestedLevel = baseHeadingLevel + match[1].length;
      return `${headingPrefix(nestedLevel, warnings)} ${match[2]}`;
    }).join("\n");
  }

  function appendPaintComment(lines, note, comment, commentIndex, options) {
    var uri = imageDataURI(comment.paint);
    if (uri) {
      lines.push(`![paint note](${uri})`);
    } else {
      addWarning(lines._warnings || null, "paint-missing-" + note.noteId + "-" + commentIndex, "手写图片获取失败");
    }
    lines.push("");
  }

  function appendExcerptImage(lines, note, options, warnings) {
    if (!options.includeImages) return;
    var paintHash = note && note.excerptPic ? note.excerptPic.paint : "";
    if (!paintHash) return;
    var uri = imageDataURI(paintHash);
    if (uri) {
      lines.push(`![excerpt image](${uri})`);
      lines.push("");
      return;
    }
    addWarning(warnings, "excerpt-image-missing-" + note.noteId, "摘录图片获取失败");
  }

  function appendExcerpt(lines, note, options, baseHeadingLevel, warnings) {
    if (usesExcerptAsTitle(note)) return;
    const excerptText = normalizeText(note.excerptText);
    if (!excerptText) return;

    if (Number(note.excerptTextMarkdown) === 1) {
      appendBlock(lines, mapMarkdownHeadings(excerptText, baseHeadingLevel, warnings));
      return;
    }

    lines.push(excerptText);
    lines.push("");
  }

  function appendLinkCommentGroup(lines, note, comments, startIndex, options, baseHeadingLevel, warnings, visitedNoteIds) {
    var linkComment = comments[startIndex];
    var linkedNoteId = String(linkComment.noteid || linkComment.noteId || "");
    if (!linkedNoteId) {
      addWarning(warnings, "link-note-missing-id-" + note.noteId + "-" + startIndex, "合并卡片缺少noteid");
      return startIndex + 1;
    }

    var groupedText = [];
    var linkText = normalizeText(linkComment.q_htext);
    if (linkText) groupedText.push(linkText);

    var nextIndex = startIndex + 1;
    while (nextIndex < comments.length) {
      var nextComment = comments[nextIndex];
      var nextNoteId = nextComment ? String(nextComment.noteid || nextComment.noteId || "") : "";
      if (!nextComment || nextComment.type !== "TextNote" || nextNoteId !== linkedNoteId) break;
      var text = normalizeText(nextComment.text);
      if (text) groupedText.push(text);
      nextIndex++;
    }

    if (groupedText.length === 0) {
      addWarning(warnings, "link-note-empty-" + note.noteId + "-" + linkedNoteId, "合并卡片内容为空");
      return nextIndex;
    }

    var linkedNote = Database.sharedInstance().getNoteById(linkedNoteId);
    var titleText = linkedNote ? resolveNoteTitle(linkedNote, options) : "Linked Card";
    if (!linkedNote) {
      addWarning(warnings, "link-note-missing-target-" + note.noteId + "-" + linkedNoteId, "合并卡片目标不存在");
    }
    if (visitedNoteIds && visitedNoteIds[linkedNoteId]) {
      addWarning(warnings, "link-note-cycle-" + note.noteId + "-" + linkedNoteId, "合并卡片存在循环引用");
    }

    lines.push(`${headingPrefix(baseHeadingLevel + 1, warnings)} ${titleText}`);
    lines.push("");
    appendBlock(lines, groupedText.join("\n\n"));
    return nextIndex;
  }

  function renderNote(card, options, warnings, visitedNoteIds) {
    const note = card.note;
    const titleText = resolveNoteTitle(note, options);
    const headingLevel = options.mode === "tree" ? card.depth + 1 : 2;
    const contentBase = options.mode === "tree" ? headingLevel : 2;
    var lines = [];
    lines._warnings = warnings;
    var nextVisitedNoteIds = { ...(visitedNoteIds || {}) };
    if (note && note.noteId) nextVisitedNoteIds[String(note.noteId)] = true;
    var heading = `${headingPrefix(headingLevel, warnings)} ${titleText}`;
    lines.push(heading);
    lines.push("");

    appendExcerpt(lines, note, options, contentBase, warnings);
    appendExcerptImage(lines, note, options, warnings);

    var comments = arrayFromNSArray(note.comments);
    for (var commentIndex = 0; commentIndex < comments.length;) {
      var comment = comments[commentIndex];
      if (!comment || !comment.type) {
        commentIndex++;
        continue;
      }
      if (comment.type === "TextNote") {
        appendTextComment(lines, comment, contentBase, warnings);
        commentIndex++;
      } else if (comment.type === "PaintNote" && options.includeImages) {
        appendPaintComment(lines, note, comment, commentIndex, options);
        commentIndex++;
      } else if (comment.type === "LinkNote") {
        commentIndex = appendLinkCommentGroup(lines, note, comments, commentIndex, options, contentBase, warnings, nextVisitedNoteIds);
      } else {
        commentIndex++;
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function getCardsByMode(selectionResult, mode) {
    if (mode === "tree") return selectionResult.treeCards;
    return selectionResult.flatCards;
  }

  function buildMarkdown(selectionResult, rawOptions) {
    var options = normalizeOptions(rawOptions);
    var warnings = createWarningBag();
    var cards = getCardsByMode(selectionResult, options.mode);
    var sections = cards.map(function (card) {
      return renderNote(card, options, warnings, {});
    }).filter(function (s) { return s.length > 0; });

    var firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    var firstTitle = firstCard ? resolveNoteTitle(firstCard, options) : "";

    return {
      markdown: sections.join("\n\n") + "\n",
      noteCount: cards.length,
      fileBaseName: sanitizeFilePart(firstTitle || "ostracon-export"),
      warnings: warnings.items,
    };
  }

  return {
    buildMarkdown,
  };
})();
