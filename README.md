# Kosha: fee collection and reconciliation

Kosha (Sanskrit/Kannada for "treasury") is a fee ledger for an Indian college. Accountants record
payments against each student's installments, online payments go through a mock gateway that can
succeed, fail or time out, and a daily settlement file from the gateway is reconciled against what
was recorded. Every rupee is traceable: the ledger is append-only, every change is one database
transaction, and every action lands in the audit log.

- **Live demo:** `https://kosha-fee-collection-and-reconcilia.vercel.app/`
- **Repository:** `[Ganavi D Gowda: add the repository URL]`
- **Documentation:** [`submission_deliverable.md`](submission_deliverable.md)

Built for Edumerge Solutions, Assignment 2: Fee Collection & Reconciliation.

## What it does

| Area | What you can do |
|---|---|
| Students | Search and filter 60 students by course and status (overdue, due, paid, advance) |
| Statement | Passbook with running balance, fee-head bars, installments, payments; reversed payments stay visible and link to their reversal |
| Payments | Record cash, UPI, card or bank transfer with an allocation preview; simulate the gateway (succeed, fail, time out); check status; mark failed; reverse (admin) |
| Concessions | Apply a concession to an installment (admin), capped at what is still owed |
| Receipts | Sequential receipt numbers (`KSH/2026-27/000123`), printable A5 receipt with the amount in words |
| Reconciliation | Upload a settlement CSV; rows land in four buckets (matched, amount mismatch, settled but pending here, missing in settlement); resolve each exception |
| Dashboard | Collected this term, outstanding, overdue, pending; 30-day trend; overdue by course; a needs-attention list |
| Audit log | Every money function writes a readable line: who, what, which record, why |

Roles are simulated (real login is out of scope): switch between **Admin**, **Accountant** and
**Student** in the top bar. The server enforces one permission matrix
([`lib/auth/permissions.ts`](lib/auth/permissions.ts)); the UI hides what a role can't do and the
API still answers 403.

## Five-minute demo

The seed tells a story; the **Demo guide** button in the top bar lists the same students.
Start as **Admin**.

1. **Dashboard** (`/`). Note the pending payments and the needs-attention list.
2. **Vikram Singh** (`BCOM26-001`, nothing paid, overdue). *Record payment* → the amount is
   prefilled with what is overdue and the preview says which installments it clears. Choose
   *Cash*, submit: the new passbook row flashes and the balance drops.
3. **Rohan Kulkarni** (`CSE24-001`, partly paid). *Record payment*, choose *UPI*, pick
   *Fail* in the demo control: the drawer stays open with the reason; nothing reaches the ledger.
4. **Sneha Iyer** (`BCA26-002`, UPI payment stuck in pending). Payments tab → row menu →
   *Check status*: the mock gateway confirms it and a receipt is issued.
5. **Reconciliation** (`/reconciliation`). *Download sample file*, then drop it back in. You get
   33 matched, 1 amount mismatch, 2 settled but pending here, 1 missing in settlement. *Mark as
   paid* the pending one; *Mark reviewed* the mismatch with a note.
6. **Arjun Mehta** (`CSE24-003`). His bank transfer was returned: the original row is struck
   through and linked to its reversal, and tuition is overdue again. Open the payment to see the
   state track, allocations and ledger entries.
7. **Priya Nair** (`CSE25-002`) has a merit concession; *Apply concession* on a term 2
   installment. **Karthik Reddy** (`BCOM25-002`) overpaid: the balance reads as an advance.
   **Ananya Rao** (`BCA25-001`) is fully paid: open a receipt and print it.
8. Switch to **Accountant** (no reverse, no concession) and **Student** (own statement only,
   online payments only). **Audit log** shows everything you just did.
9. Demo guide → *Reset demo data* to start over.

## Setup

Requirements: Node.js 22.18 or newer (the database scripts use Node's built-in TypeScript
support), a Supabase project (free tier is fine).

```bash
npm install
cp .env.example .env.local        # then fill in the four values below
npm run db:setup                  # creates tables, functions and demo data, then verifies the ledger
npm run dev                       # http://localhost:3000
```

`.env.local`:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project settings → Data API (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project settings → API keys → publishable (or legacy anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → secret (or legacy service_role) key. **Server-side only.** |
| `DATABASE_URL` | *Connect* → connection string (direct or session pooler, port 5432). URL-encode special characters in the password (`@` → `%40`, `%` → `%25`). Used only by scripts. |

`npm run db:reset` drops only Kosha's own tables, views and functions (never the whole `public`
schema) and reapplies everything. The same reset is available in the app for admins.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` | All Vitest tests: unit, plus integration against the database (skipped if `.env.local` is missing) |
| `npm run test:unit` / `test:integration` | One suite only |
| `npm run db:setup` / `db:reset` / `db:verify` | Apply migrations / drop and reapply / run [`scripts/verify-ledger.sql`](scripts/verify-ledger.sql) |
| `npm run db:sample` | Regenerate `public/samples/settlement_sample.csv` from freshly seeded data |

## Tests

- **Unit** (`tests/unit`, 143 tests): payment state machine (every legal and illegal transition,
  and a check that the TypeScript table matches the SQL one), reconciliation bucketing (duplicates,
  bad rows, amount formats, the settlement window, CSV edge cases), `toPaise`/`formatINR`/amount in
  words, allocation preview, statement builder, permission matrix, dates, error mapping.
- **Integration** (`tests/integration`, 13 tests, real database): same idempotency key twice (and
  three times in parallel) creates one payment; timeout then confirm writes exactly one ledger entry;
  two confirms racing post one entry; reversing reopens the installment; a concession above what is
  owed is rejected; six parallel payments on one student allocate correctly; the API role cannot
  write the ledger directly; `verify-ledger.sql` passes afterwards.
- **Ledger verification** (`npm run db:verify`): nine invariants, including balance = SUM(ledger)
  for every student, allocations never exceed demand, and the ledger rejecting UPDATE and DELETE.

## How it is built

Next.js 15 (App Router) + TypeScript (strict) + Tailwind + shadcn-style components on Radix +
Supabase Postgres, deployed on Vercel.

- **Money is integer paise** everywhere (`BIGINT` in Postgres, `number` in TypeScript), formatted
  only at the edge.
- **The database is the source of truth for money rules.** Each money-changing operation is one
  plpgsql function called through `supabase.rpc`, so it runs in one transaction and locks the
  student row. Constraints and triggers make the ledger and allocations append-only and reject
  illegal payment transitions even if someone bypasses the API. The service role can read tables
  and execute those functions, nothing else.
- **Validation twice:** zod at every API route, constraints and function checks in the database.
- **Reconciliation matching is a pure TypeScript function** ([`lib/domain/reconcile.ts`](lib/domain/reconcile.ts)); persisting runs and resolving items go through SQL functions.

```
app/
  (app)/                 pages: dashboard, students, statement, payments, receipt, reconciliation, audit
  api/                   route handlers (zod validation, role checks, one error shape)
components/              ui primitives, shell, statement, payments, reconciliation, dashboard
lib/
  domain/                pure logic: payment-state, reconcile, allocation, statement, audit-text
  data/                  queries (server only), rpc wrapper
  auth/                  permission matrix, role cookie, page guards
  money.ts, dates.ts     paise formatting and parsing, IST dates
supabase/migrations/     001_schema.sql, 002_functions.sql, 003_seed.sql
scripts/                 db-setup, verify-ledger.sql, sample CSV
tests/                   unit, integration
docs/                    assets and generated screenshots
submission_deliverable.md final assignment write-up
```

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel (framework preset: Next.js; build command
   `npm run build`; no other settings needed).
2. In *Project settings → Environment variables* add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for Production and Preview.
   `DATABASE_URL` is not needed on Vercel; it is only used by the local scripts.
3. Run `npm run db:setup` once from your machine against the same Supabase project, then deploy.
4. Suggested region: `bom1` (Mumbai), close to an `ap-south-1` Supabase project.

The service role key is read only in server code (`lib/env.ts` throws if called in the browser).
Anyone with the demo link can reset the demo data as Admin; that is intended for a demo and is
listed under future work.

## Scope

Out of scope, and listed as future work in the documentation: a real payment gateway, real
authentication and per-user row-level security, late fees, a fee-structure editor, multiple
institutions, email/SMS, partial refunds.

## AI usage

This project was built with an AI coding assistant. Every time its output was wrong, the mistake,
how it was found and how it was fixed is recorded in [`LOG.md`](LOG.md).
