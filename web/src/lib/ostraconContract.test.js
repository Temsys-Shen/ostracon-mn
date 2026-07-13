import { describe, expect, test } from "vitest";
import { createPacketDraft, normalizePacket } from "./ostraconContract";

describe("ostraconContract", () => {
  test("drops excerpt from new and legacy packet objects", () => {
    const packet = createPacketDraft({
      sourceTitle: "Example",
      fileName: "Readable Name",
      objects: [{ id: "card-1", title: "Card", excerpt: "legacy OCR", comment: "Comment" }],
    });
    expect(packet.objects[0]).not.toHaveProperty("excerpt");
    expect(packet.fileName).toBe("Readable Name");

    const normalized = normalizePacket({
      ...packet,
      objects: [{ ...packet.objects[0], excerpt: "legacy OCR" }],
    });
    expect(normalized.objects[0]).not.toHaveProperty("excerpt");
    expect(normalized.objects[0].comment).toBe("Comment");
    expect(normalized.fileName).toBe("Readable Name");
  });
});
