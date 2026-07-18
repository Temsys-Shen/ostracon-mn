import { useCallback, useState } from "react";
import MNBridge from "../lib/mnBridge";

function utf8Base64(value) {
  return window.btoa(unescape(encodeURIComponent(value)));
}

function buildImportPayload(document, content, operation) {
  if (operation !== "create" && operation !== "append") throw new Error(`不支持的导入操作: ${operation}`);
  const contentMode = content.contentMode;
  if (contentMode !== "markdown" && contentMode !== "html") throw new Error(`不支持的卡片内容模式: ${contentMode}`);
  return {
    operation,
    contentMode,
    title: document.title,
    markdown: content.markdown,
    html: contentMode === "html" ? content.html : "",
    plainText: contentMode === "html" ? content.plainText : "",
    htmlSize: contentMode === "html" ? content.htmlSize : null,
    sourcePath: document.path,
    mtime: document.mtime,
  };
}

function useDocumentImport() {
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState("");
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const refreshContext = useCallback(async () => {
    try {
      const next = await MNBridge.send("getObsidianInsertContext", null, 10000);
      setContext(next); setContextError("");
      return next;
    } catch (e) {
      setContext(null); setContextError(e.message || String(e));
      throw e;
    }
  }, []);

  const insert = useCallback(async (document, content, operation) => {
    if (!document || !content?.markdown) return;
    setStatus("uploading"); setError(""); setResult(null);
    let sessionId = "";
    try {
      const json = JSON.stringify(buildImportPayload(document, content, operation));
      const base64 = utf8Base64(json);
      const expectedByteLength = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      const session = await MNBridge.send("createObsidianImportSession", { expectedByteLength }, 10000);
      sessionId = session.sessionId;
      const chunkSize = session.maxChunkChars || 16000;
      let chunkIndex = 0;
      for (let offset = 0; offset < base64.length; offset += chunkSize) {
        await MNBridge.send("appendObsidianImportChunk", { sessionId, chunkIndex, base64Chunk: base64.slice(offset, offset + chunkSize) }, 15000);
        chunkIndex += 1;
      }
      setStatus(operation === "append" ? "appending" : "creating");
      const created = await MNBridge.send("finalizeObsidianImport", { sessionId }, 30000);
      setResult(created); setStatus("success");
      await refreshContext();
      return created;
    } catch (e) {
      let message = e.message || String(e);
      if (sessionId) {
        try {
          await MNBridge.send("abortObsidianImport", { sessionId }, 5000);
        } catch (abortError) {
          message += `；临时会话清理失败: ${abortError.message || String(abortError)}`;
        }
      }
      setError(message); setStatus("error");
      throw new Error(message);
    }
  }, [refreshContext]);

  return { context, contextError, status, result, error, refreshContext, insert };
}

export { buildImportPayload, useDocumentImport, utf8Base64 };
