"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * iOS large-title navigation bar. The large title scrolls with content; once it's
 * scrolled under the bar, a compact centred title fades in and the bar gets its
 * translucent material + hairline, as in UIKit.
 */
export function NavBar({
  title,
  leading,
  trailing,
  large = true,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  large?: boolean;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(!large);

  useEffect(() => {
    if (!large || !sentinel.current) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), {
      rootMargin: "-52px 0px 0px 0px",
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [large]);

  return (
    <>
      <header
        className={cn(
          "pt-safe sticky top-0 z-30 transition-[background-color,box-shadow] duration-200",
          collapsed ? "bg-bar hairline-b backdrop-blur-xl backdrop-saturate-150" : "bg-transparent",
        )}
      >
        <div className="px-safe relative flex h-11 items-center justify-between">
          <div className="min-w-16 text-body text-ios-blue">{leading}</div>
          <div
            aria-hidden={large && !collapsed}
            className={cn(
              "text-headline pointer-events-none absolute inset-x-24 truncate text-center font-semibold transition-opacity duration-200",
              collapsed ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </div>
          <div className="text-body text-ios-blue flex min-w-16 justify-end">{trailing}</div>
        </div>
      </header>
      {large && (
        <div className="px-safe pb-2">
          <h1 className="text-large-title font-bold">{title}</h1>
          <div ref={sentinel} className="h-px" />
        </div>
      )}
    </>
  );
}
