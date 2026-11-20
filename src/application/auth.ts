import { createHash, randomBytes } from "node:crypto";
import { v7 as uuid } from "uuid";
import type { AuthRepository, Clock, Mailer, User } from "@/ports";

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthDeps = {
  auth: AuthRepository;
  mailer: Mailer;
  clock: Clock;
  appUrl: string;
  /** Lower-cased organiser allow-list. Empty = anyone (dev only; enforced by env validation in prod). */
  organizerEmails: string[];
};

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a sign-in link if the email is an allowed organiser. Always resolves the same way
 * so the response doesn't reveal who is allowed.
 */
export async function requestMagicLink(deps: AuthDeps, rawEmail: string, next = "/"): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) return;
  if (deps.organizerEmails.length && !deps.organizerEmails.includes(email)) return;
  const user = await deps.auth.findOrCreateUser(email);
  const token = randomToken();
  await deps.auth.saveLoginToken(user.id, sha256(token), new Date(deps.clock.now().getTime() + LOGIN_TOKEN_TTL_MS));
  const url = new URL("/auth/verify", deps.appUrl);
  url.searchParams.set("token", token);
  if (next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  await deps.mailer.send({
    to: email,
    subject: "Your Plan sign-in link",
    text: `Tap to sign in to Plan:\n\n${url.toString()}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  });
}

/** Exchanges a one-time token for a session. Returns the raw session token for the cookie. */
export async function consumeMagicLink(
  deps: AuthDeps,
  token: string,
  currentParticipantId: string | null,
): Promise<{ sessionToken: string; user: User; participantId: string } | null> {
  const now = deps.clock.now();
  const user = await deps.auth.consumeLoginToken(sha256(token), now);
  if (!user) return null;
  let participantId = user.participantId;
  if (!participantId) {
    participantId = currentParticipantId ?? uuid();
    if (!currentParticipantId) await deps.auth.createParticipant(participantId, user.email.split("@")[0]);
    await deps.auth.linkParticipant(user.id, participantId);
  }
  const sessionToken = randomToken();
  await deps.auth.createSession(user.id, sha256(sessionToken), new Date(now.getTime() + SESSION_TTL_MS));
  return { sessionToken, user: { ...user, participantId }, participantId };
}

export async function userForSession(deps: Pick<AuthDeps, "auth" | "clock">, sessionToken: string | undefined | null) {
  if (!sessionToken) return null;
  return deps.auth.userForSession(sha256(sessionToken), deps.clock.now());
}

export async function signOut(deps: Pick<AuthDeps, "auth">, sessionToken: string | undefined | null) {
  if (sessionToken) await deps.auth.deleteSession(sha256(sessionToken));
}
