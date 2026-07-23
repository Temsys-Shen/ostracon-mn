import { describe, expect, test, vi } from "vitest";
import { OstraconWsClient, PROTOCOL_VERSION, buildClientHelloPayload } from "./ostraconWsClient";

const bridgeMocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./mnBridge", () => ({ default: { send: bridgeMocks.send } }));

describe("Ostracon protocol", () => {
  test("advertises protocol 5 remote MarginNote URL opening", () => {
    const hello = buildClientHelloPayload({ host: "::1", port: 27123 }, "client-1");
    expect(PROTOCOL_VERSION).toBe(5);
    expect(hello.capabilities).toContain("command_result");
    expect(hello.capabilities).toContain("open_marginnote_url");
    expect(hello.capabilities).not.toContain("sync" + "_request");
    expect(hello.capabilities).not.toContain("sync" + "_result");
  });

  test("opens a validated MarginNote URL through the native bridge", async () => {
    const client = new OstraconWsClient();
    client.sendRaw = vi.fn();
    bridgeMocks.send.mockResolvedValue({ opened: true, url: "marginnote4app://note/n1" });

    await client.handleServerCommand({
      type: "command",
      command: "openMarginNoteUrl",
      requestId: "open-1",
      payload: { url: "marginnote4app://note/n1" },
    });

    expect(bridgeMocks.send).toHaveBeenCalledWith("openMarginNoteUrl", { url: "marginnote4app://note/n1" });
    expect(client.sendRaw).toHaveBeenCalledWith(expect.objectContaining({
      type: "command_result",
      requestId: "open-1",
      payload: { opened: true, url: "marginnote4app://note/n1" },
    }));
  });

  test("rejects non-MarginNote URLs before calling the native bridge", async () => {
    const client = new OstraconWsClient();
    client.sendRaw = vi.fn();
    bridgeMocks.send.mockClear();

    await client.handleServerCommand({
      type: "command",
      command: "openMarginNoteUrl",
      requestId: "open-invalid",
      payload: { url: "https://example.com" },
    });

    expect(bridgeMocks.send).not.toHaveBeenCalled();
    expect(client.sendRaw).toHaveBeenCalledWith(expect.objectContaining({
      type: "error",
      requestId: "open-invalid",
      payload: expect.objectContaining({ command: "openMarginNoteUrl", message: "仅支持marginnote4app链接" }),
    }));
  });

  test("submits a plain packet and waits for command_result", async () => {
    const client = new OstraconWsClient();
    client.request = vi.fn().mockResolvedValue({ type: "command_result", payload: { ok: true } });
    const packet = {
      version: 1,
      id: "packet-1",
      source: { platform: "MarginNote", title: "Example", url: "" },
      objects: [],
    };

    await client.sendPacket(packet);

    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ type: "command", command: "submitPacket", payload: expect.objectContaining({ id: "packet-1" }) }),
      { resolveOn: ["command_result"] },
    );
  });
});
