// Payment lifecycle. The same table lives in the database (payment_transitions, 001_schema.sql),
// which is what actually enforces it; tests/unit/payment-state.test.ts asserts the two agree.

export const PAYMENT_STATUSES = ["INITIATED", "PENDING", "SUCCESS", "FAILED", "REVERSED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const ONLINE_MODES: readonly PaymentMode[] = ["UPI", "CARD"];

export const SIMULATED_OUTCOMES = ["SUCCEED", "FAIL", "TIMEOUT"] as const;
export type SimulatedOutcome = (typeof SIMULATED_OUTCOMES)[number];

export const TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  INITIATED: ["PENDING", "SUCCESS"], // PENDING: sent to gateway; SUCCESS: cash / bank transfer at the counter
  PENDING: ["SUCCESS", "FAILED"],
  SUCCESS: ["REVERSED"],
  FAILED: [],
  REVERSED: [],
};

export function isOnlineMode(mode: PaymentMode): boolean {
  return ONLINE_MODES.includes(mode);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: PaymentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: PaymentStatus,
    readonly to: PaymentStatus,
  ) {
    super(`Payment cannot move from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** Which actions the UI should offer for a payment in this status. */
export function availableActions(status: PaymentStatus): { checkStatus: boolean; fail: boolean; reverse: boolean; receipt: boolean } {
  return {
    checkStatus: status === "PENDING",
    fail: canTransition(status, "FAILED"),
    reverse: canTransition(status, "REVERSED"),
    receipt: status === "SUCCESS" || status === "REVERSED",
  };
}

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  INITIATED: "Initiated",
  PENDING: "Pending",
  SUCCESS: "Success",
  FAILED: "Failed",
  REVERSED: "Reversed",
};

export const MODE_LABEL: Record<PaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};
