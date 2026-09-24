"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL, ROLES, isRole, type Role } from "@/lib/auth/permissions";
import { DEMO_STUDENT_ROLL_NO } from "@/lib/demo/scenarios";

const ROLE_HINT: Record<Role, string> = {
  admin: "Everything, including reversals and concessions",
  accountant: "Record payments, reconcile, view audit",
  student: `Own statement only (${DEMO_STUDENT_ROLL_NO}), pay online`,
};

export function RoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  async function switchTo(next: string) {
    if (!isRole(next) || next === role) return;
    const res = await fetch("/api/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: next }) });
    if (!res.ok) {
      toast.error("Could not switch role", "Try again.");
      return;
    }
    startTransition(() => {
      if (next === "student" && !pathname.startsWith(`/students/${DEMO_STUDENT_ROLL_NO}`)) router.push(`/students/${DEMO_STUDENT_ROLL_NO}`);
      else router.refresh();
    });
    toast.success(`Switched to ${ROLE_LABEL[next]}`, ROLE_HINT[next]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="md" loading={pending} aria-label={`Role: ${ROLE_LABEL[role]}. Change role`}>
          {pending ? null : <UserRound aria-hidden />}
          <span className="hidden sm:inline text-muted">Role</span>
          <span>{ROLE_LABEL[role]}</span>
          <ChevronDown className="!size-3.5 text-muted" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[290px]">
        <DropdownMenuLabel>Simulated role (demo; real login is out of scope)</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={role} onValueChange={switchTo}>
          {ROLES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} description={ROLE_HINT[r]}>
              {ROLE_LABEL[r]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
