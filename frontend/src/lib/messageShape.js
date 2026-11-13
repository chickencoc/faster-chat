import { getMessageTimestamp } from "./messageUtils.js";

export function toCanonicalMessage(msg) {
  const parts = [{ type: "text", text: msg.content ?? "" }];
  if (Array.isArray(msg.metadata?.reasoning)) {
    for (const text of msg.metadata.reasoning) {
      if (typeof text === "string") parts.push({ type: "reasoning", text });
    }
  }
  if (msg.metadata?.toolParts) {
    parts.push(...msg.metadata.toolParts);
  }
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content ?? "",
    parts,
    fileIds: msg.fileIds || [],
    model: msg.model || null,
    metadata: msg.metadata || null,
    createdAt: getMessageTimestamp(msg),
  };
}
