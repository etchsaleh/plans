# Playtomic: adapter research

Researched 2026-11-20. Everything below was fetched directly unless marked otherwise.

## Findings
- **robots.txt** (`https://playtomic.com/robots.txt`, fetched):
  `Disallow: /api`, `Disallow: /search`, `Disallow: /*?*date=`, `Disallow: /*?*sport=`. Club pages under `/clubs/` are *not* disallowed, and a sitemap of clubs is published.
- **Legal conditions** (`/legal-conditions`, fetched): users may not "republish, download, store, or transmit any of the material on the Website or App", apart from browser caching and personal, non-commercial copies.
- **Third Party API** (`https://third-party.playtomic.io/`, fetched): this is the *club's* API. "You can generate your credentials in Playtomic Manager, in Settings → Developer tools." It covers Bookings, Players and Payments for that club's own venues. A consumer app cannot get credentials for clubs it doesn't work with.
- **Playtomic Connect** (`/connect`, fetched): a certified-partner programme for "companies that want to build services for our clubs". It involves an application, a technical assessment, a legal agreement and onboarding, and clubs then opt in. It targets B2B tools for clubs, not consumer aggregators.
- **Help-centre API guide**: the page returned a 403 to our fetch. Search snippets (not verified) say access is limited to clubs on certain plans and is read-only.

## Decision
- **MVP: link only.** The `PlaytomicHandoff` builds `https://playtomic.com/clubs/<slug>` for a curated list of London clubs entered by hand. We don't crawl the sitemap, because the terms restrict storing material. We don't add a `date` parameter, because robots.txt disallows those URLs for bots, and to a person the plain club page is just as useful.
- The `PlaytomicVerifier` always returns `UNKNOWN('deep-link-only: no licensed availability source')`.
- **Later, legitimately:** (a) a club gives us read-only Third Party API credentials (club-authorised), or (b) a Connect partnership. The adapter interface already supports both, so it would just be a new verifier implementation.
- Endpoints for a live verifier are **not** documented here on purpose, because I won't guess or reverse-engineer them.
