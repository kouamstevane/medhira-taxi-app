import { registerPlugin } from '@capacitor/core'

export interface LocationData {
    lat: number
    lng: number
    accuracy: number
    speed: number
    heading: number
    timestamp: number
}

export interface StartTrackingOptions {
    driverId: string
    tripId?: string
    throttleInterval?: number
}

export interface TrackingStatus {
    isTracking: boolean
    hasPermissions: boolean
    lastLocation?: LocationData
}

export interface BackgroundGeolocationPlugin {
    startTracking(options: StartTrackingOptions): Promise<void>
    stopTracking(): Promise<{ stopped: boolean }>
    getCurrentStatus(): Promise<TrackingStatus>
    addListener(eventName: 'location', callback: (data: LocationData) => void): Promise<{
        remove: () => Promise<void>
    }>
    removeAllListeners(): Promise<void>
}

export const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
    'BackgroundGeolocation'
)

type LocationListener = (data: LocationData) => void

export class FallbackBackgroundGeolocation implements BackgroundGeolocationPlugin {
    private watchId: string | null = null
    private listeners: LocationListener[] = []
    private isTracking = false
    private lastLocation: LocationData | undefined

    async startTracking(options: StartTrackingOptions): Promise<void> {
        if (this.isTracking) return

        this.isTracking = true

        try {
            const { Geolocation } = await import('@capacitor/geolocation')
            await Geolocation.requestPermissions()

            this.watchId = await Geolocation.watchPosition(
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                },
                (position, err) => {
                    if (err || !position) return

                    const location: LocationData = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        speed: position.coords.speed ?? 0,
                        heading: position.coords.heading ?? 0,
                        timestamp: position.timestamp,
                    }

                    this.lastLocation = location
                    this.listeners.forEach(cb => cb(location))
                }
            )
        } catch (error) {
            this.isTracking = false
            throw error
        }
    }

    async stopTracking(): Promise<{ stopped: boolean }> {
        if (this.watchId !== null) {
            try {
                const { Geolocation } = await import('@capacitor/geolocation')
                await Geolocation.clearWatch({ id: this.watchId })
            } catch {
                // ignore
            }
            this.watchId = null
        }
        this.isTracking = false
        return { stopped: true }
    }

    async getCurrentStatus(): Promise<TrackingStatus> {
        return {
            isTracking: this.isTracking,
            hasPermissions: true,
            lastLocation: this.lastLocation,
        }
    }

    async addListener(_eventName: 'location', callback: LocationListener): Promise<{
        remove: () => Promise<void>
    }> {
        this.listeners.push(callback)
        const idx = this.listeners.length - 1
        return {
            remove: async () => {
                this.listeners.splice(idx, 1)
            },
        }
    }

    async removeAllListeners(): Promise<void> {
        this.listeners = []
    }
}