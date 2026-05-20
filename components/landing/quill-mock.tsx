"use client";

import { useMemo, useState } from "react";

type Mode = "readout" | "target";

const TARGETS = [
  {
    name: "meadow green",
    hue: 145,
    hint: "Fresh, natural, and grounded. Calm, clarity, gentle observation.",
  },
  {
    name: "orwell blue",
    hue: 240,
    hint: "Cold, watchful, declarative. Short clauses; concrete things.",
  },
  {
    name: "kafka indigo",
    hue: 280,
    hint: "Disquieted and procedural. Long subordinate clauses, dreamlike abstraction.",
  },
  { name: "borges amber", hue: 60, hint: "Erudite warmth. Latinate, recursive, labyrinthine." },
  {
    name: "morrison rose",
    hue: 10,
    hint: "Bodied, mourning, lyric. Repetition and tactile imagery.",
  },
];

const PROMPT =
  "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.";

// crude per-target style nudges → render to a diffed paragraph
const NUDGES: Record<number, { title: string; tone: string; out: string }> = {
  145: {
    title: "Softened toward meadow green",
    tone: "calm · grounded · pastoral",
    out: "Alice was beginning to grow drowsy in the warm afternoon, sitting on the bank beside her sister, with so little to do but watch the clouds drift by.",
  },
  240: {
    title: "Tightened toward orwell blue",
    tone: "clipped · concrete · cold",
    out: "Alice was tired. She sat by her sister on the bank. There was nothing to do. The afternoon dragged.",
  },
  280: {
    title: "Twisted toward kafka indigo",
    tone: "procedural · uneasy · clausal",
    out: "It had begun, against her will, to seem to Alice that the very act of sitting by her sister on the bank (an act she could neither finish nor abandon) had been arranged for her without her consent.",
  },
  60: {
    title: "Coiled toward borges amber",
    tone: "erudite · recursive · latinate",
    out: "Alice, exhausted by the perpetual occupation of being seated beside her sister on the bank, contemplated the curious vacancy of an afternoon that contained, like a mirror facing another mirror, no occupation at all.",
  },
  10: {
    title: "Bodied toward morrison rose",
    tone: "tactile · lyrical · sorrowing",
    out: "Alice was tired in the bones, tired in the back of the throat, tired of the grass and the river and her sister and the long quiet afternoon, tired with a tiredness she had not asked for.",
  },
};

function readableHueName(h: number) {
  if (h < 30 || h >= 330) return "ember rose";
  if (h < 80) return "kindled amber";
  if (h < 160) return "meadow green";
  if (h < 220) return "tide teal";
  if (h < 280) return "orwell blue";
  return "kafka indigo";
}

function estimateHueFromText(text: string): number {
  // toy heuristic: short clauses = cold/blue, long sentences = indigo, warm words = amber
  if (text.trim().length === 0) return 0;
  const words = text.split(/\s+/);
  const avg = text.length / Math.max(1, text.split(/[.!?]/).filter(Boolean).length);
  const warmHits = (
    text.toLowerCase().match(/\b(warm|gold|sun|fire|amber|rose|honey|burn)\b/g) ?? []
  ).length;
  const calmHits = (
    text.toLowerCase().match(/\b(quiet|soft|gentle|cloud|grass|meadow|drift|hush)\b/g) ?? []
  ).length;
  let hue = 220 - Math.min(60, avg) + warmHits * 20 - calmHits * 18;
  hue += Math.min(40, words.length / 4);
  return ((hue % 360) + 360) % 360;
}

export function QuillMock() {
  const [mode, setMode] = useState<Mode>("target");
  const [target, setTarget] = useState(145);
  const [text, setText] = useState(PROMPT);

  const livehue = useMemo(() => estimateHueFromText(text), [text]);
  const targetSpec = (TARGETS.find((t) => t.hue === target) ??
    TARGETS[0]) as (typeof TARGETS)[number];
  const nudge = NUDGES[target];

  return (
    <div className="rounded-xl border border-border bg-card/80 p-6 shadow-[0_1px_0_rgba(0,0,0,0.02),0_24px_60px_-30px_rgba(40,30,80,0.25)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-serif text-lg text-ink-deep">The Quill</div>
          <div className="text-xs text-muted-foreground">
            Write, and watch the hue of your prose surface. Target a colour to receive nudges.
          </div>
        </div>
        <div className="flex gap-1 text-xs">
          {(["readout", "target"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md border px-2 py-1 capitalize transition-colors ${
                mode === m
                  ? "border-ink-deep bg-ink-deep text-ink-paper"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
              original
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-3 min-h-[110px] w-full resize-none bg-transparent font-serif text-[13px] leading-relaxed text-ink-deep outline-none placeholder:text-muted-foreground"
              placeholder="Write a paragraph and watch the ink reveal itself…"
            />
          </div>

          {mode === "target" && nudge && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div
                  className="text-[10px] tracking-widest uppercase"
                  style={{ color: `oklch(0.5 0.16 ${target})` }}
                >
                  suggested · {targetSpec.name}
                </div>
                <div className="text-[10px] text-muted-foreground italic">{nudge.tone}</div>
              </div>
              <p className="mt-3 font-serif text-[13px] leading-relaxed text-ink-deep">
                {nudge.out}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border/60 bg-background/60 p-4">
            <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
              your current hue
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span
                className="size-10 rounded-full ring-1 ring-border transition-colors"
                style={{ backgroundColor: `oklch(0.65 0.16 ${livehue})` }}
              />
              <div className="flex flex-col">
                <span className="font-serif text-sm text-ink-deep">{readableHueName(livehue)}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  hue {livehue.toFixed(0)}°
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {mode === "readout"
                ? "The hue updates as you type. Calm verbs cool it; warm imagery heats it."
                : "Aim for the target. Suggestions appear inline."}
            </p>
          </div>

          {mode === "target" && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
                target colour
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TARGETS.map((t) => (
                  <button
                    key={t.hue}
                    type="button"
                    onClick={() => setTarget(t.hue)}
                    title={t.name}
                    aria-label={t.name}
                    className={`size-6 rounded-full transition-transform ${
                      target === t.hue
                        ? "scale-110 ring-2 ring-ink-deep"
                        : "ring-1 ring-border hover:scale-105"
                    }`}
                    style={{ backgroundColor: `oklch(0.65 0.16 ${t.hue})` }}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className="size-5 rounded-full"
                  style={{ backgroundColor: `oklch(0.65 0.16 ${target})` }}
                />
                <span className="font-serif text-sm text-ink-deep">{targetSpec.name}</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                {targetSpec.hint}
              </p>
            </div>
          )}

          {mode === "target" && nudge && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-4">
              <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
                nudge applied
              </div>
              <div className="mt-2 font-serif text-sm text-ink-deep">{nudge.title}</div>
              <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                <li>• Softened or reshaped intensity</li>
                <li>• Adjusted clause length & rhythm</li>
                <li>• Re-tinted imagery toward target</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
