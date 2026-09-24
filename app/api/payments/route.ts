import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { handle, jsonBody } from "@/lib/api/handler";
import { createPaymentSchema, paymentsQuerySchema, searchParamsObject } from "@/lib/api/schemas";
import { can } from "@/lib/auth/permissions";
import { forbidden, getRole, requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";
import { listPayments, toPaymentDto, type PaymentRpcRow } from "@/lib/data/payments";
import { getDemoStudentId } from "@/lib/data/students";
import { isOnlineMode } from "@/lib/domain/payment-state";

// GET /api/payments?status=&mode=&q=
export const GET = handle(async (req) => {
  await requireRole("students.view_all");
  const filters = paymentsQuerySchema.parse(searchParamsObject(req.nextUrl.searchParams));
  return listPayments(filters);
});

// POST /api/payments  { studentId, amountPaise, mode, idempotencyKey, simulate?, reference? }
// 201 for a new payment, 200 when the idempotency key was already used (same payment returned).
export const POST = handle(async (req) => {
  const role = await getRole();
  const input = createPaymentSchema.parse(await jsonBody(req));

  if (!can(role, "payment.record")) {
    if (!can(role, "payment.pay_online_own")) throw forbidden(role, "payment.record");
    if (!isOnlineMode(input.mode)) throw new ApiError(403, "forbidden", "Students can only pay online with UPI or card.", "mode");
    if (input.studentId !== (await getDemoStudentId())) throw new ApiError(403, "forbidden", "Students can only pay into their own account.");
  }

  const row = await rpc<PaymentRpcRow>("record_payment", {
    p_student_id: input.studentId,
    p_amount_paise: input.amountPaise,
    p_mode: input.mode,
    p_idempotency_key: input.idempotencyKey,
    p_simulate: input.simulate ?? null,
    p_actor: role,
    p_reference: input.reference ?? null,
  });
  const payment = toPaymentDto(row);
  return NextResponse.json({ data: payment }, { status: payment.replayed ? 200 : 201 });
});
