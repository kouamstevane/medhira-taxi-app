/**
 * Tests unitaires GpsKalmanFilter.
 * Couvre AC1, AC2, AC3 du spec docs/superpowers/specs/2026-05-12-gps-smoothing.md.
 */

import { GpsKalmanFilter, GpsSample } from '@/utils/gpsSmoothing';
import { haversineKm } from '@/utils/distance';

// Générateur Gaussien Box-Muller à seed (pour reproductibilité).
function makeRng(seed: number) {
    let s = seed;
    const rand = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
    return () => {
        let u = 0;
        let v = 0;
        while (u === 0) u = rand();
        while (v === 0) v = rand();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
}

describe('GpsKalmanFilter', () => {
    describe('AC1 — convergesAtRest', () => {
        it('converge vers le centre réel après 40 mesures bruitées (filtre stationnaire)', () => {
            const trueLat = 48.8566;
            const trueLng = 2.3522;
            const accuracyM = 20;
            // Tuning "stationnaire" : faible bruit de process pour permettre la
            // convergence en dessous de l'accuracy de mesure. Le défaut (3 m/s²)
            // est calibré pour un véhicule en mouvement.
            const filter = new GpsKalmanFilter({ processNoiseMps: 0.3 });
            const gauss = makeRng(42);

            // 1° lat ≈ 111 320 m, 1° lng à Paris ≈ 73 700 m
            const stdDegLat = accuracyM / Math.sqrt(2) / 111320;
            const stdDegLng = accuracyM / Math.sqrt(2) / 73700;

            let result: GpsSample | null = null;
            for (let i = 0; i < 40; i++) {
                const sample: GpsSample = {
                    lat: trueLat + gauss() * stdDegLat,
                    lng: trueLng + gauss() * stdDegLng,
                    accuracy: accuracyM,
                    timestamp: 1000 + i * 1000,
                };
                result = filter.update(sample);
            }

            expect(result).not.toBeNull();
            const errorM =
                haversineKm(
                    { lat: result!.lat, lng: result!.lng },
                    { lat: trueLat, lng: trueLng }
                ) * 1000;
            expect(errorM).toBeLessThan(5);
        });
    });

    describe('AC2 — rejectsImpossibleSpeed', () => {
        it('rejette une mesure impliquant une vitesse > maxSpeedMps', () => {
            const filter = new GpsKalmanFilter();
            const first = filter.update({
                lat: 48.8566,
                lng: 2.3522,
                accuracy: 10,
                timestamp: 1000,
            });
            expect(first).not.toBeNull();

            // ~1 km au nord en 1 s = 1000 m/s, bien au-dessus de 50 m/s
            const outlier = filter.update({
                lat: 48.8566 + 1000 / 111320,
                lng: 2.3522,
                accuracy: 10,
                timestamp: 2000,
            });
            expect(outlier).toBeNull();
        });

        it('accepte une mesure plausible en haute vitesse réaliste', () => {
            const filter = new GpsKalmanFilter();
            filter.update({
                lat: 48.8566,
                lng: 2.3522,
                accuracy: 10,
                timestamp: 1000,
            });
            // ~30 m en 1 s = 30 m/s (108 km/h), réaliste
            const next = filter.update({
                lat: 48.8566 + 30 / 111320,
                lng: 2.3522,
                accuracy: 10,
                timestamp: 2000,
            });
            expect(next).not.toBeNull();
        });
    });

    describe('AC3 — resetsAfterLongGap', () => {
        it('accepte une mesure éloignée après un gap > resetThresholdSec', () => {
            const filter = new GpsKalmanFilter();
            filter.update({
                lat: 48.8566,
                lng: 2.3522,
                accuracy: 10,
                timestamp: 1000,
            });
            // 60 s plus tard, à 500 m → impliquerait ~8 m/s, normalement OK,
            // mais surtout : on veut vérifier que le reset autorise même un
            // saut beaucoup plus grand.
            const farAfterGap = filter.update({
                lat: 48.8566 + 5000 / 111320, // 5 km
                lng: 2.3522,
                accuracy: 10,
                timestamp: 1000 + 60_000,
            });
            expect(farAfterGap).not.toBeNull();
            // Et la nouvelle position devient le point de départ
            expect(farAfterGap!.lat).toBeCloseTo(48.8566 + 5000 / 111320, 5);
        });
    });

    describe('current() et reset()', () => {
        it('retourne null avant le premier update', () => {
            const filter = new GpsKalmanFilter();
            expect(filter.current()).toBeNull();
        });

        it('reset() remet à zéro', () => {
            const filter = new GpsKalmanFilter();
            filter.update({ lat: 1, lng: 2, accuracy: 10, timestamp: 100 });
            expect(filter.current()).not.toBeNull();
            filter.reset();
            expect(filter.current()).toBeNull();
        });
    });
});
