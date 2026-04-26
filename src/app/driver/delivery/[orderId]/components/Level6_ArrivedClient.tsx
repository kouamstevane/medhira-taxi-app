'use client'
import type { FoodDeliveryOrder } from '@/types/firestore-collections'
import Level7A_LeaveAtDoor from './Level7A_LeaveAtDoor'
import Level7B_MeetOutside from './Level7B_MeetOutside'
import Level7C_MeetAtDoor from './Level7C_MeetAtDoor'

interface Props {
  order: FoodDeliveryOrder
  confirmDelivery: (method: 'photo' | 'pin', payload: string) => Promise<void>
  uploadProofPhoto: (file: File) => Promise<string>
  validatePin: (pin: string) => boolean
}

export default function Level6_ArrivedClient({ order, confirmDelivery, uploadProofPhoto, validatePin }: Props) {
  switch (order.deliveryPreference) {
    case 'meet_outside':
      return <Level7B_MeetOutside order={order} validatePin={validatePin} confirmDelivery={confirmDelivery} />
    case 'meet_at_door':
      return <Level7C_MeetAtDoor order={order} validatePin={validatePin} confirmDelivery={confirmDelivery} />
    default:
      return <Level7A_LeaveAtDoor order={order} confirmDelivery={confirmDelivery} uploadProofPhoto={uploadProofPhoto} />
  }
}
