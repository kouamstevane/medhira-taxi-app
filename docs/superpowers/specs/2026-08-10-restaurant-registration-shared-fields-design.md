# Harmonisation des champs du parcours d’inscription restaurateur

## Objectif

Aligner visuellement et structurellement les quatre étapes du parcours d’inscription restaurateur avec les composants de formulaire partagés déjà utilisés par les autres parcours d’onboarding.

Le périmètre comprend uniquement `src/app/restaurant/register/components/Step1Account.tsx`, `Step2EmailVerification.tsx`, `Step3Restaurant.tsx`, `Step4Hours.tsx` et les composants partagés directement nécessaires. La logique Firebase, la validation métier, la sauvegarde des brouillons, la navigation et les écrans du portail restaurateur ne changent pas.

## Design retenu

### Champs

- Remplacer les `input` natifs de l’étape 1 par `InputField`.
- Remplacer les `input` et le `textarea` natifs de l’étape 3 par `InputField` et `TextAreaField`.
- Conserver `AddressInput` pour l’adresse du restaurant, car il s’agit déjà d’un composant partagé avec l’autocomplétion et la géolocalisation.
- Utiliser les classes de champ partagées pour les champs horaires de l’étape 4, en conservant les contrôles contrôlés existants.
- Aligner `TextAreaField` sur le contrat visuel de `InputField` : label, hauteur/espacement, fond, bordure, rayon, focus orange, état désactivé, erreurs et texte d’aide. Le support du compteur de caractères reste disponible.

Les identifiants HTML, labels accessibles, placeholders, valeurs initiales et attributs `required`/`autoComplete` seront conservés ou reliés correctement lors du remplacement.

### Actions et états visuels

- Réutiliser les styles partagés pour les actions Retour et Continuer/Soumettre dans les étapes 1, 3 et 4.
- Conserver le bouton Google comme action spécifique de fournisseur, avec sa présentation compacte existante.
- Conserver les boutons de type de cuisine comme groupe de sélection spécifique, en gardant `aria-pressed` et les états sélectionné/non sélectionné.
- Garder les alertes d’erreur au niveau de l’étape et leurs messages existants.

### Données et comportement

Les valeurs resteront gérées par les mêmes états contrôlés. Les callbacks `onSubmit`, `onNext`, `onBack` et `onSubmit` de l’étape 4 garderont leurs signatures et leurs données. L’adresse continuera à mettre à jour la position géographique via `AddressInput` et le géocodage existant.

## Tests

Ajouter ou étendre les tests du parcours restaurateur pour vérifier :

- la présence des champs partagés et de leurs classes visuelles principales dans les étapes 1 et 3 ;
- la liaison correcte entre labels et champs ;
- la présence des styles partagés sur les champs horaires et les boutons de navigation de l’étape 4 ;
- le maintien des validations existantes lorsque les champs sont vides ou incomplets ;
- la conservation des données transmises aux callbacks après interaction avec les champs.

Les tests seront écrits avant l’implémentation de chaque comportement vérifié, puis exécutés avec les tests ciblés et la suite de validation appropriée.

## Hors périmètre

- Formulaires du portail restaurateur après inscription.
- Modification du modèle `Step1Data`, `Step3Data` ou `Step4Data`.
- Modification de l’intégration Google Maps, Firebase ou de la gestion des brouillons.
- Refonte fonctionnelle des types de cuisine ou des horaires.
