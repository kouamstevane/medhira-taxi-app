/**
 * Race une promesse contre un timeout. Si la promesse ne s'est pas résolue
 * en `ms` millisecondes, la promesse retournée rejette avec une erreur
 * étiquetée `label`. La promesse d'origine continue son exécution en arrière-plan
 * (non annulable côté JS) — utiliser AbortController si l'annulation effective
 * est requise.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); }
        );
    });
}
