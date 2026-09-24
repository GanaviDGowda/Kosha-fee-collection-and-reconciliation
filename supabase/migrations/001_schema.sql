-- Kosha: fee collection and reconciliation
-- 001_schema.sql: tables, constraints, integrity triggers, views.
--
-- Conventions
--   * Money is always BIGINT paise. No numeric/float money anywhere.
--   * ledger_entries and payment_allocations are append-only (enforced by triggers).
--   * Payment status changes are checked against payment_transitions by a trigger,
--     so an illegal transition fails even if someone bypasses the functions in 002.
--   * All timestamps are timestamptz; "today" for due-date logic is Asia/Kolkata.

-- gen_random_uuid() is built into PostgreSQL 13+, no extension needed.

-- Clock used by every money function. Normally now(). The seed sets kosha.clock
-- (transaction-local) so demo history can be written through the same functions
-- the app uses, with realistic past timestamps. Nothing outside seed_demo() sets it.
create or replace function kosha_now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('kosha.clock', true), '')::timestamptz, now())
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);

create table students (
  id          uuid primary key default gen_random_uuid(),
  roll_no     text not null unique check (roll_no ~ '^[A-Z]{2,6}[0-9]{2}-[0-9]{3}$'),
  name        text not null check (length(trim(name)) > 0),
  course_id   uuid not null references courses(id),
  year        smallint not null check (year between 1 and 5),
  email       text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text,
  created_at  timestamptz not null default now()
);
create index students_course_idx on students(course_id);

create table fee_heads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  sort_order  smallint not null unique,  -- tie-break for allocation when due dates are equal
  created_at  timestamptz not null default now()
);

-- One row per fee head per term per student.
create table installments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id),
  fee_head_id   uuid not null references fee_heads(id),
  term          smallint not null check (term between 1 and 3),
  label         text not null check (length(trim(label)) > 0),
  amount_paise  bigint not null check (amount_paise > 0),
  due_date      date not null,
  created_at    timestamptz not null default now(),
  unique (student_id, fee_head_id, term),
  unique (id, student_id)  -- target for composite FKs so children can't point at another student's installment
);
create index installments_student_due_idx on installments(student_id, due_date);

create table concessions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references students(id),
  installment_id  uuid not null,
  amount_paise    bigint not null check (amount_paise > 0),
  reason          text not null check (length(trim(reason)) >= 3),
  approved_by     text not null check (length(trim(approved_by)) > 0),
  actor           text not null,
  created_at      timestamptz not null default now(),
  foreign key (installment_id, student_id) references installments(id, student_id)
);
create index concessions_installment_idx on concessions(installment_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table payment_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

-- Keep in sync with lib/domain/payment-state.ts (a unit test asserts they match).
insert into payment_transitions (from_status, to_status) values
  ('INITIATED', 'PENDING'),   -- handed to the gateway
  ('INITIATED', 'SUCCESS'),   -- offline modes (cash, bank transfer) confirmed at the counter
  ('PENDING',   'SUCCESS'),
  ('PENDING',   'FAILED'),
  ('SUCCESS',   'REVERSED');

create table payments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references students(id),
  amount_paise     bigint not null check (amount_paise > 0),
  mode             text not null check (mode in ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER')),
  status           text not null check (status in ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED')),
  gateway_ref      text unique,              -- mock gateway reference, online modes only
  reference        text,                     -- UTR / counter memo for offline modes, free text
  idempotency_key  uuid not null unique,
  receipt_no       text unique,
  failure_reason   text,
  reversal_reason  text,
  paid_at          timestamptz,              -- when it reached SUCCESS
  reversed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint payments_gateway_ref_online
    check ((mode in ('UPI', 'CARD')) = (gateway_ref is not null)),
  constraint payments_receipt_when_settled
    check ((status in ('SUCCESS', 'REVERSED')) = (receipt_no is not null and paid_at is not null)),
  constraint payments_reversal_fields
    check ((status = 'REVERSED') = (reversal_reason is not null and reversed_at is not null)),
  constraint payments_failure_reason
    check ((status = 'FAILED') = (failure_reason is not null)),
  unique (id, student_id)
);
create index payments_student_idx on payments(student_id, created_at);
create index payments_status_idx on payments(status);
create index payments_paid_at_idx on payments(paid_at) where paid_at is not null;

create table payment_events (
  id           bigint generated always as identity primary key,
  payment_id   uuid not null references payments(id),
  from_status  text,
  to_status    text not null,
  note         text,
  actor        text not null,
  created_at   timestamptz not null default now()
);
create index payment_events_payment_idx on payment_events(payment_id, id);

-- Which installments a payment paid. Rows are never deleted: an installment's "paid"
-- only counts allocations whose payment is currently SUCCESS, so a reversal reopens
-- the installment without touching these rows.
create table payment_allocations (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null,
  payment_id      uuid not null,
  installment_id  uuid not null,
  amount_paise    bigint not null check (amount_paise > 0),
  created_at      timestamptz not null default now(),
  -- both FKs carry student_id, so a payment can only ever pay its own student's installments
  foreign key (payment_id, student_id) references payments(id, student_id),
  foreign key (installment_id, student_id) references installments(id, student_id)
);
create index payment_allocations_payment_idx on payment_allocations(payment_id);
create index payment_allocations_installment_idx on payment_allocations(installment_id);

-- The mock gateway's own view of each online transaction. It stands in for the
-- external payment provider: "Check status" reads it, and it records what the
-- gateway will eventually report for a timed-out payment. Not part of the ledger.
create table mock_gateway_txns (
  gateway_ref    text primary key,
  amount_paise   bigint not null check (amount_paise > 0),
  final_status   text not null check (final_status in ('PENDING', 'SUCCESS', 'FAILED')),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ledger (append-only). Balance = SUM(amount_paise). Positive = student owes.
-- ---------------------------------------------------------------------------

create table ledger_entries (
  id            bigint generated always as identity primary key,
  student_id    uuid not null references students(id),
  type          text not null check (type in ('DEMAND', 'CONCESSION', 'PAYMENT', 'REVERSAL')),
  amount_paise  bigint not null,
  ref_table     text not null check (ref_table in ('installments', 'concessions', 'payments')),
  ref_id        uuid not null,
  note          text,
  created_at    timestamptz not null default now(),

  constraint ledger_sign_matches_type check (
    (type in ('DEMAND', 'REVERSAL') and amount_paise > 0) or
    (type in ('CONCESSION', 'PAYMENT') and amount_paise < 0)
  ),
  constraint ledger_ref_matches_type check (
    (type = 'DEMAND' and ref_table = 'installments') or
    (type = 'CONCESSION' and ref_table = 'concessions') or
    (type in ('PAYMENT', 'REVERSAL') and ref_table = 'payments')
  )
);
-- A source row can produce at most one entry of each type: a payment confirmed twice
-- (e.g. "Check status" racing reconciliation) can never post two PAYMENT entries.
create unique index ledger_one_entry_per_source on ledger_entries(ref_id, type);
create index ledger_student_idx on ledger_entries(student_id, created_at, id);

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------

create table reconciliation_runs (
  id             uuid primary key default gen_random_uuid(),
  file_name      text not null,
  uploaded_by    text not null,
  row_count      integer not null check (row_count >= 0),
  totals         jsonb not null default '{}'::jsonb,
  rejected_rows  jsonb not null default '[]'::jsonb,  -- [{line, reason, raw}]
  created_at     timestamptz not null default now()
);

create table reconciliation_items (
  id                   uuid primary key default gen_random_uuid(),
  run_id               uuid not null references reconciliation_runs(id),
  bucket               text not null check (bucket in ('MATCHED', 'AMOUNT_MISMATCH', 'SETTLED_PENDING_HERE', 'MISSING_IN_SETTLEMENT')),
  gateway_ref          text not null,
  file_amount_paise    bigint,
  file_status          text,
  settled_at           timestamptz,
  system_amount_paise  bigint,
  system_status        text,
  payment_id           uuid references payments(id),
  resolution           text check (resolution in ('MARKED_PAID', 'REVIEWED')),
  resolution_note      text,
  resolved_by          text,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),

  constraint recon_resolution_fields
    check ((resolution is null) = (resolved_by is null and resolved_at is null)),
  constraint recon_matched_needs_nothing
    check (bucket <> 'MATCHED' or resolution is null),
  constraint recon_marked_paid_bucket
    check (resolution <> 'MARKED_PAID' or bucket = 'SETTLED_PENDING_HERE')
);
create index reconciliation_items_run_idx on reconciliation_items(run_id, bucket);
create index reconciliation_items_open_idx on reconciliation_items(bucket) where resolution is null and bucket <> 'MATCHED';

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null check (actor in ('admin', 'accountant', 'student', 'gateway', 'system')),
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on audit_log(created_at desc, id desc);
create index audit_log_entity_idx on audit_log(entity, entity_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Append-only tables. TRUNCATE is only allowed inside reset_demo(), which sets
-- kosha.resetting for its own transaction.
create or replace function forbid_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'TRUNCATE' and current_setting('kosha.resetting', true) = 'on' then
    return null;
  end if;
  raise exception '% is append-only: % is not allowed. Post a correcting entry instead.', tg_table_name, tg_op
    using errcode = 'P0001', hint = 'append_only';
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on ledger_entries
  for each row execute function forbid_mutation();
create trigger ledger_entries_no_truncate
  before truncate on ledger_entries
  for each statement execute function forbid_mutation();

create trigger payment_allocations_append_only
  before update or delete on payment_allocations
  for each row execute function forbid_mutation();
create trigger payment_allocations_no_truncate
  before truncate on payment_allocations
  for each statement execute function forbid_mutation();

create trigger payment_events_append_only
  before update or delete on payment_events
  for each row execute function forbid_mutation();

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function forbid_mutation();

-- Payments: never deleted, identity columns immutable, status moves only along
-- payment_transitions.
create or replace function guard_payment_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments are never deleted. Reverse or fail the payment instead.'
      using errcode = 'P0001', hint = 'append_only';
  end if;

  if new.student_id <> old.student_id
     or new.amount_paise <> old.amount_paise
     or new.mode <> old.mode
     or new.idempotency_key <> old.idempotency_key
     or new.gateway_ref is distinct from old.gateway_ref
     or (old.receipt_no is not null and new.receipt_no is distinct from old.receipt_no) then
    raise exception 'Payment % cannot change student, amount, mode, keys or receipt number after creation.', old.id
      using errcode = 'P0001', hint = 'payment_immutable';
  end if;

  if new.status <> old.status and not exists (
    select 1 from payment_transitions t
    where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'Payment cannot move from % to %.', old.status, new.status
      using errcode = 'P0001', hint = 'illegal_transition';
  end if;

  new.updated_at := kosha_now();
  return new;
end;
$$;

create trigger payments_guard
  before update or delete on payments
  for each row execute function guard_payment_update();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- "Today" for due-date comparisons, in the college's time zone.
create or replace function kosha_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace view v_installment_status as
with conc as (
  select installment_id, sum(amount_paise)::bigint as concession_paise
  from concessions group by installment_id
),
paid as (
  select a.installment_id, sum(a.amount_paise)::bigint as paid_paise
  from payment_allocations a
  join payments p on p.id = a.payment_id and p.status = 'SUCCESS'
  group by a.installment_id
)
select
  i.id                                       as installment_id,
  i.student_id,
  i.fee_head_id,
  f.name                                     as fee_head,
  f.sort_order                               as fee_head_order,
  i.term,
  i.label,
  i.due_date,
  i.amount_paise                             as demand_paise,
  coalesce(c.concession_paise, 0)            as concession_paise,
  coalesce(p.paid_paise, 0)                  as paid_paise,
  i.amount_paise - coalesce(c.concession_paise, 0) - coalesce(p.paid_paise, 0) as remaining_paise,
  case
    when i.amount_paise - coalesce(c.concession_paise, 0) - coalesce(p.paid_paise, 0) <= 0 then 'PAID'
    when i.due_date < kosha_today() then 'OVERDUE'
    when coalesce(p.paid_paise, 0) + coalesce(c.concession_paise, 0) > 0 then 'PARTIAL'
    else 'DUE'
  end                                        as status
from installments i
join fee_heads f on f.id = i.fee_head_id
left join conc c on c.installment_id = i.id
left join paid p on p.installment_id = i.id;

-- Balances are computed from the domain tables (installments, concessions, payments),
-- not from the ledger, so scripts/verify-ledger.sql is a genuine cross-check.
create or replace view v_student_balances as
with inst as (
  select
    student_id,
    sum(demand_paise)::bigint      as total_demand_paise,
    sum(concession_paise)::bigint  as total_concession_paise,
    sum(remaining_paise) filter (where status = 'OVERDUE')::bigint as overdue_paise,
    min(due_date) filter (where status = 'OVERDUE')                as oldest_overdue_date,
    min(due_date) filter (where remaining_paise > 0 and due_date >= kosha_today()) as next_due_date
  from v_installment_status
  group by student_id
),
next_due as (
  select v.student_id, sum(v.remaining_paise)::bigint as next_due_paise
  from v_installment_status v
  join inst on inst.student_id = v.student_id and v.due_date = inst.next_due_date
  where v.remaining_paise > 0
  group by v.student_id
),
pay as (
  select
    student_id,
    coalesce(sum(amount_paise) filter (where status = 'SUCCESS'), 0)::bigint as total_paid_paise,
    count(*) filter (where status = 'PENDING')                            as pending_count,
    max(paid_at) filter (where status = 'SUCCESS')                        as last_paid_at
  from payments
  group by student_id
)
select
  s.id                                          as student_id,
  s.roll_no,
  s.name,
  s.course_id,
  c.code                                        as course_code,
  c.name                                        as course_name,
  s.year,
  coalesce(inst.total_demand_paise, 0)          as total_demand_paise,
  coalesce(inst.total_concession_paise, 0)      as total_concession_paise,
  coalesce(pay.total_paid_paise, 0)             as total_paid_paise,
  coalesce(inst.total_demand_paise, 0)
    - coalesce(inst.total_concession_paise, 0)
    - coalesce(pay.total_paid_paise, 0)         as balance_paise,
  coalesce(inst.overdue_paise, 0)               as overdue_paise,
  inst.oldest_overdue_date,
  inst.next_due_date,
  coalesce(nd.next_due_paise, 0)                as next_due_paise,
  coalesce(pay.pending_count, 0)                as pending_count,
  pay.last_paid_at,
  case
    when coalesce(inst.overdue_paise, 0) > 0 then 'OVERDUE'
    when coalesce(inst.total_demand_paise, 0) - coalesce(inst.total_concession_paise, 0) - coalesce(pay.total_paid_paise, 0) < 0 then 'ADVANCE'
    when coalesce(inst.total_demand_paise, 0) - coalesce(inst.total_concession_paise, 0) - coalesce(pay.total_paid_paise, 0) = 0 then 'PAID'
    else 'DUE'  -- something is still owed, but nothing is late yet
  end                                           as status
from students s
join courses c on c.id = s.course_id
left join inst on inst.student_id = s.id
left join next_due nd on nd.student_id = s.id
left join pay on pay.student_id = s.id;
