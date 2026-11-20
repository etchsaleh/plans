/** Shared closed vocabularies. Persisted as text; the DB layer reuses these lists. */
export const ACTIVITIES = ["restaurant", "padel", "tennis"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const AVAILABILITY_STATUSES = ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** How a snapshot was obtained — see docs/PLAN.md §2. */
export const CHECK_TIERS = ["LICENSED", "HUMAN", "NONE", "MOCK"] as const;
export type CheckTier = (typeof CHECK_TIERS)[number];

export const CHECK_PURPOSES = ["initial", "recheck", "on_view", "lock_in"] as const;
export type CheckPurpose = (typeof CHECK_PURPOSES)[number];

export const PLAN_STATUSES = [
  "OPEN",
  "CONFIRMING",
  "BOOKABLE",
  "SLOT_GONE",
  "HANDED_OFF",
  "BOOKED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const RSVP_VALUES = ["in", "out"] as const;
export type RsvpValue = (typeof RSVP_VALUES)[number];

export const CANDIDATE_STATUSES = ["PENDING", "CHECKED", "UNCHECKABLE"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const SEARCH_STATUSES = ["QUEUED", "GENERATING", "CHECKING", "DONE", "FAILED"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export const BUDGET_BANDS = ["£", "££", "£££"] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number];

export const HANDOFF_METHODS = ["deep_link", "home_page", "phone"] as const;
export type HandoffMethod = (typeof HANDOFF_METHODS)[number];
