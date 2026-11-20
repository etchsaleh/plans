# Restaurants: adapter research

Researched 2026-11-20. Direct fetches of OpenTable were refused (the HTTP/2 stream was reset). SevenRooms' terms pages also refused our connections. Points marked (search) come from search results, not direct reads.

| Platform | Availability read | Deep link | Notes |
|---|---|---|---|
| OpenTable | Partner API, **under contract only**, via the Partner Portal at dev.opentable.com (search, plus the partner FAQ snippet) | Restaurant reservation links use `restref=<id>`, which is official per the partner FAQ. The `datetime` and `covers` params appear only in community examples, so they're **unconfirmed** | Affiliate links need "Powered by OpenTable". Contact: partnersupport@opentable.com (search) |
| SevenRooms | Partner-only API with gated docs (search). The **acceptable-use policy bars automated access and bots** (search) | Venue widget URLs exist. Whether prefill params are supported is **not confirmed** | robots.txt (fetched): `Disallow: /direct/`, `/embed/`, `/x` |
| DesignMyNight / Collins | No public API found | Venue pages | robots.txt (fetched): `Disallow: /api/`, `/book/` |
| TheFork | No public API found | Restaurant pages | robots.txt (fetched): `Disallow: /reservation/`, `/*?date=*`. The terms page returned a 403 |
| Google Places | `reservable` boolean only, **no slots** (official docs, search) | `googleMapsUri` / website | A legitimate **discovery** source with a paid key. Mind Google's caching terms |

## Decision for the MVP
- The restaurant "adapter" is **`OpenTableHandoff` plus a generic `WebsiteHandoff`**, both link-only. The verifier returns `UNKNOWN('deep-link-only')`.
- Venue discovery uses a curated London catalogue first. Google Places can be added once you give me a key.
- **Action for you:** apply to the OpenTable Partner/Affiliate programme. It's the most realistic route to *automatically* verified restaurant tables in London. SevenRooms is the second choice.
