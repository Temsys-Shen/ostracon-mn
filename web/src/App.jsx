import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import ostraconWsClient from "./lib/ostraconWsClient";
import useBridgeStore from "./store/useBridgeStore";
import { useConnection, useDiscovery, parseConnectionUrl } from "./hooks/useConnection";
import { formatWsUrl } from "./hooks/useConnection";
import { usePreferences } from "./hooks/usePreferences";
import { useSelectionPolling } from "./hooks/useSelectionPolling";
import { useSync } from "./hooks/useSync";

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
          {entry.synced && <span className="history-sync-icon">🔄</span>}
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

function TopBar({ connection, onStatusClick }) {
  const address = connection.connected ? `${connection.settings.host}:${connection.settings.port}` : "";
  return (
    <div className="top-bar">
      <span className={`top-status${connection.connected ? " clickable" : ""}`} onClick={onStatusClick}>
        <span className={`status-dot ${connection.connected ? "on" : "off"}`} />
        {connection.connected ? address : "未连接"}
      </span>
    </div>
  );
}

function ConnectionPanel({ urlInput, setUrlInput, isConnecting, onConnect, connection, discoveredServers, scanning, onScan, onConnectToServer }) {
  return (
    <div className="disconnect-area">
      <strong>未连接到 Obsidian</strong>
      <input className="connection-input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="ws://[::1]:27123" />
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

      {!connection.connected && connection.lastError && <div className="connection-error">{connection.lastError}</div>}
      <p className="disconnect-hint">在OB的Ostracon设置页复制连接串，或点击扫描自动发现</p>
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
          <span className="option-label">摘录</span>
          <button className={`chip ${prefs.excerptStyle === "quote" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "quote")} type="button">引用</button>
          <button className={`chip ${prefs.excerptStyle === "plain" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "plain")} type="button">原文</button>
          <span className="chip-sep" />
          <span className="option-label">回链</span>
          <button className={`chip ${prefs.includeBacklinks ? "active" : ""}`} onClick={() => setPrefs("includeBacklinks", !prefs.includeBacklinks)} type="button">{prefs.includeBacklinks ? "开" : "关"}</button>
        </div>
      )}
    </div>
  );
}

function SendArea({ loading, selectedCount, send, sendMode, setSendMode, dropdownOpen, setDropdownOpen }) {
  const groupRef = useRef(null);
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (groupRef.current && !groupRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, setDropdownOpen]);

  return (
    <div className="send-area">
      <div className="selection-info">{selectedCount > 0 ? `已选中 ${selectedCount} 张卡片` : "未选中卡片"}</div>

      <div className="send-btn-group" ref={groupRef}>
        <button className="send-btn" disabled={loading || selectedCount === 0} onClick={() => send(sendMode === "sync")} type="button">
          {loading ? "处理中..." : sendMode === "sync" ? "📤 同步到Obsidian" : "📤 发送到Obsidian"}
        </button>
        <button className="send-btn-arrow" onClick={() => setDropdownOpen(!dropdownOpen)} type="button">▾</button>
        {dropdownOpen && (
          <div className="send-dropdown">
            <button className="send-dropdown-item" onClick={() => { setDropdownOpen(false); setSendMode("once"); }} type="button">
              {sendMode === "once" && "✓ "}发送一次
            </button>
            <button className="send-dropdown-item" onClick={() => { setDropdownOpen(false); setSendMode("sync"); }} type="button">
              {sendMode === "sync" && "✓ "}同步并自动更新
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── App ── */

export default function App() {
  const [prefs, setPrefsState] = useState({ mode: "flat", excerptStyle: "quote" });
  const [format, setFormat] = useState("markdown");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [sendMode, setSendMode] = useState("once");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const connection = useBridgeStore((s) => s.connection);
  const sendHistory = useBridgeStore((s) => s.sendHistory);
  const syncedCards = useBridgeStore((s) => s.syncedCards);
  const addSendHistory = useBridgeStore((s) => s.addSendHistory);
  const setConnection = useBridgeStore((s) => s.setConnection);
  const setSyncedCards = useBridgeStore((s) => s.setSyncedCards);

  useConnection(setConnection, setUrlInput, setNotice);
  const { discoveredServers, scanning, startScan } = useDiscovery();
  const { setPrefs } = usePreferences(setPrefsState, setSyncedCards, setNotice);
  useSelectionPolling(connection.connected, setSelectedCount);

  const { send } = useSync({
    connection, prefs, format, syncedCards,
    setSyncedCards, addSendHistory, setNotice, setLoading,
  });

  const isConnecting = connection.status === "connecting";
  const handleTopStatusClick = useCallback(() => {
    if (connection.connected) {
      ostraconWsClient.disconnect();
      setNotice("已断开");
    }
  }, [connection.connected]);

  const handleConnectToServer = useCallback(
    async (server) => {
      const host = server.host || server.name;
      const port = server.port || 27123;
      const url = formatWsUrl(host, port);
      setUrlInput(url);
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
        if (!snap.lastError) setNotice(`连接失败: ${normalizeError(e)}`);
      }
    },
    [setNotice, setUrlInput],
  );

  const toast = useMemo(() => {
    return notice ? <div className="status-toast">{notice}</div> : null;
  }, [notice]);

  return (
    <div className="app-shell">
      <TopBar connection={connection} onStatusClick={handleTopStatusClick} />
      {toast}

      {(!connection.connected || connection.status === "pending_approval") && (
        <ConnectionPanel
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          isConnecting={isConnecting}
          onConnect={() => {
            const parsed = parseConnectionUrl(urlInput);
            if (!parsed) { setNotice("请输入有效的连接串"); return; }
            setNotice("");
            ostraconWsClient.updateSettings(parsed).then(() => ostraconWsClient.connect()).then(() => setNotice("")).catch((e) => {
              const snap = ostraconWsClient.getSnapshot();
              if (!snap.lastError) setNotice(`连接失败: ${normalizeError(e)}`);
            });
          }}
          connection={connection}
          discoveredServers={discoveredServers}
          scanning={scanning}
          onScan={startScan}
          onConnectToServer={handleConnectToServer}
        />
      )}

      {connection.connected && connection.status !== "pending_approval" && (
        <>
          <SendArea
            loading={loading}
            selectedCount={selectedCount}
            send={send}
            sendMode={sendMode}
            setSendMode={setSendMode}
            dropdownOpen={dropdownOpen}
            setDropdownOpen={setDropdownOpen}
          />

          <OptionsPanel format={format} setFormat={setFormat} prefs={prefs} setPrefs={setPrefs} />

          <HistorySection history={sendHistory} vaultName={connection.vaultName} />
        </>
      )}
    </div>
  );
}
