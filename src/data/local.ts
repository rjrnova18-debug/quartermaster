/**
 * The phone's database: the only door the screens use to read and write data.
 *
 * Local first: every change is written here at once, so nothing is lost when the app
 * closes or there is no signal. In live mode each change also leaves a note in the
 * outbox ("this record changed"); the sender (F3f) delivers the notes to the server.
 * In demo mode nothing is ever sent: there is no outbox.
 *
 * Written against a small `Db` interface: on the phone it is expo-sqlite, in the tests
 * Node's own SQLite. The SQL is the same, so the tests exercise the real queries.
 */
import { DemoData, DemoPersonKey } from '../demo/demo-data';
import { cleanRecord, DirectoryKind, DirectoryRecord, FIELDS } from '../directory/rules';
import { catalog } from '../inspection/catalog';
import { finalAnswers, hasChanges, initialAnswers, summarize } from '../inspection/form';
import { AnswerSet, Inspection, InspectionRow, InspectionStatus } from '../inspection/model';
import { enqueue, OutboxOp } from '../inspection/sync';

type Value = string | number | null;

/** The part of expo-sqlite this module uses. */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Value[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Value[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Value[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** A list row plus what the home and history screens also need. */
export interface LocalRow extends InspectionRow {
  createdBy: string;
  currentStep: number;
}

/** An inspection as the phone keeps it: the domain record plus who created it. */
export interface LocalInspection extends Inspection {
  createdBy: string;
}

export type LocalMode = 'live' | 'demo';

/** A photo, signature or report kept on this phone. */
export interface LocalAttachment {
  id: string;
  inspectionId: string;
  kind: 'photo' | 'signature' | 'report';
  questionCode: string | null;
  /** A file of this phone, or "demo:<file>" for a bundled demo image. */
  localUri: string | null;
  uploaded: boolean;
}

interface AttachmentDbRow {
  id: string;
  inspection_id: string;
  kind: LocalAttachment['kind'];
  question_code: string | null;
  local_uri: string | null;
  uploaded: number;
}

// ---------------------------------------------------------------- schema

/**
 * One entry per schema version. PRAGMA user_version remembers how many have run, so an
 * installed app only runs the new ones. Never edit an entry that was released: add one.
 */
const MIGRATIONS = [
  `
  CREATE TABLE inspections (
    id                  TEXT PRIMARY KEY,
    status              TEXT NOT NULL,
    current_step        INTEGER NOT NULL,
    catalog_version     INTEGER NOT NULL,
    created_by          TEXT NOT NULL,
    inspector_name      TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    completed_at        TEXT,
    report_generated_at TEXT,
    deleted_at          TEXT,
    trip_ref            TEXT,
    inspection_date     TEXT,
    unit_type_code      TEXT,
    truck_plate         TEXT,
    container_no        TEXT,
    driver_name         TEXT,
    verdict             TEXT,
    answers             TEXT NOT NULL,  -- the whole AnswerSet as JSON
    synced_updated_at   TEXT            -- the server's updated_at when this copy last matched it
  );
  CREATE INDEX inspections_updated_at ON inspections (updated_at);

  CREATE TABLE attachments (
    id            TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    kind          TEXT NOT NULL,
    question_code TEXT,
    local_uri     TEXT,                 -- the file on this phone, or a bundled demo image
    uploaded      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX attachments_inspection ON attachments (inspection_id);

  CREATE TABLE drivers  (id TEXT PRIMARY KEY, name TEXT NOT NULL, id_number TEXT NOT NULL, phone TEXT,
                         updated_at TEXT NOT NULL, deleted_at TEXT);
  CREATE TABLE carriers (id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT,
                         updated_at TEXT NOT NULL, deleted_at TEXT);
  CREATE TABLE vehicles (id TEXT PRIMARY KEY, plate TEXT NOT NULL, description TEXT,
                         updated_at TEXT NOT NULL, deleted_at TEXT);

  CREATE TABLE outbox (
    entity         TEXT NOT NULL,
    entity_id      TEXT NOT NULL,
    parent_id      TEXT,
    action         TEXT NOT NULL,
    creates_entity INTEGER NOT NULL,
    queued_at      TEXT NOT NULL,
    state          TEXT NOT NULL,
    attempts       INTEGER NOT NULL,
    retry_at       TEXT,
    error          TEXT,
    PRIMARY KEY (entity, entity_id)
  );

  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
  // 2 · F3d: whether the server has a directory record, as for inspections.
  `
  ALTER TABLE drivers  ADD COLUMN synced_updated_at TEXT;
  ALTER TABLE carriers ADD COLUMN synced_updated_at TEXT;
  ALTER TABLE vehicles ADD COLUMN synced_updated_at TEXT;
  `,
];

/** The column of each directory field (the fields are named as in directory/rules.ts). */
const COLUMNS: Record<DirectoryKind, Record<string, string>> = {
  drivers: { name: 'name', idNumber: 'id_number', phone: 'phone' },
  carriers: { name: 'name', contactName: 'contact_name' },
  vehicles: { plate: 'plate', description: 'description' },
};

export const SCHEMA_VERSION = MIGRATIONS.length;

// ---------------------------------------------------------------- rows

interface InspectionDbRow {
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
  trip_ref: string | null;
  inspection_date: string | null;
  unit_type_code: string | null;
  truck_plate: string | null;
  container_no: string | null;
  driver_name: string | null;
  verdict: string | null;
  answers: string;
  synced_updated_at: string | null;
}

interface OutboxDbRow {
  entity: OutboxOp['entity'];
  entity_id: string;
  parent_id: string | null;
  action: OutboxOp['action'];
  creates_entity: number;
  queued_at: string;
  state: OutboxOp['state'];
  attempts: number;
  retry_at: string | null;
  error: string | null;
}

function toRow(row: InspectionDbRow): LocalRow {
  return {
    id: row.id,
    createdBy: row.created_by,
    currentStep: row.current_step,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reportGeneratedAt: row.report_generated_at,
    summary: {
      tripRef: row.trip_ref,
      inspectionDate: row.inspection_date,
      unitType: row.unit_type_code,
      truckPlate: row.truck_plate,
      containerNo: row.container_no,
      driverName: row.driver_name,
      verdict: row.verdict,
    },
  };
}

function toOp(r: OutboxDbRow): OutboxOp {
  return {
    entity: r.entity,
    entityId: r.entity_id,
    parentId: r.parent_id,
    action: r.action,
    createsEntity: r.creates_entity === 1,
    queuedAt: r.queued_at,
    state: r.state,
    attempts: r.attempts,
    retryAt: r.retry_at,
    error: r.error,
  };
}

function toInspection(row: InspectionDbRow): LocalInspection {
  return {
    id: row.id,
    status: row.status,
    currentStep: row.current_step,
    catalogVersion: row.catalog_version,
    inspectorName: row.inspector_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    reportGeneratedAt: row.report_generated_at,
    answers: JSON.parse(row.answers) as AnswerSet,
  };
}

/** Inserts an inspection, or replaces the row with the same id. */
const SAVE_INSPECTION = `
  INSERT OR REPLACE INTO inspections (id, status, current_step, catalog_version, created_by, inspector_name, created_at,
    updated_at, completed_at, report_generated_at, trip_ref, inspection_date, unit_type_code, truck_plate,
    container_no, driver_name, verdict, answers, synced_updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function inspectionValues(inspection: LocalInspection, syncedUpdatedAt: string | null): Value[] {
  const s = summarize(catalog, inspection.answers);
  return [
    inspection.id, inspection.status, inspection.currentStep, inspection.catalogVersion, inspection.createdBy,
    inspection.inspectorName, inspection.createdAt, inspection.updatedAt, inspection.completedAt,
    inspection.reportGeneratedAt, s.tripRef, s.inspectionDate, s.unitType, s.truckPlate, s.containerNo,
    s.driverName, s.verdict, JSON.stringify(inspection.answers), syncedUpdatedAt,
  ];
}

// ---------------------------------------------------------------- the store

export interface InspectionUpdate {
  answers: AnswerSet;
  currentStep: number;
  status: InspectionStatus;
}

export function localStore(db: Db) {
  async function getMode(): Promise<LocalMode | null> {
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', ['mode']);
    return (row?.value as LocalMode | undefined) ?? null;
  }

  /** S1-S3 through the pure `enqueue`; the outbox is small, so it is rewritten whole. */
  async function queue(change: Parameters<typeof enqueue>[1], now: string) {
    const rows = await db.getAllAsync<OutboxDbRow>('SELECT * FROM outbox', []);
    const after = enqueue(rows.map(toOp), change, now);
    await db.runAsync('DELETE FROM outbox', []);
    for (const op of after) {
      await db.runAsync(
        'INSERT INTO outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [op.entity, op.entityId, op.parentId, op.action, op.createsEntity ? 1 : 0, op.queuedAt, op.state,
          op.attempts, op.retryAt, op.error],
      );
    }
  }

  async function clearAll() {
    await db.execAsync(
      'DELETE FROM inspections; DELETE FROM attachments; DELETE FROM drivers; DELETE FROM carriers; ' +
        'DELETE FROM vehicles; DELETE FROM outbox; DELETE FROM meta;',
    );
  }

  return {
    /** Creates or upgrades the tables. Safe to run every time the app starts. */
    async migrate() {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
      for (let version = row?.user_version ?? 0; version < MIGRATIONS.length; version++) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(MIGRATIONS[version]);
          await db.execAsync(`PRAGMA user_version = ${version + 1}`);
        });
      }
    },

    getMode,

    /** Live mode with an empty database: after a real sign-in. */
    async startLive() {
      await db.withTransactionAsync(async () => {
        await clearAll();
        await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', ['mode', 'live']);
      });
    },

    /** Erases everything on the phone: signing out or leaving the demo. */
    async clear() {
      await db.withTransactionAsync(clearAll);
    },

    /**
     * Loads the demo as `viewer` would see it on the server: an inspector only their own
     * inspections, a supervisor all of them (ACCESS.md). Owner ids are "demo-<key>",
     * the same ids the session gives the demo people.
     */
    async loadDemo(data: DemoData, viewer: DemoPersonKey, now: string) {
      const role = data.people.find((p) => p.key === viewer)?.role;
      const visible = data.inspections.filter((i) => role === 'supervisor' || i.owner === viewer);
      const visibleIds = new Set(visible.map((i) => i.id));
      await db.withTransactionAsync(async () => {
        await clearAll();
        await db.runAsync('INSERT INTO meta (key, value) VALUES (?, ?)', ['mode', 'demo']);
        for (const c of data.carriers) {
          await db.runAsync('INSERT INTO carriers (id, name, contact_name, updated_at) VALUES (?, ?, ?, ?)', [c.id, c.name, c.contactName, now]);
        }
        for (const d of data.drivers) {
          await db.runAsync('INSERT INTO drivers (id, name, id_number, phone, updated_at) VALUES (?, ?, ?, ?, ?)', [d.id, d.name, d.idNumber, d.phone, now]);
        }
        for (const v of data.vehicles) {
          await db.runAsync('INSERT INTO vehicles (id, plate, description, updated_at) VALUES (?, ?, ?, ?)', [v.id, v.plate, v.description, now]);
        }
        for (const inspection of visible) {
          await db.runAsync(SAVE_INSPECTION, inspectionValues({ ...inspection, createdBy: `demo-${inspection.owner}` }, null));
        }
        for (const a of data.attachments.filter((a) => visibleIds.has(a.inspectionId))) {
          await db.runAsync(
            'INSERT INTO attachments (id, inspection_id, kind, question_code, local_uri, uploaded, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
            [a.id, a.inspectionId, a.kind, a.questionCode, `demo:${a.asset}`, now],
          );
        }
      });
    },

    /** The list screens' rows, newest change first. Deleted ones are left out. */
    async listInspections(): Promise<LocalRow[]> {
      const rows = await db.getAllAsync<InspectionDbRow>(
        'SELECT * FROM inspections WHERE deleted_at IS NULL ORDER BY updated_at DESC',
        [],
      );
      return rows.map(toRow);
    },

    async getInspection(id: string): Promise<LocalInspection | null> {
      const row = await db.getFirstAsync<InspectionDbRow>('SELECT * FROM inspections WHERE id = ? AND deleted_at IS NULL', [id]);
      return row ? toInspection(row) : null;
    },

    /** A new draft with the catalog defaults (F5). The id comes from the caller. */
    async createInspection(input: { id: string; createdBy: string; inspectorName: string; today: string; now: string }) {
      const inspection: LocalInspection = {
        id: input.id,
        status: 'draft',
        currentStep: 1,
        catalogVersion: catalog.version,
        inspectorName: input.inspectorName,
        createdBy: input.createdBy,
        createdAt: input.now,
        updatedAt: input.now,
        completedAt: null,
        reportGeneratedAt: null,
        answers: initialAnswers(catalog, input.today),
      };
      const live = (await getMode()) !== 'demo';
      await db.withTransactionAsync(async () => {
        await db.runAsync(SAVE_INSPECTION, inspectionValues(inspection, null));
        if (live) {
          await queue({ entity: 'inspection', entityId: inspection.id, action: 'upsert', existsOnServer: false }, input.now);
        }
      });
      return inspection;
    },

    /**
     * Saves the form in one transaction: summary (F18), change detection (F13), the row,
     * and the outbox note (S1). A completed inspection stores its final answers (F12) and
     * keeps the time it was first completed. Returns false when nothing changed.
     */
    async saveInspection(id: string, update: InspectionUpdate, now: string): Promise<boolean> {
      let saved = false;
      const live = (await getMode()) !== 'demo';
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<InspectionDbRow>('SELECT * FROM inspections WHERE id = ?', [id]);
        if (!row) {
          throw new Error(`inspection ${id} is not on this phone`);
        }
        const before = toInspection(row);
        const answers = update.status === 'completed' ? finalAnswers(catalog, update.answers) : update.answers;
        const changed =
          hasChanges(before.answers, answers) || before.currentStep !== update.currentStep || before.status !== update.status;
        if (!changed) {
          return;
        }
        const after: LocalInspection = {
          ...before,
          answers,
          currentStep: update.currentStep,
          status: update.status,
          updatedAt: now,
          completedAt: update.status === 'completed' ? before.completedAt ?? now : null,
        };
        await db.runAsync(SAVE_INSPECTION, inspectionValues(after, row.synced_updated_at));
        if (live) {
          await queue({ entity: 'inspection', entityId: id, action: 'upsert', existsOnServer: row.synced_updated_at !== null }, now);
        }
        saved = true;
      });
      return saved;
    },

    async listAttachments(inspectionId: string): Promise<LocalAttachment[]> {
      const rows = await db.getAllAsync<AttachmentDbRow>('SELECT * FROM attachments WHERE inspection_id = ?', [inspectionId]);
      return rows.map((r) => ({
        id: r.id,
        inspectionId: r.inspection_id,
        kind: r.kind,
        questionCode: r.question_code,
        localUri: r.local_uri,
        uploaded: r.uploaded === 1,
      }));
    },

    /** Registers a file already stored on the phone, and queues its upload (it waits for its inspection, S5). */
    async addAttachment(a: Omit<LocalAttachment, 'uploaded'>, now: string) {
      const live = (await getMode()) !== 'demo';
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'INSERT INTO attachments (id, inspection_id, kind, question_code, local_uri, uploaded, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
          [a.id, a.inspectionId, a.kind, a.questionCode, a.localUri, now],
        );
        if (live) {
          await queue({ entity: 'attachment', entityId: a.id, parentId: a.inspectionId, action: 'upsert', existsOnServer: false }, now);
        }
      });
    },

    /**
     * Forgets an attachment and queues its deletion; one never uploaded leaves nothing to
     * send (S3). Returns the file to delete from the phone, if any.
     */
    async removeAttachment(id: string, now: string): Promise<string | null> {
      const live = (await getMode()) !== 'demo';
      let localUri: string | null = null;
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<AttachmentDbRow>('SELECT * FROM attachments WHERE id = ?', [id]);
        if (!row) return;
        localUri = row.local_uri;
        await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
        if (live) {
          await queue(
            { entity: 'attachment', entityId: id, parentId: row.inspection_id, action: 'delete', existsOnServer: row.uploaded === 1 },
            now,
          );
        }
      });
      return localUri;
    },

    /**
     * Deletes an inspection with its attachments. One the server has is only marked
     * (deleted_at) and its deletion queued; one it never saw disappears with its notes
     * (S2, S3). Returns the files to delete from the phone.
     */
    async deleteInspection(id: string, now: string): Promise<string[]> {
      const live = (await getMode()) !== 'demo';
      const files: string[] = [];
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<InspectionDbRow>('SELECT * FROM inspections WHERE id = ?', [id]);
        if (!row) return;
        const attachments = await db.getAllAsync<AttachmentDbRow>('SELECT * FROM attachments WHERE inspection_id = ?', [id]);
        files.push(...attachments.map((a) => a.local_uri).filter((uri): uri is string => uri !== null));
        const known = row.synced_updated_at !== null;
        if (known) {
          await db.runAsync('UPDATE inspections SET deleted_at = ? WHERE id = ?', [now, id]);
        } else {
          await db.runAsync('DELETE FROM inspections WHERE id = ?', [id]);
        }
        await db.runAsync('DELETE FROM attachments WHERE inspection_id = ?', [id]);
        if (live) {
          await queue({ entity: 'inspection', entityId: id, action: 'delete', existsOnServer: known }, now);
        }
      });
      return files;
    },

    // ---------------------------------------------------------------- directory

    /** The records of one kind that are not deleted, as flat field sets. */
    async listDirectory(kind: DirectoryKind): Promise<DirectoryRecord[]> {
      const columns = COLUMNS[kind];
      const rows = await db.getAllAsync<Record<string, string | null>>(`SELECT * FROM ${kind} WHERE deleted_at IS NULL`, []);
      return rows.map((row) => {
        const record: DirectoryRecord = { id: row.id as string };
        for (const [key, column] of Object.entries(columns)) record[key] = row[column] ?? '';
        return record;
      });
    },

    /** Adds or edits a record (cleaned first) and queues it. The caller checks recordProblems. */
    async saveDirectoryRecord(kind: DirectoryKind, record: DirectoryRecord, now: string) {
      const clean = cleanRecord(kind, record);
      const keys = FIELDS[kind].map((spec) => spec.key);
      const columns = keys.map((key) => COLUMNS[kind][key]);
      const values = keys.map((key) => (clean[key] === '' ? null : clean[key]));
      const live = (await getMode()) !== 'demo';
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<{ synced_updated_at: string | null }>(`SELECT synced_updated_at FROM ${kind} WHERE id = ?`, [clean.id]);
        if (row) {
          await db.runAsync(`UPDATE ${kind} SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...values, now, clean.id]);
        } else {
          await db.runAsync(
            `INSERT INTO ${kind} (id, ${columns.join(', ')}, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, ?)`,
            [clean.id, ...values, now],
          );
        }
        if (live) {
          await queue({ entity: 'directory', entityId: clean.id, action: 'upsert', existsOnServer: row?.synced_updated_at != null }, now);
        }
      });
      return clean;
    },

    /**
     * Deletes a record. One the server has is only marked (deleted_at), so other phones
     * learn it is gone; one it never saw simply disappears with its note (S3).
     */
    async deleteDirectoryRecord(kind: DirectoryKind, id: string, now: string) {
      const live = (await getMode()) !== 'demo';
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<{ synced_updated_at: string | null }>(`SELECT synced_updated_at FROM ${kind} WHERE id = ?`, [id]);
        if (!row) return;
        const known = row.synced_updated_at !== null;
        if (known || !live) {
          await db.runAsync(`UPDATE ${kind} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
        } else {
          await db.runAsync(`DELETE FROM ${kind} WHERE id = ?`, [id]);
        }
        if (live) {
          await queue({ entity: 'directory', entityId: id, action: known ? 'upsert' : 'delete', existsOnServer: known }, now);
        }
      });
    },

    /** The notes waiting to be sent (the sender and the sync badge use them). */
    async outbox(): Promise<OutboxOp[]> {
      const rows = await db.getAllAsync<OutboxDbRow>('SELECT * FROM outbox ORDER BY queued_at', []);
      return rows.map(toOp);
    },
  };
}

export type LocalStore = ReturnType<typeof localStore>;

let opening: Promise<LocalStore> | null = null;

/** The phone's database, opened and migrated the first time it is asked for. */
export function getLocal(): Promise<LocalStore> {
  if (!opening) {
    opening = (async () => {
      const SQLite = await import('expo-sqlite');
      const db = await SQLite.openDatabaseAsync('quartermaster.db');
      await db.execAsync('PRAGMA journal_mode = WAL');
      const store = localStore(db);
      await store.migrate();
      return store;
    })();
  }
  return opening;
}
