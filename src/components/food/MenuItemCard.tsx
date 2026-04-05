import React from 'react';
import Image from 'next/image';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { MenuItem, Restaurant } from '@/types/food-delivery';
import { useCartStore } from '@/store/cartStore';

interface MenuItemCardProps {
  item: MenuItem;
  restaurant: Restaurant;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, restaurant }) => {
  const { items, addItem, updateQuantity } = useCartStore();

  const cartItem = items.find(i => i.id === item.id);
  const quantity = cartItem?.quantity || 0;

  const handleAdd = () => {
    addItem(item, restaurant);
  };

  const handleIncrement = () => {
    updateQuantity(item.id!, quantity + 1);
  };

  const handleDecrement = () => {
    updateQuantity(item.id!, quantity - 1);
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all duration-200 ${
        quantity > 0 ? 'border-primary/50 bg-primary/5' : 'border-white/5 glass-card hover:border-white/10'
      }`}
    >
      <div className="flex gap-4">
        {item.imageUrl && (
          <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-white/10">
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-cover"
              sizes="96px"
            />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <h4 className="font-semibold text-white">{item.name}</h4>
              <span className="font-bold text-white">{item.price.toFixed(2)} €</span>
            </div>
            {item.description && (
              <p className="text-sm text-slate-400 mt-1 line-clamp-2">{item.description}</p>
            )}
          </div>

          <div className="mt-3 flex justify-end items-center">
            {!item.isAvailable ? (
              <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded">Épuisé</span>
            ) : quantity === 0 ? (
              <button
                onClick={handleAdd}
                className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
                aria-label={`Ajouter ${item.name} au panier`}
              >
                <MaterialIcon name="add" size="sm" />
                <span>Ajouter</span>
              </button>
            ) : (
              <div className="flex items-center border border-white/10 rounded-full bg-white/5 overflow-hidden">
                <button
                  onClick={handleDecrement}
                  className="p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Diminuer la quantité"
                >
                  <MaterialIcon name="remove" size="sm" />
                </button>
                <span className="w-8 text-center font-medium text-sm text-white">
                  {quantity}
                </span>
                <button
                  onClick={handleIncrement}
                  className="p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Augmenter la quantité"
                >
                  <MaterialIcon name="add" size="sm" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
