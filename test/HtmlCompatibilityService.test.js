// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COCOA_HTML = `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="Generator" content="Cocoa HTML Writer">
<style type="text/css">
p.p1 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.3px 'LiHei Pro'; color: #000000}
span.s1 {font-family: 'Helvetica'; font-weight: normal; font-style: normal; font-size: 12.32px}
span.s2 {font-family: 'LiHei Pro'; font-weight: normal; font-style: normal; font-size: 12.32px}
span.s3 {font-family: 'LiHei Pro'; font-weight: normal; font-style: normal; font-size: 12.32px; text-decoration: underline ; background-color: #df00ff}
span.s4 {font-family: 'Helvetica-BoldOblique'; font-weight: bold; font-style: italic; font-size: 12.32px; text-decoration: underline ; background-color: #df00ff}
</style>
</head>
<body>
<p class="p1"><span class="s1">阿</span><span class="s2">爸</span><span class="s3">阿</span><span class="s4">爸</span></p>
</body>
</html>`;

function loadService() {
  const context = vm.createContext({ console });
  const filePath = path.join(rootDir, "src/HtmlCompatibilityService.js");
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.__MN_HTML_COMPATIBILITY_SERVICE_MNOstraconAddon;
}

describe("HtmlCompatibilityService", () => {
  test("inlines every Cocoa HTML class style and removes the document wrapper", () => {
    const result = loadService().convertHtml(COCOA_HTML, { noteId: "note", commentIndex: 1 });

    expect(result).toContain('<p style="margin:0.0px 0.0px 0.0px 0.0px;font:12.3px \'LiHei Pro\';color:#000000">');
    expect(result).toContain('<span style="font-family:\'Helvetica\';font-weight:normal;font-style:normal;font-size:12.32px">阿</span>');
    expect(result).toContain("text-decoration:underline;background-color:#df00ff");
    expect(result).toContain("font-family:'Helvetica-BoldOblique';font-weight:bold;font-style:italic");
    expect(result).not.toMatch(/<!DOCTYPE|<html|<head|<style|Generator|class=/i);
  });

  test("applies selector specificity, descendants, children, important, and inline styles", () => {
    const html = `<style>
      .base { color: red; padding: 2px }
      section .base { color: orange }
      section > span.base { color: blue !important; font-size: 13px }
      #target { font-weight: bold }
    </style><section><span id="target" class="base" style="color:green;border:1px solid black">文本</span></section>`;
    const result = loadService().convertHtml(html, { noteId: "cascade", commentIndex: 0 });

    expect(result).toContain('id="target"');
    expect(result).toContain("color:blue !important");
    expect(result).toContain("padding:2px");
    expect(result).toContain("font-size:13px");
    expect(result).toContain("font-weight:bold");
    expect(result).toContain("border:1px solid black");
    expect(result).not.toContain("class=");
  });

  test("preserves body styles, lists, tables, links, breaks, and entities", () => {
    const html = `<html><head><style>body.page {font-family:Helvetica;color:#123456} li.item {margin-left:4px}</style></head><body class="page" data-kind="note"><ul><li class="item">A&amp;B<br></li></ul><table><tr><td><a href="https://example.com">Link</a></td></tr></table></body></html>`;
    const result = loadService().convertHtml(html, { noteId: "structure", commentIndex: 0 });

    expect(result).toContain('<div data-kind="note" style="font-family:Helvetica;color:#123456">');
    expect(result).toContain('<li style="margin-left:4px">A&amp;B<br></li>');
    expect(result).toContain('<table><tr><td><a href="https://example.com">Link</a></td></tr></table>');
  });

  test("keeps ordinary HTML fragments unchanged", () => {
    const fragment = '<p><strong>富文本</strong><br><span style="color:red">红色</span></p>';
    expect(loadService().convertHtml(fragment, { noteId: "fragment", commentIndex: 0 })).toBe(fragment);
  });

  test("reports malformed documents, selectors, and unknown classes", () => {
    const service = loadService();
    expect(() => service.convertHtml('<html><head><style>.x{color:red}</style></head></html>', { noteId: "body", commentIndex: 0 })).toThrow("Cocoa HTML缺少body");
    expect(() => service.convertHtml('<style>span:hover{color:red}</style><span>text</span>', { noteId: "selector", commentIndex: 0 })).toThrow("不支持的HTML样式选择器");
    expect(() => service.convertHtml('<html><head><style>.x{color:red}</style></head><body><span class="missing">text</span></body></html>', { noteId: "class", commentIndex: 0 })).toThrow("HTML样式类未匹配");
  });
});
