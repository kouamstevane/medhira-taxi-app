# Masquer les cartes d’action du portail restaurant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Masquer les cartes « Gérer le Menu » et « Commandes » du dashboard restaurant sur mobile et tablette, tout en les conservant sur desktop.

**Architecture:** Le bloc de cartes existant dans `PortalClient` reçoit les classes responsive Tailwind `hidden lg:grid`. Les cartes restent dans le DOM et conservent leurs routes ; seul leur affichage change selon la largeur. Le test Jest du portail vérifie la présence de ces classes sur le conteneur des cartes.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, Jest, React Testing Library.

## Global Constraints

- Les cartes doivent être masquées sous le breakpoint Tailwind `lg` (≥ 1024 px).
- Les entrées « Menu » et « Commandes » de la navbar restent inchangées.
- Les routes, les droits d’accès, les statistiques et les commandes récentes restent inchangés.
- Le code et les commentaires restent en anglais ; les textes UI restent en français.
- Aucun commentaire de code ne doit être ajouté.

---

### Task 1: Ajouter le test responsive du bloc d’actions

**Files:**
- Modify: `src/app/food/portal/[id]/__tests__/PortalClient.test.tsx`
- Test: `src/app/food/portal/[id]/__tests__/PortalClient.test.tsx`

**Interfaces:**
- Consumes: le rendu existant de `PortalClient` et les libellés « Gérer le Menu » / « Commandes ».
- Produces: une assertion stable sur les classes responsive du conteneur des deux cartes.

- [ ] **Step 1: Write the failing test**

Ajouter ce test après les tests existants :

```tsx
it('hides dashboard action cards below the desktop breakpoint', async () => {
  render(<PortalClient />);

  const menuCard = await screen.findByText('Gérer le Menu');
  const actionGrid = menuCard.closest('div.grid');

  expect(actionGrid).toHaveClass('hidden', 'lg:grid');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- --runInBand src/app/food/portal/[id]/__tests__/PortalClient.test.tsx -t "hides dashboard action cards below the desktop breakpoint"
```

Expected: FAIL because the current action grid has `grid grid-cols-1 sm:grid-cols-2` but does not yet have `hidden lg:grid`.

### Task 2: Appliquer le masquage responsive minimal

**Files:**
- Modify: `src/app/food/portal/[id]/PortalClient.tsx:187`

**Interfaces:**
- Consumes: le test responsive de Task 1.
- Produces: un bloc d’actions rendu uniquement à partir du breakpoint `lg`.

- [ ] **Step 1: Write the minimal implementation**

Modifier uniquement la classe du conteneur des deux cartes :

```tsx
<div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-4">
```

Conserver les deux cartes, leurs handlers `router.push(...)`, leurs textes et toutes les autres sections du dashboard inchangés.

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
npm test -- --runInBand src/app/food/portal/[id]/__tests__/PortalClient.test.tsx
```

Expected: PASS for all `PortalClient` tests.

- [ ] **Step 3: Run formatting and type-oriented checks**

Run:

```bash
npm run lint
```

Expected: the lint command completes without errors attributable to this change.

### Task 3: Verify the responsive UI in the browser

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the updated `PortalClient` dashboard at `/food/portal/?restaurantId=ESbHSzTG8nFO4mN3EqpB`.
- Produces: visual confirmation for mobile/tablet/desktop and a clean browser console.

- [ ] **Step 1: Start or reuse the development server**

Run `npm run dev` if the existing localhost server is not available, then open the restaurant portal URL.

- [ ] **Step 2: Check mobile and tablet widths**

At widths below 1024 px, verify that « Gérer le Menu » and the dashboard card « Commandes » are not visible, while the bottom navbar still shows « Menu » and « Commandes ».

- [ ] **Step 3: Check desktop width**

At width 1024 px or wider, verify that both dashboard cards are visible and still navigate to their existing routes when activated.

- [ ] **Step 4: Check browser console**

Confirm that no new JavaScript errors appear on the portal page.

### Task 4: Review the final diff

**Files:**
- Review: `src/app/food/portal/[id]/PortalClient.tsx`
- Review: `src/app/food/portal/[id]/__tests__/PortalClient.test.tsx`

- [ ] **Step 1: Inspect the diff**

Run:

```bash
git diff --check
git diff -- src/app/food/portal/[id]/PortalClient.tsx src/app/food/portal/[id]/__tests__/PortalClient.test.tsx
```

Expected: only the responsive class and the focused regression test are changed.

- [ ] **Step 2: Commit the implementation**

Run:

```bash
git add -- src/app/food/portal/[id]/PortalClient.tsx src/app/food/portal/[id]/__tests__/PortalClient.test.tsx
git commit -m "fix: hide redundant restaurant portal actions on mobile"
```
