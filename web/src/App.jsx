import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import ostraconWsClient from "./lib/ostraconWsClient";
import MNBridge from "./lib/mnBridge";
import useBridgeStore from "./store/useBridgeStore";
import { useConnection, useDiscovery, parseConnectionUrl } from "./hooks/useConnection";
import { formatWsUrl } from "./hooks/useConnection";
import { usePreferences } from "./hooks/usePreferences";
import { useSelectionWatcher } from "./hooks/useSelectionWatcher";
import { useSend } from "./hooks/useSend";
import { useQuote } from "./hooks/useQuote";
import { normalizeError } from "./lib/errors";
import { isSendDisabled } from "./lib/sendRules";
import { MN_CMD, OB_CMD } from "./lib/commands";
import VaultBrowser from "./components/VaultBrowser";
import { QuotePanelView } from "./components/QuotePanel";
import { Library, Quote, Send } from "lucide-react";

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.round((Date.now() - d) / 60000);
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${diff}分钟前`;
  return `${Math.round(diff / 60)}小时前`;
}

/* ── History ── */

function HistorySection({ history, vaultName }) {
  if (!history || history.length === 0) return null;

  return (
    <div className="history-section">
      <div className="history-label">最近</div>
      {history.slice(0, 3).map((entry, i) => (
        <div className={`history-item ${entry.ok ? "ok" : "fail"}`} key={`${entry.at}-${i}`}>
          <span className="history-icon">{entry.ok ? "✓" : "✗"}</span>
          <span className="history-body">{entry.summary}</span>
          {entry.ok && entry.filePath && vaultName && (
            <a className="history-ob-link" href={`obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(entry.filePath)}`} target="_blank" rel="noreferrer">OB</a>
          )}
          <span className="history-time">{formatTime(entry.at)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Sub-components ── */

function BottomDock({ connection, onStatusClick, workspace, setWorkspace }) {
  const address = connection.connected ? `${connection.settings.host}:${connection.settings.port}` : "";
  return (
    <footer className="bottom-dock">
      {connection.connected && <nav className="dock-navigation" aria-label="工作区"><button className={workspace === "send" ? "active" : ""} onClick={() => setWorkspace("send")} type="button"><Send size={15} />发送</button><button className={workspace === "browse" ? "active" : ""} onClick={() => setWorkspace("browse")} type="button"><Library size={15} />浏览</button><button className={workspace === "quote" ? "active" : ""} onClick={() => setWorkspace("quote")} type="button"><Quote size={15} />引文</button></nav>}
      <button className={`connection-chip${connection.connected ? " connected" : ""}`} disabled={!connection.connected} onClick={onStatusClick} title={connection.connected ? "断开连接" : "未连接"} type="button">
        <span className={`status-dot ${connection.connected ? "on" : "off"}`} />
        {connection.connected ? address : "未连接"}
      </button>
    </footer>
  );
}

function DisconnectDialog({ open, onCancel, onConfirm }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="disconnect-dialog-title" onClick={event => event.stopPropagation()}>
        <h2 id="disconnect-dialog-title">断开连接？</h2>
        <div className="dialog-actions">
          <button onClick={onCancel} type="button">取消</button>
          <button className="danger" onClick={onConfirm} type="button">断开</button>
        </div>
      </section>
    </div>
  );
}

function ConnectionPanel({ urlInput, onUrlInputChange, isConnecting, onConnect, connection, discoveredServers, scanning, onScan, onConnectToServer }) {
  return (
    <div className="disconnect-area">
      <strong>未连接到 Obsidian</strong>
      <input className="connection-input" value={urlInput} onChange={(e) => onUrlInputChange(e.target.value)} placeholder="ws://[::1]:27123" />
      <button className="connect-btn" disabled={isConnecting || !parseConnectionUrl(urlInput)} onClick={onConnect} type="button">
        {isConnecting ? "连接中..." : "连接"}
      </button>

      <div className="discovery-section">
        <button className="scan-btn" onClick={onScan} disabled={scanning} type="button">
          {scanning ? "扫描中..." : "扫描局域网"}
        </button>
        {discoveredServers.length > 0 && (
          <div className="discovered-list">
            {discoveredServers.map((server, i) => (
              <div
                className="discovered-item"
                key={`${server.name}-${i}`}
                onClick={() => onConnectToServer(server)}
              >
                <span className="server-name">{server.name}</span>
                <span className="server-host">
                  {server.host}:{server.port}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {connection.status === "pending_approval" && (
        <div className="approval-waiting">等待 OB 端确认连接...</div>
      )}
    </div>
  );
}

function OptionsPanel({ format, setFormat, prefs, setPrefs }) {
  return (
    <div className="options-panel">
      <div className="option-group">
        <span className="option-label">格式</span>
        <button className={`chip ${format === "markdown" ? "active" : ""}`} onClick={() => setFormat("markdown")} type="button">Markdown</button>
        <button className={`chip ${format === "canvas" ? "active" : ""}`} onClick={() => setFormat("canvas")} type="button">Canvas</button>
      </div>
      {format !== "canvas" && (
        <div className="option-group">
          <span className="option-label">层级</span>
          <button className={`chip ${prefs.mode === "flat" ? "active" : ""}`} onClick={() => setPrefs("mode", "flat")} type="button">平铺</button>
          <button className={`chip ${prefs.mode === "tree" ? "active" : ""}`} onClick={() => setPrefs("mode", "tree")} type="button">树形</button>
          <span className="chip-sep" />
          <span className="option-label">回链</span>
          <button className={`chip ${prefs.includeBacklinks ? "active" : ""}`} onClick={() => setPrefs("includeBacklinks", !prefs.includeBacklinks)} type="button">{prefs.includeBacklinks ? "开" : "关"}</button>
        </div>
      )}
    </div>
  );
}

function scopeSelectionLabel(selectedCount) {
  return selectedCount > 0 ? `选中${selectedCount}张` : "未选中卡片";
}

function SendArea({ loading, selectedCount, send, sendScope, setSendScope }) {
  const sendDisabled = isSendDisabled(loading, sendScope, selectedCount);

  return (
    <div className="send-area">
      <div className="scope-selector" role="radiogroup" aria-label="发送范围">
        <button className={`chip ${sendScope === "notebook" ? "active" : ""}`} onClick={() => setSendScope("notebook")} type="button">学习集</button>
        <button className={`chip ${sendScope === "mindmap" ? "active" : ""}`} onClick={() => setSendScope("mindmap")} type="button">当前脑图</button>
        <button className={`chip ${sendScope === "selection" ? "active" : ""}`} onClick={() => setSendScope("selection")} type="button">{scopeSelectionLabel(selectedCount)}</button>
      </div>

      <div className="send-btn-group single-action">
        <button className="send-btn" disabled={sendDisabled} onClick={() => send({ scope: sendScope })} type="button">
          {loading ? "处理中..." : "📤 发送到Obsidian"}
        </button>
      </div>
    </div>
  );
}

/* ── App ── */

export default function App() {
  const [prefs, setPrefsState] = useState({ mode: "flat", includeBacklinks: true });
  const [format, setFormat] = useState("markdown");
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [sendScope, setSendScope] = useState("selection");
  const [workspace, setWorkspace] = useState("send");
  const [panelMode, setPanelMode] = useState("full");
  const [miniQuoteTarget, setMiniQuoteTarget] = useState("cursor");
  const [miniQuoteFilePath, setMiniQuoteFilePath] = useState("");
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const nativeFileRequestRef = useRef(0);

  const connection = useBridgeStore((s) => s.connection);
  const sendHistory = useBridgeStore((s) => s.sendHistory);
  const addSendHistory = useBridgeStore((s) => s.addSendHistory);
  const setConnection = useBridgeStore((s) => s.setConnection);
  const notice = useBridgeStore((s) => s.notice);
  const setNotice = useBridgeStore((s) => s.setNotice);
  const selectedCount = useBridgeStore((s) => (s.selection.cardsInfo?.noteCount || 0));

  const { doConnect } = useConnection(setConnection, setUrlInput, setNotice);
  const { discoveredServers, scanning, startScan } = useDiscovery(connection.connected);
  const { setPrefs } = usePreferences(setPrefsState, setNotice);
  useSelectionWatcher(connection.connected);

  const { send } = useSend({
    connection, prefs, format, addSendHistory, setNotice, setLoading,
  });
  const quote = useQuote(connection.connected, setNotice);

  const isConnecting = connection.status === "connecting";
  const requestDisconnect = useCallback(() => {
    if (connection.connected) setDisconnectDialogOpen(true);
  }, [connection.connected]);

  const cancelDisconnect = useCallback(() => setDisconnectDialogOpen(false), []);
  const confirmDisconnect = useCallback(() => {
    ostraconWsClient.disconnect();
    setDisconnectDialogOpen(false);
    setNotice("已断开");
  }, []);

  const handleUrlInputChange = useCallback((value) => {
    setUrlInput(value);
    setNotice("");
    ostraconWsClient.clearLastError();
  }, []);

  const handleScan = useCallback(() => {
    setNotice("");
    ostraconWsClient.clearLastError();
    startScan();
  }, [startScan]);

  const handleConnectToServer = useCallback(
    async (server) => {
      const host = server.host || server.name;
      const port = server.port || 27123;
      const url = formatWsUrl(host, port);
      setUrlInput(url);
      ostraconWsClient.clearLastError();
      const parsed = parseConnectionUrl(url);
      if (!parsed) {
        setNotice("无法解析服务地址: " + url);
        return;
      }
      setNotice("");
      try {
        await ostraconWsClient.updateSettings(parsed);
        await ostraconWsClient.connect();
        setNotice("");
      } catch (e) {
        const snap = ostraconWsClient.getSnapshot();
        setNotice(`连接失败: ${snap.lastError || normalizeError(e)}`);
      }
    },
    [setNotice, setUrlInput],
  );

  useEffect(() => {
    window.__OstraconSetPanelMode = (mode) => {
      if (mode !== "mini" && mode !== "full") throw new Error(`不支持的面板模式: ${mode}`);
      setPanelMode(mode);
    };
    return () => {
      delete window.__OstraconSetPanelMode;
    };
  }, []);

  const syncNativeMiniFiles = useCallback((payload) => {
    return MNBridge.send(MN_CMD.SYNC_NATIVE_MINI_FILES, payload, 10000);
  }, []);

  useEffect(() => {
    window.__OstraconNativeMiniAction = async (raw) => {
      const message = JSON.parse(raw);
      const action = message?.action;
      const payload = message?.payload || {};

      if (action === "set-send-scope") {
        if (!["selection", "mindmap", "notebook"].includes(payload.scope)) throw new Error(`不支持的发送范围: ${payload.scope}`);
        setSendScope(payload.scope);
        return;
      }
      if (action === "set-format") {
        if (!["markdown", "canvas"].includes(payload.format)) throw new Error(`不支持的发送格式: ${payload.format}`);
        setFormat(payload.format);
        return;
      }
      if (action === "set-markdown-mode") {
        if (!["flat", "tree"].includes(payload.mode)) throw new Error(`不支持的Markdown模式: ${payload.mode}`);
        setFormat("markdown");
        setPrefs("mode", payload.mode);
        return;
      }
      if (action === "toggle-backlinks") {
        setFormat("markdown");
        setPrefs("includeBacklinks", !prefs.includeBacklinks);
        return;
      }
      if (action === "send") {
        if (isSendDisabled(loading, sendScope, selectedCount)) throw new Error("当前发送条件不可用");
        await send({ scope: sendScope });
        return;
      }
      if (action === "set-quote-target") {
        if (!["cursor", "active-file"].includes(payload.target)) throw new Error(`不支持的引文目标: ${payload.target}`);
        setMiniQuoteTarget(payload.target);
        return;
      }
      if (action === "quote") {
        if (!quote.selection || quote.busyTarget) throw new Error("当前引文条件不可用");
        if (miniQuoteTarget === "file") {
          if (!miniQuoteFilePath) throw new Error("尚未选择引文文件");
          await quote.insert("file", miniQuoteFilePath);
          return;
        }
        await quote.insert(miniQuoteTarget);
        return;
      }
      if (action === "select-file") {
        if (typeof payload.path !== "string" || !payload.path) throw new Error("引文文件路径为空");
        setMiniQuoteFilePath(payload.path);
        setMiniQuoteTarget("file");
        return;
      }
      if (action === "list-files") {
        const requestId = nativeFileRequestRef.current + 1;
        nativeFileRequestRef.current = requestId;
        await syncNativeMiniFiles({ folderPath: payload.path || "", query: "", folders: [], documents: [], loading: true, error: "" });
        try {
          const folder = await ostraconWsClient.sendObsidianCommand(OB_CMD.LIST_VAULT_FOLDER, { path: payload.path || "" });
          if (requestId !== nativeFileRequestRef.current) return;
          await syncNativeMiniFiles({
            folderPath: payload.path || "",
            query: "",
            folders: folder.folders || [],
            documents: folder.documents || [],
            loading: false,
            error: "",
          });
        } catch (error) {
          if (requestId !== nativeFileRequestRef.current) return;
          await syncNativeMiniFiles({ folderPath: payload.path || "", query: "", folders: [], documents: [], loading: false, error: normalizeError(error) });
        }
        return;
      }
      if (action === "search-files") {
        const query = String(payload.query || "").trim();
        if (!query) {
          await window.__OstraconNativeMiniAction(JSON.stringify({ action: "list-files", payload: { path: "" } }));
          return;
        }
        const requestId = nativeFileRequestRef.current + 1;
        nativeFileRequestRef.current = requestId;
        await syncNativeMiniFiles({ folderPath: "", query, folders: [], documents: [], loading: true, error: "" });
        try {
          const result = await ostraconWsClient.sendObsidianCommand(OB_CMD.SEARCH_VAULT_DOCUMENTS, { query, limit: 100 }, 120000);
          if (requestId !== nativeFileRequestRef.current) return;
          await syncNativeMiniFiles({ folderPath: "", query, folders: [], documents: result.items || [], loading: false, error: "" });
        } catch (error) {
          if (requestId !== nativeFileRequestRef.current) return;
          await syncNativeMiniFiles({ folderPath: "", query, folders: [], documents: [], loading: false, error: normalizeError(error) });
        }
        return;
      }
      throw new Error(`不支持的原生mini操作: ${action}`);
    };
    return () => {
      delete window.__OstraconNativeMiniAction;
    };
  }, [loading, miniQuoteFilePath, miniQuoteTarget, prefs.includeBacklinks, quote, selectedCount, send, sendScope, setPrefs, syncNativeMiniFiles]);

  useEffect(() => {
    const quoteTargetUnavailable = (miniQuoteTarget === "cursor" && !quote.context.cursor.available)
      || (miniQuoteTarget === "active-file" && !quote.context.activeFile.available)
      || (miniQuoteTarget === "file" && !miniQuoteFilePath);
    const state = {
      connected: connection.connected,
      status: connection.status,
      loading,
      selectedCount,
      sendScope,
      format,
      prefs,
      sendDisabled: isSendDisabled(loading, sendScope, selectedCount),
      quoteTarget: miniQuoteTarget,
      quoteFilePath: miniQuoteFilePath,
      quoteDisabled: !quote.selection || Boolean(quote.busyTarget) || quoteTargetUnavailable,
      quote: {
        selectionAvailable: Boolean(quote.selection),
        cursorAvailable: quote.context.cursor.available,
        activeFileAvailable: quote.context.activeFile.available,
        rootTitle: quote.root?.title || "",
        busyTarget: quote.busyTarget,
      },
    };
    MNBridge.send(MN_CMD.SYNC_NATIVE_MINI_STATE, state, 10000)
      .catch((error) => console.log("syncNativeMiniState failed", normalizeError(error)));
  }, [connection.connected, connection.status, format, loading, miniQuoteFilePath, miniQuoteTarget, prefs, quote.busyTarget, quote.context, quote.root, quote.selection, selectedCount, sendScope]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toast = useMemo(() => {
    return notice ? <div className="status-toast">{notice}</div> : null;
  }, [notice]);

  return (
    <div className="app-shell">
      {panelMode === "full" && toast}

      {panelMode === "full" && (
        <>
          {(!connection.connected || connection.status === "pending_approval") && (
            <ConnectionPanel
              urlInput={urlInput}
              onUrlInputChange={handleUrlInputChange}
              isConnecting={isConnecting}
              onConnect={() => doConnect(urlInput)}
              connection={connection}
              discoveredServers={discoveredServers}
              scanning={scanning}
              onScan={handleScan}
              onConnectToServer={handleConnectToServer}
            />
          )}

          {connection.connected && connection.status !== "pending_approval" && (
            workspace === "send" ? <>
              <SendArea
                loading={loading}
                selectedCount={selectedCount}
                send={send}
                sendScope={sendScope}
                setSendScope={setSendScope}
              />

              <OptionsPanel format={format} setFormat={setFormat} prefs={prefs} setPrefs={setPrefs} />

              <HistorySection history={sendHistory} vaultName={connection.vaultName} />
            </> : workspace === "browse"
              ? <VaultBrowser connection={connection} setNotice={setNotice} />
              : <QuotePanelView quote={quote} />
          )}
          <BottomDock connection={connection} onStatusClick={requestDisconnect} workspace={workspace} setWorkspace={setWorkspace} />
        </>
      )}
      <DisconnectDialog open={disconnectDialogOpen} onCancel={cancelDisconnect} onConfirm={confirmDisconnect} />
    </div>
  );
}
