import { parseId } from "@/lib/api/access";
import { handle, jsonBody } from "@/lib/api/handler";
import { resolveSchema } from "@/lib/api/schemas";
import { requireRole } from "@/lib/auth/session";
import { rpc } from "@/lib/data/db";

// POST /api/reconciliation/items/:id/resolve  { resolution: MARKED_PAID | REVIEWED, note? }
export const POST = handle<{ id: string }>(async (req, { id }) => {
  const role = await requireRole("reconciliation.run");
  const { resolution, note } = resolveSchema.parse(await jsonBody(req));
  const row = await rpc<{ id: string; run_id: string; bucket: string; resolution: string; resolution_note: string | null; resolved_by: string; resolved_at: string }>(
    "resolve_recon_item",
    { p_item_id: parseId(id, "Reconciliation item"), p_resolution: resolution, p_actor: role, p_note: note ?? null },
  );
  return {
    id: row.id,
    runId: row.run_id,
    bucket: row.bucket,
    resolution: row.resolution,
    resolutionNote: row.resolution_note,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
  };
});
