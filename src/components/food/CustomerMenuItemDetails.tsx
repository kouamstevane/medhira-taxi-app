'use client';

import React, { useEffect, useState } from 'react';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type {
  CustomerMenuCustomizationPayload,
  CustomerMenuItemDetails as CustomerMenuItemDetailsData,
  MenuItem,
  Restaurant,
} from '@/types/food-delivery';
import { MenuItemImage } from '@/components/food/MenuItemImage';
import { CustomerMenuItemCustomization } from '@/components/food/CustomerMenuItemCustomization';
import { CURRENCY_CODE } from '@/utils/constants';

interface CustomerMenuItemDetailsProps {
  item: MenuItem;
  restaurant: Restaurant;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart?: (payload: CustomerMenuCustomizationPayload) => void;
}

function formatNutritionValue(label: string, value: number): string {
  if (label === 'calories') {
    return `${value} kcal`;
  }

  if (label === 'proteinGrams') {
    return `${value} g protéines`;
  }

  if (label === 'carbsGrams') {
    return `${value} g glucides`;
  }

  if (label === 'fatGrams') {
    return `${value} g lipides`;
  }

  return `${value} g sel`;
}

export function CustomerMenuItemDetails({
  item,
  restaurant,
  isOpen,
  onClose,
  onAddToCart,
}: CustomerMenuItemDetailsProps) {
  const [details, setDetails] = useState<CustomerMenuItemDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;

    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      setDetails(null);

      try {
        const nextDetails = await FoodDeliveryService.getCustomerMenuItemDetails(restaurant.id, item.id);

        if (!active) {
          return;
        }

        if (!nextDetails) {
          setError('Ce plat n’est plus disponible pour le moment.');
          setDetails(null);
          return;
        }

        setDetails(nextDetails);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError('Impossible de charger les détails de ce plat.');
        setDetails(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      active = false;
    };
  }, [isOpen, item.id, restaurant.id]);

  if (!isOpen) {
    return null;
  }

  const nutritionEntries = details?.nutrition
    ? (Object.entries(details.nutrition) as Array<[keyof NonNullable<CustomerMenuItemDetailsData['nutrition']>, number]>)
    : [];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4">
      <button
        type="button"
        aria-label="Fermer les détails"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <section
        aria-label={`Détails de ${item.name}`}
        className="relative z-[81] max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-background p-4 shadow-2xl md:rounded-3xl md:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Menu</p>
            <h2 className="mt-1 text-2xl font-extrabold text-white">{item.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{restaurant.name}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Fermer
          </button>
        </div>

        <div className="relative mb-5 h-56 overflow-hidden rounded-3xl bg-white/5">
          <MenuItemImage
            src={details?.imageUrl ?? item.imageUrl}
            imageStoragePath={item.imageStoragePath}
            alt={item.name}
            sizes="(max-width: 768px) 100vw, 672px"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-slate-100 backdrop-blur">
                {item.category}
              </span>
              <span className="text-lg font-bold text-white">{item.price.toFixed(2)} {CURRENCY_CODE}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-300">
            Chargement des détails…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-4 text-sm text-destructive">
            {error}
          </div>
        ) : details ? (
          <div className="space-y-6">
            {details.description ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-sm font-semibold text-white">Description</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{details.description}</p>
              </section>
            ) : null}

            {details.allergens.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-sm font-semibold text-white">Allergènes</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {details.allergens.map((allergen) => (
                    <span
                      key={allergen.code}
                      className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200"
                    >
                      {allergen.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {nutritionEntries.length > 0 ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="text-sm font-semibold text-white">Valeurs nutritionnelles</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {nutritionEntries.map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs font-medium text-slate-200"
                    >
                      {formatNutritionValue(key, value)}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h3 className="text-lg font-bold text-white">Personnalisation</h3>
              <p className="mt-1 text-sm text-slate-400">
                Choisissez vos options sans quitter le menu. Les suppléments restent séparés des modificateurs.
              </p>

              <div className="mt-4">
                <CustomerMenuItemCustomization
                  key={`${item.id}:${details.itemId}:${details.modifierGroups.length}:${details.supplements.length}:${details.checkoutRules.maxQuantity ?? 'none'}:${details.checkoutRules.allowZeroQuantity ?? 'none'}`}
                  item={item}
                  modifierGroups={details.modifierGroups}
                  supplements={details.supplements}
                  checkoutRules={details.checkoutRules}
                  onAddToCart={onAddToCart}
                />
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
