"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isModerator } from "@/lib/auth/moderator";
import { ensureScribe } from "@/lib/auth/scribe";
import { getDb, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

type SubmissionPayload = {
  gutenbergId: number;
  title: string;
  authorName: string | null;
  language: string | null;
};

async function requireModerator(): Promise<string> {
  const scribe = await ensureScribe();
  if (!isModerator(scribe.id)) {
    throw new Error("Not authorised — moderator only.");
  }
  return scribe.id;
}

/**
 * Approve a pending Gutenberg submission. Updates the contribution row
 * then fires the `corpus/book.ingest` Inngest event so the existing
 * pipeline (#9 — fetch + classical features + embedding + colour derive)
 * does the heavy lifting. Idempotent on the contribution side (re-running
 * just re-fires the event); duplicate ingestion is prevented by the
 * unique constraint on books.gutenbergId.
 */
export async function approveContribution(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing contribution id.");

  const moderatorId = await requireModerator();
  const db = getDb();

  const [row] = await db
    .update(schema.contributions)
    .set({
      status: "approved",
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
    })
    .where(eq(schema.contributions.id, id))
    .returning({
      payload: schema.contributions.payload,
      kind: schema.contributions.kind,
    });

  if (!row) throw new Error("Contribution not found.");
  if (row.kind !== "gutenberg_submission") {
    // Future kinds (text uploads, manual hue votes) get their own approval
    // path — for now there's only one and we'd rather fail loud than
    // silently approve something the ingest job can't handle.
    throw new Error(`Unsupported contribution kind: ${row.kind}`);
  }

  const payload = row.payload as SubmissionPayload | null;
  if (!payload?.gutenbergId) throw new Error("Submission has no gutenbergId.");

  await inngest.send({
    name: "corpus/book.ingest",
    data: { gutenbergId: payload.gutenbergId },
  });

  revalidatePath("/admin/moderate");
}

/**
 * Reject a pending submission. No ingestion fired; the row stays in the
 * table for audit and so the submitter sees the result in their dialog
 * history.
 */
export async function rejectContribution(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing contribution id.");

  const moderatorId = await requireModerator();
  const db = getDb();

  await db
    .update(schema.contributions)
    .set({
      status: "rejected",
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
    })
    .where(eq(schema.contributions.id, id));

  revalidatePath("/admin/moderate");
}
