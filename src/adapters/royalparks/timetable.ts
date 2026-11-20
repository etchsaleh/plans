/** Parser for the public Royal Parks "Availability timetable" (sportsandleisure.royalparks.org.uk/availability). */
export type TimetableRow = {
  time: string; // "HH:MM" London
  date: string; // "YYYY-MM-DD"
  title: string; // e.g. "Tennis-60min"
  durationMins: number;
  location: string; // "Court 2, Courts - Tennis, Hyde Park Courts"
  spotsFree: number;
  spotsTotal: number;
  bookUrl: string | null;
};

export type TimetablePage = { rows: TimetableRow[]; hasMore: boolean };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|#039|quot|lt|gt|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();

export class TimetableFormatError extends Error {}

export function parseTimetablePage(html: string): TimetablePage {
  const start = html.indexOf("<tbody");
  const end = html.indexOf("</tbody>", start);
  const hasMore = /rel="next"/.test(html.slice(end > 0 ? end : 0));
  if (start < 0 || end < 0) {
    // An empty result page has no table; anything else is a format change.
    if (/<table/i.test(html)) throw new TimetableFormatError("timetable table without tbody");
    return { rows: [], hasMore: false };
  }
  const rows: TimetableRow[] = [];
  for (const tr of html.slice(start, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 7) continue;
    const [time, date, title, duration, location, , availability] = cells.map(text);
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    const spots = /^(\d+)\s*\/\s*(\d+)\s*spots?$/.exec(availability);
    const mins = /^(\d+)\s*min/.exec(duration);
    if (!/^\d{2}:\d{2}$/.test(time) || !d || !spots || !mins) {
      throw new TimetableFormatError(`unrecognised row: ${[time, date, duration, availability].join(" | ")}`);
    }
    rows.push({
      time,
      date: `${d[3]}-${d[2]}-${d[1]}`,
      title,
      durationMins: Number(mins[1]),
      location,
      spotsFree: Number(spots[1]),
      spotsTotal: Number(spots[2]),
      bookUrl: /href="([^"]+)"/.exec(cells[7] ?? "")?.[1] ?? null,
    });
  }
  return { rows, hasMore };
}
