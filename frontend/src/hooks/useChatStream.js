import { DefaultChatTransport } from "ai";
import { useChat as useAIChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { deduplicateMessages, ensureTimestamp } from "@/lib/messageUtils";
import { chatsClient } from "@/lib/chatsClient";
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
  generationId,
  refreshMessages,
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
  const localJob = useRef(null);
  const observedGeneration = useRef(generationId);

  useEffect(() => {
    if (observedGeneration.current && !generationId) {
      refreshMessages();
    }
    observedGeneration.current = generationId;
  }, [generationId, refreshMessages]);

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
            const job = localJob.current;
            if (job?.stopRequested) {
              chatsClient.stopCompletion(chatId, job.id).catch((err) => {
                console.error("Failed to stop response", err);
              });
            }
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
              generationId: localJob.current?.id,
              ...(trigger === "regenerate-message" && { replaceMessageId: regeneratingId.current }),
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
    clearError,
  } = useAIChat({
    id: chatId,
    messages: [],
    transport,
    onFinish: () => {
      localJob.current = null;
      queryClient.invalidateQueries({ queryKey: chatKeys.detail(userId, chatId) });
    },
  });

  const isLocallyStreaming = status === "streaming" || status === "submitted";
  const isStreaming = isLocallyStreaming || Boolean(generationId);

  const streamingMessagesWithModel = streamingMessages.map((msg) => ({
    ...ensureTimestamp(msg, messageTimestampsRef),
    model: msg.role === "assistant" ? modelRef.current : msg.model,
    fileIds: msg.fileIds ?? msg.metadata?.fileIds,
  }));

  const messages = isLocallyStreaming
    ? deduplicateMessages([...formattedMessages, ...streamingMessagesWithModel]).filter(
        (message) => message.id !== regeneratingId.current
      )
    : formattedMessages;

  async function send({ id, content, fileIds = [], createdAt }) {
    if (localJob.current) return;
    const message = {
      id: id || crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: content }],
      createdAt: createdAt ?? Date.now(),
    };
    if (fileIds.length > 0) message.fileIds = fileIds;
    messageTimestampsRef.current.set(message.id, message.createdAt);
    localJob.current = { id: crypto.randomUUID(), stopRequested: false };
    setMessages(formattedMessages);
    await sendMessage(message);
  }

  async function regenerateResponse() {
    const previous = formattedMessages.at(-1);
    if (previous?.role !== "assistant" || isStreaming || localJob.current) return;
    regeneratingId.current = previous.id;
    setMessages(formattedMessages);
    localJob.current = { id: crypto.randomUUID(), stopRequested: false };
    try {
      await regenerate({ messageId: previous.id });
    } finally {
      regeneratingId.current = null;
    }
  }

  async function stop() {
    const job = localJob.current;
    if (job) job.stopRequested = true;
    const targetId = job?.id ?? generationId;
    if (!targetId) return;
    try {
      await chatsClient.stopCompletion(chatId, targetId);
    } catch (err) {
      console.error("Failed to stop response", err);
    } finally {
      queryClient.invalidateQueries({ queryKey: chatKeys.detail(userId, chatId), exact: true });
    }
  }

  return {
    messages,
    send,
    regenerate: regenerateResponse,
    stop,
    status: isStreaming && !isLocallyStreaming ? "submitted" : status,
    error,
    clearError,
    isStreaming,
  };
}
