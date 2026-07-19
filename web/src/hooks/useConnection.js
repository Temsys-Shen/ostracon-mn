import { useEffect, useCallback, useState } from "react";
import ostraconWsClient from "../lib/ostraconWsClient";
import { scanLan } from "../lib/lanScan";
import { normalizeError } from "../lib/errors";

function formatHost(host) {
  if (!host) return "127.0.0.1";
  if (host === "::") return "[::1]";
  // Strip existing brackets to avoid double-bracketing
  const clean = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return clean.includes(":") ? `[${clean}]` : clean;
}

function formatWsUrl(host, port) {
  return `ws://${formatHost(host)}:${port || 27123}`;
}

function parseConnectionUrl(input) {
  if (!input) return null;
  try {
    const url = new URL(input.trim());
    if (url.protocol === "ws:" || url.protocol === "wss:") {
      return { host: url.hostname, port: url.port || "27123" };
    }
  } catch (_) {}
  return null;
}

function useConnection(setConnection, setUrlInput, setNotice) {
  useEffect(() => {
    setConnection(ostraconWsClient.getSnapshot());
    let cancelled = false;
    ostraconWsClient.loadStoredSettings()
      .then(async (snap) => {
        if (cancelled) return;
        setConnection(snap);
        const s = snap.settings;
        setUrlInput(formatWsUrl(s.host, s.port));
        if (!snap.connected && snap.status !== "connecting") {
          await ostraconWsClient.connect();
        }
      })
      .catch((e) => {
        if (!cancelled) console.log("[Ostracon] auto connect failed:", normalizeError(e));
      });
    const unsubscribe = ostraconWsClient.subscribe(({ event, snapshot }) => {
      setConnection(snapshot);
      if (!snapshot.connected && snapshot.lastError) {
        setNotice(`连接失败: ${snapshot.lastError}`);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setConnection, setUrlInput, setNotice]);

  const doConnect = useCallback(async (urlInput) => {
    const parsed = parseConnectionUrl(urlInput);
    if (!parsed) {
      setNotice("请输入有效的连接串");
      return;
    }

    setNotice("");
    ostraconWsClient.clearLastError();
    try {
      await ostraconWsClient.updateSettings(parsed);
      await ostraconWsClient.connect();
      setNotice("");
    } catch (e) {
      const snap = ostraconWsClient.getSnapshot();
      setNotice(`连接失败: ${snap.lastError || normalizeError(e)}`);
    }
  }, [setNotice]);

  return { doConnect, parseConnectionUrl };
}

function useDiscovery() {
  const [discoveredServers, setDiscoveredServers] = useState([]);
  const [scanning, setScanning] = useState(false);
  const stopRef = { current: null };

  const startScan = useCallback(async () => {
    setScanning(true);
    setDiscoveredServers([]);

    // Stop any previous scan
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }

    const port = ostraconWsClient.settings.port || 27123;
    const lastHost = ostraconWsClient.settings.host || "";

    const onFound = (service) => {
      setDiscoveredServers((prev) => {
        const exists = prev.some(
          (s) => s.name === service.name && s.host === service.host,
        );
        if (exists) return prev;
        return [...prev, service];
      });
    };

    try {
      const stop = await scanLan(port, onFound, lastHost);
      stopRef.current = stop;
    } catch (e) {
      console.log("[Ostracon] discovery scan failed:", e);
    }

    // Auto-stop scan after 30 seconds (subnet scanning can take a while)
    setTimeout(() => {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
      setScanning(false);
    }, 30000);
  }, []);

  return { discoveredServers, scanning, startScan };
}

export { useConnection, useDiscovery, parseConnectionUrl, formatWsUrl };
