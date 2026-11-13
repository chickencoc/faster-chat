import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { IMAGE_GENERATION } from "@faster-chat/shared";
import { dbUtils } from "./db.js";
import {
  FILE_CONFIG,
  createStoredFilename,
  calculateFileHash,
  deleteFileFromDisk,
} from "./fileUtils.js";
import { getImageDimensions } from "./imageValidation.js";

const GENERATED_DIR = path.join(FILE_CONFIG.UPLOAD_DIR, IMAGE_GENERATION.GENERATED_DIR);

export async function ensureGeneratedDirectory() {
  try {
    await mkdir(GENERATED_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("Failed to create generated directory:", error);
      throw error;
    }
  }
}

export async function saveGeneratedImage({
  user,
  buffer,
  mimeType,
  prompt,
  model,
  modelDisplayName,
  aspectRatio,
  source,
  chatId,
  referenceIds,
}) {
  const fileId = randomUUID();
  const extension = mimeType === "image/webp" ? "webp" : mimeType.split("/")[1] || "png";
  const filename = `generated_${Date.now()}.${extension}`;
  const storedFilename = path.join(
    IMAGE_GENERATION.GENERATED_DIR,
    createStoredFilename(fileId, filename)
  );
  const filePath = path.join(FILE_CONFIG.UPLOAD_DIR, storedFilename);

  const fileHash = calculateFileHash(buffer);
  const relativePath = path.join("server/data/uploads", storedFilename);
  try {
    await writeFile(filePath, buffer);
    const fileRecord = dbUtils.createFile(
      fileId,
      user.id,
      filename,
      storedFilename,
      relativePath,
      mimeType,
      buffer.length,
      fileHash,
      {
        type: "generated",
        prompt,
        model,
        modelDisplayName,
        aspectRatio,
        source,
        generatedAt: Date.now(),
        chatId: chatId || null,
        references: referenceIds && referenceIds.length > 0 ? referenceIds : null,
      }
    );
    if (!fileRecord) {
      await deleteFileFromDisk(filePath);
      return null;
    }
  } catch (error) {
    await deleteFileFromDisk(filePath);
    throw error;
  }

  return {
    id: fileId,
    filename,
    size: buffer.length,
    mimeType,
    model,
    modelDisplayName,
    prompt,
    aspectRatio,
  };
}

export function createGeneratedImageTransform({
  user,
  chatId,
  prompt,
  model,
  modelDisplayName,
  fileIds,
}) {
  return () =>
    new TransformStream({
      async transform(part, controller) {
        if (
          part.type !== "tool-result" ||
          part.toolName !== "imageGeneration" ||
          !part.providerExecuted
        ) {
          controller.enqueue(part);
          return;
        }
        if (part.preliminary) {
          return;
        }

        try {
          const mimeType = "image/png";
          const buffer = Buffer.from(part.output.result, "base64");
          const { width, height } = getImageDimensions(buffer, mimeType);
          const aspectRatio = IMAGE_GENERATION.ASPECT_RATIOS.find((ratio) => {
            const [x, y] = ratio.split(":").map(Number);
            return x * height === y * width;
          });
          await ensureGeneratedDirectory();
          const image = await saveGeneratedImage({
            user,
            buffer,
            mimeType,
            prompt,
            model,
            modelDisplayName,
            aspectRatio,
            source: "openai",
            chatId,
          });
          if (!image) {
            throw new Error("Generated image record was not saved");
          }
          fileIds.push(image.id);
          controller.enqueue({ ...part, output: { fileId: image.id } });
        } catch (error) {
          console.error("Failed to save generated image:", error);
          controller.enqueue({ type: "error", error: new Error("Failed to save generated image") });
        }
      },
    });
}
