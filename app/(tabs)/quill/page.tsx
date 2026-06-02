"use client";

import {
  AlignLeft,
  Check,
  Cloud,
  CloudOff,
  Columns2,
  Feather,
  Loader2,
  Sparkles,
  Wand2,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Editor } from "@/components/quill/editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFromHSL } from "@/lib/colour/placeholder";
import {
  applyDecisions,
  type DiffToken,
  type RewriteNudge,
  type RewriteSegment,
  toDiffTokens,
} from "@/lib/quill/diff";
import { type FingerprintMetric, toFingerprint } from "@/lib/quill/fingerprint";
import { splitParagraphs } from "@/lib/quill/paragraphs";
import { cn } from "@/lib/utils";
import {
  deleteCloudDraft,
  deriveDraftStylometry,
  deriveParagraphHues,
  deriveTextColour,
  loadCloudDraft,
  nearestAuthors,
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
        const result = await deriveTextColour(draft);
        if (!cancelled) setReadout(result);
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
      const features = await deriveDraftStylometry(draft);
      if (!cancelled) setFingerprint(features ? toFingerprint(features) : null);
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
      const matches = await nearestAuthors(draft);
      if (!cancelled) setNeighbours(matches);
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
        const hues = await deriveParagraphHues(missing);
        missing.forEach((p, i) => {
          cache[p] = hues[i] ?? null;
        });
      }
      if (cancelled) return;
      setBand(
        paras.map((p, i) => ({ id: `${i}:${p.slice(0, 16)}`, text: p, colour: cache[p] ?? null })),
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
              />
            </CardContent>
          </Card>
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

type DiffView = "split" | "inline";

const EMPTY_DIFF: RewriteSegment[] = [];

function RewritePanel({
  rewrite,
  isPending,
  error,
  onAccept,
  onReject,
}: {
  rewrite: TargetRewrite | null;
  isPending: boolean;
  error: string | null;
  onAccept: (text: string) => void;
  onReject: () => void;
}) {
  // Split shows original | rewrite side by side; inline weaves removals and
  // additions into one column where each change can be taken or left.
  const [view, setView] = useState<DiffView>("split");

  const diff = rewrite?.diff ?? EMPTY_DIFF;
  const tokens = useMemo(() => toDiffTokens(diff), [diff]);
  const changeIndices = useMemo(
    () => tokens.filter((t) => t.kind === "change").map((t) => t.index),
    [tokens],
  );

  // Per-change accept set — B4 ownership. Start with every change accepted (so
  // the default "apply" equals the full rewrite); the writer deselects the ones
  // they want to keep in their own voice. Reset whenever a new rewrite lands.
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  useEffect(() => {
    setAccepted(new Set(changeIndices));
  }, [changeIndices]);

  const toggleChange = (index: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const total = changeIndices.length;
  const acceptedCount = changeIndices.filter((i) => accepted.has(i)).length;
  const applyLabel =
    acceptedCount === total ? "Use the rewrite" : `Apply ${acceptedCount} of ${total}`;

  return (
    <Card className="mt-6 bg-card/60">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Suggested rewrite
          </h2>
          {!isPending && rewrite && (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as DiffView)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="split" className="gap-1.5 text-xs">
                <Columns2 className="size-3.5" /> Side-by-side
              </ToggleGroupItem>
              <ToggleGroupItem value="inline" className="gap-1.5 text-xs">
                <AlignLeft className="size-3.5" /> Inline diff
              </ToggleGroupItem>
            </ToggleGroup>
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
            {view === "inline" ? (
              <InteractiveDiff tokens={tokens} accepted={accepted} onToggle={toggleChange} />
            ) : (
              <DiffBody diff={rewrite.diff} view="split" />
            )}
            <DiffLegend
              hint={
                view === "split"
                  ? "Switch to Inline diff to keep or drop each change individually."
                  : "Click any change to keep it in your own words."
              }
            />
            {rewrite.nudges.length > 0 && <NudgesApplied nudges={rewrite.nudges} />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onReject}>
                <X className="size-4" /> Keep original
              </Button>
              <Button
                size="sm"
                disabled={acceptedCount === 0}
                onClick={() => onAccept(applyDecisions(diff, accepted))}
              >
                <Check className="size-4" /> {applyLabel}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The inline diff as an editable decision surface (B4 ownership). Unchanged
 * text is plain; each change is a button the writer toggles. Accepted changes
 * show the rewrite's words in emerald; rejected ones fall back to the original
 * so the prose stays in the writer's voice. Nothing is committed until they
 * apply — agency stays with the author, never full-text regeneration.
 */
function InteractiveDiff({
  tokens,
  accepted,
  onToggle,
}: {
  tokens: DiffToken[];
  accepted: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <p className="font-serif text-base leading-relaxed text-ink-deep">
      {tokens.map((token, i) =>
        token.kind === "same" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static and never reordered
          <span key={`s-${i}`}>{token.text}</span>
        ) : (
          <ChangeChip
            key={`c-${token.index}`}
            change={token}
            isAccepted={accepted.has(token.index)}
            onToggle={() => onToggle(token.index)}
          />
        ),
      )}
    </p>
  );
}

function ChangeChip({
  change,
  isAccepted,
  onToggle,
}: {
  change: { removed: string; added: string };
  isAccepted: boolean;
  onToggle: () => void;
}) {
  const { removed, added } = change;
  // Always show something toggleable: an accepted insertion shows the new words;
  // a rejected one shows the original; the degenerate empty side falls back to
  // the other, struck through, so the change can still be flipped back.
  const accepted = added !== "" ? { text: added, struck: false } : { text: removed, struck: true };
  const rejected =
    removed !== "" ? { text: removed, struck: false } : { text: added, struck: true };
  const shown = isAccepted ? accepted : rejected;

  return (
    <button
      type="button"
      aria-pressed={isAccepted}
      title={isAccepted ? "Keep your original wording here" : "Apply this change"}
      onClick={onToggle}
      className={cn(
        "rounded-[3px] px-0.5 align-baseline transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        shown.struck && "line-through",
        isAccepted
          ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20"
          : "bg-transparent text-ink-deep/70 underline decoration-dotted decoration-ink-deep/30 underline-offset-2 hover:bg-rose-500/10 hover:text-rose-700/80",
      )}
    >
      {shown.text || "·"}
    </button>
  );
}

/**
 * Renders the structured rewrite diff. `split` reconstructs the original (same +
 * removed) and the rewrite (same + added) into two columns; `inline` weaves the
 * whole diff into one column. Added text glows green, removed text is struck
 * through in rose — the green/pink language from the pitch. Spans transition
 * their tint so toggling views feels like one surface re-settling, not a redraw.
 */
function DiffBody({ diff, view }: { diff: RewriteSegment[]; view: DiffView }) {
  if (view === "inline") {
    return (
      <div className="font-serif text-base leading-relaxed text-ink-deep">
        {diff.map((seg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
          <DiffSpan key={`i-${i}`} seg={seg} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">Original</h3>
        <p className="mt-2 font-serif text-base leading-relaxed text-ink-deep/70">
          {diff
            .filter((s) => s.op !== "add")
            .map((seg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
              <DiffSpan key={`o-${i}`} seg={seg} side="original" />
            ))}
        </p>
      </div>
      <div>
        <h3 className="text-[10px] tracking-wider text-ink-bleed uppercase">Nudge</h3>
        <p className="mt-2 font-serif text-base leading-relaxed text-ink-deep">
          {diff
            .filter((s) => s.op !== "remove")
            .map((seg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
              <DiffSpan key={`r-${i}`} seg={seg} side="rewrite" />
            ))}
        </p>
      </div>
    </div>
  );
}

/**
 * One diff segment. In a single-side column (`side` set) the opposite op never
 * arrives, so we only ever tint the one that belongs there; in the inline view
 * (`side` undefined) both adds and removes are tinted together.
 */
function DiffSpan({ seg, side }: { seg: RewriteSegment; side?: "original" | "rewrite" }) {
  const base = "transition-colors duration-200 ease-out";
  if (seg.op === "add" && side !== "original") {
    return (
      <span className={cn(base, "rounded-[3px] bg-emerald-500/12 px-0.5 text-emerald-700")}>
        {seg.text}
      </span>
    );
  }
  if (seg.op === "remove" && side !== "rewrite") {
    return (
      <span
        className={cn(base, "rounded-[3px] bg-rose-500/12 px-0.5 text-rose-700/80 line-through")}
      >
        {seg.text}
      </span>
    );
  }
  return <span>{seg.text}</span>;
}

// Rotating glyphs so each nudge card reads as its own small object rather than a
// repeated bullet — variety is cheap delight on a feature seen now and then.
const NUDGE_ICONS = [Wand2, Feather, Wind, Sparkles];

/**
 * The "Nudges applied" panel — each named change the rewrite made toward the
 * target, as an inspectable card (label + reason). This is the PromptCanvas
 * move: the prompt's effects become visible, discrete objects instead of an
 * invisible transformation. Cards fade/slide in with a short stagger so the
 * list assembles itself rather than snapping in all at once.
 */
function NudgesApplied({ nudges }: { nudges: RewriteNudge[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">Nudges applied</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {nudges.map((nudge, i) => {
          const Icon = NUDGE_ICONS[i % NUDGE_ICONS.length] ?? Sparkles;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: nudges are static and never reordered
              key={`nudge-${i}`}
              style={{ animationDelay: `${i * 45}ms` }}
              className="flex animate-in items-start gap-2.5 rounded-lg border border-border/60 bg-card/50 p-3 fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-out"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-ink-bleed/10 text-ink-bleed">
                <Icon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight text-ink-deep">
                  {nudge.label}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{nudge.reason}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiffLegend({ hint }: { hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-rose-500/30" aria-hidden="true" />
        Removed or toned down
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-emerald-500/30" aria-hidden="true" />
        Added or emphasised
      </span>
      {hint && <span className="italic">{hint}</span>}
    </div>
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
