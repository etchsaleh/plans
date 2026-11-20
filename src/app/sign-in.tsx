"use client";

import { useActionState } from "react";
import { ListSection, Button } from "@/ui/ios";
import { requestLinkAction } from "./actions";

export function SignInCard({ next }: { next: string }) {
  const [state, action, pending] = useActionState(requestLinkAction, null);
  return (
    <ListSection header="Organiser sign-in" footer="We'll email you a one-time link. Friends don't need an account — they join from the link you share.">
      {state?.sent ? (
        <div className="p-4" data-testid="link-sent">
          <div className="text-headline">Check your email</div>
          <p className="text-subhead text-label-2">If that address can organise plans, a sign-in link is on its way. It expires in 15 minutes.</p>
        </div>
      ) : (
        <form action={action} className="space-y-3 p-4">
          <input type="hidden" name="next" value={next} />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="bg-fill-3 text-body w-full rounded-[10px] px-4 py-3 outline-none"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
      )}
    </ListSection>
  );
}
