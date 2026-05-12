/**
 * Lissage GPS côté client — filtre de Kalman scalaire 1D × 2 (lat/lng indépendants)
 * avec rejet d'outliers basé sur la vitesse implicite entre deux ticks.
 *
 * Cf. docs/superpowers/specs/2026-05-12-gps-smoothing.md §4.
 *
 * Pas de dépendance externe, pas d'appel réseau.
 */

import { haversineKm } from '@/utils/distance';

export interface GpsSample {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
    speed?: number | null;
    heading?: number | null;
    altitude?: number | null;
}

export interface SmoothingOptions {
    /**
     * Std du drift positionnel par seconde (m/s) — règle la réactivité du filtre.
     * Plus élevé = filtre plus réactif aux changements (suit mieux un véhicule
     * qui accélère). Plus bas = filtre plus lisse (idéal pour un objet quasi-immobile).
     * Défaut 3 (compromis taxi en mouvement urbain).
     */
    processNoiseMps?: number;
    /** Vitesse plausible max (m/s) — au-delà = outlier. Défaut 50 (180 km/h). */
    maxSpeedMps?: number;
    /** Au-delà de ce gap, le filtre se reset. Défaut 30 s. */
    resetThresholdSec?: number;
    /** Précision minimale exposée (m). Défaut 2. */
    minAccuracyM?: number;
}

const DEFAULTS = {
    processNoiseMps: 3,
    maxSpeedMps: 50,
    resetThresholdSec: 30,
    minAccuracyM: 2,
};

const EARTH_M_PER_DEG_LAT = 111_320;

function metersToDegLat(m: number): number {
    return m / EARTH_M_PER_DEG_LAT;
}

function metersToDegLng(m: number, lat: number): number {
    const denom = EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    if (Math.abs(denom) < 1e-9) return m / EARTH_M_PER_DEG_LAT;
    return m / denom;
}

function degLatToMeters(deg: number): number {
    return deg * EARTH_M_PER_DEG_LAT;
}

function degLngToMeters(deg: number, lat: number): number {
    return deg * EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

interface FilterState {
    lat: number;
    lng: number;
    /** Variance lat en degrés². */
    varLat: number;
    /** Variance lng en degrés². */
    varLng: number;
    timestamp: number;
}

export class GpsKalmanFilter {
    private state: FilterState | null = null;
    private readonly opts: Required<SmoothingOptions>;

    constructor(options: SmoothingOptions = {}) {
        this.opts = { ...DEFAULTS, ...options };
    }

    reset(): void {
        this.state = null;
    }

    current(): GpsSample | null {
        if (!this.state) return null;
        return this.stateToSample();
    }

    /**
     * Ajoute une mesure et retourne l'estimé lissé.
     * Retourne null si la mesure est rejetée comme outlier.
     */
    update(sample: GpsSample): GpsSample | null {
        // Clamp accuracy : protège contre 0/négatif/NaN venant du device.
        // Une accuracy nulle ferait gain Kalman = 1 (mesure brute non filtrée).
        const safeSample: GpsSample = {
            ...sample,
            accuracy: Math.max(
                Number.isFinite(sample.accuracy) ? sample.accuracy : this.opts.minAccuracyM,
                this.opts.minAccuracyM
            ),
        };
        sample = safeSample;

        if (!this.state) {
            this.initialize(sample);
            return this.stateToSample(sample);
        }

        const dtSec = (sample.timestamp - this.state.timestamp) / 1000;

        // Gap trop long → reset proprement
        if (dtSec > this.opts.resetThresholdSec || dtSec < 0) {
            this.initialize(sample);
            return this.stateToSample(sample);
        }

        // Rejet outlier vitesse — utilise dt RÉEL (pas le floor) pour détecter
        // les vrais sauts impossibles. Skip si dt sous ~1ms (deux ticks quasi
        // simultanés ne sont pas un signal vitesse fiable).
        const distM =
            haversineKm(
                { lat: this.state.lat, lng: this.state.lng },
                { lat: sample.lat, lng: sample.lng }
            ) * 1000;
        if (dtSec >= 0.001) {
            const impliedSpeed = distM / dtSec;
            if (impliedSpeed > this.opts.maxSpeedMps) {
                return null;
            }
        }

        // dt minimal pour le predict, évite les divisions instables et préserve
        // un peu de filtrage même quand 2 ticks arrivent quasi simultanément.
        const effectiveDt = Math.max(dtSec, 0.05);

        // Predict : ajoute le bruit de process accumulé pendant dt
        const processStdMeters = this.opts.processNoiseMps * effectiveDt;
        const processVarLatDeg = Math.pow(metersToDegLat(processStdMeters), 2);
        const processVarLngDeg = Math.pow(
            metersToDegLng(processStdMeters, this.state.lat),
            2
        );
        this.state.varLat += processVarLatDeg;
        this.state.varLng += processVarLngDeg;

        // Update : variance de mesure
        // accuracy = rayon de confiance à 68% (≈ 1σ horizontal isotrope).
        // Par dimension → σ_dim ≈ accuracy / sqrt(2), donc variance = accuracy² / 2.
        const measVarMeters2 = Math.pow(sample.accuracy, 2) / 2;
        const measVarLatDeg = Math.pow(metersToDegLat(Math.sqrt(measVarMeters2)), 2);
        const measVarLngDeg = Math.pow(
            metersToDegLng(Math.sqrt(measVarMeters2), this.state.lat),
            2
        );

        const kLat = this.state.varLat / (this.state.varLat + measVarLatDeg);
        const kLng = this.state.varLng / (this.state.varLng + measVarLngDeg);

        this.state.lat = this.state.lat + kLat * (sample.lat - this.state.lat);
        this.state.lng = this.state.lng + kLng * (sample.lng - this.state.lng);
        this.state.varLat = (1 - kLat) * this.state.varLat;
        this.state.varLng = (1 - kLng) * this.state.varLng;
        this.state.timestamp = sample.timestamp;

        return this.stateToSample(sample);
    }

    private initialize(sample: GpsSample): void {
        // Variance initiale = variance de la mesure (on n'a aucune info a priori).
        const varM2 = Math.pow(sample.accuracy, 2) / 2;
        this.state = {
            lat: sample.lat,
            lng: sample.lng,
            varLat: Math.pow(metersToDegLat(Math.sqrt(varM2)), 2),
            varLng: Math.pow(metersToDegLng(Math.sqrt(varM2), sample.lat), 2),
            timestamp: sample.timestamp,
        };
    }

    private stateToSample(passthrough?: GpsSample): GpsSample {
        if (!this.state) {
            throw new Error('stateToSample appelé sans état initialisé');
        }
        // Reconvertit la variance en mètres pour exposer une "accuracy" lissée.
        const stdLatM = degLatToMeters(Math.sqrt(this.state.varLat));
        const stdLngM = degLngToMeters(Math.sqrt(this.state.varLng), this.state.lat);
        const accuracyM = Math.max(
            Math.sqrt(stdLatM * stdLatM + stdLngM * stdLngM),
            this.opts.minAccuracyM
        );
        return {
            lat: this.state.lat,
            lng: this.state.lng,
            accuracy: accuracyM,
            timestamp: this.state.timestamp,
            speed: passthrough?.speed ?? null,
            heading: passthrough?.heading ?? null,
            altitude: passthrough?.altitude ?? null,
        };
    }
}
