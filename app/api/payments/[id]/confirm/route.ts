import { parseId } from "@/lib/api/access";
import { handle, jsonBody } from "@/lib/api/handler";
import { confirmSchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";
import { toPaymentDto, type PaymentRpcRow } from "@/lib/data/payments";

// POST /api/payments/:id/confirm  { note? }  PENDING -> SUCCESS
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const role = await requireRole("payment.confirm_or_fail");
  const { note } = confirmSchema.parse(await jsonBody(req).catch(() => ({})));
  const row = await rpc<PaymentRpcRow>("confirm_payment", { p_payment_id: parseId(id, "Payment"), p_actor: role, p_note: note ?? null });
  return toPaymentDto(row);
});
