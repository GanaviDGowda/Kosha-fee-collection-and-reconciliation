import { ArrowLeftRight, BookOpenText, LayoutDashboard, ScrollText, Users, type LucideIcon } from "lucide-react";
import { can, type Role } from "@/lib/auth/permissions";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";

export type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };

export function navFor(role: Role): NavItem[] {
  if (!can(role, "students.view_all")) {
    const href = `/students/${DEMO_STUDENT_ROLL_NO}`;
    return [{ href, label: "My statement", icon: BookOpenText, match: (p) => p.startsWith("/students") || p.startsWith("/payments") }];
  }
  return [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
    { href: "/students", label: "Students", icon: Users, match: (p) => p.startsWith("/students") },
    { href: "/payments", label: "Payments", icon: ArrowLeftRight, match: (p) => p.startsWith("/payments") },
    { href: "/reconciliation", label: "Reconciliation", icon: BookOpenText, match: (p) => p.startsWith("/reconciliation") },
    { href: "/audit", label: "Audit log", icon: ScrollText, match: (p) => p.startsWith("/audit") },
  ];
}
