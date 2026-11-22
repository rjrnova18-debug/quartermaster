/**
 * The sync cycle (OFFLINE-SYNC §3) against the real phone database (Node's SQLite) and
 * a fake server kept in memory.
 */
import { LocalStore } from '../src/data/local';
import { Changes, Outcome, RemoteDirectoryRow, RemoteInspection, SenderRemote, syncOnce } from '../src/data/sender';
import { needsAttention } from '../src/inspection/sync';

import { freshStore } from './node-sqlite';

const TODAY = '2026-03-10';
let clock = 0;
const now = () => new Date(Date.parse('2026-03-10T15:00:00Z') + ++clock * 1000).toISOString();

function fakeServer() {
  const inspections = new Map<string, RemoteInspection>();
  const drivers = new Map<string, RemoteDirectoryRow>();
  const files = new Set<string>();
  const calls: string[] = [];
  const failures: Record<string, Outcome> = {};
  let during: (() => Promise<void>) | null = null;

  const fail = (call: string): Outcome | null => {
    const outcome = failures[call];
    if (outcome) delete failures[call];
    return outcome ?? null;
  };

  const remote: SenderRemote = {
    async saveInspection(p) {
      calls.push(`save ${p.id}`);
      if (during) await during(); // the inspector keeps typing while it is being sent
      const failed = fail('save');
      if (failed) return failed;
      const updated_at = now();
      const before = inspections.get(p.id);
      inspections.set(p.id, {
        id: p.id, status: p.status, current_step: p.current_step, catalog_version: p.catalog_version, created_by: 'u1',
        inspector_name: 'Sam Field', created_at: before?.created_at ?? updated_at, updated_at, deleted_at: null,
        completed_at: p.status === 'completed' ? (before?.completed_at ?? updated_at) : null, report_generated_at: null,
        answers: p.answers, attachments: before?.attachments ?? [],
      });
      return { ok: true, updatedAt: updated_at };
    },
    async deleteInspection(id) {
      calls.push(`delete ${id}`);
      const row = inspections.get(id);
      if (row) inspections.set(id, { ...row, deleted_at: now(), updated_at: now() });
      return { ok: true };
    },
    async removeInspectionFiles(id) {
      calls.push(`remove files of ${id}`);
      [...files].filter((f) => f.startsWith(`${id}/`)).forEach((f) => files.delete(f));
      return { ok: true };
    },
    async removeFiles(paths) {
      paths.forEach((p) => files.delete(p));
      return { ok: true };
    },
    async uploadFile(path) {
      calls.push(`upload ${path}`);
      files.add(path);
      return { ok: true };
    },
    async saveAttachment(row) {
      calls.push(`register ${row.id}`);
      const inspection = inspections.get(row.inspection_id);
      if (!inspection) return { ok: false, conflict: true, reason: 'not_allowed' };
      inspection.attachments = [...inspection.attachments.filter((a) => a.id !== row.id), {
        id: row.id, kind: row.kind as 'photo', question_code: row.question_code, storage_path: row.storage_path, created_at: now(),
      }];
      return { ok: true };
    },
    async deleteAttachment() {
      return { ok: true };
    },
    async saveDirectory(kind, row) {
      calls.push(`directory ${row.id}`);
      const updated_at = now();
      drivers.set(row.id as string, { ...row, id: row.id as string, updated_at, deleted_at: row.deleted_at ?? null });
      return { ok: true, updatedAt: updated_at };
    },
    async changesSince(since): Promise<Changes> {
      const newer = <T extends { updated_at: string }>(rows: T[]) => rows.filter((r) => since === null || r.updated_at > since);
      return { server_time: now(), inspections: newer([...inspections.values()]), drivers: newer([...drivers.values()]), carriers: [], vehicles: [] };
    },
  };
  return {
    remote, inspections, drivers, files, calls,
    failNext: (call: string, outcome: Outcome) => (failures[call] = outcome),
    whileSaving: (task: (() => Promise<void>) | null) => (during = task),
  };
}

async function liveStore() {
  const { db, store } = await freshStore();
  await store.startLive();
  return { db, store };
}

async function draft(store: LocalStore, id = 'insp-1') {
  return store.createInspection({ id, createdBy: 'u1', inspectorName: 'Sam Field', today: TODAY, now: now() });
}

describe('push', () => {
  test('a new draft is sent, marked as synced, and not sent again', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    const report = await syncOnce(store, server.remote, now);
    expect(report).toMatchObject({ sent: 1, failed: 0, conflicts: 0 });
    expect(await store.outbox()).toEqual([]);
    expect((await store.localVersion('insp-1'))?.syncedUpdatedAt).toBe(server.inspections.get('insp-1')?.updated_at);

    server.calls.length = 0;
    await syncOnce(store, server.remote, now);
    expect(server.calls).toEqual([]);
    expect((await store.getInspection('insp-1'))?.answers).toEqual({ TRIP_DATE: { value: TODAY } }); // its own copy came back untouched
  });

  test('a photo goes after its inspection: upload, then register', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    await store.addAttachment({ id: 'p1', inspectionId: 'insp-1', kind: 'photo', questionCode: 'PHOTO_ARRIVAL', localUri: 'file:///p1.jpg' }, now());
    await syncOnce(store, server.remote, now);
    expect(server.calls).toEqual(['save insp-1', 'upload insp-1/p1.jpg', 'register p1']);
    expect(server.files.has('insp-1/p1.jpg')).toBe(true);
    expect(await store.outbox()).toEqual([]);
  });

  test('when the inspection fails, its photo waits (S5) and the inspection retries later (S7)', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    await store.addAttachment({ id: 'p1', inspectionId: 'insp-1', kind: 'photo', questionCode: 'PHOTO_ARRIVAL', localUri: 'file:///p1.jpg' }, now());
    server.failNext('save', { ok: false, conflict: false, reason: 'timeout' });
    const report = await syncOnce(store, server.remote, now);
    expect(report).toMatchObject({ sent: 0, failed: 1 });
    expect(server.calls).toEqual(['save insp-1']);
    const [inspectionNote, photoNote] = await store.outbox();
    expect(inspectionNote).toMatchObject({ state: 'failed', attempts: 1, error: 'timeout' });
    expect(photoNote).toMatchObject({ entityId: 'p1', state: 'pending' });

    await syncOnce(store, server.remote, now); // too early: waits for retryAt
    expect(server.calls).toEqual(['save insp-1']);
    await syncOnce(store, server.remote, now, true); // "Sync now" retries at once
    expect(await store.outbox()).toEqual([]);
  });

  test('a refused trip reference becomes a conflict that needs attention (S8)', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    server.failNext('save', { ok: false, conflict: true, reason: 'duplicate_trip_ref' });
    await syncOnce(store, server.remote, now);
    const [note] = await store.outbox();
    expect(note).toMatchObject({ state: 'conflict', error: 'duplicate_trip_ref' });
    expect(needsAttention(note)).toBe(true);
  });

  test('a change saved while the inspection was being sent is not lost', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    server.whileSaving(async () => {
      server.whileSaving(null);
      await store.saveInspection('insp-1', { answers: { TRIP_DATE: { value: TODAY }, TRIP_REF: { value: 'T-40001' } }, currentStep: 1, status: 'draft' }, now());
    });
    await syncOnce(store, server.remote, now);
    expect(await store.outbox()).toMatchObject([{ entityId: 'insp-1', state: 'pending', createsEntity: false }]);
    await syncOnce(store, server.remote, now);
    expect(server.inspections.get('insp-1')?.answers.TRIP_REF).toEqual({ value: 'T-40001' });
  });

  test('deleting a synced inspection removes its files first, then the inspection', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    await store.addAttachment({ id: 'p1', inspectionId: 'insp-1', kind: 'photo', questionCode: 'PHOTO_ARRIVAL', localUri: 'file:///p1.jpg' }, now());
    await syncOnce(store, server.remote, now);
    await store.deleteInspection('insp-1', now());
    server.calls.length = 0;
    await syncOnce(store, server.remote, now);
    expect(server.calls).toEqual(['remove files of insp-1', 'delete insp-1']);
    expect(server.files.size).toBe(0);
    expect(await store.inspectionForSync('insp-1')).toBeNull();
  });

  test('a new driver goes to the server and is marked as known', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await store.saveDirectoryRecord('drivers', { id: 'd1', name: 'Ana Diaz', idNumber: '90314159', phone: '' }, now());
    await syncOnce(store, server.remote, now);
    expect(server.drivers.get('d1')).toMatchObject({ name: 'Ana Diaz', id_number: '90314159', phone: null });
    expect((await store.directoryForSync('d1'))?.syncedUpdatedAt).toBe(server.drivers.get('d1')?.updated_at);
  });
});

describe('pull', () => {
  test("another person's inspection and a new directory record arrive", async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await server.remote.saveInspection({ id: 'other', status: 'completed', current_step: 7, catalog_version: 1, answers: { TRIP_REF: { value: 'T-77777' } } });
    await server.remote.saveDirectory('drivers', { id: 'd9', name: 'Tom Becker', id_number: '90322078', phone: null, deleted_at: null }, true);
    const report = await syncOnce(store, server.remote, now);
    expect(report.pulled).toBe(1);
    expect((await store.listInspections()).map((r) => [r.id, r.summary.tripRef])).toEqual([['other', 'T-77777']]);
    expect(await store.listDirectory('drivers')).toEqual([{ id: 'd9', name: 'Tom Becker', idNumber: '90322078', phone: '' }]);
  });

  test('when both copies changed, a completed one on the server beats a local draft (S10)', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    await syncOnce(store, server.remote, now);
    // offline here; the supervisor completes it on another phone
    await store.saveInspection('insp-1', { answers: { TRIP_DATE: { value: TODAY }, ORIGIN: { value: 'Gate 2' } }, currentStep: 2, status: 'draft' }, now());
    await server.remote.saveInspection({ id: 'insp-1', status: 'completed', current_step: 7, catalog_version: 1, answers: { TRIP_REF: { value: 'T-1' } } });
    server.failNext('save', { ok: false, conflict: false, reason: 'no signal' });
    const report = await syncOnce(store, server.remote, now);
    expect(report.overwritten).toEqual(['insp-1']);
    expect((await store.getInspection('insp-1'))?.status).toBe('completed');
    expect(await store.outbox()).toEqual([]);
  });

  test('an inspection deleted on the server leaves the phone, with its files', async () => {
    const { store } = await liveStore();
    const server = fakeServer();
    await draft(store);
    await store.addAttachment({ id: 'p1', inspectionId: 'insp-1', kind: 'photo', questionCode: 'PHOTO_ARRIVAL', localUri: 'file:///p1.jpg' }, now());
    await syncOnce(store, server.remote, now);
    await server.remote.deleteInspection('insp-1');
    const report = await syncOnce(store, server.remote, now);
    expect(await store.listInspections()).toEqual([]);
    expect(report.unusedFiles).toEqual(['file:///p1.jpg']);
  });
});
