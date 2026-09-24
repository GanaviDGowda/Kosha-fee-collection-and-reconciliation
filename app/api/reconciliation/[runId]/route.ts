import { parseId } from "@/lib/api/access";
import { handle } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/session";
import { getReconRun } from "@/lib/data/reconciliation";

// GET /api/reconciliation/:runId  run totals, items by bucket, rejected rows
export const GET = handle<{ runId: string }>(async (_req, { runId }) => {
  await requireRole("reconciliation.run");
  return getReconRun(parseId(runId, "Reconciliation run"));
});
