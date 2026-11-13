/**
 * AI Provider Metadata
 * Defines all supported AI providers, their capabilities, and configuration requirements
 */

export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    displayName: "Anthropic (Claude)",
    type: "official",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    website: "https://console.anthropic.com/",
    docs: "https://docs.anthropic.com/",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    displayName: "OpenAI (GPT)",
    type: "official",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsImageGeneration: true,
    website: "https://platform.openai.com/",
    docs: "https://platform.openai.com/docs/",
  },
  google: {
    id: "google",
    name: "Google",
    displayName: "Google (Gemini)",
    type: "official",
    requiresApiKey: true,
    requiresBaseUrl: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    supportsImageGeneration: true,
    website: "https://ai.google.dev/",
    docs: "https://ai.google.dev/docs",
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    displayName: "Ollama (Local)",
    type: "openai-compatible",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://host.docker.internal:11434/v1",
    baseUrlPlaceholderDev: "http://localhost:11434/v1",
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    website: "https://ollama.ai/",
    docs: "https://github.com/ollama/ollama/blob/main/docs/api.md",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    displayName: "LM Studio (Local)",
    type: "openai-compatible",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://127.0.0.1:1234/v1",
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
    website: "https://lmstudio.ai/",
    docs: "https://lmstudio.ai/docs",
  },
  "llama-cpp": {
    id: "llama-cpp",
    name: "llama.cpp",
    displayName: "llama.cpp (Local)",
    type: "openai-compatible",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://127.0.0.1:8080/v1",
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  llamafile: {
    id: "llamafile",
    name: "llamafile",
    displayName: "llamafile (Local)",
    type: "openai-compatible",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://127.0.0.1:8080/v1",
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  omlx: {
    id: "omlx",
    name: "oMLX",
    displayName: "oMLX (Local)",
    type: "openai-compatible",
    requiresApiKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://127.0.0.1:8000/v1",
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
};

/**
 * Get list of all providers
 */
export function getAvailableProviders() {
  return Object.values(PROVIDERS);
}

/**
 * Get provider by ID
 */
export function getProvider(id) {
  return PROVIDERS[id];
}

/**
 * Get official (native SDK) providers
 */
export function getOfficialProviders() {
  return Object.values(PROVIDERS).filter((p) => p.type === "official");
}

/**
 * Get OpenAI-compatible providers
 */
export function getOpenAICompatibleProviders() {
  return Object.values(PROVIDERS).filter((p) => p.type === "openai-compatible");
}
