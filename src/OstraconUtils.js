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

  var DEFAULT_MD_OPTIONS = { mode: "flat", excerptStyle: "quote", includeImages: true };

  return { normalizeText, imageDataURI, arrayFromNSArray, DEFAULT_MD_OPTIONS };
})();
