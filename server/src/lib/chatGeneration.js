const MAX_CLIENT_BUFFER_BYTES = 256 * 1024;

export function keepGenerationRunning(response, onDone) {
  const reader = response.body.getReader();
  let clientAttached = true;
  const body = new ReadableStream(
    {
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (clientAttached) {
              if (controller.desiredSize < value.byteLength) {
                clientAttached = false;
                controller.close();
              } else {
                controller.enqueue(value);
              }
            }
          }
          if (clientAttached) controller.close();
        } catch (error) {
          if (clientAttached) controller.error(error);
          console.error("Chat completion stream failed:", error);
        } finally {
          reader.releaseLock();
          onDone();
        }
      },
      cancel() {
        clientAttached = false;
      },
    },
    { highWaterMark: MAX_CLIENT_BUFFER_BYTES, size: (chunk) => chunk.byteLength }
  );
  return new Response(body, { status: response.status, headers: response.headers });
}

export function getCompletedMessage(message, { startedAt, ttftMs }) {
  const content = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const fileIds = message.metadata?.fileIds ?? [];
  const generatedFileDownloadFailed = message.metadata?.generatedFileDownloadFailed;
  if (!content.trim() && !fileIds.length && !generatedFileDownloadFailed) return null;

  const toolParts = message.parts
    .filter(
      (part) =>
        part.type === "source-url" || (part.type === "tool-invocation" && part.state === "result")
    )
    .map(({ providerMetadata, ...part }) => part);
  const reasoning = message.parts
    .filter((part) => part.type === "reasoning" && part.text.trim())
    .map((part) => part.text);

  const usage = message.metadata?.usage;
  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
  const generationMs = Math.max(1, durationMs - (ttftMs ?? 0));
  const stats = usage?.outputTokens
    ? {
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens,
        ttftMs,
        durationMs,
        tokensPerSecond: Math.round((usage.outputTokens * 10000) / generationMs) / 10,
      }
    : null;

  return {
    content,
    fileIds,
    metadata: {
      ...(toolParts.length && { toolParts }),
      ...(reasoning.length && { reasoning }),
      ...(generatedFileDownloadFailed && { generatedFileDownloadFailed }),
      ...(stats && { stats }),
    },
  };
}
