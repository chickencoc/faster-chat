import { expect, test } from "bun:test";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dbUtils } from "../lib/db.js";
import { FILE_CONFIG } from "../lib/fileUtils.js";
import { createGeneratedImageTransform } from "../lib/generatedImages.js";

test("native image output is saved to the user's gallery before the finish event", async () => {
  const user = { id: dbUtils.createUser("native-image-test", "unused-password-hash") };
  const fileIds = [];
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZsAAAAASUVORK5CYII=";
  const image = {
    type: "tool-result",
    toolCallId: "image-call",
    toolName: "imageGeneration",
    providerExecuted: true,
    output: { result: png },
  };
  const search = {
    type: "tool-result",
    toolCallId: "search-call",
    toolName: "webSearch",
    providerExecuted: true,
    output: { results: [] },
  };
  const finish = { type: "finish" };
  const stream = ReadableStream.from([{ ...image, preliminary: true }, search, image, finish]);
  const transform = createGeneratedImageTransform({
    user,
    chatId: "image-chat",
    prompt: "Draw a square",
    model: "gpt-image-2.6-flare",
    modelDisplayName: "GPT Image 2.6 Flare",
    fileIds,
  });
  let filePath;
  try {
    const parts = await Array.fromAsync(stream.pipeThrough(transform()));
    expect(fileIds).toHaveLength(1);
    expect(parts).toEqual([search, { ...image, output: { fileId: fileIds[0] } }, finish]);

    const [saved] = dbUtils.getGeneratedFiles(user.id);
    filePath = path.join(FILE_CONFIG.UPLOAD_DIR, saved.stored_filename);
    expect(saved.id).toBe(fileIds[0]);
    expect(saved.mime_type).toBe("image/png");
    expect(saved.meta).toMatchObject({
      chatId: "image-chat",
      model: "gpt-image-2.6-flare",
      aspectRatio: "1:1",
    });
    expect((await readFile(filePath)).toString("base64")).toBe(png);
  } finally {
    if (filePath) {
      await unlink(filePath);
    }
    for (const id of fileIds) {
      dbUtils.deleteFile(id);
    }
    dbUtils.deleteUser(user.id);
  }
});
