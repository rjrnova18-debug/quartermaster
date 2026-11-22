/**
 * One sync cycle (OFFLINE-SYNC §3): push the outbox, then pull what changed.
 *
 * The decisions are pure functions of the domain (readyOps S4-S5, resolvePull S10); this
 * file only carries them out. It receives the phone database and the server as
 * parameters, so the tests run it against a real SQLite and a fake server.
 */
import { DB_COLUMNS, DirectoryKind, DIRECTORY_KINDS } from '@/directory/rules';
import { AnswerSet, InspectionStatus } from '@/inspection/model';
import { OutboxOp, readyOps, resolvePull } from '@/inspection/sync';

import type { LocalStore } from './local';

// ---------------------------------------------------------------- what the server sends

export interface RemoteAttachment {
  id: string;
  kind: 'photo' | 'signature' | 'report';
  question_code: string | null;
  storage_path: string;
  created_at: string;
}

export interface RemoteInspection {
  id: string;
  status: InspectionStatus;
  current_step: number;
  catalog_version: number;
  created_by: string;
  inspector_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  report_generated_at: string | null;
  deleted_at: string | null;
  answers: AnswerSet;
  attachments: RemoteAttachment[];
}

export type RemoteDirectoryRow = { id: string; updated_at: string; deleted_at: string | null } & Record<string, string | null>;

export interface Changes {
  server_time: string;
  inspections: RemoteInspection[];
  drivers: RemoteDirectoryRow[];
  carriers: RemoteDirectoryRow[];
  vehicles: RemoteDirectoryRow[];
}

/** Every server call answers ok, or why not: `conflict` means retrying cannot help (S8). */
export type Outcome = { ok: true; updatedAt?: string } | { ok: false; conflict: boolean; reason: string };

export interface SenderRemote {
  saveInspection(payload: { id: string; status: InspectionStatus; current_step: number; catalog_version: number; answers: AnswerSet }): Promise<Outcome>;
  deleteInspection(id: string): Promise<Outcome>;
  /** Removes every file stored under the inspection's folder. */
  removeInspectionFiles(inspectionId: string): Promise<Outcome>;
  removeFiles(paths: string[]): Promise<Outcome>;
  uploadFile(path: string, localUri: string, contentType: string): Promise<Outcome>;
  saveAttachment(row: { id: string; inspection_id: string; kind: string; question_code: string | null; storage_path: string }): Promise<Outcome>;
  deleteAttachment(id: string): Promise<Outcome>;
  /** Inserts a new record, or updates a known one (deleted_at included). */
  saveDirectory(kind: DirectoryKind, row: Record<string, string | null>, isNew: boolean): Promise<Outcome>;
  changesSince(since: string | null): Promise<Changes>;
}

export interface SyncReport {
  sent: number;
  failed: number;
  conflicts: number;
  pulled: number;
  /** Inspections whose unsent changes lost to the server's copy (S10); the inspector is told. */
  overwritten: string[];
  /** Phone files no longer needed (deleted elsewhere); the caller deletes them. */
  unusedFiles: string[];
}

// ---------------------------------------------------------------- push

const ext = (uri: string | null) => (uri?.endsWith('.png') ? 'png' : 'jpg');
const contentType = (kind: string, uri: string | null) =>
  kind === 'report' ? 'application/pdf' : ext(uri) === 'png' ? 'image/png' : 'image/jpeg';

/** Sends one note. Returns the outcome and, for "sent", the version that went. */
async function send(local: LocalStore, remote: SenderRemote, op: OutboxOp): Promise<{ outcome: Outcome; version?: string }> {
  if (op.entity === 'inspection') {
    if (op.action === 'delete') {
      // Files first: once the inspection is deleted, nobody may touch its folder any more.
      const files = await remote.removeInspectionFiles(op.entityId);
      if (!files.ok) return { outcome: files };
      const outcome = await remote.deleteInspection(op.entityId);
      if (outcome.ok) await local.forgetInspection(op.entityId);
      return { outcome };
    }
    const row = await local.inspectionForSync(op.entityId);
    if (!row || row.deletedAt) return { outcome: { ok: true } }; // nothing left to send
    const outcome = await remote.saveInspection({
      id: row.id, status: row.status, current_step: row.currentStep, catalog_version: row.catalogVersion, answers: row.answers,
    });
    if (outcome.ok && outcome.updatedAt) await local.markInspectionSynced(row.id, outcome.updatedAt);
    return { outcome, version: row.updatedAt };
  }

  if (op.entity === 'attachment') {
    const inspectionId = op.parentId as string;
    if (op.action === 'delete') {
      const files = await remote.removeFiles([`${inspectionId}/${op.entityId}.jpg`, `${inspectionId}/${op.entityId}.png`]);
      if (!files.ok) return { outcome: files };
      return { outcome: await remote.deleteAttachment(op.entityId) };
    }
    const a = await local.attachmentForSync(op.entityId);
    if (!a || !a.localUri) return { outcome: { ok: true } };
    const path = a.kind === 'report' ? `${inspectionId}/report.pdf` : `${inspectionId}/${a.id}.${ext(a.localUri)}`;
    const upload = await remote.uploadFile(path, a.localUri, contentType(a.kind, a.localUri));
    if (!upload.ok) return { outcome: upload };
    const outcome = await remote.saveAttachment({ id: a.id, inspection_id: inspectionId, kind: a.kind, question_code: a.questionCode, storage_path: path });
    if (outcome.ok) await local.markAttachmentUploaded(a.id, path);
    return { outcome };
  }

  // directory: deletions of known records travel as an update with deleted_at
  const found = await local.directoryForSync(op.entityId);
  if (!found || op.action === 'delete') return { outcome: { ok: true } };
  const { kind, record, deletedAt, updatedAt } = found;
  const row: Record<string, string | null> = { id: record.id, deleted_at: deletedAt };
  for (const [key, column] of Object.entries(DB_COLUMNS[kind])) row[column] = record[key] === '' ? null : record[key];
  const outcome = await remote.saveDirectory(kind, row, op.createsEntity);
  if (outcome.ok && outcome.updatedAt) await local.markDirectorySynced(kind, record.id, outcome.updatedAt);
  return { outcome, version: updatedAt };
}

// ---------------------------------------------------------------- the cycle

/**
 * Push, then pull. `force` (the "Sync now" button, S7) retries failed notes at once.
 * Only one cycle may run at a time: the caller makes sure of that.
 */
export async function syncOnce(local: LocalStore, remote: SenderRemote, now: () => string, force = false): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, failed: 0, conflicts: 0, pulled: 0, overwritten: [], unusedFiles: [] };

  // 1 · push
  let outbox = await local.outbox();
  if (force) outbox = outbox.map((op) => (op.state === 'failed' ? { ...op, retryAt: null } : op));
  const stuck = new Set<string>(); // S5 inside this round: an inspection that failed holds its attachments
  for (const op of readyOps(outbox, now())) {
    if (op.parentId && stuck.has(op.parentId)) continue;
    let result: { outcome: Outcome; version?: string };
    try {
      result = await send(local, remote, op);
    } catch (error) {
      result = { outcome: { ok: false, conflict: false, reason: error instanceof Error ? error.message : String(error) } };
    }
    const { outcome, version } = result;
    if (outcome.ok) {
      report.sent++;
      await local.finishOp(op, 'sent', now(), '', version);
    } else {
      if (op.entity === 'inspection') stuck.add(op.entityId);
      if (outcome.conflict) report.conflicts++;
      else report.failed++;
      await local.finishOp(op, outcome.conflict ? 'conflict' : 'failed', now(), outcome.reason);
    }
  }

  // 2 · pull
  const changes = await remote.changesSince(await local.getMeta('last_pull_at'));
  for (const remoteCopy of changes.inspections) {
    const localCopy = await local.localVersion(remoteCopy.id);
    if (resolvePull(localCopy, { status: remoteCopy.status, updatedAt: remoteCopy.updated_at }) !== 'take_remote') continue;
    if (localCopy?.hasPendingChanges) {
      report.overwritten.push(remoteCopy.id);
      await local.discardChanges(remoteCopy.id);
    }
    report.unusedFiles.push(...(await local.applyRemoteInspection(remoteCopy)));
    report.pulled++;
  }
  const pending = new Set((await local.outbox()).map((op) => op.entityId));
  for (const kind of DIRECTORY_KINDS) {
    for (const row of changes[kind]) {
      if (!pending.has(row.id)) await local.applyRemoteDirectory(kind, row); // a local unsent edit wins until it is sent
    }
  }
  await local.setMeta('last_pull_at', changes.server_time);
  return report;
}
