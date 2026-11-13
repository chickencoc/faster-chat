import { useRouter } from "@tanstack/react-router";
import { useUiState } from "@/state/useUiState";

export const DRAFT_CHAT_ID = "new";

export function useChatNavigation() {
  const router = useRouter();

  function navigateToChat(chatId, options = {}) {
    const isDraft = useUiState.getState().draftChat?.id === chatId;
    useUiState.setState({
      webSearchEnabled: false,
      ...(isDraft && { preferredModel: null }),
    });
    return router.navigate({
      to: "/chat/$chatId",
      params: { chatId: isDraft ? DRAFT_CHAT_ID : chatId },
      ...options,
    });
  }

  async function finishDraft(chatId) {
    if (useUiState.getState().draftChat?.id !== chatId) {
      return;
    }
    if (router.state.location.pathname === `/chat/${DRAFT_CHAT_ID}`) {
      await router.navigate({ to: "/chat/$chatId", params: { chatId }, replace: true });
    }
    if (useUiState.getState().draftChat?.id === chatId) {
      useUiState.getState().setDraftChat(null);
    }
  }

  return { navigateToChat, finishDraft };
}
