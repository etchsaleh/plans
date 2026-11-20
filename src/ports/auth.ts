export type User = { id: string; email: string; participantId: string | null };

export interface AuthRepository {
  findOrCreateUser(email: string): Promise<User>;
  saveLoginToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** Atomically marks an unexpired, unused token consumed; returns its user or null. */
  consumeLoginToken(tokenHash: string, now: Date): Promise<User | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  userForSession(tokenHash: string, now: Date): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
  linkParticipant(userId: string, participantId: string): Promise<void>;
  createParticipant(id: string, displayName?: string | null): Promise<void>;
  participantExists(id: string): Promise<{ displayName: string | null } | null>;
}

export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}
