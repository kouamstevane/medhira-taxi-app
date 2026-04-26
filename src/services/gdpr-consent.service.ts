/**
 * RGPD — Service de gestion des consentements explicites.
 *
 * Registre `users/{uid}.consents.<scope>` :
 *   { grantedAt: Timestamp, version: string, method: 'ui_prompt' | 'onboarding' | 'settings' }
 *
 * Scopes gérés :
 *   - geolocation : suivi GPS continu (courses chauffeur, tracking livraison).
 *
 * TODO (Stevane) : brancher une modale UI qui appelle `grantConsent('geolocation', ...)`
 * avant de démarrer le tracking. Aujourd'hui, `ensureConsent` retourne simplement
 * `false` si absent — le code appelant doit surfacer le prompt.
 */

import { getFirestore, doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

export type ConsentScope = 'geolocation';
export type ConsentMethod = 'ui_prompt' | 'onboarding' | 'settings';

export const CURRENT_CONSENT_VERSION = '2026-04-v1';

export interface ConsentRecord {
    grantedAt: Timestamp;
    version: string;
    method: ConsentMethod;
}

export class ConsentRequiredError extends Error {
    constructor(public scope: ConsentScope) {
        super(`CONSENT_REQUIRED:${scope}`);
        this.name = 'ConsentRequiredError';
    }
}

export async function hasConsent(uid: string, scope: ConsentScope): Promise<boolean> {
    if (!uid) return false;
    try {
        const db = getFirestore();
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) {
            // Chauffeurs n'ont pas de doc `users/` — fallback sur drivers/
            const driverSnap = await getDoc(doc(db, 'drivers', uid));
            const record = driverSnap.data()?.consents?.[scope] as ConsentRecord | undefined;
            return !!record?.grantedAt;
        }
        const record = snap.data()?.consents?.[scope] as ConsentRecord | undefined;
        return !!record?.grantedAt;
    } catch (err) {
        console.error('[gdpr-consent] hasConsent failed:', err);
        return false;
    }
}

export async function grantConsent(
    uid: string,
    scope: ConsentScope,
    method: ConsentMethod,
): Promise<void> {
    if (!uid) throw new Error('uid required');
    const db = getFirestore();
    const payload = {
        consents: {
            [scope]: {
                grantedAt: serverTimestamp(),
                version: CURRENT_CONSENT_VERSION,
                method,
            },
        },
    };
    // Écrire sur les deux docs possibles (users/ pour clients, drivers/ pour chauffeurs).
    // Les règles Firestore filtreront; en cas d'absence de doc, le setDoc merge crée un stub
    // qui sera rempli ailleurs — on ne throw pas si l'un des deux échoue.
    const writes = [
        setDoc(doc(db, 'users', uid), payload, { merge: true }).catch(() => undefined),
        setDoc(doc(db, 'drivers', uid), payload, { merge: true }).catch(() => undefined),
    ];
    await Promise.all(writes);
}

export async function revokeConsent(uid: string, scope: ConsentScope): Promise<void> {
    if (!uid) return;
    const db = getFirestore();
    const payload = {
        consents: {
            [scope]: null,
        },
    };
    await Promise.all([
        setDoc(doc(db, 'users', uid), payload, { merge: true }).catch(() => undefined),
        setDoc(doc(db, 'drivers', uid), payload, { merge: true }).catch(() => undefined),
    ]);
}

/**
 * Helper utilisé par les services de tracking : vérifie le consentement
 * et throw `ConsentRequiredError` si absent, pour que l'appelant puisse
 * déclencher la modale UI.
 */
export async function ensureConsent(uid: string, scope: ConsentScope): Promise<void> {
    const ok = await hasConsent(uid, scope);
    if (!ok) throw new ConsentRequiredError(scope);
}
