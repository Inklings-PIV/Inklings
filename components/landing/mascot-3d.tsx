"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MascotProps = {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  eager?: boolean;
  maxTilt?: number;
};

export function Mascot3D({ src, alt, size = 420, className, eager, maxTilt = 22 }: MascotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [hover, setHover] = useState(false);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -y * maxTilt, ry: x * maxTilt });
  };

  const onEnter = () => setHover(true);
  const onLeave = () => {
    setHover(false);
    setTilt({ rx: 0, ry: 0 });
  };

  const rx = tilt.rx.toFixed(2);
  const ry = tilt.ry.toFixed(2);
  const sx = (50 + tilt.ry * 1.6).toFixed(2);
  const sy = (50 - tilt.rx * 1.6).toFixed(2);
  const shX = (tilt.ry * -1.2).toFixed(2);
  const shY = (tilt.rx * 1.2 + 30).toFixed(2);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: purely decorative tilt; keyboard users get the same static mascot.
    <div
      ref={ref}
      className={cn(
        "group relative cursor-grab [perspective:1200px] active:cursor-grabbing",
        className,
      )}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="inklings-float [transform-style:preserve-3d]">
        <div
          className="transition-transform duration-300 ease-out [transform-style:preserve-3d] will-change-transform"
          style={{
            transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${hover ? 1.05 : 1})`,
            filter: `drop-shadow(${shX}px ${shY}px 50px rgba(70,30,160,0.32))`,
          }}
        >
          <Image
            src={src}
            alt={alt}
            width={size}
            height={size}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            draggable={false}
            className="pointer-events-none relative block select-none"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[10%] rounded-full transition-opacity duration-300 [transform:translateZ(40px)]"
            style={{
              background: `radial-gradient(circle at ${sx}% ${sy}%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%)`,
              opacity: hover ? 0.75 : 0.25,
              mixBlendMode: "screen",
            }}
          />
        </div>
      </div>
    </div>
  );
}
