import { create } from "zustand";
import { createDefaultSettings } from "../lib/ostraconWsClient";

const useBridgeStore = create((set) => ({
  connection: {
    status: "idle",
    socketState: "closed",
    connected: false,
    ready: false,
    clientId: "",
    connectionUrl: "",
    settings: createDefaultSettings(),
    reconnectCount: 0,
    pendingCount: 0,
    lastHello: null,
    lastAck: null,
    lastPong: null,
    lastSyncResult: null,
    lastEvent: null,
    lastError: "",
    lastClose: null,
  },
  sendHistory: [],
  syncedCards: {},
  syncedScopes: {},
  setConnection(snapshot) {
    set({ connection: snapshot });
  },
  addSendHistory(entry) {
    set((state) => ({ sendHistory: [entry, ...state.sendHistory].slice(0, 3) }));
  },
  setSyncedCards(cards) {
    set({ syncedCards: cards || {} });
  },
  setSyncedScopes(scopes) {
    set({ syncedScopes: scopes || {} });
  },
}));

export default useBridgeStore;
