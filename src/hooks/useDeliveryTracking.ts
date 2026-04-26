'use client'
import { useEffect, useState } from 'react'
import { ref, onValue } from 'firebase/database'
import { rtdb } from '@/config/firebase'

interface DriverLocation {
  lat: number
  lng: number
  heading: number
  speed: number
  updatedAt: number
}

export function useDeliveryTracking(orderId: string | null): {
  driverLocation: { lat: number; lng: number; heading: number } | null
  isOnline: boolean
  error: string | null
} {
  const [location, setLocation] = useState<DriverLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!orderId) return
    const trackingRef = ref(rtdb, `delivery_tracking/${orderId}/location`)
    const unsub = onValue(trackingRef, (snap) => {
      setLocation(snap.val() as DriverLocation | null)
    }, (err) => {
      console.error('[useDeliveryTracking] Erreur de synchronisation:', err)
      setError('Erreur de connexion aux données')
    })
    return () => unsub()
  }, [orderId])

  // Tick every 5s so isOnline flips to false when updates stop arriving
  useEffect(() => {
    if (!orderId) return
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [orderId])

  const isOnline = location != null && (now - location.updatedAt) < 10000

  return {
    driverLocation: location ? { lat: location.lat, lng: location.lng, heading: location.heading } : null,
    isOnline,
    error,
  }
}
