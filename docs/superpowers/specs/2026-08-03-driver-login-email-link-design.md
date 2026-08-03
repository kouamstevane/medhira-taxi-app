# Lien de connexion chauffeur depuis les e-mails

## Objectif

Faire fonctionner le bouton « Se connecter maintenant » de l’e-mail d’approbation comme le bouton « Créer mon compte » : ouvrir l’application Android lorsqu’elle est installée, avec la page web comme solution de repli.

## Cause identifiée

Le lien d’approbation utilise `https://medjira.com/driver/login`, tandis que les App Links Android déclarés dans `AndroidManifest.xml` utilisent le domaine vérifié `medjira-service.web.app`. Le lien d’invitation fonctionnel utilise déjà ce domaine canonique.

## Conception retenue

Utiliser `https://medjira-service.web.app/driver/login` pour les e-mails d’approbation et de réactivation. Cette route reste compatible avec la redirection existante vers le login unifié `/login` et bénéficie de la configuration Android déjà présente.

Le test de régression vérifiera que les deux types d’e-mails générés contiennent le domaine et le chemin App Link attendus. Aucun changement de comportement d’authentification ou de configuration Android n’est nécessaire.

## Fichiers concernés

- `functions/src/email-service.ts` : templates effectivement utilisés par les Cloud Functions.
- `src/lib/email-templates.ts` : templates partagés du service e-mail côté application, conservés cohérents.
- `functions/src/__tests__/driverStatusEmail.test.ts` : test de régression des liens générés.
