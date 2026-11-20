import pino from "pino";

/** Structured JSON logs. Every verification is logged with source + checkedAt (see Audited verifier). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "plan" },
  redact: ["*.email", "*.token", "*.secret", "*.cookie"],
  timestamp: pino.stdTimeFunctions.isoTime,
});
export type Logger = typeof logger;
