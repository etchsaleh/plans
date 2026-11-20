# Plan — MVP build plan

Status: **draft, awaiting approval**. No application code until this is signed off.

## 0. What we're building

Plan helps a friend group choose a restaurant or activity **that has already been checked as available** for the group's party size, vote on it through a link shared in WhatsApp, and then book it.

Rules that shape the whole design:

1. **Availability comes only from verifiers.** The LLM generates and ranks candidates. It never decides, infers or states whether a slot is available.
2. **`UNKNOWN` is never shown as bookable.** Nothing is shown as bookable if its newest `AVAILABLE` check is older than 15 minutes. It must be re-checked first.
3. **Every check is written to an append-only audit log** (`availability_snapshots`): source, timestamp, result and a reference to the raw payload.
4. **Hexagonal boundaries.** The domain code is pure TypeScript and imports no Next, Drizzle, pg-boss or SDK code. Adapters depend on ports, never the reverse.

---

## 1. Domain model

### 1.1 Aggregates and value objects (`src/domain`)

| Concept | Kind | Notes |
|---|---|---|
| `Group` | Aggregate root | Host-owned. Holds members, budget, areas, activity types and time zone. |
| `Member` | Entity in `Group` | A display name plus free-text notes ("no seafood"). It can be *claimed* by an anonymous participant. |
| `Participant` | Entity | An anonymous friend, identified by a signed cookie and a display name. Not a user account. |
| `Venue` | Entity | A place from a provider: `{provider, externalId, name, area, priceBand, tags, bookingUrl}`. |
| `SearchRun` | Entity | One "find plans" execution: who or what triggered it, the time window and the party size. Used as the idempotency anchor. |
| `Candidate` | Entity | A (venue, slotStart, partySize, activityType) proposal with an LLM score and rationale. Lifecycle: `PENDING → VERIFIED \| REJECTED \| UNVERIFIABLE`. |
| `AvailabilitySnapshot` | Immutable value / event | The result of a single verifier call. **Append-only.** |
| `Plan` | Aggregate root | A candidate proposed to the group, with a public token, votes and a state machine. |
| `Vote` | Entity in `Plan` | `YES \| NO` per member. Changeable until the plan locks. |
| `BookingHandoff` | Value | The output of the handoff port: URL, method and the fields that were prefilled. |

### 1.2 Verification result (port contract)

```ts
type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

interface VerificationResult {
  status: AvailabilityStatus;
  venueRef: { provider: string; externalId: string };
  slot: { start: Date; partySize: number; durationMins?: number };
  matchedSlot?: { start: Date; end?: Date; resourceId?: string; priceMinor?: number }; // e.g. which padel court
  reason?: string;              // required when UNKNOWN or UNAVAILABLE
  evidence: {
    source: string;             // verifier id + endpoint/page identifier
    checkedAt: Date;            // time the SOURCE was read, not the time a cached copy was served
    rawPayloadRef: string | null; // pointer into verification_payloads
    fromCache: boolean;
  };
}
```

### 1.3 Freshness rule (pure domain function, unit-tested)

```
isBookable(snapshot, now) =
     snapshot.status === 'AVAILABLE'
  && now - snapshot.evidence.checkedAt <= 15 min
  && snapshot.slot.start > now + minLeadTime
```

The UI shows "verified X min ago" from `checkedAt`. A cached result keeps its original `checkedAt`, so a cache can never make a snapshot look fresher than it is.

### 1.4 Plan state machine

```
            all required YES                 re-verify AVAILABLE
 VOTING ───────────────────────▶ CONFIRMING ─────────────────────▶ BOOKABLE ──(host taps Book)──▶ HANDED_OFF
   │  ▲                              │  re-verify UNAVAILABLE/UNKNOWN
   │  └── (vote changed) ◀───────────┤
   │                                 ▼
   │                             SLOT_GONE  ── shows alternatives from the verified pool; host can "Propose this instead" (new Plan)
   │
   ├── any NO (see Q2) ──▶ DECLINED  (shows alternatives)
   └── slot passed / TTL ──▶ EXPIRED      (expire_plans job; also enforced on read)
```

* `BOOKABLE` lasts only while the confirming snapshot is 15 minutes old or less. After that, opening the page triggers a re-check, and the page shows "re-checking…" in the meantime.
* Moves between states are pure functions (`transition(plan, event, now) → plan | DomainError`). Repositories only persist the result.

### 1.5 Voting rules (pure, unit-tested)

* The required voters are the group's members, snapshotted onto the plan when it is created (`plans.required_member_ids`). Adding a member later does not change the quorum of plans that already exist.
* One vote per member per plan, upserted, so changing a vote is allowed while the plan is `VOTING`.
* A participant claims a member name the first time they open the link: "Which one are you?" lists the unclaimed names, with "I'm not listed" below them. A claim is per group and is stored on the participant. Another device can't take over a claimed name, but the host can reset a claim.
* Quorum is reached when every required member has voted `YES`. That emits a `QuorumReached` event, which triggers re-verification.

---

## 2. Data model (Postgres, Drizzle)

All timestamps are `timestamptz` in UTC. Money is stored in integer minor units (pence). IDs are UUIDv7, which sort by time and are useful in audit logs.

```
users                 id, email (unique, citext), created_at
auth_tokens           id, user_id, token_hash (sha256), expires_at, consumed_at   -- magic-link
sessions              id, user_id, expires_at, created_at                          -- host session cookie

groups                id, host_user_id → users, name, timezone ('Europe/London'),
                      budget_min_minor, budget_max_minor, currency ('GBP'),
                      areas text[], activity_types text[]  ('restaurant'|'padel'),
                      created_at, updated_at
members               id, group_id → groups, display_name, notes text,
                      claimed_by_participant_id → participants NULL, position, created_at
                      UNIQUE (group_id, lower(display_name))
participants          id, display_name, created_at, last_seen_at              -- anonymous friends

venues                id, provider, external_id, name, area, address, lat, lng,
                      price_band, tags text[], booking_url, metadata jsonb, updated_at
                      UNIQUE (provider, external_id)

search_runs           id, group_id, trigger ('host'|'schedule'), window_start, window_end,
                      party_size, status ('queued'|'generating'|'verifying'|'done'|'failed'),
                      idempotency_key UNIQUE, error, created_at, finished_at
candidates            id, search_run_id, group_id, venue_id, activity_type,
                      slot_start, duration_mins, party_size,
                      score real, rationale text, ranker ('llm'|'heuristic'), ranker_model,
                      status ('pending'|'verified'|'rejected'|'unverifiable'),
                      latest_snapshot_id → availability_snapshots NULL,
                      created_at
                      UNIQUE (search_run_id, venue_id, slot_start, party_size)   -- idempotent generation

availability_snapshots  (APPEND-ONLY: no UPDATE/DELETE grants for the app role in prod)
                      id, candidate_id NULL, plan_id NULL, venue_id,
                      verifier ('mock'|'playtomic'|…), source text,
                      slot_start, party_size, status, reason,
                      matched_slot jsonb, checked_at, from_cache bool,
                      raw_payload_id → verification_payloads NULL,
                      latency_ms, purpose ('initial'|'reverify'|'on_view'),
                      job_id NULL, created_at
                      INDEX (venue_id, slot_start, party_size, checked_at DESC)
verification_payloads id, sha256, content_type, body jsonb|text (truncated/redacted), created_at
                      -- referenced by snapshots; pruned after N days (not snapshots)

plans                 id, group_id, candidate_id, token (UNIQUE, 22-char base64url, 128-bit),
                      status, required_member_ids uuid[],
                      confirming_snapshot_id NULL, expires_at, created_by_user_id,
                      created_at, updated_at, version int   -- optimistic concurrency
votes                 id, plan_id, member_id, participant_id, value ('yes'|'no'),
                      created_at, updated_at
                      UNIQUE (plan_id, member_id)
booking_handoffs      id, plan_id, provider, method ('deep_link'|'phone'|'none'),
                      url, prefilled jsonb, created_at, clicked_at NULL

-- pg-boss creates and manages its own `pgboss` schema.
```

Extension points that are deliberately left empty: `booking_handoffs.method` can later take `'api'` for direct booking and payments, a `notifications` outbox can be added for a WhatsApp bot, and `activity_types` is open text so `cinema` can be added later.

---

## 3. Ports (`src/ports`)

```ts
interface VenueProvider {            // discovery: "what venues exist for these criteria?"
  readonly id: string;
  supports(activity: ActivityType): boolean;
  search(q: VenueQuery): Promise<Venue[]>;      // area(s), activity, priceBand, limit
}

interface AvailabilityVerifier {      // truth: "is THIS slot free for THIS party size?"
  readonly id: string;
  supports(venue: Venue): boolean;
  check(q: SlotQuery, opts: { signal: AbortSignal; bypassCache?: boolean }): Promise<VerificationResult>;
  // MUST NOT throw for upstream failure → returns UNKNOWN with reason
}

interface BookingHandoff {
  readonly id: string;
  supports(venue: Venue): boolean;
  build(venue: Venue, slot: SlotQuery): BookingHandoffResult;   // pure; no I/O
}

interface CandidateRanker {           // LLM lives behind this; heuristic fallback adapter exists
  rank(input: RankInput): Promise<RankedCandidate[]>;  // may only reference venue ids it was given
}

// Infrastructure ports
interface Clock { now(): Date }
interface JobQueue { enqueue<K extends JobName>(name: K, data: JobData[K], opts?: EnqueueOpts): Promise<void> }
interface Mailer { sendMagicLink(email: string, url: string): Promise<void> }
interface *Repository …   // Groups, Plans, Candidates, Snapshots, Votes, Participants
```

Adapters can be wrapped in **decorators**, which keeps cross-cutting rules in one place instead of copying them into every adapter:

* `RateLimitedVerifier`: a token bucket per provider and host, with conservative defaults (for example 1 request every 2 seconds) that can be set per adapter.
* `CachedVerifier`: a TTL of at most 5 minutes, keyed by `(venue, slot, partySize)`. It returns `fromCache: true` and keeps the original `checkedAt`. Callers can pass `bypassCache` to skip it, and re-verification always does.
* `AuditedVerifier`: writes an `availability_snapshots` row and the payload for **every** call, including cache hits and UNKNOWN results.
* `TimeoutVerifier`: aborts after N seconds and returns `UNKNOWN('timeout')`.

A `VerifierRegistry` picks the verifier for each venue. If no verifier supports a venue, the result is `UNKNOWN('no verifier')`, so the venue is never shown.

---

## 4. Application services (`src/application`)

These are use cases. Each one is a plain function that receives its dependencies explicitly, and there is no DI container.

* `requestMagicLink`, `consumeMagicLink`
* `createGroup`, `updateGroup`, `addMember`, `removeMember`
* `startSearchRun(groupId, window, trigger)` creates a `search_run` and enqueues `generate_candidates`.
* `generateCandidates(searchRunId)`: `VenueProvider.search` → `CandidateRanker.rank` → insert the candidates (idempotent through a unique key) → enqueue one `verify_candidate` per candidate.
* `verifyCandidate(candidateId, purpose)` runs the verifier chain, stores the snapshot and updates the candidate status.
* `proposePlan(groupId, candidateId)` requires `isBookable(latest snapshot)`, then creates a plan and token.
* `openPlan(token, participant)` returns the read model and triggers `on_view` re-verification if the snapshot is stale.
* `claimMember`, `castVote` run the domain rules. When quorum is reached, they enqueue a `reverify_plan` job with high priority.
* `reverifyPlan(planId)` moves the plan to `BOOKABLE` or `SLOT_GONE` and computes alternatives.
* `handOff(planId)` calls `BookingHandoff.build` and records the handoff.
* `expirePlans(now)`

Re-verification on quorum also runs **inline**, with a short timeout, so the person who casts the last Yes sees the result straight away. The job is only a fallback for retries.

---

## 5. Jobs (pg-boss)

| Job | Trigger | Idempotency | Retry |
|---|---|---|---|
| `generate_candidates` | host "Find plans", or the daily schedule | `singletonKey = search_run_id`. Candidate inserts use `ON CONFLICT DO NOTHING`. | 3 attempts, exponential backoff from 30s |
| `verify_candidate` | fan-out from generation | `singletonKey = candidate_id:purpose`. Skips if a fresh snapshot already exists. | 3 attempts, backoff. Once retries run out, the candidate becomes `unverifiable`. |
| `reverify_plan` | quorum, or a stale view | `singletonKey = plan_id`, with a 60-second singleton window | 2 attempts, short backoff |
| `expire_plans` | cron every 5 minutes | a set-based UPDATE that is a no-op on re-run | default |
| `daily_find_plans` | cron daily at 10:00 Europe/London | `idempotency_key = group_id:date` on `search_runs` | default |

The worker runs as its own process (`npm run worker`, entry point `src/worker/index.ts`) so it can run Playwright and long jobs outside the Next request lifecycle. **Hosting therefore needs a long-running process (see Q5).**

---

## 6. Folder structure

```
.
├── docs/
│   ├── PLAN.md
│   └── adapters/{mock,playtomic,<restaurant>}.md        # research written BEFORE each adapter
├── drizzle/                                              # generated SQL migrations (committed)
├── e2e/                                                  # Playwright e2e (mobile viewport)
│   └── friend-voting.spec.ts
├── scripts/
│   ├── seed.ts                                           # demo group + mock venues + a live plan
│   └── dev-db.sh                                         # start a local Postgres without Docker
├── src/
│   ├── domain/            # pure TS: entities, value objects, rules, state machine, errors
│   │   ├── plan.ts  vote.ts  availability.ts  group.ts  candidate.ts
│   │   └── __tests__/
│   ├── ports/             # interfaces only
│   ├── application/       # use cases; depend on domain + ports only
│   │   └── __tests__/     # use-case tests with in-memory fakes
│   ├── adapters/
│   │   ├── mock/          # MockVenueProvider, MockVerifier (deterministic, scenario-driven), MockHandoff
│   │   ├── playtomic/
│   │   ├── <restaurant>/
│   │   ├── anthropic/     # CandidateRanker via @anthropic-ai/sdk (+ zod-validated tool output)
│   │   ├── heuristic/     # CandidateRanker fallback when no API key
│   │   ├── postgres/      # Drizzle schema + repository implementations
│   │   ├── pgboss/        # JobQueue + worker wiring
│   │   ├── mail/          # console/dev mailbox + SMTP
│   │   └── verifier-decorators/   # rate limit, cache, audit, timeout
│   ├── contracts/         # shared contract suites every adapter must pass
│   │   ├── availability-verifier.contract.ts
│   │   ├── venue-provider.contract.ts
│   │   └── booking-handoff.contract.ts
│   ├── composition/       # the only place adapters are wired to ports (container.ts)
│   ├── worker/            # pg-boss worker entry
│   ├── app/               # Next.js App Router — thin: parse input → call use case → render
│   │   ├── (host)/…       # sign-in, groups, find plans, propose
│   │   ├── p/[token]/page.tsx, opengraph-image.tsx, actions.ts
│   │   └── api/…          # polling endpoint for live counts, auth callback
│   ├── ui/
│   │   ├── ios/           # our iOS primitives: NavBar (large title), TabBar, GroupedList/Cell, Sheet, SegmentedControl, ActionSheet, Toast
│   │   └── spell/         # vendored Spell UI components (MIT, see §7a), adapted to our tokens
│   └── lib/               # cookies/signing, env (zod-validated), logger (pino), time utils
├── drizzle.config.ts  next.config.ts  playwright.config.ts  vitest.config.ts
└── README.md
```

ESLint `import/no-restricted-paths` (or `eslint-plugin-boundaries`) enforces the dependency rules: `domain` imports nothing, `application` imports only `domain` and `ports`, and only `composition` imports `adapters`. The lint fails the build if a boundary is broken.

---

## 7. Cross-cutting decisions

* **Friend identity:** an HMAC-signed cookie `plan_pid=<participantId>.<sig>` (httpOnly, SameSite=Lax, 1-year expiry). It is signed with `COOKIE_SECRET`. No PII beyond the display name.
* **Host auth:** a small custom magic-link flow. Tokens are stored as SHA-256 hashes, expire after 15 minutes and work once. Sessions are server-side. In dev, mail goes to the console and to a `/dev/mailbox` page. In production, mail goes through SMTP via nodemailer, so any provider works. (Auth.js is the alternative; see Q4.)
* **Live vote counts:** polling every 4 seconds with `If-None-Match`. This is cheap and works through WhatsApp's in-app browser. SSE can come later.
* **OpenGraph:** `opengraph-image.tsx` renders the venue, time and party size with `next/og`. **The image never shows "verified X ago"** because WhatsApp caches previews. The title and description say "Vote: Dishoom Carnaby · Fri 18:00 · 4 people".
* **PWA:** a manifest and icons only. No service worker caching of plan pages, because availability must never be served stale offline.
* **Logging:** structured pino logs. Every verification is logged as `{verifier, source, venue, slot, partySize, status, checkedAt, fromCache, snapshotId}` and also persisted to `availability_snapshots`. A host-only page, `/groups/[id]/audit`, lists the snapshots behind each candidate and plan.
* **LLM:** `@anthropic-ai/sdk` with tool use and structured output, validated by zod. The prompt includes the group's notes, budget and areas, and the venue list with IDs. **The LLM never sees and never writes availability data.** Any venue ID that isn't in the input is dropped. The model is set with `ANTHROPIC_MODEL`. If `ANTHROPIC_API_KEY` is missing, the heuristic ranker is used, so demos and tests run offline.
* **Config:** environment variables are validated with zod at startup. See the env var list in the README, written in slice 1.

---

## 7a. UI: native iOS feel

**Goal:** when someone opens the link from WhatsApp on an iPhone, it should feel like an iOS app, not a website. "Add to Home Screen" should then run as a standalone PWA.

**Base layer: our own iOS primitives (`src/ui/ios`), built on Tailwind v4.** Spell UI doesn't provide them (see below), so I'll build a small set myself:
* **Type and colour:** the system font stack (`-apple-system, "SF Pro Text", system-ui`), Dynamic Type sizes from the iOS scale (Large Title 34, Title 3 20, Body 17, Footnote 13), and iOS system colours as CSS tokens (systemBlue, systemGreen, systemRed, label/secondaryLabel, systemGroupedBackground, separator), with automatic dark mode.
* **Layout:** large-title navigation bar that collapses on scroll with a translucent blur; grouped inset lists (cells with chevrons and hairline separators); bottom tab bar for the host; `viewport-fit=cover` and `env(safe-area-inset-*)` everywhere.
* **Sheets:** bottom sheets with detents and drag-to-dismiss (`vaul`) for "Which one are you?", alternatives and sharing; an iOS-style action sheet for host actions.
* **Controls:** a segmented control for Restaurant/Padel; switches; 44pt minimum hit targets; press states that scale and dim slightly; `-webkit-tap-highlight-color: transparent`; no hover-only affordances.
* **Motion:** spring physics via `motion`, all of it disabled under `prefers-reduced-motion`.
* **Home screen app:** `apple-mobile-web-app-capable`, status-bar-style `black-translucent`, apple-touch-icon and splash images.

**Spell UI ([xxtomm/spell-ui](https://github.com/xxtomm/spell-ui), MIT) adds polish on top of the base layer.** It is a copy-paste component collection: 33 components, React 19 + Tailwind v4 + `motion`, with shadcn registry metadata. It isn't published on npm. Its docs site wouldn't resolve from my sandbox, so I couldn't confirm an official install command. I'll **vendor the source files into `src/ui/spell/`**, keeping the MIT notice and the upstream commit hash, and adapt them to our tokens. This also lets us tune them to feel iOS-native.

| Spell component | Where it's used |
|---|---|
| `animated-checkbox` | the moment you vote Yes, and each member's tick in the "who's in" list |
| `spinner` / `bars-spinner` | iOS-style activity indicator during "Re-checking availability…" |
| `shimmer-text` | "Checking live availability…" while verification runs |
| `slide-up-text` / `randomized-text` | live vote counts and "verified 2 min ago" ticking over |
| `words-stagger` / `blur-reveal` | plan card entrance; the "It's on! 🎉 Book now" reveal |
| `pop-button` / `rich-button` / `flow-button` | the main Yes / No / Book now buttons (restyled as iOS filled buttons) |
| `badge` | the "Verified · 3 min ago" pill (green), "Stale – rechecking" (orange), "Gone" (red) |
| `fallback-avatar` | member avatars (initials) in the voting list |
| `copy-button` | "Copy link" in the share sheet |
| `qr-code` | "Show QR" in the share sheet, for sharing in person |
| `label-input` | sign-in email and the "Your name" field |
| `tilt-card` | subtle tilt on the venue hero card (off on touch if it feels janky) |

Deliberately **not** used: `light-rays` (pulls in three.js, too heavy for a link opened over mobile data), and `tweet`, `spotify-card`, `signature`, `perspective-book`, `marquee`/`logos-carousel` and `kbd`, because none of them fits this app.

**Performance budget:** the plan page must stay fast in WhatsApp's in-app browser over 4G. It is server-rendered, and only the voting island is client-side. The JS target is under 120 KB gzipped, and Spell components are lazy-loaded where possible.

## 8. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Domain | Vitest | freshness rule, voting quorum, claim rules, state machine (table-driven, every legal and illegal transition), alternatives selection |
| Application | Vitest + in-memory fakes | use cases end to end without I/O: idempotency of generation and verification, a re-verify race when two people vote at once |
| Contract | Vitest, shared suites | `runAvailabilityVerifierContract(makeVerifier, fixtures)`: never throws, returns UNKNOWN on timeout, 5xx or malformed payloads, `checkedAt` set and not in the future, `reason` present for non-AVAILABLE, honours `AbortSignal`, never AVAILABLE for an unsupported venue. Real adapters run it against **recorded fixtures** (msw). A live smoke run is opt-in with `LIVE_ADAPTER_TESTS=1`. |
| Persistence | Vitest + real Postgres | repositories, unique constraints, migration up from empty |
| Visual | Playwright, `devices['iPhone 15']` | screenshot snapshots of `/dev/ui` and the plan page in light and dark mode, to catch visual regressions |
| E2E | Playwright, `devices['iPhone 15']` (primary) and `Pixel 7` | host creates a group and proposes a plan; 3 friend browser contexts open `/p/[token]`, claim names and vote Yes → BOOKABLE → Book now link. A second scenario uses the mock verifier's "slot disappears on re-verify" mode → SLOT_GONE with alternatives shown. |

The MockVerifier is driven by scenarios such as `always-available`, `flaky`, `gone-on-reverify` and `unknown`, selected per venue in the seed data. This keeps the e2e tests deterministic.

---

## 9. Build order (each step = tests + commit)

**Slice 0 — scaffold**
1. Next.js 16 + React 19 + TypeScript + Tailwind v4 + motion + ESLint boundary rules + Vitest + Playwright config.
2. Drizzle + the Postgres schema + the first migration, plus `scripts/dev-db.sh` and a `docker-compose.yml` for local use.
3. Zod-validated env loading, pino logger, composition root skeleton.
3b. iOS UI foundation: design tokens (light/dark), safe areas, `ui/ios` primitives, vendored Spell UI components, and a `/dev/ui` gallery page with Playwright screenshot tests on the iPhone viewport.

**Slice 1 — host, group, mock verifier and plan page voting, end to end**
4. Domain: availability, freshness, plan state machine, voting rules, all unit-tested.
5. Ports, plus the in-memory fakes used in application tests.
6. Mock adapters (VenueProvider, Verifier, Handoff) and the shared contract suites. The mock adapters pass the contracts.
7. Verifier decorators (timeout, rate limit, cache, audit), with tests.
8. Postgres repositories, with integration tests.
9. Host magic-link auth (dev mailbox).
10. Group creation and editing UI: members, notes, budget, areas, activity types.
11. pg-boss wiring and the worker. `generate_candidates` and `verify_candidate` use the heuristic ranker.
12. "Find plans" UI → list of verified candidates → "Propose" → plan token and a share button (WhatsApp `wa.me/?text=` share plus copy link).
13. `/p/[token]`: claim a name, vote, live counts, "verified X min ago", OpenGraph image.
14. Seed script and Playwright e2e for the friend voting flow on a mobile viewport.

**Slice 2 — re-verify and handoff**
15. Quorum → re-verify inline with a job fallback → BOOKABLE / SLOT_GONE, plus `on_view` re-verify for stale snapshots.
16. Alternatives from the verified pool, and "Propose this instead".
17. BookingHandoff port wiring, the "Book now" page and handoff recording. Extend the e2e tests.

**Slice 3 — Playtomic adapter**
18. Research → `docs/adapters/playtomic.md`. **Stop and report findings to you before coding.**
19. Implement the VenueProvider, Verifier and Handoff that are allowed, or deep-link-only if reading availability isn't. Recorded-fixture contract tests.

**Slice 4 — restaurant adapter**
20. Research the candidate platforms → `docs/adapters/<name>.md`. **Stop and agree the choice with you (Q3).**
21. Implement and run the contract tests.

**Slice 5 — scheduled agent and expiry**
22. Anthropic `CandidateRanker`. Prompt and output schema tests use a stubbed client, plus a guard test that the LLM output can't set availability.
23. `daily_find_plans` cron per group and `expire_plans` cron, plus an "expired" view on the plan page.
24. README: setup, env vars, running the worker, how to add a new adapter (step by step against the contracts), and the audit page.

---

## 10. Open questions — need your call before or while coding

These are decisions that are expensive to reverse, or product rules where my default might not match what you want.

**Q1. Who counts toward "everyone confirmed"?** My default is that each group member name the host entered is one required vote, and a friend opening the link claims one of those names ("Which one are you?"). The alternative is that anyone entering any name counts, with quorum set to "N people said Yes". *Default: claim a named member. It matches "when everyone has confirmed".*

**Q2. What does a single "No" do?** (a) It ends the plan right away → DECLINED, and alternatives are shown. (b) Voting stays open and the plan can't reach quorum until that person changes their vote. *Default: (b) for the MVP, with the host able to swap to an alternative at any time. It's softer for a group chat.*

**Q3. Which restaurant platform?** I won't commit to one before the research is written up, and I won't guess which platform a given restaurant (such as Dishoom) uses. Candidates to research: OpenTable, SevenRooms, Resy, TheFork, DesignMyNight/Collins. Do you have a preference, or existing partner or API access with any of them? If none offers a legitimate read path, the adapter will be **deep-link-only**. In that case restaurants would show as "check & book", never as verified, which conflicts with the core promise. Is that acceptable for the MVP?

**Q4. Host auth.** *Default: a small custom magic-link flow (about 150 lines, fully tested, no extra dependency).* The alternative is Auth.js with its Drizzle adapter, which adds more tables and conventions. Which email provider for production: SMTP of your choice, Resend, or Postmark?

**Q5. Hosting target.** pg-boss and Playwright verifiers need a **long-running worker process**, so pure Vercel serverless won't run the worker. Options: Fly.io, Railway or Render (web + worker + Postgres), or Vercel for web plus a separate worker host. This affects the Dockerfile and how Playwright is installed. *Default: build for "web + worker as two processes from one Docker image" and decide where to deploy later.*

**Q6. Venue discovery.** Verifiers check slots, but something has to list venues first. *Default: a `venues` catalogue fed by each provider's own search where that search is legitimately usable, plus a small curated seed list (London) for providers without search.* Is London-only fine for the MVP?

**Q7. LLM model and spend.** *Default: a small, cheap model for ranking, overridable with `ANTHROPIC_MODEL`, with a hard cap on candidates per run (for example 20) and runs per group per day.* Any budget limit?

Once you approve the plan (with answers or "use your defaults"), I'll start on Slice 0 and commit after each numbered step.
