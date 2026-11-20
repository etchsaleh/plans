import { createHash } from "node:crypto";
import { v7 as uuid } from "uuid";
import type { AvailabilitySnapshot } from "@/domain/availability";
import type { SnapshotStore } from "@/ports";
import type { Db } from "./db";
import { availabilitySnapshots, verificationPayloads } from "./schema";

/** Append-only audit log of availability checks (DB trigger forbids UPDATE/DELETE). */
export class PgSnapshotStore implements SnapshotStore {
  constructor(private readonly db: Db, private readonly maxPayloadBytes = 512 * 1024) {}

  async append(s: AvailabilitySnapshot): Promise<void> {
    await this.db.transaction(async (tx) => {
      let rawPayloadId: string | null = null;
      const raw = s.evidence.rawPayload;
      if (raw) {
        rawPayloadId = uuid();
        const body = raw.body.length > this.maxPayloadBytes ? raw.body.slice(0, this.maxPayloadBytes) + "…[truncated]" : raw.body;
        await tx.insert(verificationPayloads).values({
          id: rawPayloadId,
          sha256: createHash("sha256").update(raw.body).digest("hex"),
          contentType: raw.contentType,
          body,
        });
      }
      await tx.insert(availabilitySnapshots).values({
        id: s.id,
        venueId: s.query.venueId,
        candidateId: s.candidateId ?? null,
        planId: s.planId ?? null,
        requestId: s.requestId ?? null,
        verifier: s.verifier,
        tier: s.tier,
        source: s.evidence.source,
        slotStart: s.query.start,
        durationMins: s.query.durationMins,
        partySize: s.query.partySize,
        status: s.status,
        reason: s.reason ?? null,
        matchedSlot: s.matched ? { ...s.matched, start: s.matched.start.toISOString() } : null,
        checkedAt: s.evidence.checkedAt,
        checkedByParticipantId: s.evidence.checkedByParticipantId ?? null,
        fromCache: s.evidence.fromCache,
        rawPayloadId,
        latencyMs: s.latencyMs ?? null,
        purpose: s.purpose,
      });
    });
  }
}
