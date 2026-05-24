import Image from "next/image";
import Link from "next/link";
import { Blot } from "@/components/landing/blot";
import { GITHUB_URL, GithubIcon } from "@/components/site-nav";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="pointer-events-none absolute -right-24 -bottom-24 -z-10 opacity-40">
        <Blot color="oklch(0.55 0.2 290)" size={420} shape={1} />
      </div>
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/inkling-mascot-no-background.png"
              alt=""
              width={36}
              height={36}
              className="inklings-float"
            />
            <span className="font-serif text-xl text-ink-deep">Inklings</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-5 text-sm">
            <Link href="/inkwell" className="text-ink-deep hover:text-ink-bleed">
              The Inkwell
            </Link>
            <Link href="/blots" className="text-ink-deep hover:text-ink-bleed">
              The Blots
            </Link>
            <Link href="/game" className="text-ink-deep hover:text-ink-bleed">
              The Blotting Game
            </Link>
            <Link href="/quill" className="text-ink-deep hover:text-ink-bleed">
              The Quill
            </Link>
          </nav>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm text-ink-deep hover:text-ink-bleed md:ml-auto"
          >
            <GithubIcon /> Inklings-PIV/Inklings
          </a>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <div>
            © {new Date().getFullYear()} Inklings · Adatepe · Dinic · Gao · Huibers · Martin · A
            stylometric atlas translating writing style into colour, shape, and play.
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/impressum" className="hover:text-ink-deep">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-ink-deep">
              Datenschutz
            </Link>
            <span className="font-serif italic">What color is Shakespeare?</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
