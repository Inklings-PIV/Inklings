import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI SDK so the test never hits Anthropic. The mock captures the
// args we pass so we can assert on prompt construction.
const generateObjectMock = vi.fn();
vi.mock("ai", () => ({
  generateObject: (args: unknown) => generateObjectMock(args),
}));
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (modelId: string) => ({ provider: "mock", modelId }),
}));

import { deriveLLM } from "@/lib/colour/llm";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

function features(overrides: Partial<ClassicalFeatures> = {}): ClassicalFeatures {
  return {
    wordCount: 50000,
    sentenceCount: 3000,
    sentenceLength: { mean: 16, std: 8, p50: 14, p90: 28 },
    typeTokenRatio: 0.15,
    mtld: 70,
    punctuation: {
      comma: 50,
      period: 60,
      semicolon: 5,
      colon: 3,
      questionMark: 4,
      exclamationMark: 6,
      emDash: 8,
      parenthesis: 2,
    },
    functionWords: {},
    ...overrides,
  };
}

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("deriveLLM", () => {
  it("returns the model's structured object", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        hue: 200,
        saturation: 50,
        lightness: 60,
        justification: "cool, restrained, ironic",
      },
    });
    const out = await deriveLLM({
      title: "Pride and Prejudice",
      authorName: "Jane Austen",
      classical: features(),
    });
    expect(out).toEqual({
      hue: 200,
      saturation: 50,
      lightness: 60,
      justification: "cool, restrained, ironic",
    });
  });

  it("includes title and author in the prompt", async () => {
    generateObjectMock.mockResolvedValue({
      object: { hue: 0, saturation: 50, lightness: 50, justification: "x" },
    });
    await deriveLLM({
      title: "Moby Dick",
      authorName: "Herman Melville",
      classical: features(),
    });
    const args = generateObjectMock.mock.calls[0]?.[0];
    expect(args.prompt).toContain("Moby Dick");
    expect(args.prompt).toContain("Herman Melville");
  });

  it("includes classical features in the prompt when present", async () => {
    generateObjectMock.mockResolvedValue({
      object: { hue: 0, saturation: 50, lightness: 50, justification: "x" },
    });
    await deriveLLM({
      title: "T",
      authorName: "A",
      classical: features({ mtld: 91.3 }),
    });
    const args = generateObjectMock.mock.calls[0]?.[0];
    expect(args.prompt).toContain("Stylometry:");
    expect(args.prompt).toContain("91.3");
  });

  it("omits the stylometry block when classical features are null", async () => {
    generateObjectMock.mockResolvedValue({
      object: { hue: 0, saturation: 50, lightness: 50, justification: "x" },
    });
    await deriveLLM({ title: "T", authorName: "A", classical: null });
    const args = generateObjectMock.mock.calls[0]?.[0];
    expect(args.prompt).not.toContain("Stylometry");
  });
});
