# Gestion des commissions par restaurant

## Objectif

Permettre à un administrateur de définir un taux de commission différent pour chaque restaurant, par exemple 15 %, 10 % ou 5 %. Le taux choisi doit s’appliquer aux nouvelles commandes uniquement.

## Décision de conception

La fonction callable existante `adminManageRestaurant` recevra une nouvelle action `set_commission_rate`. Cette action sera protégée par la vérification d’administrateur déjà utilisée pour les opérations de gestion des restaurants.

Le taux sera validé côté serveur comme un nombre fini compris entre 0 et 100. Le document `restaurants/{restaurantId}` conservera la valeur courante dans `commissionRate`.

La page d’administration des restaurants affichera le taux courant dans la fiche du restaurant et permettra à l’administrateur de le modifier et de l’enregistrer. Le formulaire affichera clairement le pourcentage et signalera les erreurs de validation ou d’enregistrement.

## Flux des données

1. L’administrateur saisit un taux dans `/admin/restaurants`.
2. L’interface appelle `adminManageRestaurant` avec `action: 'set_commission_rate'`, l’identifiant du restaurant et le taux.
3. Le serveur vérifie l’authentification, le rôle administrateur, l’existence du restaurant et la validité du taux.
4. Le serveur met à jour `commissionRate`, `commissionRateUpdatedAt` et `commissionRateUpdatedBy`.
5. Lors de la création d’une nouvelle commande, le taux courant du restaurant est copié dans `food_orders/{orderId}.commissionRate`.
6. Le règlement Stripe utilise le taux copié sur la commande. Une modification ultérieure du restaurant ne modifie donc pas les commandes déjà créées.

## Historique et cohérence comptable

Les commandes existantes conserveront leur taux enregistré, y compris si elles n’ont pas encore été livrées. Les nouvelles commandes utiliseront le nouveau taux après sa sauvegarde. Aucun recalcul rétroactif ni migration des commandes historiques ne sera effectué.

La date et l’identifiant de l’administrateur seront enregistrés sur le restaurant pour rendre la modification traçable. Les taux appliqués aux commandes resteront également consultables directement sur chaque commande et dans le règlement associé.

## Sécurité et erreurs

- Un appel sans authentification ou sans rôle administrateur sera refusé.
- Un restaurant inexistant sera refusé.
- Les taux non numériques, négatifs ou supérieurs à 100 seront refusés.
- L’interface ne retirera le taux affiché qu’après confirmation de la réussite côté serveur.
- Le serveur restera la source d’autorité; la validation de l’interface ne remplacera pas la validation backend.

## Tests

- L’action admin accepte un taux valide et met à jour le bon restaurant.
- L’action refuse un taux invalide.
- L’action refuse un appel non administrateur.
- Le taux est copié sur une nouvelle commande.
- Une commande existante conserve son taux lorsque le taux du restaurant change.
- L’interface affiche le taux courant et transmet la nouvelle valeur après sauvegarde.

## Périmètre exclu

- Pas de modification du taux d’une commande déjà créée.
- Pas de modification des règles de partage des frais de livraison avec le chauffeur.
- Pas de gestion de taux par période, par catégorie de plat ou par campagne promotionnelle.
