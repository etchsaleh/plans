/**
 * Europe/London wall-clock helpers without a date library.
 * Sources (Playtomic, Royal Parks) express slots in London local time.
 */
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

export function londonParts(d: Date): { date: string; time: string } {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** London offset from UTC in minutes at instant `d` (0 in GMT, 60 in BST). */
export function londonOffsetMins(d: Date): number {
  const { date, time } = londonParts(d);
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  const truncated = Math.floor(d.getTime() / 60000) * 60000;
  return Math.round((asUtc - truncated) / 60000);
}

export function isBritishSummerTime(d: Date): boolean {
  return londonOffsetMins(d) !== 0;
}

/** Convert a London wall-clock date ("2026-07-01") + time ("18:00[:00]") to an instant. */
export function fromLondon(date: string, time: string): Date {
  const hhmm = time.slice(0, 5);
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const offset = londonOffsetMins(new Date(guess.getTime() - londonOffsetMins(guess) * 60000));
  return new Date(guess.getTime() - offset * 60000);
}
