import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgAuthRepository } from "@/adapters/postgres/auth-repo";
import { createTestDb, type TestDb } from "@/adapters/postgres/test-db";
import { consumeMagicLink, requestMagicLink, signOut, userForSession, type AuthDeps } from "@/application/auth";

describe.skipIf(!process.env.TEST_DATABASE_URL)("magic-link auth (Postgres)", () => {
  let t: TestDb;
  let now = new Date("2026-11-21T10:00:00Z");
  const sent: { to: string; text: string }[] = [];
  let deps: AuthDeps;
  beforeAll(async () => {
    t = await createTestDb();
    deps = {
      auth: new PgAuthRepository(t.db),
      mailer: { send: async (m) => void sent.push(m) },
      clock: { now: () => now },
      appUrl: "https://plan.test",
      organizerEmails: ["owner@example.test"],
    };
  });
  afterAll(async () => t?.close());
  const tokenFrom = (text: string) => new URL(/https:\/\/\S+/.exec(text)![0]).searchParams.get("token")!;

  it("only allow-listed organisers get a link, without revealing who is allowed", async () => {
    await expect(requestMagicLink(deps, "stranger@example.test")).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    await requestMagicLink(deps, " Owner@Example.test ", "/r/abc");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("next=%2Fr%2Fabc");
  });

  it("a link works once, creates a session and links a participant", async () => {
    const token = tokenFrom(sent[0].text);
    const ok = await consumeMagicLink(deps, token, null);
    expect(ok?.participantId).toBeTruthy();
    expect(await consumeMagicLink(deps, token, null)).toBeNull();
    expect((await userForSession(deps, ok!.sessionToken))?.email).toBe("owner@example.test");
    await signOut(deps, ok!.sessionToken);
    expect(await userForSession(deps, ok!.sessionToken)).toBeNull();
  });

  it("expired links don't work", async () => {
    await requestMagicLink(deps, "owner@example.test");
    const token = tokenFrom(sent.at(-1)!.text);
    now = new Date(now.getTime() + 16 * 60 * 1000);
    expect(await consumeMagicLink(deps, token, null)).toBeNull();
  });

  it("ignores open-redirect next params", async () => {
    await requestMagicLink(deps, "owner@example.test", "//evil.example");
    expect(sent.at(-1)!.text).not.toContain("next=");
  });
});
