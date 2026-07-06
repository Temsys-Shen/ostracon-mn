var __MN_BRIDGE_DISPATCHER_MNOstraconAddon = (function () {
  const BRIDGE_SCHEME = "mnaddon";
  const BRIDGE_HOST = "bridge";

  function evaluateScript(webView, script) {
    webView.evaluateJavaScript(script, function () {});
  }

  function encodeBridgeJSON(value) {
    return JSON.stringify(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function decodeBridgeMessage(requestURL) {
    var absolute = String(requestURL.absoluteString());
    if (!absolute.startsWith(BRIDGE_SCHEME + "://" + BRIDGE_HOST)) {
      throw new Error("Unexpected bridge URL: " + absolute);
    }

    var marker = "payload=";
    var index = absolute.indexOf(marker);
    if (index < 0) {
      throw new Error("Missing payload in bridge URL: " + absolute);
    }

    var rawPayload = absolute.slice(index + marker.length);
    var decodedPayload = decodeURIComponent(rawPayload);
    var message = JSON.parse(decodedPayload);

    if (!message || typeof message !== "object") {
      throw new Error("Bridge payload must be an object");
    }
    if (!message.command || typeof message.command !== "string") {
      throw new Error("Bridge payload missing command");
    }
    if (!message.requestId || typeof message.requestId !== "string") {
      throw new Error("Bridge payload missing requestId");
    }

    return message;
  }

  function sendBridgeResponse(webView, requestId, result, error) {
    var response = {
      requestId: requestId,
      payload: result === undefined ? null : result,
      error: error === undefined ? null : error,
    };

    var script = "window.__MNBridgeReceive_MNOstraconAddon('" + encodeBridgeJSON(response) + "')";
    evaluateScript(webView, script);
  }

  function normalizeBridgeError(error, command) {
    return {
      message: error && error.message ? error.message : String(error),
      command: command || "unknown",
    };
  }

  function isPromiseLike(value) {
    return !!value && typeof value.then === "function";
  }

  function dispatchBridgeCommand(controller, message) {
    var commandTable = __MN_WEB_BRIDGE_COMMANDS_MNOstraconAddon.commands;
    var handler = commandTable[message.command];

    if (typeof handler !== "function") {
      throw new Error("Unknown bridge command: " + message.command);
    }

    return handler(
      { controller: controller, addon: controller.addon, closePanel: function () { controller.closeWindow(); } },
      message.payload,
    );
  }

  return {
    evaluateScript: evaluateScript,
    encodeBridgeJSON: encodeBridgeJSON,
    decodeBridgeMessage: decodeBridgeMessage,
    sendBridgeResponse: sendBridgeResponse,
    normalizeBridgeError: normalizeBridgeError,
    isPromiseLike: isPromiseLike,
    dispatchBridgeCommand: dispatchBridgeCommand,
    BRIDGE_SCHEME: BRIDGE_SCHEME,
  };
})();
