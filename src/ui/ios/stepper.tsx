"use client";

import { Minus, Plus } from "lucide-react";

/** UIStepper look-alike. */
export function Stepper({
  value,
  min = 1,
  max = 20,
  onChange,
  label,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const btn =
    "flex h-8 w-[47px] items-center justify-center active:bg-fill disabled:opacity-30 transition-colors";
  return (
    <div className="bg-fill-3 flex items-center overflow-hidden rounded-lg" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="bg-separator h-4.5 w-px" />
      <button type="button" className={btn} aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
