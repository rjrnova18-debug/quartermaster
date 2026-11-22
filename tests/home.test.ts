/** Who may delete, and the sync line of the home screen. */
import { canDeleteInspection, syncLine } from '../src/home/rules';
import { OutboxOp } from '../src/inspection/sync';

const inspector = { id: 'u1', role: 'inspector' as const };
const supervisor = { id: 's1', role: 'supervisor' as const };

test('an inspector deletes only their own drafts; a supervisor deletes anything', () => {
  expect(canDeleteInspection({ status: 'draft', createdBy: 'u1' }, inspector)).toBe(true);
  expect(canDeleteInspection({ status: 'completed', createdBy: 'u1' }, inspector)).toBe(false);
  expect(canDeleteInspection({ status: 'draft', createdBy: 'u2' }, inspector)).toBe(false);
  expect(canDeleteInspection({ status: 'completed', createdBy: 'u2' }, supervisor)).toBe(true);
});

const op = (extra: Partial<OutboxOp>): OutboxOp => ({
  entity: 'inspection', entityId: 'i', parentId: null, action: 'upsert', createsEntity: true,
  queuedAt: '2026-03-10T10:00:00Z', state: 'pending', attempts: 0, retryAt: null, error: null, ...extra,
});

test('the sync line says synced, waiting, or needs attention, in that order of importance', () => {
  expect(syncLine([])).toEqual({ kind: 'synced' });
  expect(syncLine([op({}), op({ entityId: 'j' })])).toEqual({ kind: 'waiting', count: 2 });
  expect(syncLine([op({}), op({ entityId: 'j', state: 'conflict' })])).toEqual({ kind: 'attention', count: 1 });
});
