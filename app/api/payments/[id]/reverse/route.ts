import { parseId } from "@/lib/api/access";
import { handle, jsonBody } from "@/lib/api/handler";
import { reverseSchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";
import { toPaymentDto, type PaymentRpcRow } from "@/lib/data/payments";

// POST /api/payments/:id/reverse  { reason }  SUCCESS -> REVERSED (admin only)
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const role = await requireRole("payment.reverse");
  const { reason } = reverseSchema.parse(await jsonBody(req));
  const row = await rpc<PaymentRpcRow>("reverse_payment", { p_payment_id: parseId(id, "Payment"), p_reason: reason, p_actor: role });
  return toPaymentDto(row);
});
