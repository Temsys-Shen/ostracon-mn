import { describe, expect, test } from "vitest";
import { bytesToBase64, splitPdfBytes } from "./usePdfDocumentImport";

describe("PDF binary transfer", () => {
  test("encodes PDF bytes without UTF-8 conversion", () => {
    expect(bytesToBase64(new Uint8Array([0, 37, 80, 68, 70, 255]))).toBe("ACVQREb/");
  });

  test("creates ordered chunks within the bridge character limit", () => {
    const bytes = new Uint8Array(24001).map((_, index) => index % 256);
    const chunks = splitPdfBytes(bytes, 16000);
    expect(chunks).toHaveLength(3);
    expect(chunks.every(chunk => chunk.length <= 16000 && chunk.length % 4 === 0)).toBe(true);
    const decoded = chunks.flatMap(chunk => Array.from(window.atob(chunk), character => character.charCodeAt(0)));
    expect(decoded).toEqual(Array.from(bytes));
  });
});
