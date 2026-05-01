'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'
import DriverFoodContacts from './DriverFoodContacts'

interface Props {
  order: FoodDeliveryOrder
  updateStatus: (status: DeliveryStatus) => Promise<void>
}

export default function Level2_HeadingToRestaurant({ order, updateStatus }: Props) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="min-h-screen bg-background text-white flex flex-col p-4">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <MaterialIcon name="directions" className="text-primary text-[64px]" />
        <div className="text-center">
          <h2 className="text-xl font-bold">En route vers le restaurant</h2>
          <p className="text-slate-400 mt-1">{order.restaurantName}</p>
          <p className="text-slate-500 text-sm mt-1">{order.restaurantAddress?.address}</p>
        </div>
        <a href={`tel:${order.restaurantPhone}`}
          className="flex items-center gap-2 text-primary border border-primary/30 rounded-xl px-4 py-2 text-sm">
          <MaterialIcon name="phone" className="text-[16px]" /> Appeler le restaurant
        </a>
        <DriverFoodContacts order={order} target="restaurant" />
      </div>
      <button
        onClick={async () => { setLoading(true); try { await updateStatus('arrived_restaurant') } finally { setLoading(false) } }}
        disabled={loading}
        className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "Je suis arrivé au restaurant"}
      </button>
    </div>
  )
}
