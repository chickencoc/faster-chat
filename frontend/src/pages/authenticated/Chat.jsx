import ChatInterface from "@/components/chat/ChatInterface";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { DRAFT_CHAT_ID, useChatNavigation } from "@/hooks/useChatNavigation";
import { useChatQuery, useCreateChatMutation } from "@/hooks/useChatsQuery";
import { useAppSettingsQuery } from "@/state/useAppSettings";
import { useAuthState } from "@/state/useAuthState";
import { useUiState } from "@/state/useUiState";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef } from "preact/hooks";

const Chat = ({ chatId: routeChatId }) => {
  const navigate = useNavigate();
  const { navigateToChat } = useChatNavigation();
  const userId = useAuthState((state) => state.user?.id);
  const draftId = useUiState((state) =>
    state.draftChat?.userId === userId ? state.draftChat?.id : null
  );
  const chatId = routeChatId === DRAFT_CHAT_ID ? draftId : routeChatId;
  const { data: chat, isLoading, isError, error } = useChatQuery(chatId);
  const createChatMutation = useCreateChatMutation();
  const { data: settings } = useAppSettingsQuery();
  const appName = settings?.appName;

  // Update document title when chat changes
  useLayoutEffect(() => {
    const chatTitle = chat?.title || "New Chat";
    document.title = `${chatTitle} | ${appName}`;

    return () => {
      document.title = appName;
    };
  }, [chat?.title, appName]);
  const hasAttemptedRedirect = useRef(false);

  // Auto-redirect to new chat if current chat is missing/deleted
  if (isError && !hasAttemptedRedirect.current && !createChatMutation.isPending) {
    hasAttemptedRedirect.current = true;
    createChatMutation.mutate(
      {},
      {
        onSuccess: (newChat) => {
          navigateToChat(newChat.id, { replace: true });
        },
      }
    );
  }

  const handleCreateNewChat = () => {
    createChatMutation.mutate(
      {},
      {
        onSuccess: (newChat) => {
          navigateToChat(newChat.id, { replace: true });
        },
      }
    );
  };

  if (!chatId) {
    return <Navigate to="/" replace />;
  }

  if (isLoading || createChatMutation.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-theme-text-muted">
          {createChatMutation.isPending ? "Redirecting to a new chat..." : "Loading chat..."}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <ErrorBanner
          message={
            createChatMutation.error?.message || error?.message || "We couldn't load this chat."
          }
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleCreateNewChat}
            className="btn btn-primary rounded-xl px-4 py-2 text-sm font-semibold">
            Create new chat
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/", replace: true })}
            className="text-theme-text bg-theme-surface-strong hover:bg-theme-surface-stronger rounded-xl px-4 py-2 text-sm font-semibold transition">
            Go home
          </button>
        </div>
      </div>
    );
  }

  return <ChatInterface key={chatId} chatId={chatId} chat={chat} />;
};

export default Chat;
