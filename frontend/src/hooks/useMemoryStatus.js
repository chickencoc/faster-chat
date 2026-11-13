import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthState } from "@/state/useAuthState";
import { memoryKeys } from "./queryKeys";

const MEMORY_STATUS_STALE_TIME_MS = 60000;

export function useMemoryStatus() {
  const userId = useAuthState((state) => state.user?.id ?? null);

  return useQuery({
    queryKey: memoryKeys.status(userId),
    queryFn: () => apiFetch("/api/memory/status"),
    staleTime: MEMORY_STATUS_STALE_TIME_MS,
    enabled: userId !== null,
  });
}

export function useUserMemories(enabled) {
  const userId = useAuthState((state) => state.user?.id ?? null);

  return useQuery({
    queryKey: memoryKeys.memories(userId),
    queryFn: () => apiFetch("/api/memory"),
    enabled: userId !== null && enabled,
  });
}

export function useChatMemoryEnabled() {
  const { data: status } = useMemoryStatus();

  return !!status?.globalEnabled && !!status?.enabled;
}
