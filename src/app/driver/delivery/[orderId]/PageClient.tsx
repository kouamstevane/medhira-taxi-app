'use client'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder'
import Level1_Acceptance from './components/Level1_Acceptance'
import Level2_HeadingToRestaurant from './components/Level2_HeadingToRestaurant'
import Level3_ArrivedRestaurant from './components/Level3_ArrivedRestaurant'
import Level4_WaitingPickup from './components/Level4_WaitingPickup'
import Level5_HeadingToClient from './components/Level5_HeadingToClient'
import Level6_ArrivedClient from './components/Level6_ArrivedClient'
import { MaterialIcon } from '@/components/ui/MaterialIcon'
import { NetworkErrorView } from '@/components/ui'
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler'

export default function DeliveryOrderPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')?.trim() || (params?.orderId as string) || ''
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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

  const { order, loading, error, updateStatus, confirmPickup, confirmDelivery, uploadProofPhoto, reportNotReady } =
    useDeliveryOrder(orderId, {
      refreshKey,
      onError: handleLoadingError,
    })

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsNetworkError(true)
    }
  }, [orderId])

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
    if (!loading && order?.status === 'delivered') {
      router.replace('/driver/dashboard')
    }
  }, [loading, order?.status, router])

  if (isNetworkError && !order) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="sticky top-0 z-20 flex items-center p-4 bg-background/80 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={() => router.replace('/driver/dashboard')}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full glass-card text-white active:scale-95 transition-transform"
            aria-label="Retour au tableau de bord"
          >
            <MaterialIcon name="arrow_back" size="md" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold text-white pr-11">Course de livraison</h1>
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <NetworkErrorView onRetry={recharger} />
        </main>
      </div>
    )
  }

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!loading && order.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl border border-white/10 p-6 max-w-sm w-full text-center space-y-4">
          <MaterialIcon name="cancel" className="text-amber-400 text-[48px]" />
          <h2 className="text-xl font-bold text-white">Commande annulée</h2>
          <p className="text-slate-400 text-sm">
            {order.cancellationReason === 'restaurant_cancelled'
              ? "Le restaurant a annulé la commande — vous n'êtes pas pénalisé."
              : 'La commande a été annulée.'}
          </p>
          <button
            onClick={() => router.replace('/driver/dashboard')}
            className="w-full h-12 bg-primary text-white font-bold rounded-2xl min-h-[44px]"
          >
            Retour au dashboard
          </button>
        </div>
      </div>
    )
  }

  const commonProps = { order, updateStatus }

  switch (order.status) {
    case 'assigned':
      return <Level1_Acceptance order={order} updateStatus={updateStatus} onRefuse={async () => { await updateStatus('refused') }} />
    case 'heading_to_restaurant':
      return <Level2_HeadingToRestaurant {...commonProps} />
    case 'arrived_restaurant':
      return <Level3_ArrivedRestaurant {...commonProps} />
    case 'waiting':
      return <Level4_WaitingPickup {...commonProps} confirmPickup={confirmPickup} reportNotReady={reportNotReady} />
    case 'picked_up':
    case 'heading_to_client':
      return <Level5_HeadingToClient {...commonProps} />
    case 'arrived_client':
      return <Level6_ArrivedClient order={order} confirmDelivery={confirmDelivery} uploadProofPhoto={uploadProofPhoto} />
    default:
      return (
        <div className="min-h-screen bg-background flex items-center justify-center text-slate-400">
          Statut inconnu : {order.status}
        </div>
      )
  }
}
