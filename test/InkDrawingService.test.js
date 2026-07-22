// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createDrawingArchive, createInkArchive } from "./helpers/inkFixture.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadService() {
  const context = vm.createContext({ Uint8Array, DataView, ArrayBuffer, console });
  ["src/FreehandStrokeService.js", "src/DrawingArchiveService.js", "src/InkDrawingService.js"].forEach((relativePath) => {
    const filePath = path.join(rootDir, relativePath);
    vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  });
  return context.__MN_INK_DRAWING_SERVICE_MNOstraconAddon;
}

function decodeSvg(result) {
  return Buffer.from(result.dataURI.split(",")[1], "base64").toString("utf8");
}

describe("InkDrawingService", () => {
  test("renders transformed pressure-sensitive pen strokes with their ink color", () => {
    const result = loadService().renderDrawingDataURI(createInkArchive({
      inks: [{ type: "com.apple.ink.pen", width: 4, color: { r: 1, g: 0.25, b: 0, a: 0.8 } }],
    }));
    const svg = decodeSvg(result);

    expect(result.strokeCount).toBe(1);
    expect(result.bounds.width).toBeGreaterThan(0);
    expect(result.bounds.height).toBeGreaterThan(0);
    expect(svg).toContain('fill="rgba(255,64,0,0.8)"');
    expect(svg).toContain(" Z");
    expect(svg).not.toContain('stroke="#1d1d1f"');
    expect(svg).toContain('fill="white"');
  });

  test("uses each stroke ink index and marker transparency", () => {
    const archive = createInkArchive({
      inks: [
        { type: "com.apple.ink.pen", width: 3, color: { r: 1, g: 0, b: 0, a: 1 } },
        { type: "com.apple.ink.marker", width: 5, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      strokes: [
        { inkIndex: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], transform: {} },
        { inkIndex: 1, points: [{ x: 0, y: 20 }, { x: 20, y: 20 }], transform: {} },
      ],
    });
    const svg = decodeSvg(loadService().renderDrawingDataURI(archive));

    expect(svg).toContain('fill="rgba(255,0,0,1)"');
    expect(svg).toContain('fill="rgba(0,0,255,0.4)"');
  });

  test("renders stored ink widths at the calibrated MarginNote scale", () => {
    const result = loadService().renderDrawingDataURI(createInkArchive({
      inks: [{ type: "com.apple.ink.pen", width: 4, color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokes: [{
        inkIndex: 0,
        points: [{ x: 0, y: 0, pressure: 0.5 }, { x: 40, y: 0, pressure: 0.5 }],
        transform: {},
      }],
    }));

    expect(result.bounds.height).toBeGreaterThan(3.2);
    expect(result.bounds.height).toBeLessThan(3.5);

    const dot = loadService().renderDrawingDataURI(createInkArchive({
      inks: [{ type: "com.apple.ink.pen", width: 4, color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokes: [{ inkIndex: 0, points: [{ x: 10, y: 10 }], pointStride: 8, transform: {} }],
    }));
    expect(dot.bounds.width).toBeCloseTo(5, 5);
    expect(dot.bounds.height).toBeCloseTo(5, 5);
  });

  test("renders final field 11 fragments instead of the erased centerline", () => {
    const archive = createInkArchive({
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      transform: {},
      fragments: [
        { points: [{ x: 0, y: -2 }, { x: 20, y: -2 }, { x: 20, y: 2 }, { x: 0, y: 2 }] },
        { points: [{ x: 80, y: -2 }, { x: 100, y: -2 }, { x: 100, y: 2 }, { x: 80, y: 2 }] },
      ],
    });
    const result = loadService().renderDrawingDataURI(archive);
    const svg = decodeSvg(result);

    expect(result.strokeCount).toBe(1);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain("M 0.00 -2.00 L 20.00 -2.00");
    expect(svg).toContain("M 80.00 -2.00 L 100.00 -2.00");
    expect(svg).not.toContain("M 0.00 0.00");
  });

  test("supports verified extended point record strides", () => {
    [8, 12, 14, 16, 18, 20, 22, 30, 48].forEach((pointStride) => {
      const result = loadService().renderDrawingDataURI(createInkArchive({ pointStride }));
      expect(result.strokeCount).toBe(1);
      expect(result.bounds.width).toBeGreaterThan(0);
    });
  });

  test("selects one drawing2 payload from keyed archives", () => {
    const drawing1 = createInkArchive();
    const drawing2 = createInkArchive({
      strokes: [
        { inkIndex: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
        { inkIndex: 0, points: [{ x: 0, y: 20 }, { x: 20, y: 20 }] },
      ],
    });
    const result = loadService().renderDrawingDataURI(createDrawingArchive({ drawing1, drawing2 }));

    expect(result.strokeCount).toBe(2);
    expect(decodeSvg(result).match(/<path /g)).toHaveLength(2);
  });

  test("renders one drawing1 payload when keyed archives have no drawing2", () => {
    const result = loadService().renderDrawingDataURI(createDrawingArchive({ drawing1: createInkArchive() }));

    expect(result.strokeCount).toBe(1);
    expect(decodeSvg(result).match(/<path /g)).toHaveLength(1);
  });

  test("rejects malformed archives and invalid ink references", () => {
    const service = loadService();
    expect(() => service.renderDrawingDataURI("%%%")) .toThrow("invalid-base64");
    expect(() => service.renderDrawingDataURI(Buffer.from("bad-header").toString("base64"))).toThrow("invalid-magic-header");
    expect(() => service.renderDrawingDataURI(Buffer.from([119, 114, 100, 0, 0, 0, 0, 0]).toString("base64"))).toThrow("unsupported-wrd-header");
    expect(() => service.renderDrawingDataURI(Buffer.from("bplist00").toString("base64"))).toThrow("truncated-bplist-trailer");
    expect(() => service.renderDrawingDataURI(createDrawingArchive({}))).toThrow("missing-keyed-archive-drawing-data");
    expect(() => service.renderDrawingDataURI(createInkArchive({ strokes: [{ inkIndex: 1 }] }))).toThrow("invalid-ink-index-0-1");
    expect(() => service.renderDrawingDataURI(createInkArchive({ pointStride: 7, points: [{ x: 1, y: 2 }] }))).toThrow("invalid-point-stride");
  });
});
