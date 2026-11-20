/**
 * Run one live availability check and record it in the audit log.
 *
 *   npm run check -- hyde-tennis 2026-11-21 18:00 --size 4 [--duration 60] [--no-db] [--fresh]
 *   npm run check -- --list
 */
import { parseArgs } from "node:util";
import { classify } from "@/domain/availability";
import { fromLondon } from "@/domain/london-time";
import type { AvailabilitySnapshot } from "@/domain/availability";
import { LONDON_VENUES, venueHandle } from "@/adapters/catalogue/london-venues";
import { createDb, runMigrations } from "@/adapters/postgres/db";
import { PgSnapshotStore } from "@/adapters/postgres/snapshot-store";
import { upsertVenues } from "@/adapters/postgres/venue-repo";
import { buildVerification } from "@/composition/verification";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { SnapshotStore } from "@/ports";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: "string", default: "4" },
    duration: { type: "string", default: "60" },
    "no-db": { type: "boolean", default: false },
    fresh: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
  },
});

function usage(): never {
  console.log("usage: npm run check -- <venue> <YYYY-MM-DD> <HH:MM> [--size 4] [--duration 60] [--no-db] [--fresh]\n\nvenues:");
  for (const v of LONDON_VENUES) console.log(`  ${venueHandle(v).padEnd(22)} ${v.name} (${v.activity}, ${v.provider})`);
  process.exit(1);
}

async function main() {
  if (values.list || positionals.length < 3) usage();
  const [handle, date, time] = positionals;
  const venue = LONDON_VENUES.find((v) => venueHandle(v) === handle);
  if (!venue) usage();

  const e = env();
  const clock = { now: () => new Date() };
  let store: SnapshotStore = { append: async (s: AvailabilitySnapshot) => void s };
  let close = async () => {};
  if (!values["no-db"]) {
    const { db, pool } = createDb(e.DATABASE_URL);
    await runMigrations(db);
    await upsertVenues(db, LONDON_VENUES);
    store = new PgSnapshotStore(db);
    close = () => pool.end();
  }

  const { verifier, enabled, skipped } = buildVerification({ env: e, clock, logger, store });
  console.log(`enabled verifiers: ${enabled.join(", ") || "none"}${skipped.length ? ` | skipped: ${skipped.join("; ")}` : ""}`);

  const query = {
    venueId: venue.id,
    activity: venue.activity,
    start: fromLondon(date, time),
    durationMins: Number(values.duration),
    partySize: Number(values.size),
  };
  const r = await verifier.check(venue, query, { purpose: "initial", bypassCache: values.fresh });
  const c = classify(r, clock.now());
  console.log(
    JSON.stringify(
      {
        venue: venue.name, activity: venue.activity, slot: `${date} ${time} London`, partySize: query.partySize,
        status: r.status, verdict: c.kind, reason: r.reason, tier: r.tier, verifier: r.verifier,
        matched: r.matched?.resources.map((x) => x.name ?? x.id), price: r.matched?.priceText,
        checkedAt: r.evidence.checkedAt.toISOString(), fromCache: r.evidence.fromCache, source: r.evidence.source,
        audited: !values["no-db"],
      },
      null,
      2,
    ),
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
