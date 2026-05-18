import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

// Load in Next.js precedence order; first wins for each key.
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("DATABASE_URL is not set in .env.local\n");
    process.exit(1);
  }

  const sql = neon(url);

  try {
    const time = await sql`select now() as now`;
    process.stdout.write(`OK  connected at ${time[0]?.now}\n`);

    const ext = await sql`select extname, extversion from pg_extension where extname = 'vector'`;
    if (ext.length === 0) {
      process.stderr.write(
        "FAIL pgvector extension is NOT enabled.\n" +
          "     Fix: in the Neon SQL editor, run: CREATE EXTENSION IF NOT EXISTS vector;\n",
      );
      process.exit(2);
    }
    process.stdout.write(`OK  pgvector enabled (v${ext[0]?.extversion})\n`);

    const version = await sql`select version()`;
    process.stdout.write(`OK  ${version[0]?.version}\n`);

    const tables = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
        and table_name not like 'drizzle_%'
        and table_name not like '__drizzle_%'
      order by table_name
    `;
    const names = tables.map((t) => t.table_name).join(", ");
    process.stdout.write(`OK  ${tables.length} tables: ${names}\n`);
  } catch (err) {
    process.stderr.write(`FAIL connection error: ${(err as Error).message}\n`);
    process.exit(3);
  }
}

main();
