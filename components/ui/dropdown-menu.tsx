"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, align = "end", children, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-[200px] rounded-panel border border-line bg-surface p-1 shadow-overlay data-[state=open]:animate-pop-in", className)}
        {...props}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded px-2.5 py-2 text-base outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-canvas data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted";

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return <Menu.Item className={cn(itemClass, destructive && "text-debit [&_svg]:text-debit", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 pb-1 pt-2 text-xs text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-line" />;
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuRadioItem({ className, children, description, ...props }: React.ComponentProps<typeof Menu.RadioItem> & { description?: string }) {
  return (
    <Menu.RadioItem className={cn(itemClass, "items-start pl-8", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2.5 top-2.5">
        <Check className="!text-accent" />
      </Menu.ItemIndicator>
      <span>
        <span className="block">{children}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </span>
    </Menu.RadioItem>
  );
}
