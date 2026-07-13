import React, { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, ChevronRight, FileText, Folder, Hash, Link2, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useVaultBrowser } from "../hooks/useVaultBrowser";
import { useDocumentImport } from "../hooks/useDocumentImport";

function DocumentList({ items, onOpen, scrollRef }) {
  const listRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop || 0);
  }, [items]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
    scrollMargin,
  });
  return (
    <div className="document-list" ref={listRef}>
      <div className="virtual-list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => {
          const item = items[row.index];
          return (
            <button className="document-row" key={item.path} style={{ transform: `translateY(${row.start - scrollMargin}px)` }} onClick={() => onOpen(item.path)} type="button">
              <FileText size={15} />
              <span className="document-row-copy"><strong>{item.title}</strong><small>{item.path}</small></span>
              <ChevronRight size={14} />
            </button>
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

function Preview({ document, markdown, assetUrls, onOpen, onBack }) {
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
          <MarkdownBody markdown={visibleMarkdown} assetUrls={assetUrls} onOpen={onOpen} />
          {hasMore && <button className="preview-more" onClick={() => setVisibleCharacters(value => value + PREVIEW_CHUNK_SIZE)} type="button">继续加载</button>}
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

function VaultBrowser({ connection }) {
  const browser = useVaultBrowser(connection);
  const importer = useDocumentImport();
  const bodyRef = useRef(null);
  const listPaneRef = useRef(null);
  const [mode, setMode] = useState("files");
  const [searchText, setSearchText] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    importer.refreshContext().catch(error => console.log("insert context failed", error));
    const timer = window.setInterval(() => importer.refreshContext().catch(error => console.log("insert context failed", error)), 3000);
    return () => window.clearInterval(timer);
  }, [importer.refreshContext]);

  useEffect(() => {
    const timer = window.setTimeout(() => browser.search(searchText), 250);
    return () => window.clearTimeout(timer);
  }, [searchText, browser.search]);

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
  const importBusy = importer.status === "uploading" || importer.status === "appending" || importer.status === "creating";
  const hasCurrentCard = importer.context?.selectedCount === 1;
  const importTarget = importer.contextError || (hasCurrentCard ? importer.context.targetTitle : "学习集根部");

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
      {browser.error && <div className="browser-error">{browser.error}</div>}
      <div className={`browser-body${sidebarCollapsed ? " sidebar-collapsed" : ""}`} ref={bodyRef} style={{ "--sidebar-width": `${sidebarWidth}px` }}>
        <aside className="browser-list-pane" ref={listPaneRef}>
          <div className="folder-head">
            {sidebarBack && <button className="icon-button" onClick={sidebarBack} title="返回" type="button"><ArrowLeft size={15} /></button>}
            <span>{sidebarTitle}</span>
            <button className="icon-button sidebar-collapse" onClick={() => setSidebarCollapsed(true)} title="折叠文件栏" type="button"><PanelLeftClose size={15} /></button>
          </div>
          {!searchText && mode === "files" && (browser.folder.folders || []).map(item => <button className="folder-row" key={item.path} onClick={() => browser.loadFolder(item.path)} type="button"><Folder size={15} /><span>{item.name}</span><ChevronRight size={14} /></button>)}
          {!searchText && mode === "tags" && !browser.selectedTag && <div className="tag-list">{browser.tags.map(tag => <button key={tag.name} onClick={() => browser.chooseTag(tag.name)} type="button"><span>{tag.name}</span><small>{tag.count}</small></button>)}</div>}
          {showDocuments && (browser.loading && browser.activeDocuments.length === 0 ? <div className="browser-skeleton"><i /><i /><i /><i /></div> : <DocumentList items={browser.activeDocuments} onOpen={browser.openDocument} scrollRef={listPaneRef} />)}
        </aside>
        <div className="sidebar-resizer" onPointerDown={startSidebarResize} role="separator" aria-label="调整文件栏宽度" aria-orientation="vertical" />
        {sidebarCollapsed && <button className="icon-button sidebar-expand" onClick={() => setSidebarCollapsed(false)} title="展开文件栏" type="button"><PanelLeftOpen size={16} /></button>}
        <Preview document={browser.document} markdown={browser.previewMarkdown} assetUrls={browser.assetUrls} onOpen={browser.openDocument} onBack={() => browser.setDocument(null)} />
      </div>
      {browser.document && <footer className="insert-bar"><div className="insert-target"><small>目标</small><strong>{importTarget}</strong></div><div className="insert-actions">{hasCurrentCard && <button className="secondary" disabled={importBusy} onClick={() => importer.insert(browser.document, browser.insertMarkdown, "append")} type="button">{importer.status === "uploading" ? "传输中" : importer.status === "appending" ? "追加中" : importer.status === "success" && importer.result?.operation === "append" ? "已追加" : "追加到当前卡片"}</button>}<button disabled={importBusy} onClick={() => importer.insert(browser.document, browser.insertMarkdown, "create")} type="button">{importer.status === "uploading" ? "传输中" : importer.status === "creating" ? "创建中" : importer.status === "success" && importer.result?.operation === "create" ? "已创建" : "创建卡片"}</button></div></footer>}
      {importer.error && <div className="browser-error import-error">{importer.error}</div>}
    </div>
  );
}

export default VaultBrowser;
