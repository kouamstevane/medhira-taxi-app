'use client'
import { useState } from 'react'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import type { FoodDeliveryOrder, DeliveryStatus } from '@/types/firestore-collections'

interface Props {
  order: FoodDeliveryOrder
  updateStatus: (status: DeliveryStatus) => Promise<void>
  confirmPickup: () => Promise<void>
  reportNotReady: () => Promise<void>
}

export default function Level4_WaitingPickup({ order, updateStatus, confirmPickup, reportNotReady }: Props) {
  const [loading, setLoading] = useState(false)
  const [reporting, setReporting] = useState(false)
  return (
    <div className="min-h-screen bg-background text-white flex flex-col p-4">
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <MaterialIcon name="hourglass_empty" className="text-amber-400 text-[64px]" />
        <div className="text-center">
          <h2 className="text-xl font-bold">En attente de la commande</h2>
          <p className="text-slate-400 mt-1">{order.restaurantName}</p>
        </div>
      </div>
      <div className="space-y-3">
        <button
          onClick={async () => { setReporting(true); try { await reportNotReady() } finally { setReporting(false) } }}
          disabled={reporting || loading}
          className="w-full h-12 border border-amber-500/30 text-amber-400 rounded-2xl text-sm"
        >
          {reporting ? '...' : 'Commande pas encore prête'}
        </button>
        <button
          onClick={async () => { setLoading(true); try { await confirmPickup() } finally { setLoading(false) } }}
          disabled={loading || reporting}
          className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
        >
          {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "J'ai récupéré la commande"}
        </button>
      </div>
    </div>
  )
}
