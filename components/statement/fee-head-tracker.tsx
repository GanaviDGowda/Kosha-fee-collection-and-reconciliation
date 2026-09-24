import { BookOpen, Building2, CheckCircle2, Coins, GraduationCap, Layers, Sparkles } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { FeeHeadSummary } from "@/lib/data/students";
import { formatINR } from "@/lib/money";

const money = (p: number) => formatINR(p, { paise: "auto" });

function getFeeHeadIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("tuition")) return GraduationCap;
  if (lower.includes("hostel") || lower.includes("mess") || lower.includes("residence")) return Building2;
  if (lower.includes("lab") || lower.includes("library") || lower.includes("book")) return BookOpen;
  if (lower.includes("development") || lower.includes("amenities") || lower.includes("infra")) return Layers;
  if (lower.includes("activity") || lower.includes("sports") || lower.includes("cultural")) return Sparkles;
  return Coins;
}

export function FeeHeadTracker({ heads }: { heads: FeeHeadSummary[] }) {
  const totalDemand = heads.reduce((sum, h) => sum + h.demandPaise, 0);
  const totalPaid = heads.reduce((sum, h) => sum + h.paidPaise, 0);
  const totalConcessions = heads.reduce((sum, h) => sum + h.concessionPaise, 0);
  const totalRemaining = heads.reduce((sum, h) => sum + h.remainingPaise, 0);
  const totalOverdue = heads.reduce((sum, h) => sum + h.overduePaise, 0);

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Fee head breakdown"
        description={`${heads.length} fee heads · ${money(totalPaid)} collected of ${money(totalDemand)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="figure rounded-md border border-line bg-canvas px-2.5 py-1 text-muted">
              Total demand: <strong className="font-semibold text-ink">{money(totalDemand)}</strong>
            </span>
            {totalConcessions > 0 ? (
              <span className="figure rounded-md border border-reversed/20 bg-reversed/5 px-2.5 py-1 text-reversed font-medium">
                Concessions: {money(totalConcessions)}
              </span>
            ) : null}
            {totalOverdue > 0 ? (
              <span className="figure rounded-md border border-debit/20 bg-debit/5 px-2.5 py-1 text-debit font-medium">
                Overdue: {money(totalOverdue)}
              </span>
            ) : null}
            <span className="figure rounded-md border border-credit/20 bg-credit/5 px-2.5 py-1 text-credit font-medium">
              {totalRemaining === 0 ? "All fees cleared" : `Remaining: ${money(totalRemaining)}`}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {heads.map((h) => {
          const Icon = getFeeHeadIcon(h.feeHead);
          const settledPaise = h.paidPaise + h.concessionPaise;
          const pct = h.demandPaise > 0 ? Math.min(100, Math.round((settledPaise / h.demandPaise) * 100)) : 0;
          const isCleared = h.remainingPaise === 0;
          const isOverdue = h.overduePaise > 0;

          return (
            <div
              key={h.feeHead}
              className="flex flex-col justify-between rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-canvas/40"
            >
              <div>
                {/* Header: Icon, Name & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-canvas text-muted">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <h3 className="truncate font-semibold text-ink text-sm" title={h.feeHead}>
                      {h.feeHead}
                    </h3>
                  </div>
                  {isCleared ? (
                    <StatusBadge tone="credit">Cleared</StatusBadge>
                  ) : isOverdue ? (
                    <StatusBadge tone="debit">Overdue</StatusBadge>
                  ) : h.paidPaise > 0 ? (
                    <StatusBadge tone="pending">Partly paid</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Due</StatusBadge>
                  )}
                </div>

                {/* Primary Metric: Outstanding Balance */}
                <div className="mt-3.5">
                  <p className="text-xs text-muted">Remaining balance</p>
                  <p className="figure mt-0.5 text-xl font-bold tracking-tight text-ink">
                    {isCleared ? (
                      <span className="inline-flex items-center gap-1.5 text-credit text-lg font-semibold">
                        <CheckCircle2 className="size-4" aria-hidden />
                        {money(0)}
                      </span>
                    ) : (
                      money(h.remainingPaise)
                    )}
                  </p>
                </div>

                {/* Breakdown List */}
                <dl className="mt-3 space-y-1.5 border-t border-line/60 pt-3 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Total demand</dt>
                    <dd className="figure font-medium text-ink">{money(h.demandPaise)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted">Paid amount</dt>
                    <dd className="figure font-medium text-credit">{money(h.paidPaise)}</dd>
                  </div>
                  {h.concessionPaise > 0 ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Concession</dt>
                      <dd className="figure font-medium text-reversed">{money(h.concessionPaise)}</dd>
                    </div>
                  ) : null}
                  {isOverdue ? (
                    <div className="flex items-center justify-between">
                      <dt className="text-debit font-medium">Overdue portion</dt>
                      <dd className="figure font-semibold text-debit">{money(h.overduePaise)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {/* Settlement Progress */}
              <div className="mt-4 pt-3 border-t border-line/40">
                <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                  <span>Settlement</span>
                  <span className="figure font-medium text-ink">{pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCleared ? "bg-credit" : isOverdue ? "bg-debit" : "bg-accent"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
