import { useCallback, useEffect, useMemo, useState } from "react";
import MNBridge from "./lib/mnBridge";
import { createPacketDraft, normalizePacket } from "./lib/ostraconContract";
import ostraconWsClient from "./lib/ostraconWsClient";
import useBridgeStore from "./store/useBridgeStore";

/* ── Helpers ── */

function maskToken(token) {
  if (!token) return "";
  if (token.length <= 8) return `${token.slice(0, 2)}***`;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((now - d) / 60000);
  if (diff < 1) return "刚刚";
  if (diff < 60) return `${diff}分钟前`;
  return `${Math.round(diff / 60)}小时前`;
}

function normalizeBridgeError(error) {
  if (!error) return "未知错误";
  if (typeof error === "string") return error;
  return error.message || JSON.stringify(error);
}

/* ── Settings panel ── */

function parseConnectionUrl(input) {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      return {
        host: url.hostname,
        port: url.port || '27123',
        token: url.searchParams.get('token') || '',
      };
    }
  } catch (_) {}
  return null;
}

function SettingsPanel({ onClose }) {
  const connection = useBridgeStore((s) => s.connection);
  const [form, setForm] = useState({
    host: connection.settings.host,
    port: String(connection.settings.port),
    token: connection.settings.token,
  });
  const [urlInput, setUrlInput] = useState('');

  const apply = async () => {
    ostraconWsClient.updateSettings({
      host: form.host,
      port: Number.parseInt(form.port, 10) || 27123,
      token: form.token,
    });
    await ostraconWsClient.connect().catch(() => {});
    onClose();
  };

  const handleUrlPaste = (value) => {
    setUrlInput(value);
    const parsed = parseConnectionUrl(value);
    if (parsed) {
      setForm({ host: parsed.host, port: parsed.port, token: parsed.token });
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>设置</h2>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <div className="field-group">
          <label className="field">
            <span>从 OB 复制连接串粘贴到此</span>
            <input value={urlInput} onChange={(e) => handleUrlPaste(e.target.value)} placeholder="ws://127.0.0.1:27123?token=..." />
          </label>
          <hr className="field-sep" />
          <label className="field">
            <span>Token</span>
            <input value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
          </label>
          <label className="field">
            <span>主机</span>
            <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </label>
          <label className="field">
            <span>端口</span>
            <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </label>
        </div>
        <button className="primary-button full" onClick={apply} type="button">保存并连接</button>
        <p className="hint">从 OB Ostracon 设置页复制连接串（整段 URL），粘贴后自动解析。</p>
      </div>
    </div>
  );
}

/* ── Connection bar ── */

function ConnectionBar({ connection, onTest, onConnect, onDisconnect }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="connection-bar">
      <div className="connection-main" onClick={() => setExpanded(!expanded)} role="button" tabIndex={0}>
        <span className={`status-dot ${connection.connected ? "on" : "off"}`} />
        <span className="connection-label">
          {connection.connected ? "已连接" : "未连接"}
        </span>
        {connection.connected && (
          <span className="connection-target">· {connection.settings.host}:{connection.settings.port}</span>
        )}
        <span className={`expand-arrow ${expanded ? "open" : ""}`}>▸</span>
      </div>
      {expanded && (
        <div className="connection-detail">
          <div className="detail-row">
            <span className="detail-label">状态</span>
            <span>{connection.status}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Socket</span>
            <span>{connection.socketState}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Token</span>
            <span className="mono">{maskToken(connection.settings.token) || "未设置"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">会话</span>
            <span className="mono">{connection.sessionId || "-"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">OB 会话</span>
            <span className="mono">{connection.serverSessionId || "-"}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">重连</span>
            <span>{connection.reconnectCount > 0 ? `${connection.reconnectCount} 次` : "0"}</span>
          </div>
          {connection.lastError && (
            <div className="detail-row error">
              <span className="detail-label">错误</span>
              <span>{connection.lastError}</span>
            </div>
          )}
          <div className="detail-actions">
            <button className="secondary-button small" disabled={!connection.settings.token} onClick={onTest} type="button">测试连接</button>
            {connection.connected ? (
              <button className="secondary-button small" onClick={onDisconnect} type="button">断开</button>
            ) : (
              <button className="secondary-button small" disabled={!connection.settings.token} onClick={onConnect} type="button">连接</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── History section ── */

function HistorySection({ history }) {
  if (!history || history.length === 0) return null;

  return (
    <div className="history-section">
      <h3 className="section-label">最近</h3>
      {history.slice(0, 10).map((entry, i) => (
        <div className={`history-item ${entry.ok ? "ok" : "fail"}`} key={`${entry.at}-${i}`}>
          <span className="history-icon">{entry.ok ? "✓" : "✗"}</span>
          <span className="history-body">
            <span className="history-text">{entry.summary}</span>
            <span className="history-meta">{entry.noteCount ? `${entry.noteCount} 张 · ` : ""}{entry.format || "Markdown"}</span>
          </span>
          <span className="history-time">{formatTime(entry.at)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── App ── */

export default function App() {
  const [prefs, setPrefsState] = useState({ mode: "flat", excerptStyle: "quote" });
  const [format, setFormat] = useState("markdown");
  const [canvasInfo, setCanvasInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const connection = useBridgeStore((s) => s.connection);
  const sendHistory = useBridgeStore((s) => s.sendHistory);
  const appendLog = useBridgeStore((s) => s.appendLog);
  const addSendHistory = useBridgeStore((s) => s.addSendHistory);
  const setConnection = useBridgeStore((s) => s.setConnection);

  /* Subscribe to WS client state */
  useEffect(() => {
    setConnection(ostraconWsClient.getSnapshot());
    return ostraconWsClient.subscribe(({ event, snapshot }) => {
      setConnection(snapshot);
      if (event?.type === "log") appendLog(event.entry);
    });
  }, [appendLog, setConnection]);

  /* Load saved markdown preferences */
  useEffect(() => {
    let alive = true;
    MNBridge.send("getMarkdownPreferences")
      .then((r) => { if (alive && r) setPrefsState({ mode: r.mode || "flat", excerptStyle: r.excerptStyle || "quote" }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const setPrefs = useCallback((key, value) => {
    setPrefsState((prev) => {
      const next = { ...prev, [key]: value };
      MNBridge.send("setMarkdownPreferences", next).catch(() => {});
      return next;
    });
  }, []);

  /* Connection actions */
  const doConnect = useCallback(async () => {
    try {
      setStatus("正在连接…");
      await ostraconWsClient.connect();
      setStatus("");
    } catch (error) {
      setStatus(`连接失败: ${normalizeBridgeError(error)}`);
    }
  }, []);

  const doDisconnect = useCallback(() => {
    ostraconWsClient.disconnect();
    setStatus("已断开");
  }, []);

  const testConnection = useCallback(async () => {
    try {
      setStatus("正在测试连接…");
      await ostraconWsClient.connect();
      // wait for hello handshake
      await new Promise((r) => setTimeout(r, 1500));
      const snap = ostraconWsClient.getSnapshot();
      if (snap.ready) {
        setStatus("连接正常，握手完成");
      } else if (snap.connected) {
        setStatus("已连接，等待 OB 握手…");
      } else {
        setStatus("连接已断开");
      }
    } catch (error) {
      setStatus(`连接失败: ${normalizeBridgeError(error)}`);
    }
  }, []);

  /* Send: read cards → convert → send → result */
  const send = useCallback(async () => {
    if (!connection.connected) {
      setStatus("未连接到 Obsidian，请在设置中配置");
      setSettingsOpen(true);
      return;
    }

    setLoading(true);
    setStatus("正在读取卡片…");
    try {
      var payload;
      var noteCount = 0;
      var formatLabel = "Markdown";

      if (format === "canvas") {
        var result = await MNBridge.send("previewSelectedCanvas");
        if (!result || !result.canvas) {
          setStatus("未选中卡片");
          setLoading(false);
          return;
        }
        payload = { canvas: result.canvas, noteCount: result.nodeCount, fileBaseName: "ostracon-canvas" };
        noteCount = result.nodeCount;
        formatLabel = "Canvas";
      } else {
        var result = await MNBridge.send("previewSelectedMarkdown", prefs);
        if (!result.markdown) {
          setStatus("未选中卡片");
          setLoading(false);
          return;
        }
        payload = { markdown: result.markdown, noteCount: result.noteCount, fileBaseName: result.fileBaseName || "MarginNote" };
        noteCount = result.noteCount;
      }

      setStatus("正在发送到 Obsidian…");
      const packet = normalizePacket(createPacketDraft({
        markdown: payload.markdown || payload.canvas,
        sourceTitle: payload.fileBaseName || "Ostracon",
        folder: "Inbox",
        format: format,
        isCanvas: format === "canvas",
      }));
      await ostraconWsClient.sendPacket(packet);

      addSendHistory({ noteCount, summary: (payload.fileBaseName || "") + ` (${noteCount} 张)`, ok: true, at: new Date().toISOString(), format: formatLabel });
      setStatus(`✓ 已发送 ${noteCount} 张卡片到 Obsidian (${formatLabel})`);
    } catch (error) {
      addSendHistory({ noteCount: 0, summary: "发送失败", ok: false, at: new Date().toISOString(), format: formatLabel || "Markdown" });
      setStatus(`发送失败: ${normalizeBridgeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [connection.connected, prefs, format, addSendHistory]);

  const statusToast = useMemo(() => {
    if (!status) return null;
    return <div className="status-toast">{status}</div>;
  }, [status]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand"><strong>Ostracon</strong></div>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(true)} type="button" title="设置">⚙</button>
          <button className="icon-button" onClick={() => MNBridge.send("closePanel").catch(() => {})} type="button" title="关闭面板">×</button>
        </div>
      </header>

      <ConnectionBar connection={connection} onTest={testConnection} onConnect={doConnect} onDisconnect={doDisconnect} />

      {statusToast}

      <div className="send-section">
        <div className="format-toggle">
          <span className="format-label">导出格式</span>
          <button className={`format-btn ${format === "markdown" ? "active" : ""}`} onClick={() => setFormat("markdown")} type="button">Markdown</button>
          <button className={`format-btn ${format === "canvas" ? "active" : ""}`} onClick={() => setFormat("canvas")} type="button">Canvas</button>
        </div>

        {format === "markdown" && (
          <div className="option-bar">
            <span className="option-label">卡片层级</span>
            <button className={`chip ${prefs.mode === "flat" ? "active" : ""}`} onClick={() => setPrefs("mode", "flat")} type="button">平铺</button>
            <button className={`chip ${prefs.mode === "tree" ? "active" : ""}`} onClick={() => setPrefs("mode", "tree")} type="button">树形</button>
            <span className="chip-sep" />
            <span className="option-label">摘录样式</span>
            <button className={`chip ${prefs.excerptStyle === "quote" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "quote")} type="button">引用</button>
            <button className={`chip ${prefs.excerptStyle === "plain" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "plain")} type="button">原文</button>
          </div>
        )}

        <button className="primary-button send-button" disabled={loading} onClick={send} type="button">
          {loading ? "处理中…" : "📤 发送到 Obsidian"}
        </button>
      </div>

      <details className="return-section">
        <summary className="section-label">回流 (即将支持)</summary>
        <div className="return-placeholder">
          OB 整理后的总结、标签、复习提示将在这里展示。
        </div>
      </details>

      <HistorySection history={sendHistory} />

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
