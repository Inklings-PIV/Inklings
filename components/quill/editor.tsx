"use client";

import {
  EditorContent,
  type Editor as TiptapEditor,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Copy,
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
import { useState } from "react";
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
import { NUDGE_PRESETS } from "@/lib/quill/nudge-presets";
import { cn } from "@/lib/utils";

/** HSL + justification returned for a selected passage's hue. */
export type SelectionColour = {
  hue: number;
  saturation: number;
  lightness: number;
  justification: string;
};

type EditorProps = {
  /** Initial HTML to seed the editor with. */
  initialContent?: string;
  /** Called with the editor's HTML on every change. */
  onChange?: (html: string) => void;
  /** Visible placeholder when the editor is empty. */
  placeholder?: string;
  className?: string;
  /** Right-click "Read the hue" — derive a colour for the selected passage. */
  onDeriveHue?: (text: string) => Promise<SelectionColour | null>;
  /** Right-click "Rewrite" presets — rewrite the selection toward a target. */
  onRewriteSelection?: (text: string, target: string) => Promise<string | null>;
};

/**
 * TipTap editor wired with StarterKit (bold/italic/headings/lists/quote
 * keyboard shortcuts). Bare-bones — no toolbar; readers can use Cmd+B,
 * Cmd+I etc. A formatting bar is a follow-up.
 *
 * Persistence isn't wired here — that's blocked on the #45 Quill privacy
 * decision (local-only by default vs server-stored). The page can pass
 * `onChange` to handle the saved text however it wants.
 */
export function Editor({
  initialContent = "",
  onChange,
  placeholder,
  className,
  onDeriveHue,
  onRewriteSelection,
}: EditorProps) {
  // Track selection emptiness so the right-click menu can disable
  // selection-only actions; updated on every selection change.
  const [hasSelection, setHasSelection] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
    onSelectionUpdate: ({ editor: ed }) => {
      setHasSelection(!ed.state.selection.empty);
    },
    // immediatelyRender: false keeps SSR-safe (no hydration mismatch);
    // the editor mounts on the client.
    immediatelyRender: false,
    editorProps: {
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

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {editor && <EditorToolbar editor={editor} />}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative">
            <EditorContent editor={editor} />
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
