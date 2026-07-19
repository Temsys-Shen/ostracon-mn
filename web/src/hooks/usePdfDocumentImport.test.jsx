import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MNBridge from "../lib/mnBridge";
import ostraconWsClient from "../lib/ostraconWsClient";
import { usePdfDocumentImport } from "./usePdfDocumentImport";

vi.mock("../lib/mnBridge", () => ({ default: { send: vi.fn() } }));
vi.mock("../lib/ostraconWsClient", () => ({ default: { sendObsidianCommand: vi.fn() } }));

describe("usePdfDocumentImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("transfers OB-generated chunks into the MN import session", async () => {
    ostraconWsClient.sendObsidianCommand
      .mockResolvedValueOnce({ sessionId: "ob-1", fileName: "文档.pdf", byteLength: 6, chunkCount: 2 })
      .mockResolvedValueOnce({ chunkIndex: 0, base64Chunk: "YWJj" })
      .mockResolvedValueOnce({ chunkIndex: 1, base64Chunk: "ZGVm" })
      .mockResolvedValueOnce({ released: true });
    MNBridge.send
      .mockResolvedValueOnce({ sessionId: "mn-1" })
      .mockResolvedValueOnce({ receivedChunks: 1 })
      .mockResolvedValueOnce({ receivedChunks: 2 })
      .mockResolvedValueOnce({ ok: true, documentId: "doc-1" });
    const { result } = renderHook(() => usePdfDocumentImport());

    let imported;
    await act(async () => {
      imported = await result.current.importDocument({ path: "Notes/文档.md" });
    });

    expect(imported).toMatchObject({ documentId: "doc-1" });
    expect(MNBridge.send).toHaveBeenNthCalledWith(1, "createObsidianPdfImportSession", {
      fileName: "文档.pdf",
      expectedByteLength: 6,
    }, 10000);
    expect(MNBridge.send).toHaveBeenNthCalledWith(2, "appendObsidianPdfImportChunk", {
      sessionId: "mn-1", chunkIndex: 0, base64Chunk: "YWJj",
    }, 15000);
    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(1);
  });

  test("aborts MN and releases OB sessions after a transfer failure", async () => {
    ostraconWsClient.sendObsidianCommand
      .mockResolvedValueOnce({ sessionId: "ob-1", fileName: "文档.pdf", byteLength: 3, chunkCount: 1 })
      .mockRejectedValueOnce(new Error("读取分块失败"))
      .mockResolvedValueOnce({ released: true });
    MNBridge.send
      .mockResolvedValueOnce({ sessionId: "mn-1" })
      .mockResolvedValueOnce({ aborted: true });
    const { result } = renderHook(() => usePdfDocumentImport());

    await act(async () => {
      await expect(result.current.importDocument({ path: "Note.md" })).rejects.toThrow("读取分块失败");
    });

    expect(MNBridge.send).toHaveBeenLastCalledWith("abortObsidianPdfImport", { sessionId: "mn-1" }, 5000);
    expect(ostraconWsClient.sendObsidianCommand).toHaveBeenLastCalledWith(
      "releaseVaultDocumentPdfExport",
      { sessionId: "ob-1" },
      10000,
    );
  });
});
