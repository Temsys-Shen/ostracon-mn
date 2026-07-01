import { normalizePacket } from "./ostraconContract";

const STORAGE_KEY = "ostracon-mn-ws-settings";
const DEFAULT_PORT = 27123;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const MAX_TRACKED_MESSAGES = 1000;

function createId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${random}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimString(value) {
  return String(value ?? "").trim();
}

function normalizeSettings(value = {}) {
  return {
    host: trimString(value.host) || "127.0.0.1",
    port: toInteger(value.port, DEFAULT_PORT),
    token: trimString(value.token),
    autoReconnect: value.autoReconnect !== false,
    heartbeatIntervalMs: Math.max(5000, toInteger(value.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS)),
    reconnectBaseDelayMs: Math.max(250, toInteger(value.reconnectBaseDelayMs, DEFAULT_RECONNECT_BASE_DELAY_MS)),
    reconnectMaxDelayMs: Math.max(DEFAULT_RECONNECT_BASE_DELAY_MS, toInteger(value.reconnectMaxDelayMs, DEFAULT_RECONNECT_MAX_DELAY_MS)),
  };
}

function createDefaultSettings() {
  return normalizeSettings();
}

function loadSettings() {
  if (typeof window === "undefined") {
    return createDefaultSettings();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultSettings();
  }

  try {
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to parse Ostracon WS settings", error);
    return createDefaultSettings();
  }
}

function saveSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

function buildConnectionUrl(settings, sessionId) {
  const safeSettings = normalizeSettings(settings);
  const token = encodeURIComponent(safeSettings.token);
  const session = encodeURIComponent(sessionId || "");
  return `ws://${safeSettings.host}:${safeSettings.port}?token=${token}&session=${session}`;
}

function buildClientHelloPayload(settings, sessionId, clientId) {
  return {
    protocolVersion: 1,
    pluginId: "ostracon-mn",
    clientId,
    sessionId,
    clientPlatform: "MarginNote",
    transport: "ws",
    capabilities: [
      "hello",
      "ping",
      "pong",
      "event",
      "command",
      "sync_request",
      "sync_result",
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

function maskToken(token) {
  const value = trimString(token);
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function createRequestId(prefix) {
  return createId(prefix);
}

class OstraconWsClient {
  constructor() {
    this.listeners = new Set();
    this.settings = loadSettings();
    this.clientId = createId("mn-client");
    this.sessionId = createId("mn-session");
    this.socket = null;
    this.shouldReconnect = false;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.connectTimer = null;
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
      sessionId: this.sessionId,
      connectionUrl: "",
      settings: this.settings,
      reconnectCount: 0,
      pendingCount: 0,
      lastHello: null,
      lastAck: null,
      lastPong: null,
      lastSyncResult: null,
      lastError: "",
      lastClose: null,
      serverSessionId: "",
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

  updateSettings(patch) {
    const nextSettings = normalizeSettings({
      ...this.settings,
      ...patch,
    });

    this.settings = nextSettings;
    saveSettings(nextSettings);
    this.setState({
      settings: nextSettings,
    });
    this.log("info", "已保存MN侧WS设置", {
      host: nextSettings.host,
      port: nextSettings.port,
      autoReconnect: nextSettings.autoReconnect,
    });
  }

  buildConnectionUrl() {
    return buildConnectionUrl(this.settings, this.sessionId);
  }

  validateSettings() {
    if (!this.settings.token) {
      throw new Error("Obsidian token is required before connecting");
    }
    if (!Number.isFinite(this.settings.port) || this.settings.port <= 0) {
      throw new Error(`Invalid WebSocket port: ${this.settings.port}`);
    }
  }

  connect() {
    this.validateSettings();

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve(this.getSnapshot());
    }

    this.manualDisconnect = false;
    this.shouldReconnect = this.settings.autoReconnect;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();

    const connectionUrl = this.buildConnectionUrl();
    this.setState({
      status: "connecting",
      socketState: "connecting",
      connected: false,
      ready: false,
      connectionUrl,
      lastError: "",
      lastClose: null,
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        resolve(value);
      };
      const settleReject = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        reject(error);
      };

      this.connectTimer = setTimeout(() => {
        settleReject(new Error("连接超时，请确认 Obsidian Ostracon 插件已启动"));
      }, 8000);

      try {
        this.socket = new WebSocket(connectionUrl);
      } catch (error) {
        this.setState({
          status: "error",
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
          status: "connected",
          socketState: "open",
          connected: true,
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
      status: "disconnected",
      socketState: "closed",
      connected: false,
      ready: false,
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
      this.ping({ source: "heartbeat" })
        .catch((error) => {
          this.log("error", "心跳失败", {
            message: error.message || String(error),
          });
        })
        .finally(() => {
          this.heartbeatInFlight = false;
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
      this.setState({
        status: "disconnected",
      });
      return;
    }

    if (!this.shouldReconnect) {
      this.setState({
        status: "closed",
      });
      return;
    }

    if (event.code === 4001 || event.code === 4003 || event.code === 1008) {
      this.shouldReconnect = false;
      this.setState({
        status: "error",
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
      status: "reconnecting",
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
        lastError: message.payload && message.payload.message ? message.payload.message : "WebSocket error",
      });
      clearTimeout(pending.timer);
      pending.reject(new Error(message.payload && message.payload.message ? message.payload.message : "WebSocket error"));
      return;
    }

    switch (message.type) {
      case "hello":
        this.setState({
          ready: true,
          status: "ready",
          serverSessionId: message.payload && message.payload.sessionId ? message.payload.sessionId : "",
          lastHello: {
            at: nowIso(),
            payload: message.payload || null,
          },
          lastError: "",
        });
        this.log("info", "收到OB hello", {
          sessionId: message.payload && message.payload.sessionId ? message.payload.sessionId : "",
        });
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
      case "sync_result":
        this.setState({
          lastSyncResult: {
            at: nowIso(),
            requestId: message.requestId || "",
            payload: message.payload || null,
          },
        });
        this.log("info", "收到sync_result", {
          requestId: message.requestId || "",
        });
        break;
      case "error":
        this.setState({
          lastError: message.payload && message.payload.message ? message.payload.message : "WebSocket error",
        });
        this.log("error", "收到OB错误", message.payload || null);
        break;
      default:
        this.log("info", "收到未处理消息", {
          type: message.type,
          requestId: message.requestId || "",
        });
        break;
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
      payload: buildClientHelloPayload(this.settings, this.sessionId, this.clientId),
    });
  }

  ping(payload = {}) {
    return this.request(
      {
        type: "ping",
        payload: {
          clientTime: nowIso(),
          sessionId: this.sessionId,
          ...payload,
        },
      },
      {
        resolveOn: ["pong"],
      },
    );
  }

  syncRequest(payload = {}) {
    return this.request(
      {
        type: "sync_request",
        payload: {
          scope: "packets",
          ...payload,
        },
      },
      {
        resolveOn: ["sync_result"],
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
        sessionId: this.sessionId,
        payload: normalized,
      },
      {
        resolveOn: ["sync_result"],
      },
    );
  }
}

const ostraconWsClient = new OstraconWsClient();

export {
  createDefaultSettings,
  createRequestId,
  loadSettings,
  maskToken,
  normalizeSettings,
};

export default ostraconWsClient;
