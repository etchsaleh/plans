# Adapters: status

## Live checks enabled (2026-11-20)

The project owner confirmed on 2026-11-20 that we have permission to read these sources automatically. Keep the written permissions on file. Each source is gated by its own env flag, and all of them are off unless set:

| Source | Verifier | What it reads | Requests per check | Flag |
|---|---|---|---|---|
| Playtomic (Battersea Park Millennium Arena padel, and more clubs to add) | `PlaytomicVerifier` | `GET playtomic.com/api/clubs/availability?tenant_id=…&date=…&sport_id=PADEL`. This is the document the public club page loads (seen in the browser on 2026-11-20): a list of free start times per court | 1 per club, date and sport, cached for 3 min | `PLAYTOMIC_PERMISSION_ON_FILE` |
| Royal Parks (Hyde Park, Regent's Park, Greenwich: tennis and padel) | `RoyalParksVerifier` | the public HTML timetable `sportsandleisure.royalparks.org.uk/availability?location=…&calendar_date=…&page=N`. Only bookable slots are listed, 5 per page, in time order | about 4 to 16 on a cold cache (gallop then binary search, capped at 20), then cached for 3 min | `ROYALPARKS_PERMISSION_ON_FILE` |

Rules every live verifier follows, enforced by `PoliteHttp` and the decorators:
- one request at a time per host, at least 2 seconds apart;
- an honest `PlanAvailabilityBot` User-Agent, with **no spoofed browser or Origin headers**;
- caching for 5 minutes at most, and a cache hit keeps the time the source was actually read;
- every check is written to `availability_snapshots`, with the raw payload in `verification_payloads`.

**Not used:** the Royal Parks booking system's JSON API (`flow.onl`). It only answers requests that carry the booking site's Origin header, and this project doesn't spoof headers. If the Royal Parks or flow.onl give us an API key or allow-list us, it would replace up to 20 timetable pages with a single request per park and date.

**Still link-only:** ClubSpark (Battersea tennis). Cloudflare blocks automated clients, and we don't get around bot protection, so this needs a feed from Enable. Restaurants are also link-only (see below).

**Known gap:** Playtomic slot times match London local time in GMT. Whether they're London local or UTC during BST is unconfirmed, so between late March and October the verifier returns UNKNOWN until `PLAYTOMIC_BST_VERIFIED=true`.

---

# Adapter research: summary (2026-11-20)

The question: can Plan **legitimately read live availability** from each source automatically, with no partner agreement? Each verdict below comes from the source's robots.txt, its terms and how its endpoints behave. All of this was fetched from this sandbox on 2026-11-20. Where I couldn't fetch something, the entry says so.

| Source | What it covers | Automated read allowed? | Verdict for the MVP |
|---|---|---|---|
| Playtomic | Padel/tennis clubs in London | **No.** robots.txt disallows `/api` and `?date=`. The official APIs are for clubs or certified B2B partners only. | Link only to the club page. A club-authorised API is a future option. [details](playtomic.md) |
| ClubSpark / LTA (Battersea Park) | Battersea Park tennis (operated by Enable) | **No.** Cloudflare blocks automated requests with a 403, and we don't get around that. Online booking needs an Enable membership. | Link only. Ask Enable for permission. [details](tennis-london.md) |
| Royal Parks Sport & Leisure (Hyde Park, Regent's Park, Greenwich) | Tennis, padel, pitches | **No.** robots.txt allows the public availability page, but the **terms of use explicitly ban bots and scraping**, and they restrict links to anything except the home page. | Link to the home page only. **Ask the Royal Parks for written permission.** Their public timetable would make an ideal source. [details](tennis-london.md) |
| OpenTable | Restaurants | **No public API.** The Partner API is only available under contract through the Partner Portal. The site refused our connections, which looks like bot protection. Industry reporting says it limits bots. | Link only, using `restref`. **Apply to the Partner/Affiliate programme.** [details](restaurants.md) |
| SevenRooms | Restaurants (many London groups) | **No.** The acceptable-use policy bans automated access and bots. robots.txt disallows `/direct/` and `/embed/`. The API is for partners only. | Link only. [details](restaurants.md) |
| DesignMyNight / Collins | Restaurants and bars | **No.** robots.txt disallows `/api/` and `/book/`. | Link only. |
| TheFork | Restaurants | **No.** robots.txt disallows `/reservation/` and `?date=`. The terms page returned a 403. | Link only. |
| Google Places API | Discovery (venues, area, price, `reservable` flag) | **Yes**, with a paid key under Google's terms. It has **no slot availability**. | A legitimate **VenueProvider** for discovery. It is not a verifier. |

**Bottom line:** today, no real London source gives us a legitimate, automated, no-contract way to read live slots. Apps that "just book it" are either partners under contract or are automating consumer websites in breach of those sites' terms. Industry reporting says diners have been banned from booking platforms for using AI booking agents. As briefed, I am **not** building scrapers. Every real adapter in the MVP is link-only, and its verifier returns `UNKNOWN('deep-link-only')`.

How the app can still keep the "verified" promise is set out in [PLAN.md §2](../PLAN.md): a check-tier ladder of partner API, then human check, then link only.

## On "Instinct"

According to third-party listings and press (Skift, Product Hunt, EveryDev), Instinct is an invite-only personal AI assistant from San Francisco. You reach it over iMessage, SMS, WhatsApp or voice. Reports say it books restaurants and can phone venues that don't take online bookings. It doesn't publish how it gets availability. I found nothing confirming that it has partner agreements, so I can't tell whether it uses them or automates consumer websites. It isn't a model we can copy legitimately without the same contracts.
