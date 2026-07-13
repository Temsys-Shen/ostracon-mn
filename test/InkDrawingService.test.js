// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { createInkArchive } from "./helpers/inkFixture.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadService() {
  const context = vm.createContext({ Uint8Array, DataView, ArrayBuffer, console });
  const filePath = path.join(rootDir, "src/InkDrawingService.js");
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.__MN_INK_DRAWING_SERVICE_MNOstraconAddon;
}

describe("InkDrawingService", () => {
  test("decodes transformed Apple Ink points and renders an SVG DataURL", () => {
    const result = loadService().renderDrawingDataURI(createInkArchive());
    const svg = Buffer.from(result.dataURI.split(",")[1], "base64").toString("utf8");

    expect(result.strokeCount).toBe(1);
    expect(result.bounds).toEqual({ x: 11, y: 22, width: 2, height: 2 });
    expect(svg).toContain('viewBox="-19.0 -8.0 62.0 62.0"');
    expect(svg).toContain('d="M 11.00 22.00 L 13.00 24.00"');
    expect(svg).toContain('stroke="#1d1d1f" stroke-width="3"');
    expect(svg).toContain('fill="white"');
  });

  test("supports extended point records whose stride is not divisible by 12", () => {
    const result = loadService().renderDrawingDataURI(createInkArchive([], 14));
    expect(result.strokeCount).toBe(1);
    expect(result.bounds).toEqual({ x: 11, y: 22, width: 2, height: 2 });
  });

  test("uses the declared point count for extended 48-byte point records", () => {
    const result = loadService().renderDrawingDataURI(createInkArchive([], 48));
    const svg = Buffer.from(result.dataURI.split(",")[1], "base64").toString("utf8");
    expect(result.bounds).toEqual({ x: 11, y: 22, width: 2, height: 2 });
    expect(svg).toContain('d="M 11.00 22.00 L 13.00 24.00"');
  });

  test("rejects malformed archives with explicit parser errors", () => {
    const service = loadService();
    expect(() => service.renderDrawingDataURI("%%%")).toThrow("invalid-base64");
    expect(() => service.renderDrawingDataURI(Buffer.from("bad-header").toString("base64"))).toThrow("invalid-magic-header");
    expect(() => service.renderDrawingDataURI(Buffer.from([119, 114, 100, 0, 0, 0, 42]).toString("base64"))).toThrow();
    expect(() => service.renderDrawingDataURI(Buffer.from([119, 114, 100, 0, 0, 0]).toString("base64"))).toThrow("no-valid-strokes");
  });
});
