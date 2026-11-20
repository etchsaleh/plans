import { describe, expect, it } from "vitest";
import { sign, unsign } from "./signing";

const secret = "x".repeat(40);
describe("cookie signing", () => {
  it("round-trips", () => expect(unsign(sign("abc-123", secret), secret)).toBe("abc-123"));
  it("rejects tampering and other secrets", () => {
    const s = sign("abc-123", secret);
    expect(unsign(s.replace("abc", "abd"), secret)).toBeNull();
    expect(unsign(s, "y".repeat(40))).toBeNull();
    expect(unsign("garbage", secret)).toBeNull();
    expect(unsign(undefined, secret)).toBeNull();
  });
});
