import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, FileText, Folder, FolderSearch, Search, TextCursorInput, X } from "lucide-react";
import ostraconWsClient from "../lib/ostraconWsClient";
import { useQuote } from "../hooks/useQuote";

function QuoteFilePicker({ onChoose, onClose }) {
  const [folderPath, setFolderPath] = useState("");
  const [folder, setFolder] = useState({ folders: [], documents: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadFolder = async (path) => {
    setLoading(true);
    setError("");
    try {
      setFolder(await ostraconWsClient.sendObsidianCommand("listVaultFolder", { path }));
      setFolderPath(path);
    } catch (nextError) {
      setError(nextError.message || String(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadFolder(""); }, []);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const text = query.trim();
      if (!text) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await ostraconWsClient.sendObsidianCommand(
          "searchVaultDocuments",
          { query: text, limit: 100 },
          120000,
        );
        setResults(response.items || []);
      } catch (nextError) {
        setError(nextError.message || String(nextError));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const documents = query.trim() ? results : folder.documents || [];
  const goParent = () => {
    const parts = folderPath.split("/").filter(Boolean);
    parts.pop();
    void loadFolder(parts.join("/"));
  };

  return (
    <div className="quote-picker-backdrop" onClick={onClose}>
      <section className="quote-picker" role="dialog" aria-modal="true" aria-label="选择文件" onClick={event => event.stopPropagation()}>
        <header>
          <button className="icon-button" disabled={!folderPath || Boolean(query)} onClick={goParent} title="返回" type="button"><ArrowLeft size={16} /></button>
          <label><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索文件" /></label>
          <button className="icon-button" onClick={onClose} title="关闭" type="button"><X size={16} /></button>
        </header>
        <div className="quote-picker-path">{query ? "搜索结果" : folderPath || "Vault"}</div>
        {error && <div className="quote-inline-error">{error}</div>}
        <div className="quote-picker-list">
          {!query && (folder.folders || []).map(item => (
            <button key={item.path} onClick={() => void loadFolder(item.path)} type="button"><Folder size={15} /><span>{item.name}</span></button>
          ))}
          {documents.map(item => (
            <button key={item.path} onClick={() => onChoose(item.path)} type="button"><FileText size={15} /><span><strong>{item.title}</strong><small>{item.path}</small></span></button>
          ))}
          {loading && <div className="quote-picker-loading">加载中...</div>}
        </div>
      </section>
    </div>
  );
}

function SelectionPreview({ selection }) {
  const imageUrl = useMemo(() => selection?.kind === "image"
    ? `data:${selection.image.mime};base64,${selection.image.base64}`
    : "", [selection]);

  if (!selection) return <div className="quote-empty"><TextCursorInput size={22} /><span>未选择内容</span></div>;
  if (selection.kind === "image") return <div className="quote-preview image"><img src={imageUrl} alt="当前图片选区" /></div>;
  return <div className="quote-preview text">{selection.text}</div>;
}

function QuotePanelView({ quote }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const disabled = !quote.selection || Boolean(quote.busyTarget);

  const chooseFile = async (filePath) => {
    setPickerOpen(false);
    await quote.insert("file", filePath);
  };

  return (
    <section className="quote-workspace">
      <SelectionPreview selection={quote.selection} />
      {quote.error && <div className="quote-inline-error">{quote.error}</div>}

      <div className="quote-actions">
        <button disabled={disabled || !quote.context.cursor.available} onClick={() => void quote.insert("cursor")} type="button"><TextCursorInput size={17} /><span>{quote.busyTarget === "cursor" ? "插入中..." : "插入光标"}</span></button>
        <button disabled={disabled || !quote.context.activeFile.available} onClick={() => void quote.insert("active-file")} type="button"><FileDown size={17} /><span>{quote.busyTarget === "active-file" ? "追加中..." : "追加当前"}</span></button>
        <button disabled={disabled} onClick={() => setPickerOpen(true)} type="button"><FolderSearch size={17} /><span>选择文件</span></button>
      </div>

      <div className="quote-root-setting">
        <div><small>卡片根节点</small><strong>{quote.root?.title || "当前学习集"}</strong></div>
        <button className={quote.rootSelectionStatus === "waiting" ? "waiting" : ""} onClick={() => void quote.toggleRootSelection()} type="button">{quote.rootSelectionStatus === "waiting" ? "等待选择..." : "选择卡片"}</button>
        {quote.root && <button className="icon-button" onClick={() => void quote.clearRoot()} title="清除根节点" type="button"><X size={15} /></button>}
      </div>

      {pickerOpen && <QuoteFilePicker onChoose={chooseFile} onClose={() => setPickerOpen(false)} />}
    </section>
  );
}

function QuotePanel({ active, setNotice }) {
  const quote = useQuote(active, setNotice);
  return <QuotePanelView quote={quote} />;
}

export { QuoteFilePicker, QuotePanelView, SelectionPreview };
export default QuotePanel;
