import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { v7 as uuid } from "uuid";
import type { Option, Role } from "@/domain/option";
import type { SearchRequest, Transition } from "@/domain/request";
import type { Venue } from "@/domain/venue";
import type { Activity } from "@/domain/vocabulary";
import {
  ConcurrencyError,
  type Attendee,
  type OptionRepository,
  type ParticipationRepository,
  type RequestRepository,
  type Tally,
  type VenueCatalog,
} from "@/ports";
import type { Db } from "./db";
import {
  groupMembers,
  groups,
  options,
  participants,
  preferences,
  requestRsvps,
  requestStatusHistory,
  searchRequests,
  venues,
} from "./schema";

type RequestRow = typeof searchRequests.$inferSelect;
const toRequest = (r: RequestRow, groupId = r.groupId): SearchRequest => ({
  id: r.id,
  shareToken: r.shareToken,
  organizerId: r.organizerUserId,
  groupId,
  search: r.search,
  status: r.status,
  selectedOptionId: r.selectedOptionId,
  bookingReference: r.bookingReference,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class PgRequestRepository implements RequestRepository {
  constructor(private readonly db: Db) {}

  async create(r: SearchRequest, organizer: { participantId: string; groupName: string }) {
    await this.db.transaction(async (tx) => {
      await tx.insert(groups).values({ id: r.groupId, organizerUserId: r.organizerId, name: organizer.groupName });
      await tx.insert(groupMembers).values({ groupId: r.groupId, participantId: organizer.participantId, role: "organizer" });
      await tx.insert(searchRequests).values({
        id: r.id, shareToken: r.shareToken, organizerUserId: r.organizerId, groupId: r.groupId, search: r.search,
        status: r.status, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt,
      });
      await tx.insert(requestStatusHistory).values({
        id: uuid(), requestId: r.id, fromStatus: null, toStatus: r.status, cause: "created", actor: `organizer:${organizer.participantId}`,
      });
    });
  }

  async get(id: string) {
    const [row] = await this.db.select().from(searchRequests).where(eq(searchRequests.id, id));
    return row ? toRequest(row) : null;
  }

  async getByShareToken(token: string) {
    const [row] = await this.db.select().from(searchRequests).where(eq(searchRequests.shareToken, token));
    return row ? toRequest(row) : null;
  }

  async save(t: Transition, actor: string) {
    const r = t.request;
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(searchRequests)
        .set({ status: r.status, selectedOptionId: r.selectedOptionId, bookingReference: r.bookingReference, version: r.version, updatedAt: r.updatedAt })
        .where(and(eq(searchRequests.id, r.id), eq(searchRequests.version, r.version - 1)))
        .returning({ id: searchRequests.id });
      if (updated.length !== 1) throw new ConcurrencyError(`request ${r.id} changed concurrently`);
      await tx.insert(requestStatusHistory).values({ id: uuid(), requestId: r.id, fromStatus: t.from, toStatus: t.to, cause: t.cause, actor });
    });
  }

  async listForOrganizer(userId: string, limit = 20) {
    const rows = await this.db.select().from(searchRequests).where(eq(searchRequests.organizerUserId, userId)).orderBy(desc(searchRequests.createdAt)).limit(limit);
    return rows.map((r) => toRequest(r));
  }
}

export class PgOptionRepository implements OptionRepository {
  constructor(private readonly db: Db) {}

  async sync(requestId: string, list: Option[]) {
    await this.db.transaction(async (tx) => {
      if (list.length) {
        await tx
          .insert(options)
          .values(list.map((o) => ({
            id: o.id, requestId, venueId: o.venueId, startsAt: o.startsAt, endsAt: o.endsAt, partySize: o.partySize,
            description: o.description, checkedAt: o.checkedAt, tier: o.tier, source: o.source, snapshotId: o.snapshotId, priceText: o.priceText,
          })))
          .onConflictDoUpdate({
            target: [options.requestId, options.venueId, options.startsAt],
            set: {
              checkedAt: sql`excluded.checked_at`, tier: sql`excluded.tier`, source: sql`excluded.source`,
              snapshotId: sql`excluded.snapshot_id`, priceText: sql`excluded.price_text`, description: sql`excluded.description`,
              partySize: sql`excluded.party_size`, endsAt: sql`excluded.ends_at`,
            },
          });
      }
      const keep = list.map((o) => `${o.venueId}|${o.startsAt.toISOString()}`);
      const existing = await tx.select({ id: options.id, venueId: options.venueId, startsAt: options.startsAt }).from(options).where(eq(options.requestId, requestId));
      const stale = existing.filter((e) => !keep.includes(`${e.venueId}|${e.startsAt.toISOString()}`)).map((e) => e.id);
      if (stale.length) await tx.delete(options).where(inArray(options.id, stale));
    });
  }

  async listForRequest(requestId: string): Promise<Option[]> {
    const rows = await this.db
      .select({ o: options, v: { name: venues.name, area: venues.area, provider: venues.provider, bookingRef: venues.bookingRef } })
      .from(options)
      .innerJoin(venues, eq(options.venueId, venues.id))
      .where(eq(options.requestId, requestId));
    return rows.map(({ o, v }) => ({
      id: o.id, requestId: o.requestId, venueId: o.venueId, venueName: v.name, area: v.area, startsAt: o.startsAt, endsAt: o.endsAt,
      partySize: o.partySize, description: o.description, checkedAt: o.checkedAt, tier: o.tier, source: o.source,
      snapshotId: o.snapshotId, priceText: o.priceText, venueUrl: venueUrl(v.provider, v.bookingRef),
    }));
  }

  async get(id: string) {
    const [row] = await this.db.select({ requestId: options.requestId }).from(options).where(eq(options.id, id));
    if (!row) return null;
    return (await this.listForRequest(row.requestId)).find((o) => o.id === id) ?? null;
  }
}

/** Public page where a human can look at / book the venue. Never a booking action. */
export function venueUrl(provider: string, ref: Record<string, unknown>): string | null {
  if (provider === "playtomic" && typeof ref.slug === "string") return `https://playtomic.com/clubs/${ref.slug}`;
  if (provider === "royalparks") return "https://sportsandleisure.royalparks.org.uk/";
  return null;
}

export class PgParticipationRepository implements ParticipationRepository {
  constructor(private readonly db: Db) {}

  async ensureMember(groupId: string, participantId: string, role: Role): Promise<Role> {
    await this.db.insert(groupMembers).values({ groupId, participantId, role }).onConflictDoNothing();
    return (await this.roleOf(groupId, participantId))!;
  }

  async roleOf(groupId: string, participantId: string): Promise<Role | null> {
    const [row] = await this.db.select({ role: groupMembers.role }).from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.participantId, participantId)));
    return row?.role ?? null;
  }

  async setPreference(optionId: string, participantId: string, value: "up" | "down" | null) {
    if (value === null) {
      await this.db.delete(preferences).where(and(eq(preferences.optionId, optionId), eq(preferences.participantId, participantId)));
      return;
    }
    await this.db.insert(preferences).values({ optionId, participantId, value })
      .onConflictDoUpdate({ target: [preferences.optionId, preferences.participantId], set: { value, updatedAt: sql`now()` } });
  }

  async setRsvp(requestId: string, participantId: string, value: "in" | "out") {
    await this.db.insert(requestRsvps).values({ requestId, participantId, value })
      .onConflictDoUpdate({ target: [requestRsvps.requestId, requestRsvps.participantId], set: { value, updatedAt: sql`now()` } });
  }

  async tallies(requestId: string, viewer: string): Promise<Map<string, Tally>> {
    const rows = await this.db
      .select({ optionId: preferences.optionId, participantId: preferences.participantId, value: preferences.value })
      .from(preferences).innerJoin(options, eq(options.id, preferences.optionId))
      .where(eq(options.requestId, requestId));
    const m = new Map<string, Tally>();
    for (const r of rows) {
      const t = m.get(r.optionId) ?? { up: 0, down: 0, mine: null };
      t[r.value]++;
      if (r.participantId === viewer) t.mine = r.value;
      m.set(r.optionId, t);
    }
    return m;
  }

  async attendees(requestId: string): Promise<Attendee[]> {
    const rows = await this.db
      .select({ participantId: requestRsvps.participantId, name: participants.displayName, value: requestRsvps.value })
      .from(requestRsvps).innerJoin(participants, eq(participants.id, requestRsvps.participantId))
      .where(eq(requestRsvps.requestId, requestId)).orderBy(requestRsvps.updatedAt);
    return rows.map((r) => ({ participantId: r.participantId, name: r.name ?? "Someone", value: r.value }));
  }

  async setDisplayName(participantId: string, name: string) {
    await this.db.update(participants).set({ displayName: name, lastSeenAt: sql`now()` }).where(eq(participants.id, participantId));
  }
}

export class PgVenueCatalog implements VenueCatalog {
  constructor(private readonly db: Db, private readonly enabledProviders?: string[]) {}

  async find(f: { activity: Activity; areas?: string[]; venueIds?: string[] }): Promise<Venue[]> {
    const conds = [eq(venues.activity, f.activity), eq(venues.active, true)];
    if (f.venueIds?.length) conds.push(inArray(venues.id, f.venueIds));
    else if (f.areas?.length) conds.push(inArray(venues.area, f.areas));
    if (this.enabledProviders) conds.push(inArray(venues.provider, this.enabledProviders));
    const rows = await this.db.select().from(venues).where(and(...conds));
    return rows.map((r) => ({ ...r, bookingRef: r.bookingRef as Record<string, unknown> }));
  }

  async get(id: string) {
    const [r] = await this.db.select().from(venues).where(eq(venues.id, id));
    return r ? { ...r, bookingRef: r.bookingRef as Record<string, unknown> } : null;
  }

  async areas() {
    const conds = [eq(venues.active, true)];
    if (this.enabledProviders) conds.push(inArray(venues.provider, this.enabledProviders));
    return this.db.selectDistinct({ activity: venues.activity, area: venues.area }).from(venues).where(and(...conds)).orderBy(venues.area);
  }
}

