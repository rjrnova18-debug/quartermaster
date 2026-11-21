/**
 * Working without a connection: the outbox and the conflict rule.
 *
 * The app always writes to the phone first. Each write leaves a note in the
 * outbox ("this record changed"); a sender delivers the notes when there is
 * signal. An outbox note carries no data: the sender reads the latest local
 * state at the moment it sends.
 *
 * Pure functions: they take an outbox and return a new one.
 * Rule numbers (S1, S2...) refer to docs/OFFLINE-SYNC.md.
 */
import { InspectionStatus } from './model';

export type EntityKind = 'directory' | 'inspection' | 'attachment';
export type OpAction = 'upsert' | 'delete';
export type OpState =
  | 'pending' // waiting for its turn
  | 'failed' // the last attempt failed; it will be retried at retryAt
  | 'conflict'; // the server refused it; a person has to fix something

export interface OutboxOp {
  entity: EntityKind;
  entityId: string;
  /** For an attachment: the inspection it belongs to. Otherwise null. */
  parentId: string | null;
  action: OpAction;
  /** True while the server has never seen this record. */
  createsEntity: boolean;
  queuedAt: string;
  state: OpState;
  attempts: number;
  retryAt: string | null;
  error: string | null;
}

/** A local write that has to reach the server. */
export interface Change {
  entity: EntityKind;
  entityId: string;
  parentId?: string | null;
  action: OpAction;
  /** False for a record created on this phone and never sent. */
  existsOnServer: boolean;
}

function sameEntity(op: OutboxOp, change: { entity: EntityKind; entityId: string }): boolean {
  return op.entity === change.entity && op.entityId === change.entityId;
}

// ---------------------------------------------------------------- S1-S3 queueing

/**
 * S1-S3. Adds a change to the outbox, keeping at most one note per record.
 * - S1: saving a record that already has a note does not add another; it only
 *   clears a previous failure so the record is sent again.
 * - S2: deleting a record removes its notes and the notes of its attachments.
 * - S3: deleting a record the server never saw leaves nothing to send.
 */
export function enqueue(outbox: OutboxOp[], change: Change, now: string): OutboxOp[] {
  const existing = outbox.find((op) => sameEntity(op, change));

  if (change.action === 'upsert') {
    if (existing) {
      if (existing.action === 'delete') {
        return outbox;
      }
      return outbox.map((op) =>
        op === existing ? { ...op, state: 'pending', attempts: 0, retryAt: null, error: null } : op,
      );
    }
    return [...outbox, newOp(change, now)];
  }

  const remaining = outbox.filter((op) => !sameEntity(op, change) && op.parentId !== change.entityId);
  const neverSent = existing ? existing.createsEntity : !change.existsOnServer;
  return neverSent ? remaining : [...remaining, newOp(change, now)];
}

function newOp(change: Change, now: string): OutboxOp {
  return {
    entity: change.entity,
    entityId: change.entityId,
    parentId: change.parentId ?? null,
    action: change.action,
    createsEntity: change.action === 'upsert' && !change.existsOnServer,
    queuedAt: now,
    state: 'pending',
    attempts: 0,
    retryAt: null,
    error: null,
  };
}

// ---------------------------------------------------------------- S4-S5 sending

const SEND_ORDER: Record<EntityKind, number> = { directory: 0, inspection: 1, attachment: 2 };

function canSendNow(op: OutboxOp, now: string): boolean {
  if (op.state === 'pending') return true;
  if (op.state === 'failed') return op.retryAt === null || Date.parse(op.retryAt) <= Date.parse(now);
  return false;
}

/**
 * S4-S5. The notes to send now, in sending order.
 * - S4: directory records first, then inspections, then attachments; inside
 *   each kind, oldest first.
 * - S5: an attachment waits while its inspection cannot be sent.
 */
export function readyOps(outbox: OutboxOp[], now: string): OutboxOp[] {
  const stuckInspections = outbox
    .filter((op) => op.entity === 'inspection' && !canSendNow(op, now))
    .map((op) => op.entityId);

  return outbox
    .filter((op) => canSendNow(op, now))
    .filter((op) => op.parentId === null || !stuckInspections.includes(op.parentId))
    .sort(
      (a, b) =>
        SEND_ORDER[a.entity] - SEND_ORDER[b.entity] || Date.parse(a.queuedAt) - Date.parse(b.queuedAt),
    );
}

// ---------------------------------------------------------------- S6-S8 results

export const FIRST_RETRY_SECONDS = 30;
export const LONGEST_RETRY_SECONDS = 3600;
export const ATTEMPTS_BEFORE_ATTENTION = 6;

/** S7. Waiting time before retry number `attempts`: 30 s, 60 s, 120 s... up to one hour. */
export function backoffSeconds(attempts: number): number {
  return Math.min(FIRST_RETRY_SECONDS * 2 ** (attempts - 1), LONGEST_RETRY_SECONDS);
}

/** S6. The server accepted the note: it leaves the outbox. */
export function markSent(outbox: OutboxOp[], sent: OutboxOp): OutboxOp[] {
  return outbox.filter((op) => !sameEntity(op, sent));
}

/** S7. The attempt failed (no signal, server error): retry later, waiting longer each time. */
export function markFailed(outbox: OutboxOp[], failed: OutboxOp, now: string, error: string): OutboxOp[] {
  return outbox.map((op) => {
    if (!sameEntity(op, failed)) {
      return op;
    }
    const attempts = op.attempts + 1;
    const retryAt = new Date(Date.parse(now) + backoffSeconds(attempts) * 1000).toISOString();
    return { ...op, state: 'failed', attempts, retryAt, error };
  });
}

/** S8. The server refused the record itself: stop retrying until a person edits it. */
export function markConflict(outbox: OutboxOp[], refused: OutboxOp, reason: string): OutboxOp[] {
  return outbox.map((op) =>
    sameEntity(op, refused) ? { ...op, state: 'conflict', retryAt: null, error: reason } : op,
  );
}

/** S8. True when a note will not solve itself and the inspector should be told. */
export function needsAttention(op: OutboxOp): boolean {
  return op.state === 'conflict' || op.attempts >= ATTEMPTS_BEFORE_ATTENTION;
}

// ---------------------------------------------------------------- S9 badge

export type SyncBadge = 'synced' | 'pending' | 'failed' | 'conflict';

/** S9. The sync state shown on an inspection: the worst state among its notes. */
export function syncBadge(outbox: OutboxOp[], inspectionId: string): SyncBadge {
  const ops = outbox.filter(
    (op) => (op.entity === 'inspection' && op.entityId === inspectionId) || op.parentId === inspectionId,
  );
  if (ops.some((op) => op.state === 'conflict')) return 'conflict';
  if (ops.some((op) => op.state === 'failed')) return 'failed';
  return ops.length > 0 ? 'pending' : 'synced';
}

// ---------------------------------------------------------------- S10 conflicts

export interface RemoteVersion {
  status: InspectionStatus;
  updatedAt: string;
}

export interface LocalVersion {
  status: InspectionStatus;
  updatedAt: string;
  /** The server's updatedAt when this copy last matched it. null: never synced. */
  syncedUpdatedAt: string | null;
  /** True when the outbox holds an unsent note for this inspection. */
  hasPendingChanges: boolean;
}

export type PullDecision = 'take_remote' | 'keep_local';

function isLater(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/**
 * S10. Decides which copy of an inspection survives when the server sends one.
 * 1. No local copy: take the server's.
 * 2. No unsent local changes: take the server's if it is newer.
 * 3. Unsent local changes, server unchanged since the last sync: keep the local copy.
 * 4. Both changed: a completed inspection beats a draft; with the same status
 *    the later change wins, and a tie goes to the server.
 */
export function resolvePull(local: LocalVersion | null, remote: RemoteVersion): PullDecision {
  if (local === null) {
    return 'take_remote';
  }
  const lastKnown = local.syncedUpdatedAt ?? local.updatedAt;

  if (!local.hasPendingChanges) {
    return isLater(remote.updatedAt, lastKnown) ? 'take_remote' : 'keep_local';
  }

  const serverChanged = local.syncedUpdatedAt === null || isLater(remote.updatedAt, local.syncedUpdatedAt);
  if (!serverChanged) {
    return 'keep_local';
  }
  if (local.status !== remote.status) {
    return remote.status === 'completed' ? 'take_remote' : 'keep_local';
  }
  return isLater(local.updatedAt, remote.updatedAt) ? 'keep_local' : 'take_remote';
}

/** S10. When the server's copy wins, the losing local notes of that inspection are dropped. */
export function discardLocalChanges(outbox: OutboxOp[], inspectionId: string): OutboxOp[] {
  return outbox.filter(
    (op) => !(op.entity === 'inspection' && op.entityId === inspectionId) && op.parentId !== inspectionId,
  );
}
