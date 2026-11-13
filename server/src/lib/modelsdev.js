/**
 * Integration with models.dev - a community-maintained database of AI models
 * https://models.dev/api.json
 */

import { TIMEOUTS, CACHE_DURATIONS, PROVIDERS } from "@faster-chat/shared";

let cachedDatabase = null;
let lastFetchTime = null;
const DAY_MS = CACHE_DURATIONS.MODELS_DEV;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function koreaDay(timestamp) {
  return Math.floor((timestamp + KST_OFFSET_MS) / DAY_MS);
}
const OPENAI_IMAGE_MODELS = {
  "gpt-image-2.6-flare": "GPT Image 2.6 Flare",
  "gpt-image-2.6-sunburst": "GPT Image 2.6 Sunburst",
};

/**
 * Fetch the models.dev database
 * Caches in memory until the next midnight in Korea.
 */
export async function fetchModelsDevDatabase() {
  const now = Date.now();

  // Return cached if still valid
  if (cachedDatabase && koreaDay(now) === koreaDay(lastFetchTime)) {
    return cachedDatabase;
  }

  try {
    console.log("Fetching models.dev database...");
    const response = await fetch("https://models.dev/api.json", {
      headers: {
        "User-Agent": "faster-chat",
      },
      signal: AbortSignal.timeout(TIMEOUTS.MODELS_DEV_FETCH),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models.dev: ${response.status}`);
    }

    const database = await response.json();
    cachedDatabase = Object.fromEntries(
      Object.entries(database).filter(([id]) => PROVIDERS[id]?.type === "official")
    );
    lastFetchTime = now;
    console.log(`Loaded ${Object.keys(cachedDatabase).length} providers from models.dev`);

    return cachedDatabase;
  } catch (error) {
    console.error("Error fetching models.dev:", error.message);
    // Return cached data if available, even if expired
    if (cachedDatabase) {
      console.log("Using expired cache due to fetch error");
      return cachedDatabase;
    }
    throw error;
  }
}

/**
 * Get cached database without fetching
 */
export function getCachedDatabase() {
  return cachedDatabase;
}

/**
 * Get information about a specific provider
 */
export async function getProviderInfo(providerName) {
  const db = await fetchModelsDevDatabase();
  return db[providerName] || null;
}

function getModelType(modelData) {
  const outputModalities = modelData.modalities?.output || ["text"];

  // If a model can generate images, treat it as an image model so it doesn't show in text lists
  if (outputModalities.includes("image")) {
    return "image";
  }
  return "text";
}

/**
 * Get models for a specific provider
 */
export async function getModelsForProvider(providerName) {
  const providerInfo = await getProviderInfo(providerName);
  if (!providerInfo?.models && providerName !== "openai") {
    return [];
  }

  const models = Object.entries(providerInfo?.models || {}).map(([id, model]) => ({
    model_id: id,
    display_name: model.name || id,
    model_type: getModelType(model),
    output_modalities: model.modalities?.output || ["text"],
    enabled: !model.experimental && model.status !== "deprecated",
    metadata: {
      context_window: model.limit?.context || 0,
      max_output_tokens: model.limit?.output || 0,
      input_price_per_1m: model.cost?.input || 0,
      output_price_per_1m: model.cost?.output || 0,
      cache_read_price_per_1m: model.cost?.cache_read || 0,
      cache_write_price_per_1m: model.cost?.cache_write || 0,
      supports_streaming: (model.modalities?.output || ["text"]).includes("text"),
      supports_vision: model.modalities?.input?.includes("image") || model.attachment,
      supports_tools: model.tool_call !== false,
      supports_reasoning: model.reasoning || false,
      release_date: model.release_date,
      knowledge_cutoff: model.knowledge,
      experimental: model.experimental || false,
      status: model.status,
    },
  }));

  if (providerName === "openai") {
    for (const [model_id, display_name] of Object.entries(OPENAI_IMAGE_MODELS)) {
      if (models.some((model) => model.model_id === model_id)) {
        continue;
      }
      models.push({
        model_id,
        display_name,
        model_type: "image",
        output_modalities: ["image"],
        enabled: false,
        metadata: {
          supports_vision: true,
          supports_tools: false,
          supports_streaming: false,
          supports_image_to_image: true,
        },
      });
    }
  }

  return models;
}

let initPromise = null;
let retryCount = 0;
const MAX_INIT_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 30000;

export function initializeModelsDevCache() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = fetchModelsDevDatabase().catch((error) => {
    console.error("Failed to initialize models.dev cache:", error.message);
    if (retryCount >= MAX_INIT_RETRIES) {
      return null;
    }
    const delay = INITIAL_RETRY_DELAY_MS * 2 ** retryCount;
    retryCount++;
    const retryHandle = setTimeout(() => {
      initPromise = null;
      initializeModelsDevCache();
    }, delay);
    retryHandle.unref?.();
    return null;
  });

  return initPromise;
}

function scheduleMidnightRefresh() {
  const now = Date.now();
  const nextMidnight = (koreaDay(now) + 1) * DAY_MS - KST_OFFSET_MS;
  const handle = setTimeout(async () => {
    try {
      await fetchModelsDevDatabase();
    } catch (error) {
      console.error("Failed to refresh models.dev cache:", error.message);
    } finally {
      scheduleMidnightRefresh();
    }
  }, nextMidnight - now);
  handle.unref?.();
}

scheduleMidnightRefresh();
