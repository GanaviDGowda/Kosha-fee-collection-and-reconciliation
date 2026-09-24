"use client";

// Right-side drawer (Radix Dialog). Money-changing actions open here so the statement
// stays visible behind it. Focus is trapped and Escape closes it.

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  side = "right",
  title,
  description,
  children,
  className,
  footer,
}: {
  side?: "right" | "left";
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col bg-surface shadow-overlay focus:outline-none",
          side === "right"
            ? "right-0 max-w-[480px] border-l border-line data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in"
            : "left-0 max-w-[280px] border-r border-line data-[state=open]:animate-sheet-left-in",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
            {description ? <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          </div>
          <Dialog.Close className="-mr-2 rounded p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-line bg-surface px-6 py-4">{footer}</div> : null}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
