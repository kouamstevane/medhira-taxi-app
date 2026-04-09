'use client'
import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/config/firebase'
import type { DriverRating } from '@/types/firestore-collections'

type PeriodFilter = '7days' | '30days' | 'all'

export function useDriverRatings(uid: string, period: PeriodFilter = 'all') {
  const [ratings, setRatings] = useState<DriverRating[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    const constraints = [
      where('driverId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    ]
    const q = query(collection(db, 'driver_ratings'), ...constraints)
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now()
      const msFilter = period === '7days' ? 7 * 86400000 :
                       period === '30days' ? 30 * 86400000 : Infinity
      const allRatings = snap.docs.map(d => ({ ratingId: d.id, ...d.data() } as DriverRating))
      const filtered = msFilter === Infinity ? allRatings : allRatings.filter(r => {
        const ts = (r.createdAt as unknown as { toMillis?: () => number }).toMillis?.() ?? 0
        return (now - ts) < msFilter
      })
      setRatings(filtered)
      setLoading(false)
    })
    return () => unsub()
  }, [uid, period])

  const avgScore = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
    : null

  return { ratings, avgScore, loading }
}
