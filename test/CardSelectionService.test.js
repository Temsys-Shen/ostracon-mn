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

function createService(notes) {
  const context = vm.createContext({
    Database: { sharedInstance: () => ({ getNotebookById: () => ({ title: "学习集", notes }) }) },
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
    expect(() => createService([first, second]).getScopeSelection({}, "notebook", { notebookId: "nb" })).toThrow("学习集卡片层级存在循环");
  });

  test("rejects a card referenced by multiple parents", () => {
    const child = note("child");
    const first = note("first", [child]);
    const second = note("second", [child]);
    expect(() => createService([first, second, child]).getScopeSelection({}, "notebook", { notebookId: "nb" })).toThrow("学习集卡片存在多个上级: child");
  });
});
