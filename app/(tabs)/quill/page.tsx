"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type QuillMode = "readout" | "target";

export default function QuillPage() {
  const [mode, setMode] = useState<QuillMode>("readout");

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
          <CardContent className="min-h-[480px] p-8">
            <div className="font-serif text-lg leading-relaxed text-ink-deep/70">
              <span className="italic text-muted-foreground">
                The editor will live here. Write a paragraph and watch the ink reveal itself…
              </span>
            </div>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <HueReadout mode={mode} />
          {mode === "target" && <TargetPicker />}
        </aside>
      </div>
    </div>
  );
}

function HueReadout({ mode }: { mode: QuillMode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full border border-border bg-muted shadow-inner" />
          <div className="flex flex-col">
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
