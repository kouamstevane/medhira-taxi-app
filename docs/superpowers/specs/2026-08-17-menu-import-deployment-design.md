# Correction et déploiement de l’import catalogue

## Objectif

Rendre l’import CSV/XLSX opérationnel sur le projet Firebase `medjira-service` et empêcher que l’interface reste bloquée indéfiniment lorsqu’un téléversement ne reçoit aucune réponse.

## Cause traitée

Le navigateur envoie un upload authentifié vers le bon bucket, mais le bucket distant répond HTTP 403 alors que les règles locales autorisent le cas propriétaire. Les règles Storage et Firestore nécessaires au flux seront déployées depuis une copie Git propre. Le client recevra également un délai maximal et un mécanisme d’annulation pour chaque téléversement.

## Conception

`uploadMenuImportFile` conserve sa signature actuelle et accepte une quatrième option facultative contenant un `AbortSignal` et un délai configurable. Le délai par défaut est de 30 secondes. À l’expiration ou à l’annulation, l’`UploadTask` Firebase est annulée, les écouteurs sont nettoyés et une erreur typée est retournée au composant.

`BulkCsvImportModal` crée un contrôleur d’annulation pendant la phase Storage. Le bouton Annuler interrompt cette phase avant de fermer la modale. Une expiration affiche l’erreur et réactive les actions ; une annulation volontaire ferme la modale sans afficher d’erreur parasite. Le traitement Cloud Function déjà démarré conserve son comportement de confirmation avant fermeture.

## Validation et déploiement

- Ajouter d’abord les tests qui échouent pour l’expiration et l’annulation.
- Implémenter le minimum nécessaire dans le service et la modale.
- Exécuter les tests unitaires de service et de modale, les tests des règles Storage en émulateur, puis le build TypeScript pertinent.
- Déployer `firestore`, `storage` et `functions` sur `medjira-service` depuis ce workspace propre.
- Rejouer les scénarios réels 01, 02 et 03 dans le portail et vérifier l’absence de 403, la progression et le rapport d’erreurs.

## Hors périmètre

Aucune modification du parseur, du schéma métier, des règles non liées à l’import, des versions Stripe ou des autres changements présents dans le dépôt principal.
