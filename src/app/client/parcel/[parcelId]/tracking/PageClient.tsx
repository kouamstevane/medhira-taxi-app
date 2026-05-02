'use client'

import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useClientParcelTracking } from '@/hooks/useClientParcelTracking'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

const ParcelTrackingMap = dynamic(() => import('./ParcelTrackingMap'), {
  ssr: false,
  loading: () => <div className="w-full h-[300px] bg-white/5 animate-pulse rounded-xl" />,
})

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente d\'un chauffeur',
  accepted: 'Chauffeur en route vers le retrait',
  in_transit: 'Colis en transit',
  delivered: 'Colis livré',
  cancelled: 'Annulé',
}

const STATUS_STEPS = ['pending', 'accepted', 'in_transit', 'delivered'] as const

export default function ClientParcelTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const parcelId = params.parcelId as string

  const { parcel, parcelLoading, parcelError, driverLocation, isDriverOnline } =
    useClientParcelTracking(parcelId)

  if (parcelLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (parcelError || !parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="glass-card p-6 rounded-2xl border border-white/10 text-center max-w-sm">
          <MaterialIcon name="error_outline" className="text-red-400 text-[48px] mb-3" />
          <p className="text-white font-bold mb-2">Colis introuvable</p>
          <p className="text-slate-400 text-sm mb-4">{parcelError ?? 'Ce colis n\'existe pas ou vous n\'y avez pas accès.'}</p>
          <button
            onClick={() => router.back()}
            className="w-full h-12 bg-primary text-white font-bold rounded-xl"
          >
            Retour
          </button>
        </div>
      </div>
    )
  }

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s === parcel.status)
  const isCancelled = parcel.status === 'cancelled'

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col pb-8">
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center justify-center size-11 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-11">Suivi du colis</h1>
        </header>

        <main className="flex-1 p-4 space-y-4">
          <div className={`flex items-center gap-2 text-sm ${isDriverOnline ? 'text-green-400' : 'text-slate-500'}`}>
            <MaterialIcon name={isDriverOnline ? 'location_on' : 'location_off'} className="text-[18px]" />
            {isDriverOnline ? 'Chauffeur en mouvement — position en temps réel' : 'Position du chauffeur indisponible'}
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10">
            <ParcelTrackingMap
              driverLocation={driverLocation}
              pickup={{ lat: parcel.pickupLocation.latitude, lng: parcel.pickupLocation.longitude }}
              dropoff={{ lat: parcel.dropoffLocation.latitude, lng: parcel.dropoffLocation.longitude }}
            />
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5">
            <h2 className="text-sm font-bold text-white mb-3 uppercase tracking-wide">Statut</h2>
            {isCancelled ? (
              <div className="flex items-center gap-3 text-red-400">
                <MaterialIcon name="cancel" />
                <span className="font-medium">{STATUS_LABEL.cancelled}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {STATUS_STEPS.map((step, idx) => {
                  const reached = idx <= currentStepIndex
                  const isCurrent = idx === currentStepIndex
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div
                        className={[
                          'size-3 rounded-full flex-shrink-0 transition-colors',
                          reached ? 'bg-primary' : 'bg-slate-700',
                          isCurrent ? 'ring-4 ring-primary/20' : '',
                        ].join(' ')}
                      />
                      <span className={['text-sm', reached ? 'text-white font-medium' : 'text-slate-500'].join(' ')}>
                        {STATUS_LABEL[step]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Trajet</h2>
            <div className="space-y-3 relative">
              <div className="absolute left-[5px] top-3 bottom-3 w-[1.5px] bg-slate-700" />
              <div className="flex items-start gap-4">
                <div className="size-3 rounded-full bg-primary ring-4 ring-primary/20 z-10 mt-1" />
                <div className="flex-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Retrait</p>
                  <p className="text-white text-sm font-medium">{parcel.pickupLocation.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="size-3 rounded-full border-2 border-white/60 z-10 mt-1" />
                <div className="flex-1">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Livraison</p>
                  <p className="text-white text-sm font-medium">{parcel.dropoffLocation.address}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Détails</h2>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Description</span>
              <span className="text-white text-right max-w-[60%] truncate">{parcel.description}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Destinataire</span>
              <span className="text-white">{parcel.recipientName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Distance</span>
              <span className="text-white">{parcel.distanceKm.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between text-sm border-t border-white/5 pt-2 mt-2">
              <span className="text-slate-400">Prix</span>
              <span className="text-primary font-bold">{parcel.price.toFixed(2)} {parcel.currency}</span>
            </div>
          </div>

          {parcel.status === 'pending' && (
            <div className="glass-card rounded-2xl p-5 border border-amber-500/20 bg-amber-500/5 text-center">
              <MaterialIcon name="hourglass_top" className="text-amber-400 text-[36px] mb-2" />
              <p className="text-white font-medium">Recherche d&apos;un chauffeur en cours…</p>
              <p className="text-xs text-slate-400 mt-1">Vous serez notifié dès qu&apos;un chauffeur sera assigné.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
