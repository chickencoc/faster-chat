import { test, expect } from "bun:test";
import {
  createTestApp,
  resetDatabase,
  seedAdminUser,
  seedMemberUser,
  makeRequest,
} from "./helpers.js";
import { dbUtils } from "../lib/db.js";
import { encryptApiKey } from "../lib/encryption.js";

test("OpenAI chat sends the selected reasoning level and native tools to Responses", async () => {
  resetDatabase();
  const app = createTestApp();
  const { user, cookie } = await seedAdminUser(app);
  const { encryptedKey, iv, authTag } = encryptApiKey("sk-fixture");
  const provider = dbUtils.createProvider(
    "openai",
    "OpenAI",
    "official",
    null,
    encryptedKey,
    iv,
    authTag
  );
  dbUtils.createModel(provider, "gpt-6.1-terra", "GPT-6.1 Terra", true, "text");
  dbUtils.createModel(provider, "gpt-image-2.6-flare", "Flare", true, "image");
  dbUtils.createChat("native-tools-chat", user.id);

  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    requests.push(JSON.parse(init.body));
    const item = { type: "message", id: "msg_1" };
    const reasoning = { type: "reasoning", id: "rs_1" };
    const events = [
      { type: "response.output_item.added", item: reasoning, output_index: 0 },
      {
        type: "response.reasoning_summary_text.delta",
        item_id: reasoning.id,
        summary_index: 0,
        delta: "Checked the sources.",
      },
      { type: "response.output_item.done", item: reasoning, output_index: 0 },
      { type: "response.output_item.added", item, output_index: 0 },
      { type: "response.output_text.delta", item_id: item.id, delta: "Hello" },
      {
        type: "response.output_text.annotation.added",
        annotation: {
          type: "url_citation",
          start_index: 0,
          end_index: 5,
          url: "https://example.com/source",
          title: "Example",
        },
      },
      { type: "response.output_item.done", item, output_index: 0 },
      { type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 1 } } },
    ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
      headers: { "Content-Type": "text/event-stream" },
    });
  };
  try {
    const response = await makeRequest(app, "POST", "/api/chats/native-tools-chat/completion", {
      cookie,
      body: {
        model: "gpt-6.1-terra",
        reasoningEffort: "xhigh",
        messages: [{ id: "first", role: "user", content: "Hello" }],
      },
    });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('"type":"source-url"');
    expect(stream).toContain('"type":"reasoning-delta"');
    expect(stream).toContain("Checked the sources.");
    expect(stream).toContain("https://example.com/source");
    expect(stream).not.toContain('"type":"error"');
    expect(requests).toHaveLength(1);
    expect(requests[0].reasoning.effort).toBe("xhigh");
    const chatResponse = await makeRequest(app, "GET", "/api/chats/native-tools-chat", { cookie });
    expect(await chatResponse.json()).toMatchObject({
      lastModel: "gpt-6.1-terra",
      reasoningEffort: "xhigh",
    });
    expect(requests[0].reasoning.summary).toBe("auto");
    expect(requests[0].tools).toEqual([
      { type: "web_search" },
      { type: "code_interpreter", container: { type: "auto" } },
      {
        type: "image_generation",
        model: "gpt-image-2.6-flare",
        output_format: "png",
        partial_images: 0,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generated files are copied once, saved with the reply, and downloadable without OpenAI", async () => {
  resetDatabase();
  const app = createTestApp();
  const { user, cookie } = await seedAdminUser(app);
  const member = await seedMemberUser(app, cookie);
  const { encryptedKey, iv, authTag } = encryptApiKey("sk-fixture");
  const provider = dbUtils.createProvider(
    "openai",
    "OpenAI",
    "official",
    null,
    encryptedKey,
    iv,
    authTag
  );
  dbUtils.createModel(provider, "gpt-6.1-sol", "GPT-6.1 Sol", true, "text");
  const chatId = "generated-file-chat";
  dbUtils.createChat(chatId, user.id);

  const html = "<!doctype html><p>파일 내용</p>";
  const csv = "item,quantity\nApple,2\n";
  const xlsx = await Bun.file(new URL("./fixtures/test.xlsx", import.meta.url)).arrayBuffer();
  const artifacts = [
    { ref: "cfile_html", name: "정리.html", body: html, mime: "text/html" },
    { ref: "cfile_csv", name: "stock.csv", body: csv, mime: "text/csv" },
    {
      ref: "cfile_xlsx",
      name: "stock.xlsx",
      body: xlsx,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ];
  const downloads = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.endsWith("/content")) {
      downloads.push(target);
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk-fixture");
      const file = artifacts.find(({ ref }) => target.endsWith(`/${ref}/content`));
      return file ? new Response(file.body) : new Response("Expired", { status: 404 });
    }

    expect(target).toBe("https://api.openai.com/v1/responses");
    const request = JSON.parse(init.body);
    expect(JSON.stringify(request.input)).toContain("create it with Code Interpreter");
    const message = { type: "message", id: "msg_1" };
    const citation = (file_id, filename) => ({
      type: "response.output_text.annotation.added",
      annotation: {
        type: "container_file_citation",
        container_id: "cntr_test",
        file_id,
        filename,
        start_index: 0,
        end_index: 5,
      },
    });
    const codeInterpreterCall = {
      type: "code_interpreter_call",
      id: "ci_1",
      container_id: "cntr_test",
      code: null,
      outputs: null,
      status: "in_progress",
    };
    const events = [
      { type: "response.output_item.added", item: codeInterpreterCall, output_index: 0 },
      {
        type: "response.code_interpreter_call_code.done",
        item_id: "ci_1",
        output_index: 0,
        code: "print('generated')",
      },
      {
        type: "response.output_item.done",
        item: { ...codeInterpreterCall, code: "print('generated')", status: "completed" },
        output_index: 0,
      },
      { type: "response.output_item.added", item: message, output_index: 1 },
      { type: "response.output_text.delta", item_id: message.id, delta: "파일을 생성했습니다." },
      ...artifacts.map(({ ref, name }) => citation(ref, name)),
      citation("cfile_html", "정리.html"),
      citation("cfile_expired", "expired.csv"),
      { type: "response.output_item.done", item: message, output_index: 1 },
      { type: "response.completed", response: { usage: { input_tokens: 1, output_tokens: 1 } } },
    ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
      headers: { "Content-Type": "text/event-stream" },
    });
  };

  const reply = { id: "generated-reply", role: "assistant", content: "파일을 생성했습니다." };
  try {
    const completion = await makeRequest(app, "POST", `/api/chats/${chatId}/completion`, {
      cookie,
      body: {
        model: "gpt-6.1-sol",
        messages: [{ id: "request", role: "user", content: "Create an HTML file" }],
      },
    });
    expect(completion.status).toBe(200);
    const stream = await completion.text();
    const finish = stream.split("\n").find((line) => line.startsWith('data: {"type":"finish"'));
    const metadata = JSON.parse(finish.slice(6)).messageMetadata;
    const { fileIds } = metadata;
    reply.fileIds = fileIds;
    expect(stream).toContain('"toolName":"codeInterpreter"');
    expect(stream).not.toContain('"type":"source-document"');
    expect(stream).not.toContain('"type":"error"');
    expect(metadata.generatedFileDownloadFailed).toBe(true);
    expect(fileIds).toHaveLength(artifacts.length);
    expect(downloads).toEqual([
      ...artifacts.map(
        ({ ref }) => `https://api.openai.com/v1/containers/cntr_test/files/${ref}/content`
      ),
      "https://api.openai.com/v1/containers/cntr_test/files/cfile_expired/content",
    ]);
    globalThis.fetch = originalFetch;

    const saved = await makeRequest(app, "POST", `/api/chats/${chatId}/messages`, {
      cookie,
      body: reply,
    });
    expect(saved.status).toBe(201);
    const history = await makeRequest(app, "GET", `/api/chats/${chatId}/messages`, { cookie });
    expect((await history.json()).messages).toEqual([expect.objectContaining(reply)]);

    const forbidden = await makeRequest(app, "GET", `/api/files/${fileIds[0]}/content`, {
      cookie: member.cookie,
    });
    expect(forbidden.status).toBe(403);
    for (const [index, { name, mime, body }] of artifacts.entries()) {
      const response = await makeRequest(app, "GET", `/api/files/${fileIds[index]}/content`, {
        cookie,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(mime);
      const disposition = response.headers.get("Content-Disposition");
      expect(disposition).toStartWith("attachment;");
      expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(body));
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const file of dbUtils.getFilesByUserId(user.id)) {
      await makeRequest(app, "DELETE", `/api/files/${file.id}`, { cookie });
    }
  }
});
