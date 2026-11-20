import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getContainer } from "@/composition/container";
import { devMailboxRows } from "@/composition/dev";
import { ListSection, NavBar } from "@/ui/ios";

/** Dev-only: mail the DevMailer "sent" (magic links). 404 when SMTP is configured or in production. */
export default function DevMailboxPage() {
  return (
    <Suspense fallback={null}>
      <Mailbox />
    </Suspense>
  );
}

async function Mailbox() {
  await connection();
  const c = getContainer();
  if (c.env.SMTP_URL || (c.env.NODE_ENV === "production" && !c.env.DEV_MAILBOX)) notFound();
  const rows = await devMailboxRows(c, 20);
  return (
    <main className="pb-safe">
      <NavBar title="Dev mailbox" />
      {rows.map((m) => (
        <ListSection key={m.id} header={`${m.to} · ${m.createdAt.toISOString()}`}>
          <div className="p-4">
            <div className="text-headline">{m.subject}</div>
            <pre className="text-footnote mt-2 break-all whitespace-pre-wrap" data-testid="mail-body">{linkify(m.body)}</pre>
          </div>
        </ListSection>
      ))}
    </main>
  );
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} className="text-ios-blue underline">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
