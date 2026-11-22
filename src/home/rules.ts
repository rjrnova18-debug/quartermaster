/**
 * Small pure rules the home, history and profile screens share: who may delete an
 * inspection, and the one-line summary of the outbox.
 */
import { InspectionStatus, Role } from '@/inspection/model';
import { needsAttention, OutboxOp } from '@/inspection/sync';

/**
 * ACCESS.md §2: an inspector deletes only their own drafts; a supervisor deletes any
 * inspection. The database checks the same thing when the deletion is sent.
 */
export function canDeleteInspection(
  inspection: { status: InspectionStatus; createdBy: string },
  user: { id: string; role: Role },
): boolean {
  if (user.role === 'supervisor') return true;
  return inspection.createdBy === user.id && inspection.status === 'draft';
}

export type SyncLine = { kind: 'synced' } | { kind: 'waiting'; count: number } | { kind: 'attention'; count: number };

/** UI-BRIEF §4: "All synced", "3 changes waiting" or "1 needs attention" (attention wins). */
export function syncLine(outbox: OutboxOp[]): SyncLine {
  const attention = outbox.filter(needsAttention).length;
  if (attention > 0) return { kind: 'attention', count: attention };
  if (outbox.length > 0) return { kind: 'waiting', count: outbox.length };
  return { kind: 'synced' };
}
