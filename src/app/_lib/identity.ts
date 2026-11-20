import "server-only";
import { cookies } from "next/headers";
import { getContainer } from "@/composition/container";
import { userForSession } from "@/application/auth";
import { unsign } from "@/lib/signing";

export const PARTICIPANT_COOKIE = "plan_pid";
export const SESSION_COOKIE = "plan_session";

/** The visitor's anonymous participant id (set by src/proxy.ts); creates the DB row on first use. */
export async function currentParticipant(): Promise<{ id: string; displayName: string | null }> {
  const jar = await cookies(); // runtime data first: never touch config during prerender
  const c = getContainer();
  const id = unsign(jar.get(PARTICIPANT_COOKIE)?.value, c.env.COOKIE_SECRET);
  if (!id) throw new Error("participant cookie missing — is src/proxy.ts running?");
  const existing = await c.auth.auth.participantExists(id);
  if (existing) return { id, displayName: existing.displayName };
  await c.auth.auth.createParticipant(id, null);
  return { id, displayName: null };
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForSession(getContainer().auth, token);
}

/** Organiser acting through the app: their linked participant id (falls back to the cookie). */
export async function actingParticipantId(): Promise<string> {
  const user = await currentUser();
  return user?.participantId ?? (await currentParticipant()).id;
}
