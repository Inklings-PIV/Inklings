"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Editor } from "@/components/quill/editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type QuillMode = "readout" | "target";

export default function QuillPage() {
  const [mode, setMode] = useState<QuillMode>("readout");
  // Local draft only — autosave to quill_samples lands separately once the
  // privacy default for the Quill is settled (part of #45).
  const [draft, setDraft] = useState("");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl tracking-tight text-ink-deep sm:text-3xl">
            The Quill
          </h1>
          <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">
            Write, and watch the hue of your prose surface. Target a colour to receive nudges.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as QuillMode)}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="readout">Readout</ToggleGroupItem>
          <ToggleGroupItem value="target">Target</ToggleGroupItem>
        </ToggleGroup>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="relative overflow-hidden bg-card/60">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-ink-bleed to-transparent opacity-60"
          />
          <CardContent className="p-6 sm:p-8">
            <Editor
              placeholder="Write a paragraph and watch the ink reveal itself…"
              onChange={setDraft}
            />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <HueReadout mode={mode} wordCount={countWords(draft)} />
          {mode === "target" && <TargetPicker />}
        </aside>
      </div>
    </div>
  );
}

function countWords(html: string): number {
  // Strip tags, collapse whitespace, count non-empty words. Good enough as a
  // running indicator until #37 wires the real hue readout.
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function HueReadout({ mode, wordCount }: { mode: QuillMode; wordCount: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full border border-border bg-muted shadow-inner" />
          <div className="flex min-w-0 flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              your current hue
            </span>
            <span className="font-serif text-lg text-ink-deep">—</span>
          </div>
        </div>
        <p className="text-xs italic text-muted-foreground">
          {mode === "readout"
            ? "Start typing. The hue updates as the ink dries."
            : "Aim for the target. Suggestions will appear inline."}
        </p>
        {wordCount > 0 && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TargetPicker() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div
            className="size-12 rounded-full border border-border shadow-inner"
            style={{ backgroundColor: "oklch(0.55 0.18 240)" }}
          />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">target</span>
            <span className="font-serif text-lg text-ink-deep">orwell blue</span>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled>
          <Sparkles /> Suggest a nudge
        </Button>
      </CardContent>
    </Card>
  );
}
