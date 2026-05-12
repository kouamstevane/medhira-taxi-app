/**
 * Test unitaire useSmoothMarker — couvre AC4 du spec
 * docs/superpowers/specs/2026-05-12-gps-smoothing.md.
 */

import { renderHook, act } from '@testing-library/react';
import { useSmoothMarker } from '@/hooks/useSmoothMarker';

describe('useSmoothMarker — AC4 interpolatesBetweenTargets', () => {
    let now = 0;
    const rafCallbacks: Array<{ id: number; cb: FrameRequestCallback }> = [];
    let rafId = 0;

    beforeEach(() => {
        now = 1_000_000;
        rafCallbacks.length = 0;
        rafId = 0;
        jest.spyOn(performance, 'now').mockImplementation(() => now);
        jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
            const id = ++rafId;
            rafCallbacks.push({ id, cb });
            return id;
        });
        jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
            const idx = rafCallbacks.findIndex((c) => c.id === id);
            if (idx !== -1) rafCallbacks.splice(idx, 1);
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function advanceTime(ms: number) {
        now += ms;
        // Flush toutes les rAF en attente avec le nouveau "now".
        const pending = rafCallbacks.splice(0, rafCallbacks.length);
        pending.forEach(({ cb }) => cb(now));
    }

    it('interpole linéairement entre deux targets sur expectedTickMs', () => {
        const { result, rerender } = renderHook(
            ({ target }: { target: { lat: number; lng: number } }) =>
                useSmoothMarker(target, { expectedTickMs: 1000 }),
            { initialProps: { target: { lat: 0, lng: 0 } } }
        );

        // 1er rendu : snap immédiat sur le 1er target
        expect(result.current).toEqual({ lat: 0, lng: 0 });

        // Nouveau target : 10 deg vers l'est
        act(() => {
            rerender({ target: { lat: 0, lng: 10 } });
        });

        // Avance de 500 ms (la moitié de l'intervalle attendu) → mi-chemin
        act(() => {
            advanceTime(500);
        });

        expect(result.current!.lng).toBeCloseTo(5, 1);

        // Avance encore 500 ms → arrivée
        act(() => {
            advanceTime(500);
        });

        expect(result.current!.lng).toBeCloseTo(10, 5);
    });

    it('snap immédiat quand le target passe de null à une valeur (1er driverLocation async)', () => {
        const { result, rerender } = renderHook(
            ({ target }: { target: { lat: number; lng: number } | null }) =>
                useSmoothMarker(target, { expectedTickMs: 1000 }),
            { initialProps: { target: null as { lat: number; lng: number } | null } }
        );

        expect(result.current).toBeNull();

        act(() => {
            rerender({ target: { lat: 12, lng: 34 } });
        });

        // Pas d'animation : on doit avoir directement la valeur cible
        expect(result.current).toEqual({ lat: 12, lng: 34 });

        // Avancer le temps ne doit rien changer (pas de rAF en cours)
        act(() => {
            advanceTime(500);
        });
        expect(result.current).toEqual({ lat: 12, lng: 34 });
    });

    it('snap immédiat quand le target est null', () => {
        const { result, rerender } = renderHook(
            ({ target }: { target: { lat: number; lng: number } | null }) =>
                useSmoothMarker(target),
            { initialProps: { target: { lat: 1, lng: 2 } as { lat: number; lng: number } | null } }
        );

        expect(result.current).toEqual({ lat: 1, lng: 2 });

        act(() => {
            rerender({ target: null });
        });

        expect(result.current).toBeNull();
    });
});
