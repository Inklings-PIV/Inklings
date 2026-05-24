"use client";

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Editor } from "@/components/quill/editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { deriveTextColour, suggestRewrite, type TargetRewrite, type TextColour } from "./actions";

type QuillMode = "readout" | "target";

export default function QuillPage() {
  const [mode, setMode] = useState<QuillMode>("readout");
  // Local draft only — autosave to quill_samples lands separately once the
  // privacy default for the Quill is settled (part of #45).
  const [draft, setDraft] = useState("");
  const [readout, setReadout] = useState<TextColour | null>(null);
  const [isPending, startReadout] = useTransition();

  // Target mode state.
  const [target, setTarget] = useState("");
  const [rewrite, setRewrite] = useState<TargetRewrite | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [isRewriting, startRewrite] = useTransition();
  // Bumping this remounts the Editor with new initialContent — TipTap
  // doesn't expose a reactive `value` prop and remount is the least
  // invasive way to replace the buffer when the user accepts a rewrite.
  const [editorKey, setEditorKey] = useState(0);

  // Debounced readout — 700 ms after the last keystroke we ask Claude for the
  // current hue. Latest call wins; in-flight ones are ignored when stale.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      startReadout(async () => {
        const result = await deriveTextColour(draft);
        if (!cancelled) setReadout(result);
      });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft]);

  const requestRewrite = () => {
    setRewriteError(null);
    setRewrite(null);
    startRewrite(async () => {
      try {
        const result = await suggestRewrite({ text: draft, target });
        if (!result) {
          setRewriteError("Write at least 8 words and enter a target before asking for a rewrite.");
          return;
        }
        setRewrite(result);
      } catch (err) {
        setRewriteError((err as Error).message);
      }
    });
  };

  const acceptRewrite = () => {
    if (!rewrite) return;
    // Wrap each non-empty line in <p>…</p> so TipTap renders paragraphs
    // properly when it remounts. Claude returns plain text with newlines.
    const html = rewrite.rewrite
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
    setDraft(html);
    setRewrite(null);
    setEditorKey((k) => k + 1);
  };

  const rejectRewrite = () => {
    setRewrite(null);
    setRewriteError(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-ink-deep sm:text-3xl">
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
              key={editorKey}
              initialContent={draft}
              placeholder="Write a paragraph and watch the ink reveal itself…"
              onChange={setDraft}
            />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <HueReadout
            mode={mode}
            wordCount={countWords(draft)}
            readout={readout}
            isPending={isPending}
          />
          {mode === "target" && (
            <TargetPicker
              target={target}
              onTargetChange={setTarget}
              wordCount={countWords(draft)}
              onRequest={requestRewrite}
              isPending={isRewriting}
              hasRewrite={rewrite !== null}
            />
          )}
        </aside>
      </div>

      {mode === "target" && (rewrite || rewriteError || isRewriting) && (
        <RewritePanel
          original={draft}
          rewrite={rewrite}
          isPending={isRewriting}
          error={rewriteError}
          onAccept={acceptRewrite}
          onReject={rejectRewrite}
        />
      )}
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

function HueReadout({
  mode,
  wordCount,
  readout,
  isPending,
}: {
  mode: QuillMode;
  wordCount: number;
  readout: TextColour | null;
  isPending: boolean;
}) {
  const swatchCss = readout
    ? hueFromHSL(readout.hue, readout.saturation, readout.lightness).css
    : undefined;
  const label = readout ? readout.justification : "—";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <div
            aria-label="Your current hue"
            role="img"
            className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border shadow-inner transition-colors duration-500"
            style={{ backgroundColor: swatchCss ?? "var(--muted)" }}
          >
            {isPending && (
              <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-ink-deep/70" />
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              your current hue
            </span>
            <span className="font-serif text-base leading-tight text-ink-deep">{label}</span>
          </div>
        </div>
        <p className="text-xs italic leading-snug text-muted-foreground">
          {readout
            ? mode === "readout"
              ? "Keep writing — the hue updates as the ink dries."
              : "Aim for the target. Suggestions will appear inline."
            : wordCount < 8
              ? "Write a few words and the hue will surface."
              : isPending
                ? "Reading the ink…"
                : "Keep writing."}
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

function TargetPicker({
  target,
  onTargetChange,
  wordCount,
  onRequest,
  isPending,
  hasRewrite,
}: {
  target: string;
  onTargetChange: (s: string) => void;
  wordCount: number;
  onRequest: () => void;
  isPending: boolean;
  hasRewrite: boolean;
}) {
  const canAsk = wordCount >= 8 && target.trim().length > 0 && !isPending;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">target</span>
          <input
            type="text"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="warm, melancholy · Hemingway-like · lush, baroque"
            className="h-9 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
        </label>
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          Describe how you want the prose to feel — Claude will rewrite toward it. Colour names,
          authors' voices, or moods all work.
        </p>
        <Button size="sm" variant="outline" onClick={onRequest} disabled={!canAsk}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {hasRewrite ? "Try another nudge" : "Suggest a nudge"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RewritePanel({
  original,
  rewrite,
  isPending,
  error,
  onAccept,
  onReject,
}: {
  original: string;
  rewrite: TargetRewrite | null;
  isPending: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="mt-6 bg-card/60">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Suggested rewrite
          </h2>
          {!isPending && rewrite && (
            <span className="text-[11px] italic text-muted-foreground">
              Accept replaces your draft. Reject keeps it.
            </span>
          )}
        </div>

        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Claude is rewriting…
          </div>
        ) : error ? (
          <p className="text-xs italic text-destructive">{error}</p>
        ) : rewrite ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  Original
                </h3>
                <p className="mt-2 font-serif text-base leading-relaxed whitespace-pre-wrap text-ink-deep/70">
                  {plainText(original)}
                </p>
              </div>
              <div>
                <h3 className="text-[10px] tracking-wider text-ink-bleed uppercase">Nudge</h3>
                <p className="mt-2 font-serif text-base leading-relaxed whitespace-pre-wrap text-ink-deep">
                  {rewrite.rewrite}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onReject}>
                <X className="size-4" /> Keep original
              </Button>
              <Button size="sm" onClick={onAccept}>
                <Check className="size-4" /> Use the nudge
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function plainText(html: string): string {
  return html
    .replace(/<\/?(p|br|div|h[1-6]|li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
