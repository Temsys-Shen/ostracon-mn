// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSource(context, relativePath) {
  const filePath = path.join(rootDir, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

function createNote(noteId, title, startPage, endPage, excerptText) {
  return {
    noteId,
    noteTitle: title,
    startPage,
    endPage,
    excerptText: excerptText || "",
    comments: [],
    merged: [],
    merge(note) {
      this.merged.push(note.noteId);
      this.comments.push({ type: "TextNote", text: "marginnote4app://note/" + note.noteId });
    },
  };
}

function createRuntime() {
  const notes = {};
  const deleted = [];
  const refreshes = [];
  const posts = [];
  const dirtyNotebooks = [];
  const focusCalls = [];
  const docFocusCalls = [];
  const savedb = { count: 0 };
  const mindmapState = {
    nodes: [
      { note: { noteId: "note-1" } },
      { note: { noteId: "note-2" } },
      { note: { noteId: "note-3" } },
    ],
  };
  const mindmapView = {
    mindmapNodes: mindmapState.nodes,
  };
  const created = [
    createNote("note-1", "第一段", 1, 1, "第一段摘录文本"),
    createNote("note-2", "第二段", undefined, undefined, "第二段摘录文本"),
    createNote("note-3", "第三段", undefined, undefined, "第三段摘录文本"),
  ];
  created.forEach(note => { notes[note.noteId] = note; });
  let notebookId = "nb1";
  let selectionIndex = 0;
  const db = {
    getNoteById(noteId) {
      return notes[noteId];
    },
    deleteBookNoteTree(noteId) {
      deleted.push(noteId);
      delete notes[noteId];
    },
    getMediaByHash() {
      return undefined;
    },
    getSketchNoteForMindMapFocusNoteId() {
      return null;
    },
    setNotebookSyncDirty(notebookId) {
      dirtyNotebooks.push(notebookId);
    },
    savedb() {
      savedb.count += 1;
    },
  };
  const documentController = {
    docMd5: "doc1",
    isSelectionText: true,
    selectionText: "选区",
    imageFromSelection() {
      return { base64Encoding: () => "c2VsZWN0aW9u" };
    },
    highlightFromSelection() {
      const note = created[selectionIndex];
      selectionIndex += 1;
      return note;
    },
  };
  let citeMapping = null;
  const context = vm.createContext({
    console,
    Database: { sharedInstance: () => db },
    Application: {
      sharedInstance: () => ({
        studyController: () => ({
          notebookController: {
            notebookId,
            mindmapView,
          },
          readerController: { currentDocumentController: documentController },
          focusNoteInMindMapById: (noteId) => focusCalls.push(noteId),
          focusNoteInDocumentById: (noteId) => docFocusCalls.push(noteId),
        }),
        refreshAfterDBChanged: (nextNotebookId) => refreshes.push(nextNotebookId),
      }),
    },
    UndoManager: {
      sharedInstance: () => ({
        undoGrouping: (_title, _topicId, fn) => fn(),
      }),
    },
    NSNotificationCenter: {
      defaultCenter: () => ({
        postNotificationNameObjectUserInfo: (name, object, userInfo) => posts.push({ name, object, userInfo }),
      }),
    },
    NSTimer: {
      scheduledTimerWithTimeInterval: (_interval, _repeat, block) => block(),
    },
    __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon: {
      loadPrefs: () => ({}),
    },
    __MN_BRIDGE_COMMANDS_INFO_MNOstraconAddon: {
      getCiteKeyMappingForDoc: () => citeMapping,
    },
  });

  loadSource(context, "src/CardSelectionService.js");
  loadSource(context, "src/OstraconUtils.js");
  loadSource(context, "src/FreehandStrokeService.js");
  loadSource(context, "src/DrawingArchiveService.js");
  loadSource(context, "src/InkDrawingService.js");
  loadSource(context, "src/HtmlCompatibilityService.js");
  loadSource(context, "src/CardContentService.js");
  loadSource(context, "src/MarkdownExportService.js");
  loadSource(context, "src/QuoteSelectionService.js");
  loadSource(context, "src/ContinuousQuoteService.js");

  return {
    service: context.__MN_CONTINUOUS_QUOTE_SERVICE_MNOstraconAddon,
    quoteService: context.__MN_QUOTE_SELECTION_SERVICE_MNOstraconAddon,
    context: { addon: { window: {} } },
    notes,
    deleted,
    refreshes,
    posts,
    dirtyNotebooks,
    focusCalls,
    docFocusCalls,
    mindmapView,
    savedb,
    setNotebookId(value) { notebookId = value; },
    setCiteMapping(citekey, pageOffset) { citeMapping = citekey ? { citekey, pageOffset } : null; },
  };
}

describe("ContinuousQuoteService", () => {
  test("uses the first created card as the primary card", () => {
    const runtime = createRuntime();
    const service = runtime.service;

    expect(service.startSession(runtime.context)).toMatchObject({ active: true, notebookId: "nb1", items: [] });
    expect(service.addSelection(runtime.context).state).toMatchObject({
      primaryNoteId: "note-1",
      items: [{ noteId: "note-1", title: "第一段", kind: "text" }],
    });
  });

  test("renders merged content of all session cards and merges the later cards into the primary", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    service.addSelection(runtime.context);
    service.addSelection(runtime.context);
    service.addSelection(runtime.context);

    const result = service.finishSession(runtime.context, {
      cardTemplate: "{{heading}} {{title}}{{#link}} {{link}}{{/link}}\n\n{{content}}",
      cardTitlePolicy: { useContentAsTitle: true, untitledTitle: "无标题卡片" },
    });

    // merge 只加 LinkNote + 设置子卡 groupnoteid，子卡由脑图按 groupnoteid 过滤隐藏，
    // 绝不能删除子卡（删除会使 LinkNote 引用失效，聚合内容与图片全部丢失）
    expect(runtime.notes["note-1"].merged).toEqual(["note-2", "note-3"]);
    expect(runtime.deleted).toEqual([]);
    expect(runtime.notes["note-2"]).toBeDefined();
    expect(runtime.notes["note-3"]).toBeDefined();
    // 立即收尾（标脏/保存 + refreshAfterDBChanged）+ 0.6s/1.2s 两轮通知刷新：
    // RefreshAfterDBChange（object=当前 mindmapView）+ ReloadDigestNotes，最后定位脑图与文档主卡
    expect(runtime.refreshes).toEqual(["nb1"]);
    expect(runtime.dirtyNotebooks).toEqual(["nb1", "nb1", "nb1"]);
    expect(runtime.savedb.count).toBe(3);
    expect(runtime.posts).toHaveLength(4);
    expect(runtime.posts[0]).toMatchObject({
      name: "RefreshAfterDBChange",
      object: runtime.mindmapView,
      userInfo: { topicid: "nb1", note: runtime.notes["note-1"] },
    });
    expect(runtime.posts[1]).toMatchObject({
      name: "ReloadDigestNotes",
      object: null,
      userInfo: { note: runtime.notes["note-1"], command: "modify" },
    });
    expect(runtime.focusCalls).toEqual(["note-1"]);
    expect(runtime.docFocusCalls).toEqual(["note-1"]);
    expect(result).toMatchObject({
      noteId: "note-1",
      link: "marginnote4app://note/note-1",
      fileBaseName: "第一段",
      noteCount: 1,
    });
    expect(result.quote).toMatchObject({
      link: "marginnote4app://note/note-1",
      title: "第一段",
      heading: "##",
    });
    // 内容按所有会话卡片合并，且不因 useContentAsTitle 把摘录文本消费为标题而丢失
    expect(result.quote.content).toContain("第一段摘录文本");
    expect(result.quote.content).toContain("第二段摘录文本");
    expect(result.quote.content).toContain("第三段摘录文本");
    expect(service.getState(runtime.context).active).toBe(false);
  });

  test("keeps the session active when the finished quote has no content", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    runtime.notes["note-1"].excerptText = "";
    service.addSelection(runtime.context);

    expect(() => service.finishSession(runtime.context, {
      cardTitlePolicy: { useContentAsTitle: true, untitledTitle: "无标题卡片" },
    })).toThrow("连续摘录内容为空");
    expect(service.getState(runtime.context).active).toBe(true);
  });

  test("keeps the session active when finishing fails mid-way", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    service.addSelection(runtime.context);
    delete runtime.notes["note-1"];

    expect(() => service.finishSession(runtime.context, {})).toThrow("连续摘录主卡不存在");
    expect(service.getState(runtime.context).active).toBe(true);
  });

  test("injects citekey and offset-adjusted page into the finished quote", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    runtime.setCiteMapping("zhang2020", 10);
    service.startSession(runtime.context);
    service.addSelection(runtime.context);

    const result = service.finishSession(runtime.context, {
      cardTitlePolicy: { useContentAsTitle: true, untitledTitle: "无标题卡片" },
    });

    expect(result.quote.citekey).toBe("zhang2020");
    expect(result.quote.page).toBe("11");
  });

  test("keeps citation fields null when the document has no citekey mapping", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    service.addSelection(runtime.context);

    const result = service.finishSession(runtime.context, {
      cardTitlePolicy: { useContentAsTitle: true, untitledTitle: "无标题卡片" },
    });

    expect(result.quote.citekey).toBeNull();
    expect(result.quote.page).toBeNull();
  });

  test("cancels by deleting every card created in the session", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    service.addSelection(runtime.context);
    service.addSelection(runtime.context);

    const result = service.cancelSession(runtime.context);

    expect(result).toEqual({ cancelled: true, state: { active: false, notebookId: "", primaryNoteId: null, items: [] } });
    expect(runtime.deleted).toEqual(["note-2", "note-1"]);
    expect(runtime.refreshes).toEqual(["nb1"]);
  });

  test("rejects finishing after the notebook switches", () => {
    const runtime = createRuntime();
    const service = runtime.service;
    service.startSession(runtime.context);
    service.addSelection(runtime.context);
    runtime.setNotebookId("nb2");

    expect(() => service.finishSession(runtime.context, {})).toThrow("连续摘录所属学习集已切换");
  });

  test("clears the runtime session when the notebook closes", () => {
    const runtime = createRuntime();
    runtime.service.startSession(runtime.context);
    runtime.service.addSelection(runtime.context);

    runtime.quoteService.handleNotebookClose(runtime.context.addon);

    expect(runtime.service.getState(runtime.context).active).toBe(false);
  });
});
