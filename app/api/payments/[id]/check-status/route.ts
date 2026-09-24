import { assertOwnPaymentIfStudent, parseId } from "@/lib/api/access";
import { ApiError } from "@/lib/api/errors";
import { handle } from "@/lib/api/handler";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";
import { getGatewayStatus, getPaymentBasics, toPaymentDto, type PaymentRpcRow } from "@/lib/data/payments";

// POST /api/payments/:id/check-status
// Asks the (mock) gateway what happened to a pending payment and applies the answer.
// The gateway is the actor on the resulting transition; who asked is kept in the note.
export const POST = handle<{ id: string }>(async (_req, { id }) => {
  const role = await requireRole("payment.check_status");
  const payment = await getPaymentBasics(parseId(id, "Payment"));
  await assertOwnPaymentIfStudent(role, payment.studentId);

  if (payment.status !== "PENDING") {
    const word = { INITIATED: "being set up", SUCCESS: "paid", FAILED: "marked as failed", REVERSED: "reversed", PENDING: "pending" }[payment.status];
    throw new ApiError(409, "payment_not_pending", `This payment is already ${word}; there is nothing to check.`);
  }
  if (!payment.gatewayRef) throw new ApiError(409, "not_online", "Only UPI and card payments have a gateway status.");

  const gateway = await getGatewayStatus(payment.gatewayRef);
  const note = `Gateway status check requested by ${ROLE_LABEL[role]}`;

  if (gateway === "SUCCESS") {
    const row = await rpc<PaymentRpcRow>("confirm_payment", { p_payment_id: payment.id, p_actor: "gateway", p_note: `${note}: success` });
    return { outcome: "SUCCESS", payment: toPaymentDto(row) };
  }
  if (gateway === "FAILED") {
    const row = await rpc<PaymentRpcRow>("fail_payment", { p_payment_id: payment.id, p_reason: `${note}: declined by the payer's bank`, p_actor: "gateway" });
    return { outcome: "FAILED", payment: toPaymentDto(row) };
  }
  return { outcome: "PENDING", payment: null, message: "The gateway has no final answer yet. Try again later or wait for the settlement file." };
});
