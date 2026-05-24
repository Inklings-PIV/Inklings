// One-shot crowd-colour backfill — reads colour_votes, aggregates per book,
// writes a `book_colours` row with source='crowd' for every book above the
// minimum-vote threshold. Then re-derives `blended` for the same books so
// the blender immediately reflects the new third source.
//
// Usage:
//   pnpm derive:crowd              dev
//   pnpm derive:crowd:prod         prod

import "./_load-env";
import { inArray } from "drizzle-orm";
import { blendColours, type SourceInput } from "../lib/colour/blend";
import { aggregateCrowdColour, type CrowdVote } from "../lib/colour/crowd";
import { getDb, schema } from "../lib/db";

async function main() {
  const db = getDb();

  // Pull every vote and group by bookId in memory — 35-book corpus + a
  // few hundred votes is trivial to handle client-side.
  const votes = await db
    .select({
      bookId: schema.colourVotes.bookId,
      hue: schema.colourVotes.hue,
      saturation: schema.colourVotes.saturation,
      lightness: schema.colourVotes.lightness,
    })
    .from(schema.colourVotes);

  if (votes.length === 0) {
    process.stdout.write("OK  no colour_votes yet — play some rounds on /game first\n");
    return;
  }

  const byBook = new Map<string, CrowdVote[]>();
  for (const v of votes) {
    const list = byBook.get(v.bookId) ?? [];
    list.push({ hue: v.hue, saturation: v.saturation, lightness: v.lightness });
    byBook.set(v.bookId, list);
  }

  let crowdOk = 0;
  let crowdSkipped = 0;
  const affectedBookIds: string[] = [];
  for (const [bookId, perBookVotes] of byBook) {
    const crowd = aggregateCrowdColour(perBookVotes);
    if (!crowd) {
      crowdSkipped++;
      continue;
    }
    await db
      .insert(schema.bookColours)
      .values({
        bookId,
        source: "crowd",
        hue: crowd.hue,
        saturation: crowd.saturation,
        lightness: crowd.lightness,
        justification: crowd.justification,
      })
      .onConflictDoUpdate({
        target: [schema.bookColours.bookId, schema.bookColours.source],
        set: {
          hue: crowd.hue,
          saturation: crowd.saturation,
          lightness: crowd.lightness,
          justification: crowd.justification,
          computedAt: new Date(),
        },
      });
    crowdOk++;
    affectedBookIds.push(bookId);
  }

  process.stdout.write(
    `OK  wrote ${crowdOk} crowd colours (skipped ${crowdSkipped} — under the vote threshold)\n`,
  );

  if (affectedBookIds.length === 0) return;

  // Re-derive blended for every book whose crowd row just landed. Pull all
  // per-source rows for those books, group, blend, upsert.
  const sourceRows = await db
    .select({
      bookId: schema.bookColours.bookId,
      source: schema.bookColours.source,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.bookColours)
    .where(inArray(schema.bookColours.bookId, affectedBookIds));

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

  let blendedOk = 0;
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
    blendedOk++;
  }

  process.stdout.write(`OK  re-blended ${blendedOk} books with the new crowd weight\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
