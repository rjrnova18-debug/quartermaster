/**
 * The phone database, run against a real SQLite: Node's own, in memory. The SQL is the
 * same one expo-sqlite runs on the phone.
 */
import { DatabaseSync } from 'node:sqlite';

import { Db, localStore, SCHEMA_VERSION } from '../src/data/local';
import { buildDemoData } from '../src/demo/demo-data';
import { AnswerSet } from '../src/inspection/model';

type Params = (string | number | null)[];

/** Node's SQLite behind the same async interface expo-sqlite offers. */
function nodeDb(): Db {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params: Params) {
      return db.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: Params) {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: Params) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const TODAY = '2026-03-10';
const NOW = '2026-03-10T15:00:00.000Z';
const LATER = '2026-03-10T15:05:00.000Z';

async function freshStore() {
  const db = nodeDb();
  const store = localStore(db);
  await store.migrate();
  return { db, store };
}

async function newDraft(store: Awaited<ReturnType<typeof freshStore>>['store'], id = 'insp-1') {
  return store.createInspection({ id, createdBy: 'user-1', inspectorName: 'Sam Field', today: TODAY, now: NOW });
}

describe('schema', () => {
  test('migrating twice changes nothing and records the version', async () => {
    const { db, store } = await freshStore();
    await store.migrate();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });
});

describe('live mode', () => {
  test('a new draft starts with the defaults and leaves one note in the outbox', async () => {
    const { store } = await freshStore();
    await store.startLive();
    const draft = await newDraft(store);
    expect(draft.answers).toEqual({ TRIP_DATE: { value: TODAY } });
    expect((await store.listInspections()).map((r) => [r.id, r.status, r.summary.inspectionDate])).toEqual([
      ['insp-1', 'draft', TODAY],
    ]);
    expect(await store.outbox()).toMatchObject([{ entityId: 'insp-1', action: 'upsert', createsEntity: true }]);
  });

  test('saving updates the summary and the time, and still keeps one note (S1)', async () => {
    const { store } = await freshStore();
    await store.startLive();
    const draft = await newDraft(store);
    const answers: AnswerSet = { ...draft.answers, TRIP_REF: { value: 'T-40001' } };
    expect(await store.saveInspection('insp-1', { answers, currentStep: 2, status: 'draft' }, LATER)).toBe(true);

    const [row] = await store.listInspections();
    expect([row.summary.tripRef, row.updatedAt]).toEqual(['T-40001', LATER]);
    expect((await store.getInspection('insp-1'))?.currentStep).toBe(2);
    expect(await store.outbox()).toHaveLength(1);
  });

  test('nothing is saved when nothing changed (F13)', async () => {
    const { store } = await freshStore();
    await store.startLive();
    const draft = await newDraft(store);
    const same: AnswerSet = { TRIP_DATE: { value: ` ${TODAY} ` }, TRIP_REF: { value: '  ' } };
    expect(await store.saveInspection('insp-1', { answers: same, currentStep: 1, status: 'draft' }, LATER)).toBe(false);
    expect((await store.getInspection('insp-1'))?.updatedAt).toBe(draft.createdAt);
  });

  test('completing stores the final answers (F12) and keeps the first completion time', async () => {
    const { store } = await freshStore();
    await store.startLive();
    await newDraft(store);
    const answers: AnswerSet = { TRIP_DATE: { value: TODAY }, UNIT_TYPE: { value: 'UT01' }, ORIGIN: { value: '  Gate 2 ' } };
    await store.saveInspection('insp-1', { answers, currentStep: 7, status: 'completed' }, LATER);
    const completed = await store.getInspection('insp-1');
    expect(completed?.completedAt).toBe(LATER);
    expect(completed?.answers.RFR_RUNS).toEqual({ value: 'NA' }); // hidden reefer check
    expect(completed?.answers.ORIGIN).toEqual({ value: 'Gate 2' });

    const corrected = { ...completed!.answers, DESTINATION: { value: 'Dock 4' } };
    await store.saveInspection('insp-1', { answers: corrected, currentStep: 7, status: 'completed' }, '2026-03-10T18:00:00.000Z');
    expect((await store.getInspection('insp-1'))?.completedAt).toBe(LATER);
  });

  test('saving an inspection that is not on the phone fails and changes nothing', async () => {
    const { store } = await freshStore();
    await store.startLive();
    await expect(store.saveInspection('missing', { answers: {}, currentStep: 1, status: 'draft' }, NOW)).rejects.toThrow();
    expect(await store.outbox()).toEqual([]);
  });
});

describe('attachments', () => {
  const photo = { id: 'photo-1', inspectionId: 'insp-1', kind: 'photo' as const, questionCode: 'PHOTO_ARRIVAL', localUri: 'file:///a.jpg' };

  test('a new photo is kept and queued after its inspection', async () => {
    const { store } = await freshStore();
    await store.startLive();
    await newDraft(store);
    await store.addAttachment(photo, LATER);
    expect(await store.listAttachments('insp-1')).toEqual([{ ...photo, uploaded: false }]);
    expect((await store.outbox()).map((op) => [op.entity, op.entityId, op.parentId])).toEqual([
      ['inspection', 'insp-1', null],
      ['attachment', 'photo-1', 'insp-1'],
    ]);
  });

  test('removing a photo the server never saw leaves nothing to send (S3) and returns its file', async () => {
    const { store } = await freshStore();
    await store.startLive();
    await newDraft(store);
    await store.addAttachment(photo, LATER);
    expect(await store.removeAttachment('photo-1', LATER)).toBe('file:///a.jpg');
    expect(await store.listAttachments('insp-1')).toEqual([]);
    expect((await store.outbox()).map((op) => op.entity)).toEqual(['inspection']);
  });

  test('removing an uploaded photo queues its deletion', async () => {
    const { db, store } = await freshStore();
    await store.startLive();
    await newDraft(store);
    await store.addAttachment(photo, LATER);
    await db.runAsync("UPDATE attachments SET uploaded = 1 WHERE id = 'photo-1'", []);
    await db.runAsync("DELETE FROM outbox WHERE entity = 'attachment'", []); // as if it was sent
    await store.removeAttachment('photo-1', LATER);
    expect(await store.outbox()).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity: 'attachment', entityId: 'photo-1', action: 'delete' })]),
    );
  });
});

describe('demo mode', () => {
  const data = buildDemoData(TODAY, NOW);

  test('an inspector sees only their own inspections; a supervisor sees them all', async () => {
    const { store } = await freshStore();
    await store.loadDemo(data, 'sam', NOW);
    const own = await store.listInspections();
    expect(own).toHaveLength(data.inspections.filter((i) => i.owner === 'sam').length);
    expect(await store.getMode()).toBe('demo');

    await store.loadDemo(data, 'robin', NOW);
    expect(await store.listInspections()).toHaveLength(14);
  });

  test('the demo keeps its owners, answers and summary', async () => {
    const { store } = await freshStore();
    await store.loadDemo(data, 'robin', NOW);
    const first = data.inspections[0];
    const loaded = await store.getInspection(first.id);
    expect(loaded).toMatchObject({ createdBy: 'demo-sam', status: 'completed', answers: first.answers });
    const kims = (await store.listInspections()).filter((r) => data.inspections.find((i) => i.id === r.id)?.owner === 'kim');
    expect(kims).toHaveLength(3);
  });

  test('nothing is ever queued in the demo', async () => {
    const { store } = await freshStore();
    await store.loadDemo(data, 'sam', NOW);
    const draft = data.inspections[8];
    await store.saveInspection(draft.id, { answers: { ...draft.answers, TRIP_REF: { value: 'T-99999' } }, currentStep: 1, status: 'draft' }, LATER);
    await newDraft(store, 'demo-new');
    expect(await store.outbox()).toEqual([]);
  });

  test('clearing leaves an empty phone', async () => {
    const { store } = await freshStore();
    await store.loadDemo(data, 'robin', NOW);
    await store.clear();
    expect(await store.listInspections()).toEqual([]);
    expect(await store.getMode()).toBeNull();
  });
});
