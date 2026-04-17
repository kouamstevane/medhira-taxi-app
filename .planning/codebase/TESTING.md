# Testing Patterns

_Last updated: 2026-04-03_

## Summary

Testing is configured with Jest + React Testing Library but coverage is extremely thin. Only the phone registration flow has real tests; all other features (taxi booking, food delivery, driver dashboard, admin, Stripe, chat, VOIP) have zero test coverage. Several test files contain placeholder `TODO` bodies that always pass.

---

## Test Framework

**Runner:** Jest (via `jest.config.cjs`)
- Uses `next/jest` wrapper for Next.js compatibility
- Transform: `@swc/jest` (faster than `babel-jest`)
- Config: `C:\Users\User\Documents\AlloTraining\medjira-taxi-app\jest.config.cjs`

**Test environment:** `jest-environment-jsdom`

**Setup file:** `jest.setup.js` (runs after env is set up — likely imports `@testing-library/jest-dom`)

**Assertion library:** Jest built-in matchers + `@testing-library/jest-dom` (inferred from setup file)

**Path alias:** `@/` → `<rootDir>/src/` in Jest `moduleNameMapper`

**Run commands:**
```bash
npm test                   # Watch mode
npm run test:ci            # CI mode with coverage
npm run test:coverage      # Coverage report only
npm run test:firestore     # Firestore emulator tests (jest.firestore.config.js)
```

---

## Test File Organization

**Location:** Tests are separated from source, not co-located:
```
src/
  __tests__/
    unit/
      validation.test.ts
    integration/
      phone-registration.test.tsx
    e2e/
      e2e-flow.test.tsx
    performance/
      load-testing.test.ts
    security/
      security.test.ts
  services/
    matching/
      __tests__/
        assignment.test.ts    ← only service-level test directory
```

**Naming:** `*.test.ts` and `*.test.tsx` — no `*.spec.*` files found.

---

## Test Structure

**Suite organization** uses `@group` JSDoc tags for documentation but these are not wired to any Jest runner group filtering:
```typescript
/**
 * @group unit
 * @group phone-validation
 */
describe('Validation des numéros de téléphone', () => {
  describe('Cas nominaux - Numéros valides', () => {
    validPhoneNumbers.forEach(({ phone, description }) => {
      test(`devrait accepter ${description}: ${phone}`, () => {
        expect(isValidPhoneNumber(phone)).toBe(true);
      });
    });
  });
});
```

**Lifecycle hooks:**
```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

No `afterAll` or `afterEach` patterns observed.

---

## Mocking

**Firebase is always mocked** — every test file mocks `@/config/firebase` and `firebase/auth`/`firebase/firestore` before any imports:
```typescript
jest.mock('@/config/firebase', () => ({
  auth: { settings: { appVerificationDisabledForTesting: true } },
  db: {},
}));

jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn().mockImplementation(() => ({
    verify: jest.fn().mockResolvedValue('dummy-token'),
    clear: jest.fn(),
  })),
  signInWithPhoneNumber: jest.fn(),
  signInWithCredential: jest.fn(),
  AuthErrorCodes: {
    INVALID_PHONE_NUMBER: 'auth/invalid-phone-number',
    TOO_MANY_REQUESTS: 'auth/too-many-requests',
  },
}));
```

**Next.js router is mocked:**
```typescript
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));
```

**Service mocks:**
```typescript
jest.mock('../../driver.service', () => ({
  getDriverById: jest.fn(),
}));
```

No usage of `msw` (Mock Service Worker) — HTTP-layer mocking is not present.

---

## Coverage

**Targets** (from `test-suite.config.json`):
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

**CI threshold:** Fails below 75% coverage.

**Critical files** designated for coverage (from config):
- `src/lib/validation.ts`
- `src/app/auth/register/RegisterPhoneContent.tsx`
- `src/services/auth.service.ts`
- `src/context/AuthContext.tsx`

**Actual coverage:** Only `src/lib/validation.ts` has genuine tests. The rest of the designated critical files are tested only via placeholder or lightly exercised integration stubs.

**Coverage report:**
```bash
npm run test:coverage
```
Output directory: `test-reports/` (formats: JSON + HTML per config).

---

## What Is Actually Tested

| File | Test File | Quality |
|---|---|---|
| `src/lib/validation.ts` (`isValidPhoneNumber`) | `src/__tests__/unit/validation.test.ts` | Real — 18+ assertions, edge cases, null/undefined |
| Phone registration Firebase flow | `src/__tests__/integration/phone-registration.test.tsx` | Partial — mocks Firebase, tests validation logic |
| Phone registration E2E flow | `src/__tests__/e2e/e2e-flow.test.tsx` | Thin — tests context setup, not real rendering |
| Performance (10/50 concurrent signups) | `src/__tests__/performance/load-testing.test.ts` | Structural — verifies no crash, logs timing |
| Security (rate limiting, brute force) | `src/__tests__/security/security.test.ts` | Observational — logs results, weak assertions |
| `src/services/matching/assignment.ts` | `src/services/matching/__tests__/assignment.test.ts` | Placeholder — all tests are `expect(true).toBe(true)` |

---

## What Is NOT Tested

The following areas have zero test coverage:

- **Taxi booking flow** — `src/app/taxi/`, `src/services/taxi.service.ts`
- **Food delivery** — `src/app/food/`, `src/services/food-delivery.service.ts`
- **Driver dashboard** — `src/app/driver/dashboard/`
- **Admin panel** — `src/app/admin/`
- **Chat** — `src/services/chat.service.ts`, `src/components/ChatModal.tsx`
- **VOIP calling** — `src/services/voip.service.ts`, `src/components/ActiveCallOverlay.tsx`
- **Stripe payments** — `src/services/stripe-payment.service.ts`, `src/services/stripe-connect.service.ts`
- **Wallet** — `src/services/wallet.service.ts`
- **Notifications** — `src/services/notification.service.ts`, `src/services/pushNotifications.service.ts`
- **Driver matching algorithm** — `src/services/matching/` (except placeholder test)
- **All custom hooks** — `src/hooks/` (useVoipCall, useAuth, useDriverTracking, etc.)
- **All UI components** — `src/components/ui/`

---

## Patterns for Adding Tests

**Unit test for a utility function** — follow `src/__tests__/unit/validation.test.ts`:
- Import function directly via `@/lib/...`
- No mocks needed for pure functions
- Use `describe` nesting for grouping: nominal cases, error cases, edge cases
- Use `forEach` over data arrays for parameterized tests

**Integration test for a component** — follow `src/__tests__/integration/phone-registration.test.tsx`:
- Mock Firebase before any imports (`jest.mock` calls at top of file)
- Mock `next/navigation` router
- Use `beforeEach(() => jest.clearAllMocks())`

**Service test** — follow `src/services/matching/__tests__/assignment.test.ts` structure (but implement real assertions):
- Mock `@/config/firebase` and individual Firebase modules
- Mock dependent services with `jest.mock('../otherService')`
- Import the function under test after all mocks are declared

**Firestore emulator tests** use a separate config (`jest.firestore.config.js`) and require Firebase emulators running:
```bash
npm run test:firestore:emulators
```
