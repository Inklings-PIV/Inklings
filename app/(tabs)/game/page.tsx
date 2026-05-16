"use client";

import { Flame, Trophy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type GameMode = "swatch" | "wheel" | "twin";

const swatches = [
  "oklch(0.7 0.16 30)",
  "oklch(0.72 0.14 80)",
  "oklch(0.7 0.16 140)",
  "oklch(0.65 0.16 200)",
  "oklch(0.55 0.18 260)",
  "oklch(0.6 0.18 320)",
];

export default function GamePage() {
  const [mode, setMode] = useState<GameMode>("swatch");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight text-ink-deep">The Blotting Game</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Guess the hue of a smudge. Every guess feeds the consensus ink.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Flame className="size-4" /> streak <strong className="text-foreground">0</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="size-4" /> score <strong className="text-foreground">0</strong>
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
        >
          <ToggleGroupItem value="swatch">Smudge → Swatch</ToggleGroupItem>
          <ToggleGroupItem value="wheel">Smudge → Wheel</ToggleGroupItem>
          <ToggleGroupItem value="twin">Twin Smudges</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator className="my-6" />

      {mode === "swatch" && <SwatchRound />}
      {mode === "wheel" && <WheelRound />}
      {mode === "twin" && <TwinRound />}
    </div>
  );
}

function SwatchRound() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Smudge />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick a swatch</CardTitle>
          <CardDescription>The closest hue scores the round.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Pick ${c}`}
              className="aspect-square rounded-md border border-border transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: c }}
              disabled
            />
          ))}
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

function Smudge({ variant = "single" }: { variant?: "single" | "left" | "right" }) {
  const text =
    variant === "right"
      ? "There were doors all round the hall, but they were all locked; and when Alice had been all the way down one side and up the other, trying every door, she walked sadly down the middle, wondering how she was ever to get out again."
      : "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.";
  return (
    <Card className="bg-card/60">
      <CardHeader className="pb-2">
        <CardDescription className="text-[10px] uppercase tracking-wider">
          smudge {variant !== "single" && `· ${variant}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-serif text-lg leading-relaxed text-ink-deep">{text}</p>
      </CardContent>
    </Card>
  );
}
