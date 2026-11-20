import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("env", () => {
  it("has working dev defaults", () => {
    const e = parseEnv({});
    expect(e.VERIFIERS).toBe("mock");
    expect(e.ROYALPARKS_PERMISSION_ON_FILE).toBe(false);
  });

  it("refuses the dev cookie secret in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/COOKIE_SECRET/);
  });

  it("rejects short cookie secrets", () => {
    expect(() => parseEnv({ COOKIE_SECRET: "short" })).toThrow();
  });
});
