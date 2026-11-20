# Plan — MVP build plan (v2)

Status: **v2. Product flow simplified per your feedback, and adapter research done.** The research changes what "verified" can honestly mean, so §2 needs your call before Slice 3.

Changes since v1: there's no group setup and no roster of names. Quorum is now **party size**. Hosts don't need to log in. There's a check-tier ladder (§2), and a Spell UI / iOS layer (§8).

---

## 0. Product, in one screen

**Host (about 15 seconds, no signup):**
1. Open the app. The **"What's the plan?"** sheet asks:
   - **What:** Dinner · Padel · Tennis (segmented control).
   - **When:** Tonight · Tomorrow · Sat · Sun · pick a date, plus a time band (lunch, early evening, late).
   - **How many:** a stepper, defaulting to the last value, otherwise 4.
   - **Where:** London area chips, remembered from last time.
   - Optional: "Anything to avoid?" as free text ("one veggie, no seafood"), and a budget band (£ / ££ / £££).
2. The app shows **options that are already checked** for exactly that party size. They come straight from a pre-checked pool, or are checked on the spot while a shimmer shows. Every card shows its check tier and age ("Verified 3 min ago").
3. Tap one, then **Share**. The iOS share sheet opens with WhatsApp first, and the link shows a rich preview.

**Friends (about 3 seconds):**
1. Open the link in WhatsApp. They see a big venue card, the time, "Table for 4", how long ago it was checked, and who's in.
2. They tap **I'm in** or **Can't make it**. The first time, a sheet asks "What should we call you?" and the cookie remembers the answer after that.

**It happens when:**
* the number of people who are **in reaches the party size** (the host counts as in), **or** the host taps **Lock it in now**, whichever comes first. The host is never held up by a slow friend.
* At that point the app **re-checks immediately**:
  - **Still free:** the host gets **Book now**, a deep link with as much prefilled as the source allows. Everyone else sees "Sam is booking…".
  - **Gone:** the app shows the nearest checked alternatives (same activity, ±90 minutes, same party size). The host taps one, and the votes carry over to the new plan.
* If more people say they're in than the party size allows, the host sees "5 are in, table is for 4. Re-check for 5?" in one tap.

**Optional, later in the flow:** "Save this crew" (email magic link). Saving keeps the defaults (size, areas, notes) and opts the crew into **"Thursday picks"**, the scheduled agent that pre-checks options for the weekend and has a shareable plan ready.

### Why party-size quorum instead of everyone voting by name
Availability depends only on the **party size**, so that's the number that matters. A named roster adds setup and goes stale (WhatsApp groups and actual attendees differ). It also forces a "which one are you?" step on every friend, and it blocks the plan when one person never opens the link. With party-size quorum:
- there's no setup, and the plan works the moment the host shares it;
- friends can forward it, and whoever says they're in first gets the seats;
- the host can always lock it in early, so the plan isn't held hostage by the slowest person.

*Kept:* a named, all-must-confirm mode can be added later as a per-plan setting (`quorum: 'party_size' | 'named'`), because the domain models quorum as a strategy.

---

## 1. Hard rules (unchanged)
1. **The LLM never decides availability.** It only generates and ranks candidates from venue IDs it was given.
2. **`UNKNOWN` is never presented as bookable.** Nothing is bookable unless its newest positive check is 15 minutes old or less. Anything older gets re-checked first.
3. **Every check is written to the append-only `availability_snapshots` table**, with source, tier, timestamp and a payload reference. The audit page shows why each card was shown.
4. **Hexagonal boundaries are enforced by lint.**
5. **No scraping.** Every source is either licensed, permitted in writing, or link-only.

---

## 2. Verification reality, and the check-tier ladder (⚠️ needs your call)

The research (see [`docs/adapters/README.md`](adapters/README.md)) found **no London source that a third party may read automatically without a contract or permission**:

- **Playtomic:** robots.txt disallows `/api` and `?date=`, and its APIs are for clubs or certified partners only.
- **ClubSpark (Battersea):** Cloudflare blocks bots.
- **Royal Parks (Hyde Park and Regent's):** there's a public timetable, but the terms ban scraping.
- **OpenTable, SevenRooms, DesignMyNight, TheFork:** partner-only, and/or the sites bar bots.

Instinct-style agents either have contracts or automate consumer sites, which those terms forbid. I won't build the latter.

So every snapshot carries a **check tier**, and the UI is honest about it:

| Tier | How it's checked | UI label | Bookable? |
|---|---|---|---|
| `LICENSED` | partner API, or a source that gave written permission (verifier adapter) | ✅ "Verified 3 min ago" | yes, while 15 minutes old or less |
| `HUMAN` | **one tap by a person**: the app opens the venue's own booking page (deep link, prefilled), and the person taps "✓ 6pm is free" or "✗ gone" | ✅ "Checked by Sam 3 min ago" | yes, while 15 minutes old or less |
| `NONE` | link only | "Check availability ↗" | **no.** It's shown as an idea, never as bookable |
| (`MOCK`) | MockVerifier, used in demo and tests | "Verified (demo)" | yes |

`HUMAN` is legitimate, because it's a person using the site normally, and it's genuinely useful: the host or any friend does the check in about 10 seconds, and the app enforces the 15-minute rule and the re-check on lock-in. On lock-in, a `HUMAN`-tier plan asks the **host** to re-check with one tap before showing **Book now**.

**Getting to `LICENSED` (things only you can start):**
1. **Royal Parks:** email asking for written permission to read their public `/availability` timetable at a low rate and to deep-link to slots. This is the best quick win. The data is public and well structured, and the adapter can be built behind a flag that stays off until permission is on file.
2. **OpenTable Partner/Affiliate** application, for restaurants.
3. **Enable (Battersea):** ask for the same permission.
4. **Playtomic:** individual clubs can issue read-only Third Party API credentials to us (club-authorised). Connect is a B2B programme and a poor fit.

**Q-A (blocking Slices 3–4):** are you OK with the `HUMAN` tier counting as verified (clearly labelled "Checked by <name>"), with real venues link-only until a permission or partnership lands? The alternative is that the MVP shows *only* `LICENSED` and `MOCK` results, which today means demo data only.

---

## 3. Domain model (`src/domain`, pure TypeScript)

| Concept | Kind | Notes |
|---|---|---|
| `Participant` | Entity | Anonymous identity (signed cookie plus display name). **Both hosts and friends are participants.** |
| `Crew` | Aggregate (optional) | A saved preset: name, default size, areas, activity types, notes, owner `User`. Extension point for "Thursday picks". |
| `User` | Entity (optional) | Email, linked to a participant when they save a crew. |
| `Venue` | Entity | `{provider, externalId, name, area, priceBand, tags, bookingRef}` |
| `Search` | Entity | One "what's the plan?" request: activity, window, partySize, areas, notes, budget. The idempotency anchor for generation. |
| `Candidate` | Entity | (venue, slotStart, durationMins, partySize, activity) plus LLM score and rationale. Status: `PENDING → CHECKED \| UNCHECKABLE`. |
| `AvailabilitySnapshot` | Immutable event | `{status: AVAILABLE\|UNAVAILABLE\|UNKNOWN, tier, evidence{source, checkedAt, rawPayloadRef, fromCache, checkedBy?}}` |
| `Plan` | Aggregate root | A candidate shared with friends: token, host participant, party size, quorum strategy, RSVPs, state machine. |
| `Rsvp` | Entity in `Plan` | `IN \| OUT` per participant. Can be changed while voting is open. |
| `BookingHandoff` | Value | `{url, method: 'deep_link'\|'home_page'\|'phone', prefilled: string[], instructions}` |

### 3.1 Freshness rule
```
isBookable(snap, now) =
     snap.status === 'AVAILABLE'
  && snap.tier !== 'NONE'
  && now - snap.evidence.checkedAt <= 15 min
  && snap.slot.start - now >= minLeadTime(activity)
```

### 3.2 Plan state machine
```
                 inCount ≥ partySize  OR  host "Lock it in"
 OPEN ─────────────────────────────────────────────────────▶ CONFIRMING
  │  ▲                                                          │
  │  └──── re-check UNKNOWN (retryable) ◀───────────────────────┤
  │                                       AVAILABLE             │  UNAVAILABLE
  │                              BOOKABLE ◀─────────────────────┼────────────▶ SLOT_GONE ──host picks alt──▶ (new Plan, RSVPs carried over)
  │                                  │ host taps Book now
  │                                  ▼
  │                              HANDED_OFF ──host "We're booked ✓"──▶ BOOKED   (extension point: payments / API booking)
  ├── host cancels ──▶ CANCELLED
  └── slot start − lead time passed ──▶ EXPIRED   (expire_plans job; also enforced on read)
```
* `BOOKABLE` is valid only while the confirming snapshot is 15 minutes old or less. After that, the page drops back to "re-checking".
* `transition(plan, event, now) → Plan | DomainError` is pure, and table-tested for every state and event pair.

### 3.3 RSVP rules
* One RSVP per (plan, participant), upserted. The host is automatically `IN`.
* The quorum strategy is `PartySizeQuorum`, with `NamedQuorum` as an extension point.
* Changing an RSVP after `BOOKABLE` is allowed and shows to the host, but doesn't undo the state.

---

## 4. Data model (Postgres, Drizzle)

All times are `timestamptz` in UTC. Money is integer pence. IDs are UUIDv7.

```
participants          id, display_name NULL, created_at, last_seen_at
users                 id, email citext UNIQUE, participant_id → participants, created_at
auth_tokens           id, user_id, token_hash, expires_at, consumed_at
crews                 id, owner_user_id, name, default_party_size, areas text[], activity_types text[],
                      notes, budget_band, weekly_picks_enabled bool, created_at, updated_at

venues                id, provider, external_id, name, area, address, lat, lng, price_band,
                      tags text[], booking_ref jsonb, active bool, updated_at
                      UNIQUE (provider, external_id)

searches              id, host_participant_id, crew_id NULL, activity, window_start, window_end,
                      party_size, areas text[], notes, budget_band, trigger ('host'|'schedule'),
                      status, idempotency_key UNIQUE, created_at, finished_at
candidates            id, search_id, venue_id, activity, slot_start, duration_mins, party_size,
                      score real, rationale, ranker, ranker_model, status,
                      latest_snapshot_id NULL, created_at
                      UNIQUE (search_id, venue_id, slot_start, party_size)

availability_snapshots   -- APPEND-ONLY
                      id, venue_id, candidate_id NULL, plan_id NULL,
                      verifier, tier ('LICENSED'|'HUMAN'|'NONE'|'MOCK'), source,
                      slot_start, party_size, status, reason, matched_slot jsonb,
                      checked_at, checked_by_participant_id NULL, from_cache bool,
                      raw_payload_id NULL, latency_ms, purpose ('initial'|'recheck'|'on_view'|'lock_in'),
                      job_id NULL, created_at
                      INDEX (venue_id, slot_start, party_size, checked_at DESC)
verification_payloads id, sha256, content_type, body, created_at

plans                 id, token UNIQUE (128-bit base64url), host_participant_id, host_secret_hash,
                      search_id, candidate_id, party_size, quorum ('party_size'),
                      status, confirming_snapshot_id NULL, replaced_by_plan_id NULL,
                      expires_at, created_at, updated_at, version
rsvps                 id, plan_id, participant_id, value ('in'|'out'), created_at, updated_at
                      UNIQUE (plan_id, participant_id)
booking_handoffs      id, plan_id, provider, method, url, prefilled jsonb, created_at, clicked_at
```
`host_secret_hash` backs a private **host link** that's shown once and can be saved to Notes. It lets the host take control from another device. Normally the cookie is enough.

---

## 5. Ports (`src/ports`)

```ts
interface VenueProvider        { id; supports(activity); search(q: VenueQuery): Promise<Venue[]> }
interface AvailabilityVerifier { id; tier; supports(venue);
                                 check(q: SlotQuery, opts: { signal; bypassCache? }): Promise<VerificationResult> } // never throws → UNKNOWN
interface BookingHandoff       { id; supports(venue); build(venue, slot): BookingHandoffResult }                   // pure
interface CandidateRanker      { rank(input): Promise<RankedCandidate[]> }   // LLM or heuristic; may only cite given venue ids
interface HumanCheckRecorder   { record(planOrCandidate, participant, status): Promise<Snapshot> }                // the HUMAN tier
// infra
interface Clock, IdGen, JobQueue, Mailer, *Repository
```
Verifier decorators: `Timeout`, `RateLimited` (token bucket per host), `Cached` (≤ 5 minutes; keeps the original `checkedAt`), and `Audited` (writes a snapshot for every call). `VerifierRegistry` sends each venue to its verifier. If no verifier matches, the result is `UNKNOWN('no verifier')`.

**Adapters shipped:** `mock` (venue provider, verifier, handoff; scenario-driven), `playtomic`, `royalparks`, `clubspark` and `opentable`/`website` (all link-only handoffs; their verifiers return UNKNOWN), plus `RoyalParksVerifier` written against fixtures and disabled until permission is on file (Q-A), `anthropic` + `heuristic` rankers, `postgres`, `pgboss` and `mail`.

---

## 6. Jobs (pg-boss)

| Job | Trigger | Idempotency | Retry |
|---|---|---|---|
| `generate_candidates` | host search, or the schedule | `singletonKey = search_id`. Inserts use `ON CONFLICT DO NOTHING` | 3, exponential backoff from 30s |
| `verify_candidate` | fan-out | `candidate_id:purpose`. Skipped if a fresh snapshot exists | 3, backoff. Then `UNCHECKABLE` |
| `recheck_plan` | lock-in, or a stale view | `plan_id`, with a 60s singleton window | 2 |
| `expire_plans` | cron every 5 minutes | set-based UPDATE | default |
| `weekly_picks` | cron Thursday 16:00 Europe/London, saved crews only | `crew_id:iso-week` | default |
| `prewarm_pool` | cron every 10 minutes, **LICENSED and MOCK verifiers only** | `verifier:slot-bucket` | default, under a strict per-source request budget |

Re-checking on lock-in runs inline (about 5 seconds) for instant feedback. The job is the fallback. The worker is a separate process (`npm run worker`).

---

## 7. Folder structure

```
docs/            PLAN.md, adapters/*.md
drizzle/         migrations
e2e/             Playwright (iPhone 15 primary, Pixel 7)
scripts/         seed.ts, dev-db.sh
src/
  domain/        pure TS + __tests__
  ports/
  application/   use cases + __tests__ (in-memory fakes)
  adapters/      mock/ playtomic/ royalparks/ clubspark/ opentable/ website/ anthropic/ heuristic/
                 postgres/ pgboss/ mail/ verifier-decorators/
  contracts/     shared contract suites every adapter must pass
  composition/   the only place adapters are wired to ports
  worker/        pg-boss worker entry
  app/           Next.js routes (thin)
  ui/ios/        iOS primitives
  ui/spell/      vendored Spell UI (MIT)
  lib/           env, cookies, logger, time
```

---

## 8. UI: native iOS feel (Spell UI on top of our iOS primitives)

**Base layer (`src/ui/ios`):**
- **Type and colour:** the system font stack, iOS text sizes (Large Title 34, Body 17, Footnote 13), and iOS system colours as tokens with automatic dark mode.
- **Navigation:** large-title navigation bar that collapses with a blur as you scroll.
- **Lists:** grouped inset lists.
- **Sheets:** bottom sheets with detents (`vaul`), used for "What's the plan?", "What should we call you?" and alternatives.
- **Controls:** segmented control, stepper, 44pt hit targets, and press-scale feedback.
- **Safe areas:** `viewport-fit=cover` with safe-area insets.
- **Home screen and motion:** standalone PWA meta, and spring motion that respects `prefers-reduced-motion`.

**Spell UI** ([xxtomm/spell-ui](https://github.com/xxtomm/spell-ui), MIT, React 19 + Tailwind v4 + `motion`) is **vendored** into `src/ui/spell/` with the licence and the upstream commit hash.

| Spell component | Where it's used |
|---|---|
| `animated-checkbox` | tapping **I'm in**, and the ticks in the "who's in" list |
| `spinner` / `bars-spinner` | the iOS activity indicator while re-checking |
| `shimmer-text` | "Checking live availability…" |
| `slide-up-text` | the in-count ticking (3/4 → 4/4) and "checked 2 min ago" |
| `blur-reveal` / `words-stagger` | card entrance, and the "It's on 🎉 Book now" reveal |
| `pop-button` / `rich-button` | I'm in / Can't make it / Book now (restyled as iOS filled buttons) |
| `badge` | tier and freshness pills |
| `fallback-avatar` | avatars of the people who are in |
| `copy-button`, `qr-code` | the share sheet |
| `label-input` | the name and email fields |

Left out: `light-rays` (it pulls in three.js), and `tweet`, `spotify-card`, `signature`, `perspective-book`, `marquee` and `kbd`. Budget: under 120 KB of JavaScript (gzipped) on the plan page, which is server-rendered with only the RSVP part running client-side.

**OpenGraph:** `opengraph-image.tsx` shows the venue, time and party size. It never shows freshness, because WhatsApp caches previews.

---

## 9. Testing
- **Domain unit tests:** freshness rule (including tiers), quorum, state machine table, alternatives.
- **Application tests with fakes:** idempotent generation and verification, a lock-in race where two people tap at once, and RSVP carry-over.
- **Contract suites:** for verifiers (never throws; UNKNOWN on timeout, 5xx or garbage; `checkedAt` valid; a reason for non-AVAILABLE; honours abort; link-only verifiers never return AVAILABLE), for handoffs (pure, absolute https URL, no PII in the URL) and for venue providers. Real adapters run against recorded fixtures.
- **Postgres integration tests:** repositories, constraints, migrations.
- **Playwright on iPhone 15:** the host searches, picks and shares. Three friend contexts open the link, enter names and tap I'm in, then quorum, re-check, Book now. A second scenario covers "gone on re-check", then alternatives, then a new plan. There are also visual snapshots of `/dev/ui`.

---

## 10. Build order (each step = tests + commit)

**Slice 0: scaffold**
1. Next 16, React 19, TS, Tailwind v4, ESLint boundaries, Vitest, Playwright.
2. Drizzle schema, first migration, `dev-db.sh` / docker-compose.
3. env (zod), logger, composition root.
4. iOS UI foundation: tokens, `ui/ios` primitives, vendored Spell UI, `/dev/ui` gallery.

**Slice 1: anonymous host, search, mock verifier, plan page RSVP, end to end**
5. Domain: availability, tiers, freshness, quorum, state machine.
6. Ports, in-memory fakes, contract suites, mock adapters.
7. Verifier decorators.
8. Postgres repositories.
9. pg-boss worker, `generate_candidates` and `verify_candidate` (heuristic ranker).
10. "What's the plan?" sheet, then the results list, then the plan and share.
11. `/p/[token]`: name sheet, I'm in / Can't make it, live counts, freshness, OG image.
12. Seed data and e2e.

**Slice 2: lock-in, re-check, handoff**
13. Quorum or lock-in triggers a re-check, then BOOKABLE or SLOT_GONE, plus a re-check on view when stale.
14. Alternatives and carry-over. Handoff, Book now, "We're booked ✓".

**Slice 3: Playtomic, plus tennis (Royal Parks / ClubSpark)**
15. Link-only handoffs and their contract tests. The HUMAN-tier check flow (if Q-A is yes). The `RoyalParksVerifier` against fixtures, behind a flag.

**Slice 4: restaurants**
16. OpenTable and website link-only handoffs, a curated London catalogue, and the HUMAN tier.

**Slice 5: agent and expiry**
17. Anthropic ranker (stubbed client in tests, and a guard test that it never touches availability).
18. `expire_plans`, `prewarm_pool`, "Save this crew" (magic link), `weekly_picks`.
19. README: setup, env vars, worker, adding an adapter, the audit page.

---

## 11. Decisions

**Settled:**
- London only.
- No existing partner access.
- Quorum is party size, and the host can lock it in early.
- Host doesn't need to log in. Email login is only for saved crews and weekly picks.
- Spell UI and the iOS look.
- Custom magic-link auth.
- Deploy as web + worker from one Docker image.

**Open:**
- **Q-A:** should the HUMAN tier count as verified? (§2. Blocks Slices 3 and 4, not 0 to 2.)
- **Q-B:** will you send the permission and partner emails (Royal Parks, OpenTable, Enable)? I can draft them.
- **Q-C:** do you want a Google Places API key for discovery? Without one, discovery uses a curated catalogue.
- **Q-D:** what's the LLM budget cap? The default is a small model, at most 20 candidates per search and 30 searches per participant per day.
