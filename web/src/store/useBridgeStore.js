import { create } from "zustand";
import { createDefaultSettings } from "../lib/ostraconWsClient";

const useBridgeStore = create((set) => ({
  logs: [],
  connection: {
    status: "idle",
    socketState: "closed",
    connected: false,
    ready: false,
    clientId: "",
    sessionId: "",
    connectionUrl: "",
    settings: createDefaultSettings(),
    reconnectCount: 0,
    pendingCount: 0,
    lastHello: null,
    lastAck: null,
    lastPong: null,
    lastSyncResult: null,
    lastError: "",
    lastClose: null,
    serverSessionId: "",
  },
  sendHistory: [],
  appendLog(entry) {
    set((state) => ({ logs: [entry, ...state.logs].slice(0, 50) }));
  },
  setConnection(snapshot) {
    set({ connection: snapshot });
  },
  addSendHistory(entry) {
    set((state) => ({ sendHistory: [entry, ...state.sendHistory].slice(0, 20) }));
  },
  clearLogs() {
    set({ logs: [] });
  },
}));

export default useBridgeStore;
