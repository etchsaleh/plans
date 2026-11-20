import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { getContainer } from "@/composition/container";
import { Cell, List, ListSection, NavBar } from "@/ui/ios";
import { BarsSpinner } from "@/ui/spell/bars-spinner";
import { CATEGORY_LABEL, fmtDay } from "@/ui/format";
import { currentUser } from "./_lib/identity";
import { signOutAction } from "./actions";
import { SignInCard } from "./sign-in";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <main>
          <NavBar title="Plans" />
          <div className="px-safe py-6"><BarsSpinner size={20} /></div>
        </main>
      }
    >
      <HomeScreen searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Checking…", CHECKING: "Checking…", RESULTS: "Options ready", NO_AVAILABILITY: "Nothing free",
  UNVERIFIED: "Couldn't check", ERROR: "Error", SELECTED: "Chosen · not booked", BOOKED: "Booked ✓",
  BOOKING_FAILED: "Booking failed", NEEDS_RECONCILIATION: "Check booking", CANCELLED: "Cancelled", EXPIRED: "Past",
};

async function HomeScreen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); // per-request screen (cookies, clock, live data)
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) {
    return (
      <main className="pb-safe">
        <NavBar title="Plan" />
        <p className="px-safe text-body text-label-2 mb-6">
          Find things to do that are actually free for your group, then decide together.
        </p>
        {sp.link === "expired" && <p className="px-safe text-ios-red mb-4">That sign-in link has expired or was already used.</p>}
        <SignInCard next={typeof sp.next === "string" ? sp.next : "/"} />
      </main>
    );
  }
  const list = await getContainer().requests.requests.listForOrganizer(user.id);
  return (
    <main className="pb-safe">
      <NavBar
        title="Plans"
        trailing={
          <Link href="/new" aria-label="New plan" className="pressable">
            <Plus className="size-6" strokeWidth={2.5} />
          </Link>
        }
      />
      {list.length === 0 ? (
        <ListSection>
          <div className="p-6 text-center">
            <div className="text-title3 font-semibold">No plans yet</div>
            <p className="text-subhead text-label-2 mt-1">Start one and share it with the group.</p>
            <Link href="/new" className="pressable bg-ios-blue text-headline mt-4 inline-flex h-11 items-center rounded-xl px-5 font-semibold text-white">
              What&apos;s the plan?
            </Link>
          </div>
        </ListSection>
      ) : (
        <ListSection>
          <List>
            {list.map((r) => (
              <Cell
                key={r.id}
                href={`/r/${r.shareToken}`}
                chevron
                title={`${CATEGORY_LABEL[r.search.category]} · ${fmtDay(new Date(`${r.search.date}T12:00:00Z`))}`}
                subtitle={`${r.search.earliestStart}–${r.search.latestStart} · ${r.search.partySize} people`}
                detail={STATUS_LABEL[r.status]}
              />
            ))}
          </List>
        </ListSection>
      )}
      <form action={signOutAction} className="px-safe">
        <button className="text-ios-blue text-body pressable">Sign out ({user.email})</button>
      </form>
    </main>
  );
}
