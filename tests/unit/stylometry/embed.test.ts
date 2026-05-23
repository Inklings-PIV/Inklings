import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock `ai`'s embedMany — we never want the test to hit the OpenAI API.
// The mock records the chunk array it received so we can assert chunking.
const embedManyMock = vi.fn();
vi.mock("ai", () => ({
  embedMany: (args: { values: string[] }) => embedManyMock(args),
}));

// Mock `@ai-sdk/openai` so importing embed.ts doesn't even try to construct
// a real provider client.
vi.mock("@ai-sdk/openai", () => ({
  openai: { embedding: () => ({ provider: "mock", modelId: "text-embedding-3-small" }) },
}));

import { chunkText, EMBEDDING_DIM, embedText, meanVector } from "@/lib/stylometry/embed";

beforeEach(() => {
  embedManyMock.mockReset();
});

describe("chunkText", () => {
  it("returns the input as a single chunk when under the budget", () => {
    expect(chunkText("short text", 100)).toEqual(["short text"]);
  });

  it("splits long text into chunks ≤ the budget", () => {
    const text = "x".repeat(250);
    const chunks = chunkText(text, 100);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join("")).toBe(text);
  });

  it("prefers sentence-end breaks within the look-back window", () => {
    const head = "alpha. ".repeat(20); // 140 chars, sentence boundaries everywhere
    const tail = "x".repeat(60);
    const chunks = chunkText(head + tail, 160);
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk should end on a sentence, not mid-word
    expect(chunks[0]?.endsWith(". ") || chunks[0]?.endsWith(".")).toBe(true);
  });
});

describe("meanVector", () => {
  it("element-wise averages N vectors", () => {
    expect(
      meanVector([
        [1, 2, 3],
        [3, 2, 1],
      ]),
    ).toEqual([2, 2, 2]);
  });

  it("returns a zero vector of EMBEDDING_DIM for empty input", () => {
    const v = meanVector([]);
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(v.every((x) => x === 0)).toBe(true);
  });
});

describe("embedText", () => {
  it("returns a zero vector for empty input without calling the model", async () => {
    const v = await embedText("");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("embeds short text as one chunk", async () => {
    embedManyMock.mockResolvedValue({ embeddings: [[1, 1, 1]] });
    await embedText("a short paragraph.");
    expect(embedManyMock).toHaveBeenCalledTimes(1);
    const args = embedManyMock.mock.calls[0]?.[0];
    expect(args.values).toHaveLength(1);
  });

  it("chunks long text and averages the per-chunk embeddings", async () => {
    embedManyMock.mockResolvedValue({
      embeddings: [
        [1, 1, 1],
        [3, 3, 3],
      ],
    });
    const longText = "x".repeat(50_000);
    const v = await embedText(longText);
    const args = embedManyMock.mock.calls[0]?.[0];
    expect(args.values.length).toBeGreaterThanOrEqual(2);
    expect(v).toEqual([2, 2, 2]);
  });

  it("batches embedMany calls when the corpus exceeds the per-request char cap", async () => {
    // Each call returns one embedding per chunk it was given.
    embedManyMock.mockImplementation((args: { values: string[] }) => ({
      embeddings: args.values.map(() => [1, 1, 1]),
    }));
    // 1.5M chars across many chunks ⇒ should not fit in a single request.
    const huge = "x".repeat(1_500_000);
    await embedText(huge);
    expect(embedManyMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
