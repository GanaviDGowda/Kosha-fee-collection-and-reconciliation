import { parseId } from "@/lib/api/access";
import { handle, jsonBody } from "@/lib/api/handler";
import { failSchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";
import { toPaymentDto, type PaymentRpcRow } from "@/lib/data/payments";

// POST /api/payments/:id/fail  { reason }  PENDING -> FAILED
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const role = await requireRole("payment.confirm_or_fail");
  const { reason } = failSchema.parse(await jsonBody(req));
  const row = await rpc<PaymentRpcRow>("fail_payment", { p_payment_id: parseId(id, "Payment"), p_reason: reason, p_actor: role });
  return toPaymentDto(row);
});
