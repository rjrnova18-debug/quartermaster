/** The pure parts behind the sign-in screen: texts, encrypted storage and sign-in errors. */
import { checkSignInForm, problemFromAuthError } from '../src/data/remote';
import { chunkedStorage, KeyValueStore, PIECE_LENGTH } from '../src/data/secure-storage';
import { localeFrom, t } from '../src/i18n';

/** An in-memory stand-in for expo-secure-store that refuses values over 2048 bytes, like the real one may. */
function fakeStore(): KeyValueStore & { keys: () => string[] } {
  const values = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (Buffer.byteLength(value, 'utf8') > 2048) throw new Error('value too large');
      values.set(key, value);
    },
    async deleteItemAsync(key) {
      values.delete(key);
    },
    keys: () => [...values.keys()].sort(),
  };
}

describe('texts', () => {
  test('values replace their {placeholders}; an unknown one is left visible', () => {
    expect(t('en', 'home.greeting', { name: 'Sam' })).toBe('Ready for the next quest, Sam?');
    expect(t('es', 'home.greeting', { name: 'Sam' })).toBe('Sam, ¿vamos por la próxima misión?');
    expect(t('en', 'home.greeting')).toBe('Ready for the next quest, {name}?');
  });

  test('any Spanish variant gets Spanish; everything else English', () => {
    expect(localeFrom('es-CO')).toBe('es');
    expect(localeFrom('ES')).toBe('es');
    expect(localeFrom('en-US')).toBe('en');
    expect(localeFrom('pt-BR')).toBe('en');
  });
});

describe('encrypted storage in pieces', () => {
  test('a short value is kept in one piece', async () => {
    const store = fakeStore();
    const storage = chunkedStorage(store);
    await storage.setItem('k', 'hello');
    expect(await storage.getItem('k')).toBe('hello');
    expect(store.keys()).toEqual(['k.0', 'k.count']);
  });

  test('a session-sized value is split and joined back', async () => {
    const storage = chunkedStorage(fakeStore());
    const session = JSON.stringify({ access_token: 'x'.repeat(3000), user: { name: 'Señora Ñandú 🚚' } });
    await storage.setItem('k', session);
    expect(await storage.getItem('k')).toBe(session);
  });

  test('no piece breaks a character, even with 4-byte ones everywhere', async () => {
    const storage = chunkedStorage(fakeStore());
    const trucks = '🚚'.repeat(PIECE_LENGTH * 2 + 3);
    await storage.setItem('k', trucks);
    expect(await storage.getItem('k')).toBe(trucks);
  });

  test('a shorter value removes the pieces it no longer needs', async () => {
    const store = fakeStore();
    const storage = chunkedStorage(store);
    await storage.setItem('k', 'a'.repeat(PIECE_LENGTH * 3));
    await storage.setItem('k', 'short');
    expect(store.keys()).toEqual(['k.0', 'k.count']);
  });

  test('removing clears every piece; a missing value reads as null', async () => {
    const store = fakeStore();
    const storage = chunkedStorage(store);
    await storage.setItem('k', 'a'.repeat(PIECE_LENGTH * 2));
    await storage.removeItem('k');
    expect(store.keys()).toEqual([]);
    expect(await storage.getItem('k')).toBeNull();
  });

  test('a half-written value reads as missing, not as a broken one', async () => {
    const store = fakeStore();
    const storage = chunkedStorage(store);
    await storage.setItem('k', 'a'.repeat(PIECE_LENGTH * 2));
    await store.deleteItemAsync('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });
});

describe('sign-in problems', () => {
  test('the form is checked before anything is sent', () => {
    expect(checkSignInForm('', 'pw')).toBe('emailMissing');
    expect(checkSignInForm('   ', 'pw')).toBe('emailMissing');
    expect(checkSignInForm('sam@', 'pw')).toBe('emailInvalid');
    expect(checkSignInForm('sam@yard.example', '')).toBe('passwordMissing');
    expect(checkSignInForm('  sam@yard.example ', 'pw')).toBeNull();
  });

  test('server errors become words the app knows, without revealing if the email exists', () => {
    expect(problemFromAuthError({ name: 'AuthApiError', status: 400, code: 'invalid_credentials' })).toBe('wrongCredentials');
    expect(problemFromAuthError({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' })).toBe('tooManyTries');
    expect(problemFromAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('offline');
    expect(problemFromAuthError({ name: 'AuthApiError', status: 500 })).toBe('unknown');
  });
});
