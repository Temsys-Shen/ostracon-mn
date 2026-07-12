import { useEffect, useCallback } from "react";
import MNBridge from "../lib/mnBridge";

function normalizeError(e) {
  if (!e) return "未知错误";
  return typeof e === "string" ? e : e.message || JSON.stringify(e);
}

function usePreferences(setPrefsState, setNotice) {
  useEffect(() => {
    let alive = true;
    MNBridge.send("getMarkdownPreferences").then((mdPrefs) => {
      if (!alive) return;
      if (mdPrefs) {
        setPrefsState({
          mode: mdPrefs.mode || "flat",
          includeBacklinks: mdPrefs.includeBacklinks !== false,
        });
      }
    }).catch((e) => setNotice(`偏好读取失败: ${normalizeError(e)}`));
    return () => { alive = false; };
  }, [setPrefsState, setNotice]);

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
