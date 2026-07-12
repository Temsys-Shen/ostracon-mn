import MNBridge from "./mnBridge";
import { createPacketDraft, normalizePacket } from "./ostraconContract";
import { createId, nowIso } from "./idUtils";

const DEFAULT_PORT = 27123;
const PROTOCOL_VERSION = 4;
const PLUGIN_ID = "ostracon-mn";
const EXPECTED_SERVER_PLUGIN_ID = "ostracon-ob";
const VERSION_MISMATCH_ERROR = "插件版本不一致，请同时更新MarginNote端和Obsidian端";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const MAX_TRACKED_MESSAGES = 1000;

function toInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return isFinite(parsed) ? parsed : fallback;
}

function trimString(value) {
  return String(value ?? "").trim();
}

function normalizeSettings(value = {}) {
  return {
    host: trimString(value.host) || "127.0.0.1",
    port: toInteger(value.port, DEFAULT_PORT),
    clientId: trimString(value.clientId) || "",
    autoReconnect: value.autoReconnect !== false,
    heartbeatIntervalMs: Math.max(5000, toInteger(value.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS)),
    reconnectBaseDelayMs: Math.max(250, toInteger(value.reconnectBaseDelayMs, DEFAULT_RECONNECT_BASE_DELAY_MS)),
    reconnectMaxDelayMs: Math.max(DEFAULT_RECONNECT_BASE_DELAY_MS, toInteger(value.reconnectMaxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS)),
  };
}

function createDefaultSettings() {
  return normalizeSettings();
}

function buildConnectionUrl(settings, clientId) {
  const safeSettings = normalizeSettings(settings);
  const cid = encodeURIComponent(clientId || "");
  // "::" is a bind address (all interfaces), not a connect address. Use IPv6 loopback instead.
  let host = safeSettings.host;
  if (host === "::") host = "::1";
  // Strip existing brackets to avoid double-bracketing
  const clean = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const hostPart = clean.includes(":") ? `[${clean}]` : clean;
  return `ws://${hostPart}:${safeSettings.port}?clientId=${cid}`;
}

function buildClientHelloPayload(settings, clientId) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    pluginId: PLUGIN_ID,
    clientId,
    clientPlatform: "MarginNote",
    transport: "ws",
    capabilities: [
      "hello",
      "ping",
      "pong",
      "event",
      "command",
      "command_result",
      "ack",
      "error",
    ],
    outputPreference: "obsidian-vault",
    requestedAt: nowIso(),
    settings: {
      host: settings.host,
      port: settings.port,
    },
  };
}

function createRequestId(prefix) {
  return createId(prefix);
}

const WS_STATE_TRANSITIONS = {
  idle:             ["connecting"],
  connecting:       ["connected", "error", "disconnected", "pending_approval"],
  connected:        ["ready", "error", "disconnected", "pending_approval"],
  ready:            ["error", "disconnected", "reconnecting"],
  reconnecting:     ["connecting", "error", "disconnected"],
  error:            ["disconnected", "connecting"],
  disconnected:     ["connecting", "idle"],
  closed:           ["connecting", "idle"],
  pending_approval: ["ready", "error", "disconnected"],
};

const WS_STATE_BY = {
  open:             { status: "connected",     socketState: "open",   connected: true },
  connecting:       { status: "connecting",    socketState: "connecting", connected: false, ready: false },
  disconnect:       { status: "disconnected",  socketState: "closed", connected: false, ready: false },
  error:            { status: "error",         socketState: "closed" },
  close:            { status: "closed",        socketState: "closed", connected: false, ready: false },
  reconnecting:     { status: "reconnecting" },
  ready:            { status: "ready",         ready: true },
  pending_approval: { status: "pending_approval", connected: true, ready: false },
};

const SERVER_COMMAND_HANDLERS = {
  async listNotebooks(self, requestId, payload) {
    const result = await MNBridge.send("listNotebooks", payload);
    self.sendResult(requestId, result);
  },
  async listCards(self, requestId, payload) {
    const result = await MNBridge.send("listCards", payload);
    self.sendResult(requestId, result);
  },
  async fetchCards(self, requestId, payload) {
    const result = await MNBridge.send("fetchCards", payload, 30000);
    const format = result && result.format === "canvas" ? "canvas" : "markdown";
    const content = format === "canvas" ? result.canvas : result.markdown;
    const packet = normalizePacket(createPacketDraft({
      markdown: content,
      sourceTitle: result.fileBaseName || "MarginNote",
      folder: "Inbox",
      format,
      isCanvas: format === "canvas",
      objects: Array.isArray(result.cards) ? result.cards : null,
    }));
    self.sendResult(requestId, { ok: true, packet, noteCount: result.noteCount || packet.objects.length });
  },
  async getQuoteSelection(self, requestId, payload) {
    const result = await MNBridge.send(
      "getQuoteSelection",
      { createCard: payload && payload.createCard === true },
      30000,
    );
    self.sendResult(requestId, result);
  },
};

class OstraconWsClient {
  constructor() {
    this.listeners = new Set();
    this.settings = createDefaultSettings();
    this.settingsReady = false;
    // Use a temporary clientId; the real one will be loaded from NSUserDefaults in loadStoredSettings()
    this.clientId = createId("mn-client");
    this.socket = null;
    this.shouldReconnect = false;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.connectTimer = null;
    this.connectPromise = null;
    this.heartbeatTimer = null;
    this.heartbeatInFlight = false;
    this.reconnectCount = 0;
    this.pendingRequests = new Map();
    this.seenMessageKeys = new Set();
    this.state = {
      status: "idle",
      socketState: "closed",
      connected: false,
      ready: false,
      clientId: this.clientId,
      connectionUrl: "",
      settings: this.settings,
      reconnectCount: 0,
      pendingCount: 0,
      lastHello: null,
      lastAck: null,
      lastPong: null,
      lastCommandResult: null,
      lastEvent: null,
      lastError: "",
      lastClose: null,
      vaultName: "",
    };
  }

  getSnapshot() {
    return {
      ...this.state,
      settings: { ...this.state.settings },
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({
      event: null,
      snapshot: this.getSnapshot(),
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event = null) {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener({
        event,
        snapshot,
      });
    }
  }

  log(level, message, detail = null) {
    this.emit({
      type: "log",
      entry: {
        level,
        message,
        detail,
        at: nowIso(),
      },
    });
  }

  setState(partial) {
    this.state = {
      ...this.state,
      ...partial,
      settings: partial.settings ? normalizeSettings(partial.settings) : this.state.settings,
    };
    this.emit({
      type: "state",
    });
  }

  transitionTo(event) {
    const target = WS_STATE_BY[event];
    if (!target) {
      console.warn(`Unknown state transition event: ${event}`);
      return;
    }
    const allowed = WS_STATE_TRANSITIONS[this.state.status];
    if (!allowed || !allowed.includes(target.status)) {
      console.warn(`Invalid state transition: ${this.state.status} -> ${target.status} (via ${event})`);
    }
    this.setState(target);
  }

  updateSettings(patch) {
    const nextSettings = normalizeSettings({
      ...this.settings,
      ...patch,
    });

    this.settings = nextSettings;
    this.settingsReady = true;
    this.setState({
      settings: nextSettings,
    });
    this.log("info", "已保存MN侧WS设置", {
      host: nextSettings.host,
      port: nextSettings.port,
      autoReconnect: nextSettings.autoReconnect,
    });
    return MNBridge.send("setWsSettings", nextSettings);
  }

  clearLastError() {
    if (!this.state.lastError) {
      return;
    }
    this.setState({
      lastError: "",
    });
  }

  async loadStoredSettings() {
    let nativeSettings;
    try {
      nativeSettings = await MNBridge.send("getWsSettings");
    } catch (e) {
      nativeSettings = null;
    }
    let nextSettings = normalizeSettings(nativeSettings || {});

    // Migrate legacy localStorage settings if present
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem("ostracon-mn-ws-settings");
        if (raw) {
          const legacy = normalizeSettings(JSON.parse(raw));
          nextSettings = legacy;
          await MNBridge.send("setWsSettings", nextSettings);
          window.localStorage.removeItem("ostracon-mn-ws-settings");
        }
      }
    } catch (_) {
      // ignore migration errors
    }

    // Load clientId from NSUserDefaults
    let persistedClientId = "";
    try {
      const result = await MNBridge.send("getClientId");
      if (result && typeof result === "string" && result.length > 0) {
        persistedClientId = result;
      }
    } catch (e) {
      // no persisted clientId yet
    }

    if (persistedClientId) {
      this.clientId = persistedClientId;
    } else {
      // Persist the temp clientId to NSUserDefaults
      try {
        await MNBridge.send("setClientId", { clientId: this.clientId });
      } catch (e) {
        // ignore save errors
      }
    }

    this.settings = nextSettings;
    this.settingsReady = true;
    this.setState({
      settings: nextSettings,
      clientId: this.clientId,
    });
    return this.getSnapshot();
  }

  buildConnectionUrl() {
    return buildConnectionUrl(this.settings, this.clientId);
  }

  validateSettings() {
    if (!isFinite(this.settings.port) || this.settings.port <= 0) {
      throw new Error(`Invalid WebSocket port: ${this.settings.port}`);
    }
  }

  connect() {
    this.validateSettings();

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.setState({
        status: "connected",
        socketState: "open",
        connected: true,
        lastError: "",
      });
      return Promise.resolve(this.getSnapshot());
    }
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      if (this.connectPromise) {
        return this.connectPromise;
      }
      throw new Error("WebSocket connection is already in progress");
    }

    this.manualDisconnect = false;
    this.shouldReconnect = this.settings.autoReconnect;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();

    const connectionUrl = this.buildConnectionUrl();
    this.setState({
      ...WS_STATE_BY.connecting,
      connectionUrl,
      lastError: "",
      lastClose: null,
    });

    this.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        this.connectPromise = null;
        resolve(value);
      };
      const settleReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        this.connectPromise = null;
        reject(error);
      };

      this.connectTimer = setTimeout(() => {
        const error = new Error("连接超时，请确认Obsidian Ostracon插件已启动");
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close(1000, "connect timeout");
        }
        this.setState({
          ...WS_STATE_BY.error,
          socketState: "closed",
          connected: false,
          ready: false,
          lastError: error.message,
        });
        settleReject(error);
      }, 8000);

      try {
        this.socket = new WebSocket(connectionUrl);
      } catch (error) {
        this.setState({
          ...WS_STATE_BY.error,
          socketState: "closed",
          lastError: error.message || String(error),
        });
        settleReject(error);
        return;
      }

      this.socket.addEventListener("open", () => {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        this.setState({
          ...WS_STATE_BY.open,
          lastError: "",
        });
        this.log("info", "WebSocket已连接", {
          host: this.settings.host,
          port: this.settings.port,
        });
        this.sendHello();
        this.startHeartbeat();
        settleResolve(this.getSnapshot());
      });

      this.socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      this.socket.addEventListener("error", () => {
        this.setState({
          status: "error",
          lastError: "WebSocket连接发生错误",
        });
        this.log("error", "WebSocket连接发生错误");
        settleReject(new Error("WebSocket连接发生错误"));
      });

      this.socket.addEventListener("close", (event) => {
        this.handleClose(event);
        if (!settled && !this.manualDisconnect) {
          settleReject(new Error(event.reason || `WebSocket closed with code ${event.code}`));
        }
      });
    });
    return this.connectPromise;
  }

  disconnect() {
    this.manualDisconnect = true;
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.rejectAllPending(new Error("WebSocket disconnected"));
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close(1000, "manual disconnect");
    }
    this.socket = null;
    this.setState({
      ...WS_STATE_BY.disconnect,
    });
    this.log("info", "已断开WebSocket连接");
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  clearHeartbeatTimer() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatInFlight = false;
  }

  startHeartbeat() {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (this.heartbeatInFlight) {
        return;
      }
      this.heartbeatInFlight = true;
      const clearHeartbeat = () => {
        this.heartbeatInFlight = false;
      };
      this.ping({ source: "heartbeat" })
        .then(clearHeartbeat, (error) => {
          this.log("error", "心跳失败", {
            message: error.message || String(error),
          });
          clearHeartbeat();
        });
    }, this.settings.heartbeatIntervalMs);
  }

  handleClose(event) {
    this.clearHeartbeatTimer();
    this.socket = null;
    this.rejectAllPending(new Error(event.reason || `WebSocket closed with code ${event.code}`));

    this.setState({
      connected: false,
      ready: false,
      socketState: "closed",
      lastClose: {
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
        at: nowIso(),
      },
    });
    this.log("info", "WebSocket已关闭", {
      code: event.code,
      reason: event.reason || "",
      wasClean: event.wasClean,
    });

    if (this.manualDisconnect) {
      this.setState(WS_STATE_BY.disconnect);
      return;
    }

    if (!this.shouldReconnect) {
      this.setState({
        ...WS_STATE_BY.close,
        lastError: event.reason || `WebSocket closed with code ${event.code}`,
      });
      return;
    }

    if (event.code === 4001 || event.code === 4002 || event.code === 4003 || event.code === 1008) {
      this.shouldReconnect = false;
      this.setState({
        ...WS_STATE_BY.error,
        lastError: event.reason || `Connection rejected with code ${event.code}`,
      });
      return;
    }

    this.scheduleReconnect();
  }

  scheduleReconnect() {
    this.reconnectCount += 1;
    const delay = Math.min(
      this.settings.reconnectBaseDelayMs * (2 ** Math.max(0, this.reconnectCount - 1)),
      this.settings.reconnectMaxDelayMs,
    );

    this.setState({
      ...WS_STATE_BY.reconnecting,
      reconnectCount: this.reconnectCount,
    });
    this.log("info", "准备重连WebSocket", {
      delay,
      reconnectCount: this.reconnectCount,
    });

    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch((error) => {
        this.log("error", "自动重连失败", {
          message: error.message || String(error),
        });
      });
    }, delay);
  }

  sendRaw(frame) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.socket.send(JSON.stringify(frame));
  }

  sendResult(requestId, payload) {
    this.sendRaw({
      type: "command_result",
      requestId: requestId || "",
      clientId: this.clientId,
      payload,
    });
  }

  sendCommandError(requestId, command, error) {
    this.sendRaw({
      type: "error",
      requestId: requestId || "",
      clientId: this.clientId,
      payload: {
        command,
        message: error && error.message ? error.message : String(error),
      },
    });
  }

  rememberMessage(message) {
    if (!message || !message.requestId) {
      return false;
    }
    const key = `${message.requestId}:${message.type || "unknown"}`;
    if (this.seenMessageKeys.has(key)) {
      return true;
    }
    this.seenMessageKeys.add(key);
    if (this.seenMessageKeys.size > MAX_TRACKED_MESSAGES) {
      const firstKey = this.seenMessageKeys.values().next().value;
      this.seenMessageKeys.delete(firstKey);
    }
    return false;
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch (error) {
      this.log("error", "收到无法解析的WS消息", {
        message: String(error.message || error),
      });
      this.setState({
        lastError: "收到无法解析的WS消息",
      });
      return;
    }

    if (!message || typeof message !== "object") {
      return;
    }

    if (this.rememberMessage(message)) {
      return;
    }

    const pending = message.requestId ? this.pendingRequests.get(message.requestId) : null;
    if (pending && pending.terminalTypes.has(message.type)) {
      this.pendingRequests.delete(message.requestId);
      this.setState({
        pendingCount: this.pendingRequests.size,
      });
      clearTimeout(pending.timer);
      pending.resolve(message);
    } else if (message.type === "error" && pending) {
      this.pendingRequests.delete(message.requestId);
      this.setState({
        pendingCount: this.pendingRequests.size,
      });
      clearTimeout(pending.timer);
      pending.reject(new Error(message.payload && message.payload.message ? message.payload.message : "WebSocket error"));
      return;
    }

    switch (message.type) {
      case "hello":
        if (!message.payload
          || message.payload.protocolVersion !== PROTOCOL_VERSION
          || message.payload.pluginId !== EXPECTED_SERVER_PLUGIN_ID) {
          this.setState({
            ...WS_STATE_BY.error,
            connected: false,
            ready: false,
            lastError: VERSION_MISMATCH_ERROR,
          });
          this.log("error", VERSION_MISMATCH_ERROR, {
            protocolVersion: message.payload && message.payload.protocolVersion,
            pluginId: message.payload && message.payload.pluginId,
          });
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close(4002, VERSION_MISMATCH_ERROR);
          }
          break;
        }
        this.setState({
          ...WS_STATE_BY.ready,
          vaultName: message.payload && message.payload.vaultName ? message.payload.vaultName : "",
          lastHello: {
            at: nowIso(),
            payload: message.payload || null,
          },
          lastError: "",
        });
        this.log("info", "收到OB hello");
        break;
      case "pending_approval":
        this.setState({
          ...WS_STATE_BY.pending_approval,
          lastError: "",
        });
        this.log("info", "等待OB端确认连接...");
        break;
      case "approved":
        this.setState({
          ...WS_STATE_BY.open,
          ready: false,
          lastError: "",
        });
        this.log("info", "OB端已批准连接");
        this.sendHello();
        break;
      case "ack":
        this.setState({
          lastAck: {
            at: nowIso(),
            requestId: message.requestId || "",
            payload: message.payload || null,
          },
        });
        this.log("info", "收到ack", {
          requestId: message.requestId || "",
          command: message.payload && message.payload.command ? message.payload.command : "",
        });
        break;
      case "pong":
        this.setState({
          lastPong: {
            at: nowIso(),
            requestId: message.requestId || "",
            payload: message.payload || null,
          },
        });
        this.log("info", "收到pong", {
          requestId: message.requestId || "",
        });
        break;
      case "command_result":
        this.setState({
          lastCommandResult: {
            at: nowIso(),
            requestId: message.requestId || "",
            payload: message.payload || null,
          },
        });
        this.log("info", "收到command_result", {
          requestId: message.requestId || "",
        });
        break;
      case "event":
        this.setState({ lastEvent: { at: nowIso(), event: message.event || "", payload: message.payload || null } });
        break;
      case "error":
        this.log("error", "收到OB错误", message.payload || null);
        break;
      case "command":
        this.handleServerCommand(message);
        break;
      default:
        this.log("info", "收到未处理消息", {
          type: message.type,
          requestId: message.requestId || "",
        });
        break;
    }
  }

  async handleServerCommand(message) {
    const command = String(message.command || "").trim();
    if (!command) {
      this.sendCommandError(message.requestId, command, new Error("OB命令缺少command"));
      return;
    }

    const handler = SERVER_COMMAND_HANDLERS[command];
    if (!handler) {
      this.sendCommandError(message.requestId, command, new Error(`不支持的OB命令: ${command}`));
      return;
    }

    try {
      await handler(this, message.requestId, message.payload || {});
    } catch (error) {
      this.sendCommandError(message.requestId, command, error);
      this.log("error", "处理OB命令失败", {
        command,
        message: error && error.message ? error.message : String(error),
      });
    }
  }

  rejectAllPending(error) {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
    this.setState({
      pendingCount: 0,
    });
  }

  request(frame, options = {}) {
    const requestId = frame.requestId || createRequestId(frame.type || "request");
    const terminalTypes = new Set(options.resolveOn || []);
    if (terminalTypes.size === 0) {
      terminalTypes.add("ack");
    }

    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    const message = {
      ...frame,
      requestId,
    };

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.setState({
          pendingCount: this.pendingRequests.size,
        });
        reject(new Error(`Request timed out: ${message.type || "unknown"} ${requestId}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        terminalTypes,
        resolve,
        reject,
        timer,
      });
      this.setState({
        pendingCount: this.pendingRequests.size,
      });

      try {
        this.sendRaw(message);
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        this.setState({
          pendingCount: this.pendingRequests.size,
        });
        reject(error);
      }
    });
  }

  sendHello() {
    return this.sendRaw({
      type: "hello",
      requestId: createRequestId("hello"),
      payload: buildClientHelloPayload(this.settings, this.clientId),
    });
  }

  ping(payload = {}) {
    return this.request(
      {
        type: "ping",
        payload: {
          clientTime: nowIso(),
          ...payload,
        },
      },
      {
        resolveOn: ["pong"],
      },
    );
  }

  sendPacket(packet) {
    const normalized = normalizePacket(packet);
    return this.request(
      {
        type: "command",
        command: "submitPacket",
        clientId: this.clientId,
        payload: normalized,
      },
      {
        resolveOn: ["command_result"],
      },
    );
  }

  sendObsidianCommand(command, payload = {}, timeoutMs = 30000) {
    return this.request(
      { type: "command", command, clientId: this.clientId, payload },
      { resolveOn: ["command_result"], timeoutMs },
    ).then(message => message.payload);
  }
}

const ostraconWsClient = new OstraconWsClient();

export {
  OstraconWsClient,
  PROTOCOL_VERSION,
  buildClientHelloPayload,
  createDefaultSettings,
  createRequestId,
  normalizeSettings,
};

export default ostraconWsClient;
