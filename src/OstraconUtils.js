var __MN_OSTRACON_UTILS_MNOstraconAddon = (function () {
  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function arrayFromNSArray(value) {
    return __MN_CARD_SELECTION_SERVICE_MNOstraconAddon.arrayFromNSArray(value);
  }

  function getValue(obj, key) {
    if (!obj) return null;
    if (typeof obj.objectForKey === "function") return obj.objectForKey(key);
    return obj[key];
  }

  function getNoteId(note) {
    if (!note) return "";
    return String(note.noteId || note.noteid || note.id || "");
  }

  var DEFAULT_MD_OPTIONS = { mode: "flat", includeImages: true, includeBacklinks: true };
  var DEFAULT_CARD_TITLE_POLICY = { useContentAsTitle: true, untitledTitle: "无标题卡片" };
  var MAX_FILE_BASE_NAME_LENGTH = 12;
  var MN_COLORS = ["#FFFFAA", "#BEFFBE", "#ADD2FF", "#FFAABE", "#FFFF00", "#00FF00", "#00BEFF", "#FF0000", "#FF8000", "#008040", "#003EB3", "#CF1B11", "#FFFFFF", "#DADADA", "#B4B4B4", "#C39DE0"];

  function normalizeCardTitlePolicy(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("OB未提供无标题策略，请更新两端插件");
    }
    if (typeof value.useContentAsTitle !== "boolean") {
      throw new Error("OB无标题策略缺少useContentAsTitle，请更新两端插件");
    }
    if (typeof value.untitledTitle !== "string") {
      throw new Error("OB无标题策略缺少untitledTitle，请更新两端插件");
    }
    return {
      useContentAsTitle: value.useContentAsTitle,
      untitledTitle: value.untitledTitle.trim(),
    };
  }

  function resolveCardTitlePolicy(value) {
    if (value === undefined) return { ...DEFAULT_CARD_TITLE_POLICY };
    return normalizeCardTitlePolicy(value);
  }

  function sanitizeFileBaseName(value, fallback) {
    var fallbackValue = fallback || "Untitled";
    var sanitized = normalizeText(value).replace(/[^A-Za-z0-9._\u4e00-\u9fff-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return Array.from(sanitized || fallbackValue).slice(0, MAX_FILE_BASE_NAME_LENGTH).join("") || fallbackValue;
  }

  return {
    normalizeText, arrayFromNSArray, getValue, getNoteId, DEFAULT_MD_OPTIONS, DEFAULT_CARD_TITLE_POLICY,
    MAX_FILE_BASE_NAME_LENGTH, normalizeCardTitlePolicy, resolveCardTitlePolicy, sanitizeFileBaseName, MN_COLORS,
  };
})();
