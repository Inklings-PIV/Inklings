"use client";

import { Fragment, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  EditorContent,
  Extension,
  type Editor as TiptapEditor,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Copy,
  Eye,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Palette,
  Pipette,
  Quote,
  Redo2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState, type WheelEvent } from "react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { sentenceWindowAtMinWords, textblockRanges } from "@/lib/quill/blocks";
import { NUDGE_PRESETS } from "@/lib/quill/nudge-presets";
import { cn } from "@/lib/utils";

/** HSL + justification returned for a selected passage's hue. */
export type SelectionColour = {
  hue: number;
  saturation: number;
  lightness: number;
  justification: string;
};

export type SelectionRange = {
  text: string;
  from: number;
  to: number;
  /** Text in the document before the selection — populated by getSelection(), not onSelectionChange. */
  beforeText?: string;
  /** Text in the document after the selection — populated by getSelection(), not onSelectionChange. */
  afterText?: string;
  /** Span begins mid-paragraph — the preceding context continues inline with it. */
  openStart?: boolean;
  /** Span ends mid-paragraph — the following context continues inline with it. */
  openEnd?: boolean;
};

/** Drag-and-drop mime carrying a colour-drop swatch key from the palette. */
export const COLOUR_DROP_MIME = "application/x-inklings-colour";

/** What a colour-drop resolves to: the swatch, the span to rewrite, and the
 *  viewport coordinates the splash should bloom from. */
export type ColourDropDetail = {
  /** The dropped swatch's key — the page maps it to a rewrite target. */
  colourKey: string;
  /** Sentence-window around the drop, ready to feed the diff/rewrite flow. */
  span: SelectionRange;
  /** Where the swatch landed (the targeted word), in viewport px. */
  origin: { x: number; y: number };
  /** Sampled points across the span for the radiating secondary splashes. */
  ripples: { x: number; y: number }[];
};

type EditorProps = {
  /** Initial HTML to seed the editor with. */
  initialContent?: string;
  /** Called with the editor's HTML on every change. */
  onChange?: (html: string) => void;
  /** Called whenever the selection changes — null when cursor only. */
  onSelectionChange?: (sel: SelectionRange | null) => void;
  /** Called with the top-level text blocks currently visible in the editor scrollport. */
  onVisibleBlocksChange?: (indices: number[]) => void;
  /** Visible placeholder when the editor is empty. */
  placeholder?: string;
  className?: string;
  /** Right-click "Read the hue" — derive a colour for the selected passage. */
  onDeriveHue?: (text: string) => Promise<SelectionColour | null>;
  /** Right-click "Capture hue" — like Read the hue, but also lifts it into the
   *  hue slot so it can be re-applied or mixed. */
  onCaptureHue?: (hue: SelectionColour) => void;
  /** Right-click "Rewrite" presets — rewrite the selection toward a target. */
  onRewriteSelection?: (text: string, target: string) => Promise<string | null>;
  /**
   * EmoArc band → editor link: the hue-band segment currently hovered. The
   * matching block is tinted in its own colour and scrolled into view. `tint`
   * is a CSS colour (the segment's hue) used for the wash; null falls back to
   * the ink accent. Pass null to clear the highlight.
   */
  highlightBlock?: { index: number; tint?: string | null } | null;
  /** Per-paragraph hue rail: one CSS colour per text block (index-aligned to the
   *  hue band; null = too short to read), painting a left-accent on each block.
   *  Omit or pass [] to hide the rail. */
  blockHues?: (string | null)[];
  /** Selection being rewritten by the parent; stays painted while focus moves away. */
  pendingRewriteRange?: SelectionRange | null;
  /** Show local loading feedback beside the pending range. */
  pendingRewriteLoading?: boolean;
  /** A colour swatch was dropped on the prose — resolved span + splash coords. */
  onColourDrop?: (detail: ColourDropDetail) => void;
  /** Colour-drop brush size: 1 = sentence, 3 = current passage, 7 = whole draft. */
  brushSize?: number;
};

/** Splash geometry for a range: the centre point and sampled points across it. */
export type SplashPoints = {
  origin: { x: number; y: number };
  ripples: { x: number; y: number }[];
};

/** Imperative handle for the Quill editor, exposed via `ref`. */
export type EditorHandle = {
  /** Select the block at hue-band segment `index` and scroll it into view. */
  focusBlock: (index: number) => void;
  /** Return the current selection with position info and surrounding context. */
  getSelection: () => SelectionRange | null;
  /** Replace the range [from, to] with rewritten prose (paragraphs split on
   *  blank lines), merging at the cut points instead of splitting host blocks. */
  replaceRange: (from: number, to: number, text: string) => string | null;
  /** Splash coords (viewport px) for an arbitrary range — used to animate a
   *  rewrite triggered from the panel rather than a drop. */
  splashPointsFor: (from: number, to: number) => SplashPoints | null;
};

// Sample points (viewport px) evenly across a range, so the secondary splashes
// trace the words about to change. Shared by the drop handler and splashPointsFor.
const RIPPLE_STEPS = 5;
const MIN_COLOUR_DROP_WORDS = 8;
function sampleRipples(view: EditorView, from: number, to: number): { x: number; y: number }[] {
  return Array.from({ length: RIPPLE_STEPS + 1 }, (_, i) => {
    const p = Math.min(to, Math.max(from, Math.round(from + ((to - from) * i) / RIPPLE_STEPS)));
    const c = view.coordsAtPos(p);
    return { x: c.left, y: (c.top + c.bottom) / 2 };
  });
}

// Whether the span begins/ends mid-paragraph — when it does, the adjacent
// context belongs to the same block and should read inline with the rewrite
// rather than as a separate paragraph above/below it.
function openness(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): { openStart: boolean; openEnd: boolean } {
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  return {
    openStart: $from.parentOffset > 0,
    openEnd: $to.parentOffset < $to.parent.content.size,
  };
}

function passageAt(doc: ProseMirrorNode, pos: number): { from: number; to: number } | null {
  const blocks = textblockRanges(doc);
  return blocks.find((block) => pos >= block.from && pos <= block.to) ?? null;
}

function wholeDraftRange(doc: ProseMirrorNode): { from: number; to: number } | null {
  const blocks = textblockRanges(doc);
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return null;
  return { from: first.from, to: last.to };
}

// Marks the top-level block holding the caret with `quill-focus-active`, so
// focus mode can dim everything else via CSS. Always installed — it's inert
// until the wrapper opts into the dimming classes.
const FocusActiveBlock = Extension.create({
  name: "focusActiveBlock",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { doc, selection } = state;
            const head = selection.head;
            const decos: Decoration[] = [];
            doc.forEach((node, offset) => {
              const end = offset + node.nodeSize;
              if (head >= offset && head <= end) {
                decos.push(Decoration.node(offset, end, { class: "quill-focus-active" }));
              }
            });
            return DecorationSet.create(doc, decos);
          },
        },
      }),
    ];
  },
});

/** Which block the EmoArc band is pointing at, plus the wash colour to use. */
type EmoArcState = { index: number; tint: string | null } | null;
const emoArcKey = new PluginKey<EmoArcState>("emoArcHighlight");
type PendingRewriteState = { from: number; to: number; loading: boolean } | null;
const pendingRewriteKey = new PluginKey<PendingRewriteState>("pendingRewriteHighlight");

// Tints + outlines the block the EmoArc hue band is hovering, turning the band
// into a navigation control over the prose. The target index lives in plugin
// state (pushed in via a meta-only transaction from React) rather than the
// selection, so it tracks the band — not the caret — and a meta-only
// transaction has no doc change, so it won't loop through onUpdate.
const EmoArcHighlight = Extension.create({
  name: "emoArcHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<EmoArcState>({
        key: emoArcKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(emoArcKey) as EmoArcState | undefined;
            return meta === undefined ? value : meta;
          },
        },
        props: {
          decorations(state) {
            const focus = emoArcKey.getState(state);
            if (!focus) return null;
            const range = textblockRanges(state.doc)[focus.index];
            if (!range) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(range.from - 1, range.to + 1, {
                class: "quill-emoarc-active",
                ...(focus.tint ? { style: `--emoarc-tint:${focus.tint}` } : {}),
              }),
            ]);
          },
        },
      }),
    ];
  },
});

// Per-paragraph hue rail — a coloured left-accent on each text block, in that
// block's own hue. The CSS colours are pushed in from React via a meta-only
// transaction, so the decoration reflows with the document without measuring.
const hueRailKey = new PluginKey<(string | null)[]>("hueRail");
const HueRail = Extension.create({
  name: "hueRail",
  addProseMirrorPlugins() {
    return [
      new Plugin<(string | null)[]>({
        key: hueRailKey,
        state: {
          init: () => [],
          apply(tr, value) {
            const meta = tr.getMeta(hueRailKey) as (string | null)[] | undefined;
            return meta === undefined ? value : meta;
          },
        },
        props: {
          decorations(state) {
            const hues = hueRailKey.getState(state);
            if (!hues || hues.length === 0) return null;
            const decos = textblockRanges(state.doc).map((r, i) =>
              Decoration.node(r.from - 1, r.to + 1, {
                class: "quill-hue-rail",
                style: `--hue-rail:${hues[i] ?? "transparent"}`,
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

// Keeps a selected passage visually connected to the loading rewrite after
// focus leaves the editor and the browser's native selection paint disappears.
const PendingRewriteHighlight = Extension.create({
  name: "pendingRewriteHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<PendingRewriteState>({
        key: pendingRewriteKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(pendingRewriteKey) as PendingRewriteState | undefined;
            return meta === undefined ? value : meta;
          },
        },
        props: {
          decorations(state) {
            const range = pendingRewriteKey.getState(state);
            if (!range || range.from >= range.to) return null;
            const from = Math.max(0, Math.min(range.from, state.doc.content.size));
            const to = Math.max(from, Math.min(range.to, state.doc.content.size));
            if (from === to) return null;
            const decos = [Decoration.inline(from, to, { class: "quill-pending-rewrite" })];
            if (range.loading) {
              decos.push(
                Decoration.widget(
                  to,
                  () => {
                    const label = document.createElement("span");
                    label.className = "quill-pending-rewrite-label";
                    label.textContent = "Nudging this passage...";
                    return label;
                  },
                  { side: 1 },
                ),
              );
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

/**
 * TipTap editor wired with StarterKit (bold/italic/headings/lists/quote
 * keyboard shortcuts), a right-click context menu, and an optional focus mode
 * that dims every paragraph but the one being written.
 *
 * Persistence isn't wired here — that's blocked on the #45 Quill privacy
 * decision (local-only by default vs server-stored). The page can pass
 * `onChange` to handle the saved text however it wants.
 */
export function Editor({
  ref,
  initialContent = "",
  onChange,
  onSelectionChange,
  onVisibleBlocksChange,
  placeholder,
  className,
  onDeriveHue,
  onCaptureHue,
  onRewriteSelection,
  highlightBlock,
  blockHues,
  pendingRewriteRange,
  pendingRewriteLoading = false,
  onColourDrop,
  brushSize = 3,
}: EditorProps & { ref?: Ref<EditorHandle> }) {
  // Track selection emptiness so the right-click menu can disable
  // selection-only actions; updated on every selection change.
  const [hasSelection, setHasSelection] = useState(false);
  const [hasText, setHasText] = useState(initialContent.trim().length > 0);
  // Focus mode dims every block but the one holding the caret.
  const [focusMode, setFocusMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Holds the latest "read the hue" handler so the editor's keymap (captured
  // once on mount) can call the current closure.
  const readHueRef = useRef<() => void>(() => undefined);
  const editor = useEditor({
    extensions: [StarterKit, FocusActiveBlock, EmoArcHighlight, HueRail, PendingRewriteHighlight],
    content: initialContent,
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      setHasSelection(!empty);
      if (from === to) {
        onSelectionChange?.(null);
      } else {
        onSelectionChange?.({
          text: ed.state.doc.textBetween(from, to, " "),
          from,
          to,
        });
      }
    },
    // immediatelyRender: false keeps SSR-safe (no hydration mismatch);
    // the editor mounts on the client.
    immediatelyRender: false,
    editorProps: {
      // Cmd/Ctrl+Enter reads the hue of the current selection from the
      // keyboard. Handled on the editor itself (not a wrapper div) so it only
      // fires when the editor is focused and stays accessible.
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          readHueRef.current();
          return true;
        }
        return false;
      },
      attributes: {
        class: [
          "min-h-[400px] w-full font-serif text-lg leading-relaxed text-ink-deep focus:outline-none",
          // Block element spacing — TipTap renders raw HTML so we style children
          // via Tailwind's arbitrary-child variants instead of pulling in the
          // typography plugin for one editor.
          "[&_p]:my-3 [&_p:first-child]:mt-0",
          "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:font-serif [&_h1]:text-3xl [&_h1]:text-ink-deep",
          "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:text-ink-deep",
          "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:text-ink-deep",
          "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-bleed/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-deep/80",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
          "[&_strong]:font-semibold [&_em]:italic",
        ].join(" "),
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const nextHasText = !ed.isEmpty;
      setHasText(nextHasText);
      if (!nextHasText) setFocusMode(false);
      onChange?.(ed.getHTML());
    },
  });

  // Current non-empty selection as {from, to, text}, or null at a bare caret.
  const selectionText = (): { from: number; to: number; text: string } | null => {
    if (!editor) return null;
    const { from, to, empty } = editor.state.selection;
    if (empty) return null;
    const text = editor.state.doc.textBetween(from, to, "\n", " ").trim();
    return text ? { from, to, text } : null;
  };

  const readHue = async () => {
    const sel = selectionText();
    if (!sel || !onDeriveHue) return;
    const id = toast.loading("Reading the hue…");
    try {
      const colour = await onDeriveHue(sel.text);
      if (!colour) {
        toast.error("Selection too short to read a hue", { id });
        return;
      }
      const css = hueFromHSL(colour.hue, colour.saturation, colour.lightness).css;
      toast.success(colour.justification, {
        id,
        icon: (
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: css }}
          />
        ),
      });
    } catch {
      toast.error("Couldn't read the hue", { id });
    }
  };

  // Like readHue, but also lifts the colour into the hue slot (still prints it).
  const captureHue = async () => {
    const sel = selectionText();
    if (!sel || !onDeriveHue) return;
    const id = toast.loading("Reading the hue…");
    try {
      const colour = await onDeriveHue(sel.text);
      if (!colour) {
        toast.error("Selection too short to read a hue", { id });
        return;
      }
      const css = hueFromHSL(colour.hue, colour.saturation, colour.lightness).css;
      toast.success(`Captured — ${colour.justification}`, {
        id,
        icon: (
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: css }}
          />
        ),
      });
      onCaptureHue?.(colour);
    } catch {
      toast.error("Couldn't read the hue", { id });
    }
  };

  const applyPreset = (target: string, label: string) => {
    const sel = selectionText();
    if (!sel || !onRewriteSelection || !editor) return;
    const { from, to, text } = sel;
    toast.promise(
      (async () => {
        const out = await onRewriteSelection(text, target);
        if (!out) throw new Error("Selection too short to rewrite");
        editor.chain().focus().insertContentAt({ from, to }, out).run();
        return out;
      })(),
      {
        loading: `Rewriting — ${label}…`,
        success: "Selection rewritten",
        error: (e) => (e as Error).message,
      },
    );
  };

  const copySelection = () => {
    const sel = selectionText();
    if (!sel) return;
    navigator.clipboard?.writeText(sel.text);
    toast.success("Copied");
  };

  // Allow the palette's swatch drag to drop on the prose — without
  // preventDefault on dragover the browser refuses the drop.
  const handleColourDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(COLOUR_DROP_MIME)) e.preventDefault();
  };

  // Resolve a dropped swatch to the span to rewrite + the splash coordinates. An
  // active text selection wins over the brush — the drop rewrites exactly the
  // selected text. Without a selection the brush maps to sentence / current
  // passage / whole draft. We preventDefault so ProseMirror never sees the drop.
  const handleColourDrop = (e: React.DragEvent) => {
    if (!editor) return;
    const colourKey = e.dataTransfer.getData(COLOUR_DROP_MIME);
    if (!colourKey) return; // not our drag — let the editor handle it normally
    e.preventDefault();
    e.stopPropagation();
    const { view } = editor;
    const { doc, selection } = view.state;
    let from: number;
    let to: number;
    let origin: { x: number; y: number };
    if (!selection.empty) {
      ({ from, to } = selection);
      const pts = sampleRipples(view, from, to);
      origin = pts[Math.floor(pts.length / 2)] ?? { x: e.clientX, y: e.clientY };
    } else {
      const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!at) return;
      const brushRange =
        brushSize <= 1
          ? sentenceWindowAtMinWords(doc, at.pos, MIN_COLOUR_DROP_WORDS)
          : brushSize <= 3
            ? passageAt(doc, at.pos)
            : wholeDraftRange(doc);
      if (!brushRange) return;
      ({ from, to } = brushRange);
      origin = { x: e.clientX, y: e.clientY };
    }
    const span: SelectionRange = {
      text: doc.textBetween(from, to, "\n\n"),
      from,
      to,
      beforeText: doc.textBetween(0, from, "\n\n").trimStart(),
      afterText: doc.textBetween(to, doc.content.size, "\n\n").trimEnd(),
      ...openness(doc, from, to),
    };
    const ripples = sampleRipples(view, from, to);
    onColourDrop?.({ colourKey, span, origin, ripples });
  };

  const canHue = hasSelection && !!onDeriveHue;
  const canCapture = hasSelection && !!onDeriveHue && !!onCaptureHue;
  const canRewrite = hasSelection && !!onRewriteSelection;

  // Drive the EmoArc highlight from the band's hovered segment. Split into
  // primitives so the effect only fires when the target block (or its tint)
  // actually changes, not on every parent re-render.
  const highlightIndex = highlightBlock?.index ?? null;
  const highlightTint = highlightBlock?.tint ?? null;
  useEffect(() => {
    if (!editor) return;
    const focus = highlightIndex == null ? null : { index: highlightIndex, tint: highlightTint };
    // Meta-only transaction: updates the decoration without touching the doc.
    editor.view.dispatch(editor.state.tr.setMeta(emoArcKey, focus));
    if (!focus) return;
    const range = textblockRanges(editor.state.doc)[focus.index];
    if (!range) return;
    const at = editor.view.domAtPos(range.from).node;
    const el = at instanceof HTMLElement ? at : at.parentElement;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [editor, highlightIndex, highlightTint]);

  // Push the per-paragraph hue rail into the plugin (meta-only, no doc change).
  const railRef = useRef<string>("");
  useEffect(() => {
    if (!editor) return;
    const hues = blockHues ?? [];
    const key = hues.join("|");
    if (key === railRef.current) return;
    railRef.current = key;
    editor.view.dispatch(editor.state.tr.setMeta(hueRailKey, hues));
  }, [editor, blockHues]);

  // ProseMirror keeps its range when the editor loses DOM focus, so the highlight
  // vanishes but the selection (and the Rewrite button's target) silently lives
  // on. Collapse it on any pointer-down outside the editor, except on interactive
  // controls — so buttons keep the selection but whitespace always drops it.
  useEffect(() => {
    if (!editor) return;
    const INTERACTIVE =
      "button, a, input, textarea, select, label, [role='button'], [contenteditable='true']";
    const onDown = (e: PointerEvent) => {
      if (editor.state.selection.empty) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(".ProseMirror")) return; // editor: caret-move clears it
      if (t.closest(INTERACTIVE)) return; // any control keeps the selection
      editor.commands.setTextSelection(editor.state.selection.head);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const range = pendingRewriteRange
      ? {
          from: pendingRewriteRange.from,
          to: pendingRewriteRange.to,
          loading: pendingRewriteLoading,
        }
      : null;
    editor.view.dispatch(editor.state.tr.setMeta(pendingRewriteKey, range));
    if (!range) return;
    const at = editor.view.domAtPos(range.from).node;
    const el = at instanceof HTMLElement ? at : at.parentElement;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [editor, pendingRewriteRange, pendingRewriteLoading]);

  useEffect(() => {
    if (!editor || !onVisibleBlocksChange) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    let frame = 0;
    let last = "";

    const publishVisibleBlocks = () => {
      frame = 0;
      const viewport = scrollEl.getBoundingClientRect();
      const visible = textblockRanges(editor.state.doc)
        .map((range, index) => {
          const at = editor.view.domAtPos(range.from).node;
          const el = at instanceof HTMLElement ? at : at.parentElement;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return rect.bottom > viewport.top && rect.top < viewport.bottom ? index : null;
        })
        .filter((index): index is number => index !== null);
      const key = visible.join(",");
      if (key !== last) {
        last = key;
        onVisibleBlocksChange(visible);
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publishVisibleBlocks);
    };

    schedule();
    scrollEl.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollEl.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor, onVisibleBlocksChange]);

  useImperativeHandle(
    ref,
    () => ({
      focusBlock(index) {
        if (!editor) return;
        const range = textblockRanges(editor.state.doc)[index];
        if (!range) return;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: range.from, to: range.to })
          .scrollIntoView()
          .run();
      },
      getSelection() {
        if (!editor) return null;
        const { from, to } = editor.state.selection;
        if (from === to) return null;
        const { doc } = editor.state;
        return {
          text: doc.textBetween(from, to, "\n\n"),
          from,
          to,
          beforeText: doc.textBetween(0, from, "\n\n").trimStart(),
          afterText: doc.textBetween(to, doc.content.size, "\n\n").trimEnd(),
          ...openness(doc, from, to),
        };
      },
      replaceRange(from: number, to: number, text: string) {
        if (!editor) return null;
        const { schema } = editor.state;
        const paras = text
          .split(/\n\s*\n+/)
          .map((p) => p.trim())
          .filter(Boolean);
        const paragraph = schema.nodes.paragraph;
        if (paras.length === 0 || !paragraph) return null;
        // A slice open at both ends (textblock depth 1) fits like a paste: the
        // first paragraph merges into the block at `from`, internal breaks split,
        // the last merges into the block at `to`. Handles in-paragraph, whole-
        // paragraph and cross-paragraph spans without splitting the host blocks.
        const nodes = paras.map((t) => paragraph.create(null, schema.text(t)));
        const slice = new Slice(Fragment.fromArray(nodes), 1, 1);
        editor.view.dispatch(editor.state.tr.replaceRange(from, to, slice));
        return editor.getHTML();
      },
      splashPointsFor(from: number, to: number) {
        if (!editor) return null;
        const ripples = sampleRipples(editor.view, from, to);
        const origin = ripples[Math.floor(ripples.length / 2)] ?? ripples[0];
        return origin ? { origin, ripples } : null;
      },
    }),
    [editor],
  );

  // Keep the keymap pointed at the current readHue closure.
  readHueRef.current = readHue;

  useEffect(() => {
    if (!editor) return;
    setHasText(!editor.isEmpty);
  }, [editor]);

  const passEmptyEditorWheelToPage = (e: WheelEvent<HTMLDivElement>) => {
    if (hasText) return;
    const pageCanScroll = document.documentElement.scrollHeight > window.innerHeight;
    if (!pageCanScroll) return;

    e.preventDefault();
    window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editor && <EditorToolbar editor={editor} />}
        {editor && hasText && (
          <FocusToggle active={focusMode} onToggle={() => setFocusMode((v) => !v)} />
        )}
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only colour-drop zone over the editable area; the same rewrite is keyboard-reachable via the Rewrite panel */}
          <div
            ref={scrollRef}
            onDragOver={handleColourDragOver}
            onDrop={handleColourDrop}
            onWheel={passEmptyEditorWheelToPage}
            className={cn(
              "relative max-h-[min(540px,calc(100vh-24rem))] overflow-y-auto overscroll-contain pr-2 pb-8",
              focusMode && [
                "[&_.ProseMirror>*]:opacity-35 [&_.ProseMirror>*]:transition-opacity [&_.ProseMirror>*]:duration-300",
                "[&_.quill-focus-active]:!opacity-100",
              ],
            )}
          >
            <EditorContent editor={editor} />
            {editor && (
              <BubbleMenu
                editor={editor}
                options={{ placement: "top", offset: 8 }}
                shouldShow={({ state }) => {
                  const { from, to, empty } = state.selection;
                  if (empty) return false;
                  return state.doc.textBetween(from, to, "\n", " ").trim().length > 0;
                }}
              >
                <BubbleBar
                  editor={editor}
                  canHue={canHue}
                  canRewrite={canRewrite}
                  onReadHue={readHue}
                  onPreset={applyPreset}
                />
              </BubbleMenu>
            )}
            {placeholder && editor?.isEmpty && (
              <p
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 font-serif text-lg italic text-muted-foreground"
              >
                {placeholder}
              </p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>Format</ContextMenuLabel>
          <ContextMenuItem onSelect={() => editor?.chain().focus().toggleBold().run()}>
            <Bold className="size-4" /> Bold
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" /> Italic
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-4" /> Heading
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote className="size-4" /> Quote
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!canHue} onSelect={readHue}>
            <Palette className="size-4" /> Read the hue
            <span className="ml-auto pl-6 text-[10px] tracking-wider text-muted-foreground">
              ⌘↵
            </span>
          </ContextMenuItem>
          <ContextMenuItem disabled={!canCapture} onSelect={captureHue}>
            <Pipette className="size-4" /> Capture hue
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canRewrite}>
              <WandSparkles className="size-4" /> Rewrite selection
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {NUDGE_PRESETS.map((preset) => (
                <ContextMenuItem
                  key={preset.key}
                  onSelect={() => applyPreset(preset.target, preset.label)}
                >
                  {preset.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!hasSelection} onSelect={copySelection}>
            <Copy className="size-4" /> Copy
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}

// The three nudges promoted into the bubble — the full set stays one
// right-click away. Varied axes (length, imagery, temperature) so the bubble
// covers distinct moves rather than three flavours of the same edit.
const BUBBLE_PRESET_KEYS = ["tighten", "vivid", "warmer"] as const;

/**
 * Floating quick-actions over a text selection (Medium/Notion-style) — the
 * same handlers as the right-click menu, one click closer and discoverable.
 * Enter animates scale 0.95→1 + fade (150 ms, strong ease-out, origin-aware);
 * reduced-motion falls back to the fade alone.
 */
function BubbleBar({
  editor,
  canHue,
  canRewrite,
  onReadHue,
  onPreset,
}: {
  editor: TiptapEditor;
  canHue: boolean;
  canRewrite: boolean;
  onReadHue: () => void;
  onPreset: (target: string, label: string) => void;
}) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive("bold") ?? false,
      isItalic: ctx.editor?.isActive("italic") ?? false,
    }),
  });
  const presets = NUDGE_PRESETS.filter((p) =>
    (BUBBLE_PRESET_KEYS as readonly string[]).includes(p.key),
  );

  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-md",
        "origin-bottom transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "starting:scale-95 starting:opacity-0 motion-reduce:transition-opacity",
      )}
    >
      <ToolbarButton
        label="Bold (Cmd+B)"
        active={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic (Cmd+I)"
        active={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      {canHue && (
        <>
          <ToolbarDivider />
          <ToolbarButton label="Read the hue (Cmd+Enter)" active={false} onClick={onReadHue}>
            <Palette className="size-4" />
          </ToolbarButton>
        </>
      )}
      {canRewrite && (
        <>
          <ToolbarDivider />
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              title={`Rewrite — ${preset.target}`}
              onClick={() => onPreset(preset.target, preset.label)}
              className={cn(
                "inline-flex h-7 items-center rounded px-1.5 text-xs transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              )}
            >
              {preset.label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Formatting toolbar above the editor. Uses `useEditorState` so it only
 * re-renders when the values it selects actually change — important because
 * every keystroke fires a TipTap transaction, and a naïve toolbar would
 * re-render on each one. Keyboard shortcuts (Cmd+B etc.) still work via
 * StarterKit; this just makes them discoverable.
 */
function EditorToolbar({ editor }: { editor: TiptapEditor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive("bold") ?? false,
      isItalic: ctx.editor?.isActive("italic") ?? false,
      isH1: ctx.editor?.isActive("heading", { level: 1 }) ?? false,
      isH2: ctx.editor?.isActive("heading", { level: 2 }) ?? false,
      isBullet: ctx.editor?.isActive("bulletList") ?? false,
      isOrdered: ctx.editor?.isActive("orderedList") ?? false,
      isQuote: ctx.editor?.isActive("blockquote") ?? false,
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-card/60 p-1"
    >
      <ToolbarButton
        label="Bold (Cmd+B)"
        active={state.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic (Cmd+I)"
        active={state.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        label="Heading 1"
        active={state.isH1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={state.isH2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        label="Bullet list"
        active={state.isBullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.isOrdered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Blockquote"
        active={state.isQuote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        label="Undo (Cmd+Z)"
        active={false}
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo (Cmd+Shift+Z)"
        active={false}
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-ink-deep text-ink-paper"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />;
}

function FocusToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title="Focus mode — dim everything but the paragraph you're writing"
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active
          ? "border-ink-deep bg-ink-deep text-ink-paper"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Eye className="size-3.5" /> Focus
    </button>
  );
}
