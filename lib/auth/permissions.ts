// Simulated RBAC. One matrix, used by the API (403s) and the UI (what to hide).
// Real login is out of scope; the role comes from the kosha_role cookie.

export const ROLES = ["admin", "accountant", "student"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "dashboard.view",
  "students.view_all",
  "statement.view_own",
  "payment.record", // any mode, any student
  "payment.pay_online_own", // UPI / card, own account only
  "payment.check_status",
  "payment.confirm_or_fail",
  "payment.reverse",
  "concession.apply",
  "reconciliation.run",
  "audit.view",
  "demo.reset",
] as const;
export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Action, readonly Role[]> = {
  "dashboard.view": ["admin", "accountant"],
  "students.view_all": ["admin", "accountant"],
  "statement.view_own": ["admin", "accountant", "student"],
  "payment.record": ["admin", "accountant"],
  "payment.pay_online_own": ["admin", "accountant", "student"],
  "payment.check_status": ["admin", "accountant", "student"],
  "payment.confirm_or_fail": ["admin", "accountant"],
  "payment.reverse": ["admin"],
  "concession.apply": ["admin"],
  "reconciliation.run": ["admin", "accountant"],
  "audit.view": ["admin", "accountant"],
  "demo.reset": ["admin"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  accountant: "Accountant",
  student: "Student",
};

export const ROLE_COOKIE = "kosha_role";
export const DEFAULT_ROLE: Role = "admin";
