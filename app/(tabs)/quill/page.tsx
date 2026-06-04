"use client";

import { ClipboardCopy, Cloud, CloudOff, Download, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Editor } from "@/components/quill/editor";
import { RewritePanel } from "@/components/quill/rewrite-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { type FingerprintMetric, toFingerprint } from "@/lib/quill/fingerprint";
import { htmlToMarkdown } from "@/lib/quill/markdown";
import { splitParagraphs } from "@/lib/quill/paragraphs";
import { computeWritingStats, type WritingStats } from "@/lib/quill/stats";
import { cn } from "@/lib/utils";
import {
  deleteCloudDraft,
  deriveDraftStylometry,
  deriveParagraphHues,
  deriveTextColour,
  loadCloudDraft,
  nearestAuthors,
  rewriteSelection,
  type StyleNeighbour,
  saveCloudDraft,
  suggestRewrite,
  type TargetRewrite,
  type TextColour,
} from "./actions";

type BandSegment = { id: string; text: string; colour: TextColour | null };

const LOCAL_DRAFT_KEY = "inklings-quill-draft";
const CLOUD_PREF_KEY = "inklings-quill-cloud-save";
const CLOUD_SAVE_DEBOUNCE_MS = 2000;

type QuillMode = "readout" | "target";

export default function QuillPage() {
  const [mode, setMode] = useState<QuillMode>("readout");
  // Local-first per the #45 privacy decision — the draft lives in
  // localStorage by default and only round-trips to the server when the
  // writer opts in via the SaveSettings toggle below.
  const [draft, setDraft] = useState("");
  const [readout, setReadout] = useState<TextColour | null>(null);
  const [isPending, startReadout] = useTransition();

  // Cloud-save opt-in (#71). Both pieces of state are mirrored to
  // localStorage so the preference + the draft survive refreshes.
  const [cloudSave, setCloudSave] = useState(false);
  const [cloudSavedAt, setCloudSavedAt] = useState<Date | null>(null);
  // Block the autosave effects until the localStorage hydration pass
  // runs — otherwise the first render would wipe a saved draft with
  // the empty default and immediately delete the cloud row.
  const [hydrated, setHydrated] = useState(false);

  // Target mode state.
  const [target, setTarget] = useState("");
  const [rewrite, setRewrite] = useState<TargetRewrite | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [isRewriting, startRewrite] = useTransition();
  // Bumping this remounts the Editor with new initialContent — TipTap
  // doesn't expose a reactive `value` prop and remount is the least
  // invasive way to replace the buffer when the user accepts a rewrite
  // or we restore a draft from storage.
  const [editorKey, setEditorKey] = useState(0);

  // EmoArc hue band (B5). Cache hues by paragraph text so a typing burst only
  // re-derives the block that actually changed; the band shows the arc across
  // the whole draft in Readout mode.
  const hueCacheRef = useRef<Record<string, TextColour | null>>({});
  const [band, setBand] = useState<BandSegment[]>([]);

  // Live stylometric fingerprint of the draft (style-level). Cheap CPU-only
  // derivation, so we can recompute on the same cadence as the hue readout.
  const [fingerprint, setFingerprint] = useState<FingerprintMetric[] | null>(null);
  // Corpus authors closest to the draft's fingerprint (style-level, S4).
  const [neighbours, setNeighbours] = useState<StyleNeighbour[]>([]);

  // Live writing stats (F1) — cheap, derived from the draft's plain text.
  const stats = useMemo(
    () => computeWritingStats(draft.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")),
    [draft],
  );
  // Markdown export of the draft (F4).
  const markdown = useMemo(() => htmlToMarkdown(draft), [draft]);

  // Hydrate from localStorage on mount. If cloud-save was on, also pull
  // the server-side draft and prefer it when present (cross-device case).
  useEffect(() => {
    try {
      const localDraft = window.localStorage.getItem(LOCAL_DRAFT_KEY) ?? "";
      const cloudPref = window.localStorage.getItem(CLOUD_PREF_KEY) === "true";
      setDraft(localDraft);
      setCloudSave(cloudPref);
      if (localDraft) setEditorKey((k) => k + 1);
      setHydrated(true);
      if (cloudPref) {
        loadCloudDraft().then((cloud) => {
          if (cloud?.text && cloud.text !== localDraft) {
            setDraft(cloud.text);
            setCloudSavedAt(cloud.updatedAt);
            setEditorKey((k) => k + 1);
          }
        });
      }
    } catch {
      setHydrated(true);
    }
  }, []);

  // Mirror every draft change to localStorage — implicit, no UI signal
  // needed since this is the privacy default.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LOCAL_DRAFT_KEY, draft);
    } catch {
      // Storage can throw in private mode / quota-full; we tolerate it.
    }
  }, [draft, hydrated]);

  // Debounced cloud autosave when the toggle is on. The 2 s wait keeps a
  // burst of typing from firing dozens of writes.
  useEffect(() => {
    if (!hydrated || !cloudSave) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      saveCloudDraft(draft).then((result) => {
        if (!cancelled) setCloudSavedAt(result.updatedAt);
      });
    }, CLOUD_SAVE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, cloudSave, hydrated]);

  const toggleCloudSave = async (next: boolean) => {
    setCloudSave(next);
    try {
      window.localStorage.setItem(CLOUD_PREF_KEY, String(next));
    } catch {
      // Storage can throw in private mode / quota-full; we tolerate it.
    }
    if (!next) {
      // Privacy: when the toggle goes off, the cloud row goes too.
      await deleteCloudDraft();
      setCloudSavedAt(null);
    }
  };

  // Debounced readout — 700 ms after the last keystroke we ask Claude for the
  // current hue. Latest call wins; in-flight ones are ignored when stale.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      startReadout(async () => {
        try {
          const result = await deriveTextColour(draft);
          if (!cancelled) setReadout(result);
        } catch {
          // Transient model/network error — keep the last hue rather than crash.
        }
      });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft]);

  // Debounced stylometric fingerprint — same 700 ms window as the hue readout.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const features = await deriveDraftStylometry(draft);
        if (!cancelled) setFingerprint(features ? toFingerprint(features) : null);
      } catch {
        // Tolerate a failed derivation — leave the previous fingerprint.
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft]);

  // Debounced nearest-author match — longer 1500 ms window since it reads the
  // corpus. Empty (too short, or no corpus loaded) hides the card.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const matches = await nearestAuthors(draft);
        if (!cancelled) setNeighbours(matches);
      } catch {
        // Corpus read failed — keep whatever neighbours were last shown.
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft]);

  // Debounced EmoArc band — 800 ms after the last keystroke, derive a hue per
  // paragraph (only the uncached ones) and lay them out as an arc. Single-
  // paragraph drafts fall back to the global swatch, so we only build a band
  // once there are at least two blocks to compare.
  useEffect(() => {
    if (mode !== "readout") return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const paras = splitParagraphs(draft);
      if (paras.length < 2) {
        if (!cancelled) setBand([]);
        return;
      }
      const cache = hueCacheRef.current;
      const missing = paras.filter((p) => !(p in cache));
      if (missing.length > 0) {
        try {
          const hues = await deriveParagraphHues(missing);
          missing.forEach((p, i) => {
            cache[p] = hues[i] ?? null;
          });
        } catch {
          // Band derivation failed — render what's cached, skip the rest.
        }
      }
      if (cancelled) return;
      // Prune the cache to the paragraphs currently on screen so it can't grow
      // without bound over a long editing session.
      hueCacheRef.current = Object.fromEntries(paras.map((p) => [p, cache[p] ?? null]));
      setBand(
        paras.map((p, i) => ({
          id: `${i}:${p.slice(0, 16)}`,
          text: p,
          colour: hueCacheRef.current[p] ?? null,
        })),
      );
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, mode]);

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

  // Receives the text the writer chose to apply — either the full rewrite or
  // only the changes they accepted (B4 ownership). Wrap each non-empty line in
  // <p>…</p> so TipTap renders paragraphs properly when it remounts.
  const acceptRewrite = (text: string) => {
    const html = text
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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-ink-deep sm:text-3xl">
            The Quill
          </h1>
          <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">
            Write, and watch the hue of your prose surface. Target a colour to receive nudges.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stats.words > 0 && <ExportControls markdown={markdown} />}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as QuillMode)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="readout">Readout</ToggleGroupItem>
            <ToggleGroupItem value="target">Target</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {mode === "readout" && band.length >= 2 && <HueBand segments={band} />}
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
                onDeriveHue={deriveTextColour}
                onRewriteSelection={rewriteSelection}
              />
            </CardContent>
          </Card>
          {stats.words > 0 && <WritingStatsBar stats={stats} />}
        </div>

        <aside className="flex flex-col gap-4">
          <HueReadout
            mode={mode}
            wordCount={countWords(draft)}
            readout={readout}
            isPending={isPending}
          />
          {fingerprint && <StyleFingerprint metrics={fingerprint} />}
          {neighbours.length > 0 && <NeighbourAuthors neighbours={neighbours} />}
          <SaveSettings
            cloudSave={cloudSave}
            cloudSavedAt={cloudSavedAt}
            onToggle={toggleCloudSave}
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
          <HueSwatch swatchCss={swatchCss} />

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

/**
 * The EmoArc hue band — a horizontal arc of one hue per paragraph, so the
 * writer sees how the stylistic temperature rises and falls across the whole
 * draft, not just its average (Amin's "Interactive Emotion Graph"). Hovering a
 * segment dims the rest and surfaces that paragraph's reading below — the band
 * is an index into the text, not just decoration.
 */
function HueBand({ segments }: { segments: BandSegment[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered != null ? segments[hovered] : null;

  return (
    <Card className="bg-card/60">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">Hue arc</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {segments.length} paragraphs
          </span>
        </div>
        <div className="flex h-9 gap-0.5">
          {segments.map((seg, i) => {
            const css = seg.colour
              ? hueFromHSL(seg.colour.hue, seg.colour.saturation, seg.colour.lightness).css
              : undefined;
            return (
              <button
                type="button"
                key={seg.id}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                aria-label={
                  seg.colour
                    ? `Paragraph ${i + 1}: ${seg.colour.justification}`
                    : `Paragraph ${i + 1}: too short to read`
                }
                className={cn(
                  "h-full flex-1 rounded-[2px] transition-all duration-200 ease-out",
                  "first:rounded-l-md last:rounded-r-md focus-visible:outline-none",
                  hovered === i && "z-10 ring-2 ring-ink-deep/25",
                  hovered != null && hovered !== i && "opacity-40",
                )}
                style={{ backgroundColor: css ?? "var(--muted)" }}
              />
            );
          })}
        </div>
        <p className="min-h-4 text-[11px] italic leading-snug text-muted-foreground transition-opacity duration-200">
          {active
            ? active.colour
              ? `“${truncate(active.text)}” — ${active.colour.justification}`
              : `“${truncate(active.text)}” — too short to read`
            : "Hover the arc to read each paragraph’s hue."}
        </p>
      </CardContent>
    </Card>
  );
}

function truncate(s: string): string {
  return s.length > 52 ? `${s.slice(0, 52).trimEnd()}…` : s;
}

/**
 * Export the draft as Markdown (F4) — copy to clipboard or download a .md file.
 * The conversion is pure; this just wires the two delivery actions with toasts.
 */
function ExportControls({ markdown }: { markdown: string }) {
  const copy = () => {
    navigator.clipboard?.writeText(markdown);
    toast.success("Copied as Markdown");
  };
  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inkling-draft.md";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded inkling-draft.md");
  };
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={copy} title="Copy the draft as Markdown">
        <ClipboardCopy className="size-3.5" /> Copy .md
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={download}
        title="Download the draft as a .md file"
      >
        <Download className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Live writing stats under the editor (F1) — a quiet status strip giving the
 * writer size and pace at a glance. Numbers are tabular so they don't jitter
 * as digits change while typing.
 */
function WritingStatsBar({ stats }: { stats: WritingStats }) {
  const items = [
    { label: stats.words === 1 ? "word" : "words", value: stats.words.toLocaleString() },
    { label: stats.sentences === 1 ? "sentence" : "sentences", value: String(stats.sentences) },
    { label: "min read", value: `~${stats.readingMinutes}` },
    { label: "avg words/sentence", value: stats.avgSentenceWords.toFixed(1) },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-baseline gap-1">
          <span className="tabular-nums text-ink-deep/70">{item.value}</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The corpus books the writer's prose is stylistically closest to (S4) — the
 * Quill's bridge into the Inkwell. Each row carries the book's own hue, tying
 * the match back to the colour language; a closeness bar (inverse of distance)
 * shows how near each one sits without exposing a raw metric.
 */
function NeighbourAuthors({ neighbours }: { neighbours: StyleNeighbour[] }) {
  // Map distance (0 = identical, ~1+ = far across five 0..1 axes) to a 0..1
  // closeness for the bar. Clamp so the nearest never reads as a full bar
  // unless it's an exact match.
  const closeness = (d: number) => Math.max(0, 1 - d);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
          Closest in the Inkwell
        </h2>
        <ul className="flex flex-col gap-2">
          {neighbours.map((n) => {
            const css = n.hue
              ? hueFromHSL(n.hue.hue, n.hue.saturation, n.hue.lightness).css
              : "var(--ink-faded)";
            return (
              <li key={n.bookId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: css }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-deep" title={n.title}>
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{n.authorName}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.max(4, closeness(n.distance) * 100)}%`,
                      backgroundColor: css,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          By classical stylometry — the same distance the Inkwell is laid out on.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Live stylometric fingerprint of the draft — the same measurable shape the
 * Inkwell shows per author (pitch p5), but for the writer's own prose. Bars
 * ease toward their value so each keystroke nudges the shape rather than
 * snapping it, making the numbers feel like a live reading of the ink.
 */
function StyleFingerprint({ metrics }: { metrics: FingerprintMetric[] }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
          Style fingerprint
        </h2>
        <ul className="flex flex-col gap-2">
          {metrics.map((m) => (
            <li key={m.key} className="flex flex-col gap-1" title={m.detail}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-ink-deep">{m.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {m.value.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-ink-bleed/70 transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(2, m.value * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The cloud-save toggle + status line. Off by default (privacy decision
 * from #45) — local persistence is implicit and unsignalled. When the
 * writer opts in, a status line ticks "saved · Xs ago" so it feels alive.
 */
function SaveSettings({
  cloudSave,
  cloudSavedAt,
  onToggle,
}: {
  cloudSave: boolean;
  cloudSavedAt: Date | null;
  onToggle: (next: boolean) => void;
}) {
  // Re-render every 10 s while a cloud save exists so "Xs ago" stays
  // honest without bursting renders during typing bursts.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cloudSavedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, [cloudSavedAt]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="flex items-start gap-3">
          {cloudSave ? (
            <Cloud aria-hidden="true" className="size-5 shrink-0 text-ink-bleed" />
          ) : (
            <CloudOff aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          )}
          <label className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-ink-deep">Save to my scribe</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {cloudSave
                  ? "Drafts sync across devices on this scribe."
                  : "Drafts stay on this device only."}
              </span>
            </span>
            <input
              type="checkbox"
              checked={cloudSave}
              onChange={(e) => onToggle(e.target.checked)}
              className="mt-1 size-4 cursor-pointer accent-ink-bleed"
              aria-label="Save drafts to my scribe (sync across devices)"
            />
          </label>
        </div>
        {cloudSave && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {cloudSavedAt ? `saved · ${relativeTime(cloudSavedAt)}` : "waiting for first save…"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function relativeTime(d: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The "your current hue" swatch. A grey disc with a rainbow wave moving
 * along the bottom while we wait for Claude — the wave is the loading
 * indicator. When the readout lands, the solid colour fades in over
 * the wave so the chosen hue takes the whole circle.
 *
 * Path notes — viewBox is 48×48 to match the rendered size:
 *  - The wave path is 96 wide (two visible widths) so the translate
 *    animation has fresh wave coming in from the right.
 *  - Quadratic-bezier sine with 24-px period (two crests per visible
 *    width) and 4-px amplitude around a baseline at y=30 — keeps the
 *    grey area roughly the top 60 % of the circle.
 *  - The gradient repeats the rainbow twice (0..50 % is one full sweep,
 *    50..100 % the same again) so when the wave translates by exactly
 *    -48 px, the colours at any fixed canvas x are identical to t=0
 *    and the loop is seamless.
 */
function HueSwatch({ swatchCss }: { swatchCss: string | undefined }) {
  const hasHue = !!swatchCss;
  return (
    <div
      aria-label="Your current hue"
      role="img"
      className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border bg-muted shadow-inner"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        <title>Rainbow wave loading indicator</title>
        <defs>
          <linearGradient id="hue-wave-rainbow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(0, 80%, 60%)" />
            <stop offset="8.33%" stopColor="hsl(60, 80%, 60%)" />
            <stop offset="16.67%" stopColor="hsl(120, 80%, 60%)" />
            <stop offset="25%" stopColor="hsl(180, 80%, 60%)" />
            <stop offset="33.33%" stopColor="hsl(240, 80%, 60%)" />
            <stop offset="41.67%" stopColor="hsl(300, 80%, 60%)" />
            <stop offset="50%" stopColor="hsl(360, 80%, 60%)" />
            <stop offset="58.33%" stopColor="hsl(60, 80%, 60%)" />
            <stop offset="66.67%" stopColor="hsl(120, 80%, 60%)" />
            <stop offset="75%" stopColor="hsl(180, 80%, 60%)" />
            <stop offset="83.33%" stopColor="hsl(240, 80%, 60%)" />
            <stop offset="91.67%" stopColor="hsl(300, 80%, 60%)" />
            <stop offset="100%" stopColor="hsl(360, 80%, 60%)" />
          </linearGradient>
        </defs>
        <g className="inklings-wave-flow">
          <path
            fill="url(#hue-wave-rainbow)"
            d="M0,30 Q6,26 12,30 T24,30 T36,30 T48,30 T60,30 T72,30 T84,30 T96,30 L96,48 L0,48 Z"
          />
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          backgroundColor: swatchCss,
          opacity: hasHue ? 1 : 0,
        }}
      />
    </div>
  );
}
