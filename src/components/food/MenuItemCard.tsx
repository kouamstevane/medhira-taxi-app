import React, { useMemo, useState } from 'react';
import { MenuItemImage } from '@/components/food/MenuItemImage';
import { CustomerMenuItemDetails } from '@/components/food/CustomerMenuItemDetails';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { MenuItem, Restaurant } from '@/types/food-delivery';
import { useCartStore } from '@/store/cartStore';
import { CURRENCY_CODE } from '@/utils/constants';

interface MenuItemCardProps {
  item: MenuItem;
  restaurant: Restaurant;
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({ item, restaurant }) => {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { items, addItem, addCustomizedItem, updateQuantity } = useCartStore();

  const legacyCartItem = items.find((cartItem) => cartItem.id === item.id && !cartItem.customization);
  const quantity = legacyCartItem?.quantity || 0;
  const totalItemQuantity = useMemo(
    () => items
      .filter((cartItem) => (cartItem.menuItemId ?? cartItem.id) === item.id)
      .reduce((sum, cartItem) => sum + cartItem.quantity, 0),
    [item.id, items],
  );
  const hasCustomizedSelections = items.some(
    (cartItem) => (cartItem.menuItemId ?? cartItem.id) === item.id && Boolean(cartItem.customization),
  );

  const handleOpenDetails = () => {
    setIsDetailsOpen(true);
  };

  const handleIncrement = () => {
    updateQuantity(item.id!, quantity + 1);
  };

  const handleDecrement = () => {
    updateQuantity(item.id!, quantity - 1);
  };

  const handleAddToCart = (payload: {
    itemId: string;
    quantity: number;
    modifierSelections: Array<{
      groupId: string;
      selectionType: 'single' | 'multiple';
      optionIds: string[];
    }>;
    supplementIds: string[];
    checkoutRules?: {
      allowZeroQuantity?: boolean;
      maxQuantity?: number;
    };
    customizationPrice: number;
  }) => {
    const hasCheckoutRules = Boolean(payload.checkoutRules && Object.keys(payload.checkoutRules).length > 0);
    const hasCustomizationMetadata = payload.modifierSelections.length > 0 || payload.supplementIds.length > 0 || hasCheckoutRules;

    if (hasCustomizationMetadata) {
      addCustomizedItem(item, restaurant, payload);
    } else {
      addItem(item, restaurant, payload.quantity);
    }

    setIsDetailsOpen(false);
  };

  return (
    <>
      <div
        className={`p-4 rounded-xl border transition-all duration-200 ${
          quantity > 0 || totalItemQuantity > 0
            ? 'border-primary/50 bg-primary/5'
            : 'border-white/5 glass-card hover:border-white/10'
        }`}
      >
        <div className="flex gap-4">
          <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-white/10">
            <MenuItemImage
              src={item.imageUrl}
              imageStoragePath={item.imageStoragePath}
              alt={item.name}
              sizes="96px"
            />
          </div>

          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start">
                <h4 className="font-semibold text-white">{item.name}</h4>
                <span className="font-bold text-white">{item.price.toFixed(2)} {CURRENCY_CODE}</span>
              </div>
              {item.description && (
                <p className="text-sm text-slate-400 mt-1 line-clamp-2">{item.description}</p>
              )}
            </div>

            <div className="mt-3 flex justify-end items-center gap-3">
              {hasCustomizedSelections ? (
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {totalItemQuantity} au panier
                </span>
              ) : null}

              {!item.isAvailable ? (
                <span className="text-xs font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded">Épuisé</span>
              ) : quantity === 0 || hasCustomizedSelections ? (
                <button
                  onClick={handleOpenDetails}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-3 py-1.5 rounded-full transition-colors"
                  aria-label={`Ajouter ${item.name} au panier`}
                >
                  <MaterialIcon name="add" size="sm" />
                  <span>{hasCustomizedSelections ? 'Personnaliser' : 'Ajouter'}</span>
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
      <CustomerMenuItemDetails
        item={item}
        restaurant={restaurant}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onAddToCart={handleAddToCart}
      />
    </>
  );
};
