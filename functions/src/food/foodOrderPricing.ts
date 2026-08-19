import { HttpsError } from 'firebase-functions/v2/https';

const DELIVERY_RATE_PER_KM = 1.5;
const WEEKEND_SURCHARGE = 1.5;
const ZERO_DECIMAL_CURRENCIES = [
  'bif',
  'clp',
  'gnf',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
];

export interface ClientFoodOrderItem {
  menuItemId: string;
  itemName: string;
  itemQuantity: number;
  itemPrice: number;
  customization?: {
    modifierSelections: Array<{
      groupId: string;
      selectionType: 'single' | 'multiple';
      optionIds: string[];
    }>;
    supplementIds: string[];
  };
}

export interface VerifiedMenuItem {
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface FoodOrderPricingInput {
  orderItems: ClientFoodOrderItem[];
  deliveryDistance: number;
  isWeekend: boolean;
}

export interface VerifiedFoodOrderTotals {
  orderItems: ClientFoodOrderItem[];
  basePrice: number;
  deliveryCost: number;
  totalOrderPrice: number;
}

export interface TrustedDistanceInput {
  clientDistanceKm?: number;
  serverDistanceKm: number | null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateRoadDistanceKm(input: TrustedDistanceInput): number {
  if (input.serverDistanceKm == null) {
    throw new HttpsError('failed-precondition', 'Distance de livraison indisponible.');
  }
  const distance = Number(input.serverDistanceKm);
  if (!Number.isFinite(distance) || distance < 0 || distance > 100) {
    throw new HttpsError('failed-precondition', 'Distance de livraison indisponible.');
  }
  return distance;
}

export function calculateDeliveryCost(deliveryDistance: number, isWeekend: boolean): number {
  const distance = Number(deliveryDistance);
  if (!Number.isFinite(distance) || distance < 0 || distance > 100) {
    throw new HttpsError('invalid-argument', 'Distance de livraison invalide.');
  }

  return roundMoney(distance * DELIVERY_RATE_PER_KM + (isWeekend ? WEEKEND_SURCHARGE : 0));
}

export function calculateVerifiedFoodOrderTotals(
  order: FoodOrderPricingInput,
  menuItems: Map<string, VerifiedMenuItem>,
): VerifiedFoodOrderTotals {
  if (!Array.isArray(order.orderItems) || order.orderItems.length === 0) {
    throw new HttpsError('invalid-argument', 'La commande doit contenir au moins un article.');
  }

  const verifiedItems = order.orderItems.map((item) => {
    const menuItem = menuItems.get(item.menuItemId);
    if (!menuItem || menuItem.isAvailable !== true) {
      throw new HttpsError('failed-precondition', 'Article indisponible ou introuvable.');
    }

    const quantity = Number(item.itemQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new HttpsError('invalid-argument', 'Quantité invalide.');
    }

    if (typeof menuItem.price !== 'number' || !Number.isFinite(menuItem.price) || menuItem.price <= 0) {
      throw new HttpsError('failed-precondition', 'Prix menu invalide.');
    }

    return {
      menuItemId: item.menuItemId,
      itemName: menuItem.name,
      itemQuantity: quantity,
      itemPrice: roundMoney(menuItem.price),
      customization: item.customization,
    };
  });

  const basePrice = roundMoney(
    verifiedItems.reduce((sum, item) => sum + item.itemPrice * item.itemQuantity, 0),
  );
  const deliveryCost = calculateDeliveryCost(order.deliveryDistance, order.isWeekend);
  const totalOrderPrice = roundMoney(basePrice + deliveryCost);

  return { orderItems: verifiedItems, basePrice, deliveryCost, totalOrderPrice };
}

export function toStripeAmount(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError('invalid-argument', 'Montant invalide.');
  }
  return ZERO_DECIMAL_CURRENCIES.includes(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}
