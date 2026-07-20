// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createInkArchive } from "./helpers/inkFixture.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSource(context, relativePath) {
  const filePath = path.join(rootDir, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

function createRuntime(mediaById = {}, logs = [], sketchByKey = {}) {
  const context = vm.createContext({
    console: { log: (...args) => logs.push(args.join(" ")), warn: console.warn, error: console.error },
    Database: {
      sharedInstance() {
        return {
          getMediaByHash(mediaId) {
            if (!Object.prototype.hasOwnProperty.call(mediaById, mediaId)) return undefined;
            return { base64Encoding: () => mediaById[mediaId] };
          },
          getSketchNoteForMindMapFocusNoteId(notebookId, noteId) {
            const value = sketchByKey[`${notebookId}:${noteId}`];
            if (value instanceof Error) throw value;
            return value;
          },
        };
      },
    },
    __MN_CARD_SELECTION_SERVICE_MNOstraconAddon: {
      arrayFromNSArray(value) {
        return Array.isArray(value) ? value : [];
      },
    },
  });

  loadSource(context, "src/OstraconUtils.js");
  loadSource(context, "src/FreehandStrokeService.js");
  loadSource(context, "src/InkDrawingService.js");
  loadSource(context, "src/CardContentService.js");
  loadSource(context, "src/MarkdownExportService.js");
  loadSource(context, "src/CanvasExportService.js");
  return context;
}

function selectionFor(note) {
  const card = {
    note,
    noteId: note.noteId,
    selectionIndex: 0,
    x: 0,
    y: 0,
    depth: 0,
    children: [],
  };
  return { flatCards: [card], treeRoots: [card], treeCards: [card] };
}

function rootCard(note, index) {
  return {
    note,
    noteId: note.noteId,
    selectionIndex: index,
    x: 0,
    y: index,
    depth: 0,
    children: [],
  };
}

function multiRootSelection(notes) {
  const roots = notes.map(rootCard);
  return { flatCards: roots, treeRoots: roots, treeCards: roots };
}

describe("CardContentService", () => {
  test("uses the first text line as title and preserves duplicate PaintNote comments", () => {
    const context = createRuntime({ media: "cG5n" });
    const note = {
      noteId: "note-1",
      noteTitle: "",
      excerptText: "OCR文本不应出现",
      excerptPic: { paint: "excerpt-media" },
      comments: [
        { type: "TextNote", text: "第一条作为标题", markdown: true },
        { type: "TextNote", text: "第二条正文", markdown: true },
        { type: "PaintNote", paint: "media" },
        { type: "PaintNote", paint: "media" },
      ],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;
    const canvas = JSON.parse(context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selectionFor(note), {}).canvas);

    expect(content.title).toBe("第一条作为标题");
    expect(content.commentText).toBe("第二条正文");
    expect(content.imageCount).toBe(2);
    expect(markdown.match(/data:image\/png;base64,cG5n/g)).toHaveLength(2);
    expect(canvas.nodes[0].text.match(/data:image\/png;base64,cG5n/g)).toHaveLength(2);
    expect(markdown).toContain("## [第一条作为标题](marginnote4app://note/note-1)");
    expect(markdown).toContain("第二条正文");
    expect(markdown).not.toContain("OCR文本不应出现");
    expect(canvas.nodes[0].text).not.toContain("OCR文本不应出现");
  });

  test("puts the MarginNote backlink on the card heading", () => {
    const context = createRuntime();
    const note = {
      noteId: "linked-card",
      noteTitle: "带[括号]标题",
      comments: [{ type: "TextNote", text: "正文" }],
    };

    const linked = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), { includeBacklinks: true }).markdown;
    const plain = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {
      includeBacklinks: false,
      cardTemplate: "{{heading}} {{title}}\n\n{{content}}",
    }).markdown;

    expect(linked).toContain("## [带[括号]标题](marginnote4app://note/linked-card)");
    expect(linked).not.toContain("MarginNote Links");
    expect(plain).toContain("## 带[括号]标题");
    expect(plain).not.toContain("marginnote4app://note/linked-card");
  });

  test("uses the explicit link variable and rejects the removed link filter", () => {
    const context = createRuntime();
    const note = { noteId: "explicit-link", noteTitle: "标题", comments: [{ type: "TextNote", text: "正文" }] };
    const service = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon;
    const markdown = service.buildMarkdown(selectionFor(note), { cardTemplate: "{{heading}} [{{title}}]({{link}})\n\n{{content}}" }).markdown;
    expect(markdown).toContain("## [标题](marginnote4app://note/explicit-link)");
    expect(() => service.buildMarkdown(selectionFor(note), { cardTemplate: "{{title|link}}" })).toThrow("未知卡片模板过滤器: link");
  });

  test("keeps every text comment when noteTitle is explicit", () => {
    const context = createRuntime();
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "note-2",
      noteTitle: "显式标题",
      comments: [
        { type: "TextNote", text: "第一条" },
        { type: "TextNote", text: "第二条" },
      ],
    });

    expect(content.title).toBe("显式标题");
    expect(content.commentText).toBe("第一条\n\n第二条");
    expect(content.titleSourceIndex).toBe(-1);
  });

  test("builds readable file names from noteTitle, excerptText, and Untitled", () => {
    const context = createRuntime();
    const service = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon;
    const excerpt = "这是一段没有卡片标题的摘录文本，用于生成可读文件名称，并且超过四十个字符后应当被截断";

    expect(service.resolveFileBaseName({ noteTitle: "原始卡片标题", excerptText: "忽略" })).toBe("原始卡片标题");
    expect(service.resolveFileBaseName({ noteTitle: "", excerptText: `  ${excerpt}\n第二行  ` })).toBe(`${excerpt} 第二行`.slice(0, 40).trim());
    expect(service.resolveFileBaseName({ noteTitle: "", excerptText: "" })).toBe("Untitled");

    const note = { noteId: "filename-card", noteTitle: "", excerptText: "摘录文件名", comments: [{ type: "TextNote", text: "评论标题" }] };
    const selection = selectionFor(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, {});
    const canvas = context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, {});
    expect(markdown.fileBaseName).toBe("摘录文件名");
    expect(canvas.fileBaseName).toBe("摘录文件名");
  });

  test("uses the earliest root card as tree Markdown and Canvas file name", () => {
    const context = createRuntime();
    const newer = { noteId: "newer-root", noteTitle: "后创建根", createDate: new Date("2026-07-12T00:00:00+08:00"), comments: [] };
    const older = { noteId: "older-root", noteTitle: "先创建根", createDate: new Date("2026-07-10T00:00:00+08:00"), comments: [] };
    const selection = multiRootSelection([newer, older]);

    const treeMarkdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, { mode: "tree" });
    const canvas = context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, {});

    expect(treeMarkdown.fileBaseName).toBe("先创建根");
    expect(canvas.fileBaseName).toBe("先创建根");
  });

  test("rejects duplicate Canvas node ids and relations", () => {
    const context = createRuntime();
    const childNote = { noteId: "child", noteTitle: "子卡片", comments: [] };
    const rootNote = { noteId: "root", noteTitle: "根卡片", comments: [] };
    const child = rootCard(childNote, 1);
    const root = { ...rootCard(rootNote, 0), children: [child, child] };

    expect(() => context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas({ flatCards: [root, root], treeRoots: [root], treeCards: [root, child] }, {})).toThrow("Canvas包含重复节点: root");
    expect(() => context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas({ flatCards: [root, child], treeRoots: [root], treeCards: [root, child] }, {})).toThrow("Canvas包含重复关系: root->child");
  });

  test("keeps flat Markdown file name based on the first card", () => {
    const context = createRuntime();
    const newer = { noteId: "newer-root", noteTitle: "平铺首卡", createDate: new Date("2026-07-12T00:00:00+08:00"), comments: [] };
    const older = { noteId: "older-root", noteTitle: "更早根", createDate: new Date("2026-07-10T00:00:00+08:00"), comments: [] };
    const selection = multiRootSelection([newer, older]);

    const flatMarkdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, { mode: "flat" });

    expect(flatMarkdown.fileBaseName).toBe("平铺首卡");
  });

  test("keeps root order when root create dates are equal", () => {
    const context = createRuntime();
    const createdAt = new Date("2026-07-10T00:00:00+08:00");
    const first = { noteId: "first-root", noteTitle: "同时间第一根", createDate: createdAt, comments: [] };
    const second = { noteId: "second-root", noteTitle: "同时间第二根", createDate: createdAt, comments: [] };
    const selection = multiRootSelection([first, second]);

    const treeMarkdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selection, { mode: "tree" });
    const canvas = context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selection, {});

    expect(treeMarkdown.fileBaseName).toBe("同时间第一根");
    expect(canvas.fileBaseName).toBe("同时间第一根");
  });

  test("keeps the remaining lines of the title comment in place", () => {
    const context = createRuntime({ before: "YmVmb3Jl" });
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "note-3",
      comments: [
        { type: "PaintNote", paint: "before" },
        { type: "TextNote", text: "标题行\n正文一\n正文二", markdown: true },
        { type: "UnknownNote", text: "忽略我" },
        { type: "TextNote", text: "后续正文" },
      ],
    });

    expect(content.title).toBe("标题行");
    expect(content.comments.map(comment => comment.type)).toEqual(["image", "text", "text"]);
    expect(content.commentText).toBe("正文一\n正文二\n\n后续正文");
  });

  test("reports malformed and missing PaintNote media with card context", () => {
    const context = createRuntime();
    const service = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon;

    expect(() => service.parseNote({ noteId: "missing-paint", comments: [{ type: "PaintNote" }] }))
      .toThrow("PaintNote缺少paint和drawing: noteId=missing-paint, commentIndex=0");

    const missingMedia = { noteId: "missing-media", comments: [{ type: "PaintNote", paint: "media-404" }] };
    expect(() => context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(missingMedia), {}))
      .toThrow("noteId=missing-media, source=paintNote, commentIndex=0, mediaId=media-404");

    const missingDrawing = { noteId: "missing-drawing", comments: [{ type: "PaintNote", drawing: "drawing-404" }] };
    expect(() => service.parseNote(missingDrawing))
      .toThrow("手写媒体读取失败: noteId=missing-drawing, source=paintNoteDrawing, commentIndex=0, mediaId=drawing-404");

    const invalidContext = createRuntime({ invalid: "%%%" });
    expect(() => invalidContext.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "invalid-drawing",
      comments: [{ type: "PaintNote", drawing: "invalid" }],
    })).toThrow("手写解析失败: noteId=invalid-drawing, source=paintNoteDrawing, commentIndex=0, mediaId=invalid");
  });

  test("renders drawing PaintNote comments as ordered SVG handwriting", () => {
    const drawing = createInkArchive();
    const context = createRuntime({ paint: "cGFpbnQ=", drawing, sketch: drawing }, [], {
      "book:paint-drawing": { comments: [{ drawing: "sketch" }] },
    });
    const note = {
      noteId: "paint-drawing",
      notebookId: "book",
      noteTitle: "手写卡片",
      comments: [
        { type: "TextNote", text: "前文" },
        { type: "PaintNote", paint: "paint", drawing: "drawing" },
        { type: "TextNote", text: "后文" },
      ],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;

    expect(content.comments.map(item => item.source || item.type)).toEqual([
      "text",
      "paintNote",
      "paintNoteDrawing",
      "text",
      "sketchDrawing",
    ]);
    expect(content.comments[2].strokeCount).toBe(1);
    expect(content.imageCount).toBe(3);
    expect(content.hasHandwriting).toBe(true);
    expect(markdown.indexOf("data:image/png;base64,cGFpbnQ=")).toBeLessThan(markdown.indexOf("data:image/svg+xml;base64,"));

    const drawingOnly = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "drawing-only",
      comments: [{ type: "PaintNote", drawing: "drawing" }],
    });
    expect(drawingOnly.comments.map(item => item.source)).toEqual(["paintNoteDrawing"]);
    expect(drawingOnly.comments[0].mimeType).toBe("svg+xml");
  });

  test("returns identical Markdown for MN send and OB fetch commands", () => {
    const context = createRuntime(
      { shared: "U0hBUkVE", sketch: createInkArchive() },
      [],
      { "notebook-4:note-4": { comments: [{ drawing: "sketch" }] } },
    );
    const note = {
      noteId: "note-4",
      notebookId: "notebook-4",
      comments: [
        { type: "TextNote", text: "标题" },
        { type: "TextNote", text: "正文 ![图](marginnote4app://markdownimg/png/shared)" },
      ],
    };
    const selection = selectionFor(note);
    Object.assign(context.__MN_CARD_SELECTION_SERVICE_MNOstraconAddon, {
      getScopeSelection() { return { id: "selection", title: "选中卡片", selection }; },
      getCardsByIds() { return selection; },
      listCardsByIds() { return [{ id: note.noteId, title: "标题", comment: "正文" }]; },
    });
    context.__MN_BRIDGE_COMMANDS_PERSISTENCE_MNOstraconAddon = { loadPrefs: () => ({}) };
    loadSource(context, "src/BridgeCommandsContent.js");

    const commands = context.__MN_BRIDGE_COMMANDS_CONTENT_MNOstraconAddon;
    const sent = commands.previewScopeMarkdown({}, { scope: "selection" });
    const fetched = commands.fetchCards({}, { cardIds: [note.noteId], format: "markdown" });

    expect(sent.markdown).toBe(fetched.markdown);
    expect(sent.markdown).toContain("正文");
    expect(sent.markdown).toContain("data:image/png;base64,U0hBUkVE");
    expect(sent.markdown).toContain("data:image/svg+xml;base64,");
  });

  test("uses the image excerpt instead of OCR text when textFirst is disabled", () => {
    const context = createRuntime({ excerpt: "ZXhjZXJwdA==", paint: "cGFpbnQ=" });
    const note = {
      noteId: "excerpt-first",
      noteTitle: "显式标题",
      excerptPic: { paint: "excerpt" },
      excerptText: "不应出现",
      textFirst: false,
      comments: [
        { type: "TextNote", text: "正文" },
        { type: "PaintNote", paint: "paint" },
      ],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;

    expect(content.comments.map(item => item.source || item.type)).toEqual(["excerptPic", "text", "paintNote"]);
    expect(markdown.indexOf("ZXhjZXJwdA==")).toBeLessThan(markdown.indexOf("正文"));
    expect(markdown).not.toContain("不应出现");
    expect(content.hasImage).toBe(true);
    expect(content.hasHandwriting).toBe(true);

    const excerptOnly = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "excerpt-only",
      excerptPic: { paint: "excerpt" },
      excerptText: "不应作为标题或正文",
      comments: [],
    });
    expect(excerptOnly.title).toBe("无标题卡片");
    expect(excerptOnly.commentText).toBe("");
  });

  test("keeps a text excerpt before comments when the card has no excerpt image", () => {
    const context = createRuntime();
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "excerpt-text",
      noteTitle: "显式标题",
      excerptText: "摘录正文",
      excerptTextMarkdown: 1,
      comments: [{ type: "TextNote", text: "后续评论" }],
    });

    expect(content.title).toBe("显式标题");
    expect(content.commentText).toBe("摘录正文\n\n后续评论");
    expect(content.comments).toEqual([
      { type: "text", text: "摘录正文", markdown: true, index: -1 },
      { type: "text", text: "后续评论", markdown: false, index: 0 },
    ]);

    const excerptTitle = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "excerpt-title",
      excerptText: "摘录标题\n## 摘录正文",
      excerptTextMarkdown: 1,
      comments: [],
    });
    expect(excerptTitle.title).toBe("摘录标题");
    expect(excerptTitle.commentText).toBe("## 摘录正文");
  });

  test("preserves LinkNote excerpts between the card excerpt and later comments", () => {
    const context = createRuntime();
    const note = {
      noteId: "excerpt-with-comments",
      noteTitle: "标题1",
      excerptText: "文本1",
      excerptTextMarkdown: true,
      comments: [
        {
          type: "LinkNote",
          q_htext: ".(2024N123B)HMG-CoA还原酶的别构抑制剂是A.乙酰CoAB.脂肪酰CoA",
          noteid: "49F9D8C5-5CB8-4FCE-90C8-DEBBF4C7D76A",
          markdown: false,
        },
        { type: "TextNote", text: "文本2", markdown: true },
      ],
    };
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;
    const canvas = JSON.parse(context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selectionFor(note), {}).canvas);

    expect(content.title).toBe("标题1");
    expect(content.commentText).toBe("文本1\n\n.(2024N123B)HMG-CoA还原酶的别构抑制剂是A.乙酰CoAB.脂肪酰CoA\n\n文本2");
    expect(markdown.indexOf("文本1")).toBeLessThan(markdown.indexOf("文本2"));
    expect(markdown).toContain("HMG-CoA还原酶");
    expect(canvas.nodes[0].text.indexOf("文本1")).toBeLessThan(canvas.nodes[0].text.indexOf("文本2"));
    expect(canvas.nodes[0].text).toContain("HMG-CoA还原酶");
  });

  test("uses OCR text instead of an excerpt image when textFirst is enabled", () => {
    const context = createRuntime({ excerpt: "ZXhjZXJwdA==" });
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "ocr-excerpt",
      noteTitle: "OCR卡片",
      excerptPic: { paint: "excerpt" },
      excerptText: "可搜索的OCR文本",
      textFirst: true,
      comments: [],
    });

    expect(content.comments).toEqual([{ type: "text", text: "可搜索的OCR文本", markdown: false, index: -1 }]);
    expect(content.commentText).toBe("可搜索的OCR文本");
    expect(content.hasImage).toBe(false);
  });

  test("uses LinkNote images instead of OCR text when the LinkNote textFirst is disabled", () => {
    const drawing = createInkArchive();
    const context = createRuntime({ "linked-image": "TElOS0VE", "linked-drawing": drawing });
    const note = {
      noteId: "linked-image-note",
      noteTitle: "图片摘录",
      comments: [{
        type: "LinkNote",
        noteid: "26647D2E-197A-452B-B07E-6D4285C42926",
        q_hpic: { paint: "linked-image", drawing: "linked-drawing" },
        q_htext: "不应导出的OCR文字",
        textFirst: false,
        markdown: false,
      }],
    };
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;
    const canvas = JSON.parse(context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selectionFor(note), {}).canvas);

    expect(content.comments.map(item => item.source || item.type)).toEqual(["linkNote", "linkNoteDrawing"]);
    expect(content.commentText).toBe("");
    expect(content.hasImage).toBe(true);
    expect(content.hasHandwriting).toBe(true);
    expect(content.comments[1].strokeCount).toBe(1);
    expect(markdown).toContain("data:image/png;base64,TElOS0VE");
    expect(markdown.indexOf("data:image/png;base64,TElOS0VE")).toBeLessThan(markdown.indexOf("data:image/svg+xml;base64,"));
    expect(markdown).not.toContain("不应导出的OCR文字");
    expect(canvas.nodes[0].text).toContain("data:image/png;base64,TElOS0VE");
    expect(canvas.nodes[0].text).toContain("data:image/svg+xml;base64,");
    expect(canvas.nodes[0].text).not.toContain("不应导出的OCR文字");

    const drawingOnly = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "linked-drawing-only",
      comments: [{ type: "LinkNote", q_hpic: { drawing: "linked-drawing" }, textFirst: false }],
    });
    expect(drawingOnly.comments.map(item => item.source)).toEqual(["linkNoteDrawing"]);

    expect(() => context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "linked-fields-missing",
      comments: [{ type: "LinkNote", q_hpic: {}, textFirst: false }],
    })).toThrow("LinkNote.q_hpic缺少paint和drawing: noteId=linked-fields-missing, commentIndex=0");

    expect(() => context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "linked-drawing-missing",
      comments: [{ type: "LinkNote", q_hpic: { drawing: "missing" }, textFirst: false }],
    })).toThrow("手写媒体读取失败: noteId=linked-drawing-missing, source=linkNoteDrawing, commentIndex=0, mediaId=missing");
  });

  test("converts PNG and JPEG markdown images in place without deduplication", () => {
    const context = createRuntime({ png: "UE5H", jpeg: "SlBFRw==" });
    const note = {
      noteId: "inline-images",
      noteTitle: "图片测试",
      comments: [{
        type: "TextNote",
        markdown: true,
        text: "前文 ![甲](marginnote4app://markdownimg/png/png) 中段 ![乙](marginnote4app://markdownimg/jpeg/jpeg) 后文 ![重复](marginnote4app://markdownimg/png/png)",
      }],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;
    const canvas = JSON.parse(context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selectionFor(note), {}).canvas);

    expect(content.comments.map(item => item.type)).toEqual(["text", "image", "text", "image", "text", "image"]);
    expect(content.commentText).toBe("前文  中段  后文");
    expect(content.imageCount).toBe(3);
    expect(markdown.match(/data:image\/png;base64,UE5H/g)).toHaveLength(2);
    expect(markdown).toContain("data:image/jpeg;base64,SlBFRw==");
    expect(markdown).not.toContain("marginnote4app://markdownimg");
    expect(canvas.nodes[0].text).not.toContain("marginnote4app://markdownimg");
  });

  test("keeps a title-line image while excluding the title text from the body", () => {
    const context = createRuntime({ png: "UE5H" });
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "title-image",
      comments: [{
        type: "TextNote",
        text: "标题 ![图](marginnote4app://markdownimg/png/png)\n正文",
      }],
    });

    expect(content.title).toBe("标题");
    expect(content.commentText).toBe("正文");
    expect(content.comments.map(item => item.type)).toEqual(["image", "text"]);
  });

  test("does not convert bare markdownimg URLs or ordinary Markdown links", () => {
    const context = createRuntime();
    const text = "裸地址 marginnote4app://markdownimg/png/png 和 [普通链接](https://example.com)";
    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "links",
      noteTitle: "链接",
      comments: [{ type: "TextNote", text, markdown: true }],
    });

    expect(content.commentText).toBe(text);
    expect(content.imageCount).toBe(0);
    expect(content.comments).toEqual([{ type: "text", text, markdown: true, index: 0 }]);
  });

  test("logs and skips missing excerpt and inline media while preserving later content", () => {
    const logs = [];
    const context = createRuntime({ valid: "VkFMSUQ=" }, logs);
    const note = {
      noteId: "missing-lenient-media",
      noteTitle: "容错",
      excerptPic: { paint: "missing-excerpt" },
      comments: [{
        type: "TextNote",
        text: "前 ![缺失](marginnote4app://markdownimg/png/missing-inline) 后 ![有效](marginnote4app://markdownimg/png/valid) 末",
      }],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    expect(content.comments.map(item => item.type)).toEqual(["text", "text", "image", "text"]);
    expect(content.imageCount).toBe(1);
    expect(content.hasImage).toBe(true);
    expect(content.hasHandwriting).toBe(false);
    expect(logs.some(line => line.includes("noteId=missing-lenient-media") && line.includes("source=excerptPic") && line.includes("mediaId=missing-excerpt"))).toBe(true);
    expect(logs.some(line => line.includes("source=textComment") && line.includes("commentIndex=0") && line.includes("mediaId=missing-inline"))).toBe(true);
  });

  test("appends the first associated sketch drawing after all comments", () => {
    const drawing = createInkArchive();
    const context = createRuntime(
      { sketch: drawing, ignored: "invalid" },
      [],
      {
        "notebook-1:sketch-card": {
          comments: [{ drawing: "sketch" }, { drawing: "ignored" }],
        },
      },
    );
    const note = {
      noteId: "sketch-card",
      notebookId: "notebook-1",
      noteTitle: "手写卡片",
      comments: [{ type: "TextNote", text: "正文" }],
    };

    const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote(note);
    const markdown = context.__MN_MARKDOWN_EXPORT_SERVICE_MNOstraconAddon.buildMarkdown(selectionFor(note), {}).markdown;
    const canvas = JSON.parse(context.__MN_CANVAS_EXPORT_SERVICE_MNOstraconAddon.buildCanvas(selectionFor(note), {}).canvas);

    expect(content.comments.map(item => item.source || item.type)).toEqual(["text", "sketchDrawing"]);
    expect(content.commentText).toBe("正文");
    expect(content.imageCount).toBe(1);
    expect(content.hasImage).toBe(true);
    expect(content.hasHandwriting).toBe(true);
    expect(content.comments[1].strokeCount).toBe(1);
    expect(content.comments[1].mediaId).toBe("sketch");
    expect(markdown.indexOf("正文")).toBeLessThan(markdown.indexOf("data:image/svg+xml;base64,"));
    expect(canvas.nodes[0].text).toContain("data:image/svg+xml;base64,");
  });

  test("ignores absent sketch data and logs query, media, and parser failures", () => {
    const logs = [];
    const context = createRuntime(
      { invalid: "not-base64" },
      logs,
      {
        "nb:no-comments": { comments: [] },
        "nb:no-drawing": { comments: [{ text: "none" }, { drawing: "ignored" }] },
        "nb:missing-media": { comments: [{ drawing: "missing" }] },
        "nb:invalid-archive": { comments: [{ drawing: "invalid" }] },
        "nb:query-error": new Error("query failed"),
      },
    );

    ["no-comments", "no-drawing", "missing-media", "invalid-archive", "query-error"].forEach(noteId => {
      const content = context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
        noteId,
        notebookId: "nb",
        noteTitle: "标题",
        comments: [],
      });
      expect(content.hasHandwriting).toBe(false);
    });

    context.__MN_CARD_CONTENT_SERVICE_MNOstraconAddon.parseNote({
      noteId: "invalid-archive",
      notebookId: "nb",
      noteTitle: "标题",
      comments: [],
    });

    expect(logs.some(line => line.includes("noteId=missing-media") && line.includes("drawing=missing") && line.includes("stage=media"))).toBe(true);
    expect(logs.some(line => line.includes("noteId=invalid-archive") && line.includes("drawing=invalid") && line.includes("stage=parse"))).toBe(true);
    expect(logs.some(line => line.includes("noteId=query-error") && line.includes("stage=query"))).toBe(true);
    expect(logs.filter(line => line.includes("noteId=invalid-archive") && line.includes("stage=parse"))).toHaveLength(1);
    expect(logs.some(line => line.includes("drawing=ignored"))).toBe(false);
  });
});
