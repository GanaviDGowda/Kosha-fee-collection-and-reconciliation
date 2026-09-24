import { handle } from "@/lib/api/handler";
import { auditQuerySchema, searchParamsObject } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { listAudit } from "@/lib/data/audit";

// GET /api/audit?actor=&entity=&q=
export const GET = handle(async (req) => {
  await requireRole("audit.view");
  const filters = auditQuerySchema.parse(searchParamsObject(req.nextUrl.searchParams));
  return listAudit(filters);
});
