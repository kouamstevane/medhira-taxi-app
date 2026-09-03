# Task 3 Report: Secure admin plan updates

## Scope

- Updated `functions/src/personalDriver/adminManagePersonalDriver.ts`.
- Updated `functions/src/personalDriver/__tests__/adminManagePersonalDriver.test.ts`.
- Updated `firestore.rules`.
- Updated `tests/firestore/personal-driver.rules.test.ts`.
- Preserved existing admin operational actions and existing personal driver subscription/trip rules.

## Implementation

- Added callable action payload `{ action: 'updatePlan'; plan: PersonalDriverPlan }`.
- Added result `{ success: true; planId: PersonalDriverPlanId }`.
- Kept writes behind existing server-side authentication and `assertAdminUser` verification.
- Restricted writable plan IDs to fixed IDs `basic`, `classic`, and `premium`.
- Validated Task 3 bounds:
  - name: 1-80 chars
  - badge: 0-80 chars
  - promise: 1-200 chars
  - pricePerKm: 0-1000
  - minimumBillableKm: positive integer up to 100000
  - minimumAmount: 0-1000000
  - allowedWeekdays: 1-7 unique integer weekdays from 0 to 6
  - includedRegularWaitMinutes: 0-1440
  - includedSpecialTrips: 0-100
  - benefits: 1-12 items, each 1-200 chars
- Wrote validated fields to `personal_driver_plans/{plan.id}` with `updatedAt: serverTimestamp()` and `updatedBy: adminUid` using `{ merge: true }`.
- Added `FieldValue.delete()` for an empty optional badge so merge updates can clear a stale badge.
- Added Firestore rules for public reads of `basic`, `classic`, and `premium`, with all client writes denied.

## TDD Evidence

### Callable RED

Command:

```powershell
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/adminManagePersonalDriver.test.ts
```

Observed before implementation:

- Exit code: 1
- Test Suites: 1 failed, 1 total
- Tests: 5 failed, 18 passed, 23 total
- Expected failure: `updatePlan` was rejected as invalid input because the callable union did not include the new action.

Additional RED for merge badge clearing:

- Exit code: 1
- Test Suites: 1 failed, 1 total
- Tests: 1 failed, 23 passed, 24 total
- Expected failure: `clears an empty badge during merge plan updates` showed the merge write omitted `badge` instead of sending the delete sentinel.

### Callable GREEN

Command:

```powershell
npm --prefix functions test -- --runInBand src/personalDriver/__tests__/adminManagePersonalDriver.test.ts
```

Observed after implementation:

- Exit code: 0
- Test Suites: 1 passed, 1 total
- Tests: 24 passed, 24 total
- Snapshots: 0 total
- Time: 30.083 s

### Firestore Emulator RED Attempt

Command:

```powershell
firebase emulators:exec --project medjira-taxi-test --only firestore "npx jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand"
```

Observed before rules implementation:

- Output reached `i  emulators: Starting emulators: firestore` and `i  firestore: downloading cloud-firestore-emulator-v1.20.4.jar...`.
- It stayed on the emulator jar download with no completion after roughly 60 seconds.
- It was interrupted with Ctrl-C.
- Exit code: 1.

### Firestore Emulator GREEN Attempt

Command:

```powershell
firebase emulators:exec --project medjira-taxi-test --only firestore "npx jest --config jest.firestore.config.js tests/firestore/personal-driver.rules.test.ts --runInBand"
```

Observed after rules implementation:

- Output reached `i  emulators: Starting emulators: firestore` and `i  firestore: downloading cloud-firestore-emulator-v1.20.4.jar...`.
- It stayed on the emulator jar download with no new output after roughly 90 seconds.
- It was interrupted with Ctrl-C.
- Exit code: 1.
- Blocker: `cloud-firestore-emulator-v1.20.4.jar` did not finish downloading, so Jest did not execute the Firestore rules test file.

### Build Check

Command:

```powershell
npm --prefix functions run build
```

Observed after implementation:

- Exit code: 0
- Output included `> build` and `> tsc`.

### Review Fix RED

Command:

```powershell
npx jest --roots src/services/personal-driver --runTestsByPath src/services/personal-driver/plan-config.service.test.ts --runInBand --watch=false
```

Observed before loader implementation:

- Exit code: 1
- Test Suites: 1 failed, 1 total
- Tests: 4 failed, 1 passed, 5 total
- Expected failure: the updated client loader test required three direct `doc(db, 'personal_driver_plans', id)` / `getDoc(...)` reads for `basic`, `classic`, and `premium`, but the loader still used `getDocs(collection(...))`, so `mockDoc` was called `0` times.

### Review Fix GREEN

Implementation:

- Updated `src/services/personal-driver/plan-config.service.ts` to fetch only the fixed plan document IDs with `getDoc(doc(db, 'personal_driver_plans', planId))`.
- Preserved existing missing-document and invalid-document behavior by normalizing each fixed ID independently and falling back to its static plan when needed.
- Preserved existing read-failure behavior by returning cloned static plans with `source: 'fallback'` and the thrown error.
- Preserved clone isolation for returned plans and static defaults.

Command:

```powershell
npx jest --roots src/services/personal-driver --runTestsByPath src/services/personal-driver/plan-config.service.test.ts src/services/personal-driver/pricing.service.test.ts --runInBand --watch=false
```

Observed after implementation:

- Exit code: 0
- Test Suites: 2 passed, 2 total
- Tests: 10 passed, 10 total
- Snapshots: 0 total
- Time: 4.604 s
- Firestore emulator was not run for this review fix because the emulator JAR download blocker is already documented and the review fix only requested focused plan-config/pricing Jest coverage.

## Concerns

- Firestore emulator verification did not reach GREEN because the emulator jar download timed out/stalled.
- No long-running emulator process was found afterward; process inspection only found the inspection command itself.
- Existing unrelated modification `.superpowers/sdd/task-2-report.md` was present before Task 3 work and was left untouched.
