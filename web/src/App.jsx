import { useCallback, useEffect, useMemo, useState } from "react";
import MNBridge from "./lib/mnBridge";
import { createPacketDraft, normalizePacket } from "./lib/ostraconContract";
import ostraconWsClient from "./lib/ostraconWsClient";
import useBridgeStore from "./store/useBridgeStore";

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

function parseConnectionUrl(input) {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol === "ws:" || url.protocol === "wss:") {
      return { host: url.hostname, port: url.port || "27123", token: url.searchParams.get("token") || "" };
    }
  } catch (_) {}
  return null;
}

/* ── History ── */

function HistorySection({ history, vaultName }) {
  if (!history || history.length === 0) return null;

  return (
    <div className="history-section">
      <div className="history-label">最近</div>
      {history.slice(0, 8).map((entry, i) => (
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
  const appendLog = useBridgeStore((s) => s.appendLog);
  const addSendHistory = useBridgeStore((s) => s.addSendHistory);
  const setConnection = useBridgeStore((s) => s.setConnection);
  const setSyncedCards = useBridgeStore((s) => s.setSyncedCards);

  /* WS connection state */
  useEffect(() => {
    setConnection(ostraconWsClient.getSnapshot());
    ostraconWsClient.loadStoredSettings()
      .then((snap) => {
        setConnection(snap);
        const s = snap.settings;
        if (s.token) {
          setUrlInput(`ws://${s.host}:${s.port}?token=${encodeURIComponent(s.token)}`);
        }
      })
      .catch((e) => setNotice(`设置读取失败: ${normalizeError(e)}`));
    return ostraconWsClient.subscribe(({ event, snapshot }) => {
      setConnection(snapshot);
      if (event?.type === "log") appendLog(event.entry);
    });
  }, [appendLog, setConnection]);

  /* Load native prefs + synced cards */
  useEffect(() => {
    let alive = true;
    Promise.all([
      MNBridge.send("getMarkdownPreferences"),
      MNBridge.send("getSyncedCards"),
    ]).then(([mdPrefs, synced]) => {
      if (!alive) return;
      if (mdPrefs) setPrefsState({ mode: mdPrefs.mode || "flat", excerptStyle: mdPrefs.excerptStyle || "quote" });
      setSyncedCards(synced?.cards || {});
    }).catch((e) => setNotice(`偏好读取失败: ${normalizeError(e)}`));
    return () => { alive = false; };
  }, [setSyncedCards]);

  const setPrefs = useCallback((k, v) => {
    setPrefsState((prev) => { const n = { ...prev, [k]: v }; MNBridge.send("setMarkdownPreferences", n).catch(() => {}); return n; });
  }, []);

  /* Selection count polling */
  useEffect(() => {
    if (!connection.connected) { setSelectedCount(0); return; }
    const poll = async () => {
      try {
        const info = await MNBridge.send("getSelectedCardsInfo");
        setSelectedCount(info?.noteCount || 0);
      } catch (_) {}
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [connection.connected]);

  const doConnect = useCallback(async () => {
    const parsed = parseConnectionUrl(urlInput);
    if (!parsed) {
      setNotice("请输入有效的连接串");
      return;
    }

    setNotice("");
    try {
      await ostraconWsClient.updateSettings(parsed);
      await ostraconWsClient.connect();
      setNotice("");
    } catch (e) {
      const snap = ostraconWsClient.getSnapshot();
      if (!snap.lastError) {
        setNotice(`连接失败: ${normalizeError(e)}`);
      }
    }
  }, [urlInput]);

  /* Send */
  const send = useCallback(async (autoSync) => {
    if (!connection.connected) { setNotice("未连接"); return; }
    setLoading(true);
    setNotice("正在读取...");
    try {
      var payload, noteCount = 0, formatLabel = "Markdown";
      if (format === "canvas") {
        const r = await MNBridge.send("previewSelectedCanvas");
        if (!r?.canvas) { setNotice("未选中卡片"); setLoading(false); return; }
        payload = { canvas: r.canvas, noteCount: r.nodeCount, fileBaseName: "ostracon-canvas" };
        noteCount = r.nodeCount;
        formatLabel = "Canvas";
      } else {
        const prefsWithSync = { ...prefs, includeNoteIds: autoSync };
        const r = await MNBridge.send("previewSelectedMarkdown", prefsWithSync);
        if (!r?.markdown) { setNotice("未选中卡片"); setLoading(false); return; }
        payload = { markdown: r.markdown, noteCount: r.noteCount, fileBaseName: r.fileBaseName || "MarginNote" };
        noteCount = r.noteCount;
      }

      const cardsResult = await MNBridge.send("listCards", { notebookId: "current-selection" });
      const packetObjects = Array.isArray(cardsResult?.cards) ? cardsResult.cards : [];
      const noteIds = packetObjects.map(c => c.id).filter(Boolean);

      setNotice("正在发送...");
      const packet = normalizePacket(createPacketDraft({
        markdown: payload.markdown || payload.canvas, sourceTitle: payload.fileBaseName || "Ostracon",
        folder: "Inbox", format, isCanvas: format === "canvas",
        objects: packetObjects,
      }));
      const sendResult = await ostraconWsClient.sendPacket(packet, autoSync);
      const filePath = sendResult?.payload?.record?.filePath || "";

      addSendHistory({
        noteCount, summary: `${payload.fileBaseName || ""} (${noteCount}张)`, ok: true, at: new Date().toISOString(),
        format: formatLabel, filePath, synced: autoSync,
      });
      setNotice(autoSync ? `✓ 已同步 ${noteCount}张` : `✓ 已发送 ${noteCount}张`);

      if (autoSync && noteIds.length > 0 && filePath) {
        const updated = { ...syncedCards };
        for (const id of noteIds) {
          if (!updated[id] || updated[id].filePath !== filePath) {
            updated[id] = { filePath, version: 1, syncedAt: new Date().toISOString() };
          }
        }
        setSyncedCards(updated);
        MNBridge.send("setSyncedCards", { cards: updated }).catch(() => {});
      }
    } catch (e) {
      addSendHistory({ noteCount: 0, summary: "发送失败", ok: false, at: new Date().toISOString(), format: formatLabel || "Markdown" });
      setNotice(`发送失败: ${normalizeError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [connection.connected, prefs, format, addSendHistory, syncedCards, setSyncedCards]);

  /* Synced cards polling — only sync-marked cards */
  useEffect(() => {
    if (!connection.connected || Object.keys(syncedCards).length === 0) return;
    const poll = async () => {
      try {
        const [cardsResult, cacheResult] = await Promise.all([
          MNBridge.send("listCards", { notebookId: "current-selection" }),
          MNBridge.send("getCardVersionCache"),
        ]);
        const cards = Array.isArray(cardsResult?.cards) ? cardsResult.cards : [];
        const cache = (cacheResult?.cards) || {};
        const newCache = {};
        let changed = false;

        for (const card of cards) {
          if (!card.id || !syncedCards[card.id]) {
            if (cache[card.id]) newCache[card.id] = cache[card.id];
            continue;
          }
          const contentKey = (card.title || "") + "|" + (card.excerpt || "") + "|" + (card.comment || "");
          const cached = cache[card.id];
          if (cached && (cached.contentKey === contentKey || cached.hash === contentKey)) {
            newCache[card.id] = cache[card.id];
            continue;
          }
          changed = true;
          const version = (syncedCards[card.id]?.version || 0) + 1;
          newCache[card.id] = { contentKey, version, at: new Date().toISOString() };
          const updated = { ...syncedCards, [card.id]: { ...syncedCards[card.id], version } };
          setSyncedCards(updated);
          try {
            await ostraconWsClient.sendCardUpdated({
              noteId: card.id, title: card.title || "", excerpt: card.excerpt || "",
              comment: card.comment || "", sourceAnchor: card.sourceAnchor || "",
              version, hasImage: Boolean(card.hasImage), hasHandwriting: Boolean(card.hasHandwriting),
            });
          } catch (e) { console.log("cardUpdated send failed:", card.id); }
        }
        if (changed) {
          await MNBridge.send("setCardVersionCache", { cards: newCache });
          const syncedCopy = { ...syncedCards };
          for (const card of cards) {
            if (card.id && syncedCopy[card.id]) {
              syncedCopy[card.id].version = newCache[card.id]?.version || syncedCopy[card.id].version;
            }
          }
          setSyncedCards(syncedCopy);
          MNBridge.send("setSyncedCards", { cards: syncedCopy }).catch(() => {});
        }
      } catch (_) {}
    };
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [connection.connected, syncedCards, setSyncedCards]);

  const toast = useMemo(() => {
    return notice ? <div className="status-toast">{notice}</div> : null;
  }, [notice]);
  const address = connection.connected ? `${connection.settings.host}:${connection.settings.port}` : "";
  const isConnecting = connection.status === "connecting";
  const handleTopStatusClick = useCallback(() => {
    if (connection.connected) {
      ostraconWsClient.disconnect();
      setNotice("已断开");
    }
  }, [connection.connected]);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className={`top-status${connection.connected ? " clickable" : ""}`} onClick={handleTopStatusClick}>
          <span className={`status-dot ${connection.connected ? "on" : "off"}`} />
          {connection.connected ? address : "未连接"}
        </span>
      </div>

      {toast}

      {!connection.connected && (
        <div className="disconnect-area">
          <strong>未连接到 Obsidian</strong>
          <input className="connection-input" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="ws://127.0.0.1:27123?token=..." />
          <button className="connect-btn" disabled={isConnecting || !parseConnectionUrl(urlInput)} onClick={doConnect} type="button">
            {isConnecting ? "连接中..." : "连接"}
          </button>
          {!connection.connected && connection.lastError && <div className="connection-error">{connection.lastError}</div>}
          <p className="disconnect-hint">在OB的Ostracon设置页复制连接串，粘贴到此</p>
        </div>
      )}

      {connection.connected && (
        <>
          <div className="send-area">
            <div className="selection-info">{selectedCount > 0 ? `已选中 ${selectedCount} 张卡片` : "未选中卡片"}</div>

            <div className="send-btn-group">
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

            <div className="options-panel">
              <div className="option-group">
                <span className="option-label">格式</span>
                <button className={`chip ${format === "markdown" ? "active" : ""}`} onClick={() => setFormat("markdown")} type="button">Markdown</button>
                <button className={`chip ${format === "canvas" ? "active" : ""}`} onClick={() => setFormat("canvas")} type="button">Canvas</button>
              </div>
              <div className="option-group">
                <span className="option-label">层级</span>
                <button className={`chip ${prefs.mode === "flat" ? "active" : ""}`} onClick={() => setPrefs("mode", "flat")} type="button">平铺</button>
                <button className={`chip ${prefs.mode === "tree" ? "active" : ""}`} onClick={() => setPrefs("mode", "tree")} type="button">树形</button>
                <span className="chip-sep" />
                <span className="option-label">摘录</span>
                <button className={`chip ${prefs.excerptStyle === "quote" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "quote")} type="button">引用</button>
                <button className={`chip ${prefs.excerptStyle === "plain" ? "active" : ""}`} onClick={() => setPrefs("excerptStyle", "plain")} type="button">原文</button>
              </div>
            </div>
          </div>

          <HistorySection history={sendHistory} vaultName={connection.vaultName} />
        </>
      )}
    </div>
  );
}
