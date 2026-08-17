# Guide des Jeux de Données et Scénarios de Test

Tous les fichiers CSV prêts à être importés se trouvent dans ce dossier :
`C:\Users\User\Documents\AlloTraining\medjira-taxi-app\.worktrees\menu-import-sync\test-datasets\`

---

## Scénario 1 : Import CSV Standard (Happy Path)
- **Fichier** : `01-menu-standard-valide.csv`
- **Contenu** : 10 plats variés répartis en 4 catégories (`Burgers Signature`, `Pizzas Artisanales`, `Desserts Maison`, `Boissons Fraîches`).
- **Ce qui est testé** :
  - Upload vers Firebase Storage avec jauge de progression.
  - Déclenchement du Cloud Function et progression temps réel.
  - Création des 10 plats avec identifiants hachés déterministes.
  - Création dynamique des onglets de catégories dans l'interface.
- **Résultat attendu** : 100% de réussite (10 plats importés, 0 erreur).

---

## Scénario 2 : Tolérance Format & En-têtes Français (Séparateur point-virgule `;`)
- **Fichier** : `02-menu-separateur-point-virgule-fr.csv`
- **Contenu** : 6 plats avec séparateur `;`, en-têtes en français (`Reference`, `Intitule`, `Description`, `Tarif`, `Rayon`, `Duree`, `Actif`), prix avec virgule (ex: `9,50`) et booléen textuel (`oui`).
- **Ce qui est testé** :
  - Auto-détection du délimiteur `;`.
  - Normalisation intelligente des alias de colonnes en français.
  - Conversion des prix avec virgule et des statuts `oui` / `non`.
- **Résultat attendu** : 6 plats importés sans aucune erreur de parsing.

---

## Scénario 3 : Résilience aux Erreurs & Rapport Détaillé
- **Fichier** : `03-menu-avec-erreurs-partielles.csv`
- **Contenu** : 8 lignes au total (5 plats valides + 3 lignes invalides).
  - Ligne 3 : Prix négatif (`-5.00`).
  - Ligne 5 : Identifiant SKU manquant.
  - Ligne 7 : Prix supérieur au plafond autorisé (`99999999`).
- **Ce qui est testé** :
  - Le worker ne plante pas et importe les 5 plats valides.
  - Les 3 erreurs sont tracées dans `errors[]` avec numéro de ligne et message explicite.
  - Affichage de l'accordéon d'erreurs rouge dans la modale UI.
- **Résultat attendu** : 5 plats importés, 3 plats rejetés avec détail consultable.

---

## Scénario 4 : Gros Catalogue & Pagination Firestore (« Charger plus »)
- **Fichier** : `04-menu-gros-catalogue-60-plats.csv`
- **Contenu** : 60 plats complets répartis sur 4 univers culinaires (`Cuisine Asiatique`, `Trattoria Italienne`, `Cantina Mexicaine`, `Pâtisseries & Desserts`).
- **Ce qui est testé** :
  - Performance du worker batché sur volume important.
  - Chargement initial limité à la 1ère page (50 plats).
  - Affichage du bouton **« Charger plus de plats »** au bas de la page.
  - Clic sur « Charger plus » : chargement dynamique par curseur des 10 plats restants.
- **Résultat attendu** : 60 plats importés, affichage 50 puis 60 sans rechargement complet de page.

---

## Scénario 5 : Idempotence & Mise à Jour des Plats Existants
- **Fichier** : `05-menu-mise-a-jour-prix.csv`
- **Contenu** : Mise à jour des prix et descriptions des plats `BUR-001`, `BUR-002`, `PIZ-001`, `DES-001`, `BOI-001` (déjà importés dans le scénario 1).
- **Ce qui est testé** :
  - Détection des plats existants via le même `externalId`.
  - Mise à jour transactionnelle du document existant sans créer de doublon.
  - Mise à jour de `sourceUpdatedAt` et `lastImportId`.
- **Résultat attendu** : Aucun nouveau plat créé, les prix des plats existants sont actualisés.

---

## Scénario 6 : Modale WooCommerce & Sécurité Anti-SSRF
- **Données de test** :
  1. **Test négatif URL Non-HTTPS** :
     - URL : `http://mon-restaurant.com`
     - Résultat : Rejet client immédiat (« L'URL doit commencer par https:// »).
  2. **Test négatif IP Privée / SSRF** :
     - URL : `https://192.168.1.1` ou `https://127.0.0.1` ou `https://169.254.169.254`
     - Clés : `ck_test123`, `cs_test123`
     - Résultat : Rejet serveur de sécurité (« L'adresse IP résolue n'est pas routable publiquement »).
  3. **Test négatif Identifiants dans l'URL** :
     - URL : `https://admin:pass@mon-restaurant.com`
     - Résultat : Rejet de sécurité (« Les URLs avec identifiants intégrés sont interdites »).
