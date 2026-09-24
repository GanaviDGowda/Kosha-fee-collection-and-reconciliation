"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { can, type Role } from "@/lib/auth/permissions";
import { SearchIconTrigger, SearchTrigger } from "@/components/shell/command-palette";
import { DemoGuide } from "@/components/shell/demo-guide";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { NavLinks, Wordmark } from "@/components/shell/sidebar";

export function Topbar({ role }: { role: Role }) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <header className="no-print sticky top-0 z-20 flex h-topbar items-center gap-3 border-b border-line bg-surface px-4 lg:px-8">
      {/* Below lg the sidebar becomes a sheet. */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Open navigation">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" title="Kosha" description="Navigation">
          <div className="-mx-3 -mt-2">
            <NavLinks role={role} onNavigate={() => setNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="lg:hidden">
        <Wordmark compact />
      </div>

      <div className="hidden min-w-0 flex-1 sm:block">{can(role, "students.view_all") ? <SearchTrigger /> : null}</div>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {can(role, "students.view_all") ? (
          <span className="sm:hidden">
            <SearchIconTrigger />
          </span>
        ) : null}
        <DemoGuide role={role} />
        <RoleSwitcher role={role} />
      </div>
    </header>
  );
}
