import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import MNBridge from "../lib/mnBridge";
import ostraconWsClient from "../lib/ostraconWsClient";
import { isSendDisabled } from "../lib/sendRules";
import { useSend } from "./useSend";

vi.mock("../lib/mnBridge", () => ({ default: { send: vi.fn() } }));
vi.mock("../lib/ostraconWsClient", () => ({ default: { sendPacket: vi.fn() } }));

function createProps(format = "markdown") {
  return {
    connection: { connected: true },
    prefs: { mode: "flat", includeBacklinks: true },
    format,
    addSendHistory: vi.fn(),
    setNotice: vi.fn(),
    setLoading: vi.fn(),
  };
}

describe("useSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ostraconWsClient.sendPacket.mockResolvedValue({ payload: { record: { filePath: "Marginnote/Example.md" } } });
  });

  test.each(["selection", "notebook"])("sends the %s scope as Markdown", async (scope) => {
    MNBridge.send
      .mockResolvedValueOnce({ markdown: "# Example", noteCount: 2, fileBaseName: "Example", scopeTitle: "Example" })
      .mockResolvedValueOnce({ cards: [{ id: "card-1", title: "Example" }] });
    const props = createProps();
    const { result } = renderHook(() => useSend(props));

    await act(() => result.current.send({ scope }));

    expect(MNBridge.send).toHaveBeenNthCalledWith(1, "previewScopeMarkdown", { scope, options: props.prefs }, 30000);
    expect(MNBridge.send).toHaveBeenNthCalledWith(2, "listScopeCards", { scope }, 30000);
    expect(ostraconWsClient.sendPacket).toHaveBeenCalledOnce();
    expect(ostraconWsClient.sendPacket.mock.calls[0][0].fileName).toBe("Example");
    expect(props.setNotice).toHaveBeenLastCalledWith("✓ 已发送 2张");
  });

  test("sends the mindmap scope as Canvas", async () => {
    MNBridge.send
      .mockResolvedValueOnce({ canvas: "{\"nodes\":[]}", nodeCount: 1, fileBaseName: "Brain", scopeTitle: "Brain" })
      .mockResolvedValueOnce({ cards: [{ id: "card-1", title: "Brain" }] });
    const props = createProps("canvas");
    const { result } = renderHook(() => useSend(props));

    await act(() => result.current.send({ scope: "mindmap" }));

    expect(MNBridge.send).toHaveBeenNthCalledWith(1, "previewScopeCanvas", { scope: "mindmap", options: props.prefs }, 30000);
    expect(ostraconWsClient.sendPacket.mock.calls[0][0].format).toBe("canvas");
    expect(ostraconWsClient.sendPacket.mock.calls[0][0].fileName).toBe("Brain");
  });

  test("reports a send failure", async () => {
    MNBridge.send.mockRejectedValueOnce(new Error("读取失败"));
    const props = createProps();
    const { result } = renderHook(() => useSend(props));

    await act(() => result.current.send({ scope: "selection" }));

    expect(props.addSendHistory).toHaveBeenCalledWith(expect.objectContaining({ ok: false, summary: "发送失败" }));
    expect(props.setNotice).toHaveBeenLastCalledWith("发送失败: 读取失败");
  });
});

describe("isSendDisabled", () => {
  test("disables an empty selection and loading states only", () => {
    expect(isSendDisabled(false, "selection", 0)).toBe(true);
    expect(isSendDisabled(false, "selection", 1)).toBe(false);
    expect(isSendDisabled(false, "mindmap", 0)).toBe(false);
    expect(isSendDisabled(false, "notebook", 0)).toBe(false);
    expect(isSendDisabled(true, "notebook", 3)).toBe(true);
  });
});
