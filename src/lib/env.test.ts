import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("env", () => {
  it("has working dev defaults", () => {
    const e = parseEnv({});
    expect(e.VERIFIERS).toBe("mock,playtomic,royalparks");
    expect(e.PLAYTOMIC_PERMISSION_ON_FILE).toBe(false);
    expect(e.ROYALPARKS_PERMISSION_ON_FILE).toBe(false);
  });

  it("refuses the dev cookie secret in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/COOKIE_SECRET/);
    expect(() => parseEnv({ NODE_ENV: "production", COOKIE_SECRET: "z".repeat(40) })).toThrow(/ORGANIZER_EMAILS/);
  });

  it("rejects short cookie secrets", () => {
    expect(() => parseEnv({ COOKIE_SECRET: "short" })).toThrow();
  });
});
