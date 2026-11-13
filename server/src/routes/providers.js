import {
  categorizeProvider,
  getAvailableProviders as getNativeProviders,
  TIMEOUTS,
} from "@faster-chat/shared";
import { Hono } from "hono";
import { z } from "zod";
import db, { dbUtils } from "../lib/db.js";
import { decryptApiKey, encryptApiKey } from "../lib/encryption.js";
import { isLikelyValidApiKey } from "../lib/providerErrors.js";
import { HTTP_STATUS } from "../lib/httpStatus.js";
import { getModelsForProvider } from "../lib/modelsdev.js";
import { getClientIP } from "../lib/requestUtils.js";
import { validateProviderBaseUrl } from "../lib/ssrf.js";
import { ensureSession, requireRole } from "../middleware/auth.js";

const BulkEnableSchema = z.object({ enabled: z.boolean() });
export const providersRouter = new Hono();
providersRouter.use("*", ensureSession, requireRole("admin"));

const apiKeySchema = z.string().min(1).refine(isLikelyValidApiKey, {
  message:
    "API key contains invalid characters. Paste the raw key — no quotes, bullets, or whitespace artifacts.",
});

const CreateProviderSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  providerType: z.enum(["official", "openai-compatible"]),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: apiKeySchema,
});

const UpdateProviderSchema = z.object({
  displayName: z.string().min(1).optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: apiKeySchema.optional(),
  enabled: z.boolean().optional(),
});

providersRouter.get("/available", async (c) => {
  const nativeProviders = getNativeProviders().map((provider) => ({
    ...provider,
    category: categorizeProvider(provider.id),
  }));
  const allProviders = nativeProviders.sort((a, b) => {
    const order = { local: 0, official: 1 };
    return order[a.category] - order[b.category];
  });
  return c.json({ providers: allProviders });
});

providersRouter.get("/", async (c) => {
  const providers = dbUtils.getAllProviders();
  const providersWithCounts = providers.map((p) => ({
    id: p.id,
    name: p.name,
    display_name: p.display_name,
    provider_type: p.provider_type,
    base_url: p.base_url,
    enabled: p.enabled === 1,
    has_key: !!p.encrypted_key,
    model_count: dbUtils.getModelsByProvider(p.id).length,
    created_at: p.created_at,
  }));
  return c.json({ providers: providersWithCounts });
});

providersRouter.post("/", async (c) => {
  const body = await c.req.json();
  const { name, displayName, providerType, baseUrl, apiKey } = CreateProviderSchema.parse(body);
  const normalizedBaseUrl = baseUrl || null;

  if (normalizedBaseUrl && !validateProviderBaseUrl(normalizedBaseUrl)) {
    return c.json({ error: "Invalid base URL" }, HTTP_STATUS.BAD_REQUEST);
  }

  if (dbUtils.getProviderByName(name))
    return c.json({ error: "Provider already exists" }, HTTP_STATUS.BAD_REQUEST);

  const providerId = dbUtils.createProvider(
    name,
    displayName,
    providerType,
    normalizedBaseUrl,
    ...Object.values(encryptApiKey(apiKey))
  );

  dbUtils.createAuditLog(
    c.get("user").id,
    "provider_created",
    "provider",
    providerId,
    name,
    getClientIP(c)
  );

  let models = [];
  try {
    models = await fetchModelsForProvider(name, normalizedBaseUrl, {
      apiKey,
      providerType,
      displayName,
    });
    for (const model of models) {
      const modelId = dbUtils.createModel(
        providerId,
        model.model_id,
        model.display_name,
        model.enabled,
        model.model_type || "text"
      );
      if (model.metadata) dbUtils.setModelMetadata(modelId, model.metadata);
    }
  } catch (error) {
    console.error("Failed to fetch provider models:", error.message);
  }

  return c.json(
    { provider: { id: providerId, name, display_name: displayName, model_count: models.length } },
    HTTP_STATUS.CREATED
  );
});

providersRouter.put("/:id", async (c) => {
  const providerId = parseInt(c.req.param("id"), 10);
  const body = await c.req.json();
  const updates = UpdateProviderSchema.parse(body);

  if (!dbUtils.getProviderById(providerId))
    return c.json({ error: "Provider not found" }, HTTP_STATUS.NOT_FOUND);

  if (updates.baseUrl && !validateProviderBaseUrl(updates.baseUrl)) {
    return c.json({ error: "Invalid base URL" }, HTTP_STATUS.BAD_REQUEST);
  }

  if (updates.apiKey) {
    const { encryptedKey, iv, authTag } = encryptApiKey(updates.apiKey);
    Object.assign(updates, { encryptedKey, iv, authTag });
    delete updates.apiKey;
    dbUtils.createAuditLog(
      c.get("user").id,
      "api_key_changed",
      "provider",
      providerId,
      dbUtils.getProviderById(providerId).name,
      getClientIP(c)
    );
  }

  dbUtils.updateProvider(providerId, updates);
  return c.json({ success: true });
});

providersRouter.post("/:id/models/enable", async (c) => {
  const providerId = parseInt(c.req.param("id"), 10);
  const { enabled } = BulkEnableSchema.parse(await c.req.json());

  if (!dbUtils.getProviderById(providerId))
    return c.json({ error: "Provider not found" }, HTTP_STATUS.NOT_FOUND);

  dbUtils.setModelsEnabledForProvider(providerId, enabled);
  return c.json({ success: true });
});

providersRouter.post("/:id/refresh-models", async (c) => {
  const providerId = parseInt(c.req.param("id"), 10);

  if (!dbUtils.getProviderById(providerId))
    return c.json({ error: "Provider not found" }, HTTP_STATUS.NOT_FOUND);

  const provider = dbUtils.getProviderById(providerId);
  const normalizedBaseUrl = provider.base_url || null;
  if (normalizedBaseUrl !== provider.base_url)
    dbUtils.updateProvider(providerId, { baseUrl: normalizedBaseUrl });

  const apiKey = provider.encrypted_key
    ? decryptApiKey(provider.encrypted_key, provider.iv, provider.auth_tag)
    : null;
  const models = await fetchModelsForProvider(provider.name, normalizedBaseUrl, {
    providerType: provider.provider_type,
    displayName: provider.display_name,
    apiKey,
  });

  db.transaction(() => {
    dbUtils.deleteModelsForProvider(providerId);
    for (const model of models) {
      const modelId = dbUtils.createModel(
        providerId,
        model.model_id,
        model.display_name,
        model.enabled,
        model.model_type || "text"
      );
      if (model.metadata) dbUtils.setModelMetadata(modelId, model.metadata);
    }
  })();

  return c.json({ success: true, model_count: models.length });
});

providersRouter.delete("/:id", async (c) => {
  const providerId = parseInt(c.req.param("id"), 10);

  if (!dbUtils.getProviderById(providerId))
    return c.json({ error: "Provider not found" }, HTTP_STATUS.NOT_FOUND);

  const provider = dbUtils.getProviderById(providerId);
  dbUtils.deleteProvider(providerId);
  dbUtils.createAuditLog(
    c.get("user").id,
    "provider_deleted",
    "provider",
    providerId,
    provider.name,
    getClientIP(c)
  );
  return c.json({ success: true });
});

const MODEL_FETCHERS = {
  ollama: fetchOllamaModels,
  lmstudio: (url) => fetchOpenAICompatibleModels(url, "LM Studio"),
  "llama-cpp": (url) => fetchOpenAICompatibleModels(url, "llama.cpp server"),
  llamafile: (url) => fetchOpenAICompatibleModels(url, "llamafile server"),
  omlx: (url) => fetchOpenAICompatibleModels(url, "oMLX"),
};

async function fetchModelsForProvider(
  providerName,
  baseUrl,
  { providerType, displayName, apiKey } = {}
) {
  const fetcher = MODEL_FETCHERS[providerName];
  if (fetcher) return await fetcher(baseUrl, apiKey);
  if (providerType === "openai-compatible")
    return await fetchOpenAICompatibleModels(baseUrl, displayName || providerName);
  return await getModelsForProvider(providerName);
}

async function fetchOllamaModels(baseUrl) {
  if (!validateProviderBaseUrl(baseUrl)) throw new Error("Invalid Ollama base URL");
  try {
    const response = await fetch(`${baseUrl.replace("/v1", "")}/api/tags`, {
      signal: AbortSignal.timeout(TIMEOUTS.OLLAMA_FETCH),
    });

    if (!response.ok) throw new Error(`Ollama API returned ${response.status}`);
    const data = await response.json();
    if (!data.models || !Array.isArray(data.models))
      throw new Error("Invalid response from Ollama");

    return data.models.map((m) => ({
      model_id: m.name.replace(/:latest$/, ""),
      display_name: m.name.replace(/:latest$/, ""),
      enabled: true,
      metadata: {
        context_window: 8192,
        max_output_tokens: 2048,
        supports_streaming: true,
        supports_vision: /llava|vision/.test(m.name),
        supports_tools: /qwen|llama3/.test(m.name),
        input_price_per_1m: 0,
        output_price_per_1m: 0,
        size_bytes: m.size,
        modified_at: m.modified_at,
      },
    }));
  } catch (error) {
    console.error("Failed to fetch Ollama models:", error.message);
    throw new Error(`Could not connect to Ollama at ${baseUrl}. Make sure Ollama is running.`);
  }
}

async function fetchOpenAICompatibleModels(baseUrl, displayProvider = "OpenAI-compatible server") {
  if (!validateProviderBaseUrl(baseUrl)) throw new Error(`Invalid ${displayProvider} base URL`);
  try {
    const modelsUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/v1/models`;

    const response = await fetch(modelsUrl, { signal: AbortSignal.timeout(TIMEOUTS.OLLAMA_FETCH) });

    if (!response.ok) throw new Error(`${displayProvider} API returned ${response.status}`);
    const data = await response.json();
    if (!data.data || !Array.isArray(data.data))
      throw new Error(`Invalid response from ${displayProvider}`);

    const chatModels = data.data.filter((m) => !/embedding/.test(m.id.toLowerCase()));

    return chatModels.map((m) => ({
      model_id: m.id,
      display_name: m.id,
      enabled: true,
      metadata: {
        context_window: 8192,
        max_output_tokens: 2048,
        supports_streaming: true,
        supports_vision: /vision|llava/.test(m.id.toLowerCase()),
        supports_tools: /qwen|llama/.test(m.id.toLowerCase()),
        input_price_per_1m: 0,
        output_price_per_1m: 0,
        owned_by: m.owned_by || "local",
      },
    }));
  } catch (error) {
    console.error(`Failed to fetch ${displayProvider} models:`, error.message);
    throw new Error(`Could not connect to ${displayProvider} at ${baseUrl}`);
  }
}
