"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]", className)} {...props} />;
}

export function TabsTrigger({ className, count, children, ...props }: React.ComponentProps<typeof RadixTabs.Trigger> & { count?: number }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent text-base font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? <span className="figure rounded-full bg-canvas px-1.5 text-xs text-muted">{count}</span> : null}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
