import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { PROVIDER_DEFAULTS, shouldUseChatMethod } from "@faster-chat/shared";

/**
 * Registry of provider factory functions
 * Maps provider names to their initialization functions
 */
const PROVIDER_FACTORIES = {
  anthropic: (config) => createAnthropic({ apiKey: config.apiKey }),
  openai: (config) => createOpenAI({ apiKey: config.apiKey }),
  google: (config) => createGoogleGenerativeAI({ apiKey: config.apiKey }),
  ollama: (config) =>
    createOpenAI({
      baseURL: config.baseUrl || PROVIDER_DEFAULTS.OLLAMA_BASE_URL,
      apiKey: config.apiKey || "ollama",
    }),
};

const PDF_CAPABLE_PROVIDERS = new Set(["anthropic", "openai", "google"]);
const IMAGE_CAPABLE_PROVIDERS = new Set(["anthropic", "openai", "google"]);

export function providerSupportsNativePdf(providerName) {
  return PDF_CAPABLE_PROVIDERS.has(providerName);
}

export function providerSupportsImages(providerName) {
  return IMAGE_CAPABLE_PROVIDERS.has(providerName);
}

/**
 * Create a provider instance
 * @param {string} providerName - Name of the provider
 * @param {object} config - Configuration object with apiKey and baseUrl
 * @returns {object} Provider instance
 */
export function createProviderInstance(providerName, config) {
  const factory = PROVIDER_FACTORIES[providerName];

  if (factory) {
    return factory(config);
  }

  // Default: OpenAI-compatible provider
  return createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey || "local",
  });
}

/**
 * Get a fully configured model instance
 * @param {object} modelRecord - Model record from database
 * @param {function} decryptApiKey - Function to decrypt API key
 * @returns {object} Model instance ready for use
 */
export function getModelInstance(modelRecord, decryptApiKey) {
  const config = {
    apiKey: modelRecord.provider_encrypted_key
      ? decryptApiKey(
          modelRecord.provider_encrypted_key,
          modelRecord.provider_iv,
          modelRecord.provider_auth_tag
        )
      : "",
    baseUrl: modelRecord.provider_base_url,
  };

  const provider = createProviderInstance(modelRecord.provider_name, config);
  const useChatMethod = shouldUseChatMethod(modelRecord.provider_name);

  return useChatMethod ? provider.chat(modelRecord.model_id) : provider(modelRecord.model_id);
}
