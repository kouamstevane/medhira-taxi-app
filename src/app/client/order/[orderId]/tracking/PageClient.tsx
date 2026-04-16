'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

const TrackingMap = dynamic(() => import('./TrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[300px] bg-gray-100 animate-pulse rounded-xl" />,
})

interface OrderData {
  clientAddress?: { address: string; lat: number; lng: number; instructions?: string }
  restaurantAddress?: { address: string; lat: number; lng: number }
  restaurantName?: string
  orderNumber?: string
  status?: string
}

export default function ClientTrackingPage() {
  const params = useParams()
  const orderId = params.orderId as string
  const { driverLocation, isOnline } = useDeliveryTracking(orderId)
  const [order, setOrder] = useState<OrderData | null>(null)

  useEffect(() => {
    if (!orderId) return
    const unsub = onSnapshot(doc(db, 'food_delivery_orders', orderId), (snap) => {
      if (snap.exists()) {
        setOrder(snap.data() as OrderData)
      }
    })
    return () => unsub()
  }, [orderId])

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center size-11 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-11">Suivi de livraison</h1>
        </header>

        <main className="flex-1 p-4 space-y-4">
          <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-400' : 'text-slate-500'}`}>
            <MaterialIcon name={isOnline ? 'location_on' : 'location_off'} className="text-[18px]" />
            {isOnline ? 'Livreur en route — position en temps réel' : 'Position indisponible'}
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10">
            <TrackingMap
              driverLocation={driverLocation}
              restaurantAddress={order?.restaurantAddress}
              clientAddress={order?.clientAddress}
            />
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Détails de la livraison</h2>
            <div className="space-y-4 relative">
              <div className="absolute left-[5px] top-3 bottom-12 w-[1.5px] bg-slate-700" />
              {order?.restaurantAddress && (
                <div className="flex items-start gap-4">
                  <div className="size-3 rounded-full bg-primary ring-4 ring-primary/20 z-10" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Restaurant</p>
                    <p className="text-white text-sm font-medium">{order.restaurantName || order.restaurantAddress.address}</p>
                  </div>
                </div>
              )}
              {order?.clientAddress && (
                <div className="flex items-start gap-4">
                  <div className="size-3 rounded-full border-2 border-white/60 z-10" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Destination</p>
                    <p className="text-white text-sm font-medium">{order.clientAddress.address}</p>
                    {order.clientAddress.instructions && (
                      <p className="text-slate-400 text-xs mt-1">{order.clientAddress.instructions}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            {order?.orderNumber && (
              <div className="border-t border-white/5 pt-4 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Commande</span>
                  <span className="text-white">{order.orderNumber}</span>
                </div>
              </div>
            )}
          </div>

          {!driverLocation && (
            <div className="glass-card rounded-2xl border border-white/10 p-6 text-center">
              <MaterialIcon name="delivery_dining" className="text-slate-600 text-[48px] mb-3" />
              <p className="text-slate-500">Le livreur n&apos;a pas encore démarré</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
