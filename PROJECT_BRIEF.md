# PROJECT BRIEF: Kosha, Fee Collection & Reconciliation

You are building a take-home assignment for a product engineering role at Edumerge Solutions (Assignment 2: Fee Collection & Reconciliation). The deadline is 9:00 AM IST, 25 September 2026. Reviewers judge problem understanding, product thinking, engineering decisions, edge cases, UI quality, validation, and how well decisions are explained.

The product is called **Kosha** (Sanskrit/Kannada for "treasury"). It is a fee ledger for an Indian college.

Read this whole brief before writing code. Work in the phases below, in order. At the end of each phase run the checks listed under "Definition of done", commit, write a 3-line summary, and **stop and wait for me** before starting the next phase.

---

## 0. Working rules

- Stack is fixed: **Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS + shadcn/ui (Radix) + Supabase (PostgreSQL) + Vitest + Playwright**, deployed on **Vercel**. Do not add other frameworks. Allowed small libraries: `zod`, `lucide-react`, `recharts`, `papaparse`, `date-fns`, `pg` (scripts only), `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@fontsource/ibm-plex-serif`, `mermaid` (docs only).
- Money is **always integer paise (BIGINT)** in the database and in TypeScript (`number`, never floats for arithmetic). Format only at the edge.
- The database is the source of truth for all money rules. Every money-changing operation is a **single PostgreSQL function** (plpgsql) called via `supabase.rpc`, so it runs in one transaction.
- `SUPABASE_SERVICE_ROLE_KEY` is used **server-side only** (route handlers / server components). Never import it into client code.
- Validate every API input with `zod` at the route boundary, and again with DB constraints.
- Ask me before: deleting files in this repo, changing the stack, or running anything against a database other than the one in `.env.local`.

---

## 1. Product scope

### Users and roles (simulated RBAC)
Real login is out of scope (stated as an assumption). A **role switcher** in the top bar sets a `kosha_role` cookie. The server enforces permissions from one matrix in `lib/auth/permissions.ts`: `can(role, action): boolean`. The UI hides what a role can't do, and the API still rejects it with 403.

| Action | Admin | Accountant | Student |
|---|---|---|---|
| View dashboard, all students | yes | yes | no |
| View own statement | yes | yes | yes (a fixed demo student) |
| Record payment (cash/UPI/card/bank transfer) | yes | yes | Pay online only, own account |
| Apply concession | yes | no (can request, out of scope) | no |
| Reverse payment | yes | no | no |
| Run reconciliation, resolve items | yes | yes | no |
| View audit log | yes | yes | no |
| Reset demo data | yes | no | no |

### Core domain rules
1. **Fee structure:** fee heads (Tuition, Hostel, Exam, Library). Each student has **installments**: one row per fee head per term, with amount and due date.
2. **Ledger is append-only.** `ledger_entries` types: `DEMAND` (+), `CONCESSION` (−), `PAYMENT` (−), `REVERSAL` (+). Balance = SUM(amount). A DB trigger blocks UPDATE and DELETE on `ledger_entries`. Corrections are always new entries.
3. **Payment lifecycle:** `INITIATED → PENDING → SUCCESS | FAILED`, and `SUCCESS → REVERSED`. Every transition is written to `payment_events`. Illegal transitions raise an exception in SQL. The same transition table exists in `lib/domain/payment-state.ts` for the UI and tests.
4. **Only SUCCESS writes a PAYMENT ledger entry.** REVERSAL writes a new positive entry and needs a reason.
5. **Allocation:** on SUCCESS, allocate the amount to the student's open installments, **oldest due date first**, into `payment_allocations`. Installment "paid" = sum of allocations whose payment is currently SUCCESS, so a reversed payment automatically reopens its installments without deleting rows.
6. **Overpayment** is kept as an unallocated **advance/credit** (negative balance), shown as "Advance ₹X". It is never rejected.
7. **Idempotency:** each payment form open generates a UUID `idempotency_key` (UNIQUE). If the key already exists, `record_payment` returns the existing payment instead of creating a duplicate.
8. **Concurrency:** money functions lock the student row with `SELECT ... FOR UPDATE` so parallel payments can't double-allocate.
9. **Concessions** need amount, reason, approver. They can't exceed the installment's remaining demand. They write a CONCESSION ledger entry.
10. **Cash** payments go straight to SUCCESS. **Online** modes (UPI, card) go through a **mock gateway** with a "Simulate outcome" control: `Succeed`, `Fail`, `Time out`. Time out leaves the payment PENDING with a `gateway_ref`. A "Check status" action and reconciliation can later resolve it.
11. **Receipts:** every SUCCESS gets a sequential receipt number `KSH/2026-27/000123` (a sequence, generated inside the transaction).
12. **Reconciliation:** upload a gateway settlement CSV (`gateway_ref,amount_inr,status,settled_at`). Match on `gateway_ref` into four buckets:
    - **Matched**: ref and amount agree.
    - **Amount mismatch**: ref matches, amount differs. Flag for review, never auto-fix.
    - **Settled but pending here**: bank says success, we say PENDING. Action "Mark as paid" calls `confirm_payment`.
    - **Recorded here, missing in settlement**: our SUCCESS isn't in the file. Flag for review.
    Store every run in `reconciliation_runs` and items in `reconciliation_items`, with the resolution and who resolved it. The matching logic is a **pure TypeScript function** in `lib/domain/reconcile.ts` (unit tested). Resolutions go through SQL functions.
13. **Audit log:** every money function writes an `audit_log` row (actor role, action, entity, details JSON).

### Explicitly out of scope (list these in the docs as future work)
Real payment gateway, real auth/RLS per user, late fees, fee structure editor UI, multi-institution tenancy, emails/SMS, partial refunds.

---

## 2. Database (Phase 1)

Create `supabase/migrations/001_schema.sql`, `002_functions.sql`, `003_seed.sql`, and `scripts/db-setup.ts` (uses `pg` with `DATABASE_URL`) exposed as `npm run db:setup` (applies all three) and `npm run db:reset` (drops and reapplies).

Tables (add sensible `created_at timestamptz default now()`, FKs, CHECKs):
- `courses (id, name, code)`
- `students (id, roll_no UNIQUE, name, course_id, year, email, phone)`
- `fee_heads (id, name UNIQUE)`
- `installments (id, student_id, fee_head_id, term, label, amount_paise CHECK > 0, due_date)`
- `concessions (id, student_id, installment_id, amount_paise CHECK > 0, reason NOT NULL, approved_by)`
- `payments (id, student_id, amount_paise CHECK > 0, mode, status, gateway_ref UNIQUE NULL, idempotency_key UNIQUE NOT NULL, receipt_no UNIQUE NULL, failure_reason, reversal_reason, created_at, updated_at)`
- `payment_events (id, payment_id, from_status, to_status, note, actor)`
- `payment_allocations (id, payment_id, installment_id, amount_paise CHECK > 0)`
- `ledger_entries (id, student_id, type, amount_paise, ref_table, ref_id, note, created_at)` with the no-update/no-delete trigger
- `reconciliation_runs (id, file_name, uploaded_by, totals jsonb)`
- `reconciliation_items (id, run_id, bucket, gateway_ref, file_amount_paise, system_amount_paise, payment_id, resolution, resolved_by, resolved_at)`
- `audit_log (id, actor, action, entity, entity_id, details jsonb)`

Views:
- `v_installment_status`: demand, concession, paid, remaining, and status `PAID | PARTIAL | DUE | OVERDUE` (by due date vs `now()` in Asia/Kolkata).
- `v_student_balances`: total demand, concession, paid, balance, overdue amount, next due date.

Functions (all `SECURITY DEFINER`, all write audit + events):
`record_payment(student_id, amount_paise, mode, idempotency_key, simulate, actor)`, `confirm_payment(payment_id, actor, note)`, `fail_payment(payment_id, reason, actor)`, `reverse_payment(payment_id, reason, actor)`, `apply_concession(installment_id, amount_paise, reason, actor)`, `resolve_recon_item(item_id, resolution, actor)`, `reset_demo()`.

**Seed data must tell a story** so every feature can be demoed immediately:
- 3 courses (B.Tech CSE, BCA, B.Com), about 60 students with realistic Indian names, 2 terms, 4 fee heads.
- Named scenario students (put their roll numbers in `lib/demo/scenarios.ts`):
  1. Fully paid.
  2. Partially paid, with the oldest installment cleared and the next one partial.
  3. Overdue with nothing paid.
  4. Has a merit concession.
  5. Has a reversed payment (bounced cheque/chargeback), so an installment reopened.
  6. Has an online payment stuck in PENDING.
  7. Has an advance (overpaid).
- About 45 days of payment history so the dashboard trend looks real.
- `public/samples/settlement_sample.csv` that produces **all four reconciliation buckets** against the seed.

Definition of done: `npm run db:reset` works end to end; a `scripts/verify-ledger.sql` asserts that for every student `v_student_balances.balance = SUM(ledger_entries)` and that allocations never exceed installment demand. Run it and paste the output.

---

## 3. API and domain layer (Phase 2)

- `lib/money.ts`: `formatINR(paise)` using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` (gives ₹1,25,000.00), `toPaise(rupeesString)` with strict parsing (rejects negatives, more than 2 decimals, blanks).
- `lib/domain/payment-state.ts`, `lib/domain/reconcile.ts`, `lib/auth/permissions.ts`: pure functions.
- REST route handlers under `app/api/`:
  `GET /api/students?q=&status=&course=`, `GET /api/students/[id]` (profile, installments, statement with running balance, payments),
  `POST /api/payments`, `POST /api/payments/[id]/confirm | fail | reverse | check-status`,
  `POST /api/concessions`, `GET /api/dashboard`, `POST /api/reconciliation` (CSV upload, parse with papaparse, validate rows, match, persist), `GET /api/reconciliation/[runId]`, `POST /api/reconciliation/items/[id]/resolve`, `GET /api/audit`, `POST /api/demo/reset`.
- Consistent error shape: `{ error: { code, message, field? } }`. Map Postgres exceptions to readable messages ("This payment was already reversed.").
- **Vitest** tests (`tests/unit`): payment state transitions (legal and illegal), reconciliation bucketing (including duplicate refs in the CSV, bad rows, amount formats), `toPaise` edge cases, permission matrix.
- **Integration test** (`tests/integration`, runs against the DB): same idempotency key twice creates one payment; timeout then confirm writes exactly one ledger entry; reversing reopens the installment; concession above remaining demand is rejected; two parallel payments on one student allocate correctly.

Definition of done: `npm run typecheck`, `npm run lint`, `npm test` all pass.

---

## 4. Design system (read carefully before Phase 3)

The goal is a calm, precise financial tool that looks like a senior product designer made it for this exact domain, not a generic SaaS template. The vernacular is the **bank passbook and the accountant's ledger**: ruled rows, running balances, receipt numbers, precise figures.

### Tokens (define as CSS variables in `app/globals.css` and map them in `tailwind.config`)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#F5F6F8` | App background (cool grey-white, not cream) |
| `--surface` | `#FFFFFF` | Panels, tables, drawers |
| `--ink` | `#16213A` | Primary text, primary buttons (deep bank-ink navy, not black) |
| `--muted` | `#5B6478` | Secondary text |
| `--line` | `#E3E6EC` | Borders and table rules |
| `--accent` | `#2754C5` | Links, focus rings, selected states |
| `--credit` | `#0F7B5F` | Money received, success |
| `--pending` | `#A86400` | Pending, due soon |
| `--debit` | `#B42318` | Failed, overdue |
| `--reversed` | `#6B4FBB` | Reversed |

Status is always shown as **dot + text label** (never color alone), on a tint of the status color at about 8% opacity.

### Type
- **IBM Plex Sans** for all UI, self-hosted via `@fontsource`. **IBM Plex Mono** only for things that really are codes: receipt numbers, gateway refs, roll numbers.
- All money uses `font-variant-numeric: tabular-nums` and is **right-aligned** in tables so the digits line up like a ledger.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 28 / 36. Weights 400, 500, 600 only. Sentence case everywhere.

### Layout
- Left sidebar (232px, light, on `--surface`): Dashboard, Students, Payments, Reconciliation, Audit log. Top bar: global search (⌘K command palette to jump to a student by name or roll number), role switcher, "Demo guide" button.
- Content max width 1280px, 32px gutters, 8px spacing grid.
- Radius hierarchy: 6px for inputs and buttons, 10px for panels, full pill only for status badges. **Borders, not shadows**, on panels. Shadows only on overlays (drawer, popover, command palette).
- Actions that change money open a **right-side drawer** (sheet), so the statement stays visible behind it.

### Screens
1. **Dashboard:** one quiet summary strip at the top (Collected this term, Outstanding, Overdue, Pending payments needing attention) as a single bordered row with dividers, not four floating cards. Below it: collections trend (recharts area, last 30 days, single `--credit` line, no gradient), overdue by course (horizontal bars), and a "Needs attention" list (stuck pending payments, unresolved reconciliation items, overdue over 30 days), each row linking to the right place.
2. **Students:** dense table with sticky header, search, filters (course, status), columns: roll no, name, course, billed, paid, balance, status. Row click opens the statement.
3. **Student statement (the signature screen, spend the design effort here):**
   - Header: name, roll number, course, and the balance as the largest type on the page with a plain sentence below it, like "Next installment of ₹18,000 due on 15 Oct 2026" or "Advance of ₹2,500".
   - **Fee head tracker:** one horizontal segmented bar per fee head showing paid / concession / remaining, with exact figures.
   - **Passbook statement table:** Date, Description, Reference, Debit, Credit, Balance (running). Reversed payments show the original row muted with a link to its reversal row. Concessions read as credits with the reason.
   - Tabs: Statement, Installments, Payments. Actions: Record payment, Apply concession (admin), plus a row menu on payments: View receipt, Check status, Reverse (admin).
4. **Record payment drawer:** amount (prefilled with the next due amount), mode (segmented control: Cash, UPI, Card, Bank transfer), and for online modes a "Simulate gateway outcome" control that is visibly marked as a demo control. Before submitting, show an **allocation preview**: "₹25,000 will clear Tuition Term 1 (₹18,000) and part of Hostel Term 1 (₹7,000)". The submit button stays disabled and shows progress while the request is in flight.
5. **Payment detail:** a **state track** showing each transition with timestamps and actor (Initiated, Pending, Success/Failed, Reversed), allocations, ledger entries created, and audit trail.
6. **Receipt:** clean printable A5 layout (print CSS): college name, receipt number, student, allocation lines, amount in figures and words (Indian numbering: "Twenty-five thousand rupees only"), mode, reference.
7. **Reconciliation:** drag-and-drop CSV upload with a "Download sample file" link. Results show the four buckets as tabs with counts and amounts, and each exception row has its resolve action. Previous runs are listed below.
8. **Audit log:** filterable, readable table ("Accountant reversed payment KSH/2026-27/000118: cheque bounced").
9. **Demo guide:** a dismissible panel listing the seven scenario students, each with one sentence on what to try and a link. Include "Reset demo data" for admins.

### Interaction and copy
- Motion only where it shows what changed: drawer open/close, toasts, and one signature moment: after a payment is recorded, the new statement row appears highlighted and the balance figure updates. Respect `prefers-reduced-motion`.
- Every list has a loading skeleton shaped like the real content, and a useful empty state ("No payments yet. Record the first payment for this student.").
- Errors say what happened and what to do, with no apologies. Buttons name the action and the toast repeats it: "Record payment" then "Payment recorded". "Reverse payment" then "Payment reversed".
- Dates like `24 Sep 2026`, times in IST.
- Accessibility: visible focus rings in `--accent`, full keyboard use for drawers and the command palette, AA contrast, aria labels on icon buttons.
- Responsive: usable at 1024px and 390px (tables scroll horizontally inside their container; sidebar becomes a sheet).

### Don'ts
No gradients or glassmorphism, no identical rounded cards with the same soft shadow everywhere, no ALL-CAPS eyebrow labels above headings, no "→" appended to buttons, no emoji in the UI, no dark mode (out of scope), no lorem ipsum.


---

## 5. Phases

| Phase | Work | Definition of done |
|---|---|---|
| 1 | Scaffold Next.js app, tooling, env handling (`.env.example`), database schema, functions, seed, db scripts | `db:reset` works, `verify-ledger.sql` passes |
| 2 | Domain layer, API routes, unit and integration tests | typecheck, lint, tests pass |
| 3 | Design system, app shell, sidebar, role switcher, command palette, Students list, Student statement | Screenshots reviewed and fixed |
| 4 | Payment drawer with allocation preview, mock gateway, payment detail, receipts, reversal, concessions | Every scenario student works end to end in the browser |
| 5 | Reconciliation, dashboard, audit log, demo guide, reset | Sample CSV produces all 4 buckets, resolving works |
| 6 | Playwright E2E smoke test (record payment, time out then reconcile, reverse), README, deploy notes for Vercel | `npm run e2e` passes, `npm run build` passes |
| 7 | PDF documentation (section 6) | `npm run docs:pdf` produces `docs/Kosha_Documentation.pdf` |

---




