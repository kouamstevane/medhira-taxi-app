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
} {
  const [location, setLocation] = useState<DriverLocation | null>(null)

  useEffect(() => {
    if (!orderId) return
    const trackingRef = ref(rtdb, `delivery_tracking/${orderId}/location`)
    const unsub = onValue(trackingRef, (snap) => {
      setLocation(snap.val() as DriverLocation | null)
    })
    return () => unsub()
  }, [orderId])

  const isOnline = location != null && (Date.now() - location.updatedAt) < 10000

  return {
    driverLocation: location ? { lat: location.lat, lng: location.lng, heading: location.heading } : null,
    isOnline,
  }
}
