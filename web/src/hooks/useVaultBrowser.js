import { useCallback, useEffect, useMemo, useState } from "react";
import ostraconWsClient from "../lib/ostraconWsClient";
import { OB_CMD } from "../lib/commands";
import { useAsyncAction } from "./useAsyncAction";

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
  const { loading, error, run } = useAsyncAction();

  const command = useCallback((name, payload, timeout) => ostraconWsClient.sendObsidianCommand(name, payload, timeout), []);

  const loadState = useCallback(async () => {
    if (!connection.connected) return;
    try {
      setState(await command(OB_CMD.GET_VAULT_BROWSER_STATE));
    } catch (e) {
      console.log("loadState failed", e);
    }
  }, [connection.connected, command]);

  const loadFolder = useCallback(async (path = "") => {
    await run(async () => {
      setFolder(await command(OB_CMD.LIST_VAULT_FOLDER, { path }));
      setFolderPath(path);
    });
  }, [run, command]);

  const loadTags = useCallback(async () => {
    await run(async () => {
      const result = await command(OB_CMD.LIST_VAULT_TAGS);
      setTags(result.tags || []);
    });
  }, [run, command]);

  const chooseTag = useCallback(async (tag) => {
    setSelectedTag(tag);
    if (!tag) { setTagDocuments([]); return; }
    await run(async () => {
      const result = await command(OB_CMD.LIST_VAULT_DOCUMENTS, { tag, limit: 100 });
      setTagDocuments(result.items || []);
    });
  }, [run, command]);

  const search = useCallback(async (text) => {
    setQuery(text);
    if (!text.trim()) { setSearchResults([]); return; }
    await run(async () => {
      const result = await command(OB_CMD.SEARCH_VAULT_DOCUMENTS, { query: text, limit: 100 }, 120000);
      setSearchResults(result.items || []);
      await loadState();
    });
  }, [run, command, loadState]);

  const openDocument = useCallback(async (path) => {
    await run(async () => {
      const detail = await command(OB_CMD.GET_VAULT_DOCUMENT, { path }, 30000);
      const assetItems = detail.assets || [];
      const declaredTotal = assetItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
      if (declaredTotal > 50 * 1024 * 1024) throw new Error("本次插入图片总量超过50MB");
      const assets = {};
      let nextAssetIndex = 0;
      const loadAsset = async () => {
        while (nextAssetIndex < assetItems.length) {
          const item = assetItems[nextAssetIndex];
          nextAssetIndex += 1;
          const asset = await command(OB_CMD.GET_VAULT_ASSET, { path: item.path }, 30000);
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
    });
  }, [run, command]);

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
