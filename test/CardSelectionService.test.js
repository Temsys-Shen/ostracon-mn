// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function note(noteId, children = []) {
  return { noteId, childNotes: children, comments: [] };
}

function mindmapNode(noteId, frame, children = []) {
  const node = {
    note: { noteId, comments: [] },
    frame,
    parentNode: null,
    childNodes: children,
  };
  children.forEach((child) => {
    child.parentNode = node;
  });
  return node;
}

function createService(notes, title = "学习集") {
  const context = vm.createContext({
    Database: { sharedInstance: () => ({ getNotebookById: () => ({ title, notes }) }) },
    __MN_CARD_CONTENT_SERVICE_MNOstraconAddon: { extractTags: () => [] },
  });
  const source = fs.readFileSync(path.join(rootDir, "src/CardSelectionService.js"), "utf8");
  vm.runInContext(source, context, { filename: "CardSelectionService.js" });
  return context.__MN_CARD_SELECTION_SERVICE_MNOstraconAddon;
}

function createSelectionInfoService(selectedViews) {
  const context = vm.createContext({
    Application: {
      sharedInstance: () => ({
        studyController: () => ({
          notebookController: { mindmapView: { selViewLst: selectedViews } },
        }),
      }),
    },
  });
  const source = fs.readFileSync(path.join(rootDir, "src/CardSelectionService.js"), "utf8");
  vm.runInContext(source, context, { filename: "CardSelectionService.js" });
  return context.__MN_CARD_SELECTION_SERVICE_MNOstraconAddon;
}

describe("CardSelectionService selected-card info", () => {
  test("returns zero counts after all cards are deselected", () => {
    const info = createSelectionInfoService([]).getSelectedCardsInfo({ addon: { window: {} } });

    expect(info).toEqual({
      noteCount: 0,
      imageCount: 0,
      commentCount: 0,
      sourceTitle: "",
      noteIds: [],
    });
  });
});

describe("CardSelectionService card-tree scope", () => {
  test("collects selected cards and all descendants in visual order", () => {
    const firstGrandchild = mindmapNode("first-grandchild", { x: 120, y: 300 });
    const firstChild = mindmapNode("first-child", { x: 100, y: 200 }, [firstGrandchild]);
    const firstRoot = mindmapNode("first-root", { x: 80, y: 100 }, [firstChild]);
    const secondRoot = mindmapNode("second-root", { x: 40, y: 120 });
    const selection = createSelectionInfoService([secondRoot, firstRoot])
      .getScopeSelection({ addon: { window: {} } }, "card-tree").selection;

    expect(selection.flatCards.map(card => card.noteId)).toEqual(["first-root", "second-root", "first-child", "first-grandchild"]);
    expect(selection.treeCards.map(card => card.noteId)).toEqual(["first-root", "first-child", "first-grandchild", "second-root"]);
    expect(selection.treeRoots.map(card => card.noteId)).toEqual(["first-root", "second-root"]);
    expect(selection.treeRoots[0].children[0].children[0].noteId).toBe("first-grandchild");
  });

  test("deduplicates a selected descendant already collected by its parent", () => {
    const child = mindmapNode("child", { x: 80, y: 200 });
    const root = mindmapNode("root", { x: 80, y: 100 }, [child]);
    const selection = createSelectionInfoService([root, child])
      .getScopeSelection({ addon: { window: {} } }, "card-tree").selection;

    expect(selection.flatCards.map(card => card.noteId)).toEqual(["root", "child"]);
    expect(selection.treeRoots).toHaveLength(1);
    expect(selection.treeRoots[0].children[0].noteId).toBe("child");
  });

  test("rejects cyclic card trees", () => {
    const root = mindmapNode("root", { x: 80, y: 100 });
    const child = mindmapNode("child", { x: 80, y: 200 });
    root.childNodes = [child];
    child.parentNode = root;
    child.childNodes = [root];
    root.parentNode = child;

    expect(() => createSelectionInfoService([root]).getScopeSelection({ addon: { window: {} } }, "card-tree"))
      .toThrow("卡片树层级存在循环: root");
  });

  test("rejects unknown scope types", () => {
    expect(() => createSelectionInfoService([]).getScopeSelection({ addon: { window: {} } }, "unknown"))
      .toThrow("未知发送范围: unknown");
  });
});

describe("CardSelectionService notebook scope", () => {
  test("deduplicates an all-notes collection and keeps one three-level tree", () => {
    const grandchild = note("grandchild");
    const child = note("child", [grandchild]);
    const root = note("root", [child]);
    const selection = createService([root, child, grandchild, child]).getScopeSelection({}, "notebook", { notebookId: "nb" }).selection;

    expect(selection.flatCards.map(card => card.noteId)).toEqual(["root", "child", "grandchild"]);
    expect(selection.treeCards.map(card => card.noteId)).toEqual(["root", "child", "grandchild"]);
    expect(selection.treeRoots).toHaveLength(1);
    expect(selection.treeRoots[0].children[0].children[0].noteId).toBe("grandchild");
  });

  test("collects hidden descendants that are absent from notebook.notes", () => {
    const grandchild = note("grandchild");
    grandchild.hidden = true;
    const child = note("child", [grandchild]);
    child.hidden = true;
    const root = note("root", [child]);
    const selection = createService([root]).getScopeSelection({}, "notebook", { notebookId: "nb" }).selection;

    expect(selection.flatCards.map(card => card.noteId)).toEqual(["root", "child", "grandchild"]);
    expect(selection.treeCards.map(card => card.noteId)).toEqual(["root", "child", "grandchild"]);
    expect(selection.treeRoots[0].children[0].children[0].note).toBe(grandchild);
  });

  test("removes Group shadow notes and keeps their target LinkNote comment", () => {
    const group = note("group");
    group.groupNoteId = "target";
    group.hidden = true;
    group.excerptPic = { paint: "group-paint" };
    const target = note("target");
    target.comments = [{ type: "LinkNote", noteid: "group", q_hpic: { paint: "group-paint" }, textFirst: false }];
    const selection = createService([group, target], "弗洛伊德学习集")
      .getScopeSelection({}, "notebook", { notebookId: "nb" }).selection;

    expect(selection.flatCards.map(card => card.noteId)).toEqual(["target"]);
    expect(selection.treeCards.map(card => card.noteId)).toEqual(["target"]);
    expect(selection.flatCards[0].note.comments).toEqual(target.comments);
    expect(selection.fileBaseName).toBe("弗洛伊德学习集");
  });

  test("rejects Group notes whose target is absent", () => {
    const group = note("group");
    group.groupNoteId = "missing";

    expect(() => createService([group]).getScopeSelection({}, "notebook", { notebookId: "nb" }))
      .toThrow("学习集Group卡片目标不在卡片集合中: group=group, target=missing");
  });

  test("keeps independent roots in source order", () => {
    const second = note("second");
    const first = note("first");
    const roots = createService([second, first]).getScopeSelection({}, "notebook", { notebookId: "nb" }).selection.treeRoots;
    expect(roots.map(card => card.noteId)).toEqual(["second", "first"]);
  });

  test("rejects missing note ids", () => {
    expect(() => createService([note("root"), { childNotes: [] }]).getScopeSelection({}, "notebook", { notebookId: "nb" })).toThrow("学习集卡片缺少noteId");
  });

  test("rejects cyclic card hierarchies", () => {
    const first = note("first");
    const second = note("second");
    first.childNotes = [second];
    second.childNotes = [first];
    expect(() => createService([first]).getScopeSelection({}, "notebook", { notebookId: "nb" })).toThrow("学习集卡片层级存在循环");
  });

  test("rejects a card referenced by multiple parents", () => {
    const child = note("child");
    const first = note("first", [child]);
    const second = note("second", [child]);
    expect(() => createService([first, second, child]).getScopeSelection({}, "notebook", { notebookId: "nb" })).toThrow("学习集卡片存在多个上级: child");
  });
});

describe("CardSelectionService database summaries", () => {
  test("uses first text comment as the title and keeps remaining text as comment for untitled cards", () => {
    const root = note("untitled");
    root.comments = [{ type: "TextNote", text: "评论标题\n评论正文第一行\n评论正文第二行" }];

    const cards = createService([root]).listAllCards({}, "nb", { useContentAsTitle: true });

    expect(cards).toMatchObject([{
      id: "untitled",
      title: "评论标题",
      comment: "评论正文第一行\n评论正文第二行",
    }]);
  });

  test("keeps text, html, and text-first link comments in titled database summaries", () => {
    const root = note("titled");
    root.noteTitle = "显式标题";
    root.excerptText = "摘录正文";
    root.comments = [
      { type: "TextNote", text: "普通评论" },
      { type: "HtmlNote", text: "HTML评论" },
      { type: "LinkNote", q_htext: "链接评论", textFirst: true },
    ];

    const cards = createService([root]).listAllCards({}, "nb", { useContentAsTitle: true });

    expect(cards[0]).toMatchObject({
      title: "显式标题",
      comment: "摘录正文\n\n普通评论\n\nHTML评论\n\n链接评论",
    });
  });

  test("does not use linked picture OCR text when LinkNote textFirst is disabled", () => {
    const root = note("linked-picture");
    root.comments = [{ type: "LinkNote", q_hpic: { paint: "image" }, q_htext: "不应显示", textFirst: false }];

    const cards = createService([root]).listAllCards({}, "nb", { useContentAsTitle: true });

    expect(cards[0]).toMatchObject({ title: "", comment: "" });
  });
});
