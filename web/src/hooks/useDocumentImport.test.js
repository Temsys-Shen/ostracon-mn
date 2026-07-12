import { describe, expect, test } from "vitest";
import { buildImportPayload, utf8Base64 } from "./useDocumentImport";

describe("utf8Base64", () => {
  test("preserves Chinese markdown content", () => {
    const source = "# 标题\n正文与图片";
    const encoded = utf8Base64(source);
    const decoded = decodeURIComponent(escape(window.atob(encoded)));
    expect(decoded).toBe(source);
  });
});

describe("buildImportPayload", () => {
  test.each(["create", "append"])("includes the %s operation", (operation) => {
    const payload = buildImportPayload({ title: "文档", path: "Folder/文档.md", mtime: 12 }, "正文", operation);
    expect(payload).toEqual({ operation, title: "文档", markdown: "正文", sourcePath: "Folder/文档.md", mtime: 12 });
  });

  test("rejects an unknown operation", () => {
    expect(() => buildImportPayload({ title: "文档" }, "正文", "replace")).toThrow("不支持的导入操作");
  });
});
