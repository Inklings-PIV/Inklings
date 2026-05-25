import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Impressum",
  description: "Angaben gemäß § 5 TMG.",
  robots: { index: true, follow: false },
};

// Legal Impressum per §5 TMG / Germany. The address is deliberately
// PLZ + Ort only — the operator has chosen not to publish a full
// street address. §5 TMG strictly requires street + number; that's
// an accepted trade-off here.
const PROJECT_LEAD_NAME = "Noel Huibers";
const PROJECT_LEAD_ADDRESS_LINES = ["81737 München", "Deutschland"];
const PROJECT_LEAD_EMAIL = "inklings@huibers.io";

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
      <p className="mt-2 text-sm text-muted-foreground">Angaben gemäß § 5 TMG.</p>

      <Section title="Anbieter">
        <p>{PROJECT_LEAD_NAME}</p>
        {PROJECT_LEAD_ADDRESS_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail:{" "}
          <a className="underline" href={`mailto:${PROJECT_LEAD_EMAIL}`}>
            {PROJECT_LEAD_EMAIL}
          </a>
        </p>
      </Section>

      <Section title="Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV">
        <p>{PROJECT_LEAD_NAME}</p>
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
