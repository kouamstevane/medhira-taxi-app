'use client'
import { useAuth } from '@/hooks/useAuth'
import { ConversationLauncher } from '@/components/ConversationLauncher'
import type { ConversationContext } from '@/types/conversation'
import type { FoodDeliveryOrder } from '@/types/firestore-collections'

interface Props {
  order: FoodDeliveryOrder
  /** 'restaurant' = avant ramassage ; 'client' = après ramassage */
  target: 'restaurant' | 'client'
}

/**
 * Boutons de contact (chat + appel) côté livreur food.
 *
 * - target='restaurant' : livreur <-> restaurant (avant ramassage)
 * - target='client'     : livreur <-> client (après ramassage)
 */
export default function DriverFoodContacts({ order, target }: Props) {
  const { currentUser, userData } = useAuth()
  if (!currentUser?.uid) return null

  const driverName = userData?.firstName
    ? `${userData.firstName} ${userData.lastName ?? ''}`.trim()
    : 'Livreur'

  const meParticipant = {
    uid: currentUser.uid,
    name: driverName,
    role: 'livreur' as const,
  }

  const otherParticipant =
    target === 'restaurant'
      ? {
          uid: order.restaurantId,
          name: order.restaurantName || 'Restaurant',
          role: 'restaurant' as const,
        }
      : {
          uid: order.clientId,
          name: 'Client',
          role: 'client' as const,
        }

  const context: ConversationContext = {
    type: 'food',
    entityId: order.orderId,
    participantA: meParticipant,
    participantB: otherParticipant,
  }

  const label =
    target === 'restaurant'
      ? 'Contacter le restaurant'
      : 'Contacter le client'

  return (
    <div className="w-full max-w-sm mx-auto">
      <p className="text-slate-400 text-xs mb-2 text-center">{label}</p>
      <div className="flex justify-center">
        <ConversationLauncher
          context={context}
          currentUserUid={currentUser.uid}
          variant="icon-label"
        />
      </div>
    </div>
  )
}
