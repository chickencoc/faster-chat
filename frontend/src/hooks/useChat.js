import { extractTextContent } from "@/lib/messageUtils";
import { useRef, useState } from "preact/hooks";
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
  const [isStarting, setIsStarting] = useState(false);
  const pendingSend = useRef(null);
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
    if (!chatId || pendingSend.current || stream.isStreaming || isSaving) return;

    const pending = { cancelled: false };
    pendingSend.current = pending;
    setIsStarting(true);
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
      if (!pending.cancelled) {
        const sending = stream.send({ id: messageId, content: trimmedContent, fileIds, createdAt });
        setIsStarting(false);
        await sending;
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      pendingSend.current = null;
      setIsStarting(false);
    }
  }

  function stop() {
    if (pendingSend.current) {
      pendingSend.current.cancelled = true;
      setIsStarting(false);
    }
    return stream.stop();
  }

  function handleSubmit(e, content = input) {
    e.preventDefault();
    return submitMessage({ content, fileIds: inputFiles.map((f) => f.id) });
  }

  function handleInputChange(e) {
    setInput(e.target.value);
  }

  const isLoading = (chatId && isChatLoading) || isSaving || isStarting || stream.isStreaming;

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
    stop: isStarting || stream.isStreaming ? stop : undefined,
    regenerate: stream.isStreaming ? undefined : stream.regenerate,
    status: stream.status,
  };
}
