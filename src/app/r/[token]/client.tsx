"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, useTransition } from "react";

const noopSubscribe = () => () => {};
import { ThumbsDown, ThumbsUp, Share as ShareIcon } from "lucide-react";
import { Button, Sheet } from "@/ui/ios";
import { cn } from "@/lib/utils";
import { AnimatedCheckbox } from "@/ui/spell/animated-checkbox";
import { CopyButton } from "@/ui/spell/copy-button";
import { QRCode } from "@/ui/spell/qr-code";
import {
  chooseAction,
  organizerActionAction,
  preferenceAction,
  rsvpAction,
  setNameAction,
  type ActionResult,
} from "@/app/actions";

/** Polls the server component while checks are running. */
export function AutoRefresh({ everyMs = 2500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
    });
  return { pending, error, run };
}

export function PreferenceButtons({ token, optionId, up, down, mine }: { token: string; optionId: string; up: number; down: number; mine: "up" | "down" | null }) {
  const { pending, run } = useAction();
  const btn = (kind: "up" | "down", count: number, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      aria-pressed={mine === kind}
      aria-label={kind === "up" ? "Thumbs up" : "Thumbs down"}
      disabled={pending}
      onClick={() => run(() => preferenceAction(token, optionId, mine === kind ? null : kind))}
      className={cn(
        "pressable text-subhead flex h-9 min-w-14 items-center justify-center gap-1.5 rounded-full px-3 font-semibold",
        mine === kind ? (kind === "up" ? "bg-ios-green text-white" : "bg-ios-red text-white") : "bg-fill-3 text-label",
      )}
    >
      <Icon className="size-4" strokeWidth={2.5} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
  return (
    <div className="flex gap-2">
      {btn("up", up, ThumbsUp)}
      {btn("down", down, ThumbsDown)}
    </div>
  );
}

export function ChooseButton({ token, optionId }: { token: string; optionId: string }) {
  const { pending, error, run } = useAction();
  return (
    <div className="mt-3">
      <Button variant="tinted" size="medium" className="w-full" disabled={pending} onClick={() => run(() => chooseAction(token, optionId))}>
        {pending ? "Choosing…" : "Choose this option"}
      </Button>
      {error && <p className="text-footnote text-ios-red mt-1">{error}</p>}
    </div>
  );
}

export function RsvpButtons({ token, mine }: { token: string; mine: "in" | "out" | null }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-2 p-4">
      <div className="flex gap-3">
        <Button variant={mine === "in" ? "success" : "filled"} disabled={pending} onClick={() => run(() => rsvpAction(token, "in"))}>
          {mine === "in" ? "You're in ✓" : "I'm in"}
        </Button>
        <Button variant="gray" disabled={pending} onClick={() => run(() => rsvpAction(token, "out"))} className={cn(mine === "out" && "ring-2 ring-[var(--ios-label-3)]")}>
          Can&apos;t make it
        </Button>
      </div>
      {error && <p className="text-footnote text-ios-red">{error}</p>}
    </div>
  );
}

export function NameSheet({ token, open: initiallyOpen }: { token: string; open: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [state, action, pending] = useActionState(async (prev: unknown, form: FormData) => {
    const r = await setNameAction(token, prev, form);
    if (r.ok) setOpen(false);
    return r;
  }, null);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="What should we call you?">
      <form action={action} className="px-safe space-y-4 pt-2 pb-4">
        <input
          name="name"
          autoFocus
          autoComplete="given-name"
          placeholder="Your name"
          maxLength={40}
          className="bg-grouped-2 text-body w-full rounded-[10px] px-4 py-3 outline-none"
        />
        {state && !state.ok && <p className="text-footnote text-ios-red">{state.error}</p>}
        <Button type="submit" disabled={pending}>
          Continue
        </Button>
        <p className="text-footnote text-label-2 text-center">No account needed. Your name is only shown to this group.</p>
      </form>
    </Sheet>
  );
}

export function ShareRow({ url, title }: { url: string; title: string }) {
  // Server render: false; client: whether the Web Share API exists (no hydration mismatch).
  const canShare = useSyncExternalStore(noopSubscribe, () => !!navigator.share, () => false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-xl bg-white p-1.5">
          <QRCode value={url} size={84} fgColor="#000" bgColor="#fff" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-subhead text-label-2 truncate">{url}</div>
        </div>
        <CopyButton value={url} />
      </div>
      <div className="flex gap-2">
        <a href={wa} className="pressable bg-ios-green text-headline flex h-11 flex-1 items-center justify-center rounded-xl font-semibold text-white">
          WhatsApp
        </a>
        {canShare && (
          <Button size="medium" variant="tinted" className="flex-1" onClick={() => navigator.share({ title, url }).catch(() => {})}>
            <ShareIcon className="size-4" /> Share
          </Button>
        )}
      </div>
    </div>
  );
}

export function OrganizerControls({ token, status }: { token: string; status: string }) {
  const { pending, error, run } = useAction();
  const [ref, setRef] = useState("");
  return (
    <div className="space-y-3 p-4">
      {status === "SELECTED" || status === "NEEDS_RECONCILIATION" ? (
        <>
          <label className="text-footnote text-label-2 block">Booked it? Enter the venue&apos;s booking reference</label>
          <div className="flex gap-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. PT-123456"
              className="bg-fill-3 text-body min-w-0 flex-1 rounded-[10px] px-3 py-2 outline-none"
            />
            <Button size="medium" variant="success" disabled={pending || ref.trim().length < 3} onClick={() => run(() => organizerActionAction(token, { type: "booked", reference: ref }))}>
              We&apos;re booked
            </Button>
          </div>
          <div className="flex gap-2">
            <Button size="small" variant="gray" disabled={pending} onClick={() => run(() => organizerActionAction(token, { type: "unselect" }))}>
              Pick another
            </Button>
            <Button size="small" variant="destructive" disabled={pending} onClick={() => run(() => organizerActionAction(token, { type: "booking_failed" }))}>
              Booking fell through
            </Button>
          </div>
        </>
      ) : (
        <Button size="medium" variant="tinted" className="w-full" disabled={pending} onClick={() => run(() => organizerActionAction(token, { type: "recheck" }))}>
          Check again now
        </Button>
      )}
      {error && <p className="text-footnote text-ios-red">{error}</p>}
    </div>
  );
}

export function InTick({ name }: { name: string }) {
  return <AnimatedCheckbox title={name} defaultChecked className="pointer-events-none" />;
}
