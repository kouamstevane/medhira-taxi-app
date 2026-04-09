// src/hooks/useDeliveryOrder.ts
'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, auth } from '@/config/firebase'  // auth importé
import { retryWithBackoff } from '@/utils/retry'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'

export function validatePin(orderPin: string, input: string): boolean {
  return orderPin === input
}

export function useDeliveryOrder(orderId: string) {
  const [order, setOrder] = useState<FoodDeliveryOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState<DeliveryStatus | null>(null)

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
    const storageRef = ref(storage, `delivery_proofs/${orderId}/${Date.now()}.jpg`)
    return retryWithBackoff(
      async () => {
        await uploadBytes(storageRef, file)
        return getDownloadURL(storageRef)
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
