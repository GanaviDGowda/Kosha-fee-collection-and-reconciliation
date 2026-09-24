// Database setup for Kosha. Runs with Node's built-in TypeScript support (Node 22.18+).
//
//   npm run db:setup   apply 001, 002, 003 to an empty database
//   npm run db:reset   drop Kosha's objects, then apply 001, 002, 003
//   npm run db:verify  run scripts/verify-ledger.sql
//
// Reads DATABASE_URL from .env.local (or the environment). Each command runs in a single
// transaction, so a failure leaves the database as it was.
//
// reset only drops the objects Kosha owns (listed below), never the whole public schema,
// so anything else in the same Supabase project is left alone.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = ["001_schema.sql", "002_functions.sql", "003_seed.sql"].map((f) =>
  join(root, "supabase", "migrations", f),
);

const KOSHA_VIEWS = ["v_student_balances", "v_installment_status"];
const KOSHA_TABLES = [
  "reconciliation_items",
  "reconciliation_runs",
  "audit_log",
  "ledger_entries",
  "payment_allocations",
  "payment_events",
  "mock_gateway_txns",
  "payments",
  "payment_transitions",
  "concessions",
  "installments",
  "fee_heads",
  "students",
  "courses",
];
const KOSHA_SEQUENCES = ["receipt_seq", "gateway_ref_seq"];
const KOSHA_FUNCTIONS = [
  "kosha_now", "kosha_today", "forbid_mutation", "guard_payment_update",
  "_fail", "_check_actor", "_audit", "_payment_event", "_lock_student", "_lock_payment",
  "_academic_year", "_installment_remaining", "_allocate_credit", "_mark_success",
  "record_payment", "confirm_payment", "fail_payment", "reverse_payment", "apply_concession",
  "create_recon_run", "resolve_recon_item", "reset_demo",
  "_seed_clock", "_ist", "_seed_term_due", "_seed_pay", "seed_demo",
];

function loadEnv(): string {
  const envFile = join(root, ".env.local");
  if (!process.env.DATABASE_URL && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("your-project-ref") || url.includes("your-password")) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Supabase connection string.");
    process.exit(1);
  }
  return url;
}

function dropSql(): string {
  const names = KOSHA_FUNCTIONS.map((f) => `'${f}'`).join(", ");
  return `
    drop view if exists ${KOSHA_VIEWS.join(", ")} cascade;
    drop table if exists ${KOSHA_TABLES.join(", ")} cascade;
    drop sequence if exists ${KOSHA_SEQUENCES.join(", ")} cascade;
    do $$
    declare f record;
    begin
      for f in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (${names})
      loop
        execute 'drop function if exists ' || f.sig || ' cascade';
      end loop;
    end;
    $$;
  `;
}

async function main() {
  const command = process.argv[2];
  if (!command || !["setup", "reset", "verify"].includes(command)) {
    console.error("Usage: node scripts/db-setup.ts <setup|reset|verify>");
    process.exit(1);
  }

  const connectionString = loadEnv();
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const client = new pg.Client({
    connectionString,
    // Supabase requires TLS. Its pooler certificate is not in Node's default CA store,
    // so certificate verification is skipped for this admin script only.
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  client.on("notice", (msg) => console.log(`  ${msg.message}`));

  await client.connect();
  const started = Date.now();
  try {
    await client.query("begin");
    await client.query("set local client_min_messages = notice");

    if (command === "reset") {
      console.log("Dropping Kosha objects...");
      await client.query("set local client_min_messages = warning");
      await client.query(dropSql());
      await client.query("set local client_min_messages = notice");
    }

    if (command === "setup" || command === "reset") {
      for (const file of migrations) {
        console.log(`Applying ${file.split(/[\\/]/).pop()}...`);
        await client.query(readFileSync(file, "utf8"));
      }
    }

    console.log("Verifying ledger...");
    const results = await client.query(readFileSync(join(root, "scripts", "verify-ledger.sql"), "utf8"));
    const last = Array.isArray(results) ? results[results.length - 1] : results;
    if (last?.rows?.length) console.table(last.rows);

    await client.query("commit");
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    const e = err as { message?: string; hint?: string; where?: string; position?: string };
    console.error(`\nFailed, rolled back: ${e.message}`);
    if (e.hint) console.error(`  hint: ${e.hint}`);
    if (e.where) console.error(`  where: ${e.where}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
