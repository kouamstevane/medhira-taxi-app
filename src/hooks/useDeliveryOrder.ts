// src/hooks/useDeliveryOrder.ts
'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getDatabase, ref as rtdbRef, set } from 'firebase/database'
import { db, storage, auth } from '@/config/firebase'
import { retryWithBackoff } from '@/utils/retry'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'

const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'assigned', 'heading_to_restaurant', 'arrived_restaurant',
  'picked_up', 'heading_to_client', 'arrived_client',
]

export function validatePin(orderPin: string, input: string): boolean {
  return orderPin === input
}

export function useDeliveryOrder(orderId: string) {
  const [order, setOrder] = useState<FoodDeliveryOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState<DeliveryStatus | null>(null)
  const gpsWatchIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!orderId) return
    const unsub = onSnapshot(doc(db, 'food_delivery_orders', orderId), (snap) => {
      const data = snap.exists() ? ({ orderId: snap.id, ...snap.data() } as FoodDeliveryOrder) : null
      setOrder(data)
      if (data) setLocalStatus(data.status)
      setLoading(false)
    })
    return () => unsub()
  }, [orderId])

  // GPS RTDB emission — throttled 1Hz — active during delivery
  useEffect(() => {
    if (!orderId || !localStatus) return
    const isActive = ACTIVE_DELIVERY_STATUSES.includes(localStatus)

    if (isActive && gpsWatchIdRef.current === null) {
      const rtdb = getDatabase()
      const locationRef = rtdbRef(rtdb, `delivery_tracking/${orderId}/location`)

      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          set(locationRef, {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading ?? 0,
            speed: position.coords.speed ?? 0,
            updatedAt: Date.now(),
          })
        },
        (error) => {
          console.error('[useDeliveryOrder] GPS error:', error)
        },
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
  }, [orderId, localStatus])

  // Optimistic UI
  const updateStatus = useCallback(async (status: DeliveryStatus) => {
    const previousStatus = localStatus
    setLocalStatus(status)
    try {
      await updateDoc(doc(db, 'food_delivery_orders', orderId), {
        status,
        updatedAt: serverTimestamp(),
      })
    } catch {
      setLocalStatus(previousStatus)
      throw new Error('Erreur de connexion — réessayez')
    }
  }, [orderId, localStatus])

  const refuseOrder = useCallback(async () => {
    await updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'refused' as DeliveryStatus,
      updatedAt: serverTimestamp(),
    })
  }, [orderId])

  const confirmPickup = useCallback(async () => {
    await updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'picked_up' as DeliveryStatus,
      updatedAt: serverTimestamp(),
    })
  }, [orderId])

  const uploadProofPhoto = useCallback(async (file: File): Promise<string> => {
    const fileRef = storageRef(storage, `delivery_proofs/${orderId}/${Date.now()}.jpg`)
    return retryWithBackoff(
      async () => {
        await uploadBytes(fileRef, file)
        return getDownloadURL(fileRef)
      },
      { maxAttempts: 3, baseDelay: 1000 }
    )
  }, [orderId])

  // confirmDelivery NON optimiste — bloquant jusqu'à confirmation Firestore
  const confirmDelivery = useCallback(async (method: 'photo' | 'pin', payload: string) => {
    const update: Record<string, unknown> = {
      status: 'delivered' as DeliveryStatus,
      deliveredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    if (method === 'photo') update.proofPhotoUrl = payload
    await updateDoc(doc(db, 'food_delivery_orders', orderId), update)
  }, [orderId])

  const reportNotReady = useCallback(async () => {
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (!order?.restaurantWaitingStartedAt) {
      updates.restaurantWaitingStartedAt = serverTimestamp()
    }
    await updateDoc(doc(db, 'food_delivery_orders', orderId), updates)
  }, [orderId, order])

  const localValidatePin = useCallback((pin: string): boolean => {
    return order?.pinCode != null ? validatePin(order.pinCode, pin) : false
  }, [order])

  const effectiveOrder = order
    ? { ...order, status: localStatus ?? order.status }
    : null

  return {
    order: effectiveOrder,
    loading,
    updateStatus,
    refuseOrder,
    confirmPickup,
    confirmDelivery,
    uploadProofPhoto,
    validatePin: localValidatePin,
    reportNotReady,
  }
}
