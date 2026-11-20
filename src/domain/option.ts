import type { CheckTier } from "./vocabulary";

/** A checked slot offered on a request. A check is a snapshot — never a hold. */
export type Option = {
  id: string;
  requestId: string;
  venueId: string;
  venueName: string;
  area: string;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  description: string;
  checkedAt: Date;
  tier: CheckTier;
  /** Where the check was made — organiser-only. */
  source: string;
  snapshotId: string | null;
  priceText: string | null;
  /** Where a human can look/book. Not a booking action. */
  venueUrl: string | null;
};

export type Role = "organizer" | "member";

/** What a friend may see. Provider/source details stay with the organiser (docs/PLAN.md §0). */
export type OptionView = Omit<Option, "source" | "snapshotId"> & { source?: string; snapshotId?: string | null };

export function viewOption(o: Option, role: Role): OptionView {
  if (role === "organizer") return o;
  const { source: _s, snapshotId: _id, ...rest } = o;
  return rest;
}

export const OLDER_CHECK_MS = 15 * 60 * 1000;

export function checkAgeLabel(checkedAt: Date, now: Date): { text: string; older: boolean } {
  const mins = Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / 60000));
  const text = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
  return { text, older: now.getTime() - checkedAt.getTime() > OLDER_CHECK_MS };
}
