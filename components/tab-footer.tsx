import Link from "next/link";
import { GITHUB_URL, GithubIcon } from "@/components/site-nav";

// Minimal one-line footer for the tab surfaces. Sits below the page content;
// on full-viewport pages like /inkwell the canvas fills the screen first so
// this only surfaces when the visitor scrolls past it. The rich SiteFooter
// lives on the landing + legal pages where navigation matters.
export function TabFooter() {
  return (
    <footer className="border-t border-border/60 bg-background/60">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-muted-foreground sm:px-6">
        <span>© {new Date().getFullYear()} Inklings</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/" className="hover:text-ink-deep">
            Home
          </Link>
          <Link href="/impressum" className="hover:text-ink-deep">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-ink-deep">
            Datenschutz
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-ink-deep"
          >
            <GithubIcon /> GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
