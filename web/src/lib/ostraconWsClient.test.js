import { describe, expect, test, vi } from "vitest";
import { OstraconWsClient, PROTOCOL_VERSION, buildClientHelloPayload } from "./ostraconWsClient";

describe("Ostracon protocol", () => {
  test("advertises protocol 4 command responses", () => {
    const hello = buildClientHelloPayload({ host: "::1", port: 27123 }, "client-1");
    expect(PROTOCOL_VERSION).toBe(4);
    expect(hello.capabilities).toContain("command_result");
    expect(hello.capabilities).not.toContain("sync" + "_request");
    expect(hello.capabilities).not.toContain("sync" + "_result");
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
