'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useParcelDelivery, type ParcelStatus } from '@/hooks/useParcelDelivery'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { NetworkErrorView } from '@/components/ui'
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler'
import { useTranslation } from '@/hooks/useTranslation'

export default function DriverParcelPage() {
  const { t } = useTranslation('driver')
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const parcelId = searchParams.get('parcelId')?.trim() || (params?.parcelId as string) || ''
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const statusLabel: Record<ParcelStatus, string> = {
    pending: t('parcelStatusPending'),
    accepted: t('parcelStatusAccepted'),
    in_transit: t('parcelStatusInTransit'),
    delivered: t('parcelStatusDelivered'),
    completed: t('parcelStatusCompleted'),
    cancelled: t('parcelStatusCancelled'),
  }

  const handleLoadingError = useCallback((error: unknown) => {
    try {
      throw error
    } catch (err) {
      if (
        isFirestoreNetworkError(err) ||
        (err as Error)?.message?.toLowerCase().includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsNetworkError(true)
      }
    }
  }, [])

  const recharger = useCallback(async () => {
    setIsNetworkError(false)
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline')
      }
      setRefreshKey((k) => k + 1)
    } catch (error) {
      if (
        isFirestoreNetworkError(error) ||
        (error as Error)?.message?.toLowerCase().includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsNetworkError(true)
      }
    }
  }, [])

  const { parcel, loading, error, updateStatus } = useParcelDelivery(parcelId, {
    refreshKey,
    onError: handleLoadingError,
  })
  const [actionError, setActionError] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsNetworkError(true)
    }
  }, [parcelId])

  useEffect(() => {
    if (error) {
      try {
        throw new Error(error)
      } catch (err) {
        if (
          isFirestoreNetworkError(err) ||
          (err as Error)?.message?.toLowerCase().includes('offline') ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          setIsNetworkError(true)
        }
      }
    }
  }, [error])

  useEffect(() => {
    if (!loading && parcel?.status === 'delivered') {
      const t = setTimeout(() => router.replace('/driver/dashboard'), 2500)
      return () => clearTimeout(t)
    }
  }, [loading, parcel?.status, router])

  if (isNetworkError && !parcel) {
    return (
      <div className="min-h-screen bg-background flex flex-col font-sans text-slate-100 antialiased">
        <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => router.replace('/driver/dashboard')}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full glass-card text-white active:scale-95 transition-transform"
            aria-label="Retour au tableau de bord"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="text-lg font-bold text-white">{t('parcelTransportTitle')}</h1>
          <div className="size-11" aria-hidden="true" />
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <NetworkErrorView onRetry={recharger} />
        </main>
      </div>
    )
  }

  if (loading || !parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {error ? (
          <div className="glass-card p-6 rounded-2xl border border-white/10 text-center max-w-sm">
            <MaterialIcon name="error_outline" className="text-red-400 text-[48px] mb-3" />
            <p className="text-white font-bold mb-2">{t('common.error')}</p>
            <p className="text-slate-400 text-sm mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="w-full min-h-[44px] h-12 bg-primary text-white font-bold rounded-xl flex items-center justify-center"
            >
              {t('common.back')}
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
      setActionError(err instanceof Error ? err.message : t('common.errorOccurred'))
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
          {t('iPickedUpParcel')}
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
          {t('confirmDelivery')}
        </button>
      )
    }
    if (parcel.status === 'delivered') {
      return (
        <div className="w-full h-14 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 font-bold gap-2">
          <MaterialIcon name="check_circle" />
          {t('parcelDelivered')}
        </div>
      )
    }
    if (parcel.status === 'cancelled') {
      return (
        <div className="w-full h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-bold gap-2">
          <MaterialIcon name="cancel" />
          {t('parcelStatusCancelled')}
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased pb-32">
      <div className="max-w-[430px] mx-auto min-h-screen flex flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => router.replace('/driver/dashboard')}
            className="flex items-center justify-center size-11 rounded-full glass-card text-white active:scale-95 transition-transform"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="text-lg font-bold text-white">{t('parcelTransportTitle')}</h1>
          <div className="size-11" aria-hidden="true" />
        </header>

        <main className="flex-1 p-4 space-y-4">
          <div className="glass-card rounded-2xl p-5 border border-primary/20 bg-primary/5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{t('common.status')}</p>
            <p className="text-white font-bold">{statusLabel[parcel.status]}</p>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-4">
            <div className="flex items-start gap-3">
              <MaterialIcon name="my_location" className="text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold">{t('pickupPoint')}</p>
                <p className="text-white text-sm font-medium">{parcel.pickupLocation.address}</p>
                {parcel.pickupInstructions && (
                  <p className="text-xs text-slate-400 mt-1">{parcel.pickupInstructions}</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MaterialIcon name="location_on" className="text-red-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-bold">{t('deliveryPoint')}</p>
                <p className="text-white text-sm font-medium">{parcel.dropoffLocation.address}</p>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-2 text-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{t('detailsAndEarnings')}</h2>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('description')}</span>
              <span className="text-white text-right max-w-[60%] truncate">{parcel.description}</span>
            </div>
            {parcel.parcelType && (
              <div className="flex justify-between">
                <span className="text-slate-400">{t('type')}</span>
                <span className="text-white capitalize">{parcel.parcelType}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">{t('distance')}</span>
              <span className="text-white">{parcel.distanceKm.toFixed(1)} km</span>
            </div>
            <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>{t('totalClientPrice')}</span>
                <span>{parcel.price.toFixed(2)} {parcel.currency}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{t('medjiraFee')}</span>
                <span>{(parcel.platformFee ?? parcel.price * 0.3).toFixed(2)} {parcel.currency}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-bold pt-1 border-t border-white/5">
                <span className="text-green-400">{t('driverEarnings70')}</span>
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
                <p className="font-bold text-sm text-white">{t('waitingClientConfirmationTitle')}</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  {t('waitingClientConfirmationDesc')}
                </p>
              </div>
            </div>
          )}

          {(parcel.status === 'completed' || parcel.driverPaidOut) && (
            <div className="glass-card rounded-2xl p-4 border border-green-500/30 bg-green-500/10 flex items-start gap-3">
              <MaterialIcon name="account_balance_wallet" className="text-green-400 text-[24px] mt-0.5" />
              <div>
                <p className="font-bold text-sm text-white">{t('payout70CreditedTitle')}</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  {t('payout70CreditedDesc', {
                    amount: (parcel.driverEarnings ?? parcel.price * 0.7).toFixed(2),
                    currency: parcel.currency,
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="glass-card rounded-2xl p-5 border border-white/5 space-y-2 text-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{t('recipientTitle')}</h2>
            <div className="flex justify-between">
              <span className="text-slate-400">{t('recipientName')}</span>
              <span className="text-white">{parcel.recipientName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t('recipientPhone')}</span>
              <a
                href={`tel:${parcel.recipientPhone}`}
                className="text-primary font-medium flex items-center gap-1 min-h-[44px] px-2"
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
