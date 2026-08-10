# Restaurant Registration Shared Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmoniser les champs et les actions visuelles des quatre étapes du parcours d’inscription restaurateur avec les composants et styles de formulaire partagés existants.

**Architecture:** Conserver les états contrôlés et les callbacks actuels du wizard. Remplacer uniquement les contrôles natifs des étapes 1 et 3 par `InputField`/`TextAreaField`, appliquer les classes d’onboarding partagées aux contrôles horaires et aux CTA de l’étape 4, et laisser l’étape 2 utiliser son `OTPInput` déjà partagé.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Jest 30, React Testing Library.

## Global Constraints

- Le périmètre reste limité à `src/app/restaurant/register/components/Step1Account.tsx`, `Step2EmailVerification.tsx`, `Step3Restaurant.tsx`, `Step4Hours.tsx` et aux composants/tests partagés directement nécessaires.
- La logique Firebase, Google Maps, les validations métier, les modèles `Step1Data`/`Step3Data`/`Step4Data`, les brouillons et la navigation ne changent pas.
- Le code et les noms de tests restent en anglais ; les textes d’interface restent en français.
- Aucun commentaire nouveau ne doit être ajouté dans le code applicatif.
- Chaque changement de comportement ou de composant doit suivre RED → GREEN → REFACTOR avec un test qui échoue avant l’implémentation.
- Ne pas ajouter de dépendance.

## File Map

- Modify: `src/components/forms/TextAreaField.tsx` — aligner le rendu et l’accessibilité du textarea sur `InputField`.
- Create: `src/components/forms/__tests__/TextAreaField.test.tsx` — contrat visuel et liaison label/textarea du composant partagé.
- Modify: `src/app/restaurant/register/components/Step1Account.tsx` — migrer les cinq champs et les CTA vers les composants/styles partagés.
- Create: `src/app/restaurant/register/components/__tests__/Step1Account.test.tsx` — vérifier les champs partagés et la validation existante de l’étape 1.
- Modify: `src/app/restaurant/register/components/Step3Restaurant.tsx` — migrer les champs texte et les CTA sans toucher à l’adresse, au géocodage ou aux cuisines.
- Create: `src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx` — vérifier les champs partagés, les chips de cuisine et les CTA de l’étape 3.
- Modify: `src/app/restaurant/register/components/Step4Hours.tsx` — appliquer les styles partagés aux heures et aux actions de navigation/soumission.
- Create: `src/app/restaurant/register/components/__tests__/Step4Hours.test.tsx` — vérifier les styles partagés et la validation “au moins un jour ouvert”.
- Inspect only: `src/app/restaurant/register/components/Step2EmailVerification.tsx` — confirmer que `OTPInput` est déjà partagé et qu’aucun champ natif ne doit être migré.

### Task 1: Align the shared TextAreaField component

**Files:**
- Modify: `src/components/forms/TextAreaField.tsx`
- Create: `src/components/forms/__tests__/TextAreaField.test.tsx`

**Interfaces:**
- Consumes: existing `TextAreaFieldProps`, including `label`, `error`, `helperText`, `id`, `value`, `showCharCount`, and `maxLength`.
- Produces: a textarea with the same visual hooks as `InputField`, a label associated with the textarea id, and unchanged controlled-value/character-count behavior.

- [ ] **Step 1: Write the failing test**

Create `src/components/forms/__tests__/TextAreaField.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { TextAreaField } from '../TextAreaField';

describe('TextAreaField', () => {
  it('uses the shared dark field chrome and associates its label', () => {
    render(
      <TextAreaField
        id="description"
        label="Description"
        helperText="Helper copy"
        data-testid="description-field"
      />
    );

    expect(screen.getByLabelText('Description')).toBe(screen.getByTestId('description-field'));
    expect(screen.getByTestId('description-field')).toHaveClass('glass-input');
    expect(screen.getByTestId('description-field')).toHaveClass('autofill-dark');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:ring-2');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByTestId('description-field')).toHaveClass('focus:border-[#f29200]');
    expect(screen.getByTestId('description-field')).toHaveClass('rounded-xl');
    expect(screen.getByText('Helper copy')).toHaveClass('text-slate-400');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/forms/__tests__/TextAreaField.test.tsx --runInBand`

Expected: FAIL because the current textarea does not expose the shared `glass-input`/`autofill-dark` contract and its label is not linked with `htmlFor`.

- [ ] **Step 3: Implement the minimal shared styling/accessibility change**

In `TextAreaField.tsx`:

1. Import `cn` and the shared label/error/helper class names from `driverOnboardingStyles`.
2. Generate an id with `React.useId()` when `id` is not provided.
3. Render `<label htmlFor={textareaId}>` with `driverFieldLabelClassName`.
4. Set the textarea classes to the shared dark chrome, preserving a larger multiline height:

```tsx
const baseTextAreaClasses =
  'glass-input autofill-dark w-full min-h-28 rounded-xl border border-white/[0.08] bg-[#1A1A1A] px-4 py-3 font-sans text-base text-white placeholder:text-[#4B5563] outline-none resize-y shadow-sm transition-all duration-200 focus:border-[#f29200] focus:ring-2 focus:ring-[#f29200] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-[#4B5563]';
```

5. Use the shared error/helper classes while preserving `showCharCount`, `maxLength`, and `value`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/forms/__tests__/TextAreaField.test.tsx --runInBand`

Expected: PASS with one test suite and one test passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/forms/TextAreaField.tsx src/components/forms/__tests__/TextAreaField.test.tsx
git commit -m "refactor: align shared textarea field styling"
```

### Task 2: Migrate restaurant account fields in Step 1

**Files:**
- Modify: `src/app/restaurant/register/components/Step1Account.tsx`
- Create: `src/app/restaurant/register/components/__tests__/Step1Account.test.tsx`

**Interfaces:**
- Consumes: unchanged `Step1AccountProps`, `Step1Data`, `onSubmit`, `onGoogleSignIn`, `loading`, and external error handling.
- Produces: five `InputField` instances with the existing ids, labels, placeholders, controlled values, required states, and autocomplete attributes; shared primary/secondary CTA styling.

- [ ] **Step 1: Write the failing test**

Create a test that renders the component without Google sign-in and checks the shared field contract:

```tsx
import { render, screen } from '@testing-library/react';
import { Step1Account } from '../Step1Account';

describe('Step1Account', () => {
  it('uses shared field and primary action styling for account creation', () => {
    render(<Step1Account onSubmit={jest.fn()} loading={false} error={null} />);

    expect(screen.getByLabelText('Prénom')).toHaveClass('autofill-dark');
    expect(screen.getByLabelText('Nom')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
    expect(screen.getByLabelText('Mot de passe')).toHaveClass('glass-input');
    expect(screen.getByLabelText('Téléphone (optionnel)')).toHaveClass('h-14');
    expect(screen.getByRole('button', { name: /Créer le compte et continuer/i })).toHaveClass('from-[#f29200]');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step1Account.test.tsx --runInBand`

Expected: FAIL because the current controls are native inputs without the shared `InputField` chrome and the submit button does not use `driverPrimaryButtonClassName`.

- [ ] **Step 3: Implement the minimal migration**

In `Step1Account.tsx`:

1. Import `InputField`, `cn`, `driverPrimaryButtonClassName`, and `driverSecondaryButtonClassName`.
2. Replace each native account input with `InputField`, preserving its controlled `value`/`onChange`, `id`, `type`, `placeholder`, `required`, `aria-required`, `autoComplete`, and `minLength` props.
3. Keep the two-column wrapper for first name/last name and pass `containerClassName="min-w-0"` so the shared field remains usable in the grid.
4. Apply `cn(driverSecondaryButtonClassName, '...')` to the Google button and `cn(driverPrimaryButtonClassName, 'mt-6')` to the submit button, preserving loading content and accessible names.
5. Do not change `handleSubmit` or its validation messages.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step1Account.test.tsx --runInBand`

Expected: PASS with one test suite and one test passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/restaurant/register/components/Step1Account.tsx src/app/restaurant/register/components/__tests__/Step1Account.test.tsx
git commit -m "refactor: use shared fields in restaurant account step"
```

### Task 3: Migrate restaurant information fields in Step 3

**Files:**
- Modify: `src/app/restaurant/register/components/Step3Restaurant.tsx`
- Create: `src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx`

**Interfaces:**
- Consumes: unchanged `Step3RestaurantProps`, `Step3Data`, `AddressInput`, `PlaceSuggestion`, Google Maps callbacks, cuisine toggling, and geocoding behavior.
- Produces: shared `InputField` instances for name, phone, email, and average price; shared `TextAreaField` for description; shared navigation CTA classes.

- [ ] **Step 1: Write the failing test**

Create the test with a mock for `useGoogleMaps` returning `{ autocompleteService: null }` and a presentational `AddressInput` mock that preserves the `Adresse du restaurant` label. Verify:

```tsx
it('uses shared fields and navigation actions', () => {
  render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

  expect(screen.getByLabelText('Nom du restaurant')).toHaveClass('glass-input');
  expect(screen.getByLabelText('Description')).toHaveClass('focus:ring-[#f29200]');
  expect(screen.getByLabelText('Téléphone')).toHaveClass('h-14');
  expect(screen.getByLabelText('Email')).toHaveClass('rounded-xl');
  expect(screen.getByLabelText(/Prix moyen par personne/i)).toHaveClass('autofill-dark');
  expect(screen.getByRole('button', { name: /Retour à l'étape précédente/i })).toHaveClass('border-white/10');
  expect(screen.getByRole('button', { name: /Continuer aux horaires/i })).toHaveClass('from-[#f29200]');
});

it('keeps cuisine choices as pressed toggle buttons', () => {
  render(<Step3Restaurant onNext={jest.fn()} onBack={jest.fn()} loading={false} />);

  const cuisine = screen.getByRole('button', { name: 'Pizza' });
  expect(cuisine).toHaveAttribute('aria-pressed', 'false');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx --runInBand`

Expected: FAIL because the current text controls are native inputs/textarea and the navigation buttons do not expose the shared CTA classes.

- [ ] **Step 3: Implement the minimal migration**

In `Step3Restaurant.tsx`:

1. Import `InputField`, `TextAreaField`, `cn`, `driverPrimaryButtonClassName`, and `driverSecondaryButtonClassName`.
2. Replace `restName`, `restPhone`, `restEmail`, and `avgPrice` with `InputField`, keeping all current state handlers, types, ids, placeholders, and numeric constraints.
3. Replace `restDesc` with `TextAreaField`, keeping its controlled value, placeholder, required state, id, and `min-h` behavior through the shared component.
4. Leave `AddressInput`, `handleAddressSelect`, `handleLocationResolved`, `geocodeAddress`, and `handleSubmit` unchanged.
5. Apply shared secondary/primary CTA classes to Retour and Continuer while preserving their flex proportions, loading state, and aria-labels.
6. Keep cuisine buttons and their `aria-pressed` state unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx --runInBand`

Expected: PASS with both tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/restaurant/register/components/Step3Restaurant.tsx src/app/restaurant/register/components/__tests__/Step3Restaurant.test.tsx
git commit -m "refactor: use shared fields in restaurant details step"
```

### Task 4: Align opening-hours controls and complete the step audit

**Files:**
- Modify: `src/app/restaurant/register/components/Step4Hours.tsx`
- Create: `src/app/restaurant/register/components/__tests__/Step4Hours.test.tsx`
- Inspect only: `src/app/restaurant/register/components/Step2EmailVerification.tsx`

**Interfaces:**
- Consumes: unchanged `Step4Data`, `RESTAURANT_DAYS`, controlled hours state, `onSubmit`, `onBack`, and closed-day validation.
- Produces: shared field chrome for opening/closing time inputs and shared CTA styling; Step 2 remains on the existing shared `OTPInput` contract.

- [ ] **Step 1: Write the failing test**

Create a test that renders Step 4 and checks the first open day’s time inputs and actions:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { Step4Hours } from '../Step4Hours';

describe('Step4Hours', () => {
  it('uses shared field and navigation styling', () => {
    render(<Step4Hours onSubmit={jest.fn()} onBack={jest.fn()} loading={false} />);

    expect(screen.getByLabelText('Lundi ouverture')).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByLabelText('Lundi fermeture')).toHaveClass('rounded-xl');
    expect(screen.getByRole('button', { name: /Retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /Soumettre votre dossier/i })).toHaveClass('from-[#f29200]');
  });

  it('rejects a schedule with every day closed', () => {
    render(<Step4Hours onSubmit={jest.fn()} onBack={jest.fn()} loading={false} />);

    screen.getAllByRole('checkbox').forEach((checkbox) => {
      if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    });
    fireEvent.click(screen.getByRole('button', { name: /Soumettre votre dossier/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Au moins un jour doit être ouvert.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step4Hours.test.tsx --runInBand`

Expected: FAIL because the time inputs use local `glass-input` classes and the CTA buttons do not use the shared primary/secondary classes.

- [ ] **Step 3: Implement the minimal migration**

In `Step4Hours.tsx`:

1. Import `cn`, `driverFieldClassName`, `driverPrimaryButtonClassName`, and `driverSecondaryButtonClassName` from `driverOnboardingStyles`.
2. Change both time input class names to `cn(driverFieldClassName, 'min-w-0 text-sm')` while preserving their labels, values, and change handlers.
3. Apply `driverSecondaryButtonClassName` to Retour and `driverPrimaryButtonClassName` to Soumettre, preserving the current flex proportions, loading text, icons, and aria-labels.
4. Keep the closed-day checkbox behavior, default hours, and “at least one open day” validation unchanged.
5. Confirm Step 2 requires no migration: it contains no native text/form fields and already delegates code entry to shared `OTPInput`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/restaurant/register/components/__tests__/Step4Hours.test.tsx --runInBand`

Expected: PASS with both tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/restaurant/register/components/Step4Hours.tsx src/app/restaurant/register/components/__tests__/Step4Hours.test.tsx
git commit -m "refactor: align restaurant opening hours controls"
```

### Task 5: Run the complete verification suite

**Files:**
- No source changes expected; inspect the diff and existing user changes before running checks.

- [ ] **Step 1: Run all targeted tests together**

Run:

```bash
npx jest src/components/forms/__tests__/TextAreaField.test.tsx src/components/forms/__tests__/InputField.test.tsx src/app/restaurant/register/components/__tests__ --runInBand
```

Expected: all targeted suites pass with zero failures.

- [ ] **Step 2: Run type checking**

Run: `npm run typecheck`

Expected: TypeScript exits with code 0 and reports no errors.

- [ ] **Step 3: Run linting on the changed application files**

Run:

```bash
npx eslint src/components/forms/TextAreaField.tsx src/components/forms/__tests__/TextAreaField.test.tsx src/app/restaurant/register/components/Step1Account.tsx src/app/restaurant/register/components/Step3Restaurant.tsx src/app/restaurant/register/components/Step4Hours.tsx src/app/restaurant/register/components/__tests__
```

Expected: ESLint exits with code 0.

- [ ] **Step 4: Inspect the final diff and status**

Run: `git diff --stat; git diff --check; git status --short`

Expected: the working-tree diff contains only intentional uncommitted changes, `git diff --check` emits no whitespace errors, and unrelated existing user changes are preserved.

- [ ] **Step 5: Run the production build if targeted checks are clean**

Run: `npm run build`

Expected: Next.js production build exits with code 0.
