"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";

type EditorProps = {
  /** Initial HTML to seed the editor with. */
  initialContent?: string;
  /** Called with the editor's HTML on every change. */
  onChange?: (html: string) => void;
  /** Visible placeholder when the editor is empty. */
  placeholder?: string;
  className?: string;
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
export function Editor({ initialContent = "", onChange, placeholder, className }: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent,
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

  return (
    <div className={cn("relative", className)}>
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
  );
}
