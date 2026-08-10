# Task 1 Report: Align the shared TextAreaField component

## Result

Implemented and committed Task 1 in the requested worktree.

## Changes

- Updated `src/components/forms/TextAreaField.tsx` to:
  - import `cn` and the shared driver onboarding label, error, and helper classes;
  - generate a fallback textarea id with `React.useId()`;
  - associate the label with the textarea using `htmlFor`;
  - apply the shared dark field chrome, including `glass-input`, `autofill-dark`, multiline sizing, rounded borders, and orange focus states;
  - preserve controlled `value`, `maxLength`, `showCharCount`, error rendering, helper rendering, disabled state, and custom classes.
- Added `src/components/forms/__tests__/TextAreaField.test.tsx` covering the shared field chrome, label association, and helper text styling.

## TDD Evidence

### RED

Command:

```
npx jest src/components/forms/__tests__/TextAreaField.test.tsx --runInBand
```

The test failed as expected because the existing label had no `htmlFor` association and the textarea did not include the shared `glass-input` and `autofill-dark` classes. Result: 1 failed test.

### GREEN

Command:

```
npx jest src/components/forms/__tests__/TextAreaField.test.tsx --runInBand
```

Result: 1 suite passed, 1 test passed.

### Regression

Command:

```
npx jest src/components/forms/__tests__/InputField.test.tsx src/components/forms/__tests__/TextAreaField.test.tsx --runInBand
```

Result: 2 suites passed, 2 tests passed.

Additional verification:

- `git diff --check`: passed with no whitespace errors.
- Self-review confirmed the implementation was limited to the requested component and test before commit.

## Commit

`3a06940 refactor: align shared textarea field styling`

## Review Fix

- Updated `src/components/forms/TextAreaField.tsx` to combine `driverFieldLabelClassName` with the `block` class, matching `InputField` so the shared `mb-2` label spacing applies.
- Updated `src/components/forms/__tests__/TextAreaField.test.tsx` to assert the label has the `block` class.

Command:

```
npx jest src/components/forms/__tests__/TextAreaField.test.tsx src/components/forms/__tests__/InputField.test.tsx --runInBand
```

Actual output:

```
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        6.168 s
Ran all test suites matching src/components/forms/__tests__/TextAreaField.test.tsx|src/components/forms/__tests__/InputField.test.tsx.
```
