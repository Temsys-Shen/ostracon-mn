import { useCallback, useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";
import ostraconWsClient from "../lib/ostraconWsClient";
import useBridgeStore from "../store/useBridgeStore";
import { normalizeError } from "../lib/errors";
import { EVT_QUOTE_CONTEXT_CHANGED, EVT_QUOTE_ROOT_CLEARED, EVT_SELECTION_CHANGED } from "../lib/events";
import { MN_CMD, OB_CMD } from "../lib/commands";
import { usePolling } from "./usePolling";

const DEFAULT_CONTEXT = {
  cursor: { available: false, filePath: null },
  activeFile: { available: false, filePath: null },
};

function useQuote(active, setNotice) {
  const setSelection = useBridgeStore((s) => s.setSelection);
  const selection = useBridgeStore((s) => s.selection.quoteSelection);
  const root = useBridgeStore((s) => s.selection.quoteRoot);
  const context = useBridgeStore((s) => s.selection.quoteContext) || DEFAULT_CONTEXT;

  const [rootSelectionStatus, setRootSelectionStatus] = useState("idle");
  const [busyTarget, setBusyTarget] = useState("");
  const [error, setError] = useState("");
  const rootCheckInFlight = useRef(false);
  const rootSelectionSession = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refreshQuoteSelection = async () => {
      try {
        const [nextSelection, nextRoot] = await Promise.all([
          MNBridge.send(MN_CMD.GET_QUOTE_SELECTION_PREVIEW, {}, 30000),
          MNBridge.send(MN_CMD.GET_QUOTE_ROOT_STATE),
        ]);
        if (!cancelled) setSelection({ quoteSelection: nextSelection || null, quoteRoot: nextRoot || null });
      } catch (nextError) {
        if (!cancelled) setError(normalizeError(nextError));
      }
    };
    refreshQuoteSelection();
    window.addEventListener(EVT_SELECTION_CHANGED, refreshQuoteSelection);
    return () => {
      cancelled = true;
      window.removeEventListener(EVT_SELECTION_CHANGED, refreshQuoteSelection);
    };
  }, [active, setSelection]);

  // rootSelectionStatus 与 store 的 root 同步（waiting 状态下不干扰，避免中断用户选择流程）
  useEffect(() => {
    if (!active) return;
    if (rootSelectionStatus === "waiting") return;
    const next = root ? "selected" : "idle";
    setRootSelectionStatus((prev) => (prev === next ? prev : next));
  }, [active, root, rootSelectionStatus]);

  // 监听 OB 端推送的 quote-context-changed 事件 + 首次主动读一次
  // 替代原来的 1.5 秒轮询 getQuoteContext
  useEffect(() => {
    if (!active) return;
    const onContextChanged = (e) => {
      setSelection({ quoteContext: e.detail });
    };
    window.addEventListener(EVT_QUOTE_CONTEXT_CHANGED, onContextChanged);
    // 首次主动读一次（覆盖 WebView 重载/插件重启错过事件的场景）
    ostraconWsClient.sendObsidianCommand(OB_CMD.GET_QUOTE_CONTEXT)
      .then((ctx) => setSelection({ quoteContext: ctx }))
      .catch((e) => console.log("initial getQuoteContext failed", e));
    return () => {
      window.removeEventListener(EVT_QUOTE_CONTEXT_CHANGED, onContextChanged);
    };
  }, [active, setSelection]);

  // 监听 MN 端学习集关闭时派发的 quote-root-cleared 事件
  useEffect(() => {
    if (!active) return;
    const onRootCleared = () => {
      rootSelectionSession.current += 1;
      setSelection({ quoteRoot: null });
      setRootSelectionStatus("idle");
    };
    window.addEventListener(EVT_QUOTE_ROOT_CLEARED, onRootCleared);
    return () => window.removeEventListener(EVT_QUOTE_ROOT_CLEARED, onRootCleared);
  }, [active, setSelection]);

  const checkRootSelection = useCallback(async (session) => {
    if (rootCheckInFlight.current) return "busy";
    rootCheckInFlight.current = true;
    try {
      const result = await MNBridge.send(MN_CMD.SELECT_QUOTE_ROOT);
      if (!result?.selected || session !== rootSelectionSession.current) return "pending";
      setSelection({ quoteRoot: result.root });
      setRootSelectionStatus("selected");
      setError("");
      return "selected";
    } catch (nextError) {
      if (session === rootSelectionSession.current) setError(normalizeError(nextError));
      return "error";
    } finally {
      rootCheckInFlight.current = false;
    }
  }, [setSelection]);

  // 500ms 轮询检测 root selection（仅在 waiting 状态下）
  // OB 端无法感知 MN 端的"等待选根"状态，只能轮询
  usePolling(
    () => checkRootSelection(rootSelectionSession.current),
    500,
    { enabled: active && rootSelectionStatus === "waiting", deps: [rootSelectionStatus, checkRootSelection] },
  );

  const toggleRootSelection = useCallback(async () => {
    if (rootSelectionStatus === "waiting") {
      rootSelectionSession.current += 1;
      setRootSelectionStatus(root ? "selected" : "idle");
      return;
    }
    rootSelectionSession.current += 1;
    const session = rootSelectionSession.current;
    setRootSelectionStatus("waiting");
    await checkRootSelection(session);
  }, [root, rootSelectionStatus, checkRootSelection]);

  const clearRoot = useCallback(async () => {
    try {
      rootSelectionSession.current += 1;
      await MNBridge.send(MN_CMD.CLEAR_QUOTE_ROOT);
      setSelection({ quoteRoot: null });
      setRootSelectionStatus("idle");
      setError("");
    } catch (nextError) {
      setError(normalizeError(nextError));
    }
  }, [setSelection]);

  const insert = useCallback(async (target, filePath) => {
    setBusyTarget(target);
    setError("");
    try {
      const result = await ostraconWsClient.sendObsidianCommand(OB_CMD.INSERT_QUOTE, { target, filePath }, 45000);
      if (result?.ok) setNotice("已插入引文");
      return result;
    } catch (nextError) {
      const message = normalizeError(nextError);
      setError(message);
      setNotice(message);
      return null;
    } finally {
      setBusyTarget("");
      // 兜底主动读一次 quoteContext（OB 端 insert 后通常会触发 file-open/active-leaf-change 自动推送，但不一定）
      ostraconWsClient.sendObsidianCommand(OB_CMD.GET_QUOTE_CONTEXT)
        .then((ctx) => setSelection({ quoteContext: ctx }))
        .catch(() => { /* ignore */ });
    }
  }, [setNotice, setSelection]);

  return {
    selection,
    root,
    rootSelectionStatus,
    context,
    busyTarget,
    error,
    toggleRootSelection,
    clearRoot,
    insert,
  };
}

export { useQuote };
