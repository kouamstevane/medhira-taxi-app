'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useDeliveryOrder } from '@/hooks/useDeliveryOrder'
import Level1_Acceptance from './components/Level1_Acceptance'
import Level2_HeadingToRestaurant from './components/Level2_HeadingToRestaurant'
import Level3_ArrivedRestaurant from './components/Level3_ArrivedRestaurant'
import Level4_WaitingPickup from './components/Level4_WaitingPickup'
import Level5_HeadingToClient from './components/Level5_HeadingToClient'
import Level6_ArrivedClient from './components/Level6_ArrivedClient'
import { MaterialIcon } from '@/components/ui/MaterialIcon'

export default function DeliveryOrderPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.orderId as string
  const { order, loading, updateStatus, confirmPickup, confirmDelivery, uploadProofPhoto, validatePin, reportNotReady } = useDeliveryOrder(orderId)
  const [showCancelledModal, setShowCancelledModal] = useState(false)

  useEffect(() => {
    if (!loading && order?.status === 'delivered') {
      router.replace('/driver/dashboard')
    }
    if (!loading && order?.status === 'cancelled') {
      setShowCancelledModal(true)
    }
  }, [loading, order?.status, router])

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (showCancelledModal) {
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
            className="w-full h-12 bg-primary text-white font-bold rounded-2xl"
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
      return <Level6_ArrivedClient order={order} confirmDelivery={confirmDelivery} uploadProofPhoto={uploadProofPhoto} validatePin={validatePin} />
    default:
      return (
        <div className="min-h-screen bg-background flex items-center justify-center text-slate-400">
          Statut inconnu : {order.status}
        </div>
      )
  }
}
