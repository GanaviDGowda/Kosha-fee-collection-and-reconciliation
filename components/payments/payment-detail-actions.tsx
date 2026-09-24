"use client";

import { Ban, ReceiptText, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PaymentTransitionDrawer, type TransitionTarget } from "@/components/payments/payment-transition-drawer";
import { useCheckStatus } from "@/components/payments/use-check-status";
import { Button } from "@/components/ui/button";
import { can, type Role } from "@/lib/auth/permissions";
import { availableActions, type PaymentStatus } from "@/lib/domain/payment-state";

export function PaymentDetailActions({ role, status, target }: { role: Role; status: PaymentStatus; target: TransitionTarget }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const { check, checking } = useCheckStatus(refresh);
  const [kind, setKind] = useState<"reverse" | "fail" | null>(null);
  const a = availableActions(status);

  return (
    <div className="no-print flex flex-wrap gap-2">
      {a.receipt ? (
        <Button variant="secondary" asChild>
          <Link href={`/payments/${target.id}/receipt`}>
            <ReceiptText aria-hidden />
            View receipt
          </Link>
        </Button>
      ) : null}
      {a.checkStatus && can(role, "payment.check_status") ? (
        <Button variant="secondary" onClick={() => check(target.id)} loading={checking === target.id}>
          {checking ? null : <RefreshCw aria-hidden />}
          Check status
        </Button>
      ) : null}
      {a.fail && can(role, "payment.confirm_or_fail") ? (
        <Button variant="secondary" onClick={() => setKind("fail")}>
          <Ban aria-hidden />
          Mark as failed
        </Button>
      ) : null}
      {a.reverse && can(role, "payment.reverse") ? (
        <Button variant="secondary" className="text-debit" onClick={() => setKind("reverse")}>
          <Undo2 aria-hidden />
          Reverse payment
        </Button>
      ) : null}
      <PaymentTransitionDrawer kind={kind ?? "reverse"} payment={kind ? target : null} onOpenChange={(o) => !o && setKind(null)} onDone={refresh} />
    </div>
  );
}
