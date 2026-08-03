# Refonte UX du panneau de détails chauffeur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Transformer le drawer de détails chauffeur en une interface de vérification dense, responsive et orientée décision, sans modifier les données ni les actions métier.

**Architecture:** Extraire le drawer de `src/app/admin/drivers/page.tsx` vers un composant `DriverDetailsDrawer` qui reçoit le chauffeur sélectionné, les données privées et les callbacks existants. Conserver la logique Firebase et l’état de liste dans la page, puis remplacer le markup actuel par un en-tête compact, un résumé, des sections denses, une galerie de miniatures et un footer d’action sticky.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind CSS v4, `next/image`, Jest, navigateur local via Playwright.

## Global Constraints

- Code et commentaires en anglais ; textes de l’interface en français.
- Ne pas modifier le modèle Firestore, les règles d’accès, les URLs de documents ni les callbacks d’action existants.
- Mobile : drawer pleine largeur, padding `p-4`, documents en 2 colonnes, footer d’action compact.
- Desktop : drawer `max-w-2xl`, padding `p-6`, documents en 3 colonnes.
- Les documents administratifs utilisent `object-contain`; seule la photo de profil peut utiliser `object-cover`.
- Conserver les états de chargement/désactivation et respecter `prefers-reduced-motion`.

## File Map

- Create: `src/components/admin/DriverDetailsDrawer.tsx` — rendu du drawer, sections d’information, galerie et actions.
- Modify: `src/app/admin/drivers/page.tsx:1-30` — importer le composant et ses types, retirer `Image` si devenu inutilisé.
- Modify: `src/app/admin/drivers/page.tsx:669-889` — remplacer le markup inline par `DriverDetailsDrawer` et transmettre les callbacks/états.
- Create: `src/components/admin/DriverDetailsDrawer.test.tsx` — tests de rendu ciblés du drawer et de sa densité fonctionnelle.
- Verify: `npm run typecheck`, `npx jest src/components/admin/DriverDetailsDrawer.test.tsx --runInBand`, `npm run lint`.

### Task 1: Créer le composant de drawer isolé

**Files:**
- Create: `src/components/admin/DriverDetailsDrawer.tsx`

**Interfaces:**

```ts
import type { Driver } from '@/app/admin/drivers/page';
import type { DriverPrivate } from '@/types/firestore-collections';

export interface DriverDetailsDrawerProps {
  driver: Driver;
  privateData: DriverPrivate | null;
  rejectionReason: string;
  processing: boolean;
  onClose: () => void;
  onRejectionReasonChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onDelete: () => void;
  getStatusBadge: (status: Driver['status']) => React.ReactNode;
}

export function DriverDetailsDrawer(props: DriverDetailsDrawerProps): React.ReactElement;
```

- [ ] **Step 1: Ajouter les types et helpers de présentation.**

  Définir localement `DetailField` et `DocumentThumbnail`. Le helper `getDocumentUrl` doit accepter une valeur chaîne ou un objet `{ url?: string }`, retourner `undefined` pour les valeurs vides et ne jamais exposer les données privées ailleurs que dans le rendu du composant.

- [ ] **Step 2: Construire le shell responsive.**

  Utiliser la structure suivante :

  ```tsx
  <div className="fixed inset-0 z-50 flex items-center justify-end">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
    <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-[#0d0d0d]">
      <header className="shrink-0 border-b border-white/5 bg-[#0d0d0d]/90 p-4 backdrop-blur-xl sm:p-6">
        {/* compact identity */}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {/* summary and sections */}
      </div>
      <footer className="shrink-0 border-t border-white/10 bg-[#0d0d0d]/95 p-3 backdrop-blur-xl sm:p-4">
        {/* decision actions */}
      </footer>
    </aside>
  </div>
  ```

  Ajouter `aria-label="Fermer les détails du chauffeur"` au bouton de fermeture, `role="dialog"`, `aria-modal="true"` et un titre relié par `aria-labelledby`.

- [ ] **Step 3: Ajouter le header et le résumé.**

  Garder le nom, les initiales, le badge de statut, l’identifiant tronqué et le bouton de fermeture. Sous l’en-tête, afficher une grille compacte de trois cellules : type de profil, date de candidature et nombre de documents ayant une URL. La date doit reprendre le même format français déjà utilisé dans la table ; le calcul ne doit pas modifier `createdAt`.

- [ ] **Step 4: Ajouter les sections Profil et Véhicule.**

  Réutiliser exactement les champs existants. Utiliser une grille `grid-cols-2 gap-x-5 gap-y-4`, avec `sm:grid-cols-3` pour les champs du véhicule. Les champs email et adresse reçoivent `col-span-2 sm:col-span-1` afin d’éviter les débordements sur 455 px. Les valeurs vides continuent d’afficher `N/A`, `Non renseigné` ou `Non renseignée` selon le champ actuel.

- [ ] **Step 5: Ajouter la galerie compacte.**

  Rendre uniquement les documents dont l’URL existe. Utiliser `grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4`. La vignette doit avoir `h-24 sm:h-32`, `rounded-xl`, une bordure fine et un fond légèrement contrasté. Utiliser `object-contain p-1` pour les pièces et `object-cover` seulement quand `id === 'biometricPhoto'`. Conserver le lien vers l’URL, l’alt text français et l’indication « Agrandir ». Le message vide reste visible quand aucun document n’est disponible.

- [ ] **Step 6: Ajouter le footer d’action.**

  Pour `driver.status === 'pending'`, afficher l’aide de validation, un bouton primaire d’approbation et un champ de refus avec bouton secondaire. Les callbacks doivent être appelés exactement une fois par clic. Pour les autres statuts, conserver les boutons de suspension/réactivation et suppression dans une grille compacte. Ne pas déplacer la logique de modal de suspension ou de suppression : appeler les callbacks fournis par la page.

- [ ] **Step 7: Respecter l’animation et le focus.**

  Conserver la classe d’entrée existante sur le drawer seulement si elle ne provoque pas de débordement. Ajouter `motion-reduce:animate-none` et des styles `focus-visible` sur les contrôles.

- [ ] **Step 8: Vérifier le composant isolé.**

  Run: `npx jest src/components/admin/DriverDetailsDrawer.test.tsx --runInBand`

  Expected: le test n’existe pas encore et échoue avant l’étape suivante.

### Task 2: Ajouter les tests de comportement visuel et d’action

**Files:**
- Create: `src/components/admin/DriverDetailsDrawer.test.tsx`
- Modify: `src/components/admin/DriverDetailsDrawer.tsx`

**Interfaces:** Le test monte `DriverDetailsDrawer` avec un `Driver` minimal, des documents privés contenant une chaîne URL et un objet `{ url }`, puis des callbacks Jest.

- [ ] **Step 1: Écrire les tests qui couvrent le contrat utilisateur.**

  Ajouter au minimum :

  ```tsx
  it('renders a compact summary and all available document thumbnails', () => {
    render(<DriverDetailsDrawer {...pendingProps} />);
    expect(screen.getByText('Documents disponibles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Photo de profil Agrandir' })).toHaveAttribute('href', photoUrl);
    expect(screen.getByRole('link', { name: 'Permis (Recto) Agrandir' })).toHaveAttribute('href', licenseUrl);
  });

  it('keeps approval and rejection actions connected to their callbacks', async () => {
    const user = userEvent.setup();
    render(<DriverDetailsDrawer {...pendingProps} />);
    await user.click(screen.getByRole('button', { name: 'Approuver le profil' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await user.type(screen.getByRole('textbox', { name: 'Motif détaillé du refus...' }), 'Document incomplet');
    await user.click(screen.getByRole('button', { name: "Refuser l'inscription" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
  ```

  Vérifier aussi le message vide lorsque `privateData.documents` est absent et l’existence du nom accessible du bouton de fermeture.

- [ ] **Step 2: Exécuter les tests pour confirmer l’échec attendu.**

  Run: `npx jest src/components/admin/DriverDetailsDrawer.test.tsx --runInBand`

  Expected: FAIL uniquement si le markup ou les noms accessibles ne sont pas encore présents ; aucun test ne doit échouer pour une erreur de configuration Jest.

- [ ] **Step 3: Ajuster le composant jusqu’au passage.**

  Corriger les noms accessibles, la résolution des URLs et les classes sans introduire de logique Firebase dans le composant.

- [ ] **Step 4: Exécuter les tests ciblés.**

  Run: `npx jest src/components/admin/DriverDetailsDrawer.test.tsx --runInBand`

  Expected: PASS pour tous les tests du drawer.

### Task 3: Brancher le drawer dans la page admin

**Files:**
- Modify: `src/app/admin/drivers/page.tsx:1-30`
- Modify: `src/app/admin/drivers/page.tsx:669-889`

**Interfaces:** `AdminDriversPage` fournit `driver={selectedDriver}`, `privateData={selectedDriverPrivate}`, `processing={processing === selectedDriver.id}`, les handlers de fermeture, d’actions et de motif, ainsi que le générateur de badge existant.

- [ ] **Step 1: Remplacer le markup inline par l’import du composant.**

  Ajouter :

  ```tsx
  import { DriverDetailsDrawer } from '@/components/admin/DriverDetailsDrawer';
  ```

  Puis remplacer tout le bloc conditionnel `{selectedDriver && (...)}` par :

  ```tsx
  {selectedDriver && (
    <DriverDetailsDrawer
      driver={selectedDriver}
      privateData={selectedDriverPrivate}
      rejectionReason={rejectionReason}
      processing={processing === selectedDriver.id}
      onClose={() => { setSelectedDriver(null); setRejectionReason(''); }}
      onRejectionReasonChange={setRejectionReason}
      onApprove={() => handleAdminAction('approve', selectedDriver.id)}
      onReject={() => handleAdminAction('reject', selectedDriver.id, rejectionReason.trim())}
      onSuspend={() => setActionModal({ show: true, action: 'suspend', driver: selectedDriver, reason: '' })}
      onUnsuspend={() => handleAdminAction('unsuspend', selectedDriver.id)}
      onDelete={() => openDeleteModal(selectedDriver)}
      getStatusBadge={getStatusBadge}
    />
  )}
  ```

  Supprimer l’import `Image` de la page si le reste du fichier ne l’utilise plus. Garder `MaterialIcon` si utilisé ailleurs dans la page.

- [ ] **Step 2: Vérifier que les actions métier restent inchangées.**

  Run: `npx jest src/app/admin/drivers/adminDriversActions.test.ts src/app/admin/drivers/adminDriversUi.test.ts --runInBand`

  Expected: PASS ; aucune modification des payloads admin ou des helpers de candidatures.

- [ ] **Step 3: Vérifier le typage.**

  Run: `npm run typecheck`

  Expected: PASS sans erreur TypeScript dans le drawer ni la page admin.

### Task 4: Vérifier le rendu réel et la qualité finale

**Files:**
- Modify: `src/components/admin/DriverDetailsDrawer.tsx` uniquement si les vérifications révèlent un défaut.
- Modify: `src/app/admin/drivers/page.tsx` uniquement si l’intégration révèle un défaut.

- [ ] **Step 1: Vérifier le lint.**

  Run: `npm run lint`

  Expected: PASS ; aucune nouvelle erreur ESLint dans les fichiers modifiés.

- [ ] **Step 2: Vérifier la vue mobile dans le navigateur local.**

  Ouvrir `http://localhost:3001/admin/drivers/`, sélectionner Bilion Mani et vérifier à une largeur proche de 455 px : en-tête compact, résumé visible, 2 colonnes de miniatures, pas de débordement horizontal, footer d’action visible, champ de refus utilisable et documents entiers dans leurs vignettes.

- [ ] **Step 3: Vérifier la vue desktop.**

  À une largeur desktop, vérifier que le drawer reste limité à `max-w-2xl`, que les documents passent à 3 colonnes, que le contenu défile dans le corps uniquement et que le header/footer restent visibles.

- [ ] **Step 4: Vérifier les interactions et les états.**

  Tester la fermeture par bouton et overlay, l’ouverture d’un document, l’approbation, le refus désactivé sans motif, le refus activé avec motif, et l’état de chargement pendant une action. Ne pas soumettre d’action destructive pendant la vérification visuelle.

- [ ] **Step 5: Exécuter la vérification finale.**

  Run: `git diff --check; npm run typecheck; npx jest src/components/admin/DriverDetailsDrawer.test.tsx src/app/admin/drivers/adminDriversActions.test.ts src/app/admin/drivers/adminDriversUi.test.ts --runInBand`

  Expected: aucune erreur d’espacement, TypeScript PASS et tous les tests ciblés PASS.

- [ ] **Step 6: Committer la refonte.**

  ```bash
  git add src/components/admin/DriverDetailsDrawer.tsx src/components/admin/DriverDetailsDrawer.test.tsx src/app/admin/drivers/page.tsx
  git commit -m "feat: compact admin driver details drawer"
  ```

## Self-review

- Spec coverage: le plan couvre le drawer compact, le résumé, les champs denses, la galerie 2/3 colonnes, `object-contain`, le footer sticky, les callbacks inchangés, l'accessibilité, le responsive, les tests et la vérification navigateur.
- Placeholder scan: aucun `TBD`, `TODO`, `FIXME` ou étape générique non actionnable n'est utilisé.
- Type consistency: `DriverDetailsDrawerProps` utilise `Driver`, `DriverPrivate` et `Driver['status']` déjà présents dans le projet ; les handlers sont des callbacks sans retour et `processing` est un booléen dérivé de l'état existant.
