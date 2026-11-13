export const OPENAI_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"];
export const OPENAI_IMAGE_COMPLEXITIES = ["low", "medium", "high"];
export const OPENAI_IMAGE_MODELS = ["gpt-image-2.6-flare", "gpt-image-2.6-sunburst"];

const REASONING_MODELS = new Set(["gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna"]);

export function supportsOpenAIReasoning(provider, model) {
  return provider === "openai" && REASONING_MODELS.has(model);
}

export function supportsOpenAIImageComplexity(provider, model) {
  return provider === "openai" && OPENAI_IMAGE_MODELS.includes(model);
}
