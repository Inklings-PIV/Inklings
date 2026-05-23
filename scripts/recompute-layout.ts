import "./_load-env";
import { inngest } from "../lib/inngest/client";

async function main() {
  const byHue = process.argv.includes("--by-hue");
  const eventName = byHue
    ? ("corpus/layout.recompute-by-hue" as const)
    : ("corpus/layout.recompute" as const);

  const result = await inngest.send({ name: eventName, data: {} });
  process.stdout.write(`OK  triggered ${byHue ? "by-hue" : "classical"} layout recompute\n`);
  process.stdout.write(`    event ids: ${JSON.stringify(result.ids)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
