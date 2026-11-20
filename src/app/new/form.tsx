"use client";

import { useActionState, useState } from "react";
import { Button, ListSection, SegmentedControl, Stepper } from "@/ui/ios";
import { cn } from "@/lib/utils";
import { createRequestAction } from "@/app/actions";

const CATS = [
  { value: "padel", label: "Padel" },
  { value: "tennis", label: "Tennis" },
  { value: "restaurant", label: "Dinner" },
] as const;
const TIMES = Array.from({ length: 31 }, (_, i) => {
  const m = 7 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 === 0 ? "00" : "30"}`;
});

export function NewPlanForm({ today, areas }: { today: string; areas: { activity: string; area: string }[] }) {
  const [category, setCategory] = useState<(typeof CATS)[number]["value"]>("padel");
  const [size, setSize] = useState(4);
  const [picked, setPicked] = useState<string[]>([]);
  const [state, action, pending] = useActionState(createRequestAction, null);
  const areaOptions = [...new Set(areas.filter((a) => a.activity === category).map((a) => a.area))];
  const select = "bg-fill-3 text-body rounded-lg px-2 py-1.5 outline-none";

  return (
    <form action={action}>
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="partySize" value={size} />
      {picked.filter((a) => areaOptions.includes(a)).map((a) => (
        <input key={a} type="hidden" name="areas" value={a} />
      ))}

      <ListSection header="What">
        <div className="p-3">
          <SegmentedControl ariaLabel="Activity" options={CATS} value={category} onChange={(v) => setCategory(v)} />
        </div>
      </ListSection>

      <ListSection header="When" footer="Times are London time. We'll check every half hour in your window.">
        <div className="divide-separator divide-y-[0.5px]">
          <label className="flex min-h-11 items-center justify-between px-4 py-2">
            <span>Date</span>
            <input type="date" name="date" defaultValue={today} min={today} required className={select} />
          </label>
          <label className="flex min-h-11 items-center justify-between px-4 py-2">
            <span>Earliest start</span>
            <select name="earliestStart" defaultValue="18:00" className={select}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="flex min-h-11 items-center justify-between px-4 py-2">
            <span>Latest start</span>
            <select name="latestStart" defaultValue="20:00" className={select}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="flex min-h-11 items-center justify-between px-4 py-2">
            <span>Duration</span>
            <select name="durationMins" defaultValue="60" className={select}>
              <option value="60">1 hour</option>
              <option value="90">1½ hours</option>
              <option value="120">2 hours</option>
            </select>
          </label>
        </div>
      </ListSection>

      <ListSection header="Who">
        <div className="flex min-h-11 items-center justify-between px-4 py-2">
          <span>
            Party of <strong>{size}</strong>
          </span>
          <Stepper label="people" value={size} min={1} max={16} onChange={setSize} />
        </div>
      </ListSection>

      <ListSection header="Where" footer={areaOptions.length ? "Leave empty for anywhere we can check." : "No checkable venues for this activity yet."}>
        <div className="flex flex-wrap gap-2 p-3">
          {areaOptions.map((a) => {
            const on = picked.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a) : [...p, a]))}
                className={cn("pressable text-subhead h-8 rounded-full px-3.5 font-medium", on ? "bg-ios-blue text-white" : "bg-fill-3 text-label")}
              >
                {a}
              </button>
            );
          })}
        </div>
      </ListSection>

      <ListSection header="Notes (optional)">
        <textarea name="notes" maxLength={280} rows={2} placeholder="e.g. one veggie, no seafood" className="text-body w-full resize-none bg-transparent px-4 py-3 outline-none" />
      </ListSection>

      <div className="px-safe space-y-2">
        {state && !state.ok && <p className="text-footnote text-ios-red">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Find what's free"}
        </Button>
      </div>
    </form>
  );
}
