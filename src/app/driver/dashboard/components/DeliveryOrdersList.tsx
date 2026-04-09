// src/app/driver/dashboard/components/DeliveryOrdersList.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder } from '@/types/firestore-collections'

interface Props {
  uid: string
}

export default function DeliveryOrdersList({ uid }: Props) {
  const router = useRouter()
  const [orders, setOrders] = useState<FoodDeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) return
    const q = query(
      collection(db, 'food_delivery_orders'),
      where('driverId', '==', uid),
      where('status', 'in', ['assigned', 'heading_to_restaurant', 'arrived_restaurant', 'waiting', 'picked_up', 'heading_to_client', 'arrived_client']),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map(d => ({ orderId: d.id, ...d.data() } as FoodDeliveryOrder)))
      setLoading(false)
    })
    return () => unsub()
  }, [uid])

  if (loading) return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (orders.length === 0) return (
    <div className="glass-card rounded-2xl border border-white/10 p-6 text-center">
      <MaterialIcon name="delivery_dining" className="text-slate-600 text-[48px] mb-3" />
      <p className="text-slate-500">En attente de commandes…</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <button
          key={order.orderId}
          onClick={() => router.push(`/driver/delivery/${order.orderId}`)}
          className="glass-card w-full p-4 rounded-2xl border border-white/10 text-left hover:border-primary/30 transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-white">{order.restaurantName}</p>
            <span className="text-xs text-primary font-medium">{order.orderNumber}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <MaterialIcon name="location_on" className="text-[14px]" />
            <span className="truncate">{order.clientNeighbourhood}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-lg ${
              order.status === 'assigned' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'
            }`}>
              {order.status.replace(/_/g, ' ')}
            </span>
            <p className="text-white font-bold">{order.driverEarnings?.toFixed(2)} $</p>
          </div>
        </button>
      ))}
    </div>
  )
}
