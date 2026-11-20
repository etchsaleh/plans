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

  /** Optional: without it magic links are printed to the log and /dev/mailbox. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Plan <plans@localhost>"),

  /** Comma list of verifier ids to enable, e.g. "mock" or "mock,royalparks". */
  VERIFIERS: z.string().default("mock"),
  /** Must be true (written permission on file) before the Royal Parks verifier may run. */
  ROYALPARKS_PERMISSION_ON_FILE: bool,
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const env = envSchema.parse(source);
  if (env.NODE_ENV === "production" && env.COOKIE_SECRET.startsWith("dev-only")) {
    throw new Error("COOKIE_SECRET must be set in production");
  }
  return env;
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}
