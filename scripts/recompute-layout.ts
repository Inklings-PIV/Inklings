import "./_load-env";
import { inngest } from "../lib/inngest/client";

async function main() {
  const result = await inngest.send({
    name: "corpus/layout.recompute",
    data: { mode: "classical" },
  });
  process.stdout.write("OK  triggered classical layout recompute\n");
  process.stdout.write(`    event ids: ${JSON.stringify(result.ids)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
