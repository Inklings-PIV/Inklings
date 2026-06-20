"use client";

import {
  Check,
  ChevronDown,
  ClipboardCopy,
  Cloud,
  CloudOff,
  Download,
  History,
  Lightbulb,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArcChart } from "@/components/quill/arc-chart";
import {
  ColourPalette,
  ColourSplash,
  colourDropByKey,
  type SplashState,
} from "@/components/quill/colour-drop";
import { DiffActions, DiffText } from "@/components/quill/diff-view";
import {
  type ColourDropDetail,
  Editor,
  type EditorHandle,
  type SelectionRange,
} from "@/components/quill/editor";
import { HueExplainer } from "@/components/quill/hue-explainer";
import { TargetWidgets } from "@/components/quill/target-widgets";
import { useDiff } from "@/components/quill/use-diff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { driftToTarget } from "@/lib/quill/colour-distance";
import { type FingerprintMetric, toFingerprint } from "@/lib/quill/fingerprint";
import { type DraftVersion, pushVersion } from "@/lib/quill/history";
import { htmlToMarkdown } from "@/lib/quill/markdown";
import { nameToHsl } from "@/lib/quill/named-colours";
import { splitParagraphs } from "@/lib/quill/paragraphs";
import { computeWritingStats, type WritingStats } from "@/lib/quill/stats";
import { type WidgetSelection, widgetsToTarget } from "@/lib/quill/widgets";
import { cn } from "@/lib/utils";
import {
  type DraftArc,
  deleteCloudDraft,
  deriveDraftArc,
  deriveDraftStylometry,
  deriveParagraphHues,
  deriveTargetColour,
  deriveTextColour,
  explainHue,
  type HueSegment,
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
const PANEL_PRESET_KEY = "inklings-quill-panel-preset";
const PANEL_CUSTOM_KEY = "inklings-quill-panel-custom";

type PanelPreset = "essentials" | "analyse" | "rewrite" | "custom";

// Which optional panels each preset activates.
const PANEL_PRESETS: Record<Exclude<PanelPreset, "custom">, readonly string[]> = {
  essentials: ["hue", "save"],
  analyse: ["hue", "fingerprint", "band", "arc", "neighbours", "save"],
  rewrite: ["hue", "target", "colour", "version", "save"],
};

const CUSTOM_PANEL_OPTIONS = [
  { key: "hue", label: "Hue readout" },
  { key: "fingerprint", label: "Style fingerprint" },
  { key: "band", label: "Hue band" },
  { key: "arc", label: "Story shape" },
  { key: "neighbours", label: "Nearest authors" },
  { key: "version", label: "Versions" },
  { key: "target", label: "Rewrite" },
  { key: "colour", label: "Colour drop" },
  { key: "save", label: "Save to scribe" },
] as const;

// Default custom panels — on for new users; existing saved sets load from localStorage.
const DEFAULT_CUSTOM_PANELS = ["hue", "save"];

export default function QuillPage() {
  const [panelPreset, setPanelPreset] = useState<PanelPreset>("essentials");
  const [customPanels, setCustomPanels] = useState<Set<string>>(new Set());
  // Local-first per the #45 privacy decision — the draft lives in
  // localStorage by default and only round-trips to the server when the
  // writer opts in via the SaveSettings toggle below.
  const [draft, setDraft] = useState("");
  const [readout, setReadout] = useState<TextColour | null>(null);
  const [isPending, startReadout] = useTransition();

  // Counterfactual hue explanation (#2) — "Why this colour?" reveals which words
  // drive the hue. Off by default; derived (and paid for) only while it's open.
  const [explain, setExplain] = useState(false);
  const [explanation, setExplanation] = useState<HueSegment[] | null>(null);
  const [explainPending, setExplainPending] = useState(false);

  // Cloud-save opt-in (#71). Both pieces of state are mirrored to
  // localStorage so the preference + the draft survive refreshes.
  const [cloudSave, setCloudSave] = useState(false);
  const [cloudSavedAt, setCloudSavedAt] = useState<Date | null>(null);
  // Block the autosave effects until the localStorage hydration pass
  // runs — otherwise the first render would wipe a saved draft with
  // the empty default and immediately delete the cloud row.
  const [hydrated, setHydrated] = useState(false);

  // Target mode state. The free-text note plus the widget facets compose
  // into one target string (PromptCanvas, idea #3) — backend unchanged.
  const [target, setTarget] = useState("");
  const [widgetSelection, setWidgetSelection] = useState<WidgetSelection>({});
  // The target descriptor resolved to a colour, for the drift meter (#5).
  const [targetColour, setTargetColour] = useState<TextColour | null>(null);
  // Intensity slider (1–5) replaces the 3-variant fan.
  const [intensity, setIntensity] = useState(3);
  // Single rewrite result — inline diff replaces the modal RewritePanel.
  const [rewrite, setRewrite] = useState<TargetRewrite | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [isRewriting, startRewrite] = useTransition();
  const [highlightPending, setHighlightPending] = useState(false);
  const [showNudgeReady, setShowNudgeReady] = useState(false);
  const wasRewritingRef = useRef(false);
  // Colour-drop splash overlay (null when idle). The page owns the two-step
  // timing; the overlay just paints whatever phase it's handed.
  const [splash, setSplash] = useState<SplashState | null>(null);
  // Pre-rewrite snapshots. Accepting a rewrite remounts the editor and wipes
  // TipTap's undo stack — this is the way back.
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  // Live selection drives the sidebar indicator + persistent editor mark;
  // committed selection is
  // frozen at request-time and used to splice the rewrite back in on accept.
  const [liveSelection, setLiveSelection] = useState<SelectionRange | null>(null);
  const [committedSelection, setCommittedSelection] = useState<SelectionRange | null>(null);
  // Diff state — computed from the active rewrite vs the committed text.
  const diff = useDiff(
    rewrite ? (committedSelection?.text ?? plainText(draft)) : "",
    rewrite?.rewrite ?? "",
  );
  // Surrounding context for the diff. When the span opens mid-paragraph, its
  // immediate before/after fragment hugs the diff inline (leadIn/tailOut) so a
  // sub-paragraph rewrite reads as one paragraph; the remaining whole paragraphs
  // render as greyed blocks above/below.
  const beforeParts = committedSelection?.beforeText?.split("\n\n").filter(Boolean) ?? [];
  const afterParts = committedSelection?.afterText?.split("\n\n").filter(Boolean) ?? [];
  const leadIn =
    committedSelection?.openStart && beforeParts.length
      ? beforeParts[beforeParts.length - 1]
      : undefined;
  const tailOut = committedSelection?.openEnd && afterParts.length ? afterParts[0] : undefined;
  const blockBefore = leadIn ? beforeParts.slice(0, -1) : beforeParts;
  const blockAfter = tailOut ? afterParts.slice(1) : afterParts;
  // Bumping this remounts the Editor with new initialContent — TipTap
  // doesn't expose a reactive `value` prop and remount is the least
  // invasive way to replace the buffer when the user accepts a rewrite
  // or we restore a draft from storage.
  const [editorKey, setEditorKey] = useState(0);

  // Panel visibility — resolved from preset each render.
  const panelVisible = (key: string): boolean => {
    if (panelPreset === "custom") return customPanels.has(key);
    return PANEL_PRESETS[panelPreset].includes(key);
  };
  const bandActive = panelVisible("band");
  const targetActive = panelVisible("target");

  // EmoArc hue band (B5). Cache hues by paragraph text so a typing burst only
  // re-derives the block that actually changed; the band shows the arc across
  // the whole draft in Readout mode.
  const hueCacheRef = useRef<Record<string, TextColour | null>>({});
  const [band, setBand] = useState<BandSegment[]>([]);
  // EmoArc band → editor link (#1). Hovering a band segment highlights its
  // paragraph in the editor (tinted in that segment's own hue); clicking one
  // jumps to it. The editor handle lets the click select the block imperatively.
  const editorRef = useRef<EditorHandle>(null);
  const [highlight, setHighlight] = useState<{ index: number; tint: string | null } | null>(null);

  // Live stylometric fingerprint of the draft (style-level). Cheap CPU-only
  // derivation, so we can recompute on the same cadence as the hue readout.
  const [fingerprint, setFingerprint] = useState<FingerprintMetric[] | null>(null);
  // Emotional arc of the draft (research idea C) — lexicon valence per
  // sentence, matched to Reagan et al.'s six Gutenberg story shapes.
  const [arc, setArc] = useState<DraftArc | null>(null);
  // Corpus authors closest to the draft's fingerprint (style-level, S4).
  const [neighbours, setNeighbours] = useState<StyleNeighbour[]>([]);

  // Active widgets + free-text note, composed in declaration order. "" when
  // neither is set — every consumer treats that as "no target yet".
  const composedTarget = useMemo(
    () => widgetsToTarget(widgetSelection, target),
    [widgetSelection, target],
  );

  // Live writing stats (F1) — cheap, derived from the draft's plain text.
  const stats = useMemo(
    () => computeWritingStats(draft.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")),
    [draft],
  );
  const hasDraftText = plainText(draft).length > 0;
  // Markdown export of the draft (F4).
  const markdown = useMemo(() => htmlToMarkdown(draft), [draft]);

  // Hydrate from localStorage on mount. If cloud-save was on, also pull
  // the server-side draft and prefer it when present (cross-device case).
  useEffect(() => {
    try {
      const localDraft = window.localStorage.getItem(LOCAL_DRAFT_KEY) ?? "";
      const cloudPref = window.localStorage.getItem(CLOUD_PREF_KEY) === "true";
      const savedPreset = (window.localStorage.getItem(PANEL_PRESET_KEY) ??
        "essentials") as PanelPreset;
      const savedCustom = JSON.parse(
        window.localStorage.getItem(PANEL_CUSTOM_KEY) ?? JSON.stringify(DEFAULT_CUSTOM_PANELS),
      ) as string[];
      setDraft(localDraft);
      setCloudSave(cloudPref);
      setPanelPreset(savedPreset);
      setCustomPanels(new Set(savedCustom));
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

  useEffect(() => {
    const wasRewriting = wasRewritingRef.current;

    if (wasRewriting && !isRewriting && rewrite) {
      setShowNudgeReady(true);
    }

    wasRewritingRef.current = isRewriting;
  }, [isRewriting, rewrite]);

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

  const changePanelPreset = (preset: PanelPreset) => {
    setPanelPreset(preset);
    try {
      window.localStorage.setItem(PANEL_PRESET_KEY, preset);
    } catch {
      // Storage can throw in private mode / quota-full; we tolerate it.
    }
  };

  const toggleCustomPanel = (key: string) => {
    setCustomPanels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(PANEL_CUSTOM_KEY, JSON.stringify([...next]));
      } catch {
        // Storage can throw in private mode / quota-full; we tolerate it.
      }
      return next;
    });
  };

  // Debounced readout — 700 ms after the last keystroke we ask Claude for the
  // current hue. Latest call wins; in-flight ones are ignored when stale.
  useEffect(() => {
    if (!hasDraftText) {
      setReadout(null);
      return;
    }

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
  }, [draft, hasDraftText]);

  // Debounced counterfactual explanation (#2) — only while the panel is open and
  // in readout mode, so we pay for it on demand. Same 700 ms window; latest wins.
  useEffect(() => {
    if (!explain) return;
    let cancelled = false;
    setExplainPending(true);
    const handle = setTimeout(async () => {
      try {
        const segments = await explainHue(draft);
        if (!cancelled) setExplanation(segments);
      } catch {
        // Transient model/network error — keep the last explanation.
      } finally {
        if (!cancelled) setExplainPending(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft, explain]);

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

  // Debounced emotional arc — same cadence as the fingerprint; CPU-only
  // lexicon work, no model call. Null (draft too short / no shape) hides it.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const result = await deriveDraftArc(draft);
        if (!cancelled) setArc(result);
      } catch {
        // Tolerate a failed derivation — keep the previous arc.
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
    if (!bandActive) return;
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
  }, [draft, bandActive]);

  // Clear the EmoArc highlight whenever the band isn't on screen (mode switch,
  // or the draft dropped below two paragraphs) — the band's own mouse-leave
  // can't fire once it has unmounted, so a stale highlight would otherwise stick.
  const bandVisible = bandActive && band.length >= 2;
  useEffect(() => {
    if (!bandVisible) setHighlight(null);
  }, [bandVisible]);

  // Resolve the target descriptor to a colour for the drift meter (#5). Common
  // colour/mood words map locally and for free; anything else the model derives
  // once, debounced so a burst of typing in the target field is a single call.
  useEffect(() => {
    if (!targetActive) return;
    const aim = composedTarget.trim();
    if (!aim) {
      setTargetColour(null);
      return;
    }
    const named = nameToHsl(aim);
    if (named) {
      setTargetColour({ ...named, justification: aim });
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const colour = await deriveTargetColour(aim);
        if (!cancelled) setTargetColour(colour);
      } catch {
        // Keep the last resolved target colour on a transient failure.
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [composedTarget, targetActive]);

  const requestRewrite = () => {
    const sel = editorRef.current?.getSelection() ?? null;
    setCommittedSelection(sel);
    setShowNudgeReady(false);
    setRewriteError(null);
    setRewrite(null);
    startRewrite(async () => {
      try {
        const text = sel?.text ?? draft;
        const result = await suggestRewrite({ text, target: composedTarget, intensity });
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

  // A colour swatch was dropped on a word. Splash lands at the drop point while
  // the rewrite is in flight; when it returns we bloom the full splash over the
  // affected span, then hand off to the same inline diff the Rewrite panel uses.
  const handleColourDrop = (detail: ColourDropDetail) => {
    if (splash) return; // one drop at a time
    const colour = colourDropByKey(detail.colourKey);
    if (!colour) return;
    const colourCss = hueFromHSL(colour.hsl.hue, colour.hsl.saturation, colour.hsl.lightness).css;
    setSplash({ colourCss, origin: detail.origin, ripples: detail.ripples, phase: "landing" });
    setCommittedSelection(detail.span);
    setShowNudgeReady(false);
    setRewriteError(null);
    setRewrite(null);
    startRewrite(async () => {
      try {
        const result = await suggestRewrite({
          text: detail.span.text,
          target: colour.target,
          intensity,
        });
        if (!result) {
          setSplash(null);
          setCommittedSelection(null);
          toast.error(
            "Drop on a fuller passage — the rewrite needs at least 8 words around the word.",
          );
          return;
        }
        // Step two: bloom the splash, then reveal the diff once it settles.
        setSplash((s) => (s ? { ...s, phase: "splash" } : s));
        window.setTimeout(() => {
          setRewrite(result);
          setSplash(null);
        }, 950);
      } catch (err) {
        setSplash(null);
        setCommittedSelection(null);
        setRewriteError((err as Error).message);
      }
    });
  };

  const acceptRewrite = (text: string) => {
    const html = text
      .split(/\n\s*\n+/)
      .flatMap((p) => {
        const trimmed = p.trim();
        return trimmed ? [`<p>${escapeHtml(trimmed)}</p>`] : [];
      })
      .join("");
    // Snapshot the draft being replaced — the remount below wipes TipTap undo.
    setVersions((stack) =>
      pushVersion(stack, { html: draft, sourceTarget: composedTarget, takenAt: Date.now() }),
    );
    if (committedSelection) {
      editorRef.current?.replaceRange(committedSelection.from, committedSelection.to, html);
    } else {
      setDraft(html);
      setEditorKey((k) => k + 1);
    }
    setRewrite(null);
    setShowNudgeReady(false);
    setCommittedSelection(null);
    setLiveSelection(null);
  };

  const restoreVersion = (version: DraftVersion) => {
    // The current draft becomes a version too, so a restore is reversible.
    setVersions((stack) =>
      pushVersion(stack, { html: draft, sourceTarget: "", takenAt: Date.now() }),
    );
    setDraft(version.html);
    setRewrite(null);
    setRewriteError(null);
    setShowNudgeReady(false);
    setEditorKey((k) => k + 1);
  };

  const rejectRewrite = () => {
    setRewrite(null);
    setRewriteError(null);
    setShowNudgeReady(false);
    setCommittedSelection(null);
    setLiveSelection(null);
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
        {stats.words > 0 && <ExportControls markdown={markdown} />}
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          {bandVisible && (
            <HueBand
              segments={band}
              onHover={(index, tint) => setHighlight(index == null ? null : { index, tint })}
              onActivate={(index) => editorRef.current?.focusBlock(index)}
            />
          )}
          <Card className="relative overflow-hidden bg-card/60">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-ink-bleed to-transparent opacity-60"
            />
            {splash && <ColourSplash splash={splash} />}
            {(isRewriting || showNudgeReady) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
                <p className="text-xs italic text-muted-foreground/70">
                  {isRewriting ? (
                    <>
                      <span className="mr-1 inline-block animate-pulse">✦</span>
                      Rewriting toward target…
                    </>
                  ) : (
                    <>
                      <span className="mr-1 text-ink-bleed">✓</span>
                      Nudge ready
                    </>
                  )}
                </p>
              </div>
            )}
            <CardContent className="p-6 sm:p-8">
              {rewrite && (
                <div>
                  <DiffActions
                    resolvedCount={diff.resolvedCount}
                    totalChanges={diff.totalChanges}
                    onApply={() => acceptRewrite(diff.resolvedText())}
                    onAcceptAll={() => acceptRewrite(rewrite.rewrite)}
                    onReject={rejectRewrite}
                    onHighlightEnter={() => setHighlightPending(true)}
                    onHighlightLeave={() => setHighlightPending(false)}
                  />
                  {/* One block-flow prose container mirroring the editor exactly,
                      so before/diff/after paragraphs collapse margins uniformly. */}
                  <div className="mt-4 max-h-[min(430px,calc(100vh-31rem))] min-h-[260px] w-full overflow-y-auto overscroll-contain px-3 pt-8 pb-8 font-serif text-lg leading-relaxed text-ink-deep">
                    {blockBefore.map((para) => (
                      <p key={para} className="my-3 first:mt-0 text-ink-deep/40 select-none">
                        {para}
                      </p>
                    ))}
                    <DiffText
                      segments={diff.segments}
                      states={diff.states}
                      setHunkState={diff.setHunkState}
                      highlightPending={highlightPending}
                      leadIn={leadIn}
                      tailOut={tailOut}
                    />
                    {blockAfter.map((para) => (
                      <p key={para} className="my-3 first:mt-0 text-ink-deep/40 select-none">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {/* Editor stays mounted under the diff (hidden) so editorRef stays
                  live — acceptRewrite's replaceRange splices into the real doc. */}
              <div className={cn(rewrite && "hidden")}>
                <Editor
                  key={editorKey}
                  ref={editorRef}
                  initialContent={draft}
                  placeholder="Write a paragraph and watch the ink reveal itself…"
                  onChange={setDraft}
                  onDeriveHue={deriveTextColour}
                  onRewriteSelection={rewriteSelection}
                  onSelectionChange={setLiveSelection}
                  highlightBlock={highlight}
                  pendingRewriteRange={isRewriting ? committedSelection : liveSelection}
                  pendingRewriteLoading={isRewriting && !!committedSelection}
                  onColourDrop={handleColourDrop}
                />
              </div>
            </CardContent>
          </Card>
          {stats.words > 0 && <WritingStatsBar stats={stats} />}
          {explain && (
            <HueExplainer segments={explanation} tint={readout} isPending={explainPending} />
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <PanelSelector
            preset={panelPreset}
            customPanels={customPanels}
            onPresetChange={changePanelPreset}
            onCustomToggle={toggleCustomPanel}
          />
          {panelVisible("hue") && (
            <HueReadout
              targetActive={targetActive}
              hasText={hasDraftText}
              wordCount={countWords(draft)}
              readout={hasDraftText ? readout : null}
              isPending={isPending}
              explain={explain}
              onToggleExplain={() => setExplain((v) => !v)}
            />
          )}
          {panelVisible("fingerprint") && fingerprint && <StyleFingerprint metrics={fingerprint} />}
          {panelVisible("arc") && arc && (
            <ArcChart
              arc={arc}
              onHover={(paragraphIndex) =>
                setHighlight(paragraphIndex == null ? null : { index: paragraphIndex, tint: null })
              }
            />
          )}
          {panelVisible("neighbours") && neighbours.length > 0 && (
            <NeighbourAuthors neighbours={neighbours} />
          )}
          {panelVisible("version") && (
            <VersionHistory versions={versions} onRestore={restoreVersion} />
          )}
          {panelVisible("target") && (
            <TargetPicker
              target={target}
              onTargetChange={setTarget}
              selection={widgetSelection}
              onWidgetChange={(key, value) =>
                setWidgetSelection((prev) => ({ ...prev, [key]: value }))
              }
              composedTarget={composedTarget}
              intensity={intensity}
              onIntensityChange={setIntensity}
              wordCount={countWords(draft)}
              onRequest={requestRewrite}
              isPending={isRewriting}
              hasRewrite={rewrite !== null}
              selectionText={liveSelection?.text ?? null}
              onClearSelection={() => setLiveSelection(null)}
              error={rewriteError}
            />
          )}
          {panelVisible("target") && <DriftMeter readout={readout} target={targetColour} />}
          {panelVisible("colour") && <ColourPalette />}
          {panelVisible("save") && (
            <SaveSettings
              cloudSave={cloudSave}
              cloudSavedAt={cloudSavedAt}
              onToggle={toggleCloudSave}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel selector — preset tabs + custom toggles at the top of the sidebar
// ---------------------------------------------------------------------------

const PRESET_LABELS: Record<PanelPreset, string> = {
  essentials: "Essentials",
  analyse: "Analyse",
  rewrite: "Rewrite",
  custom: "Custom",
};

function PanelSelector({
  preset,
  customPanels,
  onPresetChange,
  onCustomToggle,
}: {
  preset: PanelPreset;
  customPanels: Set<string>;
  onPresetChange: (p: PanelPreset) => void;
  onCustomToggle: (key: string) => void;
}) {
  const presets = Object.keys(PRESET_LABELS) as PanelPreset[];
  return (
    <div className="flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Panel preset"
        className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
      >
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={preset === p}
            onClick={() => onPresetChange(p)}
            className={cn(
              "flex-1 rounded-md py-1 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              preset === p
                ? "bg-card text-ink-deep shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <Popover.Root>
          <Popover.Trigger
            className={cn(
              "flex items-center justify-between rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            )}
          >
            <span className="flex items-center gap-1.5">
              Panels
              <ChevronDown className="size-3" />
            </span>
            <span className="tabular-nums">{customPanels.size} active</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              className="z-50 flex w-[var(--radix-popover-trigger-width)] flex-col rounded-md border border-border bg-card p-1 shadow-md"
            >
              {CUSTOM_PANEL_OPTIONS.map((opt) => {
                const on = customPanels.has(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onCustomToggle(opt.key)}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      on
                        ? "text-ink-bleed"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Check className={cn("size-3.5 shrink-0", !on && "opacity-0")} />
                    {opt.label}
                  </button>
                );
              })}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
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

function plainText(html: string): string {
  return html
    .replace(/<\/?(p|div|h[1-6]|li|br)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function HueReadout({
  targetActive,
  hasText,
  wordCount,
  readout,
  isPending,
  explain,
  onToggleExplain,
}: {
  targetActive: boolean;
  hasText: boolean;
  wordCount: number;
  readout: TextColour | null;
  isPending: boolean;
  explain: boolean;
  onToggleExplain: () => void;
}) {
  const swatchCss = readout
    ? hueFromHSL(readout.hue, readout.saturation, readout.lightness).css
    : undefined;
  const label = readout ? readout.justification : "—";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <HueSwatch swatchCss={swatchCss} showWave={hasText} />

          <div className="flex min-w-0 flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              your current hue
            </span>
            <span className="font-serif text-base leading-tight text-ink-deep">{label}</span>
          </div>
        </div>
        <p className="text-xs italic leading-snug text-muted-foreground">
          {readout
            ? !targetActive
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
        {readout && (
          <button
            type="button"
            aria-pressed={explain}
            onClick={onToggleExplain}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 self-start rounded-md border px-2 text-[11px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              explain
                ? "border-ink-deep bg-ink-deep text-ink-paper"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Lightbulb className="size-3.5" />
            {explain ? "Hide why" : "Why this colour?"}
          </button>
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
function HueBand({
  segments,
  onHover,
  onActivate,
}: {
  segments: BandSegment[];
  /** Hovered/focused segment index + its hue (null on leave) — drives the
   *  editor highlight. */
  onHover?: (index: number | null, tint: string | null) => void;
  /** Clicked/activated segment index — jumps the editor to that paragraph. */
  onActivate?: (index: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered != null ? segments[hovered] : null;

  const enter = (index: number, tint: string | null) => {
    setHovered(index);
    onHover?.(index, tint);
  };
  const leave = () => {
    setHovered(null);
    onHover?.(null, null);
  };

  return (
    <Card className="bg-card/60">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">Hue band</h2>
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
                onMouseEnter={() => enter(i, css ?? null)}
                onMouseLeave={leave}
                onFocus={() => enter(i, css ?? null)}
                onBlur={leave}
                onClick={() => onActivate?.(i)}
                title="Jump to this paragraph"
                aria-label={
                  seg.colour
                    ? `Paragraph ${i + 1}: ${seg.colour.justification}. Jump to it.`
                    : `Paragraph ${i + 1}: too short to read. Jump to it.`
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
              ? `"${truncate(active.text)}" — ${active.colour.justification}`
              : `"${truncate(active.text)}" — too short to read`
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
// Map distance (0 = identical, ~1+ = far across five 0..1 axes) to a 0..1
// closeness for the bar. Clamp so the nearest never reads as a full bar
// unless it's an exact match.
const closeness = (d: number) => Math.max(0, 1 - d);

function NeighbourAuthors({ neighbours }: { neighbours: StyleNeighbour[] }) {
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

/**
 * Drift-to-target meter (#5) — a live bar showing how close the draft's hue has
 * drifted toward the target's. Both sit on the same HSL scale, so the gap is
 * meaningful; the bar fills as the writer edits toward the target, turning the
 * abstract "style space" into direct, playful feedback. Shown only in target
 * mode, once a target colour has resolved.
 */
function DriftMeter({
  readout,
  target,
}: {
  readout: TextColour | null;
  target: TextColour | null;
}) {
  if (!target) return null;
  const proximity = readout ? driftToTarget(readout, target) : 0;
  const pct = Math.round(proximity * 100);
  const targetCss = hueFromHSL(target.hue, target.saturation, target.lightness).css;
  const draftCss = readout
    ? hueFromHSL(readout.hue, readout.saturation, readout.lightness).css
    : "var(--muted)";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Drift to target
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {readout ? `${pct}%` : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: draftCss }}
            title="your current hue"
          />
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={readout ? pct : 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Drift toward ${target.justification}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(2, proximity * 100)}%`, backgroundColor: targetCss }}
            />
          </div>
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: targetCss }}
            title="target hue"
          />
        </div>
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          {readout
            ? pct >= 90
              ? "You're there — the ink matches your target."
              : `${pct}% to "${target.justification}". Keep nudging.`
            : "Write a few words and the meter will find your target."}
        </p>
      </CardContent>
    </Card>
  );
}

const INTENSITY_LABELS: Record<number, string> = {
  1: "Whisper",
  2: "Subtle",
  3: "Moderate",
  4: "Bold",
  5: "Full",
};

function TargetPicker({
  target,
  onTargetChange,
  selection,
  onWidgetChange,
  composedTarget,
  intensity,
  onIntensityChange,
  wordCount,
  onRequest,
  isPending,
  hasRewrite,
  selectionText,
  onClearSelection,
  error,
}: {
  target: string;
  onTargetChange: (s: string) => void;
  selection: WidgetSelection;
  onWidgetChange: (key: string, value: string | null) => void;
  composedTarget: string;
  intensity: number;
  onIntensityChange: (n: number) => void;
  wordCount: number;
  onRequest: () => void;
  isPending: boolean;
  hasRewrite: boolean;
  selectionText: string | null;
  onClearSelection: () => void;
  error: string | null;
}) {
  const effectiveWordCount = selectionText ? countWords(selectionText) : wordCount;
  const canAsk = effectiveWordCount >= 3 && composedTarget.trim().length > 0 && !isPending;
  const buttonLabel = selectionText
    ? "Nudge selection"
    : hasRewrite
      ? "Try another nudge"
      : "Suggest a nudge";
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">target</span>
          <TargetWidgets selection={selection} onChange={onWidgetChange} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            In your own words (optional)
          </span>
          <input
            type="text"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="warm, melancholy · Hemingway-like · lush, baroque"
            className="h-9 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
        </label>
        {composedTarget ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Aiming for: <span className="italic">{composedTarget}</span>
          </p>
        ) : (
          <p className="text-[11px] italic leading-snug text-muted-foreground">
            Pick facets, write your own brief, or both — Claude rewrites toward the combination.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              intensity
            </span>
            <span className="text-xs text-ink-bleed">{INTENSITY_LABELS[intensity]}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={intensity}
            onChange={(e) => onIntensityChange(Number(e.target.value))}
            className="w-full accent-ink-bleed"
            aria-label="Rewrite intensity"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Whisper</span>
            <span>Full</span>
          </div>
        </div>
        {selectionText && (
          <div className="flex items-center gap-1 rounded-md bg-ink-bleed/10 px-2 py-1 text-[11px] text-ink-bleed">
            <span className="min-w-0 flex-1 truncate italic">
              &ldquo;{selectionText.length > 48 ? `${selectionText.slice(0, 48)}…` : selectionText}
              &rdquo;
            </span>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={onClearSelection}
              className="shrink-0 rounded p-0.5 hover:bg-ink-bleed/20 transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={onRequest} disabled={!canAsk}>
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {buttonLabel}
        </Button>
        {isPending && (
          <p className="text-[11px] italic text-muted-foreground">Claude is rewriting…</p>
        )}
        {error && <p className="text-[11px] italic text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Pre-rewrite snapshots. Every accepted rewrite (and every restore) banks the
 * draft it replaced; one click brings it back — restores snapshot the current
 * draft first, so going back is itself reversible.
 */
function VersionHistory({
  versions,
  onRestore,
}: {
  versions: DraftVersion[];
  onRestore: (version: DraftVersion) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <h2 className="flex items-center gap-1.5 text-[10px] tracking-widest text-muted-foreground uppercase">
          <History aria-hidden="true" className="size-3.5" /> Versions
        </h2>
        <ul className="flex flex-col gap-1.5">
          {versions.map((version) => (
            <li key={`${version.takenAt}:${version.html.length}`}>
              <button
                type="button"
                onClick={() => onRestore(version)}
                title="Restore this draft (the current draft is kept as a version)"
                className={cn(
                  "flex w-full items-baseline justify-between gap-2 rounded-sm px-1 py-0.5 text-left text-xs",
                  "transition-colors hover:bg-muted/60 hover:text-ink-deep",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
              >
                <span className="truncate text-ink-deep">
                  {version.sourceTarget ? `toward "${version.sourceTarget}"` : "snapshot"}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {new Date(version.takenAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          Drafts replaced by a rewrite land here — click one to bring it back.
        </p>
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
 *  - Quadratic-bezier sine with 24-px period (two strong curves per
 *    visible width) and 4-px amplitude around a baseline at y=30 —
 *    keeps the grey area roughly the top 60 % of the circle.
 *  - The gradient repeats the rainbow twice (0..50 % is one full sweep,
 *    50..100 % the same again) so when the wave translates by exactly
 *    -48 px, the colours at any fixed canvas x are identical to t=0
 *    and the loop is seamless.
 */
function HueSwatch({ swatchCss, showWave }: { swatchCss: string | undefined; showWave: boolean }) {
  const hasHue = !!swatchCss;
  const wavePath =
    "M0,30 Q6,26 12,30 T24,30 T36,30 T48,30 T60,30 T72,30 T84,30 T96,30 L96,48 L0,48 Z";
  const emptyWavePath =
    "M-18,30 Q-12,26 -6,30 T6,30 T18,30 T30,30 T42,30 T54,30 T66,30 T78,30 T90,30 T102,30 L102,48 L-18,48 Z";

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
        className={cn(
          "absolute inset-0 size-full transition-all duration-1000",
          showWave || hasHue ? "scale-105 opacity-0 blur-[1px]" : "scale-100 opacity-100 blur-0",
        )}
      >
        <title>Empty hue placeholder</title>
        <defs>
          <linearGradient id="hue-empty-drop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(252, 60%, 76%)" />
            <stop offset="100%" stopColor="hsl(252, 48%, 48%)" />
          </linearGradient>
          <linearGradient id="hue-empty-wave" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(252, 55%, 68%)" stopOpacity="0.78" />
            <stop offset="100%" stopColor="hsl(252, 48%, 46%)" stopOpacity="0.52" />
          </linearGradient>
        </defs>
        <path
          className={cn("inklings-hue-empty-wave", showWave && "inklings-hue-purple-wave-dissolve")}
          fill="url(#hue-empty-wave)"
          d={emptyWavePath}
        />
        <g
          className={cn("inklings-hue-empty-drop", showWave && "inklings-hue-empty-drop-dissolve")}
        >
          <path
            d="M24 16 C21.8 19.2 20.4 21.5 20.4 23.7 C20.4 26 22 27.8 24 27.8 C26 27.8 27.6 26 27.6 23.7 C27.6 21.5 26.2 19.2 24 16 Z"
            fill="url(#hue-empty-drop)"
          />
          <path
            d="M23.1 19.4 C22.2 21 21.8 22.3 21.8 23.5"
            fill="none"
            stroke="hsl(252, 75%, 86%)"
            strokeLinecap="round"
            strokeOpacity="0.42"
            strokeWidth="0.8"
          />
        </g>
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        preserveAspectRatio="none"
        className={cn(
          "absolute inset-0 size-full transition-opacity delay-200 duration-[900ms]",
          showWave ? "opacity-100" : "opacity-0",
        )}
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
          <path fill="url(#hue-wave-rainbow)" d={wavePath} />
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
