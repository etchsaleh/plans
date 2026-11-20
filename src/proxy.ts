import { NextResponse, type NextRequest } from "next/server";
import { sign, unsign } from "@/lib/signing";
import { env } from "@/lib/env";

export const PARTICIPANT_COOKIE = "plan_pid";

/**
 * Gives every visitor an anonymous, signed participant id (no signup) before the page renders.
 * The participant row itself is created lazily on first use.
 */
export function proxy(request: NextRequest) {
  const secret = env().COOKIE_SECRET;
  if (unsign(request.cookies.get(PARTICIPANT_COOKIE)?.value, secret)) return NextResponse.next();
  const value = sign(crypto.randomUUID(), secret);
  request.cookies.set(PARTICIPANT_COOKIE, value);
  const res = NextResponse.next({ request: { headers: request.headers } });
  res.cookies.set(PARTICIPANT_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
