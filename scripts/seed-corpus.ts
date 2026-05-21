import "./_load-env";
import { SEED_BOOKS } from "../lib/ingestion/seed-list";
import { inngest } from "../lib/inngest/client";

async function main() {
  const events = SEED_BOOKS.map((b) => ({
    name: "corpus/book.ingest" as const,
    data: { gutenbergId: b.gutenbergId },
  }));

  const result = await inngest.send(events);

  process.stdout.write(`OK  enqueued ${SEED_BOOKS.length} books for ingestion\n\n`);
  for (const b of SEED_BOOKS) {
    process.stdout.write(
      `    #${String(b.gutenbergId).padStart(5)}  ${b.title.padEnd(48)}  ${b.author}\n`,
    );
  }
  process.stdout.write(`\n    ${result.ids.length} event ids returned by Inngest\n`);
  process.stdout.write(
    "\nThe Inngest dev server will work through them (concurrency limit = 2).\n",
  );
  process.stdout.write("When the queue drains, run `pnpm recompute:layout`.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
