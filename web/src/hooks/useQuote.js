import { useCallback, useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";
import ostraconWsClient from "../lib/ostraconWsClient";

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function useQuote(active, setNotice) {
  const [selection, setSelection] = useState(null);
  const [root, setRoot] = useState(null);
  const [rootSelectionStatus, setRootSelectionStatus] = useState("idle");
  const [context, setContext] = useState({
    cursor: { available: false, filePath: null },
    activeFile: { available: false, filePath: null },
  });
  const [busyTarget, setBusyTarget] = useState("");
  const [error, setError] = useState("");
  const rootCheckInFlight = useRef(false);
  const rootSelectionSession = useRef(0);

  const refreshSelection = useCallback(async () => {
    try {
      setSelection(await MNBridge.send("getQuoteSelectionPreview", {}, 30000));
      setError("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  const refreshRoot = useCallback(async () => {
    try {
      const storedRoot = await MNBridge.send("getQuoteRootState");
      setRoot(storedRoot);
      setRootSelectionStatus(storedRoot ? "selected" : "idle");
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  const refreshContext = useCallback(async () => {
    try {
      setContext(await ostraconWsClient.sendObsidianCommand("getQuoteContext"));
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const onSelectionChanged = () => { void refreshSelection(); };
    const onRootCleared = () => {
      rootSelectionSession.current += 1;
      setRoot(null);
      setRootSelectionStatus("idle");
    };
    window.addEventListener("ostracon:selection-changed", onSelectionChanged);
    window.addEventListener("ostracon:quote-root-cleared", onRootCleared);
    void Promise.all([refreshSelection(), refreshRoot(), refreshContext()]);
    return () => {
      window.removeEventListener("ostracon:selection-changed", onSelectionChanged);
      window.removeEventListener("ostracon:quote-root-cleared", onRootCleared);
    };
  }, [active, refreshSelection, refreshRoot, refreshContext]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { void refreshContext(); }, 1500);
    return () => window.clearInterval(timer);
  }, [active, refreshContext]);

  const checkRootSelection = useCallback(async (session) => {
    if (rootCheckInFlight.current) return "busy";
    rootCheckInFlight.current = true;
    try {
      const result = await MNBridge.send("selectQuoteRootFromCurrentSelection");
      if (!result?.selected || session !== rootSelectionSession.current) return "pending";
      setRoot(result.root);
      setRootSelectionStatus("selected");
      setError("");
      return "selected";
    } catch (nextError) {
      if (session === rootSelectionSession.current) setError(errorMessage(nextError));
      return "error";
    } finally {
      rootCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active || rootSelectionStatus !== "waiting") return;
    const timer = window.setInterval(() => { void checkRootSelection(rootSelectionSession.current); }, 500);
    return () => window.clearInterval(timer);
  }, [active, rootSelectionStatus, checkRootSelection]);

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
      await MNBridge.send("clearQuoteRoot");
      setRoot(null);
      setRootSelectionStatus("idle");
      setError("");
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }, []);

  const insert = useCallback(async (target, filePath) => {
    setBusyTarget(target);
    setError("");
    try {
      const result = await ostraconWsClient.sendObsidianCommand("insertQuote", { target, filePath }, 45000);
      if (result?.ok) setNotice("已插入引文");
      return result;
    } catch (nextError) {
      const message = errorMessage(nextError);
      setError(message);
      setNotice(message);
      return null;
    } finally {
      setBusyTarget("");
      void refreshContext();
    }
  }, [refreshContext, setNotice]);

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
