import { describe, expect, it } from "vitest";
import { fromLondon, isBritishSummerTime, londonParts } from "./london-time";

describe("London time", () => {
  it("is UTC in winter", () => {
    expect(fromLondon("2026-11-21", "18:00").toISOString()).toBe("2026-11-21T18:00:00.000Z");
    expect(isBritishSummerTime(new Date("2026-11-21T18:00:00Z"))).toBe(false);
  });
  it("is UTC+1 in summer", () => {
    expect(fromLondon("2026-07-01", "18:00:00").toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(isBritishSummerTime(new Date("2026-07-01T17:00:00Z"))).toBe(true);
  });
  it("round-trips", () => {
    const d = fromLondon("2026-07-01", "09:30");
    expect(londonParts(d)).toEqual({ date: "2026-07-01", time: "09:30" });
  });
});
