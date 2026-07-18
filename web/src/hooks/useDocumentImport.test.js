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
    const content = { contentMode: "markdown", markdown: "正文", html: "", plainText: "", htmlSize: null };
    const payload = buildImportPayload({ title: "文档", path: "Folder/文档.md", mtime: 12 }, content, operation);
    expect(payload).toEqual({ operation, contentMode: "markdown", title: "文档", markdown: "正文", html: "", plainText: "", htmlSize: null, sourcePath: "Folder/文档.md", mtime: 12 });
  });

  test("includes rendered HTML fields for readonly creation", () => {
    const content = { contentMode: "html", markdown: "正文", html: "<p>正文</p>", plainText: "正文", htmlSize: { width: 640, height: 480 } };
    expect(buildImportPayload({ title: "文档", path: "文档.md", mtime: 12 }, content, "create")).toMatchObject(content);
  });

  test("keeps readonly mode for append operations", () => {
    const content = { contentMode: "html", markdown: "正文", html: "<p>正文</p>", plainText: "正文", htmlSize: { width: 640, height: 480 } };
    expect(buildImportPayload({ title: "文档", path: "文档.md", mtime: 12 }, content, "append").contentMode).toBe("html");
  });

  test("rejects an unknown operation", () => {
    expect(() => buildImportPayload({ title: "文档" }, { contentMode: "markdown", markdown: "正文" }, "replace")).toThrow("不支持的导入操作");
  });
});
