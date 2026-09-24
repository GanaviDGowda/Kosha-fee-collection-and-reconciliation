import { assertOwnPaymentIfStudent, parseId } from "@/lib/api/access";
import { handle } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/session";
import { getPaymentDetail } from "@/lib/data/payments";

// GET /api/payments/:id  payment, state track (events), allocations, ledger entries, audit trail
export const GET = handle<{ id: string }>(async (_req, { id }) => {
  const role = await requireRole("statement.view_own");
  const detail = await getPaymentDetail(parseId(id, "Payment"));
  await assertOwnPaymentIfStudent(role, detail.payment.studentId);
  return detail;
});
