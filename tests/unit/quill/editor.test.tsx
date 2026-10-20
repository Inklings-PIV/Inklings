import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Editor, type EditorHandle } from "@/components/quill/editor";

afterEach(cleanup);

it("renders the real editor and replaces a passage while preserving surrounding text", async () => {
  const ref = createRef<EditorHandle>();
  const onChange = vi.fn();
  const { container } = render(
    <Editor ref={ref} initialContent="<p>A quiet afternoon.</p>" onChange={onChange} />,
  );
  await waitFor(() =>
    expect(container.querySelector(".tiptap")).toHaveTextContent("A quiet afternoon."),
  );

  // ProseMirror positions start at one inside the paragraph.
  act(() => {
    ref.current?.replaceRange(3, 8, "sunny");
  });

  await waitFor(() =>
    expect(container.querySelector(".tiptap")).toHaveTextContent("A sunny afternoon."),
  );
  expect(onChange).toHaveBeenLastCalledWith("<p>A sunny afternoon.</p>");
});
