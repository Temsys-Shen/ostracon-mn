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

function createService(notes, title = "学习集") {
  const context = vm.createContext({
    Database: { sharedInstance: () => ({ getNotebookById: () => ({ title, notes }) }) },
  });
  const source = fs.readFileSync(path.join(rootDir, "src/CardSelectionService.js"), "utf8");
  vm.runInContext(source, context, { filename: "CardSelectionService.js" });
  return context.__MN_CARD_SELECTION_SERVICE_MNOstraconAddon;
}

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
