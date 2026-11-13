import { useAuthState } from "@/state/useAuthState";
import {
  hasSeenAdminConnectionsOnboarding,
  markAdminConnectionsOnboardingSeen,
} from "@/lib/adminOnboarding";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useChatsQuery, useCreateChatMutation } from "@/hooks/useChatsQuery";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "preact/hooks";

export function IndexRouteGuard() {
  const navigate = useNavigate();
  const { navigateToChat } = useChatNavigation();
  const { user } = useAuthState();
  const { data: chats, isLoading } = useChatsQuery();
  const createChatMutation = useCreateChatMutation();
  const hasStartedNavigation = useRef(false);

  useEffect(() => {
    const needsAdminOnboarding =
      user?.role === "admin" && !hasSeenAdminConnectionsOnboarding(user.id);
    if (!user || (needsAdminOnboarding && isLoading) || hasStartedNavigation.current) {
      return;
    }
    hasStartedNavigation.current = true;

    // Admin onboarding: redirect to connections if no chats and hasn't seen it
    if (needsAdminOnboarding && !chats?.length) {
      markAdminConnectionsOnboardingSeen(user.id);
      navigate({
        to: "/admin",
        search: { tab: "connections" },
        replace: true,
      });
      return;
    }

    createChatMutation.mutate(
      {},
      {
        onSuccess: (newChat) => {
          navigateToChat(newChat.id, { replace: true });
        },
        onError: () => {
          hasStartedNavigation.current = false;
        },
      }
    );
  }, [navigate, navigateToChat, user, chats, isLoading, createChatMutation]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-theme-text-muted">{isLoading ? "Loading..." : "Redirecting..."}</div>
    </div>
  );
}
