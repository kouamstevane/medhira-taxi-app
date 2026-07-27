# Personal Driver Quality Gate

Ce document décrit la barrière qualité obligatoire pour toute modification de la fonctionnalité Personal Driver.

## Objectif

Détecter rapidement les régressions de contrats, de calcul, de permissions, de paiement et d'UI avant validation manuelle ou merge.

## Commande Principale

```bash
npm run quality:personal-driver
```

Cette commande exécute, dans l'ordre :

1. `npm run lint:personal-driver`
2. `npm run typecheck` avec nettoyage préalable de `.next/dev`
3. `npm run test:quality-gate`
4. `npm run test:personal-driver`
5. `npm --prefix functions run test:personal-driver`
6. `npm run test:personal-driver:firestore`
7. `npm run test:personal-driver:e2e`
8. `npm run build` avec nettoyage préalable de `.next/dev`
9. `npm --prefix functions run build`

La chaîne s'arrête au premier échec.

## Commandes Rapides

```bash
npm run test:quality-gate
npm run lint:personal-driver
npm run test:personal-driver
npm --prefix functions run test:personal-driver
npm run test:personal-driver:firestore
npm run test:personal-driver:e2e
```

## Couverture Automatisée

- Scripts obligatoires de quality gate dans `package.json` et `functions/package.json`.
- Contrats callable frontend/backend :
  - `createPersonalDriverSubscriptionPayment`
  - `clientManagePersonalDriver`
  - `cancelTrip`
  - `requestSpecialTrip`
- Calculs et éligibilité forfaits :
  - Basic semaine uniquement
  - Classic week-end
  - Premium 7j/7
  - distance mensuelle sur 30 jours calendaires
- Paiement :
  - payload Stripe PaymentIntent
  - rendu de confirmation avant paiement
  - webhook Personal Driver existant dans la suite backend
- Client :
  - dashboard
  - annulation via callable
  - demande de trajet spécial via callable
- Admin :
  - validation abonnement
  - affectation chauffeur/véhicule
  - réaffectation urgence
  - notifications Firestore
- Chauffeur :
  - transitions de statut
  - disponibilité occupée pendant mission
  - disponibilité libérée après mission
- UI/UX responsive :
  - desktop `1440x900`
  - tablette Chromium `1024x768`
  - mobile Pixel 7
- Firestore rules :
  - client propriétaire en lecture
  - client bloqué en écriture directe
  - chauffeur limité aux trajets attribués
  - utilisateur externe bloqué

## Checklist D'Acceptation

Avant de déclarer une correction Personal Driver prête :

- [ ] Les scripts de gate passent avec `npm run test:quality-gate`.
- [ ] Les tests frontend Personal Driver passent avec `npm run test:personal-driver`.
- [ ] Les tests backend Personal Driver passent avec `npm --prefix functions run test:personal-driver`.
- [ ] Les règles Firestore Personal Driver passent avec `npm run test:personal-driver:firestore`.
- [ ] Les E2E responsive passent avec `npm run test:personal-driver:e2e`.
- [ ] Le build app passe avec `npm run build`.
- [ ] Le build functions passe avec `npm --prefix functions run build`.
- [ ] Les payloads frontend utilisent `selectedPlanId` et `selectedWeekdays`.
- [ ] Aucune action client sensible n'écrit directement dans Firestore.
- [ ] Basic explique clairement le blocage week-end.
- [ ] Classic et Premium autorisent samedi/dimanche.
- [ ] La confirmation affiche un bouton de paiement sécurisé avant le PaymentElement.
- [ ] Admin peut sélectionner des opérations depuis des listes visibles, pas seulement saisir des IDs.
- [ ] Chauffeur voit ses missions et peut suivre les statuts.
- [ ] Les surfaces critiques sont lisibles en mobile, tablette et desktop.

## CI

Le workflow `.github/workflows/personal-driver-quality.yml` lance la gate sur les pull requests qui touchent Personal Driver, les contrats qualité, les tests E2E ou les scripts.

## Limites Honnêtes

Cette gate réduit fortement le risque, mais ne remplace pas :

- la correction de toutes les erreurs du lint global `npm run lint`, qui inclut de la dette existante hors Personal Driver ;
- un test manuel avec de vrais comptes Firebase ;
- un paiement Stripe de bout en bout en environnement sandbox ;
- une vérification complète des notifications push réelles ;
- les tests Firestore rules globaux si les règles changent.

Quand ces zones changent, lancer aussi :

```bash
npm run test:firestore:emulators
npm run test:e2e
```
