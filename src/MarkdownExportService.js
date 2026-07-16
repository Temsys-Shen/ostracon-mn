var __MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var normalizeText = _utils.normalizeText;
  var _contentService = __MN_CARD_CONTENT_SERVICE_MNOstraconAddon;
  var parseNote = _contentService.parseNote;
  var resolveFileBaseName = _contentService.resolveFileBaseName;
  var resolveRootFileBaseName = _contentService.resolveRootFileBaseName;

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

  function appendImageComment(lines, comment) {
    lines.push(`![${comment.alt || ""}](${comment.dataURI})`);
    lines.push("");
  }

  function escapeLinkText(value) {
    return normalizeText(value).replace(/[[\]\\]/g, "\\$&");
  }

  function renderCardTemplate(template, context) {
    if (typeof template !== "string") throw new Error("卡片模板必须是字符串");
    var tokenPattern = /{{([\s\S]*?)}}/g;
    var output = "";
    var cursor = 0;
    var insideLink = false;
    var match;
    while ((match = tokenPattern.exec(template)) !== null) {
      if (!insideLink || context.link) output += template.slice(cursor, match.index);
      var expression = match[1].trim();
      if (expression === "#link") insideLink = true;
      else if (expression === "/link") insideLink = false;
      else if (!insideLink || context.link) {
        var parts = expression.split("|").map(function (part) { return part.trim(); });
        var variable = parts.shift();
        if (variable !== "content" && variable !== "title" && variable !== "heading") throw new Error("未知卡片模板变量: " + variable);
        var value = variable === "content" ? context.content : (variable === "title" ? context.title : context.heading);
        parts.forEach(function (filter) {
          if (filter === "trim") value = value.trim();
          else if (filter === "singleline") value = value.replace(/\s+/g, " ");
          else if (filter === "link" && variable === "title") value = context.link ? "[" + escapeLinkText(value) + "](" + context.link + ")" : value;
          else throw new Error("未知卡片模板过滤器: " + filter);
        });
        output += value;
      }
      cursor = tokenPattern.lastIndex;
    }
    if (insideLink) throw new Error("卡片模板缺少{{/link}}");
    output += template.slice(cursor);
    return output.trim();
  }

  function renderNote(card, options, warnings) {
    const note = card.note;
    const content = parseNote(note);
    const headingLevel = options.mode === "tree" ? card.depth + 1 : 2;
    const contentBase = options.mode === "tree" ? headingLevel : 2;
    var lines = [];

    for (var commentIndex = 0; commentIndex < content.comments.length; commentIndex++) {
      var comment = content.comments[commentIndex];
      if (comment.type === "text") {
        appendTextComment(lines, comment, contentBase, warnings);
      } else if (comment.type === "image" && options.includeImages) {
        appendImageComment(lines, comment);
      }
    }

    return {
      heading: headingPrefix(headingLevel, warnings),
      title: content.title,
      link: options.includeBacklinks && content.noteId && content.noteId !== "unknown"
        ? "marginnote4app://note/" + content.noteId : null,
      content: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    };
  }

  function getCardsByMode(selectionResult, mode) {
    if (mode === "tree") return selectionResult.treeCards;
    return selectionResult.flatCards;
  }

  function buildMarkdown(selectionResult, rawOptions) {
    var options = normalizeOptions(rawOptions);
    var warnings = createWarningBag();
    var cards = getCardsByMode(selectionResult, options.mode);
    var template = rawOptions && typeof rawOptions.cardTemplate === "string" ? rawOptions.cardTemplate : "{{heading}} {{title|link}}\n\n{{content}}";
    var sections = cards.map(function (card) {
      return renderCardTemplate(template, renderNote(card, options, warnings));
    }).filter(function (s) { return s.length > 0; });

    var firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    var firstTitle = options.mode === "tree"
      ? resolveRootFileBaseName(selectionResult)
      : (firstCard ? resolveFileBaseName(firstCard) : "Untitled");

    return {
      markdown: sections.join("\n\n") + "\n",
      noteCount: cards.length,
      fileBaseName: sanitizeFilePart(firstTitle || "Untitled"),
      warnings: warnings.items,
    };
  }

  return {
    buildMarkdown,
  };
})();
