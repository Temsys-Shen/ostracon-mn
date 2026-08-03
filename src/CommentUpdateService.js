// 评论读写正式服务（P1）：OB 端编辑 MN 卡片 Markdown 评论
// - listComments: 返回卡片结构化评论列表（含 index/type/markdown/text）
// - updateComment: 原位替换某条 Markdown 评论
//   实现：removeCommentByIndex(i) + appendMarkdownComment(新文本)
//   + sortCommentsByNewIndices 恢复原位（已验证为"来源索引"语义：
//   newIndices[k] = 新顺序第 k 位取自当前数组的索引）
//   全部在 UndoManager.undoGrouping 内，可 Cmd+Z 撤销。

var __MN_COMMENT_UPDATE_SERVICE_MNOstraconAddon = (function () {
  function getNote(noteId) {
    if (!noteId) throw new Error("缺少 noteId");
    const note = Database.sharedInstance().getNoteById(String(noteId));
    if (!note) {
      const error = new Error("卡片不存在");
      error.code = "NOTE_NOT_FOUND";
      throw error;
    }
    return note;
  }

  function normalizeComment(comment, index) {
    const type = comment ? String(comment.type || "") : "";
    const text = comment ? String(comment.text || "") : "";
    const markdown = comment ? (comment.markdown === true || Number(comment.markdown) === 1) : false;
    const paint = comment && comment.paint ? String(comment.paint) : "";
    return { commentIndex: index, type, markdown, text, paint };
  }

  function listComments(context, payload) {
    const note = getNote(payload && payload.noteId);
    const comments = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(note.comments);
    return {
      noteId: String(note.noteId || ""),
      notebookId: String(note.notebookId || ""),
      excerpt: {
        text: String(note.excerptText || ""),
        markdown: Number(note.excerptTextMarkdown) === 1,
      },
      comments: comments.map(normalizeComment),
    };
  }

  // 原位替换后恢复顺序所需的 newIndices（来源索引语义）
  function buildRestoreIndices(commentCountAfterAppend, originalIndex) {
    const indices = [];
    for (let k = 0; k < commentCountAfterAppend; k += 1) {
      if (k < originalIndex) indices.push(k);
      else if (k === originalIndex) indices.push(commentCountAfterAppend - 1);
      else indices.push(k - 1);
    }
    return indices;
  }

  function updateComment(context, payload) {
    try {
      return doUpdate(payload);
    } catch (error) {
      console.log("[Ostracon] updateComment 失败: " + String(error && error.message ? error.message : error));
      throw error;
    }
  }

  function doUpdate(payload) {
    if (!payload || typeof payload !== "object") throw new Error("updateComment payload 必须是对象");
    const noteId = String(payload.noteId || "");
    const commentIndex = Number(payload.commentIndex);
    const markdown = String(payload.markdown || "");
    if (!Number.isInteger(commentIndex) || commentIndex < 0) {
      const error = new Error("commentIndex 无效");
      error.code = "COMMENT_INDEX_INVALID";
      throw error;
    }
    const clearComment = markdown.trim().length === 0; // 空内容 = 删除该评论

    const note = getNote(noteId);
    const notebookId = String(note.notebookId || "");
    const commentsBefore = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(note.comments);
    if (commentIndex >= commentsBefore.length) {
      const error = new Error("评论索引越界（卡片评论数 " + commentsBefore.length + "）");
      error.code = "COMMENT_INDEX_INVALID";
      throw error;
    }
    const target = commentsBefore[commentIndex];
    const targetType = target ? String(target.type || "") : "";
    const targetMarkdown = target ? (target.markdown === true || Number(target.markdown) === 1) : false;
    if (targetType !== "TextNote" || !targetMarkdown) {
      const error = new Error("目标评论不是 Markdown 评论（type=" + targetType + "）");
      error.code = "COMMENT_INDEX_INVALID";
      throw error;
    }

    const isLast = commentIndex === commentsBefore.length - 1;
    const writeComments = function () {
      note.removeCommentByIndex(commentIndex);
      if (clearComment) return; // 清空 = 删除评论，不追加
      note.appendMarkdownComment(markdown);
      if (!isLast) {
        // 需要把末尾新评论移回原位（来源索引语义）
        const countAfterAppend = commentsBefore.length; // 删除 1 条 + 追加 1 条，长度不变
        note.sortCommentsByNewIndices(buildRestoreIndices(countAfterAppend, commentIndex));
      }
    };
    try {
      // undoGrouping 需要目标笔记本处于打开状态；未打开时会抛错，降级为直接写入
      UndoManager.sharedInstance().undoGrouping(clearComment ? "删除评论" : "更新评论", notebookId, writeComments);
    } catch (error) {
      console.log("[Ostracon] undoGrouping 不可用（笔记本可能未打开），降级直接写入: " + String(error && error.message ? error.message : error));
      writeComments();
    }

    try {
      Application.sharedInstance().refreshAfterDBChanged(notebookId);
    } catch (error) {
      console.log("[Ostracon] refreshAfterDBChanged 失败（忽略）: " + String(error && error.message ? error.message : error));
    }
    return {
      noteId,
      notebookId,
      commentIndex,
      markdown,
      cleared: clearComment,
      restored: !isLast && !clearComment,
    };
  }

  function appendComment(context, payload) {
    if (!payload || typeof payload !== "object") throw new Error("appendComment payload 必须是对象");
    const noteId = String(payload.noteId || "");
    const markdown = String(payload.markdown || "");
    if (markdown.trim().length === 0) throw new Error("评论内容为空");
    const note = getNote(noteId);
    const notebookId = String(note.notebookId || "");
    const undoFn = function () {
      note.appendMarkdownComment(markdown);
    };
    try {
      UndoManager.sharedInstance().undoGrouping("追加评论", notebookId, undoFn);
    } catch (error) {
      console.log("[Ostracon] undoGrouping 不可用，降级直接写入: " + String(error && error.message ? error.message : error));
      undoFn();
    }
    refreshNotebook(notebookId);
    const freshNote = Database.sharedInstance().getNoteById(noteId);
    const comments = freshNote ? __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(freshNote.comments) : [];
    return {
      noteId,
      notebookId,
      commentIndex: Math.max(0, comments.length - 1),
    };
  }

  function createChildCard(context, payload) {
    if (!payload || typeof payload !== "object") throw new Error("createChildCard payload 必须是对象");
    const parentNoteId = String(payload.parentNoteId || "");
    const title = String(payload.title || "").trim(); // 标题允许为空
    const markdown = String(payload.markdown || "").trim();
    if (!parentNoteId) throw new Error("缺少父卡片 noteId");
    const parent = getNote(parentNoteId);
    const notebookId = String(parent.notebookId || "");
    let child = null;
    const undoFn = function () {
      child = Database.sharedInstance().createNoteWithTitleTopicid(title, notebookId);
      if (!child) throw new Error("MN 创建子卡片失败");
      parent.addChild(child);
      if (markdown) {
        child.appendMarkdownComment(markdown);
        child.processMarkdownBase64Images();
      }
    };
    try {
      UndoManager.sharedInstance().undoGrouping("创建子卡片", notebookId, undoFn);
    } catch (error) {
      console.log("[Ostracon] undoGrouping 不可用，降级直接写入: " + String(error && error.message ? error.message : error));
      undoFn();
    }
    refreshNotebook(notebookId);
    return {
      parentNoteId,
      noteId: child ? String(child.noteId || "") : "",
      notebookId,
      title,
    };
  }

  function refreshNotebook(notebookId) {
    try {
      Application.sharedInstance().refreshAfterDBChanged(notebookId);
    } catch (error) {
      console.log("[Ostracon] refreshAfterDBChanged 失败（忽略）: " + String(error && error.message ? error.message : error));
    }
  }

  return { listComments, updateComment, appendComment, createChildCard };
})();
