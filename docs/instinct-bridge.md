# Instinct email bridge: design (app side)

Status: **deferred (owner, 2026-11-20). Designed, not built, live mode off.** This is our proposed app-side implementation and email contract. It is
**not** a documented Instinct API or an active integration. Before any real request is sent, the mailbox, the permitted
actions, the response and disclosure contract, and one non-booking round trip must be agreed with Instinct over WhatsApp
(see §8). The destination `6i7ppo@mail.instinct.com` was supplied by the owner. It still needs confirming during setup.

## 1. Where it fits

Plan now has **two ways to get availability**, both behind ports and both written to the same audit trail:

| Path | Port | Timing | Sources | Tier shown |
|---|---|---|---|---|
| Direct verifiers (built) | `AvailabilityVerifier.check()` | synchronous, seconds | Playtomic, Royal Parks, mock | "Verified 3 min ago" |
| **Instinct over email** (this doc) | `AssistantSearchGateway.submit()` → inbound reply → `AssistantResultIngestor` | **asynchronous**, minutes to hours, no promised reply | anything Instinct is registered to check: Rocket Padel, restaurants, cinema… | "Checked by Instinct 12 min ago · source ↗" |

The domain doesn't care which path an option came from. Both produce **`Option`s** on a **`SearchRequest`**, with
`checked_at` and the source URL as evidence.

**Booking always goes through you, in WhatsApp.** The app never books, charges or holds anything. Its last step
is "Choose this option". The next screen says: *"Selected. Approve the final booking and terms with Instinct on
WhatsApp. Nothing is booked yet."* It shows the request ID and option ID, plus a copy button and a `wa.me` link
with the text prefilled, so you only have to press send. Only a `booking_result: confirmed` carrying provider
evidence, or an organiser entering it by hand, makes something "Booked".

## 2. Flow

```
Organiser (signed in)          App backend                     App mailbox              Instinct (agreed scope)
  │ search form ─────────────▶ validate vs registered action
  │                            save SearchRequest (QUEUED)
  │                            outbox row ─▶ send_assistant_request job ─▶ SMTP/Gmail ─▶ email
  │ ◀── "Waiting for Instinct" (no countdown)                                            checks sources
  │                                                            ◀── threaded reply ◀───── availability_result
  │                            poll_mailbox job: fetch new msgs (no venue traffic)
  │                            classify → correlate → authenticate → parse → validate → dedupe
  │                            ├─ ok      → Options + status history (AVAILABLE / NO_AVAILABILITY / …)
  │                            └─ anything else → ReviewQueue (never executes, never auto-replies)
  │ ◀── options with checked time, local time, party size, price/terms (or "unknown")
  │ share invite link ─▶ friends mark preferences (👍/👎, I'm in)
  │ "Choose this option" ─▶ Selection (preference only) ─▶ "Approve in WhatsApp" screen
  │                                                      (you approve with Instinct in WhatsApp; Instinct re-checks)
  │                            optional: booking_result reply ─▶ BOOKED / FAILED / UNKNOWN (needs reconciling)
```

## 3. Ports and adapters

```ts
// ports
interface AssistantMailTransport {          // the only thing that touches a mailbox
  send(msg: OutboundEmail): Promise<{ messageId: string; threadId?: string }>;
  fetchSince(cursor: string | null): Promise<{ messages: RawInboundEmail[]; cursor: string }>;
  findSent(requestId: string): Promise<{ messageId: string } | null>;  // reconcile uncertain sends
}
interface AssistantSearchGateway { submit(req: SearchRequest, action: RegisteredAction): Promise<OutboundRecord> }
interface AssistantResultIngestor { ingest(msg: RawInboundEmail): Promise<IngestOutcome> }  // pure-ish pipeline
```

Adapters:
- `mail/mock`: an in-memory mailbox plus scripted Instinct fixtures (available, empty, clarification, unverified, error, malformed, spoofed, duplicate, late). This is the default. It never sends real mail.
- `mail/gmail`: the Gmail API (users.messages.send / list / get, threadId) via a service account or OAuth refresh token **held in the deployment secret manager**.
- `mail/imap-smtp`: nodemailer and imapflow, for any other provider.

## 4. Email contract v1 (proposed; JSON fixtures, not real availability)

**Request**
- Subject: `ACTIVITY-V1 <ACTION_KEY> <REQUEST_ID>`.
- `REQUEST_ID` is generated once on the server, for example `REQ-20261120-7Q4M9KX2TA` (date plus 10 random Crockford base32 characters).
- The subject is a routing label only. It never authenticates anything.
- The body is UTF-8 plain-text JSON exactly as in the brief (`protocol: "activity-email/1"`, `message_type: "availability_request"`, explicit date, `timezone`, `earliest_start`/`latest_start`, `duration_minutes`, `party_size`, optional `budget_total` in minor units).
- No relative dates, no friends' details and no credentials.

**Response** (`availability_result`): `request_id`, `response_id`, `status ∈ {available, no_availability, needs_clarification, unverified, error}`, `checked_at`, `options[]`, `error`.

Each option carries:
- `option_id`, `category`, `venue.name` and `venue.location`;
- `starts_at` and `ends_at` (RFC 3339 with offset), `timezone`, `party_size` and `description`;
- `checked_at` and `source_url`;
- `price: { amount_minor, currency, kind: "total" | "quote" } | null`;
- `terms: { deposit, cancellation, no_show }`, each value a string or `null`;
- `needs_confirmation: boolean`.

**Booking result** (only if agreed): `message_type: "booking_result"`, `request_id`, `option_id`, `status ∈ {confirmed, failed, unknown}`, `provider_reference | null`, `reported_at`.

Validation rules (zod, `strict` on known shapes; unknown fields are dropped and logged, never interpreted):
- `available` with no options, or any option missing `checked_at`/`source_url` → **reject → review**.
- `party_size` ≠ requested, a date outside the request, a `starts_at` outside the time window, or a `currency` other than GBP → that option is **dropped** and noted. If none remain → review.
- `price: null` → shown as "Price unknown". Missing terms → "Cancellation terms unknown". We never default to free.
- No validity period is inferred. The UI shows "checked X min ago", and after 15 min "older check". A check is never shown as a hold.

**Parsing a reply:** use only the new part of the text/plain body. Cut at the first quoted-history marker (`On … wrote:`, `>`-prefixed block, `-----Original Message-----`, or Gmail's quote div), and at a signature (`-- `). It must contain **exactly one** top-level JSON object (balanced-brace scan, then `JSON.parse`), otherwise → review. Links, attachments and HTML are never fetched or executed.

## 5. Correlation, authentication, dedup

An inbound message only takes the automatic path if **all** of these hold:
1. It's **from the configured assistant address**, compared exactly against the envelope and header From.
2. **Authentication passes:** `Authentication-Results` shows DKIM=pass for the assistant's domain and DMARC=pass. Gmail also exposes these, and we check its spam/phishing labels.
3. **Its thread is ours:** `In-Reply-To`/`References` contain our outbound `Message-ID`, or the provider's thread ID matches.
4. **The body's `request_id`** equals that thread's request, and the subject's action key matches the request's action.
5. **The action is still `active`** (not paused or revoked) and the request is still open.
6. **The return address is unchanged:** `Reply-To`/recipient is our configured mailbox.

If any check fails, the message goes to `review_queue` with the reason. Nothing executes and **no automatic reply is ever sent**.

Dedup works on three keys. `inbound_messages.provider_message_id` is unique, so a mailbox re-read is a no-op. `assistant_responses.response_id` is unique, so a repeated reply creates no new options or notifications. Status changes are append-only in `request_status_history`.

Late replies don't overwrite newer state: a result is applied only if the request is still `WAITING` or `NEEDS_CLARIFICATION`. Otherwise it's stored as `superseded` and shown in history. A booking result never downgrades `BOOKED`.

## 6. Requests, retries and timeouts

- **One open request per action and organiser.** A second submit returns the open one.
- **No automatic resend.** If a send outcome is uncertain (timeout or 5xx after the DATA step), the job calls `findSent(requestId)` in the Sent folder before retrying with the **same** request ID and Message-ID.
- **No reply after `ASSISTANT_REPLY_TIMEOUT` (default 2 h):** the request shows "No reply yet" with a *manual* "Send follow-up" button, which is rate-limited. A timeout is never treated as no availability or as a failure.
- **Mailbox reading** uses the Gmail push feed if it's configured, otherwise `MAILBOX_POLL_INTERVAL` (default 2 min). Reading our own inbox never triggers any venue checks.

## 7. Data model (additions)

```
organizers               id, user_id, role ('owner'|'organizer'), created_at
groups / group_members   invitation-based access (signed invite token → participant joins group)
assistant_actions        key PK, label, category, venues text[] | area, weekdays int[], earliest/latest_start,
                         date_horizon_days, party_min/max, max_requests_per_day, response_fields text[],
                         group_visible_fields text[], booking_results_enabled bool,
                         status ('draft'|'active'|'paused'|'revoked'), agreed_at, agreed_note, updated_by, updated_at
assistant_setup          singleton: sending_mailbox, return_mailbox, assistant_address, *_confirmed_at,
                         schema_version_agreed, round_trip_verified_at, live_enabled bool
search_requests          id (REQ-…), organizer_id, group_id, action_key NULL, path ('direct'|'assistant'),
                         search jsonb, status, created_at, updated_at, version
outbound_messages        id, request_id, message_id UNIQUE, thread_id, subject, body, send_state
                         ('pending'|'sent'|'uncertain'|'failed'), attempts, sent_at
inbound_messages         id, provider_message_id UNIQUE, thread_id, from_addr, auth_results jsonb, headers jsonb,
                         raw_ref (restricted), received_at, classification ('matched'|'review'|'ignored'), reason
assistant_responses      response_id UNIQUE, request_id, inbound_id, message_type, status, checked_at, applied bool
options                  id, request_id, option_id, source ('assistant'|verifier id), venue jsonb, starts_at, ends_at,
                         timezone, party_size, description, checked_at, source_url, price jsonb, terms jsonb,
                         needs_confirmation, snapshot_id NULL   UNIQUE(request_id, option_id)
preferences              option_id, participant_id, value ('up'|'down')    UNIQUE(option_id, participant_id)
selections               request_id, option_id, organizer_id, selected_at   (one active per request)
booking_results          request_id, option_id, status, provider_reference (organiser-only), reported_at, inbound_id
request_status_history   append-only: request_id, from, to, cause, at
review_queue             id, inbound_id | request_id, reason, state ('open'|'dismissed'|'resolved'), resolved_by
retention_settings       raw_mail_days (default 30), payload_days, history_days
```

Organiser-only fields (`provider_reference`, raw mail, booking terms detail if not approved for the group) are filtered in the **application** layer by role, not just hidden in the UI.

## 8. Live-mode gate: admin checklist

`/admin/assistant` lists each item, with who marked it and when. **`live_enabled` can only be switched on when every item is ticked**, and each tick is recorded with a note such as "agreed in WhatsApp 21 Nov":

1. Sending mailbox confirmed as app-controlled.
2. Return mailbox fixed and confirmed.
3. Assistant destination `6i7ppo@mail.instinct.com` confirmed by Instinct.
4. At least one action key registered and agreed (category, venue/area, weekdays, time window, horizon, party limits, frequency).
5. Response schema and disclosure agreed: which fields come back, and which the group may see.
6. Whether follow-up and booking-status reports are in scope.
7. Pause, revoke and change procedure agreed.
8. One **non-booking** round trip completed and inspected.

Until then the transport is the mock. Even in live mode, only `active` actions can send, under per-action rate limits. Nothing received by email can change actions, addresses or any setting. Those change only through the admin UI, by the owner.

## 9. Secrets and privacy

- Mailbox credentials live only in the deployment secret manager and are read by the worker. They never reach the browser bundle, logs, source control or LLM prompts.
- The browser **cannot choose recipients or action keys freely**. It submits a search, and the server maps it to a registered action or rejects it.
- Logs redact email addresses, subjects (they contain routing keys), provider references and bodies. A `mailId` is logged instead.
- Retention jobs prune raw mail and payloads on schedule, and status history is kept.

## 10. Acceptance tests → where they live

| # | Brief requirement | Test |
|---|---|---|
| 1 | one outbound email, right subject, valid JSON | `application/assistant/submit.test.ts` with the mock transport |
| 2 | threaded reply updates only its request, shows checked time and source | ingest test + Playwright options screen |
| 3 | duplicate reply → no duplicate options or notifications | ingest idempotency test |
| 4 | spoofed sender, wrong thread, unknown or paused action, changed return address, out-of-scope → review, nothing runs | table-driven ingest tests |
| 5 | invalid JSON, wrong version, late reply, unknown price, `unverified` → distinct states | parser and state tests + UI states in `/dev/ui` |
| 6 | stale option shown as a past check; selecting ≠ hold | domain test + e2e copy assertions |
| 7 | votes, clicks or "approved" email text never book or charge | there's no booking code path; a test asserts no `BOOKED` without `booking_result`/manual entry |
| 8 | confirmed needs provider evidence; unknown never retries | domain test |
| 9 | secrets server-side; organiser-only fields hidden | bundle scan for env names + role-filter tests |
| 10 | live mode blocked until the checklist is done | admin gate test |
