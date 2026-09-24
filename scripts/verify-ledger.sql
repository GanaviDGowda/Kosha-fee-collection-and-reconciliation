-- Kosha: ledger verification.
-- Run with `npm run db:verify` (or psql -f). Prints one NOTICE per check and raises
-- an exception if any invariant is violated, so it fails loudly in CI.

do $$
declare
  v_count bigint;
  v_failed int := 0;
  v_ok boolean;

begin
  -- 1. For every student, the balance from domain tables equals SUM(ledger_entries).
  select count(*) into v_count
  from v_student_balances b
  left join (select student_id, sum(amount_paise) as ledger_paise from ledger_entries group by student_id) l
    on l.student_id = b.student_id
  where b.balance_paise <> coalesce(l.ledger_paise, 0);
  raise notice '[%] balance = SUM(ledger) for every student (% mismatches)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 2. Allocations (of SUCCESS payments) plus concessions never exceed installment demand.
  select count(*) into v_count from v_installment_status where remaining_paise < 0;
  raise notice '[%] allocations + concessions <= demand for every installment (% over-allocated)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 3. A payment never allocates more than its own amount.
  select count(*) into v_count
  from payments p
  join (select payment_id, sum(amount_paise) as allocated from payment_allocations group by payment_id) a
    on a.payment_id = p.id
  where a.allocated > p.amount_paise;
  raise notice '[%] allocations <= payment amount for every payment (% over)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 4. Ledger entries per payment match its status: SUCCESS -> one PAYMENT; REVERSED -> one
  --    PAYMENT and one REVERSAL; INITIATED/PENDING/FAILED -> none. Amounts mirror the payment.
  select count(*) into v_count
  from payments p
  left join lateral (
    select
      count(*) filter (where type = 'PAYMENT')  as n_payment,
      count(*) filter (where type = 'REVERSAL') as n_reversal,
      coalesce(sum(amount_paise) filter (where type = 'PAYMENT'), 0)  as payment_sum,
      coalesce(sum(amount_paise) filter (where type = 'REVERSAL'), 0) as reversal_sum
    from ledger_entries e where e.ref_id = p.id
  ) e on true
  where not (
    (p.status = 'SUCCESS'  and e.n_payment = 1 and e.n_reversal = 0 and e.payment_sum = -p.amount_paise) or
    (p.status = 'REVERSED' and e.n_payment = 1 and e.n_reversal = 1 and e.payment_sum = -p.amount_paise
                           and e.reversal_sum = p.amount_paise) or
    (p.status in ('INITIATED', 'PENDING', 'FAILED') and e.n_payment = 0 and e.n_reversal = 0)
  );
  raise notice '[%] ledger entries match payment status (% payments wrong)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 5. Every installment has exactly one DEMAND entry, every concession one CONCESSION entry.
  select count(*) into v_count
  from installments i
  where (select count(*) from ledger_entries e where e.ref_id = i.id and e.type = 'DEMAND' and e.amount_paise = i.amount_paise) <> 1;
  select v_count + count(*) into v_count
  from concessions c
  where (select count(*) from ledger_entries e where e.ref_id = c.id and e.type = 'CONCESSION' and e.amount_paise = -c.amount_paise) <> 1;
  raise notice '[%] one DEMAND per installment, one CONCESSION per concession (% wrong)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 6. Nobody has unallocated credit while an installment is still open (advance only
  --    exists once everything is paid).
  select count(*) into v_count
  from students s
  where exists (select 1 from v_installment_status v where v.student_id = s.id and v.remaining_paise > 0)
    and exists (
      select 1 from payments p
      where p.student_id = s.id and p.status = 'SUCCESS'
        and p.amount_paise > coalesce((select sum(a.amount_paise) from payment_allocations a where a.payment_id = p.id), 0));
  raise notice '[%] no unallocated credit alongside open installments (% students)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 7. The last payment_event of each payment matches its current status.
  select count(*) into v_count
  from payments p
  where p.status is distinct from (select e.to_status from payment_events e where e.payment_id = p.id order by e.id desc limit 1);
  raise notice '[%] latest payment event matches payment status (% wrong)', case when v_count = 0 then 'PASS' else 'FAIL' end, v_count;
  if v_count > 0 then v_failed := v_failed + 1; end if;

  -- 8. The ledger really is append-only: UPDATE and DELETE are rejected by the trigger.
  v_ok := false;
  begin
    update ledger_entries set note = 'tampered' where id = (select min(id) from ledger_entries);
  exception when others then
    v_ok := sqlerrm like '%append-only%';
  end;
  begin
    delete from ledger_entries where id = (select min(id) from ledger_entries);
    v_ok := false;
  exception when others then
    v_ok := v_ok and sqlerrm like '%append-only%';
  end;
  raise notice '[%] ledger_entries rejects UPDATE and DELETE', case when v_ok then 'PASS' else 'FAIL' end;
  if not v_ok then v_failed := v_failed + 1; end if;

  -- 9. Illegal status transitions are rejected (FAILED -> SUCCESS).
  v_ok := false;
  begin
    update payments set status = 'SUCCESS' where id = (select id from payments where status = 'FAILED' limit 1);
    v_ok := not found;  -- no FAILED payment to try: treat as not applicable
  exception when others then
    v_ok := sqlerrm like 'Payment cannot move from%';
  end;
  raise notice '[%] illegal payment transition FAILED -> SUCCESS is rejected', case when v_ok then 'PASS' else 'FAIL' end;
  if not v_ok then v_failed := v_failed + 1; end if;

  if v_failed > 0 then
    raise exception 'Ledger verification failed: % check(s) failed.', v_failed;
  end if;
  raise notice 'All ledger checks passed.';
end;
$$;

-- Summary of the scenario students, for eyeballing.
select roll_no, name, status,
       total_demand_paise / 100 as demand_inr,
       total_concession_paise / 100 as concession_inr,
       total_paid_paise / 100 as paid_inr,
       balance_paise / 100 as balance_inr,
       overdue_paise / 100 as overdue_inr,
       pending_count
from v_student_balances
where roll_no in ('BCA25-001', 'CSE24-001', 'BCOM26-001', 'CSE25-002', 'CSE24-003', 'BCA26-002', 'BCOM25-002')
order by roll_no;
