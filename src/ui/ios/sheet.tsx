"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

/**
 * iOS-style bottom sheet (grabber, rounded top, drag to dismiss, scaled background).
 * Wraps vaul. Use `snapPoints` for detents (e.g. [0.5, 1]).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  children: ReactNode;
  trigger?: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content className="bg-grouped fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[92dvh] flex-col rounded-t-[12px] outline-none">
          <div className="mx-auto mt-[5px] h-[5px] w-9 shrink-0 rounded-full bg-[var(--ios-label-3)]" />
          <Drawer.Title className="text-headline px-safe pt-3 pb-2 text-center font-semibold">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">{title}</Drawer.Description>
          <div className="pb-safe overflow-y-auto">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
