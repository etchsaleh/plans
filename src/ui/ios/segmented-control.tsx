"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** UISegmentedControl look-alike with a sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="bg-fill-3 flex h-8 rounded-[9px] p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "text-footnote relative flex-1 rounded-[7px] font-medium transition-colors",
              selected ? "text-label font-semibold" : "text-label",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`seg-${id}`}
                className="bg-grouped-2 absolute inset-0 rounded-[7px] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
