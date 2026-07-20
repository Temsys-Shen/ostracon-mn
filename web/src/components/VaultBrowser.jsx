import React, { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Check, ChevronRight, FileText, Folder, Hash, Link2, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal } from "lucide-react";
import { useVaultBrowser } from "../hooks/useVaultBrowser";
import { useDocumentImport } from "../hooks/useDocumentImport";
import { usePdfDocumentImport } from "../hooks/usePdfDocumentImport";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import useBridgeStore from "../store/useBridgeStore";

export const DOCUMENT_ROW_HEIGHT = 36;

export function DocumentRow({ item, active, onOpen }) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={`${item.title}，${item.path}`}
      className={`document-row${active ? " active" : ""}`}
      onClick={() => onOpen(item.path)}
      title={item.path}
      type="button"
    >
      <FileText className="document-row-icon" size={14} />
      <strong className="document-row-title">{item.title}</strong>
      <ChevronRight className="document-row-arrow" size={13} />
    </button>
  );
}

function DocumentList({ items, activePath, onOpen, scrollRef }) {
  const listRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop || 0);
  }, [items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DOCUMENT_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
  });

  return (
    <div className="document-list" ref={listRef}>
      <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => {
          const item = items[row.index];
          return (
            <div className="document-row-slot" key={item.path} style={{ transform: `translateY(${row.start - scrollMargin}px)` }}>
              <DocumentRow active={item.path === activePath} item={item} onOpen={onOpen} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PREVIEW_CHUNK_SIZE = 80000;
const MARKDOWN_PLUGINS = [remarkMath, remarkGfm, remarkBreaks];
const HTML_PLUGINS = [rehypeRaw, rehypeKatex];

export function normalizeDisplayMathFences(markdown) {
  const lines = String(markdown || "").split("\n");
  let insideDisplayMath = false;
  const normalized = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "$$") {
      insideDisplayMath = !insideDisplayMath;
      normalized.push(line);
      continue;
    }
    if (insideDisplayMath && trimmed.endsWith("$$")) {
      const delimiterIndex = line.lastIndexOf("$$");
      normalized.push(line.slice(0, delimiterIndex));
      normalized.push(line.slice(delimiterIndex));
      insideDisplayMath = false;
      continue;
    }
    normalized.push(line);
  }
  return normalized.join("\n");
}

function CodeBlock({ children, ...props }) {
  const elementRef = useRef(null);
  const touchPositionRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    const handleWheel = (event) => {
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      element.scrollLeft += event.deltaX * scale;
      element.scrollTop += event.deltaY * scale;
      event.preventDefault();
      event.stopPropagation();
    };
    const handleTouchStart = (event) => {
      const touch = event.touches[0];
      touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
      event.stopPropagation();
    };
    const handleTouchMove = (event) => {
      const previous = touchPositionRef.current;
      const touch = event.touches[0];
      if (!previous || !touch) return;
      element.scrollLeft += previous.x - touch.clientX;
      element.scrollTop += previous.y - touch.clientY;
      touchPositionRef.current = { x: touch.clientX, y: touch.clientY };
      event.preventDefault();
      event.stopPropagation();
    };
    const handleTouchEnd = (event) => {
      touchPositionRef.current = null;
      event.stopPropagation();
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("touchstart", handleTouchStart, { passive: false });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);
    return () => {
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return <pre {...props} ref={elementRef}>{children}</pre>;
}

export const MarkdownBody = memo(function MarkdownBody({ markdown, assetUrls, onOpen }) {
  const components = useMemo(() => ({
    a: ({ href, children }) => {
      const isInternalDocument = href?.startsWith("ostracon-doc://");
      return <a href={href} target={isInternalDocument ? undefined : "_blank"} rel={isInternalDocument ? undefined : "noreferrer"} onClick={(event) => { if (isInternalDocument) { event.preventDefault(); onOpen(decodeURIComponent(href.slice(15))); } }}>{children}</a>;
    },
    img: ({ src, alt, ...props }) => {
      if (!src?.startsWith("ostracon-asset://")) return <img src={src} alt={alt || ""} {...props} />;
      const path = decodeURIComponent(src.slice(17));
      return <img src={assetUrls[path]} alt={alt || ""} {...props} />;
    },
    pre: CodeBlock,
  }), [assetUrls, onOpen]);
  const normalizedMarkdown = useMemo(() => normalizeDisplayMathFences(markdown), [markdown]);
  return <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} rehypePlugins={HTML_PLUGINS} urlTransform={url => url} components={components}>{normalizedMarkdown}</ReactMarkdown>;
});

const OBSIDIAN_HTML_STYLES = `
:host{display:block;width:100%;max-width:100%;min-width:0;color:var(--ink);font:13px/1.65 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",sans-serif}
.obsidian-html-body{display:block;width:100%;max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}
*{box-sizing:border-box}a{color:#315fc7;text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}
h1{font-size:20px}h2{font-size:17px}h3{font-size:15px}h1,h2,h3,h4,h5,h6{margin:1.2em 0 .45em;line-height:1.3}
p{max-width:72ch}img{max-width:100%!important;width:auto!important;height:auto!important;object-fit:contain!important}svg{max-width:100%}pre{position:relative;max-width:100%;overflow:auto;padding:12px 14px;border:1px solid #d8dde6;border-radius:5px;background:#f5f7fa;white-space:pre-wrap}
code{font:11px/1.6 "SF Mono",Menlo,monospace}.copy-code-button{all:unset;position:absolute;top:6px;right:6px;display:inline-flex;width:24px;height:24px;align-items:center;justify-content:center;border:1px solid #d2d7df;border-radius:4px;background:#fff;color:#596273;cursor:pointer;opacity:0;transition:opacity 150ms ease-out,background-color 150ms ease-out}.copy-code-button:hover{background:#eef1f6}.copy-code-button:focus-visible{outline:2px solid #315fc7;outline-offset:2px}.copy-code-button svg{display:block;width:14px!important;height:14px!important;max-width:none}.copy-code-button svg *{stroke-width:2}pre:hover .copy-code-button,.copy-code-button:focus-visible{opacity:1}
.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#77808f;font-style:italic}.token.punctuation{color:#596273}.token.namespace{opacity:.75}.token.property,.token.tag,.token.constant,.token.symbol,.token.deleted{color:#b42318}.token.boolean,.token.number{color:#9a4d00}.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color:#177245}.token.operator,.token.entity,.token.url,.language-css .token.string,.style .token.string{color:#7a3e9d}.token.atrule,.token.attr-value,.token.keyword{color:#315fc7}.token.function,.token.class-name{color:#7b45a8}.token.regex,.token.important,.token.variable{color:#a15c00}.token.important,.token.bold{font-weight:700}.token.italic{font-style:italic}
table{width:100%;border-collapse:collapse}th,td{padding:5px 7px;border:1px solid #d8dde6}
blockquote{margin:10px 0;padding:2px 12px;border-left:2px solid #9aa4b2;color:#687385}.callout{margin:12px 0;padding:10px 12px;border:1px solid #d8dde6;border-radius:6px;background:#f7f8fb}
.callout-title{display:flex;align-items:center;gap:6px;font-weight:650}.callout-icon svg{width:16px;height:16px}.internal-embed{display:block;margin:12px 0;padding:10px;border:1px solid #d8dde6;border-radius:6px}
.link-bookmark,.bookmark-card,.block-language-link-bookmark>div{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:12px;margin:12px 0;padding:12px;border:1px solid #d8dde6;border-radius:6px;background:#fff;overflow:hidden}
.link-bookmark img,.bookmark-card img,.block-language-link-bookmark img{border-radius:4px}.katex-display{max-width:100%;overflow:auto}.mermaid,.mermaid svg{max-width:100%}.mermaid svg{width:auto;height:auto}
.ta-bookmark{display:flex;box-sizing:border-box;width:100%;margin:12px 0;overflow:hidden;border:1px solid #d8dde6;border-radius:5px;background:#fff;cursor:pointer}.ta-bookmark:hover{border-color:#9aa8bb}.ta-bookmark-content{min-width:0;flex:2;padding:14px}.ta-bookmark-title{min-height:24px;margin-bottom:2px;overflow:hidden;color:#252a33;font-size:14px;line-height:20px;white-space:nowrap;text-overflow:ellipsis}.ta-bookmark-description{height:32px;overflow:hidden;color:#687385;font-size:11px;line-height:16px}.ta-bookmark-url{display:flex;align-items:center;margin-top:6px}.ta-bookmark-url-logo{width:16px;height:16px;margin-right:6px;flex:0 0 16px;background-repeat:no-repeat;background-position:center;background-size:contain}.ta-bookmark-url-text{overflow:hidden;color:#394150;font-size:11px;white-space:nowrap;text-overflow:ellipsis}.ta-bookmark-cover{min-width:112px;min-height:96px;flex:1;background-repeat:no-repeat;background-position:center;background-size:cover}@media(max-width:480px){.ta-bookmark{flex-direction:column-reverse}.ta-bookmark-cover{width:100%;min-height:128px;flex:none}.ta-bookmark-title{white-space:normal}.ta-bookmark-description{height:auto;max-height:48px}}
`;

export const ObsidianHtmlBody = memo(function ObsidianHtmlBody({ html, assetUrls, onOpen, contentRef }) {
  const hostRef = useRef(null);
  const hydratedHtml = useMemo(() => {
    let value = html || "";
    for (const path of Object.keys(assetUrls)) value = value.split(`ostracon-asset://${encodeURIComponent(path)}`).join(assetUrls[path]);
    return value;
  }, [html, assetUrls]);
  useEffect(() => {
    const host = hostRef.current;
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${OBSIDIAN_HTML_STYLES}</style><div class="obsidian-html-body">${hydratedHtml}</div>`;
    if (contentRef) contentRef.current = root.querySelector(".obsidian-html-body");
    const handleClick = event => {
      const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
      const internalPath = anchor?.dataset?.href;
      if (internalPath) {
        event.preventDefault();
        onOpen(internalPath);
        return;
      }
      const bookmark = event.composedPath().find(node => node instanceof HTMLElement && node.classList.contains("ta-bookmark"));
      const bookmarkUrl = bookmark?.querySelector(".ta-bookmark-url-text")?.textContent?.trim();
      if (bookmarkUrl) window.open(bookmarkUrl, "_blank");
    };
    root.addEventListener("click", handleClick);
    return () => {
      root.removeEventListener("click", handleClick);
      if (contentRef) contentRef.current = null;
    };
  }, [contentRef, hydratedHtml, onOpen]);
  return <div className="obsidian-html-host" ref={hostRef} />;
});

export function measureHtmlContent(element) {
  if (!element) throw new Error("HTML预览正文不存在");
  const width = Math.round(element.clientWidth);
  const height = Math.max(120, Math.round(element.scrollHeight));
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new Error("HTML预览尺寸无效");
  return { width, height };
}

function Preview({ document, markdown, html, assetUrls, onOpen, onBack, contentRef }) {
  const [tab, setTab] = useState("body");
  const [visibleCharacters, setVisibleCharacters] = useState(PREVIEW_CHUNK_SIZE);
  const deferredMarkdown = useDeferredValue(markdown);
  useEffect(() => setVisibleCharacters(PREVIEW_CHUNK_SIZE), [document?.path]);
  if (!document) return <div className="browser-empty"><FileText size={22} /><span>选择文档</span></div>;
  const visibleMarkdown = deferredMarkdown.length > visibleCharacters ? deferredMarkdown.slice(0, visibleCharacters) : deferredMarkdown;
  const hasMore = visibleCharacters < deferredMarkdown.length;
  return (
    <section className="document-preview">
      <header className="preview-header">
        <button className="icon-button preview-back" onClick={onBack} title="返回" type="button"><ArrowLeft size={17} /></button>
        <div className="preview-title"><h2>{document.title}</h2><p>{document.path}</p></div>
        <div className="preview-tabs"><button className={tab === "body" ? "active" : ""} onClick={() => setTab("body")} type="button">正文</button><button className={tab === "links" ? "active" : ""} onClick={() => setTab("links")} type="button">链接</button></div>
      </header>
      <div className="preview-tags">{(document.tags || []).map(tag => <span key={tag}>{tag}</span>)}</div>
      {tab === "body" ? (
        <article className="markdown-preview">
          {html ? <ObsidianHtmlBody html={html} assetUrls={assetUrls} onOpen={onOpen} contentRef={contentRef} /> : <MarkdownBody markdown={visibleMarkdown} assetUrls={assetUrls} onOpen={onOpen} />}
          {!html && hasMore && <button className="preview-more" onClick={() => setVisibleCharacters(value => value + PREVIEW_CHUNK_SIZE)} type="button">继续加载</button>}
        </article>
      ) : (
        <div className="relation-list">
          <h3>出链</h3>{(document.outgoing || []).map(path => <button onClick={() => onOpen(path)} key={path} type="button"><Link2 size={13} />{path}</button>)}
          <h3>反链</h3>{(document.backlinks || []).map(path => <button onClick={() => onOpen(path)} key={path} type="button"><Link2 size={13} />{path}</button>)}
          {(document.unresolved || []).length > 0 && <><h3>未解析</h3>{document.unresolved.map(path => <span className="unresolved-link" key={path}>{path}</span>)}</>}
        </div>
      )}
    </section>
  );
}

function VaultBrowser({ connection, setNotice }) {
  const browser = useVaultBrowser(connection);
  const importer = useDocumentImport();
  const pdfImporter = usePdfDocumentImport();
  const insertContext = useBridgeStore((s) => s.selection.insertContext);
  const bodyRef = useRef(null);
  const previewContentRef = useRef(null);
  const createMenuButtonRef = useRef(null);
  const listPaneRef = useRef(null);
  const [mode, setMode] = useState("files");
  const [searchText, setSearchText] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createMode, setCreateMode] = useState("markdown");
  const [createMenu, setCreateMenu] = useState(null);

  // insertContext 由 useSelectionWatcher 在 App 顶层通过 SelectionChanged 事件驱动刷新到 store，
  // VaultBrowser 直接从 store 读，不再需要 mount 时主动拉取或 3 秒轮询。
  // useDocumentImport.refreshContext 仍保留，仅用于 insert 成功后兜底刷新（写回 store）。

  const debouncedSearch = useDebouncedCallback(
    (text) => browser.search(text),
    250,
    [browser.search],
  );
  useEffect(() => {
    debouncedSearch(searchText);
  }, [searchText, debouncedSearch]);

  useEffect(() => {
    const message = importer.error || browser.error;
    if (message) setNotice(message);
  }, [browser.error, importer.error, setNotice]);

  useEffect(() => {
    if (pdfImporter.status === "generating") setNotice("正在生成PDF");
    if (pdfImporter.status === "uploading") setNotice("正在传输PDF");
    if (pdfImporter.status === "importing") setNotice("正在导入PDF");
  }, [pdfImporter.status, setNotice]);

  const goParent = () => {
    const parts = browser.folderPath.split("/").filter(Boolean);
    parts.pop(); browser.loadFolder(parts.join("/"));
  };

  const sidebarTitle = searchText
    ? "搜索结果"
    : mode === "tags"
      ? browser.selectedTag || "标签"
      : browser.folderPath || browser.state?.vaultName || "Vault";
  const sidebarBack = !searchText && mode === "tags" && browser.selectedTag
    ? () => browser.chooseTag("")
    : !searchText && mode === "files" && browser.folderPath
      ? goParent
      : null;
  const showDocuments = Boolean(searchText || mode === "files" || browser.selectedTag);
  const pdfBusy = pdfImporter.status !== "idle";
  const importBusy = pdfBusy || importer.status === "uploading" || importer.status === "appending" || importer.status === "creating";
  const hasCurrentCard = insertContext?.selectedCount === 1;
  const importTarget = hasCurrentCard ? insertContext.targetTitle : "学习集根部";

  const handleImport = async (operation, contentMode = "markdown") => {
    try {
      const htmlSize = contentMode === "html" ? measureHtmlContent(previewContentRef.current) : null;
      await importer.insert(browser.document, {
        contentMode, markdown: browser.insertMarkdown, html: browser.insertHtml,
        plainText: browser.plainText, htmlSize,
      }, operation);
      setNotice(operation === "append" ? "已追加到当前卡片" : "已创建到学习集");
    } catch (error) {
      setNotice(error.message || String(error));
    }
  };

  const toggleCreateMenu = () => {
    if (createMenu) { setCreateMenu(null); return; }
    const rect = createMenuButtonRef.current.getBoundingClientRect();
    setCreateMenu({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 6 });
  };

  const handlePdfImport = async () => {
    try {
      await pdfImporter.importDocument({ path: browser.document?.path });
      setNotice("PDF已导入当前学习集");
    } catch (error) {
      setNotice(error.message || String(error));
    }
  };

  const startSidebarResize = (event) => {
    if (sidebarCollapsed || event.button !== 0) return;
    event.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    const bounds = body.getBoundingClientRect();
    const move = (moveEvent) => {
      const maxWidth = Math.max(180, Math.floor(bounds.width * 0.55));
      setSidebarWidth(Math.min(maxWidth, Math.max(180, moveEvent.clientX - bounds.left)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-sidebar");
    };
    document.body.classList.add("resizing-sidebar");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className={`vault-browser${browser.document ? " has-preview" : ""}`}>
      <div className="browser-toolbar">
        <div className="view-switch"><button className={mode === "files" ? "active" : ""} onClick={() => { setMode("files"); browser.loadFolder(""); }} type="button"><Folder size={14} />文件</button><button className={mode === "tags" ? "active" : ""} onClick={() => setMode("tags")} type="button"><Hash size={14} />标签</button></div>
        <label className="search-box"><Search size={15} /><input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder={browser.state?.searchStatus === "building" ? "正在建立索引" : "搜索文档"} /></label>
      </div>
      <div className={`browser-body${sidebarCollapsed ? " sidebar-collapsed" : ""}`} ref={bodyRef} style={{ "--sidebar-width": `${sidebarWidth}px` }}>
        <aside className="browser-list-pane" ref={listPaneRef}>
          <div className="folder-head">
            {sidebarBack && <button className="icon-button" onClick={sidebarBack} title="返回" type="button"><ArrowLeft size={15} /></button>}
            <span className="folder-head-title">{sidebarTitle}</span>
            {showDocuments && <small className="folder-head-count">{browser.activeDocuments.length}</small>}
            <button className="icon-button sidebar-collapse" onClick={() => setSidebarCollapsed(true)} title="折叠文件栏" type="button"><PanelLeftClose size={15} /></button>
          </div>
          {!searchText && mode === "files" && (browser.folder.folders || []).map(item => <button className="folder-row" key={item.path} onClick={() => browser.loadFolder(item.path)} type="button"><Folder size={15} /><span>{item.name}</span><ChevronRight size={14} /></button>)}
          {!searchText && mode === "tags" && !browser.selectedTag && <div className="tag-list">{browser.tags.map(tag => <button key={tag.name} onClick={() => browser.chooseTag(tag.name)} type="button"><span>{tag.name}</span><small>{tag.count}</small></button>)}</div>}
          {showDocuments && (browser.loading && browser.activeDocuments.length === 0 ? <div className="browser-skeleton"><i /><i /><i /><i /></div> : <DocumentList activePath={browser.document?.path} items={browser.activeDocuments} onOpen={browser.openDocument} scrollRef={listPaneRef} />)}
        </aside>
        <div className="sidebar-resizer" onPointerDown={startSidebarResize} role="separator" aria-label="调整文件栏宽度" aria-orientation="vertical" />
        {sidebarCollapsed && <button className="icon-button sidebar-expand" onClick={() => setSidebarCollapsed(false)} title="展开文件栏" type="button"><PanelLeftOpen size={16} /></button>}
        <Preview document={browser.document} markdown={browser.previewMarkdown} html={browser.previewHtml} assetUrls={browser.assetUrls} onOpen={browser.openDocument} onBack={() => browser.setDocument(null)} contentRef={previewContentRef} />
      </div>
      {browser.document && (
        <footer className="insert-bar">
          <div className="insert-target"><small>导入到</small><strong>{importTarget}</strong></div>
          <div className="insert-actions">
            <div className="card-import-actions">
              {hasCurrentCard && <button className="secondary append-action" disabled={importBusy} onClick={() => handleImport("append", createMode)} type="button">{importer.status === "uploading" ? "传输中" : importer.status === "appending" ? "追加中" : "追加到当前卡片"}</button>}
              <button className="create-card-action" disabled={importBusy} onClick={() => handleImport("create", createMode)} type="button">{importer.status === "uploading" ? "传输中" : importer.status === "creating" ? "创建中" : "创建卡片"}</button>
              <button aria-label="选择导入方式" className="import-mode-button" disabled={importBusy} onClick={toggleCreateMenu} ref={createMenuButtonRef} title={`导入方式 · ${createMode === "markdown" ? "灵活" : "只读"}`} type="button"><SlidersHorizontal size={16} /></button>
            </div>
            <div className="document-import-actions">
              <button className="pdf-import-button" disabled={importBusy} onClick={handlePdfImport} type="button">{pdfBusy ? "处理中" : "导入文档"}</button>
            </div>
          </div>
        </footer>
      )}
      {createMenu && createPortal(<div className="create-mode-menu" style={{ right: createMenu.right, bottom: createMenu.bottom }}><button onClick={() => { setCreateMode("markdown"); setCreateMenu(null); }} type="button"><span>{createMode === "markdown" && <Check size={14} />}</span>灵活</button><button onClick={() => { setCreateMode("html"); setCreateMenu(null); }} type="button"><span>{createMode === "html" && <Check size={14} />}</span>只读</button></div>, document.body)}
    </div>
  );
}

export default VaultBrowser;
