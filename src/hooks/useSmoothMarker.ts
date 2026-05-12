/**
 * Hook useSmoothMarker — interpole une position GPS à 60 FPS pour un rendu
 * visuel fluide entre deux ticks GPS (typiquement 1 Hz).
 *
 * Cf. docs/superpowers/specs/2026-05-12-gps-smoothing.md §5.
 */

import { useEffect, useRef, useState } from 'react';

export interface UseSmoothMarkerOptions {
    /** Intervalle attendu entre deux ticks GPS (ms). Défaut 1000. */
    expectedTickMs?: number;
    /** Distance angulaire en deg en dessous de laquelle on snap sans animer. Défaut ~5e-7 (~5 cm). */
    snapThresholdDeg?: number;
}

interface LatLng {
    lat: number;
    lng: number;
}

const DEFAULT_TICK_MS = 1000;
const DEFAULT_SNAP_THRESHOLD = 5e-7;

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function nowMs(): number {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
}

export function useSmoothMarker(
    target: LatLng | null,
    options: UseSmoothMarkerOptions = {}
): LatLng | null {
    const { expectedTickMs = DEFAULT_TICK_MS, snapThresholdDeg = DEFAULT_SNAP_THRESHOLD } = options;

    const [displayed, setDisplayed] = useState<LatLng | null>(target);

    const fromRef = useRef<LatLng | null>(target);
    const toRef = useRef<LatLng | null>(target);
    const startMsRef = useRef<number>(nowMs());
    const rafRef = useRef<number | null>(null);
    const displayedRef = useRef<LatLng | null>(target);

    // Garde la dernière valeur affichée accessible synchroniquement (utilisé
    // comme `from` quand un nouveau target arrive en plein milieu d'une anim).
    useEffect(() => {
        displayedRef.current = displayed;
    }, [displayed]);

    useEffect(() => {
        // Pas de cible → on cancel et on reset
        if (target == null) {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            setDisplayed(null);
            fromRef.current = null;
            toRef.current = null;
            return;
        }

        const from = displayedRef.current;
        // Premier tick OU position trop proche → snap immédiat
        if (
            from == null ||
            (Math.abs(from.lat - target.lat) < snapThresholdDeg &&
                Math.abs(from.lng - target.lng) < snapThresholdDeg)
        ) {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            fromRef.current = target;
            toRef.current = target;
            setDisplayed(target);
            return;
        }

        // Démarre une nouvelle transition depuis la position courante affichée
        fromRef.current = from;
        toRef.current = target;
        startMsRef.current = nowMs();

        const tick = () => {
            const elapsed = nowMs() - startMsRef.current;
            const t = Math.min(elapsed / expectedTickMs, 1);
            const f = fromRef.current;
            const to = toRef.current;
            if (f == null || to == null) {
                rafRef.current = null;
                return;
            }
            const next: LatLng = {
                lat: lerp(f.lat, to.lat, t),
                lng: lerp(f.lng, to.lng, t),
            };
            setDisplayed(next);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
            }
        };

        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [target?.lat, target?.lng, expectedTickMs, snapThresholdDeg]);

    return displayed;
}
