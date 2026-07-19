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
    lastCommandResult: null,
    lastEvent: null,
    lastError: "",
    lastClose: null,
  },
  sendHistory: [],
  setConnection(snapshot) {
    set({ connection: snapshot });
  },
  addSendHistory(entry) {
    set((state) => ({ sendHistory: [entry, ...state.sendHistory].slice(0, 3) }));
  },

  // 全局通知 slice。下沉到 store，避免 setNotice 从 App → VaultBrowser → useDocumentImport 等多层透传。
  // 当前阶段下游 hook 仍接收 setNotice 参数，但 App 传的是 store 的 setNotice，后续可逐步去掉 prop 透传。
  notice: "",
  setNotice(message) {
    set({ notice: message || "" });
  },

  // 选中/上下文状态 slice：单点维护，多组件共享。
  // cardsInfo: getSelectedCardsInfo 返回值（含 noteCount/imageCount/commentCount/sourceTitle/noteIds）
  // insertContext: getObsidianInsertContext 返回值（含 notebookId/notebookTitle/selectedCount/targetKind/targetTitle）
  // quoteSelection: getQuoteSelectionPreview 返回值（文本/图片选区）
  // quoteRoot: getQuoteRootState 返回值（引文根节点）
  // quoteContext: getQuoteContext 返回值（OB 端光标/活动文件上下文）
  selection: {
    cardsInfo: null,
    insertContext: null,
    quoteSelection: null,
    quoteRoot: null,
    quoteContext: null,
    loading: false,
    error: "",
  },
  setSelection(patch) {
    set((state) => ({ selection: { ...state.selection, ...patch } }));
  },
}));

export default useBridgeStore;
