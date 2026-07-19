import MNBridge from "./mnBridge";
import { normalizeError } from "./errors";

// 通用分块上传流程。抽出 useDocumentImport / usePdfDocumentImport 的同构逻辑：
// createSession → 循环 appendChunk → finalize；出错时 abort。
//
// 参数：
// - sessionCmd / chunkCmd / finalizeCmd / abortCmd: 命令名（建议用 lib/commands.js 的常量）
// - sessionPayload: 创建会话的 payload
// - buildChunks: (session) => string[]  根据会话返回的 maxChunkChars 把数据切分成 base64 块数组
// - onProgress: 可选，(ratio: 0~1) => void  上传进度
// - onStage: 可选，(stage: "uploading" | "finalizing") => void  状态切换通知
// - finalizeTimeout: finalize 的超时，默认 30000
// - sessionTimeout: createSession 的超时，默认 10000
// - chunkTimeout: appendChunk 的超时，默认 15000
// - abortTimeout: abort 的超时，默认 5000
//
// 出错时把 abort 失败信息附加到主错误后面。sessionId 清空后才返回 result，避免 finally 再 abort。
export async function runChunkedImport({
  sessionCmd, chunkCmd, finalizeCmd, abortCmd,
  sessionPayload, buildChunks,
  onProgress, onStage,
  finalizeTimeout = 30000,
  sessionTimeout = 10000,
  chunkTimeout = 15000,
  abortTimeout = 5000,
}) {
  let sessionId = "";
  try {
    const session = await MNBridge.send(sessionCmd, sessionPayload, sessionTimeout);
    sessionId = session.sessionId;
    const chunks = buildChunks(session);
    if (onStage) onStage("uploading");
    for (let i = 0; i < chunks.length; i += 1) {
      await MNBridge.send(chunkCmd, { sessionId, chunkIndex: i, base64Chunk: chunks[i] }, chunkTimeout);
      if (onProgress) onProgress((i + 1) / chunks.length);
    }
    if (onStage) onStage("finalizing");
    const result = await MNBridge.send(finalizeCmd, { sessionId }, finalizeTimeout);
    sessionId = "";
    return result;
  } catch (e) {
    const primaryMessage = normalizeError(e);
    if (sessionId) {
      try {
        await MNBridge.send(abortCmd, { sessionId }, abortTimeout);
      } catch (abortError) {
        throw new Error(`${primaryMessage}；临时会话清理失败: ${normalizeError(abortError)}`);
      }
    }
    throw new Error(primaryMessage);
  }
}

// 把 base64 字符串按 chunkSize 切分成数组（用于 markdown/html 导入）
export function splitBase64(base64, chunkSize) {
  const size = chunkSize || 16000;
  const chunks = [];
  for (let offset = 0; offset < base64.length; offset += size) {
    chunks.push(base64.slice(offset, offset + size));
  }
  return chunks;
}
