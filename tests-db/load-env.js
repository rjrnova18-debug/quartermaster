/** Loads .env for the access tests and stops early with a clear message if a key is missing. */
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

// Jest gives each test file its own copy of process.env, so process.loadEnvFile() would
// fill the wrong one. Parse the file and copy the values into the copy the tests see.
const file = path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) {
  Object.assign(process.env, parseEnv(fs.readFileSync(file, 'utf8')));
}

for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name} in .env (see .env.example)`);
  }
}
