'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections'
import type { ParcelDoc } from '@/hooks/useParcelDelivery'

interface Props {
  uid: string
}

export default function ParcelOrdersList({ uid }: Props) {
  const router = useRouter()
  const [parcels, setParcels] = useState<ParcelDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    const q = query(
      collection(db, FIRESTORE_COLLECTIONS.PARCELS),
      where('driverId', '==', uid),
      where('status', 'in', ['accepted', 'in_transit']),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setParcels(snap.docs.map((d) => ({ parcelId: d.id, ...d.data() } as ParcelDoc)))
        setLoading(false)
      },
      (err) => {
        console.error('[ParcelOrdersList] sync error:', err)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [uid])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (parcels.length === 0) {
    return (
      <div className="glass-card rounded-2xl border border-white/10 p-6 text-center">
        <MaterialIcon name="inventory_2" className="text-slate-600 text-[48px] mb-3" />
        <p className="text-slate-500">Aucun colis assigné</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {parcels.map((p) => (
        <button
          key={p.parcelId}
          onClick={() => router.push(`/driver/parcel/${p.parcelId}`)}
          className="glass-card w-full p-4 rounded-2xl border border-white/10 text-left hover:border-primary/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-white truncate max-w-[70%]">{p.description}</p>
            <span className="text-xs text-primary font-medium">{p.sizeCategory}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <MaterialIcon name="my_location" className="text-[14px]" />
            <span className="truncate">{p.pickupLocation.address}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <MaterialIcon name="location_on" className="text-[14px]" />
            <span className="truncate">{p.dropoffLocation.address}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-lg ${
              p.status === 'accepted' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'
            }`}>
              {p.status === 'accepted' ? 'À récupérer' : 'En transit'}
            </span>
            <p className="text-white font-bold">{p.price.toFixed(2)} {p.currency}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
