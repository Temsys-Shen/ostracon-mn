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

function createNote(noteId, title) {
  return {
    noteId,
    noteTitle: title,
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
  const created = [
    createNote("note-1", "第一段"),
    createNote("note-2", "第二段"),
    createNote("note-3", "第三段"),
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
  };
  const documentController = {
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
  const context = vm.createContext({
    console,
    Database: { sharedInstance: () => db },
    Application: {
      sharedInstance: () => ({
        studyController: () => ({
          notebookController: { notebookId },
          readerController: { currentDocumentController: documentController },
        }),
        refreshAfterDBChanged: (nextNotebookId) => refreshes.push(nextNotebookId),
      }),
    },
    UndoManager: {
      sharedInstance: () => ({
        undoGrouping: (_title, _topicId, fn) => fn(),
      }),
    },
    __MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon: {
      loadPrefs: () => ({}),
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
    setNotebookId(value) { notebookId = value; },
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

  test("merges later cards into the primary card and renders that card", () => {
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

    expect(runtime.notes["note-1"].merged).toEqual(["note-2", "note-3"]);
    expect(runtime.deleted).toEqual(["note-2", "note-3"]);
    expect(runtime.notes["note-1"]).toBeDefined();
    expect(runtime.notes["note-2"]).toBeUndefined();
    expect(runtime.notes["note-3"]).toBeUndefined();
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
    expect(result.quote.content).toContain("marginnote4app://note/note-2");
    expect(service.getState(runtime.context).active).toBe(false);
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
