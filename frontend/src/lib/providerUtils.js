/**
 * Get the logo URL for a provider from models.dev
 * @param {string} providerId - The provider identifier (e.g., 'anthropic', 'openai')
 * @returns {string} The URL to the provider's logo SVG
 */
export function getProviderLogoUrl(providerId) {
  return `https://models.dev/logos/${providerId}.svg`;
}

// RGB tuples keyed by provider id for tinted logo backgrounds
export const providerBrandColors = {
  openai: [116, 170, 156],
  anthropic: [222, 115, 86],
  google: [66, 133, 244],
  ollama: [33, 33, 33],
  meta: [0, 102, 204],
  qwen: [97, 60, 230],
};

export function getProviderBranding(providerId) {
  const brandRgb = providerBrandColors[providerId];

  if (!brandRgb) {
    return { className: "", style: undefined };
  }

  return {
    className: "",
    style: {
      backgroundColor: `rgba(${brandRgb.join(",")}, 1)`,
    },
  };
}
