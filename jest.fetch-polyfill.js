/**
 * Polyfill global `fetch` pour les environnements de test Node.js
 * où firebase/auth en a besoin à l'initialisation du module.
 *
 * Ce fichier est listé dans `setupFiles` (avant le chargement des modules de test).
 */
if (typeof global.fetch === 'undefined') {
  global.fetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });
}
