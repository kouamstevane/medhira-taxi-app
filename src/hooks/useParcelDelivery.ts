'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref as rtdbRef, set, remove } from 'firebase/database'
import { db, getFirebaseDatabase } from '@/config/firebase'
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections'

export type ParcelStatus = 'pending' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled'

export interface ParcelDoc {
  parcelId: string
  senderId: string
  receiverId: string
  recipientName: string
  recipientPhone: string
  driverId: string | null
  status: ParcelStatus
  pickupLocation: { address: string; latitude: number; longitude: number; country: string }
  dropoffLocation: { address: string; latitude: number; longitude: number; country: string }
  description: string
  sizeCategory: 'small' | 'medium' | 'large'
  pickupInstructions?: string
  price: number
  currency: string
  distanceKm: number
  createdAt?: unknown
  acceptedAt?: unknown
  pickedUpAt?: unknown
  deliveredAt?: unknown
}

const ACTIVE_PARCEL_STATUSES: ParcelStatus[] = ['accepted', 'in_transit']

export function useParcelDelivery(parcelId: string) {
  const [parcel, setParcel] = useState<ParcelDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<ParcelStatus | null>(null)
  const localStatusRef = useRef<ParcelStatus | null>(null)
  useEffect(() => { localStatusRef.current = localStatus }, [localStatus])

  const gpsWatchIdRef = useRef<number | null>(null)
  const lastEmitRef = useRef<number>(0)

  useEffect(() => {
    if (!parcelId) return
    const unsub = onSnapshot(
      doc(db, FIRESTORE_COLLECTIONS.PARCELS, parcelId),
      (snap) => {
        if (snap.exists()) {
          const data = { parcelId: snap.id, ...snap.data() } as ParcelDoc
          setParcel(data)
          setLocalStatus(data.status)
        } else {
          setParcel(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('[useParcelDelivery] sync error:', err)
        setError('Erreur de connexion aux données')
        setLoading(false)
      }
    )
    return () => unsub()
  }, [parcelId])

  // Emit driver GPS to RTDB while parcel is active (accepted | in_transit)
  useEffect(() => {
    if (!parcelId || !localStatus) return
    const isActive = ACTIVE_PARCEL_STATUSES.includes(localStatus)

    if (isActive && gpsWatchIdRef.current === null && typeof navigator !== 'undefined' && navigator.geolocation) {
      const locationRef = rtdbRef(getFirebaseDatabase(), `delivery_tracking/${parcelId}/location`)
      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now()
          const speed = position.coords.speed ?? 0
          const interval = speed > 1 ? 1000 : 5000
          if (now - lastEmitRef.current < interval) return
          lastEmitRef.current = now
          set(locationRef, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading ?? 0,
            speed,
            updatedAt: now,
          }).catch((err) => {
            console.error('[useParcelDelivery] RTDB write failed:', err)
          })
        },
        (err) => console.error('[useParcelDelivery] GPS error:', err),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      )
    } else if (!isActive && gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current)
      gpsWatchIdRef.current = null
    }

    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current)
        gpsWatchIdRef.current = null
      }
    }
  }, [parcelId, localStatus])

  const updateStatus = useCallback(async (status: ParcelStatus) => {
    const previous = localStatusRef.current
    setLocalStatus(status)
    try {
      const updates: Record<string, unknown> = {
        status,
        updatedAt: serverTimestamp(),
      }
      if (status === 'in_transit') updates.pickedUpAt = serverTimestamp()
      if (status === 'delivered') updates.deliveredAt = serverTimestamp()
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.PARCELS, parcelId), updates)

      // Clean tracking node ourselves on terminal state (cloud function also handles it)
      if (status === 'delivered' || status === 'cancelled') {
        try {
          await remove(rtdbRef(getFirebaseDatabase(), `delivery_tracking/${parcelId}`))
        } catch {
          // ignore — server-side cleanup will handle it
        }
      }
    } catch (err) {
      setLocalStatus(previous)
      console.error('[useParcelDelivery] updateStatus failed:', err)
      throw new Error('Erreur de connexion — réessayez')
    }
  }, [parcelId])

  const effective = useMemo(
    () => (parcel ? { ...parcel, status: localStatus ?? parcel.status } : null),
    [parcel, localStatus]
  )

  return { parcel: effective, loading, error, updateStatus }
}
