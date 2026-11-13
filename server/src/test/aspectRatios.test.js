import { describe, test, expect } from "bun:test";
import { IMAGE_GENERATION, openAiSizeTable, supportedAspectRatios } from "@faster-chat/shared";

describe("supportedAspectRatios", () => {
  test("dall-e models get the dall-e sizes", () => {
    const ratios = supportedAspectRatios("openai", "dall-e-3");
    expect(ratios).toHaveLength(3);
    expect(ratios).toContain("16:9");
  });

  test("gpt-image models get the gpt-image sizes", () => {
    const ratios = supportedAspectRatios("openai", "gpt-image-1");
    expect(ratios).toHaveLength(3);
    expect(ratios).toContain("3:2");
  });

  test.each([
    "gpt-image-2",
    "gpt-image-2-2026-04-21",
    "gpt-image-2.5-sunburst",
    "gpt-image-2.5-flare-2026-09-08",
    "gpt-image-2.6-flare",
    "gpt-image-2.6-sunburst",
  ])("%s supports all ratios with exact dimensions", (model) => {
    expect(supportedAspectRatios("openai", model)).toEqual(IMAGE_GENERATION.ASPECT_RATIOS);
    for (const [ratio, size] of Object.entries(openAiSizeTable(model))) {
      const [width, height] = size.split("x").map(Number);
      const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
      expect(width * ratioHeight).toBe(height * ratioWidth);
      expect(width % 16).toBe(0);
      expect(height % 16).toBe(0);
    }
  });

  test("GPT Image 1.5 retains its standard size restrictions", () => {
    expect(supportedAspectRatios("openai", "gpt-image-1.5")).toEqual(["1:1", "3:2", "2:3"]);
  });

  test("other providers get every ratio", () => {
    expect(supportedAspectRatios("replicate", "flux")).toEqual(IMAGE_GENERATION.ASPECT_RATIOS);
    expect(supportedAspectRatios("sd-server", "sdxl")).toHaveLength(7);
    expect(supportedAspectRatios(undefined, undefined)).toHaveLength(7);
  });
});
