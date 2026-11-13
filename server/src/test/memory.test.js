import { describe, test, expect, mock } from "bun:test";
import { createMemoryMiddleware, isMemoryEnabledForRequest } from "../lib/memory.js";
import { MEMORY_EXTRACTION_MAX_FACTS_PER_TURN } from "@faster-chat/shared";
import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { wrapModelWithMemory } from "../lib/memory.js";

describe("memory helpers", () => {
  test("isMemoryEnabledForRequest requires all memory gates to pass", () => {
    const dbUtils = {
      getSetting: () => "true",
      getUserMemoryEnabled: () => true,
    };

    expect(isMemoryEnabledForRequest({ dbUtils, userId: 1, requestEnabled: true })).toBe(true);
    expect(isMemoryEnabledForRequest({ dbUtils, userId: 1, requestEnabled: false })).toBe(false);
    expect(
      isMemoryEnabledForRequest({
        dbUtils: { ...dbUtils, getSetting: () => "false" },
        userId: 1,
        requestEnabled: true,
      })
    ).toBe(false);
    expect(
      isMemoryEnabledForRequest({
        dbUtils: { ...dbUtils, getUserMemoryEnabled: () => false },
        userId: 1,
        requestEnabled: true,
      })
    ).toBe(false);
  });

  test("memory middleware reads request metadata from providerOptions", async () => {
    const middleware = createMemoryMiddleware({
      getSetting: () => "true",
      getUserMemoryEnabled: () => true,
      getMemoriesForUser: () => [{ fact: "uses Arch Linux" }],
    });

    const result = await middleware.transformParams({
      params: {
        prompt: [{ role: "system", content: "Base system prompt" }],
        providerOptions: {
          memory: { userId: 1, chatId: "chat-1", enabled: true },
        },
      },
    });

    expect(result.prompt[0].content).toContain("Base system prompt");
    expect(result.prompt[0].content).toContain("uses Arch Linux");
  });

  test("saved memories reach the provider prompt without losing system instructions", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "Hello" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      },
    });
    const wrappedModel = wrapModelWithMemory(model, {
      getSetting: () => "true",
      getUserMemoryEnabled: () => true,
      getMemoriesForUser: () => [{ fact: "uses Arch Linux" }],
    });

    await generateText({
      model: wrappedModel,
      system: "Base system prompt",
      prompt: "Hello",
      providerOptions: { memory: { userId: 1, enabled: true } },
    });

    const system = model.doGenerateCalls[0].prompt.find((message) => message.role === "system");
    expect(system.content).toContain("Base system prompt");
    expect(system.content).toContain("uses Arch Linux");
  });

  test("extractMemories caps persisted facts to MEMORY_EXTRACTION_MAX_FACTS_PER_TURN", async () => {
    const fiftyFacts = Array.from({ length: 50 }, (_, i) => `fact ${i}`);
    await mock.module("ai", () => ({
      wrapLanguageModel: (opts) => opts.model,
      generateText: async () => ({ text: JSON.stringify(fiftyFacts) }),
    }));

    // Re-import after mock so memory.js binds to mocked generateText
    const { extractMemories } = await import(`../lib/memory.js?cap=${Date.now()}`);

    let receivedFacts = null;
    const dbUtils = {
      upsertMemories: (_userId, facts) => {
        receivedFacts = facts;
      },
    };

    await extractMemories({
      model: {},
      userMessage: "hi",
      assistantMessage: "hello",
      userId: 1,
      chatId: "chat-1",
      dbUtils,
    });

    expect(receivedFacts).not.toBeNull();
    expect(receivedFacts.length).toBe(MEMORY_EXTRACTION_MAX_FACTS_PER_TURN);
    expect(receivedFacts.length).toBe(10);
  });

  test("memory middleware skips injection when the request disables memory", async () => {
    const middleware = createMemoryMiddleware({
      getSetting: () => "true",
      getUserMemoryEnabled: () => true,
      getMemoriesForUser: () => [{ fact: "prefers Python" }],
    });

    const params = {
      system: "Base system prompt",
      providerOptions: {
        memory: { userId: 1, chatId: "chat-1", enabled: false },
      },
    };

    const result = await middleware.transformParams({ params });

    expect(result).toEqual(params);
  });
});
