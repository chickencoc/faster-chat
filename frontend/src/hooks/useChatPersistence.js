import { useChatQuery, useMessagesQuery, useCreateMessageMutation } from "./useChatsQuery";

export function useChatPersistence(chatId) {
  const { data: chat, isLoading: isChatLoading, isError: isChatError } = useChatQuery(chatId);
  const { data: messages, refetch: refreshMessages } = useMessagesQuery(chatId);
  const createMessageMutation = useCreateMessageMutation();

  async function saveUserMessage(
    { id, content, fileIds = [], createdAt, model = null },
    currentChatId
  ) {
    const message = {
      id,
      role: "user",
      content,
      fileIds,
      createdAt,
      model,
    };

    return createMessageMutation.mutateAsync({ chatId: currentChatId, message });
  }

  return {
    chat,
    messages: messages ?? [],
    isChatLoading,
    isChatError,
    isSaving: createMessageMutation.isPending,
    saveUserMessage,
    refreshMessages,
  };
}
