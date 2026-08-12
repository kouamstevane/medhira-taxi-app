'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useParcelDelivery, type ParcelStatus } from '@/hooks/useParcelDelivery'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

const STATUS_LABEL: Record<ParcelStatus, string> = {
  pending: 'En attente',
  accepted: 'Assigné — en route vers retrait',
  in_transit: 'Colis récupéré, en transit',
  delivered: 'Livré — En attente de confirmation',
  completed: 'Livraison terminée & Payée',
  cancelled: 'Annulé',
}

export default function DriverParcelPage() {
  const params = useParams()
  const router = useRouter()
  const parcelId = params.parcelId as string
  const { parcel, loading, error, updateStatus } = useParcelDelivery(parcelId)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    if (!loading && parcel?.status === 'delivered') {
      const t = setTimeout(() => router.replace('/driver/dashboard'), 2500)
      return () => clearTimeout(t)
    }
  }, [loading, parcel?.status, router])

  if (loading || !parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {error ? (
          <div className="glass-card p-6 rounded-2xl border border-white/10 text-center max-w-sm">
            <MaterialIcon name="error_outline" className="text-red-400 text-[48px] mb-3" />
            <p className="text-white font-bold mb-2">Erreur</p>
            <p className="text-slate-400 text-sm mb-4">{error}</p>
            <button onClick={() => router.back()} className="w-full h-12 bg-primary text-white font-bold rounded-xl">
              Retour
            </button>
          </div>
        ) : (
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    )
  }

  const handleAction = async (next: ParcelStatus) => {
    setActioning(true)
    setActionError(null)
    try {
      await updateStatus(next)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setActioning(false)
    }
  }

  const renderActionButton = () => {
    if (parcel.status === 'accepted') {
      return (
        <button
          onClick={() => handleAction('in_transit')}
          disabled={actioning}
          className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-60 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <MaterialIcon name="inventory_2" />
          J&apos;ai récupéré le colis
        </button>
      )
    }
    if (parcel.status === 'in_transit') {
      return (
        <button
          onClick={() => handleAction('delivered')}
          disabled={actioning}
          className="w-full h-14 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-2xl disabled:opacity-60 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          <MaterialIcon name="check_circle" />
          Confirmer la livraison
        </button>
      )
    }
    if (parcel.status === 'delivered') {
      return (
        <div className="w-full h-14 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 font-bold gap-2">
          <MaterialIcon name="check_circle" />
          Colis livré
        </div>
      )
    }
    if (parcel.status === 'cancelled') {
      return (
        <div className="w-full h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold gap-2">
          <MaterialIcon name="cancel" />
          Annulé
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased pb-32">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => router.replace('/driver/dashboard')}
            className="flex items-center justify-center size-11 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-11">Transport de colis</h1>
        </header>

        <main className="flex-1 p-4 space-y-4">
          <div className="glass-card rounded-2xl p-5 border border-primary/20 bg-primary/5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Statut</p>
            <p className="text-white font-bold">{STATUS_LABEL[parcel.status]}</p>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
            <div className="flex items-start gap-3">
              <MaterialIcon name="my_location" className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Retrait</p>
                <p className="text-white text-sm font-medium">{parcel.pickupLocation.address}</p>
                {parcel.pickupInstructions && (
                  <p className="text-xs text-slate-400 mt-1">{parcel.pickupInstructions}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MaterialIcon name="location_on" className="text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Livraison</p>
                <p className="text-white text-sm font-medium">{parcel.dropoffLocation.address}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-2 text-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Détails & Rémunération</h2>
            <div className="flex justify-between">
              <span className="text-slate-400">Description</span>
              <span className="text-white text-right max-w-[60%] truncate">{parcel.description}</span>
            </div>
            {parcel.parcelType && (
              <div className="flex justify-between">
                <span className="text-slate-400">Type</span>
                <span className="text-white capitalize">{parcel.parcelType}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Distance</span>
              <span className="text-white">{parcel.distanceKm.toFixed(1)} km</span>
            </div>
            <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Prix total client</span>
                <span>{parcel.price.toFixed(2)} {parcel.currency}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Frais plateforme Medjira (30%)</span>
                <span>{(parcel.platformFee ?? parcel.price * 0.3).toFixed(2)} {parcel.currency}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold pt-1 border-t border-white/5">
                <span className="text-green-400">Gains Chauffeur (70%)</span>
                <span className="text-green-400 text-base">
                  {(parcel.driverEarnings ?? parcel.price * 0.7).toFixed(2)} {parcel.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Statut de paiement du chauffeur */}
          {parcel.status === 'delivered' && !parcel.driverPaidOut && (
            <div className="glass-card rounded-2xl p-4 border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
              <MaterialIcon name="schedule" className="text-amber-400 text-[24px] mt-0.5" />
              <div>
                <p className="font-bold text-sm text-white">En attente de confirmation client</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Dès que le destinataire ou le client aura cliqué sur &laquo;&nbsp;J&apos;ai reçu mon colis&nbsp;&raquo; (ou automatiquement sous 24h), vos 70% seront versés sur votre solde.
                </p>
              </div>
            </div>
          )}

          {(parcel.status === 'completed' || parcel.driverPaidOut) && (
            <div className="glass-card rounded-2xl p-4 border border-green-500/30 bg-green-500/10 flex items-start gap-3">
              <MaterialIcon name="account_balance_wallet" className="text-green-400 text-[24px] mt-0.5" />
              <div>
                <p className="font-bold text-sm text-white">Paiement 70% Crédité !</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  Vos gains de {(parcel.driverEarnings ?? parcel.price * 0.7).toFixed(2)} {parcel.currency} ont été ajoutés à votre portefeuille/gains chauffeur.
                </p>
              </div>
            </div>
          )}

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-2 text-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Destinataire</h2>
            <div className="flex justify-between">
              <span className="text-slate-400">Nom</span>
              <span className="text-white">{parcel.recipientName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Téléphone</span>
              <a
                href={`tel:${parcel.recipientPhone}`}
                className="text-primary font-medium flex items-center gap-1"
              >
                <MaterialIcon name="phone" size="sm" />
                {parcel.recipientPhone}
              </a>
            </div>
          </div>

          {actionError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm">
              {actionError}
            </div>
          )}
        </main>

        <div className="fixed bottom-0 inset-x-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/5 z-20 max-w-[430px] mx-auto">
          {renderActionButton()}
        </div>
      </div>
    </div>
  )
}
