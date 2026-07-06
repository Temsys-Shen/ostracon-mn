import { useCallback, useRef, useEffect } from "react";
import MNBridge from "../lib/mnBridge";
import { createPacketDraft, normalizePacket } from "../lib/ostraconContract";
import { SyncQueue } from "../lib/SyncQueue";
import ostraconWsClient from "../lib/ostraconWsClient";
import useBridgeStore from "../store/useBridgeStore";

function normalizeError(e) {
  if (!e) return "未知错误";
  return typeof e === "string" ? e : e.message || JSON.stringify(e);
}

function isTerminalTargetError(error) {
  const message = normalizeError(error);
  return /文件不存在|文件未包含noteId|文件未包含可更新的noteId标题|Canvas未包含noteId节点|Canvas JSON解析失败/i.test(message);
}

function createSyncRenderOptions(format, prefs = {}) {
  if (format === "canvas") return { includeImages: true };
  return {
    mode: prefs.mode === "tree" ? "tree" : "flat",
    excerptStyle: prefs.excerptStyle === "plain" ? "plain" : "quote",
    includeImages: prefs.includeImages !== false,
    includeNoteIds: true,
  };
}

function normalizeTargets(entry) {
  const rawTargets = Array.isArray(entry?.targets) && entry.targets.length > 0
    ? entry.targets
    : [{ filePath: entry?.filePath || "", format: entry?.format || "markdown", renderOptions: entry?.renderOptions }];
  const seen = {};
  return rawTargets
    .map((target) => ({
      filePath: String(target?.filePath || ""),
      format: target?.format === "canvas" ? "canvas" : "markdown",
      renderOptions: target?.renderOptions && typeof target.renderOptions === "object"
        ? target.renderOptions
        : createSyncRenderOptions(target?.format === "canvas" ? "canvas" : "markdown"),
    }))
    .filter((target) => {
      if (!target.filePath || seen[target.filePath]) return false;
      seen[target.filePath] = true;
      return true;
    });
}

function useSync({ connection, prefs, format, syncedCards, setSyncedCards, addSendHistory, setNotice, setLoading }) {
  const lastModifiedByNoteIdRef = useRef({});

  const persistSyncedCards = useCallback((cards) => {
    setSyncedCards(cards);
    MNBridge.send("setSyncedCards", { cards }).catch((error) => {
      console.warn("同步登记保存失败", normalizeError(error));
    });
  }, [setSyncedCards]);

  const syncChangedCard = useCallback(async (change) => {
    const noteId = String(change?.noteId || "");
    if (!noteId) return;
    console.log("[OstraconSync] native change", {
      noteId,
      modifiedDate: change?.modifiedDate || "",
      notebookId: change?.notebookId || "",
    });

    const snapshot = ostraconWsClient.getSnapshot();
    if (!snapshot.connected) {
      console.warn("事件同步跳过: WebSocket已断开", { noteId });
      return;
    }

    const current = useBridgeStore.getState().syncedCards[noteId];
    if (!current) {
      console.warn("事件同步跳过: noteId未登记自动同步", { noteId });
      return;
    }

    const targets = normalizeTargets(current);
    if (targets.length === 0) {
      console.warn("事件同步跳过: 没有同步目标", { noteId });
      return;
    }

    const modifiedDate = String(change?.modifiedDate || "");
    if (modifiedDate && lastModifiedByNoteIdRef.current[noteId] === modifiedDate) {
      console.log("[OstraconSync] duplicate modifiedDate skipped", { noteId, modifiedDate });
      return;
    }
    if (modifiedDate) lastModifiedByNoteIdRef.current[noteId] = modifiedDate;
    console.log("[OstraconSync] syncing targets", { noteId, targetCount: targets.length });

    let renderResult;
    try {
      const result = await MNBridge.send("renderCardsForSync", {
        targets: targets.map((target) => ({
          noteId,
          filePath: target.filePath,
          format: target.format,
          renderOptions: target.renderOptions,
        })),
      }, 12000);
      renderResult = Array.isArray(result?.rendered) ? result.rendered : [];
    } catch (error) {
      console.warn("事件同步渲染卡片失败", { noteId, message: normalizeError(error) });
      return;
    }
    if (renderResult.length === 0) {
      console.warn("事件同步渲染卡片失败", { noteId, message: "MN未返回渲染结果" });
      return;
    }
    console.log("[OstraconSync] rendered card", { noteId, targetCount: renderResult.length });

    const version = Number(current.version || 0) + 1;
    const failedTerminalPaths = {};
    let successCount = 0;
    const warnings = [];
    const terminalWarnings = [];

    for (const target of targets) {
      const rendered = renderResult.find((item) => item.filePath === target.filePath && item.format === target.format);
      if (!rendered) {
        warnings.push({ noteId, filePath: target.filePath, message: "MN未返回目标渲染结果" });
        continue;
      }
      try {
        await ostraconWsClient.sendCardUpdated({
          noteId,
          title: rendered.title || "",
          excerpt: "",
          comment: "",
          sourceAnchor: rendered.sourceAnchor || "",
          filePath: target.filePath,
          format: target.format,
          markdownSection: rendered.markdownSection || "",
          canvasText: rendered.canvasText || "",
          version,
          hasImage: Boolean(rendered.hasImage),
          hasHandwriting: Boolean(rendered.hasHandwriting),
        });
        successCount += 1;
        console.log("[OstraconSync] target updated", { noteId, filePath: target.filePath, format: target.format });
      } catch (error) {
        const message = normalizeError(error);
        if (isTerminalTargetError(error)) {
          failedTerminalPaths[target.filePath] = true;
          terminalWarnings.push({ noteId, filePath: target.filePath, message });
        } else {
          warnings.push({ noteId, filePath: target.filePath, message });
        }
      }
    }

    if (terminalWarnings.length > 0) {
      console.warn(`事件同步移除失效目标${terminalWarnings.length}项`, terminalWarnings);
    }

    if (warnings.length > 0) {
      console.warn(`事件同步失败${warnings.length}项`, warnings);
    }

    const terminalPaths = Object.keys(failedTerminalPaths);
    if (successCount === 0 && terminalPaths.length === 0) return;
    console.log("[OstraconSync] sync result", { noteId, successCount, removedTargetCount: terminalPaths.length });

    const nextSyncedCards = { ...useBridgeStore.getState().syncedCards };
    const latest = nextSyncedCards[noteId] || current;
    const nextTargets = targets.filter((target) => !failedTerminalPaths[target.filePath]);

    if (nextTargets.length === 0) {
      delete nextSyncedCards[noteId];
    } else {
      nextSyncedCards[noteId] = {
        ...latest,
        targets: nextTargets,
        filePath: nextTargets[nextTargets.length - 1].filePath,
        format: nextTargets[nextTargets.length - 1].format,
        version: successCount > 0 ? version : latest.version,
        syncedAt: new Date().toISOString(),
      };
    }

    persistSyncedCards(nextSyncedCards);
  }, [persistSyncedCards]);

  const syncQueueRef = useRef(null);
  if (!syncQueueRef.current) {
    syncQueueRef.current = new SyncQueue((noteId, change) => syncChangedCard(change));
  }

  useEffect(() => {
    const handler = (raw) => {
      try {
        const change = typeof raw === "string" ? JSON.parse(raw) : raw;
        const noteId = String(change?.noteId || "");
        if (!noteId) return;
        console.log("[OstraconSync] web handler received", change);
        syncQueueRef.current.enqueue(noteId, change);
      } catch (error) {
        console.warn("原生卡片事件解析失败", normalizeError(error));
      }
    };
    window.__OstraconNativeCardChanged = handler;
    return () => {
      delete window.__OstraconNativeCardChanged;
    };
  }, []);

  const send = useCallback(async (autoSync) => {
    if (!connection.connected) { setNotice("未连接"); return; }
    setLoading(true);
    setNotice("正在读取...");
    try {
      var payload, noteCount = 0, formatLabel = "Markdown";
      if (format === "canvas") {
        const r = await MNBridge.send("previewSelectedCanvas");
        if (!r?.canvas) { setNotice("未选中卡片"); setLoading(false); return; }
        payload = { canvas: r.canvas, noteCount: r.nodeCount, fileBaseName: "ostracon-canvas" };
        noteCount = r.nodeCount;
        formatLabel = "Canvas";
      } else {
        const prefsWithSync = { ...prefs, includeNoteIds: autoSync };
        const r = await MNBridge.send("previewSelectedMarkdown", prefsWithSync);
        if (!r?.markdown) { setNotice("未选中卡片"); setLoading(false); return; }
        payload = { markdown: r.markdown, noteCount: r.noteCount, fileBaseName: r.fileBaseName || "MarginNote" };
        noteCount = r.noteCount;
      }

      const cardsResult = await MNBridge.send("listCards", { notebookId: "current-selection" });
      const packetObjects = Array.isArray(cardsResult?.cards) ? cardsResult.cards : [];
      const noteIds = packetObjects.map(c => c.id).filter(Boolean);

      setNotice("正在发送...");
      const packet = normalizePacket(createPacketDraft({
        markdown: payload.markdown || payload.canvas, sourceTitle: payload.fileBaseName || "Ostracon",
        folder: "Inbox", format, isCanvas: format === "canvas",
        objects: packetObjects,
      }));
      const sendResult = await ostraconWsClient.sendPacket(packet, autoSync);
      const filePath = sendResult?.payload?.record?.filePath || "";

      addSendHistory({
        noteCount, summary: `${payload.fileBaseName || ""} (${noteCount}张)`, ok: true, at: new Date().toISOString(),
        format: formatLabel, filePath, synced: autoSync,
      });
      setNotice(autoSync ? `✓ 已同步 ${noteCount}张` : `✓ 已发送 ${noteCount}张`);

      if (autoSync && noteIds.length > 0 && filePath) {
        const updated = { ...syncedCards };
        for (const id of noteIds) {
          const current = updated[id] || {};
          const targets = Array.isArray(current.targets) ? current.targets.slice() : [];
          if (current.filePath && !targets.some((target) => target.filePath === current.filePath)) {
            const currentFormat = current.format === "canvas" ? "canvas" : "markdown";
            targets.push({
              filePath: current.filePath,
              format: currentFormat,
              renderOptions: current.renderOptions || createSyncRenderOptions(currentFormat, prefs),
            });
          }
          if (!targets.some((target) => target.filePath === filePath)) {
            targets.push({ filePath, format, renderOptions: createSyncRenderOptions(format, prefs) });
          }
          updated[id] = {
            ...current,
            filePath,
            format,
            renderOptions: createSyncRenderOptions(format, prefs),
            targets,
            version: current.version || 1,
            syncedAt: new Date().toISOString(),
          };
        }
        setSyncedCards(updated);
        MNBridge.send("setSyncedCards", { cards: updated }).catch((e) => console.warn("setSyncedCards failed", e));
      }
    } catch (e) {
      addSendHistory({ noteCount: 0, summary: "发送失败", ok: false, at: new Date().toISOString(), format: formatLabel || "Markdown" });
      setNotice(`发送失败: ${normalizeError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [connection.connected, prefs, format, addSendHistory, syncedCards, setSyncedCards, setNotice, setLoading]);

  return { send };
}

export { useSync, createSyncRenderOptions };
