import type { Metadata, Viewport } from "next";
import { EB_Garamond, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
import { THEME_COOKIE } from "@/lib/theme/cookie";
import "./globals.css";

// Body / serif: EB Garamond — old-style, narrow, reads like a printed page.
// Display: Fraunces — modern serif with personality (variable, optical-size).
// next/font self-hosts both at build time and inlines the CSS via variables,
// so there's no FOUT and no third-party font request at runtime.
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif-loaded",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-loaded",
  axes: ["opsz", "SOFT"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Inklings — What color is Shakespeare?",
    template: "%s · Inklings",
  },
  description:
    "Inklings translates writing style into color, shape, and interaction. Explore literary identity through hue, play the daily Blotting Game, and watch your own prose shift in real time.",
  applicationName: "Inklings",
  keywords: [
    "stylometry",
    "information visualization",
    "literary analysis",
    "writing style",
    "data visualization",
    "color perception",
    "natural language processing",
    "digital humanities",
    "Shakespeare",
    "Project Gutenberg",
    "Next.js",
    "LMU",
    "PVI",
  ],
  authors: [
    { name: "Alperen Adatepe" },
    { name: "Jovana Dinic" },
    { name: "Nayun Gao" },
    { name: "Noel Huibers" },
    { name: "Yannick Martin" },
  ],
  creator: "Inklings Team — LMU PVI SoSe 2026",
  publisher: "LMU München · Praktikum Informationsvisualisierung",
  category: "education",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Inklings",
    title: "Inklings — What color is Shakespeare?",
    description:
      "A canvas of authors, in shape and in hue. Stylometry turned into color, shape, and play.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inklings — What color is Shakespeare?",
    description:
      "Writing style as color, shape, and interaction. Explore the Inkwell, play the Blotting Game, write in the Quill.",
  },
  robots: {
    index: true,
    follow: true,
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1830" },
  ],
  colorScheme: "light dark",
};

// Inline head script that resolves the dark-mode class before paint, for
// users whose cookie isn't set yet (the "system" default). When the cookie
// IS set, the server has already applied the class — this script then just
// re-asserts the same value, so it's idempotent and FOUC-free either way.
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);var t=m?m[1]:null;var d=document.documentElement;if(t==="dark"){d.classList.add("dark");}else if(t!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){d.classList.add("dark");}}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const jar = await cookies();
  const themeCookie = jar.get(THEME_COOKIE)?.value;
  // Only "dark" applies a class server-side. "light" or missing render
  // without the class; the inline script then upgrades to dark for
  // matching system preferences. Keeps SSR markup deterministic.
  const htmlClass = `${ebGaramond.variable} ${fraunces.variable}${
    themeCookie === "dark" ? " dark" : ""
  }`;
  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted inline shim, no user data */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <Providers>
          <SiteNav />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
