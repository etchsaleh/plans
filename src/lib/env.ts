import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((v) => v === "true" || v === "1");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://plan@localhost:5433/plan"),
  /** HMAC key for participant cookies. ≥32 chars; required in production. */
  COOKIE_SECRET: z.string().min(32).default("dev-only-insecure-cookie-secret-change-me!!"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  /** Optional: without it the heuristic ranker is used. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  /** Comma list of emails allowed to sign in as organisers. Required in production. */
  ORGANIZER_EMAILS: z.string().default(""),
  /** Optional: without it magic links are printed to the log and /dev/mailbox. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Plan <plans@localhost>"),

  /** "pgboss" (default; needs `npm run worker`) or "inline" (dev/e2e: run searches in the web process). */
  JOBS_MODE: z.enum(["pgboss", "inline"]).default("pgboss"),
  /** Comma list of verifier ids to enable. */
  VERIFIERS: z.string().default("mock,playtomic,royalparks"),
  /**
   * Gates for real sources: set true only when permission to read the source automatically is on file
   * (see docs/adapters/*.md). Off by default so a fresh checkout never hits third-party sites.
   */
  ROYALPARKS_PERMISSION_ON_FILE: bool,
  PLAYTOMIC_PERMISSION_ON_FILE: bool,
  /** Set once Playtomic slot times have been confirmed as London-local during BST. */
  PLAYTOMIC_BST_VERIFIED: bool,
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const env = envSchema.parse(source);
  if (env.NODE_ENV === "production" && env.COOKIE_SECRET.startsWith("dev-only")) {
    throw new Error("COOKIE_SECRET must be set in production");
  }
  if (env.NODE_ENV === "production" && !env.ORGANIZER_EMAILS.trim()) {
    throw new Error("ORGANIZER_EMAILS must be set in production");
  }
  if (env.NODE_ENV === "production" && !env.SMTP_URL) {
    throw new Error("SMTP_URL must be set in production (magic links)");
  }
  return env;
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}

export function organizerEmails(e: Env): string[] {
  return e.ORGANIZER_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
