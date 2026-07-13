import { useCallback } from "react";
import MNBridge from "../lib/mnBridge";
import { createPacketDraft, normalizePacket } from "../lib/ostraconContract";
import ostraconWsClient from "../lib/ostraconWsClient";
import { normalizeSendScope } from "../lib/sendRules";

function normalizeError(error) {
  if (!error) return "未知错误";
  return typeof error === "string" ? error : error.message || JSON.stringify(error);
}

function useSend({ connection, prefs, format, addSendHistory, setNotice, setLoading }) {
  const renderPacket = useCallback(async (scope) => {
    const scopePayload = { scope, options: prefs };
    let content;
    let noteCount;
    let fileBaseName;
    let sourceTitle;

    if (format === "canvas") {
      const result = await MNBridge.send("previewScopeCanvas", scopePayload, 30000);
      if (!result?.canvas) throw new Error("范围内容为空");
      content = result.canvas;
      noteCount = result.nodeCount;
      fileBaseName = result.fileBaseName || result.scopeTitle || "ostracon-canvas";
      sourceTitle = result.scopeTitle || fileBaseName;
    } else {
      const result = await MNBridge.send("previewScopeMarkdown", scopePayload, 30000);
      if (!result?.markdown) throw new Error("范围内容为空");
      content = result.markdown;
      noteCount = result.noteCount;
      fileBaseName = result.fileBaseName || result.scopeTitle || "MarginNote";
      sourceTitle = result.scopeTitle || fileBaseName;
    }

    const cardsResult = await MNBridge.send("listScopeCards", { scope }, 30000);
    const packet = normalizePacket(createPacketDraft({
      markdown: content,
      sourceTitle,
      folder: "Inbox",
      format,
      isCanvas: format === "canvas",
      objects: Array.isArray(cardsResult?.cards) ? cardsResult.cards : [],
      fileName: fileBaseName,
    }));

    return { packet, noteCount, fileBaseName };
  }, [format, prefs]);

  const send = useCallback(async ({ scope } = {}) => {
    if (!connection.connected) {
      setNotice("未连接");
      return;
    }

    const scopeType = normalizeSendScope(scope);
    const formatLabel = format === "canvas" ? "Canvas" : "Markdown";
    setLoading(true);
    setNotice("正在读取...");

    try {
      const rendered = await renderPacket(scopeType);
      if (scopeType === "selection" && rendered.noteCount === 0) {
        setNotice("未选中卡片");
        return;
      }

      setNotice("正在发送...");
      const result = await ostraconWsClient.sendPacket(rendered.packet);
      const filePath = result?.payload?.record?.filePath || "";
      addSendHistory({
        noteCount: rendered.noteCount,
        summary: `${rendered.fileBaseName || ""} (${rendered.noteCount}张)`,
        ok: true,
        at: new Date().toISOString(),
        format: formatLabel,
        filePath,
      });
      setNotice(`✓ 已发送 ${rendered.noteCount}张`);
    } catch (error) {
      addSendHistory({
        noteCount: 0,
        summary: "发送失败",
        ok: false,
        at: new Date().toISOString(),
        format: formatLabel,
      });
      setNotice(`发送失败: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [addSendHistory, connection.connected, format, renderPacket, setLoading, setNotice]);

  return { send };
}

export { useSend };
