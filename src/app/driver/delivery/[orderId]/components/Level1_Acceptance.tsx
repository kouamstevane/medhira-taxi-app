'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'

interface Props {
  order: FoodDeliveryOrder
  updateStatus: (status: DeliveryStatus) => Promise<void>
  onRefuse?: () => Promise<void>
}

export default function Level1_Acceptance({ order, updateStatus, onRefuse }: Props) {
  const [accepting, setAccepting] = useState(false)
  const [refusing, setRefusing] = useState(false)

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="glass-card rounded-2xl border border-white/10 p-6 w-full max-w-sm space-y-5">
        <div className="text-center">
          <MaterialIcon name="delivery_dining" className="text-primary text-[56px]" />
          <h2 className="text-xl font-bold text-white mt-2">Nouvelle commande</h2>
          <p className="text-slate-400 text-sm mt-1">{order.restaurantName}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <MaterialIcon name="receipt" className="text-[18px] text-slate-500" />
            <span>{order.orderNumber} — {order.orderItems.length} article(s)</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <MaterialIcon name="location_on" className="text-[18px] text-slate-500" />
            <span>Livraison : {order.clientNeighbourhood}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <MaterialIcon name="payments" className="text-[18px] text-slate-500" />
            <span>Gains : <span className="text-primary font-bold">{order.driverEarnings?.toFixed(2)} $</span></span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={async () => { setRefusing(true); try { await onRefuse?.() } finally { setRefusing(false) } }}
            disabled={refusing || accepting}
            className="flex-1 h-12 border border-white/10 text-slate-400 rounded-2xl text-sm disabled:opacity-40"
          >
            {refusing ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto" /> : 'Refuser'}
          </button>
          <button
            onClick={async () => { setAccepting(true); try { await updateStatus('heading_to_restaurant') } finally { setAccepting(false) } }}
            disabled={accepting || refusing}
            className="flex-2 flex-grow h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl disabled:opacity-40"
          >
            {accepting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Accepter'}
          </button>
        </div>
      </div>
    </div>
  )
}
