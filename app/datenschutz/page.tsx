import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description:
    "Welche Daten Inklings verarbeitet, auf welcher Rechtsgrundlage, und an welche Auftragsverarbeiter sie übermittelt werden.",
  robots: { index: true, follow: false },
};

// Operator contact lives in /impressum; this file factually describes data flow
// based on what the codebase actually does today. If you wire a new third-party
// processor (Sentry, PostHog, Resend, Stripe, …), add it here in the same shape.
const CONTACT_EMAIL = "inklings@huibers.io";

const PROCESSORS: Array<{
  name: string;
  role: string;
  data: string;
  legal: string;
  hosting: string;
  url: string;
}> = [
  {
    name: "Vercel Inc.",
    role: "Hosting & CDN",
    data: "IP-Adresse, User-Agent, Request-Pfade (technische Logs)",
    legal: "Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am Betrieb der Anwendung)",
    hosting: "USA / Frankfurt-Region (fra1)",
    url: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Neon, Inc.",
    role: "Datenbank (PostgreSQL + pgvector)",
    data: "Sämtliche persistente Daten der Anwendung: Bücher, Stilometrie, Layout-Koordinaten, Farben, anonyme Scribe-IDs, Spiel-Sessions und Stimmen.",
    legal: "Art. 6 Abs. 1 lit. f DSGVO",
    hosting: "EU-Region (Frankfurt)",
    url: "https://neon.tech/privacy-policy",
  },
  {
    name: "Inngest, Inc.",
    role: "Orchestrierung von Hintergrund-Jobs",
    data: "Event-Payloads der Ingest-Pipeline (Buch-IDs, Gutenberg-Metadaten — keine personenbezogenen Daten).",
    legal: "Art. 6 Abs. 1 lit. f DSGVO",
    hosting: "USA",
    url: "https://www.inngest.com/privacy",
  },
  {
    name: "OpenAI, L.L.C.",
    role: "Embeddings (text-embedding-3-small) für Vibe-Suche, Modern-Layout und Quill-Bezugs-Daten",
    data: "Bei der Ingestion: Auszüge aus gemeinfreien Buchtexten. Bei Nutzung der Vibe-Suche auf /blots: die eingegebene Suchanfrage. Bei der Quill: der aktuell verfasste Text-Entwurf des Nutzers (nur als Eingabe für die Farb-Auslesung).",
    legal:
      "Art. 6 Abs. 1 lit. f DSGVO; bei Quill-Eingabe Art. 6 Abs. 1 lit. a (Einwilligung durch aktive Eingabe).",
    hosting: "USA. Laut OpenAI werden API-Inputs standardmäßig nicht zum Modelltraining verwendet.",
    url: "https://openai.com/policies/privacy-policy",
  },
  {
    name: "Anthropic, PBC",
    role: "LLM-Farbderivation und Quill-Auslesung (Claude Sonnet 4.6)",
    data: "Bei der LLM-Farbderivation: Titel, Autor und stilometrische Kennzahlen eines Buches (keine personenbezogenen Daten). Bei der Quill-Farb-Auslesung: der aktuell verfasste Text-Entwurf des Nutzers.",
    legal: "Art. 6 Abs. 1 lit. f DSGVO; bei Quill-Eingabe Art. 6 Abs. 1 lit. a.",
    hosting: "USA. Anthropic erklärt, API-Inputs werden nicht zum Modelltraining verwendet.",
    url: "https://www.anthropic.com/legal/privacy",
  },
  {
    name: "Project Gutenberg",
    role: "Quelle der gemeinfreien Texte",
    data: "Es werden Buchtexte und Metadaten abgerufen — keine Nutzerdaten übermittelt.",
    legal: "Art. 6 Abs. 1 lit. f DSGVO",
    hosting: "USA",
    url: "https://www.gutenberg.org/policy/privacy_policy.html",
  },
];

export default function DatenschutzPage() {
  return (
    <>
      <DatenschutzBody />
      <SiteFooter />
    </>
  );
}

function DatenschutzBody() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-display text-3xl tracking-tight text-ink-deep sm:text-4xl">
        Datenschutzerklärung
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Welche Daten Inklings verarbeitet, auf welcher Rechtsgrundlage, und an welche
        Auftragsverarbeiter sie übermittelt werden.
      </p>

      <Section title="1. Verantwortlicher">
        <p>
          Verantwortlich für die Datenverarbeitung auf dieser Website ist die im{" "}
          <Link href="/impressum" className="underline">
            Impressum
          </Link>{" "}
          genannte Person.
        </p>
        <p>
          Kontakt für Datenschutzanfragen:{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>

      <Section title="2. Erhobene und verarbeitete Daten">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Server-Logs / IP-Adressen:</strong> Beim Aufruf werden technische Metadaten
            (IP-Adresse, User-Agent, Request-Pfad, Zeitstempel) von unserem Hoster Vercel
            verarbeitet. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
          </li>
          <li>
            <strong>Scribe-Cookie (technisch notwendig):</strong> Beim ersten Besuch einer
            Anwendungs-Seite (<code className="rounded bg-muted px-1">/inkwell</code>,{" "}
            <code className="rounded bg-muted px-1">/blots</code>,{" "}
            <code className="rounded bg-muted px-1">/game</code>,{" "}
            <code className="rounded bg-muted px-1">/quill</code>) wird ein signiertes Cookie
            <code className="rounded bg-muted px-1">inklings_scribe</code> gesetzt. Es enthält eine
            zufällige UUID und keinerlei personenbezogene Daten. Es dient dazu, Spiel-Stimmen und
            Sitzungen anonym zuzuordnen. Da es technisch notwendig für die Funktion der Anwendung
            ist, ist keine gesonderte Einwilligung erforderlich (§ 25 Abs. 2 Nr. 2 TTDSG).
          </li>
          <li>
            <strong>Spiel-Stimmen (Blotting Game):</strong> Wenn Sie im Spiel eine Farbe wählen,
            speichern wir Ihre Auswahl zusammen mit der anonymen Scribe-ID. Es findet keine
            Verknüpfung mit Ihrer Identität statt.
          </li>
          <li>
            <strong>Eingaben in der Quill:</strong> Verfasste Texte werden derzeit ausschließlich im
            Browser gehalten. Beim Anfordern einer Farb-Auslesung wird der aktuelle Text an OpenAI
            bzw. Anthropic übermittelt (siehe Auftragsverarbeiter unten).
          </li>
        </ul>
      </Section>

      <Section title="3. Auftragsverarbeiter und Drittanbieter">
        <p className="mb-4">
          Wir setzen folgende Auftragsverarbeiter ein. Soweit eine Übermittlung in Drittländer
          (insbesondere die USA) stattfindet, beruht sie auf Standardvertragsklauseln (Art. 46
          DSGVO) bzw. dem EU–U.S. Data Privacy Framework, sofern die jeweiligen Anbieter
          zertifiziert sind.
        </p>
        <div className="space-y-4">
          {PROCESSORS.map((p) => (
            <div key={p.name} className="rounded-md border border-border bg-card/40 p-4">
              <h3 className="font-serif text-base text-ink-deep">{p.name}</h3>
              <p className="text-xs text-muted-foreground">{p.role}</p>
              <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt className="text-ink-deep">Daten</dt>
                <dd>{p.data}</dd>
                <dt className="text-ink-deep">Rechtsgrundlage</dt>
                <dd>{p.legal}</dd>
                <dt className="text-ink-deep">Standort</dt>
                <dd>{p.hosting}</dd>
                <dt className="text-ink-deep">Richtlinie</dt>
                <dd>
                  <a className="underline" href={p.url} target="_blank" rel="noreferrer noopener">
                    {p.url}
                  </a>
                </dd>
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section title="4. Speicherdauer">
        <p>
          Daten werden gelöscht, sobald der Zweck ihrer Verarbeitung entfällt. Anonyme Scribe-IDs
          und Spiel-Stimmen verbleiben unbegrenzt, da sie für die statistische Auswertung des Korpus
          benötigt werden. Server-Logs werden gemäß den Aufbewahrungsfristen von Vercel (in der
          Regel 30 Tage) gelöscht.
        </p>
      </Section>

      <Section title="5. Ihre Rechte">
        <p>Sie haben jederzeit das Recht auf:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Auskunft über Ihre verarbeiteten Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        </ul>
        <p>
          Um Ihre anonyme Scribe-Sitzung zu löschen, genügt es, das{" "}
          <code className="rounded bg-muted px-1">inklings_scribe</code>-Cookie in Ihrem Browser zu
          entfernen.
        </p>
        <p>
          Für sonstige Anfragen wenden Sie sich an{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="6. Beschwerderecht">
        <p>
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung
          Ihrer personenbezogenen Daten zu beschweren. Zuständig ist in der Regel die
          Aufsichtsbehörde Ihres üblichen Aufenthaltsorts.
        </p>
      </Section>

      <Section title="7. Änderungen dieser Erklärung">
        <p>
          Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn sich die zugrunde
          liegenden Verarbeitungstätigkeiten ändern. Die jeweils aktuelle Fassung ist hier
          einsehbar.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-lg text-ink-deep">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}
