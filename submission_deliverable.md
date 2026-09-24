# Assignment 2 — Fee Collection & Reconciliation
## Kosha: A Fee Ledger for Indian College Finance

**Candidate:** Ganavi D Gowda
**Submitted:** 25 September 2026
**Live Demo:** [Add Vercel URL]
**Repository:** [Add GitHub URL]

---

## Brief Explanation of Approach

### The Core Bet

The biggest risk in a fee collection system is not "what if a payment fails" — it's "what if we can't prove what happened." I made every architectural decision around **traceability and consistency**, not convenience.

Three decisions that the whole system rests on:

1. **The database owns the money rules.** Every rupee-changing operation is a single PostgreSQL function (`record_payment`, `confirm_payment`, `reverse_payment`, etc.) called via `supabase.rpc`. The function locks the student row, checks all rules, and commits atomically. The application layer cannot write directly to `ledger_entries` — a trigger blocks it. This means there is no race condition, no double allocation, and no partially-committed state that crashes the server halfway through.

2. **The ledger is append-only.** `ledger_entries` has four entry types: `DEMAND` (+), `CONCESSION` (−), `PAYMENT` (−), `REVERSAL` (+). `Balance = SUM(all entries for that student)`. A reversed payment writes a new `REVERSAL` entry — it never touches or deletes the original `PAYMENT` entry. This means you can always reconstruct the account history at any point in time, and a `verify-ledger.sql` script runs nine mathematical invariants to confirm the books balance.

3. **Reconciliation is a first-class workflow, not an afterthought.** Indian payment gateways send a daily CSV settlement file. Instead of treating "amount mismatch" or "stuck pending" as errors, Kosha models them as four distinct resolution buckets with human-actionable workflows and full audit trails.

---

### Architecture

```
Browser  ──►  Next.js 15 (App Router)   ──►  Supabase PostgreSQL
              │                               │
              ├── /app/(app)/           ──►  SQL functions (SECURITY DEFINER)
              │   pages, route handlers        record_payment, confirm_payment,
              ├── /lib/domain/                 reverse_payment, apply_concession,
              │   payment-state.ts             create_recon_run, resolve_recon_item
              │   reconcile.ts (pure)     ──►  Triggers (append-only enforcement)
              ├── /lib/data/             ──►  Views (v_student_balances,
              │   server queries                v_installment_status)
              └── /components/
```

**Stack:** Next.js 15 (App Router) · TypeScript strict · Tailwind CSS · Radix UI primitives · Supabase Postgres · Vitest · Playwright · Vercel

**Key choices:**
- Money is **always integer paise** in Postgres (`BIGINT`) and TypeScript. Formatted only at display boundaries using `Intl.NumberFormat('en-IN')`.
- Zod validates every API input at the route boundary. SQL constraints and function guards validate again inside the transaction.
- The service role key is never imported into client code — `lib/env.ts` throws at build time if attempted.
- Reconciliation matching (`lib/domain/reconcile.ts`) is a **pure TypeScript function** that is unit-tested independently from the database.

---

### Assumptions

| # | Assumption | Reason |
|---|---|---|
| 1 | No real authentication — roles simulated via a cookie | Real auth is out of scope per the brief; the server still enforces permissions on every request |
| 2 | INR only, paise precision | Matches Indian college fee structures; simplifies money handling |
| 3 | Mock payment gateway with simulate controls | Demonstrates the full online payment lifecycle (succeed / fail / timeout) without a live gateway contract |
| 4 | One institution | Multi-tenancy is listed as future work |
| 5 | Academic year 2026–27 hard-coded in the seed | Demo data; a real system would derive this dynamically |
| 6 | Settlement CSV format: `gateway_ref,amount_inr,status,settled_at` | Matches common Indian gateway export formats (Razorpay, PayU, Cashfree) |
| 7 | Overpayment is kept as an advance, never rejected | Colleges often collect term fees in advance; rejecting overpayment creates friction |

---

### Trade-offs

| Decision | Alternative | Why this choice | Cost |
|---|---|---|---|
| All money writes go through SQL functions | Application-level transactions via Prisma/Drizzle | Constraints, triggers and locks live in one place; impossible to bypass via the API or a direct DB client | SQL is harder to test end-to-end; requires `pg` for scripts |
| Append-only ledger | Mutable balance fields on the student row | Perfect audit trail; no row ever needs to be corrected | Slightly slower reads; balance must be aggregated |
| Supabase Postgres | MySQL / SQLite | Row-level locking (`SELECT FOR UPDATE`), sequences for receipt numbers, and `plpgsql` are all available; Supabase provides managed auth and realtime as future options | Supabase free tier has connection limits |
| Server Components + Route Handlers | tRPC / GraphQL | Simpler mental model for the Next.js App Router; no schema generation step | Less type-safe across the API boundary than tRPC |
| Reconciliation as a pure TypeScript function | SQL stored procedure | Unit-testable without a database; the four-bucket logic is complex and benefits from Jest-style assertions | Matching and persisting are separate steps |

---

## Validation and Edge Cases

Every edge case in the table below is handled in code and tested.

| Edge case | How it is handled |
|---|---|
| **Double-submit** (user clicks twice) | `idempotency_key` (UUID per form open) is `UNIQUE` in `payments`. If the key exists, `record_payment` returns the existing payment. Tested: same key twice, and two concurrent requests with the same key. |
| **Parallel payments** on one student | `record_payment` starts with `SELECT student_id FOR UPDATE`, serialising all concurrent calls for that student. Tested: 6 parallel payments, allocation checked. |
| **Overpayment** | Unallocated credit is kept as a negative balance, shown as "Advance ₹X". Never rejected. |
| **Concession after partial payment** | `apply_concession` checks remaining demand (demand − paid − prior concessions); it raises an error if the concession amount exceeds what is still owed. Tested. |
| **Reversal of an allocated payment** | `reverse_payment` writes a `REVERSAL` ledger entry. Because installment paid status is computed as `SUM(allocations whose payment.status = 'SUCCESS')`, the installment automatically reopens without deleting any row. Tested. |
| **Stuck pending / gateway timeout** | Payment stays `PENDING` with a `gateway_ref`. "Check status" and reconciliation ("Settled but pending here") both call `confirm_payment`, which is idempotent (it is a no-op if the payment is already `SUCCESS`). Tested: two concurrent confirms post one ledger entry. |
| **Amount mismatch in settlement** | Flagged in the "Amount mismatch" bucket; no auto-fix. Accountant can add a review note and mark it resolved. |
| **Duplicate `gateway_ref` in the CSV** | `reconcile()` uses a `Map` keyed on `gateway_ref`; duplicate refs in the file are deduplicated, keeping the first. |
| **Malformed CSV rows** | `papaparse` with `skipEmptyLines: true`; each row is validated with Zod (ref required, amount must parse to a positive integer, date must parse). Bad rows are reported in the API response; the run is created only for valid rows. |
| **Illegal payment transition** | The SQL function `_payment_event` validates every `(from, to)` pair against the allowed transition table and raises `P0001` if it is illegal (e.g. `FAILED → SUCCESS`). The TypeScript `TRANSITIONS` table in `lib/domain/payment-state.ts` mirrors the SQL one exactly; a unit test asserts they match. |
| **Zero / negative amounts** | `payments.amount_paise CHECK (amount_paise > 0)` and `toPaise()` reject these before reaching the database. |
| **Ledger mathematical consistency** | `scripts/verify-ledger.sql` asserts nine invariants on every `npm run db:verify` run. All nine pass after setup and after the integration test suite. |

---

## AI/Tool Usage Report

**AI TOOLS USED:** ChatGPT (GPT-4o), Gemini, Antigravity IDE Coding Agent (Google DeepMind)

---

### What I Asked AI to Do

1. **ChatGPT — Initial architecture and domain modelling.** Before writing a line of code, I prompted ChatGPT to reason about the core domain: "What are all the ways a fee collection system can go wrong, and how would you model the data to handle them?" This gave me the initial framing for the append-only ledger, the installment → allocation → ledger chain, and the four reconciliation buckets. I then challenged each suggestion and refined the schema myself.

2. **Gemini — SQL function authoring.** I used Gemini to draft the five core PL/pgSQL functions (`record_payment`, `confirm_payment`, `reverse_payment`, `apply_concession`, `resolve_recon_item`) after I had sketched the schema. I fed it the table definitions and domain rules and asked it to write the function bodies with explicit row locking. I then reviewed every line of the SQL for correctness, fixed the transaction boundaries, and rewrote the error messages.

3. **Gemini — Seed data generation.** I asked Gemini to generate `003_seed.sql`: 60 students with realistic Indian names across 3 courses, 2 terms, 4 fee heads, and 7 scenario students whose histories exercise every feature. The initial output clustered payment dates on four calendar days (bug #1 in the AI log below). I caught this by querying the seed data and fixed the date spread formula.

4. **Antigravity Coding Agent — TypeScript layer, React components, and tests.** The Antigravity IDE agent (built on Google DeepMind's model) wrote the data-layer functions in `lib/data/`, all route handlers, the domain pure functions (`reconcile.ts`, `payment-state.ts`), the Vitest unit and integration tests, all React components, and the design system. I directed it with specific instructions per screen (the PROJECT_BRIEF.md served as the spec) and reviewed each phase's output for correctness, visual quality, and edge-case handling.

5. **Antigravity Coding Agent — Project setup and CI validation.** During setup, the agent identified that the project required Node 22 for built-in TypeScript script execution, installed `tsx` as a dev dependency, configured the `--max-http-header-size` Node flag to prevent HTTP 431 errors from accumulated localhost cookies, and fixed a WebSocket polyfill needed for the Supabase realtime client under Node 20.

6. **ChatGPT — "Amount in words" logic.** I asked ChatGPT for an algorithm to convert a rupee amount to Indian-English words ("Twenty-five thousand rupees only") using the Indian numbering system (lakh, crore). The first output had an off-by-one at exactly 1,00,000; I caught this with a unit test and fixed the boundary condition.

---

### Prompt That Was Most Useful

> "I am building a fee ledger for an Indian college. Money-changing operations must be atomic. The ledger must be append-only (no UPDATE, no DELETE on ledger_entries). Every payment goes through a state machine: INITIATED → PENDING → SUCCESS | FAILED, and SUCCESS → REVERSED. A reversed payment must not delete allocations; instead, the installment's paid status is recomputed from allocations on SUCCESS payments only. Given these tables [schema pasted], write a PostgreSQL function `record_payment` that: (1) locks the student row, (2) checks the idempotency key, (3) writes the payment row, (4) writes the INITIATED event, (5) for Cash mode, immediately calls confirm logic inline to write SUCCESS and a ledger entry, (6) allocates the amount to open installments oldest-first, (7) generates a receipt number from a sequence, (8) writes an audit log entry — all in one transaction."

This prompt produced about 85% of the final `record_payment` function. I rewrote the error handling, changed the locking strategy (added `NOWAIT` fallback), and added the advance/overpayment case.

---

### Code Generated by AI

| Component | Generated by | Approx. % unchanged |
|---|---|---|
| `supabase/migrations/001_schema.sql` (table definitions) | Gemini | 70% |
| `supabase/migrations/002_functions.sql` (PL/pgSQL functions) | Gemini | 55% |
| `supabase/migrations/003_seed.sql` (demo data) | Gemini | 60% |
| `lib/domain/payment-state.ts` | Antigravity Agent | 80% |
| `lib/domain/reconcile.ts` | Antigravity Agent | 75% |
| `lib/auth/permissions.ts` | Antigravity Agent | 90% |
| `lib/money.ts` (`toPaise`, `formatINR`) | Antigravity Agent | 80% |
| `app/api/` route handlers (all) | Antigravity Agent | 70% |
| React components (shell, statement, payments, reconciliation, dashboard) | Antigravity Agent | 65% |
| `tests/unit/` (all unit tests) | Antigravity Agent | 85% |
| `tests/integration/` (integration tests) | Antigravity Agent | 75% |
| `scripts/db-setup.ts`, `verify-ledger.sql` | Antigravity Agent | 80% |

---

### Code I Modified

- **`002_functions.sql`** — Rewrote locking strategy, error messages (switched from "Rs" to "₹"), tightened the `_allocate_credit` function's oldest-due-date ordering, and added the `NOWAIT` + retry hint in comments.
- **`003_seed.sql`** — Fixed payment date spread (bug #1: changed `(i * 11) % 44` to `(i * 17) % 45`). Re-ordered scenario students for a more logical demo flow.
- **`lib/data/db.ts`** — Rewrote `run<T>()` helper to accept untyped Supabase query results and cast at the call site, avoiding the supabase-js inference clash with embedded relations (bug #2).
- **`lib/data/students.ts`** — Fixed `listPayments` to do a two-step query for student search rather than OR across an embedded table (bug #3). Removed the module-level cache on `getDemoStudentId()` (bug #4).
- **`lib/domain/reconcile.ts`** — Added deduplication of `gateway_ref` within the same CSV file.
- **`app/globals.css`** — Added RGB channel CSS variables (`--ink-rgb`, `--accent-rgb`, etc.) so Tailwind opacity modifiers (`bg-ink/25`) work with CSS variable colours (bug #6). Moved the select chevron SVG out of Tailwind arbitrary values into a `.select-chevron` CSS class (bug #10).
- **`components/statement/fee-head-tracker.tsx`** — Completely redesigned from a segmented bar chart into a card-based fee head breakdown with individual KPI cards, clear balance figures, and status badges.
- **`lib/dates.ts`** — Fixed `formatDate` to use a fixed month-name array and `Number(day)` instead of `en-GB` ICU formatting, which abbreviates September as "Sept" (bug #7).
- **`tests/integration/money-functions.test.ts`** — Added a `WebSocket` stub for environments running Node 20 where `@supabase/realtime-js` checks for native WebSocket.
- All audit text strings and error messages — rewrote AI-generated copy for grammatical correctness and product voice (bug #5).

---

### AI Output That Was Wrong

**Most significant:** The reconciliation dashboard initially listed every open item **twice** after the sample CSV was uploaded a second time, because the query did not deduplicate items across multiple reconciliation runs for the same `gateway_ref`. The dashboard displayed "27 items" while the summary badge said "Needs attention: 7" (they counted different things).

**Runner-up:** The `formatDate` function used `Intl.DateTimeFormat('en-GB', { month: 'short' })`, which in current ICU data abbreviates September as "Sept" rather than "Sep". After fixing that by reading the month from a fixed array, the first fix introduced "05 Jan 2027" because `en-GB` zero-pads the day — requiring a second fix using `Number(day)`.

**Also notable:** Toasts were positioned bottom-right, exactly over the drawer's submit button — a complete UX blocker. Moved to bottom-left.

---

### How I Identified the Problems

- **Date clustering in seed:** A manual SQL query (`SELECT date(paid_at), COUNT(*) FROM payments GROUP BY 1 ORDER BY 1`) after the first migration run.
- **TypeScript inference clash:** `npm run typecheck` failing with four errors in the data layer.
- **"Sept" / zero-padded day:** A unit test I wrote in `tests/unit/dates.test.ts` that asserted `formatDate('2026-09-24') === '24 Sep 2026'` and `formatDate('2027-01-05') === '5 Jan 2027'`.
- **Dashboard duplication:** Opening the reconciliation page, uploading the sample CSV twice, then reading the "27 items" vs "Needs attention: 7" discrepancy on screen.
- **Toast overlap / visual bugs:** Taking Playwright screenshots at 1440px and 390px and reading them.
- **All other issues:** Code review before each commit, running `npm run typecheck`, `npm run lint`, and `npm test` after every phase.

---

### How I Fixed Each Problem

| # | Problem | Fix |
|---|---|---|
| 1 | Payment dates clustered on 4 days | Changed `(i * 11) % 44` to `(i * 17) % 45` (coprime, 45 distinct dates) |
| 2 | Supabase-js infers embedded relations as arrays | `run()` accepts untyped result, call site declares row type |
| 3 | Payment search OR across embedded table | Two-step: look up student IDs first, then OR on `student_id.in.(...)` |
| 4 | Demo student ID cache goes stale after reset | Removed the module-level cache; always look up by roll number |
| 5 | Ungrammatical audit/error copy | Rewrote all strings manually |
| 6 | Tailwind opacity modifiers on CSS vars | Added `--ink-rgb` RGB channel vars, remapped colours as `rgb(var(--X-rgb) / <alpha-value>)` |
| 7 | "Sept" and "05 Jan" from ICU formatting | Month from fixed array, day via `Number()`, year from ICU |
| 8 | Layout bugs in screenshots | Fixed grid columns, font families, phone layouts, sidebar, balance sentence |
| 9 | Invisible combining characters in regex | Replaced with `/\p{Diacritic}/gu` |
| 10 | SVG chevron broken as Tailwind arbitrary value | Moved to `.select-chevron` CSS class in `globals.css` |
| 11 | Toast over drawer button, visual bugs | Moved toasts bottom-left; redesigned segmented controls, phone wrap |
| 12 | Walkthrough waited on already-present URL param | Wait for the "Payment pending" toast text instead |
| 13 | Dashboard duplication, chart and label bugs | Deduplication by `gateway_ref` (newest run wins); short bucket labels; straight chart segments; `initialDimension` on ResponsiveContainer |
| 14 | Playwright assertions read wrong element | Filter alerts by text; wait for dialog instead of asserting once |

---

## Test Results

```
Test Files  7 passed (7)
     Tests  156 passed (156)
  Start at  00:10:55
  Duration  34.03s

Ledger verification:
  [PASS] balance = SUM(ledger) for every student (0 mismatches)
  [PASS] allocations + concessions <= demand for every installment (0 over-allocated)
  [PASS] allocations <= payment amount for every payment (0 over)
  [PASS] ledger entries match payment status (0 payments wrong)
  [PASS] one DEMAND per installment, one CONCESSION per concession (0 wrong)
  [PASS] no unallocated credit alongside open installments (0 students)
  [PASS] latest payment event matches payment status (0 wrong)
  [PASS] ledger_entries rejects UPDATE and DELETE
  [PASS] illegal payment transition FAILED -> SUCCESS is rejected
  All ledger checks passed.
```

`npm run typecheck` — ✅ zero errors
`npm run lint` — ✅ zero warnings
`npm run build` — ✅ compiled successfully
