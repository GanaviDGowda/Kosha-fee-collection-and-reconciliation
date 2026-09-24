import { describe, expect, it } from "vitest";
import { ACTIONS, ROLES, can, isRole, type Action, type Role } from "@/lib/auth/permissions";

// The matrix from the brief, written out independently of lib/auth/permissions.ts.
const EXPECTED: Record<Action, Record<Role, boolean>> = {
  "dashboard.view": { admin: true, accountant: true, student: false },
  "students.view_all": { admin: true, accountant: true, student: false },
  "statement.view_own": { admin: true, accountant: true, student: true },
  "payment.record": { admin: true, accountant: true, student: false },
  "payment.pay_online_own": { admin: true, accountant: true, student: true },
  "payment.check_status": { admin: true, accountant: true, student: true },
  "payment.confirm_or_fail": { admin: true, accountant: true, student: false },
  "payment.reverse": { admin: true, accountant: false, student: false },
  "concession.apply": { admin: true, accountant: false, student: false },
  "reconciliation.run": { admin: true, accountant: true, student: false },
  "audit.view": { admin: true, accountant: true, student: false },
  "demo.reset": { admin: true, accountant: false, student: false },
};

describe("permission matrix", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      it(`${role} ${EXPECTED[action][role] ? "can" : "cannot"} ${action}`, () => {
        expect(can(role, action)).toBe(EXPECTED[action][role]);
      });
    }
  }

  it("only admin can reverse, concede or reset", () => {
    for (const action of ["payment.reverse", "concession.apply", "demo.reset"] as const) {
      expect(ROLES.filter((r) => can(r, action))).toEqual(["admin"]);
    }
  });

  it("validates role strings from the cookie", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("Admin")).toBe(false);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
