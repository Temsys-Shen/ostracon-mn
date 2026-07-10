import { useEffect, useCallback } from "react";
import MNBridge from "../lib/mnBridge";

function normalizeError(e) {
  if (!e) return "未知错误";
  return typeof e === "string" ? e : e.message || JSON.stringify(e);
}

function usePreferences(setPrefsState, setSyncedCards, setSyncedScopes, setNotice) {
  useEffect(() => {
    let alive = true;
    Promise.all([
      MNBridge.send("getMarkdownPreferences"),
      MNBridge.send("getSyncedCards"),
      MNBridge.send("getSyncedScopes"),
    ]).then(([mdPrefs, synced, syncedScopes]) => {
      if (!alive) return;
      if (mdPrefs) {
        setPrefsState({
          mode: mdPrefs.mode || "flat",
          excerptStyle: mdPrefs.excerptStyle || "quote",
          includeBacklinks: mdPrefs.includeBacklinks !== false,
        });
      }
      setSyncedCards(synced?.cards || {});
      setSyncedScopes(syncedScopes?.scopes || {});
    }).catch((e) => setNotice(`偏好读取失败: ${normalizeError(e)}`));
    return () => { alive = false; };
  }, [setPrefsState, setSyncedCards, setSyncedScopes, setNotice]);

  const setPrefs = useCallback((k, v) => {
    setPrefsState((prev) => {
      const n = { ...prev, [k]: v };
      MNBridge.send("setMarkdownPreferences", n).catch((e) => console.warn("setMarkdownPreferences failed", e));
      return n;
    });
  }, [setPrefsState]);

  return { setPrefs };
}

export { usePreferences };
