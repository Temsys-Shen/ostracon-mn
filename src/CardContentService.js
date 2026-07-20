var __MN_CARD_CONTENT_SERVICE_MNOstraconAddon = (function () {
  var _utils = __MN_OSTRACON_UTILS_MNOstraconAddon;
  var normalizeText = _utils.normalizeText;
  var arrayFromNSArray = _utils.arrayFromNSArray;
  var getNoteId = _utils.getNoteId;
  var renderDrawingDataURI = __MN_INK_DRAWING_SERVICE_MNOstraconAddon.renderDrawingDataURI;
  var MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(marginnote4app:\/\/markdownimg\/(png|jpeg)\/([^\s)]+)\)/g;
  var sketchFailureLogKeys = {};

  function logSketchFailure(notebookId, noteId, drawingId, stage, error) {
    var key = [notebookId, noteId, drawingId, stage].join(":");
    if (sketchFailureLogKeys[key]) return;
    sketchFailureLogKeys[key] = true;
    console.log(
      "[Ostracon] 手写笔迹读取失败: notebookId=" + notebookId +
      ", noteId=" + noteId +
      ", drawing=" + drawingId +
      ", stage=" + stage +
      ", error=" + String(error),
    );
  }

  function loadMediaDataURI(noteId, mediaId, mimeType, source, commentIndex, strict) {
    try {
      var data = Database.sharedInstance().getMediaByHash(mediaId);
      if (!data) throw new Error("getMediaByHash未返回数据");
      var base64 = data.base64Encoding();
      if (!base64 || typeof base64 !== "string") throw new Error("base64Encoding未返回字符串");
      return "data:image/" + mimeType + ";base64," + base64;
    } catch (error) {
      var message = "媒体读取失败: noteId=" + noteId +
        ", source=" + source +
        ", commentIndex=" + commentIndex +
        ", mediaId=" + mediaId +
        ", error=" + String(error);
      if (strict) throw new Error(message);
      console.log("[Ostracon] " + message);
      return "";
    }
  }

  function createImageItem(noteId, mediaId, mimeType, source, commentIndex, alt, strict) {
    var dataURI = loadMediaDataURI(noteId, mediaId, mimeType, source, commentIndex, strict);
    if (!dataURI) return null;
    return {
      type: "image",
      mediaId: mediaId,
      mimeType: mimeType,
      source: source,
      index: commentIndex,
      alt: alt || "",
      dataURI: dataURI,
    };
  }

  function createDrawingItem(noteId, drawingId, source, commentIndex, alt) {
    var drawingBase64;
    try {
      var drawingData = Database.sharedInstance().getMediaByHash(drawingId);
      if (!drawingData) throw new Error("getMediaByHash未返回数据");
      drawingBase64 = drawingData.base64Encoding();
      if (!drawingBase64 || typeof drawingBase64 !== "string") throw new Error("base64Encoding未返回字符串");
    } catch (error) {
      throw new Error(
        "手写媒体读取失败: noteId=" + noteId +
        ", source=" + source +
        ", commentIndex=" + commentIndex +
        ", mediaId=" + drawingId +
        ", error=" + String(error),
      );
    }

    try {
      var renderedDrawing = renderDrawingDataURI(drawingBase64);
      return {
        type: "image",
        mediaId: drawingId,
        mimeType: "svg+xml",
        source: source,
        index: commentIndex,
        alt: alt || "",
        dataURI: renderedDrawing.dataURI,
        strokeCount: renderedDrawing.strokeCount,
        bounds: renderedDrawing.bounds,
      };
    } catch (error) {
      throw new Error(
        "手写解析失败: noteId=" + noteId +
        ", source=" + source +
        ", commentIndex=" + commentIndex +
        ", mediaId=" + drawingId +
        ", error=" + String(error),
      );
    }
  }

  function tokenizeTextComment(noteId, comment, commentIndex) {
    var sourceText = normalizeText(comment.text);
    if (!sourceText) return { items: [], title: "" };

    var images = [];
    var placeholderPrefix = "\u0000OSTRACON_IMAGE_";
    var encoded = sourceText.replace(MARKDOWN_IMAGE_PATTERN, function (_, alt, format, mediaId) {
      var imageIndex = images.length;
      images.push({ alt: alt, mimeType: format === "jpeg" ? "jpeg" : "png", mediaId: mediaId });
      return placeholderPrefix + imageIndex + "\u0000";
    });
    var lines = encoded.split("\n");
    var title = "";
    var titleLineIndex = -1;

    for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      var plainLine = lines[lineIndex].replace(/\u0000OSTRACON_IMAGE_\d+\u0000/g, "");
      var candidate = normalizeText(plainLine);
      if (candidate) {
        title = candidate;
        titleLineIndex = lineIndex;
        break;
      }
    }

    return {
      title: title,
      buildItems: function (removeTitleLine) {
        var outputLines = lines.slice();
        if (removeTitleLine && titleLineIndex >= 0) {
          outputLines[titleLineIndex] = (outputLines[titleLineIndex].match(/\u0000OSTRACON_IMAGE_\d+\u0000/g) || []).join("");
        }
        var body = outputLines.join("\n");
        var tokenPattern = /\u0000OSTRACON_IMAGE_(\d+)\u0000/g;
        var items = [];
        var cursor = 0;
        var match;

        while ((match = tokenPattern.exec(body)) !== null) {
          var before = normalizeText(body.slice(cursor, match.index));
          if (before) items.push({ type: "text", text: before, markdown: comment.markdown === true, index: commentIndex });
          var image = images[Number(match[1])];
          var imageItem = createImageItem(noteId, image.mediaId, image.mimeType, "textComment", commentIndex, image.alt, false);
          if (imageItem) items.push(imageItem);
          cursor = match.index + match[0].length;
        }

        var after = normalizeText(body.slice(cursor));
        if (after) items.push({ type: "text", text: after, markdown: comment.markdown === true, index: commentIndex });
        return {
          items: items,
          commentText: normalizeText(body.replace(/\u0000OSTRACON_IMAGE_\d+\u0000/g, "")),
        };
      },
    };
  }

  function resolveFileBaseName(note) {
    if (!note) return "Untitled";
    var title = normalizeText(note.noteTitle);
    if (title) return title;
    var excerpt = normalizeText(note.excerptText).replace(/\s+/g, " ");
    if (excerpt) return excerpt.slice(0, 40).trim();
    return "Untitled";
  }

  function resolveEarliestRootNote(selectionResult) {
    var roots = selectionResult && selectionResult.treeRoots ? selectionResult.treeRoots : [];
    if (roots.length === 0) return null;
    if (roots.length === 1) return roots[0].note;

    var earliest = roots[0];
    var earliestTime = earliest.note.createDate.getTime();
    for (var index = 1; index < roots.length; index++) {
      var root = roots[index];
      var time = root.note.createDate.getTime();
      if (time < earliestTime) {
        earliest = root;
        earliestTime = time;
      }
    }
    return earliest.note;
  }

  function resolveRootFileBaseName(selectionResult) {
    var note = resolveEarliestRootNote(selectionResult);
    return note ? resolveFileBaseName(note) : "Untitled";
  }

  function parseNote(note) {
    if (!note) throw new Error("缺少MN卡片对象");

    var noteId = getNoteId(note) || "unknown";
    var rawComments = arrayFromNSArray(note.comments);
    var title = normalizeText(note.noteTitle);
    var titleSourceIndex = -1;
    var comments = [];
    var commentTexts = [];
    var excerptPic = note.excerptPic;
    var hasExcerptPic = Boolean(excerptPic);
    var excerptMediaId = excerptPic ? normalizeText(excerptPic.paint) : "";
    var textFirst = note.textFirst === true || Number(note.textFirst) === 1;
    var excerptItems = [];
    var excerptTexts = [];

    if (hasExcerptPic && !textFirst) {
      if (excerptMediaId) {
        var excerptImage = createImageItem(noteId, excerptMediaId, "png", "excerptPic", -1, "excerpt", false);
        if (excerptImage) excerptItems.push(excerptImage);
      } else {
        console.log("[Ostracon] 媒体读取失败: noteId=" + noteId + ", source=excerptPic, commentIndex=-1, mediaId=");
      }
    }

    for (var index = 0; index < rawComments.length; index++) {
      var comment = rawComments[index];
      var type = comment ? String(comment.type || "") : "";

      if (type === "TextNote") {
        var tokenized = tokenizeTextComment(noteId, comment, index);
        var consumeTitle = !title && Boolean(tokenized.title);
        if (consumeTitle) {
          title = tokenized.title;
          titleSourceIndex = index;
        }
        var parsedText = tokenized.buildItems(consumeTitle);
        comments = comments.concat(parsedText.items);
        if (parsedText.commentText) commentTexts.push(parsedText.commentText);
        continue;
      }

      if (type === "LinkNote") {
        var linkPicture = comment.q_hpic;
        var linkMediaId = linkPicture ? normalizeText(linkPicture.paint) : "";
        var linkDrawingId = linkPicture ? normalizeText(linkPicture.drawing) : "";
        var linkTextFirst = comment.textFirst === true || Number(comment.textFirst) === 1;
        if (linkPicture && !linkTextFirst) {
          if (!linkMediaId && !linkDrawingId) {
            throw new Error("LinkNote.q_hpic缺少paint和drawing: noteId=" + noteId + ", commentIndex=" + index);
          }
          if (linkMediaId) {
            comments.push(createImageItem(noteId, linkMediaId, "png", "linkNote", index, "linked excerpt", true));
          }
          if (linkDrawingId) {
            comments.push(createDrawingItem(noteId, linkDrawingId, "linkNoteDrawing", index, "linked handwriting"));
          }
          continue;
        }
        var linkText = normalizeText(comment.q_htext);
        if (linkText) {
          var tokenizedLink = tokenizeTextComment(noteId, {
            text: linkText,
            markdown: comment.markdown === true || Number(comment.markdown) === 1,
          }, index);
          var parsedLink = tokenizedLink.buildItems(false);
          comments = comments.concat(parsedLink.items);
          if (parsedLink.commentText) commentTexts.push(parsedLink.commentText);
        }
        continue;
      }

      if (type === "PaintNote") {
        var mediaId = normalizeText(comment.paint);
        var commentDrawingId = normalizeText(comment.drawing);
        if (!mediaId && !commentDrawingId) {
          throw new Error("PaintNote缺少paint和drawing: noteId=" + noteId + ", commentIndex=" + index);
        }
        if (mediaId) comments.push(createImageItem(noteId, mediaId, "png", "paintNote", index, "paint note", true));
        if (commentDrawingId) {
          comments.push(createDrawingItem(noteId, commentDrawingId, "paintNoteDrawing", index, "handwriting"));
        }
      }
    }

    if (!hasExcerptPic || textFirst) {
      var excerptText = normalizeText(note.excerptText);
      if (excerptText) {
        var tokenizedExcerpt = tokenizeTextComment(noteId, {
          text: excerptText,
          markdown: Number(note.excerptTextMarkdown) === 1,
        }, -1);
        var consumeExcerptTitle = !title && Boolean(tokenizedExcerpt.title);
        if (consumeExcerptTitle) {
          title = tokenizedExcerpt.title;
          titleSourceIndex = -1;
        }
        var parsedExcerpt = tokenizedExcerpt.buildItems(consumeExcerptTitle);
        excerptItems = excerptItems.concat(parsedExcerpt.items);
        if (parsedExcerpt.commentText) excerptTexts.push(parsedExcerpt.commentText);
      }
    }

    comments = excerptItems.concat(comments);

    var notebookId = normalizeText(note.notebookId);
    if (notebookId && noteId !== "unknown") {
      var db = Database.sharedInstance();
      var sketchNote;
      try {
        sketchNote = db.getSketchNoteForMindMapFocusNoteId(notebookId, noteId);
      } catch (error) {
        logSketchFailure(notebookId, noteId, "", "query", error);
      }
      if (sketchNote) {
        var sketchComments = arrayFromNSArray(sketchNote.comments);
        var drawingId = sketchComments[0] ? normalizeText(sketchComments[0].drawing) : "";
        if (drawingId) {
          var drawingBase64 = "";
          try {
            var drawingData = db.getMediaByHash(drawingId);
            if (!drawingData) throw new Error("getMediaByHash未返回数据");
            drawingBase64 = drawingData.base64Encoding();
            if (!drawingBase64 || typeof drawingBase64 !== "string") throw new Error("base64Encoding未返回字符串");
          } catch (error) {
            logSketchFailure(notebookId, noteId, drawingId, "media", error);
          }
          if (drawingBase64) {
            try {
              var renderedDrawing = renderDrawingDataURI(drawingBase64);
              comments.push({
                type: "image",
                mediaId: drawingId,
                mimeType: "svg+xml",
                source: "sketchDrawing",
                index: -1,
                alt: "handwriting",
                dataURI: renderedDrawing.dataURI,
                strokeCount: renderedDrawing.strokeCount,
                bounds: renderedDrawing.bounds,
              });
            } catch (error) {
              logSketchFailure(notebookId, noteId, drawingId, "parse", error);
            }
          }
        }
      }
    }

    var imageComments = comments.filter(function (comment) { return comment.type === "image"; });
    var handwritingComments = imageComments.filter(function (comment) {
      return comment.source === "paintNote" || comment.source === "paintNoteDrawing" ||
        comment.source === "linkNoteDrawing" || comment.source === "sketchDrawing";
    });

    return {
      noteId: noteId,
      title: title || "无标题卡片",
      titleSourceIndex: titleSourceIndex,
      comments: comments,
      commentText: excerptTexts.concat(commentTexts).join("\n\n"),
      commentCount: rawComments.length,
      imageCount: imageComments.length,
      hasImage: imageComments.length > 0,
      hasHandwriting: handwritingComments.length > 0,
    };
  }

  return { parseNote: parseNote, resolveFileBaseName: resolveFileBaseName, resolveRootFileBaseName: resolveRootFileBaseName };
})();
