"use client";

import { useState } from "react";

type GameMode = "swatch" | "wheel" | "twin";

type Round = {
  passage: string;
  source: string;
  truthHue: number;
  twin?: { passage: string; source: string; truthHue: number };
};

const ROUNDS: Round[] = [
  {
    passage:
      "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.",
    source: "George Orwell · 1984",
    truthHue: 240,
    twin: {
      passage:
        "There were doors all round the hall, but they were all locked; and when Alice had been all the way down one side and up the other, trying every door, she walked sadly down the middle, wondering how she was ever to get out again.",
      source: "Lewis Carroll · Alice in Wonderland",
      truthHue: 30,
    },
  },
  {
    passage:
      "Mrs Dalloway said she would buy the flowers herself. For Lucy had her work cut out for her. The doors would be taken off their hinges; Rumpelmayer's men were coming.",
    source: "Virginia Woolf · Mrs Dalloway",
    truthHue: 295,
    twin: {
      passage:
        "A throwing together of broken things, a stirring of incompatible materials, an attempt to make do with what is, when what is, is not enough; was that not Beloved?",
      source: "Toni Morrison · Beloved",
      truthHue: 10,
    },
  },
  {
    passage:
      "It was a pleasure to burn. It was a special pleasure to see things eaten, to see things blackened and changed.",
    source: "Ray Bradbury · Fahrenheit 451",
    truthHue: 25,
    twin: {
      passage: "The sky above the port was the color of television, tuned to a dead channel.",
      source: "William Gibson · Neuromancer",
      truthHue: 200,
    },
  },
];

const SWATCHES = [{ hue: 25 }, { hue: 70 }, { hue: 140 }, { hue: 200 }, { hue: 240 }, { hue: 295 }];

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/* ------------------------------ wheel ----------------------------- */

function ColorWheelInteractive({
  size = 200,
  onPick,
  pickedHue,
}: {
  size?: number;
  onPick: (hue: number) => void;
  pickedHue: number | null;
}) {
  const slices = 36;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const inner = r * 0.32;
  const f = (n: number) => n.toFixed(3);
  const segments = [];
  for (let i = 0; i < slices; i++) {
    const a0 = (i / slices) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / slices) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const xi0 = cx + Math.cos(a0) * inner;
    const yi0 = cy + Math.sin(a0) * inner;
    const xi1 = cx + Math.cos(a1) * inner;
    const yi1 = cy + Math.sin(a1) * inner;
    const hue = (i / slices) * 360 + 360 / slices / 2;
    segments.push(
      // biome-ignore lint/a11y/useSemanticElements: SVG <path> cannot be a real <button>; we keyboard- and screen-reader-enable it manually.
      <path
        key={`slice-${hue}`}
        d={`M ${f(xi0)} ${f(yi0)} L ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)} L ${f(xi1)} ${f(yi1)} A ${f(inner)} ${f(inner)} 0 0 0 ${f(xi0)} ${f(yi0)} Z`}
        fill={`oklch(0.72 0.16 ${hue})`}
        className="cursor-pointer transition-opacity hover:opacity-75"
        role="button"
        tabIndex={0}
        aria-label={`pick hue ${hue.toFixed(0)} degrees`}
        onClick={() => onPick(hue)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick(hue);
          }
        }}
      />,
    );
  }

  let handle = null;
  if (pickedHue !== null) {
    const a = (pickedHue / 360) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r * 0.78;
    const py = cy + Math.sin(a) * r * 0.78;
    handle = (
      <g>
        <circle cx={px} cy={py} r={9} fill="var(--card)" stroke="var(--ink-deep)" strokeWidth={2} />
        <circle cx={px} cy={py} r={4} fill={`oklch(0.55 0.18 ${pickedHue})`} />
      </g>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="color wheel"
    >
      {segments}
      <circle cx={cx} cy={cy} r={inner} fill="var(--card)" />
      {handle}
    </svg>
  );
}

/* ----------------------------- main ------------------------------- */

export function GameMock() {
  const [mode, setMode] = useState<GameMode>("wheel");
  const [roundIdx, setRoundIdx] = useState(0);
  const [pickedHue, setPickedHue] = useState<number | null>(null);
  const [twinAnswer, setTwinAnswer] = useState<"same" | "diff" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);

  const round = (ROUNDS[roundIdx] ?? ROUNDS[0]) as Round;

  const guessError = pickedHue === null ? null : hueDistance(pickedHue, round.truthHue);
  const guessPoints = guessError === null ? 0 : Math.max(0, 100 - Math.round(guessError));

  const twinReal = round.twin
    ? hueDistance(round.truthHue, round.twin.truthHue) < 40
      ? "same"
      : "diff"
    : null;
  const twinCorrect = twinAnswer !== null && twinAnswer === twinReal;

  const reset = () => {
    setRevealed(false);
    setPickedHue(null);
    setTwinAnswer(null);
  };

  const next = () => {
    reset();
    setRoundIdx((i) => (i + 1) % ROUNDS.length);
  };

  const reveal = () => {
    setRevealed(true);
    if (mode === "twin") {
      if (twinCorrect) {
        setStreak((s) => s + 1);
        setScore((s) => s + 50);
      } else {
        setStreak(0);
      }
    } else {
      if (guessError !== null && guessError < 30) {
        setStreak((s) => s + 1);
        setScore((s) => s + guessPoints);
      } else {
        setStreak(0);
        setScore((s) => s + guessPoints);
      }
    }
  };

  const canReveal = mode === "twin" ? twinAnswer !== null : pickedHue !== null;

  const switchMode = (m: GameMode) => {
    setMode(m);
    reset();
  };

  return (
    <div className="rounded-xl border border-border bg-card/80 p-6 shadow-[0_1px_0_rgba(0,0,0,0.02),0_24px_60px_-30px_rgba(40,30,80,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serif text-lg text-ink-deep">The Blotting Game</div>
          <div className="text-xs text-muted-foreground">
            Guess the hue of a smudge. Every guess feeds the consensus ink.
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            ✋ streak <span className="font-medium text-ink-deep">{streak}</span>
          </span>
          <span>
            ♛ score <span className="font-medium text-ink-deep">{score}</span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {(["swatch", "wheel", "twin"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => switchMode(m)}
            className={`rounded-md border px-2.5 py-1 transition-colors ${
              mode === m
                ? "border-ink-deep bg-ink-deep text-ink-paper"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {m === "swatch" && "Smudge → Swatch"}
            {m === "wheel" && "Smudge → Wheel"}
            {m === "twin" && "Twin Smudges"}
          </button>
        ))}
      </div>

      {mode !== "twin" && (
        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <PassageCard
            label="smudge"
            text={round.passage}
            reveal={revealed ? round : null}
            error={guessError}
            points={guessPoints}
          />

          {mode === "wheel" ? (
            <div className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-xs font-medium text-ink-deep">Pick on the wheel</div>
              <div className="text-[11px] text-muted-foreground">
                {pickedHue === null
                  ? "Drop the nib anywhere on the wheel."
                  : revealed
                    ? guessError !== null && guessError < 30
                      ? "Sharp eye."
                      : "Off-hue."
                    : "Locked. Reveal to score."}
              </div>
              <div className="mt-3 grid place-items-center">
                <ColorWheelInteractive
                  size={180}
                  pickedHue={pickedHue}
                  onPick={(h) => !revealed && setPickedHue(h)}
                />
              </div>
              <RevealButtons
                canReveal={canReveal}
                revealed={revealed}
                onReveal={reveal}
                onNext={next}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-background/60 p-5">
              <div className="text-xs font-medium text-ink-deep">Pick a swatch</div>
              <div className="text-[11px] text-muted-foreground">
                The closest hue scores the round.
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {SWATCHES.map((s) => {
                  const selected = pickedHue === s.hue;
                  return (
                    <button
                      type="button"
                      key={s.hue}
                      aria-label={`swatch hue ${s.hue}`}
                      onClick={() => !revealed && setPickedHue(s.hue)}
                      className={`aspect-square rounded-md border transition-transform ${
                        selected
                          ? "scale-105 border-ink-deep ring-2 ring-ink-deep/40"
                          : "border-border hover:scale-[1.03]"
                      }`}
                      style={{ backgroundColor: `oklch(0.7 0.16 ${s.hue})` }}
                    />
                  );
                })}
              </div>
              <RevealButtons
                canReveal={canReveal}
                revealed={revealed}
                onReveal={reveal}
                onNext={next}
              />
            </div>
          )}
        </div>
      )}

      {mode === "twin" && round.twin && (
        <div className="mt-6 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PassageCard label="smudge · left" text={round.passage} simple />
            <PassageCard label="smudge · right" text={round.twin.passage} simple />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => !revealed && setTwinAnswer("diff")}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                twinAnswer === "diff"
                  ? "border-ink-deep bg-ink-deep text-ink-paper"
                  : "border-border bg-card text-ink-deep hover:bg-accent"
              }`}
            >
              Different hues
            </button>
            <button
              type="button"
              onClick={() => !revealed && setTwinAnswer("same")}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                twinAnswer === "same"
                  ? "border-ink-deep bg-ink-deep text-ink-paper"
                  : "border-border bg-card text-ink-deep hover:bg-accent"
              }`}
            >
              Same hue
            </button>
            <RevealButtons
              canReveal={canReveal}
              revealed={revealed}
              onReveal={reveal}
              onNext={next}
            />
          </div>
          {revealed && (
            <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground">truth:</span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: `oklch(0.6 0.18 ${round.truthHue})` }}
                  />
                  <span className="font-medium text-ink-deep">{round.source}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: `oklch(0.6 0.18 ${round.twin.truthHue})` }}
                  />
                  <span className="font-medium text-ink-deep">{round.twin.source}</span>
                </span>
                <span
                  className={`ml-auto rounded-md px-2 py-1 ${twinCorrect ? "bg-emerald-600 text-white" : "bg-ink-deep text-ink-paper"}`}
                >
                  {twinCorrect
                    ? "+50 · correct"
                    : `wrong · they are ${twinReal === "same" ? "same" : "different"}`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PassageCard({
  label,
  text,
  reveal,
  error,
  points,
  simple,
}: {
  label: string;
  text: string;
  reveal?: Round | null;
  error?: number | null;
  points?: number;
  simple?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-5">
      <div className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <p className="mt-3 font-serif text-sm leading-relaxed text-ink-deep md:text-base">{text}</p>
      {!simple && reveal && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-xs">
          <span className="text-muted-foreground">true hue:</span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: `oklch(0.6 0.18 ${reveal.truthHue})` }}
            />
            <span className="font-medium text-ink-deep">{reveal.source}</span>
          </span>
          {error !== null && error !== undefined && points !== undefined && (
            <span className="ml-auto rounded-md bg-ink-deep px-2 py-1 text-ink-paper">
              +{points} pts · Δ{error.toFixed(0)}°
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function RevealButtons({
  canReveal,
  revealed,
  onReveal,
  onNext,
}: {
  canReveal: boolean;
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-2 text-xs">
      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          disabled={!canReveal}
          className="rounded-md bg-ink-deep px-3 py-1.5 text-ink-paper transition-opacity disabled:opacity-40"
        >
          Reveal
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-ink-deep px-3 py-1.5 text-ink-paper"
        >
          Next smudge →
        </button>
      )}
    </div>
  );
}
