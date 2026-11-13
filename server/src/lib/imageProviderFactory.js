import { ASPECT_RATIO_SIZES, openAiSizeTable } from "@faster-chat/shared";

function toDataUrl(reference) {
  return `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`;
}

export async function generateImageForProvider(providerName, apiKey, options) {
  const { prompt, aspectRatio, model, baseUrl, references, complexity } = options;

  switch (providerName) {
    case "openai":
      return generateWithOpenAI(apiKey, { prompt, aspectRatio, model, references, complexity });

    case "google":
      return generateWithGoogle(apiKey, { prompt, aspectRatio, model, references });

    default:
      if (baseUrl) {
        return generateWithOpenAICompatible(apiKey, {
          prompt,
          aspectRatio,
          model,
          baseUrl,
          references,
        });
      }
      throw new Error(`Image generation not supported for provider: ${providerName}`);
  }
}

async function generateWithOpenAI(apiKey, options) {
  const { prompt, aspectRatio, model = "gpt-image-2.6-flare", references, complexity } = options;

  const size = openAiSizeTable(model)[aspectRatio];
  if (!size) {
    throw new Error(`Aspect ratio ${aspectRatio} not supported by ${model}`);
  }

  let response;
  if (references) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    if (complexity) {
      form.append("complexity", complexity);
    }
    if (!model.startsWith("dall-e")) {
      form.append("output_format", "png");
    }
    for (const reference of references) {
      form.append(
        "image[]",
        new Blob([reference.buffer], { type: reference.mimeType }),
        `reference.${reference.mimeType.split("/")[1] || "png"}`
      );
    }
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        ...(complexity && { complexity }),
        ...(model.startsWith("dall-e")
          ? { response_format: "b64_json" }
          : { output_format: "png" }),
      }),
    });
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI generation failed");
  }

  const base64Data = data.data?.[0]?.b64_json;
  if (!base64Data) {
    throw new Error("No image in response");
  }

  const buffer = Buffer.from(base64Data, "base64");
  return { buffer, mimeType: "image/png" };
}

async function generateWithOpenAICompatible(apiKey, options) {
  const { prompt, aspectRatio, model, baseUrl, references } = options;

  const base = baseUrl.replace(/\/$/, "");
  let response;
  if (references) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", ASPECT_RATIO_SIZES[aspectRatio]);
    for (const reference of references) {
      form.append(
        "image[]",
        new Blob([reference.buffer], { type: reference.mimeType }),
        `reference.${reference.mimeType.split("/")[1] || "png"}`
      );
    }
    response = await fetch(`${base}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey || "local"}` },
      body: form,
    });
  } else {
    response = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey || "local"}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, prompt, n: 1, size: ASPECT_RATIO_SIZES[aspectRatio] }),
    });
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Image generation failed");
  }

  const base64Data = data.data?.[0]?.b64_json;
  if (!base64Data) {
    throw new Error("No image in response");
  }

  return {
    buffer: Buffer.from(base64Data, "base64"),
    mimeType: data.output_format ? `image/${data.output_format}` : "image/png",
  };
}

async function generateWithGoogle(apiKey, options) {
  const { prompt, aspectRatio, model, references } = options;

  const parts = [];
  if (references) {
    for (const reference of references) {
      parts.push({
        inlineData: { data: reference.buffer.toString("base64"), mimeType: reference.mimeType },
      });
    }
  }
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw googleError(response.status, data.error);
  }

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData && !p.thought);
  if (!part) {
    throw new Error("No image in Google response");
  }

  return {
    buffer: Buffer.from(part.inlineData.data, "base64"),
    mimeType: part.inlineData.mimeType || "image/png",
  };
}

function googleError(status, error = {}) {
  const message = error.message || "";

  if (status === 429 || error.status === "RESOURCE_EXHAUSTED") {
    return new Error(`rate limit exceeded: ${message}`);
  }

  const invalidKey = JSON.stringify(error).includes("API_KEY_INVALID");
  if (status === 401 || status === 403 || (status === 400 && invalidKey)) {
    return new Error(`authentication failed: ${message}`);
  }

  return new Error(message || "Google generation failed");
}
