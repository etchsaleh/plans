# Plan

Plan helps friend groups pick activities and restaurants that have **already been checked as available**, then lock them in and book them together. The full design and build order are in [`docs/PLAN.md`](docs/PLAN.md), and adapter research and status are in [`docs/adapters/`](docs/adapters/README.md).

## Quick start

```bash
npm install
npm run db:start            # local Postgres on :5433 (or: docker compose up -d)
cp .env.example .env.local  # live checks are enabled here; set the *_PERMISSION_ON_FILE flags to false to turn them off
npm run db:seed:venues      # migrate + load the London venue catalogue
npm run dev                 # http://localhost:3000  (UI kit: /dev/ui)
```

## Live availability checks

```bash
npm run check -- --list
npm run check -- hyde-tennis 2026-11-21 18:00 --size 4
npm run check -- battersea-padel 2026-11-21 20:00 --size 8 --duration 60
npm run check -- demo-padel-gone 2026-11-21 18:00 --fresh   # mock venue
```

Each run prints the verdict (`bookable` / `stale` / `unavailable` / `unknown`), which courts were matched, the source URL and the time it was read. It also appends the check to `availability_snapshots`, which is append-only and enforced by a DB trigger, and stores the raw payload in `verification_payloads`.

## Tests

```bash
npm test          # unit + adapter contract tests (recorded fixtures; never hits live sites)
npm run test:db   # Postgres integration tests (needs npm run db:start)
npm run e2e       # Playwright on an iPhone 15 viewport (needs npm run build). In a sandbox: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
npm run lint      # includes hexagonal boundary rules
```

## Environment variables

See [`.env.example`](.env.example). Highlights:

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://plan@localhost:5433/plan` | Postgres |
| `COOKIE_SECRET` | dev-only value | HMAC for participant cookies. **Required in production** |
| `VERIFIERS` | `mock,playtomic,royalparks` | which verifiers to build |
| `PLAYTOMIC_PERMISSION_ON_FILE` / `ROYALPARKS_PERMISSION_ON_FILE` | `false` | gates for live third-party reads |
| `PLAYTOMIC_BST_VERIFIED` | `false` | allow Playtomic checks during British Summer Time |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | – | optional LLM ranker (it never decides availability) |

## Adding a verifier adapter

1. Research the source first and write `docs/adapters/<name>.md`: robots.txt, terms, the permission you hold, and the exact endpoint you'll read and how you found it.
2. Implement `AvailabilityVerifier` (`src/ports/availability.ts`) in `src/adapters/<name>/`. Do all I/O through `PoliteHttp`. Return `UNKNOWN` with a reason rather than throwing, and set `evidence.checkedAt` from the document's `fetchedAt`.
3. Record fixtures in `src/adapters/<name>/__fixtures__/` and call `runAvailabilityVerifierContract(...)` from your test, alongside adapter-specific tests.
4. Wire it in `src/composition/verification.ts` behind a `<NAME>_PERMISSION_ON_FILE` flag, and add venues to `src/adapters/catalogue/london-venues.ts`.

## Architecture

The code follows a hexagonal layout: `domain` (pure) → `ports` → `application` → `adapters`, wired only in `composition`. ESLint enforces the dependency rules. The UI uses iOS-style primitives (`src/ui/ios`) plus vendored [Spell UI](https://github.com/xxtomm/spell-ui) components (`src/ui/spell`, MIT).
