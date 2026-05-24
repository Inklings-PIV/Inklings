// Nightly Inngest cron — aggregates `colour_votes` into the crowd source
// per book, then re-derives the blended row so the canvas reflects the
// latest crowd weight. Mirrors `scripts/derive-crowd-colours.ts` for the
// prod path; the script is the local-dev fallback.

import { inArray } from "drizzle-orm";
import { blendColours, type SourceInput } from "@/lib/colour/blend";
import { aggregateCrowdColour, type CrowdVote } from "@/lib/colour/crowd";
import { getDb, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";

export const recomputeCrowdColour = inngest.createFunction(
  {
    id: "recompute-crowd-colour",
    triggers: [{ event: "corpus/colour.recompute-crowd" }, { cron: "45 2 * * *" }],
    concurrency: { limit: 1, key: "crowd-colour" },
    retries: 2,
  },
  async ({ step }) => {
    const aggregated = await step.run("aggregate-votes", async () => {
      const db = getDb();
      const votes = await db
        .select({
          bookId: schema.colourVotes.bookId,
          hue: schema.colourVotes.hue,
          saturation: schema.colourVotes.saturation,
          lightness: schema.colourVotes.lightness,
        })
        .from(schema.colourVotes);

      const byBook = new Map<string, CrowdVote[]>();
      for (const v of votes) {
        const list = byBook.get(v.bookId) ?? [];
        list.push({ hue: v.hue, saturation: v.saturation, lightness: v.lightness });
        byBook.set(v.bookId, list);
      }

      const out: Array<{
        bookId: string;
        hue: number;
        saturation: number;
        lightness: number;
        justification: string;
      }> = [];
      for (const [bookId, perBookVotes] of byBook) {
        const crowd = aggregateCrowdColour(perBookVotes);
        if (crowd) out.push({ bookId, ...crowd });
      }
      return out;
    });

    if (aggregated.length === 0) {
      return { wroteCrowd: 0, reBlended: 0, note: "no eligible books" };
    }

    await step.run("save-crowd-colours", async () => {
      const db = getDb();
      for (const c of aggregated) {
        await db
          .insert(schema.bookColours)
          .values({
            bookId: c.bookId,
            source: "crowd",
            hue: c.hue,
            saturation: c.saturation,
            lightness: c.lightness,
            justification: c.justification,
          })
          .onConflictDoUpdate({
            target: [schema.bookColours.bookId, schema.bookColours.source],
            set: {
              hue: c.hue,
              saturation: c.saturation,
              lightness: c.lightness,
              justification: c.justification,
              computedAt: new Date(),
            },
          });
      }
    });

    const reBlended = await step.run("re-blend-affected", async () => {
      const db = getDb();
      const affectedIds = aggregated.map((a) => a.bookId);
      const sourceRows = await db
        .select({
          bookId: schema.bookColours.bookId,
          source: schema.bookColours.source,
          hue: schema.bookColours.hue,
          saturation: schema.bookColours.saturation,
          lightness: schema.bookColours.lightness,
        })
        .from(schema.bookColours)
        .where(inArray(schema.bookColours.bookId, affectedIds));

      type PerBook = {
        algorithmic?: SourceInput;
        llm?: SourceInput;
        crowd?: SourceInput;
      };
      const perBook = new Map<string, PerBook>();
      for (const r of sourceRows) {
        if (r.source === "blended") continue;
        const entry = perBook.get(r.bookId) ?? {};
        if (r.source === "algorithmic" || r.source === "llm" || r.source === "crowd") {
          entry[r.source] = { hue: r.hue, saturation: r.saturation, lightness: r.lightness };
        }
        perBook.set(r.bookId, entry);
      }

      let count = 0;
      for (const [bookId, sources] of perBook) {
        const blended = blendColours(sources);
        if (!blended) continue;
        await db
          .insert(schema.bookColours)
          .values({
            bookId,
            source: "blended",
            hue: blended.hue,
            saturation: blended.saturation,
            lightness: blended.lightness,
            justification: blended.justification,
          })
          .onConflictDoUpdate({
            target: [schema.bookColours.bookId, schema.bookColours.source],
            set: {
              hue: blended.hue,
              saturation: blended.saturation,
              lightness: blended.lightness,
              justification: blended.justification,
              computedAt: new Date(),
            },
          });
        count++;
      }
      return count;
    });

    return { wroteCrowd: aggregated.length, reBlended };
  },
);
