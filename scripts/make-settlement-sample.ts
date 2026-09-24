// Regenerates public/samples/settlement_sample.csv from the seeded database.
// Run right after `npm run db:reset`: node scripts/make-settlement-sample.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.DATABASE_URL && existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(readFileSync(join(root, "scripts", "settlement-sample.sql"), "utf8"));
  const lines = ["gateway_ref,amount_inr,status,settled_at", ...rows.map((r) => [r.gateway_ref, r.amount_inr, r.status, r.settled_at].join(","))];
  const out = join(root, "public", "samples", "settlement_sample.csv");
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`Wrote ${rows.length} rows to ${out}`);
} finally {
  await client.end();
}
