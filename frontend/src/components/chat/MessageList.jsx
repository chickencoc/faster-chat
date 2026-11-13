import MessageItem from "./MessageItem";
import { ImageIcon } from "lucide-preact";
import { useRef } from "preact/hooks";
import MessageSelection from "./MessageSelection";

const ImageGeneratingSkeleton = () => (
  <div className="flex gap-3">
    <div className="bg-theme-pink/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
      <ImageIcon className="text-theme-pink h-4 w-4" />
    </div>
    <div className="flex-1">
      <div className="bg-theme-surface-strong mb-2 h-4 w-32 animate-pulse rounded" />
      <div className="border-theme-surface-strong bg-theme-surface relative aspect-square w-64 overflow-hidden rounded-xl border">
        <div className="bg-theme-surface-strong/50 absolute inset-0 animate-pulse" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="bg-theme-pink/20 h-12 w-12 animate-pulse rounded-full" />
            <ImageIcon className="text-theme-pink/50 absolute inset-0 m-auto h-6 w-6" />
          </div>
          <div className="text-theme-text-muted text-sm">Generating image...</div>
          <div className="flex gap-1">
            <span className="bg-theme-pink h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
            <span className="bg-theme-pink h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
            <span className="bg-theme-pink h-1.5 w-1.5 animate-bounce rounded-full" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const EmptyState = () => (
  <div className="flex h-full items-center justify-center py-32">
    <p className="text-theme-text-muted text-lg">Start a conversation</p>
  </div>
);

const MessageList = ({ chatId, messages, isLoading, isGeneratingImage, status, onRegenerate }) => {
  const messageListRef = useRef(null);
  const latest = messages.at(-1);
  const isStreaming = status === "streaming" || status === "submitted";
  const isEmpty = messages.length === 0 && !isLoading && !isGeneratingImage;

  if (isEmpty) {
    return <EmptyState />;
  }

  return (
    <div ref={messageListRef} className="space-y-4" aria-live="polite">
      {messages.map((message) => {
        const isActiveAssistant = message.id === latest.id && message.role === "assistant";

        return (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={isActiveAssistant && isStreaming}
            onRegenerate={isActiveAssistant && !isStreaming ? onRegenerate : undefined}
          />
        );
      })}
      {isLoading && (
        <span className="relative flex h-3 w-3">
          <span className="bg-theme-peach absolute inline-flex h-full w-full transform-gpu animate-ping rounded-full opacity-75"></span>
          <span className="bg-theme-peach relative inline-flex h-3 w-3 rounded-full"></span>
        </span>
      )}
      {isGeneratingImage && <ImageGeneratingSkeleton />}
      <MessageSelection chatId={chatId} messageListRef={messageListRef} />
    </div>
  );
};

export default MessageList;
