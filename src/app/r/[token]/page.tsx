import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getContainer } from "@/composition/container";
import { NotFoundError, openRequest, type RequestView } from "@/application/requests";
import { checkAgeLabel } from "@/domain/option";
import { Cell, List, ListSection, NavBar } from "@/ui/ios";
import { Badge } from "@/ui/spell/badge";
import { BarsSpinner } from "@/ui/spell/bars-spinner";
import { ShimmerText } from "@/ui/spell/shimmer-text";
import FallbackAvatar from "@/ui/spell/fallback-avatar";
import { CATEGORY_LABEL, fmtDateStr, fmtDay, fmtTime } from "@/ui/format";
import { actingParticipantId, currentParticipant } from "@/app/_lib/identity";
import { AutoRefresh, ChooseButton, NameSheet, OrganizerControls, PreferenceButtons, RsvpButtons, ShareRow } from "./client";

export const metadata: Metadata = { title: "Plan" };

export default function RequestPage({ params }: PageProps<"/r/[token]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <RequestScreen params={params} />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <main>
      <NavBar title="Plan" />
      <div className="px-safe text-label-2 flex items-center gap-3 py-6">
        <BarsSpinner size={20} /> Loading…
      </div>
    </main>
  );
}

async function RequestScreen({ params }: { params: Promise<{ token: string }> }) {
  await connection(); // per-request screen (cookies, clock, live data)
  const { token } = await params;
  const c = getContainer();
  const me = await currentParticipant();
  const actingId = await actingParticipantId();
  let v: RequestView;
  try {
    v = await openRequest(c.requests, token, actingId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { request: r, role } = v;
  const s = r.search;
  const now = c.clock.now();
  const busy = r.status === "QUEUED" || r.status === "CHECKING";
  const shareUrl = new URL(`/r/${token}`, c.env.APP_URL).toString();
  const title = `${CATEGORY_LABEL[s.category]} · ${fmtDateStr(s.date)}`;
  const myRsvp = v.attendees.find((a) => a.participantId === actingId)?.value ?? null;
  const ins = v.attendees.filter((a) => a.value === "in");

  return (
    <main className="pb-safe">
      {busy && <AutoRefresh />}
      <NavBar
        title={`${CATEGORY_LABEL[s.category]} · ${fmtDay(new Date(`${s.date}T12:00:00Z`))}`}
        leading={role === "organizer" ? <Link href="/" className="pressable">‹ Plans</Link> : undefined}
      />

      <ListSection>
        <div className="p-4">
          <div className="text-headline">{fmtDateStr(s.date)}</div>
          <div className="text-subhead text-label-2 mt-1">
            {s.earliestStart}–{s.latestStart} start · {s.durationMins} min · {s.partySize} {s.partySize === 1 ? "person" : "people"}
            {s.areas.length > 0 && ` · ${s.areas.join(", ")}`}
          </div>
          {s.notes && <div className="text-subhead mt-2">“{s.notes}”</div>}
        </div>
      </ListSection>

      {(r.status === "SELECTED" || r.status === "NEEDS_RECONCILIATION" || r.status === "BOOKED") && v.selected && (
        <ListSection header={r.status === "BOOKED" ? "Booked" : "Selected"} className="[&>div]:ring-ios-blue/40 [&>div]:ring-2">
          <div className="space-y-2 p-4" data-testid="selected-panel">
            <div className="text-headline">
              {v.selected.venueName} · {fmtDay(v.selected.startsAt)} {fmtTime(v.selected.startsAt)}–{fmtTime(v.selected.endsAt)}
            </div>
            {r.status === "BOOKED" ? (
              <p className="text-ios-green font-semibold">
                Booked ✓ {role === "organizer" ? `Reference ${r.bookingReference}` : "Reference on file with the organiser"}
              </p>
            ) : r.status === "NEEDS_RECONCILIATION" ? (
              <p className="text-ios-orange">Booking outcome unknown — check with the venue before trying again.</p>
            ) : (
              <p className="text-subhead">
                <strong>Selected. Nothing is booked yet.</strong>{" "}
                {role === "organizer"
                  ? "Approve the final booking and terms with Instinct on WhatsApp (or book on the venue's site), then add the booking reference below."
                  : "The organiser is confirming the booking."}
              </p>
            )}
            {role === "organizer" && r.status !== "BOOKED" && (
              <p className="text-footnote text-label-2 select-all">
                Request {shortId(r.id)} · Option {shortId(v.selected.id)}
                {v.selected.venueUrl && (
                  <>
                    {" · "}
                    <a className="text-ios-blue" href={v.selected.venueUrl} target="_blank" rel="noreferrer">
                      Venue page ↗
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          {role === "organizer" && r.status !== "BOOKED" && <OrganizerControls token={token} status={r.status} />}
        </ListSection>
      )}

      {busy ? (
        <ListSection header="Options">
          <div className="text-label-2 flex items-center gap-3 p-4" data-testid="checking">
            <BarsSpinner size={20} />
            <ShimmerText>Checking live availability…</ShimmerText>
          </div>
        </ListSection>
      ) : r.status === "NO_AVAILABILITY" || r.status === "UNVERIFIED" || r.status === "ERROR" ? (
        <ListSection header="Options">
          <div className="space-y-1 p-4" data-testid="empty-state">
            <div className="text-headline">
              {r.status === "NO_AVAILABILITY" ? "Nothing free in that window" : r.status === "UNVERIFIED" ? "Couldn't check everything" : "Something went wrong"}
            </div>
            <p className="text-subhead text-label-2">
              {r.status === "NO_AVAILABILITY"
                ? "Every venue was checked and none had space for your group."
                : r.status === "UNVERIFIED"
                  ? "Some venues couldn't be checked right now. That's not the same as fully booked."
                  : "The check failed. Try again in a minute."}
            </p>
          </div>
          {role === "organizer" && <OrganizerControls token={token} status={r.status} />}
        </ListSection>
      ) : (
        <ListSection header={`Options · ${v.options.length}`} footer="A check is a snapshot, not a hold. Nothing is booked until the venue confirms.">
          <List>
            {v.options.map((o) => {
              const age = checkAgeLabel(o.checkedAt, now);
              const chosen = r.selectedOptionId === o.id;
              return (
                <li key={o.id} className="list-none p-4 [&:not(:last-child)]:shadow-[inset_0_-0.5px_0_var(--ios-separator)]" data-testid="option">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-headline truncate">{o.venueName}</div>
                      <div className="text-subhead text-label-2">
                        {fmtDay(o.startsAt)} · {fmtTime(o.startsAt)}–{fmtTime(o.endsAt)} · {o.area}
                      </div>
                      <div className="text-subhead">
                        {o.description}
                        {o.priceText && ` · ${o.priceText}`}
                      </div>
                    </div>
                    {chosen && <Badge variant="blue">Chosen</Badge>}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant={age.older ? "orange" : "green"}>
                      {age.older ? `Older check · ${age.text}` : `✓ Verified ${age.text}`}
                      {o.tier === "MOCK" && " (demo)"}
                    </Badge>
                    <PreferenceButtons token={token} optionId={o.id} up={o.tally.up} down={o.tally.down} mine={o.tally.mine} />
                  </div>
                  {role === "organizer" && (r.status === "RESULTS" || r.status === "SELECTED" || r.status === "BOOKING_FAILED") && !chosen && (
                    <ChooseButton token={token} optionId={o.id} />
                  )}
                  {role === "organizer" && o.source && <div className="text-caption1 text-label-3 mt-2 truncate">Source: {o.source}</div>}
                </li>
              );
            })}
          </List>
          {role === "organizer" && r.status === "RESULTS" && <OrganizerControls token={token} status={r.status} />}
        </ListSection>
      )}

      <ListSection header={`Who's in · ${ins.length}/${s.partySize}`}>
        <RsvpButtons token={token} mine={myRsvp} />
        {v.attendees.length > 0 && (
          <List>
            {v.attendees.map((a) => (
              <Cell key={a.participantId} title={a.name} leading={<FallbackAvatar name={a.name} size={28} />} detail={a.value === "in" ? "In" : "Out"} />
            ))}
          </List>
        )}
      </ListSection>

      {role === "organizer" && (
        <ListSection header="Invite the group" footer="Anyone with this link can join, say if they're in and vote on options.">
          <ShareRow url={shareUrl} title={title} />
        </ListSection>
      )}

      <NameSheet token={token} open={role !== "organizer" && !me.displayName} />
    </main>
  );
}

/** UUIDv7 starts with a timestamp, so use the random tail for a short, distinguishable reference. */
function shortId(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}
