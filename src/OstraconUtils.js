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
  var MN_COLORS = ["#FFFFAA", "#BEFFBE", "#ADD2FF", "#FFAABE", "#FFFF00", "#00FF00", "#00BEFF", "#FF0000", "#FF8000", "#008040", "#003EB3", "#CF1B11", "#FFFFFF", "#DADADA", "#B4B4B4", "#C39DE0"];

  return { normalizeText, arrayFromNSArray, getValue, getNoteId, DEFAULT_MD_OPTIONS, MN_COLORS };
})();
