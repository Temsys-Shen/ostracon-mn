import { useCallback, useState } from "react";
import ostraconWsClient from "../lib/ostraconWsClient";
import { OB_CMD } from "../lib/commands";
import { useAsyncAction } from "./useAsyncAction";

// 轻量级 vault 文件夹选择 hook。抽出 QuoteFilePicker 与 useVaultBrowser 共同的 loadFolder/search 样板。
//
// 返回：
// - folderPath / folder / query / results / documents: 状态
// - loading / error: 异步状态
// - loadFolder(path): 加载文件夹
// - search(text): 搜索（空字符串清空结果）
// - setQuery(text): 仅设置 query（不触发搜索，用于受控输入）
// - goParent(): 返回上一级
//
// 注意：useVaultBrowser 因为还有 tags/document/assets 等功能，不直接用此 hook，
// 但其内部的 loadFolder/search 样板已用 useAsyncAction 简化。
function useVaultFolderPicker() {
  const [folderPath, setFolderPath] = useState("");
  const [folder, setFolder] = useState({ folders: [], documents: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const { loading, error, run } = useAsyncAction();

  const loadFolder = useCallback(async (path = "") => {
    await run(async () => {
      setFolder(await ostraconWsClient.sendObsidianCommand(OB_CMD.LIST_VAULT_FOLDER, { path }));
      setFolderPath(path);
    });
  }, [run]);

  const search = useCallback(async (text) => {
    setQuery(text);
    const trimmed = text.trim();
    if (!trimmed) { setResults([]); return; }
    await run(async () => {
      const response = await ostraconWsClient.sendObsidianCommand(
        OB_CMD.SEARCH_VAULT_DOCUMENTS,
        { query: trimmed, limit: 100 },
        120000,
      );
      setResults(response.items || []);
    });
  }, [run]);

  const goParent = useCallback(() => {
    const parts = folderPath.split("/").filter(Boolean);
    parts.pop();
    void loadFolder(parts.join("/"));
  }, [folderPath, loadFolder]);

  const documents = query.trim() ? results : folder.documents || [];

  return { folderPath, folder, query, results, documents, loading, error, loadFolder, search, setQuery, goParent };
}

export { useVaultFolderPicker };
