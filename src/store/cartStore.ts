import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomerMenuCustomizationPayload, MenuItem, Restaurant } from '@/types/food-delivery';

export interface CartItem extends MenuItem {
  menuItemId: string;
  basePrice?: number;
  quantity: number;
  customization?: {
    modifierSelections: CustomerMenuCustomizationPayload['modifierSelections'];
    supplementIds: string[];
    checkoutRules?: CustomerMenuCustomizationPayload['checkoutRules'];
  };
}

interface CartState {
  items: CartItem[];
  restaurant: Restaurant | null;
  
  // Actions
  addItem: (item: MenuItem, restaurant: Restaurant, quantity?: number) => void;
  addCustomizedItem: (item: MenuItem, restaurant: Restaurant, payload: CustomerMenuCustomizationPayload) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Computed getters
  getTotalItems: () => number;
  getSubtotal: () => number;
}

const normalizeModifierSelections = (modifierSelections: CustomerMenuCustomizationPayload['modifierSelections']) => (
  modifierSelections
    .map((selection) => ({
      ...selection,
      optionIds: [...selection.optionIds].sort(),
    }))
    .sort((left, right) => left.groupId.localeCompare(right.groupId))
);

const buildCustomizedCartItemId = (
  itemId: string,
  payload: CustomerMenuCustomizationPayload,
) => JSON.stringify({
  itemId,
  modifierSelections: normalizeModifierSelections(payload.modifierSelections),
  supplementIds: [...payload.supplementIds].sort(),
  checkoutRules: payload.checkoutRules ?? {},
});

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      restaurant: null,

      addItem: (item, restaurant, quantity = 1) => {
        set((state) => {
          const nextQuantity = Math.max(quantity, 1);
          if (state.restaurant && state.restaurant.id !== restaurant.id) {
            return {
              items: [{ ...item, menuItemId: item.id, quantity: nextQuantity }],
              restaurant,
            };
          }

          const existingItem = state.items.find((cartItem) => cartItem.id === item.id);
          if (existingItem) {
            return {
              items: state.items.map((cartItem) => 
                cartItem.id === item.id
                  ? { ...cartItem, quantity: cartItem.quantity + nextQuantity } 
                  : i
              ),
              restaurant,
            };
          }

          return {
            items: [...state.items, { ...item, menuItemId: item.id, quantity: nextQuantity }],
            restaurant: restaurant,
          };
        });
      },

      addCustomizedItem: (item, restaurant, payload) => {
        set((state) => {
          const maxQuantity = payload.checkoutRules?.maxQuantity && payload.checkoutRules.maxQuantity > 0
            ? payload.checkoutRules.maxQuantity
            : undefined;
          const requestedQuantity = Math.max(payload.quantity, 1);
          const nextCartItemId = buildCustomizedCartItemId(item.id, payload);
          const normalizedSelections = normalizeModifierSelections(payload.modifierSelections);

          const buildCartItems = (items: CartItem[]) => {
            const existingItem = items.find((cartItem) => cartItem.id === nextCartItemId);
            if (existingItem) {
              const nextQuantity = existingItem.quantity + requestedQuantity;
              const boundedQuantity = maxQuantity !== undefined
                ? Math.min(nextQuantity, maxQuantity)
                : nextQuantity;

              return items.map((cartItem) => (
                cartItem.id === nextCartItemId
                  ? { ...cartItem, quantity: boundedQuantity }
                  : cartItem
              ));
            }

            const boundedQuantity = maxQuantity !== undefined
              ? Math.min(requestedQuantity, maxQuantity)
              : requestedQuantity;

            return [
              ...items,
              {
                ...item,
                id: nextCartItemId,
                menuItemId: item.id,
                basePrice: item.price,
                price: item.price + payload.customizationPrice,
                quantity: boundedQuantity,
                customization: {
                  modifierSelections: normalizedSelections,
                  supplementIds: [...payload.supplementIds].sort(),
                  checkoutRules: payload.checkoutRules,
                },
              },
            ];
          };

          if (state.restaurant && state.restaurant.id !== restaurant.id) {
            return {
              items: buildCartItems([]),
              restaurant,
            };
          }

          return {
            items: buildCartItems(state.items),
            restaurant,
          };
        });
      },

      removeItem: (itemId) => {
        set((state) => {
          const newItems = state.items.filter(i => i.id !== itemId);
          return {
            items: newItems,
            restaurant: newItems.length === 0 ? null : state.restaurant
          };
        });
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        
        set((state) => ({
          items: state.items.map(i => 
            i.id === itemId 
              ? { ...i, quantity } 
              : i
          )
        }));
      },

      clearCart: () => set({ items: [], restaurant: null }),

      getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
      
      getSubtotal: () => get().items.reduce((total, item) => total + (item.price * item.quantity), 0),
    }),
    {
      name: 'medjira-cart-store',
      partialize: (state) => ({
        items: state.items,
        restaurant: state.restaurant
          ? {
              id: state.restaurant.id,
              name: state.restaurant.name,
              imageUrl: state.restaurant.imageUrl,
              address: state.restaurant.address,
            } as Restaurant
          : null,
      }),
    }
  )
);
