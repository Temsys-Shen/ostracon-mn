import { describe, expect, test } from "vitest";
import { calculateCaptureBandHeight, calculatePdfPages } from "./continuousPdf";

describe("continuous PDF layout", () => {
  test("keeps a normal document on one continuous page", () => {
    const pages = calculatePdfPages(800, 12000, 3000);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ width: 800, height: 12000 });
    expect(pages[0].bands.map(band => band.sourceY)).toEqual([0, 3000, 6000, 9000]);
  });

  test("paginates only after the PDF single-page limit", () => {
    const pages = calculatePdfPages(800, 25000, 5000);
    expect(pages.map(page => page.height)).toEqual([19200, 5800]);
    expect(pages[1].bands[0].sourceY).toBe(19200);
    expect(pages.flatMap(page => page.bands).reduce((sum, band) => sum + band.height, 0)).toBe(25000);
  });

  test("limits every capture band by the pixel budget", () => {
    const height = calculateCaptureBandHeight(1200, 2);
    expect(1200 * height * 4).toBeLessThanOrEqual(16_000_000);
    expect(height * 2).toBeLessThanOrEqual(16_384);
  });
});
