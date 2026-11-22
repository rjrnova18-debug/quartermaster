/**
 * Access tests against the real Supabase dev project (npm run test:db).
 * Kept apart from `npm test` and from CI: they need the keys in .env and a network.
 *
 * No jest-expo preset here: it loads the React Native test environment, which replaces
 * Node's fetch. These tests talk to a real server, so they run in plain Node and only
 * borrow Expo's Babel preset to read TypeScript.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests-db'],
  transform: { '\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  setupFiles: ['<rootDir>/tests-db/load-env.js'],
  testTimeout: 30000,
};
