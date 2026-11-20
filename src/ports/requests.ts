import type { Option, Role } from "@/domain/option";
import type { SearchRequest, Transition } from "@/domain/request";
import type { Venue } from "@/domain/venue";
import type { Activity } from "@/domain/vocabulary";

export class ConcurrencyError extends Error {}

export interface RequestRepository {
  /** Creates request + its group, adds the organiser as group member, writes first history row. */
  create(r: SearchRequest, organizer: { participantId: string; groupName: string }): Promise<void>;
  get(id: string): Promise<SearchRequest | null>;
  getByShareToken(token: string): Promise<SearchRequest | null>;
  /** Persists a transition with optimistic concurrency (version) and appends status history. */
  save(t: Transition, actor: string): Promise<void>;
  listForOrganizer(userId: string, limit?: number): Promise<SearchRequest[]>;
}

export interface OptionRepository {
  /**
   * Make the request's options exactly `options` (keyed by venue + start): new ones are inserted,
   * existing ones get their check evidence refreshed (keeping ids, so preferences survive),
   * and ones no longer available are removed.
   */
  sync(requestId: string, options: Option[]): Promise<void>;
  listForRequest(requestId: string): Promise<Option[]>;
  get(id: string): Promise<Option | null>;
}

export type Tally = { up: number; down: number; mine: "up" | "down" | null };
export type Attendee = { participantId: string; name: string; value: "in" | "out" };

export interface ParticipationRepository {
  ensureMember(groupId: string, participantId: string, role: Role): Promise<Role>;
  roleOf(groupId: string, participantId: string): Promise<Role | null>;
  setPreference(optionId: string, participantId: string, value: "up" | "down" | null): Promise<void>;
  setRsvp(requestId: string, participantId: string, value: "in" | "out"): Promise<void>;
  tallies(requestId: string, viewerParticipantId: string): Promise<Map<string, Tally>>;
  attendees(requestId: string): Promise<Attendee[]>;
  setDisplayName(participantId: string, name: string): Promise<void>;
}

export interface VenueCatalog {
  find(filter: { activity: Activity; areas?: string[]; venueIds?: string[] }): Promise<Venue[]>;
  get(id: string): Promise<Venue | null>;
  areas(): Promise<{ activity: Activity; area: string }[]>;
}

export interface JobQueue {
  enqueueDirectSearch(requestId: string, opts?: { recheck?: boolean }): Promise<void>;
}
