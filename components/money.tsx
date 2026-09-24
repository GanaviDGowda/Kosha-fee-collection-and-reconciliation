import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";

/** A money figure: tabular digits, never wraps. */
export function Money({ paise, className, auto }: { paise: number; className?: string; auto?: boolean }) {
  return <span className={cn("figure whitespace-nowrap", className)}>{formatINR(paise, auto ? { paise: "auto" } : undefined)}</span>;
}

/** Balance: owed as a plain figure, credit shown as "Advance ₹X". */
export function Balance({ paise, className }: { paise: number; className?: string }) {
  if (paise < 0) {
    return (
      <span className={cn("figure whitespace-nowrap text-accent", className)}>
        <span className="text-sm">Advance </span>
        {formatINR(-paise)}
      </span>
    );
  }
  return <span className={cn("figure whitespace-nowrap", paise === 0 && "text-muted", className)}>{formatINR(paise)}</span>;
}
