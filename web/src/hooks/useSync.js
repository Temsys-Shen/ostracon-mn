import { useCallback, useRef, useEffect } from "react";
import MNBridge from "../lib/mnBridge";
import { createPacketDraft, normalizePacket } from "../lib/ostraconContract";
import { SyncQueue } from "../lib/SyncQueue";
import ostraconWsClient from "../lib/ostraconWsClient";
import useBridgeStore from "../store/useBridgeStore";

const SCOPE_POLL_INTERVAL_MS = 30000;

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
    includeImages: prefs.includeImages !== false,
    includeNoteIds: true,
  };
}

function noteIdsFromCards(cards) {
  return Array.isArray(cards) ? cards.map(c => c.id).filter(Boolean).sort() : [];
}

function sameStringList(left = [], right = []) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function scopeKey(scope, scopeId) {
  return `${scope}:${scopeId}`;
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

function useSync({ connection, prefs, format, syncedCards, syncedScopes, setSyncedCards, setSyncedScopes, addSendHistory, setNotice, setLoading }) {
  const lastModifiedByNoteIdRef = useRef({});

  const persistSyncedCards = useCallback((cards) => {
    setSyncedCards(cards);
    MNBridge.send("setSyncedCards", { cards }).catch((error) => {
      console.warn("同步登记保存失败", normalizeError(error));
    });
  }, [setSyncedCards]);

  const persistSyncedScopes = useCallback((scopes) => {
    setSyncedScopes(scopes);
    MNBridge.send("setSyncedScopes", { scopes }).catch((error) => {
      console.warn("范围同步登记保存失败", normalizeError(error));
    });
  }, [setSyncedScopes]);

  const renderScopePacket = useCallback(async ({ scope, autoSync, format: targetFormat, notebookId = "" }) => {
    const scopePayload = { scope, notebookId, options: { ...prefs, includeNoteIds: autoSync } };
    let payload;
    let noteCount = 0;
    let formatLabel = targetFormat === "canvas" ? "Canvas" : "Markdown";

    if (targetFormat === "canvas") {
      const result = await MNBridge.send("previewScopeCanvas", scopePayload, 30000);
      if (!result?.canvas) throw new Error("范围内容为空");
      payload = {
        content: result.canvas,
        noteCount: result.nodeCount,
        fileBaseName: result.fileBaseName || result.scopeTitle || "ostracon-canvas",
        scopeId: result.scopeId,
        scopeTitle: result.scopeTitle,
      };
      noteCount = result.nodeCount;
    } else {
      const result = await MNBridge.send("previewScopeMarkdown", scopePayload, 30000);
      if (!result?.markdown) throw new Error("范围内容为空");
      payload = {
        content: result.markdown,
        noteCount: result.noteCount,
        fileBaseName: result.fileBaseName || result.scopeTitle || "MarginNote",
        scopeId: result.scopeId,
        scopeTitle: result.scopeTitle,
      };
      noteCount = result.noteCount;
    }

    const cardsResult = await MNBridge.send("listScopeCards", { scope, notebookId }, 30000);
    const packetObjects = Array.isArray(cardsResult?.cards) ? cardsResult.cards : [];
    const noteIds = noteIdsFromCards(packetObjects);
    const scopeId = cardsResult?.scopeId || payload.scopeId || notebookId || scope;
    const sourceTitle = payload.scopeTitle || payload.fileBaseName || "Ostracon";
    const packet = normalizePacket(createPacketDraft({
      markdown: payload.content,
      sourceTitle,
      folder: "Inbox",
      format: targetFormat,
      isCanvas: targetFormat === "canvas",
      objects: packetObjects,
    }));

    return {
      packet,
      noteCount,
      formatLabel,
      fileBaseName: payload.fileBaseName,
      scopeId,
      scopeTitle: sourceTitle,
      noteIds,
    };
  }, [prefs]);

  const syncNotebookScope = useCallback(async (entry, reason = "event") => {
    const snapshot = ostraconWsClient.getSnapshot();
    if (!snapshot.connected) {
      console.warn("范围同步跳过: WebSocket已断开", { scopeId: entry?.scopeId, reason });
      return;
    }
    if (!entry || entry.type !== "notebook" || !entry.notebookId || !entry.filePath) return;

    const rendered = await renderScopePacket({
      scope: "notebook",
      autoSync: true,
      format: entry.format === "canvas" ? "canvas" : "markdown",
      notebookId: entry.notebookId,
    });
    const result = await ostraconWsClient.sendPacket(rendered.packet, true, entry.filePath);
    const filePath = result?.payload?.record?.filePath || entry.filePath;
    const key = scopeKey("notebook", entry.notebookId);
    const nextScopes = { ...useBridgeStore.getState().syncedScopes };
    nextScopes[key] = {
      ...entry,
      type: "notebook",
      scopeId: entry.notebookId,
      notebookId: entry.notebookId,
      title: rendered.scopeTitle || entry.title || "当前学习集",
      filePath,
      format: entry.format === "canvas" ? "canvas" : "markdown",
      renderOptions: createSyncRenderOptions(entry.format === "canvas" ? "canvas" : "markdown", prefs),
      noteIdsSnapshot: rendered.noteIds,
      version: Number(entry.version || 0) + 1,
      syncedAt: new Date().toISOString(),
    };
    persistSyncedScopes(nextScopes);
    console.log("[OstraconSync] scope synced", { scopeId: entry.notebookId, reason, noteCount: rendered.noteCount });
  }, [persistSyncedScopes, prefs, renderScopePacket]);

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

    const scopeEntries = Object.values(useBridgeStore.getState().syncedScopes || {})
      .filter((entry) => entry && entry.type === "notebook" && String(entry.notebookId || "") === String(change?.notebookId || ""));
    scopeEntries.forEach((entry) => {
      scopeQueueRef.current.enqueue(scopeKey("notebook", entry.notebookId), { entry, reason: "note-event" });
    });

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
  const syncNotebookScopeRef = useRef(syncNotebookScope);
  useEffect(() => {
    syncNotebookScopeRef.current = syncNotebookScope;
  }, [syncNotebookScope]);
  const scopeQueueRef = useRef(null);
  if (!scopeQueueRef.current) {
    scopeQueueRef.current = new SyncQueue((key, payload) => syncNotebookScopeRef.current(payload.entry, payload.reason), { timeoutMs: 60000 });
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

  useEffect(() => {
    if (!connection.connected) return undefined;
    const poll = async () => {
      const scopes = useBridgeStore.getState().syncedScopes || {};
      const entries = Object.values(scopes).filter((entry) => entry && entry.type === "notebook" && entry.notebookId);
      for (const entry of entries) {
        try {
          const cardsResult = await MNBridge.send("listScopeCards", { scope: "notebook", notebookId: entry.notebookId }, 30000);
          const nextIds = noteIdsFromCards(cardsResult?.cards || []);
          const previousIds = Array.isArray(entry.noteIdsSnapshot) ? entry.noteIdsSnapshot.slice().sort() : [];
          if (!sameStringList(previousIds, nextIds)) {
            scopeQueueRef.current.enqueue(scopeKey("notebook", entry.notebookId), { entry, reason: "scope-poll" });
          }
        } catch (error) {
          console.warn("范围快照检查失败", { notebookId: entry.notebookId, message: normalizeError(error) });
        }
      }
    };
    const timer = window.setInterval(poll, SCOPE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [connection.connected, syncedScopes]);

  const send = useCallback(async ({ autoSync, scope } = {}) => {
    if (!connection.connected) { setNotice("未连接"); return; }
    const scopeType = scope === "notebook" || scope === "mindmap" ? scope : "selection";
    const shouldAutoSync = Boolean(autoSync) && scopeType !== "mindmap";
    setLoading(true);
    setNotice("正在读取...");
    let formatLabel = format === "canvas" ? "Canvas" : "Markdown";
    try {
      const rendered = await renderScopePacket({ scope: scopeType, autoSync: shouldAutoSync, format });
      if (scopeType === "selection" && rendered.noteCount === 0) { setNotice("未选中卡片"); setLoading(false); return; }
      setNotice("正在发送...");
      const sendResult = await ostraconWsClient.sendPacket(rendered.packet, shouldAutoSync);
      const filePath = sendResult?.payload?.record?.filePath || "";

      addSendHistory({
        noteCount: rendered.noteCount, summary: `${rendered.fileBaseName || ""} (${rendered.noteCount}张)`, ok: true, at: new Date().toISOString(),
        format: rendered.formatLabel || formatLabel, filePath, synced: shouldAutoSync,
      });
      setNotice(shouldAutoSync ? `✓ 已同步 ${rendered.noteCount}张` : `✓ 已发送 ${rendered.noteCount}张`);

      if (shouldAutoSync && scopeType === "selection" && rendered.noteIds.length > 0 && filePath) {
        const updated = { ...syncedCards };
        for (const id of rendered.noteIds) {
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
      if (shouldAutoSync && scopeType === "notebook" && filePath) {
        const key = scopeKey("notebook", rendered.scopeId);
        const current = syncedScopes[key] || {};
        const updatedScopes = {
          ...syncedScopes,
          [key]: {
            ...current,
            type: "notebook",
            scopeId: rendered.scopeId,
            notebookId: rendered.scopeId,
            title: rendered.scopeTitle || rendered.fileBaseName || "当前学习集",
            filePath,
            format,
            renderOptions: createSyncRenderOptions(format, prefs),
            noteIdsSnapshot: rendered.noteIds,
            version: current.version || 1,
            syncedAt: new Date().toISOString(),
          },
        };
        persistSyncedScopes(updatedScopes);
      }
    } catch (e) {
      addSendHistory({ noteCount: 0, summary: "发送失败", ok: false, at: new Date().toISOString(), format: formatLabel || "Markdown" });
      setNotice(`发送失败: ${normalizeError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [connection.connected, prefs, format, addSendHistory, syncedCards, syncedScopes, setSyncedCards, persistSyncedScopes, renderScopePacket, setNotice, setLoading]);

  return { send };
}

export { useSync, createSyncRenderOptions };
