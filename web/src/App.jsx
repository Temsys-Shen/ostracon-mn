import { useMemo, useCallback, useState, useEffect } from "react";
import ostraconWsClient from "./lib/ostraconWsClient";
import useBridgeStore from "./store/useBridgeStore";
import { useConnection, useDiscovery, parseConnectionUrl } from "./hooks/useConnection";
import { formatWsUrl } from "./hooks/useConnection";
import { usePreferences } from "./hooks/usePreferences";
import { useSelectionPolling } from "./hooks/useSelectionPolling";
import { useSend } from "./hooks/useSend";
import { isSendDisabled } from "./lib/sendRules";
import VaultBrowser from "./components/VaultBrowser";
import QuotePanel from "./components/QuotePanel";
import { Library, Quote, Send } from "lucide-react";

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.round((Date.now() - d) / 60000);
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${diff}分钟前`;
  return `${Math.round(diff / 60)}小时前`;
}

function normalizeError(e) {
  if (!e) return "未知错误";
  return typeof e === "string" ? e : e.message || JSON.stringify(e);
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
  const [notice, setNotice] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [sendScope, setSendScope] = useState("selection");
  const [workspace, setWorkspace] = useState("send");
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  const connection = useBridgeStore((s) => s.connection);
  const sendHistory = useBridgeStore((s) => s.sendHistory);
  const addSendHistory = useBridgeStore((s) => s.addSendHistory);
  const setConnection = useBridgeStore((s) => s.setConnection);

  const { doConnect } = useConnection(setConnection, setUrlInput, setNotice);
  const { discoveredServers, scanning, startScan } = useDiscovery();
  const { setPrefs } = usePreferences(setPrefsState, setNotice);
  useSelectionPolling(connection.connected, setSelectedCount);

  const { send } = useSend({
    connection, prefs, format, addSendHistory, setNotice, setLoading,
  });

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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const toast = useMemo(() => {
    return notice ? <div className="status-toast">{notice}</div> : null;
  }, [notice]);

  return (
    <div className="app-shell">
      {toast}

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
          : <QuotePanel active={workspace === "quote"} setNotice={setNotice} />
      )}
      <BottomDock connection={connection} onStatusClick={requestDisconnect} workspace={workspace} setWorkspace={setWorkspace} />
      <DisconnectDialog open={disconnectDialogOpen} onCancel={cancelDisconnect} onConfirm={confirmDisconnect} />
    </div>
  );
}
