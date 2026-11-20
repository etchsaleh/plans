import { createHmac, timingSafeEqual } from "node:crypto";

/** `value.signature` with HMAC-SHA256 — for the anonymous participant cookie. */
export function sign(value: string, secret: string): string {
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
}

export function unsign(signed: string | undefined | null, secret: string): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signed);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}
