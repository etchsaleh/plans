const TZ = "Europe/London";

export function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
}
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hourCycle: "h23" });
}
export function fmtDateStr(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
export const CATEGORY_LABEL = { restaurant: "Dinner", padel: "Padel", tennis: "Tennis" } as const;
export const CATEGORY_EMOJI = { restaurant: "🍽️", padel: "🎾", tennis: "🎾" } as const;
