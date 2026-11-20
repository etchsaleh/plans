import type { Activity, BudgetBand } from "./vocabulary";

export type Venue = {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  activity: Activity;
  area: string;
  priceBand?: BudgetBand | null;
  tags: string[];
  /** Provider-specific booking reference (e.g. Playtomic tenant id + slug). */
  bookingRef: Record<string, unknown>;
};
