import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bridgeSend: vi.fn(),
  sendObsidianCommand: vi.fn(),
}));

vi.mock("../lib/mnBridge", () => ({ default: { send: mocks.bridgeSend } }));
vi.mock("../lib/ostraconWsClient", () => ({
  default: { sendObsidianCommand: mocks.sendObsidianCommand },
}));

import { useQuote } from "./useQuote";

function configureInitialState(selection = null) {
  mocks.bridgeSend.mockImplementation(command => {
    if (command === "getQuoteSelectionPreview") return Promise.resolve(selection);
    if (command === "getQuoteRootState") return Promise.resolve(null);
    if (command === "selectQuoteRootFromCurrentSelection") return Promise.resolve({ selected: false, selectedCount: 0 });
    if (command === "clearQuoteRoot") return Promise.resolve({ cleared: true });
    throw new Error(`Unexpected bridge command: ${command}`);
  });
  mocks.sendObsidianCommand.mockImplementation(command => {
    if (command === "getQuoteContext") return Promise.resolve({
      cursor: { available: true, filePath: "Current.md" },
      activeFile: { available: true, filePath: "Current.md" },
    });
    if (command === "insertQuote") return Promise.resolve({ ok: true, filePath: "Current.md" });
    throw new Error(`Unexpected OB command: ${command}`);
  });
}

describe("useQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureInitialState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("refreshes the preview from the native selection event", async () => {
    const setNotice = vi.fn();
    const { result, unmount } = renderHook(() => useQuote(true, setNotice));
    await waitFor(() => expect(result.current.context.cursor.available).toBe(true));

    const selection = { kind: "text", text: "selected", image: null, noteId: null, link: null };
    mocks.bridgeSend.mockImplementation(command => {
      if (command === "getQuoteSelectionPreview") return Promise.resolve(selection);
      if (command === "getQuoteRootState") return Promise.resolve(null);
      if (command === "selectQuoteRootFromCurrentSelection") return Promise.resolve({ selected: false, selectedCount: 0 });
      throw new Error(`Unexpected bridge command: ${command}`);
    });
    act(() => window.dispatchEvent(new CustomEvent("ostracon:selection-changed")));
    await waitFor(() => expect(result.current.selection).toEqual(selection));
    unmount();
  });

  test("enters and cancels root selection waiting without changing the root", async () => {
    const { result, unmount } = renderHook(() => useQuote(true, vi.fn()));
    await waitFor(() => expect(mocks.bridgeSend).toHaveBeenCalledWith("getQuoteRootState"));

    await act(async () => { await result.current.toggleRootSelection(); });
    expect(result.current.rootSelectionStatus).toBe("waiting");
    expect(result.current.root).toBeNull();
    expect(result.current.error).toBe("");

    await act(async () => { await result.current.toggleRootSelection(); });
    expect(result.current.rootSelectionStatus).toBe("idle");
    expect(result.current.root).toBeNull();
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
