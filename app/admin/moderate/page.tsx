import { desc, eq } from "drizzle-orm";
import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isModerator } from "@/lib/auth/moderator";
import { ensureScribe } from "@/lib/auth/scribe";
import { getDb, schema } from "@/lib/db";
import { approveContribution, rejectContribution } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Moderate · Inklings",
  robots: { index: false, follow: false },
};

type SubmissionPayload = {
  gutenbergId: number;
  title: string;
  authorName: string | null;
  language: string | null;
};

type PendingRow = {
  id: string;
  scribeToken: string;
  scribeEmail: string | null;
  createdAt: Date;
  payload: SubmissionPayload | null;
};

async function fetchPending(): Promise<PendingRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.contributions.id,
      scribeToken: schema.scribes.token,
      scribeEmail: schema.scribes.email,
      createdAt: schema.contributions.createdAt,
      payload: schema.contributions.payload,
    })
    .from(schema.contributions)
    .innerJoin(schema.scribes, eq(schema.contributions.scribeId, schema.scribes.id))
    .where(eq(schema.contributions.status, "pending"))
    .orderBy(desc(schema.contributions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    scribeToken: r.scribeToken,
    scribeEmail: r.scribeEmail,
    createdAt: r.createdAt,
    payload: r.payload as SubmissionPayload | null,
  }));
}

export default async function ModeratePage() {
  const scribe = await ensureScribe();

  if (!isModerator(scribe.id)) {
    return <NotAuthorised scribeId={scribe.id} />;
  }

  const pending = await fetchPending();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-display text-3xl tracking-tight text-ink-deep">Moderate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pending.length} pending {pending.length === 1 ? "submission" : "submissions"}. Approving
          fires the ingest job; rejecting leaves the row for the submitter to see.
        </p>
      </header>

      <ul className="mt-6 flex flex-col gap-3">
        {pending.length === 0 ? (
          <li>
            <Card>
              <CardContent className="py-10 text-center text-sm italic text-muted-foreground">
                Nothing pending. The queue is clear.
              </CardContent>
            </Card>
          </li>
        ) : (
          pending.map((row) => <SubmissionCard key={row.id} row={row} />)
        )}
      </ul>
    </div>
  );
}

function SubmissionCard({ row }: { row: PendingRow }) {
  const p = row.payload;
  const gutenbergUrl = p ? `https://www.gutenberg.org/ebooks/${p.gutenbergId}` : null;

  return (
    <li>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-display text-xl">
            {p?.title ?? <span className="italic text-muted-foreground">(missing title)</span>}
            {p?.gutenbergId && gutenbergUrl && (
              <a
                href={gutenbergUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs font-normal text-muted-foreground underline hover:text-ink-deep"
              >
                #{p.gutenbergId}
              </a>
            )}
          </CardTitle>
          {p?.authorName && <p className="text-sm italic text-ink-bleed">{p.authorName}</p>}
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <dt>Submitted</dt>
            <dd className="tabular-nums">
              {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </dd>
            <dt>Scribe</dt>
            <dd className="truncate font-mono">
              {row.scribeEmail ?? `${row.scribeToken.slice(0, 8)}…`}
            </dd>
            <dt>Language</dt>
            <dd>{p?.language ?? "—"}</dd>
          </dl>
          <div className="flex gap-2">
            <form action={rejectContribution}>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" size="sm" variant="outline">
                <X className="size-4" /> Reject
              </Button>
            </form>
            <form action={approveContribution}>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" size="sm">
                <Check className="size-4" /> Approve & ingest
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function NotAuthorised({ scribeId }: { scribeId: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl tracking-tight text-ink-deep">Not authorised</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        /admin/moderate is locked to moderators. If you should have access, add your scribe id to{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">MODERATOR_SCRIBE_IDS</code> in{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code> and restart the dev
        server.
      </p>
      <div className="mt-6 rounded-md border border-border bg-card/40 p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">your scribe id</p>
        <code className="mt-1 block break-all font-mono text-xs text-ink-deep">{scribeId}</code>
      </div>
    </div>
  );
}
