// Page-level permission check for server components. A role that can't see a page is
// sent somewhere it can (the student to their own statement) instead of a bare 403.

import { redirect } from "next/navigation";
import { can, type Action, type Role } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";

export async function guardPage(action: Action): Promise<Role> {
  const role = await getRole();
  if (!can(role, action)) redirect(`/students/${DEMO_STUDENT_ROLL_NO}`);
  return role;
}
