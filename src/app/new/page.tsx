import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getContainer } from "@/composition/container";
import { londonParts } from "@/domain/london-time";
import { NavBar } from "@/ui/ios";
import { currentUser } from "@/app/_lib/identity";
import { NewPlanForm } from "./form";

export const metadata: Metadata = { title: "What's the plan?" };

export default function NewPlanPage() {
  return (
    <Suspense fallback={<main><NavBar title="What's the plan?" /></main>}>
      <NewPlan />
    </Suspense>
  );
}

async function NewPlan() {
  await connection(); // per-request screen (cookies, clock, live data)
  const user = await currentUser();
  if (!user) redirect("/?next=/new");
  const c = getContainer();
  const areas = await c.requests.venues.areas();
  return (
    <main className="pb-safe">
      <NavBar title="What's the plan?" leading={<Link href="/" className="pressable">Cancel</Link>} />
      <NewPlanForm today={londonParts(c.clock.now()).date} areas={areas} />
    </main>
  );
}
