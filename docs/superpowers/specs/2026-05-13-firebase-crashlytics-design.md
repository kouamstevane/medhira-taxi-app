# Firebase Crashlytics — Design

**Date** : 2026-05-13
**Objectif** : Suivre les crashs et erreurs JS des testeurs Play Store (Internal testing) avec identification de l'utilisateur.

## Contexte

L'app Medjira est publiée sur le Play Store en `Internal testing` uniquement. Le besoin est de remonter automatiquement les bugs (crashs natifs + exceptions JS non gérées) des testeurs vers la console Firebase, avec l'UID Firebase Auth pour identifier quel testeur a rencontré quel bug.

**Hors scope** : Firebase Analytics (suivi comportemental des utilisateurs). Seulement les bugs.

## Stack existante (réutilisée)

- `@capacitor-firebase/authentication` et `@capacitor-firebase/messaging` déjà installés
- `google-services.json` présent dans `android/app/`
- Plugin Gradle `com.google.gms:google-services:4.4.2` déjà déclaré dans `android/build.gradle`
- `AuthContext.tsx` (Provider client wrappant toute l'app) écoute déjà `onAuthStateChanged`

## Architecture

### 1. Plugin Capacitor
- Ajout de `@capacitor-firebase/crashlytics` (même famille que les plugins existants → versions alignées)
- `npx cap sync android` pour propager

### 2. Configuration Gradle Android
- `android/build.gradle` : ajouter classpath `com.google.firebase:firebase-crashlytics-gradle:3.0.2`
- `android/app/build.gradle` : `apply plugin: 'com.google.firebase.crashlytics'`

### 3. Module `src/lib/crashlytics.ts`
Wrapper centralisé exposant une API typée :

```ts
isCrashlyticsEnabled(): boolean         // true uniquement sur natif + release
initCrashlytics(): Promise<void>        // active la collecte + handlers globaux
setUserId(uid: string | null): Promise<void>
setUserAttributes(attrs: Record<string, string>): Promise<void>
recordException(error: unknown, context?: string): Promise<void>
log(message: string): Promise<void>     // breadcrumb attaché au prochain crash
```

**Règle d'activation** :
- `Capacitor.isNativePlatform() === true` ET
- `process.env.NODE_ENV === 'production'` (build release)
- Override possible via `NEXT_PUBLIC_CRASHLYTICS_DEV=true` pour test ponctuel

Sinon : toutes les méthodes deviennent des no-op silencieux.

**Handlers globaux installés à l'init** :
- `window.addEventListener('error', ...)` → `recordException`
- `window.addEventListener('unhandledrejection', ...)` → `recordException`

### 4. Câblage dans `AuthContext.tsx`
Un seul fichier modifié pour brancher init + identité :

- `useEffect(() => { initCrashlytics() }, [])` au mount du Provider → init une seule fois au démarrage
- Dans le callback `onAuthStateChanged` :
  - `user` connecté → `setUserId(user.uid)`
  - `user` null → `setUserId(null)`
- Dans `fetchUserData` (après lecture Firestore) → `setUserAttributes({ role, appVersion })`

### 5. Bouton crash-test (validation manuelle)
Un bouton caché dans une page admin/dev (à supprimer après validation) qui appelle `FirebaseCrashlytics.crash()` pour vérifier la chaîne complète :
testeur → crash → Firebase console.

## Flux de données

```
[App démarre]
   ↓ AuthProvider mount
   ↓ initCrashlytics() → si release+natif: setEnabled(true) + install handlers
   ↓
[Testeur se connecte]
   ↓ onAuthStateChanged(user)
   ↓ setUserId(user.uid)
   ↓ fetchUserData → setUserAttributes({ role: 'driver', appVersion: '1.0.0' })
   ↓
[Bug en prod]
   ↓ crash natif OU exception JS non catchée
   ↓ plugin capture + envoie à Firebase
   ↓
[Dashboard Firebase Crashlytics]
   → crash visible avec UID testeur + rôle + version
```

## Debug en dev (sans Crashlytics)

- **Bugs JS** : Chrome DevTools sur WebView via `chrome://inspect` (l'app en USB est visible)
- **Bugs natifs** : `adb logcat -s FirebaseCrashlytics:V Capacitor:V`
- **Valider câblage Crashlytics** : `NEXT_PUBLIC_CRASHLYTICS_DEV=true` temporaire

## Tests / Validation

1. Build release signé → upload sur Internal testing Play Store
2. Installer sur device testeur
3. Se connecter (compte de test)
4. Déclencher le bouton crash-test
5. Vérifier dans Firebase console (Crashlytics) :
   - le crash apparaît dans les 5 min
   - l'UID Firebase Auth est visible dans les détails
   - les attributs `role` et `appVersion` sont présents

## Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `package.json` | + `@capacitor-firebase/crashlytics` |
| `android/build.gradle` | + classpath crashlytics-gradle |
| `android/app/build.gradle` | + apply plugin crashlytics |
| `src/lib/crashlytics.ts` | **créé** — wrapper API |
| `src/context/AuthContext.tsx` | + init + setUserId + setUserAttributes |
| (page dev temporaire) | + bouton crash-test à supprimer après validation |

## Risques / points de vigilance

- **Stack traces JS** : Crashlytics native capture surtout les crashs natifs/Java. Pour symboliser les exceptions JS (qui viendront via `recordException`), pas besoin de sourcemaps côté Firebase — les stacks JS sont envoyés en clair (acceptable pour Internal testing, à revoir si app publique).
- **NDK symbols** : pas pertinent ici (pas de code C++ custom dans l'app)
- **Délai premier crash** : 1ère remontée Firebase peut prendre jusqu'à 24h selon la doc Google (à anticiper dans le test de validation)
