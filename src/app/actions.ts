"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContainer } from "@/composition/container";
import { requestMagicLink, signOut } from "@/application/auth";
import {
  chooseOption,
  createRequest,
  organizerAction,
  setPreference,
  setRsvp,
  ValidationError,
} from "@/application/requests";
import { DomainError, type Search } from "@/domain/request";
import { ACTIVITIES } from "@/domain/vocabulary";
import { actingParticipantId, currentParticipant, currentUser, SESSION_COOKIE } from "./_lib/identity";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => {
  if (e instanceof ValidationError) return { ok: false, error: e.problems.join(" · ") };
  if (e instanceof DomainError) return { ok: false, error: e.message };
  if (e instanceof Error && /Forbidden|NotFound/.test(e.constructor.name)) return { ok: false, error: e.message };
  throw e;
};

export async function requestLinkAction(_prev: unknown, form: FormData): Promise<{ sent: boolean }> {
  await requestMagicLink(getContainer().auth, String(form.get("email") ?? ""), String(form.get("next") ?? "/"));
  return { sent: true };
}

export async function signOutAction() {
  await signOut(getContainer().auth, (await cookies()).get(SESSION_COOKIE)?.value);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function createRequestAction(_prev: unknown, form: FormData): Promise<ActionResult> {
  const user = await currentUser();
  if (!user?.participantId) return { ok: false, error: "Sign in first" };
  const category = String(form.get("category"));
  if (!(ACTIVITIES as readonly string[]).includes(category)) return { ok: false, error: "Pick an activity" };
  const search: Search = {
    category: category as Search["category"],
    date: String(form.get("date") ?? ""),
    earliestStart: String(form.get("earliestStart") ?? ""),
    latestStart: String(form.get("latestStart") ?? ""),
    durationMins: Number(form.get("durationMins") ?? 60),
    partySize: Number(form.get("partySize") ?? 4),
    areas: form.getAll("areas").map(String).filter(Boolean),
    notes: String(form.get("notes") ?? "").slice(0, 280) || null,
  };
  let token: string;
  try {
    const r = await createRequest(getContainer().requests, {
      organizerUserId: user.id,
      organizerParticipantId: user.participantId,
      search,
    });
    token = r.shareToken;
  } catch (e) {
    return fail(e);
  }
  redirect(`/r/${token}`);
}

export async function setNameAction(token: string, _prev: unknown, form: FormData): Promise<ActionResult> {
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  if (name.length < 1) return { ok: false, error: "Tell us your name" };
  const p = await currentParticipant();
  await getContainer().requests.participation.setDisplayName(p.id, name);
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

export async function rsvpAction(token: string, value: "in" | "out"): Promise<ActionResult> {
  try {
    await setRsvp(getContainer().requests, token, await actingParticipantId(), value);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

export async function preferenceAction(token: string, optionId: string, value: "up" | "down" | null): Promise<ActionResult> {
  try {
    await setPreference(getContainer().requests, token, await actingParticipantId(), optionId, value);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

export async function chooseAction(token: string, optionId: string): Promise<ActionResult> {
  try {
    await chooseOption(getContainer().requests, token, await actingParticipantId(), optionId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

export async function organizerActionAction(
  token: string,
  action: Parameters<typeof organizerAction>[3],
): Promise<ActionResult> {
  try {
    await organizerAction(getContainer().requests, token, await actingParticipantId(), action);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/r/${token}`);
  return { ok: true };
}
