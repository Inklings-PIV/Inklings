"use client";

import { Check, Flame, Loader2, Sparkles, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  type SwatchGuessResult,
  type SwatchRoundForClient,
  startSwatchRound,
  submitSwatchGuess,
} from "./actions";

type GameMode = "swatch" | "wheel" | "twin";

export default function GamePage() {
  const [mode, setMode] = useState<GameMode>("swatch");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const handleScored = useCallback((result: SwatchGuessResult) => {
    setSessionScore(result.sessionScore);
    setStreak((s) => (result.correct ? s + 1 : 0));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl tracking-tight text-ink-deep sm:text-3xl">
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
      {mode === "wheel" && <WheelRound />}
      {mode === "twin" && <TwinRound />}
    </div>
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
  onScored: (r: SwatchGuessResult) => void;
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
        onScored(result);
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

function WheelRound() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick on the wheel</CardTitle>
          <CardDescription>Drop the nib anywhere on the wheel.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <div
            aria-hidden="true"
            className="size-48 rounded-full opacity-90"
            style={{
              background:
                "conic-gradient(oklch(0.7 0.18 0), oklch(0.72 0.16 60), oklch(0.7 0.16 120), oklch(0.65 0.16 180), oklch(0.55 0.18 240), oklch(0.6 0.18 300), oklch(0.7 0.18 360))",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TwinRound() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Smudge variant="left" />
        <Smudge variant="right" />
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" disabled>
          Different hues
        </Button>
        <Button disabled>Same hue</Button>
      </div>
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
