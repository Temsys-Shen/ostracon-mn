import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookMarked, Check, FileDown, FileText, Folder, FolderSearch, ListPlus, Play, Search, TextCursorInput, Trash2, X } from "lucide-react";
import ostraconWsClient from "../lib/ostraconWsClient";
import { useQuote } from "../hooks/useQuote";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { useVaultFolderPicker } from "../hooks/useVaultFolderPicker";

function QuoteFilePicker({ onChoose, onClose }) {
  const picker = useVaultFolderPicker();
  const { folderPath, folder, query, documents, loading, error, loadFolder, setQuery, goParent } = picker;

  useEffect(() => { void loadFolder(""); }, [loadFolder]);
  const debouncedSearch = useDebouncedCallback((text) => { void picker.search(text); }, 250, [picker.search]);
  useEffect(() => { debouncedSearch(query); }, [query, debouncedSearch]);

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

function QuoteCitationDialog({ quote, citekey, offset, onCitekeyChange, onOffsetChange, onSave, onClose }) {
  return (
    <div className="quote-picker-backdrop" onClick={onClose}>
      <section className="quote-citation-dialog" role="dialog" aria-modal="true" aria-label="当前文档引用" onClick={event => event.stopPropagation()}>
        <header>
          <div className="quote-citation-title">
            <small>配置当前文档引用</small>
            <strong>{quote.documentInfo?.docTitle || "未打开文档"}</strong>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭" type="button"><X size={16} /></button>
        </header>
        <div className="quote-citation-fields">
          <label><span>citekey</span>
            <input value={citekey} onChange={event => onCitekeyChange(event.target.value)} placeholder="如 zhang2020" />
          </label>
          <label><span>页码偏移</span>
            <input type="number" value={offset} onChange={event => onOffsetChange(event.target.value)} placeholder="0" />
          </label>
          <button disabled={quote.citationSaving || !quote.documentInfo?.docMd5} onClick={() => void onSave()} type="button">{quote.citationSaving ? "保存中..." : "保存"}</button>
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
  const [pickerMode, setPickerMode] = useState("");
  const [citationOpen, setCitationOpen] = useState(false);
  const [citekeyInput, setCitekeyInput] = useState("");
  const [offsetInput, setOffsetInput] = useState("0");
  const disabled = !quote.selection || Boolean(quote.busyTarget);
  const continuousActive = quote.continuous?.active === true;
  const continuousCount = quote.continuous?.items?.length || 0;
  const continuousDisabled = Boolean(quote.busyTarget);
  const finishDisabled = continuousDisabled || continuousCount === 0;

  // 文档切换/信息刷新时回填 citekey 与 offset
  useEffect(() => {
    setCitekeyInput(quote.documentInfo?.citekey || "");
    setOffsetInput(String(quote.documentInfo?.pageOffset || 0));
  }, [quote.documentInfo?.docMd5, quote.documentInfo?.citekey, quote.documentInfo?.pageOffset]);

  const saveCitationAndClose = async () => {
    const saved = await quote.saveCitation(citekeyInput, Number(offsetInput) || 0);
    if (saved) {
      setOffsetInput(String(saved.pageOffset || 0));
      setCitationOpen(false);
    }
  };

  // 打开弹窗前主动从 readerController 拉取当前文档信息（不依赖选区变化事件）
  const openCitation = async () => {
    await quote.refreshDocumentInfo();
    setCitationOpen(true);
  };

  const chooseFile = async (filePath) => {
    const mode = pickerMode;
    setPickerMode("");
    if (mode === "continuous") await quote.finishContinuous("file", filePath);
    else await quote.insert("file", filePath);
  };

  return (
    <section className="quote-workspace">
      <div className="quote-toolbar">
        <div className="quote-toolbar-main">
          <div className="quote-toolbar-status">
            <div><small>连续摘录</small><strong className={continuousActive ? "active" : ""}>{continuousActive ? `${continuousCount}条` : "未开始"}</strong></div>
            {continuousActive && continuousCount > 0 && <Check size={15} className="quote-continuous-check" />}
          </div>
          <span className="quote-toolbar-sep" />
          <div className="quote-toolbar-actions">
            {continuousActive ? (
              <>
                <button disabled={continuousDisabled || !quote.selection} onClick={() => void quote.addContinuousSelection()} type="button"><ListPlus size={15} /><span>{quote.busyTarget === "continuous-add" ? "加入中..." : "加入"}</span></button>
                <button disabled={continuousDisabled} onClick={() => void quote.cancelContinuous()} type="button"><Trash2 size={15} /><span>取消</span></button>
              </>
            ) : (
              <button disabled={Boolean(quote.busyTarget)} onClick={() => void quote.startContinuous()} type="button"><Play size={15} /><span>开始</span></button>
            )}
          </div>
        </div>
        <div className="quote-toolbar-secondary">
          <button className="quote-citation-open" onClick={() => void openCitation()} title="配置当前文档引用" type="button"><BookMarked size={16} /></button>
        </div>
      </div>

      <SelectionPreview selection={quote.selection} />
      {quote.error && <div className="quote-inline-error">{quote.error}</div>}

      <div className="quote-group">
        <div className="quote-group-title">{continuousActive ? "完成摘录" : "插入引文"}</div>
        <div className="quote-actions">
          {continuousActive ? (
            <>
              <button className="primary" disabled={finishDisabled || !quote.context.cursor.available} onClick={() => void quote.finishContinuous("cursor")} type="button"><TextCursorInput size={17} /><span>{quote.busyTarget === "continuous-cursor" ? "完成中..." : "完成光标"}</span></button>
              <button disabled={finishDisabled || !quote.context.activeFile.available} onClick={() => void quote.finishContinuous("active-file")} type="button"><FileDown size={17} /><span>{quote.busyTarget === "continuous-active-file" ? "完成中..." : "完成当前"}</span></button>
              <button disabled={finishDisabled} onClick={() => setPickerMode("continuous")} type="button"><FolderSearch size={17} /><span>完成文件</span></button>
            </>
          ) : (
            <>
              <button className="primary" disabled={disabled || !quote.context.cursor.available} onClick={() => void quote.insert("cursor")} type="button"><TextCursorInput size={17} /><span>{quote.busyTarget === "cursor" ? "插入中..." : "插入光标"}</span></button>
              <button disabled={disabled || !quote.context.activeFile.available} onClick={() => void quote.insert("active-file")} type="button"><FileDown size={17} /><span>{quote.busyTarget === "active-file" ? "追加中..." : "追加当前"}</span></button>
              <button disabled={disabled} onClick={() => setPickerMode("quote")} type="button"><FolderSearch size={17} /><span>选择文件</span></button>
            </>
          )}
        </div>
      </div>

      <div className="quote-group">
        <div className="quote-group-title">同级节点</div>
        <div className="quote-root-setting">
          <div><strong>{quote.root?.title || "当前学习集"}</strong></div>
          <button className={quote.rootSelectionStatus === "waiting" ? "waiting" : ""} onClick={() => void quote.toggleRootSelection()} type="button">{quote.rootSelectionStatus === "waiting" ? "等待选择..." : "选择卡片"}</button>
          {quote.root && <button className="icon-button" onClick={() => void quote.clearRoot()} title="清除同级节点" type="button"><X size={15} /></button>}
        </div>
      </div>

      {pickerMode && <QuoteFilePicker onChoose={chooseFile} onClose={() => setPickerMode("")} />}
      {citationOpen && (
        <QuoteCitationDialog
          quote={quote}
          citekey={citekeyInput}
          offset={offsetInput}
          onCitekeyChange={setCitekeyInput}
          onOffsetChange={setOffsetInput}
          onSave={saveCitationAndClose}
          onClose={() => setCitationOpen(false)}
        />
      )}
    </section>
  );
}

function QuotePanel({ active, setNotice }) {
  const quote = useQuote(active, setNotice);
  return <QuotePanelView quote={quote} />;
}

export { QuoteFilePicker, QuotePanelView, SelectionPreview };
export default QuotePanel;
