import { useEffect, useCallback } from "react";
import MNBridge from "../lib/mnBridge";
import { normalizeError } from "../lib/errors";
import { MN_CMD } from "../lib/commands";

function usePreferences(setPrefsState, setNotice) {
  useEffect(() => {
    let alive = true;
    MNBridge.send(MN_CMD.GET_MARKDOWN_PREFERENCES).then((mdPrefs) => {
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
      MNBridge.send(MN_CMD.SET_MARKDOWN_PREFERENCES, n).catch((e) => console.warn("setMarkdownPreferences failed", e));
      return n;
    });
  }, [setPrefsState]);

  return { setPrefs };
}

export { usePreferences };
