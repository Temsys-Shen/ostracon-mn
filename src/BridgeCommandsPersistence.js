var __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon = (function () {
  const PREFS_KEY = "mn_ostracon_markdown_prefs";

  function prefsStore() {
    return NSUserDefaults.standardUserDefaults();
  }

  function loadPrefs() {
    const stored = prefsStore().objectForKey(PREFS_KEY);
    if (stored && typeof stored === "object") {
      return {
        mode: stored.mode === "tree" ? "tree" : "flat",
        includeImages: stored.includeImages !== false,
        includeBacklinks: stored.includeBacklinks !== false,
      };
    }
    return __MN_OSTRACON_UTILS_MNOstraconAddon.DEFAULT_MD_OPTIONS;
  }

  function savePrefs(prefs) {
    const merged = { ...loadPrefs(), ...prefs };
    prefsStore().setObjectForKey(merged, PREFS_KEY);
    return merged;
  }

  function loadJsonObject(key, defaultValue) {
    const stored = prefsStore().objectForKey(key);
    if (!stored) return defaultValue;
    if (typeof stored === "string") {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("持久化数据格式不正确: " + key);
      }
      return parsed;
    }
    if (typeof stored === "object") return stored;
    throw new Error("持久化数据类型不正确: " + key);
  }

  function saveJsonObject(key, value) {
    if (!value || typeof value !== "object") {
      throw new Error("持久化数据必须是对象: " + key);
    }
    prefsStore().setObjectForKey(JSON.stringify(value), key);
    return value;
  }

  return { prefsStore, loadPrefs, savePrefs, loadJsonObject, saveJsonObject };
})();
