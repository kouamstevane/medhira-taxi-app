# Suppression de la carte des commandes récentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer la carte « Commandes Récentes » du tableau de bord restaurateur sans modifier les commandes ni leur page dédiée.

**Architecture:** La modification reste localisée au rendu JSX de `src/app/food/portal/[id]/PortalClient.tsx`. Les données `orders` peuvent rester chargées car elles servent au comportement existant et la suppression de la requête serait une optimisation distincte, hors périmètre.

**Tech Stack:** Next.js App Router, React, TypeScript, Jest, React Testing Library.

## Global Constraints

- Conserver l'interface et la route dédiées aux commandes.
- Ne supprimer aucune donnée Firestore.
- Les textes de l'interface restent en français.

---

### Task 1: Retirer le rendu de la carte

**Files:**
- Modify: `C:\Users\User\Documents\AlloTraining\medjira-taxi-app\src\app\food\portal\[id]\PortalClient.tsx`
- Test: `C:\Users\User\Documents\AlloTraining\medjira-taxi-app\src\app\food\portal\[id]\__tests__\PortalClient.test.tsx`

**Interfaces:**
- Consumes: le rendu actuel de `PortalClient`.
- Produces: un dashboard sans le bloc « Commandes Récentes », avec les cartes d'actions et le panneau latéral inchangés.

- [ ] **Step 1: Write the failing test**

Ajouter dans `PortalClient.test.tsx` :

```tsx
it('does not render the redundant recent orders card', async () => {
  render(<PortalClient />);

  await screen.findByText('Chez Medjira');

  expect(screen.queryByText('Commandes Récentes')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --runInBand "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx"
```

Expected: FAIL because the current component renders « Commandes Récentes ».

- [ ] **Step 3: Write minimal implementation**

Supprimer uniquement le bloc JSX commenté `Recent Orders List`, depuis son `<div className="glass-card rounded-3xl ...">` jusqu'à sa fermeture, sans modifier l'appel `FoodDeliveryService.getRestaurantOrders` ni les autres cartes.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
npm test -- --runInBand "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx"
```

Expected: PASS for all tests in the suite.

- [ ] **Step 5: Run static verification**

Run:

```powershell
npx tsc --noEmit
npx eslint "src/app/food/portal/[id]/PortalClient.tsx" "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx"
git diff --check
```

Expected: exit code 0 for each command.

- [ ] **Step 6: Commit**

```powershell
git add "src/app/food/portal/[id]/PortalClient.tsx" "src/app/food/portal/[id]/__tests__/PortalClient.test.tsx"
git commit -m "fix: remove redundant recent orders card"
```
