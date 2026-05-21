import { describe, expect, it } from "vitest";
import { SEED_BOOKS } from "@/lib/ingestion/seed-list";

describe("SEED_BOOKS", () => {
  it("has a meaningful number of entries (>= 25)", () => {
    expect(SEED_BOOKS.length).toBeGreaterThanOrEqual(25);
  });

  it("has no duplicate gutenberg IDs", () => {
    const ids = SEED_BOOKS.map((b) => b.gutenbergId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses positive integer Gutenberg IDs", () => {
    for (const b of SEED_BOOKS) {
      expect(Number.isInteger(b.gutenbergId)).toBe(true);
      expect(b.gutenbergId).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty title and author", () => {
    for (const b of SEED_BOOKS) {
      expect(b.title.trim().length).toBeGreaterThan(0);
      expect(b.author.trim().length).toBeGreaterThan(0);
    }
  });

  it("spans multiple authors", () => {
    const authors = new Set(SEED_BOOKS.map((b) => b.author));
    expect(authors.size).toBeGreaterThanOrEqual(15);
  });
});
