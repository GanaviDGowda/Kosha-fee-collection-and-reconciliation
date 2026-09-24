import { safeSearch } from "@/lib/api/schemas";
import { describeAudit } from "@/lib/domain/audit-text";
import { db, run } from "@/lib/data/db";

export type AuditItem = {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  studentId: string | null;
  studentName: string | null;
  text: string;
};

export async function listAudit(filters: { actor?: string; entity?: string; q?: string; limit: number }): Promise<AuditItem[]> {
  const client = db();
  let query = client.from("audit_log").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(filters.limit);
  if (filters.actor) query = query.eq("actor", filters.actor);
  if (filters.entity) query = query.eq("entity", filters.entity);
  const q = safeSearch(filters.q);
  if (q) query = query.or(`action.ilike.*${q}*,details->>receipt_no.ilike.*${q}*,details->>gateway_ref.ilike.*${q}*,details->>reason.ilike.*${q}*`);

  const rows = await run<{ id: number; actor: string; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }[]>(query);

  const studentIds = [...new Set(rows.map((r) => r.details?.student_id).filter((v): v is string => typeof v === "string"))];
  const names = new Map<string, string>();
  if (studentIds.length) {
    const students = await run<{ id: string; name: string }[]>(client.from("students").select("id, name").in("id", studentIds));
    for (const s of students) names.set(s.id, s.name);
  }

  return rows.map((r) => {
    const studentId = typeof r.details?.student_id === "string" ? r.details.student_id : null;
    const studentName = studentId ? (names.get(studentId) ?? null) : null;
    return {
      id: Number(r.id),
      actor: r.actor,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      details: r.details ?? {},
      createdAt: r.created_at,
      studentId,
      studentName,
      text: describeAudit({ actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id, details: r.details ?? {} }, studentName),
    };
  });
}
