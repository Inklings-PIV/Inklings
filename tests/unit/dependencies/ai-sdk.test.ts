// @vitest-environment node

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany, generateObject, generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Exercise the real SDK and provider adapters. Only their HTTP transport is
// replaced, so these checks cannot call a paid API or need provider credentials.
describe("AI SDK provider compatibility", () => {
  it("decodes structured Anthropic colour output and preserves system instructions", async () => {
    const colour = { hue: 220, saturation: 60, lightness: 50, justification: "Calm prose." };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        id: "offline-message",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: JSON.stringify(colour) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    );
    const anthropic = createAnthropic({ apiKey: "offline-test-only", fetch });
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: z.object({
        hue: z.number(),
        saturation: z.number(),
        lightness: z.number(),
        justification: z.string(),
      }),
      system: "Read the colour of this prose.",
      prompt: "A quiet afternoon.",
      maxRetries: 0,
    });

    expect(result.object).toEqual(colour);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.system).toEqual([{ type: "text", text: "Read the colour of this prose." }]);
  });

  it("returns plain-text rewrites through the Anthropic adapter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        id: "offline-rewrite",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: "The afternoon was quiet." }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    const anthropic = createAnthropic({ apiKey: "offline-test-only", fetch });
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: "Rewrite without commentary.",
      prompt: "A quiet afternoon.",
      maxRetries: 0,
    });

    expect(result.text).toBe("The afternoon was quiet.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves OpenAI embedding order and the requested model", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        object: "list",
        model: "text-embedding-3-small",
        data: [
          { object: "embedding", index: 0, embedding: [1, 0, 0] },
          { object: "embedding", index: 1, embedding: [0, 1, 0] },
        ],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      }),
    );
    const openai = createOpenAI({ apiKey: "offline-test-only", fetch });
    const result = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: ["First passage.", "Second passage."],
      maxRetries: 0,
    });

    expect(result.embeddings).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.input).toEqual(["First passage.", "Second passage."]);
    expect(body.model).toBe("text-embedding-3-small");
  });
});
