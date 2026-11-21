import fs from 'node:fs';

// The generator is a plain Node script; the test imports its pure function.
const { catalogSql, findMigration, readCatalog } = require('../scripts/gen-catalog-sql.js');

describe('catalog migration (generated from questions.json)', () => {
  const catalog = readCatalog();

  test('a migration exists for the current catalog version', () => {
    expect(findMigration(catalog.version)).not.toBeNull();
  });

  test('the migration is up to date with questions.json (run npm run gen:catalog)', () => {
    const onDisk = fs.readFileSync(findMigration(catalog.version), 'utf8');
    expect(onDisk.replace(/\r\n/g, '\n')).toBe(catalogSql(catalog));
  });

  test('quotes inside labels are escaped', () => {
    const sql = catalogSql({ ...catalog, unitTypes: [{ code: 'UT9', label: { en: "Driver's", es: 'x' }, groups: [] }] });
    expect(sql).toContain("'Driver''s'");
  });
});
