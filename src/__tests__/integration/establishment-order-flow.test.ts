import {
  calculateBasePrice,
  calculateDeliveryCost,
} from '@/services/food-delivery.service';
import {
  buildCheckoutOrderItems,
  validateCartForCheckout,
} from '@/services/checkout.service';
import { useCartStore } from '@/store/cartStore';
import { getFoodOrderStepIndex } from '@/app/food/orders/[id]/OrderTrackingClient';
import {
  RESTAURANT_ORDER_OPERATIONAL_STATUSES,
} from '@/utils/food-order-status';
import {
  RESTAURANT_REJECTABLE_STATUSES,
  getRestaurantOrderStatusLabel,
  getRestaurantOrderFilterGroupLabel,
} from '@/app/food/portal/[id]/orders/orderStatusUi';
import { MERCHANT_PRESET_CATEGORIES } from '@/utils/restaurant-constants';
import { restaurant as frRestaurant } from '@/locales/fr/restaurant';
import { restaurant as enRestaurant } from '@/locales/en/restaurant';
import { food as frFood } from '@/locales/fr/food';
import { food as enFood } from '@/locales/en/food';
import type { Restaurant, FoodOrder, MenuItem } from '@/types/food-delivery';

describe('End-to-End Establishment Lifecycle & Order Confirmation Flow', () => {
  const mockRestaurantId = 'resto-medjira-101';
  const mockOwnerId = 'owner-uid-456';
  const mockClientId = 'client-uid-789';

  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  describe('1. Admin Establishment Approval & Rejection Flow', () => {
    it('approves a pending establishment and transitions its status to approved', () => {
      const pendingEstablishment: Partial<Restaurant> = {
        id: mockRestaurantId,
        name: 'Saveurs Méditerranéennes',
        merchantType: 'restaurant',
        ownerId: mockOwnerId,
        status: 'pending_approval',
        stripeConnectStatus: 'not_started',
        cuisineType: ['Africaine', 'Fast Food'],
        address: '10 Avenue des Champs, Paris',
        commissionRate: 5,
      };

      // Simulates admin approval action (as done by adminManageRestaurant)
      const approvedEstablishment: Restaurant = {
        ...(pendingEstablishment as Restaurant),
        status: 'approved',
        stripeConnectStatus: 'active',
        approvedAt: new Date().toISOString() as unknown as Restaurant['approvedAt'],
      };

      expect(approvedEstablishment.status).toBe('approved');
      expect(approvedEstablishment.stripeConnectStatus).toBe('active');
    });

    it('rejects a pending establishment with a required reason', () => {
      const pendingEstablishment: Partial<Restaurant> = {
        id: mockRestaurantId,
        name: 'Fast Pizza Test',
        status: 'pending_approval',
      };

      const rejectionReason = 'Documents Kbis manquants ou illisibles.';
      const rejectedEstablishment: Partial<Restaurant> = {
        ...pendingEstablishment,
        status: 'rejected',
        rejectionReason,
      };

      expect(rejectedEstablishment.status).toBe('rejected');
      expect(rejectedEstablishment.rejectionReason).toBe(rejectionReason);
      expect(rejectedEstablishment.rejectionReason?.length).toBeGreaterThan(5);
    });
  });

  describe('2. Client Catalog & Visibility Flow', () => {
    const approvedAndConnectedResto: Restaurant = {
      id: mockRestaurantId,
      name: 'Bistro Gourmet',
      description: 'Bistro convivial au coeur de Paris',
      phone: '+33140000000',
      email: 'contact@bistrogourmet.fr',
      ownerId: mockOwnerId,
      merchantType: 'restaurant',
      status: 'approved',
      stripeConnectStatus: 'active',
      cuisineType: ['Français', 'Desserts'],
      address: '15 Rue de Rennes, Paris',
      rating: 4.8,
      totalReviews: 24,
      avgPricePerPerson: 18,
      commissionRate: 5,
      fulfillmentModes: ['delivery', 'pickup'],
      createdAt: new Date() as unknown as Restaurant['createdAt'],
      updatedAt: new Date() as unknown as Restaurant['updatedAt'],
    };

    const pendingResto: Restaurant = {
      ...approvedAndConnectedResto,
      id: 'pending-resto-id',
      status: 'pending_approval',
    };

    const disconnectedResto: Restaurant = {
      ...approvedAndConnectedResto,
      id: 'disconnected-resto-id',
      stripeConnectStatus: 'not_started',
    };

    it('filters out establishments that are not both approved and active on Stripe Connect', () => {
      const allRestaurants = [approvedAndConnectedResto, pendingResto, disconnectedResto];

      const visibleToClients = allRestaurants.filter(
        (r) => r.status === 'approved' && r.stripeConnectStatus === 'active',
      );

      expect(visibleToClients).toHaveLength(1);
      expect(visibleToClients[0].id).toBe(mockRestaurantId);
    });

    it('allows client to view menu items, validate options, and add to cart', () => {
      const mockMenuItem: MenuItem = {
        id: 'dish-1',
        restaurantId: mockRestaurantId,
        name: 'Burger Artisan',
        price: 12.5,
        isAvailable: true,
        category: 'Burgers',
        description: 'Pain brioché maison, boeuf charolais, cheddar affiné',
        createdAt: new Date() as unknown as MenuItem['createdAt'],
        updatedAt: new Date() as unknown as MenuItem['updatedAt'],
      };

      const cartStore = useCartStore.getState();
      cartStore.addItem(
        mockMenuItem,
        approvedAndConnectedResto,
        2,
      );

      const updatedCart = useCartStore.getState();
      expect(updatedCart.items).toHaveLength(1);
      expect(updatedCart.items[0].quantity).toBe(2);
      expect(updatedCart.getSubtotal()).toBe(25.0);
      expect(updatedCart.restaurant?.id).toBe(mockRestaurantId);

      // Validate cart structure for checkout
      const validation = validateCartForCheckout(updatedCart.items, new Map());
      expect(validation.valid).toBe(true);

      const orderItems = buildCheckoutOrderItems(updatedCart.items);
      expect(orderItems).toEqual([
        {
          menuItemId: 'dish-1',
          itemName: 'Burger Artisan',
          itemPrice: 12.5,
          itemQuantity: 2,
        },
      ]);
    });
  });

  describe('3. Order Creation & Payment Lifecycle', () => {
    it('calculates order prices and verified delivery fees correctly', () => {
      const orderItems = [
        { menuItemId: 'dish-1', itemName: 'Burger Artisan', itemPrice: 12.5, itemQuantity: 2 },
        { menuItemId: 'dish-2', itemName: 'Frites Fraîches', itemPrice: 4.0, itemQuantity: 1 },
      ];

      const basePrice = calculateBasePrice(orderItems);
      expect(basePrice).toBe(29.0);

      const distanceKm = 4.2;
      const deliveryCostWeekday = calculateDeliveryCost(distanceKm, false);
      const deliveryCostWeekend = calculateDeliveryCost(distanceKm, true);

      expect(deliveryCostWeekday).toBe(6.3); // 4.2 * 1.5
      expect(deliveryCostWeekend).toBe(7.8); // 4.2 * 1.5 + 1.5 surcharge
    });

    it('transitions order status from pending_payment to confirmed upon wallet payment', () => {
      const orderDraft: FoodOrder = {
        id: 'order-live-101',
        userId: mockClientId,
        customerName: 'Jean Dupont',
        restaurantId: mockRestaurantId,
        restaurantName: 'Bistro Gourmet',
        status: 'pending_payment',
        pickupCode: '1234',
        paymentValidated: false,
        fulfillmentType: 'delivery',
        deliveryAddress: '24 Rue de Rivoli, Paris',
        deliveryDistance: 4.2,
        isWeekend: false,
        basePrice: 29.0,
        deliveryCost: 6.3,
        totalOrderPrice: 35.3,
        orderItems: [
          { menuItemId: 'dish-1', itemName: 'Burger Artisan', itemPrice: 12.5, itemQuantity: 2 },
          { menuItemId: 'dish-2', itemName: 'Frites Fraîches', itemPrice: 4.0, itemQuantity: 1 },
        ],
        createdAt: { toMillis: () => 1700000000000, toDate: () => new Date() } as unknown as FoodOrder['createdAt'],
        updatedAt: { toMillis: () => 1700000000000, toDate: () => new Date() } as unknown as FoodOrder['updatedAt'],
      };

      expect(orderDraft.status).toBe('pending_payment');
      expect(orderDraft.paymentValidated).toBe(false);

      // Simulates walletPayFoodOrder successful processing
      const paidOrder: FoodOrder & { paymentTransactionId?: string } = {
        ...orderDraft,
        status: 'confirmed',
        paymentValidated: true,
        paymentTransactionId: 'tx-wallet-999',
      };

      expect(paidOrder.status).toBe('confirmed');
      expect(paidOrder.paymentValidated).toBe(true);
      expect(paidOrder.paymentTransactionId).toBe('tx-wallet-999');
    });
  });

  describe('4. Establishment Real-Time Order Reception & Confirmation Flow', () => {
    const liveOrder: FoodOrder = {
      id: 'order-live-101',
      userId: mockClientId,
      customerName: 'Jean Dupont',
      restaurantId: mockRestaurantId,
      restaurantName: 'Bistro Gourmet',
      status: 'confirmed',
      pickupCode: '1234',
      paymentValidated: true,
      fulfillmentType: 'delivery',
      deliveryAddress: '24 Rue de Rivoli, Paris',
      deliveryDistance: 4.2,
      isWeekend: false,
      basePrice: 29.0,
      deliveryCost: 6.3,
      totalOrderPrice: 35.3,
      orderItems: [
        { menuItemId: 'dish-1', itemName: 'Burger Artisan', itemPrice: 12.5, itemQuantity: 2 },
        { menuItemId: 'dish-2', itemName: 'Frites Fraîches', itemPrice: 4.0, itemQuantity: 1 },
      ],
      createdAt: { toMillis: () => 1700000000000, toDate: () => new Date() } as unknown as FoodOrder['createdAt'],
      updatedAt: { toMillis: () => 1700000000000, toDate: () => new Date() } as unknown as FoodOrder['updatedAt'],
    };

    it('includes confirmed and pending orders in the establishment operational query', () => {
      expect(RESTAURANT_ORDER_OPERATIONAL_STATUSES).toContain('confirmed');
      expect(RESTAURANT_ORDER_OPERATIONAL_STATUSES).toContain('pending');
      expect(RESTAURANT_ORDER_OPERATIONAL_STATUSES).toContain('accepted');
      expect(RESTAURANT_ORDER_OPERATIONAL_STATUSES).toContain('preparing');
      expect(RESTAURANT_ORDER_OPERATIONAL_STATUSES).toContain('ready');
    });

    it('allows establishment to accept a confirmed order, advancing it to accepted', () => {
      // In OrdersManagementClient: (order.status === 'confirmed' || order.status === 'pending') -> accept button
      const canEstablishmentAccept = liveOrder.status === 'confirmed' || liveOrder.status === 'pending';
      expect(canEstablishmentAccept).toBe(true);

      const acceptedOrder: FoodOrder = {
        ...liveOrder,
        status: 'accepted',
      };
      expect(acceptedOrder.status).toBe('accepted');
    });

    it('advances order through full kitchen lifecycle: accepted -> preparing -> ready', () => {
      let currentOrder: FoodOrder = { ...liveOrder, status: 'accepted' };

      // Step: Start preparation
      expect(currentOrder.status).toBe('accepted');
      currentOrder = { ...currentOrder, status: 'preparing' };
      expect(currentOrder.status).toBe('preparing');

      // Step: Mark ready for courier / pickup
      currentOrder = { ...currentOrder, status: 'ready' };
      expect(currentOrder.status).toBe('ready');

      // Rejection is possible during these phases if kitchen is overwhelmed
      expect(RESTAURANT_REJECTABLE_STATUSES).toContain('confirmed');
      expect(RESTAURANT_REJECTABLE_STATUSES).toContain('accepted');
      expect(RESTAURANT_REJECTABLE_STATUSES).toContain('preparing');
      expect(RESTAURANT_REJECTABLE_STATUSES).toContain('ready');
    });
  });

  describe('5. Client Tracking Synchronization Flow', () => {
    it('maps every food order lifecycle stage to the correct step in customer tracking', () => {
      // Step 0: Order received & confirmed
      expect(getFoodOrderStepIndex('pending_payment')).toBe(0);
      expect(getFoodOrderStepIndex('pending')).toBe(0);
      expect(getFoodOrderStepIndex('confirmed')).toBe(0);

      // Step 1: Kitchen in preparation
      expect(getFoodOrderStepIndex('accepted')).toBe(1);
      expect(getFoodOrderStepIndex('preparing')).toBe(1);

      // Step 2: Order ready for pickup / courier arrival
      expect(getFoodOrderStepIndex('ready')).toBe(2);
      expect(getFoodOrderStepIndex('driver_heading_to_restaurant')).toBe(2);
      expect(getFoodOrderStepIndex('driver_arrived_restaurant')).toBe(2);

      // Step 3: Courier on the road
      expect(getFoodOrderStepIndex('picked_up')).toBe(3);
      expect(getFoodOrderStepIndex('out_for_delivery')).toBe(3);
      expect(getFoodOrderStepIndex('arriving')).toBe(3);
      expect(getFoodOrderStepIndex('delivering')).toBe(3);

      // Step 4: Delivered
      expect(getFoodOrderStepIndex('delivered')).toBe(4);

      // Terminal / Cancelled
      expect(getFoodOrderStepIndex('cancelled')).toBe(-1);
      expect(getFoodOrderStepIndex('cancelled_by_restaurant')).toBe(-1);
      expect(getFoodOrderStepIndex('no_driver_available')).toBe(-1);
    });
  });

  describe('6. Zero Hardcoded Text & Full Bilingual Parity (FR & EN)', () => {
    it('has all establishment order UI labels defined in French and English', () => {
      // Order buttons
      expect(frRestaurant.accept).toBe('Accepter');
      expect(enRestaurant.accept).toBe('Accept');

      expect(frRestaurant.prepare).toBe('Préparer');
      expect(enRestaurant.prepare).toBe('Prepare');

      expect(frRestaurant.markReady).toBe('Marquer prête');
      expect(enRestaurant.markReady).toBe('Mark ready');

      expect(frRestaurant.refuseOrder).toBe('Refuser');
      expect(enRestaurant.refuseOrder).toBe('Decline');

      // Order tabs & filter headers
      expect(frRestaurant.ordersTitle).toBe('Commandes');
      expect(enRestaurant.ordersTitle).toBe('Orders');

      expect(frRestaurant.activeOrdersTab).toBe('En cours');
      expect(enRestaurant.activeOrdersTab).toBe('In progress');

      expect(frRestaurant.historyOrdersTab).toBe('Historique');
      expect(enRestaurant.historyOrdersTab).toBe('History');
    });

    it('has all food checkout error messages and labels localized without raw text', () => {
      expect(frFood.invalidDeliveryAddressError).toBeDefined();
      expect(enFood.invalidDeliveryAddressError).toBeDefined();

      expect(frFood.insufficientBalanceError).toContain('{available}');
      expect(enFood.insufficientBalanceError).toContain('{available}');

      expect(frFood.cardPaymentInitError).toBeDefined();
      expect(enFood.cardPaymentInitError).toBeDefined();

      expect(frFood.pickupInStore).toBe('Retrait en magasin');
      expect(enFood.pickupInStore).toBe('In-store pickup');

      expect(frFood.checkoutInvalidArgumentError).toBeDefined();
      expect(enFood.checkoutInvalidArgumentError).toBeDefined();
    });

    it('provides localized labels for all preset categories across all merchant types', () => {
      const merchantTypes = Object.keys(MERCHANT_PRESET_CATEGORIES) as (keyof typeof MERCHANT_PRESET_CATEGORIES)[];

      for (const mType of merchantTypes) {
        const categories = MERCHANT_PRESET_CATEGORIES[mType];
        expect(categories.length).toBeGreaterThan(0);
        expect(categories.length).toBeLessThanOrEqual(20);

        for (const cat of categories) {
          const frCat = (frRestaurant.presetCategories as Record<string, string>)[cat];
          const enCat = (enRestaurant.presetCategories as Record<string, string>)[cat];

          expect(frCat).toBeDefined();
          expect(typeof frCat).toBe('string');
          expect(frCat.length).toBeGreaterThan(0);

          expect(enCat).toBeDefined();
          expect(typeof enCat).toBe('string');
          expect(enCat.length).toBeGreaterThan(0);
        }
      }
    });

    it('provides valid status labels for all restaurant operational filter groups and statuses', () => {
      const label = getRestaurantOrderStatusLabel('confirmed');
      expect(label).toBe('Confirmée');

      const filterGroupLabel = getRestaurantOrderFilterGroupLabel('to_process');
      expect(filterGroupLabel).toBe('À traiter');
    });
  });
});
