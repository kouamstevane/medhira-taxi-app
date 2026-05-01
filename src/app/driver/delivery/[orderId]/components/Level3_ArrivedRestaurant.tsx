'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'
import DriverFoodContacts from './DriverFoodContacts'

interface Props {
  order: FoodDeliveryOrder
  updateStatus: (status: DeliveryStatus) => Promise<void>
}

export default function Level3_ArrivedRestaurant({ order, updateStatus }: Props) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="min-h-screen bg-background text-white flex flex-col p-4">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <MaterialIcon name="store" className="text-primary text-[64px]" />
        <div className="text-center">
          <h2 className="text-xl font-bold">Arrivé au restaurant</h2>
          <p className="text-slate-400 mt-1">Commande {order.orderNumber}</p>
        </div>
        <div className="glass-card rounded-2xl border border-white/10 p-4 w-full max-w-sm space-y-2">
          {order.orderItems.map((item, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-300">{item.qty}x {item.name}</span>
              <span className="text-white">{(item.price * item.qty).toFixed(2)} $</span>
            </div>
          ))}
        </div>
        <DriverFoodContacts order={order} target="restaurant" />
      </div>
      <button
        onClick={async () => { setLoading(true); try { await updateStatus('waiting') } finally { setLoading(false) } }}
        disabled={loading}
        className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "En attente de la commande"}
      </button>
    </div>
  )
}
