# Import catalogue avec revue manuelle

## Objectif

Rendre l’import de catalogue contrôlable par le restaurateur : aucune écriture dans le menu ne doit démarrer avant qu’un récapitulatif ait été affiché et confirmé.

## Parcours utilisateur

1. L’utilisateur sélectionne un fichier CSV ou XLSX.
2. Le fichier est téléversé dans Storage comme brouillon technique, sans créer de document `menu_imports` et donc sans déclencher le worker.
3. L’application demande une prévisualisation au serveur.
4. La modale affiche un récapitulatif : total, nouvelles lignes, mises à jour, anomalies et conflits, avec le détail par ligne.
5. Les lignes valides sont sélectionnées par défaut. Les lignes invalides ou en conflit sont désélectionnées et ne peuvent pas être importées.
6. L’utilisateur peut modifier la sélection des lignes valides, revenir au choix du fichier ou confirmer.
7. La confirmation affiche explicitement le nombre de lignes qui seront réellement importées.
8. Le serveur crée le document `menu_imports` uniquement après cette confirmation. Le trigger existant peut alors démarrer le worker.

## Règles de validation

- Une ligne invalide est conservée dans le récapitulatif avec son numéro et sa cause, mais n’est jamais importée par défaut.
- Une collision avec un plat manuel ou une autre source est signalée comme conflit et n’est pas sélectionnable.
- Un même `externalId` présent plusieurs fois dans le fichier est signalé comme conflit.
- Une ligne valide correspondant à un plat issu de la même source est classée comme mise à jour.
- Si aucune ligne n’est importable, le bouton de confirmation est désactivé.
- Le worker revalide toujours les données avant écriture ; la revue n’est pas une autorisation de contourner les protections serveur.

## Architecture

- Ajouter une callable `previewMenuFileImport` qui réutilise le parsing et la normalisation serveur, vérifie la propriété du restaurant et compare les identifiants avec les plats existants. Elle ne crée ni job ni plat.
- Faire accepter à `startMenuFileImport` une confirmation explicite et une liste de numéros de lignes validées. Le document du job stocke cette sélection.
- Faire traiter par le worker uniquement les lignes confirmées ; les protections d’écriture actuelles restent actives.
- Remplacer le bouton direct de la modale par un état `sélection → revue → traitement`, sans ajouter de dépendance de parsing côté navigateur.

## Critères d’acceptation

- Le fichier standard affiche toutes ses lignes comme importables et aucune écriture n’est déclenchée avant confirmation.
- Le fichier avec erreurs affiche les erreurs ligne par ligne, importe uniquement les lignes valides après confirmation et laisse les erreurs non importées.
- Le fichier de mise à jour identifie les lignes existantes comme mises à jour.
- Fermer ou annuler depuis la revue ne crée aucun job `menu_imports`.
- Les tests couvrent la prévisualisation, la confirmation obligatoire, la sélection des lignes et l’affichage de la revue.
