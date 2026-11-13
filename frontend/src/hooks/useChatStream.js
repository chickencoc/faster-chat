import { DefaultChatTransport } from "ai";
import { useChat as useAIChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef } from "preact/hooks";
import {
  deduplicateMessages,
  ensureTimestamp,
  getMessageTimestamp,
  hasTextContent,
} from "@/lib/messageUtils";
import { buildTokenStats } from "@/lib/tokenStats";
import { useAuthState } from "@/state/useAuthState";
import { useUiState } from "@/state/useUiState";
import { MESSAGE_CONSTANTS } from "@faster-chat/shared";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "./queryKeys";

function trimMessageHistory(messages) {
  return messages.slice(-MESSAGE_CONSTANTS.MAX_HISTORY).filter((message) => {
    if (message.role !== "assistant") return true;
    if (!message.parts?.length) return false;
    return message.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
  });
}

function formatMessagesForTransport(messages) {
  const pruned = trimMessageHistory(messages);
  return pruned.map((message) => ({
    id: message.id ?? crypto.randomUUID(),
    role: message.role,
    content: (message.parts ?? []).map((part) => (part.type === "text" ? part.text : "")).join(""),
    fileIds: message.fileIds || [],
  }));
}

export function useChatStream({
  chatId,
  model,
  reasoningEffort,
  imageGenerationModel,
  webSearchEnabled,
  memoryEnabled,
  persistedMessages,
  onMessageComplete,
}) {
  const userId = useAuthState((state) => state.user?.id);
  const queryClient = useQueryClient();
  const modelRef = useRef(model);
  modelRef.current = model;
  const openAIOptions = useRef(null);
  openAIOptions.current = { reasoningEffort, imageGenerationModel };

  const webSearchRef = useRef(webSearchEnabled);
  webSearchRef.current = webSearchEnabled;

  const memoryEnabledRef = useRef(memoryEnabled);
  memoryEnabledRef.current = memoryEnabled;

  const persistedMessagesRef = useRef(persistedMessages);
  persistedMessagesRef.current = persistedMessages;

  const messageTimestampsRef = useRef(new Map());
  const regeneratingId = useRef(null);

  const timingRef = useRef({ sendAt: null, ttftMs: null });
  const resetTiming = () => {
    timingRef.current = { sendAt: performance.now(), ttftMs: null };
  };

  const formattedMessages = (persistedMessages ?? []).map((msg) =>
    ensureTimestamp(msg, messageTimestampsRef)
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chats/${chatId}/completion`,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.ok) {
            queryClient.invalidateQueries({
              queryKey: chatKeys.detail(userId, chatId),
              exact: true,
            });
          }
          return response;
        },
        prepareSendMessagesRequest: ({ messages: outgoingMessages, trigger }) => {
          const persistedForTransport = (persistedMessagesRef.current ?? []).map((msg) => ({
            id: msg.id,
            role: msg.role,
            parts: [{ type: "text", text: msg.content ?? "" }],
            fileIds: msg.fileIds || [],
          }));

          const persistedIds = new Set(persistedForTransport.map((m) => m.id));
          const newMessages = (outgoingMessages ?? []).filter((m) => !persistedIds.has(m.id));
          const normalized = formatMessagesForTransport(
            trigger === "regenerate-message"
              ? outgoingMessages
              : [...persistedForTransport, ...newMessages]
          );
          useUiState.getState().rememberModel(userId, "text", modelRef.current);

          return {
            body: {
              model: modelRef.current,
              ...openAIOptions.current,
              systemPromptId: "default",
              messages: normalized,
              webSearch: webSearchRef.current,
              memoryEnabled: memoryEnabledRef.current,
            },
          };
        },
      }),
    [chatId, queryClient, userId]
  );

  const {
    messages: streamingMessages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    error,
    stop,
    clearError,
  } = useAIChat({
    id: chatId,
    messages: [],
    transport,
    onFinish: async ({ message, isAbort, isError }) => {
      const replacedMessageId = regeneratingId.current;
      if (replacedMessageId && (isAbort || isError)) return;
      const content = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");

      const toolParts = message.parts.filter(
        (part) =>
          part.type === "source-url" || (part.type === "tool-invocation" && part.state === "result")
      );
      const fileIds = message.metadata?.fileIds ?? [];
      const generatedFileDownloadFailed = message.metadata?.generatedFileDownloadFailed;
      const reasoning = message.parts
        .filter((part) => part.type === "reasoning" && part.text.trim())
        .map((part) => part.text);

      const { sendAt, ttftMs } = timingRef.current;
      const stats = buildTokenStats({
        usage: message.metadata?.usage,
        ttftMs,
        durationMs: sendAt != null ? Math.round(performance.now() - sendAt) : null,
      });

      const metadata = {
        ...(toolParts.length > 0 ? { toolParts } : {}),
        ...(reasoning.length > 0 ? { reasoning } : {}),
        ...(generatedFileDownloadFailed && { generatedFileDownloadFailed }),
        ...(stats ? { stats } : {}),
      };

      if (onMessageComplete && (content.trim() || fileIds.length || generatedFileDownloadFailed)) {
        await onMessageComplete({
          id: message.id,
          replacedMessageId,
          content,
          fileIds,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
          createdAt: getMessageTimestamp(message),
        });
      }
    },
  });

  useEffect(() => {
    const { sendAt, ttftMs } = timingRef.current;
    if (sendAt == null || ttftMs != null) return;
    const last = streamingMessages[streamingMessages.length - 1];
    if (last?.role === "assistant" && hasTextContent(last)) {
      timingRef.current.ttftMs = Math.round(performance.now() - sendAt);
    }
  }, [streamingMessages]);

  const isStreaming = status === "streaming" || status === "submitted";

  const streamingMessagesWithModel = streamingMessages.map((msg) => ({
    ...ensureTimestamp(msg, messageTimestampsRef),
    model: msg.role === "assistant" ? modelRef.current : msg.model,
    fileIds: msg.fileIds ?? msg.metadata?.fileIds,
  }));

  const messages = isStreaming
    ? deduplicateMessages([...formattedMessages, ...streamingMessagesWithModel]).filter(
        (message) => message.id !== regeneratingId.current
      )
    : formattedMessages;

  async function send({ id, content, fileIds = [], createdAt }) {
    const message = {
      id: id || crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: content }],
      createdAt: createdAt ?? Date.now(),
    };
    if (fileIds.length > 0) message.fileIds = fileIds;
    messageTimestampsRef.current.set(message.id, message.createdAt);
    resetTiming();
    await sendMessage(message);
  }

  async function regenerateWithTiming() {
    const previous = formattedMessages.at(-1);
    if (previous?.role !== "assistant" || regeneratingId.current) return;
    regeneratingId.current = previous.id;
    setMessages(formattedMessages);
    resetTiming();
    try {
      await regenerate({ messageId: previous.id });
    } finally {
      regeneratingId.current = null;
    }
  }

  return {
    messages,
    send,
    regenerate: regenerateWithTiming,
    stop,
    status,
    error,
    clearError,
    isStreaming,
  };
}
