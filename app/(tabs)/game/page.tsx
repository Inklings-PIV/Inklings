"use client";

import { Check, Flame, Loader2, Sparkles, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { cn } from "@/lib/utils";
import {
  getLeaderboard,
  type LeaderboardRow,
  type SwatchGuessResult,
  type SwatchRoundForClient,
  startSwatchRound,
  startTwinRound,
  startWheelRound,
  submitSwatchGuess,
  submitTwinGuess,
  submitWheelGuess,
  type TwinGuessResult,
  type TwinJudgement,
  type TwinRoundForClient,
  type WheelGuessResult,
  type WheelRoundForClient,
} from "./actions";

type GameMode = "swatch" | "wheel" | "twin";

// Rounds scoring at least this much (out of 100) count as a "win" for the
// streak counter. Matches the same threshold the server uses in computeStreak.
const STREAK_WIN_THRESHOLD = 70;

export default function GamePage() {
  const [mode, setMode] = useState<GameMode>("swatch");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [boardLoading, startBoard] = useTransition();

  const handleScored = useCallback((scoreUpdate: { sessionScore: number; streak: number }) => {
    setSessionScore(scoreUpdate.sessionScore);
    setStreak(scoreUpdate.streak);
    // Refresh the leaderboard after every scored round so the player sees
    // their position move in real time.
    startBoard(async () => {
      const rows = await getLeaderboard();
      setLeaderboard(rows);
    });
  }, []);

  // Initial leaderboard load.
  useEffect(() => {
    startBoard(async () => {
      const rows = await getLeaderboard();
      setLeaderboard(rows);
    });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-ink-deep sm:text-3xl">
            The Blotting Game
          </h1>
          <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">
            Guess the hue of a smudge. Every guess feeds the consensus ink.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:gap-4 sm:text-sm">
          <span className="flex items-center gap-1.5">
            <Flame className="size-4" />{" "}
            <strong className="text-foreground tabular-nums">{streak}</strong>
            <span className="hidden sm:inline">streak</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="size-4" />{" "}
            <strong className="text-foreground tabular-nums">{sessionScore}</strong>
            <span className="hidden sm:inline">score</span>
          </span>
        </div>
      </header>

      <div className="mt-6">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as GameMode)}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          <ToggleGroupItem value="swatch" className="flex-1 sm:flex-initial">
            Swatch
          </ToggleGroupItem>
          <ToggleGroupItem value="wheel" className="flex-1 sm:flex-initial">
            Wheel
          </ToggleGroupItem>
          <ToggleGroupItem value="twin" className="flex-1 sm:flex-initial">
            Twin
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator className="my-6" />

      {mode === "swatch" && (
        <SwatchRound sessionId={sessionId} onSession={setSessionId} onScored={handleScored} />
      )}
      {mode === "wheel" && (
        <WheelRound sessionId={sessionId} onSession={setSessionId} onScored={handleScored} />
      )}
      {mode === "twin" && (
        <TwinRound sessionId={sessionId} onSession={setSessionId} onScored={handleScored} />
      )}

      <Separator className="my-8" />
      <Leaderboard rows={leaderboard} loading={boardLoading && !leaderboard} />
    </div>
  );
}

function Leaderboard({ rows, loading }: { rows: LeaderboardRow[] | null; loading: boolean }) {
  return (
    <section>
      <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">Leaderboard</h2>
      <Card className="mt-3 bg-card/40">
        <CardContent className="p-4">
          {loading || !rows ? (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Tallying scores…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-2 text-center text-xs italic text-muted-foreground">
              No scores yet — play a round to seed the leaderboard.
            </p>
          ) : (
            <ol className="space-y-1">
              {rows.map((row, i) => (
                <li
                  key={row.scribeId}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-sm px-2 py-1 text-xs tabular-nums",
                    row.isMe && "bg-muted/60 text-ink-deep",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="font-mono">
                      Scribe {row.scribeId.slice(0, 6)}
                      {row.isMe && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-bleed">
                          you
                        </span>
                      )}
                    </span>
                  </span>
                  <strong className="shrink-0 text-ink-deep">{row.totalScore}</strong>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type RoundState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "guessing"; round: SwatchRoundForClient }
  | { kind: "revealed"; round: SwatchRoundForClient; result: SwatchGuessResult; pickedId: string };

function SwatchRound({
  sessionId,
  onSession,
  onScored,
}: {
  sessionId: string | null;
  onSession: (id: string) => void;
  onScored: (s: { sessionScore: number; streak: number }) => void;
}) {
  const [state, setState] = useState<RoundState>({ kind: "idle" });
  const [isLoading, startLoading] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(() => {
    setError(null);
    startLoading(async () => {
      try {
        const round = await startSwatchRound({ sessionId });
        onSession(round.sessionId);
        setState({ kind: "guessing", round });
      } catch (err) {
        setError((err as Error).message);
        setState({ kind: "idle" });
      }
    });
  }, [sessionId, onSession]);

  // Auto-start the first round on mount so the player isn't staring at a button.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire once on mount
  useEffect(() => {
    begin();
  }, []);

  const guess = (swatchId: string) => {
    if (state.kind !== "guessing") return;
    const round = state.round;
    setError(null);
    startSubmit(async () => {
      try {
        const result = await submitSwatchGuess({ roundId: round.roundId, swatchId });
        onScored({ sessionScore: result.sessionScore, streak: result.streak });
        setState({ kind: "revealed", round, result, pickedId: swatchId });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  if (state.kind === "idle" || (state.kind === "loading" && !isLoading)) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        {error && <p className="text-sm italic text-destructive">{error}</p>}
        <Button onClick={begin} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Start a round
        </Button>
      </div>
    );
  }

  if (isLoading || !("round" in state)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-xs italic">Pulling a smudge…</p>
      </div>
    );
  }

  const round = state.round;
  const isRevealed = state.kind === "revealed";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge excerpt={round.excerpt} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a swatch</CardTitle>
          <CardDescription>
            {isRevealed
              ? state.result.correct
                ? `Yes — ${state.result.book.title} by ${state.result.book.authorName}.`
                : `That was ${state.result.book.title} by ${state.result.book.authorName}.`
              : "Which hue belongs to this smudge?"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {round.swatches.map((s) => {
              const isPicked = isRevealed && state.pickedId === s.swatchId;
              const isCorrect = isRevealed && state.result.correctSwatchId === s.swatchId;
              return (
                <button
                  key={s.swatchId}
                  type="button"
                  aria-label={`Pick swatch ${s.swatchId}`}
                  onClick={() => guess(s.swatchId)}
                  disabled={isRevealed || isSubmitting}
                  className={cn(
                    "relative aspect-square rounded-md border border-border transition-transform",
                    !isRevealed && "enabled:hover:scale-[1.03]",
                    isCorrect && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
                    isPicked &&
                      !isCorrect &&
                      "ring-2 ring-destructive ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: s.css }}
                >
                  {isCorrect && (
                    <Check
                      aria-hidden="true"
                      className="absolute inset-0 m-auto size-6 text-white drop-shadow"
                    />
                  )}
                  {isPicked && !isCorrect && (
                    <X
                      aria-hidden="true"
                      className="absolute inset-0 m-auto size-6 text-white drop-shadow"
                    />
                  )}
                  {isSubmitting && state.kind === "guessing" && (
                    <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-white/80" />
                  )}
                </button>
              );
            })}
          </div>
          {isRevealed && (
            <Button onClick={begin} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Next round
            </Button>
          )}
          {error && <p className="text-xs italic text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

type WheelPick = { hue: number; saturation: number };

type WheelState =
  | { kind: "idle" }
  | { kind: "guessing"; round: WheelRoundForClient }
  | {
      kind: "revealed";
      round: WheelRoundForClient;
      result: WheelGuessResult;
      pick: WheelPick;
    };

// Fixed lightness for the wheel UI. The algorithmic deriver lives in the
// 40–75 ink-paper range; 60 sits in the middle and reads as ink on paper
// without going neon. Scoring weighs the difference lightly via #33's
// lightness component being absent from the distance formula.
const WHEEL_LIGHTNESS = 60;

function WheelRound({
  sessionId,
  onSession,
  onScored,
}: {
  sessionId: string | null;
  onSession: (id: string) => void;
  onScored: (s: { sessionScore: number; streak: number }) => void;
}) {
  const [state, setState] = useState<WheelState>({ kind: "idle" });
  const [pick, setPick] = useState<WheelPick | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(() => {
    setError(null);
    setPick(null);
    startLoading(async () => {
      try {
        const round = await startWheelRound({ sessionId });
        onSession(round.sessionId);
        setState({ kind: "guessing", round });
      } catch (err) {
        setError((err as Error).message);
        setState({ kind: "idle" });
      }
    });
  }, [sessionId, onSession]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire once on mount
  useEffect(() => {
    begin();
  }, []);

  const onWheelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (state.kind !== "guessing") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const x = e.clientX - rect.left - cx;
    const y = e.clientY - rect.top - cy;
    const r = Math.sqrt(x * x + y * y);
    if (r > cx) return; // outside the wheel
    const sat = Math.round(Math.min(100, (r / cx) * 100));
    // atan2 → 0=right, π/2=down (screen coords). Add 90° so 0° lands at the
    // top of the wheel and the angle then increments clockwise.
    const hueDeg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    setPick({ hue: Math.round(hueDeg), saturation: sat });
  };

  const submit = () => {
    if (!pick || state.kind !== "guessing") return;
    const round = state.round;
    setError(null);
    startSubmit(async () => {
      try {
        const result = await submitWheelGuess({
          roundId: round.roundId,
          hue: pick.hue,
          saturation: pick.saturation,
          lightness: WHEEL_LIGHTNESS,
        });
        onScored({ sessionScore: result.sessionScore, streak: result.streak });
        setState({ kind: "revealed", round, result, pick });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  if (isLoading || state.kind === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-xs italic">Pulling a smudge…</p>
      </div>
    );
  }

  const round = state.round;
  const isRevealed = state.kind === "revealed";
  const correctMarker = isRevealed
    ? polarToOffsetPercent(state.result.correct.hue, state.result.correct.saturation)
    : null;
  const pickMarker = pick ? polarToOffsetPercent(pick.hue, pick.saturation) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge excerpt={round.excerpt} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick on the wheel</CardTitle>
          <CardDescription>
            {isRevealed
              ? state.result.scored >= STREAK_WIN_THRESHOLD
                ? `Close — ${state.result.book.title} by ${state.result.book.authorName}. ${state.result.scored} / 100.`
                : `That was ${state.result.book.title} by ${state.result.book.authorName}. ${state.result.scored} / 100.`
              : "Click the wheel to drop the nib — angle picks hue, distance from the centre picks saturation."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <button
            type="button"
            aria-label="Colour wheel"
            onClick={onWheelClick}
            disabled={isRevealed || isSubmitting}
            className="relative size-52 cursor-crosshair rounded-full border border-border shadow-inner disabled:cursor-default"
            style={{
              background: `
                radial-gradient(circle, hsl(0, 0%, 100%) 0%, transparent 70%),
                conic-gradient(
                  from 0deg,
                  hsl(90, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(150, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(210, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(270, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(330, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(30, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(90, 80%, ${WHEEL_LIGHTNESS}%)
                )
              `,
            }}
          >
            {pickMarker && (
              <span
                aria-hidden="true"
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{
                  left: `${pickMarker.x}%`,
                  top: `${pickMarker.y}%`,
                  backgroundColor: `hsl(${pick?.hue ?? 0}, ${pick?.saturation ?? 0}%, ${WHEEL_LIGHTNESS}%)`,
                }}
              />
            )}
            {isRevealed && correctMarker && (
              <span
                aria-hidden="true"
                className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 ring-2 ring-background"
                style={{
                  left: `${correctMarker.x}%`,
                  top: `${correctMarker.y}%`,
                  backgroundColor: `hsl(${state.result.correct.hue}, ${state.result.correct.saturation}%, ${WHEEL_LIGHTNESS}%)`,
                }}
              />
            )}
          </button>

          {!isRevealed && (
            <Button onClick={submit} disabled={!pick || isSubmitting} className="w-full">
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {pick ? "Drop the nib" : "Click the wheel to pick"}
            </Button>
          )}

          {isRevealed && (
            <Button onClick={begin} disabled={isLoading} className="w-full">
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Next round
            </Button>
          )}

          {error && <p className="text-xs italic text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/** Convert (hue°, saturation%) on the wheel to (x%, y%) for absolute positioning. */
function polarToOffsetPercent(hueDeg: number, saturationPct: number): { x: number; y: number } {
  // Same convention as the click handler: 0° at the top, clockwise.
  const angleRad = ((hueDeg - 90) * Math.PI) / 180;
  const r = saturationPct / 100; // 0..1, 1 = at the rim
  // 50% = centre; offset by ±50% × r in each direction.
  return {
    x: 50 + 50 * r * Math.cos(angleRad),
    y: 50 + 50 * r * Math.sin(angleRad),
  };
}

type TwinState =
  | { kind: "idle" }
  | { kind: "guessing"; round: TwinRoundForClient }
  | { kind: "revealed"; round: TwinRoundForClient; result: TwinGuessResult; guess: TwinJudgement };

function TwinRound({
  sessionId,
  onSession,
  onScored,
}: {
  sessionId: string | null;
  onSession: (id: string) => void;
  onScored: (s: { sessionScore: number; streak: number }) => void;
}) {
  const [state, setState] = useState<TwinState>({ kind: "idle" });
  const [isLoading, startLoading] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(() => {
    setError(null);
    startLoading(async () => {
      try {
        const round = await startTwinRound({ sessionId });
        onSession(round.sessionId);
        setState({ kind: "guessing", round });
      } catch (err) {
        setError((err as Error).message);
        setState({ kind: "idle" });
      }
    });
  }, [sessionId, onSession]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only fire once on mount
  useEffect(() => {
    begin();
  }, []);

  const guess = (choice: TwinJudgement) => {
    if (state.kind !== "guessing") return;
    const round = state.round;
    setError(null);
    startSubmit(async () => {
      try {
        const result = await submitTwinGuess({ roundId: round.roundId, guess: choice });
        onScored({ sessionScore: result.sessionScore, streak: result.streak });
        setState({ kind: "revealed", round, result, guess: choice });
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  if (isLoading || state.kind === "idle") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <p className="text-xs italic">Pulling a pair…</p>
      </div>
    );
  }

  const round = state.round;
  const isRevealed = state.kind === "revealed";

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Smudge excerpt={round.excerptA} variant="left" />
        <Smudge excerpt={round.excerptB} variant="right" />
      </div>

      {isRevealed ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {state.result.correct ? "Yes" : "Not quite"} —{" "}
              {state.result.truth === "same" ? "same hue" : "different hues"}
            </CardTitle>
            <CardDescription>
              {state.result.bookA.title} ({state.result.bookA.authorName}) and{" "}
              {state.result.bookB.title} ({state.result.bookB.authorName}). Hue distance:{" "}
              {Math.round(state.result.hueDistance)}°.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <TwinSwatch label="A" hsl={state.result.bookA} />
              <TwinSwatch label="B" hsl={state.result.bookB} />
            </div>
            <Button onClick={begin} disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Next pair
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => guess("different")}
            disabled={isSubmitting}
            className="min-w-[140px]"
          >
            Different hues
          </Button>
          <Button onClick={() => guess("same")} disabled={isSubmitting} className="min-w-[140px]">
            Same hue
          </Button>
        </div>
      )}

      {error && <p className="text-center text-xs italic text-destructive">{error}</p>}
    </div>
  );
}

function TwinSwatch({
  label,
  hsl,
}: {
  label: string;
  hsl: { hue: number; saturation: number; lightness: number };
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        aria-label={`Book ${label} hue`}
        role="img"
        className="size-12 rounded-full border border-border shadow-inner"
        style={{
          backgroundColor: hueFromHSL(hsl.hue, hsl.saturation, hsl.lightness).css,
        }}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function Smudge({
  excerpt,
  variant = "single",
}: {
  excerpt?: string;
  variant?: "single" | "left" | "right";
}) {
  // Wheel + Twin modes are still placeholder — fall back to seed copy so they
  // render until #33/#34 ship.
  const text =
    excerpt ??
    (variant === "right"
      ? "There were doors all round the hall, but they were all locked; and when Alice had been all the way down one side and up the other, trying every door, she walked sadly down the middle, wondering how she was ever to get out again."
      : "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.");
  return (
    <Card className="bg-card/60">
      <CardHeader className="pb-2">
        <CardDescription className="text-[10px] uppercase tracking-wider">
          smudge {variant !== "single" && `· ${variant}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-serif text-lg leading-relaxed text-ink-deep whitespace-pre-wrap">
          {text}
        </p>
      </CardContent>
    </Card>
  );
}
