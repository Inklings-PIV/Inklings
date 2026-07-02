"use client";

import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  History,
  Lightbulb,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type CapturedHue,
  ColourSplash,
  type CustomSwatch,
  capturedHueCss,
  colourCssOf,
  colourDropByKey,
  HUE_CAPTURE_MIME,
  NEUTRAL_INK_CSS,
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
import { RewritePanel } from "@/components/quill/rewrite-panel";
import { useDiff } from "@/components/quill/use-diff";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { type FingerprintMetric, toFingerprint } from "@/lib/quill/fingerprint";
import { type DraftVersion, pushVersion } from "@/lib/quill/history";
import { htmlToMarkdown } from "@/lib/quill/markdown";
import { splitParagraphs } from "@/lib/quill/paragraphs";
import { computeWritingStats, type WritingStats } from "@/lib/quill/stats";
import { type WidgetSelection, widgetsToTarget } from "@/lib/quill/widgets";
import { cn } from "@/lib/utils";
import {
  deriveDraftStylometry,
  deriveParagraphHues,
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
type LeftPanel = "hue" | "fingerprint" | "neighbours" | null;
type RightPanel = "versions" | "colour" | "words" | null;

const LOCAL_DRAFT_KEY = "inklings-quill-draft";
const CLOUD_PREF_KEY = "inklings-quill-cloud-save";
const CLOUD_SAVE_DEBOUNCE_MS = 2000;
const BRUSH_SIZE_KEY = "inklings-quill-brush-size";
const ANIMATE_KEY = "inklings-quill-animate-rewrite";

// Splash blot size multiplier per brush size — a bigger brush throws more ink.
const BRUSH_SPLASH_SCALE: Record<number, number> = { 1: 0.7, 3: 1, 7: 1.4 };

export default function QuillPage() {
  // Local-first per the #45 privacy decision — the draft lives in
  // localStorage by default and only round-trips to the server when the
  // writer opts in via the saved cloud preference.
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
  const [_cloudSavedAt, setCloudSavedAt] = useState<Date | null>(null);
  // Block the autosave effects until the localStorage hydration pass
  // runs — otherwise the first render would wipe a saved draft with
  // the empty default and immediately delete the cloud row.
  const [hydrated, setHydrated] = useState(false);

  // Target mode state. The free-text note plus the widget facets compose
  // into one target string (PromptCanvas, idea #3) — backend unchanged.
  const [target, setTarget] = useState("");
  const [widgetSelection, setWidgetSelection] = useState<WidgetSelection>({});
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
  // Fused rewrite controls: an optionally-selected mood colour folded into the
  // target, the brush size (sentence / passage / whole) for colour drops, and
  // whether a button-triggered rewrite plays the splash. Brush + animate persist.
  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(3);
  const [animateOnRewrite, setAnimateOnRewrite] = useState(true);
  // User-made swatches: hues extracted from a passage (right-click capture or a
  // Hue-band drag) or mixed in the beaker. They sit in the grid beside the
  // predefined pigments, draggable and tappable like any other.
  const [customSwatches, setCustomSwatches] = useState<CustomSwatch[]>([]);
  // Pre-rewrite snapshots. Accepting a rewrite remounts the editor and wipes
  // TipTap's undo stack — this is the way back.
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [versionLabels, setVersionLabels] = useState<Record<string, string>>({});
  const [currentVersionKey, setCurrentVersionKey] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("hue");
  const [rightPanel, setRightPanel] = useState<RightPanel>("colour");
  // Live selection drives the sidebar indicator; committed selection is frozen
  // at request-time and used to keep the loading mark connected to the rewrite.
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

  const targetActive = true;

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft);
    if (!currentVersionKey) return;
    setVersions((stack) =>
      stack.map((entry) =>
        versionMatchesKey(entry, currentVersionKey) ? { ...entry, html: nextDraft } : entry,
      ),
    );
  };

  // Paragraph hue strip. Cache hues by paragraph text so a typing burst only
  // re-derives the block that actually changed; the strip shows the hue trail across
  // the whole draft in Readout mode.
  const hueCacheRef = useRef<Record<string, TextColour | null>>({});
  const [band, setBand] = useState<BandSegment[]>([]);
  const [bandPending, setBandPending] = useState(false);
  const [showRail, setShowRail] = useState(false);
  const blockHues = useMemo(
    () =>
      band.map((s) =>
        s.colour ? hueFromHSL(s.colour.hue, s.colour.saturation, s.colour.lightness).css : null,
      ),
    [band],
  );
  // Paragraph hue strip → editor link. Hovering a band segment highlights its
  // paragraph in the editor (tinted in that segment's own hue); clicking one
  // jumps to it. The editor handle lets the click select the block imperatively.
  const editorRef = useRef<EditorHandle>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ index: number; tint: string | null } | null>(null);

  // Live stylometric fingerprint of the draft (style-level). Cheap CPU-only
  // derivation, so we can recompute on the same cadence as the hue readout.
  const [fingerprint, setFingerprint] = useState<FingerprintMetric[] | null>(null);
  // Corpus authors closest to the draft's fingerprint (style-level, S4).
  const [neighbours, setNeighbours] = useState<StyleNeighbour[]>([]);

  // Selected mood colour (optional) + widgets + free-text note, composed into
  // one target. "" when nothing is set — every consumer treats that as "no
  // target yet". The colour is just another phrase, so drift/rewrite see it too.
  const composedTarget = useMemo(() => {
    const colourPhrase = !selectedColour
      ? undefined
      : (colourDropByKey(selectedColour)?.target ??
        customSwatches.find((w) => w.id === selectedColour)?.phrase);
    const words = widgetsToTarget(widgetSelection, target);
    return [colourPhrase, words].filter(Boolean).join("; ");
  }, [selectedColour, customSwatches, widgetSelection, target]);

  // CSS for a swatch key (predefined pigment or a custom swatch id), for the
  // splash colour. Falls back to neutral ink when nothing resolves.
  const swatchCss = (key: string | null): string => {
    if (!key) return NEUTRAL_INK_CSS;
    const c = colourDropByKey(key);
    if (c) return colourCssOf(c);
    const w = customSwatches.find((w) => w.id === key);
    return w ? capturedHueCss(w) : NEUTRAL_INK_CSS;
  };
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
      setDraft(localDraft);
      setCloudSave(cloudPref);
      const savedBrush = Number(window.localStorage.getItem(BRUSH_SIZE_KEY));
      if ([1, 3, 7].includes(savedBrush)) setBrushSize(savedBrush);
      const savedAnimate = window.localStorage.getItem(ANIMATE_KEY);
      if (savedAnimate !== null) setAnimateOnRewrite(savedAnimate === "true");
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

  useEffect(() => {
    if (!rewrite) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = diffScrollRef.current;
      const firstHunk = scroller?.querySelector<HTMLElement>("[data-diff-hunk='true']");
      if (!scroller || !firstHunk) return;

      const scrollerTop = scroller.getBoundingClientRect().top;
      const hunkTop = firstHunk.getBoundingClientRect().top;
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + hunkTop - scrollerTop - 28),
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [rewrite]);

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

  useEffect(() => {
    if (versions.length === 0 && rightPanel === "versions") setRightPanel("colour");
  }, [versions.length, rightPanel]);

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

  const changeBrushSize = (size: number) => {
    setBrushSize(size);
    try {
      window.localStorage.setItem(BRUSH_SIZE_KEY, String(size));
    } catch {
      // Storage can throw in private mode / quota-full; we tolerate it.
    }
  };

  // Tap a swatch to fold its mood into the target (toggle on/off).
  const toggleColour = (key: string) => setSelectedColour((prev) => (prev === key ? null : key));

  const renameVersionLabel = (key: string, label: string) => {
    const next = label.trim();
    setVersionLabels((labels) => {
      const copy = { ...labels };
      if (next) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  };

  const deleteVersion = (version: DraftVersion) => {
    const key = versionKey(version);
    const index = versions.findIndex((entry) => versionKey(entry) === key);
    if (index === -1) return;

    const isOriginal = index === versions.length - 1;
    const isCurrent = versionMatchesKey(version, currentVersionKey) || draft === version.html;
    const nextVersions = versions.filter((entry) => versionKey(entry) !== key);

    if (isOriginal) {
      setDraft("");
      setEditorKey((k) => k + 1);
      setCurrentVersionKey(null);
    } else if (isCurrent) {
      const previousVersion = versions[index + 1] ?? nextVersions[nextVersions.length - 1] ?? null;
      if (previousVersion) {
        setDraft(previousVersion.html);
        setCurrentVersionKey(versionKey(previousVersion));
        setEditorKey((k) => k + 1);
      } else {
        setDraft("");
        setCurrentVersionKey(null);
        setEditorKey((k) => k + 1);
      }
    }

    setVersions(nextVersions);
    setVersionLabels((labels) => {
      const copy = { ...labels };
      delete copy[key];
      return copy;
    });
    setRewrite(null);
    setRewriteError(null);
    setShowNudgeReady(false);
    setCommittedSelection(null);
    setLiveSelection(null);
  };

  // Add a new custom swatch from a capture (right-click / Hue-band drag) or a mix.
  const addSwatch = (hue: CapturedHue) =>
    setCustomSwatches((s) => [...s, { ...hue, id: crypto.randomUUID() }]);

  // Replace an existing custom swatch's hue (a hue/text dropped onto it).
  const replaceSwatch = (id: string, hue: CapturedHue) =>
    setCustomSwatches((s) => s.map((w) => (w.id === id ? { ...w, ...hue } : w)));

  // Remove a custom swatch; deselect it if it was the composed colour.
  const removeSwatch = (id: string) => {
    setCustomSwatches((s) => s.filter((w) => w.id !== id));
    setSelectedColour((prev) => (prev === id ? null : prev));
  };

  // Drop a text selection into a swatch — derive its hue, then capture it into
  // the given swatch (`targetId`) or, with none, a new one.
  const captureHueFromText = (text: string, targetId?: string) => {
    const id = toast.loading("Reading the hue…");
    deriveTextColour(text)
      .then((c) => {
        if (!c) {
          toast.error("Selection too short to read a hue", { id });
          return;
        }
        const hue = {
          hsl: { hue: c.hue, saturation: c.saturation, lightness: c.lightness },
          phrase: c.justification,
        };
        if (targetId) replaceSwatch(targetId, hue);
        else addSwatch(hue);
        toast.success(`Captured — ${c.justification}`, { id });
      })
      .catch(() => toast.error("Couldn't read the hue", { id }));
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

  // Debounced paragraph hue strip — 800 ms after the last keystroke, derive a hue per
  // paragraph (only the uncached ones) and lay them out in the Hue card.
  useEffect(() => {
    let cancelled = false;
    const parasBeforeDebounce = splitParagraphs(draft);
    setBandPending(parasBeforeDebounce.length >= 2);
    const handle = setTimeout(async () => {
      const paras = splitParagraphs(draft);
      if (paras.length < 2) {
        if (!cancelled) {
          setBand([]);
          setBandPending(false);
        }
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
      setBandPending(false);
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft]);

  // Clear the paragraph-strip highlight whenever the band isn't on screen,
  // or the draft dropped below two paragraphs) — the band's own mouse-leave
  // can't fire once it has unmounted, so a stale highlight would otherwise stick.
  const bandVisible = band.length >= 2;
  useEffect(() => {
    if (!bandVisible) setHighlight(null);
  }, [bandVisible]);

  // The single rewrite flow behind every entry point — a colour drag, the
  // Rewrite button, a selection. `span` null means "the whole draft". When
  // `coords` is set the splash plays over them and the diff is revealed only
  // once it settles; otherwise the diff appears immediately.
  const runRewrite = (opts: {
    text: string;
    span: SelectionRange | null;
    target: string;
    coords: { origin: { x: number; y: number }; ripples: { x: number; y: number }[] } | null;
    colourCss: string;
    scale?: number;
    tooShort: string;
  }) => {
    if (splash) return; // a splash is mid-flight — ignore until it clears
    setCommittedSelection(opts.span);
    setShowNudgeReady(false);
    setRewriteError(null);
    setRewrite(null);
    if (opts.coords) {
      setSplash({
        colourCss: opts.colourCss,
        origin: opts.coords.origin,
        ripples: opts.coords.ripples,
        phase: "landing",
        scale: opts.scale ?? 1,
      });
    }
    startRewrite(async () => {
      try {
        const result = await suggestRewrite({ text: opts.text, target: opts.target, intensity });
        if (!result) {
          setSplash(null);
          setCommittedSelection(null);
          if (opts.coords) toast.error(opts.tooShort);
          else setRewriteError(opts.tooShort);
          return;
        }
        if (opts.coords) {
          // Bloom the splash, then reveal the diff once it settles.
          setSplash((s) => (s ? { ...s, phase: "splash" } : s));
          window.setTimeout(() => {
            setRewrite(result);
            setSplash(null);
          }, 950);
        } else {
          setRewrite(result);
        }
      } catch (err) {
        setSplash(null);
        setCommittedSelection(null);
        setRewriteError((err as Error).message);
      }
    });
  };

  // The Rewrite button: rewrite the selection if there is one, else the whole
  // draft, toward the composed target. Animate over the selection when the
  // toggle is on (whole-draft rewrites never splash — it'd cover everything).
  const requestRewrite = () => {
    const sel = editorRef.current?.getSelection() ?? null;
    const coords =
      animateOnRewrite && sel
        ? (editorRef.current?.splashPointsFor(sel.from, sel.to) ?? null)
        : null;
    runRewrite({
      text: sel?.text ?? draft,
      span: sel,
      target: composedTarget,
      coords,
      colourCss: swatchCss(selectedColour),
      tooShort: "Write at least 8 words and enter a target before asking for a rewrite.",
    });
  };

  // Drag gesture: a swatch dropped on a word — colour-only target (ignores the
  // form), always animated, span sized by the brush (or the selection, which the
  // editor lets win). The dropped swatch may be a base colour or the hue slot.
  const handleColourDrop = (detail: ColourDropDetail) => {
    const pigment = colourDropByKey(detail.colourKey);
    const custom = customSwatches.find((w) => w.id === detail.colourKey);
    const resolved = pigment
      ? { phrase: pigment.target, css: colourCssOf(pigment) }
      : custom
        ? { phrase: custom.phrase, css: capturedHueCss(custom) }
        : null;
    if (!resolved) return;
    runRewrite({
      text: detail.span.text,
      span: detail.span,
      target: resolved.phrase,
      coords: { origin: detail.origin, ripples: detail.ripples },
      colourCss: resolved.css,
      scale: BRUSH_SPLASH_SCALE[brushSize] ?? 1,
      tooShort: "Write a little more before dropping a colour — rewrites need at least 8 words.",
    });
  };

  const acceptRewrite = (text: string) => {
    // Snapshot the draft being replaced — the remount below wipes TipTap undo.
    const takenAt = Date.now();
    const previousVersion: DraftVersion = { html: draft, sourceTarget: "", takenAt };
    let acceptedHtml: string | null = null;
    if (committedSelection) {
      // The editor splices as an open ProseMirror slice, so the rewrite merges
      // at the cut points (no host-paragraph splitting), whatever the span.
      acceptedHtml =
        editorRef.current?.replaceRange(committedSelection.from, committedSelection.to, text) ??
        null;
    } else {
      const asBlocks = text
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");
      acceptedHtml = asBlocks;
      setDraft(asBlocks);
      setEditorKey((k) => k + 1);
    }
    const acceptedVersion = acceptedHtml
      ? { html: acceptedHtml, sourceTarget: composedTarget, takenAt: takenAt + 1 }
      : null;
    setVersions((stack) => {
      let next = pushVersionOnce(stack, previousVersion);
      if (acceptedVersion) next = pushVersionOnce(next, acceptedVersion);
      return next;
    });
    if (acceptedVersion) setCurrentVersionKey(versionKey(acceptedVersion));
    setRewrite(null);
    setShowNudgeReady(false);
    setCommittedSelection(null);
    setLiveSelection(null);
  };

  const restoreVersion = (version: DraftVersion) => {
    const key = versionKey(version);
    if (versionMatchesKey(version, currentVersionKey) || draft === version.html) {
      setCurrentVersionKey(key);
      return;
    }
    // The current draft becomes a version too, so a restore is reversible.
    setVersions((stack) =>
      stack.some((entry) => entry.html === draft)
        ? [...stack]
        : pushVersion(stack, { html: draft, sourceTarget: "", takenAt: Date.now() }),
    );
    setDraft(version.html);
    setCurrentVersionKey(key);
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
    <div className="mx-auto w-full max-w-[118rem] px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:items-start">
        <aside className="order-2 flex flex-col gap-3 xl:order-1 xl:pt-[4.75rem]">
          <HueReadout
            open={leftPanel === "hue"}
            onToggleOpen={() => setLeftPanel((panel) => (panel === "hue" ? null : "hue"))}
            targetActive={targetActive}
            hasText={hasDraftText}
            wordCount={countWords(draft)}
            readout={hasDraftText ? readout : null}
            isPending={isPending}
            explain={explain}
            onToggleExplain={() => setExplain((v) => !v)}
            band={band}
            showBand={bandVisible}
            bandPending={bandPending}
            onBandHover={(index, tint) => setHighlight(index == null ? null : { index, tint })}
            onBandActivate={(index) => editorRef.current?.focusBlock(index)}
            showRail={showRail}
            onToggleRail={() => setShowRail((v) => !v)}
          />
          {leftPanel === "hue" && explain && (
            <HueExplainer segments={explanation} tint={readout} isPending={explainPending} />
          )}
          <StyleFingerprint
            open={leftPanel === "fingerprint"}
            onToggleOpen={() =>
              setLeftPanel((panel) => (panel === "fingerprint" ? null : "fingerprint"))
            }
            metrics={fingerprint}
          />
          <NeighbourAuthors
            open={leftPanel === "neighbours"}
            onToggleOpen={() =>
              setLeftPanel((panel) => (panel === "neighbours" ? null : "neighbours"))
            }
            neighbours={neighbours}
          />
        </aside>

        <main className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
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

          <div className="flex items-stretch gap-3">
            <Card className="relative min-w-0 flex-1 overflow-hidden bg-card/60">
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
                    <div
                      ref={diffScrollRef}
                      className="mt-4 max-h-[min(430px,calc(100vh-31rem))] min-h-[260px] w-full overflow-y-auto overscroll-contain px-3 pt-8 pb-8 font-serif text-lg leading-relaxed text-ink-deep"
                    >
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
                    onChange={updateDraft}
                    onDeriveHue={deriveTextColour}
                    onCaptureHue={(c) =>
                      addSwatch({
                        hsl: { hue: c.hue, saturation: c.saturation, lightness: c.lightness },
                        phrase: c.justification,
                      })
                    }
                    onRewriteSelection={rewriteSelection}
                    onSelectionChange={setLiveSelection}
                    blockHues={showRail && bandVisible ? blockHues : undefined}
                    highlightBlock={highlight}
                    pendingRewriteRange={isRewriting ? committedSelection : null}
                    pendingRewriteLoading={isRewriting && !!committedSelection}
                    onColourDrop={handleColourDrop}
                    brushSize={brushSize}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          {stats.words > 0 && <WritingStatsBar stats={stats} />}
        </main>

        <aside className="order-3 flex flex-col gap-3 xl:pt-[4.75rem]">
          {versions.length > 0 && (
            <VersionHistory
              open={rightPanel === "versions"}
              onToggleOpen={() =>
                setRightPanel((panel) => (panel === "versions" ? null : "versions"))
              }
              versions={versions}
              currentHtml={draft}
              labels={versionLabels}
              currentKey={currentVersionKey}
              onRestore={restoreVersion}
              onRename={renameVersionLabel}
              onDelete={deleteVersion}
            />
          )}
          <RewritePanel
            openPanel={rightPanel === "colour" || rightPanel === "words" ? rightPanel : null}
            onOpenPanelChange={(panel) => setRightPanel(panel)}
            onToggleColour={toggleColour}
            customSwatches={customSwatches}
            onAddHue={addSwatch}
            onReplaceHue={replaceSwatch}
            onRemoveSwatch={removeSwatch}
            onCaptureText={captureHueFromText}
            brushSize={brushSize}
            onBrushChange={changeBrushSize}
            selection={widgetSelection}
            onWidgetChange={(key, value) =>
              setWidgetSelection((prev) => ({ ...prev, [key]: value }))
            }
            target={target}
            onTargetChange={setTarget}
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
  open,
  onToggleOpen,
  targetActive,
  hasText,
  wordCount,
  readout,
  isPending,
  explain,
  onToggleExplain,
  band,
  showBand,
  bandPending,
  onBandHover,
  onBandActivate,
  showRail,
  onToggleRail,
}: {
  open: boolean;
  onToggleOpen: () => void;
  targetActive: boolean;
  hasText: boolean;
  wordCount: number;
  readout: TextColour | null;
  isPending: boolean;
  explain: boolean;
  onToggleExplain: () => void;
  band: BandSegment[];
  showBand: boolean;
  bandPending: boolean;
  onBandHover?: (index: number | null, tint: string | null) => void;
  onBandActivate?: (index: number) => void;
  showRail: boolean;
  onToggleRail: () => void;
}) {
  const swatchCss = readout
    ? hueFromHSL(readout.hue, readout.saturation, readout.lightness).css
    : undefined;
  const label = readout ? readout.justification : "—";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <HueSwatch swatchCss={swatchCss} showWave={hasText} />

            <div className="flex min-w-0 flex-col">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                your current hue
              </span>
              <span className="font-serif text-base leading-tight text-ink-deep">{label}</span>
            </div>
          </div>
          <CollapseButton open={open} label="current hue" onToggle={onToggleOpen} />
        </div>

        {open && (
          <>
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
            {(showBand || bandPending) && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                {showBand ? (
                  <HueArcStrip
                    segments={band}
                    onHover={onBandHover}
                    onActivate={onBandActivate}
                    showRail={showRail}
                    onToggleRail={onToggleRail}
                  />
                ) : (
                  <HueArcStripShimmer showRail={showRail} onToggleRail={onToggleRail} />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CollapseButton({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
      onClick={onToggle}
      className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ChevronDown
        aria-hidden="true"
        className={cn("size-3.5 transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

function HueArcStripShimmer({
  showRail,
  onToggleRail,
}: {
  showRail: boolean;
  onToggleRail: () => void;
}) {
  const pieces = [
    { id: "opening", width: "flex-[1.2]" },
    { id: "turn", width: "flex-[0.9]" },
    { id: "middle", width: "flex-[1.4]" },
    { id: "lift", width: "flex-[1]" },
    { id: "tail", width: "flex-[0.8]" },
  ];
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
          across paragraphs
        </h2>
        <button
          type="button"
          aria-pressed={showRail}
          aria-label={
            showRail ? "Hide paragraph hues beside text" : "Show paragraph hues beside text"
          }
          title={showRail ? "Hide beside text" : "Show beside text"}
          onClick={onToggleRail}
          className={cn(
            "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95",
            showRail
              ? "border-ink-deep bg-ink-deep text-ink-paper hover:bg-ink-deep/90"
              : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {showRail ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      </div>
      <div className="flex h-9 gap-0.5 overflow-hidden rounded-md">
        {pieces.map((piece, index) => (
          <div
            key={piece.id}
            className={cn(
              "relative h-full overflow-hidden bg-muted/60",
              piece.width,
              index === 0 && "rounded-l-md",
              index === pieces.length - 1 && "rounded-r-md",
            )}
          >
            <div className="absolute inset-0 -translate-x-full animate-[inklings-shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-ink-bleed/18 to-transparent" />
          </div>
        ))}
      </div>
      <p className="text-[11px] italic leading-snug text-muted-foreground">
        Reading paragraph hues…
      </p>
    </div>
  );
}

function HueArcStrip({
  segments,
  onHover,
  onActivate,
  showRail,
  onToggleRail,
}: {
  segments: BandSegment[];
  /** Hovered/focused segment index + its hue (null on leave) — drives the
   *  editor highlight. */
  onHover?: (index: number | null, tint: string | null) => void;
  /** Clicked/activated segment index — jumps the editor to that paragraph. */
  onActivate?: (index: number) => void;
  showRail: boolean;
  onToggleRail: () => void;
}) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(segments.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visibleSegments = segments.slice(start, start + pageSize);
  const end = start + visibleSegments.length;
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered != null ? segments[hovered] : null;
  const hasPrevious = currentPage > 0;
  const hasNext = currentPage < pageCount - 1;

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  const enter = (index: number, tint: string | null) => {
    setHovered(index);
    onHover?.(index, tint);
  };
  const leave = () => {
    setHovered(null);
    onHover?.(null, null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
          across paragraphs
        </h2>
        <button
          type="button"
          aria-pressed={showRail}
          aria-label={
            showRail ? "Hide paragraph hues beside text" : "Show paragraph hues beside text"
          }
          title={showRail ? "Hide beside text" : "Show beside text"}
          onClick={onToggleRail}
          className={cn(
            "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95",
            showRail
              ? "border-ink-deep bg-ink-deep text-ink-paper hover:bg-ink-deep/90"
              : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          {showRail ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only cleanup; keyboard clears via each button's onBlur. Leave lives on the row, not per-segment, so crossing the gap between buttons keeps the last highlight instead of flickering to null. */}
      <div className="flex h-9 gap-0.5" onMouseLeave={leave}>
        {visibleSegments.map((seg, visibleIndex) => {
          const absoluteIndex = start + visibleIndex;
          const css = seg.colour
            ? hueFromHSL(seg.colour.hue, seg.colour.saturation, seg.colour.lightness).css
            : undefined;
          return (
            <button
              type="button"
              key={seg.id}
              draggable={!!seg.colour}
              onDragStart={(e) => {
                if (!seg.colour) return;
                const hue: CapturedHue = {
                  hsl: {
                    hue: seg.colour.hue,
                    saturation: seg.colour.saturation,
                    lightness: seg.colour.lightness,
                  },
                  phrase: seg.colour.justification,
                };
                e.dataTransfer.setData(HUE_CAPTURE_MIME, JSON.stringify(hue));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onMouseEnter={() => enter(absoluteIndex, css ?? null)}
              onFocus={() => enter(absoluteIndex, css ?? null)}
              onBlur={leave}
              onClick={() => onActivate?.(absoluteIndex)}
              title="Jump to this paragraph — or drag its hue onto a Rewrite swatch"
              aria-label={
                seg.colour
                  ? `Paragraph ${absoluteIndex + 1}: ${seg.colour.justification}. Jump to it.`
                  : `Paragraph ${absoluteIndex + 1}: too short to read. Jump to it.`
              }
              className={cn(
                "h-full flex-1 rounded-[2px] transition-all duration-200 ease-out",
                "first:rounded-l-md last:rounded-r-md focus-visible:outline-none",
                hovered === absoluteIndex && "z-10 ring-2 ring-ink-deep/25",
                hovered != null && hovered !== absoluteIndex && "opacity-40",
              )}
              style={{ backgroundColor: css ?? "var(--muted)" }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 tabular-nums">
          <span>
            {start + 1}-{end}
          </span>
          <span className="opacity-60">of {segments.length}</span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Show previous paragraphs"
              disabled={!hasPrevious}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="rounded p-0.5 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Show next paragraphs"
              disabled={!hasNext}
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              className="rounded p-0.5 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-start">
        <p className="min-h-4 min-w-0 flex-1 text-[11px] italic leading-snug text-muted-foreground transition-opacity duration-200">
          {active
            ? active.colour
              ? `"${truncate(active.text)}" — ${active.colour.justification}`
              : `"${truncate(active.text)}" — too short to read`
            : "Hover the strip to read each paragraph’s hue."}
        </p>
      </div>
    </div>
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
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={copy} title="Copy the draft as Markdown">
        <Clipboard className="size-3.5" /> Copy
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={download}
        title="Download the draft as a .md file"
      >
        <Download className="size-3.5" /> Download
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

function NeighbourAuthors({
  open,
  onToggleOpen,
  neighbours,
}: {
  open: boolean;
  onToggleOpen: () => void;
  neighbours: StyleNeighbour[];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[10px] tracking-widest text-muted-foreground uppercase">
              <BookOpen aria-hidden="true" className="size-3.5" />
              Closest in the Inkwell
            </h2>
            <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground">
              Nearby voices by classical stylometry.
            </p>
          </div>
          <CollapseButton open={open} label="closest in the Inkwell" onToggle={onToggleOpen} />
        </div>
        {open && (
          <>
            {neighbours.length > 0 ? (
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
                        <span
                          className="min-w-0 flex-1 truncate text-xs text-ink-deep"
                          title={n.title}
                        >
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {n.authorName}
                        </span>
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
            ) : (
              <p className="text-xs italic leading-snug text-muted-foreground">
                Write a little more and the nearest voices will surface here.
              </p>
            )}
            <p className="text-[11px] italic leading-snug text-muted-foreground">
              By classical stylometry — the same distance the Inkwell is laid out on.
            </p>
          </>
        )}
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
function StyleFingerprint({
  open,
  onToggleOpen,
  metrics,
}: {
  open: boolean;
  onToggleOpen: () => void;
  metrics: FingerprintMetric[] | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[10px] tracking-widest text-muted-foreground uppercase">
              <BarChart3 aria-hidden="true" className="size-3.5" />
              Style fingerprint
            </h2>
            <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground">
              A live shape of your prose rhythm and voice.
            </p>
          </div>
          <CollapseButton open={open} label="style fingerprint" onToggle={onToggleOpen} />
        </div>
        {open &&
          (metrics ? (
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
          ) : (
            <p className="text-xs italic leading-snug text-muted-foreground">
              Write a little more and the fingerprint will draw itself.
            </p>
          ))}
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
  open,
  onToggleOpen,
  versions,
  currentHtml,
  labels,
  currentKey,
  onRestore,
  onRename,
  onDelete,
}: {
  open: boolean;
  onToggleOpen: () => void;
  versions: DraftVersion[];
  currentHtml: string;
  labels: Record<string, string>;
  currentKey: string | null;
  onRestore: (version: DraftVersion) => void;
  onRename: (key: string, label: string) => void;
  onDelete: (version: DraftVersion) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const editingInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingKey) editingInputRef.current?.focus();
  }, [editingKey]);

  const startEditing = (key: string, label: string) => {
    setEditingKey(key);
    setEditingLabel(label);
  };

  const saveEditing = () => {
    if (editingKey) onRename(editingKey, editingLabel);
    setEditingKey(null);
    setEditingLabel("");
  };

  const rows = versions.map((version, index) => {
    const chronologicalIndex = versions.length - 1 - index;
    const key = versionKey(version);
    return {
      key,
      fallback: chronologicalIndex === 0 ? "Original" : `Version ${chronologicalIndex}`,
      time: formatVersionTime(version.takenAt),
      current:
        versionMatchesKey(version, currentKey) || (!currentKey && version.html === currentHtml),
      restore: version,
    };
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-2">
            <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
                Versions
              </h2>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} versions`}
            onClick={onToggleOpen}
            className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
        {open && rows.length > 0 && (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => {
              const label = labels[row.key] ?? row.fallback;
              const editing = editingKey === row.key;
              const restore = row.restore;
              return (
                <li
                  key={row.key}
                  className={cn(
                    "group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-1.5 py-1 transition-colors",
                    row.current ? "bg-ink-bleed/12 ring-1 ring-ink-bleed/20" : "hover:bg-muted/50",
                    restore && !editing && "cursor-pointer",
                  )}
                >
                  {restore && !editing && (
                    <button
                      type="button"
                      onClick={() => onRestore(restore)}
                      title="Restore this draft (the current draft is kept as a version)"
                      aria-label={`Restore ${label}`}
                      className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    />
                  )}
                  <div className={cn("min-w-0", restore && !editing && "pointer-events-none")}>
                    {editing ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={saveEditing}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEditing();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingKey(null);
                            setEditingLabel("");
                          }
                        }}
                        aria-label="Version name"
                        className="h-6 w-full rounded-none border-0 border-b border-ink-bleed/70 bg-transparent px-0 text-xs text-ink-deep focus:outline-none focus:ring-0"
                        ref={editingInputRef}
                      />
                    ) : (
                      <span
                        className={cn(
                          "block truncate text-xs",
                          row.current ? "text-ink-bleed" : "text-ink-deep",
                        )}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                  <div className="pointer-events-none flex items-center gap-0.5">
                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                      {row.time}
                    </span>
                    {!editing && (
                      <>
                        <button
                          type="button"
                          aria-label={`Rename ${label}`}
                          title="Rename version"
                          onClick={() => startEditing(row.key, label)}
                          className="pointer-events-auto relative z-10 rounded p-1 text-muted-foreground opacity-70 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <Pencil aria-hidden="true" className="size-3" />
                        </button>
                        {restore && row.current && (
                          <button
                            type="button"
                            aria-label={`Delete ${label}`}
                            title="Delete version"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(restore);
                            }}
                            className="pointer-events-auto relative z-10 rounded p-1 text-muted-foreground opacity-70 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                          >
                            <Trash2 aria-hidden="true" className="size-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function versionKey(version: DraftVersion): string {
  return String(version.takenAt);
}

function versionMatchesKey(version: DraftVersion, key: string | null): boolean {
  if (!key) return false;
  return key === versionKey(version) || key.startsWith(`${version.takenAt}:`);
}

function formatVersionTime(takenAt: number): string {
  return new Date(takenAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function pushVersionOnce(stack: readonly DraftVersion[], version: DraftVersion): DraftVersion[] {
  if (stack.some((entry) => entry.html === version.html)) return [...stack];
  return pushVersion(stack, version);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
