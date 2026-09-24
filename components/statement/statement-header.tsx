import { Clock } from "lucide-react";
import { Money } from "@/components/money";
import { cn } from "@/lib/cn";
import type { StudentDetail } from "@/lib/data/students";
import { describeBalance } from "@/lib/domain/balance-sentence";
import { formatINR } from "@/lib/money";

const TONE_TEXT = { debit: "text-debit", credit: "text-credit", accent: "text-accent", ink: "text-ink" } as const;

export function StatementHeader({ detail, actions, flash }: { detail: StudentDetail; actions?: React.ReactNode; flash?: boolean }) {
  const { student, balance, payments } = detail;
  const summary = describeBalance(balance);
  const pending = payments.filter((p) => p.status === "PENDING");
  const billed = balance.totalDemandPaise - balance.totalConcessionPaise;

  return (
    <section className="rounded-panel border border-line bg-surface">
      <div className="flex flex-col gap-6 px-5 py-5 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold sm:text-xl">{student.name}</h1>
          <p className="mt-1 text-muted">
            <span className="mr-2 font-mono text-sm text-ink">{student.rollNo}</span>
            <span className="block sm:inline">
              {student.courseName}, year {student.year}
            </span>
          </p>
        </div>
        {actions ? <div className="no-print flex flex-wrap gap-2 md:justify-end">{actions}</div> : null}
      </div>

      <div className="grid gap-6 border-t border-line px-5 py-5 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm text-muted">{summary.label}</p>
          <p
            key={balance.balancePaise /* remount on change so the flash replays */}
            className={cn("figure mt-0.5 inline-block rounded px-1 -mx-1 text-2xl font-semibold tracking-[-0.01em]", balance.balancePaise < 0 && "text-accent", flash && "balance-flash")}
            data-testid="balance"
            aria-live="polite"
          >
            {formatINR(Math.abs(balance.balancePaise))}
          </p>
          <p className="mt-1.5 max-w-xl">
            <span className={TONE_TEXT[summary.tone]}>{summary.sentence}</span>
            {summary.followUp ? <span className="text-muted"> {summary.followUp}</span> : null}
          </p>
          {pending.length > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded tint-pending px-2 py-1 text-sm">
              <Clock className="size-3.5" aria-hidden />
              {pending.length === 1 ? "1 payment" : `${pending.length} payments`} of{" "}
              {formatINR(pending.reduce((s, p) => s + p.amountPaise, 0), { paise: "auto" })} waiting for the gateway. Not counted until confirmed.
            </p>
          ) : null}
        </div>

        <dl className="grid grid-cols-3 divide-x divide-line rounded border border-line text-right">
          {[
            ["Billed", billed],
            ["Concessions", balance.totalConcessionPaise],
            ["Paid", balance.totalPaidPaise],
          ].map(([label, value]) => (
            <div key={label as string} className="px-3 py-2.5 sm:px-4">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium sm:text-base">
                <Money paise={value as number} auto />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
