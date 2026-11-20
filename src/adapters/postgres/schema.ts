import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  doublePrecision,
  customType,
} from "drizzle-orm/pg-core";
import {
  ACTIVITIES,
  AVAILABILITY_STATUSES,
  BUDGET_BANDS,
  CANDIDATE_STATUSES,
  CHECK_PURPOSES,
  CHECK_TIERS,
  HANDOFF_METHODS,
  PLAN_STATUSES,
  RSVP_VALUES,
  SEARCH_STATUSES,
} from "@/domain/vocabulary";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ── identity ────────────────────────────────────────────────────────────────
export const participants = pgTable("participants", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  createdAt: createdAt(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: citext("email").notNull().unique(),
  participantId: uuid("participant_id").references(() => participants.id),
  createdAt: createdAt(),
});

export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  consumedAt: ts("consumed_at"),
  createdAt: createdAt(),
});

export const crews = pgTable("crews", {
  id: uuid("id").primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  defaultPartySize: integer("default_party_size").notNull(),
  areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
  activityTypes: text("activity_types", { enum: ACTIVITIES }).array().notNull().default(sql`'{}'::text[]`),
  notes: text("notes"),
  budgetBand: text("budget_band", { enum: BUDGET_BANDS }),
  weeklyPicksEnabled: boolean("weekly_picks_enabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ── catalogue ───────────────────────────────────────────────────────────────
export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    activity: text("activity", { enum: ACTIVITIES }).notNull(),
    area: text("area").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    priceBand: text("price_band", { enum: BUDGET_BANDS }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** provider-specific booking reference (slug, restref, club id …) */
    bookingRef: jsonb("booking_ref").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("venues_provider_external_uq").on(t.provider, t.externalId)],
);

// ── search & candidates ─────────────────────────────────────────────────────
export const searches = pgTable("searches", {
  id: uuid("id").primaryKey(),
  hostParticipantId: uuid("host_participant_id").notNull().references(() => participants.id),
  crewId: uuid("crew_id").references(() => crews.id, { onDelete: "set null" }),
  activity: text("activity", { enum: ACTIVITIES }).notNull(),
  windowStart: ts("window_start").notNull(),
  windowEnd: ts("window_end").notNull(),
  partySize: integer("party_size").notNull(),
  areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
  notes: text("notes"),
  budgetBand: text("budget_band", { enum: BUDGET_BANDS }),
  trigger: text("trigger", { enum: ["host", "schedule"] }).notNull(),
  status: text("status", { enum: SEARCH_STATUSES }).notNull().default("QUEUED"),
  error: text("error"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey(),
    searchId: uuid("search_id").notNull().references(() => searches.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id),
    activity: text("activity", { enum: ACTIVITIES }).notNull(),
    slotStart: ts("slot_start").notNull(),
    durationMins: integer("duration_mins").notNull(),
    partySize: integer("party_size").notNull(),
    score: real("score").notNull(),
    rationale: text("rationale"),
    ranker: text("ranker").notNull(),
    rankerModel: text("ranker_model"),
    status: text("status", { enum: CANDIDATE_STATUSES }).notNull().default("PENDING"),
    latestSnapshotId: uuid("latest_snapshot_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("candidates_idem_uq").on(t.searchId, t.venueId, t.slotStart, t.partySize),
  ],
);

// ── availability audit log (append-only) ────────────────────────────────────
export const verificationPayloads = pgTable("verification_payloads", {
  id: uuid("id").primaryKey(),
  sha256: text("sha256").notNull(),
  contentType: text("content_type").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

export const availabilitySnapshots = pgTable(
  "availability_snapshots",
  {
    id: uuid("id").primaryKey(),
    venueId: uuid("venue_id").notNull().references(() => venues.id),
    candidateId: uuid("candidate_id"),
    planId: uuid("plan_id"),
    verifier: text("verifier").notNull(),
    tier: text("tier", { enum: CHECK_TIERS }).notNull(),
    source: text("source").notNull(),
    slotStart: ts("slot_start").notNull(),
    durationMins: integer("duration_mins"),
    partySize: integer("party_size").notNull(),
    status: text("status", { enum: AVAILABILITY_STATUSES }).notNull(),
    reason: text("reason"),
    matchedSlot: jsonb("matched_slot").$type<Record<string, unknown>>(),
    checkedAt: ts("checked_at").notNull(),
    checkedByParticipantId: uuid("checked_by_participant_id").references(() => participants.id),
    fromCache: boolean("from_cache").notNull().default(false),
    rawPayloadId: uuid("raw_payload_id").references(() => verificationPayloads.id),
    latencyMs: integer("latency_ms"),
    purpose: text("purpose", { enum: CHECK_PURPOSES }).notNull(),
    jobId: text("job_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("snapshots_slot_idx").on(t.venueId, t.slotStart, t.partySize, t.checkedAt.desc()),
    index("snapshots_candidate_idx").on(t.candidateId),
    index("snapshots_plan_idx").on(t.planId),
  ],
);

// ── plans & RSVPs ───────────────────────────────────────────────────────────
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey(),
  token: text("token").notNull().unique(),
  hostParticipantId: uuid("host_participant_id").notNull().references(() => participants.id),
  hostSecretHash: text("host_secret_hash").notNull(),
  searchId: uuid("search_id").references(() => searches.id),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id),
  venueId: uuid("venue_id").notNull().references(() => venues.id),
  activity: text("activity", { enum: ACTIVITIES }).notNull(),
  slotStart: ts("slot_start").notNull(),
  durationMins: integer("duration_mins").notNull(),
  partySize: integer("party_size").notNull(),
  quorum: text("quorum", { enum: ["party_size"] }).notNull().default("party_size"),
  status: text("status", { enum: PLAN_STATUSES }).notNull().default("OPEN"),
  confirmingSnapshotId: uuid("confirming_snapshot_id"),
  replacedByPlanId: uuid("replaced_by_plan_id"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  version: integer("version").notNull().default(0),
});

export const rsvps = pgTable(
  "rsvps",
  {
    id: uuid("id").primaryKey(),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id),
    value: text("value", { enum: RSVP_VALUES }).notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rsvps_plan_participant_uq").on(t.planId, t.participantId)],
);

export const bookingHandoffs = pgTable("booking_handoffs", {
  id: uuid("id").primaryKey(),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  method: text("method", { enum: HANDOFF_METHODS }).notNull(),
  url: text("url").notNull(),
  prefilled: jsonb("prefilled").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
  clickedAt: ts("clicked_at"),
});
