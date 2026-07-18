var __MN_OBSIDIAN_PDF_IMPORT_SERVICE_MNOstraconAddon = (function () {
  const sessions = {};
  const MAX_CHUNK_CHARS = 16000;
  const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

  function studyController(context) {
    var targetWindow = context.addon && context.addon.window ? context.addon.window : context.controller.addonWindow;
    var controller = Application.sharedInstance().studyController(targetWindow);
    if (!controller || !controller.notebookController) throw new Error("当前未打开学习集");
    return controller;
  }

  function ensureDirectory(path) {
    var manager = NSFileManager.defaultManager();
    if (manager.fileExistsAtPath(path)) {
      if (!manager.isDirectoryAtPath(path)) throw new Error("PDF导入路径不是目录: " + path);
      return;
    }
    if (!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null)) throw new Error("无法创建PDF导入目录: " + path);
  }

  function tempDirectory() {
    var path = Application.sharedInstance().tempPath + "/OstraconPdfSessions";
    ensureDirectory(path);
    return path;
  }

  function importDirectory() {
    var path = Application.sharedInstance().documentPath + "/OstraconImports";
    ensureDirectory(path);
    return path;
  }

  function normalizeFileName(value) {
    var name = String(value || "Obsidian文档.pdf").trim().replace(/[\\/:*?"<>|]/g, "_") || "Obsidian文档.pdf";
    return name.toLowerCase().endsWith(".pdf") ? name : name + ".pdf";
  }

  function uniqueTargetPath(fileName) {
    var directory = importDirectory();
    var normalized = normalizeFileName(fileName);
    var base = normalized.slice(0, -4);
    var manager = NSFileManager.defaultManager();
    var path = directory + "/" + normalized;
    var index = 1;
    while (manager.fileExistsAtPath(path)) {
      path = directory + "/" + base + "-" + index + ".pdf";
      index += 1;
      if (index > 10000) throw new Error("PDF重名文件过多: " + normalized);
    }
    return path;
  }

  function decodeBase64(value) {
    var url = NSURL.URLWithString("data:application/octet-stream;base64," + String(value || ""));
    var data = url ? NSData.dataWithContentsOfURL(url) : null;
    if (!data) throw new Error("PDF分块Base64解码失败");
    return data;
  }

  function createSession(context, payload) {
    var expectedByteLength = Number(payload && payload.expectedByteLength || 0);
    if (!Number.isFinite(expectedByteLength) || expectedByteLength <= 0 || expectedByteLength > MAX_TOTAL_BYTES) throw new Error("PDF大小无效或超过200MB");
    var sessionId = String(NSUUID.UUID().UUIDString());
    var path = tempDirectory() + "/" + sessionId + ".pdf.part";
    if (!NSData.data().writeToFileAtomically(path, true)) throw new Error("无法创建PDF导入临时文件");
    var handle = NSFileHandle.fileHandleForWritingAtPath(path);
    if (!handle) throw new Error("无法打开PDF导入临时文件");
    sessions[sessionId] = {
      path: path,
      handle: handle,
      fileName: normalizeFileName(payload && payload.fileName),
      expectedByteLength: expectedByteLength,
      receivedByteLength: 0,
      nextChunk: 0,
    };
    return { sessionId: sessionId, maxChunkChars: MAX_CHUNK_CHARS };
  }

  function appendChunk(context, payload) {
    var session = sessions[String(payload && payload.sessionId || "")];
    if (!session) throw new Error("PDF导入会话不存在");
    var index = Number(payload.chunkIndex);
    var chunk = String(payload.base64Chunk || "");
    if (index !== session.nextChunk) throw new Error("PDF分块顺序错误: " + index);
    if (!chunk || chunk.length > MAX_CHUNK_CHARS || chunk.length % 4 !== 0) throw new Error("PDF分块长度无效");
    var data = decodeBase64(chunk);
    session.handle.seekToEndOfFile();
    session.handle.writeData(data);
    session.receivedByteLength += Number(data.length());
    session.nextChunk += 1;
    if (session.receivedByteLength > session.expectedByteLength) throw new Error("PDF内容超过声明大小");
    return { receivedChunks: session.nextChunk, receivedByteLength: session.receivedByteLength };
  }

  function cleanup(sessionId) {
    var session = sessions[sessionId];
    if (!session) return;
    if (session.handle) session.handle.closeFile();
    var manager = NSFileManager.defaultManager();
    if (manager.fileExistsAtPath(session.path)) NSData.data().writeToFileAtomically(session.path, true);
    delete sessions[sessionId];
  }

  function finalize(context, payload) {
    var sessionId = String(payload && payload.sessionId || "");
    var session = sessions[sessionId];
    if (!session) throw new Error("PDF导入会话不存在");
    if (session.receivedByteLength !== session.expectedByteLength) throw new Error("PDF内容字节数不完整");
    session.handle.synchronizeFile();
    session.handle.closeFile();
    session.handle = null;
    try {
      var targetPath = uniqueTargetPath(session.fileName);
      if (!NSFileManager.defaultManager().moveItemAtPathToPath(session.path, targetPath)) throw new Error("无法保存PDF: " + targetPath);
      var controller = studyController(context);
      var notebookId = String(controller.notebookController.notebookId || "");
      if (!notebookId) throw new Error("当前学习集缺少notebookId");
      var documentId = String(Application.sharedInstance().importDocument(targetPath) || "");
      if (!documentId) throw new Error("MN导入PDF后未返回文档ID");
      controller.openNotebookAndDocument(notebookId, documentId);
      delete sessions[sessionId];
      return { ok: true, documentId: documentId, notebookId: notebookId, savedPath: targetPath };
    } catch (error) {
      cleanup(sessionId);
      throw error;
    }
  }

  function abort(context, payload) {
    cleanup(String(payload && payload.sessionId || ""));
    return { aborted: true };
  }

  return { createSession, appendChunk, finalize, abort };
})();
