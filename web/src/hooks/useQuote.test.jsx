import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bridgeSend: vi.fn(),
  sendObsidianCommand: vi.fn(),
}));

vi.mock("../lib/mnBridge", () => ({ default: { send: mocks.bridgeSend } }));
vi.mock("../lib/ostraconWsClient", () => ({
  default: { sendObsidianCommand: mocks.sendObsidianCommand },
  createDefaultSettings: () => ({
    host: "127.0.0.1",
    port: 27123,
    clientId: "",
    autoReconnect: true,
    heartbeatIntervalMs: 30000,
    reconnectBaseDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
  }),
}));

import { useQuote } from "./useQuote";
import useBridgeStore from "../store/useBridgeStore";

function resetStoreSelection() {
  useBridgeStore.setState({
    selection: {
      cardsInfo: null,
      insertContext: null,
      quoteSelection: null,
      quoteRoot: null,
      quoteContext: null,
      loading: false,
      error: "",
    },
  });
}

function configureMocks(selection = null, root = null, context = null) {
  mocks.bridgeSend.mockImplementation(command => {
    if (command === "selectQuoteRootFromCurrentSelection") return Promise.resolve({ selected: false, selectedCount: 0 });
    if (command === "clearQuoteRoot") return Promise.resolve({ cleared: true });
    throw new Error(`Unexpected bridge command: ${command}`);
  });
  mocks.sendObsidianCommand.mockImplementation(command => {
    if (command === "getQuoteContext") return Promise.resolve(context || {
      cursor: { available: true, filePath: "Current.md" },
      activeFile: { available: true, filePath: "Current.md" },
    });
    if (command === "insertQuote") return Promise.resolve({ ok: true, filePath: "Current.md" });
    throw new Error(`Unexpected OB command: ${command}`);
  });
  // 模拟 useSelectionWatcher 已经把 selection/root 写入 store
  useBridgeStore.getState().setSelection({ quoteSelection: selection, quoteRoot: root });
}

describe("useQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStoreSelection();
    configureMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("reads quoteContext on mount and via quote-context-changed event", async () => {
    const { result, unmount } = renderHook(() => useQuote(true, vi.fn()));
    // mount 时主动读一次 getQuoteContext
    await waitFor(() => expect(result.current.context.cursor.available).toBe(true));

    // 事件推送更新 context
    const newContext = {
      cursor: { available: false, filePath: null },
      activeFile: { available: true, filePath: "Other.md" },
    };
    act(() => window.dispatchEvent(new CustomEvent("ostracon:quote-context-changed", { detail: newContext })));
    await waitFor(() => expect(result.current.context.cursor.available).toBe(false));
    expect(result.current.context.activeFile.filePath).toBe("Other.md");
    unmount();
  });

  test("exposes selection and root from store", async () => {
    const selection = { kind: "text", text: "selected", image: null, noteId: null, link: null };
    const root = { notebookId: "nb1", noteId: "note1", title: "Root Card" };
    configureMocks(selection, root);

    const { result, unmount } = renderHook(() => useQuote(true, vi.fn()));
    await waitFor(() => expect(result.current.context.cursor.available).toBe(true));
    expect(result.current.selection).toEqual(selection);
    expect(result.current.root).toEqual(root);
    expect(result.current.rootSelectionStatus).toBe("selected");
    unmount();
  });

  test("enters and cancels root selection waiting without changing the root", async () => {
    const { result, unmount } = renderHook(() => useQuote(true, vi.fn()));
    await waitFor(() => expect(result.current.context.cursor.available).toBe(true));

    await act(async () => { await result.current.toggleRootSelection(); });
    expect(result.current.rootSelectionStatus).toBe("waiting");
    expect(result.current.root).toBeNull();
    expect(result.current.error).toBe("");

    await act(async () => { await result.current.toggleRootSelection(); });
    expect(result.current.rootSelectionStatus).toBe("idle");
    expect(result.current.root).toBeNull();
    unmount();
  });

  test("clears root via clearRoot", async () => {
    const root = { notebookId: "nb1", noteId: "note1", title: "Root Card" };
    configureMocks(null, root);

    const { result, unmount } = renderHook(() => useQuote(true, vi.fn()));
    await waitFor(() => expect(result.current.root).toEqual(root));
    expect(result.current.rootSelectionStatus).toBe("selected");

    await act(async () => { await result.current.clearRoot(); });
    expect(result.current.root).toBeNull();
    expect(result.current.rootSelectionStatus).toBe("idle");
    unmount();
  });

  test("reports a successful insertion", async () => {
    const setNotice = vi.fn();
    const { result, unmount } = renderHook(() => useQuote(true, setNotice));
    await waitFor(() => expect(result.current.context.activeFile.available).toBe(true));
    await act(async () => { await result.current.insert("active-file"); });
    expect(mocks.sendObsidianCommand).toHaveBeenCalledWith(
      "insertQuote",
      { target: "active-file", filePath: undefined },
      45000,
    );
    expect(setNotice).toHaveBeenCalledWith("已插入引文");
    unmount();
  });
});
