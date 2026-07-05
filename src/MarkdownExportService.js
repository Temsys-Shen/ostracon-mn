var __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var normalizeText = _utils.normalizeText;
  var imageDataURI = _utils.imageDataURI;
  var arrayFromNSArray = _utils.arrayFromNSArray;

  function sanitizeFilePart(value) {
    return normalizeText(value).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  }

  function normalizeOptions(options) {
    const src = options || {};
    return {
      mode: src.mode === "tree" ? "tree" : "flat",
      excerptStyle: src.excerptStyle === "plain" ? "plain" : "quote",
      includeImages: src.includeImages !== false,
      includeNoteIds: Boolean(src.includeNoteIds),
    };
  }

  function quoteMarkdownBlock(text) {
    return normalizeText(text).split("\n").map(function (line) {
      return line.length > 0 ? `> ${line}` : ">";
    }).join("\n");
  }

  function createWarningBag() {
    return { items: [], keys: {} };
  }

  function addWarning(warnings, key, message) {
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

  function appendExcerpt(lines, note, options, baseHeadingLevel, warnings) {
    const excerptText = normalizeText(note.excerptText);
    if (!excerptText) return;

    if (Number(note.excerptTextMarkdown) === 1) {
      appendBlock(lines, mapMarkdownHeadings(excerptText, baseHeadingLevel, warnings));
      return;
    }

    lines.push(options.excerptStyle === "quote" ? quoteMarkdownBlock(excerptText) : excerptText);
    lines.push("");
  }

  function renderNote(card, options, warnings) {
    const note = card.note;
    const titleText = normalizeText(note.noteTitle) || "Untitled Card";
    const headingLevel = options.mode === "tree" ? card.depth + 1 : 2;
    const contentBase = options.mode === "tree" ? headingLevel : 2;
    var lines = [];
    lines._warnings = warnings;
    var heading = `${headingPrefix(headingLevel, warnings)} ${titleText}`;
    if (options.includeNoteIds) heading += ` <!-- ostracon_noteid:${note.noteId} -->`;
    lines.push(heading);
    lines.push("");

    appendExcerpt(lines, note, options, contentBase, warnings);

    arrayFromNSArray(note.comments).forEach(function (comment, commentIndex) {
      if (!comment || !comment.type) return;
      if (comment.type === "TextNote") {
        appendTextComment(lines, comment, contentBase, warnings);
      } else if (comment.type === "PaintNote" && options.includeImages) {
        appendPaintComment(lines, note, comment, commentIndex, options);
      }
    });

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
      return renderNote(card, options, warnings);
    }).filter(function (s) { return s.length > 0; });

    var firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    var firstTitle = firstCard ? normalizeText(firstCard.noteTitle) : "";

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
