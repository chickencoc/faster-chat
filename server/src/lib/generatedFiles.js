import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FILE_DOWNLOAD_POLICIES, getMimeFromExtension } from "@faster-chat/shared";
import { dbUtils } from "./db.js";
import {
  FILE_CONFIG,
  calculateFileHash,
  deleteFileFromDisk,
  getFileExtension,
  sanitizeFilename,
} from "./fileUtils.js";

const MAX_FILES_PER_RESPONSE = 10;
const FILE_ID_PATTERN = /^cfile_[a-z0-9_-]+$/i;
const CONTAINER_ID_PATTERN = /^cntr_[a-z0-9_-]+$/i;

async function readFileBytes(response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`OpenAI file download returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > FILE_CONFIG.MAX_SIZE) {
        await reader.cancel();
        throw new Error("Generated file exceeds the attachment size limit");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}

async function saveFile({ userId, chatId, filename, buffer }) {
  const id = randomUUID();
  const storedFilename = path.join("artifacts", id);
  const filePath = path.join(FILE_CONFIG.UPLOAD_DIR, storedFilename);
  const mimeType = getMimeFromExtension(getFileExtension(filename)) || "application/octet-stream";
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, buffer);
    const saved = dbUtils.createFile(
      id,
      userId,
      filename,
      storedFilename,
      path.join("server/data/uploads", storedFilename),
      mimeType,
      buffer.length,
      calculateFileHash(buffer),
      {
        type: "generated-document",
        source: "openai",
        chatId,
        downloadPolicy: FILE_DOWNLOAD_POLICIES.ATTACHMENT_ONLY,
      }
    );
    if (!saved) throw new Error("Generated file record was not saved");
    return id;
  } catch (error) {
    await deleteFileFromDisk(filePath);
    throw error;
  }
}

export function createGeneratedFileTransform({ userId, chatId, apiKey, fileIds, onFailure }) {
  const seen = new Set();
  return () =>
    new TransformStream({
      async transform(part, controller) {
        const citation = part.providerMetadata?.openai;
        if (
          part.type !== "source" ||
          part.sourceType !== "document" ||
          citation?.type !== "container_file_citation"
        ) {
          controller.enqueue(part);
          return;
        }

        const { containerId, fileId } = citation;
        const key = `${containerId}/${fileId}`;
        if (seen.has(key)) return;
        if (seen.size >= MAX_FILES_PER_RESPONSE) {
          onFailure();
          return;
        }
        seen.add(key);

        try {
          if (!CONTAINER_ID_PATTERN.test(containerId) || !FILE_ID_PATTERN.test(fileId)) {
            throw new Error("Invalid OpenAI container file reference");
          }
          const response = await fetch(
            `https://api.openai.com/v1/containers/${containerId}/files/${fileId}/content`,
            {
              headers: { Authorization: `Bearer ${apiKey}` },
              redirect: "error",
              signal: AbortSignal.timeout(15_000),
            }
          );
          const buffer = await readFileBytes(response);
          const filename = sanitizeFilename(
            path.posix.basename(
              part.filename.replaceAll("\\", "/").replace(/[\x00-\x1f\x7f]/g, "_")
            )
          );
          fileIds.push(await saveFile({ userId, chatId, filename, buffer }));
        } catch (error) {
          console.warn("Could not save generated file:", error.message);
          onFailure();
        }
      },
    });
}
