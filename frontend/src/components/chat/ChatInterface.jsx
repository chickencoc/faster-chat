import SidebarToolbar from "@/components/layout/SidebarToolbar";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToolbarGroup } from "@/components/ui/ToolbarGroup";
import { UserMenu } from "@/components/ui/UserMenu";
import { useChat } from "@/hooks/useChat";
import { useChatVoice } from "@/hooks/useChatVoice";
import { useChatMemoryEnabled } from "@/hooks/useMemoryStatus";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useCreateChatMutation, useCreateMessageMutation } from "@/hooks/useChatsQuery";
import { useImageGeneration } from "@/hooks/useImageGeneration";
import { useAuthState } from "@/state/useAuthState";
import { useChatQuote } from "@/state/useChatQuote";
import { useUiState } from "@/state/useUiState";
import { providersClient } from "@/lib/providersClient";
import {
  CACHE_DURATIONS,
  OPENAI_IMAGE_COMPLEXITIES,
  OPENAI_REASONING_EFFORTS,
  supportedAspectRatios,
  supportsImageToImage,
  supportsOpenAIImageComplexity,
  supportsOpenAIReasoning,
} from "@faster-chat/shared";
import { useQuery } from "@tanstack/react-query";

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { toast, Toaster } from "sonner";
import InputArea from "./InputArea";
import EffortSelector from "./EffortSelector";
import MessageList from "./MessageList";
import ModelSelector from "./ModelSelector";
import VoiceSettings from "./VoiceSettings";
import VoiceStatusIndicator from "./VoiceStatusIndicator";

const ChatInterface = ({ chatId, chat }) => {
  const { navigateToChat } = useChatNavigation();
  const createChatMutation = useCreateChatMutation();
  const userId = useAuthState((state) => state.user?.id);
  const hasQuote = useChatQuote((state) => state.quote?.chatId === chatId);
  const setPreferredModel = useUiState((state) => state.setPreferredModel);
  const imageMode = useUiState((state) => state.imageMode);
  const lastUsedModels = useUiState((state) => state.lastUsedModels[userId]);
  const rememberModel = useUiState((state) => state.rememberModel);
  const storedAspectRatio = useUiState((state) => state.imageAspectRatio);
  const setImageAspectRatio = useUiState((state) => state.setImageAspectRatio);
  const imageCount = useUiState((state) => state.imageCount);
  const setImageCount = useUiState((state) => state.setImageCount);
  const autoScroll = useUiState((state) => state.autoScroll);
  const webSearchEnabled = useUiState((state) => state.webSearchEnabled);
  const setWebSearchEnabled = useUiState((state) => state.setWebSearchEnabled);
  const memoryEnabled = useChatMemoryEnabled(chatId);
  const [modelOverride, setModelOverride] = useState(null);
  const [imageModelOverride, setImageModelOverride] = useState(null);
  const [effortOverride, setReasoningEffort] = useState(null);
  const [complexityOverride, setImageComplexity] = useState(null);

  const { data: modelsData } = useQuery({
    queryKey: ["models", "text"],
    queryFn: () => providersClient.getEnabledModelsByType("text"),
    staleTime: CACHE_DURATIONS.IMAGE_MODELS,
  });

  const { data: imageModelsData } = useQuery({
    queryKey: ["models", "image"],
    queryFn: () => providersClient.getEnabledModelsByType("image"),
    staleTime: CACHE_DURATIONS.IMAGE_MODELS,
  });

  const textModels = modelsData?.models || [];
  const selectedModel =
    textModels.find((item) => item.model_id === modelOverride) ||
    textModels.find((item) => item.model_id === chat?.lastModel) ||
    textModels.find((item) => item.model_id === lastUsedModels?.text) ||
    textModels.find((item) => item.is_default) ||
    textModels[0];

  const imageModels = imageModelsData?.models || [];
  const imageModel =
    imageModels.find((m) => m.model_id === imageModelOverride) ||
    imageModels.find((m) => m.model_id === chat?.lastImageModel) ||
    imageModels.find((m) => m.model_id === lastUsedModels?.image) ||
    imageModels.find((m) => m.is_default) ||
    imageModels[0];
  const canReason = supportsOpenAIReasoning(selectedModel?.provider, selectedModel?.model_id);
  const canSetComplexity = supportsOpenAIImageComplexity(
    imageModel?.provider,
    imageModel?.model_id
  );
  const showEffort = imageMode ? canSetComplexity : canReason;
  const savedReasoningEffort =
    selectedModel?.model_id === chat?.lastModel ? chat?.reasoningEffort : null;
  const savedImageComplexity =
    imageModel?.model_id === chat?.lastImageModel ? chat?.imageComplexity : null;
  const reasoningEffort = effortOverride ?? savedReasoningEffort ?? "medium";
  const imageComplexity = complexityOverride ?? savedImageComplexity ?? "high";
  const aspectRatios = supportedAspectRatios(imageModel?.provider, imageModel?.model_id);
  const aspectRatio = aspectRatios.includes(storedAspectRatio)
    ? storedAspectRatio
    : aspectRatios[0];
  const imageModelSupportsEditing = supportsImageToImage(
    imageModel?.provider,
    imageModel?.metadata,
    imageModel?.model_id
  );

  const handleModelChange = (modelId) => {
    setModelOverride(modelId);
    setPreferredModel(modelId);
    clearError();
    const newModel = (modelsData?.models || []).find((m) => m.model_id === modelId);
    if (!newModel?.metadata?.supports_tools) {
      setWebSearchEnabled(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync();
      navigateToChat(newChat.id);
    } catch (err) {
      toast.error(err.message || "Failed to create new chat");
    }
  };
  const scrollContainerRef = useRef(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  const {
    messages,
    input,
    inputFiles,
    appendFiles,
    removeFile,
    clearFiles,
    handleInputChange,
    handleSubmit,
    submitMessage,
    error: chatError,
    clearError,
    isLoading,
    status,
    stop,
    regenerate,
    setInput,
  } = useChat({
    id: chatId,
    model: selectedModel?.model_id,
    reasoningEffort: canReason ? reasoningEffort : undefined,
    imageGenerationModel: canReason && canSetComplexity ? imageModel.model_id : undefined,
    webSearchEnabled,
    memoryEnabled,
  });

  const { voice } = useChatVoice({
    messages,
    isLoading,
    setInput,
    submitMessage,
  });

  const createMessageMutation = useCreateMessageMutation();
  const { generate: generateImage, isGenerating } = useImageGeneration({
    onError: (error) => {
      const failureReason = error.body?.failures?.[0]?.error;
      toast.error(failureReason || error.message || "Image generation failed");
    },
  });

  async function handleImageSubmit(prompt, referenceFiles) {
    if (!prompt || !chatId) return;

    const referenceFileIds =
      referenceFiles && referenceFiles.length > 0
        ? referenceFiles.map((file) => file.id)
        : undefined;

    const userMessageId = crypto.randomUUID();
    const userCreatedAt = Date.now();
    await createMessageMutation.mutateAsync({
      chatId,
      message: {
        id: userMessageId,
        role: "user",
        content: referenceFileIds ? `[Image Edit] ${prompt}` : `[Image Generation] ${prompt}`,
        createdAt: userCreatedAt,
      },
    });

    setInput("");
    rememberModel(userId, "image", imageModel?.model_id);

    generateImage(
      {
        prompt,
        chatId,
        model: imageModel?.model_id,
        aspectRatio,
        numImages: imageCount,
        ...(canSetComplexity && { complexity: imageComplexity }),
        referenceFileIds,
      },
      {
        onSuccess: async (data) => {
          const images = data.images || [];
          const failures = data.failures || [];

          if (failures.length > 0) {
            toast.warning(
              `${images.length} of ${images.length + failures.length} images generated`
            );
          }

          const assistantMessageId = crypto.randomUUID();
          await createMessageMutation.mutateAsync({
            chatId,
            message: {
              id: assistantMessageId,
              role: "assistant",
              content:
                images.length === 1
                  ? `Generated image: "${prompt}"`
                  : `Generated ${images.length} images: "${prompt}"`,
              fileIds: images.map((image) => image.id),
              model: images[0].model,
              createdAt: Date.now(),
            },
          });
          if (failures.length === 0) {
            toast.success("Image generated!");
          }
        },
      }
    );
  }

  useLayoutEffect(() => {
    if (!scrollContainerRef.current || !autoScroll) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages.length, autoScroll]);

  return (
    <div className="bg-theme-canvas relative z-0 flex h-full flex-1 flex-col">
      <Toaster position="top-center" theme="dark" richColors expand visibleToasts={3} />

      <div className="relative flex-1">
        <div className="sticky top-0 z-10 flex items-center justify-between px-2 py-3 md:px-8 md:py-6">
          <div className="flex items-center gap-3">
            <SidebarToolbar onNewChat={handleNewChat} onSearch={() => {}} />
          </div>

          <ToolbarGroup>
            <VoiceStatusIndicator
              voiceControls={voice}
              onOpenSettings={() => setShowVoiceSettings(true)}
            />
            <ThemeToggle />
            <UserMenu />
          </ToolbarGroup>
        </div>

        <div
          ref={scrollContainerRef}
          style={{ scrollbarGutter: "stable both-edges" }}
          className={`absolute inset-0 overflow-y-scroll pt-12 md:px-20 ${hasQuote ? "pb-[260px]" : "pb-[180px]"}`}>
          <div className="mx-auto mt-6 pt-3 max-w-4xl">
            <MessageList
              chatId={chatId}
              messages={messages}
              isLoading={isLoading}
              isGeneratingImage={isGenerating}
              status={status}
              onStop={stop}
              onRegenerate={regenerate}
            />
          </div>
        </div>

        <div className="from-theme-canvas via-theme-canvas/80 pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6">
          <div className="pointer-events-auto relative mx-auto max-w-4xl">
            <ErrorBanner
              message={chatError?.message || chatError}
              onDismiss={clearError}
              className="mb-3"
            />

            <InputArea
              activeModel={selectedModel?.model_id}
              modelSelector={
                <>
                  {showEffort && (
                    <EffortSelector
                      imageMode={imageMode}
                      value={imageMode ? imageComplexity : reasoningEffort}
                      onChange={imageMode ? setImageComplexity : setReasoningEffort}
                      options={imageMode ? OPENAI_IMAGE_COMPLEXITIES : OPENAI_REASONING_EFFORTS}
                      disabled={isLoading || isGenerating}
                    />
                  )}
                  {imageMode ? (
                    <ModelSelector
                      type="image"
                      currentModel={imageModel?.model_id}
                      onModelChange={setImageModelOverride}
                    />
                  ) : (
                    <ModelSelector
                      currentModel={selectedModel?.model_id}
                      onModelChange={handleModelChange}
                    />
                  )}
                </>
              }
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              onSetInput={setInput}
              voiceControls={voice}
              disabled={isLoading || isGenerating || !(imageMode ? imageModel : selectedModel)}
              onImageSubmit={handleImageSubmit}
              webSearchEnabled={webSearchEnabled}
              chatId={chatId}
              selectedFiles={inputFiles}
              onFilesUploaded={appendFiles}
              onRemoveFile={removeFile}
              isLoading={isLoading}
              isGenerating={isGenerating}
              aspectRatios={aspectRatios}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setImageAspectRatio}
              imageCount={imageCount}
              onImageCountChange={setImageCount}
              supportsImageToImage={imageModelSupportsEditing}
              onClearFiles={clearFiles}
            />
          </div>
        </div>
      </div>

      {showVoiceSettings && (
        <VoiceSettings voiceControls={voice} onClose={() => setShowVoiceSettings(false)} />
      )}
    </div>
  );
};

export default ChatInterface;
