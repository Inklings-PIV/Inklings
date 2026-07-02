"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STYLE_WIDGETS, type WidgetSelection } from "@/lib/quill/widgets";

/**
 * Composable target facets (PromptCanvas, idea #3) — the rewrite target as
 * four visible widget rows instead of a bare text box. Each row is a
 * single-select toggle that can also be deselected, so any combination of
 * facets composes; the page turns the selection into one target string.
 */
export function TargetWidgets({
  selection,
  onChange,
}: {
  selection: WidgetSelection;
  onChange: (key: string, value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {STYLE_WIDGETS.map((widget) => (
        <div
          key={widget.key}
          className="grid grid-cols-[3.65rem_minmax(0,1fr)] items-center gap-1.5"
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {widget.label}
          </span>
          <ToggleGroup
            type="single"
            value={selection[widget.key] ?? ""}
            onValueChange={(value) => onChange(widget.key, value || null)}
            variant="outline"
            size="sm"
            className="w-full flex-nowrap justify-start"
            aria-label={`${widget.label} facet`}
          >
            {widget.options.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                title={option.phrase}
                className="h-7 min-w-0 flex-1 cursor-pointer px-1 text-xs"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
    </div>
  );
}
