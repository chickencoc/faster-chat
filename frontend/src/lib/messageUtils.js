export function getMessageTimestamp(message, defaultValue = Date.now()) {
  return message.createdAt ?? message.created_at ?? defaultValue;
}

export function ensureTimestamp(message, timestampsRef) {
  const existing = getMessageTimestamp(message, null);
  if (existing) {
    if (message.id && timestampsRef) {
      timestampsRef.current.set(message.id, existing);
    }
    return { ...message, createdAt: existing };
  }

  if (message.id && timestampsRef?.current?.has(message.id)) {
    return { ...message, createdAt: timestampsRef.current.get(message.id) };
  }

  const now = Date.now();
  if (message.id && timestampsRef) {
    timestampsRef.current.set(message.id, now);
  }
  return { ...message, createdAt: now };
}

export function extractTextContent(message) {
  if (!message?.parts) {
    return "";
  }

  return message.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
}

export function hasTextContent(message) {
  return message?.parts?.some((part) => part.type === "text" && part.text?.trim());
}

export function deduplicateMessages(messages) {
  const seenIds = new Set();

  return messages.filter((msg) => {
    if (!msg.id) return true;
    if (seenIds.has(msg.id)) return false;
    seenIds.add(msg.id);
    return true;
  });
}
