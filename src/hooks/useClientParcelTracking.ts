'use client'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { ref, onValue, off } from 'firebase/database'
import { db, getFirebaseDatabase } from '@/config/firebase'
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections'
import type { ParcelDoc } from './useParcelDelivery'

interface DriverLocationRTDB {
  lat: number
  lng: number
  heading?: number
  speed?: number
  updatedAt: number
}

export function useClientParcelTracking(parcelId: string | null) {
  const [parcel, setParcel] = useState<ParcelDoc | null>(null)
  const [parcelLoading, setParcelLoading] = useState(true)
  const [parcelError, setParcelError] = useState<string | null>(null)

  const [driverLocation, setDriverLocation] = useState<DriverLocationRTDB | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!parcelId) return
    const unsub = onSnapshot(
      doc(db, FIRESTORE_COLLECTIONS.PARCELS, parcelId),
      (snap) => {
        setParcel(snap.exists() ? ({ parcelId: snap.id, ...snap.data() } as ParcelDoc) : null)
        setParcelLoading(false)
      },
      (err) => {
        console.error('[useClientParcelTracking] parcel sync error:', err)
        setParcelError('Impossible de charger le colis')
        setParcelLoading(false)
      }
    )
    return () => unsub()
  }, [parcelId])

  useEffect(() => {
    if (!parcelId) return
    const trackingRef = ref(getFirebaseDatabase(), `delivery_tracking/${parcelId}/location`)
    const handler = (snap: import('firebase/database').DataSnapshot) => {
      setDriverLocation(snap.val() as DriverLocationRTDB | null)
    }
    onValue(trackingRef, handler, (err) => {
      console.error('[useClientParcelTracking] tracking sync error:', err)
    })
    return () => off(trackingRef, 'value', handler)
  }, [parcelId])

  useEffect(() => {
    if (!parcelId) return
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [parcelId])

  const isDriverOnline = driverLocation != null && (now - driverLocation.updatedAt) < 15000

  return {
    parcel,
    parcelLoading,
    parcelError,
    driverLocation: driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng, heading: driverLocation.heading ?? 0 } : null,
    isDriverOnline,
  }
}
