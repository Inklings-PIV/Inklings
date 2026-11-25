import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { OPERATOR } from "@/lib/operator";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Angaben gemäß § 5 DDG.",
  robots: { index: true, follow: false },
};

export default function ImpressumPage() {
  return (
    <>
      <ImpressumBody />
      <SiteFooter />
    </>
  );
}

function ImpressumBody() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl tracking-tight text-ink-deep sm:text-4xl">Impressum</h1>
      <p className="mt-2 text-sm text-muted-foreground">Angaben gemäß § 5 DDG.</p>

      <Section title="Anbieter">
        <p>{OPERATOR.name}</p>
        {OPERATOR.addressLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Section>

      <Section title="Kontakt">
        <p>
          Telefon:{" "}
          <a className="underline" href={OPERATOR.phoneHref}>
            {OPERATOR.phone}
          </a>
        </p>
        <p>
          E-Mail:{" "}
          <a className="underline" href={`mailto:${OPERATOR.email}`}>
            {OPERATOR.email}
          </a>
        </p>
      </Section>

      <Section title="Inhaltlich verantwortlich nach § 18 Abs. 2 MStV">
        <p>{OPERATOR.name}</p>
        <p>(Adresse wie oben.)</p>
      </Section>

      <Section title="Hintergrund">
        <p>
          Inklings ist ein studentisches Forschungsprojekt im Rahmen des Praktikums
          Informationsvisualisierung (PVI) an der LMU München, Sommersemester 2026.
        </p>
        <p>
          Beteiligte Studierende: Alperen Adatepe, Jovana Dinic, Nayun Gao, Noel Huibers, Yannick
          Martin.
        </p>
      </Section>

      <Section title="Haftungsausschluss">
        <p>
          Die Inhalte dieser Seiten wurden mit größtmöglicher Sorgfalt erstellt. Für die
          Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr
          übernehmen.
        </p>
        <p>
          Die im Korpus dargestellten literarischen Werke stammen aus dem Project Gutenberg
          (gutenberg.org); die zugehörigen Texte stehen dort gemeinfrei oder unter klar
          ausgewiesenen Lizenzen zur Verfügung.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg text-ink-deep">{title}</h2>
      <div className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
