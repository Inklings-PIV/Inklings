"use client";

import { CheckCircle2, Clock, Loader2, Sparkles, XCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  listMySubmissions,
  type MySubmission,
  submitGutenbergId,
} from "@/app/(tabs)/blots/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Opens from the /blots toolbar. Validates the Gutenberg ID server-side
 * (real PG fetch + dup-check + language gate), writes a `contributions`
 * row with status='pending', and surfaces the scribe's recent submissions
 * underneath so they can see what's queued. Approval flips through the
 * moderation queue (#12); ingestion runs after that.
 */
export function SubmitGutenbergDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<MySubmission[] | null>(null);
  const [historyLoading, startHistory] = useTransition();

  // Lazy-load the scribe's history the first time the dialog is opened.
  // Re-load after every successful submit so the new pending entry shows.
  useEffect(() => {
    if (!open) return;
    startHistory(async () => {
      const rows = await listMySubmissions();
      setSubmissions(rows);
    });
  }, [open]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a positive integer — the number from the PG URL.");
      return;
    }
    startSubmit(async () => {
      const result = await submitGutenbergId({ gutenbergId: parsed });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      toast.success(`Queued: "${result.title}"`, {
        description: result.authorName
          ? `by ${result.authorName} — an admin will review soon.`
          : "An admin will review soon.",
      });
      setValue("");
      // Reload history so the new pending row appears in the list below.
      startHistory(async () => {
        const rows = await listMySubmissions();
        setSubmissions(rows);
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Sparkles className="size-4" /> Submit a Gutenberg ID
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Submit a Gutenberg ID</DialogTitle>
          <DialogDescription>
            Paste the number from a{" "}
            <a
              href="https://www.gutenberg.org/"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-ink-deep"
            >
              gutenberg.org
            </a>{" "}
            URL — e.g. <code className="rounded bg-muted px-1 py-0.5 text-xs">1342</code> for{" "}
            <em>Pride and Prejudice</em>. An admin reviews before it joins the corpus.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Gutenberg ID
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="1342"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none disabled:opacity-50"
            />
          </label>
          {error && <p className="text-xs italic text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || value.trim().length === 0}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Queue it
            </Button>
          </DialogFooter>
        </form>

        <SubmissionsList submissions={submissions} loading={historyLoading} />
      </DialogContent>
    </Dialog>
  );
}

function SubmissionsList({
  submissions,
  loading,
}: {
  submissions: MySubmission[] | null;
  loading: boolean;
}) {
  if (loading && submissions === null) {
    return (
      <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
        Loading your submissions…
      </p>
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <p className="border-t border-border pt-3 text-xs italic text-muted-foreground">
        You haven't submitted anything yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Your recent submissions
      </h3>
      <ul className="flex flex-col gap-1.5">
        {submissions.map((s) => (
          <li key={s.contributionId} className="flex items-start gap-2 text-xs">
            <StatusIcon status={s.status} />
            <span className="min-w-0 flex-1">
              <span className="text-ink-deep">{s.title ?? `Gutenberg #${s.gutenbergId}`}</span>
              {s.authorName && <span className="text-muted-foreground"> — {s.authorName}</span>}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: MySubmission["status"] }) {
  if (status === "approved") {
    return (
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
    );
  }
  if (status === "rejected") {
    return <XCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
  return <Clock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
}
