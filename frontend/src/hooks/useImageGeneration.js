import { IMAGE_GENERATION } from "@faster-chat/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthState } from "@/state/useAuthState";
import { chatKeys } from "./queryKeys";

async function generateImage({
  prompt,
  aspectRatio = IMAGE_GENERATION.DEFAULT_ASPECT_RATIO,
  chatId,
  model,
  numImages = IMAGE_GENERATION.DEFAULT_NUM_IMAGES,
  referenceFileIds,
  complexity,
}) {
  return apiFetch("/api/images/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      aspectRatio,
      chatId,
      modelId: model,
      numImages,
      complexity,
      ...(referenceFileIds && { referenceFileIds }),
    }),
  });
}

async function fetchImageStatus() {
  return apiFetch("/api/images/status");
}

export function useImageGeneration({ onSuccess, onError } = {}) {
  const userId = useAuthState((state) => state.user?.id);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: generateImage,
    onSuccess,
    onError,
    onSettled: (_data, _error, { chatId }) => {
      if (chatId) {
        queryClient.invalidateQueries({ queryKey: chatKeys.detail(userId, chatId), exact: true });
      }
    },
  });

  return {
    generate: mutation.mutate,
    generateAsync: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

export function useImageStatus() {
  return useQuery({
    queryKey: ["image-status"],
    queryFn: fetchImageStatus,
    staleTime: 5 * 60 * 1000,
  });
}
