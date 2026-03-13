import { create } from 'zustand';
import { MenuItem, Restaurant } from '@/types/food-delivery';

export interface CartItem extends MenuItem {
  quantity: number;
}

interface CartState {
  items: CartItem[];
  restaurant: Restaurant | null;
  
  // Actions
  addItem: (item: MenuItem, restaurant: Restaurant) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  
  // Computed getters
  getTotalItems: () => number;
  getSubtotal: () => number;
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  restaurant: null,

  addItem: (item, restaurant) => {
    set((state) => {
      // Si on ajoute un article d'un autre restaurant, on vide le panier
      if (state.restaurant && state.restaurant.id !== restaurant.id) {
        return {
          items: [{ ...item, quantity: 1 }],
          restaurant,
        };
      }

      const existingItem = state.items.find(i => i.id === item.id);
      if (existingItem) {
        return {
          items: state.items.map(i => 
            i.id === item.id 
              ? { ...i, quantity: i.quantity + 1 } 
              : i
          ),
          restaurant,
        };
      }

      return {
        items: [...state.items, { ...item, quantity: 1 }],
        restaurant: restaurant,
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
}));
