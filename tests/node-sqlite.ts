/** Node's own SQLite behind the async interface expo-sqlite offers, for the tests. */
import { DatabaseSync } from 'node:sqlite';

import { Db, localStore } from '../src/data/local';

type Params = (string | number | null)[];

export function nodeDb(): Db {
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

export async function freshStore() {
  const db = nodeDb();
  const store = localStore(db);
  await store.migrate();
  return { db, store };
}
