/**
 * Encrypted key-value storage for the session and the signed-in profile.
 *
 * expo-secure-store keeps values in the phone's Keychain (iOS) or Keystore (Android),
 * encrypted by the operating system. It accepts values of up to about 2 KB, and a
 * Supabase session is larger, so long values are split into numbered pieces:
 *
 *   key.count = "3"    key.0 = "{"access_tok…"    key.1 = "…"    key.2 = "…}"
 */
import * as SecureStore from 'expo-secure-store';

/** The three calls of expo-secure-store this module needs (a fake in the tests). */
export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The storage interface supabase-js expects. */
export interface AsyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** 500 characters are at most 2000 bytes, even when every character takes 4. */
export const PIECE_LENGTH = 500;

/** Splits by whole characters, so a character of several bytes is never cut in two. */
function pieces(value: string): string[] {
  const characters = Array.from(value);
  const result: string[] = [];
  for (let i = 0; i < characters.length; i += PIECE_LENGTH) {
    result.push(characters.slice(i, i + PIECE_LENGTH).join(''));
  }
  return result.length > 0 ? result : [''];
}

export function chunkedStorage(store: KeyValueStore): AsyncStorage {
  const countOf = async (key: string) => Number(await store.getItemAsync(`${key}.count`)) || 0;

  return {
    async getItem(key) {
      const count = await countOf(key);
      if (count === 0) {
        return null;
      }
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await store.getItemAsync(`${key}.${i}`);
        if (part === null) {
          return null; // half written: treat as missing rather than return a broken value
        }
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const before = await countOf(key);
      const parts = pieces(value);
      for (let i = 0; i < parts.length; i++) {
        await store.setItemAsync(`${key}.${i}`, parts[i]);
      }
      await store.setItemAsync(`${key}.count`, String(parts.length));
      for (let i = parts.length; i < before; i++) {
        await store.deleteItemAsync(`${key}.${i}`); // the old value was longer
      }
    },

    async removeItem(key) {
      const before = await countOf(key);
      await store.deleteItemAsync(`${key}.count`);
      for (let i = 0; i < before; i++) {
        await store.deleteItemAsync(`${key}.${i}`);
      }
    },
  };
}

export const secureStorage = chunkedStorage(SecureStore);
