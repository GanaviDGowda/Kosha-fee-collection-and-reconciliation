"use client";

// The interactive statement: header actions, drawers, payment row menus. Data comes from the
// server component; after any change we navigate/refresh so the server re-renders the
// statement from the database (the single source of truth).

import { BadgePercent, CreditCard, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ConcessionDrawer } from "@/components/payments/concession-drawer";
import { PaymentMenu } from "@/components/payments/payment-menu";
import { PaymentTransitionDrawer, type TransitionTarget } from "@/components/payments/payment-transition-drawer";
import { RecordPaymentDrawer, type RecordedPayment } from "@/components/payments/record-payment-drawer";
import { useCheckStatus } from "@/components/payments/use-check-status";
import { FeeHeadTracker } from "@/components/statement/fee-head-tracker";
import { StatementHeader } from "@/components/statement/statement-header";
import { StatementTabs } from "@/components/statement/statement-tabs";
import { Button } from "@/components/ui/button";
import { can, type Role } from "@/lib/auth/permissions";
import type { StudentDetail } from "@/lib/data/students";

type Payment = StudentDetail["payments"][number];

const toTarget = (p: Payment): TransitionTarget => ({
  id: p.id,
  amountPaise: p.amountPaise,
  mode: p.mode,
  receiptNo: p.receiptNo,
  gatewayRef: p.gatewayRef,
  date: p.paidAt ?? p.createdAt,
  allocations: p.allocations,
});

export function StudentWorkspace({ detail, role, highlightPaymentId }: { detail: StudentDetail; role: Role; highlightPaymentId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [payOpen, setPayOpen] = useState(false);
  const [concessionOpen, setConcessionOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<TransitionTarget | null>(null);
  const [failTarget, setFailTarget] = useState<TransitionTarget | null>(null);
  const refresh = () => router.refresh();
  const { check, checking } = useCheckStatus(refresh);

  const staff = can(role, "payment.record");
  const canPay = staff || can(role, "payment.pay_online_own");
  const { balance } = detail;
  const suggested = balance.overduePaise > 0 ? balance.overduePaise : balance.nextDuePaise;

  function onRecorded(p: RecordedPayment) {
    // Signature moment: the new row flashes and the balance updates. Pending payments have no
    // ledger row yet, so they are shown on the Payments tab instead.
    const tab = p.status === "SUCCESS" ? "" : "&tab=payments";
    router.replace(`${pathname}?highlight=${p.id}${tab}`, { scroll: false });
  }

  const actions = (
    <>
      {canPay ? (
        <Button onClick={() => setPayOpen(true)}>
          {staff ? <Plus aria-hidden /> : <CreditCard aria-hidden />}
          {staff ? "Record payment" : "Pay online"}
        </Button>
      ) : null}
      {can(role, "concession.apply") ? (
        <Button variant="secondary" onClick={() => setConcessionOpen(true)}>
          <BadgePercent aria-hidden />
          Apply concession
        </Button>
      ) : null}
    </>
  );

  return (
    <>
      <StatementHeader detail={detail} actions={actions} flash={Boolean(highlightPaymentId)} />
      <FeeHeadTracker heads={detail.feeHeads} />
      <StatementTabs
        detail={detail}
        highlightPaymentId={highlightPaymentId}
        emptyPaymentsAction={
          canPay ? (
            <Button onClick={() => setPayOpen(true)}>
              <Plus aria-hidden />
              {staff ? "Record payment" : "Pay online"}
            </Button>
          ) : undefined
        }
        paymentActions={(p) => (
          <PaymentMenu
            paymentId={p.id}
            status={p.status}
            role={role}
            label={p.receiptNo ?? p.gatewayRef ?? "payment"}
            busy={checking === p.id}
            onCheckStatus={() => check(p.id)}
            onFail={() => setFailTarget(toTarget(p))}
            onReverse={() => setReverseTarget(toTarget(p))}
          />
        )}
      />

      <RecordPaymentDrawer
        open={payOpen}
        onOpenChange={setPayOpen}
        role={role}
        student={{ id: detail.student.id, name: detail.student.name, rollNo: detail.student.rollNo }}
        installments={detail.installments}
        suggestedPaise={suggested}
        onRecorded={onRecorded}
      />
      <ConcessionDrawer open={concessionOpen} onOpenChange={setConcessionOpen} student={detail.student} installments={detail.installments} onApplied={refresh} />
      <PaymentTransitionDrawer kind="reverse" payment={reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)} onDone={refresh} />
      <PaymentTransitionDrawer kind="fail" payment={failTarget} onOpenChange={(o) => !o && setFailTarget(null)} onDone={refresh} />
    </>
  );
}
