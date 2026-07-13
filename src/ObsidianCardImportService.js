var __MN_OBSIDIAN_CARD_IMPORT_SERVICE_MNOstraconAddon = (function () {
  const sessions = {};
  const MAX_CHUNK_CHARS = 16000;
  const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

  function studyController(context) {
    var targetWindow = context.addon && context.addon.window ? context.addon.window : context.controller.addonWindow;
    var controller = Application.sharedInstance().studyController(targetWindow);
    if (!controller || !controller.notebookController) throw new Error("当前未打开学习集");
    return controller;
  }

  function insertContext(context) {
    var controller = studyController(context);
    var notebookId = String(controller.notebookController.notebookId || "");
    if (!notebookId) throw new Error("当前学习集缺少notebookId");
    var notebook = Database.sharedInstance().getNotebookById(notebookId);
    if (!notebook) throw new Error("未找到当前学习集: " + notebookId);
    var selection = __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.getSelectedCardsOrEmpty(context);
    var selected = selection.flatCards || [];
    var parent = selected.length === 1 ? selected[0].note : null;
    return {
      controller: controller,
      notebook: notebook,
      notebookId: notebookId,
      selectedCount: selected.length,
      parent: parent,
      targetKind: parent ? "child" : "root",
      targetTitle: parent ? __MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(parent).title : String(notebook.title || "当前学习集"),
    };
  }

  function tempDirectory() {
    var path = Application.sharedInstance().tempPath + "/OstraconImportSessions";
    var manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(path)) {
      var created = manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null);
      if (!created) throw new Error("无法创建导入临时目录");
    }
    return path;
  }

  function decodeBase64(value) {
    var url = NSURL.URLWithString("data:application/octet-stream;base64," + String(value || ""));
    var data = url ? NSData.dataWithContentsOfURL(url) : null;
    if (!data) throw new Error("导入分块Base64解码失败");
    return data;
  }

  function createSession(context, payload) {
    var expectedByteLength = Number(payload && payload.expectedByteLength || 0);
    if (!Number.isFinite(expectedByteLength) || expectedByteLength <= 0 || expectedByteLength > MAX_TOTAL_BYTES) {
      throw new Error("导入内容大小无效或超过50MB");
    }
    var sessionId = String(NSUUID.UUID().UUIDString());
    var path = tempDirectory() + "/" + sessionId + ".json.part";
    if (!NSData.data().writeToFileAtomically(path, true)) throw new Error("无法创建导入临时文件");
    var handle = NSFileHandle.fileHandleForWritingAtPath(path);
    if (!handle) throw new Error("无法打开导入临时文件");
    sessions[sessionId] = { path: path, handle: handle, expectedByteLength: expectedByteLength, receivedByteLength: 0, nextChunk: 0 };
    return { sessionId: sessionId, maxChunkChars: MAX_CHUNK_CHARS };
  }

  function appendChunk(context, payload) {
    var session = sessions[String(payload && payload.sessionId || "")];
    if (!session) throw new Error("导入会话不存在");
    var index = Number(payload.chunkIndex);
    var chunk = String(payload.base64Chunk || "");
    if (index !== session.nextChunk) throw new Error("导入分块顺序错误: " + index);
    if (chunk.length > MAX_CHUNK_CHARS || chunk.length % 4 !== 0) throw new Error("导入分块长度无效");
    var data = decodeBase64(chunk);
    session.handle.seekToEndOfFile();
    session.handle.writeData(data);
    session.receivedByteLength += Number(data.length());
    session.nextChunk += 1;
    if (session.receivedByteLength > session.expectedByteLength) throw new Error("导入内容超过声明大小");
    return { receivedChunks: session.nextChunk, receivedByteLength: session.receivedByteLength };
  }

  function cleanup(sessionId) {
    var session = sessions[sessionId];
    if (!session) return;
    if (session.handle) session.handle.closeFile();
    var manager = NSFileManager.defaultManager();
    if (manager.fileExistsAtPath(session.path)) {
      var cleared = NSData.data().writeToFileAtomically(session.path, true);
      if (!cleared) throw new Error("无法清空导入临时文件: " + session.path);
    }
    delete sessions[sessionId];
  }

  function finalize(context, payload) {
    var sessionId = String(payload && payload.sessionId || "");
    var session = sessions[sessionId];
    if (!session) throw new Error("导入会话不存在");
    if (session.receivedByteLength !== session.expectedByteLength) throw new Error("导入内容字节数不完整");
    session.handle.synchronizeFile();
    session.handle.closeFile();
    session.handle = null;
    try {
      var data = NSData.dataWithContentsOfFile(session.path);
      var text = data ? String(NSString.stringWithContentsOfData(data) || "") : "";
      if (!text) throw new Error("导入内容为空");
      var document = JSON.parse(text);
      var operation = String(document.operation || "");
      var title = String(document.title || "").trim();
      var markdown = String(document.markdown || "").trim();
      if (operation !== "create" && operation !== "append") throw new Error("不支持的Obsidian导入操作: " + operation);
      if (!title) throw new Error("Obsidian文档缺少标题");
      if (!markdown) throw new Error("Obsidian文档正文为空");

      var target = insertContext(context);
      if (operation === "append" && (!target.parent || target.selectedCount !== 1)) {
        throw new Error("请先单选一张卡片");
      }
      var targetNote = null;
      var sourceMarker = "\n\n<!-- ostracon_ob_path:" + String(document.sourcePath || "") + " mtime:" + String(document.mtime || "") + " -->";
      var undoTitle = operation === "append" ? "追加Obsidian文档" : "创建Obsidian卡片";
      UndoManager.sharedInstance().undoGrouping(undoTitle, target.notebookId, function () {
        if (operation === "create") {
          targetNote = Database.sharedInstance().createNoteWithTitleTopicid(title, target.notebookId);
          if (!targetNote) throw new Error("MN创建卡片失败");
          if (target.parent) target.parent.addChild(targetNote);
        } else {
          targetNote = target.parent;
        }
        targetNote.appendMarkdownComment(markdown + sourceMarker);
        targetNote.processMarkdownBase64Images();
      });
      Application.sharedInstance().refreshAfterDBChanged(target.notebookId);
      target.controller.focusNoteInMindMapById(targetNote.noteId);
      return {
        ok: true,
        operation: operation,
        noteId: String(targetNote.noteId || ""),
        title: title,
        targetKind: operation === "append" ? "existing" : target.targetKind,
        targetTitle: target.targetTitle,
      };
    } finally {
      cleanup(sessionId);
    }
  }

  function abort(context, payload) {
    cleanup(String(payload && payload.sessionId || ""));
    return { aborted: true };
  }

  function getInsertContext(context) {
    var target = insertContext(context);
    return { notebookId: target.notebookId, notebookTitle: String(target.notebook.title || "当前学习集"), selectedCount: target.selectedCount, targetKind: target.targetKind, targetTitle: target.targetTitle };
  }

  return { getInsertContext, createSession, appendChunk, finalize, abort };
})();
