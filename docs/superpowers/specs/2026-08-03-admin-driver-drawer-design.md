# Refonte UX du panneau de détails chauffeur

## Contexte

Le panneau latéral de détails de `src/app/admin/drivers/page.tsx` est utilisé par un administrateur pour vérifier rapidement une candidature et décider de l'approuver ou de la refuser. Sur mobile, les cartes de documents en `aspect-[4/3]`, les espacements généreux et l'absence d'actions persistantes rendent la vérification longue et donnent trop de poids visuel aux photos.

## Objectifs

- Réduire nettement la hauteur nécessaire pour parcourir le profil sur mobile.
- Faire apparaître en premier les informations utiles à la décision.
- Conserver une consultation confortable sur desktop.
- Garder les données, les liens de documents et les actions Firebase inchangés.
- Améliorer la lisibilité des documents officiels sans les recadrer inutilement.

## Hors périmètre

- Modification du modèle Firestore ou des règles d'accès.
- Modification de la table principale des chauffeurs.
- Refonte de la navigation admin globale.
- Ajout d'une visionneuse de documents complexe : l'ouverture au clic dans un nouvel onglet est conservée.

## Direction visuelle

Le drawer conserve l'identité sombre existante et son accent orange, mais passe d'une succession de grandes cartes à une interface de contrôle dense et calme.

- Fond : `#0d0d0d`, surfaces légèrement contrastées avec `white/[0.02]` et bordures fines.
- Accent : orange primaire pour l'identité et les éléments actifs.
- États : vert pour l'approbation, rose/rouge pour le refus, ambre pour l'attente.
- Typographie : titres de section en `text-base`, labels en petites capitales discrètes, valeurs plus lisibles que les labels.
- Rythme : marges et gaps réduits sur mobile, avec une progression plus ample à partir du breakpoint `sm`.

## Structure UX

```text
┌────────────────────────────────────┐
│ avatar  Bilion Mani   statut   ×    │  en-tête sticky, compact
├────────────────────────────────────┤
│ Profil  |  Chauffeur  |  9 docs     │  résumé de décision
├────────────────────────────────────┤
│ Informations personnelles           │
│ Prénom        Bilion                │
│ Email         bilion2ok@...         │
│ Téléphone     +237...               │
│ ...                                 │
├────────────────────────────────────┤
│ Véhicule                            │
│ Marque / modèle   N/A   Plaque N/A  │
├────────────────────────────────────┤
│ Documents officiels                │
│ [miniature] [miniature]             │  2 colonnes mobile
│ [miniature] [miniature]             │  3 colonnes desktop
├────────────────────────────────────┤
│ Validation requise                 │
│ commentaire de refus                │
├────────────────────────────────────┤
│       Refuser          Approuver    │  footer sticky
└────────────────────────────────────┘
```

### En-tête

Réduire l'avatar à 40 px, le padding à `p-4`, et conserver le nom, le statut et l'identifiant court sur une même zone. Le bouton de fermeture reçoit un libellé accessible explicite.

### Résumé de décision

Ajouter une bande compacte sous l'en-tête avec trois indicateurs calculés depuis les données existantes : type de profil, date de candidature et nombre de documents disponibles. Cette bande donne le contexte avant les détails sans créer de nouvelle source de vérité.

### Informations et véhicule

Remplacer les grandes cartes à `p-6`/`gap-8` par des grilles compactes à `p-4` et `gap-x-5 gap-y-4`. Sur mobile, les champs restent en deux colonnes lorsque le contenu le permet ; les champs longs (email, adresse) prennent toute la largeur. Les labels restent en petites capitales, mais les valeurs passent en `text-sm` avec retour à la ligne maîtrisé.

### Documents

Conserver une galerie unique, mais réduire chaque vignette à une hauteur fixe : environ 104 px sur mobile et 128 px sur desktop. Les documents officiels utilisent `object-contain` sur une surface sombre afin de préserver les pièces administratives entières ; la photo de profil peut utiliser `object-cover`. Le libellé est placé dans une ligne compacte au-dessus de la vignette. L'ouverture au clic et l'indication « Agrandir » sont conservées.

### Validation et actions

La zone d'action est séparée par une bordure supérieure et reste visible via un footer sticky au bas du drawer. Le bouton d'approbation reste l'action primaire ; le champ de motif et le refus restent secondaires mais immédiatement accessibles. Les états de chargement et de désactivation existants sont conservés.

## Architecture proposée

Extraire le drawer dans `src/components/admin/DriverDetailsDrawer.tsx` afin de séparer le rendu détaillé de la logique de liste. Le composant reçoit le chauffeur sélectionné, les données privées, l'état de traitement et les callbacks d'action/fermeture. De petits sous-composants locaux (`DetailField`, `DocumentThumbnail`) encapsulent uniquement les répétitions visuelles nécessaires.

Le flux de données reste inchangé : `page.tsx` sélectionne le chauffeur et charge la sous-collection privée ; le drawer ne lit ni n'écrit directement dans Firestore. Les callbacks existants continuent d'appeler les mêmes actions administratives.

## Responsive et accessibilité

- Mobile : drawer pleine largeur, padding `p-4`, documents en 2 colonnes, footer d'action compact.
- Desktop : drawer limité à `max-w-2xl`, padding `p-6`, documents en 3 colonnes, densité légèrement relâchée.
- Les boutons ont une taille tactile minimale confortable et un état de focus visible.
- Les images conservent leur texte alternatif ; les liens indiquent qu'ils ouvrent le document.
- Le mouvement de slide existant est conservé mais doit respecter `prefers-reduced-motion` via les utilitaires déjà disponibles.

## Vérification

- Tests unitaires ciblés pour les helpers UI existants si une logique de comptage ou de formatage est extraite.
- Vérification TypeScript/lint sur les fichiers modifiés.
- Test navigateur sur `http://localhost:3001/admin/drivers/` à une largeur mobile comparable à 455 px puis sur desktop.
- Contrôles visuels : hauteur des vignettes, visibilité du footer d'action, absence de débordement horizontal, lisibilité des champs longs et ouverture des documents.
