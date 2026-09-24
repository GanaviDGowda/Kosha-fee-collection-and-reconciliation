"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/client/api";
import { formatINR } from "@/lib/money";

type Outcome = { outcome: "SUCCESS" | "FAILED" | "PENDING"; payment: { receiptNo: string | null; amountPaise: number } | null; message?: string };

/** "Check status": asks the mock gateway what happened to a pending payment. */
export function useCheckStatus(onChanged: () => void) {
  const toast = useToast();
  const [checking, setChecking] = useState<string | null>(null);

  async function check(paymentId: string) {
    setChecking(paymentId);
    try {
      const r = await api<Outcome>(`/api/payments/${paymentId}/check-status`, { body: {} });
      if (r.outcome === "SUCCESS") toast.success("Payment confirmed", `The gateway confirmed ${formatINR(r.payment!.amountPaise, { paise: "auto" })}. Receipt ${r.payment!.receiptNo}.`);
      else if (r.outcome === "FAILED") toast.error("Payment failed", "The gateway reports the payment was declined.");
      else toast.success("Still pending", r.message);
      if (r.outcome !== "PENDING") onChanged();
    } catch (err) {
      toast.error("Could not check status", errorMessage(err));
    } finally {
      setChecking(null);
    }
  }

  return { check, checking };
}
