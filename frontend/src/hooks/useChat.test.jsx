import { act, cleanup, renderHook } from "@testing-library/preact";
import { afterEach, expect, test, vi } from "vitest";
import { useChat } from "./useChat";
import { useChatPersistence } from "./useChatPersistence";
import { useChatStream } from "./useChatStream";

vi.mock("./useChatPersistence", () => ({ useChatPersistence: vi.fn() }));
vi.mock("./useChatStream", () => ({ useChatStream: vi.fn() }));

afterEach(cleanup);

test("stopping during the first save prevents the completion request and allows another send", async () => {
  let finishSave;
  const save = new Promise((resolve) => {
    finishSave = resolve;
  });
  const saveUserMessage = vi.fn().mockReturnValueOnce(save).mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue(undefined);
  useChatPersistence.mockReturnValue({ saveUserMessage });
  useChatStream.mockReturnValue({ send, stop: vi.fn(), clearError: vi.fn(), status: "ready" });

  const { result } = renderHook(() => useChat({ id: "chat-1" }));
  let firstSend;
  act(() => {
    firstSend = result.current.submitMessage({ content: "First message" });
  });
  expect(result.current.stop).toBeTypeOf("function");
  act(() => result.current.stop());
  await act(async () => {
    finishSave();
    await firstSend;
  });
  expect(send).not.toHaveBeenCalled();
  expect(result.current.stop).toBeUndefined();

  await act(async () => result.current.submitMessage({ content: "Second message" }));
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ content: "Second message" }));
});
