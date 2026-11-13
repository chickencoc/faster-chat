import { extractTextContent } from "@/lib/messageUtils";
import { useState } from "preact/hooks";
import { useChatPersistence } from "./useChatPersistence";
import { useChatStream } from "./useChatStream";
import { useDeleteMessageMutation } from "./useChatsQuery";

export function useChat({
  id: chatId,
  model,
  reasoningEffort,
  imageGenerationModel,
  webSearchEnabled,
  memoryEnabled,
}) {
  const [input, setInput] = useState("");
  const [inputFiles, setInputFiles] = useState([]);
  const deleteMessage = useDeleteMessageMutation();

  const {
    chat,
    messages: persistedMessages,
    isChatLoading,
    isChatError,
    isSaving,
    saveUserMessage,
    saveAssistantMessage,
  } = useChatPersistence(chatId);

  const stream = useChatStream({
    chatId,
    model,
    reasoningEffort,
    imageGenerationModel,
    webSearchEnabled,
    memoryEnabled,
    persistedMessages,
    onMessageComplete: async ({ id, replacedMessageId, content, fileIds, metadata, createdAt }) => {
      if (chatId) {
        try {
          await saveAssistantMessage({ id, content, model, fileIds, metadata, createdAt }, chatId);
          if (replacedMessageId) {
            await deleteMessage.mutateAsync({ chatId, messageId: replacedMessageId });
          }
        } catch (err) {
          console.error("Failed to save response", err);
        }
      }
    },
  });

  async function submitMessage({ content, fileIds = [] }) {
    const trimmedContent = content.trim();
    if (!trimmedContent && fileIds.length === 0) return;
    if (!chatId) return;

    const messageId = crypto.randomUUID();
    const createdAt = Date.now();
    setInput("");
    setInputFiles([]);
    stream.clearError();

    try {
      await saveUserMessage(
        { id: messageId, content: trimmedContent, fileIds, createdAt, model },
        chatId
      );
      await stream.send({ id: messageId, content: trimmedContent, fileIds, createdAt });
    } catch (err) {
      console.error("Failed to send message", err);
    }
  }

  function handleSubmit(e, content = input) {
    e.preventDefault();
    return submitMessage({ content, fileIds: inputFiles.map((f) => f.id) });
  }

  function handleInputChange(e) {
    setInput(e.target.value);
  }

  const isLoading = (chatId && isChatLoading) || isSaving || stream.isStreaming;

  const appendFiles = (files) => setInputFiles((prev) => [...prev, ...files]);
  const removeFile = (fileId) => setInputFiles((prev) => prev.filter((f) => f.id !== fileId));
  const clearFiles = () => setInputFiles([]);

  return {
    messages: stream.messages,
    input,
    setInput,
    inputFiles,
    appendFiles,
    removeFile,
    clearFiles,
    handleInputChange,
    handleSubmit,
    submitMessage,
    isLoading,
    isChatError,
    error: stream.error,
    clearError: stream.clearError,
    currentChat: chat,
    stop: stream.stop,
    regenerate: stream.isStreaming ? undefined : stream.regenerate,
    status: stream.status,
  };
}
