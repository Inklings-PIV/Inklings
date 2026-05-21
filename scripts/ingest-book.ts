import "./_load-env";
import { inngest } from "../lib/inngest/client";

async function main() {
  const raw = process.argv[2];
  const gutenbergId = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) {
    process.stderr.write("Usage: pnpm ingest:book <gutenbergId>\n");
    process.exit(1);
  }

  const result = await inngest.send({
    name: "corpus/book.ingest",
    data: { gutenbergId },
  });

  process.stdout.write(`OK  enqueued ingest for Gutenberg #${gutenbergId}\n`);
  process.stdout.write(`    event ids: ${JSON.stringify(result.ids)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
