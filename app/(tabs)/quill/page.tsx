"use client";

import { Check, Cloud, CloudOff, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Editor } from "@/components/quill/editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFromHSL } from "@/lib/colour/placeholder";
import {
  deleteCloudDraft,
  deriveTextColour,
  loadCloudDraft,
  saveCloudDraft,
  suggestRewrite,
  type TargetRewrite,
  type TextColour,
} from "./actions";

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
