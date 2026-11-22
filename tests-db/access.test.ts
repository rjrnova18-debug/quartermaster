/**
 * Access tests: real users against the real dev database (npm run test:db).
 *
 * Each test either does something allowed and checks it works, or tries something
 * forbidden and checks the DATABASE refuses it. Hiding a button is not security
 * (ACCESS.md); these tests are the proof that row-level security and the write
 * functions hold even for a client that skips the app entirely.
 *
 * Creates its own throw-away users and data, and removes them at the end.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { catalog } from '../src/inspection/catalog';
import { summarize } from '../src/inspection/form';
import { AnswerSet } from '../src/inspection/model';

// Bracket access: babel-preset-expo inlines `process.env.EXPO_PUBLIC_*` at build time.
const env = (name: string) => process.env[name] as string;
const URL = env('EXPO_PUBLIC_SUPABASE_URL');
const PUBLISHABLE_KEY = env('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const SECRET_KEY = env('SUPABASE_SECRET_KEY');

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET_KEY, noSession); // bypasses RLS: setup and cleanup only
const anon = createClient(URL, PUBLISHABLE_KEY, noSession);

const RUN = randomUUID().slice(0, 8); // keeps trip references and emails unique per run
const PASSWORD = `pw-${randomUUID()}`;
const BUCKET = 'inspection-files';
const PERMISSION_DENIED = '42501'; // Postgres: the role has no privilege for this

interface Person {
  id: string;
  client: SupabaseClient;
}

const userIds: string[] = [];

async function person(name: string, metadata: Record<string, string> = {}): Promise<Person> {
  const email = `test-${RUN}-${name}@quartermaster.example`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, ...metadata },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(URL, PUBLISHABLE_KEY, noSession);
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

/** The answers of a minimal dry-container inspection that may be completed. */
function completeAnswers(tripRef: string): AnswerSet {
  return {
    TRIP_DATE: { value: '2026-03-04' },
    TRIP_REF: { value: tripRef },
    UNIT_TYPE: { value: 'UT01' },
    TRUCK_PLATE: { value: 'KLM204' },
    VERDICT: { value: 'FIT' },
    INSPECTOR_SIGNATURE: { value: randomUUID() },
  };
}

function save(who: Person, id: string, answers: AnswerSet, status: 'draft' | 'completed' = 'draft') {
  return who.client.rpc('save_inspection', {
    payload: { id, status, current_step: 1, catalog_version: catalog.version, answers },
  });
}

let inspectorA: Person;
let inspectorB: Person;
let supervisor: Person;

beforeAll(async () => {
  // Inspector A tries to sneak a role in through the sign-up metadata.
  inspectorA = await person('inspector-a', { role: 'supervisor' });
  inspectorB = await person('inspector-b');
  supervisor = await person('supervisor');
  const promote = await admin.from('profiles').update({ role: 'supervisor' }).eq('id', supervisor.id);
  if (promote.error) throw promote.error;
});

afterAll(async () => {
  if (userIds.length === 0) return;
  const { data: files } = await admin.from('attachments').select('storage_path').in('created_by', userIds);
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((file) => file.storage_path));
  }
  await admin.from('inspections').delete().in('created_by', userIds);
  for (const table of ['drivers', 'carriers', 'vehicles']) {
    await admin.from(table).delete().in('created_by', userIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe('without signing in', () => {
  test('nothing can be read, not even the catalog', async () => {
    const { error } = await anon.from('questions').select('code').limit(1);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  test('the write functions cannot be called', async () => {
    const { error } = await anon.rpc('save_inspection', { payload: {} });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });
});

describe('profiles and roles', () => {
  test('a role written in the sign-up metadata is ignored', async () => {
    const { data } = await inspectorA.client.from('profiles').select('role').eq('id', inspectorA.id).single();
    expect(data?.role).toBe('inspector');
  });

  test('a person can rename themselves but not change their own role', async () => {
    const rename = await inspectorA.client.from('profiles').update({ full_name: 'Inspector A' }).eq('id', inspectorA.id);
    expect(rename.error).toBeNull();
    const promote = await inspectorA.client.from('profiles').update({ role: 'supervisor' }).eq('id', inspectorA.id);
    expect(promote.error?.code).toBe(PERMISSION_DENIED);
  });

  test('only a supervisor changes roles, and never their own', async () => {
    const byInspector = await inspectorA.client.rpc('set_user_role', { p_user: inspectorB.id, p_role: 'supervisor' });
    expect(byInspector.error?.message).toBe('not_allowed');
    const ownRole = await supervisor.client.rpc('set_user_role', { p_user: supervisor.id, p_role: 'inspector' });
    expect(ownRole.error?.message).toBe('not_allowed');
    const promote = await supervisor.client.rpc('set_user_role', { p_user: inspectorB.id, p_role: 'supervisor' });
    expect(promote.error).toBeNull();
    const demote = await supervisor.client.rpc('set_user_role', { p_user: inspectorB.id, p_role: 'inspector' });
    expect(demote.error).toBeNull();
  });

  test('an inspector sees only their own profile; a supervisor sees all', async () => {
    const own = await inspectorA.client.from('profiles').select('id');
    expect(own.data?.map((row) => row.id)).toEqual([inspectorA.id]);
    const all = await supervisor.client.from('profiles').select('id').in('id', userIds);
    expect(all.data).toHaveLength(3);
  });
});

describe('catalog', () => {
  test('signed-in people read it, and it matches questions.json', async () => {
    const { data, error } = await inspectorA.client.from('questions').select('code');
    expect(error).toBeNull();
    expect(data).toHaveLength(catalog.questions.length);
  });
});

describe('saving inspections', () => {
  const idA = randomUUID();
  const refA = `T-${RUN}-A`;

  test('the server computes the summary itself, like summarize() (B1)', async () => {
    const answers: AnswerSet = { ...completeAnswers(`  ${refA}  `), CONTAINER_NO: { value: 'CSQU3054383' } };
    const forged = { id: idA, status: 'draft', current_step: 2, catalog_version: catalog.version, answers,
                     trip_ref: 'FORGED', verdict: 'NOT_FIT' }; // extra fields must be ignored
    const { error } = await inspectorA.client.rpc('save_inspection', { payload: forged });
    expect(error).toBeNull();

    const { data } = await inspectorA.client.from('inspections').select('*').eq('id', idA).single();
    const expected = summarize(catalog, answers);
    expect(data).toMatchObject({
      trip_ref: expected.tripRef,
      inspection_date: expected.inspectionDate,
      unit_type_code: expected.unitType,
      truck_plate: expected.truckPlate,
      container_no: expected.containerNo,
      driver_name: expected.driverName,
      verdict: expected.verdict,
      created_by: inspectorA.id,
      status: 'draft',
    });
  });

  test('the app cannot write the tables directly, only through the functions', async () => {
    const insert = await inspectorA.client.from('inspections').insert({ id: randomUUID(), status: 'draft' });
    expect(insert.error?.code).toBe(PERMISSION_DENIED);
    const answer = await inspectorA.client.from('answers').insert({ inspection_id: idA, question_code: 'TRIP_REF', value: 'X' });
    expect(answer.error?.code).toBe(PERMISSION_DENIED);
  });

  test('nonsense is refused even in a draft', async () => {
    const badCheck = await save(inspectorA, randomUUID(), { DOCS_LICENSE: { value: 'MAYBE' } });
    expect(badCheck.error?.message).toMatch(/^invalid: check value/);
    const unknown = await save(inspectorA, randomUUID(), { NOT_A_QUESTION: { value: 'x' } });
    expect(unknown.error?.message).toMatch(/^invalid: unknown question/);
    const badDate = await save(inspectorA, randomUUID(), { TRIP_DATE: { value: '2026-02-30' } });
    expect(badDate.error?.message).toMatch(/^invalid: date/);
  });

  test('a trip reference cannot be reused, whatever its case or spacing (F16)', async () => {
    const clash = await save(inspectorB, randomUUID(), { TRIP_REF: { value: ` ${refA.toLowerCase()} ` } });
    expect(clash.error?.message).toBe('duplicate_trip_ref');
  });

  test('another inspector can neither see nor overwrite it', async () => {
    const read = await inspectorB.client.from('inspections').select('id').eq('id', idA);
    expect(read.data).toEqual([]);
    const answers = await inspectorB.client.from('answers').select('value').eq('inspection_id', idA);
    expect(answers.data).toEqual([]);
    const overwrite = await save(inspectorB, idA, completeAnswers(`T-${RUN}-hijack`));
    expect(overwrite.error?.message).toBe('not_allowed');
  });

  test('a supervisor sees it', async () => {
    const { data } = await supervisor.client.from('inspections').select('id').eq('id', idA);
    expect(data).toHaveLength(1);
  });

  test('completing re-checks the blocking rules on the server (B2)', async () => {
    const answers = completeAnswers(refA);
    const { INSPECTOR_SIGNATURE: _signature, ...unsigned } = answers;
    const missing = await save(inspectorA, idA, unsigned, 'completed');
    expect(missing.error?.message).toBe('invalid: required INSPECTOR_SIGNATURE');

    const failWithoutNote = await save(inspectorA, idA, { ...answers, DOCS_LICENSE: { value: 'FAIL' } }, 'completed');
    expect(failWithoutNote.error?.message).toBe('invalid: note_needed DOCS_LICENSE');

    const ok = await save(inspectorA, idA, answers, 'completed');
    expect(ok.error).toBeNull();
    expect(ok.data.completed_at).not.toBeNull();

    const backToDraft = await save(inspectorA, idA, answers, 'draft');
    expect(backToDraft.error?.message).toMatch(/^invalid: a completed inspection stays completed/);
  });

  test('an inspector corrects within 24 hours; after that only a supervisor (F19)', async () => {
    const answers = completeAnswers(refA);
    const within = await save(inspectorA, idA, answers, 'completed');
    expect(within.error).toBeNull();

    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await admin.from('inspections').update({ completed_at: yesterday }).eq('id', idA);

    const late = await save(inspectorA, idA, answers, 'completed');
    expect(late.error?.message).toBe('not_allowed');
    const bySupervisor = await save(supervisor, idA, answers, 'completed');
    expect(bySupervisor.error).toBeNull();
  });

  test('an inspector deletes only their own drafts; deleted rows stay visible for sync', async () => {
    const completedDelete = await inspectorA.client.rpc('delete_inspection', { p_id: idA });
    expect(completedDelete.error?.message).toBe('not_allowed');

    const draftId = randomUUID();
    await save(inspectorA, draftId, { TRIP_REF: { value: `T-${RUN}-draft` } });
    const byOther = await inspectorB.client.rpc('delete_inspection', { p_id: draftId });
    expect(byOther.error?.message).toBe('not_allowed');
    const own = await inspectorA.client.rpc('delete_inspection', { p_id: draftId });
    expect(own.error).toBeNull();

    const { data } = await inspectorA.client.from('inspections').select('deleted_at').eq('id', draftId).single();
    expect(data?.deleted_at).not.toBeNull();
  });

  test('changes_since returns only what the caller may see', async () => {
    const { data, error } = await inspectorB.client.rpc('changes_since', {});
    expect(error).toBeNull();
    const ids = data.inspections.map((row: { id: string }) => row.id);
    expect(ids).not.toContain(idA);
  });
});

describe('files', () => {
  const inspectionId = randomUUID();
  const photoId = randomUUID();
  const path = `${inspectionId}/${photoId}.png`;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeAll(async () => {
    await save(inspectorA, inspectionId, { TRIP_REF: { value: `T-${RUN}-files` } });
  });

  test('the owner uploads a photo into the folder of their inspection and registers it', async () => {
    const upload = await inspectorA.client.storage.from(BUCKET).upload(path, png, { contentType: 'image/png' });
    expect(upload.error).toBeNull();
    const register = await inspectorA.client.rpc('save_attachment', {
      attachment: { id: photoId, inspection_id: inspectionId, kind: 'photo', question_code: 'PHOTO_ARRIVAL', storage_path: path },
    });
    expect(register.error).toBeNull();
  });

  test('another inspector can neither upload into that folder nor read the photo', async () => {
    const intruder = await inspectorB.client.storage
      .from(BUCKET)
      .upload(`${inspectionId}/${randomUUID()}.png`, png, { contentType: 'image/png' });
    expect(intruder.error?.message).toMatch(/row-level security/);
    const read = await inspectorB.client.storage.from(BUCKET).download(path);
    expect(read.error).not.toBeNull();
    expect(read.data).toBeNull();
  });

  test('a file cannot be registered outside its inspection folder', async () => {
    const otherId = randomUUID();
    const forged = await inspectorA.client.rpc('save_attachment', {
      attachment: { id: otherId, inspection_id: inspectionId, kind: 'photo', question_code: 'PHOTO_ARRIVAL',
                    storage_path: `${randomUUID()}/${otherId}.png` },
    });
    expect(forged.error?.message).toBe('not_allowed');
  });
});

describe('directory', () => {
  const driverId = randomUUID();

  test('an inspector adds a driver at the gate', async () => {
    const { error } = await inspectorA.client
      .from('drivers')
      .insert({ id: driverId, name: 'Test Driver', id_number: `90${Date.now()}`.slice(0, 10) });
    expect(error).toBeNull();
  });

  test('an inspector cannot edit it, and cannot add one in someone else\'s name', async () => {
    await inspectorA.client.from('drivers').update({ name: 'Changed' }).eq('id', driverId);
    const { data } = await admin.from('drivers').select('name').eq('id', driverId).single();
    expect(data?.name).toBe('Test Driver');

    const forged = await inspectorA.client
      .from('drivers')
      .insert({ id: randomUUID(), name: 'Forged', id_number: '9011111111', created_by: inspectorB.id });
    expect(forged.error?.message).toMatch(/row-level security/);
  });

  test('a supervisor edits it', async () => {
    const { error } = await supervisor.client.from('drivers').update({ name: 'Edited' }).eq('id', driverId);
    expect(error).toBeNull();
    const { data } = await admin.from('drivers').select('name').eq('id', driverId).single();
    expect(data?.name).toBe('Edited');
  });
});
