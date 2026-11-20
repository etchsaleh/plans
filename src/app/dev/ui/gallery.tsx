"use client";

import { useState } from "react";
import { Button, Cell, List, ListSection, NavBar, SegmentedControl, Sheet, Stepper } from "@/ui/ios";
import { AnimatedCheckbox } from "@/ui/spell/animated-checkbox";
import { Badge } from "@/ui/spell/badge";
import { BarsSpinner } from "@/ui/spell/bars-spinner";
import { ShimmerText } from "@/ui/spell/shimmer-text";
import { CopyButton } from "@/ui/spell/copy-button";
import { QRCode } from "@/ui/spell/qr-code";
import FallbackAvatar from "@/ui/spell/fallback-avatar";
import { WordsStagger } from "@/ui/spell/words-stagger";

const ACTIVITIES = [
  { value: "restaurant", label: "Dinner" },
  { value: "padel", label: "Padel" },
  { value: "tennis", label: "Tennis" },
] as const;

export function Gallery() {
  const [activity, setActivity] = useState<(typeof ACTIVITIES)[number]["value"]>("restaurant");
  const [size, setSize] = useState(4);
  const [sheet, setSheet] = useState(false);

  return (
    <main className="pb-safe">
      <NavBar title="UI kit" trailing={<button className="pressable font-semibold">Done</button>} />

      <ListSection header="Controls">
        <div className="space-y-4 p-4">
          <SegmentedControl ariaLabel="Activity" options={ACTIVITIES} value={activity} onChange={setActivity} />
          <div className="flex items-center justify-between">
            <span>
              Party of <strong>{size}</strong>
            </span>
            <Stepper label="people" value={size} onChange={setSize} />
          </div>
        </div>
      </ListSection>

      <ListSection header="Cells" footer="Inset grouped list with hairline separators.">
        <List>
          <Cell title="Dishoom Carnaby" subtitle="Indian · Soho · ££" detail="18:00" chevron href="#" />
          <Cell title="Padel at Battersea" subtitle="Court 3 · 60 min" detail="22:00" chevron href="#" />
          <Cell title="Cancel plan" destructive onClick={() => {}} />
        </List>
      </ListSection>

      <ListSection header="Status pills (Spell badge)">
        <div className="flex flex-wrap gap-2 p-4">
          <Badge variant="green">✓ Verified · 3 min ago</Badge>
          <Badge variant="blue">Checked by Sam · 6 min ago</Badge>
          <Badge variant="orange">Re-checking…</Badge>
          <Badge variant="red">Gone</Badge>
          <Badge variant="secondary">Check availability ↗</Badge>
        </div>
      </ListSection>

      <ListSection header="Live states">
        <div className="space-y-4 p-4">
          <div className="text-label-2 flex items-center gap-3">
            <BarsSpinner size={20} />
            <ShimmerText>Checking live availability…</ShimmerText>
          </div>
          <WordsStagger className="text-title2 font-bold">It&apos;s on. Book now 🎉</WordsStagger>
          <AnimatedCheckbox title="I'm in" />
        </div>
      </ListSection>

      <ListSection header="Who's in">
        <List>
          {["Hesham", "Sam", "Priya"].map((n) => (
            <Cell key={n} title={n} leading={<FallbackAvatar name={n} size={32} />} detail="In" />
          ))}
        </List>
      </ListSection>

      <ListSection header="Buttons">
        <div className="space-y-3 p-4">
          <Button>I&apos;m in</Button>
          <Button variant="gray">Can&apos;t make it</Button>
          <Button variant="success">Book now</Button>
          <div className="flex gap-2">
            <Button size="medium" variant="tinted">
              Tinted
            </Button>
            <Button size="small" variant="tinted">
              Small
            </Button>
            <Button size="medium" variant="plain">
              Plain
            </Button>
          </div>
        </div>
      </ListSection>

      <ListSection header="Share">
        <div className="flex items-center gap-4 p-4">
          <div className="rounded-xl bg-white p-2">
            <QRCode value="https://plan.example/p/demo" size={96} fgColor="#000" bgColor="#fff" />
          </div>
          <div className="flex-1 text-subhead text-label-2">Scan to join, or copy the link</div>
          <CopyButton value="https://plan.example/p/demo" />
        </div>
        <div className="px-4 pb-4">
          <Button variant="tinted" onClick={() => setSheet(true)}>
            Open sheet
          </Button>
        </div>
      </ListSection>

      <Sheet open={sheet} onOpenChange={setSheet} title="What should we call you?">
        <div className="px-safe space-y-4 pt-2">
          <input
            autoFocus
            placeholder="Your name"
            className="bg-grouped-2 text-body w-full rounded-[10px] px-4 py-3 outline-none"
          />
          <Button onClick={() => setSheet(false)}>Continue</Button>
        </div>
      </Sheet>
    </main>
  );
}
