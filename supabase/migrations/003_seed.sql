-- Kosha: fee collection and reconciliation
-- 003_seed.sql: demo data that tells a story.
--
-- The seed is anchored to a fixed academic calendar (2026-27) and a demo "today" of
-- 24 Sep 2026, so gateway references, receipt numbers and the sample settlement file
-- in public/samples/ always line up after a reset.
--
-- Fee demand is raised directly (there is no fee-structure editor in scope). Every
-- payment, failure, timeout, concession and reversal after that goes through the same
-- functions the app calls, with kosha.clock set so the history has realistic dates.
--
-- Calendar
--   Term 1: tuition, hostel, library due 15 Aug 2026; exam fee due 15 Oct 2026
--   Term 2: tuition, hostel, library due 15 Jan 2027; exam fee due 15 Mar 2027
--
-- Scenario students (roll numbers mirrored in lib/demo/scenarios.ts)
--   BCA25-001  Ananya Rao      fully paid for the year
--   CSE24-001  Rohan Kulkarni  tuition cleared, hostel partly paid
--   BCOM26-001 Vikram Singh    nothing paid, overdue
--   CSE25-002  Priya Nair      merit concession on tuition, rest of term 1 paid
--   CSE24-003  Arjun Mehta     bank transfer returned and reversed, tuition reopened
--   BCA26-002  Sneha Iyer      UPI payment stuck in PENDING (gateway timed out)
--   BCOM25-002 Karthik Reddy   overpaid, Rs 2,500 advance

-- Sets the demo clock for the rest of the current transaction.
create or replace function _seed_clock(p_at timestamptz) returns void
language sql as $$
  select set_config('kosha.clock', p_at::text, true);
$$;

-- Local IST wall-clock time to timestamptz.
create or replace function _ist(p_local timestamp) returns timestamptz
language sql immutable as $$
  select p_local at time zone 'Asia/Kolkata';
$$;

-- Remaining due for a student's term (after concessions and payments so far).
create or replace function _seed_term_due(p_student_id uuid, p_term int) returns bigint
language sql stable as $$
  select coalesce(sum(_installment_remaining(i.id)), 0)::bigint
  from installments i
  where i.student_id = p_student_id and (p_term is null or i.term = p_term)
$$;

create or replace function _seed_pay(
  p_student_id uuid, p_amount_paise bigint, p_mode text, p_simulate text,
  p_at timestamptz, p_actor text, p_reference text default null
) returns uuid
language plpgsql as $$
declare
  v_result jsonb;
begin
  perform _seed_clock(p_at);
  v_result := record_payment(p_student_id, p_amount_paise, p_mode, gen_random_uuid(), p_simulate, p_actor, p_reference);
  return (v_result->>'id')::uuid;
end;
$$;

create or replace function seed_demo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student record;
  v_sid uuid;
  v_pid uuid;
  v_i int;
  v_pattern int;
  v_mode text;
  v_actor text;
  v_sim text;
  v_ref text;
  v_day date;
  v_at timestamptz;
  v_amount bigint;
begin
  perform _seed_clock(_ist('2026-07-01 09:00'));

  insert into courses (code, name) values
    ('CSE',  'B.Tech Computer Science and Engineering'),
    ('BCA',  'Bachelor of Computer Applications'),
    ('BCOM', 'Bachelor of Commerce');

  insert into fee_heads (name, sort_order) values
    ('Tuition', 1), ('Hostel', 2), ('Exam', 3), ('Library', 4);

  -- Roster: ord, name, course, year of study, hosteller, scenario key.
  -- Roll number = course code + two-digit admission year + '-' + sequence within course.
  insert into students (roll_no, name, course_id, year, email, phone)
  select
    r.course || lpad((27 - r.year)::text, 2, '0') || '-' ||
      lpad((row_number() over (partition by r.course order by r.ord))::text, 3, '0'),
    r.name,
    c.id,
    r.year,
    trim(both '.' from regexp_replace(lower(r.name), '[^a-z]+', '.', 'g')) || '@students.nandihills.example',
    '+91 9' || lpad(((r.ord * 7919 + 13) % 1000000000)::text, 9, '0')
  from (values
    -- scenario students first, so their roll numbers are stable
    ( 1, 'Ananya Rao',            'BCA',  2),
    ( 2, 'Rohan Kulkarni',        'CSE',  3),
    ( 3, 'Vikram Singh',          'BCOM', 1),
    ( 4, 'Priya Nair',            'CSE',  2),
    ( 5, 'Arjun Mehta',           'CSE',  3),
    ( 6, 'Sneha Iyer',            'BCA',  1),
    ( 7, 'Karthik Reddy',         'BCOM', 2),
    -- everyone else
    ( 8, 'Aditya Sharma',         'CSE',  1),
    ( 9, 'Meera Pillai',          'BCA',  2),
    (10, 'Siddharth Joshi',       'BCOM', 3),
    (11, 'Kavya Menon',           'CSE',  4),
    (12, 'Rahul Deshpande',       'BCA',  1),
    (13, 'Aishwarya Gowda',       'BCOM', 2),
    (14, 'Nikhil Patil',          'CSE',  2),
    (15, 'Divya Hegde',           'BCA',  3),
    (16, 'Harsh Vardhan Gupta',   'BCOM', 1),
    (17, 'Pooja Shetty',          'CSE',  3),
    (18, 'Aman Verma',            'BCA',  2),
    (19, 'Shruti Bhat',           'BCOM', 3),
    (20, 'Varun Naidu',           'CSE',  4),
    (21, 'Nandini Rao',           'BCA',  1),
    (22, 'Akash Yadav',           'BCOM', 2),
    (23, 'Lakshmi Narayanan',     'CSE',  1),
    (24, 'Tanvi Kapoor',          'BCA',  3),
    (25, 'Manish Tiwari',         'BCOM', 1),
    (26, 'Deepika Srinivasan',    'CSE',  2),
    (27, 'Gaurav Chauhan',        'BCA',  2),
    (28, 'Ritika Banerjee',       'BCOM', 3),
    (29, 'Suresh Babu',           'CSE',  3),
    (30, 'Anjali Mishra',         'BCA',  1),
    (31, 'Pranav Kamath',         'BCOM', 2),
    (32, 'Swati Agarwal',         'CSE',  4),
    (33, 'Mohammed Irfan',        'BCA',  3),
    (34, 'Fatima Sheikh',         'BCOM', 1),
    (35, 'Abhishek Pandey',       'CSE',  1),
    (36, 'Sanjana Reddy',         'BCA',  2),
    (37, 'Kunal Malhotra',        'BCOM', 3),
    (38, 'Bhavana Murthy',        'CSE',  2),
    (39, 'Yash Thakur',           'BCA',  1),
    (40, 'Neha Saxena',           'BCOM', 2),
    (41, 'Rajat Bansal',          'CSE',  3),
    (42, 'Keerthana Subramanian', 'BCA',  3),
    (43, 'Arvind Swamy',          'BCOM', 1),
    (44, 'Isha Chatterjee',       'CSE',  4),
    (45, 'Tejas Kulkarni',        'BCA',  2),
    (46, 'Madhuri Jadhav',        'BCOM', 3),
    (47, 'Sameer Khan',           'CSE',  1),
    (48, 'Pallavi Das',           'BCA',  1),
    (49, 'Vivek Anand',           'BCOM', 2),
    (50, 'Roshni D''Souza',       'CSE',  2),
    (51, 'Chetan Gowda',          'BCA',  3),
    (52, 'Anusha Prasad',         'BCOM', 1),
    (53, 'Farhan Ali',            'CSE',  3),
    (54, 'Gayatri Iyengar',       'BCA',  2),
    (55, 'Naveen Kumar',          'BCOM', 3),
    (56, 'Sowmya Raghavan',       'CSE',  4),
    (57, 'Dhruv Mehra',           'BCA',  1),
    (58, 'Jyoti Sinha',           'BCOM', 2),
    (59, 'Kiran Shenoy',          'CSE',  1),
    (60, 'Rekha Ramachandran',    'BCA',  3)
  ) as r(ord, name, course, year)
  join courses c on c.code = r.course
  order by r.ord;

  -- Installments: 4 heads x 2 terms; hostel only for hostellers.
  -- Hostellers: Rohan and Sneha among the scenarios, plus about 40% of everyone else
  -- (position in roll-number order is 0 or 2 mod 5).
  insert into installments (student_id, fee_head_id, term, label, amount_paise, due_date)
  select s.id, f.id, t.term, f.name || ' Term ' || t.term, fee.amount_paise,
         case
           when f.name = 'Exam' and t.term = 1 then date '2026-10-15'
           when f.name = 'Exam' and t.term = 2 then date '2027-03-15'
           when t.term = 1 then date '2026-08-15'
           else date '2027-01-15'
         end
  from (
    select s.*, c.code as course_code, row_number() over (order by s.roll_no) - 1 as pos
    from students s join courses c on c.id = s.course_id
  ) s
  cross join (values (1), (2)) as t(term)
  join (values
    ('CSE',  'Tuition', 6250000::bigint), ('CSE',  'Exam', 350000::bigint), ('CSE',  'Library', 150000::bigint),
    ('BCA',  'Tuition', 3800000::bigint), ('BCA',  'Exam', 250000::bigint), ('BCA',  'Library', 100000::bigint),
    ('BCOM', 'Tuition', 2800000::bigint), ('BCOM', 'Exam', 200000::bigint), ('BCOM', 'Library', 100000::bigint),
    ('CSE',  'Hostel',  4500000::bigint), ('BCA',  'Hostel', 4500000::bigint), ('BCOM', 'Hostel', 4500000::bigint)
  ) as fee(course_code, head, amount_paise) on fee.course_code = s.course_code
  join fee_heads f on f.name = fee.head
  where f.name <> 'Hostel'
     or s.roll_no in ('CSE24-001', 'BCA26-002')
     or (s.roll_no not in ('BCA25-001', 'CSE24-001', 'BCOM26-001', 'CSE25-002', 'CSE24-003', 'BCA26-002', 'BCOM25-002')
         and s.pos % 5 in (0, 2));

  -- Fee demand for the whole year is raised on 1 Jul 2026.
  insert into ledger_entries (student_id, type, amount_paise, ref_table, ref_id, note, created_at)
  select i.student_id, 'DEMAND', i.amount_paise, 'installments', i.id,
         'Fee demand: ' || i.label, _ist('2026-07-01 10:00')
  from installments i
  join fee_heads f on f.id = i.fee_head_id
  order by i.student_id, i.term, f.sort_order;

  -- ------------------------------------------------------------------
  -- Scenario 1: Ananya Rao, fully paid for the year.
  -- ------------------------------------------------------------------
  select id into v_sid from students where roll_no = 'BCA25-001';
  perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'BANK_TRANSFER', null, _ist('2026-08-12 11:05'),
                    'accountant', 'NEFT UTR SBINN52026081208811');
  perform _seed_pay(v_sid, _seed_term_due(v_sid, 2), 'UPI', 'SUCCEED', _ist('2026-09-20 18:22'), 'student');

  -- Scenario 2: Rohan Kulkarni, tuition cleared, hostel partly paid.
  select id into v_sid from students where roll_no = 'CSE24-001';
  perform _seed_pay(v_sid, 6250000 + 2000000, 'UPI', 'SUCCEED', _ist('2026-08-14 12:30'), 'student');

  -- Scenario 3: Vikram Singh pays nothing.

  -- Scenario 4: Priya Nair, 25% merit concession on tuition, then pays the rest of term 1.
  select id into v_sid from students where roll_no = 'CSE25-002';
  perform _seed_clock(_ist('2026-08-04 11:00'));
  perform apply_concession(
    (select i.id from installments i join fee_heads f on f.id = i.fee_head_id
      where i.student_id = v_sid and f.name = 'Tuition' and i.term = 1),
    1562500, 'Merit scholarship: 25% of tuition for a 9.6 CGPA in year 1',
    'Dr. Meena Krishnan, Dean (Academics)', 'admin');
  perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'CARD', 'SUCCEED', _ist('2026-08-13 16:45'), 'student');

  -- Scenario 5: Arjun Mehta, bank transfer returned by the bank and reversed.
  select id into v_sid from students where roll_no = 'CSE24-003';
  v_pid := _seed_pay(v_sid, 6250000, 'BANK_TRANSFER', null, _ist('2026-08-11 10:20'),
                     'accountant', 'NEFT UTR HDFCN52026081145517');
  perform _seed_pay(v_sid, 500000, 'UPI', 'SUCCEED', _ist('2026-08-14 15:05'), 'student');
  perform _seed_clock(_ist('2026-08-18 11:40'));
  perform reverse_payment(v_pid, 'NEFT returned by the remitting bank: beneficiary account mismatch (return code R03)', 'admin');

  -- Scenario 6: Sneha Iyer, UPI payment timed out at the gateway and is still pending.
  select id into v_sid from students where roll_no = 'BCA26-002';
  perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'UPI', 'TIMEOUT', _ist('2026-09-21 19:48'), 'student');

  -- Scenario 7: Karthik Reddy, parent transferred the full year plus Rs 2,500 extra.
  select id into v_sid from students where roll_no = 'BCOM25-002';
  perform _seed_pay(v_sid, _seed_term_due(v_sid, null) + 250000, 'BANK_TRANSFER', null, _ist('2026-08-16 13:15'),
                    'accountant', 'NEFT UTR ICICN52026081600417');

  -- ------------------------------------------------------------------
  -- Everyone else: about 45 days of ordinary collections, 9 Aug to 23 Sep 2026.
  -- Pattern by position i (0-based): 0-3 pay term 1 in full, 4 pays in two parts,
  -- 5 has a failed UPI attempt then pays part, 6 pays part in cash, 7 pays nothing,
  -- 8 pays the whole year, 9 pays term 1 late in September.
  -- ------------------------------------------------------------------
  v_i := 0;
  for v_student in
    select s.id, s.roll_no
    from students s
    where s.roll_no not in ('BCA25-001', 'CSE24-001', 'BCOM26-001', 'CSE25-002', 'CSE24-003', 'BCA26-002', 'BCOM25-002')
    order by s.created_at, s.name
  loop
    v_sid := v_student.id;
    v_pattern := v_i % 10;
    v_mode := (array['UPI', 'UPI', 'UPI', 'CARD', 'CASH', 'BANK_TRANSFER', 'BANK_TRANSFER'])[1 + v_i % 7];
    v_day := date '2026-08-09' + ((v_i * 17) % 45);  -- 17 and 45 are coprime, so dates spread evenly
    v_at := _ist(v_day + time '09:30' + make_interval(hours => v_i % 8, mins => (v_i * 7) % 50));

    -- A few named exceptions so the dashboard and reconciliation have something to show.
    if v_i = 2 then
      -- Timed out; the gateway later settles it (appears in the sample settlement file).
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'UPI', 'TIMEOUT', _ist('2026-09-19 14:10'), 'student');
      v_i := v_i + 1;
      continue;
    elsif v_i = 12 then
      -- Timed out this morning; not yet in any settlement file.
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'CARD', 'TIMEOUT', _ist('2026-09-24 09:40'), 'student');
      v_i := v_i + 1;
      continue;
    elsif v_i = 20 then
      -- Sports quota concession on tuition before paying.
      perform _seed_clock(_ist('2026-08-05 12:15'));
      perform apply_concession(
        (select i.id from installments i join fee_heads f on f.id = i.fee_head_id
          where i.student_id = v_sid and f.name = 'Tuition' and i.term = 1),
        1000000, 'Sports quota: state-level athletics', 'Prof. R. Venkatesh, Director of Physical Education', 'admin');
    end if;

    v_actor := case when v_mode in ('UPI', 'CARD') then 'student' else 'accountant' end;
    v_sim := case when v_mode in ('UPI', 'CARD') then 'SUCCEED' end;
    v_ref := case v_mode
               when 'BANK_TRANSFER' then 'NEFT UTR ' || 'CNRBN5202608' || lpad((v_i * 37)::text, 6, '0')
               when 'CASH' then 'Counter memo ' || lpad((400 + v_i)::text, 4, '0')
             end;

    if v_pattern in (0, 1, 2, 3) then
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), v_mode, v_sim, v_at, v_actor, v_ref);

    elsif v_pattern = 4 then
      v_amount := (select i.amount_paise from installments i join fee_heads f on f.id = i.fee_head_id
                    where i.student_id = v_sid and f.name = 'Tuition' and i.term = 1);
      perform _seed_pay(v_sid, v_amount, v_mode, v_sim, v_at, v_actor, v_ref);
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), v_mode, v_sim,
                        least(v_at + interval '12 days', _ist('2026-09-22 17:00')), v_actor, v_ref);

    elsif v_pattern = 5 then
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), 'UPI', 'FAIL', v_at, 'student');
      v_amount := (_seed_term_due(v_sid, 1) * 6 / 10) / 100000 * 100000;  -- ~60%, rounded down to Rs 1,000
      perform _seed_pay(v_sid, v_amount, 'UPI', 'SUCCEED', v_at + interval '1 day 2 hours', 'student');

    elsif v_pattern = 6 then
      v_amount := (_seed_term_due(v_sid, 1) * 6 / 10) / 100000 * 100000;
      perform _seed_pay(v_sid, v_amount, 'CASH', null, v_at, 'accountant', 'Counter memo ' || lpad((400 + v_i)::text, 4, '0'));

    elsif v_pattern = 8 then
      perform _seed_pay(v_sid, _seed_term_due(v_sid, null), v_mode, v_sim, v_at, v_actor, v_ref);

    elsif v_pattern = 9 then
      perform _seed_pay(v_sid, _seed_term_due(v_sid, 1), v_mode, v_sim,
                        _ist(date '2026-09-01' + (v_i % 21) + time '11:00'), v_actor, v_ref);
    end if;
    -- pattern 7: nothing paid

    v_i := v_i + 1;
  end loop;

  perform set_config('kosha.clock', '', true);

  return jsonb_build_object(
    'students', (select count(*) from students),
    'installments', (select count(*) from installments),
    'payments', (select count(*) from payments),
    'ledger_entries', (select count(*) from ledger_entries));
end;
$$;

-- Seed helpers are internal; only reset_demo() may call seed_demo().
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function seed_demo(), _seed_clock(timestamptz), _ist(timestamp),
      _seed_term_due(uuid, int), _seed_pay(uuid, bigint, text, text, timestamptz, text, text)
      from public, anon, authenticated, service_role;
  end if;
end;
$$;

select seed_demo();
