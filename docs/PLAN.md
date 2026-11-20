# Plan — MVP build plan (v3)

Status: **v3. Slice A is in progress. The Instinct bridge is deferred by the owner (2026-11-20): it's designed only, with no code, tables or mail adapters until you say so.** This version adds the **Instinct email bridge** (full design in [`instinct-bridge.md`](instinct-bridge.md)). Live checks against Playtomic and the Royal Parks are built and gated (see [adapters status](adapters/README.md)).

What v3 changes and why:

| Area | v2 | v3 |
|---|---|---|
| Where availability comes from | direct verifiers only | **direct verifiers** (instant, for the venues we support) **+ Instinct over email** (asynchronous; anything Instinct is registered to check, including restaurants and cinema) |
| Booking | "Book now" deep link | **Never booked in-app.** "Choose this option", then "Approve the final booking and terms with Instinct on WhatsApp. Nothing is booked yet." Booked only on a `booking_result: confirmed` carrying provider evidence, or the organiser's manual "We're booked" with a reference |
| Host | anonymous | **signed-in organiser** (magic link, owner allow-list), because only the organiser can trigger mail to their own assistant |
| Friends | anonymous link + name | unchanged in feel, but the link is now an **invitation into a group**, so organiser-only data stays private |
| A plan | one candidate, yes/no | a **request with several options**: friends mark 👍/👎 and "I'm in", and the organiser chooses |
| Freshness | "bookable" if 15 minutes old or less | "checked X min ago", with "older check" after 15 min. **A check is never a hold**, so "bookable" goes away as a user-facing word |
| Categories | restaurant, padel, tennis | **+ cinema** (through Instinct only) |

---

## 0. Product, in one screen (v3)

**Organiser (signed in):**
1. **"What's the plan?"** sheet: category (Dinner · Padel · Tennis · Cinema), **explicit date**, time window, party size, area or venue, optional budget and notes.
2. The server routes the search:
   - **Direct path:** if the venues are covered by a live verifier (Playtomic or Royal Parks), options come back in seconds and each card shows "Verified 3 min ago".
   - **Instinct path:** if the search fits an **active registered action**, the app emails Instinct and shows **"Waiting for Instinct"**, with no countdown. When the reply is ingested, the options appear. Each shows "Checked by Instinct 12 min ago · source ↗", the venue, London local time, party size, the price (or "Price unknown") and the terms (or "Cancellation terms unknown").
   - **Neither:** the app explains why ("No registered action covers Dishoom on Fridays") and offers to request one. Registering the action happens over WhatsApp.
3. **Share**: the iOS share sheet sends an invite link to the WhatsApp group.

**Friends (no signup):** open the invite and enter a name once. They see the options and mark **👍/👎** on each, plus **I'm in / Can't make it**. They never see organiser-only details: provider references, raw source data, or terms you haven't approved for sharing.

**Choosing:**
- The organiser taps **"Choose this option"**. This records a *preference only*.
- The next screen says **"Selected. Approve the final booking and terms with Instinct on WhatsApp. Nothing is booked yet."** It shows the request ID and option ID, a copy button, and a prefilled `wa.me` message to Instinct for you to send yourself.
- Instinct re-checks the slot and asks you to approve the final slot, total, fees and cancellation terms. If anything changes, it asks again.
- **Booked** only happens on provider evidence: a threaded `booking_result: confirmed` (if agreed), or your manual "We're booked" entered with a provider reference. An `unknown` result means "needs reconciling" and never triggers a retry.

### Why keep party size and "I'm in"
Party size still drives every check. "I'm in" tells the organiser who's coming, so if 5 are in for a table for 4, they know to change the search. It no longer triggers anything automatically, because the commitment now happens in WhatsApp.

---

## 1. Hard rules (unchanged)
1. **The LLM never decides availability.** It only generates and ranks candidates from venue IDs it was given.
2. **`UNKNOWN` is never presented as bookable.** Nothing is bookable unless its newest positive check is 15 minutes old or less. Anything older gets re-checked first.
3. **Every check is written to the append-only `availability_snapshots` table**, with source, tier, timestamp and a payload reference. The audit page shows why each card was shown.
4. **Hexagonal boundaries are enforced by lint.**
5. **No scraping.** Every source is either licensed, permitted in writing, or link-only.

---

## 2. Verification reality, and the check-tier ladder

> v3: a fifth source of options is **Instinct over email**, shown as "Checked by Instinct". It has its own evidence (`checked_at`, `source_url`) and is never treated as a hold. See [instinct-bridge.md](instinct-bridge.md).

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

### 3.2 Search request state machine (replaces the v2 plan states)
```
 DRAFT ─submit─▶ QUEUED ─sent─▶ WAITING ─────────────── reply ingested ───────────────┐
   │   (direct path: QUEUED ─checks done─▶ RESULTS)        │ timeout: shows "No reply yet" (still WAITING;
   │                                                       │  only a manual follow-up re-sends)
   ▼                                                       ▼
 REJECTED (no registered action / out of scope)   RESULTS | NO_AVAILABILITY | NEEDS_CLARIFICATION | UNVERIFIED | ERROR
                                                       │ organiser "Choose this option"
                                                       ▼
                                                   SELECTED ──booking_result confirmed + provider evidence──▶ BOOKED
                                                       │      ──booking_result failed──▶ BOOKING_FAILED (choose another)
                                                       │      ──booking_result unknown──▶ NEEDS_RECONCILIATION (never auto-retries)
                                                       └── organiser picks another option ──▶ SELECTED (history kept)
 any open state ── organiser cancels ──▶ CANCELLED      any state ── slot passed ──▶ EXPIRED
```
* The send state is tracked separately (`pending | sent | uncertain | failed`). `uncertain` is reconciled against the Sent folder before any retry, with the same request ID.
* A late reply never overwrites a newer state (it's stored as `superseded`). Nothing ever leaves `BOOKED` except an explicit organiser action.
* `transition(request, event, now)` is pure and table-tested. That includes the brief's rule that votes, clicks and "approved" email text can never reach `BOOKED`.

### 3.3 RSVP and preference rules
* One RSVP (`in`/`out`) per (request, participant), and one preference (👍/👎) per (option, participant), both upserted. The organiser is automatically `in`.
* Neither triggers anything automatically. They inform the organiser's choice.

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

**Done:** Slice 0 (scaffold, DB, env, iOS UI kit). Verification core: domain rules, `PoliteHttp`, safety and audit decorators, contract suite, mock, Playtomic and Royal Parks verifiers, audit store, `npm run check`.

**Slice A: requests, options, roles** (the brief's step 1: database and status UI)
1. Domain: `SearchRequest` state machine, `Option`, `Selection`, `BookingResult` rules (evidence required; unknown never retries), and role-based field visibility.
2. Schema migration for the tables in [instinct-bridge §7](instinct-bridge.md#7-data-model-additions), plus append-only status history.
3. Organiser magic-link auth (owner allow-list), group invitations, and the participant cookie.
4. Direct path: search → verifiers → options (reusing the built verifiers).
5. UI: "What's the plan?" sheet, then waiting/results states for every status, then option cards, then preferences and "I'm in", then "Choose this option", then the "Approve in WhatsApp" screen. Playwright on iPhone.

**Slice B: Instinct bridge on mock mail** (the brief's step 2: validation, correlation, dedup, review)
6. Ports `AssistantMailTransport` / `AssistantSearchGateway`, the mock mailbox, and scripted Instinct fixtures.
7. Action registry and scope validation, request IDs, subject and body builder, outbox and `send_assistant_request` job (acceptance test 1).
8. Inbound pipeline: classify, correlate, authenticate, extract the new-text JSON, validate with zod, dedupe, apply or send to review. Tests for acceptance 2–8.
9. `/admin/assistant`: actions (register, pause, revoke), the setup checklist, the live-mode gate, the review queue and failed requests (acceptance 10).
10. Privacy: role filters, log redaction, retention job, and a bundle scan for secrets (acceptance 9).

**Slice C: real mailbox in a test environment** (the brief's step 3). This needs your mailbox decision (Q-E).
11. Gmail API (or IMAP/SMTP) adapter, credentials from the secret manager, the `poll_mailbox` job, and Sent-folder reconciliation. Tested against a test mailbox, with no mail sent to Instinct.

**Slice D: first live round trip, after the WhatsApp agreement** (the brief's step 4)
12. Tick the checklist, enable **one** action for **one** organiser, run one read-only search, and inspect the stored request, reply, parse and options together before widening.

**Later (from v2, unchanged):** Anthropic ranker for direct-path discovery, `expire_requests`, "Save this crew", and weekly picks (which for Instinct actions would be one scheduled email within the agreed frequency).

---

## 11. Decisions

**Settled:**
- London only.
- Spell UI and the iOS look.
- Custom magic-link auth.
- Deploy as web + worker from one Docker image.
- Live direct checks enabled for Playtomic and the Royal Parks, with permission asserted by the owner.
- **Booking only through WhatsApp approval with Instinct. The app never books or charges.**
- The organiser signs in; friends join by invitation.

**Open:**
- **Q-E: which mailbox does the app send from and read?** My recommendation is a dedicated Google Workspace or Gmail address, using the Gmail API with an OAuth refresh token stored as a secret. Gmail gives us thread IDs and the authentication results we check. IMAP/SMTP works with any provider, but its security signals are weaker.
- **Q-F: which first action should we register with Instinct?** For example: read-only checks for Rocket Padel Battersea, weekdays after 19:00, parties of 2–8, horizon 14 days, at most 3 searches a day. I'll seed it as a **draft** action. It stays off until you mark it agreed.
- **Q-G: should direct verifiers keep running next to Instinct?** I recommend yes. They're instant for the venues they cover, and they also help you sense-check Instinct's results. The alternative is to route everything through Instinct.
- **Q-H: what is Instinct's WhatsApp number?** It's only needed for the prefilled `wa.me` "approve this option" link. Without it, the app shows the text with a copy button.
- **Q-I: which result fields may the group see?** The default is: venue, time, party size, price (with total or quote marked) and the cancellation summary. Provider references and raw sources stay organiser-only.
- Older open questions (LLM budget, Google Places key) still apply to the direct path.
