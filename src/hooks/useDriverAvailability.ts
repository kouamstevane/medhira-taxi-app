import { useEffect, useRef } from 'react'
import { getDatabase, ref, set } from 'firebase/database'
import { auth } from '@/config/firebase'
import { useDriverStore } from '@/store/driverStore'

/**
 * Hook gérant l'émission GPS du livreur quand il est disponible.
 *
 * Comportements:
 * - Si driverType inclut "livreur" ET isAvailable=true ET activeDeliveryOrderId=null
 *   → Émettre position vers `driver_locations/{uid}` toutes les secondes
 * - Si driverType="chauffeur" ou isAvailable=false ou activeDeliveryOrderId!=null
 *   → Ne rien émettre (la position est gérée par le sous-système taxi existant)
 */
export function useDriverAvailability() {
  const { driver } = useDriverStore()
  const gpsWatchIdRef = useRef<number | null>(null)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid || !driver) return

    const shouldTrack =
      (driver.driverType === 'livreur' || driver.driverType === 'les_deux') &&
      driver.isAvailable &&
      driver.activeDeliveryOrderId == null

    // Démarrer le tracking si conditions réunies
    if (shouldTrack && gpsWatchIdRef.current === null) {
      const rtdb = getDatabase()
      const locationRef = ref(rtdb, `driver_locations/${uid}`)

      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          set(locationRef, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed ?? 0,
            heading: position.coords.heading ?? 0,
            timestamp: Date.now(),
          })
        },
        (error) => {
          console.error('[useDriverAvailability] GPS error:', error)
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000,
        }
      )

      console.log('[useDriverAvailability] GPS tracking STARTED')
    }
    // Arrêter le tracking si conditions non remplies
    else if (!shouldTrack && gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current)
      gpsWatchIdRef.current = null

      // Supprimer la position RTDB
      const rtdb = getDatabase()
      set(ref(rtdb, `driver_locations/${uid}`), null)

      console.log('[useDriverAvailability] GPS tracking STOPPED')
    }

    // Cleanup
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current)
        gpsWatchIdRef.current = null
      }
    }
  }, [driver?.driverType, driver?.isAvailable, driver?.activeDeliveryOrderId])
}
