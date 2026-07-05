var __MN_NOTE_CHANGE_EVENTS_MNOstraconAddon = (function () {
  const NOTIFICATION_NAME = "ReloadDigestNotes";
  const WEB_HANDLER = "__OstraconNativeCardChanged";

  function getValue(obj, key) {
    if (!obj) return null;
    if (typeof obj.objectForKey === "function") return obj.objectForKey(key);
    return obj[key];
  }

  function getNoteId(note) {
    if (!note) return "";
    return String(note.noteId || note.noteid || note.id || "");
  }

  function install(context) {
    const center = NSNotificationCenter.defaultCenter();
    remove(context);
    center.addObserverSelectorName(context, "onOstraconNoteChanged:", NOTIFICATION_NAME);
    console.log("[OstraconNoteEvents] installed ReloadDigestNotes");
  }

  function remove(context) {
    NSNotificationCenter.defaultCenter().removeObserverName(context, NOTIFICATION_NAME);
  }

  function handleNotification(context, notification) {
    const userInfo = notification ? notification.userInfo : null;
    const command = String(getValue(userInfo, "command") || "");
    if (command !== "modify") return;

    const note = getValue(userInfo, "note");
    const noteId = getNoteId(note);
    if (!noteId) return;

    const payload = {
      noteId,
      modifiedDate: note && note.modifiedDate ? String(note.modifiedDate) : "",
      notebookId: note && note.notebookId ? String(note.notebookId) : "",
    };
    console.log("[OstraconNoteEvents] modify " + noteId);

    try {
      if (!context.webController || !context.webController.webView) {
        throw new Error("webController.webView missing");
      }
      const script = "(function(){"
        + "if(typeof window." + WEB_HANDLER + "!=='function'){"
        + "console.log('[OstraconNoteEvents] web handler missing');"
        + "return false;"
        + "}"
        + "window." + WEB_HANDLER + "(" + JSON.stringify(payload) + ");"
        + "console.log('[OstraconNoteEvents] pushed web " + noteId + "');"
        + "return true;"
        + "})()";
      context.webController.webView.evaluateJavaScript(script, function () {});
    } catch (error) {
      console.log("[OstraconNoteEvents] push web failed: " + (error && error.message ? error.message : String(error)));
    }
  }

  return {
    install,
    remove,
    handleNotification,
  };
})();
