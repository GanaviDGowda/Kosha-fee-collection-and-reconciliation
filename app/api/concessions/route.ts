import { NextResponse } from "next/server";
import { handle, jsonBody } from "@/lib/api/handler";
import { concessionSchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";

// POST /api/concessions  { installmentId, amountPaise, reason, approvedBy }  (admin only)
export const POST = handle(async (req) => {
  const role = await requireRole("concession.apply");
  const input = concessionSchema.parse(await jsonBody(req));
  const row = await rpc<{ id: string; student_id: string; installment_id: string; amount_paise: number; reason: string; approved_by: string; created_at: string }>(
    "apply_concession",
    {
      p_installment_id: input.installmentId,
      p_amount_paise: input.amountPaise,
      p_reason: input.reason,
      p_approved_by: input.approvedBy,
      p_actor: role,
    },
  );
  return NextResponse.json(
    {
      data: {
        id: row.id,
        studentId: row.student_id,
        installmentId: row.installment_id,
        amountPaise: Number(row.amount_paise),
        reason: row.reason,
        approvedBy: row.approved_by,
        createdAt: row.created_at,
      },
    },
    { status: 201 },
  );
});
