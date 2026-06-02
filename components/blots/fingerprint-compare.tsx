"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { type HSLOverride, hueFromHSL } from "@/lib/colour/placeholder";
import { compareFingerprints } from "@/lib/quill/fingerprint";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type CompareBook = {
  bookId: string;
  title: string;
  authorName: string;
  classical: ClassicalFeatures;
  /** Hue used to colour this book's series; null falls back to an ink tone. */
  hue: HSLOverride | null;
};

const FALLBACK_A = "var(--ink-deep)";
const FALLBACK_B = "var(--ink-bleed)";

/**
 * Overlay two books' stylometric fingerprints bar-for-bar so the viewer can
 * *see* how two styles differ on the same axes (style-level compare, S3). Each
 * book keeps its own derived hue as its series colour, tying the comparison
 * back to the rest of Inklings' colour language.
 */
export function FingerprintCompare({ books }: { books: CompareBook[] }) {
  const [aId, setAId] = useState(books[0]?.bookId ?? "");
  const [bId, setBId] = useState(books[1]?.bookId ?? books[0]?.bookId ?? "");

  const a = books.find((x) => x.bookId === aId) ?? books[0];
  const b = books.find((x) => x.bookId === bId) ?? books[1] ?? books[0];
  if (!a || !b) return null;

  const colorA = a.hue ? hueFromHSL(a.hue.hue, a.hue.saturation, a.hue.lightness).css : FALLBACK_A;
  const colorB = b.hue ? hueFromHSL(b.hue.hue, b.hue.saturation, b.hue.lightness).css : FALLBACK_B;
  const rows = compareFingerprints(a.classical, b.classical);

  return (
    <Card className="bg-card/60">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <BookSelect label="A" books={books} value={a.bookId} color={colorA} onChange={setAId} />
          <BookSelect label="B" books={books} value={b.bookId} color={colorB} onChange={setBId} />
        </div>

        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <span className="text-xs text-ink-deep">{row.label}</span>
              <div className="flex flex-col gap-1">
                <Bar value={row.a} color={colorA} title={`${a.title}: ${row.detailA}`} />
                <Bar value={row.b} color={colorB} title={`${b.title}: ${row.detailB}`} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BookSelect({
  label,
  books,
  value,
  color,
  onChange,
}: {
  label: string;
  books: CompareBook[];
  value: string;
  color: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="sr-only">Book {label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-ink-deep focus:ring-2 focus:ring-ring/40 focus:outline-none"
      >
        {books.map((book) => (
          <option key={book.bookId} value={book.bookId}>
            {book.title} — {book.authorName}
          </option>
        ))}
      </select>
    </label>
  );
}

function Bar({ value, color, title }: { value: number; color: string; title: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" title={title}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(2, value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
