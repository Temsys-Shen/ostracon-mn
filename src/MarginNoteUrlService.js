var __MN_MARGIN_NOTE_URL_SERVICE_MNOstraconAddon = (function () {
  const MARGIN_NOTE_SCHEME = "marginnote4app";

  function parseMarginNoteUrl(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("打开MarginNote链接的payload必须是对象");
    }
    if (typeof payload.url !== "string" || !payload.url.trim()) {
      throw new Error("MarginNote链接不能为空");
    }

    const urlString = payload.url.trim();
    const url = NSURL.URLWithString(urlString);
    if (!url) throw new Error("MarginNote链接格式无效");
    if (String(url.scheme || "").toLowerCase() !== MARGIN_NOTE_SCHEME) {
      throw new Error("仅支持marginnote4app链接");
    }
    return { url, urlString };
  }

  function open(context, payload) {
    const parsed = parseMarginNoteUrl(payload);
    Application.sharedInstance().openURL(parsed.url);
    return { opened: true, url: parsed.urlString };
  }

  return { open };
})();
