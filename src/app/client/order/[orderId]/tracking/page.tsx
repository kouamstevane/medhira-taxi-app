'use client'
import { useParams } from 'next/navigation'
import { useDeliveryTracking } from '@/hooks/useDeliveryTracking'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

export default function ClientTrackingPage() {
  const params = useParams()
  const orderId = params.orderId as string
  const { driverLocation, isOnline } = useDeliveryTracking(orderId)

  return (
    <div className="min-h-screen bg-background text-white p-4">
      <h1 className="text-xl font-bold mb-4">Suivi de votre livraison</h1>

      <div className={`flex items-center gap-2 mb-4 text-sm ${isOnline ? 'text-green-400' : 'text-slate-500'}`}>
        <MaterialIcon name={isOnline ? 'location_on' : 'location_off'} className="text-[18px]" />
        {isOnline ? 'Livreur en route — position en temps réel' : 'Position indisponible'}
      </div>

      {driverLocation ? (
        <div className="glass-card rounded-2xl border border-white/10 p-4">
          <p className="text-slate-400 text-sm">Position du livreur</p>
          <p className="font-mono text-white mt-1">
            {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Direction : {driverLocation.heading.toFixed(0)}°</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-white/10 p-6 text-center">
          <MaterialIcon name="delivery_dining" className="text-slate-600 text-[48px] mb-3" />
          <p className="text-slate-500">Le livreur n&apos;a pas encore démarré</p>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-4 text-center">
        Note : Carte interactive Google Maps disponible en V2
      </p>
    </div>
  )
}
