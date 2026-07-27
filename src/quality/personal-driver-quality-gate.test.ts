import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type PackageJson = {
  scripts?: Record<string, string>;
};

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8')) as PackageJson;
}

describe('Personal Driver quality gate configuration', () => {
  it('defines fast, complete scripts for the app and Personal Driver feature', () => {
    const rootPackage = readPackageJson('package.json');

    expect(rootPackage.scripts).toMatchObject({
      lint: 'eslint .',
      'lint:personal-driver':
        'eslint src/app/personal-driver src/services/personal-driver src/quality e2e/personal-driver-quality.spec.ts e2e/personal-driver-v1.spec.ts e2e/helpers/personal-driver-fixtures.ts playwright.personal-driver.config.ts',
      typecheck: 'node scripts/clean-next-dev-cache.mjs && tsc --noEmit',
      'test:personal-driver': 'jest src/app/personal-driver src/services/personal-driver --runInBand',
      'test:personal-driver:e2e': 'playwright test --config=playwright.personal-driver.config.ts',
      'test:personal-driver:firestore':
        'firebase emulators:exec --project medjira-taxi-test --only firestore "jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand"',
      'test:quality-gate': 'jest src/quality --runInBand',
      'quality:personal-driver':
        'npm run lint:personal-driver && npm run typecheck && npm run test:quality-gate && npm run test:personal-driver && npm --prefix functions run test:personal-driver && npm run test:personal-driver:firestore && npm run test:personal-driver:e2e && npm run build && npm --prefix functions run build',
    });
  });

  it('defines a dedicated backend Personal Driver test script', () => {
    const functionsPackage = readPackageJson('functions/package.json');

    expect(functionsPackage.scripts).toMatchObject({
      test: 'jest',
      'test:personal-driver': 'jest src/personalDriver/__tests__ --runInBand',
      quality: 'npm run build && npm run test:personal-driver',
    });
  });

  it('keeps CI, E2E, and acceptance documentation wired to Personal Driver', () => {
    expect(existsSync(join(process.cwd(), 'playwright.personal-driver.config.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'e2e/personal-driver-quality.spec.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), '.github/workflows/personal-driver-quality.yml'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'docs/quality/personal-driver-quality-gate.md'))).toBe(true);
  });
});
