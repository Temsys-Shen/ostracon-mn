import { useCallback, useEffect, useMemo, useState } from "react";
import ostraconWsClient from "../lib/ostraconWsClient";

function useVaultBrowser(connection) {
  const [state, setState] = useState(null);
  const [folderPath, setFolderPath] = useState("");
  const [folder, setFolder] = useState({ folders: [], documents: [] });
  const [tags, setTags] = useState([]);
  const [tagDocuments, setTagDocuments] = useState([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [document, setDocument] = useState(null);
  const [previewMarkdown, setPreviewMarkdown] = useState("");
  const [insertMarkdown, setInsertMarkdown] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [insertHtml, setInsertHtml] = useState("");
  const [plainText, setPlainText] = useState("");
  const [assetUrls, setAssetUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const command = useCallback((name, payload, timeout) => ostraconWsClient.sendObsidianCommand(name, payload, timeout), []);

  const loadState = useCallback(async () => {
    if (!connection.connected) return;
    try {
      setState(await command("getVaultBrowserState"));
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [connection.connected, command]);

  const loadFolder = useCallback(async (path = "") => {
    setLoading(true); setError("");
    try { setFolder(await command("listVaultFolder", { path })); setFolderPath(path); }
    catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [command]);

  const loadTags = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await command("listVaultTags"); setTags(result.tags || []); }
    catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [command]);

  const chooseTag = useCallback(async (tag) => {
    setSelectedTag(tag);
    if (!tag) { setTagDocuments([]); return; }
    setLoading(true); setError("");
    try { const result = await command("listVaultDocuments", { tag, limit: 100 }); setTagDocuments(result.items || []); }
    catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [command]);

  const search = useCallback(async (text) => {
    setQuery(text);
    if (!text.trim()) { setSearchResults([]); return; }
    setLoading(true); setError("");
    try { const result = await command("searchVaultDocuments", { query: text, limit: 100 }, 120000); setSearchResults(result.items || []); await loadState(); }
    catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [command, loadState]);

  const openDocument = useCallback(async (path) => {
    setLoading(true); setError("");
    try {
      const detail = await command("getVaultDocument", { path }, 30000);
      const assetItems = detail.assets || [];
      const declaredTotal = assetItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
      if (declaredTotal > 50 * 1024 * 1024) throw new Error("本次插入图片总量超过50MB");
      const assets = {};
      let nextAssetIndex = 0;
      const loadAsset = async () => {
        while (nextAssetIndex < assetItems.length) {
          const item = assetItems[nextAssetIndex];
          nextAssetIndex += 1;
          const asset = await command("getVaultAsset", { path: item.path }, 30000);
          assets[item.path] = `data:${asset.mime};base64,${asset.base64}`;
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, assetItems.length) }, loadAsset));
      let fullMarkdown = detail.markdown || "";
      let fullHtml = detail.renderedHtml || "";
      for (const pathValue of Object.keys(assets)) {
        fullMarkdown = fullMarkdown.split(`ostracon-asset://${encodeURIComponent(pathValue)}`).join(assets[pathValue]);
        fullHtml = fullHtml.split(`ostracon-asset://${encodeURIComponent(pathValue)}`).join(assets[pathValue]);
      }
      setDocument(detail);
      setPreviewMarkdown(detail.markdown || "");
      setInsertMarkdown(fullMarkdown);
      setPreviewHtml(detail.renderedHtml || "");
      setInsertHtml(fullHtml);
      setPlainText(detail.plainText || "");
      setAssetUrls(assets);
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, [command]);

  useEffect(() => {
    if (!connection.connected) return;
    loadState(); loadFolder(""); loadTags();
  }, [connection.connected, loadState, loadFolder, loadTags]);

  useEffect(() => {
    if (connection.lastEvent?.event === "vaultIndexChanged") {
      loadState(); loadFolder(folderPath); loadTags();
    }
  }, [connection.lastEvent, folderPath, loadState, loadFolder, loadTags]);

  const activeDocuments = useMemo(() => query.trim() ? searchResults : selectedTag ? tagDocuments : folder.documents || [], [query, searchResults, selectedTag, tagDocuments, folder.documents]);

  return { state, folderPath, folder, tags, selectedTag, query, activeDocuments, document, previewMarkdown, insertMarkdown, previewHtml, insertHtml, plainText, assetUrls, loading, error, loadFolder, chooseTag, search, openDocument, setDocument };
}

export { useVaultBrowser };
