import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor, cleanup } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useUiState } from "@/state/useUiState";
import { chatsClient } from "@/lib/chatsClient";
import { chatKeys } from "./queryKeys";
import { DRAFT_CHAT_ID, useChatNavigation } from "./useChatNavigation";
import {
  useCreateChatMutation,
  useCreateMessageMutation,
  useChatQuery,
  useMessagesQuery,
} from "./useChatsQuery";

vi.mock("@/state/useAuthState", () => ({
  useAuthState: (select) => select({ user: { id: 7 } }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => router,
}));
vi.mock("@/lib/chatsClient", () => ({
  chatsClient: {
    getChat: vi.fn(async () => ({ id: "saved-chat" })),
    getMessages: vi.fn(async () => []),
    createChat: vi.fn(),
    createMessage: vi.fn(),
  },
}));

let hooks;
let client;
let router;
function Probe() {
  const chatId = router.state.location.pathname.split("/").at(-1);
  const id = useUiState((state) => (chatId === DRAFT_CHAT_ID ? state.draftChat?.id : chatId));
  hooks = {
    create: useCreateChatMutation(),
    send: useCreateMessageMutation(),
    chat: useChatQuery(id),
    messages: useMessagesQuery(id),
    ...useChatNavigation(),
  };
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  useUiState.setState({
    draftChat: null,
    preferredModel: "selected-model",
    lastUsedModels: { 7: { text: "last-used-model" } },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(chatKeys.list(7), []);
  const rootRoute = createRootRoute();
  const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/chat/$chatId" });
  router = createRouter({
    routeTree: rootRoute.addChildren([chatRoute]),
    history: createMemoryHistory({ initialEntries: ["/chat/new"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );
  await waitFor(() => expect(hooks).toBeDefined());
});
afterEach(() => {
  cleanup();
  client.clear();
  hooks = undefined;
});

describe("new chat drafts", () => {
  test("persists the last used models separately for each account and model type", () => {
    const { rememberModel, setPreferredModel } = useUiState.getState();
    act(() => {
      rememberModel(7, "text", "gpt-last");
      rememberModel(7, "image", "gpt-image-last");
      rememberModel(8, "text", "another-model");
      setPreferredModel("unused-model");
    });
    const persisted = JSON.parse(localStorage.getItem("ui-state")).state;
    expect(persisted.lastUsedModels).toEqual({
      7: { text: "gpt-last", image: "gpt-image-last" },
      8: { text: "another-model" },
    });
    expect(persisted.preferredModel).toBeUndefined();
  });

  test("repeated new chats stay at /chat/new and preserve the last used model", async () => {
    await act(async () => {
      const draft = await hooks.create.mutateAsync();
      await hooks.navigateToChat(draft.id);
    });
    const firstId = useUiState.getState().draftChat.id;
    await act(async () => {
      const draft = await hooks.create.mutateAsync();
      await hooks.navigateToChat(draft.id);
    });
    await waitFor(() => expect(hooks.chat.data?.id).toBe(useUiState.getState().draftChat.id));

    expect(useUiState.getState().draftChat.id).not.toBe(firstId);
    expect(useUiState.getState().preferredModel).toBeNull();
    expect(useUiState.getState().lastUsedModels[7].text).toBe("last-used-model");
    expect(router.state.location.pathname).toBe("/chat/new");
    expect(chatsClient.createChat).not.toHaveBeenCalled();
    expect(chatsClient.getChat).not.toHaveBeenCalled();
    expect(chatsClient.getMessages).not.toHaveBeenCalled();
    expect(client.getQueryData(chatKeys.list(7))).toEqual([]);
    expect(hooks.messages.data).toEqual([]);
  });

  test("the first message saves the draft once and then appears in history", async () => {
    await act(async () => {
      await hooks.create.mutateAsync();
    });
    const draft = useUiState.getState().draftChat;
    const message = { id: "first", role: "user", content: "Hello", model: "gpt-default" };
    chatsClient.createChat.mockResolvedValueOnce({
      ...draft,
      title: "Hello",
      firstMessage: message,
    });
    chatsClient.getMessages.mockResolvedValue([message]);

    await act(async () => {
      await hooks.send.mutateAsync({ chatId: draft.id, message });
    });

    expect(chatsClient.createChat).toHaveBeenCalledWith(draft.id, null, null, message, false);
    expect(chatsClient.createMessage).not.toHaveBeenCalled();
    expect(useUiState.getState().draftChat).toBeNull();
    expect(router.state.location.pathname).toBe(`/chat/${draft.id}`);
    expect(client.getQueryData(chatKeys.list(7))).toEqual([
      expect.objectContaining({ id: draft.id, title: "Hello" }),
    ]);
    expect(client.getQueryData(chatKeys.messages(7, draft.id))).toHaveLength(1);
  });

  test("a failed first message keeps the draft available without adding history", async () => {
    await act(async () => {
      await hooks.create.mutateAsync();
    });
    const draft = useUiState.getState().draftChat;
    chatsClient.createChat.mockRejectedValueOnce(new Error("Invalid attachments"));
    await act(async () => {
      await expect(
        hooks.send.mutateAsync({ chatId: draft.id, message: { role: "user", content: "Hello" } })
      ).rejects.toThrow("Invalid attachments");
    });
    expect(useUiState.getState().draftChat.id).toBe(draft.id);
    expect(router.state.location.pathname).toBe("/chat/new");
    expect(client.getQueryData(chatKeys.list(7))).toEqual([]);
    expect(client.getQueryData(chatKeys.messages(7, draft.id))).toEqual([]);
  });
});
