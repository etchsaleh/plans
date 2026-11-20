import { connection, NextResponse, type NextRequest } from "next/server";
import { getContainer } from "@/composition/container";
import { consumeMagicLink } from "@/application/auth";
import { sign, unsign } from "@/lib/signing";
import { PARTICIPANT_COOKIE, SESSION_COOKIE } from "@/app/_lib/identity";

export async function GET(req: NextRequest) {
  await connection(); // per-request; never prerendered
  const c = getContainer();
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const nextParam = req.nextUrl.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const current = unsign(req.cookies.get(PARTICIPANT_COOKIE)?.value, c.env.COOKIE_SECRET);
  if (current) await c.auth.auth.createParticipant(current, null);
  const result = await consumeMagicLink(c.auth, token, current);
  if (!result) return NextResponse.redirect(new URL("/?link=expired", req.url));

  const res = NextResponse.redirect(new URL(next, req.url));
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set(SESSION_COOKIE, result.sessionToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  // Keep this device's participant identity consistent with the organiser account.
  res.cookies.set(PARTICIPANT_COOKIE, sign(result.participantId, c.env.COOKIE_SECRET), {
    httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
