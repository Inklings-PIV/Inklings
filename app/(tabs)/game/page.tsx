"use client";

import { Check, Flame, Loader2, Sparkles, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BleedingText } from "@/components/game/animations/bleeding-text";
import { usePulseTrigger } from "@/components/game/animations/border-pulse";
import { useDripTrigger } from "@/components/game/animations/drip-overlay";
import { StaggeredRows } from "@/components/game/animations/staggered-rows";
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
  const [, startBoard] = useTransition();

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
        <div
          role="status"
          aria-live="polite"
          aria-label={`Streak ${streak}, session score ${sessionScore}`}
          className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:gap-4 sm:text-sm"
        >
          <span className="flex items-center gap-1.5">
            <Flame aria-hidden="true" className="size-4" />{" "}
            <strong className="text-foreground tabular-nums">{streak}</strong>
            <span className="hidden sm:inline">streak</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy aria-hidden="true" className="size-4" />{" "}
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
      <Leaderboard rows={leaderboard} />
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderboardRow[] | null }) {
  return (
    <section>
      <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">Leaderboard</h2>
      <Card className="mt-3 bg-card/40">
        <CardContent className="p-4">
          {!rows || rows.length === 0 ? (
            <p className="py-2 text-center text-xs italic text-muted-foreground">
              No scores yet — play a round to seed the leaderboard.
            </p>
          ) : (
            <StaggeredRows
              className="space-y-1"
              items={rows}
              keyFn={(row) => row.scribeId}
              itemClassName={(row) =>
                cn(
                  "flex items-center justify-between gap-3 rounded-sm px-2 py-1 text-xs tabular-nums",
                  row.isMe && "bg-muted/60 text-ink-deep",
                )
              }
              renderItem={(row, i) => (
                <>
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
                </>
              )}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type RoundState =
  | { kind: "idle" }
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
  const smudgeRef = useRef<HTMLDivElement>(null);
  const triggerDrip = useDripTrigger();

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

  const guess = (swatchId: string, sourceEl: HTMLElement | null, colour: string) => {
    if (state.kind !== "guessing") return;
    const round = state.round;
    setError(null);
    if (sourceEl && smudgeRef.current) {
      triggerDrip(sourceEl, smudgeRef.current, colour);
    }
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

  // While the first round is loading (state=idle, isLoading=true) we still
  // show this button screen — the spinner sits inside the button rather
  // than as a centred page-blocker. Subsequent "Next round" loads keep the
  // previous revealed state on screen until the new excerpt bleeds in.
  if (state.kind === "idle") {
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

  const round = state.round;
  const isRevealed = state.kind === "revealed";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge excerpt={round.excerpt} ref={smudgeRef} roundKey={round.roundId} />
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
            {round.swatches.map((s, i) => {
              const isPicked = isRevealed && state.pickedId === s.swatchId;
              const isCorrect = isRevealed && state.result.correctSwatchId === s.swatchId;
              return (
                <button
                  key={s.swatchId}
                  type="button"
                  aria-label={`Swatch ${i + 1} of ${round.swatches.length}`}
                  onClick={(e) => guess(s.swatchId, e.currentTarget, s.css)}
                  disabled={isRevealed || isSubmitting}
                  className={cn(
                    "relative aspect-square rounded-md border border-border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
  const smudgeRef = useRef<HTMLDivElement>(null);
  const wheelMarkerRef = useRef<HTMLSpanElement>(null);
  const triggerDrip = useDripTrigger();

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
    if (wheelMarkerRef.current && smudgeRef.current) {
      const dripColour = `hsl(${pick.hue}, ${pick.saturation}%, ${WHEEL_LIGHTNESS}%)`;
      triggerDrip(wheelMarkerRef.current, smudgeRef.current, dripColour);
    }
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

  // Initial mount loading is brief and the Sparkles button's internal
  // spinner is the affordance. Next-round loading falls through to the
  // revealed layout below, so the previous smudge stays visible until the
  // new excerpt bleeds in.
  if (state.kind === "idle") {
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

  const round = state.round;
  const isRevealed = state.kind === "revealed";
  const correctMarker = isRevealed
    ? polarToOffsetPercent(state.result.correct.hue, state.result.correct.saturation)
    : null;
  const pickMarker = pick ? polarToOffsetPercent(pick.hue, pick.saturation) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge excerpt={round.excerpt} ref={smudgeRef} roundKey={round.roundId} />
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
            aria-label="Colour wheel — click to set hue (angle) and saturation (distance from centre)"
            onClick={onWheelClick}
            disabled={isRevealed || isSubmitting}
            className="relative size-52 cursor-crosshair rounded-full border border-border shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default"
            style={{
              // Conic stops match HSL hue 0..360 so position on the wheel
              // *is* the picked hue value — top is red (0°), right is lime
              // (90°), bottom cyan (180°), left purple (270°). The white
              // radial gradient washes saturation out toward the centre.
              background: `
                radial-gradient(circle, hsl(0, 0%, 100%) 0%, transparent 70%),
                conic-gradient(
                  from 0deg,
                  hsl(0, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(60, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(120, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(180, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(240, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(300, 80%, ${WHEEL_LIGHTNESS}%),
                  hsl(360, 80%, ${WHEEL_LIGHTNESS}%)
                )
              `,
            }}
          >
            {pickMarker && (
              <span
                ref={wheelMarkerRef}
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

          <HueSatSliders pick={pick} disabled={isRevealed || isSubmitting} onChange={setPick} />

          {!isRevealed && (
            <Button onClick={submit} disabled={!pick || isSubmitting} className="w-full">
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {pick ? "Drop the nib" : "Pick a hue to begin"}
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

/**
 * Hue + saturation sliders, bidirectionally bound with the wheel above
 * through a shared `pick` state. Native `<input type="range">` for free
 * keyboard support — arrow keys ±1, shift+arrow ±10.
 *
 * Hue track is the same rainbow as the wheel (red→red over 0..360).
 * Saturation track is greyscale → vibrant at the currently-picked hue,
 * so the user sees the colour they'd land on as they drag.
 */
function HueSatSliders({
  pick,
  disabled,
  onChange,
}: {
  pick: WheelPick | null;
  disabled: boolean;
  onChange: (next: WheelPick) => void;
}) {
  // Default mid-wheel so the sliders look meaningful before any click.
  const hue = pick?.hue ?? 0;
  const sat = pick?.saturation ?? 50;
  const baseHue = pick?.hue ?? 0;

  // Tailwind v4 arbitrary selectors for the WebKit + Firefox thumbs —
  // duplicated because the two engines don't share a pseudo-element.
  const sliderClass =
    "h-3 w-full appearance-none rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-ink-deep [&::-webkit-slider-thumb]:shadow " +
    "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-ink-deep [&::-moz-range-thumb]:shadow";

  return (
    <div className="flex w-full flex-col gap-3 text-xs">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-muted-foreground">
          <span>Hue</span>
          <span className="tabular-nums">{hue}°</span>
        </span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={hue}
          disabled={disabled}
          aria-label="Hue, 0 to 360 degrees"
          onChange={(e) => onChange({ hue: Number(e.target.value), saturation: sat })}
          className={sliderClass}
          style={{
            background: `linear-gradient(to right, hsl(0, 80%, ${WHEEL_LIGHTNESS}%), hsl(60, 80%, ${WHEEL_LIGHTNESS}%), hsl(120, 80%, ${WHEEL_LIGHTNESS}%), hsl(180, 80%, ${WHEEL_LIGHTNESS}%), hsl(240, 80%, ${WHEEL_LIGHTNESS}%), hsl(300, 80%, ${WHEEL_LIGHTNESS}%), hsl(360, 80%, ${WHEEL_LIGHTNESS}%))`,
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-muted-foreground">
          <span>Saturation</span>
          <span className="tabular-nums">{sat}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sat}
          disabled={disabled}
          aria-label="Saturation, 0 to 100 percent"
          onChange={(e) => onChange({ hue, saturation: Number(e.target.value) })}
          className={sliderClass}
          style={{
            background: `linear-gradient(to right, hsl(${baseHue}, 0%, ${WHEEL_LIGHTNESS}%), hsl(${baseHue}, 100%, ${WHEEL_LIGHTNESS}%))`,
          }}
        />
      </label>
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
  const pulse = usePulseTrigger();

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

  const guess = (choice: TwinJudgement, sourceEl: HTMLElement | null) => {
    if (state.kind !== "guessing") return;
    const round = state.round;
    setError(null);
    pulse(sourceEl);
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

  // First-round loading shows the Sparkles button with internal spinner;
  // subsequent rounds keep the previous pair on screen until the new
  // excerpts bleed in.
  if (state.kind === "idle") {
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

  const round = state.round;
  const isRevealed = state.kind === "revealed";

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Smudge excerpt={round.excerptA} variant="left" roundKey={`${round.roundId}-a`} />
        <Smudge excerpt={round.excerptB} variant="right" roundKey={`${round.roundId}-b`} />
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
            onClick={(e) => guess("different", e.currentTarget)}
            disabled={isSubmitting}
            className="min-w-[140px]"
          >
            Different hues
          </Button>
          <Button
            onClick={(e) => guess("same", e.currentTarget)}
            disabled={isSubmitting}
            className="min-w-[140px]"
          >
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
  roundKey,
  ref,
}: {
  excerpt?: string;
  variant?: "single" | "left" | "right";
  // When set, the excerpt is wrapped in <BleedingText> keyed by this string,
  // so a new round triggers the word-by-word bleed-in. When unset (no round
  // loaded yet), the fallback text renders plain — no animation on the
  // pre-load placeholder.
  roundKey?: string;
  // Forwarded to a wrapper div so callers can measure the smudge's screen
  // position (drip target).
  ref?: React.Ref<HTMLDivElement>;
}) {
  // Wheel + Twin modes are still placeholder — fall back to seed copy so they
  // render until #33/#34 ship.
  const text =
    excerpt ??
    (variant === "right"
      ? "There were doors all round the hall, but they were all locked; and when Alice had been all the way down one side and up the other, trying every door, she walked sadly down the middle, wondering how she was ever to get out again."
      : "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.");
  return (
    <div ref={ref}>
      <Card className="bg-card/60">
        <CardHeader className="pb-2">
          <CardDescription className="text-[10px] uppercase tracking-wider">
            smudge {variant !== "single" && `· ${variant}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-serif text-lg leading-relaxed text-ink-deep whitespace-pre-wrap">
            {roundKey ? <BleedingText key={roundKey} text={text} /> : text}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
