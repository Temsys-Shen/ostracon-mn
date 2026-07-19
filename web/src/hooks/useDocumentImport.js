import { useCallback, useState } from "react";
import MNBridge from "../lib/mnBridge";
import useBridgeStore from "../store/useBridgeStore";
import { MN_CMD } from "../lib/commands";
import { runChunkedImport, splitBase64 } from "../lib/chunkedImport";

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
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const setSelection = useBridgeStore((s) => s.setSelection);

  const refreshContext = useCallback(async () => {
    try {
      const next = await MNBridge.send(MN_CMD.GET_OBSIDIAN_INSERT_CONTEXT, null, 10000);
      setSelection({ insertContext: next });
      return next;
    } catch (e) {
      setError(e.message || String(e));
      throw e;
    }
  }, [setSelection]);

  const insert = useCallback(async (document, content, operation) => {
    if (!document || !content?.markdown) return;
    setStatus("uploading"); setError(""); setResult(null);
    try {
      const json = JSON.stringify(buildImportPayload(document, content, operation));
      const base64 = utf8Base64(json);
      const expectedByteLength = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      const created = await runChunkedImport({
        sessionCmd: MN_CMD.CREATE_IMPORT_SESSION,
        chunkCmd: MN_CMD.APPEND_IMPORT_CHUNK,
        finalizeCmd: MN_CMD.FINALIZE_IMPORT,
        abortCmd: MN_CMD.ABORT_IMPORT,
        sessionPayload: { expectedByteLength },
        buildChunks: (session) => splitBase64(base64, session.maxChunkChars || 16000),
        onStage: (stage) => setStatus(stage === "finalizing" ? (operation === "append" ? "appending" : "creating") : "uploading"),
        finalizeTimeout: 30000,
      });
      setResult(created); setStatus("success");
      await refreshContext();
      return created;
    } catch (e) {
      setError(e.message || String(e)); setStatus("error");
      throw e;
    }
  }, [refreshContext]);

  return { status, result, error, refreshContext, insert };
}

export { buildImportPayload, useDocumentImport, utf8Base64 };
