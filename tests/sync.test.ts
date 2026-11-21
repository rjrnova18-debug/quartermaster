import {
  backoffSeconds,
  Change,
  discardLocalChanges,
  enqueue,
  LocalVersion,
  markConflict,
  markFailed,
  markSent,
  needsAttention,
  OutboxOp,
  readyOps,
  resolvePull,
  syncBadge,
} from '../src/inspection/sync';

const T0 = '2026-03-04T08:00:00.000Z';
const T1 = '2026-03-04T08:01:00.000Z';
const T2 = '2026-03-04T08:02:00.000Z';

const saveInspection = (id: string, existsOnServer = false): Change => ({
  entity: 'inspection',
  entityId: id,
  action: 'upsert',
  existsOnServer,
});
const deleteInspection = (id: string, existsOnServer: boolean): Change => ({
  entity: 'inspection',
  entityId: id,
  action: 'delete',
  existsOnServer,
});
const savePhoto = (id: string, inspectionId: string): Change => ({
  entity: 'attachment',
  entityId: id,
  parentId: inspectionId,
  action: 'upsert',
  existsOnServer: false,
});
const saveDriver = (id: string): Change => ({
  entity: 'directory',
  entityId: id,
  action: 'upsert',
  existsOnServer: false,
});

const names = (ops: OutboxOp[]): string[] => ops.map((op) => `${op.action} ${op.entityId}`);

describe('S1 one note per record', () => {
  test('saving twice leaves a single note', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = enqueue(outbox, saveInspection('i1'), T1);
    expect(names(outbox)).toEqual(['upsert i1']);
    expect(outbox[0].queuedAt).toBe(T0);
  });

  test('saving again clears an earlier failure', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    outbox = enqueue(outbox, saveInspection('i1'), T1);
    expect(outbox[0]).toMatchObject({ state: 'pending', attempts: 0, retryAt: null, error: null });
  });

  test('a record created here stays marked as new to the server', () => {
    let outbox = enqueue([], saveInspection('i1', false), T0);
    outbox = enqueue(outbox, saveInspection('i1', true), T1);
    expect(outbox[0].createsEntity).toBe(true);
  });
});

describe('S2 deleting replaces the pending notes', () => {
  test('the save note and the attachment notes go away', () => {
    let outbox = enqueue([], saveInspection('i1', true), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = enqueue(outbox, savePhoto('p2', 'i2'), T0);
    outbox = enqueue(outbox, deleteInspection('i1', true), T1);
    expect(names(outbox)).toEqual(['upsert p2', 'delete i1']);
  });
});

describe('S3 deleting what the server never saw', () => {
  test('leaves nothing to send', () => {
    let outbox = enqueue([], saveInspection('i1', false), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = enqueue(outbox, deleteInspection('i1', false), T1);
    expect(outbox).toEqual([]);
  });

  test('also when no note was waiting', () => {
    expect(enqueue([], deleteInspection('i1', false), T0)).toEqual([]);
    expect(names(enqueue([], deleteInspection('i1', true), T0))).toEqual(['delete i1']);
  });
});

describe('S4 sending order', () => {
  test('directory, then inspections, then attachments; oldest first', () => {
    let outbox = enqueue([], savePhoto('p1', 'i1'), T0);
    outbox = enqueue(outbox, saveInspection('i2'), T1);
    outbox = enqueue(outbox, saveInspection('i1'), T0);
    outbox = enqueue(outbox, saveDriver('d1'), T2);
    expect(names(readyOps(outbox, T2))).toEqual(['upsert d1', 'upsert i1', 'upsert i2', 'upsert p1']);
  });
});

describe('S5 attachments wait for their inspection', () => {
  test('while the inspection is waiting to retry', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = enqueue(outbox, savePhoto('p2', 'i2'), T0);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    expect(names(readyOps(outbox, T0))).toEqual(['upsert p2']);
  });

  test('and go out with it once the wait is over', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    expect(names(readyOps(outbox, T1))).toEqual(['upsert i1', 'upsert p1']);
  });
});

describe('S6 sent', () => {
  test('a delivered note leaves the outbox', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = enqueue(outbox, saveInspection('i2'), T0);
    expect(names(markSent(outbox, outbox[0]))).toEqual(['upsert i2']);
  });
});

describe('S7 failed attempts wait longer each time', () => {
  test('30 s, 60 s, 120 s... never more than an hour', () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
    expect(backoffSeconds(20)).toBe(3600);
  });

  test('a failed note records the error and when to retry', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    expect(outbox[0]).toMatchObject({
      state: 'failed',
      attempts: 1,
      retryAt: '2026-03-04T08:00:30.000Z',
      error: 'no signal',
    });
    outbox = markFailed(outbox, outbox[0], T1, 'timeout');
    expect(outbox[0]).toMatchObject({ attempts: 2, retryAt: '2026-03-04T08:02:00.000Z' });
  });

  test('it is not sent before its time', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    expect(readyOps(outbox, '2026-03-04T08:00:29.000Z')).toEqual([]);
    expect(readyOps(outbox, '2026-03-04T08:00:30.000Z')).toHaveLength(1);
  });
});

describe('S8 conflicts and attention', () => {
  test('a refused note stops being retried', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = markConflict(outbox, outbox[0], 'duplicate_trip_ref');
    expect(outbox[0]).toMatchObject({ state: 'conflict', error: 'duplicate_trip_ref' });
    expect(readyOps(outbox, T2)).toEqual([]);
    expect(needsAttention(outbox[0])).toBe(true);
  });

  test('a note that keeps failing asks for attention after six attempts', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    for (let attempt = 1; attempt <= 5; attempt++) {
      outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    }
    expect(needsAttention(outbox[0])).toBe(false);
    outbox = markFailed(outbox, outbox[0], T0, 'no signal');
    expect(needsAttention(outbox[0])).toBe(true);
  });
});

describe('S9 sync badge', () => {
  test('synced when nothing is waiting', () => {
    expect(syncBadge(enqueue([], saveInspection('i2'), T0), 'i1')).toBe('synced');
  });

  test('pending when the inspection or one of its attachments is waiting', () => {
    expect(syncBadge(enqueue([], saveInspection('i1'), T0), 'i1')).toBe('pending');
    expect(syncBadge(enqueue([], savePhoto('p1', 'i1'), T0), 'i1')).toBe('pending');
  });

  test('the worst state wins: conflict over failed over pending', () => {
    let outbox = enqueue([], saveInspection('i1'), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = markFailed(outbox, outbox[1], T0, 'no signal');
    expect(syncBadge(outbox, 'i1')).toBe('failed');
    outbox = markConflict(outbox, outbox[0], 'duplicate_trip_ref');
    expect(syncBadge(outbox, 'i1')).toBe('conflict');
  });
});

describe('S10 which copy survives', () => {
  const local = (extra: Partial<LocalVersion> = {}): LocalVersion => ({
    status: 'draft',
    updatedAt: T1,
    syncedUpdatedAt: T0,
    hasPendingChanges: false,
    ...extra,
  });

  test('no local copy: take the server copy', () => {
    expect(resolvePull(null, { status: 'draft', updatedAt: T0 })).toBe('take_remote');
  });

  test('nothing unsent: take the server copy only if it is newer', () => {
    expect(resolvePull(local(), { status: 'draft', updatedAt: T2 })).toBe('take_remote');
    expect(resolvePull(local(), { status: 'draft', updatedAt: T0 })).toBe('keep_local');
  });

  test('unsent changes and an unchanged server: keep the local copy', () => {
    expect(resolvePull(local({ hasPendingChanges: true }), { status: 'draft', updatedAt: T0 })).toBe('keep_local');
  });

  test('both changed: a completed inspection beats a draft', () => {
    const editedDraft = local({ hasPendingChanges: true, updatedAt: T2 });
    expect(resolvePull(editedDraft, { status: 'completed', updatedAt: T1 })).toBe('take_remote');
    const completedHere = local({ hasPendingChanges: true, status: 'completed', updatedAt: T1 });
    expect(resolvePull(completedHere, { status: 'draft', updatedAt: T2 })).toBe('keep_local');
  });

  test('both changed with the same status: the later change wins, a tie goes to the server', () => {
    const edited = local({ hasPendingChanges: true, updatedAt: T2 });
    expect(resolvePull(edited, { status: 'draft', updatedAt: T1 })).toBe('keep_local');
    expect(resolvePull(edited, { status: 'draft', updatedAt: T2 })).toBe('take_remote');
  });

  test('a never-synced local copy with the same id is treated as both changed', () => {
    const neverSynced = local({ hasPendingChanges: true, syncedUpdatedAt: null, updatedAt: T0 });
    expect(resolvePull(neverSynced, { status: 'draft', updatedAt: T1 })).toBe('take_remote');
  });

  test('when the server copy wins, the local notes of that inspection are dropped', () => {
    let outbox = enqueue([], saveInspection('i1', true), T0);
    outbox = enqueue(outbox, savePhoto('p1', 'i1'), T0);
    outbox = enqueue(outbox, saveInspection('i2', true), T0);
    expect(names(discardLocalChanges(outbox, 'i1'))).toEqual(['upsert i2']);
  });
});
