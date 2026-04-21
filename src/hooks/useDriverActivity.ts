'use client'
import { useEffect, useRef, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/config/firebase'

export interface ActivityRecord {
  id: string
  type: 'taxi' | 'livraison'
  description: string
  date: string
  amount: number
}

interface ActivityTotals {
  total: number
  taxi: number
  livraison: number
}

export function useDriverActivity(uid: string): {
  records: ActivityRecord[]
  totals: ActivityTotals
  loading: boolean
} {
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }

    const taxiRecordsRef: ActivityRecord[] = []
    const deliveryRecordsRef: ActivityRecord[] = []
    let taxiLoaded = false
    let deliveryLoaded = false

    const mergeAndSort = () => {
      const merged = [...taxiRecordsRef, ...deliveryRecordsRef].sort((a, b) => b.date.localeCompare(a.date))
      setRecords(merged)
    }

    const checkDone = () => {
      if (taxiLoaded && deliveryLoaded) {
        mergeAndSort()
        setLoading(false)
      }
    }

    const taxiQuery = query(
      collection(db, 'bookings'),
      where('driverId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsubTaxi = onSnapshot(taxiQuery, (snap) => {
      taxiRecordsRef.length = 0
      snap.docs.forEach(d => {
        const data = d.data()
        const ts = data.createdAt instanceof Timestamp
          ? data.createdAt.toDate()
          : new Date(data.createdAt ?? Date.now())
        taxiRecordsRef.push({
          id: d.id,
          type: 'taxi',
          description: `Course — ${data.pickupAddress ?? 'Départ inconnu'}`,
          date: ts.toLocaleDateString('fr-CA'),
          amount: typeof data.fare === 'number' ? data.fare : 0,
        })
      })
      taxiLoaded = true
      mergeAndSort()
      checkDone()
    })

    const deliveryQuery = query(
      collection(db, 'food_delivery_orders'),
      where('driverId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsubDelivery = onSnapshot(deliveryQuery, (snap) => {
      deliveryRecordsRef.length = 0
      snap.docs.forEach(d => {
        const data = d.data()
        const ts = data.createdAt instanceof Timestamp
          ? data.createdAt.toDate()
          : new Date(data.createdAt ?? Date.now())
        deliveryRecordsRef.push({
          id: d.id,
          type: 'livraison',
          description: `Livraison — ${data.restaurantName ?? 'Restaurant inconnu'}`,
          date: ts.toLocaleDateString('fr-CA'),
          amount: typeof data.driverEarnings === 'number' ? data.driverEarnings : 0,
        })
      })
      deliveryLoaded = true
      mergeAndSort()
      checkDone()
    })

    return () => {
      unsubTaxi()
      unsubDelivery()
    }
  }, [uid])

  const totals: ActivityTotals = {
    total: records.reduce((s, r) => s + r.amount, 0),
    taxi: records.filter(r => r.type === 'taxi').reduce((s, r) => s + r.amount, 0),
    livraison: records.filter(r => r.type === 'livraison').reduce((s, r) => s + r.amount, 0),
  }

  return { records, totals, loading }
}
