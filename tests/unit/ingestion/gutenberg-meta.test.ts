import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGutenbergRdf } from "@/lib/ingestion/gutenberg-meta";

const fixture = (name: string) => readFileSync(resolve("tests/fixtures", name), "utf8");

describe("parseGutenbergRdf", () => {
  it("parses Pride and Prejudice (#1342) end-to-end", () => {
    const meta = parseGutenbergRdf(fixture("pg1342.rdf"), 1342);

    expect(meta).not.toBeNull();
    expect(meta?.id).toBe(1342);
    expect(meta?.title).toBe("Pride and Prejudice");
    expect(meta?.language).toBe("en");

    expect(meta?.authors).toHaveLength(1);
    const author = meta?.authors[0];
    expect(author?.name).toBe("Jane Austen");
    expect(author?.gutenbergId).toBe(68);
    expect(author?.birthYear).toBe(1775);
    expect(author?.deathYear).toBe(1817);

    expect(meta?.subjects.length).toBeGreaterThan(0);
    expect(meta?.subjects).toContain("England -- Fiction");
  });

  it("returns null for malformed XML", () => {
    expect(parseGutenbergRdf("<<<not xml>>>", 1342)).toBeNull();
  });

  it("returns null when the ebook node is missing", () => {
    expect(parseGutenbergRdf("<rdf:RDF></rdf:RDF>", 999)).toBeNull();
  });

  it("returns null when the title is missing", () => {
    const xml = '<rdf:RDF><pgterms:ebook rdf:about="ebooks/1"></pgterms:ebook></rdf:RDF>';
    expect(parseGutenbergRdf(xml, 1)).toBeNull();
  });

  it("flips 'Lastname, Firstname' to 'Firstname Lastname'", () => {
    const xml = `
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:pgterms="http://www.gutenberg.org/2009/pgterms/"
               xmlns:dcterms="http://purl.org/dc/terms/">
        <pgterms:ebook rdf:about="ebooks/42">
          <dcterms:title>Test Book</dcterms:title>
          <dcterms:creator>
            <pgterms:agent rdf:about="2009/agents/99">
              <pgterms:name>Carroll, Lewis</pgterms:name>
            </pgterms:agent>
          </dcterms:creator>
        </pgterms:ebook>
      </rdf:RDF>`;
    const meta = parseGutenbergRdf(xml, 42);
    expect(meta?.authors[0]?.name).toBe("Lewis Carroll");
    expect(meta?.authors[0]?.gutenbergId).toBe(99);
  });

  it("leaves single-token names alone", () => {
    const xml = `
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:pgterms="http://www.gutenberg.org/2009/pgterms/"
               xmlns:dcterms="http://purl.org/dc/terms/">
        <pgterms:ebook rdf:about="ebooks/7">
          <dcterms:title>Anonymous Tale</dcterms:title>
          <dcterms:creator>
            <pgterms:agent rdf:about="2009/agents/1">
              <pgterms:name>Anonymous</pgterms:name>
            </pgterms:agent>
          </dcterms:creator>
        </pgterms:ebook>
      </rdf:RDF>`;
    const meta = parseGutenbergRdf(xml, 7);
    expect(meta?.authors[0]?.name).toBe("Anonymous");
  });
});
