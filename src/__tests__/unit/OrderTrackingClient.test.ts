import {
  getFoodOrderStepIndex,
  getRestaurantConversationUid,
  resolveRestaurantConversationUid,
} from '@/app/food/orders/[id]/OrderTrackingClient';
import type { FoodOrderStatus } from '@/types/food-delivery';

describe('OrderTrackingClient — getFoodOrderStepIndex Unit Tests', () => {
  it('mappe correctement les statuts initiaux sur l\'étape 0 (Commande reçue)', () => {
    expect(getFoodOrderStepIndex('pending_payment')).toBe(0);
    expect(getFoodOrderStepIndex('pending')).toBe(0);
    expect(getFoodOrderStepIndex('confirmed')).toBe(0);
  });

  it('mappe correctement l\'acceptation et la préparation sur l\'étape 1 (En préparation)', () => {
    expect(getFoodOrderStepIndex('accepted')).toBe(1);
    expect(getFoodOrderStepIndex('preparing')).toBe(1);
  });

  it('mappe correctement le statut prêt et l\'arrivée du livreur au resto sur l\'étape 2 (Prête)', () => {
    expect(getFoodOrderStepIndex('ready')).toBe(2);
    expect(getFoodOrderStepIndex('driver_heading_to_restaurant')).toBe(2);
    expect(getFoodOrderStepIndex('driver_arrived_restaurant')).toBe(2);
  });

  it('mappe correctement le transit et la livraison sur l\'étape 3 (En livraison)', () => {
    expect(getFoodOrderStepIndex('picked_up')).toBe(3);
    expect(getFoodOrderStepIndex('out_for_delivery')).toBe(3);
    expect(getFoodOrderStepIndex('arriving')).toBe(3);
    expect(getFoodOrderStepIndex('delivering')).toBe(3);
  });

  it('mappe correctement la livraison terminée sur l\'étape 4 (Livrée)', () => {
    expect(getFoodOrderStepIndex('delivered')).toBe(4);
  });

  it('renvoie -1 pour les statuts d\'annulation ou d\'échec d\'assignation', () => {
    expect(getFoodOrderStepIndex('cancelled')).toBe(-1);
    expect(getFoodOrderStepIndex('cancelled_by_restaurant')).toBe(-1);
    expect(getFoodOrderStepIndex('no_driver_available')).toBe(-1);
  });
});

describe('OrderTrackingClient — getRestaurantConversationUid Unit Tests', () => {
  it('utilise l\'UID propriétaire restaurant quand il est présent', () => {
    expect(getRestaurantConversationUid({ restaurantId: 'rest_123', restaurantOwnerId: 'owner_123' })).toBe('owner_123');
  });

  it('conserve un fallback legacy sur restaurantId', () => {
    expect(getRestaurantConversationUid({ restaurantId: 'rest_123' })).toBe('rest_123');
  });

  it('résout le propriétaire restaurant pour les anciennes commandes sans restaurantOwnerId', async () => {
    await expect(
      resolveRestaurantConversationUid(
        { restaurantId: 'rest_123' },
        async () => 'owner_legacy',
      ),
    ).resolves.toBe('owner_legacy');
  });
});
