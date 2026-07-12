var __MN_OSTRACON_UTILS_MNOstraconAddon = (function () {
  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function imageDataURI(paintHash) {
    try {
      var data = Database.sharedInstance().getMediaByHash(paintHash);
      if (!data) return null;
      var base64 = data.base64Encoding();
      if (base64 && typeof base64 === "string") return "data:image/png;base64," + base64;
      console.log("[Ostracon] base64Encoding returned:", typeof base64);
    } catch (e) {
      console.log("[Ostracon] imageDataURI error:", String(e));
    }
    return null;
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

  var DEFAULT_TITLE_FALLBACK_MAX_LENGTH = 30;

  function usesExcerptAsTitle(note) {
    var title = normalizeText(note ? note.noteTitle : "");
    if (title) return false;
    var excerpt = normalizeText(note ? note.excerptText : "");
    return Boolean(excerpt && excerpt.length <= DEFAULT_TITLE_FALLBACK_MAX_LENGTH);
  }

  function resolveNoteTitle(note, options) {
    var title = normalizeText(note ? note.noteTitle : "");
    if (title) return title;

    var excerpt = normalizeText(note ? note.excerptText : "");
    if (usesExcerptAsTitle(note)) return excerpt;

    return "Untitled Card";
  }

  var DEFAULT_MD_OPTIONS = { mode: "flat", includeImages: true, includeBacklinks: true };
  var MN_COLORS = ["#FFFFAA", "#BEFFBE", "#ADD2FF", "#FFAABE", "#FFFF00", "#00FF00", "#00BEFF", "#FF0000", "#FF8000", "#008040", "#003EB3", "#CF1B11", "#FFFFFF", "#DADADA", "#B4B4B4", "#C39DE0"];

  return { normalizeText, imageDataURI, arrayFromNSArray, getValue, getNoteId, usesExcerptAsTitle, resolveNoteTitle, DEFAULT_MD_OPTIONS, MN_COLORS };
})();
