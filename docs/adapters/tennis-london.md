# London park tennis: adapter research (Battersea Park, Hyde Park, Regent's Park)

Researched 2026-11-20.

## Battersea Park: ClubSpark (LTA), operated by Enable
- Booking page: `https://clubspark.lta.org.uk/BatterseaParkTennisCourts/Booking`. Found via search; **our fetch got a Cloudflare 403 "Attention Required"**, so ClubSpark actively blocks automated clients. We do **not** try to get around that.
- Search results quoting Enable (not fetched by me): online booking needs a valid Enable tennis or gym membership, you pay when you book, and cancellations need 2 hours' notice and must be made by phone.
- **Decision:** link only to the ClubSpark booking page, and the verifier returns `UNKNOWN`. **Next step:** email Enable (BPST@enablelc.org, per search results) and ask for permission or a feed.

## Hyde Park, Regent's Park, Greenwich: Royal Parks Sport & Leisure
- `https://sportsandleisure.royalparks.org.uk/availability` (fetched) is a **public, server-rendered availability timetable**. Each row has time, activity, duration, court, park and "1 / 1 spots". You can filter by location (radio `location` = 102/104/105) and by date (quick dates for the next 7 days). Every row links into the booking system at `sportsandleisureroyalparks.bookings.flow.onl/location/<park>/<activity>/<YYYY-MM-DD>/by-time/slot/<HH:MM-HH:MM>`.
- robots.txt (fetched) does **not** disallow `/availability`.
- **However, the Terms of Use (`/terms-use`, fetched) say:** "You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our site … Any 'robot', 'bot', 'spider', 'scraper' or other automated device … to access, obtain, copy, monitor or republish any portion of the site". They also say: "You may not link to our home page … nor may you create a link to any part of our site other than the home page." The wording is garbled; the intent is that you may link only to the home page.
- **Decision:** no automated reads. The handoff links to the Royal Parks Sport & Leisure **home page** and tells the user "Hyde Park Courts · Fri 18:00", in line with the linking clause. The verifier returns `UNKNOWN`.
- **Strong recommendation:** ask the Royal Parks (a charity) for **written permission** to read the public timetable at a low rate, and to deep-link to slots. Their data is already public and well structured, so with a "yes" this becomes the easiest real verifier to build, and it would be fully legitimate. I'd build it as a `RoyalParksVerifier` behind a feature flag that stays off until permission is on file.
