'use client'
import { useRouter } from 'next/navigation'
import { useDriverAssignedDocs } from '@/hooks/useDriverAssignedDocs'
import {
  ACTIVE_DELIVERY_STATUSES,
  type DeliveryStatus,
  type FoodDeliveryOrder,
} from '@/types/firestore-collections'
import { formatCurrencyWithCode } from '@/utils/format'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import { OrderCard } from './OrderCard'

interface Props {
  uid: string
  header?: React.ReactNode
}

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  assigned: 'Assignée',
  refused: 'Refusée',
  heading_to_restaurant: 'En route resto',
  arrived_restaurant: 'Au restaurant',
  waiting: 'En attente',
  picked_up: 'Commande récupérée',
  heading_to_client: 'En route client',
  arrived_client: 'Chez le client',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

const mapOrder = (d: QueryDocumentSnapshot<DocumentData>): FoodDeliveryOrder =>
  ({ orderId: d.id, ...d.data() }) as FoodDeliveryOrder

export default function DeliveryOrdersList({ uid, header }: Props) {
  const router = useRouter()
  const { items: orders, loading } = useDriverAssignedDocs<FoodDeliveryOrder>({
    uid,
    collectionPath: 'food_delivery_orders',
    activeStatuses: ACTIVE_DELIVERY_STATUSES,
    mapDoc: mapOrder,
  })

  if (loading || orders.length === 0) return null

  return (
    <div className="space-y-3">
      {header}
      {orders.map((order) => (
        <OrderCard
          key={order.orderId}
          title={order.restaurantName}
          badge={order.orderNumber}
          lines={[{ icon: 'location_on', text: order.clientNeighbourhood }]}
          statusLabel={DELIVERY_STATUS_LABELS[order.status]}
          statusVariant={order.status === 'assigned' ? 'amber' : 'primary'}
          priceLabel={formatCurrencyWithCode(order.driverEarnings ?? 0)}
          onClick={() => router.push(`/driver/delivery/${order.orderId}`)}
        />
      ))}
    </div>
  )
}
