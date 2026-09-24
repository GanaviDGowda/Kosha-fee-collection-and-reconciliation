// Server-side role lookup. The role switcher sets the kosha_role cookie; every route
// reads it here and checks the permission matrix before doing anything.

import { cookies } from "next/headers";
import { ApiError } from "@/lib/api/errors";
import { DEFAULT_ROLE, ROLE_COOKIE, ROLE_LABEL, can, isRole, type Action, type Role } from "@/lib/auth/permissions";

export async function getRole(): Promise<Role> {
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value;
  return isRole(value) ? value : DEFAULT_ROLE;
}

const ACTION_TEXT: Record<Action, string> = {
  "dashboard.view": "view the dashboard",
  "students.view_all": "view all students",
  "statement.view_own": "view this statement",
  "payment.record": "record payments at the counter",
  "payment.pay_online_own": "pay online",
  "payment.check_status": "check payment status",
  "payment.confirm_or_fail": "confirm or fail payments",
  "payment.reverse": "reverse payments",
  "concession.apply": "apply concessions",
  "reconciliation.run": "run reconciliation",
  "audit.view": "view the audit log",
  "demo.reset": "reset demo data",
};

export function forbidden(role: Role, action: Action): ApiError {
  return new ApiError(403, "forbidden", `The ${ROLE_LABEL[role]} role cannot ${ACTION_TEXT[action]}. Switch role in the top bar.`);
}

export async function requireRole(action: Action): Promise<Role> {
  const role = await getRole();
  if (!can(role, action)) throw forbidden(role, action);
  return role;
}
