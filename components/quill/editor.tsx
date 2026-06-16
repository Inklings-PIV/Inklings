"use client";

import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
  Quote,
  Redo2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
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
import { textblockRanges } from "@/lib/quill/blocks";
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
};

type EditorProps = {
  /** Initial HTML to seed the editor with. */
  initialContent?: string;
  /** Called with the editor's HTML on every change. */
  onChange?: (html: string) => void;
  /** Called whenever the selection changes — null when cursor only. */
  onSelectionChange?: (sel: SelectionRange | null) => void;
  /** Visible placeholder when the editor is empty. */
  placeholder?: string;
  className?: string;
  /** Right-click "Read the hue" — derive a colour for the selected passage. */
  onDeriveHue?: (text: string) => Promise<SelectionColour | null>;
  /** Right-click "Rewrite" presets — rewrite the selection toward a target. */
  onRewriteSelection?: (text: string, target: string) => Promise<string | null>;
  /**
   * EmoArc band → editor link: the hue-band segment currently hovered. The
   * matching block is tinted in its own colour and scrolled into view. `tint`
   * is a CSS colour (the segment's hue) used for the wash; null falls back to
   * the ink accent. Pass null to clear the highlight.
   */
  highlightBlock?: { index: number; tint?: string | null } | null;
};

/** Imperative handle for the Quill editor, exposed via `ref`. */
export type EditorHandle = {
  /** Select the block at hue-band segment `index` and scroll it into view. */
  focusBlock: (index: number) => void;
  /** Return the current selection with position info and surrounding context. */
  getSelection: () => SelectionRange | null;
  /** Replace the range [from, to] in the document with new HTML. */
  replaceRange: (from: number, to: number, html: string) => void;
};

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
  placeholder,
  className,
  onDeriveHue,
  onRewriteSelection,
  highlightBlock,
}: EditorProps & { ref?: Ref<EditorHandle> }) {
  // Track selection emptiness so the right-click menu can disable
  // selection-only actions; updated on every selection change.
  const [hasSelection, setHasSelection] = useState(false);
  // Focus mode dims every block but the one holding the caret.
  const [focusMode, setFocusMode] = useState(false);
  // Holds the latest "read the hue" handler so the editor's keymap (captured
  // once on mount) can call the current closure.
  const readHueRef = useRef<() => void>(() => undefined);
  const editor = useEditor({
    extensions: [StarterKit, FocusActiveBlock, EmoArcHighlight],
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

  const canHue = hasSelection && !!onDeriveHue;
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
        };
      },
      replaceRange(from: number, to: number, html: string) {
        editor?.chain().setTextSelection({ from, to }).insertContent(html).run();
      },
    }),
    [editor],
  );

  // Keep the keymap pointed at the current readHue closure.
  readHueRef.current = readHue;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editor && <EditorToolbar editor={editor} />}
        <FocusToggle active={focusMode} onToggle={() => setFocusMode((v) => !v)} />
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "relative",
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
