import { useCallback, useState } from "react";
import MNBridge from "../lib/mnBridge";
import ostraconWsClient from "../lib/ostraconWsClient";
import { MN_CMD, OB_CMD } from "../lib/commands";
import { normalizeError } from "../lib/errors";

async function cleanupPdfSessions({ mnSessionId, obSessionId }) {
  const errors = [];
  if (mnSessionId) {
    try {
      await MNBridge.send(MN_CMD.ABORT_PDF_IMPORT, { sessionId: mnSessionId }, 5000);
    } catch (error) {
      errors.push(`MN临时会话清理失败: ${normalizeError(error)}`);
    }
  }
  if (obSessionId) {
    try {
      await ostraconWsClient.sendObsidianCommand(
        OB_CMD.RELEASE_VAULT_DOCUMENT_PDF_EXPORT,
        { sessionId: obSessionId },
        10000,
      );
    } catch (error) {
      errors.push(`OB临时会话清理失败: ${normalizeError(error)}`);
    }
  }
  return errors;
}

function usePdfDocumentImport() {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const importDocument = useCallback(async ({ path }) => {
    let obSessionId = "";
    let mnSessionId = "";
    setError("");
    setProgress(0);
    try {
      setStatus("generating");
      const exported = await ostraconWsClient.sendObsidianCommand(
        OB_CMD.CREATE_VAULT_DOCUMENT_PDF_EXPORT,
        { path },
        120000,
      );
      obSessionId = exported.sessionId;

      const imported = await MNBridge.send(MN_CMD.CREATE_PDF_IMPORT_SESSION, {
        fileName: exported.fileName,
        expectedByteLength: exported.byteLength,
      }, 10000);
      mnSessionId = imported.sessionId;

      setStatus("uploading");
      for (let index = 0; index < exported.chunkCount; index += 1) {
        const chunk = await ostraconWsClient.sendObsidianCommand(
          OB_CMD.READ_VAULT_DOCUMENT_PDF_CHUNK,
          { sessionId: obSessionId, chunkIndex: index },
          30000,
        );
        await MNBridge.send(MN_CMD.APPEND_PDF_IMPORT_CHUNK, {
          sessionId: mnSessionId,
          chunkIndex: index,
          base64Chunk: chunk.base64Chunk,
        }, 15000);
        setProgress((index + 1) / exported.chunkCount);
      }

      setStatus("importing");
      const result = await MNBridge.send(MN_CMD.FINALIZE_PDF_IMPORT, { sessionId: mnSessionId }, 60000);
      mnSessionId = "";
      await ostraconWsClient.sendObsidianCommand(
        OB_CMD.RELEASE_VAULT_DOCUMENT_PDF_EXPORT,
        { sessionId: obSessionId },
        10000,
      );
      obSessionId = "";
      setProgress(1);
      setStatus("idle");
      return result;
    } catch (caught) {
      const cleanupErrors = await cleanupPdfSessions({ mnSessionId, obSessionId });
      const message = [normalizeError(caught), ...cleanupErrors].join("；");
      setError(message);
      setStatus("idle");
      throw new Error(message);
    }
  }, []);

  return { status, progress, error, importDocument };
}

export { cleanupPdfSessions, usePdfDocumentImport };
