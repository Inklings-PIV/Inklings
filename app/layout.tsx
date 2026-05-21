import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <Providers>
          <SiteNav />
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
