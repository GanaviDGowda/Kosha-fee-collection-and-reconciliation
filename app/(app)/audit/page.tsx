import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { UrlFilters } from "@/components/ui/url-filters";
import { auditQuerySchema } from "@/lib/api/schemas";
import { ROLE_LABEL, isRole } from "@/lib/auth/permissions";
import { guardPage } from "@/lib/auth/page-guard";
import { listAudit, type AuditItem } from "@/lib/data/audit";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const ACTOR_TONE: Record<string, Tone> = { admin: "accent", accountant: "neutral", student: "neutral", gateway: "pending", system: "neutral" };
const actorLabel = (a: string) => (isRole(a) ? ROLE_LABEL[a] : a === "gateway" ? "Gateway" : "System");

function linkFor(a: AuditItem): string | null {
  if (a.entity === "payment" && a.entityId) return `/payments/${a.entityId}`;
  if (a.entity === "reconciliation_run" && a.entityId) return `/reconciliation/${a.entityId}`;
  if (a.entity === "reconciliation_item" && typeof a.details.run_id === "string") return `/reconciliation/${a.details.run_id}`;
  if (a.entity === "concession" && a.studentId) return `/students/${a.studentId}`;
  return null;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await guardPage("audit.view");
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const parsed = auditQuerySchema.safeParse({ actor: first(raw.actor), entity: first(raw.entity), q: first(raw.q) });
  const filters = parsed.success ? parsed.data : { limit: 200 };
  const items = await listAudit(filters);
  const filtered = Boolean(filters.actor || filters.entity || filters.q);

  return (
    <>
      <PageHeader title="Audit log" description="Every money function writes one line here: who did what, to which record, and why. Newest first." />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <UrlFilters
            searchLabel="Search the audit log"
            searchPlaceholder="Receipt, gateway ref or reason"
            selects={[
              {
                name: "actor",
                label: "Actor",
                allLabel: "Anyone",
                options: ["admin", "accountant", "student", "gateway", "system"].map((a) => ({ value: a, label: actorLabel(a) })),
              },
              {
                name: "entity",
                label: "Record",
                allLabel: "Any record",
                options: [
                  { value: "payment", label: "Payments" },
                  { value: "concession", label: "Concessions" },
                  { value: "reconciliation_run", label: "Reconciliation runs" },
                  { value: "reconciliation_item", label: "Reconciliation items" },
                  { value: "demo", label: "Demo resets" },
                ],
              },
            ]}
          />
          <p className="text-sm text-muted">
            <span className="figure">{items.length}</span> {items.length === 200 ? "most recent entries" : "entries"}
          </p>
        </div>
        {items.length === 0 ? (
          <EmptyState title={filtered ? "No entries match these filters" : "Nothing logged yet"} action={filtered ? <Link href="/audit" className="text-accent hover:underline">Clear the filters</Link> : undefined}>
            {filtered ? "Try another actor, record type or search." : "Entries appear as soon as a payment, concession or reconciliation is recorded."}
          </EmptyState>
        ) : (
          <div className="max-h-[calc(100vh-260px)] overflow-auto">
            <table className="ledger-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col" className="w-[190px]">
                    When
                  </th>
                  <th scope="col" className="w-[120px]">
                    Who
                  </th>
                  <th scope="col">What happened</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const href = linkFor(a);
                  return (
                    <tr key={a.id}>
                      <td className="figure whitespace-nowrap text-sm text-muted">{formatDateTime(a.createdAt)}</td>
                      <td>
                        <StatusBadge tone={ACTOR_TONE[a.actor] ?? "neutral"}>{actorLabel(a.actor)}</StatusBadge>
                      </td>
                      <td>
                        {href ? (
                          <Link href={href} className="hover:text-accent hover:underline">
                            {a.text}
                          </Link>
                        ) : (
                          a.text
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
