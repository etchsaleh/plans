import { and, eq, gt, isNull } from "drizzle-orm";
import { v7 as uuid } from "uuid";
import type { AuthRepository, User } from "@/ports";
import type { Db } from "./db";
import { authTokens, participants, sessions, users } from "./schema";

const toUser = (r: typeof users.$inferSelect): User => ({ id: r.id, email: r.email, participantId: r.participantId });

export class PgAuthRepository implements AuthRepository {
  constructor(private readonly db: Db) {}

  async findOrCreateUser(email: string) {
    await this.db.insert(users).values({ id: uuid(), email }).onConflictDoNothing();
    const [u] = await this.db.select().from(users).where(eq(users.email, email));
    return toUser(u);
  }

  async saveLoginToken(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.insert(authTokens).values({ id: uuid(), userId, tokenHash, expiresAt });
  }

  async consumeLoginToken(tokenHash: string, now: Date) {
    const [t] = await this.db
      .update(authTokens)
      .set({ consumedAt: now })
      .where(and(eq(authTokens.tokenHash, tokenHash), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, now)))
      .returning({ userId: authTokens.userId });
    if (!t) return null;
    const [u] = await this.db.select().from(users).where(eq(users.id, t.userId));
    return u ? toUser(u) : null;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.insert(sessions).values({ id: uuid(), userId, tokenHash, expiresAt });
  }

  async userForSession(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({ u: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
    return row ? toUser(row.u) : null;
  }

  async deleteSession(tokenHash: string) {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async linkParticipant(userId: string, participantId: string) {
    await this.db.update(users).set({ participantId }).where(eq(users.id, userId));
  }

  async createParticipant(id: string, displayName: string | null = null) {
    await this.db.insert(participants).values({ id, displayName }).onConflictDoNothing();
  }

  async participantExists(id: string) {
    const [p] = await this.db.select({ displayName: participants.displayName }).from(participants).where(eq(participants.id, id));
    return p ?? null;
  }
}
