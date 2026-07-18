import { useCallback, useState } from "react";
import MNBridge from "../lib/MNBridge";
import { renderContinuousPdf } from "../lib/continuousPdf";

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}

function splitPdfBytes(bytes, maxChunkChars) {
  const rawChunkBytes = Math.floor(Number(maxChunkChars) / 4) * 3;
  if (!Number.isFinite(rawChunkBytes) || rawChunkBytes <= 0) throw new Error("PDF分块上限无效");
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += rawChunkBytes) {
    chunks.push(bytesToBase64(bytes.subarray(offset, Math.min(bytes.length, offset + rawChunkBytes))));
  }
  return chunks;
}

function usePdfDocumentImport() {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const importDocument = useCallback(async ({ element, title }) => {
    let sessionId = "";
    setError("");
    setProgress(0);
    try {
      setStatus("generating");
      const bytes = await renderContinuousPdf(element, (_phase, value) => setProgress(Number(value || 0)));
      setStatus("uploading");
      const session = await MNBridge.send("createObsidianPdfImportSession", {
        fileName: `${String(title || "Obsidian文档").trim() || "Obsidian文档"}.pdf`,
        expectedByteLength: bytes.length,
      }, 10000);
      sessionId = session.sessionId;
      const chunks = splitPdfBytes(bytes, session.maxChunkChars);
      for (let index = 0; index < chunks.length; index += 1) {
        await MNBridge.send("appendObsidianPdfImportChunk", { sessionId, chunkIndex: index, base64Chunk: chunks[index] }, 15000);
        setProgress((index + 1) / chunks.length);
      }
      setStatus("importing");
      const result = await MNBridge.send("finalizeObsidianPdfImport", { sessionId }, 60000);
      sessionId = "";
      setStatus("idle");
      setProgress(1);
      return result;
    } catch (caught) {
      if (sessionId) {
        try {
          await MNBridge.send("abortObsidianPdfImport", { sessionId }, 5000);
        } catch (abortError) {
          console.log("PDF import abort failed", abortError);
        }
      }
      const message = caught?.message || String(caught);
      setError(message);
      setStatus("idle");
      throw new Error(message);
    }
  }, []);

  return { status, progress, error, importDocument };
}

export { bytesToBase64, splitPdfBytes, usePdfDocumentImport };
