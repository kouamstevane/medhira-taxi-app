# 🎨 Assets graphiques Play Store

Ce dossier regroupe **tous les fichiers à uploader sur Google Play Console**
(fiche du Store + premier upload). Voir [docs/DEPLOY-PLAYSTORE.md](../docs/DEPLOY-PLAYSTORE.md) Phase 2.

> Ce dossier peut être committé pour archiver les versions actuelles, ou ignoré
> via `.gitignore` selon votre préférence — les assets ne sont jamais lus à
> l'exécution par l'app.

---

## 📋 Checklist des fichiers requis

| Fichier | Statut | Format | Source |
|---|---|---|---|
| `icon-512.png` | ⏳ à copier | 512×512 PNG | `public/icon-512.png` |
| `feature-graphic.png` | ❌ à créer | 1024×500 PNG/JPG | Canva / Figma |
| `screenshots/01-*.png` | ❌ à capturer | 9:16, min 320px, max 3840px | Téléphone réel |
| `screenshots/02-*.png` | ❌ à capturer | idem | idem |
| ... (min 2, max 8) | | | |
| `promo-video-url.txt` *(optionnel)* | ❌ à créer | URL YouTube | YouTube non-listée |

---

## 1. Icône (`icon-512.png`) — 512×512 PNG

Déjà disponible dans le projet :

```bash
cp public/icon-512.png play-store-assets/icon-512.png
```

Exigences Play Store :
- **512×512 px exactement**
- PNG, max 1 Mo
- Coins **non arrondis** (Play Store applique le masque automatiquement)
- Pas de transparence sur le fond

---

## 2. Bannière (`feature-graphic.png`) — 1024×500 PNG ou JPG

Affichée en haut de la fiche Play Store et dans les recommandations.

**Contenu suggéré** :
- Logo Medjira centré ou à gauche
- Slogan : *« Votre course en quelques clics »*
- Fond : couleur primaire `#f29200` (orange Medjira) ou dégradé sombre
- **Pas de texte trop petit** — sera affiché sur petits écrans

**Outils recommandés** : Canva (template Play Store), Figma, Photoshop.

---

## 3. Captures d'écran (`screenshots/`)

**Format** :
- Téléphone : 9:16 portrait (ou 16:9 paysage), min 320 px, max 3840 px par côté
- 7" tablette (optionnel) : 16:9
- 10" tablette (optionnel) : 16:9
- **Minimum 2, maximum 8** captures par catégorie

**Comment capturer** :

```bash
# 1. Build l'app sur un téléphone Android physique (pas un émulateur — résolution non standard)
npm run mobile:run:android

# 2. Sur le téléphone, capturer avec Volume- + Power
```

**Écrans à capturer** (recommandé pour app de mobilité — tirés du code réel) :

| # | Écran | Route |
|---|---|---|
| 01 | Login | [/login](../src/app/login/page.tsx) |
| 02 | Recherche de course (carte) | [/taxi](../src/app/taxi/page.tsx) |
| 03 | Course en cours / tracking | [/client/order/[id]/tracking](../src/app/client/order/[orderId]/tracking) |
| 04 | Liste de restaurants | [/food](../src/app/food) |
| 05 | Envoi de colis | [/colis](../src/app/colis/page.tsx) |
| 06 | Profil utilisateur | [/profil](../src/app/profil/page.tsx) |
| 07 | Wallet / paiement | [/wallet](../src/app/wallet/page.tsx) |
| 08 | Espace chauffeur | [/driver/dashboard](../src/app/driver/dashboard/page.tsx) |

**Conseils** :
- Préparer des **données réalistes** dans le compte test (vraie ville, vrais restaurants démo)
- **Masquer** numéros de téléphone, vraies adresses, photos d'identité
- Fond clair OU sombre cohérent (l'app est en dark mode)

Renommer les fichiers en `01-…`, `02-…` pour contrôler l'ordre d'affichage.

---

## 4. Vidéo promo *(optionnel mais recommandé)*

URL YouTube de **30 s à 2 min**. Peut être ajoutée plus tard. Augmente significativement le taux d'installation.

Déposer l'URL ici :

```bash
echo "https://youtu.be/XXXXXXXXXXX" > play-store-assets/promo-video-url.txt
```

---

## 5. Vidéo justificative ACCESS_BACKGROUND_LOCATION (CRITIQUE)

**Obligatoire** pour ne pas être rejeté — voir Phase 9.1 du guide.

Tournage 30-60 secondes montrant :
1. L'utilisateur (chauffeur) accepte une course
2. L'app passe en arrière-plan (home screen)
3. Le suivi GPS continue (notification persistante visible)
4. La localisation s'arrête après la fin de course

Hébergement : **YouTube non-listée** (suffit pour Google).

```bash
echo "https://youtu.be/XXXXXXXXXXX" > play-store-assets/background-location-video-url.txt
```

---

## 📐 Tailles récapitulatives

| Asset | Dimensions | Format |
|---|---|---|
| Icône app | 512 × 512 | PNG (sans transparence) |
| Feature graphic | 1024 × 500 | PNG / JPG |
| Phone screenshot | min 320 px côté court, max 3840 px côté long, ratio 16:9 ou 9:16 | PNG / JPG |
| Tablet 7" screenshot | min 320 px, max 3840 px | PNG / JPG |
| Tablet 10" screenshot | min 1080 px, max 7680 px | PNG / JPG |

Source : [Play Console — Spécifications graphiques](https://support.google.com/googleplay/android-developer/answer/9866151).
