import { createId } from "./idUtils";

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

function createPacketDraft({
  markdown = "",
  sourceTitle = "MarginNote",
  tags = [],
  folder = "Inbox",
  format = "markdown",
  isCanvas = false,
  objects = null,
} = {}) {
  const now = new Date().toISOString();
  const packetObjects = Array.isArray(objects)
    ? objects.map(item => ({
      id: item.id || createId("card"),
      kind: item.kind || "Card",
      title: item.title || "",
      excerpt: item.excerpt || "",
      comment: item.comment || "",
      sourceAnchor: item.sourceAnchor || "",
      hasImage: Boolean(item.hasImage),
      hasHandwriting: Boolean(item.hasHandwriting),
    }))
    : [
      {
        id: createId("card"),
        kind: "Card",
        title: sourceTitle,
        excerpt: "Canvas export with " + (isCanvas ? "nodes" : "markdown"),
        comment: "",
        sourceAnchor: "",
        hasImage: false,
        hasHandwriting: false,
      },
    ];
  return {
    version: 1,
    id: createId("ostracon"),
    status: "sent",
    transport: "ws",
    format: isCanvas ? "canvas" : "markdown",
    createdAt: now,
    updatedAt: now,
    source: { platform: "MarginNote", title: sourceTitle, url: "" },
    summary: packetObjects.length > 1 ? `${packetObjects.length}张MN卡片` : "",
    tags: normalizeTags(tags),
    objects: packetObjects,
    relations: [],
    notes: markdown,
    destination: { platform: "Obsidian", vault: "", folder },
  };
}

function summarizePacket(packet) {
  const objects = Array.isArray(packet.objects) ? packet.objects : [];
  return {
    id: packet.id,
    version: packet.version,
    status: packet.status,
    sourceTitle: packet.source?.title || "",
    objectCount: objects.length,
    tags: normalizeTags(packet.tags),
    firstObjectKind: objects.length > 0 && objects[0].kind ? objects[0].kind : "",
    destination: packet.destination || null,
  };
}

function normalizePacket(packet) {
  if (!packet || typeof packet !== "object") throw new Error("Packet must be an object");
  if (packet.version !== 1) throw new Error(`Unsupported packet version: ${packet.version}`);
  if (!packet.id || typeof packet.id !== "string") throw new Error("Packet missing id");
  if (!packet.source || typeof packet.source !== "object") throw new Error("Packet missing source");
  if (!Array.isArray(packet.objects)) throw new Error("Packet objects must be an array");

  return {
    version: 1,
    id: packet.id,
    status: packet.status || "draft",
    transport: packet.transport || "ws",
    format: packet.format || "",
    createdAt: packet.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: { platform: packet.source.platform || "MarginNote", title: packet.source.title || "", url: packet.source.url || "" },
    summary: packet.summary || "",
    tags: normalizeTags(packet.tags),
    objects: packet.objects.map(item => ({
      id: item.id || createId("object"), kind: item.kind || "Card", title: item.title || "",
      excerpt: item.excerpt || "", comment: item.comment || "", sourceAnchor: item.sourceAnchor || "",
      hasImage: Boolean(item.hasImage), hasHandwriting: Boolean(item.hasHandwriting),
    })),
    relations: Array.isArray(packet.relations) ? packet.relations : [],
    notes: packet.notes || "",
    destination: packet.destination || { platform: "Obsidian", vault: "", folder: "Inbox" },
  };
}

export {
  createId,
  createPacketDraft,
  normalizePacket,
  summarizePacket,
};
