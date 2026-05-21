"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/Inklings-PIV/Inklings";

const TABS = [
  { href: "/inkwell", label: "Inkwell" },
  { href: "/blots", label: "Blots" },
  { href: "/game", label: "Blotting Game" },
  { href: "/quill", label: "Quill" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Brand />
        <nav className="flex items-center gap-1">
          <ul className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <li key={t.href}>
                <TabLink href={t.href} label={t.label} active={isActive(pathname, t.href)} />
              </li>
            ))}
          </ul>
          <GithubLink />
          {onHome && <CtaButton href="/inkwell" label="Enter the Inkwell" />}
        </nav>
      </div>
    </header>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" aria-label="Inklings home" className="group flex items-center gap-2.5">
      <Image
        src="/inkling-mascot-no-background.png"
        alt=""
        width={32}
        height={32}
        loading="eager"
        fetchPriority="high"
        className="-rotate-6 drop-shadow-sm transition-transform group-hover:rotate-0"
      />
      <span className="font-serif text-xl tracking-tight text-ink-deep">Inklings</span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        authors in shape &amp; hue
      </span>
    </Link>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="font-medium">The {label}</span>
      {active && (
        <span aria-hidden="true" className="absolute right-3 -bottom-px left-3 h-px bg-ink-bleed" />
      )}
    </Link>
  );
}

function GithubLink() {
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Inklings on GitHub"
      className="ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <GithubIcon />
    </a>
  );
}

function CtaButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="ml-1 hidden items-center gap-1.5 rounded-md bg-ink-deep px-3 py-1.5 text-sm font-medium text-ink-paper transition-transform hover:-translate-y-px hover:bg-ink-bleed sm:inline-flex"
    >
      {label}
      <ArrowIcon />
    </Link>
  );
}

export function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.26 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.13 0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
