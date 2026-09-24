-- Builds public/samples/settlement_sample.csv from the freshly seeded demo data.
-- It plays the gateway: every online transaction the gateway settled (final_status SUCCESS)
-- up to 22 Sep 2026, settled T+1 at 11:00 IST, with two deliberate discrepancies:
--   * the earliest card payment settles Rs 500 short        -> Amount mismatch
--   * the third UPI payment is missing from the file         -> Recorded here, missing in settlement
-- The two timed-out UPI payments (19 and 21 Sep) are in the file as settled
--                                                           -> Settled but pending here
-- Everything else                                           -> Matched
with gw as (
  select g.gateway_ref, g.amount_paise, g.created_at, p.mode,
         row_number() over (partition by p.mode order by g.created_at, g.gateway_ref) as nth_in_mode
  from mock_gateway_txns g
  join payments p on p.gateway_ref = g.gateway_ref
  where g.final_status = 'SUCCESS'
    and g.created_at < timestamptz '2026-09-23 00:00+05:30'
)
select
  gateway_ref,
  to_char(case when mode = 'CARD' and nth_in_mode = 1 then amount_paise - 50000 else amount_paise end / 100.0, 'FM9999999990.00') as amount_inr,
  'SUCCESS' as status,
  to_char(((created_at at time zone 'Asia/Kolkata')::date + 1 + time '11:00'), 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as settled_at
from gw
where not (mode = 'UPI' and nth_in_mode = 3)
order by settled_at, gateway_ref;
