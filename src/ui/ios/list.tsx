import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** iOS "inset grouped" table section. */
export function ListSection({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-safe mb-8", className)}>
      {header && (
        <h2 className="text-footnote text-label-2 mb-1.5 px-4 uppercase tracking-[-0.08px]">{header}</h2>
      )}
      <div className="bg-grouped-2 overflow-hidden rounded-[10px]">{children}</div>
      {footer && <p className="text-footnote text-label-2 mt-1.5 px-4">{footer}</p>}
    </section>
  );
}

type CellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
};

/** A table cell; hairline separators are inset to the text, like UIKit. */
export function Cell({ title, subtitle, detail, leading, trailing, chevron, href, onClick, destructive }: CellProps) {
  const body = (
    <div className="flex min-h-11 items-center gap-3 pl-4">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex min-h-11 flex-1 items-center gap-2 py-2.5 pr-4 [:where(li:not(:last-child))_&]:shadow-[inset_0_-0.5px_0_var(--ios-separator)]">
        <div className="min-w-0 flex-1">
          <div className={cn("text-body truncate", destructive && "text-ios-red")}>{title}</div>
          {subtitle && <div className="text-subhead text-label-2 truncate">{subtitle}</div>}
        </div>
        {detail && <div className="text-body text-label-2 shrink-0">{detail}</div>}
        {trailing}
        {chevron && <ChevronRight className="text-label-3 size-4 shrink-0" strokeWidth={2.5} />}
      </div>
    </div>
  );
  const interactive = "block w-full text-left active:bg-fill-3 transition-colors";
  return (
    <li className="list-none">
      {href ? (
        <Link href={href} className={interactive}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={interactive}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="m-0 p-0">{children}</ul>;
}
