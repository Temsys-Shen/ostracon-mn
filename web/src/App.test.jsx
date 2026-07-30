import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  clearLastError: vi.fn(),
  doConnect: vi.fn(),
  send: vi.fn(),
  insertQuote: vi.fn(),
  bridgeSend: vi.fn(() => Promise.resolve({ synced: true })),
  setPrefs: vi.fn(),
  startScan: vi.fn(),
}));

vi.mock("./lib/ostraconWsClient", () => ({
  default: {
    disconnect: mocks.disconnect,
    clearLastError: mocks.clearLastError,
    sendObsidianCommand: vi.fn(),
  },
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

vi.mock("./hooks/useConnection", () => ({
  formatWsUrl: (host, port) => `ws://${host}:${port}`,
  parseConnectionUrl: () => ({ host: "127.0.0.1", port: 27123 }),
  useConnection: () => ({ doConnect: mocks.doConnect }),
  useDiscovery: () => ({ discoveredServers: [], scanning: false, startScan: mocks.startScan }),
}));

vi.mock("./hooks/usePreferences", () => ({ usePreferences: () => ({ setPrefs: mocks.setPrefs }) }));
vi.mock("./hooks/useSelectionWatcher", () => ({ useSelectionWatcher: vi.fn() }));
vi.mock("./hooks/useSend", () => ({ useSend: () => ({ send: mocks.send }) }));
vi.mock("./hooks/useQuote", () => ({
  useQuote: () => ({
    selection: { kind: "text", text: "quote" },
    root: { title: "Sibling" },
    context: { cursor: { available: true }, activeFile: { available: true } },
    busyTarget: "",
    insert: mocks.insertQuote,
  }),
}));
vi.mock("./lib/mnBridge", () => ({ default: { send: mocks.bridgeSend } }));
vi.mock("./components/VaultBrowser", () => ({ default: () => <div data-testid="full-browse" /> }));
vi.mock("./components/QuotePanel", () => ({ QuotePanelView: () => <div data-testid="full-quote" /> }));

import App from "./App";
import useBridgeStore from "./store/useBridgeStore";

function setConnectedState() {
  useBridgeStore.setState({
    connection: {
      ...useBridgeStore.getState().connection,
      status: "connected",
      connected: true,
      ready: true,
      settings: { ...useBridgeStore.getState().connection.settings, host: "127.0.0.1", port: 27123 },
      vaultName: "Vault",
    },
    selection: {
      cardsInfo: { noteCount: 2 },
      insertContext: null,
      quoteSelection: null,
      quoteRoot: null,
      quoteContext: null,
      loading: false,
      error: "",
    },
  });
}

describe("App panel mode", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    setConnectedState();
  });

  test("switches to native mini without disconnecting or clearing shared state", () => {
    render(<App />);

    act(() => window.__OstraconSetPanelMode("mini"));

    expect(screen.queryByTestId("full-browse")).toBeNull();
    expect(typeof window.__OstraconNativeMiniAction).toBe("function");
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(useBridgeStore.getState().connection.connected).toBe(true);
    expect(useBridgeStore.getState().selection.cardsInfo.noteCount).toBe(2);
  });

  test("rejects unsupported panel modes", () => {
    render(<App />);

    expect(() => window.__OstraconSetPanelMode("tiny")).toThrow("不支持的面板模式: tiny");
  });

  test("restores the previous full workspace after mini mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /浏览/ }));
    expect(screen.getByTestId("full-browse")).toBeTruthy();

    act(() => window.__OstraconSetPanelMode("mini"));
    expect(screen.queryByTestId("full-browse")).toBeNull();

    act(() => window.__OstraconSetPanelMode("full"));
    expect(screen.getByTestId("full-browse")).toBeTruthy();
  });

  test("routes native source selection through the shared send action", async () => {
    render(<App />);

    await act(async () => {
      await window.__OstraconNativeMiniAction(JSON.stringify({ action: "set-send-scope", payload: { scope: "card-tree" } }));
    });
    await act(async () => {
      await window.__OstraconNativeMiniAction(JSON.stringify({ action: "send", payload: {} }));
    });

    expect(mocks.send).toHaveBeenCalledWith({ scope: "card-tree" });
  });

  test("selects a native quote file before inserting it", async () => {
    render(<App />);

    await act(async () => {
      await window.__OstraconNativeMiniAction(JSON.stringify({ action: "select-file", payload: { path: "Folder/note.md" } }));
    });
    await act(async () => {
      await window.__OstraconNativeMiniAction(JSON.stringify({ action: "quote", payload: {} }));
    });

    expect(mocks.insertQuote).toHaveBeenCalledWith("file", "Folder/note.md");
  });
});
