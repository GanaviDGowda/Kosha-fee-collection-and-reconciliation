-- Kosha: fee collection and reconciliation
-- 002_functions.sql: every money-changing operation, one plpgsql function each.
--
-- Each public function runs in a single transaction (one supabase.rpc call), locks the
-- student row first (SELECT ... FOR UPDATE) so concurrent operations on one student are
-- serialised, writes payment_events for status changes and one audit_log row.
--
-- Errors are raised with errcode P0001, a readable message, and a machine code in HINT
-- (e.g. hint = 'payment_already_reversed'). The API maps HINT to its error.code.
--
-- Lock order is always: student row, then payment row, then reconciliation item.

create sequence if not exists receipt_seq;
create sequence if not exists gateway_ref_seq;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API, see grants at the bottom)
-- ---------------------------------------------------------------------------

create or replace function _fail(p_hint text, p_message text) returns void
language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'P0001', hint = p_hint;
end;
$$;

create or replace function _check_actor(p_actor text) returns void
language plpgsql as $$
begin
  if p_actor is null or p_actor not in ('admin', 'accountant', 'student', 'gateway', 'system') then
    perform _fail('invalid_actor', format('Unknown actor "%s".', coalesce(p_actor, 'null')));
  end if;
end;
$$;

create or replace function _audit(p_actor text, p_action text, p_entity text, p_entity_id text, p_details jsonb)
returns void
language sql as $$
  insert into audit_log (actor, action, entity, entity_id, details, created_at)
  values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb), kosha_now());
$$;

create or replace function _payment_event(p_payment_id uuid, p_from text, p_to text, p_note text, p_actor text)
returns void
language sql as $$
  insert into payment_events (payment_id, from_status, to_status, note, actor, created_at)
  values (p_payment_id, p_from, p_to, p_note, p_actor, kosha_now());
$$;

create or replace function _lock_student(p_student_id uuid) returns students
language plpgsql as $$
declare
  v_student students;
begin
  select * into v_student from students where id = p_student_id for update;
  if not found then
    perform _fail('student_not_found', 'Student not found.');
  end if;
  return v_student;
end;
$$;

-- Locks the payment's student and then the payment, in that order.
create or replace function _lock_payment(p_payment_id uuid) returns payments
language plpgsql as $$
declare
  v_student_id uuid;
  v_payment payments;
begin
  select student_id into v_student_id from payments where id = p_payment_id;
  if not found then
    perform _fail('payment_not_found', 'Payment not found.');
  end if;
  perform _lock_student(v_student_id);
  select * into v_payment from payments where id = p_payment_id for update;
  return v_payment;
end;
$$;

-- Indian academic / financial year label for a timestamp, e.g. 2026-27.
create or replace function _academic_year(p_at timestamptz) returns text
language sql immutable as $$
  select case
    when extract(month from (p_at at time zone 'Asia/Kolkata')) >= 4
      then to_char(p_at at time zone 'Asia/Kolkata', 'YYYY') || '-' ||
           to_char((p_at at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
    else to_char((p_at at time zone 'Asia/Kolkata') - interval '1 year', 'YYYY') || '-' ||
         to_char(p_at at time zone 'Asia/Kolkata', 'YY')
  end
$$;

-- What is still owed on one installment: demand - concessions - allocations of SUCCESS payments.
create or replace function _installment_remaining(p_installment_id uuid) returns bigint
language sql stable as $$
  select i.amount_paise
       - coalesce((select sum(c.amount_paise) from concessions c where c.installment_id = i.id), 0)
       - coalesce((select sum(a.amount_paise)
                   from payment_allocations a
                   join payments p on p.id = a.payment_id and p.status = 'SUCCESS'
                   where a.installment_id = i.id), 0)
  from installments i
  where i.id = p_installment_id
$$;

-- Applies every unallocated rupee of the student's SUCCESS payments to open installments,
-- oldest payment first, oldest due date first (fee head order breaks ties).
-- Called after any SUCCESS and after any reversal, so the invariant holds after every
-- money function: a student never has both unallocated credit and an open installment.
-- Whatever cannot be allocated stays as advance (negative balance). Caller holds the student lock.
create or replace function _allocate_credit(p_student_id uuid) returns jsonb
language plpgsql as $$
declare
  v_pay record;
  v_inst record;
  v_free bigint;
  v_take bigint;
  v_made jsonb := '[]'::jsonb;
begin
  for v_pay in
    select p.id, p.amount_paise - coalesce(sum(a.amount_paise), 0) as free_paise
    from payments p
    left join payment_allocations a on a.payment_id = p.id
    where p.student_id = p_student_id and p.status = 'SUCCESS'
    group by p.id, p.amount_paise, p.paid_at, p.created_at
    having p.amount_paise - coalesce(sum(a.amount_paise), 0) > 0
    order by p.paid_at, p.created_at, p.id
  loop
    v_free := v_pay.free_paise;

    for v_inst in
      select i.id, i.label, _installment_remaining(i.id) as remaining_paise
      from installments i
      join fee_heads f on f.id = i.fee_head_id
      where i.student_id = p_student_id
      order by i.due_date, f.sort_order, i.term, i.id
    loop
      exit when v_free <= 0;
      continue when v_inst.remaining_paise <= 0;

      v_take := least(v_free, v_inst.remaining_paise);
      insert into payment_allocations (student_id, payment_id, installment_id, amount_paise, created_at)
      values (p_student_id, v_pay.id, v_inst.id, v_take, kosha_now());
      v_free := v_free - v_take;
      v_made := v_made || jsonb_build_object(
        'payment_id', v_pay.id, 'installment_id', v_inst.id,
        'label', v_inst.label, 'amount_paise', v_take);
    end loop;
  end loop;

  return v_made;
end;
$$;

-- Moves a locked INITIATED/PENDING payment to SUCCESS: receipt number, PAYMENT ledger
-- entry, event, allocation. Caller holds the student and payment locks.
create or replace function _mark_success(p_payment payments, p_actor text, p_note text) returns payments
language plpgsql as $$
declare
  v_now timestamptz := kosha_now();
  v_payment payments;
  v_allocations jsonb;
begin
  update payments
     set status = 'SUCCESS',
         paid_at = v_now,
         receipt_no = 'KSH/' || _academic_year(v_now) || '/' || lpad(nextval('receipt_seq')::text, 6, '0')
   where id = p_payment.id
  returning * into v_payment;

  insert into ledger_entries (student_id, type, amount_paise, ref_table, ref_id, note, created_at)
  values (v_payment.student_id, 'PAYMENT', -v_payment.amount_paise, 'payments', v_payment.id,
          format('Payment received (%s), receipt %s', replace(lower(v_payment.mode), '_', ' '), v_payment.receipt_no),
          v_now);

  perform _payment_event(v_payment.id, p_payment.status, 'SUCCESS', p_note, p_actor);
  v_allocations := _allocate_credit(v_payment.student_id);

  perform _audit(p_actor, 'payment.succeeded', 'payment', v_payment.id::text, jsonb_build_object(
    'receipt_no', v_payment.receipt_no,
    'amount_paise', v_payment.amount_paise,
    'mode', v_payment.mode,
    'student_id', v_payment.student_id,
    'gateway_ref', v_payment.gateway_ref,
    'note', p_note,
    'allocations', v_allocations));

  return v_payment;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_payment
-- ---------------------------------------------------------------------------
-- Offline modes (CASH, BANK_TRANSFER): INITIATED -> SUCCESS immediately.
-- Online modes (UPI, CARD): INITIATED -> PENDING (sent to the mock gateway), then
--   p_simulate = 'SUCCEED' -> SUCCESS, 'FAIL' -> FAILED, 'TIMEOUT' -> stays PENDING.
-- Same idempotency key again returns the existing payment with replayed = true.
create or replace function record_payment(
  p_student_id      uuid,
  p_amount_paise    bigint,
  p_mode            text,
  p_idempotency_key uuid,
  p_simulate        text,
  p_actor           text,
  p_reference       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_existing payments;
  v_payment payments;
  v_online boolean := p_mode in ('UPI', 'CARD');
  v_gateway_ref text;
  v_now timestamptz := kosha_now();
begin
  perform _check_actor(p_actor);

  if p_idempotency_key is null then
    perform _fail('idempotency_key_required', 'An idempotency key is required.');
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    perform _fail('invalid_amount', 'Amount must be greater than zero.');
  end if;
  if p_amount_paise > 100000000 then  -- ₹10,00,000: guards against a fat-fingered amount
    perform _fail('amount_too_large', 'Amount is above the ₹10,00,000 limit for a single payment. Split it or check the figure.');
  end if;
  if p_mode is null or p_mode not in ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER') then
    perform _fail('invalid_mode', 'Payment mode must be cash, UPI, card or bank transfer.');
  end if;
  if p_actor = 'student' and not v_online then
    perform _fail('forbidden', 'Students can only pay online (UPI or card).');
  end if;
  if v_online and (p_simulate is null or p_simulate not in ('SUCCEED', 'FAIL', 'TIMEOUT')) then
    perform _fail('invalid_simulate', 'Choose a simulated gateway outcome: succeed, fail or time out.');
  end if;
  if not v_online and p_simulate is not null then
    perform _fail('invalid_simulate', 'Gateway simulation only applies to UPI and card payments.');
  end if;

  perform _lock_student(p_student_id);

  -- Idempotency: checked after taking the student lock, so two identical submits
  -- are serialised and the second one sees the first.
  select * into v_existing from payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.student_id <> p_student_id
       or v_existing.amount_paise <> p_amount_paise
       or v_existing.mode <> p_mode then
      perform _fail('idempotency_conflict',
        'This payment form was already submitted with different details. Reopen the form to record a new payment.');
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('replayed', true);
  end if;

  if v_online then
    v_gateway_ref := 'MGW' || (7300000000 + nextval('gateway_ref_seq'))::text;
  end if;

  insert into payments (student_id, amount_paise, mode, status, gateway_ref, reference,
                        idempotency_key, created_at, updated_at)
  values (p_student_id, p_amount_paise, p_mode, 'INITIATED', v_gateway_ref, nullif(trim(p_reference), ''),
          p_idempotency_key, v_now, v_now)
  returning * into v_payment;
  perform _payment_event(v_payment.id, null, 'INITIATED', null, p_actor);

  perform _audit(p_actor, 'payment.recorded', 'payment', v_payment.id::text, jsonb_build_object(
    'amount_paise', p_amount_paise, 'mode', p_mode, 'student_id', p_student_id,
    'gateway_ref', v_gateway_ref, 'simulate', p_simulate));

  if not v_online then
    v_payment := _mark_success(v_payment, p_actor,
      case p_mode when 'CASH' then 'Cash received at counter' else 'Bank transfer confirmed' end);
    return to_jsonb(v_payment) || jsonb_build_object('replayed', false);
  end if;

  -- Online: hand over to the mock gateway.
  insert into mock_gateway_txns (gateway_ref, amount_paise, final_status, created_at)
  values (v_gateway_ref, p_amount_paise,
          case p_simulate when 'FAIL' then 'FAILED' else 'SUCCESS' end,  -- a timeout usually did go through
          v_now);

  update payments set status = 'PENDING' where id = v_payment.id returning * into v_payment;
  perform _payment_event(v_payment.id, 'INITIATED', 'PENDING', 'Sent to gateway ' || v_gateway_ref, 'gateway');

  if p_simulate = 'SUCCEED' then
    v_payment := _mark_success(v_payment, 'gateway', 'Gateway confirmed payment');
  elsif p_simulate = 'FAIL' then
    update payments set status = 'FAILED', failure_reason = 'Declined by the payer''s bank'
     where id = v_payment.id returning * into v_payment;
    perform _payment_event(v_payment.id, 'PENDING', 'FAILED', 'Declined by the payer''s bank', 'gateway');
    perform _audit('gateway', 'payment.failed', 'payment', v_payment.id::text, jsonb_build_object(
      'reason', v_payment.failure_reason, 'gateway_ref', v_gateway_ref, 'amount_paise', p_amount_paise));
  else
    perform _audit('gateway', 'payment.timed_out', 'payment', v_payment.id::text, jsonb_build_object(
      'gateway_ref', v_gateway_ref, 'amount_paise', p_amount_paise));
  end if;

  return to_jsonb(v_payment) || jsonb_build_object('replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_payment: PENDING -> SUCCESS (Check status, or reconciliation "Mark as paid")
-- ---------------------------------------------------------------------------
create or replace function confirm_payment(p_payment_id uuid, p_actor text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments;
begin
  perform _check_actor(p_actor);
  if p_actor = 'student' then
    perform _fail('forbidden', 'Students cannot confirm payments.');
  end if;

  v_payment := _lock_payment(p_payment_id);

  case v_payment.status
    when 'PENDING' then null;
    when 'SUCCESS' then perform _fail('payment_already_success', 'This payment is already marked as paid.');
    when 'REVERSED' then perform _fail('payment_already_reversed', 'This payment was already reversed.');
    when 'FAILED' then perform _fail('payment_failed', 'This payment failed and cannot be confirmed. Record a new payment instead.');
    else perform _fail('illegal_transition', format('A %s payment cannot be confirmed.', lower(v_payment.status)));
  end case;

  v_payment := _mark_success(v_payment, p_actor, coalesce(nullif(trim(p_note), ''), 'Confirmed'));
  return to_jsonb(v_payment);
end;
$$;

-- ---------------------------------------------------------------------------
-- fail_payment: PENDING -> FAILED
-- ---------------------------------------------------------------------------
create or replace function fail_payment(p_payment_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments;
begin
  perform _check_actor(p_actor);
  if p_actor = 'student' then
    perform _fail('forbidden', 'Students cannot fail payments.');
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    perform _fail('reason_required', 'Give a reason for marking the payment as failed.');
  end if;

  v_payment := _lock_payment(p_payment_id);

  case v_payment.status
    when 'PENDING' then null;
    when 'FAILED' then perform _fail('payment_already_failed', 'This payment is already marked as failed.');
    when 'SUCCESS' then perform _fail('payment_already_success', 'This payment succeeded. Reverse it instead of failing it.');
    when 'REVERSED' then perform _fail('payment_already_reversed', 'This payment was already reversed.');
    else perform _fail('illegal_transition', format('A %s payment cannot be failed.', lower(v_payment.status)));
  end case;

  update payments set status = 'FAILED', failure_reason = trim(p_reason)
   where id = v_payment.id returning * into v_payment;
  perform _payment_event(v_payment.id, 'PENDING', 'FAILED', trim(p_reason), p_actor);
  perform _audit(p_actor, 'payment.failed', 'payment', v_payment.id::text, jsonb_build_object(
    'reason', trim(p_reason), 'gateway_ref', v_payment.gateway_ref,
    'amount_paise', v_payment.amount_paise, 'student_id', v_payment.student_id));

  return to_jsonb(v_payment);
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_payment: SUCCESS -> REVERSED (bounced transfer, chargeback). Admin only.
-- Posts a positive REVERSAL entry; the payment's allocations stop counting, which
-- reopens its installments. Remaining credit is then re-applied.
-- ---------------------------------------------------------------------------
create or replace function reverse_payment(p_payment_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments;
  v_now timestamptz := kosha_now();
  v_reopened jsonb;
  v_reallocated jsonb;
begin
  perform _check_actor(p_actor);
  if p_actor <> 'admin' then
    perform _fail('forbidden', 'Only an admin can reverse a payment.');
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    perform _fail('reason_required', 'Give a reason for the reversal (at least 5 characters).');
  end if;

  v_payment := _lock_payment(p_payment_id);

  case v_payment.status
    when 'SUCCESS' then null;
    when 'REVERSED' then perform _fail('payment_already_reversed', 'This payment was already reversed.');
    when 'PENDING' then perform _fail('payment_not_success', 'Only successful payments can be reversed. Mark this pending payment as failed instead.');
    else perform _fail('payment_not_success', 'Only successful payments can be reversed.');
  end case;

  select coalesce(jsonb_agg(jsonb_build_object('installment_id', a.installment_id, 'label', i.label,
                                               'amount_paise', a.amount_paise)), '[]'::jsonb)
    into v_reopened
    from payment_allocations a join installments i on i.id = a.installment_id
   where a.payment_id = v_payment.id;

  update payments
     set status = 'REVERSED', reversal_reason = trim(p_reason), reversed_at = v_now
   where id = v_payment.id
  returning * into v_payment;

  insert into ledger_entries (student_id, type, amount_paise, ref_table, ref_id, note, created_at)
  values (v_payment.student_id, 'REVERSAL', v_payment.amount_paise, 'payments', v_payment.id,
          format('Reversal of receipt %s: %s', v_payment.receipt_no, trim(p_reason)), v_now);

  perform _payment_event(v_payment.id, 'SUCCESS', 'REVERSED', trim(p_reason), p_actor);
  v_reallocated := _allocate_credit(v_payment.student_id);

  perform _audit(p_actor, 'payment.reversed', 'payment', v_payment.id::text, jsonb_build_object(
    'receipt_no', v_payment.receipt_no, 'reason', trim(p_reason), 'amount_paise', v_payment.amount_paise,
    'student_id', v_payment.student_id, 'reopened', v_reopened, 'reallocated', v_reallocated));

  return to_jsonb(v_payment);
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_concession: admin only; cannot exceed what is still owed on the installment.
-- ---------------------------------------------------------------------------
create or replace function apply_concession(
  p_installment_id uuid,
  p_amount_paise   bigint,
  p_reason         text,
  p_approved_by    text,
  p_actor          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inst installments;
  v_remaining bigint;
  v_concession concessions;
begin
  perform _check_actor(p_actor);
  if p_actor <> 'admin' then
    perform _fail('forbidden', 'Only an admin can apply a concession.');
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    perform _fail('invalid_amount', 'Concession amount must be greater than zero.');
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    perform _fail('reason_required', 'Give a reason for the concession.');
  end if;
  if p_approved_by is null or length(trim(p_approved_by)) = 0 then
    perform _fail('approver_required', 'Name who approved the concession.');
  end if;

  select * into v_inst from installments where id = p_installment_id;
  if not found then
    perform _fail('installment_not_found', 'Installment not found.');
  end if;
  perform _lock_student(v_inst.student_id);

  v_remaining := _installment_remaining(v_inst.id);
  if p_amount_paise > v_remaining then
    perform _fail('concession_exceeds_remaining', format(
      'Concession is more than what is still owed on %s (₹%s). Lower the amount.',
      v_inst.label, to_char(v_remaining / 100.0, 'FM99,99,99,990.00')));
  end if;

  insert into concessions (student_id, installment_id, amount_paise, reason, approved_by, actor, created_at)
  values (v_inst.student_id, v_inst.id, p_amount_paise, trim(p_reason), trim(p_approved_by), p_actor, kosha_now())
  returning * into v_concession;

  insert into ledger_entries (student_id, type, amount_paise, ref_table, ref_id, note, created_at)
  values (v_inst.student_id, 'CONCESSION', -p_amount_paise, 'concessions', v_concession.id,
          format('Concession on %s: %s', v_inst.label, trim(p_reason)), kosha_now());

  perform _audit(p_actor, 'concession.applied', 'concession', v_concession.id::text, jsonb_build_object(
    'installment_id', v_inst.id, 'label', v_inst.label, 'amount_paise', p_amount_paise,
    'reason', trim(p_reason), 'approved_by', trim(p_approved_by), 'student_id', v_inst.student_id));

  return to_jsonb(v_concession);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------

-- Persists a run computed by lib/domain/reconcile.ts. p_items is a JSON array of
-- {bucket, gateway_ref, file_amount_paise, file_status, settled_at, system_amount_paise,
--  system_status, payment_id}.
create or replace function create_recon_run(
  p_file_name  text,
  p_actor      text,
  p_row_count  integer,
  p_totals     jsonb,
  p_rejected   jsonb,
  p_items      jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
begin
  perform _check_actor(p_actor);
  if p_actor not in ('admin', 'accountant') then
    perform _fail('forbidden', 'Only admins and accountants can run reconciliation.');
  end if;

  insert into reconciliation_runs (file_name, uploaded_by, row_count, totals, rejected_rows, created_at)
  values (coalesce(nullif(trim(p_file_name), ''), 'settlement.csv'), p_actor, p_row_count,
          coalesce(p_totals, '{}'::jsonb), coalesce(p_rejected, '[]'::jsonb), kosha_now())
  returning id into v_run_id;

  insert into reconciliation_items (run_id, bucket, gateway_ref, file_amount_paise, file_status, settled_at,
                                    system_amount_paise, system_status, payment_id, created_at)
  select v_run_id, x.bucket, x.gateway_ref, x.file_amount_paise, x.file_status, x.settled_at,
         x.system_amount_paise, x.system_status, x.payment_id, kosha_now()
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    bucket text, gateway_ref text, file_amount_paise bigint, file_status text, settled_at timestamptz,
    system_amount_paise bigint, system_status text, payment_id uuid);

  perform _audit(p_actor, 'reconciliation.run', 'reconciliation_run', v_run_id::text, jsonb_build_object(
    'file_name', p_file_name, 'row_count', p_row_count, 'totals', p_totals,
    'rejected', jsonb_array_length(coalesce(p_rejected, '[]'::jsonb))));

  return v_run_id;
end;
$$;

-- MARKED_PAID (only for SETTLED_PENDING_HERE) confirms the payment through
-- confirm_payment. REVIEWED records a human decision with a note; it never changes money.
create or replace function resolve_recon_item(
  p_item_id    uuid,
  p_resolution text,
  p_actor      text,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item reconciliation_items;
  v_status text;
  v_note text := nullif(trim(p_note), '');
begin
  perform _check_actor(p_actor);
  if p_actor not in ('admin', 'accountant') then
    perform _fail('forbidden', 'Only admins and accountants can resolve reconciliation items.');
  end if;
  if p_resolution is null or p_resolution not in ('MARKED_PAID', 'REVIEWED') then
    perform _fail('invalid_resolution', 'Resolution must be "mark as paid" or "reviewed".');
  end if;

  select * into v_item from reconciliation_items where id = p_item_id;
  if not found then
    perform _fail('recon_item_not_found', 'Reconciliation item not found.');
  end if;
  -- Lock order: student, payment, then the item.
  if v_item.payment_id is not null then
    perform _lock_payment(v_item.payment_id);
  end if;
  select * into v_item from reconciliation_items where id = p_item_id for update;

  if v_item.resolution is not null then
    perform _fail('recon_item_already_resolved', format('This item was already resolved by %s.', v_item.resolved_by));
  end if;
  if v_item.bucket = 'MATCHED' then
    perform _fail('recon_item_matched', 'Matched items need no action.');
  end if;

  if p_resolution = 'MARKED_PAID' then
    if v_item.bucket <> 'SETTLED_PENDING_HERE' then
      perform _fail('invalid_resolution', 'Only payments settled by the gateway but pending here can be marked as paid.');
    end if;
    select status into v_status from payments where id = v_item.payment_id;
    if v_status = 'PENDING' then
      v_note := coalesce(v_note, 'Confirmed from the gateway settlement file');
      perform confirm_payment(v_item.payment_id, p_actor,
        format('Marked paid from reconciliation: settled %s',
               to_char(v_item.settled_at at time zone 'Asia/Kolkata', 'DD Mon YYYY')));
    elsif v_status = 'SUCCESS' then
      v_note := coalesce(v_note, 'Already confirmed before this item was resolved');
    else
      perform _fail('payment_not_pending', format(
        'The payment is now %s, so it cannot be marked as paid. Review it instead.', lower(v_status)));
    end if;
  else
    if v_note is null or length(v_note) < 3 then
      perform _fail('note_required', 'Add a note saying what was checked.');
    end if;
  end if;

  update reconciliation_items
     set resolution = p_resolution, resolution_note = v_note, resolved_by = p_actor, resolved_at = kosha_now()
   where id = v_item.id
  returning * into v_item;

  perform _audit(p_actor, 'reconciliation.resolved', 'reconciliation_item', v_item.id::text, jsonb_build_object(
    'run_id', v_item.run_id, 'bucket', v_item.bucket, 'gateway_ref', v_item.gateway_ref,
    'resolution', p_resolution, 'note', v_note, 'payment_id', v_item.payment_id));

  return to_jsonb(v_item);
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_demo: wipe and reseed. seed_demo() is defined in 003_seed.sql.
-- ---------------------------------------------------------------------------
create or replace function reset_demo(p_actor text default 'admin') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  perform _check_actor(p_actor);
  if p_actor not in ('admin', 'system') then
    perform _fail('forbidden', 'Only an admin can reset demo data.');
  end if;

  -- Serialise concurrent resets.
  perform pg_advisory_xact_lock(hashtext('kosha.reset_demo'));

  perform set_config('kosha.resetting', 'on', true);
  truncate table reconciliation_items, reconciliation_runs, audit_log, ledger_entries,
                 payment_allocations, payment_events, mock_gateway_txns, payments, concessions,
                 installments, students, fee_heads, courses
    restart identity;
  perform set_config('kosha.resetting', 'off', true);

  perform setval('receipt_seq', 1, false);
  perform setval('gateway_ref_seq', 1, false);

  v_result := seed_demo();
  perform set_config('kosha.clock', '', true);

  perform _audit(p_actor, 'demo.reset', 'demo', null, v_result);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. On Supabase the API uses service_role, which gets read access plus
-- EXECUTE on the public functions only. All writes go through the functions above
-- (SECURITY DEFINER), so even a leaked service key cannot UPDATE the ledger directly.
-- Skipped on plain Postgres where these roles don't exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on all tables in schema public from anon, authenticated, service_role;
    revoke all on all sequences in schema public from anon, authenticated, service_role;
    revoke execute on all functions in schema public from public, anon, authenticated, service_role;

    grant select on all tables in schema public to service_role;
    grant execute on function
      record_payment(uuid, bigint, text, uuid, text, text, text),
      confirm_payment(uuid, text, text),
      fail_payment(uuid, text, text),
      reverse_payment(uuid, text, text),
      apply_concession(uuid, bigint, text, text, text),
      create_recon_run(text, text, integer, jsonb, jsonb, jsonb),
      resolve_recon_item(uuid, text, text, text),
      reset_demo(text),
      kosha_now(),
      kosha_today()
    to service_role;
  end if;
end;
$$;
