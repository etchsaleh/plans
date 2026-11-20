import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
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
  CHECK_PURPOSES,
  CHECK_TIERS,
} from "@/domain/vocabulary";
import { REQUEST_STATUSES, type Search } from "@/domain/request";

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
    requestId: uuid("request_id"),
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

// ── sessions & groups ──────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  /** sha256 of the opaque cookie value; the raw value only lives in the browser cookie */
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey(),
  organizerUserId: uuid("organizer_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["organizer", "member"] }).notNull(),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("group_members_uq").on(t.groupId, t.participantId)],
);

// ── requests & options ─────────────────────────────────────────────────────
export const searchRequests = pgTable(
  "search_requests",
  {
    id: uuid("id").primaryKey(),
    /** opaque invite token used in the shared link (/r/<token>) */
    shareToken: text("share_token").notNull().unique(),
    organizerUserId: uuid("organizer_user_id").notNull().references(() => users.id),
    groupId: uuid("group_id").notNull().references(() => groups.id),
    search: jsonb("search").$type<Search>().notNull(),
    status: text("status", { enum: REQUEST_STATUSES }).notNull(),
    selectedOptionId: uuid("selected_option_id"),
    bookingReference: text("booking_reference"),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("search_requests_organizer_idx").on(t.organizerUserId, t.createdAt.desc())],
);

export const requestStatusHistory = pgTable(
  "request_status_history",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull().references(() => searchRequests.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    cause: text("cause").notNull(),
    actor: text("actor").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("request_history_idx").on(t.requestId, t.at)],
);

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey(),
    requestId: uuid("request_id").notNull().references(() => searchRequests.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    partySize: integer("party_size").notNull(),
    description: text("description").notNull(),
    checkedAt: ts("checked_at").notNull(),
    tier: text("tier", { enum: CHECK_TIERS }).notNull(),
    source: text("source").notNull(),
    snapshotId: uuid("snapshot_id").references(() => availabilitySnapshots.id),
    priceText: text("price_text"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("options_slot_uq").on(t.requestId, t.venueId, t.startsAt)],
);

export const preferences = pgTable(
  "preferences",
  {
    optionId: uuid("option_id").notNull().references(() => options.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    value: text("value", { enum: ["up", "down"] }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("preferences_uq").on(t.optionId, t.participantId)],
);

export const requestRsvps = pgTable(
  "request_rsvps",
  {
    requestId: uuid("request_id").notNull().references(() => searchRequests.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    value: text("value", { enum: ["in", "out"] }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("request_rsvps_uq").on(t.requestId, t.participantId)],
);

/** Dev-only record of mail the console mailer "sent" (magic links), shown at /dev/mailbox. */
export const devMailbox = pgTable("dev_mailbox", {
  id: uuid("id").primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
