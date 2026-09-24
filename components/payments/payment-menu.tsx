"use client";

import { Ban, Eye, MoreHorizontal, ReceiptText, RefreshCw, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { can, type Role } from "@/lib/auth/permissions";
import { availableActions, type PaymentStatus } from "@/lib/domain/payment-state";

/** Row menu for a payment: view, receipt, check status, mark failed, reverse (by role and status). */
export function PaymentMenu({
  paymentId,
  status,
  role,
  label,
  busy,
  onCheckStatus,
  onFail,
  onReverse,
}: {
  paymentId: string;
  status: PaymentStatus;
  role: Role;
  label: string;
  busy?: boolean;
  onCheckStatus: () => void;
  onFail: () => void;
  onReverse: () => void;
}) {
  const a = availableActions(status);
  const canFail = a.fail && can(role, "payment.confirm_or_fail");
  const canReverse = a.reverse && can(role, "payment.reverse");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} loading={busy}>
          {busy ? null : <MoreHorizontal aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/payments/${paymentId}`}>
            <Eye aria-hidden />
            View details
          </Link>
        </DropdownMenuItem>
        {a.receipt ? (
          <DropdownMenuItem asChild>
            <Link href={`/payments/${paymentId}/receipt`}>
              <ReceiptText aria-hidden />
              View receipt
            </Link>
          </DropdownMenuItem>
        ) : null}
        {a.checkStatus && can(role, "payment.check_status") ? (
          <DropdownMenuItem onSelect={onCheckStatus}>
            <RefreshCw aria-hidden />
            Check status
          </DropdownMenuItem>
        ) : null}
        {canFail || canReverse ? <DropdownMenuSeparator /> : null}
        {canFail ? (
          <DropdownMenuItem destructive onSelect={onFail}>
            <Ban aria-hidden />
            Mark as failed
          </DropdownMenuItem>
        ) : null}
        {canReverse ? (
          <DropdownMenuItem destructive onSelect={onReverse}>
            <Undo2 aria-hidden />
            Reverse payment
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
