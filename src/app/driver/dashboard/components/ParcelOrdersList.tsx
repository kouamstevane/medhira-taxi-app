'use client'
import { useRouter } from 'next/navigation'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections'
import { useDriverAssignedDocs } from '@/hooks/useDriverAssignedDocs'
import { ACTIVE_PARCEL_STATUSES, type ParcelDoc } from '@/hooks/useParcelDelivery'
import { OrderCard } from './OrderCard'

interface Props {
  uid: string
  header?: React.ReactNode
}

const mapParcel = (d: QueryDocumentSnapshot<DocumentData>): ParcelDoc =>
  ({ parcelId: d.id, ...d.data() }) as ParcelDoc

export default function ParcelOrdersList({ uid, header }: Props) {
  const router = useRouter()
  const { items: parcels, loading } = useDriverAssignedDocs<ParcelDoc>({
    uid,
    collectionPath: FIRESTORE_COLLECTIONS.PARCELS,
    activeStatuses: ACTIVE_PARCEL_STATUSES,
    mapDoc: mapParcel,
    logTag: 'ParcelOrdersList',
  })

  if (loading || parcels.length === 0) return null

  return (
    <div className="space-y-3">
      {header}
      {parcels.map((p) => (
        <OrderCard
          key={p.parcelId}
          title={p.description}
          badge={p.sizeCategory}
          lines={[
            { icon: 'my_location', text: p.pickupLocation.address },
            { icon: 'location_on', text: p.dropoffLocation.address },
          ]}
          statusLabel={p.status === 'accepted' ? 'À récupérer' : 'En transit'}
          statusVariant={p.status === 'accepted' ? 'amber' : 'primary'}
          priceLabel={`${p.price.toFixed(2)} ${p.currency}`}
          onClick={() => router.push(`/driver/parcel/${p.parcelId}`)}
        />
      ))}
    </div>
  )
}
