/** The directory rules of UI-BRIEF §7. */
import { cleanRecord, recordProblems, searchRecords } from '../src/directory/rules';

const ana = { id: 'd1', name: 'Ana Diaz', idNumber: '90314159', phone: '5552100400' };
const tom = { id: 'd2', name: 'Tom Becker', idNumber: '90322078', phone: '' };

test('plates are stored in upper case without spaces or hyphens; text is trimmed', () => {
  expect(cleanRecord('vehicles', { id: 'v', plate: ' klm-204 ', description: ' White  tractor ' })).toEqual({
    id: 'v',
    plate: 'KLM204',
    description: 'White tractor',
  });
});

test('required fields and digits-only fields are checked', () => {
  expect(recordProblems('drivers', { id: 'n', name: ' ', idNumber: '90 12', phone: '555-1' }, [])).toEqual([
    { field: 'name', reason: 'required' },
    { field: 'idNumber', reason: 'digits_only' },
    { field: 'phone', reason: 'digits_only' },
  ]);
});

test('a record that already exists is refused and the existing one is named', () => {
  expect(recordProblems('drivers', { id: 'n', name: 'Ana D.', idNumber: '90314159', phone: '' }, [ana, tom])).toEqual([
    { field: 'idNumber', reason: 'duplicate', existing: ana },
  ]);
  const bluefin = { id: 'c1', name: 'Bluefin Freight', contactName: '' };
  expect(recordProblems('carriers', { id: 'n', name: 'BLUEFIN freight', contactName: '' }, [bluefin])[0]).toMatchObject({
    reason: 'duplicate',
  });
  expect(recordProblems('vehicles', { id: 'n', plate: 'klm 204', description: '' }, [{ id: 'v1', plate: 'KLM204', description: '' }]))
    .toHaveLength(1);
});

test('editing a record does not clash with itself', () => {
  expect(recordProblems('drivers', { ...ana, phone: '5550000000' }, [ana, tom])).toEqual([]);
});

test('search ignores case, spaces and hyphens, and the list is alphabetical', () => {
  expect(searchRecords('drivers', [tom, ana], '').map((d) => d.name)).toEqual(['Ana Diaz', 'Tom Becker']);
  expect(searchRecords('drivers', [tom, ana], 'BECK').map((d) => d.id)).toEqual(['d2']);
  expect(searchRecords('vehicles', [{ id: 'v1', plate: 'KLM204', description: '' }], 'klm-2').map((v) => v.id)).toEqual(['v1']);
});
