import { desc } from "drizzle-orm";
import { devMailbox } from "@/adapters/postgres/schema";
import type { Container } from "./container";

export function devMailboxRows(c: Container, limit: number) {
  return c.db.select().from(devMailbox).orderBy(desc(devMailbox.createdAt)).limit(limit);
}
