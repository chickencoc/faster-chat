import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/preact";
import ChatInterface from "@/components/chat/ChatInterface";
import { toast } from "sonner";

const mockCreateMessage = vi.fn(async () => ({}));
const mockGenerate = vi.fn((vars) => {
  mockGenerate.lastVars = vars;
});
let imageGenHookOptions = null;
let inputAreaProps = null;
let chatOptions = null;
let textModels = [];
let imageModels = [];
let imageMode;
let lastUsedModels;
let modelSelectorProps;
const rememberModel = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/state/useUiState", () => ({
  useUiState: (selector) =>
    selector({
      setPreferredModel: vi.fn(),
      imageMode,
      lastUsedModels,
      rememberModel,
      imageAspectRatio: "1:1",
      setImageAspectRatio: vi.fn(),
      imageCount: 3,
      setImageCount: vi.fn(),
      autoScroll: false,
      webSearchEnabled: false,
      toggleWebSearch: vi.fn(),
      setWebSearchEnabled: vi.fn(),
    }),
}));

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (selector) => selector({ user: { id: 7 } }),
}));

vi.mock("@/hooks/useChat", () => ({
  useChat: (options) => {
    chatOptions = options;
    return {
      messages: [],
      input: "",
      inputFiles: [],
      appendFiles: vi.fn(),
      removeFile: vi.fn(),
      clearFiles: vi.fn(),
      handleInputChange: vi.fn(),
      handleSubmit: vi.fn(),
      submitMessage: vi.fn(),
      error: null,
      clearError: vi.fn(),
      isLoading: false,
      status: "ready",
      stop: vi.fn(),
      regenerate: vi.fn(),
      setInput: vi.fn(),
    };
  },
}));

vi.mock("@/hooks/useChatVoice", () => ({
  useChatVoice: () => ({
    voice: { isSupported: false, isActive: false, toggleConversation: vi.fn() },
  }),
}));

vi.mock("@/hooks/useMemoryStatus", () => ({
  useChatMemoryEnabled: () => false,
}));

vi.mock("@/hooks/useChatNavigation", () => ({
  useChatNavigation: () => ({ navigateToChat: vi.fn() }),
}));

vi.mock("@/hooks/useChatsQuery", () => ({
  useCreateChatMutation: () => ({ mutateAsync: vi.fn() }),
  useCreateMessageMutation: () => ({ mutateAsync: mockCreateMessage }),
}));

vi.mock("@/hooks/useImageGeneration", () => ({
  useImageGeneration: (options) => {
    imageGenHookOptions = options;
    return { generate: mockGenerate, isGenerating: false };
  },
}));

vi.mock("@/lib/providersClient", () => ({
  providersClient: { getEnabledModelsByType: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }) => ({
    data: {
      models: queryKey[1] === "text" ? textModels : imageModels,
    },
  }),
}));

vi.mock("@/components/layout/SidebarToolbar", () => ({
  default: () => <div data-testid="sidebar-toolbar" />,
}));
vi.mock("@/components/ui/ErrorBanner", () => ({
  default: () => null,
}));
vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));
vi.mock("@/components/ui/ToolbarGroup", () => ({
  ToolbarGroup: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/UserMenu", () => ({
  UserMenu: () => null,
}));
vi.mock("@/components/chat/MessageList", () => ({
  default: () => <div data-testid="message-list" />,
}));
vi.mock("@/components/chat/ModelSelector", async (importOriginal) => ({
  ...(await importOriginal()),
  default: (props) => {
    modelSelectorProps = props;
    return <div data-testid="model-selector" />;
  },
}));
vi.mock("@/components/chat/EffortSelector", () => ({
  default: () => null,
}));
vi.mock("@/components/chat/VoiceSettings", () => ({
  default: () => null,
}));
vi.mock("@/components/chat/VoiceStatusIndicator", () => ({
  default: () => null,
}));
vi.mock("@/components/chat/InputArea", () => ({
  default: (props) => {
    inputAreaProps = props;
    return <div data-testid="input-area">{props.modelSelector}</div>;
  },
}));

describe("ChatInterface image generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageGenHookOptions = null;
    inputAreaProps = null;
    textModels = [{ model_id: "gpt-default", is_default: true }];
    imageModels = [{ model_id: "flux", is_default: true }];
    imageMode = true;
    modelSelectorProps = null;
    lastUsedModels = {};
    mockGenerate.lastVars = null;
  });

  test("uses the enabled default model for requests when the stored model is unavailable", () => {
    lastUsedModels = { 7: { text: "claude" } };
    render(<ChatInterface chatId="new-chat" />);
    expect(chatOptions.model).toBe("gpt-default");
  });

  test("uses the current user's last model ahead of the administrator default", () => {
    textModels.push({ model_id: "claude", is_default: false });
    lastUsedModels = { 7: { text: "claude" }, 8: { text: "gpt-default" } };
    render(<ChatInterface chatId="new-chat" />);
    expect(chatOptions.model).toBe("claude");
  });

  test("uses the room's model and reasoning effort ahead of browser settings", () => {
    textModels.push({ model_id: "gpt-6.1-terra", provider: "openai", is_default: false });
    lastUsedModels = { 7: { text: "gpt-default" } };
    render(
      <ChatInterface
        chatId="existing-chat"
        chat={{ lastModel: "gpt-6.1-terra", reasoningEffort: "xhigh" }}
      />
    );
    expect(chatOptions.model).toBe("gpt-6.1-terra");
    expect(chatOptions.reasoningEffort).toBe("xhigh");
  });

  test("falls back to the browser model if the room model is disabled", () => {
    textModels.push({ model_id: "claude", is_default: false });
    lastUsedModels = { 7: { text: "claude" } };
    render(<ChatInterface chatId="existing-chat" chat={{ lastModel: "disabled" }} />);
    expect(chatOptions.model).toBe("claude");
  });

  test("an unsent model change affects only the current chat", () => {
    imageMode = false;
    textModels.push({ model_id: "claude", is_default: false });
    const { rerender } = render(<ChatInterface key="first" chatId="first" />);
    act(() => modelSelectorProps.onModelChange("claude"));
    expect(chatOptions.model).toBe("claude");
    rerender(<ChatInterface key="second" chatId="second" />);
    expect(chatOptions.model).toBe("gpt-default");
  });

  test("uses the room's last image model and complexity on image submission", async () => {
    imageModels.push({ model_id: "gpt-image-2.6-flare", provider: "openai" });
    render(
      <ChatInterface
        chatId="existing-chat"
        chat={{ lastImageModel: "gpt-image-2.6-flare", imageComplexity: "low" }}
      />
    );
    inputAreaProps.onImageSubmit("a cube");
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    expect(mockGenerate.lastVars).toMatchObject({
      model: "gpt-image-2.6-flare",
      complexity: "low",
    });
  });

  const submitImage = async (prompt = "a cube", referenceFiles = undefined) => {
    render(<ChatInterface chatId="chat-1" />);
    inputAreaProps.onImageSubmit(prompt, referenceFiles);
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
  };

  test("sends the selected image count and attaches every returned image to one message", async () => {
    await submitImage();

    expect(mockGenerate.lastVars).toEqual({
      prompt: "a cube",
      chatId: "chat-1",
      model: "flux",
      aspectRatio: "1:1",
      numImages: 3,
    });
    expect(rememberModel).toHaveBeenCalledWith(7, "image", "flux");

    await imageGenHookOptions.onSuccess(
      {
        images: [
          { id: "f1", model: "flux" },
          { id: "f2", model: "flux" },
          { id: "f3", model: "flux" },
        ],
        failures: [],
      },
      mockGenerate.lastVars
    );

    await waitFor(() => expect(mockCreateMessage).toHaveBeenCalledTimes(2));
    const assistantCall = mockCreateMessage.mock.calls[1][0];
    expect(assistantCall.chatId).toBe("chat-1");
    expect(assistantCall.message.role).toBe("assistant");
    expect(assistantCall.message.fileIds).toEqual(["f1", "f2", "f3"]);
    expect(toast.success).toHaveBeenCalled();
  });

  test("posts the successful images and reports partial failures", async () => {
    await submitImage();

    await imageGenHookOptions.onSuccess(
      {
        images: [{ id: "f1", model: "flux" }],
        failures: [{ index: 1, error: "Rate limit exceeded. Please try again later." }],
      },
      mockGenerate.lastVars
    );

    await waitFor(() => expect(mockCreateMessage).toHaveBeenCalledTimes(2));
    const assistantCall = mockCreateMessage.mock.calls[1][0];
    expect(assistantCall.message.fileIds).toEqual(["f1"]);
    expect(toast.warning).toHaveBeenCalledWith("1 of 2 images generated");
  });

  test("total failure posts no assistant message and surfaces the error", async () => {
    await submitImage();

    imageGenHookOptions.onError(new Error("All image generations failed"));

    expect(mockCreateMessage).toHaveBeenCalledTimes(1);
    expect(mockCreateMessage.mock.calls[0][0].message.role).toBe("user");
    expect(toast.error).toHaveBeenCalledWith("All image generations failed");
  });

  test("total failure surfaces the provider reason from the response body", async () => {
    await submitImage();

    const error = new Error("All image generations failed");
    error.body = { failures: [{ index: 0, error: "Invalid API key" }] };
    imageGenHookOptions.onError(error);

    expect(toast.error).toHaveBeenCalledWith("Invalid API key");
  });

  test("sends referenceFileIds and tags the user message as an edit when references exist", async () => {
    await submitImage("make it a watercolor", [{ id: "ref-1" }, { id: "ref-2" }]);

    expect(mockGenerate.lastVars.referenceFileIds).toEqual(["ref-1", "ref-2"]);
    const userCall = mockCreateMessage.mock.calls[0][0];
    expect(userCall.message.content).toBe("[Image Edit] make it a watercolor");
    expect(typeof inputAreaProps.onClearFiles).toBe("function");
  });

  test("omits referenceFileIds and tags the user message as generation when there are none", async () => {
    await submitImage("a cube");

    expect(mockGenerate.lastVars.referenceFileIds).toBeUndefined();
    const userCall = mockCreateMessage.mock.calls[0][0];
    expect(userCall.message.content).toBe("[Image Generation] a cube");
  });
});
